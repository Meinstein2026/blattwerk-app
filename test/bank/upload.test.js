import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync("server.mjs", "utf8");
const app = readFileSync("dolibarr-app.jsx", "utf8");
const route = (() => {
  const a = server.indexOf('app.post("/api/nc/kontoauszug"');
  return a < 0 ? "" : server.slice(a, server.indexOf("\napp.", a + 10));
})();

describe("Modul Bank: Kontoauszug-Upload", () => {
  it("Route haengt an Block belege UND Funktion bank", () => {
    expect(server).toMatch(/const wacheBank = funktionWache\("bank", mandantJetzt\);/);
    expect(server).toMatch(/"\/api\/nc\/kontoauszug",\s*wacheBelege,\s*wacheBank,/);
  });
  it("schreibt nach Kontoauszuege, nie nach Belege (dort greift die Beleg-OCR)", () => {
    expect(route).toMatch(/\/Kontoauszuege/);
    expect(route.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).not.toMatch(/\/Belege/);
  });
  it("nimmt nur PDF bis 20 MB und prueft den Firmenordner vor dem Anlegen", () => {
    expect(route).toMatch(/"%PDF-"/);
    expect(route).toMatch(/status\(415\)/);
    expect(route).toMatch(/status\(413\)/);
    expect(route.indexOf("assertOrdner(")).toBeGreaterThan(0);
    expect(route.indexOf("assertOrdner(")).toBeLessThan(route.indexOf("MKCOL"));
  });
  it("BankPage laedt ueber diese Route hoch, nicht ueber putfile", () => {
    const teil = app.slice(app.indexOf("function BankPage("), app.indexOf("function VerwaltungPage("));
    expect(teil).toMatch(/apiFetch\("\/api\/nc\/kontoauszug"/);
    expect(teil).not.toMatch(/putfile/);
    expect(teil).toMatch(/accept="application\/pdf"/);
  });
});
