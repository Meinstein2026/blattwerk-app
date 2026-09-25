// Geldbetraege: deutsche Schreibweise mit Tausenderpunkt (Max, 11.09.2026 —
// „bitte mach da nach tausender punkte rein"). Vorher stand da 10869.00 €,
// was bei vierstelligen Betraegen schwer zu lesen ist.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("const fmtMoney");
const b = src.indexOf("\n};", a);
if (a < 0 || b < 0) throw new Error("fmtMoney nicht gefunden");
const code = src.slice(a, b + 3);
const sandbox = {};
vm.createContext(sandbox);
const fmtMoney = vm.runInContext(`(() => { ${code}; return fmtMoney; })()`, sandbox);

describe("fmtMoney", () => {
  it("setzt den Tausenderpunkt", () => {
    expect(fmtMoney(10869)).toBe("10.869,00 €");
    expect(fmtMoney(1234.5)).toBe("1.234,50 €");
    expect(fmtMoney(3365.56)).toBe("3.365,56 €");
  });

  it("laesst dreistellige Betraege unveraendert", () => {
    expect(fmtMoney(639.5)).toBe("639,50 €");
    expect(fmtMoney(0)).toBe("0,00 €");
  });

  it("kommt mit Millionen zurecht", () => {
    expect(fmtMoney(1234567.89)).toBe("1.234.567,89 €");
  });

  it("behaelt das Minus vorn", () => {
    expect(fmtMoney(-6430.83)).toBe("-6.430,83 €");
    expect(fmtMoney(-12.3)).toBe("-12,30 €");
  });

  it("verkraftet null, undefined und Strings", () => {
    expect(fmtMoney(null)).toBe("0,00 €");
    expect(fmtMoney(undefined)).toBe("0,00 €");
    expect(fmtMoney("2500.5")).toBe("2.500,50 €");
  });
});
