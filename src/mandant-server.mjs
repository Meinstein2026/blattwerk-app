// Die beiden Endpunkte als reine Handler, damit sie ohne laufenden Express
// pruefbar sind (wie src/server/qualifikationen.mjs).
//
// Bewusst NICHT unter src/server/: dieser Ordner wird von server.mjs
// automatisch geladen und erwartet von jeder Datei ein register(app, ctx)
// (siehe MODUL_DIR-Schleife dort). Dieses Modul ist ein reiner Helfer ohne
// register() — server.mjs bindet /api/mandant von Hand direkt neben
// /api/sso/config ein (dort kennt es MANDANT_DATEI und ssoUser schon) und
// exportiert `mandantJetzt()` fuer andere Stellen im Server. Daher liegt die
// Datei als src/mandant-server.mjs eine Ebene hoeher, statt den Auto-Loader
// mit einem "Modul ohne register()"-Fehler zu fuettern.
import fs from "fs";
import path from "path";
import { MANDANT_STANDARD, blockAktiv, mandantLaden, mandantOeffentlich, mandantPruefen } from "./mandant.js";
import { funktionAktiv } from "./funktionen.js";

/**
 * Express-Middleware: laesst nur durch, wenn der Block fuer diesen Mandanten
 * laeuft. Ohne diese Wache haengt die Trennung allein an der Oberflaeche —
 * ein abgeschalteter Block waere per Hand-Anfrage weiter benutzbar.
 */
export const blockWache = (name, mandantJetzt) => (req, res, next) => {
  if (blockAktiv(mandantJetzt(), name)) return next();
  return res.status(404).json({ error: "Dieser Bereich ist für diese Firma nicht freigeschaltet." });
};

/**
 * Wache fuer eine Funktion (src/funktionen.js): prueft Block UND Schalter UND
 * Kaskade ueber funktionAktiv. 404 mit Funktionsname, damit ein Aufruf aus
 * einem alten Bundle laut scheitert statt still.
 */
export const funktionWache = (key, mandantJetzt) => (req, res, next) => {
  if (funktionAktiv(mandantJetzt(), key)) return next();
  return res.status(404).json({ error: `Funktion "${key}" ist für diesen Mandanten aus.` });
};

/**
 * Wache fuer /api/pl/upload: anders als funktionWache haengt die betroffene
 * Funktion hier vom Thema im Request ab (src/paperless.js PL_THEMA_FUNKTION),
 * nicht an einer festen Route — /api/pl/upload nimmt JEDES "Thema/*" entgegen
 * und ist damit der eigentliche Upload-Weg fuer neue GBUs UND andere
 * Paperless-Themen. Kein Eintrag in der Tabelle = keine eigene Funktion,
 * einfach durchlassen (wachePaperless prueft davor schon Block + Dienst).
 */
export const paperlessFunktionWache = (themaZuFunktion, mandantJetzt) => (req, res, next) => {
  const key = themaZuFunktion[String(req.body?.thema || "")];
  if (!key || funktionAktiv(mandantJetzt(), key)) return next();
  return res.status(404).json({ error: `Funktion "${key}" ist für diesen Mandanten aus.` });
};

/**
 * Wache fuer /api/pl/*: Paperless ist EINE gemeinsame Instanz mit einem
 * Zugang — ohne diese Wache koennte ein fremder Mandant Blattwerks GBU-/
 * Arbeitsschutz-Dokumente (Thema/*) mitlesen und -beschreiben. Anders als
 * bei blockWache gibt es dafuer keinen eigenen Block in BLOECKE (Paperless
 * haengt an mehreren Bloecken zugleich, z. B. arbeitsschutz), deshalb prueft
 * diese Wache direkt gegen dienste.paperless. Eine eigene Paperless-Instanz
 * je Mandant (samt Themen-/Zugangstrennung) ist eine spaetere Aufgabe — bis
 * dahin ist "keine Adresse hinterlegt, kein Zugriff" die Zwischenloesung.
 */
export const wachePaperless = (mandantJetzt) => (req, res, next) => {
  if ((mandantJetzt().dienste?.paperless || "").trim()) return next();
  return res.status(404).json({ error: "Dieser Bereich ist für diese Firma nicht freigeschaltet." });
};

/**
 * Wache fuer die Bestellmail: braucht eine hinterlegte Adresse. Blattwerks
 * eigene Adresse steht dafuer in MANDANT_STANDARD.kontakt.bestellMail
 * (mandant.js) — ein FREMDER Mandant ohne eigene Adresse soll dagegen nicht
 * heimlich bei Blattwerks Finanzen landen.
 */
export const bestellWache = (mandantJetzt) => (req, res, next) => {
  const m = mandantJetzt();
  if ((m.kontakt?.bestellMail || "").includes("@")) return next();
  return res.status(404).json({ error: "Für diese Firma ist keine Bestelladresse hinterlegt." });
};

/**
 * Empfaenger der Bestellmail: die Adresse DIESES Mandanten zuerst.
 * ORDER_MAIL_TO/die feste Blattwerk-Adresse bleiben nur ein Rueckfall — ohne
 * eine der beiden laesst bestellWache die Anfrage ohnehin gar nicht erst durch.
 */
export const bestellEmpfaenger = (mandant) =>
  mandant?.kontakt?.bestellMail || process.env.ORDER_MAIL_TO || "finanzen@example.org";

/**
 * Empfaenger der taeglichen Arbeitsschutz-Sammelmail (Fristen aus
 * asErinnerungPruefen, server.mjs). Bis 18.09.2026 stand hier
 * `process.env.ARBEITSSCHUTZ_MAIL_TO || "max@example.org"` —
 * eine fremde Instanz ohne eigene ENV mailte damit Fristen ihrer
 * Beschaeftigten an Blattwerk (Befund I7). Jetzt: Adresse des Mandanten,
 * ENV nur als Rueckfall, und OHNE feste Blattwerk-Adresse am Ende. Blattwerks
 * eigene Adresse steht dafuer in MANDANT_STANDARD.kontakt.arbeitsschutzMail —
 * dort gehoert sie hin, nicht in einen `||`-Zweig.
 * Leerer Rueckgabewert heisst: kein Empfaenger, die Erinnerung bleibt aus.
 */
export const arbeitsschutzEmpfaenger = (mandant) =>
  (mandant?.kontakt?.arbeitsschutzMail || process.env.ARBEITSSCHUTZ_MAIL_TO || "").trim();

const ohneSchrägstrich = (u) => String(u || "").replace(/\/+$/, "");

/**
 * Adresse der Paperless-Instanz DIESES Mandanten (/api/pl/*).
 *
 * Bis 18.09.2026 sprach der Server stattdessen eine Konstante an
 * (`process.env.PAPERLESS_URL || "http://203.0.113.41:8010"`), waehrend
 * wachePaperless gegen `dienste.paperless` prueft — Wache und Route meinten
 * verschiedene Dinge (Befund C2). Ohne gesetzte ENV lud ein fremder Mandant
 * seine Dokumente in Blattwerks Paperless, und Blattwerks Liste zeigte sie.
 *
 * Die Adresse kommt deshalb aus dem Mandanten. Die ENV bleibt ausschliesslich
 * Rueckfall fuer Blattwerk selbst (dessen mandant.json es gar nicht geben
 * muss); widersprechen sich beide, faehrt der Server erst gar nicht hoch
 * (startPruefen, scripts/mandant/env-pruefen.mjs).
 */
export const paperlessBasis = (mandant) => {
  const eigen = ohneSchrägstrich((mandant?.dienste?.paperless || "").trim());
  if (eigen) return eigen;
  if (mandant?.kuerzel === MANDANT_STANDARD.kuerzel) return ohneSchrägstrich(process.env.PAPERLESS_URL || "");
  return "";
};

/**
 * Adresse der Element-Web-Instanz DIESES Mandanten (/chat, /branding).
 * Gleiche Regel wie oben: aus dem Mandanten, ENV nur fuer Blattwerk, nie ein
 * fester Rueckfall auf Blattwerks LAN-IP (Befund I7). wacheChat laesst eine
 * Anfrage ohne `dienste.matrix` ohnehin nicht durch — der leere Rueckgabewert
 * ist die zweite Sicherung, falls jemand den Proxy spaeter ohne Wache mountet.
 */
export const chatUpstream = (mandant) => {
  const eigen = ohneSchrägstrich((mandant?.dienste?.matrix || "").trim());
  if (eigen) return eigen;
  if (mandant?.kuerzel === MANDANT_STANDARD.kuerzel) return ohneSchrägstrich(process.env.CHAT_UPSTREAM || "");
  return "";
};

/**
 * Beschriftung, die jedes hochgeladene Dokument in Paperless bekommt.
 * Vorher fest "Bereich/Blattwerk" und "Baum- und Gartenpflege Blattwerk GbR"
 * (server.mjs) — damit beschriftete auch eine korrekt konfigurierte fremde
 * Instanz ihre Dokumente als Blattwerk (Befund C2).
 *
 * Fuer Blattwerk kommt dabei exakt dasselbe heraus wie vorher:
 * anzeigeName "Blattwerk" -> "Bereich/Blattwerk", gewerk + name ->
 * "Baum- und Gartenpflege Blattwerk GbR". test/mandant/paperless.test.js
 * haelt das fest. `paperlessNamen` kann beides per Mandanten-Feld
 * ueberschreiben, falls die Hausordnung eines Mandanten andere Schlagworte
 * verlangt.
 */
export const paperlessNamen = (mandant) => {
  const kurz = (mandant?.anzeigeName || mandant?.name || "").trim();
  const gewerk = (mandant?.betrieb?.gewerk || "").trim();
  const name = (mandant?.name || "").trim();
  return {
    bereich: (mandant?.paperless?.bereich || "").trim() || (kurz ? `Bereich/${kurz}` : ""),
    korrespondent: (mandant?.paperless?.korrespondent || "").trim() || [gewerk, name].filter(Boolean).join(" "),
  };
};

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * index.html traegt den Namen der Firma, nicht immer "Blattwerk" — der Name
 * steht auf dem Startbildschirm des Handys und im Browser-Tab. Jede Ersetzung
 * ist ein eigenständiges Regex; fehlt eine der drei Stellen in der Vorlage
 * (z. B. nach einem kuenftigen Umbau von index.html), bleibt genau diese
 * Ersetzung ein No-op statt einer kaputten HTML-Datei zu erzeugen.
 *
 * `anzeigeName` (Kurzform, faellt auf `name` zurueck) statt `name` direkt:
 * Blattwerks eigener MANDANT_STANDARD traegt in `name` die volle Rechtsform
 * ("Blattwerk GbR", fuer GBU/Rechnungen), Browser-Tab und Startbildschirm
 * zeigten bisher aber nur "Blattwerk". Ohne diese Unterscheidung wuerde
 * dieser Umbau Blattwerks eigenen Titel/Startbildschirm-Namen aendern —
 * genau das verbietet "Blattwerk unchanged" (siehe CLAUDE.md/Task-Auftrag).
 * `farbe.thema` (faellt auf `farbe.akzent` zurueck) aus demselben Grund: die
 * App startet heute dunkel (#0f1117), `akzent` ist das Gruen der Oberflaeche.
 */
export const htmlMitMandant = (html, mandant) => {
  const anzeigeName = mandant.anzeigeName || mandant.name;
  const themaFarbe = mandant.farbe?.thema || mandant.farbe?.akzent || "#123527";
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(anzeigeName)}</title>`)
    .replace(/(<meta[^>]*name="theme-color"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(themaFarbe)}$2`)
    .replace(/(<meta[^>]*name="apple-mobile-web-app-title"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(anzeigeName)}$2`);
};

// Feste PWA-Icons: Blattwerks eigener Satz aus drei Groessen/Zwecken (liegt
// unter public/icons/, ist Teil des gebauten dist/ und aendert sich nicht mit
// dem Mandanten). Ein fremder Mandant ohne eigenes Icon-Set bekommt denselben
// Satz, statt ohne Icon dazustehen; erst ein eigenes `logo` (ungleich dem
// Blattwerk-Standardpfad) ersetzt ihn durch ein einzelnes Icon aus diesem Pfad.
const PWA_ICONS_STANDARD = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/**
 * Web-App-Manifest aus der Mandanten-Konfiguration statt aus der festen Datei
 * public/manifest.webmanifest (die bleibt fuer Blattwerk als Vorlage/Fallback
 * ungenutzt liegen, vite-plugin-pwa kopiert sie nur noch ins dist/, ausgeliefert
 * wird sie ab jetzt ueber den Server-Handler in server.mjs). Form/Felder sind
 * bewusst 1:1 die der bisherigen Datei — nur name/short_name/description/
 * theme_color/background_color/icons werden aus dem Mandanten gespeist,
 * damit Blattwerks installierte PWA (Icons, Kategorie, Sprache, Ausrichtung)
 * unveraendert bleibt.
 */
export const manifestFuer = (mandant) => {
  const anzeigeName = mandant.anzeigeName || mandant.name;
  const themaFarbe = mandant.farbe?.thema || mandant.farbe?.akzent || "#123527";
  const gewerkPrefix = mandant.betrieb?.gewerk ? `${mandant.betrieb.gewerk} ` : "";
  const eigenesLogo = mandant.logo && mandant.logo !== "/logo.png";
  return {
    // Blattwerks bisherige Datei traegt in name/short_name dieselbe Kurzform
    // ("Blattwerk", nicht die volle Rechtsform "Blattwerk GbR") — deshalb
    // hier wie im HTML-Titel anzeigeName statt mandant.name.
    name: anzeigeName,
    short_name: String(anzeigeName).split(/\s+/)[0].slice(0, 12),
    description: `${gewerkPrefix}${anzeigeName} – mobile App.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: themaFarbe,
    theme_color: themaFarbe,
    lang: "de-DE",
    categories: ["business", "productivity"],
    icons: eigenesLogo ? [{ src: mandant.logo, sizes: "512x512", type: "image/png", purpose: "any maskable" }] : PWA_ICONS_STANDARD,
  };
};

export const istMandantAdmin = (username) => {
  if (!username) return false;
  return (process.env.MANDANT_ADMINS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    .includes(String(username).toLowerCase());
};

export const mandantDateiLesen = (datei) => {
  let roh = null;
  try { roh = fs.readFileSync(datei, "utf8"); } catch (_) { roh = null; }
  return mandantLaden(roh);
};

export const mandantHandler = ({ datei, ssoUser }) => {
  let stand = mandantDateiLesen(datei);
  const aktuell = () => stand;
  return {
    aktuell,
    get(req, res) {
      // `roh` ist die ungefilterte, gespeicherte Fassung (u. a. Grundlage fuer
      // AdminPanels Rechte-Speichern per PUT) — nur an Mandanten-Admins, sonst
      // liefe mandantOeffentlich()s Allowlist fuer alle anderen Aufrufer leer.
      const darfAlles = istMandantAdmin(ssoUser(req));
      res.json({
        ...mandantOeffentlich(stand.mandant), fehler: stand.fehler, sso: !!ssoUser(req),
        roh: darfAlles ? stand.mandant : undefined,
      });
    },
    put(req, res) {
      const user = ssoUser(req);
      if (!istMandantAdmin(user)) return res.status(403).json({ error: "nur für Mandanten-Admins" });
      const fehler = mandantPruefen(req.body);
      if (fehler) return res.status(400).json({ error: fehler });
      // Erst in eine Temp-Datei im selben Verzeichnis schreiben und dann
      // umbenennen (atomar innerhalb eines Dateisystems): stuerzt der Prozess
      // mittendrin ab, bleibt die alte mandant.json unversehrt statt
      // abgeschnitten — genau die abgeschnittene Datei wuerde mandantLaden
      // als unlesbar behandeln und saemtliche Bloecke abschalten.
      const temp = `${datei}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        fs.mkdirSync(path.dirname(datei), { recursive: true });
        fs.writeFileSync(temp, JSON.stringify(req.body, null, 2), { mode: 0o600 });
        // mode bei writeFileSync greift nur bei Neuanlage der Temp-Datei —
        // explizit setzen, damit ein Umask keine offeneren Rechte durchlaesst.
        fs.chmodSync(temp, 0o600);
        fs.renameSync(temp, datei);
      } catch (e) {
        try { fs.unlinkSync(temp); } catch (_) {}
        return res.status(500).json({ error: "Speichern fehlgeschlagen: " + e.message });
      }
      stand = mandantDateiLesen(datei);
      res.json({ gespeichert: true, mandant: mandantOeffentlich(stand.mandant) });
    },
  };
};
