import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bankErwarteterBetrag, bankKandidaten, bankAuszugGueltig } from "../../src/bank.js";

describe("Modul Bank Teil 4: Zuordnen", () => {
  it("Kundenzahlung kommt herein, Lieferantenzahlung geht hinaus", () => {
    expect(bankErwarteterBetrag({ art: "kunde", betrag: "119.00" })).toBe(119);
    expect(bankErwarteterBetrag({ art: "lieferant", betrag: 45.9 })).toBe(-45.9);
  });
  it("Kandidaten: gleicher Betrag in Cent, naechstes Datum zuerst", () => {
    const roh = [{ id: "1", amount: "-45.90", dateo: 1000 }, { id: "2", amount: "-45.9", dateo: 5000 },
      { id: "3", amount: "45.90", dateo: 5000 }, { id: "4", amount: "-45.91", dateo: 5000 }];
    expect(bankKandidaten({ art: "lieferant", betrag: 45.9, datum: 4800 }, roh).map((z) => z.id)).toEqual(["2", "1"]);
    expect(bankKandidaten({ art: "kunde", betrag: 45.9, datum: 0 }, roh).map((z) => z.id)).toEqual(["3"]);
    expect(bankKandidaten({ art: "kunde", betrag: 1 }, null)).toEqual([]);
  });
  it("Auszugsnummer: dasselbe Muster wie der Endpunkt", () => {
    for (const ok of ["2026/09", "9", "A-1_b.2"]) expect(bankAuszugGueltig(ok)).toBe(true);
    for (const nein of ["", " ", "a b", "x".repeat(31), "9;drop"]) expect(bankAuszugGueltig(nein)).toBe(false);
  });
  it("Verdrahtung: Schreiben nur mit canRecordPayments, Endpunkte des Moduls blattwerkapp", () => {
    const s = readFileSync("dolibarr-app.jsx", "utf8");
    const teil = s.slice(s.indexOf("function BankPage("), s.indexOf("function VerwaltungPage("));
    expect(teil).toMatch(/const darfSchreiben = !!me\?\.canRecordPayments;/);
    expect(s).toMatch(/call\("POST", "\/blattwerkapp\/bank\/zuordnen"/);
    expect(s).toMatch(/call\("POST", "\/blattwerkapp\/bank\/abgleich"/);
    expect(s).toMatch(/<BankPage api=\{api\} me=\{me\}/);
  });
});
