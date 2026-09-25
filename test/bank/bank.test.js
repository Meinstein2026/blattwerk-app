import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bankText, bankAbgeglichen, bankZeilen, BANK_FILTER } from "../../src/bank.js";
import { FUNKTIONEN, funktionAktiv } from "../../src/funktionen.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";

describe("Modul Bank: reine Funktionen", () => {
  it("uebersetzt Dolibarrs Klammer-Labels, laesst Freitext stehen", () => {
    expect(bankText("(SupplierInvoicePayment)")).toBe("Zahlung Lieferantenrechnung");
    expect(bankText("(Unbekannt)")).toBe("Unbekannt");
    expect(bankText("Miete Halle")).toBe("Miete Halle");
    expect(bankText("")).toBe("—");
  });
  it("sortiert neueste zuerst und filtert nicht abgeglichene", () => {
    const roh = [{ id: "1", dateo: 100, rappro: 1 }, { id: "2", dateo: 300, rappro: "0" }, { id: "3", dateo: 300, rappro: 0 }];
    expect(bankZeilen(roh).map((z) => z.id)).toEqual(["3", "2", "1"]);
    expect(bankZeilen(roh, "offen").map((z) => z.id)).toEqual(["3", "2"]);
    expect(bankZeilen(null)).toEqual([]);
    expect(bankAbgeglichen({ rappro: "1" })).toBe(true);
    expect(BANK_FILTER.map((f) => f.key)).toEqual(["alle", "offen", "gefunden", "pruefen", "ohne", "neu"]);
  });
});

describe("Modul Bank: eigene Funktion, einzeln einschaltbar", () => {
  it("steht in der Tabelle: Block erp, Dolibarr-Modul banque, fremd standardmaessig aus", () => {
    const f = FUNKTIONEN.find((x) => x.key === "bank");
    expect(f).toMatchObject({ block: "erp", dolibarr: ["banque"], standardFremd: false, braucht: [] });
  });
  it("Blattwerk an, per Schalter aus, fremder Betrieb aus", () => {
    expect(funktionAktiv(MANDANT_STANDARD, "bank")).toBe(true);
    expect(funktionAktiv({ ...MANDANT_STANDARD, funktionen: { ...MANDANT_STANDARD.funktionen, bank: false } }, "bank")).toBe(false);
    expect(funktionAktiv({ ...MANDANT_STANDARD, kuerzel: "xy", funktionen: {} }, "bank")).toBe(false);
  });
});

describe("Modul Bank: Verdrahtung in dolibarr-app.jsx", () => {
  const s = readFileSync("dolibarr-app.jsx", "utf8");
  it("Kachel nur mit Recht, Block und Funktion", () => {
    expect(s).toMatch(/me\?\.canViewBank && block\("erp"\) && funktion\("bank"\) \? \[\s*\{ label: "Bank", key: "bank"/);
  });
  it("Recht ohne Geschaeftsfuehrer", () => {
    const zeile = /viewBank: \[([^\]]*)\]/.exec(s)[1];
    expect(zeile).toContain('"buchhaltung"');
    expect(zeile).not.toMatch(/gesch/i);
  });
  it("schreibt nur ueber die zwei blattwerkapp-Endpunkte, nie ueber den Dolibarr-Kern", () => {
    const von = s.indexOf("function BankPage(");
    const teil = s.slice(von, s.indexOf("function VerwaltungPage("));
    expect(von).toBeGreaterThan(0);
    expect(teil).toMatch(/api\.getBankLines\(/);
    const schreibend = [...teil.matchAll(/api\.([A-Za-z]+)\(/g)].map((m) => m[1]).filter((n) => !/^get/.test(n));
    expect([...new Set(schreibend)].sort()).toEqual(["bankAbgleich", "bankBewegung", "bankZuordnen"]);
  });
});
