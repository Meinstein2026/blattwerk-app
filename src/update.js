// Selbst-Update der Android-APK über den internen Update-Host (nginx
// `apps-static`, nur LAN/NetBird). Aufbau je App:
//
//   /srv/apps/<app>/manifest.json   { versionCode, versionName, apk, notes }
//   /srv/apps/<app>/<datei>.apk
//
// Gleiches Schema wie die Kalender-App, damit ein Host alle Apps bedient.
// Reine Funktionen — der Netzverkehr steckt im Panel, das Herunterladen und
// Installieren in der nativen Brücke `window.BlattwerkNative`.
//
// Echter Host kommt aus VITE_UPDATE_BASE (src/intern.js) — nie im Quelltext.
import { intern } from "./intern.js";

export const UPDATE_BASE_DEFAULT = intern("UPDATE_BASE", "apps.example.org/blattwerk");

/**
 * Nutzereingabe → absolute Basis-URL ohne Schrägstrich am Ende.
 * Erlaubt „host/pfad", „https://host/pfad" und Eingaben mit Leerzeichen.
 * Ohne Schema wird https angenommen (der Host läuft hinter NPM mit TLS).
 */
export function normalizeUpdateBase(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** manifest.json der Basis-URL. */
export function manifestUrl(base) {
  const b = normalizeUpdateBase(base);
  return b ? `${b}/manifest.json` : "";
}

/**
 * APK-Adresse aus dem Manifest auflösen. `apk` darf sein:
 *   „blattwerk-1.2.apk"            → relativ zur Basis
 *   „/srv/…/blattwerk-1.2.apk"     → absolut auf demselben Host
 *   „https://…/blattwerk-1.2.apk"  → vollständiger Link
 */
export function apkUrl(base, apk) {
  const name = String(apk == null ? "" : apk).trim();
  const b = normalizeUpdateBase(base);
  if (!name || !b) return "";
  if (/^https?:\/\//i.test(name)) return name;
  if (name.startsWith("/")) {
    try { return new URL(name, b).toString(); } catch { return ""; }
  }
  return `${b}/${name.replace(/^\.\//, "")}`;
}

/**
 * Manifest auswerten. Verglichen wird ausschließlich der `versionCode` —
 * `versionName` ist Anzeigetext und taugt nicht zum Sortieren („1.10" < „1.9").
 * Kaputte oder ältere Manifeste liefern `verfuegbar: false` statt zu werfen,
 * damit ein stiller Start-Check nie eine Fehlermeldung produziert.
 */
export function pruefeManifest(manifest, aktuellerVersionCode) {
  const m = manifest && typeof manifest === "object" ? manifest : {};
  const code = Number(m.versionCode);
  const jetzt = Number(aktuellerVersionCode);
  if (!Number.isFinite(code) || code <= 0) {
    return { verfuegbar: false, grund: "Manifest ohne gültigen versionCode" };
  }
  if (!Number.isFinite(jetzt)) {
    return { verfuegbar: false, grund: "Eigene Version unbekannt" };
  }
  if (code <= jetzt) {
    return { verfuegbar: false, grund: "aktuell", versionCode: code, versionName: m.versionName || "" };
  }
  return {
    verfuegbar: true,
    versionCode: code,
    versionName: String(m.versionName || code),
    apk: String(m.apk || ""),
    notes: String(m.notes || ""),
  };
}

/** Läuft die App im APK-Wrapper (nur dort gibt es die native Brücke)? */
export function nativeBridge() {
  return (typeof window !== "undefined" && window.BlattwerkNative) || null;
}

/** Version der laufenden APK, oder null im normalen Browser. */
export function appVersion() {
  const b = nativeBridge();
  if (!b || typeof b.appVersion !== "function") return null;
  try {
    const v = JSON.parse(b.appVersion());
    return { versionCode: Number(v.versionCode) || 0, versionName: String(v.versionName || "?") };
  } catch {
    return null;
  }
}

/**
 * Fehlertext fuer die Anzeige. Ein 403 heisst praktisch immer: der Update-Host
 * steht hinter der NPM-Zugriffsliste und ist nur im LAN Standort 1 oder ueber
 * NetBird freigegeben — das soll dastehen, statt nur einer Zahl.
 */
export function updateFehlerText(msg) {
  const m = String(msg == null ? "" : msg);
  if (/\b403\b/.test(m)) {
    return `${m} — der Update-Host ist nur im LAN Standort 1 oder mit NetBird erreichbar (Zugriffsliste). Von hier aus ist der Abruf nicht freigegeben.`;
  }
  return m;
}

/** Tagesschluessel fuer den stillen Start-Check (lokale Zeit, nicht UTC). */
export function updateTag(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Hoechstens einmal pro Tag still nachsehen — sonst nervt jeder App-Start. */
export function stillFaellig(letzterTag, heute = updateTag()) {
  return String(letzterTag || "") !== heute;
}
