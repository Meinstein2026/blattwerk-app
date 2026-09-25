import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { istMandantAdmin, mandantHandler } from "../../src/mandant-server.mjs";

const antwort = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
let dir, datei;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandant-")); datei = path.join(dir, "mandant.json"); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.MANDANT_ADMINS; });

describe("/api/mandant", () => {
  it("GET liefert die öffentliche Fassung samt sso-Kennzeichen", () => {
    fs.writeFileSync(datei, JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR", dienste: { dolibarr: "https://erp.xy.example.org" } }));
    const h = mandantHandler({ datei, ssoUser: () => "chef" });
    const res = antwort();
    h.get({ headers: {} }, res);
    expect(res.body.name).toBe("Baum Müller GbR");
    expect(res.body.bloecke.erp).toBe(true);
    expect(res.body.sso).toBe(true);
    expect(res.body.fehler).toBe(null);
  });

  it("GET meldet sso:false, wenn der Aufruf nicht vom vertrauten Proxy kam", () => {
    const h = mandantHandler({ datei, ssoUser: () => null });
    const res = antwort();
    h.get({ headers: {} }, res);
    expect(res.body.sso).toBe(false);
  });

  it("PUT nur für Mandanten-Admins", () => {
    process.env.MANDANT_ADMINS = "max";
    const h = mandantHandler({ datei, ssoUser: () => "chef" });
    const res = antwort();
    h.put({ headers: {}, body: { kuerzel: "xy", name: "X" } }, res);
    expect(res.code).toBe(403);
    expect(fs.existsSync(datei)).toBe(false);
  });

  it("PUT schreibt, prüft und wird sofort wirksam", () => {
    process.env.MANDANT_ADMINS = "max";
    const h = mandantHandler({ datei, ssoUser: () => "max" });
    const schlecht = antwort();
    h.put({ headers: {}, body: { kuerzel: "xy", name: "X", bloecke: { quatsch: true } } }, schlecht);
    expect(schlecht.code).toBe(400);

    const gut = antwort();
    h.put({ headers: {}, body: { kuerzel: "xy", name: "Baum Müller GbR", bloecke: { erp: true }, dienste: { dolibarr: "https://erp.xy.example.org" } } }, gut);
    expect(gut.code).toBe(200);
    expect(h.aktuell().mandant.name).toBe("Baum Müller GbR");
    expect(JSON.parse(fs.readFileSync(datei, "utf8")).name).toBe("Baum Müller GbR");
    expect(fs.statSync(datei).mode & 0o777).toBe(0o600);
  });

  it("PUT erzwingt 0600 auch wenn die Datei vorher offener war", () => {
    process.env.MANDANT_ADMINS = "max";
    fs.writeFileSync(datei, JSON.stringify({ kuerzel: "xy", name: "Alt", dienste: { dolibarr: "https://erp.xy.example.org" } }));
    fs.chmodSync(datei, 0o644);
    const h = mandantHandler({ datei, ssoUser: () => "max" });
    const res = antwort();
    h.put({ headers: {}, body: { kuerzel: "xy", name: "Baum Müller GbR", bloecke: { erp: true }, dienste: { dolibarr: "https://erp.xy.example.org" } } }, res);
    expect(res.code).toBe(200);
    expect(fs.statSync(datei).mode & 0o777).toBe(0o600);
  });

  it("PUT schreibt atomar: schlägt das Umbenennen fehl, bleibt der alte Stand unangetastet", () => {
    process.env.MANDANT_ADMINS = "max";
    fs.writeFileSync(datei, JSON.stringify({ kuerzel: "xy", name: "Alt GmbH", dienste: { dolibarr: "https://erp.xy.example.org" } }));
    const h = mandantHandler({ datei, ssoUser: () => "max" });
    // Zielpfad wird durch ein Verzeichnis ersetzt, damit der abschließende
    // rename() scheitert (EISDIR) — simuliert einen Absturz mitten im Schreiben.
    fs.rmSync(datei);
    fs.mkdirSync(datei);
    const res = antwort();
    h.put({ headers: {}, body: { kuerzel: "xy", name: "Neu GmbH", bloecke: { erp: true }, dienste: { dolibarr: "https://erp.xy.example.org" } } }, res);
    expect(res.code).toBe(500);
    expect(h.aktuell().mandant.name).toBe("Alt GmbH");
    expect(fs.statSync(datei).isDirectory()).toBe(true);
    // Keine liegen gebliebene Temp-Datei neben dem (unveraendert gebliebenen)
    // Verzeichnis, das hier die Rolle von mandant.json spielt.
    expect(fs.readdirSync(dir)).toEqual(["mandant.json"]);
  });

  it("istMandantAdmin liest MANDANT_ADMINS", () => {
    process.env.MANDANT_ADMINS = "max, max@example.org";
    expect(istMandantAdmin("max@example.org")).toBe(true);
    expect(istMandantAdmin("chef")).toBe(false);
    expect(istMandantAdmin(null)).toBe(false);
  });
});
