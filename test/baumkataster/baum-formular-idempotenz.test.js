// Idempotenz-Nachtrag zu wizard-speicherkette.test.js (18.09.2026): `baumSpeichern`
// (BaumkatasterPage.jsx, "Baum anlegen/bearbeiten") hat denselben Aufbau wie der
// Kontroll-Wizard — online versuchen, bei Fehlschlag in die Warteschlange
// einreihen —, hatte aber KEINE vorgangId auf dem Online-Weg. Anders als der
// Wizard besitzt `baumSpeichern` gar keinen In-Memory-Merker, den ein
// Absturz "verlieren" könnte: es ist ein einzelner Aufruf, kein mehrstufiger
// Ablauf mit Teilausfall. Das Risiko ist deshalb schlicht: derselbe
// Formularzustand (dieselbe `vorgangId`, vom Formular beim Öffnen vergeben und
// über jeden Klick hinweg gleich) wird zweimal abgeschickt, weil die Antwort
// des ersten Versuchs nie ankam. Ohne Kennung legt der zweite Versuch einen
// zweiten Baum an.
//
// Technik: dieselbe vm-Ausschnitt-Technik wie in wizard-speicherkette.test.js,
// aber ohne den useState/useRef-Fake — `baumSpeichern` ist eine gewöhnliche
// Closure ohne eigene Hooks, ihre freien Variablen (kundeVon, auswahl, creds,
// me, ncPost, storeSetzen, showToast, setLetzterKunde, setAuswahl, einreihen)
// kommen direkt als Sandbox-Bindungen. Kein Produktionscode wird verändert.
// `ncPost` läuft hier gegen den ECHTEN Server (register() gegen einen
// Fake-Nextcloud-Store, wie in server.test.js), damit die Prüfung auf dem
// STORE steht, nicht nur auf einem Aufrufzähler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { bkNormalisieren } from "../../src/baumkataster.js";
import { bkVorgangId } from "../../src/baumkataster-offline.js";
import { register } from "../../src/server/baumkataster.mjs";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const src = fs.readFileSync(path.join(process.cwd(), "src/ui/BaumkatasterPage.jsx"), "utf8");
const von = "const baumSpeichern = async (f) => {";
const bis = "const positionSetzen = async (lat, lon) => {";
const a = src.indexOf(von);
const b = src.indexOf(bis, a);
if (a < 0 || b < 0) throw new Error("baumSpeichern-Grenzen nicht gefunden");
const quelle = src.slice(a, b);

/** Baut `baumSpeichern` mit den übergebenen Ersatz-Bindungen für seine freien Variablen. */
function baumSpeichernBauen(bindungen) {
  const sandbox = { bkCacheSchreiben: () => {}, bkNormalisieren, localStorage: undefined, console, ...bindungen };
  vm.createContext(sandbox);
  return vm.runInContext(quelle + "\n(function(){ return baumSpeichern; })()", sandbox);
}

/** Gefälschter Express + gefälschter Nextcloud-Store — Nachbau aus server.test.js, nur so viel wie hier gebraucht wird. */
function serverAufbauen() {
  const stores = {};
  // Reicht wache jetzt als zweites Argument mit (funktionWache, server.mjs) —
  // die Attrappe nimmt deshalb das LETZTE app.post-Argument als eigentlichen
  // Handler, statt des Zweiten. Diese Tests pruefen den Handler direkt, ohne
  // die Middleware-Kette (die hat funktionen-server.test.js).
  const app = { routen: {}, post(p, ...fns) { this.routen[p] = fns[fns.length - 1]; } };
  const ctx = {
    ncBody: (req) => req.body, ssoUser: () => "max", authHeader: () => "Basic x",
    ncFilesBase: (server, user) => `${server}/remote.php/dav/files/${user}`,
    ncPfad: (p) => String(p).split("/").map(encodeURIComponent).join("/"),
    mandantJetzt: () => MANDANT_STANDARD,
    ORDNER: "Blattwerk", ORDNER_URL: "/Blattwerk", assertOrdner: async () => {},
    APP_DIR: "/Blattwerk/App",
    appStoreLesen: async (s, u, p, pfad, leer, norm) => {
      const roh = stores[pfad] ? JSON.parse(stores[pfad]) : JSON.parse(JSON.stringify(leer));
      return { store: norm ? norm(roh) : roh, etag: stores[pfad] ? '"1"' : null };
    },
    appStoreSchreiben: async (s, u, p, pfad, store, etag) => { stores[pfad] = JSON.stringify(store); return { status: etag ? 204 : 201 }; },
  };
  register(app, ctx);
  const antwort = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (bd) => { r.body = bd; return r; };
    return r;
  };
  const req = (body) => ({ body: { server: "https://nc", user: "u", pass: "p", ...body }, socket: {}, headers: {} });
  const ruf = async (pfad, body) => { const res = antwort(); await app.routen[pfad](req(body), res); return res; };
  // `baumSpeichern` erwartet ein fetch-Response-artiges Objekt von `ncPost`.
  const ncPost = async (pfad, body) => {
    const res = await ruf(pfad, body);
    return { status: res.code, ok: res.code >= 200 && res.code < 300, json: async () => res.body };
  };
  return { ncPost, stores };
}

describe("baumSpeichern: Idempotenz bei Neuanlage (18.09.2026)", () => {
  beforeEach(() => {
    // storeAendern (server/baumkataster.mjs) prüft vor JEDEM Schreiben den
    // Blattwerk-Ordner und die Ordnerkette per echtem `fetch` (MKCOL) — ohne
    // Stub würde das gegen echtes Netz laufen bzw. hier hart scheitern.
    vi.stubGlobal("fetch", vi.fn(async (_url, init = {}) =>
      (init.method === "MKCOL" ? { status: 405, ok: false } : { status: 200, ok: true })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("zwei Sendeversuche mit demselben Formularzustand (gleiche vorgangId, z. B. weil die Antwort des ersten Versuchs nie ankam) legen nur EINEN Baum an", async () => {
    const { ncPost, stores } = serverAufbauen();
    const einreihen = vi.fn();   // beide Versuche sollen online durchgehen — einreihen darf nicht fallen
    const baumSpeichern = baumSpeichernBauen({
      ncPost, einreihen,
      kundeVon: () => ({ name: "Schlosspark GmbH" }),
      auswahl: null, creds: { server: "https://nc", user: "u", pass: "p" }, me: { login: "max" },
      storeSetzen: vi.fn(), setLetzterKunde: vi.fn(), showToast: vi.fn(), setAuswahl: vi.fn(),
    });

    // Formularzustand, wie `BaumForm` ihn beim Öffnen aufbaut: EINE vorgangId
    // über beide Klicks hinweg (kein Remount des Formulars zwischen ihnen).
    const f = { kundeId: "12", art: "Quercus robur", artDe: "Stieleiche", vorgangId: bkVorgangId() };

    const r1 = await baumSpeichern(f);
    const r2 = await baumSpeichern(f);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(einreihen).not.toHaveBeenCalled();
    const baeume = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume;
    expect(Object.keys(baeume)).toHaveLength(1);
  });

  it("reicht die vorgangId beim Umschwenken in die Warteschlange weiter, statt sie zu verlieren", async () => {
    const einreihen = vi.fn();
    const ncPost = async () => { throw new Error("Netzwerk weg"); };   // Online-Versuch scheitert immer
    const baumSpeichern = baumSpeichernBauen({
      ncPost, einreihen,
      kundeVon: () => ({ name: "Schlosspark GmbH" }),
      auswahl: null, creds: { server: "https://nc", user: "u", pass: "p" }, me: { login: "max" },
      storeSetzen: vi.fn(), setLetzterKunde: vi.fn(), showToast: vi.fn(), setAuswahl: vi.fn(),
    });
    const f = { kundeId: "12", art: "Quercus robur", artDe: "Stieleiche", vorgangId: bkVorgangId() };
    const r = await baumSpeichern(f);
    expect(r).toBe("eingereiht");
    expect(einreihen).toHaveBeenCalledTimes(1);
    expect(einreihen.mock.calls[0][0].vorgangId).toBe(f.vorgangId);
  });

  it("ohne vorgangId (Altbestand-Verhalten, z. B. ein Aufrufer wie die Kartentipp-Positionskorrektur mit fester nr) bleibt der Server unbeeinflusst — hier: zwei Neuanlagen ohne Kennung legen zwei Bäume an", async () => {
    const { ncPost, stores } = serverAufbauen();
    const einreihen = vi.fn();
    const baumSpeichern = baumSpeichernBauen({
      ncPost, einreihen,
      kundeVon: () => ({ name: "Schlosspark GmbH" }),
      auswahl: null, creds: { server: "https://nc", user: "u", pass: "p" }, me: { login: "max" },
      storeSetzen: vi.fn(), setLetzterKunde: vi.fn(), showToast: vi.fn(), setAuswahl: vi.fn(),
    });
    const f = { kundeId: "12", art: "Quercus robur", artDe: "Stieleiche" };   // keine vorgangId
    await baumSpeichern(f);
    await baumSpeichern(f);
    const baeume = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume;
    expect(Object.keys(baeume)).toHaveLength(2);
  });
});
