// Blattwerk-App Server
//
// Zweck:
//   (a) Liefert die gebaute Web-App aus (./dist)
//   (b) Nextcloud-Proxy unter /api/nc/* – läuft serverseitig, daher KEIN CORS:
//       - POST /api/nc/login/start  { server }            -> Login Flow v2 starten
//       - POST /api/nc/login/poll   { endpoint, token }   -> App-Passwort abholen
//       - POST /api/nc/calendars    { server,user,pass }  -> Kalender auflisten (PROPFIND)
//       - POST /api/nc/event        { ...creds, calendarUrl, event } -> Termin PUT (upsert)
//       - POST /api/nc/event/delete { ...creds, calendarUrl, uid, href? } -> Termin DELETE
//       - POST /api/nc/events       { ...creds, calendarUrl, startSec, endSec } -> Termine lesen (REPORT)
//       - POST /api/nc/subscribe-url { ...creds, calendarUrl, create? } -> Abo-Link (publish-URL) lesen/erzeugen
//       - POST /api/nc/share-group  { ...creds, calendarUrl, group }    -> Kalender für NC-Gruppe freigeben
//       - POST /api/nc/arbeitsschutz-list { ...creds }                  -> Grundsatzunterlagen (PDF) auflisten
//       - POST /api/nc/arbeitsschutz-file { ...creds, filename }        -> eine davon laden
//       - POST /api/nc/einweisungen       { ...creds }                  -> Einweisungsnachweise lesen
//       - POST /api/nc/einweisungen/save  { ...creds, eintrag, pdfBase64, dateiname }
//                                                                        -> Protokoll ablegen, Nachweis anhängen,
//                                                                           Kalendertermin, Paperless-Zweitablage
//       - POST /api/nc/tutorial           { ...creds }                  -> Tutorial-Abschluss lesen
//       - POST /api/nc/tutorial/save      { ...creds, login, fassung, uebersprungen? } -> Abschluss eintragen (additiv, If-Match)
//       - POST /api/nc/anlagen            { ...creds }                  -> Anlagen-Konfiguration (Nutzungsdauer je Geraet) lesen
//       - POST /api/nc/anlagen/save       { ...creds, key, konfig }     -> Konfiguration eines Geraets setzen (additiv, If-Match)
//       - POST /api/nc/fahrtenbuch        { ...creds }                  -> Fahrtenbuch lesen
//       - POST /api/nc/fahrtenbuch/save   { ...creds, login, fahrt?, grund?, fahrzeug? } -> Fahrt/Fahrzeug eintragen (additiv, If-Match)
//       - POST /api/nc/ueberlassungen      { ...creds }                  -> Fahrzeug-Ueberlassungsvereinbarungen lesen
//       - POST /api/nc/ueberlassungen/save { ...creds, login, vereinbarung, pdfBase64, dateiname } -> eintragen + PDF ablegen
//       - POST /api/nc/ueberlassungen/widerruf { ...creds, login, id, grund } -> widerrufen (bleibt in der Liste)
//       - POST /api/nc/ueberlassungen/datei { ...creds, jahr, datei }  -> abgelegtes PDF holen
//
// Zugangsdaten: Wer sich einmal selbst angemeldet hat, schickt seine
// Nextcloud-Zugangsdaten (loginName/appPassword) weiterhin pro Anfrage mit.
// Alle anderen bekommen sie vom Server eingesetzt (`ncBody`) — entweder aus dem
// SSO-Speicher oder, wenn dort nichts liegt, vom Dienstkonto des Team-Kalenders
// (ENV SSO_NC_TEAM_USER/PASS/CAL). Dessen Passwort wird bewusst NIE an die App
// ausgeliefert: es gehoert dem Besitzer-Konto des Kalenders.
// Node 18+ (global fetch) erforderlich.

import compression from "compression";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import tls from "tls";
import { fileURLToPath, pathToFileURL } from "url";
// Fristenrechnung fuer Einweisungen liegt bei der App, nicht doppelt hier:
// derselbe Code entscheidet in der Anzeige und beim Speichern, sonst driften
// die beiden Antworten auf „wann ist das wieder faellig" auseinander.
import { Readable } from "stream";
import { ewFaelligAm, ewFaelligkeiten, ewFehlt, ewGeraet, ewParse, ewUid } from "./src/arbeitsschutz.js";
import { FB_STORE_LEER, fahrtEintragen, fahrzeugEintragen, kettePruefen } from "./src/fahrtenbuch.js";
import { TSA_URL_DEFAULT, tsqBauen, tsrStatus } from "./src/zeitstempel.js";
import { DOLIBARR_URL_DEFAULT, migriereDolibarrUrl } from "./src/verbindung.js";
import { intern } from "./src/intern.js";
import { UEB_STORE_LEER, uebDateiname, uebEintragen, uebWiderrufen } from "./src/ueberlassung.js";
import { versionInfo, instanzenPruefen, versionUrl, versionZeile, versionenHtml } from "./src/version.js";
import { istMandantAdmin, arbeitsschutzEmpfaenger, bestellEmpfaenger, bestellWache, blockWache, chatUpstream, funktionWache, htmlMitMandant, manifestFuer, mandantHandler, paperlessBasis, paperlessFunktionWache, paperlessNamen, wachePaperless } from "./src/mandant-server.mjs";
import { startPruefen } from "./scripts/mandant/env-pruefen.mjs";
// ncPfadPruefen (ebenfalls in src/mandant.js) wird hier bewusst NICHT
// importiert: kein /api/nc/*-Endpunkt nimmt einen vollstaendigen Pfad vom
// Client entgegen (dokumente-* bekommen nur EIN Ordner-/Dateinamen-Segment,
// von dokSafe ohnehin ohne Trenner; ueberlassungen/datei prueft jahr/datei
// eigens). Kaeme ein Endpunkt hinzu, der einen Pfad aus der Anfrage
// uebernimmt, muesste er hier mit ncPfadPruefen(mandantJetzt(), pfad) prüfen.
import { blockAktiv, ncOrdner } from "./src/mandant.js";
import { BANK_OFFEN_LEER, BANK_REGELN_LEER, bankOffenNorm, bankRegelnNorm, bankErledigtEintragen } from "./src/bank.js";
import { APP_KOSTUEM_JS, APP_KOSTUEM_PFAD, APP_RUECKKEHR_JS, APP_RUECKKEHR_PFAD, CHAT_UPSTREAM_STANDARD, chatAnfrageHeader, chatAntwortHeader, chatIndexUmschreiben, chatIstIndex } from "./src/chat-proxy.js";
import { PL_THEMA, PL_THEMA_UNTERWEISUNG, PL_THEMA_FUNKTION, plDuplikat, plKurz, plListeQuery, plPruefsummeQuery } from "./src/paperless.js";
import { PL_ALLE, PL_BELEG_TAG, PL_QUELLE_APP } from "./src/paperless.js";
import { dolibarrGruppenLader, plAlleWache } from "./src/pl-rechte.mjs";
import { qualiErinnerungAnzahl, qualiErinnerungHtml } from "./src/server/qualifikationen.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");
const PORT = process.env.PORT || 3000;

// Exportiert (nur fuer Tests relevant): test/mandant/kodierung.test.js startet
// damit einen echten http.createServer(app) gegen eine Mock-WebDAV, um die
// tatsaechlich angefragten URLs zu pruefen statt nur den Quelltext nach einem
// Textmuster zu durchsuchen (Fix Round 2, 2026-09-18).
export const app = express();
app.set("trust proxy", true);
// Das Frontend-Bundle geht sonst unkomprimiert ueber die Leitung (608 KB statt
// rund 150 KB). Im LAN faellt das kaum auf, ueber NetBird/Mobilfunk sehr wohl.
app.use(compression());
app.use(express.json({ limit: "30mb" }));

// CORS (für Dev/Browser unkritisch, da Zugangsdaten im Body, keine Cookies)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- Helfer ----------
export const trimSlash = (u) => (u || "").trim().replace(/\/+$/, "");

// Kalender-Umzug 06.08.2026: der Blattwerk-Kalender gehoert nicht mehr des Inhabers
// Privatkonto, sondern dem Besitzer-Konto `blattwerk-kalender` (Nextcloud kennt
// keinen besitzerlosen Kalender). Geraete haben die alte Adresse in ihrer
// localStorage-Konfiguration stehen und wuerden sonst still in den alten,
// nicht mehr gepflegten Kalender schreiben.
//
// Umgebogen wird nur der letzte Pfadteil, der Benutzer im Pfad bleibt stehen:
// jede Person greift auf ihre EIGENE Freigabe-Sicht zu, nicht auf den Pfad des
// Besitzers - die Zugangsdaten kommen hier ja pro Person mit.
// Name des alten privaten Kalenders — echter Wert kommt aus VITE_NC_ALTER_KALENDER_NAME
// (src/intern.js, muss mit dolibarr-app.jsx uebereinstimmen), nie im Quelltext.
const NC_ALTER_KALENDER_NAME = intern("NC_ALTER_KALENDER_NAME", "blattwerk_shared_by_max");
export const BLATTWERK_KALENDER_ALT = new RegExp(
  `^(.*\\/remote\\.php\\/dav\\/calendars\\/[^/]+\\/)(blattwerk|${NC_ALTER_KALENDER_NAME})$`
);

export function resolveCalendarUrl(url) {
  const base = trimSlash(url);
  const m = base.match(BLATTWERK_KALENDER_ALT);
  if (!m) return base;
  // Der Besitzer selbst benutzt weiterhin seinen eigenen, echten Pfad.
  if (m[1].endsWith("/blattwerk-kalender/")) return base;
  return m[1] + "blattwerk_shared_by_blattwerk-kalender";
}

// Einmal zentral statt an jedem der elf Aufrufe: alle /api/nc/*-Endpunkte
// arbeiten ab hier mit der aktuellen Adresse.
app.use("/api/nc", (req, _res, next) => {
  if (req.body && typeof req.body.calendarUrl === "string") {
    req.body.calendarUrl = resolveCalendarUrl(req.body.calendarUrl);
  }
  next();
});
export const authHeader = (user, pass) =>
  "Basic " + Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
const pad = (n) => String(n).padStart(2, "0");
const icsStampUtc = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsEsc = (s) =>
  (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function buildIcs(ev) {
  // ev: { uid, title, startSec, endSec, allDay, location, note }
  const start = new Date((ev.startSec || 0) * 1000);
  const end = new Date(((ev.endSec || ev.startSec || 0)) * 1000);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blattwerk//DoliMobile//DE", "BEGIN:VEVENT"];
  lines.push("UID:" + ev.uid);
  lines.push("DTSTAMP:" + icsStampUtc(new Date()));
  if (ev.allDay) {
    const dOnly = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    const endNext = new Date(start.getTime() + 24 * 3600 * 1000);
    lines.push("DTSTART;VALUE=DATE:" + dOnly(start));
    lines.push("DTEND;VALUE=DATE:" + dOnly(ev.endSec ? end : endNext));
  } else {
    lines.push("DTSTART:" + icsStampUtc(start));
    lines.push("DTEND:" + icsStampUtc(end > start ? end : new Date(start.getTime() + 3600 * 1000)));
  }
  lines.push("SUMMARY:" + icsEsc(ev.title));
  if (ev.location) lines.push("LOCATION:" + icsEsc(ev.location));
  if (ev.note) lines.push("DESCRIPTION:" + icsEsc(ev.note));
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// Sehr toleranter PROPFIND-Parser (Nextcloud-Antwort, Präfixe variieren)
function parseCalendars(xml, serverBase) {
  const out = [];
  const blocks = xml.match(/<[a-z0-9]*:?response[\s>][\s\S]*?<\/[a-z0-9]*:?response>/gi) || [];
  for (const b of blocks) {
    // nur echte Kalender (resourcetype enthält <cal:calendar/>)
    if (!/<[a-z0-9]*:?calendar\b[^>]*\/?>/i.test(b)) continue;
    const href = (b.match(/<[a-z0-9]*:?href>\s*([^<]+?)\s*<\/[a-z0-9]*:?href>/i) || [])[1];
    if (!href) continue;
    // unterstützt VEVENT? (wenn comp-Liste vorhanden, muss VEVENT dabei sein)
    const comps = b.match(/<[a-z0-9]*:?comp\b[^>]*name="([^"]+)"/gi) || [];
    if (comps.length && !comps.some((c) => /name="VEVENT"/i.test(c))) continue;
    const dn = (b.match(/<[a-z0-9]*:?displayname>\s*([\s\S]*?)\s*<\/[a-z0-9]*:?displayname>/i) || [])[1] || "";
    let color = (b.match(/calendar-color>\s*(#[0-9a-fA-F]{3,8})/i) || [])[1] || "";
    if (color) color = color.slice(0, 7);
    const privBlock = (b.match(/current-user-privilege-set[\s\S]*?<\/[a-z0-9]*:?current-user-privilege-set>/i) || [])[0] || "";
    const writable = /<[a-z0-9]*:?(write|write-content|all)\b/i.test(privBlock);
    let url;
    try { url = new URL(href, serverBase).href; } catch { url = href; }
    const name = dn.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || decodeURIComponent(href.replace(/\/$/, "").split("/").pop());
    out.push({ name, url, color, writable });
  }
  return out;
}

// ---------- SSO-Auto-Konfiguration ----------
// Die App läuft hinter Authentik-Forward-Auth (NPM reicht X-authentik-* durch).
// SSO_DOLIBARR_KEYS (Coolify-ENV) mappt Authentik-Usernamen auf Dolibarr-API-Keys:
//   SSO_DOLIBARR_KEYS='{"partner":"<key>","max@example.org":"<key>"}'
// Header nur vom NPM (.30) akzeptieren: Direktzugriff auf :8088 umgeht Authentik,
// dort wäre X-authentik-username frei fälschbar -> Key-Disclosure.
const SSO_TRUSTED_IPS = (process.env.SSO_TRUSTED_PROXY_IPS || "203.0.113.30")
  .split(",").map((s) => s.trim()).filter(Boolean);
export const ssoUser = (req) => {
  const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  return SSO_TRUSTED_IPS.includes(ip) ? req.headers["x-authentik-username"] || null : null;
};
// Persistenter Key-Store: einmal im LoginScreen eingetragen -> für den
// Authentik-Nutzer gespeichert -> jedes weitere Gerät konfiguriert sich selbst.
// In Coolify ein Persistent-Storage-Volume auf /data mounten, sonst geht die
// Datei beim Redeploy verloren (ENV SSO_DOLIBARR_KEYS bleibt als Fallback).
const SSO_STORE_FILE = process.env.SSO_STORE_FILE || "/data/sso-dolibarr.json";
const ssoStoreLoad = () => {
  try { return JSON.parse(fs.readFileSync(SSO_STORE_FILE, "utf8")); } catch (_) { return {}; }
};
const ssoLookup = (username) => {
  if (!username) return null;
  const stored = ssoStoreLoad()[username];
  // Umzug 09.09.2026: im /data-Store und in der Env kann noch der alte Host
  // stehen — beim Lesen umschreiben, damit kein Geraet die alte Adresse bekommt.
  if (stored && stored.url && stored.key) return { url: migriereDolibarrUrl(stored.url).url, key: stored.key };
  let keys = {};
  try { keys = JSON.parse(process.env.SSO_DOLIBARR_KEYS || "{}"); } catch (_) {}
  if (keys[username]) {
    return { url: migriereDolibarrUrl(process.env.SSO_DOLIBARR_URL || DOLIBARR_URL_DEFAULT).url, key: keys[username] };
  }
  return null;
};
// Nextcloud-Kalenderzugang pro Authentik-Nutzer (analog zum Dolibarr-Key):
// einmal in einem beliebigen Gerät angemeldet -> für jeden neuen Login/Client
// automatisch da, auch nach Profil-Reset. Liegt im selben /data-Store.
const ssoLookupNc = (username) => {
  if (!username) return null;
  const nc = (ssoStoreLoad()[username] || {}).nextcloud;
  if (nc && nc.server && nc.user && nc.pass) return nc;
  return null;
};
// Team-Kalender ohne Anmeldung am Geraet: hat ein Nutzer keinen eigenen
// Nextcloud-Zugang hinterlegt, arbeitet der Server mit dem Dienstkonto, dem der
// Team-Kalender gehoert. Die Zu-/Absagen leiden darunter NICHT — die stehen als
// ATTENDEE-Zeile mit Name und Mail aus Dolibarr im Termin (siehe ncRsvpEvent),
// das CalDAV-Konto ist nur der Transportweg.
// Ab Task 11 kann eine Firma ihr Dienstkonto (Benutzername + Kalenderadresse,
// optional ein eigener Anzeigename) in mandant.json hinterlegen
// (`nextcloud.dienstkonto`) statt Blattwerks feste ENV-Werte zu erben — damit
// muss niemand am Geraet tippen, auch nicht bei der ersten Firma nach
// Blattwerk. Das PASSWORT bleibt bewusst IMMER in der Umgebung
// (SSO_NC_TEAM_PASS) bzw. im Server-Store: mandant.json ist eine Datei, die
// ein Mandanten-Admin per PUT /api/mandant schreiben kann, und das
// Dienstkonto-Passwort ist das Besitzer-Konto des Team-Kalenders (siehe
// Kommentar oben an ncManaged). `mandantJetzt` wird erst weiter unten in der
// Datei deklariert (`const mandant = mandantHandler(...)`) — das ist hier
// unbedenklich, weil ncTeamCreds() selbst nie beim Modul-Laden aufgerufen
// wird, sondern erst bei einer echten Anfrage, wenn die ganze Datei laengst
// ausgewertet ist.
export const ncTeamCreds = () => {
  const konto = mandantJetzt().nextcloud?.dienstkonto || {};
  const user = konto.user || process.env.SSO_NC_TEAM_USER;
  const pass = process.env.SSO_NC_TEAM_PASS;
  const calendarUrl = trimSlash(konto.calendarUrl) || trimSlash(process.env.SSO_NC_TEAM_CAL);
  if (!user || !pass || !calendarUrl) return null;
  return {
    server: trimSlash(process.env.SSO_NEXTCLOUD_SERVER || "https://nextcloud.example.org"),
    user, pass, calendarUrl: calendarUrl + "/",
    calendarName: konto.calendarName || process.env.SSO_NC_TEAM_NAME || "Blattwerk (Team)",
    enabled: true,
    // Markiert das Ergebnis als DAS gemeinsame Dienstkonto der Firma, nicht
    // als jemandes persoenlicher, im SSO-Store hinterlegter Zugang (siehe
    // ssoLookupNc oben) — /api/sso/config reicht das als `team` weiter,
    // NextcloudPanel zeigt nur dann "zentral verwaltet" an (Task 11). Ohne
    // diese Unterscheidung liesse sich vom Client aus nicht sagen, ob ein
    // Geraet mit einem persoenlichen oder dem Firmen-Konto arbeitet — beide
    // liefern `managed:true`.
    team: true,
  };
};
/** Zugang, den der Server selbst kennt — eigener Zugang geht vor Dienstkonto. */
export const ncManaged = (req) => {
  const username = ssoUser(req);
  if (!username) return null; // ohne Authentik-Identitaet gibt der Server nichts her
  return ssoLookupNc(username) || ncTeamCreds();
};
// Die Zugangsdaten kommen vom Server, nicht aus der Anfrage. Das Passwort des
// Dienstkontos gehoert NICHT in die App: es ist das Besitzer-Konto des
// Team-Kalenders, wer es hat, kann den Kalender loeschen. Deshalb ueberschreibt
// der Server hier — die Werte aus dem Body dienen nur noch dem Erstanmelden
// (Login Flow v2), wo der Server den Nutzer noch nicht kennt.
export const ncBody = (req) => {
  const b = req.body || {};
  // Bringt das Geraet eigene Zugangsdaten mit, bleiben die unangetastet: sonst
  // wuerden bestehende Einrichtungen mit eigenem Nextcloud-Konto plaetzlich mit
  // dem Dienstkonto auf ihren privaten Kalender zugreifen — und scheitern.
  if (b.pass) return b;
  const m = ncManaged(req);
  return m ? { ...b, server: b.server || m.server, user: m.user, pass: m.pass } : b;
};
// Mandanten-Konfiguration: eine Datei je Instanz. Fehlt sie, gilt Blattwerk.
const MANDANT_DATEI = process.env.MANDANT_DATEI || "/data/mandant.json";
const mandant = mandantHandler({ datei: MANDANT_DATEI, ssoUser });
export const mandantJetzt = () => mandant.aktuell().mandant;
app.get("/api/mandant", (req, res) => mandant.get(req, res));
app.put("/api/mandant", (req, res) => mandant.put(req, res));

// Versionsauskunft + Übersicht über alle Instanzen (src/version.js).
// /api/version ist bewusst offen: nur Commit, Version, Kürzel, Startzeit — die
// Übersicht einer anderen Instanz und das Freigabe-Skript fragen hier ab.
const GESTARTET = new Date().toISOString();
const PKG_VERSION = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const versionJetzt = () => versionInfo({ env: process.env, pkgVersion: PKG_VERSION, mandant: mandantJetzt(), gestartet: GESTARTET });
app.get("/api/version", (_req, res) => res.json(versionJetzt()));
// Nur für MANDANT_ADMINS. Die Liste liegt als Datei neben mandant.json; die
// Adressen dürfen intern sein (http://host:port), dann stört kein Forward-Auth.
const INSTANZEN_DATEI = process.env.INSTANZEN_DATEI || "/data/instanzen.json";
app.get("/admin/versionen", async (req, res) => {
  if (!istMandantAdmin(ssoUser(req))) return res.status(403).send("Nur für Administratoren.");
  let liste = [];
  try { liste = instanzenPruefen(JSON.parse(process.env.INSTANZEN_JSON || fs.readFileSync(INSTANZEN_DATEI, "utf8"))); } catch { /* keine Liste → nur diese Instanz */ }
  const soll = versionJetzt().commit;
  const zeilen = await Promise.all(liste.map(async (inst) => {
    try {
      const r = await fetch(versionUrl(inst), { signal: AbortSignal.timeout(5000), redirect: "manual" });
      if (!r.ok) return versionZeile(inst, { fehler: `Status ${r.status}` }, soll);
      return versionZeile(inst, await r.json(), soll);
    } catch (e) { return versionZeile(inst, { fehler: e.name === "TimeoutError" ? "Zeitüberschreitung" : "keine Verbindung" }, soll); }
  }));
  if (req.query.format === "json") return res.json({ soll, zeilen });
  res.type("html").send(versionenHtml(zeilen, soll));
});

// Eigener Nextcloud-Ordner je Mandant statt fest "Blattwerk/" (Task 9):
// ordner() liefert den Rohnamen ("Blattwerk", "Baum Müller", …), ordnerUrl()
// dasselbe als EIN URL-kodiertes Segment (schuetzt zugleich gegen einen
// Ordnernamen mit "/" darin — der wuerde sonst zu einem echten Pfadsprung).
// Fuer Blattwerk selbst liefert ncOrdner() immer "Blattwerk" — bestehende
// Daten bleiben unter demselben Pfad erreichbar.
const ordner = () => ncOrdner(mandantJetzt());
const ordnerUrl = () => "/" + encodeURIComponent(ordner());

// Wachen fuer die Bloecke: sitzen vor den betroffenen Routen, damit ein
// abgeschalteter Block nicht per Hand-Anfrage doch erreichbar bleibt (siehe
// src/mandant-server.mjs). Fuer Blattwerk selbst (kein /data/mandant.json)
// steht jeder Block auf an — hier aendert sich also nichts am Verhalten.
const wacheArbeitsschutz = blockWache("arbeitsschutz", mandantJetzt);
const wacheKalender = blockWache("kalender", mandantJetzt);
const wacheFahrtenbuch = blockWache("fahrtenbuch", mandantJetzt);
const wacheChat = blockWache("chat", mandantJetzt);
// Nachgetragen 18.09.2026 (Abschlusspruefung, Befund I5): diese beiden Bloecke
// hatten ueberhaupt keine Wache, obwohl die Spezifikation blockAktiv als die
// EINE Entscheidungsstelle fuer Oberflaeche und Endpunkte nennt.
// - `belege` deckt die Beleg-Pipeline (/api/nc/putfile) UND die Ablage der
//   Betriebsdokumente (/api/nc/dokumente-*) ab: beides sind Dateien der Firma
//   im Nextcloud-Team-Ordner, und `belege` ist der Block, der dafuer eine
//   Nextcloud verlangt (BLOCK_DIENST.belege). Die Kachel „Wichtige Dokumente"
//   in der Verwaltung haengt seitdem an derselben Entscheidung — eine Wache,
//   die etwas sperrt, das die Oberflaeche weiter anbietet, waere genau der
//   Fehler, den diese Wachen verhindern sollen.
// - `erp` deckt /api/nc/anlagen[/save] und /api/nc/fixkosten[/save]: das ist
//   die Anlagevermoegens-/AfA- und Fixkosten-Konfiguration der Seite
//   „Kontostaende", die ihre Zahlen aus Dolibarr zieht. Ohne ERP gibt es
//   weder Rechnungen noch Anlagegueter, zu denen sie gehoeren koennten.
// BEWUSST OHNE WACHE bleibt /api/nc/tutorial[/save]: das Pflicht-Tutorial ist
// die Einfuehrung in die App selbst und laeuft, BEVOR irgendein Block eine
// Rolle spielt. Es gehoert zu keinem Block — auch ein Mandant, bei dem nur
// der Kalender laeuft, soll seine Leute einweisen koennen. Inhaltlich steht
// dort nur, wer die Uebung wann abgeschlossen hat (<Ordner>/App/tutorial.json
// im eigenen Team-Ordner), keine Fachdaten eines Blocks.
const wacheBelege = blockWache("belege", mandantJetzt);
const wacheErp = blockWache("erp", mandantJetzt);
// Funktions-Wachen (src/funktionen.js) — zusaetzlich zur Block-Wache, weil
// ein Block mehrere Funktionen traegt (arbeitsschutz: GBU, Einweisungen …).
const wacheGbu = funktionWache("gbu", mandantJetzt);
const wacheBetriebsmittel = funktionWache("betriebsmittel", mandantJetzt);
const wacheFahrtenbuchFn = funktionWache("fahrtenbuch", mandantJetzt);
const wacheUeberlassung = funktionWache("ueberlassung", mandantJetzt);
const wacheBestellungen = funktionWache("bestellungen", mandantJetzt);
const wacheBank = funktionWache("bank", mandantJetzt);
// Seit dem Merge mit main (19.09.2026): Routen aus den Modulen unter
// src/server/ hängen hier per Präfix an ihrem Block, damit ein neues Modul
// nicht versehentlich ohne Wache ausgeliefert wird. Der Baumkataster hängt an
// Dolibarr-Kunden und gehört deshalb zum Block erp.
app.use("/api/nc/baumkataster", wacheErp);
app.use(["/api/nc/unterweisungen", "/api/nc/gbu"], wacheArbeitsschutz);
app.use(["/api/chat", "/api/nc/chat-hinterlegung"], wacheChat);
// Bestellmail: Blattwerk selbst darf immer (Fallback im Handler), ein
// fremder Mandant braucht eine eigene Adresse — siehe bestellWache.
const wacheBestellung = bestellWache(mandantJetzt);
// Paperless ist eine gemeinsame Instanz mit einem Zugang — ohne eigene
// dienste.paperless-Adresse kein Zugriff (siehe wachePaperless).
const wachePl = wachePaperless(mandantJetzt);
const wachePlFunktion = paperlessFunktionWache(PL_THEMA_FUNKTION, mandantJetzt);

app.get("/api/sso/config", (req, res) => {
  const username = ssoUser(req);
  const nc = ncManaged(req);
  res.json({
    username,
    name: (username && req.headers["x-authentik-name"]) || null,
    email: (username && req.headers["x-authentik-email"]) || null,
    dolibarr: ssoLookup(username),
    // Bewusst OHNE pass: die App muss den Kalender nur kennen, nicht aufsperren.
    // `team` unterscheidet das gemeinsame Dienstkonto der Firma (ncTeamCreds)
    // von einem persoenlichen, im SSO-Store hinterlegten Zugang (ssoLookupNc)
    // — beide liefern `managed:true`, nur `team` sagt der App, ob sie hier
    // "zentral verwaltet" anzeigen darf (Task 11, NextcloudPanel).
    nextcloud: nc ? {
      server: nc.server, user: nc.user,
      calendarUrl: nc.calendarUrl || "", calendarName: nc.calendarName || "",
      enabled: nc.enabled !== false, managed: true, team: !!nc.team,
    } : null,
    nextcloudServer: process.env.SSO_NEXTCLOUD_SERVER || "https://nextcloud.example.org",
  });
});
app.post("/api/sso/register", async (req, res) => {
  const username = ssoUser(req);
  if (!username) return res.status(403).json({ error: "kein Authentik-Nutzer erkennbar" });
  const { url, key } = req.body || {};
  if (!url || !key) return res.status(400).json({ error: "url und key erforderlich" });
  // SSRF-Schutz: nur https auf bekannte Dolibarr-Hosts, keine Redirects,
  // keine internen Details in Fehlermeldungen.
  const allowedHosts = (process.env.SSO_ALLOWED_DOLIBARR_HOSTS || "dolibarr.example.org,dolibarr-alt.example.org")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let parsed;
  try { parsed = new URL(url); } catch (_) { return res.status(400).json({ error: "ungültige URL" }); }
  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    return res.status(400).json({ error: "nur die bekannte Dolibarr-Adresse ist erlaubt" });
  }
  const base = (parsed.origin + parsed.pathname).replace(/\/+$/, "");
  // Key gegen Dolibarr verifizieren, damit kein Müll gespeichert wird
  try {
    const r = await fetch(`${base}/api/index.php/users/info`, {
      headers: { DOLAPIKEY: key }, redirect: "manual",
    });
    if (!r.ok) return res.status(400).json({ error: "Dolibarr lehnt den Key ab" });
  } catch (_) {
    return res.status(502).json({ error: "Dolibarr nicht erreichbar" });
  }
  const store = ssoStoreLoad();
  store[username] = { ...(store[username] || {}), url, key };
  try {
    fs.mkdirSync(path.dirname(SSO_STORE_FILE), { recursive: true });
    fs.writeFileSync(SSO_STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch (e) {
    return res.status(500).json({ error: "Speichern fehlgeschlagen: " + e.message });
  }
  res.json({ saved: true, username });
});
// Nextcloud-Kalenderzugang des Authentik-Nutzers serverseitig ablegen, damit
// jedes weitere Gerät ihn automatisch bekommt (kein erneuter Login-Flow nötig).
// Persistierbarer Umfang: server/user/pass + gewählter Kalender + Aktiv-Schalter.
app.post("/api/sso/register-nc", async (req, res) => {
  const username = ssoUser(req);
  if (!username) return res.status(403).json({ error: "kein Authentik-Nutzer erkennbar" });
  const { server, user, pass, calendarUrl, calendarName, enabled } = req.body || {};
  if (!server || !user || !pass) return res.status(400).json({ error: "server, user und pass erforderlich" });
  // SSRF-Schutz: nur https auf bekannte Nextcloud-Hosts
  const allowedHosts = (process.env.SSO_ALLOWED_NC_HOSTS || "nextcloud-alt.example.org,nextcloud.example.org")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let parsed;
  try { parsed = new URL(server); } catch (_) { return res.status(400).json({ error: "ungültige Nextcloud-Adresse" }); }
  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    return res.status(400).json({ error: "nur die bekannte Nextcloud-Adresse ist erlaubt" });
  }
  // Zugang gegen Nextcloud prüfen (CalDAV-Wurzel), damit kein Müll gespeichert wird
  try {
    const r = await fetch(`${trimSlash(server)}/remote.php/dav/`, {
      method: "PROPFIND",
      headers: { Authorization: authHeader(user, pass), Depth: "0" },
      redirect: "manual",
    });
    if (r.status !== 207 && r.status !== 200) {
      return res.status(400).json({ error: "Nextcloud lehnt die Zugangsdaten ab" });
    }
  } catch (_) {
    return res.status(502).json({ error: "Nextcloud nicht erreichbar" });
  }
  const nextcloud = {
    server: trimSlash(server), user, pass,
    calendarUrl: calendarUrl || "", calendarName: calendarName || "",
    enabled: enabled !== false,
  };
  const store = ssoStoreLoad();
  store[username] = { ...(store[username] || {}), nextcloud };
  try {
    fs.mkdirSync(path.dirname(SSO_STORE_FILE), { recursive: true });
    fs.writeFileSync(SSO_STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch (e) {
    return res.status(500).json({ error: "Speichern fehlgeschlagen: " + e.message });
  }
  res.json({ saved: true, username });
});

// ---------- Nextcloud-Proxy ----------
app.post("/api/nc/login/start", async (req, res) => {
  try {
    const base = trimSlash(req.body?.server);
    if (!base) return res.status(400).json({ error: "Server-Adresse fehlt" });
    const r = await fetch(base + "/index.php/login/v2", {
      method: "POST",
      headers: { "User-Agent": "Blattwerk App", "Accept": "application/json" },
    });
    if (!r.ok) return res.status(502).json({ error: "Nextcloud Status " + r.status });
    const body = await r.json();
    if (!body?.login || !body?.poll?.token) return res.status(502).json({ error: "Unerwartete Antwort" });
    res.json({ login: body.login, token: body.poll.token, endpoint: body.poll.endpoint });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/nc/login/poll", async (req, res) => {
  try {
    const { endpoint, token } = req.body || {};
    if (!endpoint || !token) return res.status(400).json({ error: "endpoint/token fehlt" });
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=" + encodeURIComponent(token),
    });
    if (r.status === 404) return res.status(202).json({ pending: true });
    if (!r.ok) return res.status(202).json({ pending: true });
    const body = await r.json();
    if (body?.appPassword && body?.loginName) {
      return res.json({ server: trimSlash(body.server), loginName: body.loginName, appPassword: body.appPassword });
    }
    res.status(202).json({ pending: true });
  } catch (e) { res.status(202).json({ pending: true, error: String(e.message || e) }); }
});

app.post("/api/nc/calendars", wacheKalender, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const home = trimSlash(server) + "/remote.php/dav/calendars/" + encodeURIComponent(user) + "/";
    const propfind =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">' +
      "<d:prop><d:resourcetype/><d:displayname/><d:current-user-privilege-set/><ic:calendar-color/><c:supported-calendar-component-set/></d:prop>" +
      "</d:propfind>";
    const r = await fetch(home, {
      method: "PROPFIND",
      headers: { Authorization: authHeader(user, pass), Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: propfind,
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (!r.ok) return res.status(502).json({ error: "Nextcloud Status " + r.status });
    const xml = await r.text();
    res.json({ calendars: parseCalendars(xml, trimSlash(server)) });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/nc/event", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, event } = ncBody(req);
    if (!user || !pass || !calendarUrl || !event?.uid) return res.status(400).json({ error: "Parameter fehlen" });
    const href = trimSlash(calendarUrl) + "/" + encodeURIComponent(event.uid) + ".ics";
    const r = await fetch(href, {
      method: "PUT",
      headers: { Authorization: authHeader(user, pass), "Content-Type": "text/calendar; charset=utf-8" },
      body: buildIcs(event),
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung abgelaufen" });
    if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true, uid: event.uid });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/nc/event/delete", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, uid, href } = ncBody(req);
    if (!user || !pass || !calendarUrl || (!uid && !href)) return res.status(400).json({ error: "Parameter fehlen" });
    // Bevorzugt die echte href (auch direkt in Nextcloud angelegte Termine haben
    // nicht zwingend <uid>.ics als Dateinamen), sonst der klassische UID-Pfad.
    let target;
    if (href) {
      try { target = new URL(href, trimSlash(calendarUrl) + "/").href; } catch { target = null; }
      // Schutz: nur innerhalb des angegebenen Kalenders löschen
      if (!target || !target.startsWith(trimSlash(calendarUrl) + "/")) return res.status(400).json({ error: "Ungültige href" });
    } else {
      target = trimSlash(calendarUrl) + "/" + encodeURIComponent(uid) + ".ics";
    }
    const r = await fetch(target, { method: "DELETE", headers: { Authorization: authHeader(user, pass) } });
    // 404 = schon weg; als Erfolg behandeln
    if (r.ok || r.status === 404) return res.json({ ok: true });
    res.status(502).json({ error: "Status " + r.status });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Roh-ICS eines bestehenden Termins überschreiben (für Zu-/Absagen: der Client
// ändert nur die ATTENDEE-Zeilen und schreibt das komplette ICS zurück).
app.post("/api/nc/event/ics", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, uid, href, ics } = ncBody(req);
    if (!user || !pass || !calendarUrl || !ics || (!uid && !href)) return res.status(400).json({ error: "Parameter fehlen" });
    let target;
    if (href) {
      try { target = new URL(href, trimSlash(calendarUrl) + "/").href; } catch { target = null; }
      // Schutz: nur innerhalb des angegebenen Kalenders schreiben
      if (!target || !target.startsWith(trimSlash(calendarUrl) + "/")) return res.status(400).json({ error: "Ungültige href" });
    } else {
      target = trimSlash(calendarUrl) + "/" + encodeURIComponent(uid) + ".ics";
    }
    const r = await fetch(target, {
      method: "PUT",
      headers: { Authorization: authHeader(user, pass), "Content-Type": "text/calendar; charset=utf-8" },
      body: ics,
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung abgelaufen" });
    if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Termine aus dem Kalender lesen (CalDAV calendar-query REPORT mit Zeitfenster).
// Antwort: { events: [{ href, ics }] } — das ICS-Parsen macht der Client.
const xmlUnescape = (s) =>
  (s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

app.post("/api/nc/events", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, startSec, endSec } = ncBody(req);
    if (!user || !pass || !calendarUrl) return res.status(400).json({ error: "Parameter fehlen" });
    const stamp = (sec, fallback) => icsStampUtc(sec ? new Date(sec * 1000) : fallback);
    const now = Date.now();
    const start = stamp(startSec, new Date(now - 180 * 24 * 3600 * 1000));
    const end = stamp(endSec, new Date(now + 540 * 24 * 3600 * 1000));
    const report =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      "<d:prop><d:getetag/><c:calendar-data/></d:prop>" +
      '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">' +
      `<c:time-range start="${start}" end="${end}"/>` +
      "</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>";
    const r = await fetch(trimSlash(calendarUrl) + "/", {
      method: "REPORT",
      headers: {
        Authorization: authHeader(user, pass),
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: report,
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (!r.ok && r.status !== 207) return res.status(502).json({ error: "Nextcloud Status " + r.status });
    const xml = await r.text();
    const events = [];
    const blocks = xml.match(/<[a-z0-9]*:?response[\s>][\s\S]*?<\/[a-z0-9]*:?response>/gi) || [];
    for (const b of blocks) {
      const href = (b.match(/<[a-z0-9]*:?href>\s*([^<]+?)\s*<\/[a-z0-9]*:?href>/i) || [])[1];
      const data = (b.match(/calendar-data[^>]*>([\s\S]*?)<\/[a-z0-9]*:?calendar-data>/i) || [])[1];
      if (!data) continue;
      events.push({ href: href || "", ics: xmlUnescape(data) });
    }
    res.json({ events });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Abo-Link des Kalenders: liest die publish-URL (calendarserver-sharing) per
// PROPFIND; fehlt sie und create=true, wird der Kalender erst veröffentlicht
// (klappt nur beim Besitzer — bei Geteilten liefert Nextcloud 403, dann bleibt
// es beim "nicht gefunden"). Antwort: { url, exportUrl, webcal } oder { url: null }.
const CS_NS = 'xmlns:cs="http://calendarserver.org/ns/"';
async function ncPublishUrl(calendarUrl, user, pass) {
  const propfind =
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<d:propfind xmlns:d="DAV:" ${CS_NS}><d:prop><cs:publish-url/></d:prop></d:propfind>`;
  const r = await fetch(trimSlash(calendarUrl) + "/", {
    method: "PROPFIND",
    headers: { Authorization: authHeader(user, pass), Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
    body: propfind,
  });
  if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { status: 401 });
  if (!r.ok && r.status !== 207) throw Object.assign(new Error("Nextcloud Status " + r.status), { status: 502 });
  const xml = await r.text();
  const block = (xml.match(/publish-url[^>]*>[\s\S]*?<\/[a-z0-9]*:?publish-url>/i) || [])[0] || "";
  const href = (block.match(/<[a-z0-9]*:?href>\s*([^<]+?)\s*<\/[a-z0-9]*:?href>/i) || [])[1] || "";
  return xmlUnescape(href.trim()) || null;
}

app.post("/api/nc/subscribe-url", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, create } = ncBody(req);
    if (!user || !pass || !calendarUrl) return res.status(400).json({ error: "Parameter fehlen" });
    let url = await ncPublishUrl(calendarUrl, user, pass);
    if (!url && create) {
      // Veröffentlichen (idempotent); Fehler hier bewusst schlucken — dann war
      // der Nutzer schlicht nicht der Besitzer.
      await fetch(trimSlash(calendarUrl) + "/", {
        method: "POST",
        headers: { Authorization: authHeader(user, pass), "Content-Type": "application/xml; charset=utf-8" },
        body: `<?xml version="1.0" encoding="utf-8"?><cs:publish-calendar ${CS_NS}/>`,
      }).catch(() => {});
      url = await ncPublishUrl(calendarUrl, user, pass);
    }
    if (!url) return res.json({ url: null });
    const exportUrl = url.replace(/\/+$/, "") + "?export";
    res.json({ url, exportUrl, webcal: exportUrl.replace(/^https?:/i, "webcal:") });
  } catch (e) { res.status(e.status || 502).json({ error: String(e.message || e) }); }
});

// Kalender per DAV-Sharing für eine Nextcloud-Gruppe freigeben (Schreibzugriff).
// Nextcloud versteht dafür (nur) sein eigenes owncloud.org-Namespace-Format,
// nicht das alte calendarserver-sharing (das quittiert es mit 501).
// Nur der Besitzer darf freigeben; für alle anderen antwortet Nextcloud mit 403.
app.post("/api/nc/share-group", wacheKalender, async (req, res) => {
  try {
    const { user, pass, calendarUrl, group } = ncBody(req);
    if (!user || !pass || !calendarUrl || !group) return res.status(400).json({ error: "Parameter fehlen" });
    const body =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<o:share xmlns:o="http://owncloud.org/ns" xmlns:d="DAV:"><o:set>' +
      `<d:href>principal:principals/groups/${encodeURIComponent(group)}</d:href>` +
      "<o:summary/><o:read-write/></o:set></o:share>";
    const r = await fetch(trimSlash(calendarUrl) + "/", {
      method: "POST",
      headers: { Authorization: authHeader(user, pass), "Content-Type": "application/xml; charset=utf-8" },
      body,
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 403) return res.status(403).json({ error: "Nur der Kalender-Besitzer darf freigeben" });
    if (!r.ok) return res.status(502).json({ error: "Nextcloud Status " + r.status });
    res.json({ ok: true, group });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Beleg-Upload in die Beleg-Pipeline: WebDAV-PUT nach <Ordner>/Belege/ —
// der Producer-Cron auf dem Pipeline-Host reiht die Datei dann automatisch ein.
app.post("/api/nc/putfile", wacheBelege, async (req, res) => {
  try {
    const { server, user, pass, filename, dataBase64 } = ncBody(req);
    if (!server || !user || !pass || !filename || !dataBase64) return res.status(400).json({ error: "Parameter fehlen" });
    const safe = String(filename).replace(/[/\\]/g, "_");
    const href = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user) + ordnerUrl() + "/Belege/" + encodeURIComponent(safe);
    const r = await fetch(href, {
      method: "PUT",
      headers: { Authorization: authHeader(user, pass), "Content-Type": "application/octet-stream" },
      body: Buffer.from(dataBase64, "base64"),
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    // WebDAV antwortet mit 409, wenn der Zielordner fehlt — beim Dienstkonto
    // ohne Zugriff auf den Team-Ordner genau der Fall. Als nackte Zahl
    // versteht das niemand, deshalb im Klartext. Der Ordnername kommt aus dem
    // Mandanten (ordner()), nicht fest „Blattwerk" — sonst schickt die
    // Meldung eine fremde Firma auf die Suche nach einem Ordner, den es bei
    // ihr gar nicht gibt (Abschlusspruefung 18.09.2026, kleine Mitnahme).
    if (r.status === 409) return res.status(409).json({ error: `Dem benutzten Nextcloud-Konto fehlt der Ordner ${ordner()}/Belege` });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true, name: safe });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// GBU-Upload: PDF der Vor-Ort-Gefährdungsbeurteilung nach
// Blattwerk/Gefährdungsbeurteilungen/<Jahr>/ (Ordner werden idempotent angelegt).
// Seit 09.08.2026 kein Aufrufer mehr aus der App (Vor-Ort-Upload geht über
// /api/pl/upload nach Paperless) — entfällt mit dem Altbestand-Import.
app.post("/api/nc/gbu-upload", wacheArbeitsschutz, wacheGbu, async (req, res) => {
  try {
    const { server, user, pass, filename, dataBase64, year } = ncBody(req);
    if (!server || !user || !pass || !filename || !dataBase64) return res.status(400).json({ error: "Parameter fehlen" });
    const y = String(year || new Date().getFullYear()).replace(/[^0-9]/g, "").slice(0, 4) || String(new Date().getFullYear());
    const safe = String(filename).replace(/[/\\]/g, "_");
    const base = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user);
    const headers = { Authorization: authHeader(user, pass) };
    // Erst prüfen, ob das Konto den Firmenordner überhaupt sieht: die
    // MKCOL-Kette unten legt ihn sonst im falschen Heimatverzeichnis neu an
    // und die Beurteilung verschwindet lautlos an einem Ort, an dem niemand
    // nachsieht.
    await assertOrdner(base, headers);
    // Ordnerkette anlegen; 405 = existiert schon, alles andere außer 201 ist ein Fehler.
    for (const dir of [ordnerUrl(), `${ordnerUrl()}/Gef%C3%A4hrdungsbeurteilungen`, `${ordnerUrl()}/Gef%C3%A4hrdungsbeurteilungen/${y}`]) {
      const m = await fetch(base + dir, { method: "MKCOL", headers });
      if (m.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
      if (m.status !== 201 && m.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + m.status });
    }
    const href = `${base}${ordnerUrl()}/Gef%C3%A4hrdungsbeurteilungen/${y}/` + encodeURIComponent(safe);
    const r = await fetch(href, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/pdf" },
      body: Buffer.from(dataBase64, "base64"),
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true, name: safe, path: `${ordner()}/Gefährdungsbeurteilungen/${y}/${safe}` });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// GBU-Archiv auflisten: alle PDFs unter Blattwerk/Gefährdungsbeurteilungen/<Jahr>/.
// Seit 09.08.2026 kein Aufrufer mehr aus der App ("Alle Beurteilungen" liest
// jetzt aus Paperless) — entfällt mit dem Altbestand-Import.
app.post("/api/nc/gbu-list", wacheArbeitsschutz, wacheGbu, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Parameter fehlen" });
    const base = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user) + ordnerUrl() + "/Gef%C3%A4hrdungsbeurteilungen/";
    const headers = { Authorization: authHeader(user, pass), Depth: "1", "Content-Type": "application/xml" };
    const propfind = async (url) => {
      const r = await fetch(url, { method: "PROPFIND", headers });
      if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { code: 401 });
      if (r.status === 404) return null;
      if (!r.ok && r.status !== 207) throw new Error("Nextcloud Status " + r.status);
      return r.text();
    };
    const rootXml = await propfind(base);
    if (rootXml === null) return res.json({ files: [] });
    const years = [...rootXml.matchAll(/<d:href>[^<]*\/Gef[^/<]*\/(\d{4})\/<\/d:href>/gi)].map((m) => m[1]);
    const files = [];
    for (const y of [...new Set(years)]) {
      const xml = await propfind(base + y + "/");
      if (!xml) continue;
      for (const resp of xml.split(/<d:response>/i).slice(1)) {
        const href = (resp.match(/<d:href>([^<]+)<\/d:href>/i) || [])[1] || "";
        const name = decodeURIComponent(href.split("/").filter(Boolean).pop() || "");
        if (!/\.pdf$/i.test(name)) continue;
        const mod = (resp.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i) || [])[1] || "";
        files.push({ name, year: y, modified: mod });
      }
    }
    res.json({ files });
  } catch (e) {
    if (e.code === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// GBU-PDF aus dem Nextcloud-Archiv laden (nur Dateien unterhalb des GBU-Ordners).
// Seit 09.08.2026 kein Aufrufer mehr aus der App — entfällt mit dem
// Altbestand-Import.
app.post("/api/nc/gbu-file", wacheArbeitsschutz, wacheGbu, async (req, res) => {
  try {
    const { server, user, pass, filename, year } = ncBody(req);
    if (!server || !user || !pass || !filename) return res.status(400).json({ error: "Parameter fehlen" });
    const y = String(year || "").replace(/[^0-9]/g, "").slice(0, 4);
    if (!y) return res.status(400).json({ error: "Jahr fehlt" });
    const safe = String(filename).replace(/[/\\]/g, "_");
    const href = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user) +
      `${ordnerUrl()}/Gef%C3%A4hrdungsbeurteilungen/${y}/` + encodeURIComponent(safe);
    const r = await fetch(href, { headers: { Authorization: authHeader(user, pass) } });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 404) return res.status(404).json({ error: "Datei nicht gefunden" });
    if (!r.ok) return res.status(502).json({ error: "Status " + r.status });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safe}"`);
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// ---------- Betriebsdokumente (Verwaltung → Wichtige Dokumente) ----------
// Ordnerbasierte Ablage unter Blattwerk/Dokumente/<Ordner>/ in Nextcloud —
// zum Vorzeigen unterwegs (Gewerbeschein, KFZ-Schein, Versicherungen …).
// Wer hochladen darf, entscheidet das Frontend (Geschäftsführer/Admins);
// der Server sichert nur die Pfade: Ordner- und Dateinamen können keine
// Trenner enthalten und damit den Dokumente-Ordner nicht verlassen.
// Trenner raus; reine Punkt-Namen ("..", "....") würden als URL-Segment das
// Verzeichnis verlassen — die werden komplett verworfen statt umgeschrieben
// (ein Ersetzen von ".." kann selbst wieder ".." erzeugen).
const dokSafe = (v) => {
  const s = String(v || "").replace(/[/\\]/g, "_").trim().slice(0, 80);
  return /^\.*$/.test(s) ? "" : s;
};
// Funktion statt Konstante (Task 9): der Basisordner haengt vom Mandanten ab.
// Der Anfrage-Parameter "ordner" (der Unterordner unter Dokumente/, z. B.
// "Gewerbeschein") wird in den Handlern deshalb bewusst umbenannt (unterordner),
// sonst verdeckt er die gleichnamige Helferfunktion ordner() aus dem
// aeusseren Gueltigkeitsbereich.
const DOK_BASIS = () => `${ordnerUrl()}/Dokumente`;
// Eine Ebene unter dem Ordner ("Fach": KFZ/<Fahrzeug>, Anleitungen/Klettern …). Leer = direkt im Ordner.
// Beide Teile laufen einzeln durch dokSafe — ein Trenner im Namen kann den Dokumente-Ordner nicht verlassen.
const dokPfad = (o, fach) => "/" + encodeURIComponent(o) + (fach ? "/" + encodeURIComponent(fach) : "");

app.post("/api/nc/dokumente-list", wacheBelege, async (req, res) => {
  try {
    const { server, user, pass, ordner: unterordner, fach: fachRoh } = ncBody(req);
    const o = dokSafe(unterordner), fach = dokSafe(fachRoh);
    if (!server || !user || !pass || !o) return res.status(400).json({ error: "Parameter fehlen" });
    const href = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user) +
      DOK_BASIS() + dokPfad(o, fach) + "/";
    const r = await fetch(href, { method: "PROPFIND", headers: { Authorization: authHeader(user, pass), Depth: "1", "Content-Type": "application/xml" } });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 404) return res.json({ files: [], faecher: [] }); // Ordner entsteht erst beim ersten Upload
    if (!r.ok && r.status !== 207) return res.status(502).json({ error: "Nextcloud Status " + r.status });
    const xml = await r.text();
    const files = [], faecher = [];
    // Die erste Antwort ist der abgefragte Ordner selbst; Fächer gibt es nur eine Ebene tief.
    for (const [i, resp] of xml.split(/<d:response>/i).slice(1).entries()) {
      const h = (resp.match(/<d:href>([^<]+)<\/d:href>/i) || [])[1] || "";
      const name = decodeURIComponent(h.split("/").filter(Boolean).pop() || "");
      if (!name) continue;
      if (/<d:collection\s*\/?\s*>/i.test(resp)) { if (i > 0 && !fach) faecher.push(name); continue; }
      const mod = (resp.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i) || [])[1] || "";
      files.push({ name, modified: mod });
    }
    res.json({ files, faecher: faecher.sort((a, b) => a.localeCompare(b, "de")) });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/nc/dokumente-file", wacheBelege, async (req, res) => {
  try {
    const { server, user, pass, ordner: unterordner, fach: fachRoh, filename } = ncBody(req);
    const o = dokSafe(unterordner), fach = dokSafe(fachRoh), safe = dokSafe(filename);
    if (!server || !user || !pass || !o || !safe) return res.status(400).json({ error: "Parameter fehlen" });
    const href = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user) +
      DOK_BASIS() + dokPfad(o, fach) + "/" + encodeURIComponent(safe);
    const r = await fetch(href, { headers: { Authorization: authHeader(user, pass) } });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 404) return res.status(404).json({ error: "Datei nicht gefunden" });
    if (!r.ok) return res.status(502).json({ error: "Status " + r.status });
    const typ = /\.pdf$/i.test(safe) ? "application/pdf"
      : /\.(jpg|jpeg)$/i.test(safe) ? "image/jpeg"
      : /\.png$/i.test(safe) ? "image/png"
      : "application/octet-stream";
    res.setHeader("Content-Type", typ);
    res.setHeader("Content-Disposition", `inline; filename="${safe}"`);
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Modul „Bank": Kontoauszug-PDF nach <Ordner>/Kontoauszuege/ — von dort holt der
// Buchhaltungsbot (pipeline/kontoauszug.py) ab und gleicht mit den Dolibarr-Bankzeilen ab.
// Bewusst NICHT /api/nc/putfile: unter Belege/ machte die Beleg-OCR daraus eine Lieferantenrechnung.
app.post("/api/nc/kontoauszug", wacheBelege, wacheBank, async (req, res) => {
  try {
    const { server, user, pass, filename, dataBase64 } = ncBody(req);
    const safe = dokSafe(filename);
    if (!server || !user || !pass || !safe || !dataBase64) return res.status(400).json({ error: "Parameter fehlen" });
    const daten = Buffer.from(dataBase64, "base64");
    if (daten.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(415).json({ error: "Nur PDF-Dateien" });
    if (daten.length > 20 * 1024 * 1024) return res.status(413).json({ error: "PDF größer als 20 MB" });
    const base = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user);
    const headers = { Authorization: authHeader(user, pass) };
    await assertOrdner(base, headers);
    const ziel = `${ordnerUrl()}/Kontoauszuege`;
    const m = await fetch(base + ziel, { method: "MKCOL", headers });
    if (m.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (m.status !== 201 && m.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + m.status });
    const r = await fetch(base + ziel + "/" + encodeURIComponent(safe), {
      method: "PUT", headers: { ...headers, "Content-Type": "application/pdf" }, body: daten,
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true, name: safe });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/dokumente-upload", wacheBelege, async (req, res) => {
  try {
    const { server, user, pass, ordner: unterordner, fach: fachRoh, filename, dataBase64 } = ncBody(req);
    const o = dokSafe(unterordner), fach = dokSafe(fachRoh), safe = dokSafe(filename);
    if (!server || !user || !pass || !o || !safe || !dataBase64) return res.status(400).json({ error: "Parameter fehlen" });
    const base = trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user);
    const headers = { Authorization: authHeader(user, pass) };
    // Wie bei gbu-upload: ohne diese Prüfung legt die MKCOL-Kette beim
    // Dienstkonto einen zweiten Firmenordner an und die Datei verschwindet.
    await assertOrdner(base, headers);
    for (const dir of [ordnerUrl(), DOK_BASIS(), DOK_BASIS() + dokPfad(o, ""), ...(fach ? [DOK_BASIS() + dokPfad(o, fach)] : [])]) {
      const m = await fetch(base + dir, { method: "MKCOL", headers });
      if (m.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
      if (m.status !== 201 && m.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + m.status });
    }
    const r = await fetch(base + DOK_BASIS() + dokPfad(o, fach) + "/" + encodeURIComponent(safe), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: Buffer.from(dataBase64, "base64"),
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Status " + r.status });
    res.json({ ok: true, name: safe, path: `${ordner()}/Dokumente/${o}/${fach ? fach + "/" : ""}${safe}` });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ---------- Arbeitsschutz ----------
// Zwei Dinge, die zusammengehoeren:
//   (a) Die grundsaetzlichen Unterlagen (Grundlagenteil der Gefaehrdungs-
//       beurteilung, Einweisungsprotokolle) liegen als PDF unter
//       Blattwerk/Arbeitsschutz/. Sie sind fuer ALLE lesbar — eine
//       Grundbeurteilung, die nur die Geschaeftsfuehrung sieht, verfehlt
//       ihren Zweck (§ 12 ArbSchG setzt die Kenntnis der Beschaeftigten
//       voraus, das Dokument selbst verlangt die Beteiligung).
//   (b) Die Einweisungen an Arbeitsmitteln stehen in einer JSON-Datei im
//       selben Ordner. Bewusst dort und nicht in Dolibarr: es gibt keine
//       passende Dolibarr-Entitaet, und der Nachweis gehoert in dieselbe
//       Akte wie die unterschriebenen Protokollblaetter.

// Funktionen statt Konstanten (Task 9): beide haengen vom Mandanten ab.
export const AS_DIR = () => `${ordnerUrl()}/Arbeitsschutz`;
const AS_STORE = () => `${AS_DIR()}/einweisungen.json`;
// Befund 4d (Abschlussprüfung 09.08.2026): "archiviert" absichtlich NICHT
// mehr hier — plGrundlagenNachfuehren war laut Commit 7fdf6ff dessen einziger
// Schreiber UND einziger Leser und wurde dort komplett entfernt. Ein
// grep über den ganzen Baum (App, server.mjs, scripts/) findet seither keine
// weitere Fundstelle. Bestehende einweisungen.json-Dateien, die das Feld noch
// enthalten, bleiben unangetastet: es wird nur nicht mehr neu vorbelegt.
const AS_STORE_LEER = { version: 1, eintraege: [], pruefungen: [], letzteErinnerung: "" };

// Der Tutorial-Abschluss steht bewusst NICHT in einweisungen.json: das ist der
// Nachweis nach § 12 Abs. 1 BetrSichV fuer Arbeitsmittel. Eine App-Einfuehrung
// gehoert fachlich nicht hinein, und die Datei soll kein Sammelbecken werden.
export const APP_DIR = () => `${ordnerUrl()}/App`;
const TUT_STORE = () => `${APP_DIR()}/tutorial.json`;
const TUT_LEER = { version: 1, abgeschlossen: {} };

/**
 * Abschluss eintragen — additiv. Fremde Eintraege bleiben unangetastet, der
 * eigene wird auf die neue Fassung gehoben. Reine Funktion, damit genau diese
 * Zusammenfuehrung pruefbar ist, ohne WebDAV nachzubauen.
 */
export function tutEintragen(store, login, fassung, heute, uebersprungen) {
  const s = store && typeof store === "object" ? store : {};
  const alle = s.abgeschlossen && typeof s.abgeschlossen === "object" ? s.abgeschlossen : {};
  // `uebersprungen` steht nur dann in der Datei, wenn es zutrifft — ein
  // durchlaufenes Tutorial soll aussehen wie bisher, damit die Altbestaende
  // ohne dieses Feld nicht wie ein Sonderfall wirken. Wer abgekuerzt hat, ist
  // damit trotzdem erkennbar: das Tutorial ist die Einweisung in die App, und
  // diese Datei ist die einzige Stelle, an der spaeter noch steht, wer sie
  // wirklich gemacht hat.
  const eintrag = { am: heute, fassung };
  if (uebersprungen) eintrag.uebersprungen = true;
  return {
    ...s,
    version: 1,
    abgeschlossen: { ...alle, [login]: eintrag },
  };
}

export const ncFilesBase = (server, user) =>
  trimSlash(server) + "/remote.php/dav/files/" + encodeURIComponent(user);
// Hier stand bis 18.09.2026 `ncPfad(pfad)` — ein Helfer, der einen Pfad
// Segment fuer Segment URL-kodierte. Seit Task 9 liefern ordnerUrl(), AS_DIR()
// und APP_DIR() ihre Segmente bereits kodiert; ncPfad() haette sie ein zweites
// Mal kodiert und bei einem Ordnernamen mit Umlaut oder Leerzeichen den
// falschen Ordner getroffen (Fix Round 2). Der letzte Aufrufer ist damals
// entfallen, die Funktion blieb aber ueber `serverCtx` fuer jedes Fachmodul
// unter src/server/ erreichbar — also genau dort, wo das naechste Modul die
// doppelte Kodierung nachgebaut haette. Deshalb ersatzlos geloescht
// (Abschlusspruefung 18.09.2026, Befund M). Wer einen frischen, noch NICHT
// kodierten Pfad hat, kodiert ihn an Ort und Stelle:
// `pfad.split("/").map(encodeURIComponent).join("/")`.

/**
 * Prueft, ob das benutzte Konto den Ordner dieser Firma ueberhaupt sieht.
 *
 * Der Grund ist ein realer Beinahe-Unfall: seit die App das Dienstkonto des
 * Team-Kalenders einsetzt, laufen auch die Datei-Endpunkte darunter. Fehlt dem
 * Konto der Firmenordner, legt die MKCOL-Kette in `gbu-upload` klaglos
 * einen NEUEN Ordner im Heimatverzeichnis des Dienstkontos an und
 * schreibt das PDF dorthin — kein Fehler, keine Meldung, die Beurteilung
 * einfach am falschen Ort. Lieber hier hart abbrechen.
 */
export async function assertOrdner(base, headers) {
  const r = await fetch(base + ordnerUrl() + "/", { method: "PROPFIND", headers: { ...headers, Depth: "0" } });
  if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { code: 401 });
  if (r.status === 404) {
    throw Object.assign(
      new Error(`Dem benutzten Nextcloud-Konto fehlt der Zugriff auf den Ordner ${ordner()}`),
      { code: 409 });
  }
  if (!r.ok && r.status !== 207) throw new Error("Nextcloud Status " + r.status);
}

/** PROPFIND-Antwort in {name, size, modified} zerlegen (Depth 1, ohne den Ordner selbst). */
export function parseDirListing(xml) {
  const out = [];
  for (const resp of String(xml).split(/<[a-z0-9]*:?response[\s>]/i).slice(1)) {
    const href = (resp.match(/<[a-z0-9]*:?href>([^<]+)<\/[a-z0-9]*:?href>/i) || [])[1] || "";
    if (!href || /\/$/.test(href)) continue; // Ordner (auch der eigene) enden auf /
    let name = "";
    try { name = decodeURIComponent(href.split("/").filter(Boolean).pop() || ""); } catch { continue; }
    if (!name) continue;
    out.push({
      name,
      size: Number((resp.match(/<[a-z0-9]*:?getcontentlength>(\d+)</i) || [])[1] || 0),
      modified: (resp.match(/<[a-z0-9]*:?getlastmodified>([^<]+)</i) || [])[1] || "",
    });
  }
  return out;
}

// Grundsatzunterlagen auflisten. Nur PDF: der Ordner enthaelt zu jedem Dokument
// eine ODT-Fassung zum Weiterschreiben, die der PDF-Betrachter der App nicht
// darstellen kann — ein Treffer darauf waere ein toter Fingertipp.
// Seit 09.08.2026 kein Aufrufer mehr aus der App (Reiter Grundlagen liest
// jetzt aus Paperless) — entfällt mit dem Altbestand-Import.
app.post("/api/nc/arbeitsschutz-list", wacheArbeitsschutz, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const headers = { Authorization: authHeader(user, pass) };
    const r = await fetch(ncFilesBase(server, user) + AS_DIR() + "/", {
      method: "PROPFIND", headers: { ...headers, Depth: "1", "Content-Type": "application/xml" },
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 404) return res.json({ files: [] });
    if (!r.ok && r.status !== 207) return res.status(502).json({ error: "Status " + r.status });
    const files = parseDirListing(await r.text()).filter((f) => /\.pdf$/i.test(f.name));
    res.json({ files });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Seit 09.08.2026 kein Aufrufer mehr aus der App — entfällt mit dem
// Altbestand-Import.
app.post("/api/nc/arbeitsschutz-file", wacheArbeitsschutz, async (req, res) => {
  try {
    const { server, user, pass, filename } = ncBody(req);
    if (!server || !user || !pass || !filename) return res.status(400).json({ error: "Parameter fehlen" });
    // Wie bei gbu-file: Pfadtrenner raus, damit der Name den Ordner nicht verlassen kann.
    const safe = String(filename).replace(/[/\\]/g, "_");
    if (!/\.pdf$/i.test(safe)) return res.status(400).json({ error: "Nur PDF" });
    const r = await fetch(ncFilesBase(server, user) + AS_DIR() + "/" + encodeURIComponent(safe), {
      headers: { Authorization: authHeader(user, pass) },
    });
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 404) return res.status(404).json({ error: "Datei nicht gefunden" });
    if (!r.ok) return res.status(502).json({ error: "Status " + r.status });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safe}"`);
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

/** Einweisungs-Datei lesen. Fehlt sie, ist das kein Fehler, sondern der Anfang. */
async function asStoreLesen(server, user, pass) {
  const r = await fetch(ncFilesBase(server, user) + AS_STORE(), {
    headers: { Authorization: authHeader(user, pass) },
  });
  if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { code: 401 });
  if (r.status === 404) return { store: { ...AS_STORE_LEER }, etag: null };
  if (!r.ok) throw new Error("Status " + r.status);
  const etag = r.headers.get("etag") || null;
  let store;
  try { store = JSON.parse(await r.text()); } catch { store = null; }
  if (!store || typeof store !== "object") {
    // Kaputte Datei NICHT stillschweigend durch eine leere ersetzen — darin
    // stehen Nachweise, die niemand nachtraeglich rekonstruieren kann.
    throw Object.assign(new Error("einweisungen.json ist unlesbar — bitte in Nextcloud prüfen"), { code: 409 });
  }
  store.eintraege = Array.isArray(store.eintraege) ? store.eintraege : [];
  store.pruefungen = Array.isArray(store.pruefungen) ? store.pruefungen : [];
  // Kein store.archiviert-Normalisieren mehr (Befund 4d) — niemand liest das
  // Feld noch. Ein vorhandener Wert aus einer älteren Datei bleibt trotzdem
  // unangetastet im Objekt stehen und wird beim nächsten Schreiben unverändert
  // mit zurückgeschrieben, es wird nur nicht mehr aktiv gepflegt.
  return { store, etag };
}

/**
 * Schreiben mit `If-Match`: zwei Geraete duerfen sich nicht gegenseitig
 * ueberschreiben. Bei 412 wird einmal neu gelesen und der eigene Eintrag auf
 * den frischen Stand gesetzt — verloren geht dabei nichts, weil jeder Eintrag
 * additiv ist.
 */
async function asStoreSchreiben(server, user, pass, store, etag) {
  const headers = {
    Authorization: authHeader(user, pass),
    "Content-Type": "application/json; charset=utf-8",
  };
  if (etag) headers["If-Match"] = etag;
  const r = await fetch(ncFilesBase(server, user) + AS_STORE(), {
    method: "PUT", headers, body: JSON.stringify(store, null, 2),
  });
  return r;
}

/** Tutorial-Datei lesen. Fehlt sie, ist das kein Fehler, sondern der Anfang. */
async function tutStoreLesen(server, user, pass) {
  const r = await fetch(ncFilesBase(server, user) + TUT_STORE(), {
    headers: { Authorization: authHeader(user, pass) },
  });
  if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { code: 401 });
  if (r.status === 404) return { store: { ...TUT_LEER }, etag: null };
  if (!r.ok) throw new Error("Status " + r.status);
  const etag = r.headers.get("etag") || null;
  let store;
  try { store = JSON.parse(await r.text()); } catch { store = null; }
  if (!store || typeof store !== "object") {
    // Nicht stillschweigend durch eine leere Datei ersetzen: darin stehen die
    // Abschluesse aller Kollegen, die sonst alle noch einmal ueben duerfen.
    throw Object.assign(new Error("tutorial.json ist unlesbar — bitte in Nextcloud prüfen"), { code: 409 });
  }
  if (!store.abgeschlossen || typeof store.abgeschlossen !== "object") store.abgeschlossen = {};
  return { store, etag };
}

/**
 * Schreiben mit `If-Match`: zwei Geraete duerfen sich nicht gegenseitig
 * ueberschreiben. Bei 412 liest der Aufrufer einmal neu und setzt den eigenen
 * Eintrag auf den frischen Stand — verloren geht dabei nichts, weil
 * tutEintragen additiv ist.
 */
async function tutStoreSchreiben(server, user, pass, store, etag) {
  const headers = {
    Authorization: authHeader(user, pass),
    "Content-Type": "application/json; charset=utf-8",
  };
  // etag === null heisst "beim Lesen gab es die Datei noch nicht" (404) --
  // dann NICHT klaglos ueberschreiben, falls ein anderes Geraet inzwischen
  // die allererste Fassung angelegt hat. If-None-Match: * verlangt "nur
  // anlegen, wenn es die Datei noch nicht gibt" und laeuft bei Konflikt in
  // denselben 412-Wiederholungspfad wie If-Match sonst.
  if (etag) headers["If-Match"] = etag;
  else headers["If-None-Match"] = "*";
  return fetch(ncFilesBase(server, user) + TUT_STORE(), {
    method: "PUT", headers, body: JSON.stringify(store, null, 2),
  });
}

app.post("/api/nc/einweisungen", wacheArbeitsschutz, wacheBetriebsmittel, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await asStoreLesen(server, user, pass);
    res.json({ ...store });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/einweisungen/save", wacheArbeitsschutz, wacheBetriebsmittel, async (req, res) => {
  try {
    const b = ncBody(req);
    const { server, user, pass } = b;
    const eintrag = b.eintrag;
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    if (!eintrag || !eintrag.geraet || !eintrag.login || !eintrag.datum) {
      return res.status(400).json({ error: "Gerät, Person und Datum sind Pflicht" });
    }
    if (!ewGeraet(eintrag.geraet)) return res.status(400).json({ error: "Unbekanntes Arbeitsmittel" });
    if (!ewParse(eintrag.datum)) return res.status(400).json({ error: "Datum unbrauchbar (YYYY-MM-DD)" });

    const headers = { Authorization: authHeader(user, pass) };
    await assertOrdner(ncFilesBase(server, user), headers);

    // Vollstaendigkeit wird hier NOCH EINMAL geprueft, nicht nur im Formular:
    // ein unvollstaendiges Protokoll ist als Nachweis wertlos, und der Server
    // ist die Stelle, an der es nicht in die Akte kommt.
    const mangel = ewFehlt(eintrag);
    if (mangel.length) return res.status(400).json({ error: "Unvollständig: " + mangel.slice(0, 3).join(", ") });

    const neu = {
      geraet: eintrag.geraet,
      login: String(eintrag.login),
      name: String(eintrag.name || eintrag.login),
      datum: eintrag.datum,
      einweiser: String(eintrag.einweiser || ""),
      einweiserQualifikation: String(eintrag.einweiserQualifikation || ""),
      jugendlich: !!eintrag.jugendlich,
      kopf: eintrag.kopf && typeof eintrag.kopf === "object" ? eintrag.kopf : {},
      voraussetzungen: eintrag.voraussetzungen && typeof eintrag.voraussetzungen === "object" ? eintrag.voraussetzungen : {},
      inhalte: eintrag.inhalte && typeof eintrag.inhalte === "object" ? eintrag.inhalte : {},
      praxis: eintrag.praxis && typeof eintrag.praxis === "object" ? eintrag.praxis : {},
      bemerkung: String(eintrag.bemerkung || "").slice(0, 500),
      erfasstAm: new Date().toISOString(),
      erfasstVon: ssoUser(req) || String(eintrag.erfasstVon || ""),
    };

    // Das unterschriebene PDF ist der eigentliche Nachweis; die JSON-Ablage
    // traegt nur die Fristen. Deshalb zuerst das PDF ablegen — geht das
    // schief, wird gar nichts eingetragen, sonst stuende in der Uebersicht
    // eine Einweisung, zu der es kein Protokoll gibt.
    const jahr = eintrag.datum.slice(0, 4);
    if (b.pdfBase64 && b.dateiname) {
      const dsafe = String(b.dateiname).replace(/[/\\]/g, "_");
      // Jahresordner idempotent anlegen; 405 heisst „gibt es schon". AS_DIR()
      // liefert bereits ein fertig URL-kodiertes Segment (siehe ordnerUrl())
      // — hier NICHT ein zweites Mal kodieren, sonst wird aus einem
      // Ordnernamen mit Leerzeichen/Umlaut ein doppelt kodierter, falscher
      // Ordner (Fix Round 2, 2026-09-18).
      for (const dir of [AS_DIR(), AS_DIR() + "/Einweisungen", `${AS_DIR()}/Einweisungen/${jahr}`]) {
        const mk = await fetch(ncFilesBase(server, user) + dir, { method: "MKCOL", headers });
        if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + mk.status });
      }
      const ziel = `${ncFilesBase(server, user)}${AS_DIR()}/Einweisungen/${jahr}/` + encodeURIComponent(dsafe);
      const up = await fetch(ziel, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/pdf" },
        body: Buffer.from(b.pdfBase64, "base64"),
      });
      if (up.status !== 201 && up.status !== 204) return res.status(502).json({ error: "Protokoll ablegen: Status " + up.status });
      neu.datei = dsafe;
      neu.ncPfad = `${ordner()}/Arbeitsschutz/Einweisungen/${jahr}/${dsafe}`;
    }

    let versuch = 0, r;
    let faellig;
    while (versuch < 2) {
      const { store, etag } = await asStoreLesen(server, user, pass);
      // Additiv: jede Wiederholung kommt dazu, nichts wird ersetzt. Die
      // Nachweiskette muss auch Jahre spaeter noch lueckenlos sein.
      store.eintraege.push(neu);
      r = await asStoreSchreiben(server, user, pass, store, etag);
      if (r.status !== 412) break;
      versuch++;
    }
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });

    faellig = ewFaelligAm(neu.datum, neu.jugendlich);
    const kalender = await asTerminSchreiben(b, {
      uid: ewUid(neu.geraet, neu.login),
      datum: faellig,
      titel: `Einweisung fällig: ${ewGeraet(neu.geraet).label} — ${neu.name}`,
      text: `Letzte Einweisung am ${neu.datum}${neu.einweiser ? ` durch ${neu.einweiser}` : ""}.\n`
        + `Wiederholung nach § 12 Abs. 1 BetrSichV / § 4 DGUV Vorschrift 1`
        + `${neu.jugendlich ? " und § 29 Abs. 2 JArbSchG (halbjährlich)" : " (jährlich)"}.`,
    });
    // Zweitablage im durchsuchbaren Archiv. Scheitert sie, bleibt der Nachweis
    // trotzdem gueltig — deshalb nur gemeldet, nicht geworfen.
    const paperless = b.pdfBase64 && b.dateiname
      ? await plUpload({
        pdfBase64: b.pdfBase64, dateiname: neu.datei,
        titel: `Einweisung ${ewGeraet(neu.geraet).label} — ${neu.name} ${neu.datum}`,
        datum: neu.datum,
        themen: ["Thema/Arbeitsschutz", "Thema/Unterweisung"],
        typ: "Unterweisung",
      })
      : { ok: false, grund: "kein Protokoll übergeben" };
    if (!paperless.ok) console.error("[paperless] Einweisung:", paperless.grund);

    res.json({ ok: true, faellig, kalender, paperless, ncPfad: neu.ncPfad || null });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ─── Gemeinsame Ablage weiterer App-Dateien unter Blattwerk/App ─────────────
// Anlagen-Konfiguration (Nutzungsdauer je Gerät, Finanzübersicht) und das
// Fahrtenbuch liegen als JSON im selben Ordner wie tutorial.json und folgen
// demselben Muster: lesen mit ETag, schreiben additiv mit If-Match, bei 412
// einmal neu lesen. Eine gemeinsame Lese-/Schreibfunktion statt drei Kopien.
const ANLAGEN_STORE = () => `${APP_DIR()}/anlagen.json`;
const ANLAGEN_LEER = { version: 1, geraete: {} };
const FB_STORE = () => `${APP_DIR()}/fahrtenbuch.json`;
const FIXKOSTEN_STORE = () => `${APP_DIR()}/fixkosten.json`;
const FIXKOSTEN_LEER = { version: 1, posten: {} };
// Muss zu RHYTHMEN in dolibarr-app.jsx passen.
const FIXKOSTEN_RHYTHMEN = ["monat", "quartal", "halbjahr", "jahr"];

/**
 * Einen Fixkosten-Posten setzen — additiv je Schlüssel, nur bekannte Felder,
 * leere Konfiguration entfernt ihn. Reine Funktion (getestet in
 * test/finanzen/fixkosten-ablage.test.js).
 *
 * Abschalten statt löschen: ein ausgelaufener Vertrag soll sichtbar bleiben,
 * damit niemand ihn im nächsten Jahr versehentlich neu anlegt.
 */
export function fixkostenEintragen(store, key, konfig) {
  const s = store && typeof store === "object" ? store : {};
  const posten = { ...(s.posten && typeof s.posten === "object" ? s.posten : {}) };
  const k = konfig && typeof konfig === "object" ? konfig : {};
  const neu = {};
  const name = String(k.name ?? "").trim().slice(0, 80);
  if (name) neu.name = name;
  const betrag = Number(k.betrag);
  if (Number.isFinite(betrag) && betrag > 0 && betrag < 1e7) neu.betrag = Math.round(betrag * 100) / 100;
  if (FIXKOSTEN_RHYTHMEN.includes(k.rhythmus)) neu.rhythmus = k.rhythmus;
  if (typeof k.aus === "boolean") neu.aus = k.aus;
  // Naechste Faelligkeit (YYYY-MM-DD). Leerer String loescht sie wieder.
  if (typeof k.faellig === "string") {
    const d = k.faellig.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) neu.faellig = d;
    else if (d === "") neu.faellig = "";
  }
  if (!Object.keys(neu).length) { delete posten[key]; return { ...FIXKOSTEN_LEER, ...s, posten }; }
  posten[key] = { ...(posten[key] || {}), ...neu };
  return { ...FIXKOSTEN_LEER, ...s, posten };
}

/**
 * Konfiguration eines Anlageguts setzen — additiv je Schlüssel, nur bekannte
 * Felder, leere Konfiguration entfernt den Eintrag. Reine Funktion (getestet
 * in test/fahrtenbuch/ablage.test.js).
 */
export function anlagenEintragen(store, key, konfig) {
  const s = store && typeof store === "object" ? store : {};
  const geraete = { ...(s.geraete && typeof s.geraete === "object" ? s.geraete : {}) };
  const k = konfig && typeof konfig === "object" ? konfig : {};
  const neu = {};
  if (typeof k.anlagegut === "boolean") neu.anlagegut = k.anlagegut;
  const jahre = Number(k.afaJahre);
  if (Number.isFinite(jahre) && jahre >= 1 && jahre <= 50) neu.afaJahre = jahre;
  const name = String(k.name || "").trim().slice(0, 120);
  if (name) neu.name = name;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(k.gekauft || ""))) neu.gekauft = String(k.gekauft);
  if (Object.keys(neu).length) geraete[key] = neu; else delete geraete[key];
  return { ...s, version: 1, geraete };
}

export async function appStoreLesen(server, user, pass, pfad, leer, normalisieren) {
  const r = await fetch(ncFilesBase(server, user) + pfad, { headers: { Authorization: authHeader(user, pass) } });
  if (r.status === 401) throw Object.assign(new Error("Anmeldung ungültig"), { code: 401 });
  if (r.status === 404) return { store: JSON.parse(JSON.stringify(leer)), etag: null };
  if (!r.ok) throw new Error("Status " + r.status);
  const etag = r.headers.get("etag") || null;
  let store;
  try { store = JSON.parse(await r.text()); } catch { store = null; }
  if (!store || typeof store !== "object") {
    throw Object.assign(new Error(pfad.split("/").pop() + " ist unlesbar — bitte in Nextcloud prüfen"), { code: 409 });
  }
  return { store: normalisieren ? normalisieren(store) : store, etag };
}

// If-Match gegen gleichzeitiges Schreiben zweier Geräte; ohne ETag (Datei gab
// es beim Lesen noch nicht) If-None-Match: *, damit die Erstanlage nicht eine
// inzwischen von einem anderen Gerät angelegte Datei überschreibt.
export async function appStoreSchreiben(server, user, pass, pfad, store, etag) {
  const headers = { Authorization: authHeader(user, pass), "Content-Type": "application/json; charset=utf-8" };
  if (etag) headers["If-Match"] = etag; else headers["If-None-Match"] = "*";
  return fetch(ncFilesBase(server, user) + pfad, { method: "PUT", headers, body: JSON.stringify(store, null, 2) });
}

// Lesen → verändern → schreiben, mit einer Wiederholung bei 412. `aendern`
// ist eine reine Funktion (store → store) und darf werfen (400 an den Client).
export async function appStoreAendern(req, res, { pfad, leer, normalisieren, aendern, danach }) {
  const { server, user, pass } = ncBody(req);
  if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
  const headers = { Authorization: authHeader(user, pass) };
  await assertOrdner(ncFilesBase(server, user), headers);
  // APP_DIR() ist bereits URL-kodiert (ordnerUrl()) — nicht ein zweites Mal
  // kodieren (Fix Round 2, doppelte Kodierung legt bei Umlaut/Leerzeichen im
  // Ordnernamen den falschen Ordner an).
  const mk = await fetch(ncFilesBase(server, user) + APP_DIR(), { method: "MKCOL", headers });
  if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner App: Status " + mk.status });
  let versuch = 0, r, ergebnis;
  while (versuch < 2) {
    const { store, etag } = await appStoreLesen(server, user, pass, pfad, leer, normalisieren);
    try { ergebnis = aendern(store); } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
    r = await appStoreSchreiben(server, user, pass, pfad, ergebnis, etag);
    if (r.status !== 412) break;
    versuch++;
  }
  if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
  if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
  if (r.status === 412) return res.status(409).json({ error: "Gleichzeitige Änderung — bitte erneut versuchen" });
  if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });
  // `danach` laeuft erst, wenn der neue Stand wirklich in Nextcloud liegt
  // (z.B. externer Zeitstempel) und darf die Antwort ergaenzen.
  const zusatz = danach ? await danach(ergebnis, { server, user, pass }) : null;
  return res.json({ ok: true, ...ergebnis, ...zusatz });
}

// Prüfkette des Fahrtenbuchs (siehe kettePruefen in src/fahrtenbuch.js).
const fbSha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

// Externer Zeitstempel (RFC 3161): die Kette beweist Unversehrtheit, der
// Stempel beweist zusätzlich den Zeitpunkt — ohne ihn könnte der Eigentümer
// der Datei die ganze Kette nachträglich neu durchrechnen. Übertragen wird
// ausschließlich der Kettenhash, keine Fahrtdaten. Je Kettenstand eine .tsr
// neben der JSON in Nextcloud.
// Funktion statt Konstante: hängt am Ordner des Mandanten (APP_DIR() ist bereits URL-kodiert).
const FB_STEMPEL_DIR = () => `${APP_DIR()}/fahrtenbuch-stempel`;
const FB_TSA_URL = process.env.FB_TSA_URL || TSA_URL_DEFAULT;
const fbStempelDatei = (nr) => `${FB_STEMPEL_DIR()}/${String(nr).padStart(6, "0")}.tsr`;

async function fbStempeln(server, user, pass, kette) {
  const nr = Number(kette?.n) || 0;
  const hash = String(kette?.hash || "");
  if (!nr || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, fehler: "Kein Kettenstand zum Stempeln" };
  try {
    const r = await fetch(FB_TSA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: tsqBauen(hash, crypto.randomBytes(8)),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("Zeitstempel-Dienst: Status " + r.status);
    const antwort = Buffer.from(await r.arrayBuffer());
    const st = tsrStatus(antwort);
    if (!st.ok) throw new Error("Zeitstempel " + st.text);
    const headers = { Authorization: authHeader(user, pass) };
    const mk = await fetch(ncFilesBase(server, user) + FB_STEMPEL_DIR(), { method: "MKCOL", headers });
    if (mk.status !== 201 && mk.status !== 405) throw new Error("Stempelordner: Status " + mk.status);
    const put = await fetch(ncFilesBase(server, user) + fbStempelDatei(nr), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/timestamp-reply", "If-None-Match": "*" },
      body: antwort,
    });
    // 412: diesen Kettenstand hat ein anderes Gerät schon gestempelt. Ein
    // Stempel je Stand genügt — der zweite wäre derselbe Nachweis.
    if (put.status === 412) return { ok: true, nr, schon: true };
    if (put.status !== 201 && put.status !== 204) throw new Error("Stempel ablegen: Status " + put.status);
    return { ok: true, nr };
  } catch (e) {
    // Ein fehlgeschlagener Stempel darf die gespeicherte Fahrt nie gefährden —
    // die Kette steht auch ohne ihn, der nächste Vorgang stempelt wieder.
    // Node meldet Verbindungsfehler nur als "fetch failed"; der Grund steckt in
    // `cause` und gehört dazu, sonst steht in der App eine nutzlose Meldung.
    // Node meldet jeden Verbindungsfehler nur als "fetch failed" — was wirklich
    // war (ECONNREFUSED, Zeitüberschreitung, DNS), steht in `cause`.
    const grund = e?.cause?.code || e?.cause?.message || "";
    return { ok: false, nr, fehler: String(e.message || e) + (grund ? ` (${grund})` : "") };
  }
}

/** Bis zu welchem Kettenstand liegt ein Stempel vor? */
async function fbStempelStand(server, user, pass) {
  try {
    const r = await fetch(ncFilesBase(server, user) + FB_STEMPEL_DIR(),
      { method: "PROPFIND", headers: { Authorization: authHeader(user, pass), Depth: "1" } });
    if (!r.ok) return { nr: 0, anzahl: 0 };
    const dateien = parseDirListing(await r.text()).filter((d) => /\.tsr$/i.test(d.name));
    return { nr: dateien.reduce((m, d) => Math.max(m, parseInt(d.name, 10) || 0), 0), anzahl: dateien.length };
  } catch {
    return { nr: 0, anzahl: 0 };
  }
}
const fbNorm = (s) => ({ ...FB_STORE_LEER, ...s, fahrten: Array.isArray(s.fahrten) ? s.fahrten : [], fahrzeuge: Array.isArray(s.fahrzeuge) ? s.fahrzeuge : [] });
const anlagenNorm = (s) => ({ ...ANLAGEN_LEER, ...s, geraete: s.geraete && typeof s.geraete === "object" ? s.geraete : {} });
const fixkostenNorm = (s) => ({ ...FIXKOSTEN_LEER, ...s, posten: s.posten && typeof s.posten === "object" ? s.posten : {} });

app.post("/api/nc/anlagen", wacheErp, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await appStoreLesen(server, user, pass, ANLAGEN_STORE(), ANLAGEN_LEER, anlagenNorm);
    res.json(store);
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/anlagen/save", wacheErp, async (req, res) => {
  try {
    const b = req.body || {};
    const key = String(b.key || "").trim().slice(0, 80);
    if (!key) return res.status(400).json({ error: "Schlüssel fehlt" });
    await appStoreAendern(req, res, {
      pfad: ANLAGEN_STORE(), leer: ANLAGEN_LEER, normalisieren: anlagenNorm,
      aendern: (store) => anlagenEintragen(store, key, b.konfig),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/fixkosten", wacheErp, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await appStoreLesen(server, user, pass, FIXKOSTEN_STORE(), FIXKOSTEN_LEER, fixkostenNorm);
    res.json(store);
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/fixkosten/save", wacheErp, async (req, res) => {
  try {
    const b = req.body || {};
    const key = String(b.key || "").trim().slice(0, 80);
    if (!key) return res.status(400).json({ error: "Schlüssel fehlt" });
    await appStoreAendern(req, res, {
      pfad: FIXKOSTEN_STORE(), leer: FIXKOSTEN_LEER, normalisieren: fixkostenNorm,
      aendern: (store) => fixkostenEintragen(store, key, b.konfig),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// Modul „Bank" Teil 5: was der Buchhaltungsbot als „im Auszug, fehlt in Dolibarr" abgelegt hat (nur lesen) +
// das Gedaechtnis der App (erledigte Eintraege, gelernte Regeln). Zwei Dateien, damit Bot und App sich nie ueberschreiben.
const BANK_OFFEN_STORE = () => `${APP_DIR()}/kontoauszug-offen.json`;
const BANK_REGELN_STORE = () => `${APP_DIR()}/bank-regeln.json`;
app.post("/api/nc/bank-offen", wacheBelege, wacheBank, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const [offen, regeln] = await Promise.all([
      appStoreLesen(server, user, pass, BANK_OFFEN_STORE(), BANK_OFFEN_LEER, bankOffenNorm),
      appStoreLesen(server, user, pass, BANK_REGELN_STORE(), BANK_REGELN_LEER, bankRegelnNorm),
    ]);
    res.json({ offen: offen.store, regeln: regeln.store });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/bank-offen/erledigt", wacheBelege, wacheBank, async (req, res) => {
  try {
    const b = req.body || {};
    await appStoreAendern(req, res, {
      pfad: BANK_REGELN_STORE(), leer: BANK_REGELN_LEER, normalisieren: bankRegelnNorm,
      aendern: (store) => bankErledigtEintragen(store, b.id, b.regel),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ─── Fahrzeug-Überlassungsvereinbarungen ────────────────────────────────────
// JSON wie fahrtenbuch.json (Lesen-Ändern-Schreiben mit If-Match), PDF wie
// bei einweisungen/save in einem sichtbaren Blattwerk-Ordner — das PDF mit den
// Unterschriften ist der Nachweis, die JSON trägt nur die Daten.
const UEB_STORE = () => `${APP_DIR()}/ueberlassungen.json`;
const UEB_DIR = () => `${ordnerUrl()}/Fahrtenbuch/Ueberlassungen`;
const uebNorm = (s) => ({ ...UEB_STORE_LEER, ...s, vereinbarungen: Array.isArray(s.vereinbarungen) ? s.vereinbarungen : [] });

app.post("/api/nc/ueberlassungen", wacheFahrtenbuch, wacheUeberlassung, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await appStoreLesen(server, user, pass, UEB_STORE(), UEB_STORE_LEER, uebNorm);
    res.json(store);
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/ueberlassungen/save", wacheFahrtenbuch, wacheUeberlassung, async (req, res) => {
  try {
    const b = ncBody(req);
    const { server, user, pass } = b;
    const v = b.vereinbarung;
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    if (!v || !v.id) return res.status(400).json({ error: "Vereinbarung fehlt" });
    const login = ssoUser(req) || String(b.login || "").trim().slice(0, 120);
    const headers = { Authorization: authHeader(user, pass) };
    // Wie bei einweisungen/save: erst prüfen, ob das Konto den Firmenordner
    // sieht — sonst legt die MKCOL-Kette klaglos einen zweiten an.
    await assertOrdner(ncFilesBase(server, user), headers);
    // ACHTUNG: die Ablage heisst hier bewusst nicht `ncPfad` — so heisst die
    // Hilfsfunktion oben. Ein `let ncPfad` verdeckt sie im ganzen Handler und
    // MKCOL stirbt an "ncPfad is not a function", bevor irgendetwas ankommt.
    let datei, ablagePfad;
    if (b.pdfBase64) {
      const jahr = String(v.von || "").slice(0, 4) || new Date().getFullYear();
      datei = String(b.dateiname || uebDateiname(v)).replace(/[/\\]/g, "_");
      // ordnerUrl()/UEB_DIR() sind bereits URL-kodiert — nicht ein zweites
      // Mal kodieren (Fix Round 2, gleicher Fehler wie oben).
      for (const dir of [ordnerUrl() + "/Fahrtenbuch", UEB_DIR(), `${UEB_DIR()}/${jahr}`]) {
        const mk = await fetch(ncFilesBase(server, user) + dir, { method: "MKCOL", headers });
        if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + mk.status });
      }
      const up = await fetch(`${ncFilesBase(server, user)}${UEB_DIR()}/${jahr}/` + encodeURIComponent(datei), {
        method: "PUT", headers: { ...headers, "Content-Type": "application/pdf" }, body: Buffer.from(b.pdfBase64, "base64"),
      });
      if (up.status !== 201 && up.status !== 204) return res.status(502).json({ error: "Vereinbarung ablegen: Status " + up.status });
      ablagePfad = `${ordner()}/Fahrtenbuch/Ueberlassungen/${jahr}/${datei}`;
    }
    const jetzt = new Date().toISOString();
    await appStoreAendern(req, res, {
      pfad: UEB_STORE(), leer: UEB_STORE_LEER, normalisieren: uebNorm,
      aendern: (store) => uebEintragen(store, v, { jetzt, login, datei, ncPfad: ablagePfad }),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/ueberlassungen/widerruf", wacheFahrtenbuch, wacheUeberlassung, async (req, res) => {
  try {
    const b = ncBody(req);
    const id = String(b.id || "").trim();
    if (!id) return res.status(400).json({ error: "Id fehlt" });
    const login = ssoUser(req) || String(b.login || "").trim().slice(0, 120);
    await appStoreAendern(req, res, {
      pfad: UEB_STORE(), leer: UEB_STORE_LEER, normalisieren: uebNorm,
      aendern: (store) => uebWiderrufen(store, id, { jetzt: new Date().toISOString(), login, grund: b.grund }),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// Abgelegtes PDF holen — nur aus dem Überlassungs-Ordner, ohne Pfadsprünge.
app.post("/api/nc/ueberlassungen/datei", wacheFahrtenbuch, wacheUeberlassung, async (req, res) => {
  try {
    const { server, user, pass, jahr, datei } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const j = String(jahr || ""), d = String(datei || "");
    if (!/^\d{4}$/.test(j) || !d || d.includes("/") || d.includes("\\") || d.includes("..")) return res.status(400).json({ error: "Datei unbrauchbar" });
    const r = await fetch(`${ncFilesBase(server, user)}${UEB_DIR()}/${j}/` + encodeURIComponent(d), { headers: { Authorization: authHeader(user, pass) } });
    if (r.status === 404) return res.status(404).json({ error: "Datei nicht gefunden" });
    if (!r.ok) return res.status(502).json({ error: "Status " + r.status });
    res.setHeader("Content-Type", "application/pdf");
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/fahrtenbuch", wacheFahrtenbuch, wacheFahrtenbuchFn, async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await appStoreLesen(server, user, pass, FB_STORE(), FB_STORE_LEER, fbNorm);
    res.json({
      ...store,
      kettePruefung: kettePruefen(store, fbSha256),
      stempelStand: await fbStempelStand(server, user, pass),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

// Eine Fahrt (neu oder geändert, dann mit `grund`) oder ein Fahrzeug
// eintragen. Nummerierung und Historie macht fahrtEintragen — serverseitig,
// damit zwei Geräte nie dieselbe laufende Nummer vergeben.
app.post("/api/nc/fahrtenbuch/save", wacheFahrtenbuch, wacheFahrtenbuchFn, async (req, res) => {
  try {
    const b = req.body || {};
    const login = String(b.login || "").trim().slice(0, 120);
    if (!login) return res.status(400).json({ error: "Login fehlt" });
    if (!b.fahrt && !b.fahrzeug) return res.status(400).json({ error: "Fahrt oder Fahrzeug fehlt" });
    const jetzt = new Date().toISOString();
    await appStoreAendern(req, res, {
      pfad: FB_STORE(), leer: FB_STORE_LEER, normalisieren: fbNorm,
      aendern: (store) => {
        let s = store;
        if (b.fahrzeug) s = fahrzeugEintragen(s, b.fahrzeug);
        if (b.fahrt) s = fahrtEintragen(s, b.fahrt, { login, jetzt, grund: b.grund, sha256: fbSha256 });
        return s;
      },
      // Nach dem Schreiben: Kette nachrechnen (billig, rein) und den neuen
      // Stand extern stempeln lassen. Beides geht in die Antwort, damit die
      // App nach dem Speichern nicht mit veralteter Auskunft dasteht.
      danach: async (stand, zug) => ({
        kettePruefung: kettePruefen(stand, fbSha256),
        stempel: await fbStempeln(zug.server, zug.user, zug.pass, stand.kette),
      }),
    });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/tutorial", async (req, res) => {
  try {
    const { server, user, pass } = ncBody(req);
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    const { store } = await tutStoreLesen(server, user, pass);
    res.json({ ...store });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post("/api/nc/tutorial/save", async (req, res) => {
  try {
    const b = ncBody(req);
    const { server, user, pass } = b;
    // Gedeckelt, weil der Login hier zum Objektschluessel in einer geteilten
    // Team-Datei wird, die bei jedem Zugriff komplett gelesen und geschrieben
    // wird — anders als bei einweisungen/save, wo er nur ein Feldwert ist.
    const login = String(b.login || "").trim().slice(0, 120);
    const fassung = Number(b.fassung);
    const uebersprungen = b.uebersprungen === true;
    if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
    if (!login) return res.status(400).json({ error: "Login fehlt" });
    if (!Number.isInteger(fassung) || fassung < 1) return res.status(400).json({ error: "Fassung unbrauchbar" });

    const headers = { Authorization: authHeader(user, pass) };
    // Gleicher Grund wie bei einweisungen/save: ohne Vorpruefung legt die
    // MKCOL-Kette dem Dienstkonto einen zweiten Blattwerk-Ordner an und der
    // Abschluss verschwindet dorthin.
    await assertOrdner(ncFilesBase(server, user), headers);
    // Gleiches Muster wie der Jahresordner in einweisungen/save, hier nur ein
    // Ordner: 405 heisst „gibt es schon". APP_DIR() ist bereits kodiert,
    // nicht ein zweites Mal kodieren (Fix Round 2).
    const mk = await fetch(ncFilesBase(server, user) + APP_DIR(), { method: "MKCOL", headers });
    if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner App: Status " + mk.status });

    const heute = new Date().toISOString().slice(0, 10);
    // Schreiben mit Retry wie in einweisungen/save: bei 412 (If-Match
    // schlug fehl) einmal neu lesen und den eigenen Eintrag erneut
    // daraufsetzen — additiv, es geht dabei nichts verloren.
    let versuch = 0, r;
    while (versuch < 2) {
      const { store, etag } = await tutStoreLesen(server, user, pass);
      r = await tutStoreSchreiben(server, user, pass, tutEintragen(store, login, fassung, heute, uebersprungen), etag);
      if (r.status !== 412) break;
      versuch++;
    }
    if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
    if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
    if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });
    res.json({ ok: true });
  } catch (e) {
    if (e.code) return res.status(e.code).json({ error: e.message });
    res.status(502).json({ error: String(e.message || e) });
  }
});

/**
 * Ganztaegiger Termin im Team-Kalender, mit fester UID. Beim naechsten Mal
 * ueberschreibt derselbe Schluessel den alten Termin, statt einen zweiten
 * anzulegen — sonst waechst der Kalender mit jeder Auffrischung zu.
 * Schlaegt das fehl, ist das kein Grund, die Einweisung zu verwerfen: der
 * Nachweis ist gespeichert, nur die Erinnerung fehlt. Deshalb Rueckgabewert
 * statt Ausnahme.
 */
export async function asTerminSchreiben(creds, { uid, datum, titel, text }) {
  try {
    const calendarUrl = creds.calendarUrl || (ncTeamCreds() || {}).calendarUrl;
    if (!calendarUrl || !datum) return { ok: false, grund: "kein Kalender hinterlegt" };
    const d = ewParse(datum);
    if (!d) return { ok: false, grund: "Datum unbrauchbar" };
    const tag = `${d.y}${pad(d.m)}${pad(d.d)}`;
    const naechster = new Date(Date.UTC(d.y, d.m - 1, d.d + 1));
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blattwerk//DoliMobile//DE",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + icsStampUtc(new Date()),
      "DTSTART;VALUE=DATE:" + tag,
      "DTEND;VALUE=DATE:" + `${naechster.getUTCFullYear()}${pad(naechster.getUTCMonth() + 1)}${pad(naechster.getUTCDate())}`,
      "SUMMARY:" + icsEsc(titel),
      "DESCRIPTION:" + icsEsc(text),
      "CATEGORIES:Arbeitsschutz",
      // Ohne Alarm erinnert der Termin niemanden, der nicht zufaellig
      // hinschaut. Eine Woche vorher, 8 Uhr am Vortag der Frist.
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(titel),
      "TRIGGER:-P7D", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const href = trimSlash(calendarUrl) + "/" + encodeURIComponent(uid) + ".ics";
    const r = await fetch(href, {
      method: "PUT",
      headers: { Authorization: authHeader(creds.user, creds.pass), "Content-Type": "text/calendar; charset=utf-8" },
      body: ics,
    });
    if (r.status === 201 || r.status === 204) return { ok: true, uid };
    return { ok: false, grund: "Status " + r.status };
  } catch (e) { return { ok: false, grund: String(e.message || e) }; }
}

// ---------- Paperless-ngx ----------
// Archiv fuer Arbeitsschutz-Unterlagen und die Verwaltungs-Dokumente. Fuer die
// Grundsatzunterlagen (GbuPage-Reiter "Grundlagen") und die Vor-Ort-Beur-
// teilungen — neue wie der Abschnitt "Alle Beurteilungen" — ist Paperless
// seit 09.08.2026 die Quelle, nicht mehr Nextcloud. gbu-list/gbu-file/
// gbu-upload haben seit demselben Tag keinen Aufrufer mehr aus der App und
// bedienen serverseitig nur noch den Altbestand, bis dieser per
// scripts/altbestand-import.mjs importiert ist — danach entfallen sie.
//
// Erreichbar nur im LAN/VPN: Paperless haengt an derselben Authentik-
// Forward-Auth wie Dolibarr und die App selbst. Ueber den oeffentlichen
// Hostnamen liefe jeder Upload in eine 302 auf die Anmeldeseite — deshalb
// direkt gegen die LAN-Adresse, so wie es der Beleg-Freigabe-Proxy schon macht.
//
// Funktion statt Konstante (Abschlusspruefung 18.09.2026, Befund C2): bis
// dahin stand hier `process.env.PAPERLESS_URL || "http://203.0.113.41:8010"`
// — Blattwerks eigene Instanz — waehrend wachePaperless gegen
// `dienste.paperless` prueft. Wache und Route meinten damit verschiedene
// Dinge: ohne gesetzte ENV lud ein fremder Mandant seine Dokumente in
// Blattwerks Paperless, und Blattwerks Liste zeigte sie. Die Adresse kommt
// jetzt aus dem Mandanten (paperlessBasis, src/mandant-server.mjs), die
// mandant.json wird zur Laufzeit neu gelesen — deshalb bei JEDEM Zugriff
// frisch auswerten und nirgends einfrieren.
const PAPERLESS_BASE = () => paperlessBasis(mandantJetzt());

// Hausordnung des Archivs (siehe brain/Knowledge/paperless-mail-tag-system.md):
// drei Achsen, und JEDES Dokument traegt genau EIN `Bereich/*`. Herkunft wird
// nie geraten, nur `Thema/*` darf der Klassifikator lernen. Deshalb werden die
// Schlagworte hier ausdruecklich gesetzt und nicht dem Matching ueberlassen.
//
// Ebenfalls Befund C2: die beiden Namen standen fest auf "Bereich/Blattwerk"
// und "Baum- und Gartenpflege Blattwerk GbR" — auch eine korrekt
// konfigurierte fremde Instanz beschriftete ihre Dokumente damit als
// Blattwerk. Sie kommen jetzt aus dem Mandanten (paperlessNamen); fuer
// Blattwerk selbst kommt Zeichen fuer Zeichen dasselbe heraus.
const PL_BEREICH = () => paperlessNamen(mandantJetzt()).bereich;
const PL_KORRESPONDENT = () => paperlessNamen(mandantJetzt()).korrespondent;

const plToken = () => process.env.PAPERLESS_TOKEN || "";
const plAktiv = () => !!plToken();

/** Namen -> IDs. Einmal pro Serverleben; Paperless-Stammdaten aendern sich selten. */
// Schluessel traegt die Basis-Adresse mit: mandantHandler.put liest die
// mandant.json zur Laufzeit neu, `dienste.paperless` kann sich also im
// laufenden Prozess aendern. Ohne die Adresse im Schluessel lieferte der Cache
// danach Schlagwort-/Korrespondenten-IDs der VORHERIGEN Instanz — und die
// zeigen in einer anderen Datenbank auf etwas voellig anderes.
const plCache = new Map();
async function plId(art, name) {
  const schluessel = PAPERLESS_BASE() + "|" + art + ":" + name;
  if (plCache.has(schluessel)) return plCache.get(schluessel);
  const url = `${PAPERLESS_BASE()}/api/${art}/?name__iexact=${encodeURIComponent(name)}`;
  const r = await fetch(url, { headers: { Authorization: "Token " + plToken(), Accept: "application/json" } });
  if (!r.ok) throw new Error(`${art} "${name}": Status ${r.status}`);
  const d = await r.json();
  const treffer = (d.results || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  if (!treffer) throw new Error(`${art} "${name}" fehlt in Paperless`);
  plCache.set(schluessel, treffer.id);
  return treffer.id;
}

/**
 * ID eines Zusatzfeldes über seinen Namen. Eigene Funktion, weil die
 * Zusatzfelder-Liste den `name__iexact`-Filter nicht sicher unterstuetzt —
 * es sind ohnehin nur eine Handvoll, also alle holen und selbst suchen.
 */
async function plFeldId(name) {
  const schluessel = PAPERLESS_BASE() + "|custom_fields:" + name;
  if (plCache.has(schluessel)) return plCache.get(schluessel);
  const r = await fetch(`${PAPERLESS_BASE()}/api/custom_fields/?page_size=100`, {
    headers: { Authorization: "Token " + plToken(), Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Zusatzfelder: Status ${r.status}`);
  const d = await r.json();
  const treffer = (d.results || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  if (!treffer) throw new Error(`Zusatzfeld "${name}" fehlt in Paperless`);
  plCache.set(schluessel, treffer.id);
  return treffer.id;
}

const PL_FELD_GUELTIG = "Gültig bis";
const plKopf = () => ({ Authorization: "Token " + plToken(), Accept: "application/json" });

/**
 * Dokument-Id anhand der Pruefsumme suchen — fuer Fachmodule, die nach einem
 * fruehen Upload (plUpload liefert nur die Aufgaben-UUID, nie die Dokument-
 * Id) spaeter wissen wollen, ob Paperless die Datei inzwischen verarbeitet
 * hat (src/server/gbu-offline.mjs, /api/nc/gbu/meine). Kein Themen-Filter
 * hier: der Aufrufer kennt die Pruefsumme nur, wenn er die Datei selbst
 * hochgeladen hat.
 */
export async function plChecksumSuche(sha256) {
  if (!plAktiv() || !sha256) return null;
  const r = await fetch(`${PAPERLESS_BASE()}/api/documents/?${plPruefsummeQuery(sha256)}`, { headers: plKopf() });
  if (!r.ok) throw new Error(`Paperless: Status ${r.status}`);
  return plDuplikat(await r.json());
}

/**
 * Ein PDF in Paperless ablegen.
 *
 * Rueckgabe statt Ausnahme: die Zweitablage darf den eigentlichen Vorgang nie
 * scheitern lassen. Ein Einweisungsprotokoll, das in Nextcloud liegt und
 * unterschrieben ist, ist auch ohne Paperless gueltig.
 *
 * Achtung bei der Doppelt-Erkennung: Paperless prueft die Pruefsumme erst
 * asynchron im Consumer. Die HTTP-Antwort sagt also NICHT, ob das Dokument
 * schon da war — Aufrufer, denen das wichtig ist, pruefen selbst vorab
 * (siehe /api/pl/upload mit sha256).
 */
export async function plUpload({ pdfBase64, dateiname, titel, datum, themen = [], typ, customFields }) {
  try {
    if (!plAktiv()) return { ok: false, grund: "kein PAPERLESS_TOKEN gesetzt" };
    const tagIds = [await plId("tags", PL_BEREICH())];
    for (const t of themen) tagIds.push(await plId("tags", t));
    const form = new FormData();
    form.append("document", new Blob([Buffer.from(pdfBase64, "base64")], { type: "application/pdf" }), dateiname);
    form.append("title", titel);
    // Das Datum des Dokuments, nicht der Zeitpunkt des Hochladens — sonst
    // sortiert das Archiv nach dem Tag, an dem jemand aufgeraeumt hat.
    if (datum) form.append("created", datum);
    form.append("correspondent", String(await plId("correspondents", PL_KORRESPONDENT())));
    if (typ) form.append("document_type", String(await plId("document_types", typ)));
    for (const id of tagIds) form.append("tags", String(id));
    // Zusatzfelder gehen als {feldId: wert} mit — beim Hochladen, nicht
    // nachtraeglich, sonst steht das Dokument kurz ohne Frist im Archiv.
    if (customFields && Object.keys(customFields).length) {
      form.append("custom_fields", JSON.stringify(customFields));
    }
    const r = await fetch(`${PAPERLESS_BASE()}/api/documents/post_document/`, {
      method: "POST",
      headers: { Authorization: "Token " + plToken(), Accept: "application/json" },
      body: form,
    });
    const txt = (await r.text()).slice(0, 200);
    if (!r.ok) return { ok: false, grund: `Status ${r.status}: ${txt}` };
    // Antwort ist die Aufgaben-UUID des Consumers, nicht die Dokument-ID.
    return { ok: true, aufgabe: txt.replace(/^"|"$/g, "") };
  } catch (e) { return { ok: false, grund: String(e.message || e) }; }
}

// ---------- Paperless fuer den Verwaltungs-Reiter ----------
// Der Browser spricht Paperless nicht an: der Token gehoert nicht dorthin, und
// der oeffentliche Hostname haengt an derselben Authentik-Weiterleitung wie die
// App — jeder Aufruf endete auf der Anmeldeseite. Deshalb dieser Umweg.
//
// `thema` NUR auf das Praefix "Thema/" zu pruefen reicht nicht (Befund 1):
// das Dienstkonto sieht das gesamte Bereich/Blattwerk-Archiv, darunter auch
// Thema/Bank, Thema/Steuer, Thema/Personal und Thema/Rechnung — nicht bloss
// die vier Themen, die dieser Reiter zeigen soll. Beide Endpunkte pruefen
// deshalb gegen PL_THEMA_ERLAUBT (die Whitelist der App), nicht gegen ein
// Praefixmuster. /api/pl/file/:id reicht eine ID zusaetzlich nur durch, wenn
// das Dokument selbst eines der erlaubten Themen traegt — sonst waere jede
// erratene ID ein Leseweg am Themenfilter vorbei. Beide Endpunkte nehmen
// keine Zugangsdaten entgegen; Direktzugriff auf den Port umgeht wie bei
// SSO_TRUSTED_IPS oben die Authentik-Weiterleitung, im LAN ist also jeder hier.
const PL_THEMA_ERLAUBT = new Set(Object.values(PL_THEMA));

/** Einheitliche Absage, wenn das Setup fehlt — nie eine leere Liste. */
const plNichtEingerichtet = (res) =>
  res.status(503).json({ error: "Paperless ist nicht eingerichtet (PAPERLESS_TOKEN fehlt)" });

// „Alle Dokumente" (thema=alle, Spec 2026-09-23) zeigt die ganze Blattwerk-Ablage
// inklusive Bank/Steuer/Personal — deshalb mit Rechte-Wache (src/pl-rechte.mjs).
// Hochladen mit thema=alle duerfen alle; die Wache sitzt nur vor Liste und Datei.
const plGruppenLaden = dolibarrGruppenLader({ storeLoad: ssoStoreLoad });
const wachePlAlle = plAlleWache({ ssoUser, istMandantAdmin, gruppenLaden: plGruppenLaden, rechte: () => mandantJetzt()?.rechte });
const nurBeiAlle = (req, res, next) => (String(req.query.thema || "") === PL_ALLE ? wachePlAlle(req, res, next) : next());

app.get("/api/pl/list", wachePl, nurBeiAlle, async (req, res) => {
  if (!plAktiv()) return plNichtEingerichtet(res);
  const thema = String(req.query.thema || "");
  if (thema !== PL_ALLE) {
    if (!PL_THEMA_ERLAUBT.has(thema)) return res.status(400).json({ error: "unbekanntes Thema" });
  }
  try {
    const ids = thema === PL_ALLE
      ? [await plId("tags", PL_BEREICH())]
      : [await plId("tags", PL_BEREICH()), await plId("tags", thema)];
    // Befund 3: Thema/Arbeitsschutz umfasst auch die Einweisungsprotokolle —
    // /api/nc/einweisungen/save legt sie zusaetzlich mit Thema/Unterweisung
    // ab. Der Ausschluss ist fest an thema === PL_THEMA.arbeitsschutz
    // gekoppelt, NICHT ein vom Aufrufer waehlbarer Parameter: ein Aufruf
    // direkt gegen den Endpunkt (ohne App dazwischen, siehe
    // SSO_TRUSTED_IPS-Kommentar oben) koennte einen client-gesteuerten
    // Ausschluss einfach weglassen und haette die Protokolle wieder in der
    // Liste. Bewusst ohne .catch(() => null): faellt die Aufloesung fuer
    // GENAU DIESES eine Thema aus, soll die Anfrage laut scheitern (502)
    // statt den Ausschluss still zu ignorieren.
    const ohneIds = thema === PL_THEMA.arbeitsschutz ? [await plId("tags", PL_THEMA_UNTERWEISUNG)] : [];
    const feld = await plFeldId(PL_FELD_GUELTIG).catch(() => null);
    const r = await fetch(`${PAPERLESS_BASE()}/api/documents/?${plListeQuery(ids, ohneIds)}`, { headers: plKopf() });
    if (!r.ok) return res.status(502).json({ error: `Paperless: Status ${r.status}` });
    const d = await r.json();
    res.json({ docs: (d.results || []).map((x) => plKurz(x, feld)) });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.get("/api/pl/file/:id", wachePl, nurBeiAlle, async (req, res) => {
  if (!plAktiv()) return plNichtEingerichtet(res);
  const id = String(req.params.id || "");
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "ungueltige ID" });
  try {
    // Themenpruefung vor dem Download (Befund 1): die ID allein sagt nichts
    // ueber das Thema, das Dienstkonto sieht das ganze Bereich/Blattwerk-
    // Archiv. plId(...).catch(null) statt eines gemeinsamen Fehlschlags: fehlt
    // in Paperless ein einzelnes der vier Themen-Schlagworte (noch nicht
    // angelegt), sollen die anderen drei trotzdem funktionieren statt jeden
    // Dateiaufruf mit 502 zu blockieren.
    const themaIds = (await Promise.all(
      [...PL_THEMA_ERLAUBT].map((t) => plId("tags", t).catch(() => null))
    )).filter((x) => x != null);
    // Befund 3: ein Einweisungsprotokoll traegt IMMER auch Thema/Arbeitsschutz
    // (eines der erlaubten Themen oben) und wuerde die Pruefung sonst
    // trotzdem bestehen, sobald jemand seine ID kennt oder durchprobiert —
    // die Liste blendet es zwar aus, dieser Endpunkt hier nimmt aber jede ID
    // entgegen. Deshalb zusaetzlich und unbedingt gesperrt, nicht nur beim
    // Thema Arbeitsschutz: dieser Proxy ist schlicht nie der richtige Weg zu
    // einem Einweisungsprotokoll (das laeuft ueber /api/nc/einweisungen).
    const unterweisungId = await plId("tags", PL_THEMA_UNTERWEISUNG).catch(() => null);
    const metaR = await fetch(`${PAPERLESS_BASE()}/api/documents/${id}/`, { headers: plKopf() });
    if (!metaR.ok) return res.status(metaR.status === 404 ? 404 : 502).json({ error: `Paperless: Status ${metaR.status}` });
    const meta = await metaR.json();
    const hatErlaubtesThema = Array.isArray(meta.tags) && meta.tags.some((t) => themaIds.includes(t));
    const istUnterweisung = unterweisungId != null && Array.isArray(meta.tags) && meta.tags.includes(unterweisungId);
    // thema=alle (hinter nurBeiAlle): jedes Dokument des Bereichs, sonst die Themen-Regel von oben.
    if (String(req.query.thema || "") === PL_ALLE) {
      const bereichId = await plId("tags", PL_BEREICH());
      if (!(Array.isArray(meta.tags) && meta.tags.includes(bereichId))) {
        return res.status(404).json({ error: "nicht gefunden" });
      }
    } else if (!hatErlaubtesThema || istUnterweisung) {
      return res.status(404).json({ error: "nicht gefunden" });
    }

    const r = await fetch(`${PAPERLESS_BASE()}/api/documents/${id}/download/`, { headers: plKopf() });
    if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: `Paperless: Status ${r.status}` });
    res.setHeader("Content-Type", "application/pdf");
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/pl/upload", wachePl, wachePlFunktion, async (req, res) => {
  if (!plAktiv()) return plNichtEingerichtet(res);
  const { pdfBase64, dateiname, titel, datum, thema, gueltigBis, sha256 } = req.body || {};
  if (!pdfBase64 || !dateiname || !titel) return res.status(400).json({ error: "unvollstaendige Angaben" });
  // Nur der Zeichenvorrat, keine PDF-Pruefung: Buffer.from(x, "base64") wirft bei
  // Unsinn nicht, sondern liefert stillschweigend Muell, und der Upload schlaegt
  // erst unsichtbar in Paperless fehl. Das faengt diesen Fall vorher ab.
  //
  // Genauso nachsichtig wie Buffer.from selbst, sonst weist der Server Uploads
  // ab, die er klaglos verarbeiten koennte: Zeilenumbrueche raus (manche Erzeuger
  // brechen um), und das URL-sichere Alphabet (-_) gilt mit.
  if (!/^[A-Za-z0-9+/\-_]+={0,2}$/.test(String(pdfBase64).replace(/\s+/g, ""))) {
    return res.status(400).json({ error: "ungueltiges Base64" });
  }
  // thema=alle: Kachel „Dokument hochladen" — Bereich + Quelle/App (+ Beleg-Tag beim Schalter), Thema vergibt Paperless.
  const alle = thema === PL_ALLE;
  if (!alle && !String(thema || "").startsWith("Thema/")) return res.status(400).json({ error: "unbekanntes Thema" });
  try {
    // Vorab pruefen statt hinterher aufraeumen: Paperless erkennt Doppel erst
    // asynchron im Consumer, die Antwort auf das Hochladen sagt dazu nichts.
    if (sha256) {
      const r = await fetch(`${PAPERLESS_BASE()}/api/documents/?${plPruefsummeQuery(sha256)}`, { headers: plKopf() });
      // Bei einem HTTP-Fehler (Neustart, abgelaufener Token, Rate-Limit) ist die
      // Pruefsummen-Abfrage nicht "kein Treffer", sondern unbekannt. Ein
      // Duplikat-Schutz, der im Zweifel durchlaesst statt abzubrechen, schuetzt
      // vor nichts — deshalb hier abbrechen statt stillschweigend hochzuladen.
      if (!r.ok) throw new Error(`Pruefsummen-Abfrage an Paperless fehlgeschlagen: Status ${r.status}`);
      const treffer = plDuplikat(await r.json());
      if (treffer) return res.json({ doppelt: true, ...treffer });
    }
    let customFields;
    if (gueltigBis) customFields = { [await plFeldId(PL_FELD_GUELTIG)]: gueltigBis };
    const erg = await plUpload({
      pdfBase64, dateiname, titel, datum,
      themen: alle ? [PL_QUELLE_APP, ...(req.body?.beleg ? [PL_BELEG_TAG] : [])] : [thema], customFields,
    });
    if (!erg.ok) return res.status(502).json({ error: erg.grund });
    res.json({ ok: true, aufgabe: erg.aufgabe });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// ---------- Erinnerung an faellige Einweisungen ----------
// „Automatisch erinnern" heisst: es muss auch dann etwas passieren, wenn
// niemand die App oeffnet. Der Kalendertermin allein reicht dafuer nicht — er
// erinnert nur den, der hinsieht. Deshalb zusaetzlich eine taegliche Mail,
// solange etwas offen ist.
//
// Kein Cron, kein zusaetzlicher Dienst: ein Stundentakt im Server genuegt. Ob
// heute schon gemeldet wurde, steht in der JSON-Datei selbst und nicht im
// Arbeitsspeicher — sonst faengt nach jedem Neustart des Containers alles von
// vorne an und die Mail kommt mehrfach.

const asHeute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Personen aus den Eintraegen ableiten — wer nie eingewiesen wurde, hat auch keine Frist. */
export const asPersonen = (eintraege) => {
  const m = new Map();
  for (const e of eintraege || []) {
    if (e && e.login && !m.has(e.login)) m.set(e.login, { login: e.login, name: e.name || e.login, jugendlich: !!e.jugendlich });
  }
  return [...m.values()];
};

async function asErinnerungPruefen() {
  const creds = ncTeamCreds();
  if (!creds) return; // ohne Dienstkonto kein Zugriff auf die Akte
  const cfg = {
    host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || 465,
    user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    // Kein `|| "max@example.org"` mehr (Befund I7): Blattwerks
    // eigene Adresse steht in MANDANT_STANDARD.kontakt.arbeitsschutzMail, ein
    // fremder Mandant ohne eigene Adresse bekommt gar keine Mail statt einer
    // an Blattwerk.
    to: arbeitsschutzEmpfaenger(mandantJetzt()),
  };
  if (!cfg.host || !cfg.user || !cfg.pass) return;
  if (!cfg.to) {
    console.error("[arbeitsschutz] Keine Empfängeradresse hinterlegt (mandant.json: kontakt.arbeitsschutzMail oder ENV ARBEITSSCHUTZ_MAIL_TO) — die Fristen-Sammelmail bleibt aus.");
    return;
  }
  const heute = asHeute();
  const stunde = new Date().getHours();
  if (stunde < 6) return; // nicht mitten in der Nacht

  /**
   * Tagesmarke setzen — und dabei wirklich pruefen, ob sie angekommen ist.
   * Zwischen Lesen und Schreiben liegt der Mailversand; traegt in der Zeit
   * jemand eine Einweisung ein, laeuft das PUT mit dem alten ETag in ein 412.
   * Ohne Nachfassen bliebe die Marke stehen und dieselbe Mail ginge Stunde um
   * Stunde erneut raus.
   */
  const tagAbhaken = async () => {
    for (let versuch = 0; versuch < 3; versuch++) {
      const { store: frisch, etag: frischEtag } = await asStoreLesen(creds.server, creds.user, creds.pass);
      frisch.letzteErinnerung = heute;
      const r = await asStoreSchreiben(creds.server, creds.user, creds.pass, frisch, frischEtag);
      if (r.status !== 412) {
        if (r.status !== 201 && r.status !== 204) console.error("[arbeitsschutz] Tagesmarke: Status " + r.status);
        return;
      }
    }
    console.error("[arbeitsschutz] Tagesmarke konnte nicht gesetzt werden");
  };

  const { store } = await asStoreLesen(creds.server, creds.user, creds.pass);
  if (store.letzteErinnerung === heute) return;

  const faellig = ewFaelligkeiten(store.eintraege, asPersonen(store.eintraege), heute);
  const pruefungen = (store.pruefungen || []).filter((p) => {
    const t = p && p.faellig ? ewTageBis(heute, p.faellig) : null;
    return t !== null && t <= 30;
  });
  const qualiHtml = await qualiErinnerungHtml(creds, heute);
  const qualiAnzahl = await qualiErinnerungAnzahl(creds, heute);
  // Nichts offen: trotzdem den Tag vermerken, damit nicht jede Stunde neu geprueft wird.
  if (!faellig.length && !pruefungen.length && !qualiHtml) {
    await tagAbhaken();
    return;
  }

  const zeile = (t) => (t < 0 ? `seit ${-t} Tag(en) überfällig` : t === 0 ? "heute fällig" : `in ${t} Tag(en)`);
  const rows = faellig.map((f) =>
    `<li><b>${htmlEsc(f.label)}</b> — ${htmlEsc(f.name)}: ${htmlEsc(zeile(f.tage))} (spätestens ${htmlEsc(f.faellig)})</li>`).join("");
  const pRows = pruefungen.map((p) =>
    `<li><b>${htmlEsc(p.label || p.id)}</b>: fällig am ${htmlEsc(p.faellig)}</li>`).join("");
  const html = `<html><body style="font-family:sans-serif;max-width:640px">
    <h2 style="margin:0 0 8px">Arbeitsschutz: offene Fristen</h2>
    ${rows ? `<p style="margin:0 0 6px">Einweisungen an Arbeitsmitteln:</p><ul style="margin:0 0 12px;padding-left:20px">${rows}</ul>` : ""}
    ${pRows ? `<p style="margin:0 0 6px">Weitere Prüfungen:</p><ul style="margin:0 0 12px;padding-left:20px">${pRows}</ul>` : ""}
    ${qualiHtml}
    <p style="margin:0 0 10px;color:#555">Wiederholung der Unterweisung: § 12 Abs. 1 BetrSichV, § 4 DGUV Vorschrift 1
    (jährlich), bei unter 18-Jährigen § 29 Abs. 2 JArbSchG (halbjährlich).</p>
    <p style="color:#999;font-size:12px">Automatisch verschickt von der Blattwerk-App. Eintragen unter Start → Arbeitsschutz.</p>
  </body></html>`;
  await smtpSendMail({ ...cfg, subject: `[Blattwerk] Arbeitsschutz: ${faellig.length + pruefungen.length + qualiAnzahl} offene Frist(en)`, html });
  await tagAbhaken();
}

/** Tage von a bis b (ISO), null bei kaputten Daten. Kleiner Zwilling aus arbeitsschutz.js. */
const ewTageBis = (a, b) => {
  const pa = ewParse(a), pb = ewParse(b);
  if (!pa || !pb) return null;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
};

/**
 * Stundentakt: prueft, ob Einweisungen faellig sind, und erinnert bei Bedarf.
 * Gate zuerst: `asErinnerungPruefen` (SMTP + Nextcloud-Dienstkonto) darf NIE
 * laufen, wenn der Block `arbeitsschutz` fuer den aktuellen Mandanten aus
 * ist — sonst verschickt eine Instanz, bei der Arbeitsschutz bewusst
 * abgeschaltet wurde, trotzdem staendlich Erinnerungsmails (Fund aus dem
 * Review zu Task 10: die Schleife war bisher an KEINEN Block gebunden).
 * `mandant`/`pruefen` sind injizierbar, genau dafuer: `blockAktiv` selbst ist
 * bereits pure und getestet, der eigentliche Fehler war die fehlende
 * Verdrahtung hier, und die laesst sich nur durch echtes Aufrufen dieser
 * Funktion pruefen, nicht durch einen weiteren Test auf `blockAktiv` allein.
 * Ohne Parameter (Produktivbetrieb) unveraendertes Verhalten: aktueller
 * Mandant, echte Pruefung.
 */
export async function asStundentakt(mandant = mandantJetzt(), pruefen = asErinnerungPruefen) {
  if (!blockAktiv(mandant, "arbeitsschutz")) return;
  await pruefen();
}

if (!process.env.VITEST && process.env.ARBEITSSCHUTZ_ERINNERUNG !== "0") {
  const lauf = () => asStundentakt().catch((e) => console.error("[arbeitsschutz]", e.message || e));
  setTimeout(lauf, 60_000).unref?.();          // nach dem Start einmal, nicht sofort im Boot-Sturm
  setInterval(lauf, 3600_000).unref?.();
}

// ---------- Bestell-Mail ----------
// Minimaler SMTPS-Client (Port 465, wie die Beleg-Pipeline) — bewusst ohne
// nodemailer-Dependency. Konfiguration über ENV: SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS, MAIL_FROM, ORDER_MAIL_TO.
function smtpSendMail({ host, port, user, pass, from, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: Number(port) || 465, servername: host });
    let buf = "";
    let done = false;
    const fail = (e) => { if (!done) { done = true; try { sock.destroy(); } catch (_) {} reject(e); } };
    sock.setTimeout(30000, () => fail(new Error("SMTP-Timeout")));
    sock.on("error", fail);
    const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
    const utf8Subject = "=?UTF-8?B?" + b64(subject) + "?=";
    const body = [
      `From: Blattwerk App <${from}>`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <bestellung-${Date.now()}@blattwerk-app>`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      // base64-Body umgeht Zeilenlängen-/Dot-Stuffing-Probleme komplett
      b64(html).replace(/(.{76})/g, "$1\r\n"),
    ].join("\r\n");
    // Ablauf: Greeting → EHLO → AUTH LOGIN → MAIL FROM → RCPT TO → DATA → QUIT
    const steps = [
      { expect: "220", send: `EHLO blattwerk-app` },
      { expect: "250", send: `AUTH LOGIN` },
      { expect: "334", send: b64(user) },
      { expect: "334", send: b64(pass) },
      { expect: "235", send: `MAIL FROM:<${from}>` },
      { expect: "250", send: `RCPT TO:<${to}>` },
      { expect: "250", send: `DATA` },
      { expect: "354", send: body + "\r\n." },
      { expect: "250", send: `QUIT`, last: true },
    ];
    let i = 0;
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      // Antwort komplett? (letzte Zeile "NNN " statt "NNN-")
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      if (!/^\d{3} /.test(lastLine)) return;
      const code = lastLine.slice(0, 3);
      buf = "";
      const step = steps[i];
      if (!step) return;
      if (!code.startsWith(step.expect)) return fail(new Error(`SMTP ${code} (erwartet ${step.expect}): ${lastLine.slice(4, 200)}`));
      sock.write(step.send + "\r\n");
      if (step.last) { done = true; try { sock.end(); } catch (_) {} return resolve(true); }
      i++;
    });
  });
}

const htmlEsc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

app.post("/api/mail/order", wacheBestellung, wacheBestellungen, async (req, res) => {
  try {
    const cfg = {
      host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || 465,
      user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: bestellEmpfaenger(mandantJetzt()),
    };
    if (!cfg.host || !cfg.user || !cfg.pass) return res.status(501).json({ error: "SMTP nicht konfiguriert (ENV SMTP_HOST/USER/PASS)" });
    const { ref, orderId, supplier, date, besteller, note, total, lines, dolibarrUrl, prio, kategorie, foerderung, foerderNotiz } = req.body || {};
    if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: "Keine Positionen" });
    const rows = lines.map((l) => `
      <li style="margin-bottom:6px">${htmlEsc(l.qty || 1)}× <b>${htmlEsc(l.desc || "Position")}</b>${l.price ? ` — ${htmlEsc(l.price)} €/Stück` : ""}
      ${l.url ? `<br/><a href="${htmlEsc(l.url)}">${htmlEsc(l.url)}</a>` : ""}</li>`).join("");
    const cardUrl = dolibarrUrl && orderId ? `${String(dolibarrUrl).replace(/\/+$/, "")}/fourn/commande/card.php?id=${encodeURIComponent(orderId)}` : "";
    const html = `<html><body style="font-family:sans-serif;max-width:640px">
      <h2 style="margin:0 0 8px">Neue Bestellung${ref ? " " + htmlEsc(ref) : ""}</h2>
      <p style="margin:0 0 10px;color:#555">
        Lieferant: <b>${htmlEsc(supplier || "—")}</b> · Datum: ${htmlEsc(date || "—")}${besteller ? ` · bestellt von: ${htmlEsc(besteller)}` : ""}
        ${prio || kategorie ? `<br/>${prio ? `Priorität: <b>${htmlEsc(prio)}</b>` : ""}${prio && kategorie ? " · " : ""}${kategorie ? `Kategorie: ${htmlEsc(kategorie)}` : ""}` : ""}
      </p>
      ${foerderung ? `<p style="margin:0 0 10px;padding:10px 12px;background:#fff4d6;border:1px solid #f9a825;border-radius:8px">
        <b>Noch nicht bestellen.</b> Für diese Anschaffung soll zuerst ein Förderantrag laufen: ${htmlEsc(foerderung)}.
        Gefördert wird nur, was nach der Bewilligung gekauft wird.
      </p>` : ""}
      <ul style="margin:0 0 10px;padding-left:20px">${rows}</ul>
      ${total ? `<p style="margin:0 0 10px"><b>Gesamt (brutto): ${htmlEsc(total)} €</b></p>` : ""}
      ${note ? `<p style="margin:0 0 10px;color:#555">Anmerkung: ${htmlEsc(note)}</p>` : ""}
      ${foerderNotiz ? `<pre style="margin:0 0 10px;padding:10px 12px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap;font:12px/1.5 sans-serif;color:#555">${htmlEsc(foerderNotiz)}</pre>` : ""}
      ${cardUrl ? `<p><a href="${htmlEsc(cardUrl)}">In Dolibarr ansehen</a></p>` : ""}
      <p style="color:#999;font-size:12px">Automatisch verschickt von der Blattwerk-App.</p>
    </body></html>`;
    // Der Betreff sagt die Dringlichkeit und den Förderfall, weil die Mail im
    // Postfach oft nur ueberflogen wird.
    const betreff = `[Blattwerk] ${foerderung ? "Förderfall" : "Neue Bestellung"}${ref ? " " + ref : ""} — ${supplier || "?"}${prio ? ` (${prio})` : ""}`;
    await smtpSendMail({ ...cfg, subject: betreff, html });
    res.json({ ok: true, to: cfg.to });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// ---------- Beleg-Freigabe-Proxy ----------
// Die Freigaben-Seite der App spricht den Approve-Server der Beleg-Pipeline
// (Pipeline-Host :8742, nur LAN/VPN, plain HTTP) über diesen Proxy an — die
// HTTPS-App dürfte http://… wegen Mixed Content nicht direkt rufen.
const APPROVE_BASE = (process.env.BELEG_APPROVE_BASE || "http://203.0.113.41:8742").replace(/\/+$/, "");

// Same-Origin-Guard: das globale CORS "*" oben darf für diese Routen NICHT
// gelten, sonst könnte jede im LAN geöffnete fremde Webseite per Browser alle
// offenen Freigabe-Tokens auslesen (/pending) und benutzen (/action).
// Hinter NPM/Authentik kommt der Host-Header nicht zwingend als mobile-d an
// (Forward-Auth-Snippet reicht den Backend-Host durch) — deshalb zählt neben
// Host/X-Forwarded-Host auch die bekannte App-Origin aus der Allowlist.
const BELEG_ALLOWED_ORIGINS = (process.env.BELEG_ALLOWED_ORIGIN_HOSTS || "app.example.org,mobile.example.org")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
app.use("/api/beleg", (req, res, next) => {
  const o = req.headers.origin;
  if (o) {
    let oh;
    try { oh = new URL(o).host.toLowerCase(); } catch { return res.sendStatus(403); }
    const ok = [req.headers.host, req.headers["x-forwarded-host"], ...BELEG_ALLOWED_ORIGINS]
      .filter(Boolean).map((h) => String(h).split(",")[0].trim().toLowerCase()).includes(oh);
    if (!ok) return res.sendStatus(403);
  }
  next();
});

app.get("/api/beleg/pending", async (_req, res) => {
  try {
    const r = await fetch(APPROVE_BASE + "/pending");
    if (!r.ok) return res.status(502).json({ error: "Approve-Server Status " + r.status });
    res.json(await r.json());
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post("/api/beleg/action", async (req, res) => {
  try {
    const { action, token } = req.body || {};
    if (!token || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action (approve|reject) und token erforderlich" });
    }
    const r = await fetch(`${APPROVE_BASE}/${action}?fmt=json&t=${encodeURIComponent(token)}`);
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// ---------- App-Update: manifest.json über den Server holen ----------
// Der Update-Host (nginx `apps-static` auf .41:8095, öffentlich
// apps-alt.example.org) schickt KEINE CORS-Header. Ein direkter fetch aus
// der App-WebView — die auf mobile-d… läuft — scheitert deshalb mit „Failed to
// fetch", obwohl der Host erreichbar ist (am Gerät mit curl belegt, HTTP 200).
// Der Server holt das Manifest daher serverseitig; die APK selbst lädt die
// native Brücke, die kennt keine Same-Origin-Regel.
// Allowlist wie bei /api/sso: sonst wäre das hier ein offener SSRF-Proxy.
const UPDATE_ALLOWED_HOSTS = (process.env.UPDATE_ALLOWED_HOSTS || "apps.example.org,apps-alt.example.org")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
// Interne Ersatz-Origin fuer den Manifest-Abruf (09.09.2026): der Container
// loest apps-alt.example.org oeffentlich auf und kommt bei NPM mit der
// WAN-IP an — die Access-List „Sicherung" antwortet 403 (User-Agent „node" im
// NPM-Log). Deshalb zuerst der nginx `apps-static` auf .41 direkt, die
// oeffentliche Adresse nur als Rueckfall. Die APK-Adresse, die ans Geraet
// geht, bleibt die oeffentliche — das Geraet laedt selbst (LAN/NetBird).
const UPDATE_INTERNAL_ORIGIN = process.env.UPDATE_INTERNAL_ORIGIN === undefined
  ? "http://203.0.113.41:8095" : String(process.env.UPDATE_INTERNAL_ORIGIN).trim();

/** Manifest-Ziele in Reihenfolge: interne Origin + Pfad, dann oeffentlich. Reine Funktion. */
export function updateManifestZiele(base, internalOrigin) {
  const url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  const pfad = url.pathname.replace(/\/+$/, "") + "/manifest.json";
  const oeffentlich = url.origin + pfad;
  const intern = String(internalOrigin || "").trim().replace(/\/+$/, "");
  return intern ? [intern + pfad, oeffentlich] : [oeffentlich];
}

app.get("/api/appupdate/manifest", async (req, res) => {
  const base = String(req.query.base || "").trim();
  if (!base) return res.status(400).json({ error: "base fehlt" });
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  } catch {
    return res.status(400).json({ error: "base ist keine gültige Adresse" });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return res.status(400).json({ error: "nur http/https" });
  }
  if (!UPDATE_ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) {
    return res.status(403).json({ error: `Update-Host ${url.hostname} ist nicht freigegeben` });
  }
  // Interne Origin zuerst, oeffentlich als Rueckfall — antwortet ein Ziel
  // nicht oder nicht mit JSON, kommt das naechste dran; gemeldet wird der
  // letzte Fehler.
  let fehler = "Update-Host nicht erreichbar";
  for (const ziel of updateManifestZiele(url.toString(), UPDATE_INTERNAL_ORIGIN)) {
    try {
      const r = await fetch(ziel, { redirect: "manual", signal: AbortSignal.timeout(8000) });
      if (!r.ok) { fehler = `Update-Host antwortet mit ${r.status}`; continue; }
      const text = await r.text();
      try { return res.json(JSON.parse(text)); }
      catch { fehler = "Update-Host liefert kein JSON"; continue; }
    } catch (e) {
      fehler = String(e.message || e);
    }
  }
  res.status(502).json({ error: fehler });
});

// ---------- Datei-Ausleihe fuer echte Downloads ----------
// Die App-Huelle (android-build, MainActivity) reicht nur solche Downloads an
// den System-Download-Manager weiter, deren URL mit "http" beginnt:
//     webView.setDownloadListener((url, …) -> { if (!url.startsWith("http")) return; …
// Ein im Browser erzeugtes PDF liegt aber als blob:-URL vor. Der Knopf "Laden"
// tat in der installierten App deshalb schlicht nichts — ohne Fehlermeldung,
// ohne Datei. Statt die Huelle zu aendern (das braeuchte ein neues APK) legt
// die App die fertige Datei hier kurz ab und laesst den Download-Manager sie
// unter einer echten http-Adresse holen; den Authentik-Cookie haengt die
// Huelle selbst an. (10.08.2026)
//
// Bewusst nur im Arbeitsspeicher und kurzlebig: das ist ein Durchreiche-Fach,
// kein Archiv. Wer die Datei behalten will, hat sie nach dem Download.
export const dateiAblage = new Map(); // marke -> { daten, name, typ, bis }
const DATEI_TTL_MS = 10 * 60 * 1000;
const DATEI_MAX = 20;
const DATEI_MAX_BYTES = 25 * 1024 * 1024;

// Nur der reine Dateiname, ohne Pfad und ohne Anfuehrungszeichen: der Name
// landet in einem Content-Disposition-Kopf, und "../" darin waere ein Weg,
// den Download-Manager anderswohin schreiben zu lassen.
export const dateiName = (roh) => {
  const n = String(roh || "").split(/[/\\]/).pop().replace(/["\r\n]/g, "").trim();
  return n && n !== "." && n !== ".." ? n.slice(0, 120) : "beleg.pdf";
};

export const dateiAufraeumen = (jetzt = Date.now()) => {
  for (const [marke, e] of dateiAblage) if (e.bis <= jetzt) dateiAblage.delete(marke);
  // Aelteste zuerst — Map behaelt die Einfuegereihenfolge.
  while (dateiAblage.size > DATEI_MAX) dateiAblage.delete(dateiAblage.keys().next().value);
};

app.post("/api/datei/ablegen", (req, res) => {
  const { inhalt, name, typ } = req.body || {};
  if (!inhalt) return res.status(400).json({ error: "kein Inhalt" });
  const daten = Buffer.from(String(inhalt), "base64");
  if (!daten.length) return res.status(400).json({ error: "kein Inhalt" });
  if (daten.length > DATEI_MAX_BYTES) return res.status(413).json({ error: "Datei zu groß" });
  dateiAufraeumen();
  const marke = crypto.randomUUID();
  dateiAblage.set(marke, {
    daten,
    name: dateiName(name),
    typ: /^[\w.+-]+\/[\w.+-]+$/.test(String(typ || "")) ? String(typ) : "application/pdf",
    bis: Date.now() + DATEI_TTL_MS,
  });
  res.json({ url: `/api/datei/${marke}` });
});

app.get("/api/datei/:marke", (req, res) => {
  dateiAufraeumen();
  const e = dateiAblage.get(String(req.params.marke || ""));
  if (!e) return res.status(404).json({ error: "Download abgelaufen — bitte neu erzeugen" });
  res.setHeader("Content-Type", e.typ);
  // "attachment" ist der eigentliche Auslöser: erst damit entscheidet die
  // WebView, dass sie den Inhalt nicht selbst anzeigen kann, und gibt ihn an
  // den Download-Manager weiter.
  res.setHeader("Content-Disposition", `attachment; filename="${e.name}"`);
  res.end(e.daten);
});

/**
 * Wie lange darf der Browser eine ausgelieferte Datei behalten?
 *
 * Alles unter `assets/` traegt den Inhalts-Hash im Dateinamen: aendert sich der
 * Inhalt, aendert sich der Name. Solche Dateien duerfen dauerhaft liegen
 * bleiben — sonst fragt der Browser bei jedem Start jede einzelne nach, ein
 * Rueckfrage-Umlauf pro Datei, ueber VPN oder Mobilfunk deutlich spuerbar.
 *
 * `index.html`, `sw.js` und das Manifest muessen dagegen jedes Mal frisch
 * geholt werden. Sie tragen keinen Hash im Namen; wuerden sie zwischengelagert,
 * kaeme die naechste Fassung der App nie an — genau der Fehler, der schon
 * einmal wie ein kaputter Cache aussah (siehe Selbst-Update in CLAUDE.md).
 */
export function cacheKopf(pfad) {
  const p = String(pfad).replace(/\\/g, "/");
  return /\/assets\//.test(p) ? "public, max-age=31536000, immutable" : "no-cache";
}

// ---------- Anruf-Klingelstrom (Stufe 2 der Telefonie) ----------
// Der Callbot (messenger-hub, callbot/ntfy.py) veroeffentlicht "klingelt"/
// "Ende" auf einem GEHEIMEN ntfy-Topic — das Topic ist das Geheimnis, der
// ntfy-Server hat keine Auth. Der Topic-Name bleibt deshalb komplett
// serverseitig (Coolify-Env ANRUF_NTFY_URL, Basis-URL des Topics ohne
// /json; ANRUF_NTFY_TOKEN ist das Access-Token, der ntfy faehrt deny-all):
// APK-Klingeldienst und bw-t1 abonnieren stattdessen HIER, hinter
// Authentik, auf der Domain, die sie ohnehin erreichen. Durchgereicht wird
// ntfys JSON-Zeilenstrom unveraendert; ntfy schickt alle ~45 s ein
// keepalive-Ereignis, das haelt auch den NPM-Proxy davor wach.
const ANRUF_NTFY_URL = (process.env.ANRUF_NTFY_URL || "").replace(/\/$/, "");
const ANRUF_NTFY_TOKEN = process.env.ANRUF_NTFY_TOKEN || "";

app.get("/api/anruf/strom", async (req, res) => {
  if (!ANRUF_NTFY_URL) {
    return res.status(503).json({ error: "Kein Klingel-Topic konfiguriert" });
  }
  const abbruch = new AbortController();
  req.on("close", () => abbruch.abort());
  let antwort;
  try {
    antwort = await fetch(`${ANRUF_NTFY_URL}/json`, {
      signal: abbruch.signal,
      headers: ANRUF_NTFY_TOKEN ? { Authorization: `Bearer ${ANRUF_NTFY_TOKEN}` } : {},
    });
  } catch (_) {
    return res.status(502).json({ error: "ntfy nicht erreichbar" });
  }
  if (!antwort.ok || !antwort.body) {
    return res.status(502).json({ error: `ntfy antwortet ${antwort.status}` });
  }
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson");
  // no-transform: haelt auch die compression-Middleware raus — die wuerde
  // den Strom puffern und Ereignisse kaemen erst gebuendelt (= zu spaet) an.
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const strom = Readable.fromWeb(antwort.body);
  strom.pipe(res);
  strom.on("error", () => res.end());
});

// ---------- Chat: Element-Web same-origin durchreichen ----------
// Hintergruende und die Header-/Umschreib-Regeln: src/chat-proxy.js.
// Funktion statt Konstante (Abschlusspruefung 18.09.2026, Befund I7): der
// Rueckfall war `CHAT_UPSTREAM_STANDARD` — Blattwerks LAN-IP. Ein fremder
// Mandant ohne gesetzte ENV haette seinen Chat ueber Blattwerks Element-Web
// geladen. Die Adresse kommt jetzt aus `dienste.matrix` (chatUpstream,
// src/mandant-server.mjs); ohne eigene Adresse ist der Block ohnehin aus
// (blockAktiv/BLOCK_DIENST) und wacheChat weist mit 404 ab.
const CHAT_UPSTREAM = () => chatUpstream(mandantJetzt());

app.get(`/chat/${APP_RUECKKEHR_PFAD}`, wacheChat, (_req, res) => {
  res.type("application/javascript").setHeader("Cache-Control", "no-cache");
  res.send(APP_RUECKKEHR_JS);
});

app.get(`/chat/${APP_KOSTUEM_PFAD}`, wacheChat, (_req, res) => {
  res.type("application/javascript").setHeader("Cache-Control", "no-cache");
  res.send(APP_KOSTUEM_JS);
});

// Die Element-Config verweist absolut auf /branding/logo.png — unter dem
// App-Origin liefe das in den SPA-Fallback (index.html als "Bild"). Der
// Pfad wird deshalb mit durchgereicht; die App selbst nutzt ihn nicht.
const chatProxy = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.sendStatus(405);
  // Ohne Schluss-Schraegstrich loesen Elements relative Asset-Pfade auf /
  // statt /chat/ auf — deshalb umleiten. Express selbst matcht "/chat" und
  // "/chat/" gleich (strict routing aus), also entscheidet die Original-URL.
  if (req.originalUrl.split("?")[0] === "/chat") return res.redirect(301, "/chat/");
  const upstreamPfad = req.originalUrl.startsWith("/branding") ? req.originalUrl : req.url;
  // Die Wurzel wird umgeschrieben (Kostuem/Rueckkehr-Skript) — der Upstream-
  // ETag beschreibt aber das ORIGINAL. Wuerde er durchgereicht, beantwortet
  // der Upstream ein If-None-Match des Browsers mit 304 und der Browser
  // behaelt eine VERALTETE umgeschriebene Fassung (so blieb das Kostuem am
  // 20.08. am Handy erst einmal unsichtbar). Deshalb: fuer die Wurzel keine
  // Bedingungs-Header hochreichen und keine Validatoren zurueckgeben.
  const wurzel = upstreamPfad === "/" || upstreamPfad === "/index.html";
  try {
    const anfrageHeader = chatAnfrageHeader(req.headers);
    if (wurzel) { delete anfrageHeader["if-none-match"]; delete anfrageHeader["if-modified-since"]; }
    const ziel = CHAT_UPSTREAM();
    if (!ziel) return res.status(502).type("text").send("Für diese Firma ist kein Chat-Server hinterlegt.");
    const antwort = await fetch(ziel + upstreamPfad, {
      method: req.method,
      headers: anfrageHeader,
      redirect: "manual",
    });
    const header = chatAntwortHeader(antwort.headers.entries());
    if (wurzel) { for (const name of Object.keys(header)) { if (/^(etag|last-modified)$/i.test(name)) delete header[name]; } }
    // Elements nginx schickt fuer die Bundles KEIN Cache-Control — nur ETag.
    // Der Browser fragt dann bei jedem Start jede Datei einzeln nach (ein
    // Umlauf pro Asset, ueber Mobilfunk/VPN der Hauptgrund fuer den zaehen
    // Chat-Start). Die Pfade tragen den Inhalts-Hash (bundles/<hash>/…,
    // 120.570a7f9.png) und duerfen dauerhaft in den Browser-Cache.
    if (antwort.status === 200 && !Object.keys(header).some(n => n.toLowerCase() === "cache-control")
        && /^\/(bundles|vector-icons|fonts|themes|img)\//.test(upstreamPfad)) {
      header["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    res.status(antwort.status);
    for (const [name, wert] of Object.entries(header)) res.setHeader(name, wert);
    if (req.method === "HEAD" || antwort.status === 304 || !antwort.body) return res.end();
    if (chatIstIndex(req.url, antwort.headers.get("content-type"))) {
      return res.send(chatIndexUmschreiben(await antwort.text()));
    }
    Readable.fromWeb(antwort.body).pipe(res);
  } catch {
    res.status(502).type("text").send("Chat-Instanz nicht erreichbar.");
  }
};
app.use("/chat", wacheChat, chatProxy);
app.use("/branding", wacheChat, chatProxy);

// ---------- Statisches Frontend + SPA-Fallback ----------
// ─── Fachmodule unter src/server/ ───────────────────────────────────────────
// Jedes Modul exportiert `register(app, ctx)` und haengt seine /api/nc/*-
// Endpunkte selbst ein. So wachsen neue Register (Qualifikationen,
// Baumkataster, …) in eigenen Dateien statt in dieser hier — und mehrere
// Zweige koennen parallel entstehen, ohne sich in server.mjs zu ueberschneiden.
// `ctx` reicht die Helfer weiter, die die Module brauchen; die Reihenfolge ist
// alphabetisch, damit sie nicht vom Dateisystem abhaengt.
// APP_DIR/AS_DIR sind seit Task 9 Funktionen (der Ordner haengt vom Mandanten
// ab) — als Getter statt als Funktionswerte reichen, damit ein Fachmodul wie
// src/server/qualifikationen.mjs weiterhin `ctx.AS_DIR + "/…"` schreiben
// kann: die Eigenschaft wird bei jedem Zugriff frisch ausgewertet, statt den
// Ordner beim Laden des Moduls einmalig einzufrieren.
export const serverCtx = {
  ncBody, ssoUser, authHeader, trimSlash, ncFilesBase, assertOrdner, mandantJetzt,
  get APP_DIR() { return APP_DIR(); },
  get AS_DIR() { return AS_DIR(); },
  get ORDNER() { return ordner(); },
  get ORDNER_URL() { return ordnerUrl(); },
  appStoreLesen, appStoreSchreiben, appStoreAendern,
  asTerminSchreiben, plUpload, plChecksumSuche, parseDirListing,
};
const MODUL_DIR = path.join(__dirname, "src", "server");
if (fs.existsSync(MODUL_DIR)) {
  for (const datei of fs.readdirSync(MODUL_DIR).filter((f) => f.endsWith(".mjs")).sort()) {
    const modul = await import(pathToFileURL(path.join(MODUL_DIR, datei)).href);
    if (typeof modul.register === "function") modul.register(app, serverCtx);
    else console.error("[server] Modul ohne register():", datei);
  }
}

if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  // index.html und das Manifest tragen den Namen/die Farbe/das Logo DIESES
  // Mandanten — deshalb eigene Handler VOR der statischen Auslieferung
  // (die sonst die rohe dist/-Datei ausliefern wuerde) und mit denselben
  // no-cache-Regeln wie bisher (cacheKopf), sonst kaeme ein Mandanten-Wechsel
  // beim Geraet nie an (siehe Selbst-Update in CLAUDE.md).
  const indexMitMandant = (_req, res) => {
    const html = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
    res.setHeader("Cache-Control", cacheKopf("index.html"));
    res.type("html").send(htmlMitMandant(html, mandantJetzt()));
  };
  app.get(["/", "/index.html"], indexMitMandant);
  app.get("/manifest.webmanifest", (_req, res) => {
    res.setHeader("Cache-Control", cacheKopf("manifest.webmanifest"));
    res.type("application/manifest+json").json(manifestFuer(mandantJetzt()));
  });
  app.use(express.static(DIST_DIR, {
    // Alles unter /assets/ traegt den Inhalts-Hash im Namen: aendert sich der
    // Inhalt, aendert sich der Name. Solche Dateien duerfen dauerhaft im
    // Browser bleiben, sonst fragt er bei jedem Start jede einzelne nach
    // (ein Rueckfrage-Umlauf pro Datei, ueber VPN spuerbar).
    // index.html, sw.js und das Manifest muessen dagegen frisch geholt werden,
    // sonst kommt das naechste Update nie an.
    setHeaders(res, datei) { res.setHeader("Cache-Control", cacheKopf(datei)); },
  }));
  // SPA-Fallback fuer alles andere (Deep-Links) liefert dieselbe, mandanten-
  // gebrandete index.html aus wie die Route "/" oben.
  app.use(indexMitMandant);
} else {
  app.get("/", (_req, res) => res.type("text").send("Blattwerk-Server läuft (kein dist/ gebaut)."));
}

// Unter Vitest nicht lauschen: mehrere Testdateien importieren diese Datei, und
// die zweite bekaeme sonst EADDRINUSE auf Port 3000 — der Import dient dort nur
// dem Zugriff auf die exportierten Helfer.
// Startpruefung: widersprechen sich Mandanten-Datei und Umgebung, faehrt der
// Server GAR NICHT hoch, statt stillschweigend eines von beiden Zielen zu
// benutzen (Abschlusspruefung 18.09.2026, Befund C2/I7). Bewusst erst hier,
// unmittelbar vor dem Lauschen, und unter demselben VITEST-Vorbehalt: mehrere
// Testdateien importieren server.mjs nur wegen der exportierten Helfer, ein
// process.exit() beim Import wuerde den ganzen Testlauf abschiessen.
// Nur die HARTEN Widersprueche brechen ab — der vollstaendige Abgleich
// (fehlender Proxy, Allowlisten, geerbte Zugaenge) laeuft weiterhin von Hand
// ueber `node scripts/mandant/env-pruefen.mjs` vor dem Anlegen einer Instanz;
// daran stirbt kein laufender Betrieb.
if (!process.env.VITEST) {
  const widersprueche = startPruefen(process.env, mandantJetzt(), { dateiVorhanden: fs.existsSync(MANDANT_DATEI) });
  if (widersprueche.length) {
    console.error("Start abgebrochen — Umgebung und mandant.json widersprechen sich:");
    for (const f of widersprueche) console.error("  ⚠ " + f);
    process.exit(1);
  }
  app.listen(PORT, () => {
    const m = mandant.aktuell();
    console.log(`Blattwerk-Server läuft auf Port ${PORT}`);
    console.log(`Mandant: ${m.mandant.name} (${m.mandant.kuerzel})${m.fehler ? " — FEHLER: " + m.fehler : ""}`);
    console.log(`Vertraute Proxys für Authentik: ${SSO_TRUSTED_IPS.join(", ") || "(keine!)"}`);
  });
}
