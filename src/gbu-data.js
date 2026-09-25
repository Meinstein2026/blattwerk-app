// Vor-Ort-Gefährdungsbeurteilung (GBU) — Checklisten-Definitionen + pure Helfer.
// Inhalte orientiert an SVLFG/DGUV-Praxis für Garten- und Landschaftspflege.
// Die Checkliste wird modular zusammengesetzt: Grundblock + Arbeitsart + Zugang.

import { BK_BEFUND } from "./baumkataster-data.js";

// Maßnahmen, die bei fast jedem Mangel passen — werden je Punkt ergänzt.
const M_STANDARD = ["Arbeit verschoben", "Arbeitsverfahren geändert", "Sonstige Maßnahme (Freitext)"];

const item = (id, label, measures = []) => ({ id, label, measures: [...measures, ...M_STANDARD] });

export const GBU_GRUND_ITEMS = [
  item("psa", "PSA vollständig & intakt (Helm, Schnittschutz, Handschuhe, S-Schuhe)",
    ["PSA ergänzt/ersetzt", "Arbeit erst nach Beschaffung begonnen"]),
  item("absperrung", "Arbeitsbereich gesichert, Dritte ferngehalten",
    ["Absperrung erweitert", "Sicherungsposten gestellt"]),
  item("verkehr", "Verkehrssicherung eingerichtet (Warnkleidung, Beschilderung)",
    ["Warnkleidung angelegt", "Absperrung/Beschilderung aufgestellt"]),
  item("leitungen", "Strom-/Freileitungen im Arbeitsbereich geprüft",
    ["Sicherheitsabstand eingehalten", "Netzbetreiber kontaktiert / Freischaltung"]),
  item("wetter", "Wetter geeignet (Wind, Nässe, Gewitter)",
    ["Wetterbesserung abgewartet"]),
  item("rettung", "Erste-Hilfe-Material vor Ort, Rettungskette geklärt (Notruf, Adresse)",
    ["Verbandkasten nachgerüstet", "Anfahrtsadresse/Rettungspunkt notiert"]),
];

// ---- SVLFG-Formular „Einsatzbezogene Gefährdungsermittlung/Baumsicherheitsbeurteilung" ----
// Die folgenden Blöcke und Auswahllisten bilden das Papierformular vollständig ab.

export const GBU_QUALIFIKATIONEN = ["AS-Baum I", "AS-Baum II", "SKT A", "SKT B"];
export const GBU_PERSONAL_MAX = 4;

// Personal-/Organisations-Checks (Formularkopf „Personal") — gelten für jeden Einsatz.
export const GBU_PERSONAL_ITEMS = [
  item("auftrag", "Arbeitsauftrag besprochen", ["Einweisung durchgeführt"]),
  item("einteilung", "Personal eingeteilt", ["Einweisung durchgeführt"]),
  item("kommunikation", "Kommunikation abgesprochen (Handzeichen, Zuruf, Funk/Telefon)",
    ["Einweisung durchgeführt"]),
  item("bodenperson", "Bodenperson eingeteilt", ["Bodenperson gestellt"]),
  item("sicherungsposten", "Sicherungsposten eingeteilt", ["Sicherungsposten gestellt"]),
  item("eignung", "Gesundheitliche Eignung aller Eingesetzten gegeben", []),
  item("erfahrung", "Ausreichende Erfahrung für die geplanten Arbeiten", ["Erfahrene Person hinzugezogen"]),
];

// „Durchzuführende Arbeiten" bei Baumarbeiten (Mehrfachauswahl + Sonstiges-Freitext).
export const GBU_DURCHZUFUEHRENDE_ARBEITEN = [
  "Totholzentnahme", "Kronenpflege", "Kroneneinkürzung", "Kronensicherung",
  "Kronensicherungsschnitt", "Fällung", "Fällung mit Abseiltechnik",
];

// „Ausrüstung und Arbeitsgerät" — nur bei Baumarbeiten/Bühne/SKT eingeblendet.
export const GBU_AUSRUESTUNG_ITEMS = [
  item("psa-vorhanden", "Betriebssichere PSA vorhanden", ["PSA ergänzt/ersetzt"]),
  item("psa-geprueft", "PSA überprüft", ["PSA ergänzt/ersetzt"]),
  item("zwei-kletter", "Zwei Kletterausrüstungen vor Ort", ["Zweite Ausrüstung nachgeholt"]),
  item("abseil-vorhanden", "Abseilausrüstung vorhanden", ["Abseilausrüstung beschafft"]),
  item("abseil-geprueft", "Abseilausrüstung überprüft", ["Material ersetzt"]),
  item("rettungsmaterial", "Rettungsmaterial vorhanden", ["Rettungsset nachgerüstet"]),
  item("maschinen-vorhanden", "Erforderliche Maschinen vorhanden", ["Maschine beschafft"]),
  item("maschinen-geprueft", "Maschinen überprüft", ["Gerät getauscht/instand gesetzt"]),
  item("erste-hilfe", "Erste-Hilfe-Ausrüstung vorhanden", ["Verbandkasten nachgerüstet"]),
  item("funk-erforderlich", "Funk erforderlich", []),
  item("funk-geprueft", "Funk geprüft", ["Funkgeräte getauscht/geladen"]),
  item("absperrmaterial", "Absperr- und Sicherungsmaterial vorhanden", ["Absperrmaterial beschafft"]),
];

// Ergänzende „Gefahren am Einsatzort"-Checks aus dem SVLFG-Formular
// (Witterung, Stromleitungen, Verkehrssicherung stecken bereits im Grundblock).
export const GBU_EINSATZORT_ITEMS = [
  item("rueckweiche", "Rückweiche vorhanden", ["Rückweiche freigeräumt"]),
  item("abseilen", "Abseilen erforderlich — Ausrüstung und Ablauf geklärt", []),
];

// „Notfall- und Rettungsmaßnahmen".
export const GBU_NOTFALL_ITEMS = [
  item("einsatzort-bekannt", "Genauer Einsatzort/Zufahrt für Rettungskräfte bekannt",
    ["Adresse/Rettungspunkt notiert"]),
  item("notruf", "Notruf möglich (Netzabdeckung geprüft)", ["Standort mit Empfang festgelegt"]),
  item("massnahmen", "Notfall-Maßnahmen besprochen", ["Einweisung durchgeführt"]),
  item("eh-material", "Erste-Hilfe-Material vor Ort", ["Verbandkasten nachgerüstet"]),
  item("rettungsmaterial", "Rettungsmaterial einsatzbereit", ["Rettungsset nachgerüstet"]),
  item("rettungsseil", "Rettungsseil einsatzbereit", ["Rettungsseil nachgerüstet"]),
  item("rufsicht", "Ruf- und Sichtverbindung sichergestellt", ["Sicherungsposten gestellt"]),
];

// Baumsicherheitsbeurteilung — Auswahllisten wortgleich zum Formular.
export const GBU_BAUM_HAENGER = ["Normalbaum", "Vorhänger", "Rückhänger", "Seithänger", "angekippt"];
// Seit 16.09.2026 aus dem Baumkataster (eine Quelle für Kataster und GBU):
export const GBU_BAUM_UMFELD = BK_BEFUND.umfeld;
export const GBU_BAUM_STAMM = BK_BEFUND.stamm;
export const GBU_BAUM_KRONE = BK_BEFUND.krone;
export const GBU_KRONE_GEWICHT = ["gleichmäßig", "einseitig"];
export const GBU_KRONE_ZUSTAND = ["begrünt", "dürr"];
export const GBU_BAUM_SICHER = ["ja", "nein", "eingehende Untersuchung erforderlich"];

// Baumarbeiten im Sinne des SVLFG-Formulars (Baumsicherheitsbeurteilung nötig).
export const isBaumArbeit = (arbeitsartId) => ["baumpflege", "faellung"].includes(arbeitsartId);
// Formular-Einsatzarten Baumarbeiten/Hubarbeitsbühneneinsatz/SKT — steuert die Zusatzblöcke.
export const isBaumEinsatz = (arbeitsartId, zugangId) =>
  isBaumArbeit(arbeitsartId) || ["buehne", "skt"].includes(zugangId);

// Angekreuzte Einsatzarten für den PDF-Kopf (wie die drei Kästchen oben auf dem Formular).
export function gbuEinsatzKategorien(arbeitsartId, zugangId) {
  const k = [];
  if (isBaumArbeit(arbeitsartId)) k.push("Baumarbeiten");
  if (zugangId === "buehne") k.push("Hubarbeitsbühneneinsatz");
  if (zugangId === "skt") k.push("SKT");
  return k;
}

export const GBU_ARBEITSARTEN = [
  {
    id: "baumpflege", label: "Baumpflege / Baumschnitt", zugangRelevant: true,
    recht: "SVLFG VSG 4.2 (Baumarbeiten) · DGUV Information 214-046",
    items: [
      item("baumansprache", "Baumansprache durchgeführt (Vitalität, Totholz, Risse, Pilzbefall)",
        ["Totholz vorab entfernt", "Zugang geändert (Bühne statt Klettern)"]),
      item("anhaenger", "Hängende/angebrochene Äste (Anhänger) geprüft",
        ["Anhänger vorab abgetragen"]),
      item("stammfuss", "Stammfuß & Wurzelbereich geprüft (Höhlungen, Pilzkonsolen)",
        ["Zugang geändert (Bühne statt Klettern)"]),
      item("fallbereich", "Fallbereich für Schnittgut gesichert",
        ["Absperrung erweitert", "Abseiltechnik (Rigging) eingesetzt"]),
      item("rigging", "Abtragetechnik/Rigging festgelegt & Material geprüft",
        ["Material ersetzt"]),
    ],
  },
  {
    id: "faellung", label: "Fällung", zugangRelevant: true,
    recht: "SVLFG VSG 4.3 · DGUV Information 214-046",
    items: [
      item("faellrichtung", "Fällrichtung festgelegt, Fallbereich frei (2 Baumlängen)",
        ["Fällrichtung geändert", "Seilwinde/Zugseil eingesetzt"]),
      item("rueckzug", "Rückzugsweg festgelegt & freigeräumt", []),
      item("faellhilfen", "Fällhilfen verfügbar (Keile, Zugseil, ggf. Winde)",
        ["Fällhilfen beschafft"]),
      item("krone", "Totholz/Kronenbruch beurteilt", ["Krone vorab abgetragen"]),
      item("umfeld", "Gebäude, Nachbarbäume, Leitungen im Fallbereich geprüft",
        ["Abtragung statt Fällung gewählt"]),
      item("saege", "Motorsäge geprüft (Kettenbremse, Schärfe), Schnittschutz an",
        ["Gerät getauscht/instand gesetzt"]),
    ],
  },
  {
    id: "hecke", label: "Heckenschnitt", zugangRelevant: true,
    recht: "SVLFG VSG · § 39 Abs. 5 BNatSchG (Gehölzschnitt)",
    items: [
      item("stand", "Standfläche eben & tragfähig", ["Standort verbessert/geändert"]),
      item("geraet", "Heckenschere/Gerät geprüft (Messerschutz, Griffschalter)",
        ["Gerät getauscht/instand gesetzt"]),
      item("laerm", "Gehörschutz & Schutzbrille angelegt", ["PSA ergänzt/ersetzt"]),
      item("fremdkoerper", "Bewuchs auf Draht/Zaun/Fremdkörper geprüft",
        ["Fremdkörper entfernt", "Bereich ausgespart"]),
      item("vogelschutz", "Nester/Brutstätten geprüft (Vogelschutz, §39 BNatSchG)",
        ["Bereich ausgespart"]),
    ],
  },
  {
    id: "fraesen", label: "Stubbenfräsen", zugangRelevant: false,
    recht: "BetrSichV · Betriebsanleitung des Herstellers",
    items: [
      item("splittflug", "Umfeld gegen Steinschlag/Splittflug gesichert (Schutzwände/Planen)",
        ["Schutzwände/Planen gestellt", "Absperrung erweitert"]),
      item("bodenleitungen", "Leitungen im Boden erfragt/geprüft (Strom, Gas, Wasser)",
        ["Leitungsauskunft eingeholt", "Handschachtung zur Erkundung"]),
      item("geraet", "Fräse geprüft (Schutzabdeckungen, Not-Aus)",
        ["Gerät getauscht/instand gesetzt"]),
      item("psa-fraese", "Gesichtsschutz & Gehörschutz angelegt", ["PSA ergänzt/ersetzt"]),
    ],
  },
  {
    id: "maehen", label: "Mähen / Freischneiden", zugangRelevant: false,
    recht: "SVLFG VSG · PSA-Benutzungsverordnung",
    items: [
      item("flaeche", "Fläche auf Fremdkörper (Steine, Äste, Müll) abgesucht",
        ["Fremdkörper entfernt"]),
      item("steinschlag", "Steinschlagschutz: Abstand zu Personen/Fahrzeugen (≥ 15 m)",
        ["Absperrung erweitert", "Fahrzeuge abgedeckt/umgestellt"]),
      item("geraet", "Gerät geprüft (Schutzhaube, Fadenkopf/Messer fest)",
        ["Gerät getauscht/instand gesetzt"]),
      item("psa-maehen", "Visier, Gehörschutz, Beinschutz angelegt", ["PSA ergänzt/ersetzt"]),
    ],
  },
  {
    id: "erdarbeiten", label: "Pflanz- / Erdarbeiten", zugangRelevant: false,
    recht: "DIN 4124 (Baugruben und Gräben) · Leitungsauskunft",
    items: [
      item("bodenleitungen", "Leitungen im Boden erfragt/geprüft (Strom, Gas, Wasser)",
        ["Leitungsauskunft eingeholt", "Handschachtung zur Erkundung"]),
      item("boeschung", "Grabenwände/Böschungen standsicher (ab 1,25 m Verbau/Abböschung)",
        ["Verbau eingebracht", "Abgeböscht"]),
      item("lasten", "Hebehilfen/Tragetechnik für schwere Lasten (Ballen, Steine)",
        ["Hebehilfe eingesetzt", "Zu zweit getragen"]),
      item("maschinen", "Maschinen (Bagger/Radlader): Schwenkbereich frei, Einweiser",
        ["Einweiser gestellt", "Absperrung erweitert"]),
    ],
  },
  {
    id: "sonstiges", label: "Sonstige Arbeiten", zugangRelevant: true,
    beschreibungPflicht: true,
    items: [],
  },
];

export const GBU_ZUGAENGE = [
  { id: "boden", label: "Vom Boden", items: [] },
  {
    id: "leiter", label: "Leiter", recht: "TRBS 2121-2 (Arbeiten auf Leitern)",
    items: [
      item("leiter-zustand", "Leiter geprüft (Sprossen, Holme, Füße unbeschädigt)",
        ["Leiter getauscht"]),
      item("leiter-stand", "Standfläche tragfähig, Leiter gegen Wegrutschen/Umkippen gesichert",
        ["Leiter angebunden/gesichert", "Standort verbessert/geändert"]),
      item("leiter-winkel", "Anlegewinkel ca. 70°, ausreichender Überstand", []),
      item("leiter-arbeit", "3-Punkt-Kontakt möglich, keine Arbeiten oberhalb der 3. Sprosse von oben",
        ["Hubarbeitsbühne/Gerüst gewählt"]),
      item("leiter-saege", "Motorsäge von der Leiter nur mit zusätzlicher Sicherung",
        ["Auf Motorsägenarbeit von der Leiter verzichtet"]),
    ],
  },
  {
    id: "buehne", label: "Hubarbeitsbühne", recht: "DGUV Regel 100-500 Kap. 2.10",
    items: [
      item("buehne-bediener", "Bediener eingewiesen & beauftragt", ["Einweisung durchgeführt"]),
      item("buehne-stand", "Aufstellfläche tragfähig, Abstützung vollständig ausgefahren",
        ["Unterleghölzer/Platten verwendet", "Standort verbessert/geändert"]),
      item("buehne-psaga", "PSA gegen Absturz im Korb angeschlagen", ["PSA ergänzt/ersetzt"]),
      item("buehne-umfeld", "Quetsch-/Anfahrgefahren im Schwenkbereich beachtet",
        ["Absperrung erweitert", "Einweiser gestellt"]),
      item("buehne-notablass", "Notablass allen Beteiligten bekannt", ["Einweisung durchgeführt"]),
    ],
  },
  {
    id: "skt", label: "Seilklettertechnik (SKT)",
    recht: "SVLFG VSG 4.2 · DGUV Regel 112-199 (Rettung aus Höhen)",
    zweitePersonPflicht: true,
    items: [
      item("skt-schein", "SKT-Qualifikation für die Tätigkeit vorhanden (A/B)", []),
      item("skt-rettung", "Zweite rettungsfähige Person (Rettung aus dem Baum) vor Ort",
        ["Zweite Person nachgeholt"]),
      item("skt-rettungsset", "Rettungskonzept klar, Rettungsset/2. Seil einsatzbereit",
        ["Rettungsset nachgerüstet"]),
      item("skt-psaga", "PSAgA-Sichtprüfung (Gurt, Seile, Verbindungsmittel, Karabiner)",
        ["Material ersetzt"]),
      item("skt-anker", "Ankerpunkt tragfähig gewählt (Baumansprache!)",
        ["Ankerpunkt geändert", "Zugang geändert (Bühne statt Klettern)"]),
      item("skt-saege", "Motorsäge im Baum: geeignetes Gerät, gegen Absturz gesichert",
        ["Gerät getauscht/instand gesetzt"]),
    ],
  },
];


// Kurze Erläuterung je Prüfpunkt (Schlüssel = Punkt-Label) — erscheint als
// zweite Zeile in der PDF-Tabelle und erklärt, worauf es ankommt.
export const GBU_HINTS = {
  "PSA vollständig & intakt (Helm, Schnittschutz, Handschuhe, S-Schuhe)": "Sichtprüfung vor Arbeitsbeginn; beschädigte PSA nicht verwenden (PSA-Benutzungsverordnung).",
  "Arbeitsbereich gesichert, Dritte ferngehalten": "Gefahrenbereich so absichern, dass Kunden und Passanten nicht hineingelangen können.",
  "Verkehrssicherung eingerichtet (Warnkleidung, Beschilderung)": "An Straßen: Warnkleidung nach EN ISO 20471, ggf. Absicherung nach RSA 21.",
  "Strom-/Freileitungen im Arbeitsbereich geprüft": "Schutzabstände einhalten (bis 1 kV: 1 m, bis 110 kV: 3 m); im Zweifel Netzbetreiber einschalten.",
  "Wetter geeignet (Wind, Nässe, Gewitter)": "Bei Gewitter, starkem Wind oder Glätte keine Höhen- und Kronenarbeit.",
  "Erste-Hilfe-Material vor Ort, Rettungskette geklärt (Notruf, Adresse)": "Verbandkasten und Mobiltelefon vor Ort; genaue Einsatzadresse für den Notruf 112 parat.",
  "Kommunikation abgesprochen (Handzeichen, Zuruf, Funk/Telefon)": "Eindeutige Signale vereinbaren — besonders bei Lärm durch Motorsäge oder Häcksler.",
  "Arbeitsauftrag besprochen": "Alle Eingesetzten kennen Umfang, Ablauf und Grenzen des Auftrags.",
  "Personal eingeteilt": "Aufgaben klar zugewiesen (wer klettert, wer sichert, wer räumt).",
  "Bodenperson eingeteilt": "Bei Kronenarbeit unterstützt und überwacht eine Person vom Boden aus.",
  "Sicherungsposten eingeteilt": "Bei Verkehr oder Publikumsverkehr sichert ein Posten den Gefahrenbereich.",
  "Gesundheitliche Eignung aller Eingesetzten gegeben": "Keine Einschränkungen durch Krankheit, Medikamente oder Übermüdung; ggf. G41-Vorsorge.",
  "Ausreichende Erfahrung für die geplanten Arbeiten": "Unerfahrene nur unter Aufsicht; anspruchsvolle Arbeiten nur mit passender Qualifikation.",
  "Zwei Kletterausrüstungen vor Ort": "Für SKT Pflicht: vollständige zweite Ausrüstung für die rettungsfähige Person.",
  "Abseilausrüstung überprüft": "Seile, Umlenkrollen und Bremsen vor dem Einsatz sicht- und funktionsprüfen.",
  "Funk geprüft": "Funkverbindung vor Arbeitsbeginn testen, Ersatzakkus bereithalten.",
  "Absperr- und Sicherungsmaterial vorhanden": "Flatterband, Kegel, Schilder in ausreichender Menge dabei.",
  "Rückweiche vorhanden": "Sicherer Rückzugsraum abseits des Fall-/Gefahrenbereichs festgelegt und freigeräumt.",
  "Abseilen erforderlich — Ausrüstung und Ablauf geklärt": "Wenn Schnittgut abgeseilt werden muss: Riggingplan, Ankerpunkte und Kommandos festlegen.",
  "Genauer Einsatzort/Zufahrt für Rettungskräfte bekannt": "Adresse bzw. Rettungspunkt und Zufahrt allen bekannt; Einweisung der Rettungskräfte geklärt.",
  "Notruf möglich (Netzabdeckung geprüft)": "Mobilfunkempfang am Einsatzort geprüft; sonst Standort mit Empfang festlegen.",
  "Notfall-Maßnahmen besprochen": "Wer setzt den Notruf ab, wer leistet Erste Hilfe, wer weist ein — vorab klären.",
  "Rettungsmaterial einsatzbereit": "Rettungsset griffbereit am Einsatzort deponiert, nicht im Fahrzeug vergraben.",
  "Rettungsseil einsatzbereit": "Zweites Seil in ausreichender Länge griffbereit am Baum.",
  "Ruf- und Sichtverbindung sichergestellt": "Kletterer und Bodenpersonal bleiben in ständiger Ruf- oder Sichtverbindung.",
  "Baumansprache durchgeführt (Vitalität, Totholz, Risse, Pilzbefall)": "Von allen Seiten inkl. Krone und Umfeld; Grundlage der SVLFG-Baumbeurteilung.",
  "Hängende/angebrochene Äste (Anhänger) geprüft": "Anhänger zuerst kontrolliert entfernen — niemals darunter arbeiten.",
  "Stammfuß & Wurzelbereich geprüft (Höhlungen, Pilzkonsolen)": "Bei Höhlungen oder Pilzkonsolen Standsicherheit und Ankerpunkte kritisch bewerten.",
  "Fallbereich für Schnittgut gesichert": "Kein Aufenthalt unter der Arbeitsstelle; Fallbereich freihalten oder abseilen.",
  "Abtragetechnik/Rigging festgelegt & Material geprüft": "Bruchlasten, Seilwinkel und Zustand von Seilen und Umlenkrollen prüfen.",
  "Fällrichtung festgelegt, Fallbereich frei (2 Baumlängen)": "Gefahrenbereich = zwei Baumlängen rundum; nur unterwiesene Personen darin.",
  "Rückzugsweg festgelegt & freigeräumt": "Schräg nach hinten anlegen und vor dem Fällschnitt freiräumen.",
  "Fällhilfen verfügbar (Keile, Zugseil, ggf. Winde)": "Ohne geeignete Fällhilfen keine Fällung gegen Hang oder Wind.",
  "Totholz/Kronenbruch beurteilt": "Totholz kann beim Fällen unkontrolliert brechen und zurückschlagen.",
  "Gebäude, Nachbarbäume, Leitungen im Fallbereich geprüft": "Bei Bebauung oder Leitungen im Fallbereich: kontrollierte Abtragung statt Fällung.",
  "Motorsäge geprüft (Kettenbremse, Schärfe), Schnittschutz an": "Täglicher Gerätecheck; Schnittschutzhose und Helm mit Visier sind Pflicht.",
  "Standfläche eben & tragfähig": "Unebener oder weicher Untergrund erhöht Absturz- und Umknickgefahr.",
  "Heckenschere/Gerät geprüft (Messerschutz, Griffschalter)": "Zweihandschaltung und Messerschutz müssen funktionieren.",
  "Gehörschutz & Schutzbrille angelegt": "Ab 85 dB(A) ist Gehörschutz Pflicht; Augenschutz gegen Splitter.",
  "Bewuchs auf Draht/Zaun/Fremdkörper geprüft": "Draht- und Zaunreste können Messer brechen lassen (Splitterflug).",
  "Nester/Brutstätten geprüft (Vogelschutz, §39 BNatSchG)": "1. März bis 30. September nur schonende Form- und Pflegeschnitte; besetzte Nester aussparen.",
  "Umfeld gegen Steinschlag/Splittflug gesichert (Schutzwände/Planen)": "Die Fräse schleudert Steine und Holzstücke weit — Umfeld abschirmen.",
  "Leitungen im Boden erfragt/geprüft (Strom, Gas, Wasser)": "Vor Boden-/Fräsarbeiten Leitungsauskunft einholen; nahe Leitungen von Hand schachten.",
  "Fräse geprüft (Schutzabdeckungen, Not-Aus)": "Niemals mit demontierten Schutzhauben fräsen.",
  "Gesichtsschutz & Gehörschutz angelegt": "Gesichtsschutz gegen Splittflug; Gehörschutz wegen Lärm.",
  "Fläche auf Fremdkörper (Steine, Äste, Müll) abgesucht": "Fremdkörper werden bis 15 m weit geschleudert.",
  "Steinschlagschutz: Abstand zu Personen/Fahrzeugen (≥ 15 m)": "Nähern sich Personen: Arbeit unterbrechen.",
  "Gerät geprüft (Schutzhaube, Fadenkopf/Messer fest)": "Schutzhaube nie entfernen; Schneidwerkzeug auf festen Sitz prüfen.",
  "Visier, Gehörschutz, Beinschutz angelegt": "Visier oder Schutzbrille, Gehörschutz und langer Beinschutz gegen Steinschlag.",
  "Grabenwände/Böschungen standsicher (ab 1,25 m Verbau/Abböschung)": "Ab 1,25 m Tiefe Verbau oder Abböschung nach DIN 4124.",
  "Hebehilfen/Tragetechnik für schwere Lasten (Ballen, Steine)": "Hebehilfen nutzen, schwere Lasten zu zweit tragen — Rücken schonen.",
  "Maschinen (Bagger/Radlader): Schwenkbereich frei, Einweiser": "Nicht im Schwenkbereich aufhalten; bei schlechter Sicht Einweiser stellen.",
  "Leiter geprüft (Sprossen, Holme, Füße unbeschädigt)": "Beschädigte Leitern sofort aussondern und kennzeichnen.",
  "Standfläche tragfähig, Leiter gegen Wegrutschen/Umkippen gesichert": "Auf weichem Boden Fußverbreiterung oder Unterlage verwenden; oben anbinden.",
  "Anlegewinkel ca. 70°, ausreichender Überstand": "Anlegewinkel 65–75°; am Austritt 1 m Überstand.",
  "3-Punkt-Kontakt möglich, keine Arbeiten oberhalb der 3. Sprosse von oben": "Nicht seitlich hinauslehnen — lieber umstellen.",
  "Motorsäge von der Leiter nur mit zusätzlicher Sicherung": "Besser Hubarbeitsbühne oder SKT statt Motorsäge auf der Leiter.",
  "Bediener eingewiesen & beauftragt": "Bedienberechtigung und Einweisung dokumentieren.",
  "Aufstellfläche tragfähig, Abstützung vollständig ausgefahren": "Bodenpressung beachten; Abstützplatten verwenden.",
  "PSA gegen Absturz im Korb angeschlagen": "Auffanggurt am vorgesehenen Anschlagpunkt im Korb befestigen.",
  "Quetsch-/Anfahrgefahren im Schwenkbereich beachtet": "Schwenkbereich absperren; auf fließenden Verkehr achten.",
  "Notablass allen Beteiligten bekannt": "Vor Arbeitsbeginn zeigen, wo der Notablass ist und wie er funktioniert.",
  "SKT-Qualifikation für die Tätigkeit vorhanden (A/B)": "SKT-A für Pflege, SKT-B für Abtragung; G41-Vorsorge aktuell.",
  "Zweite rettungsfähige Person (Rettung aus dem Baum) vor Ort": "Muss selbst klettern und retten können — bloße Anwesenheit genügt nicht (DGUV R 112-199).",
  "Rettungskonzept klar, Rettungsset/2. Seil einsatzbereit": "Zweites Seil/Rettungsset griffbereit am Baum deponieren.",
  "PSAgA-Sichtprüfung (Gurt, Seile, Verbindungsmittel, Karabiner)": "Sicht- und Funktionsprüfung vor jedem Einsatz; auffällige Teile aussondern.",
  "Ankerpunkt tragfähig gewählt (Baumansprache!)": "Tragfähigkeit des Ankerpunkts aus der Baumansprache ableiten.",
  "Motorsäge im Baum: geeignetes Gerät, gegen Absturz gesichert": "Top-Handle-Säge nur im Baum und mit Halteöse gesichert.",
};

export const GBU_NIEDERSCHLAG = ["trocken", "feucht", "Regen", "Schnee/Glätte"];
export const GBU_WIND = ["windstill", "leichter Wind", "mäßiger Wind", "starker Wind/Böen"];

export const gbuArbeitsart = (id) => GBU_ARBEITSARTEN.find((a) => a.id === id) || null;
export const gbuZugang = (id) => GBU_ZUGAENGE.find((z) => z.id === id) || null;

// Setzt die Checkliste als Blöcke zusammen. Zugang nur, wenn die Arbeitsart
// höhenrelevant ist und ein Zugang gewählt wurde. Bei Baumarbeiten/Bühne/SKT
// kommen die SVLFG-Formularblöcke (Ausrüstung, Einsatzort, Notfall) hinzu.
export function composeChecklist(arbeitsartId, zugangId) {
  const art = gbuArbeitsart(arbeitsartId);
  const blocks = [
    { id: "personal", label: "Personal & Organisation", recht: "SVLFG-Formular Gefährdungsermittlung · DGUV Vorschrift 1", items: GBU_PERSONAL_ITEMS },
    { id: "grund", label: "Grundlagen (immer)", recht: "§§ 5, 6 ArbSchG · DGUV Vorschrift 1 · SVLFG VSG 1.1", items: GBU_GRUND_ITEMS },
  ];
  if (art && art.items.length) blocks.push({ id: `art-${art.id}`, label: art.label, recht: art.recht, items: art.items });
  if (art?.zugangRelevant) {
    const z = gbuZugang(zugangId);
    if (z && z.items.length) blocks.push({ id: `zugang-${z.id}`, label: `Zugang: ${z.label}`, recht: z.recht, items: z.items });
  }
  if (isBaumEinsatz(arbeitsartId, art?.zugangRelevant ? zugangId : "")) {
    blocks.push({ id: "ausruestung", label: "Ausrüstung und Arbeitsgerät", recht: "SVLFG-Formular Gefährdungsermittlung · VSG 4.2", items: GBU_AUSRUESTUNG_ITEMS });
    blocks.push({ id: "einsatzort", label: "Gefahren am Einsatzort (Ergänzung)", recht: "SVLFG-Formular Gefährdungsermittlung", items: GBU_EINSATZORT_ITEMS });
    blocks.push({ id: "notfall", label: "Notfall- und Rettungsmaßnahmen", recht: "SVLFG-Formular Gefährdungsermittlung · DGUV Regel 112-199", items: GBU_NOTFALL_ITEMS });
  }
  return blocks;
}

// Warnung bei kritischer Wetter/Zugang-Kombination (nur Hinweis, blockiert nicht).
export function gbuWetterWarnung(wind, niederschlag, zugangId, arbeitsartId) {
  const hoehe = zugangId && zugangId !== "boden" && gbuArbeitsart(arbeitsartId)?.zugangRelevant;
  if (hoehe && wind === "starker Wind/Böen")
    return "Starker Wind/Böen: Höhenarbeit (Leiter/Bühne/SKT) in der Regel einstellen!";
  if (zugangId === "skt" && (niederschlag === "Regen" || niederschlag === "Schnee/Glätte"))
    return "Nässe/Glätte beim Klettern: Rutschgefahr — Arbeit kritisch prüfen!";
  return null;
}

const sanitizeFilePart = (s) =>
  String(s || "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "unbenannt";

export function buildGbuFilename(dateIso, kunde, arbeitsartId) {
  const d = new Date(dateIso);
  const pad = (n) => String(n).padStart(2, "0");
  const datum = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const zeit = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const art = gbuArbeitsart(arbeitsartId)?.label || arbeitsartId || "Arbeit";
  return `GBU_${datum}_${zeit}_${sanitizeFilePart(kunde)}_${sanitizeFilePart(art)}.pdf`;
}

// Validierung vor dem Speichern. Liefert Liste menschenlesbarer Fehler.
// ─── Einsatz nach Zeit statt nach Stückzahl (11.09.2026) ────────────────────
// „Macht innerhalb von 8 h bei so vielen Bäumen wie möglich Totholzentfernung."
// Die Stückzahl steht vorher nicht fest; eine erfundene Zahl im Formular wäre
// schlimmer als keine. Dann beschreibt `baum` den BEREICH und
// `zeitrahmenStunden` ist das Maß des Einsatzes — ein eigenes Feld, damit es
// im Datensatz und im PDF steht und nicht nur in einem Freitext mitläuft.

/** Stunden als Zahl, oder null, wenn nichts Brauchbares dasteht. */
export function zeitrahmenStunden(v) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0.5 || n > 24) return null;
  return n;
}

/** Ein Satz für Maske und PDF — beide zeigen denselben, sonst laufen sie auseinander. */
export function gbuUmfangText(record) {
  const h = zeitrahmenStunden(record?.zeitrahmenStunden);
  if (h == null) return "";
  const zahl = String(h).replace(".", ",");
  return record?.anzahlOffen
    ? `${zahl} h — so viele Bäume wie möglich, Anzahl vorher offen`
    : `${zahl} h vorgesehen`;
}

function validateGbuV2(record) {
  const errors = [];
  const art = gbuArbeitsart(record.arbeitsart);
  if (!art) errors.push("Arbeitsart wählen.");
  if (art?.zugangRelevant && !record.zugang) errors.push("Zugang wählen (Boden/Leiter/Bühne/SKT).");
  if (art?.beschreibungPflicht && !String(record.beschreibung || "").trim())
    errors.push("Bei 'Sonstige Arbeiten' die Tätigkeit kurz beschreiben.");
  if (isBaumArbeit(record.arbeitsart) && !String(record.baum || "").trim())
    errors.push(record.anzahlOffen
      ? "Bereich beschreiben, in dem gearbeitet wird (z. B. „Schlosspark, Altbaumbestand an der Allee“)."
      : "Baum/Bäume angeben (Art, ggf. Anzahl und Standort).");
  // Einsatz nach Zeit: steht die Stückzahl nicht fest, ist der Zeitrahmen das
  // einzige Maß, das der Einsatz überhaupt hat — ohne ihn wäre im Nachhinein
  // nicht belegbar, worauf sich die Beurteilung bezog.
  const stunden = zeitrahmenStunden(record.zeitrahmenStunden);
  if (record.zeitrahmenStunden !== undefined && record.zeitrahmenStunden !== "" && stunden == null)
    errors.push("Zeitrahmen: Stunden als Zahl zwischen 0,5 und 24 angeben.");
  else if (record.anzahlOffen && stunden == null)
    errors.push("Ohne feste Anzahl braucht der Einsatz einen Zeitrahmen in Stunden (z. B. 8).");
  if (isBaumArbeit(record.arbeitsart)) {
    if (!(record.arbeiten || []).length && !String(record.arbeitenSonstiges || "").trim())
      errors.push("Durchzuführende Arbeiten ankreuzen (oder unter Sonstiges beschreiben).");
    const bd = record.baumdaten || {};
    if (!bd.sicher)
      errors.push("Baumsicherheitsbeurteilung abschließen: „Baum ist sicher für die geplanten Arbeiten“ bewerten.");
    else if (bd.sicher !== "ja" && !String(bd.bemerkung || "").trim())
      errors.push("Bemerkung zur Baumsicherheit angeben (warum nicht sicher bzw. was zu untersuchen ist).");
  }
  const blocks = composeChecklist(record.arbeitsart, record.zugang);
  for (const b of blocks) {
    for (const it of b.items) {
      const st = record.items?.[`${b.id}:${it.id}`];
      if (!st || !st.status) { errors.push("Alle Punkte bewerten (OK / Mangel / n. r.)."); break; }
      if (st.status === "mangel" && !String(st.massnahme || "").trim()) {
        errors.push(`Maßnahme angeben für: „${it.label}“`);
      }
    }
  }
  if (!record.sigDurchfuehrender) errors.push("Unterschrift des Durchführenden fehlt.");
  if (record.zugang === "skt" && art?.zugangRelevant && !String(record.zweitePersonName || "").trim())
    errors.push("Bei SKT den Namen der zweiten rettungsfähigen Person eintragen.");
  return errors;
}

// ─── Wiederkehrende Einsätze: übernehmen statt neu tippen (11.09.2026) ──────
// Wer dreimal die Woche beim selben Kunden steht, tippt sonst jedes Mal
// dasselbe Formular. Übernommen wird der wiederkehrende Teil — Arbeitsart,
// Zugang, Einsatzort, Personal, Baumdaten, die abgehakten Punkte.
//
// Bewusst NICHT übernommen: Wetter, Uhrzeit und Unterschriften. Eine
// Beurteilung, die das Wetter von vorgestern weiterträgt, ist keine
// Beurteilung mehr, sondern eine Kopie — § 5 ArbSchG verlangt die Verhältnisse
// vor Ort. Aus demselben Grund fällt ein gemeldeter Mangel raus: ob er behoben
// ist, weiß nur, wer hinschaut.

/** Jüngster Eintrag im Geräte-Log zu diesem Kunden (Id, ersatzweise Name). */
export function gbuLetzterEinsatz(log, { kundeId, kundeName } = {}) {
  const id = kundeId == null || kundeId === "" ? null : String(kundeId);
  const name = String(kundeName || "").trim().toLowerCase();
  if (!id && !name) return null;
  const passt = (r) => {
    const k = r?.kunde;
    if (!k) return false;
    if (id && k.id != null && String(k.id) === id) return true;
    return !!name && String(k.name || "").trim().toLowerCase() === name;
  };
  const treffer = (Array.isArray(log) ? log : []).filter(passt);
  if (!treffer.length) return null;
  return treffer.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
}

/** Der übernehmbare Teil eines Eintrags, aufgeteilt wie die Zustände im Formular. */
export function gbuUebernahme(record) {
  if (!record) return null;
  const t = (v) => String(v || "");
  const items = {};
  for (const [k, v] of Object.entries(record.items || {})) {
    // Nur bestätigte Punkte — ein Mangel gehört neu beurteilt (siehe oben).
    if (v?.status === "ok") items[k] = { status: "ok" };
  }
  return {
    form: {
      arbeitsart: t(record.arbeitsart), zugang: t(record.zugang),
      beschreibung: t(record.beschreibung), baum: t(record.baum), besonderheiten: t(record.besonderheiten),
      einsatzort: t(record.einsatzort), aufsichtsfuehrender: t(record.aufsichtsfuehrender),
      arbeiten: Array.isArray(record.arbeiten) ? [...record.arbeiten] : [],
      arbeitenSonstiges: t(record.arbeitenSonstiges),
      stromEntfernung: t(record.stromEntfernung),
      kommunikationsart: t(record.kommunikationsart),
      verkehrssicherungsart: t(record.verkehrssicherungsart),
      anzahlOffen: !!record.anzahlOffen,
      zeitrahmenStunden: zeitrahmenStunden(record.zeitrahmenStunden) ?? "",
    },
    personal: (Array.isArray(record.personal) ? record.personal : [])
      .map((p) => ({ name: t(p?.name), quals: Array.isArray(p?.quals) ? [...p.quals] : [] })),
    baumdaten: record.baumdaten ? uebernahmeBaumdaten(record.baumdaten) : null,
    items,
  };
}

// ─── Suche über Kunden und Verantwortliche (11.09.2026) ─────────────────────
// Die Auswahllisten sind auf dem Handy lang. Gesucht wird über Teilwörter in
// beliebiger Reihenfolge; Umlaute und ihre Umschrift finden einander, weil im
// Freien niemand „Müller" mit Umlaut tippt (und umgekehrt Kundennamen im
// Dolibarr mal so und mal so geschrieben stehen).
// Zwei Lesarten desselben Namens: „Gärtnerei" schreibt der eine als
// „Gaertnerei", der andere tippt einfach „Gartnerei". Beide müssen finden,
// deshalb wird jeder Name in beiden Fassungen durchsucht.
const gbuAusgeschrieben = (s) => String(s ?? "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
const gbuOhnePunkte = (s) => String(s ?? "").toLowerCase()
  .replace(/ß/g, "ss")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Die Umschrift greift nur in EINE Richtung: „mueller"/„muller" sollen
// „Müller" finden, aber „müller" nicht jedes „Mueller" — sonst wäre die
// gezielt getippte Schreibweise wertlos. Ein Begriff MIT Umlaut sucht deshalb
// wörtlich, einer ohne in beiden entschärften Fassungen.
const gbuText = (o) => [o?.name, o?.nom, o?.login, o?.label, o?.ref].filter(Boolean).join(" ");

export function gbuSuche(liste, text) {
  const arr = (Array.isArray(liste) ? liste : []).filter(Boolean);
  const begriffe = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!begriffe.length) return arr;
  return arr.filter((o) => {
    const roh = gbuText(o).toLowerCase();
    const lang = gbuAusgeschrieben(roh), kurz = gbuOhnePunkte(roh);
    return begriffe.every((b) => {
      if (/[äöü]/i.test(b)) return roh.includes(b.toLowerCase());
      const q = b.toLowerCase();
      return lang.includes(gbuAusgeschrieben(q)) || kurz.includes(gbuOhnePunkte(q));
    });
  });
}

/**
 * Baumdaten für einen Wiederholungsbesuch.
 *
 * **Maße bleiben, Bewertungen nicht.** Baumart, Höhe, BHD und Stockdurchmesser
 * ändern sich zwischen zwei Besuchen nicht — die noch einmal abzumessen wäre
 * Schikane. Alles andere ist das Ergebnis des Hinsehens: Hänger, Umfeld,
 * Stamm- und Kronenbefunde, und vor allem `sicher` mit seiner Bemerkung.
 *
 * `sicher` ist das einzige Tor in `validateGbu`, das sagt „hier hat jemand
 * hingeschaut". Käme es mit, wäre es vorab erfüllt und die Übernahme wäre
 * genau die Kopie, gegen die sie oben abgegrenzt ist — unter einem Zeitrahmen
 * mit offener Baumzahl sogar für einen Baum, den niemand benannt hat.
 */
function uebernahmeBaumdaten(bd) {
  const t = (v) => String(v || "");
  return {
    baumart: t(bd.baumart), hoehe: t(bd.hoehe), bhd: t(bd.bhd), stock: t(bd.stock),
    haenger: [], umfeld: [], stamm: [], krone: [],
    gewicht: "", kronenzustand: "", sicher: "", bemerkung: "",
  };
}

// ─── Aufbau des SKT-Papierformulars „Gefahrenermittlung – Seilklettertechnik" (16.09.2026)
// Sechs Kästen, 1:1 vom Papier (Fotos MBKS-Kurs). Für ALLE Arbeitsarten: bei
// Hecke/Boden/Bühne fallen Baum- und SKT-Zeilen weg (nurBaum/nurSkt/nurBuehne).
// Drei Zustände je Prüfzeile: "ja" | "nein" | "" (offen). Offen ist nicht nein —
// was die Automatik nicht bestätigen kann, bleibt offen, bis jemand hinschaut.
export const GBU_GESUNDHEIT = ["vital", "leicht eingeschränkt", "deutlich eingeschränkt", "absterbend", "abgestorben"];
export const GBU_STANDSICHERHEIT = ["gegeben", "eingeschränkt", "eingehende Untersuchung erforderlich"];

// `spalte` steuert die Zweispaltigkeit im PDF (wie auf dem Papier), `automatik`
// markiert Zeilen, die die App vorbelegen kann (Marker „A" im PDF).
const zl = (id, label, o = {}) => ({ id, label, typ: "check", pflicht: false, automatik: false, spalte: 1, ...o });

export const GBU_BLOECKE = [
  { id: "kopf", titel: "Einsatz", zeilen: [
    zl("datum", "Datum", { typ: "datum", pflicht: true, automatik: true }),
    zl("einsatzort", "Einsatzort/Ortsteil", { typ: "text", pflicht: true, automatik: true }),
    zl("strasse", "Straße/Nr./Park", { typ: "text", automatik: true }),
    zl("standort", "Standort/Zufahrtsweg", { typ: "text" }),
    zl("festnetz", "Festnetz-Nr. vor Ort", { typ: "text" }),
    zl("mobil", "Mobil-Nr. vor Ort (1–3)", { typ: "liste", automatik: true }),
    zl("netz", "Netzempfang", { automatik: true }),
    zl("aufsicht", "Aufsichtsführende(r)", { typ: "text", pflicht: true, automatik: true }),
    zl("gps", "Lageplan (GPS-Position + Karte)", { typ: "gps", automatik: true }),
  ] },
  { id: "baustelle", titel: "Baustellencheck", zeilen: [
    zl("verkehrssicherung", "Verkehrssicherung notwendig", { pflicht: true, automatik: true }),
    zl("witterung", "Witterung geeignet", { pflicht: true, automatik: true }),
    zl("kommunikation", "Kommunikation möglich", { pflicht: true }),
    zl("funk", "Funk erforderlich", { pflicht: true }),
    zl("absperrungDurch", "Absperrung durch (Firma, etc.)", { typ: "text" }),
    zl("dauer", "Dauer der Arbeiten", { typ: "zeit", automatik: true, spalte: 2 }),
    zl("stromleitung", "Stromleitung im Gefahrenbereich", { pflicht: true, automatik: true, spalte: 2 }),
    zl("sonstigeGefahren", "Sonstige Gefahren am Einsatzort", { typ: "text", spalte: 2 }),
    zl("fallbereichFrei", "Fallbereich frei", { pflicht: true, nurBaum: true, spalte: 2 }),
    zl("abseiltechniken", "Abseiltechniken erforderlich", { pflicht: true, nurBaum: true, spalte: 2 }),
    zl("artAbsperrung", "Art d. Absperrung", { typ: "text", spalte: 2 }),
  ] },
  { id: "baumcheck", titel: "Baumcheck (Sicherheitsbeurteilung)", nurBaum: true, zeilen: [
    zl("krone", "Baumkrone/Kronenansatz", { typ: "text", automatik: true }),
    zl("stamm", "Stamm/Stammfuß", { typ: "text", automatik: true }),
    zl("wurzel", "Wurzel/Baumumfeld", { typ: "text", automatik: true }),
    zl("gesundheit", "Gesundheitszustand", { typ: "wahl", optionen: GBU_GESUNDHEIT, pflicht: true, automatik: true }),
    zl("standsicherheit", "Bruch- u. Standsicherheit", { typ: "wahl", optionen: GBU_STANDSICHERHEIT, pflicht: true, automatik: true }),
  ] },
  { id: "material", titel: "Material- und Ausrüstungscheck", zeilen: [
    zl("psaDoppelt", "2x Betriebssichere PSA vorhanden", { pflicht: true, nurSkt: true, automatik: true }),
    zl("abseilmaterial", "Abseilmaterialien geeignet für Auftrag", { pflicht: true, nurSkt: true }),
    zl("rettungsmaterial", "Rettungsmaterial vorhanden (komplettes Klettersystem, Umlenkung, Steigeisen, etc.)", { pflicht: true, nurSkt: true, automatik: true }),
    zl("rettungsplanBuehne", "Rettungsplan Hubarbeitsbühne (Notablass) bekannt", { pflicht: true, nurBuehne: true }),
    zl("ersteHilfe", "Erste Hilfe Ausrüstung", { pflicht: true, automatik: true, spalte: 2 }),
    zl("funkGeprueft", "Funk überprüft", { automatik: true, spalte: 2 }),
    zl("sonstiges", "Sonstiges", { typ: "text", spalte: 2 }),
  ] },
  { id: "personalcheck", titel: "Personalcheck", zeilen: [
    zl("auftragBesprochen", "Arbeitsauftrag besprochen, Personal eingeteilt", { pflicht: true, hinweisNurSkt: "Mind. 2 ausgebildete Anwender SKT vor Ort!" }),
    zl("kommunikation", "Kommunikation abgesprochen", { pflicht: true }),
    zl("erfahrung", "Ausreichende Erfahrung f. geplante Arbeiten vorhanden", { pflicht: true, automatik: true, spalte: 2 }),
    zl("rettung", "Rettungsmaßnahmen besprochen", { pflicht: true, spalte: 2 }),
  ] },
  { id: "freigabe", titel: "Freigabe", zeilen: [
    zl("baumSicher", "Baum ist sicher f. geplante Arbeiten", { pflicht: true, nurBaum: true }),
    zl("einschraenkungen", "Einschränkungen f. Einsatz", { typ: "text" }),
  ] },
];

/**
 * Setzt das Formular für Arbeitsart + Zugang zusammen. Zugang zählt nur, wenn die
 * Arbeitsart höhenrelevant ist (wie composeChecklist). Der Block „baustelle"
 * bekommt die alten Arbeitsart-/Zugangs-Checklisten als `chips` — nichts geht verloren.
 */
export function composeFormular(arbeitsartId, zugangId) {
  const art = gbuArbeitsart(arbeitsartId);
  const zugang = art?.zugangRelevant ? String(zugangId || "") : "";
  const baum = isBaumArbeit(arbeitsartId);
  const skt = zugang === "skt", buehne = zugang === "buehne";
  const passt = (z) => !(z.nurBaum && !baum) && !(z.nurSkt && !skt) && !(z.nurBuehne && !buehne);
  return GBU_BLOECKE
    .filter((b) => !(b.nurBaum && !baum))
    .map((b) => {
      const zeilen = b.zeilen.filter(passt).map((z) => {
        const { hinweisNurSkt, ...rest } = z;
        return { ...rest, hinweis: hinweisNurSkt && skt ? hinweisNurSkt : "" };
      });
      const block = { id: b.id, titel: b.titel, zeilen };
      if (b.id === "baustelle") {
        const zg = zugang ? gbuZugang(zugang) : null;
        block.chips = [...(art?.items || []), ...(zg?.items || [])].map((it) => it.label);
      }
      return block;
    });
}

const heuteIsoLokal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Leerer v3-Datensatz: alle Prüfzeilen offen (""), Datum heute, Aufsicht = Anwender. */
export function gbuNeuV3({ userName = "", heute = heuteIsoLokal() } = {}) {
  const leer = (blockId) => {
    const o = {};
    for (const z of GBU_BLOECKE.find((b) => b.id === blockId).zeilen) o[z.id] = z.typ === "liste" ? [] : "";
    return o;
  };
  return {
    version: 3, id: "", createdAt: "", userName,
    kunde: null, projekt: null,
    arbeitsart: "", zugang: "", beschreibung: "", baum: "",
    arbeiten: [], arbeitenSonstiges: "", anzahlOffen: false, zeitrahmenStunden: "",
    kopf: { ...leer("kopf"), datum: heute, datumBis: "", aufsicht: userName, gps: null, karte: null, adresseGeo: "" },
    baustelle: { ...leer("baustelle"), dauerVon: "", dauerBis: "", stromleitungText: "", sonstigeGefahrenChips: [] },
    baumcheck: { ...leer("baumcheck"), befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] } },
    material: { ...leer("material"), offeneFristen: [] },
    personalcheck: { ...leer("personalcheck"), erfahrungFehlt: [] },
    freigabe: leer("freigabe"),
    personal: [], automatik: {}, aufsichtAbweichung: null, wetter: null, katasterBaum: null,
    zweitePersonName: "", sigDurchfuehrender: null, sigZweitePerson: null,
    uploadedDolibarr: false, uploadedPl: false,
  };
}

// ─── Validierung v3 (SKT-Formular) ───────────────────────────────────────────
// Jede Pflicht-Prüfzeile muss mit ja oder nein beantwortet sein — offen ist eine
// Aufforderung hinzuschauen, kein Ergebnis. Ein "nein" bei Material, Personal,
// Witterung oder Kommunikation ist kein Ausschluss, aber es muss dastehen, unter
// welchen Einschränkungen trotzdem gearbeitet wird (oder dass nicht gearbeitet wird).
function validateGbuV3(r) {
  const errors = [];
  const art = gbuArbeitsart(r.arbeitsart);
  if (!art) errors.push("Arbeitsart wählen.");
  if (art?.zugangRelevant && !r.zugang) errors.push("Zugang wählen (Boden/Leiter/Bühne/SKT).");
  if (art?.beschreibungPflicht && !String(r.beschreibung || "").trim())
    errors.push("Bei 'Sonstige Arbeiten' die Tätigkeit kurz beschreiben.");
  const k = r.kopf || {};
  if (!String(k.einsatzort || "").trim() && !String(k.strasse || "").trim())
    errors.push("Einsatzort oder Straße angeben — der Notruf braucht eine Adresse.");
  if (!String(k.aufsicht || "").trim()) errors.push("Aufsichtsführende(r) angeben.");
  if (r.aufsichtAbweichung && !String(r.aufsichtAbweichung.grund || "").trim())
    errors.push(`Aufsicht weicht vom Vorschlag (${r.aufsichtAbweichung.vorschlag}) ab — Grund angeben.`);
  const baum = isBaumArbeit(r.arbeitsart);
  if (baum && !String(r.baum || "").trim())
    errors.push(r.anzahlOffen
      ? "Bereich beschreiben, in dem gearbeitet wird (z. B. „Schlosspark, Altbaumbestand an der Allee“)."
      : "Baum/Bäume angeben (Art, ggf. Anzahl und Standort).");
  const stunden = zeitrahmenStunden(r.zeitrahmenStunden);
  if (r.zeitrahmenStunden !== undefined && r.zeitrahmenStunden !== "" && stunden == null)
    errors.push("Zeitrahmen: Stunden als Zahl zwischen 0,5 und 24 angeben.");
  else if (r.anzahlOffen && stunden == null)
    errors.push("Ohne feste Anzahl braucht der Einsatz einen Zeitrahmen in Stunden (z. B. 8).");
  if (baum && !(r.arbeiten || []).length && !String(r.arbeitenSonstiges || "").trim())
    errors.push("Durchzuführende Arbeiten ankreuzen (oder unter Sonstiges beschreiben).");

  for (const b of composeFormular(r.arbeitsart, r.zugang)) {
    if (b.id === "kopf") continue;
    const daten = r[b.id] || {};
    for (const z of b.zeilen) {
      if (!z.pflicht) continue;
      const w = daten[z.id];
      if (z.typ === "check" && w !== "ja" && w !== "nein") errors.push(`${b.titel}: „${z.label}“ mit ja oder nein beantworten.`);
      if (z.typ === "wahl" && !w) errors.push(`${b.titel}: „${z.label}“ auswählen.`);
    }
  }
  const bs = r.baustelle || {}, m = r.material || {}, p = r.personalcheck || {}, f = r.freigabe || {};
  if (bs.funk === "ja" && m.funkGeprueft !== "ja" && m.funkGeprueft !== "nein")
    errors.push("Funk erforderlich: „Funk überprüft“ mit ja oder nein beantworten.");
  const einschr = String(f.einschraenkungen || "").trim();
  if (baum && f.baumSicher === "nein" && !einschr)
    errors.push("Baum nicht sicher: Einschränkungen für den Einsatz angeben (oder Arbeit nicht aufnehmen).");
  if (r.baumcheck && r.baumcheck.standsicherheit === "eingehende Untersuchung erforderlich" && f.baumSicher === "ja")
    errors.push("Widerspruch: eingehende Untersuchung erforderlich, aber Baum als sicher freigegeben.");
  const neinZeilen = [
    ...Object.entries(m), ...Object.entries(p),
    ["witterung", bs.witterung], ["kommunikation", bs.kommunikation],
  ].filter(([, v]) => v === "nein");
  if (neinZeilen.length && !einschr)
    errors.push("Ein Prüfpunkt steht auf „nein“: Einschränkungen für den Einsatz angeben (oder Arbeit nicht aufnehmen).");
  const skt = r.zugang === "skt" && art?.zugangRelevant;
  if (skt && (r.personal || []).length < 2) errors.push("SKT: mindestens zwei Personen vor Ort eintragen.");
  if (!r.sigDurchfuehrender) errors.push("Unterschrift des Durchführenden fehlt.");
  // Die zweite rettungsfaehige Person MUSS vor Ort sein (Pruefpunkt „skt-rettung" und
  // die Zwei-Personen-Regel oben decken das ab) — sie muss aber NICHT unterschreiben.
  // Das Papierformular kennt dafuer keine Zeile, dort zeichnet nur die aufsichtsfuehrende
  // Person. Verlangt wird stattdessen ihr NAME, damit im Nachhinein feststeht, wer es war.
  if (skt && !String(r.zweitePersonName || "").trim())
    errors.push("Bei SKT den Namen der zweiten rettungsfähigen Person eintragen.");
  return errors;
}

/** v3 -> neue Prüfung, alles andere -> die bisherige (Queue/Log von vor dem Umbau). */
export function validateGbu(record) {
  return Number(record?.version) === 3 ? validateGbuV3(record) : validateGbuV2(record);
}

// ─── Übernahme in die v3-Maske (aus v2- oder v3-Einträgen) ───────────────────
// Wie gbuUebernahme: der wiederkehrende Teil kommt mit (Ort, Absperrung,
// Stromleitung, Verkehrssicherung, Personal), das Beurteilte nicht (Witterung,
// Zeiten, Netz, GPS, Baumcheck, Material, Personalcheck, Freigabe, Unterschriften).
// v2-Freitexte werden in die neuen Felder gehoben; ein Check wird nur abgeleitet,
// wenn der Text das hergibt — sonst bleibt er offen.
const NEIN_TEXT = /^\s*(keine|nein|nicht|entf|k\.?\s?a\.?|—|-)/i;
const checkAusText = (text) => {
  const t = String(text || "").trim();
  if (!t) return "";
  return NEIN_TEXT.test(t) ? "nein" : "ja";
};

export function gbuUebernahmeV3(record) {
  if (!record) return null;
  const t = (v) => String(v || "");
  const v3 = Number(record.version) === 3;
  const k = v3 ? (record.kopf || {}) : {};
  const b = v3 ? (record.baustelle || {}) : {};
  return {
    form: {
      arbeitsart: t(record.arbeitsart), zugang: t(record.zugang),
      beschreibung: t(record.beschreibung), baum: t(record.baum),
      arbeiten: Array.isArray(record.arbeiten) ? [...record.arbeiten] : [],
      arbeitenSonstiges: t(record.arbeitenSonstiges),
      anzahlOffen: !!record.anzahlOffen,
      zeitrahmenStunden: zeitrahmenStunden(record.zeitrahmenStunden) ?? "",
    },
    kopf: {
      einsatzort: v3 ? t(k.einsatzort) : t(record.einsatzort),
      strasse: t(k.strasse), standort: t(k.standort), festnetz: t(k.festnetz),
      aufsicht: v3 ? t(k.aufsicht) : t(record.aufsichtsfuehrender),
    },
    baustelle: {
      verkehrssicherung: v3 ? t(b.verkehrssicherung) : checkAusText(record.verkehrssicherungsart),
      stromleitung: v3 ? t(b.stromleitung) : checkAusText(record.stromEntfernung),
      stromleitungText: v3 ? t(b.stromleitungText) : t(record.stromEntfernung),
      artAbsperrung: v3 ? t(b.artAbsperrung) : t(record.verkehrssicherungsart),
      absperrungDurch: t(b.absperrungDurch),
      sonstigeGefahrenChips: Array.isArray(b.sonstigeGefahrenChips) ? [...b.sonstigeGefahrenChips] : [],
    },
    personal: (Array.isArray(record.personal) ? record.personal : []).map((p) => ({
      key: t(p?.key), name: t(p?.name), mobil: t(p?.mobil), quals: Array.isArray(p?.quals) ? [...p.quals] : [],
    })),
  };
}
