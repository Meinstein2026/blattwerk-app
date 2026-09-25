// Abgelaufene Authentik-Sitzung: der Server antwortet nicht mit 401, sondern
// mit einer Umleitung auf eine fremde Domain. Ein normales fetch() scheitert
// dort mit "Failed to fetch" — daraus liest niemand ab, dass nur die Anmeldung
// fehlt. Gefunden am 07.08.2026 in der App auf dem Fairphone.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("export const SSO_ABGELAUFEN");
const b = src.indexOf("// ─── Nextcloud-Kalender", a);
if (a < 0 || b < 0) throw new Error("SSO-Abschnitt in dolibarr-app.jsx nicht gefunden");
const sandbox = { window: undefined };
vm.createContext(sandbox);
const { istSsoUmleitung, ssoAnmeldeUrl } = vm.runInContext(
  src.slice(a, b).replace(/^export /gm, "")
  + "\n({ istSsoUmleitung, ssoAnmeldeUrl })", sandbox);

describe("istSsoUmleitung", () => {
  it("erkennt die undurchsichtige Umleitung (redirect: manual)", () => {
    expect(istSsoUmleitung({ type: "opaqueredirect", status: 0 })).toBe(true);
  });

  it("erkennt eine gefolgte Umleitung", () => {
    expect(istSsoUmleitung({ type: "basic", status: 200, redirected: true })).toBe(true);
  });

  it("laesst normale Antworten durch — auch Fehler vom eigenen Server", () => {
    expect(istSsoUmleitung({ type: "basic", status: 200, redirected: false })).toBe(false);
    expect(istSsoUmleitung({ type: "basic", status: 403, redirected: false })).toBe(false);
    expect(istSsoUmleitung({ type: "basic", status: 502, redirected: false })).toBe(false);
  });

  it("kommt ohne Antwort klar", () => {
    expect(istSsoUmleitung(null)).toBe(false);
    expect(istSsoUmleitung(undefined)).toBe(false);
  });
});

describe("ssoAnmeldeUrl", () => {
  it("fuehrt nach der Anmeldung an dieselbe Stelle zurueck", () => {
    expect(ssoAnmeldeUrl("/kalender")).toBe("/outpost.goauthentik.io/start?rd=%2Fkalender");
  });

  it("faellt auf die Startseite zurueck", () => {
    expect(ssoAnmeldeUrl("")).toBe("/outpost.goauthentik.io/start?rd=%2F");
    expect(ssoAnmeldeUrl(undefined)).toBe("/outpost.goauthentik.io/start?rd=%2F");
  });
});

describe("Service Worker", () => {
  it("faengt den Authentik-Outpost NICHT ab", () => {
    // Ohne diesen Eintrag beantwortet der Service Worker die Anmelde-Navigation
    // aus dem Cache mit index.html — die Anmeldeseite erscheint nie und die
    // Sitzung laesst sich aus der App heraus gar nicht erneuern.
    const cfg = fs.readFileSync(path.join(process.cwd(), "vite.config.js"), "utf8");
    expect(cfg).toMatch(/navigateFallbackDenylist:.*outpost\\\.goauthentik\\\.io/s);
  });

  it("aktiviert eine neue Fassung sofort, statt auf das Schliessen aller Tabs zu warten", () => {
    // Ohne skipWaiting/clientsClaim (= registerType "autoUpdate") bliebe eine
    // ausgesperrte App bei der alten Fassung, obwohl die Korrektur schon
    // heruntergeladen ist.
    const cfg = fs.readFileSync(path.join(process.cwd(), "vite.config.js"), "utf8");
    expect(cfg).toMatch(/registerType:\s*"autoUpdate"/);
  });

  it("holt /sw.js am HTTP-Cache vorbei", () => {
    // Der Server liefert /sw.js mit max-age aus. Nur so ist sicher, dass die
    // korrigierte Fassung das Geraet erreicht und nicht die kaputte aus dem
    // Cache erneut geladen wird.
    const reg = fs.readFileSync(path.join(process.cwd(), "src/registerSW.js"), "utf8");
    expect(reg).toMatch(/updateViaCache:\s*"none"/);
  });

  it("sucht beim Zurueckkehren in die App nach einer neuen Fassung", () => {
    // Eine ausgesperrte App wird nie neu geladen — der Anstoss muss von hier
    // kommen, sonst bleibt sie auf der kaputten Fassung stehen.
    const reg = fs.readFileSync(path.join(process.cwd(), "src/registerSW.js"), "utf8");
    expect(reg).toMatch(/visibilitychange/);
    expect(reg).toMatch(/\.update\(\)/);
  });
});
