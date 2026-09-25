// Offline-Warteschlange fuer „Dokument hochladen" (Spec 2026-09-23, Wunsch Inhaber:
// schon in Version 1). Die fertige Upload-Nutzlast (PDF als Base64 + Angaben)
// liegt in IndexedDB — NICHT im localStorage, das Kontingent reicht fuer PDFs
// nicht (siehe Ueberlassung/GBU). Eigene Datenbank, weil ein neuer
// Objektspeicher in einer bestehenden DB still nicht angelegt wuerde (src/idb.js).
import { idbHolen, idbLoeschen, idbSchluessel, idbSetzen } from "./idb.js";

export const PL_WS_DB = "blattwerk-pl-upload";
export const PL_WS_SPEICHER = "auftraege";

const idbSpeicher = {
  setzen: (k, v) => idbSetzen(PL_WS_DB, PL_WS_SPEICHER, k, v),
  holen: (k) => idbHolen(PL_WS_DB, PL_WS_SPEICHER, k),
  loeschen: (k) => idbLoeschen(PL_WS_DB, PL_WS_SPEICHER, k),
  schluessel: () => idbSchluessel(PL_WS_DB, PL_WS_SPEICHER),
};

/** HTTP-Status -> was mit dem Auftrag passiert. 400/404/413/422 wird nie besser, alles andere spaeter nochmal. */
export const plWsAntwort = (status) =>
  status >= 200 && status < 300 ? "fertig" : [400, 404, 413, 422].includes(status) ? "verwerfen" : "spaeter";

export async function plEinreihen(nutzlast, { speicher = idbSpeicher, jetzt = Date.now() } = {}) {
  const id = `${String(jetzt).padStart(15, "0")}-${Math.random().toString(36).slice(2, 8)}`;
  await speicher.setzen(id, { ...nutzlast, eingereiht: new Date(jetzt).toISOString() });
  return id;
}

export async function plAusstehend({ speicher = idbSpeicher } = {}) {
  return (await speicher.schluessel()).length;
}

let laeuft = false;
/**
 * Alle wartenden Auftraege der Reihe nach senden. `senden(nutzlast)` liefert
 * `{ status }` oder wirft (kein Netz, SSO abgelaufen) — dann bleibt der Rest
 * liegen. Verworfenes wird ueber `melden(nutzlast, status)` sichtbar gemacht.
 * Rueckgabe: Zahl der erfolgreich hochgeladenen Auftraege.
 */
export async function plNachtragen({ senden, melden = () => {}, speicher = idbSpeicher }) {
  if (laeuft) return 0;
  laeuft = true;
  let fertig = 0;
  try {
    const schluessel = [...(await speicher.schluessel())].sort();
    for (const k of schluessel) {
      const nutzlast = await speicher.holen(k);
      if (!nutzlast) continue;
      let status;
      try { ({ status } = await senden(nutzlast)); } catch (_) { break; }
      const was = plWsAntwort(status);
      if (was === "spaeter") break;
      await speicher.loeschen(k);
      if (was === "fertig") fertig++;
      else melden(nutzlast, status);
    }
  } finally { laeuft = false; }
  return fertig;
}
