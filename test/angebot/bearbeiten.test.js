// Angebot bearbeiten und kopieren. Der Kern ist keine Maske, sondern die
// Umrechnung zwischen Dolibarrs Zeilen und dem Formular — und die hat genau
// eine Stelle, an der man sich nicht irren darf: den Namen des Stueckpreises.
// (10.08.2026)
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
// stripHtml steht weit vorn in der Datei, wird aber von descNachText benutzt.
const quelle = schnitt("const stripHtml =", "\n")
  + schnitt("const descNachText =", "// ─── Proposal Edit");
const sandbox = {};
vm.createContext(sandbox);
const { descNachText, textNachDesc, angebotZeileAusDoli, angebotZeileBody, angebotZeileLeer, angebotZeilenPlan, angebotKopie } = vm.runInContext(
  quelle + "\n({ descNachText, textNachDesc, angebotZeileAusDoli, angebotZeileBody, angebotZeileLeer, angebotZeilenPlan, angebotKopie })", sandbox);

// So sieht eine Zeile aus, wie Dolibarr sie in GET /proposals/{id} liefert.
const doliZeile = (extra = {}) => ({
  id: "31", desc: "<p>Hecke schneiden</p>", qty: "4", subprice: "45.00000000",
  tva_tx: "19.000", remise_percent: "0", fk_product: "12", product_type: "0",
  ...extra,
});

describe("Die Endpunkte der Zeilen-API", () => {
  // Beim Angebot heisst der Einzel-Endpunkt `{id}/line` (Einzahl). `{id}/lines`
  // ist der Massen-Endpunkt und erwartet eine Liste — schickt man ihm ein
  // einzelnes Objekt, laeuft er ueber dessen Felder statt ueber Zeilen und legt
  // pro Feld eine leere Zeile an, und zwar mit Status 200. Am 10.08.2026 an
  // einem Wegwerf-Angebot beobachtet (aus 1 neuer Zeile wurden 5 leere) und am
  // Quelltext bestaetigt. Bei der Lieferantenrechnung ist `lines` richtig —
  // die beiden Module sind hier nicht gleich gebaut.
  const zeilen = schnitt("addProposalLine:", "deleteProposalLine:");

  it("legt eine einzelne Zeile ueber {id}/line an, nicht ueber {id}/lines", () => {
    expect(zeilen).toMatch(/addProposalLine:.*\/proposals\/\$\{id\}\/line`/);
    expect(zeilen).not.toMatch(/addProposalLine:.*\/proposals\/\$\{id\}\/lines`/);
  });

  it("aendert und loescht dagegen ueber {id}/lines/{lineid}", () => {
    expect(schnitt("updateProposalLine:", "\n")).toContain("/lines/${lineid}");
    expect(schnitt("deleteProposalLine:", "\n")).toContain("/lines/${lineid}");
  });
});

describe("Die Verdrahtung in der Oberflaeche", () => {
  it("nutzt die getrennten Felder bei Rechnung und Angebot", () => {
    // DocLine bedient auch Lieferantenrechnung und Bestellung — dort bleibt es
    // beim einen Feld. Der Schalter muss also genau zweimal gesetzt sein.
    expect(src.match(/canDelete=\{lines\.length ?> ?1\} zusatztext/g) || []).toHaveLength(2);
  });

  it("schreibt den Artikelnamen bei Rechnung und Angebot nicht mehr nach desc", () => {
    // Genau das erzeugte die Dopplung in der Datenbank. Lieferantenrechnung und
    // Bestellung duerfen es weiter tun: dort gibt es nur ein Feld, und der Text
    // geht nicht zum Kunden.
    const docForm = schnitt("function DocForm({", "// One invoice/proposal line");
    const editModal = schnitt("function ProposalEditModal({", "// ─── Proposal Detail");
    expect(docForm).not.toMatch(/desc:\s*prod\.label/);
    expect(editModal).not.toMatch(/desc:\s*prod\.label/);
    expect(docForm).toMatch(/artikelName:\s*prod\.label/);
    expect(editModal).toMatch(/artikelName:\s*prod\.label/);
  });

  it("bietet die Notiz bei Angebot und Rechnung an", () => {
    expect(src).toContain("api.updateProposal(id, data)");
    expect(src).toContain("api.updateInvoice(id, data)");
    expect(src.match(/<NotizEditor/g) || []).toHaveLength(2);
  });
});

describe("Zusatztext hin und zurueck", () => {
  // An einer echten Zeile beobachtet: "LKW-Arbeitsbühne 30m AH 3,5t
  // H-Stützen<br>\nKo…". stripHtml allein macht daraus eine durchgehende Zeile
  // und wirft die Umbrueche beim naechsten Speichern weg.
  it("macht aus <br> einen Zeilenumbruch", () => {
    expect(descNachText("Zeile eins<br>Zeile zwei")).toBe("Zeile eins\nZeile zwei");
    expect(descNachText("Zeile eins<br />\nZeile zwei")).toBe("Zeile eins\nZeile zwei");
  });

  it("wirft uebrige Auszeichnung weg", () => {
    expect(descNachText("<p>Hecke schneiden</p>")).toBe("Hecke schneiden");
    expect(descNachText("Preis &amp; Leistung")).toBe("Preis & Leistung");
  });

  it("schreibt Umbrueche als <br> zurueck", () => {
    expect(textNachDesc("Zeile eins\nZeile zwei")).toBe("Zeile eins<br>Zeile zwei");
    expect(textNachDesc("Windows\r\nZeile")).toBe("Windows<br>Zeile");
  });

  it("ueberlebt den Weg hin und zurueck", () => {
    const text = "Umfang: 3 Bäume\nZufahrt über die Wiese";
    expect(descNachText(textNachDesc(text))).toBe(text);
    // Dolibarr normalisiert auf "<br>\n" — auch das muss zurueckfinden.
    expect(descNachText("Umfang: 3 Bäume<br>\nZufahrt über die Wiese")).toBe(text);
  });

  it("macht aus leer keinen undefined-Text", () => {
    expect(descNachText(null)).toBe("");
    expect(textNachDesc(undefined)).toBe("");
  });
});

describe("angebotZeileLeer", () => {
  it("laesst eine Zeile mit nur einem Artikel durch", () => {
    expect(angebotZeileLeer({ fk_product: "454", desc: "" })).toBe(false);
  });

  it("laesst eine Zeile mit nur einem Text durch", () => {
    expect(angebotZeileLeer({ fk_product: "", desc: "Sonderleistung" })).toBe(false);
  });

  it("meldet nur die wirklich leere Zeile", () => {
    expect(angebotZeileLeer({ fk_product: "", desc: "   " })).toBe(true);
    expect(angebotZeileLeer({})).toBe(true);
  });
});

describe("angebotZeileAusDoli", () => {
  it("holt Beschreibung, Menge und Nettopreis aus der Dolibarr-Zeile", () => {
    const l = angebotZeileAusDoli(doliZeile());
    expect(l).toMatchObject({ lineid: "31", desc: "Hecke schneiden", qty: 4, price: 45, tva: 19 });
  });

  it("nimmt die Zeilen-Id auch als rowid entgegen", () => {
    expect(angebotZeileAusDoli({ rowid: 7, qty: 1 }).lineid).toBe(7);
  });

  it("nimmt auch das Feld description als Text", () => {
    expect(angebotZeileAusDoli({ description: "Anfahrt" }).desc).toBe("Anfahrt");
  });

  it("holt den Artikelnamen aus product_label — nicht aus desc", () => {
    // Das war der Fehler vom 10.08.2026: bei artikelverknuepften Zeilen ist
    // desc in Dolibarr leer, der sichtbare Name steht in product_label. Die
    // Maske verlangte trotzdem eine Beschreibung → nichts liess sich speichern.
    const l = angebotZeileAusDoli({ id: "9", desc: "", product_label: "Häcksler", fk_product: "454", qty: "1", subprice: "100" });
    expect(l.artikelName).toBe("Häcksler");
    expect(l.desc).toBe("");
    expect(angebotZeileLeer(l)).toBe(false); // Artikel allein genuegt
  });

  it("zeigt den Artikelnamen nicht doppelt, wenn er auch in desc steht", () => {
    // Aus der App angelegte Zeilen trugen den Namen frueher zusaetzlich in desc.
    // Im PDF blieb das folgenlos (Dolibarr blendet `$desc == $label` aus), im
    // Formular saehe es aber wie ein echter Zusatztext aus.
    const l = angebotZeileAusDoli({ desc: "Häcksler", product_label: "Häcksler", fk_product: "454" });
    expect(l.desc).toBe("");
    expect(l.artikelName).toBe("Häcksler");
  });

  it("behaelt einen echten Zusatztext neben dem Artikel", () => {
    const l = angebotZeileAusDoli({ desc: "aufgrund von Abseilmaterial", product_label: "Baumpflege Extra", fk_product: "22" });
    expect(l.desc).toBe("aufgrund von Abseilmaterial");
    expect(l.artikelName).toBe("Baumpflege Extra");
  });

  it("liefert Zahlen, nicht Strings — sonst rechnet die Summe im Formular falsch", () => {
    const l = angebotZeileAusDoli(doliZeile({ remise_percent: "10" }));
    expect(typeof l.qty).toBe("number");
    expect(typeof l.price).toBe("number");
    expect(l.remise_percent).toBe(10);
  });

  it("macht aus einer neuen, leeren Zeile keine NaN", () => {
    // 0 % und nicht 19 %: Blattwerk ist Kleinunternehmer nach § 19 UStG,
    // siehe test/ust/kleinunternehmer.test.js.
    const l = angebotZeileAusDoli({});
    expect(l).toMatchObject({ lineid: null, desc: "", qty: 1, price: 0, tva: 0, remise_percent: 0 });
  });
});

describe("angebotZeileBody — der Feldname, der weh tut", () => {
  // Verifiziert am Quelltext der laufenden Instanz (Dolibarr 23.0.2,
  // comm/propal/class/api_proposals.class.php): postLine reicht
  // $request_data->subprice an addline() durch, putLine an updateline(), und
  // Propal::create() liest beim Anlegen mit Zeilen ebenfalls $line->subprice.
  // Die Lieferantenrechnung will an derselben Stelle pu_ht — wer das
  // verwechselt, bekommt eine 200er-Antwort mit Preis 0.
  const body = angebotZeileBody({ desc: " Hecke ", qty: 4, price: 45, tva: 19, remise_percent: 5, fk_product: "12" });

  it("schickt den Nettopreis als subprice", () => {
    expect(body.subprice).toBe(45);
  });

  it("schickt gerade NICHT pu_ht", () => {
    expect(body).not.toHaveProperty("pu_ht");
  });

  it("sagt Dolibarr ausdruecklich, dass der Preis netto ist", () => {
    expect(body.price_base_type).toBe("HT");
  });

  it("raeumt die Beschreibung auf und uebernimmt Menge, MwSt und Rabatt", () => {
    expect(body).toMatchObject({ desc: "Hecke", qty: 4, tva_tx: 19, remise_percent: 5 });
  });

  it("verknuepft den Artikel als Zahl, laesst das Feld sonst ganz weg", () => {
    expect(body.fk_product).toBe(12);
    expect(angebotZeileBody({ desc: "frei", qty: 1, price: 1 })).not.toHaveProperty("fk_product");
  });
});

describe("angebotZeilenPlan", () => {
  const alt = [
    angebotZeileAusDoli(doliZeile({ id: "1", desc: "Hecke" })),
    angebotZeileAusDoli(doliZeile({ id: "2", desc: "Anfahrt", qty: "1", subprice: "35" })),
  ];

  it("fasst nichts an, wenn nichts geaendert wurde", () => {
    const plan = angebotZeilenPlan(alt, alt.map((l) => ({ ...l })));
    expect(plan).toEqual({ loeschen: [], aendern: [], anlegen: [] });
  });

  it("aendert nur die eine Zeile, die sich geaendert hat", () => {
    const neu = alt.map((l) => l.lineid === "2" ? { ...l, price: 40 } : { ...l });
    const plan = angebotZeilenPlan(alt, neu);
    expect(plan.aendern).toHaveLength(1);
    expect(plan.aendern[0].lineid).toBe("2");
    expect(plan.aendern[0].body.subprice).toBe(40);
    expect(plan.loeschen).toEqual([]);
    expect(plan.anlegen).toEqual([]);
  });

  it("erkennt jede einzelne Aenderung — auch nur den Rabatt", () => {
    for (const [feld, wert] of [["desc", "Hecke hinten"], ["qty", 5], ["price", 46], ["tva", 7], ["remise_percent", 10]]) {
      const neu = alt.map((l) => l.lineid === "1" ? { ...l, [feld]: wert } : { ...l });
      expect(angebotZeilenPlan(alt, neu).aendern, feld).toHaveLength(1);
    }
  });

  it("loescht, was aus der Liste geflogen ist", () => {
    const plan = angebotZeilenPlan(alt, [{ ...alt[0] }]);
    expect(plan.loeschen).toEqual(["2"]);
    expect(plan.aendern).toEqual([]);
  });

  it("legt Zeilen ohne lineid neu an", () => {
    const plan = angebotZeilenPlan(alt, [...alt.map((l) => ({ ...l })), { lineid: null, desc: "Entsorgung", qty: 1, price: 80, tva: 19 }]);
    expect(plan.anlegen).toHaveLength(1);
    expect(plan.anlegen[0]).toMatchObject({ desc: "Entsorgung", subprice: 80 });
  });

  it("schreibt eine Zeile NICHT neu, nur weil die Artikelverknuepfung wegfaellt", () => {
    // Das Beschreibungsfeld loest die Verknuepfung bei jedem Tastendruck —
    // wer daraufhin loescht und neu anlegt, schiebt die Zeile ans Ende des
    // Angebots, und genau diese Reihenfolge sieht der Kunde spaeter im PDF.
    const neu = alt.map((l) => l.lineid === "1" ? { ...l, fk_product: "" } : { ...l });
    const plan = angebotZeilenPlan(alt, neu);
    expect(plan.loeschen).toEqual([]);
    expect(plan.anlegen).toEqual([]);
    expect(plan.aendern).toEqual([]);
  });

  it("kommt mit leeren Listen klar", () => {
    expect(angebotZeilenPlan([], [])).toEqual({ loeschen: [], aendern: [], anlegen: [] });
    expect(angebotZeilenPlan(alt, []).loeschen).toEqual(["1", "2"]);
  });
});

describe("angebotKopie", () => {
  const voll = {
    id: 91, ref: "PR2608-0004", statut: 2, socid: "58", fk_project: "14",
    note_public: "Gueltig 30 Tage", note_private: "intern",
    date: 1754000000, date_signature: 1754500000,
    lines: [doliZeile(), doliZeile({ id: "32", desc: "Anfahrt", fk_product: null })],
  };
  const HEUTE = 1754820000;
  const kopie = angebotKopie(voll, HEUTE);

  it("uebernimmt Kunde, Projekt und die oeffentliche Notiz", () => {
    expect(kopie).toMatchObject({ socid: 58, fk_project: 14, note_public: "Gueltig 30 Tage" });
  });

  it("datiert die Kopie auf heute, nicht auf das Original", () => {
    expect(kopie.date).toBe(HEUTE);
  });

  it("uebernimmt alle Positionen in der richtigen Reihenfolge", () => {
    expect(kopie.lines).toHaveLength(2);
    expect(kopie.lines[0]).toMatchObject({ desc: "Hecke schneiden", qty: 4, subprice: 45, tva_tx: 19, fk_product: 12 });
    expect(kopie.lines[1].desc).toBe("Anfahrt");
    expect(kopie.lines[1]).not.toHaveProperty("fk_product");
  });

  it("vermerkt die Herkunft in der internen Notiz", () => {
    expect(kopie.note_private).toBe("Kopie von Angebot PR2608-0004");
  });

  it("nimmt nichts vom Vorgang des Originals mit", () => {
    // Status, Referenz und Unterschriftsdatum gehoeren zum alten Angebot. Die
    // Kopie ist ein neues Angebot, kein Duplikat eines abgeschlossenen Vorgangs.
    for (const feld of ["id", "ref", "statut", "status", "date_signature", "date_cloture"]) {
      expect(kopie, feld).not.toHaveProperty(feld);
    }
  });

  it("laesst fk_project weg, wenn das Original an keinem Projekt haengt", () => {
    expect(angebotKopie({ ...voll, fk_project: "" }, HEUTE)).not.toHaveProperty("fk_project");
  });

  it("kommt mit einem Angebot ohne Positionen klar", () => {
    expect(angebotKopie({ socid: 58, ref: "PR1" }, HEUTE).lines).toEqual([]);
  });
});
