// Same-Origin-Durchreiche fuer die hauseigene Element-Web-Instanz.
//
// Warum ein Proxy statt einer eigenen Domain: laeuft Element unter demselben
// Origin wie die App (/chat/), dann (a) besteht Elements eigener Frame-Schutz
// (X-Frame-Options SAMEORIGIN / frame-ancestors 'self') von selbst, (b) teilt
// sich die Element-Sitzung den localStorage mit der App — die App erkennt so,
// ob schon jemand angemeldet ist — und (c) gilt die Mikrofon-Freigabe der
// Permissions-Policy ('self') auch im iframe. Element-Web nutzt durchweg
// relative Asset-Pfade, ein Unterpfad ist deshalb unproblematisch; die
// Matrix-API spricht der Client direkt mit dem Homeserver, hier laufen nur
// die statischen Dateien durch.
//
// Der Standard-Upstream ist die bestehende "Blattwerk Chat"-Instanz (Container
// element-web, Port 8090). Echter Host kommt aus VITE_CHAT_UPSTREAM
// (src/intern.js) — nie im Quelltext. Ueberschreibbar zusaetzlich per ENV
// CHAT_UPSTREAM (siehe server.mjs).
import { intern } from "./intern.js";

export const CHAT_UPSTREAM_STANDARD = intern("CHAT_UPSTREAM", "http://203.0.113.50:8090");

// Hop-by-hop-Header gehoeren der einzelnen Verbindung, nicht der Antwort —
// weiterreichen wuerde z. B. mit Transfer-Encoding die Auslieferung zerlegen.
// content-length faellt ebenfalls weg: bei der umgeschriebenen index.html
// stimmt sie nicht mehr, und Express setzt sie sonst selbst korrekt.
const GESPERRTE_HEADER = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-length",
]);

export function chatAntwortHeader(upstreamHeaders) {
  const uebernommen = {};
  for (const [name, wert] of upstreamHeaders) {
    if (!GESPERRTE_HEADER.has(name.toLowerCase())) uebernommen[name] = wert;
  }
  return uebernommen;
}

// Nur diese Anfrage-Header wandern zum Upstream: Inhaltsaushandlung plus die
// Bedingungs-Header, damit 304-Antworten (Browser-Cache) funktionieren.
// accept-encoding bleibt bewusst draussen — die Antwort kommt unkomprimiert
// und die compression()-Middleware der App uebernimmt das Gzip selbst.
const ERLAUBTE_ANFRAGE_HEADER = ["accept", "if-none-match", "if-modified-since"];

export function chatAnfrageHeader(reqHeaders) {
  const weiter = {};
  for (const name of ERLAUBTE_ANFRAGE_HEADER) {
    if (reqHeaders[name]) weiter[name] = reqHeaders[name];
  }
  return weiter;
}

// Beim Erst-Login verlaesst die App das iframe (die Login-Seiten von
// MAS/Authentik dulden kein Framing) — danach steht Element als ganze Seite
// da, ohne Weg zurueck. Diesen Weg baut der Proxy ein: ein kleines externes
// Skript (extern, weil Elements CSP "script-src 'self'" Inline-Skripte
// verbietet) haengt in der Vollbild-Fassung einen "Zur App"-Knopf ein.
// Im iframe (window.self !== window.top) tut es nichts.
export const APP_RUECKKEHR_PFAD = "app-rueckkehr.js";

export const APP_RUECKKEHR_JS = `(function () {
  if (window.self !== window.top) return;
  var knopf = document.createElement("a");
  knopf.href = "/";
  knopf.textContent = "\\u21a9 Zur App";
  knopf.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;" +
    "background:#2e7d32;color:#fff;padding:8px 14px;border-radius:999px;" +
    "font:600 13px system-ui,sans-serif;text-decoration:none;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.35);";
  function anheften() { document.body.appendChild(knopf); }
  if (document.body) anheften();
  else document.addEventListener("DOMContentLoaded", anheften);
})();
`;

// Kostuemierung: Element bleibt der Motor (E2EE, Anrufe, Medien), zeigt aber
// nur den Space "Blattwerk" — und zwar im Ein-Spalten-Modus wie eine
// Handy-App: entweder die Raumliste in voller Breite ODER den offenen Raum
// in voller Breite, nie Element-Desktop-Spalten nebeneinander. Elements
// eigene Oberflaeche kennt diesen Modus nicht, deshalb schalten Skript und
// CSS ihn von aussen: das Skript nagelt vor dem Element-Start den aktiven
// Space fest (localStorage-Schluessel mx_active_space, den der SpaceStore
// beim Booten als ROHEN Raum-Id-String liest) und haelt danach anhand der
// URL-Route (#/room/…) eine Body-Klasse aktuell; das CSS blendet je nach
// Klasse die andere Spalte, die Space-Leiste und das Info-Panel aus.
// Wirkt nur auf die durchgereichte Fassung — die eigene chat.<domain>-Adresse
// geht am Proxy vorbei und bleibt unveraendert. Bei Element-Updates die
// Klassennamen nachpruefen (mx_SpacePanel & Co., Stand element-web 1.12.24).
import { KLINGEL_EVENT, TELEFON_RAUM } from "./telefon.js";

export const BLATTWERK_SPACE = intern("CHAT_SPACE", "!example:matrix.example.org");

export const APP_KOSTUEM_PFAD = "app-kostuem.js";

export const APP_KOSTUEM_JS = `(function () {
  var SPACE = ${JSON.stringify(BLATTWERK_SPACE)};
  var TELEFON = ${JSON.stringify(TELEFON_RAUM)};
  try { localStorage.setItem("mx_active_space", SPACE); } catch (e) {}
  // Der Chat startet immer mit der Raumliste: Element wuerde sonst den
  // zuletzt offenen Raum wiederherstellen — nach einem Telefonat also den
  // ☎-Raum, der in der App eine eigene Telefon-Ansicht hat und im Chat
  // nirgends auftauchen soll.
  if (!location.hash || location.hash === "#/home" || location.hash.indexOf("#/room/" + TELEFON) === 0) {
    location.replace("#/room/" + SPACE);
  }
  function anwenden() {
    if (!document.body) return;
    // Elements Space-Startseite laeuft ebenfalls unter #/room/<Space-Id> —
    // die zaehlt als Liste, nicht als offener Raum (am 20.08. per CDP am
    // Handy diagnostiziert: beim Boot steht genau diese Route an, und wer
    // sie als Raum behandelt, versteckt die Raumliste hinter der kaputten
    // Space-Willkommensseite).
    var h = location.hash;
    if (h.indexOf("#/room/" + TELEFON) === 0) { location.replace("#/room/" + SPACE); return; }
    var raum = h.indexOf("#/room/") === 0 && h.indexOf(SPACE) < 0;
    document.body.classList.toggle("bw-raum", raum);
    document.body.classList.toggle("bw-liste", !raum);
  }
  function zurueckKnopf() {
    var knopf = document.createElement("a");
    knopf.id = "bw-zurueck";
    // Zurueck zur Space-Route (= Listenansicht) — NICHT #/home, das wuerde
    // Element auf den Home-Metaspace umschalten und alle Raeume zeigen.
    knopf.href = "#/room/" + SPACE;
    knopf.textContent = "\\u2190";
    document.body.appendChild(knopf);
  }
  window.addEventListener("hashchange", anwenden);
  document.addEventListener("DOMContentLoaded", function () { anwenden(); zurueckKnopf(); });
  if (document.body) { anwenden(); zurueckKnopf(); }

  // ── Telefon-Bruecke ──────────────────────────────────────────────────
  // Die App (Eltern-Fenster) telefoniert ueber die Element-Sitzung dieses
  // iframes: Element haelt den Matrix-Client als window.mxMatrixClientPeg
  // offen (interne, seit Jahren stabile Debug-Schnittstelle). Die Bruecke
  // reicht drei Dinge per postMessage durch: Nachrichten in den ☎-Raum
  // senden (waehlen, auflegen, DTMF), ein OpenID-Token holen (LiveKit-
  // Eintritt) und Klingel-/Statusereignisse des Raums melden. Nur im
  // iframe aktiv, nur gleicher Origin.
  if (window.self === window.top) return;
  var RAUM = ${JSON.stringify(TELEFON_RAUM)};
  var KLINGEL = ${JSON.stringify(KLINGEL_EVENT)};
  function holeClient() {
    try { return window.mxMatrixClientPeg && window.mxMatrixClientPeg.get(); } catch (e) { return null; }
  }
  function melde(daten) {
    daten.quelle = "bw-telefon";
    window.parent.postMessage(daten, window.location.origin);
  }
  window.addEventListener("message", function (ev) {
    if (ev.origin !== window.location.origin) return;
    var d = ev.data || {};
    if (d.ziel !== "bw-telefon") return;
    var c = holeClient();
    if (!c) { melde({ typ: "fehler", was: "Element-Sitzung noch nicht bereit", id: d.id }); return; }
    if (d.typ === "sende") {
      c.sendTextMessage(RAUM, String(d.text)).then(
        function () { melde({ typ: "gesendet", id: d.id }); },
        function (e) { melde({ typ: "fehler", was: String(e), id: d.id }); });
    } else if (d.typ === "openid") {
      c.getOpenIdToken().then(
        function (token) { melde({ typ: "openid", token: token, deviceId: c.getDeviceId(), id: d.id }); },
        function (e) { melde({ typ: "fehler", was: String(e), id: d.id }); });
    }
  });
  var warte = setInterval(function () {
    var c = holeClient();
    if (!c) return;
    clearInterval(warte);
    melde({ typ: "bereit" });
    c.on("Room.timeline", function (ev, room) {
      try {
        if (!room || room.roomId !== RAUM) return;
        var typ = ev.getType(), inhalt = ev.getContent() || {};
        var alterMs = Date.now() - ev.getTs();
        if (typ === KLINGEL) {
          melde({ typ: "klingeln", inhalt: inhalt, alterMs: alterMs });
        } else if (typ === "m.room.message" && inhalt.msgtype === "m.text") {
          melde({ typ: "nachricht", text: String(inhalt.body || ""), von: ev.getSender(), alterMs: alterMs });
        }
      } catch (e) {}
    });
  }, 500);
})();
`;

// Inline-<style> ist von Elements CSP gedeckt (style-src 'unsafe-inline'),
// das Skript muss extern sein (script-src 'self').
export const APP_KOSTUEM_CSS = `
  .mx_SpacePanel, .mx_ResizeHandle, .mx_Separator { display: none !important; }
  /* Der ☎-Raum hat in der App eine eigene Telefon-Ansicht — in der
     Chat-Liste wuerde er nur doppeln. Raum-Kacheln tragen den Raumnamen
     im aria-label, eine Raum-Id gibt das DOM nicht her. */
  .mx_LeftPanel [aria-label*="Anrufe Festnetz"] { display: none !important; }
  /* Die beiden Spalten stecken in ANONYMEN Flex-Divs direkt unter
     .mx_MatrixChat > div — stabil ansprechbar nur ueber :has() auf das,
     was drinsteckt (am 20.08. per CDP am Geraet vermessen; die
     css-module-Klassen wie _separator_1evkj_8 sind je Build anders). */
  /* Liste offen: Raumliste in voller Breite, Hauptspalte weg */
  body.bw-liste .mx_MatrixChat > div > div:has(.mx_SpaceRoomView),
  body.bw-liste .mx_MatrixChat > div > div:has(.mx_RoomView),
  body.bw-liste .mx_MatrixChat > div > div:has(.mx_HomePage) { display: none !important; }
  body.bw-liste .mx_MatrixChat > div > div:has(.mx_LeftPanel_outerWrapper) {
    flex: 1 1 100% !important; width: 100% !important; max-width: 100% !important;
  }
  body.bw-liste .mx_LeftPanel_outerWrapper, body.bw-liste .mx_LeftPanel_wrapper,
  body.bw-liste .mx_LeftPanel { width: 100% !important; max-width: 100% !important; min-width: 0 !important; }
  /* Raum offen: Listen-Spalte und Info-Panel weg, Raum in voller Breite */
  body.bw-raum .mx_MatrixChat > div > div:has(.mx_LeftPanel_outerWrapper) { display: none !important; }
  body.bw-raum .mx_RightPanel { display: none !important; }
  body.bw-raum .mx_RoomHeader { padding-left: 48px !important; }
  #bw-zurueck {
    position: fixed; top: 8px; left: 8px; z-index: 9999; width: 34px; height: 34px;
    display: none; align-items: center; justify-content: center;
    background: #2e7d32; color: #fff; border-radius: 999px; text-decoration: none;
    font: 700 18px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.35);
  }
  body.bw-raum #bw-zurueck { display: flex; }
`;

export function chatIndexUmschreiben(html) {
  const kopf = `<style>${APP_KOSTUEM_CSS}</style><script src="${APP_KOSTUEM_PFAD}"></script></head>`;
  const fuss = `<script src="${APP_RUECKKEHR_PFAD}"></script></body>`;
  let raus = html.includes("</head>") ? html.replace("</head>", kopf) : kopf + html;
  raus = raus.includes("</body>") ? raus.replace("</body>", fuss) : raus + fuss;
  return raus;
}

// index.html erkennt man nicht am Pfad allein (Element liefert "/" aus) —
// deshalb entscheidet der Content-Type, und umgeschrieben wird nur die
// Wurzel, nicht etwa jitsi.html oder andere Hilfsseiten.
export function chatIstIndex(pfad, contentType) {
  const istHtml = (contentType || "").toLowerCase().includes("text/html");
  return istHtml && (pfad === "/" || pfad === "/index.html");
}
