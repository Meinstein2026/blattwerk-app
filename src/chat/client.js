// Der Matrix-Client des nativen Chats (seit 19.09.2026) — die einzige Datei,
// die das SDK kennt. Alles, was die Seite sieht, sind die schlichten
// Datensätze aus src/chat/logik.js; die Übersetzung steht hier (chatRohEreignis,
// chatRohRaum) und ist ohne Homeserver prüfbar (test/chat/client.test.js).
//
// Das SDK (samt 7-MB-Krypto-WASM) wird dynamisch geladen — wie Leaflet und
// OpenCV bleibt es aus dem Hauptbundle heraus.
//
// Eigene Speicher: `blattwerk-chat-sync` (IndexedDB-Store) und das Präfix
// `blattwerk-chat` für den Krypto-Speicher. Das ist keine Kosmetik: unter
// demselben Origin liegt die Element-Instanz (/chat/) mit den STANDARDNAMEN
// des SDK — zwei Clients auf einem Krypto-Speicher zerstören ihn.
import { decryptAttachment, encryptAttachment } from "matrix-encrypt-attachment";
import { TELEFON_RAUM, KLINGEL_EVENT } from "../telefon.js";
import { BLATTWERK_SPACE, WHATSAPP_SPACE, chatBeitrittsRaeume, chatMedienUrl, chatMsgtypFuer, chatNachricht, chatSasEmojis, chatSyncFilter, chatSyncRaeume, chatVorschau } from "./logik.js";

// -v2: seit 19.09.2026 synchronisiert die App nur noch die Blattwerk-Räume. Der
// alte Speicher hielt den GANZEN Kontobestand und würde bei jedem Start weiter
// komplett geladen — neuer Name, der alte wird beim Start gelöscht.
const SYNC_DB = "blattwerk-chat-sync-v2";
const SYNC_DB_ALT = ["matrix-js-sdk:blattwerk-chat-sync"];
const KRYPTO_PRAEFIX = "blattwerk-chat";

let sdk = null;
let client = null;
let sitzung = null;
let geheimNeu = null;              // nur während chatErsteinrichten(): { id, key }
let geheimEingabe = null;          // nur während der Verifizierung gesetzt
let abgleich = null;               // laufender Emoji-Abgleich: { anfrage, pruefer, sas }
const hoerer = new Set();
const telefonHoerer = new Set();
const medienCache = new Map();     // Schlüssel → Promise<blob-URL>

// phase: aus | startet | bereit | fehler | abgemeldet
let stand = { phase: "aus", schritt: "", fehler: "", version: 0, krypto: null, abgleich: null };
let meldeUhr = null;
const melden = (patch) => {
  stand = { ...stand, ...(patch || {}), version: stand.version + 1 };
  for (const f of hoerer) f();
};
// Ein Sync bringt Dutzende Ereignisse — die Seite muss davon nur einmal hören.
const meldenGebuendelt = () => { if (!meldeUhr) meldeUhr = setTimeout(() => { meldeUhr = null; melden(); }, 60); };

export const chatAbonnieren = (f) => { hoerer.add(f); return () => hoerer.delete(f); };
export const chatStand = () => stand;
export const chatIch = () => sitzung?.userId || "";

// ── Übersetzung SDK → Datensätze ────────────────────────────────────────────
export function chatRohEreignis(ev) {
  const inhalt = ev.getContent() || {};
  return {
    id: ev.getId() || ev.getTxnId?.() || "",
    typ: ev.getType(),
    sender: ev.getSender() || "",
    senderName: ev.sender?.name || ev.getSender() || "",
    ts: ev.getTs(),
    inhalt,
    vorher: ev.getPrevContent?.() || {},
    stateKey: ev.getStateKey?.() ?? null,
    geloescht: !!ev.isRedacted?.(),
    unlesbar: !!ev.isDecryptionFailure?.(),
    bearbeitet: !!ev.replacingEvent?.(),
    status: ev.status || null,
  };
}

export function chatRohRaum(raum, { ich, direkt }) {
  const ereignisse = raum.getLiveTimeline().getEvents();
  let letzte = null;
  for (let i = ereignisse.length - 1; i >= 0 && !letzte; i--) {
    const n = chatNachricht(chatRohEreignis(ereignisse[i]));
    if (n && n.art !== "system") letzte = n;
  }
  const partner = direkt.get(raum.roomId) || null;
  const istDirekt = !!partner;
  return {
    id: raum.roomId,
    name: raum.name || raum.roomId,
    mitgliedschaft: raum.getMyMembership(),
    istSpace: !!raum.isSpaceRoom?.(),
    direkt: istDirekt,
    direktMit: partner,
    verschluesselt: !!raum.hasEncryptionStateEvent?.(),
    letzteTs: letzte?.ts || raum.getLastActiveTimestamp?.() || 0,
    ungelesen: raum.getUnreadNotificationCount?.("total") || 0,
    erwaehnungen: raum.getUnreadNotificationCount?.("highlight") || 0,
    vorschau: chatVorschau(letzte, ich, { direkt: istDirekt }),
    avatarMxc: raum.getMxcAvatarUrl?.() || null,
  };
}

/** Raum-Id → Gegenüber, laut m.direct. */
const direktRaeume = () => {
  const d = client?.getAccountData("m.direct")?.getContent() || {};
  const karte = new Map();
  for (const [wer, raeume] of Object.entries(d)) for (const r of Array.isArray(raeume) ? raeume : []) karte.set(r, wer);
  return karte;
};

/**
 * Wer zum Blattwerk-Space gehört. Danach richtet sich, welche Direktchats die
 * App zeigt: im selben Konto liegen auch private Chats und Brücken (WhatsApp,
 * Instagram …), die in einer Firmen-App nichts verloren haben.
 */
export function chatSpaceMitglieder() {
  const space = client?.getRoom(BLATTWERK_SPACE);
  if (!space) return [];
  return space.getMembers().filter((m) => m.membership === "join" || m.membership === "invite").map((m) => m.userId);
}

/** Raum-Ids, die der Blattwerk-Space als Kinder führt (leer = unbekannt). */
const kinderVon = (spaceId) => {
  const space = client?.getRoom(spaceId);
  if (!space) return [];
  return space.currentState.getStateEvents("m.space.child")
    .filter((e) => Array.isArray(e.getContent()?.via) && e.getContent().via.length)
    .map((e) => e.getStateKey());
};
/**
 * Raum-Ids, die der Blattwerk-Space führt — samt denen in seinen Unter-Spaces
 * („Team", „Verwaltung", WhatsApp-Ordner; leer = unbekannt).
 */
export function chatSpaceKinder() {
  const kinder = kinderVon(BLATTWERK_SPACE);
  return kinder.length ? [...kinder, ...kinder.flatMap(kinderVon)] : [];
}
/** Die Räume im WhatsApp-Ordner — die Liste zeigt sie als einen Eintrag. */
export const chatOrdnerKinder = () => kinderVon(WHATSAPP_SPACE);

export function chatRaeume() {
  if (!client) return [];
  const direkt = direktRaeume();
  return client.getRooms().map((r) => chatRohRaum(r, { ich: sitzung.userId, direkt }));
}

/** Reaktionen auf ein Ereignis: [{ zeichen, anzahl, eigeneId }] — eigeneId braucht das Zurücknehmen. */
function reaktionenVon(raum, ereignisId) {
  const bez = raum.relations?.getChildEventsForEvent(ereignisId, "m.annotation", "m.reaction");
  if (!bez) return [];
  const proZeichen = new Map();
  for (const r of bez.getRelations()) {
    if (r.isRedacted()) continue;
    const zeichen = r.getContent()?.["m.relates_to"]?.key;
    if (!zeichen) continue;
    const e = proZeichen.get(zeichen) || { zeichen, anzahl: 0, eigeneId: null };
    e.anzahl++;
    if (r.getSender() === sitzung.userId) e.eigeneId = r.getId();
    proZeichen.set(zeichen, e);
  }
  return [...proZeichen.values()];
}

export function chatEreignisse(raumId) {
  const raum = client?.getRoom(raumId);
  if (!raum) return [];
  return raum.getLiveTimeline().getEvents().map((ev) => ({ ...chatRohEreignis(ev), reaktionen: reaktionenVon(raum, ev.getId()) }));
}

export const chatRaumInfo = (raumId) => {
  const raum = client?.getRoom(raumId);
  return raum ? chatRohRaum(raum, { ich: sitzung.userId, direkt: direktRaeume() }) : null;
};

// ── Start / Stopp ───────────────────────────────────────────────────────────
const kryptoCallbacks = {
  // Wird vom SDK gerufen, wenn es den Schlüssel des Geheimnisspeichers braucht
  // — bei uns nur während chatMitSchluesselVerifizieren().
  getSecretStorageKey: async ({ keys }) => {
    if (geheimNeu) return Object.keys(keys).includes(geheimNeu.id) ? [geheimNeu.id, geheimNeu.key] : null;
    if (!geheimEingabe) return null;
    for (const [id, info] of Object.entries(keys)) {
      const kandidaten = [];
      try { kandidaten.push(sdk.krypto.decodeRecoveryKey(geheimEingabe)); } catch (_) { /* kein Sicherheitsschlüssel */ }
      if (info.passphrase) {
        try { kandidaten.push(await sdk.krypto.deriveRecoveryKeyFromPassphrase(geheimEingabe, info.passphrase.salt, info.passphrase.iterations)); } catch (_) {}
      }
      for (const k of kandidaten) if (await client.secretStorage.checkKey(k, info)) return [id, k];
    }
    return null;
  },
  // Die Ersteinrichtung legt den Geheimnisspeicher selbst an — das SDK reicht
  // den frischen Schlüssel hier herein und fragt ihn gleich darauf oben ab.
  cacheSecretStorageKey: (id, _info, key) => { if (geheimNeu) geheimNeu = { id, key }; },
};

async function sdkLaden() {
  if (sdk) return sdk;
  const [haupt, krypto, protokoll] = await Promise.all([import("matrix-js-sdk"), import("matrix-js-sdk/lib/crypto-api/index.js"), import("matrix-js-sdk/lib/logger.js")]);
  // Das SDK schreibt sonst Tausende Debug-Zeilen je Sync in die Konsole.
  protokoll.logger.setLevel("warn");
  sdk = { ...haupt, krypto };
  return sdk;
}

/**
 * Fragt den Server VOR dem Sync, welche Räume zu Blattwerk gehören (drei kleine
 * Abrufe statt eines Syncs über das ganze Konto). Jeder Fehler heißt: keine
 * Grenze — der Chat soll dann langsam gehen statt gar nicht.
 */
async function blattwerkRaeume() {
  const hs = sitzung.homeserver, kopf = { headers: { Authorization: `Bearer ${sitzung.accessToken}` } };
  const hole = async (pfad) => { const r = await fetch(hs + pfad, kopf); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const sp = encodeURIComponent(BLATTWERK_SPACE);
  try {
    const [baum, leute, direkt] = await Promise.all([
      // Der Server liefert je Seite höchstens 50 Räume; mit dem WhatsApp-Ordner werden es mehr.
      (async () => {
        const rooms = [];
        let von = "";
        for (let seite = 0; seite < 20; seite++) {
          const b = await hole(`/_matrix/client/v1/rooms/${sp}/hierarchy?max_depth=2&limit=50${von ? `&from=${encodeURIComponent(von)}` : ""}`);
          rooms.push(...(b.rooms || []));
          if (!b.next_batch) break;
          von = b.next_batch;
        }
        return { rooms };
      })(),
      hole(`/_matrix/client/v3/rooms/${sp}/joined_members`),
      hole(`/_matrix/client/v3/user/${encodeURIComponent(sitzung.userId)}/account_data/m.direct`).catch(() => ({})),
    ]);
    return chatSyncRaeume({
      space: BLATTWERK_SPACE, kinder: (baum.rooms || []).map((r) => r.room_id).filter((id) => id !== BLATTWERK_SPACE),
      mitglieder: Object.keys(leute.joined || {}), direkt, telefonRaum: TELEFON_RAUM,
    });
  } catch { return null; }
}

/**
 * Wartet höchstens `ms` auf `p`. Ein hängender Nebenschritt (Räume abfragen,
 * alten Speicher löschen) darf den Chat nicht aufhalten — am Handy stand er am
 * 19.09.2026 minutenlang bei „Chat wird geladen …", ohne Fehler und ohne dass
 * von außen zu sehen war, wo.
 */
const hoechstens = (p, ms, ersatz) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(ersatz), ms))]);
/** Für die Hauptschritte: nach `ms` ein sprechender Fehler statt ewigem Kreisel. */
const mitFrist = (p, ms, was) => Promise.race([p, new Promise((_, nein) => setTimeout(() => nein(new Error(`${was} antwortet nicht (nach ${Math.round(ms / 1000)} s abgebrochen)`)), ms))]);
const schritt = (text) => melden({ schritt: text });

const RAEUME_KEY = "blattwerk_chat_sync_raeume";
const raeumeLesen = () => { try { const r = JSON.parse(localStorage.getItem(RAEUME_KEY) || "null"); return Array.isArray(r) && r.length ? r : null; } catch { return null; } };
const raeumeMerken = (r) => { try { localStorage.setItem(RAEUME_KEY, JSON.stringify(r)); } catch (_) {} };

let startLaeuft = null;
export function chatStarten(neueSitzung) {
  if (client && sitzung?.deviceId === neueSitzung.deviceId) return Promise.resolve();
  if (startLaeuft) return startLaeuft;
  startLaeuft = (async () => {
    sitzung = neueSitzung;
    melden({ phase: "startet", fehler: "" });
    try {
      schritt("Chat-Programm laden");
      const s = await mitFrist(sdkLaden(), 15000, "Das Chat-Programm");
      // Die Raumliste für den Sync-Filter kommt aus dem Merker — die Abfrage
      // läuft NEBENHER und gilt ab dem nächsten Start (ändert sie sich, startet
      // der Sync gleich neu). Nur beim allerersten Mal wird kurz gewartet.
      // Ansage Inhaber 19.09.2026: mehr als 15 s sind nicht hinnehmbar, Ziel 5 s.
      const gemerkt = raeumeLesen();
      const frisch = blattwerkRaeume().then((r) => { if (r) raeumeMerken(r); return r; });
      if (!gemerkt) schritt("Blattwerk-Räume abfragen");
      const altLoeschen = SYNC_DB_ALT.map((n) => new Promise((ok) => { const r = window.indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => ok(); }));
      const [raeume] = await Promise.all([gemerkt ? gemerkt : hoechstens(frisch, 5000, null), hoechstens(Promise.all(altLoeschen), 2000)]);
      const store = new s.IndexedDBStore({ indexedDB: window.indexedDB, localStorage: window.localStorage, dbName: SYNC_DB });
      client = s.createClient({
        baseUrl: sitzung.homeserver, userId: sitzung.userId, deviceId: sitzung.deviceId, accessToken: sitzung.accessToken,
        store, timelineSupport: true, cryptoCallbacks: kryptoCallbacks,
      });
      // Reihenfolge ist Pflicht: das SDK weist startup() VOR createClient() ab
      // („must be called after assigning it to the client") — beim allerersten
      // Start mit leerer Datenbank fällt das nicht auf, ab dem zweiten schon
      // (Live-Test 19.09.2026).
      schritt("Nachrichtenspeicher öffnen");
      await mitFrist(store.startup(), 10000, "Der Nachrichtenspeicher");
      schritt("Verschlüsselung starten");
      await mitFrist(client.initRustCrypto({ cryptoDatabasePrefix: KRYPTO_PRAEFIX }), 15000, "Die Verschlüsselung");
      verdrahten(s);
      schritt(raeume ? `Mit dem Server abgleichen (${raeume.length} Räume)` : "Mit dem Server abgleichen (alle Räume)");
      const starten = (liste) => client.startClient({ lazyLoadMembers: true, initialSyncLimit: 30, filter: s.Filter.fromJson(sitzung.userId, undefined, chatSyncFilter(liste)) });
      await starten(raeume);
      // Neuer Raum im Space oder neuer Kollege: Sync mit der frischen Liste neu aufsetzen.
      if (gemerkt) frisch.then((neu) => {
        if (!neu || !client || JSON.stringify(neu) === JSON.stringify(gemerkt)) return;
        client.stopClient(); starten(neu).catch(() => {});
      });
    } catch (e) {
      try { client?.stopClient(); } catch (_) {}
      client = null;
      melden({ phase: "fehler", fehler: String(e?.message || e) });
    } finally { startLaeuft = null; }
  })();
  return startLaeuft;
}

/**
 * Neue Mitarbeitende: die Einladung in den Blattwerk-Space nimmt die App von
 * selbst an (feste Raum-Id, also nie eine fremde Einladung) und tritt dann den
 * Räumen bei, die Space-Mitgliedern offenstehen. Danach Sync neu aufsetzen —
 * der Filter kennt die neuen Räume sonst erst beim nächsten Start.
 */
let beitrittLaeuft = false;
async function spaceBeitreten() {
  if (beitrittLaeuft || !client) return;
  beitrittLaeuft = true;
  try {
    const stand = () => client.getRoom(BLATTWERK_SPACE)?.getMyMembership();
    // Noch nie im Space: der App-Server lädt dieses Konto ein (src/server/
    // chat-einladung.mjs). Die Einladung kann schon VOR der Antwort mit dem Sync
    // da sein (Live-Test 19.09.2026) — deshalb danach noch einmal nachsehen;
    // kommt sie später, führt MyMembership wieder hierher.
    if (!stand()) await fetch("/api/chat/einladen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: sitzung.userId }) });
    const eingeladen = stand() === "invite";
    if (eingeladen) await client.joinRoom(BLATTWERK_SPACE);
    else if (stand() !== "join") return;
    const baum = await client.getRoomHierarchy(BLATTWERK_SPACE, 50, 2); // 2: auch Räume in „Team"/„Verwaltung"
    const neu = chatBeitrittsRaeume(baum.rooms, Object.fromEntries(client.getRooms().map((r) => [r.roomId, r.getMyMembership()])));
    for (const id of neu) await client.joinRoom(id, { viaServers: [sitzung.userId.split(":").slice(1).join(":")] }).catch(() => {});
    if (neu.length || eingeladen) {
      const liste = await blattwerkRaeume();
      if (liste && client) { raeumeMerken(liste); client.stopClient(); await client.startClient({ lazyLoadMembers: true, initialSyncLimit: 30, filter: sdk.Filter.fromJson(sitzung.userId, undefined, chatSyncFilter(liste)) }); }
    }
  } catch (_) { /* nächster Start versucht es wieder */ } finally { beitrittLaeuft = false; }
}

function verdrahten(s) {
  client.on(s.ClientEvent.Sync, (zustand) => {
    if (zustand === "PREPARED" || zustand === "SYNCING") {
      if (stand.phase !== "bereit") {
        melden({ phase: "bereit", fehler: "" });
        chatKryptoPruefen();
        spaceBeitreten();
        // Mitglieder werden träge geladen — die des Space brauchen wir für die Direktchat-Auswahl.
        client.getRoom(BLATTWERK_SPACE)?.loadMembersIfNeeded().then(() => melden(), () => {});
      }
      else meldenGebuendelt();
    } else if (stand.phase !== "bereit" && (zustand === "RECONNECTING" || zustand === "CATCHUP")) {
      schritt("Server antwortet nicht — neuer Versuch …");
    } else if (zustand === "ERROR" && stand.phase !== "bereit") {
      melden({ phase: "fehler", fehler: "Keine Verbindung zum Chat-Server" });
    }
  });
  client.on(s.RoomEvent.MyMembership, (raum, neu) => { if (raum.roomId === BLATTWERK_SPACE && neu === "invite") spaceBeitreten(); });
  // Abgelaufenes oder entzogenes Token: die Sitzung ist wertlos, neu anmelden.
  client.on(s.HttpApiEvent.SessionLoggedOut, () => { chatVergessen(); });
  for (const name of [s.RoomEvent.Timeline, s.RoomEvent.Receipt, s.RoomEvent.Name, s.RoomEvent.MyMembership,
    s.RoomEvent.LocalEchoUpdated, s.RoomEvent.Redaction, s.MatrixEventEvent.Decrypted, s.MatrixEventEvent.Replaced, s.ClientEvent.AccountData]) {
    client.on(name, meldenGebuendelt);
  }
  // Ein anderes Gerät derselben Person bittet um Abgleich (z. B. „Sitzung
  // verifizieren" in Element) — annehmen wir von selbst, bestätigt wird erst
  // beim Emoji-Vergleich. Anfragen FREMDER Personen gehen die App nichts an.
  client.on(s.krypto.CryptoEvent.VerificationRequestReceived, (anfrage) => {
    if (!anfrage.isSelfVerification || abgleich) return;
    abgleichVerfolgen(anfrage);
    anfrage.accept().catch((e) => abgleichEnde("abgebrochen", e));
  });
  // Nach dem Abgleich schickt das andere Gerät den Sicherungsschlüssel — erst
  // dann lassen sich die alten Nachrichten holen.
  client.on(s.krypto.CryptoEvent.KeyBackupDecryptionKeyCached, () => { sicherungNachziehen(); });

  // Telefon: Klingeln und Statuszeilen des ☎-Raums (vorher die postMessage-
  // Brücke ins Element-iframe, siehe src/chat-proxy.js).
  client.on(s.RoomEvent.Timeline, (ev, raum, nachOben) => {
    if (nachOben || !raum || raum.roomId !== TELEFON_RAUM) return;
    const typ = ev.getType(), inhalt = ev.getContent() || {}, alterMs = Date.now() - ev.getTs();
    const meldung = typ === KLINGEL_EVENT ? { typ: "klingeln", inhalt, alterMs }
      : typ === "m.room.message" && inhalt.msgtype === "m.text" ? { typ: "nachricht", text: String(inhalt.body || ""), von: ev.getSender(), alterMs } : null;
    if (meldung) for (const f of telefonHoerer) f(meldung);
  });
}

function aufraeumen() {
  for (const p of medienCache.values()) p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
  medienCache.clear();
  if (client) { try { client.stopClient(); client.removeAllListeners(); } catch (_) {} }
  client = null;
  abgleich = null;
}

/** Sitzung lokal verwerfen (Token ungültig). Die Schlüssel bleiben — dasselbe Gerät kann nicht wiederkommen, aber löschen wäre endgültig. */
function chatVergessen() {
  aufraeumen();
  sitzung = null;
  melden({ phase: "abgemeldet", krypto: null, abgleich: null });
}

/** Richtig abmelden: Gerät am Server löschen, lokale Speicher leeren. */
export async function chatAbmelden() {
  const c = client;
  try { if (c) await c.logout(true); } catch (_) {}
  try { if (c) await c.clearStores(); } catch (_) {}
  chatVergessen();
}

// ── Lesen und Schreiben ─────────────────────────────────────────────────────
const raumOderFehler = (raumId) => { const r = client?.getRoom(raumId); if (!r) throw new Error("Raum nicht geladen"); return r; };

/** Ältere Nachrichten nachladen. `false` heißt: der Anfang des Raums ist erreicht. */
export async function chatAeltereLaden(raumId, anzahl = 30) {
  const raum = raumOderFehler(raumId);
  if (!raum.getLiveTimeline().getPaginationToken("b")) return false;
  await client.scrollback(raum, anzahl);
  melden();
  return !!raum.getLiveTimeline().getPaginationToken("b");
}

export async function chatSenden(raumId, text, { antwortAuf = null } = {}) {
  const body = String(text || "").trim();
  if (!body) return;
  const inhalt = { msgtype: "m.text", body };
  if (antwortAuf) inhalt["m.relates_to"] = { "m.in_reply_to": { event_id: antwortAuf } };
  await client.sendMessage(raumId, inhalt);
}

const bildMasse = async (datei) => {
  try { const b = await createImageBitmap(datei); const m = { w: b.width, h: b.height }; b.close?.(); return m; } catch { return {}; }
};

/** Datei senden — in verschlüsselten Räumen wird sie VOR dem Hochladen verschlüsselt. */
export async function chatDateiSenden(raumId, datei, { unterschrift = "" } = {}) {
  const raum = raumOderFehler(raumId);
  const mime = datei.type || "application/octet-stream";
  const msgtype = chatMsgtypFuer(mime);
  const info = { mimetype: mime, size: datei.size, ...(msgtype === "m.image" ? await bildMasse(datei) : {}) };
  const inhalt = { msgtype, body: unterschrift || datei.name, filename: datei.name, info };
  if (raum.hasEncryptionStateEvent()) {
    const zu = await encryptAttachment(await datei.arrayBuffer());
    const hoch = await client.uploadContent(new Blob([zu.data], { type: "application/octet-stream" }), { type: "application/octet-stream", name: datei.name });
    inhalt.file = { ...zu.info, url: hoch.content_uri };
  } else {
    const hoch = await client.uploadContent(datei, { type: mime, name: datei.name });
    inhalt.url = hoch.content_uri;
  }
  await client.sendMessage(raumId, inhalt);
}

export async function chatLoeschen(raumId, ereignisId) { await client.redactEvent(raumId, ereignisId); }

/** Reaktion setzen — oder zurücknehmen, wenn `eigeneId` die eigene Reaktion nennt. */
export async function chatReagieren(raumId, ereignisId, zeichen, eigeneId = null) {
  if (eigeneId) return client.redactEvent(raumId, eigeneId);
  return client.sendEvent(raumId, "m.reaction", { "m.relates_to": { rel_type: "m.annotation", event_id: ereignisId, key: zeichen } });
}

/** Eine nicht gesendete Nachricht erneut abschicken bzw. verwerfen. */
export async function chatErneutSenden(raumId, ereignisId, { verwerfen = false } = {}) {
  const raum = raumOderFehler(raumId);
  const ev = raum.getPendingEvents().find((e) => e.getId() === ereignisId) || raum.findEventById(ereignisId);
  if (!ev) return;
  if (verwerfen) client.cancelPendingEvent(ev); else await client.resendEvent(ev, raum);
  melden();
}

/** Den Raum bis zur letzten Nachricht als gelesen markieren. */
export async function chatGelesen(raumId) {
  const raum = client?.getRoom(raumId);
  const ereignisse = raum?.getLiveTimeline().getEvents() || [];
  const letztes = [...ereignisse].reverse().find((e) => e.getId()?.startsWith("$"));
  if (!letztes || raum.hasUserReadEvent(sitzung.userId, letztes.getId())) return;
  try { await client.sendReadReceipt(letztes); } catch (_) { /* Lesebestätigung ist nie einen Fehler wert */ }
}

export const chatBeitreten = (raumId) => client.joinRoom(raumId);
export const chatVerlassen = (raumId) => client.leave(raumId);

/**
 * Medium als blob-URL. Der Homeserver liefert Medien nur mit Zugriffstoken
 * (kein nacktes <img src>); verschlüsselte Anhänge werden hier entschlüsselt.
 * Von verschlüsselten gibt es kein Server-Vorschaubild — dann das Original.
 */
export function chatMedium(n, { vorschau = false } = {}) {
  if (!client || !n?.mxc) return Promise.resolve(null);
  const klein = vorschau && !n.datei;
  const schluessel = `${n.mxc}|${klein ? "v" : "o"}`;
  if (!medienCache.has(schluessel)) {
    const url = chatMedienUrl(sitzung.homeserver, n.mxc, klein ? { breite: 640, hoehe: 640 } : {});
    const p = (async () => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${client.getAccessToken()}` } });
      if (!r.ok) throw new Error(`Medium: Status ${r.status}`);
      let daten = await r.arrayBuffer();
      if (n.datei) daten = await decryptAttachment(daten, n.datei);
      return URL.createObjectURL(new Blob([daten], { type: n.mime || "application/octet-stream" }));
    })();
    p.catch(() => medienCache.delete(schluessel));
    medienCache.set(schluessel, p);
  }
  return medienCache.get(schluessel);
}

// ── Telefon (src/telefon.js erklärt den Ablauf) ─────────────────────────────
export const chatTelefonAbonnieren = (f) => { telefonHoerer.add(f); return () => telefonHoerer.delete(f); };
export async function chatTelefonSenden(text) {
  if (!client) throw new Error("Chat noch nicht bereit");
  await client.sendTextMessage(TELEFON_RAUM, String(text));
}
export async function chatOpenId() {
  if (!client) throw new Error("Chat noch nicht bereit");
  return { token: await client.getOpenIdToken(), deviceId: client.getDeviceId() };
}

// ── Verschlüsselung: ist dieses Gerät vertrauenswürdig? ─────────────────────
/**
 * krypto = { verifiziert, kontoHatCrossSigning, sicherung }
 * Unverifiziert heißt praktisch: alte verschlüsselte Nachrichten bleiben
 * unlesbar, und die anderen sehen ein rotes Schild an diesem Gerät.
 */
export async function chatKryptoPruefen() {
  const k = client?.getCrypto();
  if (!k) return null;
  try {
    const [geraet, konto, sicherung] = await Promise.all([
      k.getDeviceVerificationStatus(sitzung.userId, sitzung.deviceId),
      k.userHasCrossSigningKeys(sitzung.userId, true),
      k.getActiveSessionBackupVersion(),
    ]);
    const krypto = { verifiziert: !!geraet?.crossSigningVerified, kontoHatCrossSigning: !!konto, sicherung: !!sicherung };
    melden({ krypto });
    return krypto;
  } catch { return null; }
}

/** Nach jeder Art von Verifizierung: Schlüsselsicherung einschalten und alte Schlüssel holen. */
async function sicherungNachziehen() {
  const k = client.getCrypto();
  try { await k.checkKeyBackupAndEnable(); } catch (_) {}
  try { await k.restoreKeyBackup(); } catch (_) { /* ohne Sicherung kein Verlauf — kein Fehler */ }
  await chatKryptoPruefen();
  melden();
}

/** Weg 1: Sicherheitsschlüssel oder -phrase eintippen. */
export async function chatMitSchluesselVerifizieren(eingabe) {
  const k = client?.getCrypto();
  if (!k) throw new Error("Chat noch nicht bereit");
  // OHNE diese Prüfung würde bootstrapCrossSigning bei einem Konto ohne
  // hinterlegte Schlüssel NEUE anlegen — und damit alle anderen Geräte der
  // Person entwerten.
  if (!(await client.secretStorage.isStored("m.cross_signing.master"))) throw new Error("Für dieses Konto ist kein Sicherheitsschlüssel hinterlegt");
  geheimEingabe = String(eingabe || "").trim();
  try {
    const id = await client.secretStorage.getDefaultKeyId();
    const info = id && (await client.secretStorage.getKey(id))?.[1];
    if (!info || !(await kryptoCallbacks.getSecretStorageKey({ keys: { [id]: info } }))) throw new Error("Sicherheitsschlüssel passt nicht");
    await k.bootstrapCrossSigning({});
    await k.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => {});
  } finally { geheimEingabe = null; }
  await sicherungNachziehen();
}

/**
 * Ersteinrichtung für ein FRISCHES Konto (neue Mitarbeitende): Cross-Signing,
 * Geheimnisspeicher und Schlüsselsicherung anlegen — dieses Gerät wird damit
 * das erste verifizierte. Liefert den Sicherheitsschlüssel (einmal anzeigen +
 * hinterlegen, src/chat/hinterlegung.js). Für Konten MIT Cross-Signing
 * verboten: neue Schlüssel würden alle anderen Geräte der Person entwerten.
 */
export async function chatErsteinrichten() {
  const k = client?.getCrypto();
  if (!k) throw new Error("Chat noch nicht bereit");
  if ((await k.userHasCrossSigningKeys(sitzung.userId, true)) || (await client.secretStorage.hasKey())) throw new Error("Dieses Konto ist schon eingerichtet");
  const neu = await k.createRecoveryKeyFromPassphrase();
  geheimNeu = {};
  try {
    // Ohne Rückfrage: beim ERSTEN Hochladen verlangt der Server keine
    // Bestätigung. Verlangt er doch eine (es gäbe also schon Schlüssel),
    // scheitert das hier — gewollt.
    await k.bootstrapCrossSigning({ setupNewCrossSigning: true, authUploadDeviceSigningKeys: (senden) => senden(null) });
    await k.bootstrapSecretStorage({ setupNewSecretStorage: true, setupNewKeyBackup: true, createSecretStorageKey: async () => neu });
  } finally { geheimNeu = null; }
  await chatKryptoPruefen();
  return neu.encodedPrivateKey;
}

/**
 * Weg 2: Geheimnisse aus einer anderen Sitzung DESSELBEN Kontos übernehmen
 * (src/chat/uebernahme.js holt sie aus der Element-Instanz unter /chat/).
 * `buendel` = CryptoApi.exportSecretsBundle(), `raumSchluessel` =
 * exportRoomKeysAsJson() — beides öffentliche SDK-Schnittstellen.
 */
export async function chatGeheimnisseUebernehmen({ buendel, raumSchluessel }) {
  const k = client?.getCrypto();
  if (!k) throw new Error("Chat noch nicht bereit");
  if (buendel?.cross_signing) {
    await k.importSecretsBundle(buendel);
    await k.crossSignDevice(sitzung.deviceId);
  }
  if (raumSchluessel) await k.importRoomKeysAsJson(raumSchluessel);
  await sicherungNachziehen();
}

/**
 * Weg 3: Emoji-Abgleich mit einem schon verifizierten Gerät derselben Person
 * (Element am PC, Element X am Handy). Der Sicherheitsschlüssel liegt bei den
 * wenigsten griffbereit, und verschicken lässt er sich nicht — der Server
 * kennt ihn nicht (Frage Inhaber 19.09.2026).
 *
 * stand.abgleich = null | { phase: "wartet" | "emoji" | "prueft" | "fertig" | "abgebrochen", emojis, grund }
 */

function abgleichEnde(phase, fehler) {
  abgleich = null;
  melden({ abgleich: { phase, emojis: [], grund: fehler ? String(fehler.message || fehler) : "" } });
  if (phase === "fertig") sicherungNachziehen();
}

function abgleichVerfolgen(anfrage) {
  const { VerificationPhase, VerificationRequestEvent, VerifierEvent } = sdk.krypto;
  abgleich = { anfrage, sas: null, pruefer: null };
  melden({ abgleich: { phase: "wartet", emojis: [], grund: "" } });
  const pruefen = (p) => {
    if (!abgleich || abgleich.pruefer === p) return;
    abgleich.pruefer = p;
    p.on(VerifierEvent.ShowSas, (sas) => {
      if (!abgleich) return;
      abgleich.sas = sas;
      melden({ abgleich: { phase: "emoji", emojis: chatSasEmojis(sas.sas.emoji), grund: "" } });
    });
    p.verify().then(() => abgleichEnde("fertig"), (e) => abgleichEnde("abgebrochen", e));
    const schon = p.getShowSasCallbacks?.();
    if (schon) { abgleich.sas = schon; melden({ abgleich: { phase: "emoji", emojis: chatSasEmojis(schon.sas.emoji), grund: "" } }); }
  };
  const beiWechsel = async () => {
    if (!abgleich || abgleich.anfrage !== anfrage) return;
    if (anfrage.phase === VerificationPhase.Cancelled) return abgleichEnde("abgebrochen", new Error("Vom anderen Gerät abgebrochen oder abgelaufen"));
    if (anfrage.phase === VerificationPhase.Done) return abgleichEnde("fertig");
    if (anfrage.verifier) return pruefen(anfrage.verifier);
    // Bereit und WIR haben gefragt: den Emoji-Weg selbst anstoßen. Hat das andere
    // Gerät gefragt, stößt es ihn an (sonst starten beide und einer verliert).
    if (anfrage.phase === VerificationPhase.Ready && anfrage.initiatedByMe && !abgleich.gestartet) {
      abgleich.gestartet = true;
      try { pruefen(await anfrage.startVerification("m.sas.v1")); } catch (e) { abgleichEnde("abgebrochen", e); }
    }
  };
  anfrage.on(VerificationRequestEvent.Change, beiWechsel);
  beiWechsel();
}

export async function chatAbgleichStarten() {
  const k = client?.getCrypto();
  if (!k) throw new Error("Chat noch nicht bereit");
  if (abgleich) return;
  abgleichVerfolgen(await k.requestOwnUserVerification());
}
/** Die Emojis stimmen überein. */
export async function chatAbgleichBestaetigen() {
  if (!abgleich?.sas) return;
  melden({ abgleich: { ...stand.abgleich, phase: "prueft" } });
  try { await abgleich.sas.confirm(); } catch (e) { abgleichEnde("abgebrochen", e); }
}
/** Stimmen NICHT überein (dann hängt jemand dazwischen) bzw. einfach abbrechen. */
export function chatAbgleichAbbrechen({ stimmtNicht = false } = {}) {
  const a = abgleich;
  if (a?.sas && stimmtNicht) { try { a.sas.mismatch(); } catch (_) {} }
  else if (a?.anfrage) a.anfrage.cancel().catch(() => {});
  abgleichEnde("abgebrochen", stimmtNicht ? new Error("Emojis stimmen nicht überein") : null);
}
export const chatAbgleichSchliessen = () => melden({ abgleich: null });

/**
 * Notausgang, wenn der Chat nicht hochkommt: lokale Chat-Speicher löschen
 * (Nachrichten- UND Schlüsselspeicher). Die Anmeldung bleibt, aber das Gerät
 * verliert seine Schlüssel — danach ist wieder ein Abgleich nötig. Löscht nie
 * Elements Speicher (andere Namen).
 */
export async function chatSpeicherZuruecksetzen() {
  aufraeumen();
  const namen = (await window.indexedDB.databases?.().catch(() => []) || []).map((d) => d.name).filter((n) => /blattwerk-chat/.test(n || ""));
  await hoechstens(Promise.all(namen.map((n) => new Promise((ok) => { const r = window.indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => ok(); }))), 5000);
  melden({ phase: "aus", schritt: "", fehler: "" });
  return namen;
}

