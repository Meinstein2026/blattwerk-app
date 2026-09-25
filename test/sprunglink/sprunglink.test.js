import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { istSprunglink, belegSprung, bankSprung } from "../../src/sprunglink.js";

describe("Sprunglinks aus dem Buchhaltungsbot-Bericht", () => {
  it("erkennt Lieferanten- und Kundenrechnung", () => {
    expect(belegSprung("#beleg-si-42")).toEqual({ type: "supplierinvoice", id: "42" });
    expect(belegSprung("#beleg-ci-7")).toEqual({ type: "invoice", id: "7" });
  });
  it("Kaputtes ist ein Sprunglink ohne Ziel -> Freigaben-Liste", () => {
    for (const h of ["#bank-", "#bank-5x", "#beleg-si-", "#beleg-xx-1", "#beleg-si-1;alert(1)"]) {
      expect(istSprunglink(h)).toBe(true);
      expect(belegSprung(h)).toBe(null);
      expect(bankSprung(h)).toBe(null);
    }
  });
  it("Bankzeile -> Modul Bank", () => {
    expect(bankSprung("#bank-5")).toBe("5");
    expect(belegSprung("#bank-5")).toBe(null);
  });
  it("andere Hashes bleiben unberuehrt", () => {
    for (const h of ["", "#freigaben", "#chat", undefined]) expect(istSprunglink(h)).toBe(false);
  });
  // Die Android-Huelle reicht bei laufender App nur solche Fragmente durch (MainActivity.SAFE_FRAGMENT).
  it("passt durch den Fragment-Filter der Android-Huelle", () => {
    const java = readFileSync("android-build/app/src/main/java/de/blattwerk/mobile/MainActivity.java", "utf8");
    const muster = /SAFE_FRAGMENT =\s*java\.util\.regex\.Pattern\.compile\("([^"]+)"\)/.exec(java)[1];
    for (const h of ["beleg-si-123456", "beleg-ci-1", "bank-99"]) expect(h).toMatch(new RegExp(`^${muster}$`));
  });
  it("ist in App verdrahtet: Ziel nur durch erlaubterTab/funktion, sonst #freigaben", () => {
    const s = readFileSync("dolibarr-app.jsx", "utf8");
    expect(s).toMatch(/erlaubterTab\("geschaeft", block, funktion\) === "geschaeft"\s*&& funktion\(s\.type === "invoice" \? "rechnungen" : "lieferantenrechnungen"\)/);
    expect(s).toMatch(/\.catch\(\(\) => \{ window\.location\.hash = "#freigaben"; \}\)/);
  });
  it("Bankzeile nur mit Recht, Block und Funktion bank — sonst #freigaben", () => {
    const s = readFileSync("dolibarr-app.jsx", "utf8");
    expect(s).toMatch(/if \(!\(me\.canViewBank && block\("erp"\) && funktion\("bank"\)\)\) \{ window\.location\.hash = "#freigaben"; return; \}/);
    expect(s).toMatch(/<BankPage .*zeileId=\{bankZeile\?\.id \|\| null\}/);
  });
});
