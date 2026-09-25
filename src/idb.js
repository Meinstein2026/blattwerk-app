// Kleine, bewusst allgemeine IndexedDB-Mechanik für binäre Anhänge, die nicht
// in den localStorage dürfen (Kontingent!): Kontroll-Fotos des Baumkatasters
// und das Vor-Ort-PDF der Gefährdungsbeurteilung. Beide Bereiche entstanden
// parallel und brachten je eine eigene Fassung mit; das hier ist die
// zusammengeführte (18.09.2026).
//
// Datenbankname und Objektspeicher sind PARAMETER, nicht fest verdrahtet —
// das unterscheidet diese Datei von `src/offline/db.js`, das auf EINE feste
// Datenbank mit festem Schema verdrahtet ist und hier bewusst nicht angefasst
// wird. `src/idb.js` ist die Grundschicht darunter, kein Ersatz dafür.
//
// **Rohes IndexedDB statt des vorhandenen `idb`-Pakets**, obwohl das Paket im
// Projekt liegt: Die Tests laufen ohne jsdom (`vite.config.js`, environment
// „node"), es gibt also gar keine echte IndexedDB. `idb` bindet sich fest an
// `globalThis.indexedDB`; hier wird die Fabrik bei JEDEM Aufruf frisch
// gelesen, damit Tests in jedem `beforeEach` eine Attrappe setzen können.
//
// ⚠️ `onupgradeneeded` läuft nur beim ERSTEN Öffnen einer Kombination aus
// Datenbankname und Version. Wer einen neuen Objektspeicher in einer bereits
// bestehenden Datenbank anlegen will, braucht deshalb einen eigenen
// Datenbanknamen — sonst wird der Speicher still nicht erzeugt. Deshalb
// benutzen Kataster-Fotos und GBU-PDFs getrennte Datenbanken.

function oeffnen(db, speicher) {
  return new Promise((resolve, reject) => {
    const fabrik = globalThis.indexedDB;
    if (!fabrik) { reject(new Error("Kein IndexedDB verfuegbar")); return; }
    const anfrage = fabrik.open(db, 1);
    anfrage.onupgradeneeded = () => {
      if (!anfrage.result.objectStoreNames.contains(speicher)) anfrage.result.createObjectStore(speicher);
    };
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error || new Error("IndexedDB: Öffnen fehlgeschlagen"));
  });
}

const abschliessen = (tx, was) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error("IndexedDB: " + was + " fehlgeschlagen"));
});

/**
 * Wert(e) ablegen. Zwei Formen, beide erlaubt:
 *   idbSetzen(db, speicher, schluessel, wert)
 *   idbSetzen(db, speicher, { schluessel, wert })   // oder eine Liste davon
 *
 * Mehrere Einträge laufen IMMER in EINER Transaktion. Das ist keine
 * Bequemlichkeit: Die Fotos einer Kontrolle wurden bisher gemeinsam
 * geschrieben; eine naive Ein-Schlüssel-Hülle darüber machte daraus N
 * Transaktionen und damit N Gelegenheiten, auf halbem Weg stehenzubleiben.
 */
export async function idbSetzen(db, speicher, a, b) {
  const liste = b !== undefined ? [{ schluessel: a, wert: b }] : (Array.isArray(a) ? a : [a]);
  const verbindung = await oeffnen(db, speicher);
  const tx = verbindung.transaction(speicher, "readwrite");
  const laden = tx.objectStore(speicher);
  for (const { schluessel, wert } of liste) laden.put(wert, schluessel);
  return abschliessen(tx, "Schreiben");
}

/**
 * Wert(e) lesen. Eine Liste von Schlüsseln liefert eine Liste in DERSELBEN
 * Reihenfolge, ein einzelner Schlüssel den Wert. Fehlendes ist `null` — die
 * aufrufende Stelle entscheidet selbst, ob sie es herausfiltert.
 */
export async function idbHolen(db, speicher, schluessel) {
  const verbindung = await oeffnen(db, speicher);
  const einzeln = (laden, k) => new Promise((resolve, reject) => {
    const req = laden.get(k);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error || new Error("IndexedDB: Lesen fehlgeschlagen"));
  });
  const laden = verbindung.transaction(speicher, "readonly").objectStore(speicher);
  if (!Array.isArray(schluessel)) return einzeln(laden, schluessel);
  const out = [];
  for (const k of schluessel) out.push(await einzeln(laden, k));
  return out;
}

/** Schlüssel entfernen, einzeln oder als Liste (dann in EINER Transaktion). Unbekannte sind kein Fehler. */
export async function idbLoeschen(db, speicher, schluessel) {
  const liste = Array.isArray(schluessel) ? schluessel : [schluessel];
  const verbindung = await oeffnen(db, speicher);
  const tx = verbindung.transaction(speicher, "readwrite");
  const laden = tx.objectStore(speicher);
  for (const k of liste) laden.delete(k);
  return abschliessen(tx, "Löschen");
}

/** Alle abgelegten Schlüssel — für das Aufräumen und die Anzeige „auf diesem Gerät". */
export async function idbSchluessel(db, speicher) {
  const verbindung = await oeffnen(db, speicher);
  return new Promise((resolve, reject) => {
    const req = verbindung.transaction(speicher, "readonly").objectStore(speicher).getAllKeys();
    req.onsuccess = () => resolve([...req.result]);
    req.onerror = () => reject(req.error || new Error("IndexedDB: Schluessel lesen fehlgeschlagen"));
  });
}
