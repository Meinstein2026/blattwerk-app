// Ablage je Mandant: eigener Nextcloud-Ordner statt fest "Blattwerk/".
//
// Blattwerk selbst behaelt seinen Ordner (ncOrdner(bw) === "Blattwerk") —
// bestehende Daten unter Blattwerk/... muessen erreichbar bleiben. Eine
// fremde Firma bekommt IHREN eigenen Ordner (eigene Angabe oder Firmenname),
// nie Blattwerk. ncPfadPruefen schuetzt zusaetzlich gegen ../ und gegen
// Pfade, die eine aeltere App-Fassung noch fest auf "Blattwerk/..." schickt.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ncOrdner, ncPfadPruefen } from "../../src/mandant.js";

const bw = { kuerzel: "bw", name: "Blattwerk GbR" };
const xy = { kuerzel: "xy", name: "Baum Müller GbR", nextcloud: { ordner: "Baum Müller" } };

describe("Ablage je Mandant", () => {
  it("Blattwerk behält seinen Ordner", () => {
    expect(ncOrdner(bw)).toBe("Blattwerk");
  });
  it("eine fremde Firma bekommt ihren eigenen Ordner", () => {
    expect(ncOrdner(xy)).toBe("Baum Müller");
  });
  it("ohne eigenen Ordner wird der Firmenname genommen, nie Blattwerk", () => {
    expect(ncOrdner({ kuerzel: "zz", name: "Grün & Holz GbR" })).toBe("Grün & Holz GbR");
  });
  it("Pfade außerhalb des eigenen Ordners werden abgewiesen", () => {
    expect(ncPfadPruefen(xy, "Baum Müller/Belege/foto.jpg")).toBe(true);
    expect(ncPfadPruefen(xy, "Blattwerk/Belege/foto.jpg")).toBe(false);
    expect(ncPfadPruefen(xy, "../Blattwerk/Belege/foto.jpg")).toBe(false);
  });
  it("in server.mjs steht kein fester Blattwerk-ABLAGEPFAD mehr", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
    // Nur Pfad-Zeichenketten. PRODID, Log-Texte und Fehlermeldungen bleiben
    // absichtlich, siehe Allowlist in den Global Constraints.
    expect(src).not.toMatch(/["'`]\/Blattwerk\//);
    expect(src).not.toMatch(/assertBlattwerk/);
    expect(src).toMatch(/assertOrdner\(/);
  });
  // Fix Round 2 (2026-09-18): ncOrdner() nahm einen Ordnernamen, der nur aus
  // Punkten besteht (".."), unveraendert an — encodeURIComponent laesst
  // Punkte durch, ordnerUrl() haette daraus einen echten WebDAV-Pfadsprung
  // gebaut. Nur per handgeschriebener mandant.json erreichbar (mandantPruefen
  // weist es beim regulaeren PUT /api/mandant schon vorher ab, siehe
  // test/mandant/konfig.test.js), trotzdem hier zusaetzlich abgefangen.
  it("ein reiner Punktname (Pfadsprung) wird nie als Ordner übernommen", () => {
    expect(ncOrdner({ kuerzel: "xy", name: "Baum Müller GbR", nextcloud: { ordner: ".." } })).toBe("Baum Müller GbR");
    expect(ncOrdner({ kuerzel: "xy", name: "Baum Müller GbR", nextcloud: { ordner: "." } })).toBe("Baum Müller GbR");
    expect(ncOrdner({ kuerzel: "xy", name: ".." })).toBe("");
    expect(ncOrdner({ kuerzel: "bw", name: "Blattwerk GbR", nextcloud: { ordner: ".." } })).toBe("Blattwerk");
  });
});
