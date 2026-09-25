// Ablage von Fahrtenbuch und Anlagen-Konfiguration in Nextcloud
// (Blattwerk/App/fahrtenbuch.json, Blattwerk/App/anlagen.json) — gleiches
// Muster wie tutorial.json: additiv, If-Match, Blattwerk-Ordner vorab pruefen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { anlagenEintragen } from "../../server.mjs";

const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
const endpunkt = (pfad) => {
  const a = src.indexOf(`app.post("${pfad}"`);
  if (a < 0) throw new Error("Endpunkt fehlt: " + pfad);
  const b = src.indexOf("\napp.", a + 10);
  return src.slice(a, b < 0 ? src.length : b)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
};

describe("anlagenEintragen", () => {
  it("legt die Konfiguration je Geraete-Schluessel ab, additiv", () => {
    const s1 = anlagenEintragen({ version: 1, geraete: {} }, "lr-11-1", { anlagegut: true, afaJahre: 9 });
    const s2 = anlagenEintragen(s1, "manuell-0", { anlagegut: false });
    expect(s2.geraete["lr-11-1"]).toEqual({ anlagegut: true, afaJahre: 9 });
    expect(s2.geraete["manuell-0"]).toEqual({ anlagegut: false });
  });
  it("uebernimmt nur bekannte Felder und verwirft Unsinn", () => {
    const s = anlagenEintragen({}, "lr-1-1", { anlagegut: "ja", afaJahre: -3, name: "  Rasentraktor ", gekauft: "2026-08-11", extra: 1 });
    expect(s.geraete["lr-1-1"]).toEqual({ name: "Rasentraktor", gekauft: "2026-08-11" });
  });
  it("leere Konfiguration entfernt den Eintrag", () => {
    const s1 = anlagenEintragen({}, "lr-1-1", { afaJahre: 5 });
    const s2 = anlagenEintragen(s1, "lr-1-1", {});
    expect(s2.geraete["lr-1-1"]).toBeUndefined();
  });
});

describe("Endpunkte", () => {
  for (const [lesen, schreiben] of [["/api/nc/anlagen", "/api/nc/anlagen/save"], ["/api/nc/fahrtenbuch", "/api/nc/fahrtenbuch/save"]]) {
    describe(lesen, () => {
      const save = endpunkt(schreiben);
      it("lesen und schreiben gibt es beide", () => {
        expect(() => endpunkt(lesen)).not.toThrow();
        expect(save.length).toBeGreaterThan(0);
      });
      it("schreiben laeuft ueber die gemeinsame Lesen-Aendern-Schreiben-Funktion", () => {
        expect(save).toMatch(/appStoreAendern\(/);
      });
    });
  }
  // Die Schutzlogik steht einmal in appStoreAendern, nicht je Endpunkt — also
  // dort pruefen (wie test/tutorial/ablage.test.js es fuer tutStoreSchreiben macht).
  const aendern = src.slice(src.indexOf("async function appStoreAendern"), src.indexOf('app.post("/api/nc/anlagen"'));
  it("prueft den Firmenordner VOR der Ordnerkette", () => {
    const pruefung = aendern.indexOf("assertOrdner");
    const mkcol = aendern.indexOf("MKCOL");
    expect(pruefung).toBeGreaterThan(-1);
    expect(mkcol).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(mkcol);
  });
  it("wiederholt bei 412 einmal mit frisch gelesenem Stand", () => {
    expect(aendern).toMatch(/412/);
    expect(aendern).toMatch(/versuch < 2/);
  });
  it("die gemeinsame Schreibfunktion setzt If-Match bzw. If-None-Match", () => {
    const schreiben = src.slice(src.indexOf("async function appStoreSchreiben"), src.indexOf('app.post("/api/nc/anlagen"'));
    expect(schreiben).toMatch(/If-Match/);
    expect(schreiben).toMatch(/If-None-Match/);
  });
  it("Fahrtenbuch-Schreiben verlangt eine Fahrt oder ein Fahrzeug und den Login", () => {
    const save = endpunkt("/api/nc/fahrtenbuch/save");
    expect(save.indexOf("if (!login) return res.status(400)")).toBeGreaterThan(-1);
    expect(save.indexOf("fahrtEintragen")).toBeGreaterThan(-1);
    expect(save.indexOf("fahrzeugEintragen")).toBeGreaterThan(-1);
  });
});
