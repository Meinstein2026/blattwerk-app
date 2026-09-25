// Holt die Mandanten-Konfiguration und haelt die letzte bekannte Fassung vor,
// damit die App offline gleich aussieht statt als Blattwerk zu erscheinen.
const SCHLUESSEL = "blattwerk_mandant";

export const mandantAusCache = () => {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL) || "null"); } catch (_) { return null; }
};

export const mandantHolen = async () => {
  try {
    const r = await fetch("/api/mandant");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const m = await r.json();
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(m)); } catch (_) {}
    return m;
  } catch (_) {
    return mandantAusCache();
  }
};

// Fuer alles, das den echten Mandanten braucht, BEVOR die App ihn zum ersten
// Mal geholt hat (z. B. ein GBU-PDF direkt nach dem allerersten Start auf
// einem neuen Geraet) — ohne das faellt mandantBetrieb(null) auf
// BETRIEB_STANDARD zurueck, dessen Anschrift ein Platzhalter ist. Gibt den
// Cache sofort zurueck, wenn er schon etwas hat (auch aus einer frueheren
// Sitzung); sonst wird EINMAL gewartet, mehrere gleichzeitige Aufrufer teilen
// sich denselben Request statt je einen eigenen zu feuern.
let mandantErsteLadung = null;
export const mandantSicher = () => {
  const cache = mandantAusCache();
  if (cache) return Promise.resolve(cache);
  if (!mandantErsteLadung) mandantErsteLadung = mandantHolen();
  return mandantErsteLadung;
};
