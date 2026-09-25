import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  bankRegelSchluessel, bankErledigtEintragen, bankVorschlag, bankOffeneFuerKonto,
  bankEntwurfMarke, istBankEntwurf, bankRegelnNorm, bankLieferantFinden, bankZuordnungText, bankSammelAbhaken,
  bankAuszugGueltig, bankEmpfehlung, bankNeu, bankZeilen, bankHatAuszug, bankOhneAuszug, bankAuszugVorschlag, bankSammelAnlegen,
} from "../../src/bank.js";

const E = { id: "0123456789abcdef", konto: 2, datum: "2026-09-01", betrag: -119, text: "MUSTER FORST GMBH RE-4711", name: "Muster Forst GmbH", gegenIban: "DE89 3704 0044 0532 0130 00" };

describe("Modul Bank Teil 5: fehlende Buchungen", () => {
  it("Schluessel: Gegen-IBAN vor Name", () => {
    expect(bankRegelSchluessel(E)).toBe("iban:DE89370400440532013000");
    expect(bankRegelSchluessel({ name: "  Muster-Forst  GmbH " })).toBe("name:muster forst gmbh");
    expect(bankRegelSchluessel({})).toBe("");
  });
  it("abhaken merkt die Regel, ohne Doppelte, und weist Unsinn ab", () => {
    let s = bankErledigtEintragen(null, E.id, { schluessel: bankRegelSchluessel(E), art: "sonstige", konto: "1800 ", label: "Privatentnahme Max" });
    s = bankErledigtEintragen(s, E.id, null);
    expect(s.erledigt).toEqual([E.id]);
    expect(s.regeln["iban:DE89370400440532013000"]).toEqual({ art: "sonstige", konto: "1800", lieferantId: 0, label: "Privatentnahme Max" });
    expect(Object.keys(bankErledigtEintragen(s, "x", { schluessel: "k", art: "quatsch" }).regeln)).toHaveLength(1);
    expect(() => bankErledigtEintragen(s, " ", null)).toThrow();
  });
  it("Vorschlag: gelernt > offene Rechnung > Stichwort > Standard", () => {
    const regeln = { "iban:DE89370400440532013000": { art: "sonstige", konto: "1800", lieferantId: 0, label: "Privatentnahme" } };
    const offen = [{ id: 7, ref: "SI1", rest: 119, art: "lieferant" }, { id: 8, ref: "CI1", rest: 119, art: "kunde" }];
    expect(bankVorschlag(E, regeln, offen)).toMatchObject({ art: "sonstige", konto: "1800", quelle: "gelernt" });
    expect(bankVorschlag(E, {}, offen)).toMatchObject({ art: "zahlung", quelle: "rechnung" });
    expect(bankVorschlag(E, {}, offen).rechnungen.map((r) => r.id)).toEqual([7]);
    expect(bankVorschlag({ ...E, gegenIban: "", name: "Abrechnung 30.09.", betrag: -9.9 }, {}, [])).toMatchObject({ art: "sonstige", konto: "4970", quelle: "stichwort" });
    expect(bankVorschlag({ ...E, gegenIban: "", name: "Unbekannt" }, {}, [])).toMatchObject({ art: "rechnung", quelle: "standard" });
    expect(bankVorschlag({ ...E, gegenIban: "", name: "Unbekannt", betrag: 50 }, {}, [])).toMatchObject({ art: "sonstige", quelle: "standard" });
  });
  it("Liste je Konto ohne Erledigte, neueste zuerst", () => {
    const offen = { eintraege: [E, { ...E, id: "b", datum: "2026-09-05" }, { ...E, id: "c", konto: 3 }, { nix: 1 }] };
    expect(bankOffeneFuerKonto(offen, { erledigt: [E.id] }, "2").map((e) => e.id)).toEqual(["b"]);
    expect(bankOffeneFuerKonto(null, null, 2)).toEqual([]);
    expect(bankRegelnNorm({ erledigt: "kaputt", regeln: [] })).toEqual({ version: 1, regeln: {}, erledigt: [] });
  });
  it("Bank-Entwurf: Marke in note_private", () => {
    expect(bankEntwurfMarke(E.id)).toBe("[bank:0123456789abcdef]");
    expect(istBankEntwurf({ note_private: `${bankEntwurfMarke(E.id)} Bezahlt am …` })).toBe(true);
    expect(istBankEntwurf({ note_private: "normale Notiz" })).toBe(false);
  });
});

describe("Modul Bank Teil 5: Verdrahtung", () => {
  const server = readFileSync("server.mjs", "utf8");
  const app = readFileSync("dolibarr-app.jsx", "utf8");
  it("Routen haengen an Block belege UND Funktion bank; nur die Regel-Datei wird geschrieben", () => {
    expect(server).toMatch(/"\/api\/nc\/bank-offen",\s*wacheBelege,\s*wacheBank,/);
    expect(server).toMatch(/"\/api\/nc\/bank-offen\/erledigt",\s*wacheBelege,\s*wacheBank,/);
    const a = server.indexOf('app.post("/api/nc/bank-offen/erledigt"');
    const route = server.slice(a, server.indexOf("\napp.", a + 10));
    expect(route).toMatch(/pfad: BANK_REGELN_STORE\(\)/);
    expect(route).not.toMatch(/BANK_OFFEN_STORE/);
  });
  it("Beleg-Pflicht nur fuer Bank-Entwuerfe, Warnung fuer alle", () => {
    expect(app).toMatch(/if \(istBankEntwurf\(inv\) && docs\.length === 0\) \{ showToast\("Erst den Beleg anhängen, dann validieren", "error"\); return; \}/);
    expect(app).toMatch(/"Kein Beleg angehängt\."/);
  });
  it("Sonstige Zahlung geht ueber das Modul, Entwurf ueber submitSupplierInvoice", () => {
    const teil = app.slice(app.indexOf("function BankPage("), app.indexOf("function VerwaltungPage("));
    expect(app).toMatch(/call\("POST", "\/blattwerkapp\/bank\/bewegung"/);
    expect(teil).toMatch(/submitSupplierInvoice\(api,/);
    expect(teil).toMatch(/bankEntwurfMarke\(/);
    expect(teil).toMatch(/\/api\/nc\/bank-offen\/erledigt/);
  });
});

describe("Modul Bank Teil 5: vorhandenen Lieferanten am Namen aus dem Auszug erkennen", () => {
  const L = [
    { id: 1, name: "Sozialversicherung für Landwirtschaft, Forsten und Gartenbau", name_alias: "SVLFG" },
    { id: 2, name: "Geräteverleih Muster GmbH & Co. KG" },
    { id: 3, name: "Muster Forst GmbH" }, { id: 4, name: "Muster Forsttechnik AG" },
  ];
  it("findet über Alias, Umlaut-Umschrift und ohne Rechtsform", () => {
    expect(bankLieferantFinden("SVLFG", L)?.id).toBe(1);
    expect(bankLieferantFinden("GERAETEVERLEIH MUSTER", L)?.id).toBe(2);
    expect(bankLieferantFinden("Muster Forst GmbH", L)?.id).toBe(3);
  });
  it("rät nicht: unbekannt oder mehrdeutig = null", () => {
    expect(bankLieferantFinden("Muster", L)).toBe(null);
    expect(bankLieferantFinden("Ganz Anderer", L)).toBe(null);
    expect(bankLieferantFinden("", L)).toBe(null);
  });
  it("Fund des Bots (Qwen) schlaegt Regel und Standard: nichts doppelt anlegen", () => {
    const offen = [{ id: 7, ref: "SI-7", rest: 100, art: "lieferant" }, { id: 8, ref: "SI-8", rest: 119, art: "lieferant" }];
    const regeln = { [bankRegelSchluessel(E)]: { art: "sonstige", konto: "1800", label: "x" } };
    const mit = (zuordnung) => ({ ...E, zuordnung });
    expect(bankVorschlag(mit({ art: "rechnung", typ: "si", id: 7, ref: "SI-7", status: 1 }), regeln, offen)).toMatchObject({ art: "zahlung", quelle: "qwen" });
    expect(bankVorschlag(mit({ art: "rechnung", typ: "si", id: 7, status: 1 }), regeln, offen).rechnungen.map((r) => r.id)).toEqual([7, 8]);
    expect(bankVorschlag(mit({ art: "rechnung", typ: "si", id: 5, status: 0 }), regeln, []).rechnungen).toEqual([]);
    expect(bankVorschlag(mit({ art: "rechnung", typ: "si", id: 5, status: 2 }), regeln, offen).art).toBe("ignorieren");
    expect(bankVorschlag(mit({ art: "bankzeile", id: 194, konto: 3 }), regeln, offen).art).toBe("ignorieren");
    expect(bankVorschlag(mit(null), regeln, offen).quelle).toBe("gelernt");
    expect(bankZuordnungText(E)).toBeNull();
    expect(bankZuordnungText(mit({ art: "bankzeile", id: 194, konto: 3, datum: "2026-08-20" }))).toMatchObject({ sprung: "#bank-194", text: expect.stringContaining("20.08.2026 auf einem anderen Konto") });
    expect(bankZuordnungText(mit({ art: "rechnung", typ: "ci", id: 42, ref: "CI-42", status: 2 })).sprung).toBe("#beleg-ci-42");
    expect(bankZuordnungText(mit({ art: "rechnung", typ: "si", id: 5, ref: "SI-5", status: 0 })).text).toContain("erst dort validieren");
  });
  it("Sammel-Abhaken: nur geladene, offene, betragsgleiche Zeilen dieses Kontos, jede einmal", () => {
    const offen = { eintraege: [], passend: [
      { konto: 2, zeile: 11, datum: "2026-08-20", betrag: -22.05 }, { konto: 2, zeile: 11, datum: "2026-08-20", betrag: -22.05 },
      { konto: 2, zeile: 12, datum: "2026-08-20", betrag: -55.04 }, { konto: 2, zeile: 13, datum: "2026-08-21", betrag: -9 },
      { konto: 3, zeile: 14, datum: "2026-08-20", betrag: -1 }, { konto: 2, zeile: 99, datum: "kaputt", betrag: -1 },
    ] };
    const zeilen = [{ id: 11, amount: "-22.05", rappro: 0 }, { id: 12, amount: "-55.04", rappro: 1 }, { id: 13, amount: "-9.50", rappro: 0 }, { id: 14, amount: "-1", rappro: 0 }];
    expect(bankSammelAbhaken(offen, 2, zeilen).map((x) => [x.zeile.id, x.auszug])).toEqual([[11, "2026/08"]]);
    expect(bankSammelAbhaken(null, 2, zeilen)).toEqual([]);
  });
});

describe("Modul Bank Teil 7: Stati, Empfehlung, Sammel-Anlegen, Abhaken ohne Auszug", () => {
  const ts = (iso) => Math.floor(new Date(`${iso}T12:00:00`).getTime() / 1000);
  const zeilen = [
    { id: 11, dateo: ts("2026-08-20"), amount: "-22.05", rappro: "0" },
    { id: 12, dateo: ts("2026-08-21"), amount: "-55.04", rappro: "0" },
    { id: 13, dateo: ts("2026-08-22"), amount: "-9.00", rappro: "1" },
    { id: 14, dateo: ts("2026-09-05"), amount: "-1.00", rappro: "0" },
  ];
  const offen = {
    passend: [{ konto: 2, zeile: 11, datum: "2026-08-21", betrag: -22.05 }],
    nur_dolibarr: [{ konto: 2, zeile: 12, datum: "2026-08-21", betrag: -55.04, aehnlich: "2026-08-28" }],
    zeitraeume: { 2: [["2026-08-01", "2026-08-31"]] },
  };
  it("vier Stati je Bankzeile, Empfehlung mit Auszugsnummer bzw. Hinweis", () => {
    expect(zeilen.map((z) => bankEmpfehlung(z, offen).status)).toEqual(["gefunden", "pruefen", "abgeglichen", "ohne"]);
    expect(bankEmpfehlung(zeilen[0], offen).auszug).toBe("2026/08");
    expect(bankEmpfehlung(zeilen[1], offen).text).toMatch(/28\.08\.2026/);
    expect(bankEmpfehlung({ ...zeilen[0], amount: "-22.06" }, offen).status).toBe("ohne"); // Betrag seither geändert
    expect(bankEmpfehlung(zeilen[0], null).status).toBe("ohne");
  });
  it("Filter nach Status und „neu“ (erster Besuch: nichts neu)", () => {
    expect(bankZeilen(zeilen, "gefunden", offen).map((z) => z.id)).toEqual([11]);
    expect(bankZeilen(zeilen, "pruefen", offen).map((z) => z.id)).toEqual([12]);
    expect(bankZeilen(zeilen, "ohne", offen).map((z) => z.id)).toEqual([14]);
    expect(bankZeilen(zeilen, "neu", offen, 12).map((z) => z.id)).toEqual([14, 13]);
    expect(bankNeu(zeilen[3], 0)).toBe(false);
  });
  it("Konto ohne Auszug: Summe, Soll-Bestand, Auszugsnummer-Vorschlag", () => {
    expect(bankHatAuszug(offen, 2)).toBe(true);
    expect(bankHatAuszug(offen, 3)).toBe(false);
    const o = bankOhneAuszug(zeilen, "2026-08-31");
    expect(o.zeilen.map((z) => z.id)).toEqual([11, 12]);
    expect([o.summe, o.bestand]).toEqual([-77.09, -86.09]);
    expect(bankAuszugVorschlag({ ref: "Kasse 1" }, "2026-09-20")).toBe("Kasse1-2026-09");
    expect(bankAuszugGueltig(bankAuszugVorschlag({ label: "Privateinlage Lücas" }, "2026-09-20"))).toBe(true);
  });
  it("Sammel-Anlegen nimmt nur, was ohne Rückfrage geht", () => {
    const f = (x) => ({ ...E, gegenIban: "", ...x });
    const regeln = { "name:abo ag": { art: "sonstige", konto: "4360", lieferantId: 0, label: "Versicherung" }, "name:holz kg": { art: "rechnung", konto: "", lieferantId: 7, label: "" } };
    const liste = [
      f({ id: "a1", name: "Abo AG" }),                                        // gelernt: sonstige mit Konto + Text
      f({ id: "a2", name: "Holz KG" }),                                       // gelernt: Entwurf beim bekannten Lieferanten
      f({ id: "a3", name: "VR Bank", text: "Kontoführungsentgelt" }),         // Stichwort Bankgebühr
      f({ id: "a4", name: "Abo AG", unsicher: true }),                        // Lesarten uneins → nie
      f({ id: "a5", name: "Fremd GmbH" }),                                    // Standard-Vorschlag → nie
      f({ id: "a6", name: "X", zuordnung: { art: "bankzeile", id: 5, sicherheit: "hoch" } }),
      f({ id: "a7", name: "X", zuordnung: { art: "bankzeile", id: 6, sicherheit: "mittel" } }),
      f({ id: "a8", name: "X", zuordnung: { art: "rechnung", typ: "si", id: 9, status: 1, sicherheit: "hoch" } }), // Zahlung braucht den Bogen
    ];
    expect(bankSammelAnlegen(liste, regeln, []).map((x) => x.e.id)).toEqual(["a1", "a2", "a3", "a6"]);
    expect(bankSammelAnlegen(null, regeln, [])).toEqual([]);
  });
});
