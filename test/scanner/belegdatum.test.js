// Am 17.08.2026 buchte ein Beleg von Kilb Vetter Entsorgung auf den
// 17.08.**2020**: die OCR verlas die Jahreszahl, und der Parser nahm blind den
// ersten Datumstreffer im gesamten Text. In der Freigabe-Mail stand das falsche
// Datum unauffaellig neben dem richtigen Betrag. belegDatum prueft seitdem.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("export function belegDatum");
const b = src.indexOf("// Template-Parser:", a);
if (a < 0 || b < 0) throw new Error("belegDatum nicht gefunden");
const sandbox = { Date };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b).replace("export function", "function")
  + "\nthis.belegDatum = belegDatum;", sandbox);
const { belegDatum } = sandbox;

const heute = new Date(2026, 7, 17); // 17.08.2026

describe("belegDatum", () => {
  it("liest das Belegdatum", () => {
    expect(belegDatum("Datum: 17.08.2026\nBetrag 22,05", heute)).toBe("2026-08-17");
  });

  it("ueberspringt eine verlesene Jahreszahl statt sie zu buchen", () => {
    // genau der Fall vom 17.08.2026 — 2026 wurde als 2020 erkannt
    expect(belegDatum("Datum: 17.08.2020", heute)).toBe("");
  });

  it("nimmt den ersten plausiblen Treffer, nicht den ersten ueberhaupt", () => {
    // Kartenbeleg oben auf dem Wiegeschein: "gueltig bis" und Kartendaten
    // stehen VOR dem Belegdatum.
    const bon = "Kartenzahlung\ngueltig bis 12/28\nAS-Zeit 01.01.2019\nDatum: 17.08.2026";
    expect(belegDatum(bon, heute)).toBe("2026-08-17");
  });

  it("laesst aeltere Belege bis gut ein Jahr zurueck durch", () => {
    expect(belegDatum("03.09.2025", heute)).toBe("2025-09-03");
  });

  it("verwirft Datumsangaben aus der Zukunft", () => {
    expect(belegDatum("01.12.2026", heute)).toBe("");
  });

  it("verwirft unmoegliche Tage (31.02.)", () => {
    expect(belegDatum("31.02.2026", heute)).toBe("");
  });

  it("gibt leer zurueck, wenn gar kein Datum dasteht", () => {
    expect(belegDatum("SUMME 22,05 EUR", heute)).toBe("");
  });
});
