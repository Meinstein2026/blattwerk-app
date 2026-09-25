// Client-seitiges Konto-Gedächtnis (Task 8, Mandantenfähigkeit — Nachtrag:
// die Endpunkte aus src/server/konto-gedaechtnis.mjs bekamen zunächst keinen
// Aufrufer, siehe Selbstkritik im Task-8-Report). Lokal in localStorage
// (offline-fest, wie schon vor Task 8) + serverseitig je Mandant über
// GET/POST /api/konto/gedaechtnis. Gleiches Muster wie src/mandant-client.js:
// synchron aus dem Cache lesen, im Hintergrund mit dem Server abgleichen.
//
// Der Serverstand gewinnt bei gleichem Schlüssel — er fasst zusammen, was
// ALLE Geräte dieser Firma bisher gebucht haben; der lokale Cache bleibt der
// Fallback ohne Netz und wird nach jedem geglückten Abgleich aufgefrischt.
const SCHLUESSEL = "blattwerk_konto_mem";

export const kontoMemAusCache = () => {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL) || "{}"); } catch (_) { return {}; }
};

const kontoMemSpeichern = (m) => { try { localStorage.setItem(SCHLUESSEL, JSON.stringify(m)); } catch (_) {} };

// Reine Merge-Funktion, unabhängig testbar: Server gewinnt bei gleichem
// Schlüssel (er kennt, was alle Geräte dieser Firma bisher gebucht haben;
// der lokale Stand ist nur der Offline-Fallback dieses einen Geräts).
export const kontoMemMischen = (lokal, server) => ({ ...(lokal || {}), ...(server || {}) });

// Artikel(pid)->Konto merken: sofort lokal (blockiert nie einen Beleg), dann
// beiläufig an den Server gemeldet. Ein fehlgeschlagener Server-Ruf wird nur
// verworfen (kein Toast, kein erneuter Versuch) — der lokale Wert bleibt in
// jedem Fall stehen. `lieferant` ist optional (nicht an jeder Aufrufstelle
// ohne Zusatzaufwand verfügbar) und geht nur mit, wenn vorhanden.
export const kontoMemMerken = (pid, konto, lieferant) => {
  if (!pid || !konto) return kontoMemAusCache();
  const m = kontoMemAusCache();
  m[String(pid)] = konto;
  kontoMemSpeichern(m);
  if (typeof fetch === "function") {
    fetch("/api/konto/gedaechtnis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artikel: String(pid), konto, ...(lieferant ? { lieferant } : {}) }),
    }).catch((err) => console.warn("Konto-Gedächtnis: Server-Schreiben fehlgeschlagen (lokal bleibt gültig)", err));
  }
  return m;
};

// Serverstand holen und über den lokalen Cache mischen (Server gewinnt),
// gemischten Stand persistieren. Ohne Netz/Server bleibt der lokale Stand
// unverändert stehen — kein Fehler nach außen, keine blockierte Belegerfassung.
export const kontoMemAbgleichen = async () => {
  const lokal = kontoMemAusCache();
  if (typeof fetch !== "function") return lokal;
  try {
    const r = await fetch("/api/konto/gedaechtnis");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const g = await r.json();
    const gemischt = kontoMemMischen(lokal, g?.artikel || {});
    kontoMemSpeichern(gemischt);
    return gemischt;
  } catch (err) {
    console.warn("Konto-Gedächtnis: Server-Abgleich fehlgeschlagen (lokaler Stand bleibt)", err);
    return lokal;
  }
};
