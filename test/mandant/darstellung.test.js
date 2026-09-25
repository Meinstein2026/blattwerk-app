// test/mandant/darstellung.test.js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { htmlMitMandant, manifestFuer } from "../../src/mandant-server.mjs";

const mandant = { kuerzel: "xy", name: "Baum Müller GbR", ort: "Butzbach", logo: "/logo.png",
  farbe: { akzent: "#2f6f3e", dunkel: "#1c4526" }, betrieb: { uvTraeger: "SVLFG", grundGbu: "GBU-M-001" } };

describe("Darstellung je Mandant", () => {
  it("setzt Titel, Themenfarbe und Firmennamen in index.html", () => {
    const html = htmlMitMandant('<html><head><title>Blattwerk</title><meta name="theme-color" content="#43a047"></head><body></body></html>', mandant);
    // Nur die drei ersetzten Stellen werden geprueft, nicht die ganze Datei.
    expect(html).toMatch(/<title>Baum Müller GbR<\/title>/);
    expect(html).toMatch(/content="#2f6f3e"/);
    expect(html).not.toMatch(/Blattwerk/);
  });

  it("baut das Manifest aus der Konfiguration", () => {
    const m = manifestFuer(mandant);
    expect(m.name).toBe("Baum Müller GbR");
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.theme_color).toBe("#2f6f3e");
    expect(m.start_url).toBe("/");
  });

  it("das GBU-PDF nimmt die Betriebsdaten entgegen, statt sie fest zu kennen", () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/gbu-pdf.js"), "utf8");
    expect(quelle).toMatch(/betrieb/);
    expect(quelle).not.toMatch(/Blattwerk GbR/);
    expect(quelle).not.toMatch(/Musterstadt/);
  });

  // Umfang dieses Tasks ist genau diese eine Datei — der Rest des Quelltextes
  // traegt weiter Blattwerk-Namen (UIDs, localStorage-Schluessel, PRODID), die
  // laut „Global Constraints" bewusst stehen bleiben.
});
