// test/idb/idb.test.js
// src/idb.js — kleine, bewusst allgemeine IndexedDB-Helfer fuer binaere
// Anhaenge (PDF-Blobs hier, Kataster-Fotos im Nachbarzweig). Kein jsdom
// (vite.config.js: environment "node") und kein IndexedDB-Paket im Projekt —
// deshalb eine handgeschriebene Mini-Attrappe, injiziert ueber
// `globalThis.indexedDB`, wie es die Anweisung fuer diesen Zweig verlangt.
// Die Attrappe deckt nur ab, was idb.js wirklich benutzt (open/upgrade,
// eine Transaktion, put/get/delete/getAllKeys) — kein vollstaendiges
// IndexedDB, das braucht es hier nicht.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { idbHolen, idbLoeschen, idbSchluessel, idbSetzen } from "../../src/idb.js";

function fakeIndexedDb() {
  const datenbanken = new Map(); // dbName -> Map(speicherName -> Map(schluessel -> wert))
  return {
    open(name) {
      const anfrage = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (!datenbanken.has(name)) datenbanken.set(name, new Map());
        const speicherMap = datenbanken.get(name);
        const result = {
          objectStoreNames: { contains: (n) => speicherMap.has(n) },
          createObjectStore(n) { speicherMap.set(n, new Map()); },
          transaction(speicherName) {
            const laden = speicherMap.get(speicherName);
            transaktionen++;
            const tx = { oncomplete: null, onerror: null };
            // Eine echte Transaktion meldet EINMAL fertig, nicht je Schreibvorgang —
            // sonst koennte der Test „mehrere Eintraege, eine Transaktion" nicht
            // zwischen einer und N Transaktionen unterscheiden.
            let angemeldet = false;
            const fertig = () => { if (angemeldet) return; angemeldet = true; queueMicrotask(() => tx.oncomplete?.()); };
            const store = {
              put(wert, schluessel) { laden.set(schluessel, wert); fertig(); },
              delete(schluessel) { laden.delete(schluessel); fertig(); },
              get(schluessel) {
                const req = { result: laden.get(schluessel) ?? null, onsuccess: null, onerror: null };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
              getAllKeys() {
                const req = { result: [...laden.keys()], onsuccess: null, onerror: null };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
            };
            tx.objectStore = () => store;
            return tx;
          },
        };
        anfrage.result = result;
        anfrage.onupgradeneeded?.();
        anfrage.onsuccess?.();
      });
      return anfrage;
    },
  };
}

let alt;
let transaktionen = 0;
beforeEach(() => { alt = globalThis.indexedDB; transaktionen = 0; globalThis.indexedDB = fakeIndexedDb(); });
afterEach(() => { globalThis.indexedDB = alt; });

describe("idbSetzen/idbHolen/idbLoeschen/idbSchluessel", () => {
  it("legt einen Wert ab und liest ihn zurueck", async () => {
    await idbSetzen("blattwerk", "gbu-pdf", "gbu-1", { inhalt: "eins" });
    expect(await idbHolen("blattwerk", "gbu-pdf", "gbu-1")).toEqual({ inhalt: "eins" });
  });

  it("liefert null fuer einen unbekannten Schluessel", async () => {
    expect(await idbHolen("blattwerk", "gbu-pdf", "unbekannt")).toBeNull();
  });

  it("idbSchluessel listet alle abgelegten Schluessel", async () => {
    await idbSetzen("blattwerk", "gbu-pdf", "a", 1);
    await idbSetzen("blattwerk", "gbu-pdf", "b", 2);
    expect((await idbSchluessel("blattwerk", "gbu-pdf")).sort()).toEqual(["a", "b"]);
  });

  it("idbLoeschen entfernt genau den einen Schluessel", async () => {
    await idbSetzen("blattwerk", "gbu-pdf", "a", 1);
    await idbSetzen("blattwerk", "gbu-pdf", "b", 2);
    await idbLoeschen("blattwerk", "gbu-pdf", "a");
    expect(await idbSchluessel("blattwerk", "gbu-pdf")).toEqual(["b"]);
    expect(await idbHolen("blattwerk", "gbu-pdf", "a")).toBeNull();
  });

  it("zwei verschiedene Speicher in derselben Datenbank bleiben getrennt", async () => {
    await idbSetzen("blattwerk", "gbu-pdf", "x", "gbu");
    await idbSetzen("blattwerk", "kataster-fotos", "x", "foto");
    expect(await idbHolen("blattwerk", "gbu-pdf", "x")).toBe("gbu");
    expect(await idbHolen("blattwerk", "kataster-fotos", "x")).toBe("foto");
  });
});

describe("Sammelform (aus der zusammengefuehrten Kataster-Fassung)", () => {
  // Die Fotos einer Kontrolle wurden immer gemeinsam geschrieben. Eine Huelle,
  // die daraus N Einzeltransaktionen macht, schafft N Gelegenheiten, auf halbem
  // Weg stehenzubleiben — deshalb wird hier wirklich gezaehlt.
  it("schreibt mehrere Eintraege in EINER Transaktion", async () => {
    await idbSetzen("blattwerk-bk-fotos", "fotos", [
      { schluessel: "a", wert: "eins" },
      { schluessel: "b", wert: "zwei" },
      { schluessel: "c", wert: "drei" },
    ]);
    const vorher = transaktionen;
    expect(await idbHolen("blattwerk-bk-fotos", "fotos", ["a", "b", "c"])).toEqual(["eins", "zwei", "drei"]);
    // Ein Schreibvorgang fuer drei Eintraege, ein Lesevorgang fuer drei Schluessel.
    expect(vorher).toBe(1);
  });

  it("liest eine Liste in derselben Reihenfolge, Fehlendes als null", async () => {
    await idbSetzen("blattwerk-bk-fotos", "fotos", { schluessel: "x", wert: "da" });
    expect(await idbHolen("blattwerk-bk-fotos", "fotos", ["x", "fehlt", "x"])).toEqual(["da", null, "da"]);
  });

  it("loescht mehrere Schluessel in EINER Transaktion", async () => {
    await idbSetzen("blattwerk-bk-fotos", "fotos", [
      { schluessel: "a", wert: 1 }, { schluessel: "b", wert: 2 },
    ]);
    const vorher = transaktionen;
    await idbLoeschen("blattwerk-bk-fotos", "fotos", ["a", "b"]);
    expect(transaktionen - vorher).toBe(1);
    expect(await idbSchluessel("blattwerk-bk-fotos", "fotos")).toEqual([]);
  });

  it("nimmt beide Schreibformen entgegen", async () => {
    await idbSetzen("db", "s", "einzeln", "wert1");
    await idbSetzen("db", "s", { schluessel: "objekt", wert: "wert2" });
    expect(await idbHolen("db", "s", "einzeln")).toBe("wert1");
    expect(await idbHolen("db", "s", "objekt")).toBe("wert2");
  });
});
