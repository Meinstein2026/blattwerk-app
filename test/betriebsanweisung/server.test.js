// test/betriebsanweisung/server.test.js
// Ablage des Unterweisungsnachweises (Fachmodul src/server/betriebsanweisung.mjs).
//
// Wie bei test/qualifikationen/ablage.test.js bekommt das Modul seine Helfer
// ueber `ctx` gereicht, hier zusaetzlich eine Attrappe von appStoreAendern,
// die denselben Vertrag wie die echte Funktion in server.mjs einhaelt (lesen
// -> aendern -> schreiben, eine Wiederholung bei 412, `danach`-Hook nach
// erfolgreichem Schreiben) — so laesst sich pruefen, dass DIESES Modul sie
// richtig aufruft, ohne WebDAV/Fetch fuer server.mjs selbst nachzubauen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  betriebsanweisungErinnerungAnzahl, betriebsanweisungErinnerungHtml, betriebsanweisungErinnerungText, register,
} from "../../src/server/betriebsanweisung.mjs";
import { BA_ABSCHNITTE_IDS, BA_UW_STORE_LEER, baUwNorm } from "../../src/betriebsanweisung.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const HEUTE = "2026-09-18";
// Gegen die ECHTE Uhr gerechnet: der Handler prüft "Zukunft" mit dem heutigen
// Datum. Das feste "2026-09-19" wurde am 19.09.2026 selbst zu "heute" und der
// Test rot. Zwei Tage voraus, damit auch die Zeitzone um Mitternacht nichts dreht.
const MORGEN = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);

function aufbau({ store = BA_UW_STORE_LEER, schreibStatus = 204 } = {}) {
  const routen = {};
  // Reicht wache jetzt als zweites Argument mit (funktionWache, server.mjs) —
  // die Attrappe nimmt deshalb das LETZTE app.post-Argument als eigentlichen
  // Handler, statt des Zweiten. Diese Tests pruefen den Handler direkt, ohne
  // die Middleware-Kette (die hat funktionen-server.test.js).
  const app = { post: (pfad, ...fns) => { routen[pfad] = fns[fns.length - 1]; } };
  const protokoll = [];
  const ctx = {
    ncBody: (req) => req.body,
    ssoUser: () => "max",
    authHeader: () => "Basic x",
    ncFilesBase: () => "https://nc/remote.php/dav/files/kalender",
    ncPfad: (p) => p,
    mandantJetzt: () => MANDANT_STANDARD,
    ORDNER: "Blattwerk", ORDNER_URL: "/Blattwerk", assertOrdner: async () => { protokoll.push("assert"); },
    APP_DIR: "/Blattwerk/App",
    AS_DIR: "/Blattwerk/Arbeitsschutz",
    appStoreLesen: async () => { protokoll.push("lesen"); return { store: JSON.parse(JSON.stringify(store)), etag: '"1"' }; },
    appStoreSchreiben: async (_s, _u, _p, _pfad, st) => { protokoll.push("schreiben"); ctx.geschrieben = st; return { status: schreibStatus }; },
    asTerminSchreiben: async (_creds, t) => { protokoll.push("termin"); ctx.termin = t; return { ok: true, uid: t.uid }; },
    // Attrappe mit demselben Vertrag wie die echte appStoreAendern (server.mjs).
    appStoreAendern: async (req, res, { pfad, leer, normalisieren, aendern, danach }) => {
      const { server, user, pass } = ctx.ncBody(req);
      let versuch = 0, r, ergebnis;
      while (versuch < 2) {
        const { store: s, etag } = await ctx.appStoreLesen(server, user, pass, pfad, leer, normalisieren);
        try { ergebnis = aendern(s); } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
        r = await ctx.appStoreSchreiben(server, user, pass, pfad, ergebnis, etag);
        if (r.status !== 412) break;
        versuch++;
      }
      if (r.status === 412) return res.status(409).json({ error: "Gleichzeitige Änderung — bitte erneut versuchen" });
      if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });
      const zusatz = danach ? await danach(ergebnis, { server, user, pass }) : null;
      return res.json({ ok: true, ...ergebnis, ...zusatz });
    },
  };
  register(app, ctx);
  return { routen, ctx, protokoll };
}
const antwort = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const req = (body) => ({ body: { server: "https://nc", user: "k", pass: "p", ...body }, socket: {}, headers: {} });
const PDF = Buffer.from("%PDF-1.4 test").toString("base64");

const gueltig = {
  login: "tom", name: "Tom Aushilfe", datum: HEUTE, ort: "Musterstraße 1",
  variante: "skt-a", einweiser: "Max Muster", einweiserQualifikation: "SKT B",
  abschnitte: [...BA_ABSCHNITTE_IDS],
};

let fetchAlt, protokollRef, putStatus;
beforeEach(() => {
  fetchAlt = globalThis.fetch;
  putStatus = 201;
  globalThis.fetch = vi.fn(async (url, init) => {
    protokollRef?.push(`${init.method} ${url}`);
    return { status: init.method === "MKCOL" ? 201 : putStatus };
  });
});
afterEach(() => { globalThis.fetch = fetchAlt; protokollRef = null; });

describe("register", () => {
  it("hängt beide Endpunkte ein", () => {
    const { routen } = aufbau();
    expect(Object.keys(routen).sort()).toEqual(["/api/nc/unterweisungen", "/api/nc/unterweisungen/save"]);
  });

  it("liefert beim Lesen den normalisierten Store", async () => {
    const { routen } = aufbau({ store: { eintraege: [{ login: "a" }] } });
    const res = antwort();
    await routen["/api/nc/unterweisungen"](req({}), res);
    expect(res.code).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.eintraege).toHaveLength(1);
  });

  it("verlangt Zugangsdaten", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"]({ body: { eintrag: gueltig }, socket: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
});

describe("save — Validierung vor jedem Zugriff", () => {
  it("400 ohne Ort, ohne Nextcloud anzufassen", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: { ...gueltig, ort: "" }, pdfBase64: PDF, dateiname: "x.pdf" }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Ort/);
    expect(protokoll).toEqual([]);
  });

  it("400 bei Datum in der Zukunft", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: { ...gueltig, datum: MORGEN }, pdfBase64: PDF, dateiname: "x.pdf" }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Zukunft/);
    expect(protokoll).toEqual([]);
  });

  it("400 wenn nicht alle sechs Abschnitte bestaetigt sind", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: { ...gueltig, abschnitte: ["gefahren"] }, pdfBase64: PDF, dateiname: "x.pdf" }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Nicht alle Abschnitte/);
  });

  it("400 ohne unterschriebenes Protokoll", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: gueltig }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Protokoll/);
    expect(protokoll).toEqual([]);
  });
});

describe("save — Protokoll zuerst, dann Store", () => {
  const auftrag = { eintrag: gueltig, pdfBase64: PDF, dateiname: "UW_2026-09-18_SKT-A_tom.pdf" };

  it("legt die Datei im Jahresordner ab, BEVOR der Store geschrieben wird", async () => {
    const { routen, ctx, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req(auftrag), res);
    expect(res.code).toBe(200);
    const put = protokoll.findIndex((z) => /^PUT .*\/Blattwerk\/Arbeitsschutz\/Unterweisungen\/2026\/UW_2026-09-18_SKT-A_tom\.pdf$/.test(z));
    const store = protokoll.indexOf("schreiben");
    expect(put).toBeGreaterThan(-1);
    expect(put).toBeLessThan(store);
    const eintrag = ctx.geschrieben.eintraege[0];
    expect(eintrag.name).toBe("Tom Aushilfe");
    expect(eintrag.erfasstVon).toBe("max");
    expect(res.body.ncPfad).toBe("Blattwerk/Arbeitsschutz/Unterweisungen/2026/UW_2026-09-18_SKT-A_tom.pdf");
  });

  it("schreibt den Store NICHT, wenn das Protokoll nicht abgelegt werden kann", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    putStatus = 507;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req(auftrag), res);
    expect(res.code).toBe(502);
    expect(res.body.error).toMatch(/Protokoll ablegen/);
    expect(protokoll).not.toContain("schreiben");
  });

  it("haengt an, statt zu ersetzen", async () => {
    const vorher = baUwNorm({ eintraege: [{ ...gueltig, login: "anna", name: "Anna", datum: "2025-01-01", id: "alt", erfasstAm: "2025-01-01T00:00:00.000Z" }] });
    const { routen, ctx } = aufbau({ store: vorher });
    await routen["/api/nc/unterweisungen/save"](req(auftrag), antwort());
    expect(ctx.geschrieben.eintraege.map((x) => x.login)).toEqual(["anna", "tom"]);
  });

  it("liest bei 412 neu und gibt nach zwei Versuchen 409", async () => {
    const { routen, protokoll } = aufbau({ schreibStatus: 412 }); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req(auftrag), res);
    expect(res.code).toBe(409);
    expect(protokoll.filter((z) => z === "schreiben")).toHaveLength(2);
  });
});

describe("save — Kalendertermin", () => {
  it("feste UID je Person, mit der Faelligkeit (jaehrlich)", async () => {
    const { routen, ctx } = aufbau();
    const res = antwort();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: gueltig, pdfBase64: PDF, dateiname: "x.pdf" }), res);
    expect(ctx.termin.uid).toBe("blattwerk-unterweisung-tom@blattwerk");
    expect(ctx.termin.datum).toBe("2027-09-18");
    expect(ctx.termin.titel).toMatch(/Tom Aushilfe/);
    expect(res.body.faellig).toBe("2027-09-18");
    expect(res.body.kalender).toEqual({ ok: true, uid: ctx.termin.uid });
  });

  it("halbjaehrlich bei Jugendlichen", async () => {
    const { routen, ctx } = aufbau();
    await routen["/api/nc/unterweisungen/save"](req({ eintrag: { ...gueltig, jugendlich: true }, pdfBase64: PDF, dateiname: "x.pdf" }), antwort());
    expect(ctx.termin.datum).toBe("2027-03-18");
    expect(ctx.termin.text).toMatch(/JArbSchG/);
  });
});

describe("Erinnerung", () => {
  const store = baUwNorm({ eintraege: [
    { ...gueltig, login: "alt", name: "Alt", datum: "2025-01-01", id: "1", erfasstAm: "2025-01-01T00:00:00.000Z" },
    { ...gueltig, login: "frisch", name: "Frisch", datum: "2026-09-01", id: "2", erfasstAm: "2026-09-01T00:00:00.000Z" },
  ] });

  it("baut einen Abschnitt Unterweisungen mit Frist und Name", () => {
    const html = betriebsanweisungErinnerungText(store, HEUTE);
    expect(html).toMatch(/Unterweisungen:/);
    expect(html).toContain("Alt");
    expect(html).not.toContain("Frisch");
  });

  it("ist leer, wenn nichts ansteht", () => {
    expect(betriebsanweisungErinnerungText(BA_UW_STORE_LEER, HEUTE)).toBe("");
  });

  it("liest den Store ueber den gemerkten ctx", async () => {
    aufbau({ store });
    const html = await betriebsanweisungErinnerungHtml({ server: "https://nc", user: "k", pass: "p" }, HEUTE);
    expect(html).toMatch(/Unterweisungen:/);
  });

  it("liefert die Anzahl der faelligen Unterweisungen", async () => {
    aufbau({ store });
    expect(await betriebsanweisungErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, HEUTE)).toBe(1);
  });

  it("schweigt, wenn der Store nicht lesbar ist", async () => {
    const { ctx } = aufbau();
    ctx.appStoreLesen = async () => { throw new Error("kaputt"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await betriebsanweisungErinnerungHtml({ server: "https://nc", user: "k", pass: "p" }, HEUTE)).toBe("");
    expect(await betriebsanweisungErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, HEUTE)).toBe(0);
    spy.mockRestore();
    expect(await betriebsanweisungErinnerungHtml(null, HEUTE)).toBe("");
  });
});
