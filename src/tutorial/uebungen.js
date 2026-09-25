// Übungsdaten und Prüfungen des Pflicht-Tutorials.
//
import { intern } from "../intern.js";
//
// Bewusst ohne React und ohne jeden Zugriff nach draußen: was hier steht,
// entscheidet, wann eine Übung bestanden ist, und das soll man prüfen können,
// ohne eine Maske zu rendern. Die Masken in Tutorial.jsx rufen ausschließlich
// diese Funktionen auf.
//
// Prüf-Vertrag: null heißt „in Ordnung". Sonst { feld, text } — `feld` ist der
// Schlüssel des Eingabefeldes, damit die Maske genau dort markieren kann, und
// `text` ein ganzer Satz, der sagt, was stattdessen dort stehen soll. Eine
// Meldung, die nur „falsch" sagt, bringt niemandem etwas bei.

/** Erhöhen macht die Übung für ALLE wieder fällig — nach einem Umbau erwünscht. */
// 2 (12.08.2026): Die Zeitbuchung fragt Beginn, Ende und Pause ab statt einer
// Stundenzahl (§ 17 MiLoG). Das ist ein anderer Handgriff, und wer die App schon
// benutzt, hat ihn noch nie gesehen — also für alle noch einmal.
export const TUTORIAL_VERSION = 2;

// ─── Überspringen mit Code ──────────────────────────────────────────────────
// Wer die App schon kennt — beim Vorführen, jemand, der die Übung nach
// einem Fassungswechsel nicht ein zweites Mal braucht — kommt mit diesem Code
// vorbei. Bewusst kein Geheimnis: er steht (via VITE_TUTORIAL_CODE, siehe
// src/intern.js) in der Konfiguration und schützt nichts, er ist eine Hürde
// gegen versehentliches Wegklicken, mehr nicht — der echte Wert ist deshalb
// KEINE Verhaltensänderung wert, nur eine andere Ablage.
//
// **Der Abschluss wird deshalb als „übersprungen" vermerkt, nicht als
// „durchlaufen".** Das Tutorial ist die Einweisung in die App; stünde in
// `tutorial.json` hinterher, jemand habe sie gemacht, wäre das schlicht
// unwahr — und diese Datei ist das Einzige, woran man es später noch sieht.
export const TUTORIAL_CODE = intern("TUTORIAL_CODE", "00000");

/** Prüft die Code-Eingabe. Leerzeichen und Bindestriche sind egal — auf dem
 *  Tablet tippt man das mit dicken Fingern. */
export function tutorialCodeStimmt(eingabe) {
  const sauber = String(eingabe ?? "").replace(/[\s-]/g, "");
  return sauber !== "" && sauber === TUTORIAL_CODE;
}

// ─── Start-Entscheidung ─────────────────────────────────────────────────────
// Ob das Tutorial beim Start erscheint und ob es sperrt, hängt allein von
// diesen drei Werten ab — als reine Funktion, weil genau diese Entscheidung
// vorher ungetestet mitten im Effekt in dolibarr-app.jsx stand (Abschluss-
// prüfung, Befund W6). Der Effekt dort ist seither bloße Verdrahtung: Antwort
// holen, hier fragen, handeln.
//
// Die Regel, die dabei nie brechen darf: „pflicht" nur, wenn der Server
// geantwortet hat UND „noch nicht abgeschlossen" meldet. In jedem anderen
// Fall — kein Login, Server ohne Antwort, Server kennt die Fassung nicht —
// wird angeboten, nicht gesperrt.
/**
 * @param {number} lokaleFassung Fassung, die dieses Gerät für DIESEN Login lokal vermerkt hat (0 = keine).
 * @param {object|null} antwort Antwort von POST /api/nc/tutorial, oder null, wenn der Server nicht geantwortet hat.
 * @param {string} [login] Dolibarr-Login der angemeldeten Person; leer/undefined vor der Anmeldung.
 * @returns {"frei"|"anbieten"|"pflicht"|"nachtragen"}
 */
export function tutorialEntscheidung({ lokaleFassung, antwort, login }) {
  const fertig = (f) => Number(f || 0) >= TUTORIAL_VERSION;
  if (!login) return "anbieten";
  if (antwort) {
    if (fertig(antwort?.abgeschlossen?.[login]?.fassung)) return "frei";
    return fertig(lokaleFassung) ? "nachtragen" : "pflicht";
  }
  return fertig(lokaleFassung) ? "frei" : "anbieten";
}

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** Zusätzlich Umlaute auflösen, damit „ß“/„ss“- bzw. Umlaut-Schreibweisen als gleich gelten. */
const normU = (s) => norm(s)
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** Zahl aus einer Eingabe, Komma wie Punkt. null, wenn es keine ist. */
export const zahl = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/** YYYY-MM-DD um `tage` versetzt. Über UTC, damit keine Sommerzeit dazwischenfunkt. */
export const tagVersetzt = (iso, tage) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
};

/** YYYY-MM-DD → TT.MM.JJJJ */
export const dtDe = (iso) => {
  const [j, m, t] = String(iso).split("-");
  return `${t}.${m}.${j}`;
};

// ─── Übungsdaten (offensichtlich erfunden) ─────────────────────────────────

export const UEBUNG_AUFGABEN = [
  { id: "t1", label: "Musterstraße 12 – Heckenschnitt" },
  { id: "t2", label: "Musterstraße 12 – Baumkontrolle" },
  { id: "t3", label: "Musterweg 5 – Fällung Birke" },
];

export const UEBUNG_GBU_PUNKTE = [
  { id: "psa", label: "PSA vollständig & intakt (Helm, Schnittschutz, Handschuhe, S-Schuhe)" },
  { id: "saege", label: "Motorsäge geprüft (Kettenbremse, Kette, Ölstand)" },
  { id: "rettung", label: "Erste-Hilfe-Material und Rettungskette am Einsatzort" },
];

export const UEBUNG_GBU_MASSNAHMEN = [
  "Gerät getauscht",
  "Mangel behoben",
  "Arbeit verschoben",
  "Arbeitsverfahren geändert",
];

/**
 * Kurze, feste Kontenliste — bewusst NICHT DEFAULT_KONTEN aus der App: die ist
 * je Gerät anpassbar, und eine Übung, die sich mit den Einstellungen ändert,
 * prüft nicht mehr das, was sie prüfen soll.
 */
export const UEBUNG_KONTEN = [
  { number: "4900", label: "ungeklärt" },
  { number: "3400", label: "Wareneingang 19 % (Material, Erde, Dünger)" },
  { number: "4985", label: "Werkzeuge und Kleingeräte (inkl. PSA)" },
];

export const UEBUNG_LIEFERANTEN = [
  { id: "l1", label: "Baumarkt Muster GmbH" },
  { id: "l2", label: "Musterholz Handel KG" },
];

/** Was auf dem gezeichneten Beispielbeleg steht. */
export const UEBUNG_BELEG = {
  lieferant: "Baumarkt Muster GmbH",
  nummer: "RE-2026-0815",
  datum: "2026-08-03",
  beschreibung: "Sägekettenöl 5 l",
  menge: 2,
  preis: 18.9,
  mwst: 19,
};

/**
 * Was der Automat „gelesen" hat: der Preis mit verrutschtem Komma (der
 * häufigste OCR-Fehler auf Thermobons) und das Rückfall-Konto 4900. Genau
 * diese beiden Stellen soll die Übung sichtbar machen.
 */
export const UEBUNG_BELEG_VORBELEGT = {
  lieferant: "",
  nummer: UEBUNG_BELEG.nummer,
  datum: UEBUNG_BELEG.datum,
  beschreibung: UEBUNG_BELEG.beschreibung,
  menge: "2",
  // Punkt, nicht Komma: das Feld ist wie im Original ein type="number", und
  // ein Komma darin zeigt der Browser als LEERES Feld an. Dann sieht die Uebung
  // aus wie „hier fehlt was" statt wie „der Automat hat sich verlesen" — und
  // genau das Verlesen ist der Lehrstoff. Der Automat liefert ohnehin Punkte.
  preis: "1.89",
  mwst: "19",
  konto: "4900",
};

/** Ecken relativ (0..1) — auflösungsunabhängig, damit die Prüfung auf jedem Gerät gleich ist. */
export const UEBUNG_ZUSCHNITT_ZIEL = [
  { x: 0.24, y: 0.10 }, { x: 0.76, y: 0.10 }, { x: 0.78, y: 0.90 }, { x: 0.22, y: 0.90 },
];
export const UEBUNG_ZUSCHNITT_START = [
  { x: 0.03, y: 0.03 }, { x: 0.97, y: 0.03 }, { x: 0.97, y: 0.97 }, { x: 0.03, y: 0.97 },
];
const ECK_NAME = ["oben links", "oben rechts", "unten rechts", "unten links"];

export const UEBUNGEN = [
  {
    id: "zeit",
    titel: "Zeit buchen",
    auftrag: "Gestern hast du bei Mustermann Grünanlagen in der Musterstraße 12 Hecke geschnitten: von 08:00 bis 11:00, dazwischen 30 Minuten Pause. Trage das nach, auf die Aufgabe „Musterstraße 12 – Heckenschnitt“, mit einer kurzen Beschreibung.",
    fertig: "Die Buchung stünde jetzt in Dolibarr am Projekt — und unter „Meine Zeiten“ könntest du sie sofort nachlesen. Beginn, Ende und Pause werden abgefragt, weil § 17 MiLoG genau die verlangt; eine bloße Stundenzahl reicht nicht. Beim Timer gibt es kein Pausenfeld: dort stoppst du für die Pause und startest danach neu.",
  },
  {
    id: "gbu",
    titel: "Gefährdungsbeurteilung",
    auftrag: "Ihr fällt heute eine Birke im Vorgarten am Musterweg 5. Es weht mäßiger Wind, gearbeitet wird vom Boden. Beim Durchsehen der Ausrüstung fällt auf: die Kettenbremse der Motorsäge klemmt. Lege die Beurteilung an, bevor es losgeht.",
    fertig: "Das PDF läge jetzt unterschrieben in Paperless unter „Gefährdungsbeurteilungen“ — und wäre für das ganze Team einsehbar.",
  },
  {
    id: "beleg",
    titel: "Beleg erfassen",
    auftrag: "Du hast beim Baumarkt Muster zwei Kanister Sägekettenöl gekauft. Schneide den Beleg zu und prüfe, was der Automat daraus gelesen hat — er liegt nicht immer richtig.",
    fertig: "Der Beleg läge jetzt als Lieferantenrechnung in Dolibarr, das Foto in Nextcloud — mit einem Buchungskonto, das jemand angeschaut hat statt „ungeklärt“.",
  },
  {
    id: "kundeprojekt",
    titel: "Kunde und Projekt",
    auftrag: "Neue Kundschaft: Mustermann Grünanlagen GmbH, Musterstraße 12, 12345 Musterstadt. Lege sie an und danach das Projekt „Heckenschnitt Musterstraße“, Start morgen um 08:00.",
    fertig: "Kunde und Projekt stünden jetzt in Dolibarr — und das Projekt wäre im Team-Kalender sichtbar.",
  },
];

// ─── Prüfungen ─────────────────────────────────────────────────────────────

export function pruefeZeit(e, heute) {
  const gestern = tagVersetzt(heute, -1);
  if (e.datum !== gestern) {
    return { feld: "datum", text: `Gebucht wird für gestern, also den ${dtDe(gestern)} — im Datumsfeld steht noch etwas anderes.` };
  }
  if (e.von !== "08:00") {
    return { feld: "von", text: "Angefangen wurde um 08:00 — im Feld „Von“ steht noch etwas anderes." };
  }
  if (e.bis !== "11:00") {
    return { feld: "bis", text: "Schluss war um 11:00 — im Feld „Bis“ steht noch etwas anderes." };
  }
  if (zahl(e.pause) !== 30) {
    return { feld: "pause", text: "Im Auftrag stehen 30 Minuten Pause. Die zieht die App von der Arbeitszeit ab, deshalb muss sie stimmen." };
  }
  if (e.aufgabe !== "t1") {
    return { feld: "aufgabe", text: "Hier gehört die Aufgabe „Musterstraße 12 – Heckenschnitt“ hin — auf sie ist die Zeit gebucht worden." };
  }
  if (!norm(e.beschreibung)) {
    return { feld: "beschreibung", text: "Die Beschreibung ist leer. Ohne sie weiß bei der Rechnung niemand mehr, wofür die Zeit draufging." };
  }
  return null;
}

export function pruefeGbu(e) {
  if (!norm(e.einsatzort)) {
    return { feld: "einsatzort", text: "Der Einsatzort fehlt. Er steht im PDF — und im Notruf liest man ihn vor." };
  }
  if (e.wind !== "maessig") {
    return { feld: "wind", text: "Im Auftrag steht mäßiger Wind. Beim Wind ist noch etwas anderes gewählt." };
  }
  if (e.arbeitsart !== "faellung") {
    return { feld: "arbeitsart", text: "Es geht um eine Fällung — die Arbeitsart passt noch nicht." };
  }
  if (!norm(e.baum)) {
    return { feld: "baum", text: "Hier fehlt der Baum: Anzahl, Standort und, wenn bekannt, die Art. Im Auftrag steht eine Birke im Vorgarten." };
  }
  if (!Array.isArray(e.arbeiten) || !e.arbeiten.includes("Fällung")) {
    return { feld: "arbeiten", text: "Bei den durchzuführenden Arbeiten fehlt „Fällung“." };
  }
  if (!e.zugang) {
    return { feld: "zugang", text: "Der Zugang fehlt. Gearbeitet wird laut Auftrag vom Boden." };
  }
  const punkte = e.punkte || {};
  const offen = UEBUNG_GBU_PUNKTE.find((p) => !punkte[p.id]?.wert);
  if (offen) {
    return { feld: "punkt-" + offen.id, text: `Der Punkt „${offen.label}“ ist noch nicht bewertet — OK, Mangel oder n. r.` };
  }
  if (punkte.saege.wert !== "mangel") {
    return { feld: "punkt-saege", text: "Eine klemmende Kettenbremse ist ein Mangel, kein OK. Genau dafür gibt es diesen Punkt." };
  }
  const ohneMassnahme = UEBUNG_GBU_PUNKTE.find(
    (p) => punkte[p.id].wert === "mangel" && !norm(punkte[p.id].massnahme)
  );
  if (ohneMassnahme) {
    return { feld: "massnahme-" + ohneMassnahme.id, text: `Zu „${ohneMassnahme.label}“ fehlt die Maßnahme. Ein Mangel ohne Maßnahme ist nur eine Notiz.` };
  }
  if (!e.unterschrift) {
    return { feld: "unterschrift", text: "Die Unterschrift fehlt. Ohne sie ist die Beurteilung kein Nachweis." };
  }
  return null;
}

/**
 * Zuschnitt: jede Ecke muss nah genug an ihrer Belegkante liegen. Die Toleranz
 * ist großzügig — geübt wird der Handgriff, nicht die Feinmotorik.
 */
export function pruefeZuschnitt(ecken, toleranz = 0.08) {
  if (!Array.isArray(ecken) || ecken.length !== 4) {
    return { feld: "ecke-0", text: "Zieh die vier Ecken auf die Kanten des Belegs." };
  }
  for (let i = 0; i < 4; i++) {
    if (!ecken[i] || typeof ecken[i].x !== "number" || typeof ecken[i].y !== "number") {
      return { feld: "ecke-" + i, text: `Die Ecke ${ECK_NAME[i]} liegt noch nicht auf der Belegkante. Zieh sie dorthin — alles außerhalb wird später weggeschnitten.` };
    }
    const dx = ecken[i].x - UEBUNG_ZUSCHNITT_ZIEL[i].x;
    const dy = ecken[i].y - UEBUNG_ZUSCHNITT_ZIEL[i].y;
    if (Math.hypot(dx, dy) > toleranz) {
      return { feld: "ecke-" + i, text: `Die Ecke ${ECK_NAME[i]} liegt noch nicht auf der Belegkante. Zieh sie dorthin — alles außerhalb wird später weggeschnitten.` };
    }
  }
  return null;
}

export function pruefeBeleg(e) {
  // Nicht nur "irgendein Lieferant gewaehlt" (!e.lieferant), sondern der
  // richtige: auf dem gezeichneten Beleg steht "Baumarkt Muster GmbH" (l1),
  // nicht "Musterholz Handel KG" (l2) — genau das Nachpruefen ist der
  // Lehrstoff dieser Uebung.
  if (e.lieferant !== "l1") {
    return { feld: "lieferant", text: "Der Lieferant fehlt. Ohne ihn kann die Rechnung nicht angelegt werden — auf dem Beleg steht „Baumarkt Muster GmbH“." };
  }
  if (e.datum !== UEBUNG_BELEG.datum) {
    return { feld: "datum", text: `Das Rechnungsdatum stimmt noch nicht. Auf dem Beleg steht der ${dtDe(UEBUNG_BELEG.datum)}.` };
  }
  if (zahl(e.menge) !== UEBUNG_BELEG.menge) {
    return { feld: "menge", text: "Es waren zwei Kanister. Die Menge stimmt noch nicht." };
  }
  if (zahl(e.preis) !== UEBUNG_BELEG.preis) {
    return { feld: "preis", text: "Der Preis stimmt nicht mit dem Beleg überein: dort stehen 18,90 € je Kanister. Beim Lesen verrutscht das Komma öfter — deshalb schaut man drauf." };
  }
  // Erst auf „gar nichts gewaehlt" pruefen, dann auf 4900: ohne den ersten
  // Zweig gilt die Uebung als bestanden, wenn das Feld leer ist — und leer ist
  // genau das, was ein nicht angefasstes Auswahlfeld liefern kann.
  if (!e.konto) {
    return { feld: "konto", text: "Es ist noch kein Buchungskonto gewählt. Ohne eines bleibt der Beleg in der Buchhaltung liegen." };
  }
  if (String(e.konto) === "4900") {
    return { feld: "konto", text: "Das Buchungskonto steht noch auf „4900 · ungeklärt“ — so hat es der Automat eingetragen, weil er es nicht erkannt hat. Bleibt es stehen, muss es die Buchhaltung von Hand nachtragen." };
  }
  return null;
}

export function pruefeKunde(e) {
  if (!normU(e.name).includes("mustermann")) {
    return { feld: "name", text: "Der Name stimmt noch nicht — im Auftrag steht „Mustermann Grünanlagen GmbH“." };
  }
  const adr = normU(e.adresse);
  // Hausnummer mit Wortgrenzen: ein blosses includes("12") nimmt auch die 512
  // und die 120 an — also genau die Tippfehler, die es zu finden gilt.
  if (!adr.includes("musterstr") || !/\b12\b/.test(adr)) {
    return { feld: "adresse", text: "In der Adresse fehlt etwas: „Musterstraße 12“, mit Hausnummer." };
  }
  if (String(e.plz).trim() !== "12345") {
    return { feld: "plz", text: "Die PLZ stimmt noch nicht — im Auftrag steht 12345." };
  }
  if (!normU(e.ort).includes("musterstadt")) {
    return { feld: "ort", text: "Der Ort stimmt noch nicht — im Auftrag steht Musterstadt." };
  }
  return null;
}

export function pruefeProjekt(e, heute) {
  const morgen = tagVersetzt(heute, 1);
  if (!normU(e.titel).includes("heckenschnitt")) {
    return { feld: "titel", text: "Im Titel fehlt, worum es geht — im Auftrag steht „Heckenschnitt Musterstraße“." };
  }
  if (!e.kunde) {
    return { feld: "kunde", text: "Der Kunde fehlt. Ohne ihn taucht das Projekt in keiner Kundenakte auf." };
  }
  if (e.dateStart !== morgen) {
    return { feld: "dateStart", text: `Losgehen soll es morgen, also am ${dtDe(morgen)}.` };
  }
  if (e.timeStart !== "08:00") {
    return { feld: "timeStart", text: "Die Startzeit stimmt noch nicht — im Auftrag steht 08:00." };
  }
  return null;
}
