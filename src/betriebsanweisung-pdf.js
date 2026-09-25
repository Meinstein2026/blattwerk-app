// PDF-Erzeugung für die Betriebsanweisung Seilklettertechnik und für den
// Unterweisungsnachweis. Aufbau bewusst wie gbu-pdf.js/einweisung-pdf.js:
// clientseitig, jsPDF lazy geladen (offline nutzbar), in Node testbar.
//
// buildBetriebsanweisungPdf: die Anweisung selbst — Kopf, die sechs
// Abschnitte (b09.txt/vsg42.txt, siehe betriebsanweisung-data.js), am Ende
// ein Kenntnisnahme-Block mit LEEREN Zeilen zum Ausdrucken und von Hand
// Unterschreiben (Name, Datum, Unterschrift) — der Betrieb hat aktuell keine
// Beschäftigten, nur Gesellschafter; sobald jemand dazukommt (Aushilfe,
// Angestellte/r), unterschreibt er/sie hier auf dem Ausdruck, bis die
// digitale Unterweisung (buildUnterweisungPdf) nachgezogen ist.
//
// buildUnterweisungPdf: der Nachweis EINER Unterweisung — zwei Unterschriften
// (unterwiesene + unterweisende Person), wie beim Einweisungsprotokoll
// (einweisung-pdf.js). Getrennt von der Anweisung selbst: die Anweisung
// bleibt gleich, die Unterweisungsnachweise sammeln sich additiv an.
import { BA_ABSCHNITTE_IDS, BA_ABSCHNITT_TITEL, BA_AUSRUESTUNG_NORMEN, baBetriebKopf, BA_NOTRUF_STANDARD, BA_UNTERNEHMER_ERKLAERUNG, BA_QUELLE } from "./betriebsanweisung-data.js";
import { baArt } from "./betriebsanweisung.js";
import { ewFaelligAm } from "./arbeitsschutz.js";

const deDatum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "—");
};

function neuesDokument() {
  return import("jspdf").then(({ jsPDF }) => new jsPDF({ unit: "pt", format: "a4" }));
}

/** Liefert Base64 ohne Data-URL-Präfix. */
export async function buildBetriebsanweisungPdf(ba) {
  const doc = await neuesDokument();
  const W = 595.28, H = 841.89, M = 38, CW = W - 2 * M, UNTEN = H - 24;
  let y = 0;
  const GREEN = [46, 125, 50], GRAY = [110, 118, 129], DARK = [25, 30, 36];

  // `need` ist grundsaetzlich eine ECHTE Hoehe (aus splitTextToSize berechnet,
  // nicht geschaetzt) — sonst bricht der Umbruch mitten in einer Liste um,
  // weil die Schaetzung zu knapp war.
  const pageBreak = (need = 40) => { if (y + need > UNTEN) { doc.addPage(); y = M; return true; } return false; };

  // ── Bausteine: JEDER Baustein kennt seine eigene, vorher gemessene Höhe
  // und eine reine Zeichenfunktion. `block(...teile)` summiert die Höhen,
  // bricht EINMAL um (nie zwischen den Teilen) und zeichnet erst danach —
  // damit ein Abschnittstitel nie ohne seinen Inhalt auf der Seite hängen
  // bleibt und eine Liste nie in der Mitte auseinandergerissen wird.
  //
  // Nachbesserung 18.09.2026 (Sichtprüfung): die Trennlinie unter jedem
  // Abschnittstitel schnitt durch die Oberlängen der ersten Textzeile
  // darunter. Gemessen im Content-Stream (Anwendungsbereich, SKT A):
  // Titel-Td bei y=741.39, Linie bei y=735.89 (5.5pt darunter), nächste
  // Zeile (Schriftgröße 8.7) bei Td y=729.89 — nur 6.0pt Abstand zur Linie.
  // Helveticas Oberlänge liegt laut AFM bei 718/1000 em, bei 8,7pt also
  // ≈ 6,25pt — mehr als die vorhandenen 6,0pt, die Linie lag also IN der
  // Oberlänge. Der Abstand war ein fester Wert (unabhängig von der
  // Schriftgröße des folgenden Inhalts); jetzt wird er aus ihr berechnet.
  const HELVETICA_OBERLAENGE = 0.718; // AFM-Wert, siehe oben
  const abstandNachLinie = (inhaltGroesse) => inhaltGroesse * HELVETICA_OBERLAENGE + 2; // 2pt Sicherheitsspanne
  const ABSCHNITT_KOPF_HOEHE = 4 /* Abstand vor dem Titel */ + 10.5 /* Titelzeile + Linie */;
  const titel = (str, inhaltGroesse = 8.7) => {
    const abstand = abstandNachLinie(inhaltGroesse);
    return {
      hoehe: ABSCHNITT_KOPF_HOEHE + abstand,
      zeichnen: () => {
        y += 4;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...GREEN);
        doc.text(str.toUpperCase(), M, y); y += 10.5;
        doc.setDrawColor(...GREEN); doc.line(M, y - 5, W - M, y - 5);
        y += abstand - 5; // Gesamtabstand Linie -> nächste Textgrundlinie = abstand
      },
    };
  };
  const absatz = (str, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size || 8.7);
    const lines = doc.splitTextToSize(String(str || ""), opts.width || CW);
    const lh = opts.lh || 10.2;
    return {
      hoehe: lines.length * lh,
      zeichnen: () => {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size || 8.7);
        doc.setTextColor(...(opts.color || DARK));
        doc.text(lines, M, y); y += lines.length * lh;
      },
    };
  };
  const zeile = (str, opts = {}) => {
    const lh = opts.lh || 10;
    return {
      hoehe: lh,
      zeichnen: () => {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size || 8.2);
        doc.setTextColor(...(opts.color || DARK));
        doc.text(str, M, y); y += lh;
      },
    };
  };
  // Zweispaltig, weil die Vorschrift selbst (b09.txt) Gefahren und
  // Schutzmaßnahmen zweispaltig auf dem Papier führt — bei mehr als einer
  // Handvoll Punkten (v. a. SKT B) sonst kaum auf einer Seite unterzubringen.
  const ZEILE = 8.8;
  const bullets = (liste, spalten = 1) => {
    if (!Array.isArray(liste) || !liste.length) return { hoehe: 0, zeichnen: () => {} };
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.2);
    if (spalten === 1) {
      const gezeilt = liste.map((b) => doc.splitTextToSize(`•  ${b}`, CW));
      return {
        hoehe: gezeilt.reduce((s, l) => s + l.length * ZEILE, 0),
        zeichnen: () => {
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.setTextColor(...DARK);
          for (const lines of gezeilt) { doc.text(lines, M, y); y += lines.length * ZEILE; }
        },
      };
    }
    const halb = Math.ceil(liste.length / 2);
    const spalteBreite = (CW - 12) / 2;
    const linksZ = liste.slice(0, halb).map((b) => doc.splitTextToSize(`•  ${b}`, spalteBreite));
    const rechtsZ = liste.slice(halb).map((b) => doc.splitTextToSize(`•  ${b}`, spalteBreite));
    const hoeheVon = (zz) => zz.reduce((s, l) => s + l.length * ZEILE, 0);
    return {
      hoehe: Math.max(hoeheVon(linksZ), hoeheVon(rechtsZ)),
      zeichnen: () => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.setTextColor(...DARK);
        const col = (gezeilt, x) => {
          let yy = y;
          for (const lines of gezeilt) { doc.text(lines, x, yy); yy += lines.length * ZEILE; }
          return yy;
        };
        const y1 = col(linksZ, M);
        const y2 = col(rechtsZ, M + spalteBreite + 12);
        y = Math.max(y1, y2);
      },
    };
  };
  /** Ein oder mehrere Bausteine als EINE Einheit umbrechen und zeichnen. */
  const block = (...teile) => {
    pageBreak(teile.reduce((s, t) => s + t.hoehe, 0));
    for (const t of teile) t.zeichnen();
  };

  // ── Kopf — Höhe wird aus den tatsächlich umgebrochenen Zeilen berechnet,
  // NICHT fest vorgegeben: ein langer Einsatzort oder eine lange
  // Quellenangabe darf nie rechts vom Blatt abgeschnitten werden (genau der
  // Fehler, der im GBU-PDF schon einmal drin war). Deshalb erst messen,
  // dann das grüne Feld in der passenden Höhe zeichnen, dann schreiben.
  const messen = (str, size, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    return doc.splitTextToSize(String(str), CW);
  };
  const kopfTeile = [
    { zeilen: messen("Betriebsanweisung", 14, true), size: 14, bold: true, lh: 16 },
    { zeilen: messen(ba.titel || "", 10.5, true), size: 10.5, bold: true, lh: 12.5 },
    { zeilen: messen(ba.betrieb || baBetriebKopf(), 8, false), size: 8, bold: false, lh: 10 },
    { zeilen: messen(`Nach Arbeitsschutzgesetz und Unfallverhütungsvorschriften VSG 4.2 · ${BA_QUELLE}`, 8, false), size: 8, bold: false, lh: 10 },
    { zeilen: messen(`Einsatzort: ${ba.einsatzort || "—"}  ·  Datum: ${deDatum(ba.erstelltAm)}`, 8, false), size: 8, bold: false, lh: 10 },
  ];
  const KOPF_POLSTER = 9;
  const kopfHoehe = KOPF_POLSTER * 2 + kopfTeile.reduce((s, t) => s + t.zeilen.length * t.lh, 0);
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, kopfHoehe, "F");
  doc.setTextColor(255, 255, 255);
  let ky = KOPF_POLSTER + kopfTeile[0].size * 0.8;
  for (const t of kopfTeile) {
    doc.setFont("helvetica", t.bold ? "bold" : "normal"); doc.setFontSize(t.size);
    for (const ln of t.zeilen) { doc.text(ln, M, ky); ky += t.lh; }
  }
  y = kopfHoehe + 10;

  // ── Jede abschnitt()-Liste ist mit ihrem Titel EIN Baustein (block()) —
  // ein Umbruch kann darum nur zwischen zwei Abschnitten liegen, nie einen
  // Titel von seinem Inhalt trennen oder eine Liste mitten durchschneiden.

  // Anwendungsbereich
  block(titel(BA_ABSCHNITT_TITEL.anwendungsbereich, 8.7), absatz(ba.abschnitte?.anwendungsbereich || ""));

  // Gefahren
  block(titel(BA_ABSCHNITT_TITEL.gefahren, 8.2), bullets(ba.abschnitte?.gefahren, 2));

  // Schutzmaßnahmen
  block(titel(BA_ABSCHNITT_TITEL.schutzmassnahmen, 8.2), bullets(ba.abschnitte?.schutzmassnahmen, 2));

  // Verhalten bei Störungen
  block(titel(BA_ABSCHNITT_TITEL.stoerungen, 8.2), bullets(ba.abschnitte?.stoerungen));

  // Verhalten bei Unfällen und Erste Hilfe (samt Ersthelfer/Notruf-Zeile aus der Vorlage)
  block(
    titel(BA_ABSCHNITT_TITEL.erstehilfe, 8.2),
    zeile(`Ersthelfer: ${ba.ersthelfer || "_________________________"}     Notruf: ${ba.notruf || BA_NOTRUF_STANDARD}`, { bold: true, lh: 12 }),
    bullets(ba.abschnitte?.erstehilfe),
  );

  // Instandhaltung und Prüfung + genormte Ausrüstung (VSG 4.2) — ein Block,
  // damit die Ausrüstungsliste nie von ihrer eigenen Überschrift getrennt wird.
  block(
    titel(BA_ABSCHNITT_TITEL.instandhaltung, 8.2),
    bullets(ba.abschnitte?.instandhaltung),
    absatz("Genormte Ausrüstung (VSG 4.2):", { bold: true, size: 8.2, lh: 12 }),
    bullets(BA_AUSRUESTUNG_NORMEN, 2),
  );

  // Erklärung des Erstellers + Unterschriftslinie — ebenfalls ein Block.
  const ERKLAERUNG_UNTERSCHRIFT_HOEHE = 17;
  block(
    absatz(BA_UNTERNEHMER_ERKLAERUNG, { size: 7.8, color: GRAY, lh: 9.2 }),
    {
      hoehe: ERKLAERUNG_UNTERSCHRIFT_HOEHE,
      zeichnen: () => {
        y += 4;
        doc.setDrawColor(...GRAY);
        doc.line(M, y, M + 150, y); doc.line(M + 200, y, M + 400, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text("Datum", M, y + 9);
        doc.text(`Unterschrift der/des Erstellenden${ba.ersteller ? " (" + ba.ersteller + ")" : ""}`, M + 200, y + 9);
        y += 13;
      },
    },
  );

  // ── Kenntnisnahme-Block: leere Zeilen zum Ausdrucken/von Hand
  // unterschreiben. Betrieb hat aktuell keine Beschäftigten — sobald jemand
  // dazukommt, unterschreibt er/sie hier; der digitale Unterweisungsnachweis
  // (buildUnterweisungPdf) ersetzt das, sobald er geführt wird. Ein Baustein
  // wie die anderen: ein Umbruch darf hier nur VOR „Kenntnisnahme" liegen,
  // nie zwischen Kopfzeile und Unterschriftszeilen.
  const KN_ZEILEN = 4, KN_ZEILENHOEHE = 15;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.8);
  const knIntro = doc.splitTextToSize("Ich habe diese Betriebsanweisung zur Kenntnis genommen und wurde in ihren Inhalt unterwiesen.", CW);
  block(titel("Kenntnisnahme", 7.8), {
    hoehe: knIntro.length * 9.2 + 3 + 11 + 3 + KN_ZEILEN * KN_ZEILENHOEHE,
    zeichnen: () => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...GRAY);
      doc.text(knIntro, M, y); y += knIntro.length * 9.2 + 3;
      const spalten = [["Name", M], ["Datum", M + 220], ["Unterschrift", M + 300]];
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      for (const [label, x] of spalten) doc.text(label, x, y);
      y += 3;
      doc.setDrawColor(...GRAY);
      doc.line(M, y, W - M, y);
      for (let i = 0; i < KN_ZEILEN; i++) { y += KN_ZEILENHOEHE; doc.line(M, y, W - M, y); }
    },
  });

  return doc.output("datauristring").split(",")[1];
}

/**
 * Der Nachweis EINER Unterweisung. `record` ist ein Eintrag aus
 * betriebsanweisung.js (baUwEintragen) plus die zwei Unterschriften
 * (sigUnterwiesen, sigUnterweiser) — Datenmodell wie bei buildEinweisungPdf.
 */
export async function buildUnterweisungPdf(record) {
  const doc = await neuesDokument();
  const W = 595.28, M = 42, CW = W - 2 * M;
  let y = 0;
  const GREEN = [46, 125, 50], GRAY = [110, 118, 129], DARK = [25, 30, 36];
  const art = baArt(record.variante) || { label: record.variante };

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
  const haken = (x, yy) => {
    doc.setDrawColor(...GREEN); doc.setLineWidth(1.4);
    doc.line(x + 1.5, yy - 3, x + 3.6, yy - 0.8);
    doc.line(x + 3.6, yy - 0.8, x + 8, yy - 7);
    doc.setLineWidth(1);
  };

  // Kopf-Höhe wird aus den tatsächlich umgebrochenen Zeilen berechnet, nicht
  // fest vorgegeben — ein zu langer Text darf nie rechts vom Blatt
  // abgeschnitten werden (derselbe Fehlertyp wie beim GBU-PDF).
  const messen = (str, size, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    return doc.splitTextToSize(String(str), CW);
  };
  const kopfTeile = [
    { zeilen: messen("Unterweisung Betriebsanweisung Seilklettertechnik", 14, true), size: 14, bold: true, lh: 16 },
    { zeilen: messen(record.betrieb || baBetriebKopf(), 9, false), size: 9, bold: false, lh: 11 },
    { zeilen: messen(
      "Nachweis nach SVLFG-Broschüre B09 („Ort, Zeitpunkt und Inhalt der Unterweisung sind schriftlich niederzulegen und die Teilnahme an der Unterweisung ist von den Unterwiesenen durch Unterschrift zu bestätigen“).",
      7.8, false,
    ), size: 7.8, bold: false, lh: 9.6 },
  ];
  const KOPF_POLSTER = 12;
  const kopfHoehe = KOPF_POLSTER * 2 + kopfTeile.reduce((s, t) => s + t.zeilen.length * t.lh, 0);
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, kopfHoehe, "F");
  doc.setTextColor(255, 255, 255);
  let ky = KOPF_POLSTER + kopfTeile[0].size * 0.8;
  for (const t of kopfTeile) {
    doc.setFont("helvetica", t.bold ? "bold" : "normal"); doc.setFontSize(t.size);
    for (const ln of t.zeilen) { doc.text(ln, M, ky); ky += t.lh; }
  }
  y = kopfHoehe + 18;

  abschnitt("GEGENSTAND UND PERSONEN");
  kv("Betriebsanweisung", art.label);
  kv("Unterwiesene Person", record.name || record.login);
  if (record.jugendlich) kv("Alter", "unter 18 Jahre (Wiederholung halbjährlich, § 29 Abs. 2 JArbSchG)");
  kv("Unterweisende Person", record.einweiser);
  kv("Qualifikation der unterweisenden Person", record.einweiserQualifikation);
  kv("Ort der Unterweisung", record.ort);
  kv("Datum der Unterweisung", deDatum(record.datum));

  abschnitt("INHALT DER UNTERWEISUNG");
  const abschnitte = Array.isArray(record.abschnitte) ? record.abschnitte : [];
  for (const id of BA_ABSCHNITTE_IDS) {
    pageBreak(16);
    const erfuellt = abschnitte.includes(id);
    if (erfuellt) haken(M, y); else doc.rect(M + 1, y - 7, 8, 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(BA_ABSCHNITT_TITEL[id] || id, M + 16, y);
    y += 14;
  }

  if (record.bemerkung) { abschnitt("BEMERKUNG"); text(record.bemerkung, M, { size: 9, lh: 12 }); }

  abschnitt("ERKLÄRUNG");
  text("Die unterwiesene Person bestätigt durch ihre Unterschrift die Teilnahme an dieser Unterweisung.", M, { size: 9, lh: 12 });
  const faellig = ewFaelligAm(record.datum, !!record.jugendlich);
  y += 6;
  text(`Wiederholung der Unterweisung spätestens am: ${deDatum(faellig)}`, M, { size: 10, bold: true });

  y += 12; pageBreak(170);
  text("UNTERSCHRIFTEN", M, { bold: true, size: 9, color: GRAY });
  text(`Ort und Datum: ${record.ort || "—"}, ${deDatum(record.datum)}`, M, { size: 9 });
  y += 4;
  const sigs = [
    { img: record.sigUnterwiesen, name: record.name || record.login, role: "Unterwiesene Person" },
    { img: record.sigUnterweiser, name: record.einweiser || "", role: `Unterweisende Person${record.einweiserQualifikation ? " · " + record.einweiserQualifikation : ""}` },
  ];
  let x = M;
  const sigTop = y;
  for (const s of sigs) {
    const fmt = String(s.img || "").startsWith("data:image/png") ? "PNG" : "JPEG";
    try {
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
  const jetzt = new Date(record.erfasstAm || Date.now());
  pageBreak(14);
  doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(`Erstellt mit der Blattwerk-App am ${jetzt.toLocaleDateString("de-DE")} um ${jetzt.toLocaleTimeString("de-DE")}.`, M, y + 4);

  return doc.output("datauristring").split(",")[1];
}
