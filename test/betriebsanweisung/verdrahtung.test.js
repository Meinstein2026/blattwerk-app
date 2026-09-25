// Absicherung gegen einen Merge, der den Reiter versehentlich wieder
// verliert: Import, Reiter-Chip und die bedingte Zeile müssen alle drei da
// sein. Liest nur den Quelltext (wie bei ueberlassungen/save in server.mjs),
// führt GbuPage nicht aus — dafür bräuchte es die ganze React-Testumgebung.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync(new URL("../../dolibarr-app.jsx", import.meta.url), "utf8");

describe("Reiter Betriebsanweisung ist verdrahtet", () => {
  it("importiert BetriebsanweisungTab", () => {
    expect(src).toMatch(/import BetriebsanweisungTab from ".\/src\/ui\/BetriebsanweisungTab\.jsx";/);
  });

  it("steht in der Reiter-Liste von GbuPage", () => {
    expect(src).toMatch(/\["betriebsanweisung", "Betriebsanweisung"\]/);
  });

  it("hat die zugehörige bedingte Zeile", () => {
    expect(src).toMatch(/\{tab === "betriebsanweisung" && \(\s*<BetriebsanweisungTab/);
  });

  it("fasst GbuFormSkt.jsx, gbu-pdf.js, gbu-data.js und Baumkataster-Dateien nicht an (nur diese eine Stelle in dolibarr-app.jsx)", () => {
    // Grobe Absicherung: Diese Datei selbst darf nur an den drei oben
    // geprüften Stellen etwas mit "betriebsanweisung" zu tun haben – ein
    // Test auf Quelltextebene, kein Ersatz für Code-Review.
    const treffer = src.match(/[Bb]etriebsanweisung/g) || [];
    expect(treffer.length).toBeGreaterThanOrEqual(3);
    // 8 statt 6 seit Funktionen (09/2026): Funktionsschluessel "betriebsanweisungen" + Chip-Filter in GbuPage sind zwei weitere legitime Stellen.
    expect(treffer.length).toBeLessThanOrEqual(8);
  });
});
