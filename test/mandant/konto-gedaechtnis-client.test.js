// Nachtrag zu Task 8 (Mandantenfähigkeit): die Server-Endpunkte
// (GET/POST /api/konto/gedaechtnis) hatten zunächst keinen Aufrufer aus der
// App — dieser Test sichert die client-seitige Anbindung
// (src/konto-gedaechtnis-client.js) und danach, dass dolibarr-app.jsx sie
// tatsächlich an den drei Buchungskonto-Stellen benutzt (Text-Prüfung, weil
// die App-Datei JSX ist und sich nicht importieren lässt — gleiches Muster
// wie test/mandant/bloecke-app.test.js).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  kontoMemAusCache, kontoMemMerken, kontoMemMischen, kontoMemAbgleichen,
} from "../../src/konto-gedaechtnis-client.js";

const mockLocalStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe("Konto-Gedächtnis mischen (reine Funktion)", () => {
  it("Server gewinnt bei gleichem Schlüssel — er fasst zusammen, was alle Geräte dieser Firma gebucht haben", () => {
    const lokal = { "101": "4530", "102": "3300" };
    const server = { "101": "4985", "103": "4900" };
    expect(kontoMemMischen(lokal, server)).toEqual({ "101": "4985", "102": "3300", "103": "4900" });
  });

  it("ohne Serverstand bleibt der lokale Stand unverändert", () => {
    const lokal = { "101": "4530" };
    expect(kontoMemMischen(lokal, {})).toEqual(lokal);
    expect(kontoMemMischen(lokal, null)).toEqual(lokal);
  });

  it("ohne lokalen Stand kommt reiner Serverstand durch", () => {
    expect(kontoMemMischen(null, { "101": "4530" })).toEqual({ "101": "4530" });
  });
});

describe("Konto-Gedächtnis Client (localStorage + Server)", () => {
  beforeEach(() => { globalThis.localStorage = mockLocalStorage(); });

  it("merkt sofort lokal, auch bevor der Server geantwortet hat", () => {
    let resolveFetch;
    globalThis.fetch = () => new Promise((res) => { resolveFetch = res; });
    kontoMemMerken(101, "4985");
    // Synchron nach dem Aufruf, ohne auf den (hier absichtlich hängenden)
    // Server-Ruf zu warten — ein Beleg darf nie auf das Netz warten müssen.
    expect(kontoMemAusCache()).toEqual({ "101": "4985" });
    resolveFetch?.({ ok: true, json: async () => ({}) });
  });

  it("schickt Artikel und (falls vorhanden) Lieferant an den Server", async () => {
    let gesendet = null;
    globalThis.fetch = async (url, opts) => { gesendet = { url, body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({}) }; };
    kontoMemMerken(101, "4985", "Forstbedarf Müller");
    await new Promise((r) => setTimeout(r, 0)); // ein Tick, bis das beiläufige fetch() lief
    expect(gesendet.url).toBe("/api/konto/gedaechtnis");
    expect(gesendet.body).toEqual({ artikel: "101", konto: "4985", lieferant: "Forstbedarf Müller" });
  });

  it("ein fehlgeschlagener Server-Schreibvorgang verliert den lokalen Wert nicht", async () => {
    globalThis.fetch = async () => { throw new Error("kein Netz"); };
    kontoMemMerken(101, "4985");
    await new Promise((r) => setTimeout(r, 0));
    expect(kontoMemAusCache()).toEqual({ "101": "4985" });
  });

  it("gleicht mit dem Server ab und mischt Server über lokal (Server gewinnt)", async () => {
    globalThis.localStorage.setItem("blattwerk_konto_mem", JSON.stringify({ "101": "4530", "102": "3300" }));
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ lieferant: {}, artikel: { "101": "4985", "103": "4900" } }) });
    const g = await kontoMemAbgleichen();
    expect(g).toEqual({ "101": "4985", "102": "3300", "103": "4900" });
    expect(kontoMemAusCache()).toEqual(g); // gemischter Stand wird auch persistiert
  });

  it("ohne Netz/Server bleibt der lokale Stand als Fallback stehen (Abgleich blockiert nichts)", async () => {
    globalThis.localStorage.setItem("blattwerk_konto_mem", JSON.stringify({ "101": "4530" }));
    globalThis.fetch = async () => { throw new Error("offline"); };
    const g = await kontoMemAbgleichen();
    expect(g).toEqual({ "101": "4530" });
  });

  it("ein HTTP-Fehler vom Server zählt genauso als Fehlschlag wie ein Netzfehler", async () => {
    globalThis.localStorage.setItem("blattwerk_konto_mem", JSON.stringify({ "101": "4530" }));
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const g = await kontoMemAbgleichen();
    expect(g).toEqual({ "101": "4530" });
  });

  it("ein 403 (nicht als Authentik-Nutzer erkannt, z. B. Proxy-Ausfall) fällt genauso auf den lokalen Stand zurück — keine Fehlermeldung, kein blockierter Beleg", async () => {
    globalThis.localStorage.setItem("blattwerk_konto_mem", JSON.stringify({ "101": "4530" }));
    globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: "kein Authentik-Nutzer erkennbar" }) });
    const g = await kontoMemAbgleichen();
    expect(g).toEqual({ "101": "4530" });
  });
});

describe("Verdrahtung in dolibarr-app.jsx", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");

  it("importiert das Konto-Gedächtnis-Modul", () => {
    expect(src).toMatch(/from ["']\.\/src\/konto-gedaechtnis-client\.js["']/);
    expect(src).toMatch(/kontoMemMerken/);
    expect(src).toMatch(/kontoMemAbgleichen/);
  });

  it("rememberKonto/loadKontoMemory delegieren an das Modul, statt nur noch localStorage direkt zu benutzen", () => {
    // Die alten Namen bleiben (drei Stellen lesen synchron per useRef beim
    // Mount) — sie müssen aber auf die neuen Funktionen zeigen, sonst bleibt
    // der Server-Endpunkt ungenutzt.
    expect(src).toMatch(/const loadKontoMemory\s*=\s*kontoMemAusCache/);
    expect(src).toMatch(/const rememberKonto\s*=\s*\([^)]*\)\s*=>\s*kontoMemMerken\(/);
  });

  it("gleicht das Konto-Gedächtnis nach dem Laden mit dem Server ab (mind. an den drei bisherigen useRef-Stellen)", () => {
    const stellen = [...src.matchAll(/useRef\(loadKontoMemory\(\)\)/g)];
    expect(stellen.length).toBeGreaterThanOrEqual(3);
    const abgleichAufrufe = [...src.matchAll(/kontoMemAbgleichen\(\)/g)];
    expect(abgleichAufrufe.length).toBeGreaterThanOrEqual(stellen.length);
  });
});
