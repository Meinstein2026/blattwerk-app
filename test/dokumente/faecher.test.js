import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Wichtige Dokumente: eine Ebene „Fächer" unter dem Ordner (KFZ/<Fahrzeug>, Anleitungen/Klettern …).
// Kein Test führt die Handler aus (sie sprechen mit Nextcloud) – gesichert wird die Verdrahtung am Quelltext.
const server = readFileSync(new URL("../../server.mjs", import.meta.url), "utf8");
const app = readFileSync(new URL("../../dolibarr-app.jsx", import.meta.url), "utf8");
const handler = (pfad) => server.slice(server.indexOf(`app.post("${pfad}"`)).split("\napp.post(")[0];

describe("Wichtige Dokumente: Fächer", () => {
  it("Server: jedes Fach läuft durch dokSafe und wird einzeln kodiert", () => {
    expect(server).toMatch(/const dokPfad = \(o, fach\) => "\/" \+ encodeURIComponent\(o\) \+ \(fach \? "\/" \+ encodeURIComponent\(fach\) : ""\);/);
    for (const p of ["/api/nc/dokumente-list", "/api/nc/dokumente-file", "/api/nc/dokumente-upload"]) {
      expect(handler(p)).toContain("fach = dokSafe(fachRoh)");
      expect(handler(p)).toContain("dokPfad(o, fach)");
    }
    expect(handler("/api/nc/dokumente-list")).toContain("if (i > 0 && !fach) faecher.push(name)");
    expect(handler("/api/nc/dokumente-upload")).toContain("...(fach ? [DOK_BASIS() + dokPfad(o, fach)] : [])");
  });
  it("App: alle drei Aufrufe geben das Fach mit, Anleitungen ist ein Ordner", () => {
    expect(app).toContain('{ key: "Anleitungen",  icon: "settings", accent: "petrol" }');
    expect(app).toContain('ncCall("/api/nc/dokumente-list", { ordner: o, fach: f })');
    expect(app).toContain('ncCall("/api/nc/dokumente-file", { ordner, fach, filename: name })');
    expect(app).toContain('ncCall("/api/nc/dokumente-upload", { ordner, fach, filename: file.name, dataBase64: b64 })');
  });
});
