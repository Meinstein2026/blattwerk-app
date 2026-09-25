// Etiketten für Betriebsmittel — ein Blatt je Einzelstück (12.09.2026).
//
// Zielgerät ist der SUPVAN T50M Pro: 203 dpi, 384 Punkte auf 48 mm Bahnbreite.
// Jede PDF-Seite ist **genau so groß wie das Etikett**, eine Seite je Stück —
// ein Etikettendrucker zieht keine A4-Bögen.
//
// Aufteilung (Stand 12.09.2026, Ansage Inhaber): **Strichcode quer über die
// ganze Breite, darunter die Seriennummer.** Ein liegendes Etikett klebt sich
// leichter auf Reifen, Akkus und Koffer als ein quadratisches, und daneben
// braucht es keinen Fließtext — wer mehr wissen will, scannt.
//
// Der Strichcode wird als Rechtecke gezeichnet, nicht als Bild: nur so lassen
// sich die Balken auf **ganze Druckerpunkte** legen. Ein gerastertes Bild
// verschmiert die Kanten, und ein verschmierter 0,25-mm-Balken wird nicht mehr
// gelesen.
import { bmEtikett } from "./betriebsmittel.js";
import { code128cBalken, code128cModule } from "./code128.js";

/**
 * Voreinstellung: 30 × 15 mm Endlosetikett (Ansage Inhaber 12.09.2026). Ein
 * liegendes, schmales Etikett klebt sich leichter auf Reifen, Akkus und
 * Koffer — und 30 × 15 ist die schmalste Größe, die der Drucker führt.
 *
 * Bei 30 mm Breite bleiben für ein Modul genau 2 Druckerpunkte (0,25 mm) —
 * das ist die Untergrenze für Thermodruck. Wer breitere Balken will, nimmt
 * eine 40-mm-Rolle: dort sind es 3 Punkte.
 */
export const ETIKETT_GROESSE = { breite: 30, hoehe: 15 };
export const ETIKETT_RAND = 1.5;        // mm — auf dem kleinen Etikett zählt jeder halbe
export const DPI = 203;
const MM_JE_PUNKT = 25.4 / DPI;
const MODUL_MIN_PUNKTE = 2;             // 0,25 mm — die Untergrenze für Thermodruck
const MODUL_MAX_PUNKTE = 4;
const CODE_HOEHE_MIN = 5;               // mm, darunter wird das Zielen mühsam
const ZEILE_HOEHE = 4.2;                // mm Platzbedarf je Textzeile
const CODE_TEXT_ABSTAND = 0.8;          // mm Luft unter den Balken
const TEXT_ANTEIL_MAX = 0.45;           // der Text nimmt nie mehr als 45 % der Höhe
export const ZEILE_MIN_PT = 5.5;        // darunter wird es auf 203 dpi matschig
const ZEILE_MAX_PT = 11;

const punkte = (mm) => mm / MM_JE_PUNKT;
/** Auf ganze Druckerpunkte runden — sonst verschmiert die Kante. */
const aufPunkt = (mm) => Math.round(punkte(mm)) * MM_JE_PUNKT;

/**
 * Passt eine Zeile in die verfügbare Breite ein: erst kleiner setzen, dann
 * kürzen. `messen(text, pt)` liefert die Breite in mm.
 *
 * Das ist kein Schönheitsdetail. jsPDFs `maxWidth` **bricht um**, statt zu
 * kürzen — die Umbruchzeilen wandern nach unten aus dem Etikett heraus und
 * fehlen auf der Rolle einfach. Am 12.09.2026 im gerasterten Probedruck
 * gesehen. Deshalb wird hier gemessen statt Zeichen zu zählen.
 */
export const zeileEinpassen = (text, maxBreite, pt, messen, minPt = ZEILE_MIN_PT) => {
  let t = String(text ?? "");
  let p = pt;
  while (p > minPt && messen(t, p) > maxBreite) p = Math.max(minPt, p - 0.25);
  if (messen(t, p) <= maxBreite) return { text: t, pt: p };
  while (t.length > 1 && messen(`${t.slice(0, -1).trimEnd()}…`, p) > maxBreite) t = t.slice(0, -1);
  return { text: `${t.slice(0, -1).trimEnd()}…`, pt: p };
};

/**
 * Maße eines Etiketts in mm. Rein rechnerisch, ohne jsPDF — damit die
 * Aufteilung prüfbar bleibt.
 *
 * Wirft, wenn der Strichcode selbst mit den schmalsten zulässigen Balken nicht
 * auf die Rolle passt. Lieber hier ein Fehler als eine Rolle voller Etiketten,
 * die kein Scanner liest.
 */
export const etikettPlan = (etikett, groesse = ETIKETT_GROESSE, rand = ETIKETT_RAND) => {
  const code = String(etikett?.code ?? "");
  const innenB = groesse.breite - 2 * rand;
  const innenH = groesse.hoehe - 2 * rand;
  const module = code ? code128cModule(code) : 0;

  // Breiteste Balken, die noch aufs Etikett passen — je breiter, desto sicherer
  // der Scan.
  let modulPunkte = 0;
  if (module) {
    modulPunkte = Math.min(MODUL_MAX_PUNKTE, Math.floor(punkte(innenB) / module));
    if (modulPunkte < MODUL_MIN_PUNKTE) {
      throw new Error(
        `Etikett zu schmal: ${code.length} Ziffern brauchen bei ${groesse.breite} mm mindestens `
        + `${(module * MODUL_MIN_PUNKTE * MM_JE_PUNKT + 2 * rand).toFixed(1)} mm Breite`,
      );
    }
  }
  const codeBreite = module * modulPunkte * MM_JE_PUNKT;
  // Der Text bekommt nur so viel Höhe, wie seine Zeilen brauchen — der Rest
  // gehört den Balken. Ein Etikett ohne Verfallsdatum hat nur eine Zeile, und
  // ein höherer Strichcode lässt sich leichter treffen als ein niedriger mit
  // einem Loch darüber.
  const zeilenZahl = Math.min(2, (etikett?.zeilen || []).length);
  const textBlock = zeilenZahl ? Math.min(innenH * TEXT_ANTEIL_MAX, zeilenZahl * ZEILE_HOEHE + 1) : 0;
  const codeHoehe = Math.max(CODE_HOEHE_MIN, innenH - textBlock);
  const codeX = aufPunkt(rand + (innenB - codeBreite) / 2);

  const zeilen = (etikett?.zeilen || []).slice(0, 2);
  // Ohne Luft stossen die Oberlaengen der Nummer an die Balken — auf 30 x 15 mm
  // sah das im Probedruck aus, als haetten die Balken Fuesse.
  const textOben = rand + codeHoehe + (zeilen.length ? CODE_TEXT_ABSTAND : 0);
  const restH = groesse.hoehe - rand - textOben;
  const schritt = zeilen.length ? restH / zeilen.length : restH;
  const hoehePt = Math.min(ZEILE_MAX_PT, Math.max(ZEILE_MIN_PT, schritt * 2.4));

  return {
    code: { x: codeX, y: rand, breite: codeBreite, hoehe: codeHoehe, modulBreite: modulPunkte * MM_JE_PUNKT, modulPunkte },
    textBreite: innenB,
    zeilen: zeilen.map((text, i) => ({
      text,
      x: groesse.breite / 2,          // zentriert unter dem Code
      y: textOben + schritt * (i + 0.8),
      pt: i === 0 ? hoehePt : Math.max(ZEILE_MIN_PT, hoehePt - 2),
      fett: i === 0,
    })),
  };
};

/** Dateiname für den Stapel. Ein Stück: seine Nummer. Mehrere: Anzahl und Tag. */
export const etikettDateiname = (etiketten, heute) =>
  etiketten.length === 1
    ? `Etikett ${String(etiketten[0].zeilen?.[0] || "Betriebsmittel").replace(/[^\w-]/g, "_")}.pdf`
    : `Etiketten ${etiketten.length} Stueck ${heute}.pdf`;

/** Baut das PDF. jsPDF wird hereingereicht, damit das Modul prüfbar bleibt. */
export async function buildEtikettenPdf(etiketten, { jsPDF, groesse = ETIKETT_GROESSE, rand = ETIKETT_RAND }) {
  if (!Array.isArray(etiketten) || !etiketten.length) throw new Error("Keine Etiketten zu drucken");
  const doc = new jsPDF({ unit: "mm", format: [groesse.breite, groesse.hoehe], orientation: "landscape" });
  for (let i = 0; i < etiketten.length; i++) {
    if (i > 0) doc.addPage([groesse.breite, groesse.hoehe], "landscape");
    const e = etiketten[i];
    const plan = etikettPlan(e, groesse, rand);
    for (const b of code128cBalken(String(e.code))) {
      doc.rect(plan.code.x + b.x * plan.code.modulBreite, plan.code.y,
               b.breite * plan.code.modulBreite, plan.code.hoehe, "F");
    }
    for (const z of plan.zeilen) {
      doc.setFont("helvetica", z.fett ? "bold" : "normal");
      const messen = (t, pt) => { doc.setFontSize(pt); return doc.getTextWidth(t); };
      const ein = zeileEinpassen(z.text, plan.textBreite, z.pt, messen);
      doc.setFontSize(ein.pt);
      doc.text(ein.text, z.x, z.y, { align: "center" });   // kein maxWidth: Umbruch fällt vom Etikett
    }
  }
  return doc;
}

/**
 * Bequemer Weg von Losen zu Etiketten: nimmt die Lose samt Artikel und
 * liefert die Druckvorlagen. Lose ohne Code fliegen mit Meldung raus, statt
 * ein unauflösbares Etikett zu erzeugen.
 */
export const etikettenAusLosen = (lose, produkte, heute) => {
  const nachId = new Map((produkte || []).map((p) => [String(p.id ?? p.rowid), p]));
  const ok = [];
  const fehler = [];
  for (const los of lose || []) {
    try {
      ok.push(bmEtikett(los, nachId.get(String(los.fk_product)), heute));
    } catch (e) {
      fehler.push({ los, grund: e.message });
    }
  }
  return { etiketten: ok, fehler };
};
