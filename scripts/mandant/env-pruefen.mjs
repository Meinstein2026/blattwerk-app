// Prüft die Umgebungsvariablen einer neuen Mandanten-Instanz VOR dem Start
// gegen ihre eigene /data/mandant.json. Der wahrscheinlichste Fehler beim
// Anlegen einer zweiten Instanz ist das Kopieren der Coolify-Umgebung von
// Blattwerk: dann schreibt die fremde Firma in Blattwerks Kalender, mailt an
// Blattwerks Finanzadresse oder hängt am Blattwerk-eigenen Paperless/Chat.
//
// GEERBT_VERBOTEN ist die einfache Regel: Wert GESETZT und sieht nach
// Blattwerk aus -> Fehler. Das reicht bei Domain-/Kontonamen, aber nicht bei
// Blattwerks gefährlichsten Werten: PAPERLESS_URL, CHAT_UPSTREAM und
// BELEG_APPROVE_BASE zeigen per Code-Default auf nackte Homelab-IPs
// (203.0.113.41/.50), nicht auf irgendetwas mit "blattwerk" im Namen — UND
// ihr FEHLEN ist für einen fremden Mandanten genauso gefährlich wie ein
// Blattwerk-Wert, weil der Server dann still auf ebendiesen Code-Default
// zurückfällt. Deshalb zwei zusätzliche, gezielte Prüfungen unten
// (eigenerDienstFehlt, die beiden Mail-Adressen) statt sich allein auf den
// Regex zu verlassen.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOLIBARR_URL_DEFAULT } from "../../src/verbindung.js";

const GEERBT_VERBOTEN = [
  "SSO_NC_TEAM_USER", "SSO_NC_TEAM_PASS", "SSO_NC_TEAM_CAL", "SSO_NC_TEAM_NAME",
  "SSO_DOLIBARR_KEYS",
  "SMTP_USER", "SMTP_PASS", "MAIL_FROM",
  "ARBEITSSCHUTZ_MAIL_TO", "ORDER_MAIL_TO",
  "ANRUF_NTFY_URL", "ANRUF_NTFY_TOKEN",
  "BELEG_APPROVE_BASE", "BELEG_ALLOWED_ORIGIN_HOSTS",
];
// Absichtlich NICHT in der Liste, mit Begründung (siehe auch CLAUDE.md):
// - SSO_NEXTCLOUD_SERVER: EINE gemeinsame Nextcloud für alle Mandanten ist
//   die getroffene Architektur-Entscheidung (Trennung über Team-Ordner,
//   Gruppe, Dienstkonto) — derselbe Wert bei jedem Mandanten ist hier
//   RICHTIG, nicht geerbt. Der Code-Default matcht den Regex unten sogar
//   ("nextcloud.example.org") — würde man ihn aufnehmen, schlüge
//   die Prüfung bei jeder korrekt konfigurierten Instanz fälschlich an.
// - UPDATE_ALLOWED_HOSTS/UPDATE_INTERNAL_ORIGIN: ein gemeinsamer
//   App-Update-Host für alle Firmen (apps.example.org/<app>), ebenfalls
//   Architektur, nicht Versehen. Die mandantenspezifische Adresse steht in
//   dienste.updates in mandant.json, nicht in dieser ENV.
// - SMTP_HOST/SMTP_PORT: derselbe Mailrelay (Stalwart) kann mehrere Firmen
//   bedienen; nur das KONTO (SMTP_USER/SMTP_PASS) ist firmenspezifisch.
// - MANDANT_ADMINS: Inhaber administriert alle Instanzen selbst — derselbe
//   Wert bei jedem Mandanten ist beabsichtigt, kein Versehen.
// - KONTO_DATEI/SSO_STORE_FILE/MANDANT_DATEI (Pfade): jede Instanz hat ein
//   eigenes, isoliertes /data-Volume; es gibt keinen Fall, in dem zwei
//   Instanzen sich dieselbe Datei teilen könnten. MANDANT_DATEI selbst wird
//   unten separat geprüft (Datei muss existieren, siehe CLI-Teil).
// - PAPERLESS_TOKEN: ein Zufallstoken trifft den Namens-Regex unten so gut
//   wie nie (kein "blattwerk" im Wert) — in GEERBT_VERBOTEN brächte es
//   praktisch keine echten Funde. Der wirksame Schutz für Paperless läuft
//   über PAPERLESS_URL (host-genauer Abgleich gegen dienste.paperless,
//   siehe eigenerDienstFehlt unten): zeigt PAPERLESS_URL korrekt auf die
//   eigene Instanz, führt ein falsches/kopiertes Token dort nur zu einem
//   Auth-Fehler gegen den EIGENEN Server, nicht zu unbemerktem Zugriff auf
//   Blattwerks Paperless. Erst ein falscher Host UND ein gültiges
//   Blattwerk-Token zusammen wären gefährlich — der Host ist der Teil, der
//   tatsächlich geprüft werden kann.
// Erkennungsmuster fuer "das ist eine von Blattwerks echten Adressen": der
// Markenname "blattwerk" (kein Geheimnis, darf im Quelltext stehen), der
// Hostname von DOLIBARR_URL_DEFAULT (src/verbindung.js, kommt seinerseits aus
// VITE_DOLIBARR_URL_DEFAULT/Umgebung, nie als zweites Literal hier) ODER eine
// IP aus 203.0.113.0/24 — dem RFC-5737-Platzhalterblock, den dieses Repo
// durchgehend fuer "Blattwerks eigene Homelab-IP" benutzt (Paperless/
// Beleg-Approve-Server haben keinen Namen, nur eine IP als Code-Default).
const doliHost = (() => { try { return new URL(DOLIBARR_URL_DEFAULT).hostname; } catch { return ""; } })();
const BLATTWERK = new RegExp(
  `blattwerk|203\\.0\\.113\\.${doliHost ? "|" + doliHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""}`, "i",
);

/**
 * Blattwerks eigene Erkennungsmuster (echte Domains/IPs) gehören nicht in den
 * oeffentlichen App-Quelltext — sie stehen stattdessen in einer Datei im
 * privaten Betriebs-Repo, Pfad ueber BW_ERKENNUNG konfigurierbar (ein Regex
 * pro Zeile, Format wie verboten.txt: /muster/flags, #-Kommentare und
 * Leerzeilen werden uebersprungen). Fehlt die Datei (z. B. oeffentlicher
 * Export ohne blattwerk-betrieb daneben), laeuft die Pruefung mit den
 * generischen Mustern oben weiter — nur lauter warnen, nicht abbrechen.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ERKENNUNG_PFAD = process.env.BW_ERKENNUNG || path.join(HIER, "..", "..", "..", "blattwerk-betrieb", "erkennung.txt");
const erkennungLaden = (pfad) => {
  let text;
  try { text = fs.readFileSync(pfad, "utf8"); } catch (e) {
    console.error(`⚠ BW_ERKENNUNG (${pfad}) nicht lesbar — nur die generischen Muster sind aktiv: ${e.message}`);
    return [];
  }
  const muster = [];
  for (const zeile of text.split("\n")) {
    const z = zeile.trim();
    if (!z || z.startsWith("#")) continue;
    const m = /^\/(.+)\/([a-z]*)$/.exec(z);
    if (m) { try { muster.push(new RegExp(m[1], m[2])); } catch (_) {} }
  }
  return muster;
};
const ZUSATZ_MUSTER = erkennungLaden(ERKENNUNG_PFAD);
const blattwerkSieht = (wert) => BLATTWERK.test(wert) || ZUSATZ_MUSTER.some((r) => r.test(wert));

/**
 * PAPERLESS_URL/CHAT_UPSTREAM waren bis 18.09.2026 die Adressen, die der
 * Server TATSAECHLICH anspricht, waehrend dienste.paperless/dienste.matrix nur
 * darueber entschieden, OB der Block laeuft — zwei Werte fuer dieselbe Frage,
 * die nicht automatisch synchron liefen (Befund C2). Seitdem liest der Server
 * die Adresse aus dem Mandanten (paperlessBasis/chatUpstream in
 * src/mandant-server.mjs); die ENV ist nur noch Rueckfall fuer Blattwerk.
 *
 * Deshalb ist das FEHLEN der ENV jetzt kein Fund mehr — im Gegenteil, ohne
 * ENV gilt eindeutig die Mandanten-Datei. Gemeldet wird nur noch der
 * Widerspruch, und der ist so ernst, dass startPruefen() ihn unten zusaetzlich
 * fuehrt und der Server damit gar nicht erst hochfaehrt.
 */
const dienstWiderspruch = (funde, env, mandant, envName, diensteFeld, kontext) => {
  const soll = mandant.dienste?.[diensteFeld];
  const ist = env[envName];
  if (!soll || !ist) return;
  if (ist !== soll) {
    funde.push(`${envName} (${ist}) passt nicht zur Mandanten-Konfiguration dienste.${diensteFeld} (${soll}) — ${kontext} hat damit zwei widersprüchliche Ziele.`);
  }
};

/**
 * SSO_ALLOWED_DOLIBARR_HOSTS (server.mjs:311) und SSO_ALLOWED_NC_HOSTS
 * (server.mjs:347) sind der SSRF-Schutz für /api/sso/register bzw.
 * /api/sso/register-nc: nur ein Host aus dieser Liste wird akzeptiert, jeder
 * andere bekommt 400. Beide Defaults sind Blattwerks eigene Hosts
 * ("dolibarr.example.org,dolibarr-alt.example.org" bzw.
 * "nextcloud-alt.example.org,nextcloud.example.org" — MUSS mit server.mjs in
 * Sync bleiben, dort sind es die einzigen Stellen). Kopiert ODER schlicht
 * nicht gesetzt, lehnt der Server den EIGENEN Dolibarr-/Nextcloud-Host des
 * Mandanten ab, sobald sich jemand selbst registrieren will — anders als bei
 * den geerbten Zugängen oben scheitert das laut (400), aber es ist trotzdem
 * ein Startproblem, das dieser Abgleich fangen soll. Gilt für JEDEN
 * Mandanten inkl. Blattwerk (kein "kuerzel !== bw"-Gate): Nextcloud ist
 * geteilte Infrastruktur, Blattwerks eigener Host muss also ebenso in der
 * Liste stehen wie der eines fremden Mandanten in seiner eigenen.
 */
const SSO_ALLOWED_DOLIBARR_HOSTS_STANDARD = "dolibarr.example.org,dolibarr-alt.example.org";
const SSO_ALLOWED_NC_HOSTS_STANDARD = "nextcloud-alt.example.org,nextcloud.example.org";
const hostFehltInAllowlist = (funde, env, mandant, envName, envStandard, diensteFeld, endpunkt) => {
  const url = mandant.dienste?.[diensteFeld];
  if (!url) return; // kein eigener Dienst hinterlegt -> Registrierung dafuer ohnehin nicht moeglich
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return; } // ungueltige URL: anderswo ein eigenes Problem
  const liste = (env[envName] || envStandard).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!liste.includes(host)) {
    funde.push(`${envName} enthält "${host}" (aus dienste.${diensteFeld}) nicht — ${endpunkt} würde die eigene Adresse dieses Mandanten mit 400 ablehnen.`);
  }
};

export const envPruefen = (env, mandant) => {
  const funde = [];
  if (mandant.kuerzel !== "bw") {
    for (const name of GEERBT_VERBOTEN) {
      const wert = env[name];
      if (wert && blattwerkSieht(String(wert))) funde.push(`${name} zeigt noch auf Blattwerk: ${wert}`);
    }
    const doli = env.SSO_DOLIBARR_URL;
    if (doli && mandant.dienste?.dolibarr && doli !== mandant.dienste.dolibarr) {
      funde.push(`SSO_DOLIBARR_URL (${doli}) passt nicht zur Mandanten-Konfiguration (${mandant.dienste.dolibarr})`);
    }
    // SSO_DOLIBARR_URL wird hier bewusst NUR bei einem Mismatch geprüft, nicht
    // bei Fehlen: der Fallback (DOLIBARR_URL_DEFAULT) wird erst gefährlich,
    // wenn zusätzlich SSO_DOLIBARR_KEYS einen Benutzernamen dieses Mandanten
    // kennt — und genau das ist oben in GEERBT_VERBOTEN schon abgedeckt.
    // PAPERLESS_URL/CHAT_UPSTREAM haben keine solche zweite Absicherung
    // (wachePaperless/blockAktiv prüfen nur, OB dienste.<feld> gesetzt ist,
    // nicht WOHIN die ENV zeigt) — deshalb dort strenger: auch das Fehlen zählt.
    dienstWiderspruch(funde, env, mandant, "PAPERLESS_URL", "paperless", "Paperless (Belege/GBU-Archiv, /api/pl/*)");
    dienstWiderspruch(funde, env, mandant, "CHAT_UPSTREAM", "matrix", "der Chat-Proxy (/chat, /branding)");
    // Seit 18.09.2026 hat die Sammelmail keinen Blattwerk-Rueckfall mehr
    // (arbeitsschutzEmpfaenger in src/mandant-server.mjs) — ohne Adresse
    // bleibt sie schlicht aus. Das ist sicher, aber selten gewollt, deshalb
    // weiterhin ein Hinweis, nur mit anderer Begruendung.
    if (!env.ARBEITSSCHUTZ_MAIL_TO && !(mandant.kontakt?.arbeitsschutzMail || "").includes("@")) {
      funde.push("Weder ARBEITSSCHUTZ_MAIL_TO noch mandant.kontakt.arbeitsschutzMail ist gesetzt — die tägliche Fristen-Sammelmail bleibt damit aus (sie geht bewusst NICHT mehr ersatzweise an Blattwerks Adresse).");
    }
    // Anders als bei ARBEITSSCHUTZ_MAIL_TO NUR warnen, wenn der Rueckfall
    // tatsaechlich erreichbar waere: bestellWache laesst eine Anfrage ohne
    // gueltiges mandant.kontakt.bestellMail gar nicht erst durch, und
    // bestellEmpfaenger() nimmt bestellMail ohnehin vor ORDER_MAIL_TO. Mit
    // gesetztem bestellMail waere die Meldung ein Fehlalarm, der die Prüfung
    // beim naechsten Mal ignoriert wird.
    if (!env.ORDER_MAIL_TO && !(mandant.kontakt?.bestellMail || "").includes("@")) {
      funde.push("ORDER_MAIL_TO fehlt und mandant.kontakt.bestellMail ist nicht gesetzt — bestellWache sperrt die Bestellmail zwar ohnehin (404), aber falls das mandant.json später doch eine bestellMail bekommt, wäre Blattwerks eigene Adresse (finanzen@example.org) der einzige Rückfall.");
    }
  } else {
    // Umgekehrter Fehler: eine mandant.json mit kuerzel "bw", die aber gar
    // nicht Blattwerks eigene ist (z. B. eine für einen neuen Mandanten
    // kopierte Datei, bei der nur vergessen wurde, das Kürzel zu ändern).
    const doli = mandant.dienste?.dolibarr;
    if (doli && !blattwerkSieht(doli)) {
      funde.push(`mandant.json trägt kuerzel "bw", aber dienste.dolibarr (${doli}) sieht nicht nach Blattwerks eigenem Dolibarr aus — vermutlich eine für einen anderen Mandanten kopierte Datei, bei der nur das Kürzel stehen blieb.`);
    }
  }
  if (!env.SSO_TRUSTED_PROXY_IPS) {
    funde.push("SSO_TRUSTED_PROXY_IPS fehlt — ohne den richtigen Proxy erkennt der Server keinen Authentik-Nutzer und jeder Login scheitert ohne Fehlermeldung.");
  }
  // Fuer JEDEN Mandanten, auch Blattwerk selbst (siehe Kommentar bei
  // hostFehltInAllowlist).
  hostFehltInAllowlist(funde, env, mandant, "SSO_ALLOWED_DOLIBARR_HOSTS", SSO_ALLOWED_DOLIBARR_HOSTS_STANDARD, "dolibarr", "/api/sso/register");
  hostFehltInAllowlist(funde, env, mandant, "SSO_ALLOWED_NC_HOSTS", SSO_ALLOWED_NC_HOSTS_STANDARD, "nextcloud", "/api/sso/register-nc");
  return funde;
};

/**
 * Die HARTEN Widersprueche — eine gemeinsame Pruefung statt drei verstreuter
 * (Abschlusspruefung 18.09.2026, Befund C2/I7).
 *
 * Unterschied zu envPruefen() oben: envPruefen ist der vollstaendige Abgleich
 * VOR dem Start einer neuen Instanz und meldet auch Dinge, mit denen ein
 * laufender Server weiterleben kann (fehlender Proxy, Allowlisten). Diese
 * Funktion meldet ausschliesslich die Faelle, in denen Umgebung und
 * Mandanten-Datei auf ZWEI VERSCHIEDENE Ziele zeigen — dann ist nicht mehr
 * entscheidbar, welches Ziel gemeint war, und "faellt ohnehin auf die Nase,
 * wenn falsch konfiguriert" ist genau das Argument, das dieses Vorhaben nicht
 * gelten laesst: die falsche Instanz waere Blattwerks eigene, und der Fehler
 * faellt niemandem auf. Deshalb bricht server.mjs beim Start damit ab.
 *
 * Gilt fuer JEDEN Mandanten inkl. Blattwerk: ein Widerspruch ist auch dort
 * einer, und Blattwerks eigene Instanz startet unveraendert, solange
 * PAPERLESS_URL/CHAT_UPSTREAM/ARBEITSSCHUTZ_MAIL_TO entweder nicht gesetzt
 * sind oder auf dieselbe Adresse zeigen wie MANDANT_STANDARD.
 */
const gleicheAdresse = (a, b) => String(a || "").replace(/\/+$/, "") === String(b || "").replace(/\/+$/, "");
export const START_ABGLEICH = [
  { env: "PAPERLESS_URL", pfad: ["dienste", "paperless"], was: "Paperless (/api/pl/list|file|upload)" },
  { env: "CHAT_UPSTREAM", pfad: ["dienste", "matrix"], was: "der Chat-Proxy (/chat, /branding)" },
  { env: "ARBEITSSCHUTZ_MAIL_TO", pfad: ["kontakt", "arbeitsschutzMail"], was: "die tägliche Arbeitsschutz-Sammelmail" },
];

/**
 * Eingebaute Platzhalter (example.org, das RFC-5737-Testnetz, Musterstadt) —
 * genau die Werte, die MANDANT_STANDARD/BETRIEB_STANDARD ohne eigene
 * mandant.json liefern. Fuer JEDEN anderen Mandanten sind das legitime, vom
 * Admin selbst eingetragene Werte (eine fremde Firma darf durchaus
 * "example.org" heissen) — die Pruefung gilt deshalb nur fuer Blattwerks
 * eigenen Mandanten (kuerzel "bw"), wo diese Werte niemals echt sein duerfen.
 */
const PLATZHALTER_MUSTER = /example\.org|203\.0\.113\.|musterstadt/i;
const mandantHatPlatzhalter = (mandant) => [
  mandant?.dienste?.dolibarr, mandant?.dienste?.nextcloud, mandant?.dienste?.matrix,
  mandant?.dienste?.updates, mandant?.dienste?.paperless,
  mandant?.ort, mandant?.betrieb?.anschrift,
].some((w) => w && PLATZHALTER_MUSTER.test(String(w)));

/**
 * `optionen.dateiVorhanden` ist optional und wird NUR von server.mjs gesetzt
 * (fs.existsSync(MANDANT_DATEI) vor dem Aufruf) — bestehende Aufrufer (Tests,
 * die CLI unten) bleiben ohne dritten Parameter unveraendert, sonst schluege
 * diese Pruefung bei jedem Test mit dem eingebauten Blattwerk-Standard an.
 * BW_PLATZHALTER_OK=1 ist das Entkommen fuer Tests/lokale Entwicklung ohne
 * eigene mandant.json (siehe .env.example).
 */
export const startPruefen = (env, mandant, optionen = {}) => {
  const funde = [];
  for (const { env: name, pfad, was } of START_ABGLEICH) {
    const ausEnv = String(env?.[name] || "").trim();
    const ausMandant = String(mandant?.[pfad[0]]?.[pfad[1]] || "").trim();
    if (!ausEnv || !ausMandant) continue; // fehlt eine Seite, gibt es keinen Widerspruch
    if (!gleicheAdresse(ausEnv, ausMandant)) {
      funde.push(`${name}="${ausEnv}" widerspricht mandant.json (${pfad.join(".")}="${ausMandant}"). `
        + `Beide bestimmen, wohin ${was} greift — welches Ziel gemeint ist, lässt sich nicht erraten. `
        + `Entweder ${name} entfernen (dann gilt die Mandanten-Datei) oder beide auf denselben Wert setzen.`);
    }
  }
  if (optionen.dateiVorhanden !== undefined && mandant?.kuerzel === "bw" && env?.BW_PLATZHALTER_OK !== "1") {
    if (optionen.dateiVorhanden === false) {
      funde.push("mandant.json fehlt (MANDANT_DATEI) und der Mandant ist Blattwerk (bw) — ohne eigene Datei liefe "
        + "die App mit den eingebauten Platzhaltern (Musterstadt/example.org) statt echten Betriebsdaten. "
        + "mandant.json anlegen oder fuer Tests/lokale Entwicklung BW_PLATZHALTER_OK=1 setzen.");
    } else if (mandantHatPlatzhalter(mandant)) {
      funde.push("mandant.json enthält noch Platzhalter-Werte (example.org/203.0.113.0-24/Musterstadt) — das ist "
        + "kein echter Deploy. mandant.json mit den echten Betriebsdaten füllen oder für Tests/lokale Entwicklung "
        + "BW_PLATZHALTER_OK=1 setzen.");
    }
  }
  return funde;
};

if (process.argv[1] && process.argv[1].endsWith("env-pruefen.mjs")) {
  const datei = process.env.MANDANT_DATEI || "/data/mandant.json";
  // Der umgekehrte Fehler zur "geerbten ENV": MANDANT_DATEI zeigt auf einen
  // Pfad, der gar nicht existiert. mandantLaden(null) würde das intern still
  // als "keine Datei -> Blattwerk-Standard" behandeln (richtig für Blattwerks
  // eigene Instanz ohne eigene Datei) — für eine NEU angelegte Instanz ist das
  // fast immer der falsche Zustand: entweder fehlt mandant.json im Volume,
  // oder MANDANT_DATEI zeigt auf den falschen Pfad. Deshalb hier eine klare
  // Meldung statt eines rohen ENOENT-Stacktrace beim JSON.parse.
  if (!fs.existsSync(datei)) {
    console.error(`⚠ MANDANT_DATEI zeigt auf ${datei} — die Datei existiert nicht. Für eine neue Instanz mandant.json anlegen oder MANDANT_DATEI korrigieren (der Server selbst würde dagegen still auf den eingebauten Blattwerk-Standard zurückfallen).`);
    process.exit(1);
  }
  let mandant;
  try {
    mandant = JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch (e) {
    console.error(`⚠ ${datei} ist kein gültiges JSON: ${e.message}`);
    process.exit(1);
  }
  // startPruefen ist eine Teilmenge (die harten Widersprueche) — der CLI-Lauf
  // zeigt beides zusammen, damit niemand zwei Listen vergleichen muss.
  const funde = [...startPruefen(process.env, mandant), ...envPruefen(process.env, mandant)];
  if (!funde.length) console.log("ENV in Ordnung.");
  else { console.error(funde.map((f) => "⚠ " + f).join("\n")); process.exit(1); }
}
