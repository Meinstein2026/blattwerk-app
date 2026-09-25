// PDF des Einweisungsprotokolls (§ 12 Abs. 1 BetrSichV). Aufbau bewusst wie
// `gbu-pdf.js`: clientseitig, jsPDF lazy geladen (damit nach dem ersten Laden
// auch offline), in Node testbar.
//
// Das PDF ist der eigentliche Nachweis — die JSON-Ablage traegt nur die
// Fristen. Deshalb steht hier alles drin, was auf dem Papierblatt steht:
// Kopfdaten des Geraets, Voraussetzungen mit Stelle und Datum, jeder einzelne
// Inhaltspunkt, beide Praxis-Bestaetigungen und ZWEI Unterschriften.
import {
  EINWEISUNG_BESTAETIGUNG, EINWEISUNG_PRAXIS, EINWEISUNG_RECHTSBEZUG,
} from "./einweisung-data.js";
import { ewFaelligAm, ewGeraet, ewKopfFelder, ewVoraussetzungen } from "./arbeitsschutz.js";
import { mandantBetrieb } from "./betrieb.js";
import { mandantAusCache } from "./mandant-client.js";

const deDatum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "—");
};

/** Liefert Base64 ohne Data-URL-Präfix. */
export async function buildEinweisungPdf(record) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595.28, M = 42, CW = W - 2 * M;
  let y = 0;
  const GREEN = [46, 125, 50], RED = [201, 42, 42], GRAY = [110, 118, 129], DARK = [25, 30, 36];
  const geraet = ewGeraet(record.geraet) || { label: record.geraet, nr: "", inhalte: [] };
  // Betriebsdaten aus der Mandanten-Konfiguration statt fest im Kopf — gleiches
  // Muster wie gbu-pdf.js (dort per Parameter, hier per mandantAusCache(), weil
  // buildEinweisungPdf nur `record` bekommt).
  const betrieb = mandantBetrieb(mandantAusCache());

  const pageBreak = (need = 40) => { if (y + need > 800) { doc.addPage(); y = M; } };
  const text = (str, x, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(...(opts.color || DARK));
    const lines = doc.splitTextToSize(String(str), opts.width || CW - (x - M));
    for (const ln of lines) { pageBreak(14); doc.text(ln, x, y); y += opts.lh || 13; }
  };
  const abschnitt = (titel) => {
    y += 10; pageBreak(30);
    text(titel, M, { bold: true, size: 9, color: GRAY });
    doc.setDrawColor(...GRAY); doc.line(M, y - 8, W - M, y - 8); y += 2;
  };
  const kv = (k, v) => {
    pageBreak(16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(String(k), M, y);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(String(v ?? "—"), CW - 190);
    doc.text(lines, M + 190, y);
    y += Math.max(13, lines.length * 12);
  };
  // Der Haken ist bewusst gezeichnet und keine Schriftart-Glyphe: jsPDFs
  // Standardschrift hat kein ✓, das käme im PDF als Kästchen an.
  const haken = (x, yy) => {
    doc.setDrawColor(...GREEN); doc.setLineWidth(1.4);
    doc.line(x + 1.5, yy - 3, x + 3.6, yy - 0.8);
    doc.line(x + 3.6, yy - 0.8, x + 8, yy - 7);
    doc.setLineWidth(1);
  };
  const punkt = (label, erfuellt = true) => {
    pageBreak(20);
    const lines = doc.splitTextToSize(String(label), CW - 20);
    if (erfuellt) haken(M, y);
    else { doc.setDrawColor(...RED); doc.rect(M + 1, y - 7, 8, 8); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.setTextColor(...(erfuellt ? DARK : RED));
    doc.text(lines, M + 16, y);
    y += Math.max(13, lines.length * 11.5) + 2;
  };

  // ── Kopf
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 86, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("Einweisung an einem Arbeitsmittel", M, 26);
  doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
  const gewerk = betrieb.gewerk ? `${betrieb.gewerk} ` : "";
  const anschrift = betrieb.anschrift || betrieb.ort || "";
  doc.text(`${gewerk}${betrieb.name || ""} · ${anschrift} · UV-Träger: ${betrieb.uvTraeger || ""}`, M, 43);
  doc.setFontSize(8);
  doc.text("Nachweis nach § 12 Abs. 1 BetrSichV. Die Einweisung ersetzt weder einen erforderlichen Lehrgang noch die", M, 58);
  doc.text("wiederkehrende Prüfung durch eine befähigte Person (§§ 3, 14 BetrSichV).", M, 69);
  y = 106;

  text(`${geraet.nr ? geraet.nr + " – " : ""}${geraet.label}`, M, { bold: true, size: 13 });
  y += 4;

  abschnitt("ANGABEN ZUM ARBEITSMITTEL");
  const kopf = record.kopf || {};
  for (const f of ewKopfFelder(record.geraet)) {
    const v = kopf[f.id];
    kv(f.label, f.typ === "bool" ? (v === true ? "ja" : "nein") : (f.typ === "datum" ? deDatum(v) : v));
  }

  abschnitt("PERSONEN UND DATUM");
  kv("Eingewiesene Person", record.name || record.login);
  if (record.jugendlich) kv("Alter", "unter 18 Jahre (Wiederholung halbjährlich, § 29 Abs. 2 JArbSchG)");
  kv("Einweisende Person", record.einweiser);
  kv("Qualifikation der einweisenden Person", record.einweiserQualifikation);
  kv("Datum der Einweisung", deDatum(record.datum));

  const vDefs = ewVoraussetzungen(record.geraet);
  if (vDefs.length) {
    abschnitt("VORAUSSETZUNGEN, OHNE DIE NICHT EINGEWIESEN WIRD");
    for (const d of vDefs) {
      const w = (record.voraussetzungen || {})[d.id] || {};
      punkt(d.text, w.erfuellt === true);
      for (const f of d.felder) {
        const wert = f.typ === "datum" ? deDatum(w[f.key]) : (w[f.key] || "—");
        pageBreak(14);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
        doc.text(`${f.label}: ${wert}`, M + 16, y); y += 11;
      }
      y += 2;
    }
  }

  abschnitt("INHALTE DER EINWEISUNG");
  for (const i of geraet.inhalte) punkt(i.label, (record.inhalte || {})[i.id] === true);

  abschnitt("PRAKTISCHER TEIL");
  for (const p of EINWEISUNG_PRAXIS) punkt(p.label, (record.praxis || {})[p.id] === true);

  if (record.bemerkung) { abschnitt("BEMERKUNG"); text(record.bemerkung, M, { size: 9, lh: 12 }); }

  abschnitt("ERKLÄRUNG");
  text(EINWEISUNG_BESTAETIGUNG, M, { size: 9, lh: 12 });
  y += 6;
  const faellig = ewFaelligAm(record.datum, !!record.jugendlich);
  text(`Wiederholung der Unterweisung spätestens am: ${deDatum(faellig)}`, M, { size: 10, bold: true });

  // ── Unterschriften: beide sind Pflicht, deshalb keine bedingte Zweitspalte.
  y += 12; pageBreak(170);
  text("UNTERSCHRIFTEN", M, { bold: true, size: 9, color: GRAY });
  const ort = betrieb.ort || "";
  text(`Ort und Datum: ${ort ? ort + ", " : ""}${deDatum(record.datum)}`, M, { size: 9 });
  y += 4;
  const sigs = [
    { img: record.sigEingewiesen, name: record.name || record.login, role: "Eingewiesene Person" },
    { img: record.sigEinweiser, name: record.einweiser || "", role: `Einweisende Person${record.einweiserQualifikation ? " · " + record.einweiserQualifikation : ""}` },
  ];
  let x = M;
  const sigTop = y;
  for (const s of sigs) {
    const fmt = String(s.img || "").startsWith("data:image/png") ? "PNG" : "JPEG";
    try {
      // Seitenverhältnis der Unterschrift erhalten (Box max. 190×90 pt).
      const props = doc.getImageProperties(s.img);
      const scale = Math.min(190 / props.width, 90 / props.height);
      const w = props.width * scale, h = props.height * scale;
      doc.addImage(s.img, fmt, x + (190 - w) / 2, sigTop + (90 - h), w, h);
    } catch (_) {}
    doc.setDrawColor(...GRAY);
    doc.line(x, sigTop + 96, x + 190, sigTop + 96);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(`${s.name} (${s.role})`, 190), x, sigTop + 108);
    x += 230;
  }
  y = sigTop + 140;
  doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  for (const ln of doc.splitTextToSize(EINWEISUNG_RECHTSBEZUG, CW)) { pageBreak(12); doc.text(ln, M, y); y += 10; }
  const jetzt = new Date(record.erfasstAm || Date.now());
  pageBreak(14);
  doc.text(`Erstellt mit der Blattwerk-App am ${jetzt.toLocaleDateString("de-DE")} um ${jetzt.toLocaleTimeString("de-DE")}.`, M, y + 4);

  return doc.output("datauristring").split(",")[1];
}
