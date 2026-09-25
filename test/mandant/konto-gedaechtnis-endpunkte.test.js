// Sicherheits-Nachtrag zu Task 8: GET /api/konto/gedaechtnis war zunächst
// ungeschützt, obwohl das Gedächtnis Geschäftsdaten sind (wer beliefert
// diese Firma, wie bucht sie) — Authentik am Proxy ist nicht der einzige
// Weg zum Port (dafür gibt es ssoUser()). Läuft mit einer echten
// Express-Instanz (kein Fake-app), weil der Wächter über app.use() auf dem
// GANZEN Präfix sitzt, nicht nur je Route — das lässt sich mit den
// Fake-app-Stubs anderer Fachmodul-Tests (nur .get/.post) nicht abbilden.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "../../src/server/konto-gedaechtnis.mjs";

let dir, datei, server, basis, ssoErgebnis;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "konto-endpunkte-"));
  datei = path.join(dir, "konten-gedaechtnis.json");
  process.env.KONTO_DATEI = datei;
  ssoErgebnis = null;
  const app = express();
  app.use(express.json());
  register(app, { ssoUser: () => ssoErgebnis });
  await new Promise((resolve) => {
    server = app.listen(0, () => { basis = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.KONTO_DATEI;
});

describe("GET/POST /api/konto/gedaechtnis — Zugriff", () => {
  it("GET ohne erkannten Authentik-Nutzer wird abgewiesen (403), nicht nur POST", async () => {
    const r = await fetch(`${basis}/api/konto/gedaechtnis`);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "kein Authentik-Nutzer erkennbar" });
  });

  it("POST ohne erkannten Authentik-Nutzer wird weiterhin abgewiesen (403)", async () => {
    const r = await fetch(`${basis}/api/konto/gedaechtnis`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ konto: "4985" }),
    });
    expect(r.status).toBe(403);
  });

  it("GET mit erkanntem Nutzer liefert das (leere) Gedächtnis", async () => {
    ssoErgebnis = "max";
    const r = await fetch(`${basis}/api/konto/gedaechtnis`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ lieferant: {}, artikel: {} });
  });

  it("POST mit erkanntem Nutzer schreibt, ein anschließendes GET (weiter mit Nutzer) sieht den Wert", async () => {
    ssoErgebnis = "max";
    let r = await fetch(`${basis}/api/konto/gedaechtnis`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ artikel: "EK-SAEGEKETTE", konto: "4985" }),
    });
    expect(r.status).toBe(200);
    r = await fetch(`${basis}/api/konto/gedaechtnis`);
    expect((await r.json()).artikel["EK-SAEGEKETTE"]).toBe("4985");
  });

  it("wird der Nutzer zwischenzeitlich unerkennbar (z. B. Proxy-Ausfall), sperrt auch das GET wieder", async () => {
    ssoErgebnis = "max";
    await fetch(`${basis}/api/konto/gedaechtnis`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ konto: "4985", artikel: "X" }),
    });
    ssoErgebnis = null;
    const r = await fetch(`${basis}/api/konto/gedaechtnis`);
    expect(r.status).toBe(403);
  });
});
