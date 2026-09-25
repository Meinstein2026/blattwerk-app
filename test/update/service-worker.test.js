// Warum eine neue Fassung frueher zwei Kaltstarts brauchte: sw.js ruft
// skipWaiting() + clientsClaim(), die neue Fassung uebernimmt also sofort — aber
// die laufende Seite behaelt ihr altes Bundle, weil niemand auf
// `controllerchange` reagiert hat. Von aussen sah das aus wie ein kaputter
// Cache, und die naheliegende "Loesung" war, App-Daten zu loeschen. (10.08.2026)
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sollSofortNeuladen } from "../../src/registerSW.js";

const JUNG = 5_000;    // gerade gestartet
const ALT = 600_000;   // laeuft seit zehn Minuten

describe("sollSofortNeuladen", () => {
  it("laedt beim Start neu, wenn eine neue Fassung uebernimmt", () => {
    expect(sollSofortNeuladen({ hatteController: true, alterMs: JUNG, zaehler: 0 })).toBe(true);
  });

  it("laedt bei der Erstinstallation NICHT neu", () => {
    // Ohne vorherigen Worker gibt es kein altes Bundle — ein Neuladen waere ein
    // sinnloser Sprung direkt nach dem ersten Start.
    expect(sollSofortNeuladen({ hatteController: false, alterMs: JUNG, zaehler: 0 })).toBe(false);
  });

  it("laedt eine lange laufende App NICHT ungefragt neu", () => {
    // Mitten in einer Gefaehrdungsbeurteilung waere das der Verlust des halb
    // ausgefuellten Formulars samt Unterschriften. Stattdessen kommt der
    // Hinweis zum Antippen.
    expect(sollSofortNeuladen({ hatteController: true, alterMs: ALT, zaehler: 0 })).toBe(false);
  });

  it("hoert nach drei automatischen Neuladungen auf", () => {
    expect(sollSofortNeuladen({ hatteController: true, alterMs: JUNG, zaehler: 2 })).toBe(true);
    expect(sollSofortNeuladen({ hatteController: true, alterMs: JUNG, zaehler: 3 })).toBe(false);
    expect(sollSofortNeuladen({ hatteController: true, alterMs: JUNG, zaehler: 9 })).toBe(false);
  });
});

describe("Die Verdrahtung darf nicht wieder verschwinden", () => {
  const sw = fs.readFileSync(path.join(process.cwd(), "src/registerSW.js"), "utf8");
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");

  it("hoert ueberhaupt auf controllerchange", () => {
    expect(sw).toContain('addEventListener("controllerchange"');
  });

  it("fragt beim Start aktiv nach einer neuen Fassung", () => {
    // Die Registrierung allein prueft in der Android-WebView nicht zuverlaessig.
    expect(sw).toMatch(/reg\.update\(\)/);
  });

  it("meldet der Oberflaeche, wenn nicht automatisch neu geladen wurde", () => {
    expect(sw).toContain("blattwerk:neue-fassung");
    expect(app).toContain("blattwerk:neue-fassung");
  });

  it("bietet den Hinweis zum Antippen an", () => {
    expect(app).toContain("update-banner");
    expect(app).toMatch(/Neue Fassung verf[üu]gbar/);
  });
});
