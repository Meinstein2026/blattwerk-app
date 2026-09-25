// Dolibarr-Adresse und Umzug (09.09.2026): die alte Adresse ist auf eine neue
// umgezogen (echte Hosts kommen aus VITE_DOLIBARR_URL_DEFAULT/
// VITE_DOLIBARR_ALT_HOSTS, siehe src/intern.js — nie im Quelltext). Die alte
// Adresse antwortet mit 301 — im
// Browser ist das kein Umzug, sondern ein CORS-Bruch: der Preflight (wegen des
// DOLAPIKEY-Kopfs) darf keiner Weiterleitung folgen, jeder Aufruf endet in
// „Failed to fetch" und das Dashboard sagt nur „Nicht verbunden". Deshalb
// (a) gespeicherte Konfigurationen still umschreiben (der API-Schlüssel gilt
// weiter) und (b) vor dem eigentlichen Verbindungstest eine Probe ohne eigene
// Kopfzeilen (kein Preflight) mit `redirect: "manual"` — die liefert bei 3xx
// eine `opaqueredirect`-Antwort, und daraus wird eine klare Meldung.
// Von App und server.mjs importiert.

import { intern } from "./intern.js";

export const DOLIBARR_URL_DEFAULT = intern("DOLIBARR_URL_DEFAULT", "https://dolibarr.example.org");
export const DOLIBARR_ALTE_HOSTS = intern("DOLIBARR_ALT_HOSTS", "dolibarr-alt.example.org")
  .split(",").map((s) => s.trim()).filter(Boolean);

export function migriereDolibarrUrl(url) {
  const roh = String(url == null ? "" : url).trim();
  if (!roh) return { url: "", geaendert: false };
  let u;
  try { u = new URL(roh); } catch { return { url: roh, geaendert: false }; }
  if (!DOLIBARR_ALTE_HOSTS.includes(u.hostname.toLowerCase())) return { url: roh, geaendert: false };
  const pfad = u.pathname.replace(/\/+$/, "");
  return { url: DOLIBARR_URL_DEFAULT + pfad + u.search, geaendert: true };
}

export function migriereDolibarrConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || !cfg.url) return { config: cfg ?? null, geaendert: false };
  const { url, geaendert } = migriereDolibarrUrl(cfg.url);
  return { config: geaendert ? { ...cfg, url } : cfg, geaendert };
}

/** Antwort einer manuellen Weiterleitungs-Probe: 3xx oder opaqueredirect. */
export function weiterleitungErkannt(res) {
  if (!res) return false;
  if (res.type === "opaqueredirect") return true;
  const st = Number(res.status);
  return st >= 300 && st < 400;
}

export function verbindungsFehlerText(e) {
  if (e?.weiterleitung) {
    const m = String(e.message || "");
    return /leitet weiter|umgezogen/.test(m) ? m : "Die Dolibarr-Adresse leitet auf einen anderen Server weiter — vermutlich umgezogen. " + m;
  }
  return "Verbindung fehlgeschlagen. URL und API-Key prüfen.";
}
