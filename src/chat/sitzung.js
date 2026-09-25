// Matrix-Sitzung des nativen Chats (seit 19.09.2026). Die App meldet sich als
// EIGENES Gerät am Homeserver an — unabhängig von der Element-Sitzung unter
// /chat/, deren Speicherformat (Pickle-Key, verschlüsseltes Token) ein
// Element-Internum ist und sich mit jedem Update ändern darf.
//
// Anmeldung: der Homeserver delegiert an MAS/Authentik und bietet dafür den
// klassischen SSO-Weg an (m.login.sso → m.login.token). Das ist eine echte
// Navigation: hin zum Homeserver, zurück mit `?loginToken=…`, den die App
// gegen Zugriffstoken + Gerätekennung tauscht. Wer in Authentik schon
// angemeldet ist, sieht davon nur eine Bestätigungsseite.
//
// Alles hier ist rein bzw. bekommt Speicher und fetch hereingereicht — die
// Reihenfolge ist so ohne Browser prüfbar (test/chat/sitzung.test.js).

import { intern } from "../intern.js";

export const CHAT_HOMESERVER = intern("CHAT_HOMESERVER", "https://matrix.example.org");
export const CHAT_SITZUNG_KEY = "blattwerk_mx_sitzung";
export const CHAT_GERAETENAME = "Blattwerk-App";
/** Marke in der Rücksprungadresse — daran erkennt die App ihren eigenen Rückweg. */
export const CHAT_RUECKWEG = "chat-anmeldung";

const ohneSchraegstrich = (s) => String(s || "").replace(/\/+$/, "");

/** Wohin der Homeserver nach der Anmeldung zurückschickt. */
export function chatRueckAdresse(origin) {
  return `${ohneSchraegstrich(origin)}/?${CHAT_RUECKWEG}=1`;
}

/** Adresse, die die SSO-Anmeldung startet. */
export function chatSsoUrl(homeserver, rueckAdresse) {
  return `${ohneSchraegstrich(homeserver)}/_matrix/client/v3/login/sso/redirect?redirectUrl=${encodeURIComponent(rueckAdresse)}`;
}

/** loginToken aus der Rücksprungadresse — nur auf unserem eigenen Rückweg. */
export function chatLoginTokenAusUrl(href) {
  try {
    const u = new URL(href);
    if (!u.searchParams.has(CHAT_RUECKWEG)) return null;
    return u.searchParams.get("loginToken") || null;
  } catch { return null; }
}

/** Dieselbe Adresse ohne Token und Marke — das Token gehört nicht in die Verlaufsliste. */
export function chatUrlBereinigt(href) {
  try {
    const u = new URL(href);
    u.searchParams.delete("loginToken");
    u.searchParams.delete(CHAT_RUECKWEG);
    return u.pathname + (u.searchParams.size ? `?${u.searchParams}` : "") + u.hash;
  } catch { return "/"; }
}

export const chatSitzungGueltig = (s) =>
  !!s && typeof s === "object" && [s.userId, s.deviceId, s.accessToken, s.homeserver].every((x) => typeof x === "string" && x.length > 0);

export function chatSitzungLesen(speicher) {
  try {
    const s = JSON.parse(speicher.getItem(CHAT_SITZUNG_KEY) || "null");
    return chatSitzungGueltig(s) ? s : null;
  } catch { return null; }
}
export function chatSitzungMerken(speicher, sitzung) {
  if (!chatSitzungGueltig(sitzung)) throw new Error("Unvollständige Chat-Sitzung");
  speicher.setItem(CHAT_SITZUNG_KEY, JSON.stringify(sitzung));
}
export function chatSitzungLoeschen(speicher) {
  try { speicher.removeItem(CHAT_SITZUNG_KEY); } catch (_) {}
}

/**
 * Tauscht den loginToken gegen eine Sitzung. `holen` ist fetch — hereingereicht,
 * damit der Test ohne Netz auskommt. Ein Token gilt genau einmal und nur kurz;
 * scheitert der Tausch, hilft nur eine neue Anmeldung.
 */
export async function chatMitTokenAnmelden(homeserver, loginToken, holen) {
  const hs = ohneSchraegstrich(homeserver);
  const r = await holen(`${hs}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "m.login.token", token: loginToken, initial_device_display_name: CHAT_GERAETENAME }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Anmeldung abgelehnt (${r.status})`);
  const sitzung = { userId: d.user_id, deviceId: d.device_id, accessToken: d.access_token, homeserver: hs };
  if (d.refresh_token) sitzung.refreshToken = d.refresh_token;
  if (!chatSitzungGueltig(sitzung)) throw new Error("Homeserver hat keine vollständige Sitzung geliefert");
  return sitzung;
}
