// Dolibarr-Umzug 09.09.2026: dolibarr-alt.example.org -> dolibarr.example.org.
// Die alte Adresse antwortet mit 301 auf die neue; fuer die App ist das kein
// Umzug, sondern ein CORS-Bruch (der Preflight darf keiner Weiterleitung
// folgen) -> "Nicht verbunden" ohne Erklaerung. Deshalb: gespeicherte
// Konfiguration still umschreiben, und testConnection erkennt eine
// Weiterleitung und sagt es.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DOLIBARR_URL_DEFAULT, DOLIBARR_ALTE_HOSTS, migriereDolibarrUrl, migriereDolibarrConfig,
  weiterleitungErkannt, verbindungsFehlerText,
} from "../../src/verbindung.js";

describe("migriereDolibarrUrl", () => {
  it("schreibt den alten Host auf die neue Adresse um, Pfad bleibt", () => {
    expect(migriereDolibarrUrl("https://dolibarr-alt.example.org")).toEqual({ url: "https://dolibarr.example.org", geaendert: true });
    expect(migriereDolibarrUrl("http://dolibarr-alt.example.org/")).toEqual({ url: "https://dolibarr.example.org", geaendert: true });
    expect(migriereDolibarrUrl("https://dolibarr-alt.example.org/api/index.php")).toEqual({ url: "https://dolibarr.example.org/api/index.php", geaendert: true });
  });
  it("laesst andere Adressen in Ruhe", () => {
    expect(migriereDolibarrUrl("https://dolibarr.example.org")).toEqual({ url: "https://dolibarr.example.org", geaendert: false });
    expect(migriereDolibarrUrl("https://d.example/x")).toEqual({ url: "https://d.example/x", geaendert: false });
    expect(migriereDolibarrUrl("")).toEqual({ url: "", geaendert: false });
    expect(migriereDolibarrUrl(null)).toEqual({ url: "", geaendert: false });
  });
  it("Konfiguration: Schluessel bleibt, nur die Adresse wechselt", () => {
    const { config, geaendert } = migriereDolibarrConfig({ url: "https://dolibarr-alt.example.org", key: "abc" });
    expect(geaendert).toBe(true);
    expect(config).toEqual({ url: "https://dolibarr.example.org", key: "abc" });
    expect(migriereDolibarrConfig(null)).toEqual({ config: null, geaendert: false });
    expect(migriereDolibarrConfig({ url: "https://dolibarr.example.org", key: "abc" }).geaendert).toBe(false);
  });
  it("Standardadresse ist die neue, der alte Host steht in der Liste", () => {
    expect(DOLIBARR_URL_DEFAULT).toBe("https://dolibarr.example.org");
    expect(DOLIBARR_ALTE_HOSTS).toContain("dolibarr-alt.example.org");
  });
});

describe("weiterleitungErkannt", () => {
  it("opaqueredirect (manual redirect, cross-origin) oder 3xx", () => {
    expect(weiterleitungErkannt({ type: "opaqueredirect", status: 0 })).toBe(true);
    expect(weiterleitungErkannt({ type: "basic", status: 301 })).toBe(true);
    expect(weiterleitungErkannt({ type: "cors", status: 200 })).toBe(false);
    expect(weiterleitungErkannt({ type: "cors", status: 401 })).toBe(false);
    expect(weiterleitungErkannt(null)).toBe(false);
  });
  it("Fehlertext nennt den Umzug, sonst allgemein", () => {
    expect(verbindungsFehlerText({ weiterleitung: true, message: "x" })).toMatch(/leitet weiter|umgezogen/);
    expect(verbindungsFehlerText(new Error("Failed to fetch"))).toMatch(/Verbindung fehlgeschlagen/);
  });
});

describe("Verdrahtung", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const server = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
  it("nirgends mehr die alte Adresse als Vorgabe", () => {
    for (const s of [app, server]) expect(s).not.toMatch(/"https?:\/\/dolibarr-alt\.example\.org"/);
    expect(app).toMatch(/useState\(DOLIBARR_URL_DEFAULT\)/);
    expect(server).toMatch(/SSO_DOLIBARR_URL \|\| DOLIBARR_URL_DEFAULT/);
  });
  it("App migriert die gespeicherte Konfiguration beim Start und meldet es einmal", () => {
    expect(app).toMatch(/migriereDolibarrConfig\(/);
    expect(app).toMatch(/Serveradresse aktualisiert/);
  });
  it("testConnection prueft die Weiterleitung vor dem eigentlichen Aufruf", () => {
    const a = app.indexOf("testConnection: async");
    expect(a).toBeGreaterThan(-1);
    const t = app.slice(a, a + 900);
    expect(t).toMatch(/redirect: "manual"/);
    expect(t).toMatch(/weiterleitungErkannt\(/);
  });
  it("SSO-Allowlist kennt den neuen Host, gespeicherte SSO-Zugaenge werden migriert", () => {
    expect(server).toMatch(/SSO_ALLOWED_DOLIBARR_HOSTS \|\| "dolibarr\.example\.org/);
    const a = server.indexOf("const ssoLookup =");
    expect(server.slice(a, a + 700)).toMatch(/migriereDolibarrUrl\(/);
  });
});
