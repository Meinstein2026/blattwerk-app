import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { rechteMischen, MANDANT_STANDARD } from "../../src/mandant.js";
import { mandantHandler } from "../../src/mandant-server.mjs";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");

describe("Rechte", () => {
  const standard = { validateInvoices: ["admins"], viewFinanzen: ["admins"] };

  it("Server schlägt Gerät bei Blattwerk", () => {
    const blattwerk = { kuerzel: MANDANT_STANDARD.kuerzel, rechte: { validateInvoices: ["geschäftsführer"] } };
    const r = rechteMischen(standard, blattwerk, { validateInvoices: ["alle"] });
    expect(r.validateInvoices).toEqual(["geschäftsführer"]);
    expect(r.viewFinanzen).toEqual(["admins"]);
  });

  it("ohne Server-Eintrag wird bei Blattwerk eine alte Geräte-Einstellung einmalig übernommen", () => {
    const blattwerk = { kuerzel: MANDANT_STANDARD.kuerzel, rechte: {} };
    const r = rechteMischen(standard, blattwerk, { viewFinanzen: ["meister"] });
    expect(r.viewFinanzen).toEqual(["meister"]);
  });

  it("noch kein Mandant geladen (mandant null): Geräte-Einstellung gilt wie bei Blattwerk", () => {
    const r = rechteMischen(standard, null, { viewFinanzen: ["meister"] });
    expect(r.viewFinanzen).toEqual(["meister"]);
  });

  it("ein fremder Mandant ignoriert die Geräte-Einstellung vollständig — auch für Schlüssel, die seine eigene Konfiguration gar nicht nennt", () => {
    const fremd = { kuerzel: "xy", rechte: { validateInvoices: ["chef"] } };
    // ausGeraet enthaelt fuer BEIDE Schluessel einen Wert (Rest eines
    // Blattwerk-Geraets, das jetzt einen fremden Mandanten bedient) — keiner
    // davon darf durchschlagen, auch nicht viewFinanzen, das der fremde
    // Mandant selbst gar nicht konfiguriert hat.
    const ausGeraet = { validateInvoices: ["alle"], viewFinanzen: ["meister"] };
    const r = rechteMischen(standard, fremd, ausGeraet);
    expect(r.validateInvoices).toEqual(["chef"]); // aus der Mandanten-Konfiguration
    expect(r.viewFinanzen).toEqual(["admins"]);   // Standard, NICHT das Geraet
  });

  it("AdminPanel speichert über den Server", () => {
    const a = src.indexOf("function AdminPanel(");
    const s = src.slice(a, src.indexOf("\nfunction ", a + 10));
    expect(s).toMatch(/\/api\/mandant/);
    expect(s).toMatch(/method:\s*"PUT"/);
  });
});

describe("me: Rechte reagieren auf einen spät eintreffenden Mandanten", () => {
  // GET /api/mandant und /users/info laufen unabhaengig voneinander (zwei
  // eigene Effekte/Promises) — trifft die Mandanten-Antwort NACH der
  // Benutzerantwort ein, darf die Sitzung nicht auf DEFAULT_PERMISSION_GROUPS
  // haengenbleiben. Ohne Render-Infrastruktur (kein @testing-library/react
  // im Projekt) wird die Verdrahtung wie bei den anderen "Quelltext bindet
  // X an Y"-Tests im Projekt (z. B. test/kalender/bearbeiten.test.js) direkt
  // am Quelltext geprueft: der Login-Effekt darf die Rechte nicht mehr selbst
  // berechnen, und `me` muss ein useMemo sein, das ueber `mandant` neu rechnet.
  it("der Login-Effekt berechnet die Rechte nicht mehr selbst (kein Closure-Lock auf einen noch leeren Mandanten)", () => {
    const a = src.indexOf("a.getCurrentUserWithGroups()");
    expect(a).toBeGreaterThan(-1);
    const b = src.indexOf("\n", src.indexOf(".catch(", a));
    const abschnitt = src.slice(a, b + 1);
    expect(abschnitt).not.toMatch(/buildPermissions/);
    expect(abschnitt).toMatch(/setDolibarrUser/);
  });

  it("`me` ist ein useMemo, das bei jeder Änderung von dolibarrUser ODER mandant neu rechnet", () => {
    const a = src.indexOf("const me = useMemo(");
    expect(a).toBeGreaterThan(-1);
    const depsStart = src.indexOf("}, [", a);
    const b = src.indexOf(");", depsStart);
    const abschnitt = src.slice(a, b + 2);
    expect(abschnitt).toMatch(/buildPermissions\(dolibarrUser,\s*mandant\)/);
    expect(abschnitt).toMatch(/\[dolibarrUser,\s*mandant,\s*meFehler\]/);
  });
});

describe("GET /api/mandant liefert roh nur an Mandanten-Admins", () => {
  let dir, datei;

  it("roh fehlt ohne Mandanten-Admin-Rechte", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandant-rechte-"));
    datei = path.join(dir, "mandant.json");
    process.env.MANDANT_ADMINS = "max";
    try {
      fs.writeFileSync(datei, JSON.stringify({ kuerzel: "xy", name: "X", dienste: { dolibarr: "https://erp.xy.example.org" } }));
      const h = mandantHandler({ datei, ssoUser: () => "chef" });
      const res = { body: null, json(b) { this.body = b; return this; } };
      h.get({ headers: {} }, res);
      expect(res.body.roh).toBeUndefined();
    } finally {
      delete process.env.MANDANT_ADMINS;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("roh liegt bei mit Mandanten-Admin-Rechten", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandant-rechte-"));
    datei = path.join(dir, "mandant.json");
    process.env.MANDANT_ADMINS = "max";
    try {
      fs.writeFileSync(datei, JSON.stringify({ kuerzel: "xy", name: "X", dienste: { dolibarr: "https://erp.xy.example.org" } }));
      const h = mandantHandler({ datei, ssoUser: () => "max" });
      const res = { body: null, json(b) { this.body = b; return this; } };
      h.get({ headers: {} }, res);
      expect(res.body.roh?.kuerzel).toBe("xy");
    } finally {
      delete process.env.MANDANT_ADMINS;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
