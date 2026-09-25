// src/qualifikationen-data.js
// Fortbildungen und Qualifikationen je Person — der Katalog (16.09.2026,
// erweitert um Kletter-/Saegeabschluesse 18.09.2026, Task 12).
//
// Rang: wer bei der Gefaehrdungsbeurteilung die Aufsicht fuehrt, entscheidet
// sich nach der hoechsten GUELTIGEN Qualifikation. 0 = keine Aufsichtsrolle
// (Ersthelfer, G 41, Baumkontrolleur, PSA-Sachkunde sind Fortbildungen mit
// Frist, keine Rangstufen; ebenso ETW/ETT/Fachagrarwirt seit Task 12 —
// Begruendung bei den einzelnen Eintraegen unten).
//
// Es gibt bewusst nur ZWEI Saegestufen (AS Baum I und AS Baum II) — ein
// "AS Baum III" wurde am 18.09.2026 recherchiert und wieder verworfen
// (Entscheidung Inhaber, Fix-Runde Task 12): DGUV Information 214-059
// "Ausbildung fuer Arbeiten mit der Motorsaege und die Durchfuehrung von
// Baumarbeiten" (https://publikationen.dguv.de/widgets/pdf/download/article/1296,
// per pdftotext selbst durchsucht) kennt nur Modul A+B (marktueblich
// "AS Baum I", Motorsaege am Boden/Faellung) und Modul C+D (marktueblich
// "AS Baum II", Motorsaege aus dem Arbeitskorb/Hubarbeitsbuehne) — keine
// dritte Stufe. Auch bei rund 15 Ausbildungsanbietern (grundfaellschnitt.de,
// kettensaegenausbildung.de, motorsaegenkurs-nrw.de, TUEV NORD, DEULA,
// SVLFG-Lehrgangsliste u. a.) kein Treffer. Siehe auch
// test/qualifikationen/logik.test.js. Vor einer Wiedereinfuehrung: erst eine
// echte Quelle dafuer finden, nicht aus dieser Recherche wiederholen.
// monate: Standard-Gueltigkeit ab „seit"; null = unbefristet. Das Formular
// belegt „gueltig bis" damit vor, der Wert auf der Bescheinigung geht vor.
// IDs sind Kennungen im Store und in Kalender-UIDs — nie umbenennen, sonst
// verlieren bestehende Eintraege ihre Art.
export const QUALI_ARTEN = [
  { id: "skt-b", label: "SKT B (DGUV I 214-046)", rang: 100, monate: null, hinweis: "unbefristet, Auffrischung empfohlen" },
  { id: "skt-a", label: "SKT A", rang: 90, monate: null, hinweis: "unbefristet" },
  { id: "as-baum-2", label: "AS Baum II (Motorsäge im Baum)", rang: 60, monate: null, hinweis: "unbefristet" },
  { id: "as-baum-1", label: "AS Baum I (Motorsäge Boden)", rang: 50, monate: null, hinweis: "unbefristet" },
  { id: "hubarbeitsbuehne", label: "Bedienberechtigung Hubarbeitsbühne", rang: 40, monate: null, hinweis: "unbefristet" },
  { id: "erste-hilfe", label: "Ersthelfer (DGUV G 304-001)", rang: 0, monate: 24, hinweis: "Fortbildung alle 24 Monate" },
  { id: "g41", label: "Eignungsuntersuchung G 41", rang: 0, monate: 36, hinweis: "Ablauf laut Bescheinigung" },
  { id: "baumkontrolleur", label: "FLL-zertifizierter Baumkontrolleur", rang: 0, monate: 36, hinweis: "Rezertifizierung alle 36 Monate" },
  { id: "psa-sachkunde", label: "Sachkunde PSA gegen Absturz", rang: 0, monate: 12, hinweis: "jährlich" },

  // Kletter- und Saegequalifikationen (Task 12, 18.09.2026) — ans Ende
  // angehaengt: QualifikationenTab.jsx nimmt QUALI_ARTEN[0] als Formular-
  // Vorbelegung, ein Voranstellen haette Blattwerks Standardauswahl (SKT B)
  // stillschweigend geaendert.
  //
  // Alle drei bekommen bewusst rang: 0 — sie fliessen NICHT in qualHoechste/
  // qualAufsicht ein. Begruendung (belegt, siehe unten): ETW verlangt zur
  // Zulassung bereits ein gueltiges SKT-B (Climber) bzw. AS Baum II
  // (Platformer) — wer ETW hat, hat also ohnehin einen eigenen SKT-/AS-Baum-
  // Eintrag, der die Aufsicht schon regelt. ETT baut auf ETW auf, der
  // Fachagrarwirt ist fachlich gleichwertig zum ETT (Quellen unten) — beide
  // sind Fuehrungs-/Beratungsqualifikationen, kein Nachweis ueber eine
  // AKTUELL gueltige Klettertechnik vor Ort. Eine eigene Aufsichtsrolle ueber
  // diese Titel wuerde sonst genau die Luecke oeffnen, vor der Task 12 warnt:
  // jemand koennte allein durch einen Fachagrarwirt-Abschluss als „darf
  // Aufsicht fuehren" erscheinen, ohne dass eine gueltige SKT-Eintragung
  // dahintersteht.
  {
    id: "etw", label: "European Tree Worker (ETW)", rang: 0, monate: 36,
    hinweis: "Zertifizierung durch den European Arboricultural Council (EAC), gültig 3 Jahre. Rezertifizierung: " +
      "mind. 24 Monate Baumpflege-Tätigkeit in den letzten 36 Monaten + Erste-Hilfe (≤ 2 Jahre) + gültige " +
      "arbeitsmed. Vorsorge (G41, Platformer zusätzlich G25) + 30 Std. Fortbildung/36 Monate. " +
      "Quelle: etc-info.eu/etw-rezertifizierung. Zulassung zur Prüfung (Climber) verlangt bereits ein gültiges " +
      "SKT-B — deshalb hier ohne eigenen Aufsichtsrang.",
  },
  {
    id: "ett", label: "European Tree Technician (ETT)", rang: 0, monate: 36,
    hinweis: "Aufbau auf ETW (EAC), Zulassung ab ETW-Abschluss + 3 Jahre Berufserfahrung. Bis Ende 2024 " +
      "unbefristet — seit 2025 (EAC-Beschluss) ebenfalls alle 3 Jahre zu rezertifizieren (15 Std. Fortbildung " +
      "pro Jahr), Bestandszertifikate vor 2022 laufen zum 31.12.2025 ab. Quelle: flaechenmanager.com „Ab 2025 " +
      "muss auch der ETT alle drei Jahre rezertifiziert werden“. Fachlich gleichwertig zum Fachagrarwirt " +
      "Baumpflege, mittleres Management — kein eigener Aufsichtsrang (siehe ETW).",
  },
  {
    id: "fachagrarwirt", label: "Fachagrarwirt Baumpflege und Baumsanierung", rang: 0, monate: null,
    hinweis: "Staatlich anerkannte Aufstiegsfortbildung (Bachelor Professional Baumpflege), kein bekannter " +
      "Rezertifizierungszyklus — unbefristet wie ein Berufsabschluss. Fachlich gleichwertig zum ETT " +
      "(baumpflegeverband.de), qualifiziert für Führungspositionen — kein eigener Aufsichtsrang (siehe ETW).",
  },
];

/** Seilklettertechnik — beide Stufen zaehlen fuer „SKT vor Ort". */
export const QUALI_SKT = ["skt-a", "skt-b"];
/** Motorsaege — AS Baum II setzt AS Baum I voraus, zaehlt also mit. */
export const QUALI_AS_BAUM = ["as-baum-1", "as-baum-2"];

// Hier statt in qualifikationen.js, damit src/funktionen.js sie ohne Zyklus
// importieren kann (qualifikationen.js -> mandant.js -> funktionen.js waere
// sonst ein Kreis; qualifikationen-data.js importiert nichts). qualifikationen.js
// reicht die Konstante unveraendert weiter.
/** Die fuenf Extrafields am Dolibarr-Benutzer — angelegt von scripts/quali-extrafields.mjs. */
export const QUALI_DOLIBARR_EXTRAFELDER = [
  { name: "quali_skt", label: "SKT-Stufe", type: "varchar", size: "2" },
  { name: "quali_skt_seit", label: "SKT seit", type: "date", size: "" },
  { name: "quali_as_baum", label: "AS Baum", type: "varchar", size: "2" },
  { name: "quali_erste_hilfe_bis", label: "Ersthelfer gültig bis", type: "date", size: "" },
  { name: "quali_json", label: "Qualifikationen (JSON)", type: "text", size: "" },
];
