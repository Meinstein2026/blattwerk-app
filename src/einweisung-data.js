// Einweisung an Arbeitsmitteln (§ 12 BetrSichV) — Checklisten je Gerät.
// Erzeugt aus der Papiervorlage "Einweisung an Arbeitsmitteln" vom 07.08.2026
// (Nextcloud/Blattwerk/Arbeitsschutz/). Inhalte fachlich identisch mit dem PDF —
// wer hier etwas ändert, muss die Papiervorlage nachziehen, sonst laufen die
// unterschriebenen Protokolle und das Formular auseinander.

// Kopfdaten, die je Protokoll erfasst werden. Hersteller/Typ/Serien-Nr. sind
// bewusst Freitext und Pflicht: ohne sie ist das Protokoll wertlos.
export const EINWEISUNG_KOPF_FELDER = [
  { id: "hersteller", label: "Hersteller / Typ", pflicht: true },
  { id: "seriennr", label: "Serien- / Inventar-Nr.", pflicht: true },
  { id: "baujahr", label: "Baujahr", pflicht: false },
  { id: "anleitung", label: "Betriebsanleitung liegt vor", typ: "bool", pflicht: true },
  { id: "anleitungAusgehaendigt", label: "Anleitung ausgehändigt am", typ: "datum", pflicht: false },
];

// Wiederholungsintervall in Monaten. 12 aus § 12 Abs. 1 S. 3 BetrSichV und
// § 4 Abs. 1 DGUV Vorschrift 1, 6 aus § 29 Abs. 2 JArbSchG für Minderjährige.
export const EINWEISUNG_INTERVALL_MONATE = 12;
export const EINWEISUNG_INTERVALL_MONATE_JUGENDLICH = 6;

// Punkt-IDs sind bewusst durchnummeriert (p1, p2, ...) und nicht aus dem Text abgeleitet:
// eine Umformulierung darf gespeicherte Protokolle nicht ungueltig machen.
export const EINWEISUNG_GERAETE = [
  {
    id: "motorsaege",
    nr: 1,
    label: "Motorsäge, Verbrenner",
    kopfFelder: [],
    // Ohne diese Nachweise darf gar nicht erst eingewiesen werden.
    voraussetzungen: [
      { id: "v1", label: "Nachweis der Fachkunde für Motorsägenarbeiten (VSG 4.2 § 3, im SVLFG-Bereich Lehrgang AS-Baum I, für Arbeiten im Baum AS-Baum II).Ausstellende Stelle: ______________________ Datum: ____________" },
      { id: "v2", label: "Vollständige persönliche Schutzausrüstung vorhanden und passend: Schnittschutzhose, Schnittschutzstiefel, Forsthelm mit Visier und Gehörschutz, Handschuhe." },
    ],
    inhalte: [
      { id: "p1", label: "Aufbau des Gerätes, Bedienelemente, Kraftstoffgemisch und Kettenöl, Startvorgang am Boden mit sicherem Stand" },
      { id: "p2", label: "Kettenbremse: Wirkungsweise, Funktionsprüfung vor jeder Schicht, Auslösen von Hand und durch Trägheit" },
      { id: "p3", label: "Rückschlag: wie er entsteht, warum die obere Schienenspitze nicht zum Schneiden benutzt wird, sichere Griffhaltung mit umschließendem Daumen" },
      { id: "p4", label: "Kette schärfen und spannen, Auswirkung einer stumpfen Kette auf Kraftaufwand und Unfallrisiko" },
      { id: "p5", label: "Schnitttechniken: Trennschnitt, Entlastungsschnitt bei Zug- und Druckspannung, Entasten mit dem Stamm als Schutz" },
      { id: "p6", label: "Fällschnitt: Fallkerb, Bruchleiste, Fällschnitt, Keil, Rückweichen, Fallbereich von zwei Baumlängen" },
      { id: "p7", label: "Verhalten bei Hängern, kein Besteigen, kein Fällen des Nachbarbaums als Lösung" },
      { id: "p8", label: "Betanken bei abgestelltem und abgekühltem Motor, Umgang mit dem Doppelkanister, Verhalten bei verschüttetem Kraftstoff" },
      { id: "p9", label: "Transport und Ablegen: Kettenbremse, Kettenschutz, Sicherung im Fahrzeug" },
      { id: "p10", label: "Erste Hilfe bei Schnittverletzung, Umgang mit dem Tourniquet, Notruf und Rettungspunkt" },
      { id: "p11", label: "Grenzen: keine Arbeit über Schulterhöhe, keine Einhandführung, keine Motorsägenarbeit von der Leiter" },
    ],
  },
  {
    id: "akku-baumsaege",
    nr: 2,
    label: "Akku-Motorsäge für Arbeiten im Baum",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Akkusystem" },
    ],
    // Ohne diese Nachweise darf gar nicht erst eingewiesen werden.
    voraussetzungen: [
      { id: "v1", label: "Fachkunde für Motorsägenarbeit im Baum (SKT-B oder anerkannt gleichwertig).Stelle: ______________________ Datum: ____________" },
      { id: "v2", label: "Gültige Höhentauglichkeit nach G 41.Datum: ____________ gültig bis: ____________" },
    ],
    inhalte: [
      { id: "p1", label: "Unterschiede zur Bodensäge: Gewicht, Führung, geringere Rückschlagenergie, aber unveränderte Schnittwirkung" },
      { id: "p2", label: "Sicherung der Säge am Gurt, Karabinerwahl, kein freies Hängenlassen der laufenden Säge" },
      { id: "p3", label: "Seilverlauf vor jedem Schnitt sichten, Schnittrichtung stets vom Kletter- und Zweitseil weg" },
      { id: "p4", label: "Arbeitsposition: beide Hände frei, stabiler Halt über Gurt und Verbindungsmittel, kein Schnitt in Streckhaltung" },
      { id: "p5", label: "Einhandbetrieb: nur wenn vom Hersteller freigegeben und nur bei gesicherter Arbeitsposition" },
      { id: "p6", label: "Abwurf und Abseilen von Astteilen, Verständigung mit der Bodenperson, Zurufe und Handzeichen" },
      { id: "p7", label: "Akku: Handhabung, Lagerung, Verhalten bei beschädigtem oder erhitztem Akku, kein Laden im Fahrzeug über Nacht" },
      { id: "p8", label: "Entnahme des Akkus vor jedem Eingriff an Kette und Schiene" },
      { id: "p9", label: "Verhalten bei Blockieren der Kette im Ast, Lösen ohne Sturzgefahr" },
    ],
  },
  {
    id: "heckenschere",
    nr: 3,
    label: "Heckenschere",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Schwertlänge" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Bedienelemente, Zweihandschaltung, Messerbremse und ihre Funktionsprüfung vor Arbeitsbeginn" },
      { id: "p2", label: "Sicherer Stand, Schnittführung von unten nach oben, Körper nicht im Schwenkbereich der Schiene" },
      { id: "p3", label: "Verstopfungen und festsitzende Äste nur bei stillstehendem Messer lösen, bei Akkugeräten Akku entnehmen" },
      { id: "p4", label: "Hecke vor dem Schnitt auf Draht, Zaunreste, Nägel und Nester absuchen" },
      { id: "p5", label: "Freileitungen über der Hecke, Abstände, bei Netzgeräten Kabelführung hinter dem Körper und Betrieb über FI-Schutzschalter" },
      { id: "p6", label: "Schutzausrüstung: Schutzbrille oder Visier, Gehörschutz bei Verbrennergeräten, feste Handschuhe, lange Kleidung" },
      { id: "p7", label: "Messerschutz beim Absetzen und beim Transport, Sicherung im Fahrzeug" },
      { id: "p8", label: "Umgang mit Riesenbärenklau und giftigen Gehölzen, Verhalten bei Wespen- oder Hornissennest" },
      { id: "p9", label: "Grenzen: keine Benutzung von der Leiter, keine Arbeit über Kopf ohne Teleskopgerät" },
    ],
  },
  {
    id: "teleskopgeraet",
    nr: 4,
    label: "Teleskop-Heckenschere und Hochentaster",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Aufsätze" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Aufsatzwechsel nur bei abgestelltem Gerät, Verriegelung prüfen, Kontrolle der Teleskopklemmung vor jedem Einsatz" },
      { id: "p2", label: "Standwahl: nie unter dem Schnittbereich stehen, seitlich versetzt arbeiten, Fluchtweg freihalten" },
      { id: "p3", label: "Herabfallendes Schnittgut, Helm mit Visier ist bei Überkopfarbeit Pflicht, auch beim reinen Heckenaufsatz" },
      { id: "p4", label: "Abstand zu Freileitungen, insbesondere bei ausgefahrenem Rohr, kein Arbeiten unter Leitungen ohne Abstandsprüfung" },
      { id: "p5", label: "Belastung durch Überkopfarbeit, Traggurt richtig einstellen, Arbeitsintervalle begrenzen und die Person wechseln" },
      { id: "p6", label: "Beim Hochentaster: Schnittfolge, Verhalten bei eingeklemmter Schiene, kein Schnitt über der eigenen Standposition ohne Ausweichmöglichkeit" },
      { id: "p7", label: "Transport mit Schutz auf der Schiene, Gerät nicht ausgefahren tragen" },
    ],
  },
  {
    id: "akku-astschere",
    nr: 5,
    label: "Akku-Astschere",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "max. Schnittstärke" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Das Gerät schneidet in Sekundenbruchteilen und ohne hörbare Vorwarnung. Die zweite Hand hat im Schneidbereich nichts verloren, auch nicht zum Festhalten des Astes." },
      { id: "p2", label: "Sicherheitsschalter und Transportsicherung, Verriegelung bei jeder Unterbrechung, auch bei kurzer" },
      { id: "p3", label: "Maximale Schnittstärke nach Herstellerangabe, kein Erzwingen dickerer Äste" },
      { id: "p4", label: "Verhalten bei blockierter Klinge, Rückstellfunktion, Akku vorher entnehmen" },
      { id: "p5", label: "Klinge schärfen und ölen nur bei entnommenem Akku, Schnittschutzhandschuhe dabei tragen" },
      { id: "p6", label: "Kein Einsatz auf der Leiter und keine Weitergabe an Dritte, auch nicht an interessierte Kunden" },
    ],
  },
  {
    id: "freischneider",
    nr: 6,
    label: "Freischneider",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Schneidwerkzeuge", auswahl: ["Fadenkopf", "Grasschneideblatt", "Dickichtmesser"] },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Zuordnung von Schneidwerkzeug und Schutzhaube, Wechsel nur bei abgestelltem Motor und abgezogenem Zündkerzenstecker oder entnommenem Akku" },
      { id: "p2", label: "Traggurt richtig einstellen, Schnellentriegelung zeigen und einmal auslösen lassen" },
      { id: "p3", label: "Wurfgut: Fläche vor Arbeitsbeginn ablaufen, Steine und Metall entfernen, Sicherheitsabstand von 15 Metern zu anderen Personen" },
      { id: "p4", label: "Schnittrichtung nicht auf Fenster, Fahrzeuge oder Wege, sondern von ihnen weg" },
      { id: "p5", label: "Rückschlag beim Dickichtmesser, Vermeidung des kritischen Bereichs des Blattes" },
      { id: "p6", label: "Nachlauf des Werkzeugs nach dem Abstellen, Gerät erst ablegen, wenn es steht" },
      { id: "p7", label: "Arbeiten am Hang: quer zum Hang, Standsicherheit vor Flächenleistung" },
      { id: "p8", label: "Betanken bei abgekühltem Motor, Brandgefahr in trockenem Gras" },
      { id: "p9", label: "Schutzausrüstung: Visier, Gehörschutz, Beinschutz, feste Schuhe, Handschuhe" },
    ],
  },
  {
    id: "rasenmaeher",
    nr: 7,
    label: "Rasenmäher",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Antrieb", auswahl: ["Benzin", "Akku", "Netz"] },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Sicherheitsbügel und Motorbremse, Funktionsprüfung, kein Überbrücken oder Festbinden" },
      { id: "p2", label: "Auswurfklappe und Fangkorb, Betrieb nur mit montierter Schutzeinrichtung" },
      { id: "p3", label: "Fläche vor dem Mähen absuchen, Steine, Äste, Spielzeug und Schläuche entfernen" },
      { id: "p4", label: "Störungen und Verstopfungen nur bei stehendem Messer beheben, bei Benzingeräten Zündkerzenstecker abziehen, Handschuhe tragen" },
      { id: "p5", label: "Hangarbeit: quer zum Hang schieben, Herstellergrenze für die Hangneigung, kein Ziehen des Mähers auf sich zu" },
      { id: "p6", label: "Kein Betrieb bei nassem Gras auf Gefälle, Rutschgefahr" },
      { id: "p7", label: "Betanken im Freien bei kaltem Motor, Kraftstoff nicht im laufenden Betrieb nachfüllen" },
      { id: "p8", label: "Bei Netzgeräten: Kabel hinter dem Körper führen, Betrieb über FI-Schutzschalter, Kabel vor jedem Einsatz sichten" },
    ],
  },
  {
    id: "haecksler",
    nr: 8,
    label: "Häcksler",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "max. Astdurchmesser" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Einzugsgefahr: Material bis zum Trichter führen und loslassen, niemals nachschieben, kurzes Material nur mit einem längeren Ast nachführen" },
      { id: "p2", label: "Lage und Funktion von Not-Aus und Rückwärtslauf, vor jedem Einsatz prüfen und der Bodenperson zeigen" },
      { id: "p3", label: "Kleidung: eng anliegend, keine Schals, Bänder, Kordeln oder weiten Stulpen, lange Haare zusammengebunden" },
      { id: "p4", label: "Standposition seitlich versetzt zum Trichter, nicht frontal davor" },
      { id: "p5", label: "Auswurfrichtung einstellen, Auswurfbereich freihalten, Visier tragen" },
      { id: "p6", label: "Nachlauf des Rotors nach dem Abstellen, Wartung und Störungsbeseitigung nur bei Stillstand und gegen Wiedereinschalten gesichert" },
      { id: "p7", label: "Gehörschutz für alle Personen im Umfeld, Verständigung über Handzeichen" },
      { id: "p8", label: "Standsicherheit der Maschine, Feststellbremse, Aufstellung nicht im Gefälle" },
      { id: "p9", label: "Staub und Sporen bei altem oder feuchtem Material, Atemschutz FFP2 oder FFP3" },
    ],
  },
  {
    id: "stubbenfraese",
    nr: 9,
    label: "Stubbenfräse",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Eigengerät / Mietgerät" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Vorbereitung des Einsatzortes: Leitungsauskunft, Nachfrage beim Kunden nach Erdkabeln, Bewässerung und Hausanschlüssen, gegebenenfalls Kabelsuchgerät oder Suchschlitz" },
      { id: "p2", label: "Absperrung des Wurfbereichs, Schutzmatten oder Planen in Richtung Fenster, Fahrzeuge und Wege" },
      { id: "p3", label: "Bedienposition, Vorschub und Schwenkbewegung, kein Übergreifen über das laufende Fräsrad" },
      { id: "p4", label: "Standsicherheit, Feststellbremse, Verhalten in Hanglage und auf weichem Untergrund" },
      { id: "p5", label: "Zahnwechsel und Kontrolle nur bei abgestelltem Motor, Stillstand des Fräsrads abwarten, Zündkerzenstecker abziehen" },
      { id: "p6", label: "Schutzausrüstung: Visier, Gehörschutz, Sicherheitsschuhe, bei Staub Atemschutz" },
      { id: "p7", label: "Verladen und Transport: Rampentragfähigkeit, Sicherung gegen Wegrollen, niemand seitlich der Rampe" },
      { id: "p8", label: "Verhalten bei angefahrener Leitung oder Gasgeruch: sofort abstellen, Bereich räumen, Zündquellen fernhalten, Netzbetreiber verständigen" },
    ],
  },
  {
    id: "seilwinde",
    nr: 10,
    label: "Seilwinde und Anschlagmittel",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "zulässige Zugkraft" },
      { id: "k2", label: "letzte Prüfung durch befähigte Person" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Tragfähigkeit von Winde, Seil und Anschlagmitteln, Kennzeichnung lesen, keine Verwendung ungekennzeichneter Mittel" },
      { id: "p2", label: "Ablegereife erkennen: Drahtbrüche, Quetschungen, Korrosion, beschädigte Nähte an Rundschlingen" },
      { id: "p3", label: "Anschlagen am Baum, Kantenschutz, Umlenkrolle statt Zug über eine Kante" },
      { id: "p4", label: "Gefahrbereich des gespannten Seils, insbesondere in der Verlängerung, dort hält sich niemand auf" },
      { id: "p5", label: "Verständigung zwischen der ziehenden und der sägenden Person, Zeichen vor Arbeitsbeginn festlegen" },
      { id: "p6", label: "Verhalten bei ruckartigem Nachgeben der Last und bei blockiertem Seil" },
      { id: "p7", label: "Lagerung: trocken, ohne Knicke, getrennt von Kraftstoff und Öl" },
      { id: "p8", label: "Hinweis auf die wiederkehrende Prüfung nach BetrSichV, die von dieser Einweisung getrennt zu führen ist" },
    ],
  },
  {
    id: "anhaenger",
    nr: 11,
    label: "Anhänger und Zugfahrzeug",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Kennzeichen" },
      { id: "k2", label: "zulässige Gesamtmasse" },
      { id: "k3", label: "zulässige Stützlast" },
      { id: "k4", label: "Fahrerlaubnis der eingewiesenen Person" },
      { id: "k5", label: "Kopie liegt vor", typ: "bool" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Ankuppeln: Sicherung gegen Wegrollen, Kupplungsschloss prüfen, Stützrad hochkurbeln und arretieren, Abreißseil einhängen, Beleuchtung testen" },
      { id: "p2", label: "Nicht zwischen Fahrzeug und Deichsel treten, solange rangiert wird" },
      { id: "p3", label: "Massen und Lasten: zulässige Gesamtmasse der Kombination, Stützlast, Verteilung schwerer Lasten über der Achse" },
      { id: "p4", label: "Ladungssicherung: Zurrpunkte, Zurrgurte, Kantenschutz, formschlüssige Verladung, Sicherung von Kanistern und losen Werkzeugen" },
      { id: "p5", label: "Fahrverhalten mit Anhänger: verlängerter Bremsweg, Kurvenverhalten, Rückwärtsfahren, Verhalten bei Schlingern" },
      { id: "p6", label: "Abfahrtkontrolle: Reifen, Beleuchtung, Auflaufeinrichtung, Bordwände, Plane" },
      { id: "p7", label: "Abstellen und Abkuppeln, Sicherung gegen Wegrollen und unbefugte Benutzung" },
      { id: "p8", label: "Verhalten bei Panne im Verkehrsraum, Warnweste vor dem Aussteigen anlegen" },
    ],
  },
  {
    id: "hubarbeitsbuehne",
    nr: 12,
    label: "Hubarbeitsbühne (in der Regel Mietgerät)",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Vermieter" },
      { id: "k2", label: "Einsatzzeitraum" },
      { id: "k3", label: "Prüfnachweis des Vermieters liegt vor", typ: "bool" },
    ],
    // Ohne diese Nachweise darf gar nicht erst eingewiesen werden.
    voraussetzungen: [
      { id: "v1", label: "Ausbildung zur Bedienung von Hubarbeitsbühnen (DGUV Grundsatz 308-008 oder gleichwertig).Stelle: ______________________ Datum: ____________" },
      { id: "v2", label: "Schriftliche Beauftragung durch den Unternehmer nach § 12 Abs. 3 BetrSichV liegt vor." },
      { id: "v3", label: "Mindestalter 18 Jahre." },
    ],
    inhalte: [
      { id: "p1", label: "Bedienung von Korb und Unterwagen, Not-Ab-Lass und Notsteuerung, einmal praktisch durchgespielt" },
      { id: "p2", label: "Aufstellung: Tragfähigkeit des Untergrunds, Abstützung, Unterbau, Nähe zu Schächten, Kellerdecken und Böschungen" },
      { id: "p3", label: "Zulässige Korblast, Windgeschwindigkeitsgrenze des Gerätes, Verhalten bei aufkommendem Wind" },
      { id: "p4", label: "Anschlagen der persönlichen Schutzausrüstung gegen Absturz im Korb, kein Übersteigen der Korbbrüstung, kein Aufstellen von Leitern oder Kisten im Korb" },
      { id: "p5", label: "Abstände zu Freileitungen, Schutzabstand bei unbekannter Spannungsebene" },
      { id: "p6", label: "Motorsägeneinsatz aus dem Korb: nur mit entsprechender Qualifikation, Säge gesichert, Schnittrichtung vom Korb weg" },
      { id: "p7", label: "Absicherung des Bereichs unter dem Korb, zweite Person am Boden mit Kenntnis der Notsteuerung" },
      { id: "p8", label: "Verhalten bei Ausfall im ausgefahrenen Zustand, Rettung aus dem Korb" },
    ],
  },
  {
    id: "minibagger",
    nr: 13,
    label: "Minibagger (in der Regel Mietgerät)",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Vermieter" },
      { id: "k2", label: "Einsatzgewicht" },
      { id: "k3", label: "Anbaugeräte" },
    ],
    // Ohne diese Nachweise darf gar nicht erst eingewiesen werden.
    voraussetzungen: [
      { id: "v1", label: "Ausbildung und schriftliche Beauftragung für das Führen von Erdbaumaschinen.Stelle: ______________________ Datum: ____________" },
      { id: "v2", label: "Mindestalter 18 Jahre." },
    ],
    inhalte: [
      { id: "p1", label: "Steuerungsart, Anbaugerätewechsel, Schnellwechsler richtig verriegeln und Verriegelung prüfen" },
      { id: "p2", label: "Schwenkbereich als Gefahrbereich, insbesondere zwischen Heck und Hindernis, niemand hält sich dort auf" },
      { id: "p3", label: "Einweiser nur außerhalb des Schwenkbereichs und im Blickfeld, Handzeichen vorher abstimmen" },
      { id: "p4", label: "Leitungsauskunft vor Aushubbeginn, Handschachtung in Leitungsnähe, Verhalten bei Leitungstreffer" },
      { id: "p5", label: "Standsicherheit, Abstand zur Grabenkante, Lagerung des Aushubs, Verhalten an Böschungen" },
      { id: "p6", label: "Auf- und Abfahren auf den Anhänger, Rampenneigung und Tragfähigkeit, Sicherung für den Transport" },
      { id: "p7", label: "Verlassen der Maschine: Werkzeug ablegen, abstellen, sichern, Schlüssel abziehen" },
    ],
  },
  {
    id: "leitern",
    nr: 14,
    label: "Leitern und Tritte",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "letzte Sichtprüfung" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Die Leiter ist im Betrieb die Ausnahme. Wo eine Arbeitsbühne, ein Podest oder das Teleskopgerät geht, wird nicht auf die Leiter gestiegen." },
      { id: "p2", label: "Prüfung vor jeder Benutzung: Holme, Sprossen, Spreizsicherung, Leiterfüße, keine Verwendung beschädigter Leitern" },
      { id: "p3", label: "Aufstellung: tragfähiger, ebener Untergrund, Anlegewinkel 65 bis 75 Grad, mindestens ein Meter Überstand über die Austrittsstelle, Sicherung gegen Wegrutschen" },
      { id: "p4", label: "Kein seitliches Hinauslehnen über die Holme, sondern Umsetzen der Leiter" },
      { id: "p5", label: "Keine zweihandgeführten Motorgeräte von der Leiter aus, keine Motorsäge, kein Freischneider" },
      { id: "p6", label: "Grenzen nach TRBS 2121 Teil 2: als Arbeitsplatz bis zwei Meter Standhöhe, zwischen zwei und fünf Metern nur zeitweilig und höchstens zwei Stunden je Schicht, darüber nicht. Beide Füße auf einer Stufe oder Plattform, eine Sprossenleiter ist damit kein Arbeitsplatz. Sonst Podest, Gerüst oder Hubarbeitsbühne" },
      { id: "p7", label: "Aufstellung im Verkehrsraum nur mit Absicherung, Aufstellung vor Türen nur mit Sicherung gegen Öffnen" },
      { id: "p8", label: "Transport und Lagerung, Sicherung auf dem Fahrzeug" },
    ],
  },
  {
    id: "akku-handmaschinen",
    nr: 15,
    label: "Akku-Handmaschinen",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Akkusystem" },
    ],
    voraussetzungen: [],
    inhalte: [
      { id: "p1", label: "Einsatzwerkzeug passend zur Maschine und zum Material, feste Aufnahme, Zusatzhandgriff verwenden" },
      { id: "p2", label: "Blockieren des Werkzeugs und Rückschlag der Maschine, Handhaltung und Körperstellung" },
      { id: "p3", label: "Werkstück sichern, nicht in der Hand halten, Späne nicht mit der Hand entfernen" },
      { id: "p4", label: "Beim Winkelschleifer: Schutzhaube nie abnehmen, Scheibe passend zum Material, Ablaufdatum der Scheibe beachten, Funkenflug von Kraftstoff und trockenem Material fernhalten" },
      { id: "p5", label: "Schutzausrüstung: Schutzbrille, bei Trennarbeiten zusätzlich Gehörschutz und Atemschutz" },
      { id: "p6", label: "Akku entnehmen vor jedem Werkzeugwechsel und vor jeder Störungsbeseitigung" },
      { id: "p7", label: "Umgang mit Lithium-Akkus: Lagerung, Transport, Verhalten bei Beschädigung oder Erwärmung, kein Laden in unbeaufsichtigten Räumen mit brennbarem Material" },
    ],
  },
  {
    id: "psa-absturz",
    nr: 16,
    label: "Persönliche Schutzausrüstung gegen Absturz und Kletterausrüstung",
    // Zusaetzliche Kopfdaten, die es nur bei diesem Geraet gibt.
    kopfFelder: [
      { id: "k1", label: "Serien-Nr. / Herstelldatum" },
      { id: "k2", label: "Ablegereife spätestens" },
      { id: "k3", label: "letzte Prüfung durch befähigte Person" },
    ],
    // Ohne diese Nachweise darf gar nicht erst eingewiesen werden.
    voraussetzungen: [
      { id: "v1", label: "Qualifikation Seilklettertechnik (SKT-A, für Motorsägenarbeit im Baum SKT-B) oder anerkannt gleichwertig.Stelle: ______________________ Datum: ____________" },
      { id: "v2", label: "Gültige Höhentauglichkeit nach G 41. Datum: ____________ gültig bis: ____________" },
      { id: "v3", label: "Eine zweite rettungsfähige und kletterqualifizierte Person steht für Einsätze zur Verfügung. Solange dies nicht der Fall ist, wird im Betrieb nicht in Seilklettertechnik gearbeitet." },
    ],
    inhalte: [
      { id: "p1", label: "Anlegen und Einstellen des Gurtes, Kontrolle vor jedem Aufstieg, Sitz der Beinschlaufen" },
      { id: "p2", label: "Sichtprüfung durch die benutzende Person: Nähte, Bandmaterial, Seilmantel, Karabiner, Schraubverschlüsse" },
      { id: "p3", label: "Ablegereife und ihre Kriterien, Umgang mit Ausrüstung nach Sturzbelastung, sofortiger Entzug aus der Benutzung" },
      { id: "p4", label: "Kantenbelastung, Kantenschutz, Führung des Seils über Astgabeln" },
      { id: "p5", label: "Rettung aus dem Baum: Rettungsset, Ablauf, Zeitrahmen, Hängetrauma, jährliche Rettungsübung" },
      { id: "p6", label: "Lagerung und Transport: trocken, dunkel, getrennt von Kraftstoff, Öl und scharfen Gegenständen" },
      { id: "p7", label: "Dokumentation der jährlichen Prüfung durch eine befähigte Person, geführt getrennt von diesem Protokoll" },
    ],
  },
];

// Beide Haken sind Pflicht, bevor unterschrieben werden kann. Vorführen allein
// genügt nicht — die eingewiesene Person muss es selbst gemacht haben.
export const EINWEISUNG_PRAXIS = [
  { id: "vorgefuehrt", label: "Die Handhabung wurde vorgeführt." },
  { id: "nachvollzogen", label: "Die eingewiesene Person hat die wesentlichen Handgriffe selbst ausgeführt." },
];

export const EINWEISUNG_BESTAETIGUNG =
  "Die eingewiesene Person bestätigt, die Inhalte verstanden zu haben und das Gerät nur im " +
  "beschriebenen Rahmen zu benutzen. Bei Unklarheiten oder Auffälligkeiten am Gerät wird die " +
  "Arbeit unterbrochen und Rücksprache gehalten.";

export const EINWEISUNG_RECHTSBEZUG =
  "§ 12 Abs. 1 BetrSichV (Unterweisung vor erstmaliger Verwendung, danach mindestens jährlich, " +
  "Datum und Namen schriftlich festhalten) · § 12 Abs. 1 ArbSchG · § 4 Abs. 1 DGUV Vorschrift 1 · " +
  "§ 29 Abs. 2 JArbSchG (Jugendliche halbjährlich). Die Einweisung ersetzt weder einen " +
  "erforderlichen Lehrgang noch die wiederkehrende Prüfung durch eine befähigte Person " +
  "(§§ 3, 14 BetrSichV).";
