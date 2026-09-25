// Server-Fachmodul des Baumkatasters. Läuft mit gefälschtem ctx und
// gefälschtem fetch — kein Nextcloud, kein Express. Geprüft wird das
// Verhalten der Handler (400 bei Müll, Reihenfolge Datei-vor-Store,
// Pfad-Traversal), nicht der Quelltext.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { baumNrSafe, fotoNameSafe, kundeIdSafe, register, vorgangIdSafe } from "../../src/server/baumkataster.mjs";
import { bkEinreihen, bkNachtragen } from "../../src/baumkataster-offline.js";

const quelle = fs.readFileSync(path.join(process.cwd(), "src/server/baumkataster.mjs"), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

/** Gefälschter Express: sammelt die Handler je Pfad. Reicht jetzt `wache`
 * (funktionWache, src/mandant-server.mjs) als Argument vor dem Handler mit —
 * das LETZTE app.post-Argument ist deshalb der eigentliche Handler, den
 * diese Tests direkt prüfen (die Middleware-Kette prüft funktionen-server.test.js). */
const fakeApp = () => { const routen = {}; return { routen, post: (pfad, ...fns) => { routen[pfad] = fns[fns.length - 1]; } }; };
/** Gefälschte Antwort. */
const antwort = () => {
  const r = { code: 200, body: null, kopf: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.kopf[k] = v; };
  r.send = (b) => { r.body = b; return r; };
  return r;
};
/** Gefälschter ctx: Stores liegen in einer Map, jeder Schreibzugriff wird protokolliert. */
const fakeCtx = () => {
  const aufrufe = [];
  const stores = {};
  const ctx = {
    ncBody: (req) => req.body,
    ssoUser: () => "max",
    authHeader: () => "Basic x",
    trimSlash: (u) => String(u || "").replace(/\/+$/, ""),
    ncFilesBase: (server, user) => `${server}/remote.php/dav/files/${user}`,
    ncPfad: (p) => String(p).split("/").map(encodeURIComponent).join("/"),
    ORDNER: "Blattwerk", ORDNER_URL: "/Blattwerk", assertOrdner: async () => { aufrufe.push("assertBlattwerk"); },
    APP_DIR: "/Blattwerk/App", AS_DIR: "/Blattwerk/Arbeitsschutz",
    appStoreLesen: async (s, u, p, pfad, leer, norm) => {
      aufrufe.push("lesen:" + pfad);
      const roh = stores[pfad] ? JSON.parse(stores[pfad]) : JSON.parse(JSON.stringify(leer));
      return { store: norm ? norm(roh) : roh, etag: stores[pfad] ? '"1"' : null };
    },
    appStoreSchreiben: async (s, u, p, pfad, store, etag) => {
      aufrufe.push("schreiben:" + pfad);
      stores[pfad] = JSON.stringify(store);
      return { status: etag ? 204 : 201 };
    },
    appStoreAendern: async () => { throw new Error("appStoreAendern soll hier nicht benutzt werden"); },
    asTerminSchreiben: async () => ({ ok: true }), plUpload: async () => ({ ok: true }), parseDirListing: () => [],
  };
  return { ctx, aufrufe, stores };
};
const CREDS = { server: "https://nc", user: "blattwerk-kalender", pass: "geheim" };
const req = (body) => ({ body: { ...CREDS, ...body }, socket: { remoteAddress: "127.0.0.1" }, headers: {} });

let app, ctx, aufrufe, stores, ruf;
beforeEach(() => {
  ({ ctx, aufrufe, stores } = fakeCtx());
  app = fakeApp();
  register(app, ctx);
  ruf = async (pfad, body) => { const res = antwort(); await app.routen[pfad](req(body), res); return res; };
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    aufrufe.push(`${init.method || "GET"} ${url}`);
    if (init.method === "MKCOL") return { status: 405, ok: false };
    if (init.method === "PUT") return { status: 201, ok: true };
    return { status: 200, ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer, headers: { get: () => "image/jpeg" } };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Einhängen", () => {
  it("registriert alle acht Endpunkte", () => {
    expect(Object.keys(app.routen).sort()).toEqual([
      "/api/nc/baumkataster/baum/save", "/api/nc/baumkataster/foto", "/api/nc/baumkataster/index",
      "/api/nc/baumkataster/kontrolle/gbu", "/api/nc/baumkataster/kontrolle/save", "/api/nc/baumkataster/kunde",
      "/api/nc/baumkataster/massnahme/erledigt", "/api/nc/baumkataster/massnahme/save",
    ]);
  });
  it("importiert nichts aus server.mjs (damit es ohne laufenden Server testbar bleibt)", () => {
    expect(quelle).not.toMatch(/from\s+["']\.\.\/\.\.\/server\.mjs["']/);
  });
});

describe("Pfad-Sicherheit", () => {
  it("kundeId nur Ziffern, Baumnummer nur B-nnnn, Dateiname ohne Trenner und ohne Punkt-Namen", () => {
    expect(kundeIdSafe("12")).toBe("12");
    expect(kundeIdSafe(12)).toBe("12");
    expect(kundeIdSafe("12/../x")).toBe("");
    expect(kundeIdSafe("")).toBe("");
    expect(baumNrSafe("B-0001")).toBe("B-0001");
    expect(baumNrSafe("B-1")).toBe("");
    expect(baumNrSafe("../B-0001")).toBe("");
    expect(fotoNameSafe("2026-09-16-1.jpg")).toBe("2026-09-16-1.jpg");
    expect(fotoNameSafe("../../x.jpg")).toBe("");
    expect(fotoNameSafe("..")).toBe("");
    expect(fotoNameSafe("a/b.jpg")).toBe("");
    expect(fotoNameSafe("bericht.pdf")).toBe("");
  });
});

describe("Lesen", () => {
  it("index: leer, wenn es die Datei noch nicht gibt", async () => {
    const res = await ruf("/api/nc/baumkataster/index", {});
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ version: 1, kunden: {} });
    expect(aufrufe).toContain("lesen:/Blattwerk/App/Baumkataster/index.json");
  });
  it("kunde: 400 ohne oder mit kaputter kundeId, sonst der (normalisierte) Store", async () => {
    expect((await ruf("/api/nc/baumkataster/kunde", {})).code).toBe(400);
    expect((await ruf("/api/nc/baumkataster/kunde", { kundeId: "12/../x" })).code).toBe(400);
    stores["/Blattwerk/App/Baumkataster/12.json"] = JSON.stringify({ kunde: { id: 12, name: "Schlosspark" }, baeume: { "B-0001": { art: "Quercus robur" } } });
    const res = await ruf("/api/nc/baumkataster/kunde", { kundeId: 12 });
    expect(res.code).toBe(200);
    expect(res.body.kunde.name).toBe("Schlosspark");
    expect(res.body.baeume["B-0001"]).toMatchObject({ nr: "B-0001", kontrollen: [], massnahmen: [] });
  });
  it("ohne Zugangsdaten 400", async () => {
    const res = antwort();
    await app.routen["/api/nc/baumkataster/index"]({ body: {}, socket: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
});

describe("Lesen-Ändern-Schreiben-Helfer (Quelltext)", () => {
  const helfer = quelle.slice(quelle.indexOf("async function storeAendern"), quelle.indexOf("async function indexNachziehen"));
  it("prüft den Blattwerk-Ordner VOR der Ordnerkette und schreibt mit If-Match über appStoreSchreiben", () => {
    expect(helfer.indexOf("assertOrdner")).toBeGreaterThan(-1);
    expect(helfer.indexOf("assertOrdner")).toBeLessThan(helfer.indexOf("ordnerSicherstellen"));
    expect(helfer).toMatch(/appStoreSchreiben\(/);
    expect(helfer).toMatch(/412/);
    expect(helfer).toMatch(/versuch < 2/);
  });
  it("Validierungsfehler aus der Logik werden 400, nicht 502", () => {
    expect(helfer).toMatch(/fehlerMit\(400/);
  });
});

describe("412-Wiederholung bei gleichzeitiger Änderung (Verhalten, nicht nur Quelltext)", () => {
  // Die Attrappe oben gibt nie 412 zurück — die beiden Prüfungen /412/ und
  // /versuch < 2/ hätten also auch einen storeAendern belegt, der beim
  // Konflikt einfach den alten Stand weiterschreibt. Hier wird das gefälschte
  // appStoreSchreiben so gebaut, dass ein echter Konflikt entsteht, und
  // zugesichert, was danach wirklich passiert.
  const KUNDENSTORE = "/Blattwerk/App/Baumkataster/12.json";
  /**
   * Baut einen eigenen (frischen) App+ctx. `versuchsplan[i]` bestimmt den
   * Status des (i+1)-ten Schreibversuchs auf den Kundenstore (412 = Konflikt,
   * sonst normaler Erfolg). Jeder Lesevorgang auf den Kundenstore bekommt ein
   * eigenes, monoton steigendes ETag — genau die Garantie, gegen die ein
   * echter Server bei einer gleichzeitigen Änderung ein neues ETag ausliefert.
   */
  const aufbauen = (versuchsplan) => {
    const { ctx, aufrufe, stores } = fakeCtx();
    const gelesen = []; const geschrieben = [];
    let versuch = 0, etagZaehler = 0;
    ctx.appStoreLesen = async (s, u, p, pfad, leer, norm) => {
      aufrufe.push("lesen:" + pfad);
      const roh = stores[pfad] ? JSON.parse(stores[pfad]) : JSON.parse(JSON.stringify(leer));
      const etag = pfad === KUNDENSTORE ? `"${++etagZaehler}"` : (stores[pfad] ? '"1"' : null);
      gelesen.push({ pfad, etag });
      return { store: norm ? norm(roh) : roh, etag };
    };
    ctx.appStoreSchreiben = async (s, u, p, pfad, store, etag) => {
      aufrufe.push("schreiben:" + pfad);
      geschrieben.push({ pfad, etag });
      if (pfad === KUNDENSTORE) {
        versuch++;
        if (versuchsplan[versuch - 1] === 412) return { status: 412 };
      }
      stores[pfad] = JSON.stringify(store);
      return { status: etag ? 204 : 201 };
    };
    const app2 = fakeApp();
    register(app2, ctx);
    const ruf2 = async (pfad, body) => { const res = antwort(); await app2.routen[pfad](req(body), res); return res; };
    return { ruf2, gelesen, geschrieben };
  };

  it("liest nach einem 412 neu und schreibt den zweiten Versuch mit dem neuen ETag", async () => {
    const { ruf2, gelesen, geschrieben } = aufbauen([412]); // erster Schreibversuch scheitert, der zweite klappt
    const res = await ruf2("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    expect(res.code).toBe(200);
    const kundenLesen = gelesen.filter((x) => x.pfad === KUNDENSTORE);
    const kundenSchreiben = geschrieben.filter((x) => x.pfad === KUNDENSTORE);
    // (a) nach dem 412 wird tatsächlich ein zweites Mal gelesen …
    expect(kundenLesen).toHaveLength(2);
    expect(kundenLesen[0].etag).not.toBe(kundenLesen[1].etag);
    // (b) … und der zweite Schreibaufruf trägt genau das dabei gelesene, neue ETag —
    // nicht mehr das alte, das gerade den Konflikt ausgelöst hatte.
    expect(kundenSchreiben).toHaveLength(2);
    expect(kundenSchreiben[0].etag).toBe(kundenLesen[0].etag);
    expect(kundenSchreiben[1].etag).toBe(kundenLesen[1].etag);
  });

  it("zwei 412 in Folge enden im dokumentierten Fehler (409), nicht in einer stillen Falschmeldung", async () => {
    const { ruf2 } = aufbauen([412, 412]);
    const res = await ruf2("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/Gleichzeitige Änderung/);
  });
});

describe("Baum speichern", () => {
  it("legt Baum B-0001 an, schreibt den Kundenstore und zieht den Index nach", async () => {
    const res = await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, kundeName: "Schlosspark GmbH", baum: { art: "Quercus robur", artDe: "Stieleiche", lat: 50.1, lon: 8.6 } });
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.baum.nr).toBe("B-0001");
    expect(res.body.baum.angelegtVon).toBe("max");
    const store = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]);
    expect(store.kunde).toEqual({ id: 12, name: "Schlosspark GmbH" });
    expect(store.baeume["B-0001"].art).toBe("Quercus robur");
    const idx = JSON.parse(stores["/Blattwerk/App/Baumkataster/index.json"]);
    expect(idx.kunden["12"]).toMatchObject({ name: "Schlosspark GmbH", anzahl: 1, faellig: 1 });
    // Reihenfolge: Blattwerk-Ordner prüfen, Ordnerkette, dann Store, dann Index
    const i = (s) => aufrufe.findIndex((a) => a.startsWith(s));
    expect(i("assertBlattwerk")).toBeLessThan(i("MKCOL"));
    expect(i("MKCOL")).toBeLessThan(i("schreiben:/Blattwerk/App/Baumkataster/12.json"));
    expect(i("schreiben:/Blattwerk/App/Baumkataster/12.json")).toBeLessThan(i("schreiben:/Blattwerk/App/Baumkataster/index.json"));
  });
  it("unvollständig → 400 mit Text aus der Logik, nichts geschrieben", async () => {
    const res = await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { hoeheM: 3 } });
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Baumart/);
    expect(aufrufe.some((a) => a.startsWith("schreiben:"))).toBe(false);
  });
  it("ohne baum oder mit kaputter kundeId → 400", async () => {
    expect((await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12 })).code).toBe(400);
    expect((await ruf("/api/nc/baumkataster/baum/save", { kundeId: "x", baum: { art: "y" } })).code).toBe(400);
  });
});

describe("Maßnahmen und GBU-Verweis", () => {
  const vorbereiten = async () => {
    await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    stores["/Blattwerk/App/Baumkataster/12.json"] = JSON.stringify({
      ...JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]),
      baeume: { "B-0001": { nr: "B-0001", art: "Quercus robur", status: "aktiv", massnahmen: [],
        kontrollen: [{ id: "k-1", datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja", befund: {}, naechsteKontrolle: "2028-09-16", gbuIds: [] }] } },
    });
  };
  it("massnahme/save legt eine offene Maßnahme mit Frist an", async () => {
    await vorbereiten();
    const res = await ruf("/api/nc/baumkataster/massnahme/save", { kundeId: 12, nr: "B-0001", massnahme: { kontrolleId: "k-1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", datum: "2026-09-16", dolibarrTaskId: 77 } });
    expect(res.code).toBe(200);
    expect(res.body.massnahme).toMatchObject({ art: "Totholzentfernung", faelligBis: "2026-10-14", status: "offen", dolibarrTaskId: 77, angelegtVon: "max" });
    expect(JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].massnahmen).toHaveLength(1);
  });
  it("massnahme/erledigt setzt nur den Status", async () => {
    await vorbereiten();
    const m = (await ruf("/api/nc/baumkataster/massnahme/save", { kundeId: 12, nr: "B-0001", massnahme: { art: "Kronenpflege", dringlichkeit: "langfristig", datum: "2026-09-16" } })).body.massnahme;
    const res = await ruf("/api/nc/baumkataster/massnahme/erledigt", { kundeId: 12, nr: "B-0001", massnahmeId: m.id, bemerkung: "erledigt am Vormittag" });
    expect(res.code).toBe(200);
    expect(res.body.massnahme).toMatchObject({ id: m.id, art: "Kronenpflege", status: "erledigt", erledigtVon: "max", bemerkung: "erledigt am Vormittag" });
    expect((await ruf("/api/nc/baumkataster/massnahme/erledigt", { kundeId: 12, nr: "B-0001", massnahmeId: "m-9" })).code).toBe(400);
    expect((await ruf("/api/nc/baumkataster/massnahme/erledigt", { kundeId: 12, nr: "B-1", massnahmeId: m.id })).code).toBe(400);
  });
  it("kontrolle/gbu hängt die GBU-Id an — Schnittstelle für Teilprojekt B", async () => {
    await vorbereiten();
    const res = await ruf("/api/nc/baumkataster/kontrolle/gbu", { kundeId: 12, nr: "B-0001", kontrolleId: "k-1", gbuId: "gbu-1723209600000" });
    expect(res.code).toBe(200);
    expect(res.body.kontrolle.gbuIds).toEqual(["gbu-1723209600000"]);
    expect((await ruf("/api/nc/baumkataster/kontrolle/gbu", { kundeId: 12, nr: "B-0001", kontrolleId: "k-9", gbuId: "gbu-1" })).code).toBe(400);
    expect((await ruf("/api/nc/baumkataster/kontrolle/gbu", { kundeId: 12, nr: "B-0001", kontrolleId: "k-1" })).code).toBe(400);
  });
});

describe("Kontrolle mit Fotos", () => {
  const KONTROLLE = { datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja", befund: { krone: ["Totholz"] }, bemerkung: "" };
  const baumAnlegen = () => ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
  it("legt die Fotos ab, BEVOR die Kontrolle in den Store kommt, und trägt die Dateinamen ein", async () => {
    await baumAnlegen(); aufrufe.length = 0;
    const res = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE,
      fotos: [{ base64: "data:image/jpeg;base64,/9j/AA==" }, { base64: "/9j/BB==" }] });
    expect(res.code).toBe(200);
    // Dateinamen tragen die Kontroll-Id (Ruling R11) — die Id wird von bkId
    // erzeugt (Zeit+Zufall) und darum aus der Antwort genommen, nicht geraten.
    const id = res.body.kontrolle.id;
    expect(id).toBeTruthy();
    const name1 = `2026-09-16-${id}-1.jpg`, name2 = `2026-09-16-${id}-2.jpg`;
    expect(res.body.kontrolle.fotos).toEqual([name1, name2]);
    const put1 = aufrufe.findIndex((a) => a === `PUT https://nc/remote.php/dav/files/blattwerk-kalender/Blattwerk/Baumkataster/12/B-0001/${name1}`);
    const put2 = aufrufe.findIndex((a) => a.endsWith(`/${name2}`));
    const store = aufrufe.findIndex((a) => a === "schreiben:/Blattwerk/App/Baumkataster/12.json");
    expect(put1).toBeGreaterThan(-1);
    expect(put2).toBeGreaterThan(put1);
    expect(store).toBeGreaterThan(put2);
    expect(aufrufe.indexOf("assertBlattwerk")).toBeLessThan(aufrufe.findIndex((a) => a.startsWith("MKCOL")));
    expect(aufrufe.some((a) => a === "MKCOL https://nc/remote.php/dav/files/blattwerk-kalender/Blattwerk/Baumkataster/12/B-0001")).toBe(true);
    const gespeichert = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].kontrollen;
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].id).toBe(id);
    expect(gespeichert[0].fotos).toEqual([name1, name2]);
  });
  it("zwei Kontrollen desselben Baums mit demselben Datum überschreiben sich nicht (Ruling R11)", async () => {
    // Regelkontrolle + Zusatzkontrolle nach einem Sturm, gleiches (frei
    // rückdatierbares) Datum: vor R11 begann `i` bei jedem Speichern wieder
    // bei 0, die zweite Kontrolle überschrieb per PUT die Fotodateien der
    // ersten — die erste Kontrolle behauptete danach einen Nachweis, den es
    // nicht mehr gab.
    await baumAnlegen(); aufrufe.length = 0;
    const erste = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE, fotos: [{ base64: "/9j/AA==" }] });
    const zweite = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE, fotos: [{ base64: "/9j/BB==" }] });
    expect(erste.code).toBe(200);
    expect(zweite.code).toBe(200);
    expect(erste.body.kontrolle.id).not.toBe(zweite.body.kontrolle.id);
    const zielErste = erste.body.kontrolle.fotos[0], zielZweite = zweite.body.kontrolle.fotos[0];
    expect(zielErste).not.toBe(zielZweite);
    const kontrollen = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].kontrollen;
    expect(kontrollen).toHaveLength(2);
    expect(kontrollen[0].fotos).toEqual([zielErste]);
    expect(kontrollen[1].fotos).toEqual([zielZweite]);
  });
  it("eine unvollständige Kontrolle lädt gar kein Foto hoch (Vorprüfung)", async () => {
    await baumAnlegen(); aufrufe.length = 0;
    const res = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: { ...KONTROLLE, vitalitaet: 9 }, fotos: [{ base64: "/9j/AA==" }] });
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Vitalität/);
    expect(aufrufe.some((a) => a.startsWith("PUT"))).toBe(false);
    expect(aufrufe.some((a) => a.startsWith("schreiben:"))).toBe(false);
  });
  it("scheitert ein Foto-Upload, wird nichts eingetragen", async () => {
    await baumAnlegen();
    fetch.mockImplementation(async (url, init = {}) => (init.method === "PUT" ? { status: 507, ok: false } : { status: 405, ok: false }));
    const res = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE, fotos: [{ base64: "/9j/AA==" }] });
    expect(res.code).toBe(502);
    expect(res.body.error).toMatch(/Foto/);
    expect(JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].kontrollen).toEqual([]);
  });
  it("ohne Fotos geht es direkt in den Store; mehr als 10 Fotos → 400", async () => {
    await baumAnlegen(); aufrufe.length = 0;
    expect((await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE })).code).toBe(200);
    expect(aufrufe.some((a) => a.startsWith("PUT"))).toBe(false);
    expect((await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE, fotos: Array(11).fill({ base64: "AA==" }) })).code).toBe(400);
  });
  it("Kontrolleur = SSO-Nutzer, wenn der Client keinen nennt", async () => {
    await baumAnlegen();
    const res = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE });
    expect(res.body.kontrolle.kontrolleur).toBe("max");
    expect(res.body.kontrolle.erfasstVon).toBe("max");
  });
  it("ein leeres Foto in der Mitte → 400, und KEIN Foto wird hochgeladen (keine Waisen)", async () => {
    await baumAnlegen(); aufrufe.length = 0;
    const res = await ruf("/api/nc/baumkataster/kontrolle/save", { kundeId: 12, nr: "B-0001", kontrolle: KONTROLLE, fotos: [{ base64: "/9j/AA==" }, { base64: "" }] });
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Foto 2/);
    expect(aufrufe.some((a) => a.startsWith("PUT"))).toBe(false);
    expect(aufrufe.some((a) => a.startsWith("schreiben:"))).toBe(false);
  });
});

describe("Foto ausliefern", () => {
  it("liefert die Datei nur unterhalb des Baum-Ordners", async () => {
    const res = await ruf("/api/nc/baumkataster/foto", { kundeId: 12, nr: "B-0001", datei: "2026-09-16-1.jpg" });
    expect(res.code).toBe(200);
    expect(res.kopf["Content-Type"]).toBe("image/jpeg");
    expect(res.kopf["Content-Disposition"]).toBe('inline; filename="2026-09-16-1.jpg"');
    expect(aufrufe.pop()).toBe("GET https://nc/remote.php/dav/files/blattwerk-kalender/Blattwerk/Baumkataster/12/B-0001/2026-09-16-1.jpg");
  });
  it("Pfad-Traversal in jedem der drei Teile → 400, kein Zugriff", async () => {
    for (const body of [
      { kundeId: "12/..", nr: "B-0001", datei: "a.jpg" },
      { kundeId: 12, nr: "../B-0001", datei: "a.jpg" },
      { kundeId: 12, nr: "B-0001", datei: "../../einweisungen.json" },
      { kundeId: 12, nr: "B-0001", datei: ".." },
      { kundeId: 12, nr: "B-0001", datei: "a\\b.jpg" },
    ]) {
      aufrufe.length = 0;
      expect((await ruf("/api/nc/baumkataster/foto", body)).code).toBe(400);
      expect(aufrufe.some((a) => a.startsWith("GET"))).toBe(false);
    }
  });
  it("404 von Nextcloud wird 404", async () => {
    fetch.mockImplementation(async () => ({ status: 404, ok: false }));
    expect((await ruf("/api/nc/baumkataster/foto", { kundeId: 12, nr: "B-0001", datei: "x.jpg" })).code).toBe(404);
  });
});

// Idempotenz-Kernstest 1 (18.09.2026): stirbt die App zwischen einem beim
// Server angenommenen Vorgang und der Antwort, sendet der nächste Versuch
// dieselbe Kennung (`vorgangId`) erneut. Additive Listen (Kontrollen,
// Maßnahmen) und die Baumanlage dürfen daraus KEINEN zweiten Eintrag machen.
describe("Idempotenz — derselbe Vorgang zweimal (18.09.2026)", () => {
  it("vorgangIdSafe lässt nur ein überschaubares Alphabet zu — sie landet im Dateinamen", () => {
    expect(vorgangIdSafe("bkv-abc123-xyz")).toBe("bkv-abc123-xyz");
    expect(vorgangIdSafe("../../etc")).toBe("");
    expect(vorgangIdSafe("a/b")).toBe("");
    expect(vorgangIdSafe("")).toBe("");
    expect(vorgangIdSafe(undefined)).toBe("");
    expect(vorgangIdSafe("x".repeat(81))).toBe("");
  });

  it("baum/save: dieselbe vorgangId legt nur EINEN Baum an, egal wie oft gesendet", async () => {
    const vorgang = { kundeId: 12, kundeName: "Schlosspark GmbH", vorgangId: "bkv-1", baum: { art: "Quercus robur", artDe: "Stieleiche" } };
    const erste = await ruf("/api/nc/baumkataster/baum/save", vorgang);
    const zweite = await ruf("/api/nc/baumkataster/baum/save", vorgang);
    const dritte = await ruf("/api/nc/baumkataster/baum/save", vorgang);
    expect(erste.code).toBe(200); expect(zweite.code).toBe(200); expect(dritte.code).toBe(200);
    expect(zweite.body.baum.nr).toBe(erste.body.baum.nr);
    expect(dritte.body.baum.nr).toBe(erste.body.baum.nr);
    const baeume = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume;
    expect(Object.keys(baeume)).toEqual(["B-0001"]);   // NICHT B-0001 und B-0002
  });

  it("baum/save: ohne vorgangId (Altbestand) bleibt es beim alten Verhalten — jeder Aufruf legt einen neuen Baum an", async () => {
    const vorgang = { kundeId: 12, baum: { art: "Quercus robur" } };
    const erste = await ruf("/api/nc/baumkataster/baum/save", vorgang);
    const zweite = await ruf("/api/nc/baumkataster/baum/save", vorgang);
    expect(zweite.body.baum.nr).not.toBe(erste.body.baum.nr);
    expect(Object.keys(JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume)).toEqual(["B-0001", "B-0002"]);
  });

  it("kontrolle/save: dieselbe vorgangId legt nur EINE Kontrolle an und liefert dieselbe kontrolle.id zurück (Folgevorgänge hängen daran)", async () => {
    await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    aufrufe.length = 0;
    const KONTROLLE = { datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja", befund: { krone: ["Totholz"] }, bemerkung: "" };
    const vorgang = { kundeId: 12, nr: "B-0001", vorgangId: "bkv-k1", kontrolle: KONTROLLE, fotos: [{ base64: "/9j/AA==" }] };
    const erste = await ruf("/api/nc/baumkataster/kontrolle/save", vorgang);
    const zweite = await ruf("/api/nc/baumkataster/kontrolle/save", vorgang);   // z. B. weil die Antwort auf dem Weg verloren ging
    expect(erste.code).toBe(200); expect(zweite.code).toBe(200);
    expect(zweite.body.kontrolle.id).toBe(erste.body.kontrolle.id);
    expect(zweite.body.kontrolle.fotos).toEqual(erste.body.kontrolle.fotos);   // gleiche Kennung → gleicher Dateiname
    const kontrollen = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].kontrollen;
    expect(kontrollen).toHaveLength(1);
  });

  it("massnahme/save: dieselbe vorgangId legt nur EINE Maßnahme an", async () => {
    await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    stores["/Blattwerk/App/Baumkataster/12.json"] = JSON.stringify({
      ...JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]),
      baeume: { "B-0001": { nr: "B-0001", art: "Quercus robur", status: "aktiv", massnahmen: [], kontrollen: [] } },
    });
    const vorgang = { kundeId: 12, nr: "B-0001", vorgangId: "bkv-m1", massnahme: { art: "Kronenpflege", dringlichkeit: "langfristig", datum: "2026-09-16" } };
    const erste = await ruf("/api/nc/baumkataster/massnahme/save", vorgang);
    const zweite = await ruf("/api/nc/baumkataster/massnahme/save", vorgang);
    expect(erste.code).toBe(200); expect(zweite.code).toBe(200);
    expect(zweite.body.massnahme.id).toBe(erste.body.massnahme.id);
    const massnahmen = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].massnahmen;
    expect(massnahmen).toHaveLength(1);
  });

  it("massnahme/save: ohne vorgangId (Altbestand) bleibt es additiv wie bisher", async () => {
    await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });
    stores["/Blattwerk/App/Baumkataster/12.json"] = JSON.stringify({
      ...JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]),
      baeume: { "B-0001": { nr: "B-0001", art: "Quercus robur", status: "aktiv", massnahmen: [], kontrollen: [] } },
    });
    const vorgang = { kundeId: 12, nr: "B-0001", massnahme: { art: "Kronenpflege", dringlichkeit: "langfristig", datum: "2026-09-16" } };
    await ruf("/api/nc/baumkataster/massnahme/save", vorgang);
    await ruf("/api/nc/baumkataster/massnahme/save", vorgang);
    expect(JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume["B-0001"].massnahmen).toHaveLength(2);
  });

  it("Ende-zu-Ende: Warteschlange trifft echte Endpunkte — ein 'Absturz' nach der Serverannahme, bevor irgendetwas persistiert wurde, sendet beim Neustart die UNVERÄNDERTE Warteschlange erneut, ohne dass Baum, Kontrolle oder Maßnahme doppelt im Store landen", async () => {
    const senden = async (pfad, koerper) => {
      const res = await ruf(pfad, koerper);
      return { status: res.code, daten: res.body };
    };
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, lokalId: "lok-1", nutzlast: { baum: { art: "Quercus robur" } } });
    const { liste: l2 } = bkEinreihen(l1, {
      typ: "kontrolle", kundeId: 12, lokalId: "lok-1",
      nutzlast: { nr: null, kontrolle: { datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja", befund: {}, bemerkung: "" } },
    });
    const { liste: warteschlange } = bkEinreihen(l2, {
      typ: "massnahme", kundeId: 12, lokalId: "lok-1",
      nutzlast: { nr: null, massnahme: { kontrolleId: null, art: "Kronenpflege", dringlichkeit: "langfristig", datum: "2026-09-16" } },
    });

    // Lauf 1: alle drei Vorgänge kommen beim Server an (200), aber NICHTS wird
    // persistiert — kein `speichern`-Rückruf, wie bei einem Absturz, der
    // keine Zeile mehr in den Gerätespeicher schreiben lässt.
    const lauf1 = await bkNachtragen(warteschlange, { senden });
    expect(lauf1.rest).toEqual([]);

    // Lauf 2 ("Neustart"): dieselbe, NICHT geschrumpfte Warteschlange erneut —
    // das ist die einzige Kopie, die es je auf dem Gerät gab.
    const lauf2 = await bkNachtragen(warteschlange, { senden });
    expect(lauf2.rest).toEqual([]);

    const baeume = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume;
    expect(Object.keys(baeume)).toHaveLength(1);          // genau EIN Baum
    const baum = Object.values(baeume)[0];
    expect(baum.kontrollen).toHaveLength(1);               // genau EINE Kontrolle
    expect(baum.massnahmen).toHaveLength(1);               // genau EINE Maßnahme
  });
});
