// Storno von Kundenrechnungen (09.09.2026). Dolibarr 23 hat keinen
// cancel-Endpunkt; je nach Status greift ein anderer Weg:
//   Entwurf (0)            -> DELETE /invoices/{id}
//   validiert, offen (1)   -> Stornorechnung (Gutschrift, type 2) ODER
//                             „verlassen" (settopaid mit close_code)
//   bezahlt (2)            -> nur Gutschrift (Guthaben bleibt beim Kunden)
//   verlassen (3) / Gutschrift selbst -> nichts mehr
// Die Ablauflogik ist eine reine Funktion ueber ein api-Objekt, damit sie
// hier mit einem Mock durchgespielt werden kann — ohne Dolibarr anzufassen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
const code = schnitt("// ─── Storno Kundenrechnungen", "// ─── Ende Storno Kundenrechnungen");
const sandbox = {};
vm.createContext(sandbox);
const { STORNO_GRUENDE, stornoWege, gutschriftBody, stornoAusfuehren, stornoFehlerText, rechnungStatusBadge, hatGutschriftIn } = vm.runInContext(
  `(() => { ${code}; return { STORNO_GRUENDE, stornoWege, gutschriftBody, stornoAusfuehren, stornoFehlerText, rechnungStatusBadge, hatGutschriftIn }; })()`,
  sandbox
);

const rechnung = (x = {}) => ({
  id: "77", ref: "FA2609-0012", socid: "5", statut: "1", type: "0", total_ttc: "1190", totalpaid: "0", remaintopay: 1190,
  fk_project: "3", cond_reglement_id: "1", mode_reglement_id: "2",
  lines: [
    { id: "201", desc: "Heckenschnitt", qty: "3", subprice: "100.00000000", tva_tx: "19.000", remise_percent: "0", fk_product: "25", product_type: "1" },
    { id: "202", desc: "Entsorgung", qty: "1", subprice: "700.00000000", tva_tx: "19.000", remise_percent: "10", product_type: "1" },
  ],
  ...x,
});

// Mock-API, die jeden Aufruf protokolliert; einzelne Aufrufe koennen scheitern.
const mockApi = (fehler = {}, antworten = {}) => {
  const calls = [];
  const fn = (name, antwort) => async (...args) => {
    calls.push([name, ...args]);
    if (fehler[name]) throw new Error(fehler[name]);
    return typeof antwort === "function" ? antwort(...args) : antwort;
  };
  return {
    calls,
    deleteInvoice: fn("deleteInvoice", 1),
    setInvoiceAbandoned: fn("setInvoiceAbandoned", 1),
    createInvoice: fn("createInvoice", antworten.createInvoice ?? 900),
    validateInvoice: fn("validateInvoice", 1),
    markInvoiceCreditAvailable: fn("markInvoiceCreditAvailable", 1),
    getInvoiceDiscount: fn("getInvoiceDiscount", antworten.getInvoiceDiscount ?? { id: "55", amount_ttc: "1190" }),
    useCreditNote: fn("useCreditNote", 1),
    setInvoicePaid: fn("setInvoicePaid", 1),
  };
};

describe("stornoWege", () => {
  it("Entwurf: nur loeschen", () => expect(stornoWege(rechnung({ statut: "0" }))).toEqual(["loeschen"]));
  it("validiert und offen: Gutschrift oder verlassen", () => expect(stornoWege(rechnung({ statut: "1" }))).toEqual(["gutschrift", "verlassen"]));
  it("teilbezahlt zaehlt wie offen", () => expect(stornoWege(rechnung({ statut: "1", totalpaid: "100", remaintopay: 1090 }))).toEqual(["gutschrift", "verlassen"]));
  it("bezahlt: nur Gutschrift", () => expect(stornoWege(rechnung({ statut: "2" }))).toEqual(["gutschrift"]));
  it("verlassen oder Gutschrift selbst: nichts", () => {
    expect(stornoWege(rechnung({ statut: "3" }))).toEqual([]);
    expect(stornoWege(rechnung({ statut: "1", type: "2" }))).toEqual([]);
  });
  it("Gruende: Dolibarr-close_codes, Standard replaced", () => {
    expect(STORNO_GRUENDE[0].code).toBe("replaced");
    expect(STORNO_GRUENDE.map((g) => g.code)).toEqual(expect.arrayContaining(["replaced", "abandon", "badcustomer", "other"]));
  });
});

describe("gutschriftBody", () => {
  const b = gutschriftBody(rechnung(), { heute: "2026-09-09", grund: "replaced", notiz: "Falscher Kunde" });
  it("ist eine Gutschrift (type 2) mit Verweis auf die Originalrechnung", () => {
    expect(b).toMatchObject({ type: 2, fk_facture_source: 77, socid: 5, fk_project: 3, cond_reglement_id: 1, mode_reglement_id: 2 });
    expect(b.date).toBe(Math.floor(Date.UTC(2026, 8, 9, 12) / 1000));
  });
  it("uebernimmt die Positionen mit negativem Stueckpreis (Dolibarr-Konvention fuer Avoir)", () => {
    expect(b.lines).toHaveLength(2);
    expect(b.lines[0]).toMatchObject({ desc: "Heckenschnitt", qty: 3, subprice: -100, tva_tx: 19, remise_percent: 0, product_type: 1, fk_product: 25 });
    expect(b.lines[1]).toMatchObject({ desc: "Entsorgung", qty: 1, subprice: -700, remise_percent: 10 });
    expect(b.lines[1].fk_product).toBeUndefined();
  });
  it("schreibt Storno-Vermerk mit Grund und Originalreferenz", () => {
    expect(b.note_private).toMatch(/FA2609-0012/);
    expect(b.note_private).toMatch(/Falscher Kunde/);
    expect(b.note_public).toMatch(/Stornorechnung zu FA2609-0012/);
  });
  it("ohne Positionen: eine Sammelzeile ueber den Bruttobetrag", () => {
    const o = gutschriftBody(rechnung({ lines: [], total_ht: "1000", total_ttc: "1190", total_tva: "190" }), { heute: "2026-09-09", grund: "other", notiz: "" });
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0]).toMatchObject({ qty: 1, subprice: -1000, tva_tx: 19 });
  });
});

describe("stornoAusfuehren", () => {
  const opt = { heute: "2026-09-09", grund: "replaced", notiz: "Ersetzt durch FA2609-0013" };
  it("Entwurf: loescht", async () => {
    const api = mockApi();
    const e = await stornoAusfuehren(api, rechnung({ statut: "0" }), { wahl: "loeschen", ...opt });
    expect(e).toEqual({ art: "geloescht" });
    expect(api.calls).toEqual([["deleteInvoice", "77"]]);
  });
  it("verlassen: settopaid mit close_code und close_note", async () => {
    const api = mockApi();
    const e = await stornoAusfuehren(api, rechnung(), { wahl: "verlassen", ...opt });
    expect(e).toEqual({ art: "verlassen" });
    expect(api.calls).toEqual([["setInvoiceAbandoned", "77", { close_code: "replaced", close_note: "Ersetzt durch FA2609-0013" }]]);
  });
  it("Gutschrift auf offene Rechnung: anlegen, validieren, Guthaben, verrechnen, bezahlt", async () => {
    const api = mockApi();
    const e = await stornoAusfuehren(api, rechnung(), { wahl: "gutschrift", ...opt });
    expect(e).toMatchObject({ art: "gutschrift", gutschriftId: 900, fertig: true });
    expect(api.calls.map((c) => c[0])).toEqual(["createInvoice", "validateInvoice", "markInvoiceCreditAvailable", "getInvoiceDiscount", "useCreditNote", "setInvoicePaid"]);
    expect(api.calls[0][1].type).toBe(2);
    expect(api.calls[4]).toEqual(["useCreditNote", "77", "55"]);
    expect(api.calls[5]).toEqual(["setInvoicePaid", "77"]);
  });
  it("Gutschrift auf bezahlte Rechnung: kein Verrechnen, Guthaben bleibt beim Kunden", async () => {
    const api = mockApi();
    const e = await stornoAusfuehren(api, rechnung({ statut: "2", totalpaid: "1190", remaintopay: 0 }), { wahl: "gutschrift", ...opt });
    expect(e).toMatchObject({ art: "gutschrift", gutschriftId: 900, fertig: true, guthaben: true });
    expect(api.calls.map((c) => c[0])).toEqual(["createInvoice", "validateInvoice", "markInvoiceCreditAvailable"]);
  });
  it("createInvoice kann ein Objekt liefern — die Id wird daraus gelesen", async () => {
    const api = mockApi({}, { createInvoice: { id: 901 } });
    const e = await stornoAusfuehren(api, rechnung(), { wahl: "gutschrift", ...opt });
    expect(e.gutschriftId).toBe(901);
  });
  it("bricht nach dem Anlegen sauber ab: Gutschrift bleibt als Entwurf, Fehler wird genannt", async () => {
    const api = mockApi({ validateInvoice: 'API Error 403: {"error":{"message":"Insufficient rights"}}' });
    const e = await stornoAusfuehren(api, rechnung(), { wahl: "gutschrift", ...opt });
    expect(e).toMatchObject({ art: "gutschrift", gutschriftId: 900, fertig: false });
    expect(e.fehler).toMatch(/Entwurf/);
    expect(e.fehler).toMatch(/Berechtigung/);
    expect(api.calls.map((c) => c[0])).toEqual(["createInvoice", "validateInvoice"]);
  });
  it("scheitert das Verrechnen, ist die Gutschrift trotzdem da und der Rest benannt", async () => {
    const api = mockApi({ useCreditNote: "API Error 500: " });
    const e = await stornoAusfuehren(api, rechnung(), { wahl: "gutschrift", ...opt });
    expect(e).toMatchObject({ art: "gutschrift", gutschriftId: 900, fertig: false });
    expect(e.fehler).toMatch(/verrechn/i);
  });
  it("unbekannte Wahl wird abgewiesen, ohne etwas zu tun", async () => {
    const api = mockApi();
    await expect(stornoAusfuehren(api, rechnung(), { wahl: "x", ...opt })).rejects.toThrow();
    expect(api.calls).toEqual([]);
  });
});

describe("stornoFehlerText", () => {
  it("403 -> Berechtigung, mit Dolibarr-Text", () => {
    expect(stornoFehlerText(new Error('API Error 403: {"error":{"code":403,"message":"Not erasable"}}'))).toMatch(/Berechtigung.*Not erasable/);
  });
  it("404 -> nicht gefunden, sonst Dolibarr-Text oder Status", () => {
    expect(stornoFehlerText(new Error("API Error 404: "))).toMatch(/nicht gefunden/);
    expect(stornoFehlerText(new Error('API Error 400: {"error":{"message":"Invoice not draft"}}'))).toBe("Invoice not draft");
    expect(stornoFehlerText(new Error("API Error 500: "))).toMatch(/500/);
    expect(stornoFehlerText(new Error("Failed to fetch"))).toMatch(/Failed to fetch/);
  });
});

describe("rechnungStatusBadge", () => {
  const map = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Bezahlt","badge-paid"], 3:["Verlassen","badge-cancelled"] };
  it("Gutschrift, verlassen mit Grund, storniert per Gutschrift, sonst Standard", () => {
    expect(rechnungStatusBadge(rechnung({ type: "2" }), false, map)[0]).toBe("Gutschrift");
    expect(rechnungStatusBadge(rechnung({ statut: "3", close_code: "replaced" }), false, map)[0]).toMatch(/^Verlassen · Ersetzt/);
    expect(rechnungStatusBadge(rechnung({ statut: "3" }), false, map)[0]).toBe("Verlassen");
    expect(rechnungStatusBadge(rechnung({ statut: "2" }), true, map)[0]).toBe("Storniert (Gutschrift)");
    expect(rechnungStatusBadge(rechnung({ statut: "1" }), false, map)).toEqual(["Offen", "badge-open"]);
  });
  it("erkennt in der Liste die Gutschrift zur Rechnung", () => {
    const alle = [rechnung(), rechnung({ id: "78", type: "2", fk_facture_source: "77" })];
    expect(hatGutschriftIn(rechnung(), alle)).toBe(true);
    expect(hatGutschriftIn(rechnung({ id: "79" }), alle)).toBe(false);
  });
});

describe("Verdrahtung in der Rechnungsansicht", () => {
  const detail = src.slice(src.indexOf("function InvoiceDetail("), src.indexOf("\nfunction ", src.indexOf("function InvoiceDetail(") + 10));
  it("Stornieren-Knopf oeffnet den Bestaetigungsdialog, Entwurf-Loeschen laeuft ebenfalls darueber", () => {
    expect(detail).toMatch(/<StornoDialog/);
    expect(detail).toMatch(/stornoWege\(inv\)/);
    expect(detail).not.toMatch(/window\.confirm\("Diese Rechnung wirklich löschen\?"\)/);
  });
  it("der Dialog zeigt Nummer, Betrag und Kunde, hat Grundauswahl und roten Storno-Knopf", () => {
    const dialog = src.slice(src.indexOf("function StornoDialog("), src.indexOf("\nfunction ", src.indexOf("function StornoDialog(") + 10));
    expect(dialog).toMatch(/inv\.ref/);
    expect(dialog).toMatch(/fmtMoney\(inv\.total_ttc\)/);
    expect(dialog).toMatch(/STORNO_GRUENDE\.map/);
    expect(dialog).toMatch(/btn-danger[^>]*>[^<]*Stornieren/);
    expect(dialog).toMatch(/Abbrechen/);
  });
  it("API-Client kapselt die Dolibarr-Aufrufe", () => {
    for (const r of ["settopaid", "markAsCreditAvailable", "usecreditnote/", "/discount"]) expect(src).toMatch(new RegExp(r.replace("/", "\\/")));
    expect(src).toMatch(/setInvoiceAbandoned:/);
    expect(src).toMatch(/markInvoiceCreditAvailable:/);
    expect(src).toMatch(/getInvoiceDiscount:/);
    expect(src).toMatch(/useCreditNote:/);
    expect(src).toMatch(/getGutschriftenZu:/);
  });
});
