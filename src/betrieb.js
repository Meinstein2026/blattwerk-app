// Betriebsdaten der Firma, wie sie in Nachweise gehen: GBU-Kopfzeile
// (src/gbu-pdf.js) und Fahrzeug-Ueberlassungsvereinbarung
// (src/ueberlassung.js / src/ueberlassung-pdf.js).
//
// Eigene Datei statt einer Funktion in dolibarr-app.jsx (bis 18.09.2026 stand
// sie dort): dolibarr-app.jsx laesst sich nicht importieren, also war diese
// Ableitung nur ueber Quelltextmuster pruefbar. Genau hier sitzt aber die
// Entscheidung, ob eine fremde Firma Blattwerks Stammdaten erbt — das
// verlangt einen Verhaltenstest (test/mandant/stammdaten.test.js).
//
// Die Blattwerk-Werte stehen hier 1:1 wie in MANDANT_STANDARD (src/mandant.js)
// statt importiert zu werden — ein Import wuerde server-/node-seitige Module
// (u. a. chat-proxy.js) ins Browser-Bundle ziehen. Wer dort etwas aendert,
// aendert es hier mit; test/mandant/stammdaten.test.js haelt beide Kopien
// gegeneinander.
export const BETRIEB_STANDARD = {
  name: "Blattwerk GbR", ort: "Musterstadt", anzeigeName: "Blattwerk", logo: "/logo.png",
  uvTraeger: "SVLFG", grundGbu: "",
  anschrift: "Musterstraße 1, 12345 Musterstadt", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk",
  vertragsName: "Blattwerk",
  foerderRegion: "landkreis-giessen",
};

/** Kuerzel von Blattwerks eigenem Mandanten (MANDANT_STANDARD.kuerzel). */
export const BETRIEB_KUERZEL_BW = "bw";

/**
 * Mandanten-Konfiguration (oeffentliche Fassung aus /api/mandant) ->
 * Betriebsdaten fuer die Nachweise.
 *
 * `mandant === null` heisst "noch nichts geladen" (mandantAusCache() liefert
 * null ohne vorherigen erfolgreichen Abruf) — dann gelten Blattwerks Werte,
 * weil ein GBU-PDF aus genau diesem Moment (z. B. beim Abarbeiten der
 * Warteschlange direkt nach dem Start) sonst unvollstaendig waere, obwohl es
 * Blattwerks eigenes ist. Auf einer fremden Instanz ist dieser Zustand nur
 * erreichbar, solange noch NIE eine Konfiguration ankam; ab dem ersten Abruf
 * liegt sie im localStorage.
 *
 * ACHTUNG beim Weiterbauen: hier gehoert kein weiterer Blattwerk-Wert als
 * Rueckfall hin. Der Rueckfall auf `BETRIEB_STANDARD.name` gilt deshalb NUR
 * fuer Blattwerk selbst (Abschlusspruefung 18.09.2026, Befund C1) — ohne
 * diese Bedingung wuerde eine fremde mandant.json mit leerem `name`
 * stillschweigend zu "Blattwerk GbR", und die Verweigerung in buildGbuPdf
 * ("ohne Firmenname keine Gefährdungsbeurteilung") koennte ueber die App nie
 * greifen. `ort`/`logo`/`anzeigeName` sind fuer einen fremden Mandanten schon
 * in mandantLaden() geleert und kommen hier als "" an.
 */
export const mandantBetrieb = (m) => (m
  ? {
    name: m.name || (m.kuerzel === BETRIEB_KUERZEL_BW ? BETRIEB_STANDARD.name : ""),
    ort: m.ort || "", anzeigeName: m.anzeigeName || "", logo: m.logo || "",
    ...(m.betrieb || {}),
  }
  : { ...BETRIEB_STANDARD });

/**
 * Marke der Firma fuer Topbar und Anmeldebildschirm.
 *
 * Bis 18.09.2026 stand dort `mandant?.logo || "/logo.png"` und
 * `… || "Blattwerk"` — eine fremde Firma ohne eigenes Logo zeigte damit
 * Blattwerks Logo im Kopf ihrer App (kleine Mitnahme zu Befund C1). Der
 * Rueckfall gilt jetzt nur noch fuer `m === null`, also solange ueberhaupt
 * keine Konfiguration geladen ist — derselbe Grund wie bei mandantBetrieb().
 * Ein geladener Mandant ohne eigenes Logo bekommt KEINS; die Oberflaeche
 * blendet das Bild dann aus, statt ein fremdes zu zeigen.
 */
export const mandantMarke = (m) => (m
  ? {
    firma: String(m.anzeigeName || m.name || "").trim(),
    logo: String(m.logo || "").trim(),
    gewerk: String(m.betrieb?.gewerk || "").trim(),
  }
  : { firma: BETRIEB_STANDARD.anzeigeName, logo: BETRIEB_STANDARD.logo, gewerk: BETRIEB_STANDARD.gewerk });
