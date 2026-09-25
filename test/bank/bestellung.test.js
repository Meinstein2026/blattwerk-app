import { describe, it, expect } from "vitest";
import { BANK_ARTEN, bankBestellung, bankEntwurfMarke, bankVorschlag } from "../../src/bank.js";

const e = { id: "a1b2c3d4e5f6", datum: "2026-09-14", betrag: -150, text: "Kartenzahlung Baumarkt", auszug: "2026/09", name: "Baumarkt GmbH" };

describe("Modul Bank: Bestellung aus einer Buchung ohne Bestellung", () => {
  it("bietet die Art „bestellung“ an", () => {
    expect(BANK_ARTEN.map((a) => a.key)).toContain("bestellung");
  });

  it("baut die Bestellung mit Betrag, Text, Datum, Kategorie und Bank-Marke", () => {
    const b = bankBestellung(e, { socid: 7, kategorie: "maschinen", kontoName: "Volksbank" });
    expect(b.socid).toBe(7);
    expect(b.date).toBe(Math.floor(Date.UTC(2026, 8, 14, 12) / 1000));
    expect(b.lines).toEqual([{ desc: "Kartenzahlung Baumarkt", qty: 1, subprice: 150, tva_tx: 0, remise_percent: 0 }]);
    expect(b.note_private).toContain(bankEntwurfMarke(e.id));
    expect(b.note_private).toContain("Volksbank");
    expect(b.array_options.options_bw_kategorie).toBe("maschinen");
  });

  it("nimmt einen eigenen Positionstext, sonst den Auszugstext, sonst einen Platzhalter", () => {
    expect(bankBestellung(e, { socid: 1, text: "Motorsäge" }).lines[0].desc).toBe("Motorsäge");
    expect(bankBestellung({ ...e, text: "" }, { socid: 1 }).lines[0].desc).toBe("Einkauf laut Kontoauszug");
  });

  it("eine gelernte Bestellung-Regel wird wieder vorgeschlagen", () => {
    const v = bankVorschlag(e, { "name:baumarkt gmbh": { art: "bestellung", konto: "", lieferantId: 7, label: "" } }, []);
    expect(v.art).toBe("bestellung");
    expect(v.lieferantId).toBe(7);
  });
});
