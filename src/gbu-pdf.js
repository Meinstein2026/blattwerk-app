// PDF-Erzeugung für die Vor-Ort-Gefährdungsbeurteilung. Läuft clientseitig
// (jsPDF lazy geladen → nach erstem Laden auch offline) und in Node testbar.
import { composeChecklist, composeFormular, gbuArbeitsart, gbuZugang, gbuEinsatzKategorien, gbuUmfangText, GBU_HINTS } from "./gbu-data.js";
import { wetterZeile } from "./gbu-automatik.js";
import { sha256Hex } from "./paperless.js";

export const GBU_STATUS_LABEL = { ok: "OK", mangel: "MANGEL", nr: "n. r." };

// Liefert Base64 ohne Data-URL-Präfix. `betrieb` (Firma, Ort, UV-Träger,
// Nummer der Grund-GBU) kommt vom Aufrufer statt hier fest zu stehen — eine
// fremde Instanz darf im eigenen Nachweis nicht Blattwerks Betriebsdaten
// tragen. Der Aufrufer (dolibarr-app.jsx) speist die Werte aus useMandant().
function betriebKopf(betrieb) {
  const firma = betrieb?.name || "";
  // Klare Absage statt eines Dokuments, das aussieht, als waere es gueltig:
  // ohne Firmenname wuerde die Kopfzeile "· <Ort> · UV-Träger: <…>" lauten —
  // ein Nachweis nach §§ 5, 6 ArbSchG ohne erkennbaren Betrieb ist keine
  // gueltige Gefährdungsbeurteilung. Heute erreicht kein Aufrufer in der App
  // diesen Zweig (dolibarr-app.jsx speist betrieb.name immer aus
  // mandantBetrieb(), die selbst einen Blattwerk-Fallback hat), aber
  // buildGbuPdf ist exportiert — ein kuenftiger Aufrufer soll einen Fehler
  // bekommen, keine leise falsche Urkunde.
  if (!firma.trim()) {
    throw new Error("buildGbuPdf: betrieb.name fehlt — ohne Firmenname wird keine Gefährdungsbeurteilung erzeugt.");
  }
  // anschrift faellt auf ort zurueck: ein Mandant, der nur den Ort hinterlegt
  // (mandant.ort, z. B. fuer Topbar/Login), aber keine eigene Anschrift fuers
  // GBU-Nachweis, bekommt wenigstens den Ort statt einer leeren Kopfzeile.
  const ort = betrieb?.anschrift || betrieb?.ort || "";
  const uv = betrieb?.uvTraeger || "";
  const grundGbu = betrieb?.grundGbu || "";
  const gewerk = betrieb?.gewerk ? `${betrieb.gewerk} ` : "";
  const appName = betrieb?.appName || "";
  return { firma, ort, uv, grundGbu, gewerk, appName };
}

async function zeichneV2(doc, record, { firma, ort, uv, grundGbu, gewerk, appName }) {
  const W = 595.28, M = 42, CW = W - 2 * M;
  let y = 0;
  const GREEN = [46, 125, 50], RED = [201, 42, 42], GRAY = [110, 118, 129], DARK = [25, 30, 36];

  const pageBreak = (need = 40) => {
    if (y + need > 800) { doc.addPage(); y = M; }
  };
  const text = (str, x, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(...(opts.color || DARK));
    const lines = doc.splitTextToSize(String(str), opts.width || CW - (x - M));
    for (const ln of lines) { pageBreak(14); doc.text(ln, x, y); y += opts.lh || 13; }
  };

  // Kopf mit Betriebsdaten und Rechtsgrundlage
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 86, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("Gefährdungsbeurteilung Einsatzort", M, 26);
  doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
  doc.text(`${gewerk}${firma} · ${ort} · UV-Träger: ${uv}`, M, 43);
  doc.setFontSize(8);
  doc.text("Arbeitstägliche Beurteilung vor Arbeitsbeginn nach §§ 5, 6 ArbSchG i. V. m. den SVLFG-Vorschriften (VSG).", M, 58);
  // Verweis auf die Grundbeurteilung: fuer Blattwerk (kein eigener grundGbu-
  // Wert hinterlegt) bleibt die bisherige feste Fassungsangabe stehen —
  // Fassung 2 vom 07.08.2026 hat die vom 29.06.2026 abgeloest, ein
  // veraltetes Datum wuerde auf eine Unterlage verweisen, die es so nicht
  // mehr gibt. Ein Mandant mit eigener betrieb.grundGbu-Kennung bekommt
  // stattdessen genau diese Kennung im Verweis.
  const grundGbuVerweis = grundGbu || "Fassung 2 vom 07.08.2026";
  doc.text(`Ergänzt den tätigkeitsbezogenen Grundlagenteil der Gefährdungsbeurteilung des Betriebs (${grundGbuVerweis}) sowie die SVLFG-Vorlage GBU-W-C006 Seilklettertechnik.`, M, 69);
  y = 106;

  const d = new Date(record.createdAt);
  const kategorien = gbuEinsatzKategorien(record.arbeitsart, record.zugang);
  const dauer = (record.dauerVon || record.dauerBis)
    ? `von ${record.dauerVon || "—"} bis ${record.dauerBis || "—"} Uhr` : "";
  const arbeiten = [
    ...(record.arbeiten || []),
    ...(record.arbeitenSonstiges ? [`Sonstiges: ${record.arbeitenSonstiges}`] : []),
  ].join(", ");
  const meta = [
    ["Datum / Uhrzeit", d.toLocaleDateString("de-DE") + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr"],
    ...(dauer ? [["Dauer", dauer]] : []),
    ...(kategorien.length ? [["Einsatzart", kategorien.join(" · ")]] : []),
    ["Durchführende(r)", record.userName || "—"],
    ...(record.aufsichtsfuehrender ? [["Aufsichtsführende(r)", record.aufsichtsfuehrender]] : []),
    ["Kunde", record.kunde?.name || "—"],
    ...(record.einsatzort ? [["Einsatzort", record.einsatzort]] : []),
    ["Projekt", record.projekt ? `${record.projekt.ref || ""} ${record.projekt.title || ""}`.trim() : "—"],
    ["Arbeitsart", gbuArbeitsart(record.arbeitsart)?.label || record.arbeitsart],
    ...(arbeiten ? [["Durchzuf. Arbeiten", arbeiten]] : []),
    // Bei offener Stückzahl beschreibt das Feld den Bereich, nicht die Bäume —
    // dann muss auch die Beschriftung das sagen, sonst liest das PDF sich wie
    // eine Stückzahlangabe, die niemand gemacht hat.
    ...(record.baum ? [[record.anzahlOffen ? "Arbeitsbereich" : "Baum/Bäume", record.baum]] : []),
    ...(gbuUmfangText(record) ? [["Umfang", gbuUmfangText(record)]] : []),
    ...(record.zugang ? [["Zugang", gbuZugang(record.zugang)?.label || record.zugang]] : []),
    ["Wetter", `${record.niederschlag || "—"}, ${record.wind || "—"}`],
    ...(record.stromEntfernung ? [["Stromleitungen, Entfernung", record.stromEntfernung]] : []),
    ...(record.kommunikationsart ? [["Art der Kommunikation", record.kommunikationsart]] : []),
    ...(record.verkehrssicherungsart ? [["Art der Verkehrssicherung", record.verkehrssicherungsart]] : []),
    ...(record.beschreibung ? [["Tätigkeit", record.beschreibung]] : []),
  ];
  for (const [k, v] of meta) {
    // Zeilenhöhe vor dem Zeichnen bestimmen, damit der Seitenumbruch die ganze Zeile umfasst.
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    const kLines = doc.splitTextToSize(k.toUpperCase(), 140);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(v), CW - 150);
    const rowH = Math.max(15, lines.length * 13, kLines.length * 11);
    pageBreak(rowH + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(kLines, M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...DARK);
    doc.text(lines, M + 150, y);
    y += rowH;
  }
  y += 6;

  const sectionHead = (label, recht) => {
    pageBreak(30);
    y += 8;
    doc.setFillColor(238, 247, 234);
    doc.rect(M - 6, y - 11, CW + 12, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...GREEN);
    doc.text(label.toUpperCase(), M, y + 2);
    if (recht) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(recht, W - M, y + 2, { align: "right" });
    }
    y += 20;
  };
  const kv = (k, v, opts = {}) => {
    // Zeilenhöhe vor dem Zeichnen bestimmen, damit der Seitenumbruch die ganze Zeile umfasst.
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    const kLines = doc.splitTextToSize(String(k), 160);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(String(v), CW - 170);
    const rowH = Math.max(14, lines.length * 12, kLines.length * 10.5);
    pageBreak(rowH + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text(kLines, M, y);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(9.5);
    doc.setTextColor(...(opts.color || DARK));
    doc.text(lines, M + 170, y);
    y += rowH;
  };

  // Eingesetztes Personal mit Qualifikationen (SVLFG-Formularkopf).
  if (record.personal?.length) {
    sectionHead("Personal", "AS-Baum I/II · SKT A/B");
    for (const p of record.personal) {
      kv(p.name, p.quals?.length ? p.quals.join(", ") : "— keine Qualifikation angegeben —");
    }
  }

  // Baumsicherheitsbeurteilung (nur bei Baumpflege/Fällung ausgefüllt).
  const bd = record.baumdaten;
  if (bd) {
    sectionHead("Baumbezogene Gefahren / Baumsicherheitsbeurteilung", "SVLFG-Formular Baumsicherheitsbeurteilung");
    const dim = [
      bd.baumart ? `Baumart: ${bd.baumart}` : "",
      bd.hoehe ? `Baumhöhe: ${bd.hoehe}` : "",
      bd.bhd ? `BHD: ${bd.bhd}` : "",
      bd.stock ? `Stockdurchmesser: ${bd.stock}` : "",
    ].filter(Boolean).join(" · ");
    if (dim) kv("Baumdaten", dim);
    kv("Baum", bd.haenger?.length ? bd.haenger.join(", ") : "—");
    const NONE = "keine Auffälligkeiten angekreuzt";
    kv("Baumumfeld", bd.umfeld?.length ? bd.umfeld.join(", ") : NONE);
    kv("Stammfuß / Stamm", bd.stamm?.length ? bd.stamm.join(", ") : NONE);
    kv("Baumkrone", bd.krone?.length ? bd.krone.join(", ") : NONE);
    const kroneZeile = [
      bd.gewicht ? `Gewichtsverteilung: ${bd.gewicht}` : "",
      bd.kronenzustand ? `Krone: ${bd.kronenzustand}` : "",
    ].filter(Boolean).join(" · ");
    if (kroneZeile) kv("Krone (Zustand)", kroneZeile);
    if (bd.sicher) {
      kv("Baum ist sicher für die geplanten Arbeiten", bd.sicher,
        { bold: true, color: bd.sicher === "ja" ? GREEN : RED });
    }
    if (bd.bemerkung) kv("Bemerkung", bd.bemerkung);
  }

  // Checklisten-Blöcke
  const blocks = composeChecklist(record.arbeitsart, record.zugang);
  for (const b of blocks) {
    pageBreak(30);
    y += 8;
    doc.setFillColor(238, 247, 234);
    doc.rect(M - 6, y - 11, CW + 12, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...GREEN);
    doc.text(b.label.toUpperCase(), M, y + 2);
    if (b.recht) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(b.recht, W - M, y + 2, { align: "right" });
    }
    y += 20;
    // Tabellenzeilen: Status | Prüfpunkt (+ Erläuterung, + Maßnahme bei Mangel)
    for (const it of b.items) {
      const st = record.items?.[`${b.id}:${it.id}`] || {};
      const status = st.status || "nr";
      const hint = GBU_HINTS[it.label] || "";
      const labelLines = doc.splitTextToSize(it.label, CW - 60);
      const hintLines = hint ? doc.splitTextToSize(hint, CW - 60) : [];
      const massnLines = (status === "mangel" && st.massnahme) ? doc.splitTextToSize("Maßnahme: " + st.massnahme, CW - 60) : [];
      const rowH = labelLines.length * 12 + hintLines.length * 9.5 + massnLines.length * 11 + 8;
      pageBreak(rowH + 6);
      const col = status === "ok" ? GREEN : status === "mangel" ? RED : GRAY;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...col);
      doc.text(GBU_STATUS_LABEL[status] || status, M, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text(labelLines, M + 52, y);
      let yy = y + labelLines.length * 12 - 3;
      if (hintLines.length) {
        doc.setFontSize(8); doc.setTextColor(...GRAY);
        doc.text(hintLines, M + 52, yy + 9);
        yy += hintLines.length * 9.5;
      }
      if (massnLines.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...RED);
        doc.text(massnLines, M + 52, yy + 11);
        yy += massnLines.length * 11;
      }
      y = yy + 11;
      doc.setDrawColor(228, 232, 228);
      doc.setLineWidth(0.5);
      doc.line(M - 6, y - 7, M + CW + 6, y - 7);
    }
  }

  if (record.besonderheiten) {
    y += 10; pageBreak(30);
    text("BESONDERHEITEN", M, { bold: true, size: 9, color: GRAY });
    text(record.besonderheiten, M, {});
  }

  // Erklärung (Nachweisfunktion) + ggf. SKT-Zusatz
  y += 12; pageBreak(60);
  text("ERKLÄRUNG", M, { bold: true, size: 9, color: GRAY });
  text("Die aufgeführten Punkte wurden vor Arbeitsbeginn am Einsatzort geprüft. Festgestellte Mängel wurden durch die " +
    "genannten Maßnahmen beseitigt bzw. die betroffene Arbeit wurde nicht aufgenommen oder eingestellt; die Wirksamkeit " +
    "der getroffenen Maßnahmen wurde vor Aufnahme der Arbeit überprüft (§ 6 Abs. 1 ArbSchG). Die eingesetzten " +
    "Beschäftigten sind für die Tätigkeit unterwiesen; die erforderliche PSA wurde benutzt.", M, { size: 9, lh: 12 });
  if (record.baum) {
    y += 2;
    text("Mehrere Bäume/Objekte mit gleichartigen Arbeitsbedingungen wurden zusammengefasst beurteilt (§ 5 Abs. 2 Satz 2, " +
      "§ 6 Abs. 1 Satz 2 ArbSchG); Abweichungen einzelner Objekte sind unter Besonderheiten vermerkt.", M, { size: 9, lh: 12 });
  }
  // Einsatz nach Zeit: die Zahl der Bäume stand vorher nicht fest. Das ist
  // zulässig (gleichartige Arbeitsbedingungen im selben Bereich), aber es muss
  // im Nachweis stehen — samt der Grenze, ab der die Gruppenbeurteilung endet.
  if (record.anzahlOffen) {
    y += 2;
    text("Der Einsatz ist nach Zeit bemessen; die Zahl der bearbeiteten Bäume stand vorher nicht fest. Die Beurteilung gilt " +
      "für den oben genannten Arbeitsbereich und die dort gleichartigen Bedingungen. Weicht ein Baum davon ab (Schadbild, " +
      "Hängersituation, Umfeld), wird die Arbeit an diesem Baum unterbrochen und gesondert beurteilt.", M,
      { size: 9, lh: 12, bold: true });
  }
  if (record.zugang === "skt") {
    y += 2;
    text("Seilklettertechnik: Die Baumbeurteilung (SVLFG) wurde vor Arbeitsbeginn durchgeführt. Während der Kletterarbeit " +
      "ist eine zweite rettungsfähige Person anwesend (DGUV Regel 112-199); Rettungskonzept und Rettungsgerät sind einsatzbereit.", M, { size: 9, lh: 12 });
  }
  // Freigabesatz des SVLFG-Formulars — nur bei Baumarbeiten/Bühne/SKT, und nur,
  // wenn der Baum nicht als unsicher bewertet wurde.
  if (record.baumdaten || kategorien.length) {
    y += 2;
    if (record.baumdaten && record.baumdaten.sicher && record.baumdaten.sicher !== "ja") {
      text("Auf Grundlage der durchgeführten Gefährdungsermittlung/Baumsicherheitsbeurteilung können die geplanten Arbeiten " +
        "NICHT ohne Weiteres durchgeführt werden (siehe Baumsicherheitsbeurteilung und Bemerkung). Die Arbeiten werden erst nach " +
        "Umsetzung der festgelegten Maßnahmen bzw. nach eingehender Untersuchung aufgenommen.", M, { size: 9, lh: 12, bold: true, color: RED });
    } else {
      text("Auf Grundlage der von mir durchgeführten Gefährdungsermittlung/Baumsicherheitsbeurteilung können die geplanten " +
        "Arbeiten durchgeführt werden.", M, { size: 9, lh: 12, bold: true });
    }
  }

  // Unterschriften
  y += 12; pageBreak(160);
  text("UNTERSCHRIFTEN", M, { bold: true, size: 9, color: GRAY });
  const ortDatum = [record.einsatzort || record.kunde?.name || "", d.toLocaleDateString("de-DE")].filter(Boolean).join(", ");
  text(`Ort und Datum: ${ortDatum}`, M, { size: 9 });
  y += 4;
  const sigs = [
    { img: record.sigDurchfuehrender, name: record.userName || "Durchführende(r)", role: "Durchführende(r) / Verantwortliche(r)" },
    ...(record.sigZweitePerson ? [{ img: record.sigZweitePerson, name: record.zweitePersonName || "Zweite Person", role: record.zugang === "skt" ? "Zweite rettungsfähige Person (DGUV R 112-199)" : "Zweite Person" }] : []),
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
    const roleLines = doc.splitTextToSize(`${s.name} (${s.role})`, 190);
    doc.text(roleLines, x, sigTop + 108);
    x += 230;
  }
  y = sigTop + 130;
  doc.setFontSize(8); doc.setTextColor(...GRAY);
  // appName kommt aus betrieb (Blattwerk selbst: "Blattwerk", siehe
  // MANDANT_STANDARD.betrieb.appName) — ohne eigenen Markennamen bleibt die
  // Fußzeile bewusst neutral, statt Blattwerks Namen auf einem fremden
  // Mandanten-Nachweis zu zeigen.
  const erstelltMit = appName ? `mit der ${appName}-App ` : "mit der App ";
  doc.text(`Erstellt ${erstelltMit}am ${d.toLocaleDateString("de-DE")} um ${d.toLocaleTimeString("de-DE")} · Aufbewahrung als Dokumentation gem. § 6 ArbSchG.`, M, y);
}

// Liefert Base64 ohne Data-URL-Präfix. v3 = Aufbau des SKT-Papierformulars,
// alles andere = bisheriges Layout (Queue/Log von vor dem Umbau).
export async function buildGbuPdf(record, { betrieb } = {}) {
  const kopf = betriebKopf(betrieb);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // Reproduzierbarkeit (Befund 2): Erstellungsdatum = Zeitpunkt der Beurteilung,
  // Datei-ID deterministisch aus record — sonst wäre jeder Wiederholungsversuch
  // nach Verbindungsabbruch ein neues PDF mit neuer Prüfsumme, und Paperless'
  // Duplikat-Erkennung (sha256 in submitGbuRecord) liefe ins Leere.
  doc.setCreationDate(new Date(record.createdAt));
  doc.setFileId((await sha256Hex(new Blob([String(record.id || "") + "|" + String(record.createdAt || "")]))).slice(0, 32));
  if (Number(record.version) === 3) zeichneV3(doc, record, kopf); else await zeichneV2(doc, record, kopf);
  return doc.output("datauristring").split(",")[1];
}

// ─── v3: Aufbau des Papierformulars „Gefahrenermittlung – Seilklettertechnik" ──
// Kopfkasten links, Lageplan rechts (Platz der Skizze) mit Notruf 112, dann die
// Kästen Baustellencheck / Baumcheck / Material / Personal / Freigabe mit
// Kästchen. Drei Zustände je Kästchen: X = ja, leer + „nein", leer + „offen".
// Marker „A" = automatisch vorbelegt und vom Menschen so bestätigt.
function zeichneV3(doc, r, { firma, ort, uv, gewerk, appName }) {
  const W = 595.28, M = 34, CW = W - 2 * M;
  const DARK = [25, 30, 36], GRAY = [110, 118, 129], GREEN = [46, 125, 50], RED = [201, 42, 42], ORANGE = [217, 119, 6];
  let y = M;
  // Ein-Blatt-Layout (17.09.2026, ../blattwerk-betrieb/docs/superpowers/specs/2026-09-17-gbu-pdf-ein-blatt-design.md):
  // eigener Zeilenfaktor statt jsPDF-Standard 1.15 fuer mehrzeilige Freitexte
  // (Kaestchen-Zeilen, Wert-Umbrueche, Baumcheck-Spalten, Unterschriftstext) -
  // dort steckt der meiste Platz. zh(size) MUSS beim Messen (zeileH) und beim
  // Zeichnen (zeichneZeile) denselben Wert liefern, sonst laeuft Text unten aus
  // dem Kasten oder ueberlappt die naechste Zeile (siehe I-2, Kommentar unten).
  const ZFAKTOR = 1.05;
  doc.setLineHeightFactor(ZFAKTOR);
  const zh = (size) => size * ZFAKTOR;
  const ROW_PAD = 2; // Abstand nach einer Pruefzeile im Kasten (vorher 6)
  const BOX_TOP = 7; // Innenabstand oben im Kasten (vorher 12)
  const BOX_BOTTOM = 3; // Innenabstand unten, in h eingerechnet (vorher 8)
  const BOX_GAP = 2; // Abstand nach dem Kasten (vorher 8)
  const TITEL_H = 10; // Platz fuer den Kastentitel (vorher 12)
  const seite = (need) => { if (y + need > 806) { doc.addPage(); y = M; } };
  const font = (bold, size, color = DARK) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color); };
  const dt = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || ""); };
  const auto = (pfad) => r.automatik?.[pfad] === "auto";
  const markerA = (x, yy) => {
    doc.setDrawColor(...GREEN); doc.setLineWidth(0.6); doc.circle(x + 3.4, yy - 2.8, 3.4, "S");
    font(true, 5.5, GREEN); doc.text("A", x + 1.6, yy - 0.9);
  };
  const box = (x, yy, an) => {
    doc.setDrawColor(...DARK); doc.setLineWidth(0.7); doc.rect(x, yy - 7.5, 9, 9, "S");
    if (an) { doc.setLineWidth(1.1); doc.line(x + 1.5, yy - 6, x + 7.5, yy); doc.line(x + 7.5, yy - 6, x + 1.5, yy); }
  };
  const kaestchen = (x, yy, wert) => {
    box(x, yy, wert === "ja");
    if (wert === "nein") { font(false, 6.5, GRAY); doc.text("nein", x + 11, yy - 1); }
    else if (wert !== "ja") { font(false, 6.5, ORANGE); doc.text("offen", x + 11, yy - 1); }
  };
  const bloecke = composeFormular(r.arbeitsart, r.zugang);
  const k = r.kopf || {};

  // Titel + Betriebsdaten
  font(true, 13); doc.text("Gefährdungsbeurteilung vor Ort — Gefahrenermittlung", M, y); y += 13;
  font(false, 7.5, GRAY);
  doc.text(`${gewerk}${firma} · ${ort} · UV-Träger: ${uv} · Aufbau nach dem Formular „Gefahrenermittlung – Seilklettertechnik"`, M, y); y += 9;
  const einsatz = [gbuArbeitsart(r.arbeitsart)?.label || r.arbeitsart, r.zugang ? gbuZugang(r.zugang)?.label : "", ...gbuEinsatzKategorien(r.arbeitsart, r.zugang)].filter(Boolean).join(" · ");
  const umfang = [r.baum ? (r.anzahlOffen ? "Arbeitsbereich: " : "Baum/Bäume: ") + r.baum : "", gbuUmfangText(r), (r.arbeiten || []).length ? "Arbeiten: " + [...r.arbeiten, r.arbeitenSonstiges].filter(Boolean).join(", ") : "", r.beschreibung ? "Tätigkeit: " + r.beschreibung : ""].filter(Boolean).join(" · ");
  font(false, 8);
  for (const ln of doc.splitTextToSize(`Einsatz: ${einsatz}${r.kunde?.name ? " · Kunde: " + r.kunde.name : ""}${r.projekt?.ref ? " · Projekt: " + r.projekt.ref : ""}${umfang ? " · " + umfang : ""}`, CW)) { doc.text(ln, M, y); y += 9; }
  y += 2;

  // Kopfkasten links, Lageplan rechts
  const LW = 300, RX = M + LW + 8, RW = CW - LW - 8, ZH = 11.5;
  const kopfZeilen = [
    ["Datum", dt(k.datum) + (k.datumBis ? " – " + dt(k.datumBis) : ""), "kopf.datum"],
    ["Einsatzort/Ortsteil", k.einsatzort, "kopf.einsatzort"],
    ["Straße/Nr./Park", k.strasse, "kopf.strasse"],
    ["Standort/Zufahrtsweg", k.standort, "kopf.standort"],
    ["Festnetz-Nr. vor Ort", k.festnetz, "kopf.festnetz"],
    ["1. Mobil-Nr. vor Ort", (k.mobil || [])[0], "kopf.mobil"],
    ["2. Mobil-Nr. vor Ort", (k.mobil || [])[1], "kopf.mobil"],
    ["3. Mobil-Nr. vor Ort", (k.mobil || [])[2], "kopf.mobil"],
  ];
  // Lange Werte (z. B. Standort/Zufahrtsweg) sollen umbrechen statt abgeschnitten
  // zu werden - splitTextToSize()[0] allein verwirft die Folgezeilen stillschweigend.
  // fontSize explizit setzen: splitTextToSize() misst sonst mit dem aktuell
  // gesetzten Font, und der steht beim Budget (vor der Schleife) noch auf 8pt,
  // waehrend die Schleife selbst mit 9pt zeichnet - das Hoehenbudget kopfH
  // waere sonst zu klein und der Text liefe unten aus dem Kasten.
  const kopfWertZeilen = (v) => doc.splitTextToSize(String(v || ""), LW - 122, { fontSize: 9 });
  const abw = r.aufsichtAbweichung;
  // Zeilenabstand fuer die Umbruch-Zeilen eines Werts: eigene Konstante statt
  // zh(9), weil diese Zeilen einzeln per doc.text() gezeichnet werden (kein
  // Array) - jsPDFs Zeilenfaktor betrifft sie nicht, wir zaehlen komplett selbst.
  const KOPF_ZEILE = 9;
  const kopfZeilenExtra = kopfZeilen.reduce((s, [, v]) => s + Math.max(0, kopfWertZeilen(v).length - 1) * KOPF_ZEILE, 0);
  const kopfH = ZH * (kopfZeilen.length + 2) + kopfZeilenExtra + BOX_TOP + 2 + (abw ? 18 : 0);
  const top = y;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.8); doc.rect(M, top, LW, kopfH, "S"); doc.rect(RX, top, RW, kopfH, "S");
  let yy = top + BOX_TOP + 2;
  const trenner = () => { doc.setDrawColor(205, 205, 205); doc.setLineWidth(0.3); doc.line(M + 2, yy + 4, M + LW - 2, yy + 4); };
  for (const [label, v, pfad] of kopfZeilen) {
    const zl = kopfWertZeilen(v);
    font(true, 8); doc.text(label + ":", M + 5, yy);
    font(false, 9); zl.forEach((ln, i) => doc.text(ln, M + 112, yy + i * KOPF_ZEILE));
    if (v && auto(pfad)) markerA(M + 101, yy);
    yy += Math.max(0, zl.length - 1) * KOPF_ZEILE; trenner(); yy += ZH;
  }
  font(true, 8); doc.text("Netzempfang:", M + 5, yy);
  font(false, 8); doc.text("ja", M + 112, yy); box(M + 124, yy, k.netz === "ja");
  doc.text("nein", M + 150, yy); box(M + 170, yy, k.netz === "nein");
  if (k.netz !== "ja" && k.netz !== "nein") { font(false, 6.5, ORANGE); doc.text("offen", M + 186, yy - 1); }
  if (auto("kopf.netz") && k.netz) markerA(M + 101, yy);
  trenner(); yy += ZH;
  font(true, 8); doc.text("Aufsichtsführende(r):", M + 5, yy);
  font(false, 9); doc.text(String(k.aufsicht || ""), M + 112, yy);
  if (k.aufsicht && auto("kopf.aufsicht")) markerA(M + 101, yy);
  if (abw) {
    // Zwei feste Zeilen, damit der Grund nicht mitten im Satz umbricht.
    yy += 10; font(false, 7, GRAY);
    doc.text(doc.splitTextToSize(`Vorschlag der App: ${abw.vorschlag} — gewählt: ${abw.gewaehlt}`, LW - 10)[0], M + 5, yy); yy += 8;
    doc.text(doc.splitTextToSize(`Grund: ${abw.grund}`, LW - 10)[0], M + 5, yy);
  }
  // Rechts: Lageplan
  font(true, 8); doc.text("Lageplan/Zufahrt:", RX + 5, top + BOX_TOP + 2);
  const bildKante = Math.min(RW - 12, kopfH - 38);
  const bx = RX + (RW - bildKante) / 2, by = top + 18;
  let bildDa = false;
  if (k.karte) {
    try {
      doc.addImage(k.karte, String(k.karte).startsWith("data:image/png") ? "PNG" : "JPEG", bx, by, bildKante, bildKante);
      bildDa = true;
    } catch (_) { bildDa = false; }
  }
  if (!bildDa) {
    doc.setDrawColor(205, 205, 205); doc.setLineWidth(0.5); doc.rect(bx, by, bildKante, bildKante, "S");
    font(false, 8, GRAY); doc.text("Karte nicht verfügbar", RX + RW / 2, by + bildKante / 2, { align: "center" });
  }
  font(false, 7, GRAY);
  doc.text(k.gps
    ? `${Number(k.gps.lat).toFixed(5)}, ${Number(k.gps.lon).toFixed(5)} (±${Math.round(k.gps.genauigkeitM || 0)} m)`
    : "keine GPS-Position", RX + 5, top + kopfH - 6);
  font(true, 11); doc.text("Notruf 112", RX + RW - 5, top + kopfH - 6, { align: "right" });
  y = top + kopfH + 6;

  // Zeilen-Höhen und -Zeichnung für die Kästen (zwei Spalten wie auf dem Papier)
  const daten = (b) => r[b.id] || {};
  const textVon = (b, z) => {
    const d = daten(b), v = d[z.id];
    if (b.id === "baustelle" && z.id === "dauer") return `${d.dauerVon || "—"} – ${d.dauerBis || "—"} Uhr`;
    if (b.id === "baustelle" && z.id === "sonstigeGefahren") return [v, ...(d.sonstigeGefahrenChips || [])].filter(Boolean).join("; ");
    return String(v || "");
  };
  const zusatzVon = (b, z) => {
    const d = daten(b);
    if (b.id === "baustelle" && z.id === "witterung") return [wetterZeile(r.wetter)].filter(Boolean).join("");
    if (b.id === "baustelle" && z.id === "stromleitung") return String(d.stromleitungText || "");
    if (b.id === "personalcheck" && z.id === "erfahrung" && (d.erfahrungFehlt || []).length) return "fehlt: " + d.erfahrungFehlt.join(", ");
    return "";
  };
  // "wahl"-Zeilen (Gesundheitszustand/Standsicherheit): so viele Optionen wie
  // moeglich in EINE Zeile, wie auf dem Papier - erst wenn sie im Kasten nicht
  // nebeneinander passen (gemessen im Zeichenfont 7.5pt, nicht geschaetzt),
  // faellt die Zeile auf das alte 3er-Raster zurueck. Eigene Funktion, von
  // zeileH() UND zeichneZeile() benutzt, damit Messen und Zeichnen nicht
  // auseinanderlaufen (siehe I-2-Kommentar unten).
  const wahlLayout = (z, colW) => {
    font(false, 7.5);
    const boxW = 12, gap = 14;
    const breiten = z.optionen.map((opt) => boxW + doc.getTextWidth(opt) + gap);
    const einzeiler = breiten.reduce((a, b2) => a + b2, 0) <= colW - 10;
    return { einzeiler, breiten, zeilen: einzeiler ? 1 : Math.ceil(z.optionen.length / 3) };
  };
  const zeileH = (b, z, colW) => {
    if (z.typ === "check") {
      const l = doc.splitTextToSize(z.label + (z.hinweis ? " (" + z.hinweis + ")" : ""), colW - 66).length;
      const zs = zusatzVon(b, z) ? doc.splitTextToSize(zusatzVon(b, z), colW - 14).length : 0;
      return l * zh(8.5) + zs * zh(7) + ROW_PAD;
    }
    if (z.typ === "wahl") return zh(8) + wahlLayout(z, colW).zeilen * 12 - 2;
    return doc.splitTextToSize(`${z.label}: ${textVon(b, z)}`, colW - 12).length * zh(8.5) + ROW_PAD;
  };
  const zeichneZeile = (b, z, x, colW) => {
    const pfad = `${b.id}.${z.id}`, v = daten(b)[z.id];
    if (z.typ === "check") {
      font(false, 8.5);
      const lines = doc.splitTextToSize(z.label + (z.hinweis ? " (" + z.hinweis + ")" : ""), colW - 66);
      doc.text(lines, x + 5, y);
      if (z.id === "baumSicher") {
        font(false, 8); doc.text("ja", x + colW - 62, y); box(x + colW - 52, y, v === "ja");
        doc.text("nein", x + colW - 36, y); box(x + colW - 18, y, v === "nein");
      } else {
        kaestchen(x + colW - 48, y, v);
      }
      if (v && auto(pfad)) markerA(x + colW - 60, y);
      let dy = lines.length * zh(8.5);
      const zs = zusatzVon(b, z);
      if (zs) { font(false, 7, GRAY); const zl = doc.splitTextToSize(zs, colW - 14); doc.text(zl, x + 9, y + dy - 1); dy += zl.length * zh(7); }
      y += dy + ROW_PAD;
      return;
    }
    if (z.typ === "wahl") {
      font(true, 8); doc.text(z.label + ":", x + 5, y);
      if (v && auto(pfad)) markerA(x + 5 + doc.getTextWidth(z.label + ":") + 3, y);
      y += zh(8);
      const wl = wahlLayout(z, colW);
      font(false, 7.5);
      if (wl.einzeiler) {
        let ox = x + 5;
        z.optionen.forEach((opt, i) => { box(ox, y, v === opt); doc.text(opt, ox + 12, y - 1); ox += wl.breiten[i]; });
      } else {
        z.optionen.forEach((opt, i) => {
          const ox = x + 5 + (i % 3) * ((colW - 10) / 3), oy = y + Math.floor(i / 3) * 12;
          box(ox, oy, v === opt); doc.text(opt, ox + 12, oy - 1);
        });
      }
      y += wl.zeilen * 12 - 2;
      return;
    }
    font(false, 8.5);
    const lines = doc.splitTextToSize(`${z.label}: ${textVon(b, z)}`, colW - 12);
    doc.setFont("helvetica", "bold"); doc.text(z.label + ":", x + 5, y);
    // Breite im FETTEN Font messen (so wurde das Label gerade gezeichnet) -
    // sonst ist labelW zu schmal (normale Glyphen sind schmaler als fette)
    // und der Wert ueberlappt das Label-Ende (z. B. "Sonstige Gefahren am Einsatzort").
    const labelW = doc.getTextWidth(z.label + ": ");
    doc.setFont("helvetica", "normal");
    doc.text(lines[0].slice(z.label.length + 2), x + 5 + labelW, y);
    if (lines.length > 1) doc.text(lines.slice(1), x + 5, y + zh(8.5));
    if (textVon(b, z) && auto(pfad)) markerA(x + colW - 14, y);
    y += lines.length * zh(8.5) + ROW_PAD;
  };
  const kasten = (b, zeichner) => {
    const sp1 = b.zeilen.filter((z) => (z.spalte || 1) === 1), sp2 = b.zeilen.filter((z) => z.spalte === 2);
    // Zweispaltig nur, wenn BEIDE Spalten Zeilen haben (z. B. Heckenschnitt vom
    // Boden: bei "Material" bleiben nur die spalte-2-Zeilen uebrig, sp1 ist
    // leer - ohne diese Bedingung zeichnete kasten() einen leeren linken
    // Bereich samt Trennlinie und rueckte die einzige Spalte sinnlos nach rechts).
    const zweiSpaltig = sp1.length && sp2.length;
    const colW = zweiSpaltig ? CW / 2 : CW;
    const spLinks = sp1.length ? sp1 : sp2;
    // Hoehe IMMER im gleichen Font messen, mit dem zeichneZeile() spaeter auch
    // zeichnet (I-2, Final-Review 16.09.2026): splitTextToSize() misst mit dem
    // gerade aktiven Font, und der ist beim ersten Aufruf noch der zuletzt vor
    // dem Kasten gesetzte (z. B. "Notruf 112" in font(true, 11)) - nicht der
    // Font, mit dem die Zeilen gleich tatsaechlich gezeichnet werden. Das macht
    // die Kastenhoehe falsch, in beide Richtungen (zu gross ODER zu klein).
    font(false, 8.5);
    // h MUSS den oberen Innenabstand mitzaehlen (BOX_TOP) - das Zeichnen startet
    // bei y=oben+BOX_TOP, nicht bei oben. Ohne den Summanden war die Box immer
    // um genau BOX_TOP-BOX_BOTTOM (4pt) zu knapp bemessen, und die letzte Zeile
    // lief unten aus dem Kasten - bei mehrzeiligen Kaesten durch Restplatz aus
    // frueheren (grosszuegigeren) Zeilenhoehen kaschiert, beim EINZEILIGEN
    // Freigabe-Kasten (Heckenschnitt vom Boden: nur "Einschraenkungen", kein
    // "Baum ist sicher") wurde die Kastenlinie sichtbar mitten durch den
    // fetten Erklaerungssatz darunter gezogen (gemeldet 17.09.2026, mit
    // GBU_DEBUG_BOX belegt: Differenz war in JEDEM Kasten +4pt).
    const h = zeichner ? zeichner.hoehe() : BOX_TOP + Math.max(spLinks.reduce((s, z) => s + zeileH(b, z, colW), 0), zweiSpaltig ? sp2.reduce((s, z) => s + zeileH(b, z, colW), 0) : 0) + BOX_BOTTOM;
    seite(TITEL_H + h + 12);
    font(true, 9.5); doc.text(b.titel, M, y + 7); y += TITEL_H + 1;
    const oben = y;
    doc.setDrawColor(...DARK); doc.setLineWidth(0.8); doc.rect(M, oben, CW, h, "S");
    if (zeichner) { y = oben + BOX_TOP; zeichner.zeichne(); }
    else {
      if (zweiSpaltig) { doc.setLineWidth(0.4); doc.line(M + colW, oben, M + colW, oben + h); }
      y = oben + BOX_TOP; for (const z of spLinks) zeichneZeile(b, z, M, colW);
      const yEnde = y;
      if (zweiSpaltig) {
        y = oben + BOX_TOP; for (const z of sp2) zeichneZeile(b, z, M + colW, colW);
        y = Math.max(y, yEnde);
      }
    }
    if (process.env.GBU_DEBUG_BOX) console.error(`Kasten ${b.id}: oben=${oben.toFixed(2)} h=${h.toFixed(2)} Kastenunterkante(abs)=${(oben + h).toFixed(2)} Inhaltsunterkante(abs)=${y.toFixed(2)} Differenz(Inhalt-Kastenunterkante)=${(y - (oben + h)).toFixed(2)}`);
    y = oben + h + BOX_GAP;
  };

  for (const b of bloecke) {
    if (b.id === "kopf") continue;
    if (b.id === "baumcheck") {
      // Drei Freitextspalten wie auf dem Papier, darunter die zwei Wahlzeilen.
      const bc = r.baumcheck || {};
      const spalten = [["Baumkrone/Kronenansatz", bc.krone, "baumcheck.krone"], ["Stamm/Stammfuß", bc.stamm, "baumcheck.stamm"], ["Wurzel/Baumumfeld", bc.wurzel, "baumcheck.wurzel"]];
      const sw = CW / 3;
      // Gleicher Grund wie in kasten(): mit demselben Font messen, mit dem die
      // Spaltentexte weiter unten in zeichne() gezeichnet werden (font(false, 8.5)) -
      // sonst haengt textH vom Font ab, den die vorige Box zuletzt hinterlassen hat.
      font(false, 8.5);
      // VALUE_Y = Abstand von der Kastenoberkante bis zur ERSTEN Wertzeile
      // (Platz fuer das fette Spaltenlabel darueber); jede weitere Zeile
      // braucht real zh(8.5) (jsPDF zeichnet das Array mit genau diesem
      // Zeilenabstand), +4 Luft fuer Unterlaengen (p, g) vor der Trennlinie.
      // textH MUSS mit dem Zeichnen unten uebereinstimmen (I-2-Falle) - bei
      // 3-zeiligen Freitexten (siehe Muster "voll") lief das vorher unten aus
      // dem Kasten in die Gesundheitszustand-Zeile darunter.
      const VALUE_Y = 17;
      const textH = Math.max(24, ...spalten.map(([, v]) =>
        VALUE_Y + Math.max(0, doc.splitTextToSize(String(v || ""), sw - 10).length - 1) * zh(8.5) + 4));
      const wahlen = b.zeilen.filter((z) => z.typ === "wahl");
      kasten(b, {
        // Zwei Innenabstaende wie beim Zeichnen: BOX_TOP vor den drei
        // Textspalten UND (siehe zeichne() unten) noch einmal BOX_TOP als
        // Abstand zwischen der Trennlinie und den Wahl-Zeilen - hier fehlte
        // der zweite bislang, mit BOX_GAP (Abstand NACH dem Kasten) statt
        // BOX_BOTTOM (Innenabstand VOR der Kastenlinie) am Ende verwechselt.
        hoehe: () => BOX_TOP + textH + BOX_TOP + wahlen.reduce((s, z) => s + zeileH(b, z, CW), 0) + BOX_BOTTOM,
        zeichne: () => {
          const oben = y - BOX_TOP;
          font(false, 7, GRAY); doc.text("Verantwortliche Schadsymptome im:", M + 5, y - 2);
          spalten.forEach(([label, v, pfad], i) => {
            const x = M + i * sw;
            if (i) { doc.setDrawColor(...DARK); doc.setLineWidth(0.4); doc.line(x, oben, x, oben + BOX_TOP + textH); }
            font(true, 8); doc.text(label, x + 5, y + 7);
            if (v && auto(pfad)) markerA(x + 5 + doc.getTextWidth(label) + 3, y + 7);
            font(false, 8.5); doc.text(doc.splitTextToSize(String(v || ""), sw - 10), x + 5, y + VALUE_Y);
          });
          doc.setDrawColor(...DARK); doc.setLineWidth(0.4); doc.line(M, oben + BOX_TOP + textH, M + CW, oben + BOX_TOP + textH);
          y = oben + BOX_TOP + textH + BOX_TOP;
          for (const z of wahlen) zeichneZeile(b, z, M, CW);
        },
      });
      continue;
    }
    kasten(b);
    if (b.id === "material" && (r.material?.offeneFristen || []).length) {
      font(false, 7.5, RED);
      const t = "Betriebsmittel mit offener Frist: " + r.material.offeneFristen.map((f) => `${f.batch} (${f.grund || f.stufe})`).join(", ");
      // NICHT bei y-2 anfangen: das ruecke den Text 2pt NAEHER an den Kasten,
      // statt Abstand zu schaffen (siehe SATZ_ABSTAND-Kommentar unten).
      for (const ln of doc.splitTextToSize(t, CW)) { seite(10); doc.text(ln, M, y); y += 9; }
      y += 2;
    }
  }

  // Nachbesserung 17.09.2026: Text, der DIREKT (ohne Kastentitel dazwischen)
  // auf einen Kasten folgt, bekam nur BOX_GAP (2pt) Abstand zur Kastenlinie -
  // das reicht fuer eine fette 8,5pt-Zeile (Oberlaenge ca. 6pt) nicht, die
  // Linie schnitt sichtbar durch die erste Zeile des Erklaerungssatzes (Befund
  // 17.09.2026 am kleinen Fall, Freigabe-Kasten mit nur einer Zeile). Ein
  // Kastentitel bekommt diese Reserve automatisch (er wird bei y+7 gezeichnet,
  // siehe kasten()) - der Freigabesatz nicht, weil kein Titel dazwischensteht.
  const SATZ_ABSTAND = 6;
  y += SATZ_ABSTAND;

  // Freigabesatz wie bisher: rot, wenn der Baum nicht sicher ist.
  seite(30);
  const fr = r.freigabe || {};
  if (bloecke.some((b) => b.id === "baumcheck") && fr.baumSicher && fr.baumSicher !== "ja") {
    font(true, 8.5, RED);
    for (const ln of doc.splitTextToSize("Auf Grundlage der Gefahrenermittlung/Baumsicherheitsbeurteilung können die geplanten Arbeiten NICHT ohne Weiteres durchgeführt werden — siehe Einschränkungen.", CW)) { doc.text(ln, M, y); y += 9; }
  } else {
    font(true, 8.5);
    for (const ln of doc.splitTextToSize("Auf Grundlage der von mir durchgeführten Gefahrenermittlung/Baumsicherheitsbeurteilung können die geplanten Arbeiten durchgeführt werden.", CW)) { doc.text(ln, M, y); y += 9; }
  }
  if (r.anzahlOffen) {
    font(false, 8);
    for (const ln of doc.splitTextToSize("Der Einsatz ist nach Zeit bemessen; die Zahl der bearbeiteten Bäume stand vorher nicht fest. Die Beurteilung gilt für den genannten Arbeitsbereich und die dort gleichartigen Bedingungen. Weicht ein Baum davon ab, wird die Arbeit an diesem Baum unterbrochen und gesondert beurteilt.", CW)) { doc.text(ln, M, y); y += 9; }
  }
  y += 5;

  // Unterschriften: nebeneinander statt untereinander (Ein-Blatt-Layout),
  // Bildhoehe/Linie/Text-Box entsprechend knapper.
  seite(112);
  const ortDatum = [k.einsatzort || r.kunde?.name || "", dt(k.datum)].filter(Boolean).join(", ");
  font(false, 8.5); doc.text(`Ort und Datum: ${ortDatum}`, M, y); y += 7;
  const aufsichtIstUser = String(k.aufsicht || "").trim() === String(r.userName || "").trim();
  const sigs = [
    { img: r.sigDurchfuehrender, text: `Unterschrift Aufsichtsführende(r): ${k.aufsicht || r.userName || ""}${aufsichtIstUser ? "" : ` — unterschrieben durch ${r.userName || "Durchführende(r)"}`}` },
    ...(r.sigZweitePerson || r.zugang === "skt" ? [{ img: r.sigZweitePerson, text: `${r.zweitePersonName || "Zweite Person"} (${r.zugang === "skt" ? "zweite rettungsfähige Person, DGUV R 112-199" : "zweite Person"})` }] : []),
  ];
  let x = M;
  const sigTop = y;
  for (const s of sigs) {
    if (s.img) {
      try {
        const props = doc.getImageProperties(s.img);
        const scale = Math.min(230 / props.width, 56 / props.height);
        const w = props.width * scale, h = props.height * scale;
        doc.addImage(s.img, String(s.img).startsWith("data:image/png") ? "PNG" : "JPEG", x + (230 - w) / 2, sigTop + (56 - h), w, h);
      } catch (_) {}
    }
    doc.setDrawColor(...GRAY); doc.setLineWidth(0.5); doc.line(x, sigTop + 62, x + 230, sigTop + 62);
    font(false, 8); doc.text(doc.splitTextToSize(s.text, 230), x, sigTop + 73);
    x += 260;
  }
  y = sigTop + 92;

  // Fußzeile: Nachweisfunktion, Grund-GBU, Legende — Wortlaut unveraendert,
  // nur kleiner gesetzt (6,5pt/7,5pt statt 7pt/8,5pt; Fliesstext, keine
  // Beschriftung, darf unter die 6,5pt-Grenze für Labels gehen).
  seite(34);
  font(false, 6.5, GRAY);
  const fuss = [
    "Arbeitstägliche Beurteilung vor Arbeitsbeginn nach §§ 5, 6 ArbSchG i. V. m. den SVLFG-Vorschriften (VSG); Aufbewahrung als Dokumentation gem. § 6 ArbSchG. Ergänzt den tätigkeitsbezogenen Grundlagenteil der Gefährdungsbeurteilung des Betriebs (Fassung 2 vom 07.08.2026) sowie die SVLFG-Vorlage GBU-W-C006 Seilklettertechnik.",
    "A = automatisch vorbelegt (GPS, Kundenadresse, Wetter, Netz, Fristen, Qualifikationen, Kataster) und von der aufsichtsführenden Person so bestätigt; ohne A = von Hand eingetragen oder geändert. Kästchen: X = ja, „nein“ = verneint, „offen“ = nicht beurteilt.",
    `Erstellt ${appName ? `mit der ${appName}-App ` : "mit der App "}am ${new Date(r.createdAt).toLocaleDateString("de-DE")} um ${new Date(r.createdAt).toLocaleTimeString("de-DE")}.`,
  ];
  for (const t of fuss) for (const ln of doc.splitTextToSize(t, CW)) { seite(8); doc.text(ln, M, y); y += 7.5; }
}
