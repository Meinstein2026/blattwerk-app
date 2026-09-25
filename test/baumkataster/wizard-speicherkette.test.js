// Echter Verhaltenstest der Wizard-Speicherkette (Ruling R12, zusätzlich zu
// Important 2): zweiter Speicherversuch nach Teilausfall legt weder eine
// zweite Kontrolle noch eine zweite Maßnahme an, und der an onGespeichert
// übergebene Store enthält die schon gespeicherte Maßnahme. Die bisherigen
// Wizard-Tests (test/baumkataster/verdrahtung.test.js) sind reine
// Quelltextmuster und konnten das strukturell nicht sehen.
//
// Technik: KontrolleWizard ist eine gewöhnliche Funktion mit React-Hooks,
// keine JSX-Datei mit isolierbaren reinen Funktionen wie beim Angebot
// (test/angebot/bearbeiten.test.js) — deshalb wird hier zusätzlich zur
// vm-Ausschnitt-Technik ein winziges Fake für useState/useRef/useEffect
// gebaut: useState/useRef legen ihren Wert in einem Slot-Speicher ab, der
// über mehrere "Render"-Aufrufe (= mehrere KontrolleWizard(props)-Aufrufe
// mit frischem vm-Kontext, aber demselben Slot-Speicher) hinweg bestehen
// bleibt — genau wie echte Refs zwischen echten Renders. Die JSX-Rückgabe
// wird durch eine schlichte Objekt-Rückgabe ersetzt (kein Rendering, kein
// DOM). Kein Produktionscode wird dafür verändert.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { bkNaechsteKontrolle } from "../../src/baumkataster.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";
import { BK_BEFUND } from "../../src/baumkataster-data.js";
import { bkVorgangId } from "../../src/baumkataster-offline.js";
import { register } from "../../src/server/baumkataster.mjs";

const src = fs.readFileSync(path.join(process.cwd(), "src/ui/BaumkatasterPage.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
const personNameSrc = schnitt("const personName =", "\n");
const wizardVon = src.indexOf("function KontrolleWizard(");
const rueckgabeAb = src.indexOf('return (\n    <div className="modal-backdrop"', wizardVon);
if (wizardVon < 0 || rueckgabeAb < 0) throw new Error("KontrolleWizard-Grenzen nicht gefunden");
// Statt des Modals (JSX) gibt die Funktion hier genau das zurück, was der
// Test braucht: die Speicherfunktion und die beiden Setter, mit denen der
// Test denselben Weg geht wie eine Person am Gerät ("Entfernen"-Knopf). `k`
// und `massnahmen` zusätzlich (Idempotenz-Nachtrag, 18.09.2026): so kann ein
// Test die vergebene `vorgangId` auslesen bzw. — um einen App-Neustart
// zwischen Serverannahme und Verarbeitung nachzustellen — die beiden Merker
// zurücksetzen, ohne den Entwurf (und damit die Kennungen) zu verlieren.
const wizardKoerper = src.slice(wizardVon, rueckgabeAb)
  + "return { speichern, set, setMassnahmen, k, massnahmen, gespeicherteKontrolleRef, gespeicherteMassnahmenRef };\n}\n";
const quelle = personNameSrc + "\n" + wizardKoerper;

/** Baut einen Slot-Speicher (persistiert über mehrere "Renders") und eine render()-Funktion. */
function wizardAufbauen(ncJson) {
  const slots = {};
  const render = (props) => {
    let idx = 0;
    const useState = (init) => {
      idx += 1; const key = "h" + idx;
      if (!(key in slots)) slots[key] = typeof init === "function" ? init() : init;
      return [slots[key], (v) => { slots[key] = typeof v === "function" ? v(slots[key]) : v; }];
    };
    const useRef = (init) => {
      idx += 1; const key = "h" + idx;
      if (!(key in slots)) slots[key] = { current: init };
      return slots[key];
    };
    const useEffect = () => {}; // positionErmitteln wird dadurch nie aufgerufen — hier nicht gebraucht.
    const sandbox = { useState, useRef, useEffect, bkNaechsteKontrolle, BK_BEFUND, bkVorgangId, ncJson, props, console };
    vm.createContext(sandbox);
    return vm.runInContext(quelle + "\n(function(){ return KontrolleWizard(props); })()", sandbox);
  };
  return { render, slots };
}

const BAUM = { nr: "B-0001", altersphase: "Reifephase" };
const KUNDE = { id: 12, name: "Schlosspark GmbH" };
const CREDS = { server: "https://nc", user: "u", pass: "p" };
const ME = { login: "max", firstname: "Max", lastname: "M" };
const M1 = { art: "Kronenpflege", dringlichkeit: "kurzfristig", faelligBis: "2026-10-01", bemerkung: "", aufgabe: false };
const M2 = { art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "2026-10-01", bemerkung: "", aufgabe: false };

describe("Wizard-Speicherkette bei Teilausfall (R12)", () => {
  it("legt bei erneutem Speichern weder Kontrolle noch Maßnahme doppelt an, und der Store an onGespeichert enthält die schon gespeicherte Maßnahme", async () => {
    const KONTROLLE_ANTWORT = { ok: true, kontrolle: { id: "k-1" }, store: { baeume: { "B-0001": { nr: "B-0001", kontrollen: [{ id: "k-1" }], massnahmen: [] } } } };
    const M1_ANTWORT = { ok: true, massnahme: { id: "m-1", art: "Kronenpflege" }, store: { baeume: { "B-0001": { nr: "B-0001", kontrollen: [{ id: "k-1" }], massnahmen: [{ id: "m-1", art: "Kronenpflege" }] } } } };
    let m2Scheitert = true;
    const anrufe = [];
    const ncJson = vi.fn(async (pfad, body) => {
      if (pfad === "/api/nc/baumkataster/kontrolle/save") { anrufe.push("kontrolle/save"); return KONTROLLE_ANTWORT; }
      if (pfad === "/api/nc/baumkataster/massnahme/save") {
        anrufe.push("massnahme/save:" + body.massnahme.art);
        if (body.massnahme.art === "Totholzentfernung" && m2Scheitert) throw new Error("Netzwerk weg");
        return M1_ANTWORT;
      }
      throw new Error("unerwarteter Pfad " + pfad);
    });
    const onGespeichert = vi.fn();
    const showToast = vi.fn();
    const props = { baum: BAUM, creds: CREDS, kunde: KUNDE, me: ME, api: null, heute: "2026-09-16", onClose: () => {}, onGespeichert, showToast };
    const { render } = wizardAufbauen(ncJson);

    // 1. Render: Standardzustand holen, dann Unterschrift + zwei Maßnahmen
    //    setzen (entspricht dem Ausfüllen der Wizard-Schritte).
    const r1 = render(props);
    r1.set("unterschrift", "data:image/png;base64,AA==");
    r1.setMassnahmen([M1, M2]);

    // 2. Render mit dem gesetzten Stand: erster Speicherversuch — Maßnahme 1
    //    klappt, Maßnahme 2 scheitert (Teilausfall), Modal bleibt offen.
    const r2 = render(props);
    await r2.speichern();
    expect(onGespeichert).not.toHaveBeenCalled();
    expect(anrufe).toEqual(["kontrolle/save", "massnahme/save:Kronenpflege", "massnahme/save:Totholzentfernung"]);

    // 3. Person entfernt Maßnahme 2 ("Entfernen") und speichert erneut.
    const r3 = render(props);
    r3.setMassnahmen([M1]);
    const r4 = render(props);
    await r4.speichern();

    // Weder die Kontrolle noch Maßnahme 1 wurden ein zweites Mal angelegt …
    expect(anrufe).toEqual(["kontrolle/save", "massnahme/save:Kronenpflege", "massnahme/save:Totholzentfernung"]);
    // … und der an onGespeichert übergebene Store zeigt Maßnahme 1 — nicht
    // den Stand von VOR der Maßnahme (das war genau Important 2).
    expect(onGespeichert).toHaveBeenCalledTimes(1);
    expect(onGespeichert).toHaveBeenCalledWith(M1_ANTWORT);
  });
});

// Idempotenz-Nachtrag (18.09.2026): der In-Memory-Merker (Ruling R12 oben)
// hilft nur innerhalb DERSELBEN Komponenteninstanz. Räumt Android die
// WebView-Activity zwischen Serverantwort und Verarbeitung ab — oder lädt
// der Browser die Seite neu —, sind die Refs weg, obwohl die Kontrolle beim
// Server längst angenommen wurde. Anders als oben läuft `ncJson` hier gegen
// die ECHTEN Endpunkte (kleiner Nachbau des Fakes aus server.test.js, mit
// echtem Store statt kanonischer Antworten) — nur so lässt sich zeigen, dass
// im STORE eine einzige Kontrolle steht, nicht nur, dass ein Zähler stimmt.
describe("Idempotenz bei verlorenem Merker (18.09.2026)", () => {
  const antwort = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
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
    const req = (body) => ({ body: { server: "https://nc", user: "u", pass: "p", ...body }, socket: {}, headers: {} });
    const ruf = async (pfad, body) => { const res = antwort(); await app.routen[pfad](req(body), res); return res; };
    const ncJson = async (pfad, body) => {
      const res = await ruf(pfad, body);
      if (res.code !== 200) { const e = new Error(res.body?.error || "Fehler"); e.status = res.code; throw e; }
      return res.body;
    };
    return { ruf, ncJson, stores };
  }

  it("Kontrolle online gespeichert, Server hat angenommen, Merker verloren (Refs zurückgesetzt), erneut gesendet → im Store steht EINE Kontrolle und EINE Maßnahme", async () => {
    const { ruf, ncJson, stores } = serverAufbauen();
    vi.stubGlobal("fetch", vi.fn(async (_url, init = {}) =>
      (init.method === "MKCOL" ? { status: 405, ok: false } : { status: 200, ok: true })));
    try {
      await ruf("/api/nc/baumkataster/baum/save", { kundeId: 12, baum: { art: "Quercus robur" } });

      const onGespeichert = vi.fn();
      const showToast = vi.fn();
      const props = { baum: BAUM, creds: CREDS, kunde: KUNDE, me: ME, api: null, heute: "2026-09-16", onClose: () => {}, onGespeichert, showToast };
      const { render } = wizardAufbauen(ncJson);

      // Entwurf ausfüllen — `massnahmeDazu` gäbe der Maßnahme ihre vorgangId
      // beim Hinzufügen; das hier bildet dieselbe Situation direkt nach.
      const r1 = render(props);
      r1.set("unterschrift", "data:image/png;base64,AA==");
      r1.setMassnahmen([{ ...M1, vorgangId: bkVorgangId() }]);

      // 1. Versuch: klappt vollständig, Server hat Kontrolle UND Maßnahme.
      const r2 = render(props);
      await r2.speichern();
      expect(onGespeichert).toHaveBeenCalledTimes(1);

      // "Merker verloren": die Refs zurückgesetzt, wie nach einem Neustart der
      // Komponente — der Entwurf (k.vorgangId, m.vorgangId) bleibt im selben
      // Slot-Speicher unangetastet stehen, weil er (heute) genau da lebt.
      r2.gespeicherteKontrolleRef.current = null;
      r2.gespeicherteMassnahmenRef.current = new Set();

      // 2. Versuch: derselbe Klick auf "Speichern" — ohne die vorgangId würde
      // hier eine zweite Kontrolle samt zweiter Maßnahme entstehen.
      const r3 = render(props);
      await r3.speichern();

      const baeume = JSON.parse(stores["/Blattwerk/App/Baumkataster/12.json"]).baeume;
      expect(Object.keys(baeume)).toHaveLength(1);
      const baum = Object.values(baeume)[0];
      expect(baum.kontrollen).toHaveLength(1);
      expect(baum.massnahmen).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
