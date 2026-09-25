// test/gbu/server-beteiligte.test.js
// Fachmodul src/server/gbu-offline.mjs: /api/nc/gbu/beteiligte (Server traegt
// bei jedem Paperless-Upload die Beteiligten ein) und /api/nc/gbu/meine
// (Geraet zieht seine eigenen offenen Beurteilungen der letzten 30 Tage).
// Gleiches Muster wie test/qualifikationen/ablage.test.js: der Handler
// bekommt seine Helfer ueber `ctx` gereicht, hier mit Attrappen ersetzt —
// die Handler laufen also wirklich, nicht nur eine Quelltextpruefung.
import { describe, expect, it, vi } from "vitest";
import { register } from "../../src/server/gbu-offline.mjs";
import { GBU_BETEILIGTE_STORE_LEER } from "../../src/gbu-offline.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";

function aufbau({ store = GBU_BETEILIGTE_STORE_LEER, schreibStatus = 204, plChecksumSuche } = {}) {
  const routen = {};
  // Reicht wache jetzt als zweites Argument mit (funktionWache, server.mjs) —
  // die Attrappe nimmt deshalb das LETZTE app.post-Argument als eigentlichen
  // Handler, statt des Zweiten. Diese Tests pruefen den Handler direkt, ohne
  // die Middleware-Kette (die hat funktionen-server.test.js).
  const app = { post: (pfad, ...fns) => { routen[pfad] = fns[fns.length - 1]; } };
  const protokoll = [];
  const ctx = {
    ncBody: (req) => req.body,
    mandantJetzt: () => MANDANT_STANDARD,
    appStoreLesen: async () => { protokoll.push("lesen"); return { store: JSON.parse(JSON.stringify(store)), etag: '"1"' }; },
    appStoreSchreiben: async (_s, _u, _p, _pfad, st) => { protokoll.push("schreiben"); ctx.geschrieben = st; return { status: schreibStatus }; },
    ORDNER: "Blattwerk", ORDNER_URL: "/Blattwerk", assertOrdner: async () => { protokoll.push("assert"); },
    ncFilesBase: () => "https://nc/remote.php/dav/files/kalender",
    ncPfad: (p) => p,
    APP_DIR: "/Blattwerk/App",
    plChecksumSuche: plChecksumSuche || (async () => null),
    // appStoreAendern wortgleich zum echten Verhalten (server.mjs), aber mit
    // den Attrappen oben statt echtem fetch — so bleibt der Test unabhaengig
    // vom Server-internen Lesen-Aendern-Schreiben-Ablauf.
    appStoreAendern: async (req, res, { pfad, leer, normalisieren, aendern }) => {
      const { store: roh } = await ctx.appStoreLesen(null, null, null, pfad, leer, normalisieren);
      const s = normalisieren ? normalisieren(roh) : roh;
      let ergebnis;
      try { ergebnis = aendern(s); } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
      const r = await ctx.appStoreSchreiben(null, null, null, pfad, ergebnis, '"1"');
      if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });
      return res.json({ ok: true, ...ergebnis });
    },
  };
  register(app, ctx);
  return { routen, ctx, protokoll };
}
const antwort = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const req = (body) => ({ body: { server: "https://nc", user: "k", pass: "p", ...body }, socket: {}, headers: {} });

describe("register", () => {
  it("haengt beide Endpunkte ein", () => {
    const { routen } = aufbau();
    expect(Object.keys(routen).sort()).toEqual(["/api/nc/gbu/beteiligte", "/api/nc/gbu/meine"]);
  });
});

describe("POST /api/nc/gbu/beteiligte", () => {
  it("verlangt Zugangsdaten", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/gbu/beteiligte"]({ body: { filename: "a.pdf", sha256: "aa", datum: "2026-09-18", beteiligte: ["tom"] }, socket: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
  it("verlangt filename/sha256/datum", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/gbu/beteiligte"](req({ beteiligte: ["tom"] }), res);
    expect(res.code).toBe(400);
  });
  it("ohne Beteiligte wird nichts geschrieben, aber trotzdem 200", async () => {
    const { routen, protokoll } = aufbau();
    const res = antwort();
    await routen["/api/nc/gbu/beteiligte"](req({ filename: "a.pdf", sha256: "aa", datum: "2026-09-18", beteiligte: [] }), res);
    expect(res.code).toBe(200);
    expect(res.body.uebersprungen).toBe(true);
    expect(protokoll).toEqual([]);
  });
  it("legt den Eintrag additiv im Store ab", async () => {
    const { routen, ctx } = aufbau();
    const res = antwort();
    await routen["/api/nc/gbu/beteiligte"](req({ filename: "a.pdf", sha256: "aa", datum: "2026-09-18", beteiligte: ["tom", "anna"] }), res);
    expect(res.code).toBe(200);
    expect(ctx.geschrieben.eintraege).toHaveLength(1);
    expect(ctx.geschrieben.eintraege[0]).toMatchObject({ filename: "a.pdf", sha256: "aa" });
  });
});

describe("POST /api/nc/gbu/meine", () => {
  const STORE = {
    version: 1,
    eintraege: [
      { filename: "a.pdf", sha256: "aa", datum: "2026-09-10", beteiligte: ["tom", "anna"] },
      { filename: "alt.pdf", sha256: "zz", datum: "2026-01-01", beteiligte: ["tom"] },
    ],
  };
  it("verlangt Zugangsdaten", async () => {
    const { routen } = aufbau({ store: STORE });
    const res = antwort();
    await routen["/api/nc/gbu/meine"]({ body: { login: "tom" }, socket: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
  it("verlangt einen Login", async () => {
    const { routen } = aufbau({ store: STORE });
    const res = antwort();
    await routen["/api/nc/gbu/meine"](req({}), res);
    expect(res.code).toBe(400);
  });
  it("liefert nur die eigenen, aktuellen Eintraege mit Dateiverweis", async () => {
    const plChecksumSuche = vi.fn(async (sha) => (sha === "aa" ? { id: 42, titel: "a" } : null));
    const { routen } = aufbau({ store: STORE, plChecksumSuche });
    const res = antwort();
    await routen["/api/nc/gbu/meine"](req({ login: "tom" }), res);
    expect(res.code).toBe(200);
    expect(res.body.eintraege).toEqual([{ filename: "a.pdf", datum: "2026-09-10", plId: 42 }]);
  });
  it("plId bleibt null, solange Paperless das Dokument noch nicht kennt", async () => {
    const { routen } = aufbau({ store: STORE, plChecksumSuche: async () => null });
    const res = antwort();
    await routen["/api/nc/gbu/meine"](req({ login: "tom" }), res);
    expect(res.body.eintraege[0].plId).toBeNull();
  });
  it("ein Fehlschlag der Paperless-Abfrage fuer EINEN Eintrag reisst die anderen nicht mit", async () => {
    const STORE2 = { version: 1, eintraege: [
      { filename: "a.pdf", sha256: "aa", datum: "2026-09-10", beteiligte: ["tom"] },
      { filename: "b.pdf", sha256: "bb", datum: "2026-09-11", beteiligte: ["tom"] },
    ] };
    const plChecksumSuche = async (sha) => { if (sha === "aa") throw new Error("Paperless down"); return { id: 7 }; };
    const { routen } = aufbau({ store: STORE2, plChecksumSuche });
    const res = antwort();
    await routen["/api/nc/gbu/meine"](req({ login: "tom" }), res);
    expect(res.code).toBe(200);
    expect(res.body.eintraege.find((e) => e.filename === "a.pdf").plId).toBeNull();
    expect(res.body.eintraege.find((e) => e.filename === "b.pdf").plId).toBe(7);
  });
});
