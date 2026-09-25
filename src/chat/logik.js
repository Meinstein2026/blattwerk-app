// Anzeige-Logik des nativen Chats — rein, ohne Matrix-SDK und ohne DOM. Der
// Client (src/chat/client.js) übersetzt SDK-Objekte in die schlichten
// Datensätze, mit denen hier gerechnet wird; so bleibt prüfbar, WAS die Seite
// zeigt, ohne einen Homeserver zu brauchen (test/chat/logik.test.js).
//
// Roh-Ereignis:  { id, typ, sender, senderName, ts, inhalt, vorher, stateKey,
//                  geloescht, unlesbar, bearbeitet, status }
// Roh-Raum:      { id, name, mitgliedschaft, istSpace, direkt, letzteTs,
//                  ungelesen, erwaehnungen, verschluesselt, vorschau }

import { intern } from "../intern.js";

export const BLATTWERK_SPACE = intern("CHAT_SPACE", "!example:matrix.example.org");
/** Unter-Space mit den Chats der WhatsApp-Geschäftsnummer (Brücke, 24.09.2026) — in der Liste ein Ordner. */
export const WHATSAPP_SPACE = intern("CHAT_WHATSAPP_SPACE", "!example-wa:matrix.example.org");

/** Nachrichten desselben Absenders rücken zusammen, wenn sie so dicht aufeinander folgen. */
export const CHAT_GRUPPE_MS = 5 * 60 * 1000;

const text = (x) => (typeof x === "string" ? x : "");

// ── Antwort-Zitat ───────────────────────────────────────────────────────────
// Eine Antwort trägt im `body` das Zitat der Ursprungsnachricht als Zeilen mit
// "> " voran, dann eine Leerzeile (Rückfall für Clients ohne Antwort-Ansicht).
// Wir zeigen das Zitat selbst an, also muss der Rückfall raus.
export function chatOhneZitat(body) {
  const zeilen = text(body).split("\n");
  let i = 0;
  while (i < zeilen.length && zeilen[i].startsWith("> ")) i++;
  if (i === 0) return text(body);
  if (zeilen[i] === "") i++;
  return zeilen.slice(i).join("\n");
}

// ── Ein Ereignis → was die Seite zeigt ──────────────────────────────────────
const mitglied = (e) => {
  const neu = text(e.inhalt?.membership), alt = text(e.vorher?.membership);
  const wer = text(e.inhalt?.displayname) || text(e.vorher?.displayname) || text(e.stateKey);
  const selbst = e.sender === e.stateKey;
  if (neu === "join" && alt !== "join") return `${wer} ist beigetreten`;
  if (neu === "join") {
    // join → join ist eine Profiländerung; nur der Name ist eine Zeile wert.
    const a = text(e.vorher?.displayname), n = text(e.inhalt?.displayname);
    return a && n && a !== n ? `${a} heißt jetzt ${n}` : null;
  }
  if (neu === "invite") return `${wer} wurde eingeladen`;
  if (neu === "leave") return selbst ? `${wer} hat den Raum verlassen` : alt === "invite" ? `Einladung für ${wer} zurückgezogen` : `${wer} wurde entfernt`;
  if (neu === "ban") return `${wer} wurde gesperrt`;
  return null;
};

/**
 * Gibt `null` zurück für alles, was keine eigene Zeile bekommt (Reaktionen,
 * Bearbeitungen, Lesebestätigungen, unbekannte Statusereignisse).
 */
export function chatNachricht(e) {
  if (!e || typeof e !== "object") return null;
  const basis = { id: e.id, sender: e.sender, senderName: text(e.senderName) || text(e.sender), ts: Number(e.ts) || 0, status: e.status || null, bearbeitet: !!e.bearbeitet, reaktionen: Array.isArray(e.reaktionen) ? e.reaktionen : [] };
  if (e.typ === "m.room.member") { const t = mitglied(e); return t ? { ...basis, art: "system", text: t } : null; }
  if (e.typ === "m.room.name") return { ...basis, art: "system", text: `${basis.senderName} hat den Raum „${text(e.inhalt?.name)}" genannt` };
  if (e.typ === "m.room.encryption") return { ...basis, art: "system", text: "Ende-zu-Ende-Verschlüsselung eingeschaltet" };
  if (e.typ === "m.room.create") return { ...basis, art: "system", text: "Raum angelegt" };
  if (e.typ !== "m.room.message" && e.typ !== "m.room.encrypted" && e.typ !== "m.sticker") return null;
  if (e.geloescht) return { ...basis, art: "geloescht", text: "Nachricht gelöscht" };
  if (e.unlesbar || e.typ === "m.room.encrypted") return { ...basis, art: "unlesbar", text: "Nachricht kann (noch) nicht entschlüsselt werden" };
  const c = e.inhalt || {};
  // Bearbeitungen kommen als eigenes Ereignis mit m.replace — das SDK legt den
  // neuen Inhalt auf das Original; das Bearbeitungsereignis selbst entfällt.
  if (c["m.relates_to"]?.rel_type === "m.replace") return null;
  const antwortAuf = c["m.relates_to"]?.["m.in_reply_to"]?.event_id || null;
  const koerper = antwortAuf ? chatOhneZitat(c.body) : text(c.body);
  const medium = { mxc: text(c.url) || text(c.file?.url) || null, datei: c.file || null, name: text(c.filename) || text(c.body), mime: text(c.info?.mimetype), groesse: Number(c.info?.size) || 0, breite: Number(c.info?.w) || 0, hoehe: Number(c.info?.h) || 0 };
  // Bildunterschrift: steht ein eigener Dateiname da, ist `body` die Unterschrift.
  const unterschrift = text(c.filename) && text(c.filename) !== text(c.body) ? text(c.body) : "";
  switch (e.typ === "m.sticker" ? "m.image" : c.msgtype) {
    case "m.image": return { ...basis, art: "bild", antwortAuf, text: unterschrift, ...medium };
    case "m.video": return { ...basis, art: "video", antwortAuf, text: unterschrift, ...medium };
    case "m.audio": return { ...basis, art: "audio", antwortAuf, text: unterschrift, ...medium };
    case "m.file": return { ...basis, art: "datei", antwortAuf, text: unterschrift, ...medium };
    case "m.notice": return { ...basis, art: "hinweis", antwortAuf, text: koerper };
    case "m.emote": return { ...basis, art: "text", antwortAuf, text: `* ${basis.senderName} ${koerper}` };
    case "m.location": return { ...basis, art: "text", antwortAuf, text: `📍 ${koerper}`, geo: text(c.geo_uri) };
    default: return koerper ? { ...basis, art: "text", antwortAuf, text: koerper } : null;
  }
}

/** Kurzfassung für Raumliste und Antwort-Zitat. */
export function chatKurztext(n) {
  if (!n) return "";
  const marke = { bild: "📷 Foto", video: "🎬 Video", audio: "🎤 Audio", datei: "📎 " + (n.name || "Datei") }[n.art];
  if (marke) return n.text ? `${marke.split(" ")[0]} ${n.text}` : marke;
  if (n.art === "unlesbar") return "🔒 verschlüsselt";
  return text(n.text).replace(/\s+/g, " ").trim();
}

/** Vorschauzeile der Raumliste: „Du: …", in Gruppenräumen mit Vornamen davor. */
export function chatVorschau(n, ich, { direkt = false } = {}) {
  if (!n) return "";
  const kurz = chatKurztext(n);
  if (n.art === "system") return kurz;
  if (n.sender === ich) return `Du: ${kurz}`;
  return direkt ? kurz : `${text(n.senderName).split(" ")[0]}: ${kurz}`;
}

// ── Zeit ────────────────────────────────────────────────────────────────────
const tagSchluessel = (ts, zone) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

export function chatUhrzeit(ts, zone) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

export function chatTagesTitel(ts, jetzt, zone) {
  const tag = tagSchluessel(ts, zone);
  if (tag === tagSchluessel(jetzt, zone)) return "Heute";
  if (tag === tagSchluessel(jetzt - 864e5, zone)) return "Gestern";
  const jahrGleich = tag.slice(0, 4) === tagSchluessel(jetzt, zone).slice(0, 4);
  return new Intl.DateTimeFormat("de-DE", { timeZone: zone, weekday: "long", day: "numeric", month: "long", ...(jahrGleich ? {} : { year: "numeric" }) }).format(new Date(ts));
}

/** Zeitangabe der Raumliste: heute die Uhrzeit, sonst „Gestern" oder das Datum. */
export function chatListenZeit(ts, jetzt, zone) {
  if (!ts) return "";
  const titel = chatTagesTitel(ts, jetzt, zone);
  if (titel === "Heute") return chatUhrzeit(ts, zone);
  if (titel === "Gestern") return "Gestern";
  return new Intl.DateTimeFormat("de-DE", { timeZone: zone, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(ts));
}

// ── Zeitleiste ──────────────────────────────────────────────────────────────
/**
 * Roh-Ereignisse → Zeilen der Seite: Tagestrenner, Systemzeilen, Nachrichten.
 * `kopf` heißt: Absender und Avatar zeigen (erste Nachricht einer Gruppe).
 * `zitat` ist die Kurzfassung der beantworteten Nachricht, soweit sie geladen ist.
 */
export function chatZeitleiste(roh, { ich, jetzt, zone } = {}) {
  const zeilen = [];
  const nachId = new Map();
  let tag = null, davor = null;
  for (const e of Array.isArray(roh) ? roh : []) {
    const n = chatNachricht(e);
    if (!n) continue;
    nachId.set(n.id, n);
    const t = tagSchluessel(n.ts, zone);
    if (t !== tag) { tag = t; davor = null; zeilen.push({ typ: "tag", id: `tag-${t}`, titel: chatTagesTitel(n.ts, jetzt, zone) }); }
    if (n.art === "system") { zeilen.push({ typ: "system", ...n }); davor = null; continue; }
    const kopf = !davor || davor.sender !== n.sender || n.ts - davor.ts > CHAT_GRUPPE_MS;
    const ziel = n.antwortAuf ? nachId.get(n.antwortAuf) : null;
    zeilen.push({ typ: "nachricht", ...n, eigen: n.sender === ich, kopf,
      zitat: n.antwortAuf ? { name: ziel?.senderName || "", text: ziel ? chatKurztext(ziel) : "Nachricht" } : null });
    davor = n;
  }
  return zeilen;
}

// ── Raumliste ───────────────────────────────────────────────────────────────
/**
 * Was im Chat auftaucht: die Räume des Blattwerk-Space plus Direktchats MIT
 * DESSEN MITGLIEDERN — ohne den ☎-Raum (der hat die Telefon-Ansicht) und ohne
 * Spaces selbst. Im selben Konto liegen oft auch private Chats und Brücken
 * (WhatsApp, Instagram …); die gehören nicht in die Firmen-App (Live-Test
 * 19.09.2026: ohne diese Grenze standen dort alle privaten Direktchats).
 * Kennt die App die Kinder des Space (noch) nicht — Space nicht beigetreten
 * oder Status noch nicht geladen —, zeigt sie lieber alle beigetretenen Räume
 * als eine leere Liste.
 * Reihenfolge: offene Einladungen zuerst, dann nach letzter Aktivität.
 */
export function chatRaumListe(raeume, { kinder = [], mitglieder = [], telefonRaum = "", suche = "" } = {}) {
  const erlaubt = new Set(kinder), kollegen = new Set(mitglieder);
  const q = text(suche).trim().toLowerCase();
  const gehoertDazu = (r) => !erlaubt.size || erlaubt.has(r.id) || (r.direkt && kollegen.has(r.direktMit));
  return (Array.isArray(raeume) ? raeume : [])
    .filter((r) => r && !r.istSpace && r.id !== telefonRaum)
    .filter((r) => r.mitgliedschaft === "join" || r.mitgliedschaft === "invite")
    .filter(gehoertDazu)
    .filter((r) => !q || text(r.name).toLowerCase().includes(q))
    .sort((a, b) => (b.mitgliedschaft === "invite") - (a.mitgliedschaft === "invite") || (b.letzteTs || 0) - (a.letzteTs || 0) || text(a.name).localeCompare(text(b.name)));
}

/**
 * Fasst die Räume eines Unter-Space (z. B. alle WhatsApp-Kunden) zu EINEM
 * Listeneintrag zusammen, sonst stünde jeder Kunde einzeln zwischen den
 * Firmenräumen. Ungelesenes und Einladungen zählen in die Marke des Ordners.
 */
export function chatOrdnerBilden(liste, ordnerRaeume, { id, name }) {
  const drin = new Set(ordnerRaeume || []);
  const raeume = (liste || []).filter((r) => drin.has(r.id));
  if (!raeume.length) return liste;
  const juengster = raeume.reduce((a, b) => ((b.letzteTs || 0) > (a.letzteTs || 0) ? b : a));
  const eintrag = {
    id, name, ordner: true, raeume, mitgliedschaft: "join", letzteTs: juengster.letzteTs || 0,
    ungelesen: chatUngelesenGesamt(raeume), vorschau: juengster.vorschau ? `${juengster.name}: ${juengster.vorschau}` : "",
  };
  const rest = liste.filter((r) => !drin.has(r.id));
  const i = rest.findIndex((r) => r.mitgliedschaft !== "invite" && (r.letzteTs || 0) < eintrag.letzteTs);
  return i < 0 ? [...rest, eintrag] : [...rest.slice(0, i), eintrag, ...rest.slice(i)];
}

/** Summe für die Marke am Chat-Reiter. */
export const chatUngelesenGesamt = (liste) => (Array.isArray(liste) ? liste : []).reduce((s, r) => s + (r.mitgliedschaft === "invite" ? 1 : Number(r.ungelesen) || 0), 0);
export const chatMarke = (n) => (n > 99 ? "99+" : n > 0 ? String(n) : "");

// ── Kleinkram ───────────────────────────────────────────────────────────────
export function chatInitialen(name) {
  const teile = text(name).replace(/^[@#!]/, "").split(/[\s:._-]+/).filter(Boolean);
  return ((teile[0]?.[0] || "?") + (teile.length > 1 ? teile[1][0] : "")).toUpperCase();
}
const FARBEN = ["#2e7d32", "#1565c0", "#ad1457", "#6a1b9a", "#ef6c00", "#00838f", "#5d4037", "#c62828"];
/** Feste Farbe je Person — derselbe Mensch hat in jedem Raum dieselbe. */
export function chatFarbe(userId) {
  let h = 0;
  for (const z of text(userId)) h = (h * 31 + z.codePointAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length];
}
export function chatDateiGroesse(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * mxc://server/id → Adresse des AUTHENTIFIZIERTEN Medienabrufs (Matrix 1.11).
 * Der Homeserver liefert Medien nur noch mit Zugriffstoken aus; ein nacktes
 * <img src> bliebe leer, der Client holt deshalb per fetch + Bearer.
 */
export function chatMedienUrl(homeserver, mxc, { breite = 0, hoehe = 0 } = {}) {
  const m = /^mxc:\/\/([^/]+)\/([^/?#]+)$/.exec(text(mxc));
  if (!m) return null;
  const basis = `${text(homeserver).replace(/\/+$/, "")}/_matrix/client/v1/media`;
  const ziel = `${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`;
  return breite && hoehe ? `${basis}/thumbnail/${ziel}?width=${breite}&height=${hoehe}&method=scale` : `${basis}/download/${ziel}`;
}

/** Nachrichtentyp einer hochgeladenen Datei. */
export function chatMsgtypFuer(mime) {
  const m = text(mime);
  return m.startsWith("image/") ? "m.image" : m.startsWith("video/") ? "m.video" : m.startsWith("audio/") ? "m.audio" : "m.file";
}

// ── Emoji-Abgleich (SAS) ────────────────────────────────────────────────────
// Das SDK liefert die sieben Emojis mit englischem Namen. Verglichen wird das
// Bild — aber Emojis sehen je Gerät anders aus (Samsung, Apple, Google), darum
// steht wie in Element der Name darunter, und zwar auf Deutsch: die Gegenseite
// zeigt ihn in der Sprache ihres Geräts, ein englisches „spanner" neben einem
// deutschen „Schraubenschlüssel" verunsichert mehr, als es hilft.
const SAS_NAMEN = {
  dog: "Hund", cat: "Katze", lion: "Löwe", horse: "Pferd", unicorn: "Einhorn", pig: "Schwein", elephant: "Elefant", rabbit: "Hase",
  panda: "Panda", rooster: "Hahn", penguin: "Pinguin", turtle: "Schildkröte", fish: "Fisch", octopus: "Oktopus", butterfly: "Schmetterling",
  flower: "Blume", tree: "Baum", cactus: "Kaktus", mushroom: "Pilz", globe: "Globus", moon: "Mond", cloud: "Wolke", fire: "Feuer",
  banana: "Banane", apple: "Apfel", strawberry: "Erdbeere", corn: "Mais", pizza: "Pizza", cake: "Kuchen", heart: "Herz", smiley: "Smiley",
  robot: "Roboter", hat: "Hut", glasses: "Brille", spanner: "Schraubenschlüssel", santa: "Weihnachtsmann", "thumbs up": "Daumen hoch",
  umbrella: "Regenschirm", hourglass: "Sanduhr", clock: "Uhr", gift: "Geschenk", "light bulb": "Glühbirne", book: "Buch", pencil: "Bleistift",
  paperclip: "Büroklammer", scissors: "Schere", lock: "Schloss", key: "Schlüssel", hammer: "Hammer", telephone: "Telefon", flag: "Flagge",
  train: "Zug", bicycle: "Fahrrad", aeroplane: "Flugzeug", rocket: "Rakete", trophy: "Pokal", ball: "Ball", guitar: "Gitarre",
  trumpet: "Trompete", bell: "Glocke", anchor: "Anker", headphones: "Kopfhörer", folder: "Ordner", pin: "Stecknadel",
};
/** [[emoji, englischer Name], …] → [{ zeichen, name }] mit deutschem Namen (unbekannte bleiben englisch). */
export function chatSasEmojis(paare) {
  return (Array.isArray(paare) ? paare : []).map(([zeichen, name]) => ({ zeichen, name: SAS_NAMEN[text(name).toLowerCase()] || text(name) }));
}

// ── Sync nur für Blattwerk ──────────────────────────────────────────────────
// Ohne Grenze synchronisiert der Client ALLE Räume des Kontos. Bei Inhaber sind
// das hunderte (Brücken zu WhatsApp & Co.) — der erste Start dauerte 40 s und
// jeder weitere lud den ganzen Bestand aus der IndexedDB, obwohl die App nur
// eine Handvoll Räume zeigt (Beschwerde 19.09.2026: „braucht immer sehr lange").
/**
 * Welche Räume der Server überhaupt liefern soll: der Space, seine Kinder, der
 * ☎-Raum und die Direktchats mit Space-Mitgliedern. `null` heißt: keine Grenze
 * (Space nicht erreichbar — dann lieber alles als nichts).
 */
export function chatSyncRaeume({ space, kinder, mitglieder, direkt, telefonRaum }) {
  if (!space || !Array.isArray(kinder)) return null;
  const kollegen = new Set(Array.isArray(mitglieder) ? mitglieder : []);
  const dms = Object.entries(direkt && typeof direkt === "object" ? direkt : {})
    .filter(([wer]) => kollegen.has(wer)).flatMap(([, raeume]) => (Array.isArray(raeume) ? raeume : []));
  return [...new Set([space, ...kinder, telefonRaum, ...dms].filter(Boolean))].sort();
}

/** Filterdefinition für /sync. Lesebestätigungen bleiben (Ungelesen-Marken), Tippanzeige und Präsenz nicht. */
export function chatSyncFilter(raeume) {
  const raum = { timeline: { limit: 30 }, ephemeral: { types: ["m.receipt"] } };
  if (Array.isArray(raeume)) raum.rooms = raeume;
  return { room: raum, presence: { not_types: ["*"] } };
}


// ── Neue Mitarbeitende: welche Räume des Space tritt die App von selbst bei? ─
/**
 * `baum` = rooms aus /hierarchy, `mitgliedschaft` = Raum-Id → eigene
 * Mitgliedschaft. Nur Räume, die Space-Mitglieder ohne Einladung betreten
 * dürfen (restricted/public) — und nie einer, den die Person VERLASSEN hat.
 */
export function chatBeitrittsRaeume(baum, mitgliedschaft, space = BLATTWERK_SPACE) {
  return (baum || []).filter((r) => r.room_id !== space && ["restricted", "knock_restricted", "public"].includes(r.join_rule)
    && !["join", "leave", "ban"].includes(mitgliedschaft[r.room_id])).map((r) => r.room_id);
}
