// Kunden-Bericht Baumkataster (PDF). Aufbau wie gbu-pdf.js: jsPDF lazy
// (nach dem ersten Laden auch offline), in Node testbar, reproduzierbar.
// Deckblatt mit Zusammenfassung (optional Kartenbild), Tabelle aller Bäume,
// je Baum letzte Kontrolle mit Befund + offene Maßnahmen + Unterschrift.
import { bkBerichtDaten } from "./baumkataster.js";
import { BK_BEFUND_LABEL, BK_DRINGLICHKEIT, BK_VERKEHRSSICHER, BK_VITALITAET } from "./baumkataster-data.js";
import { sha256Hex } from "./paperless.js";

const deDatum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
};
const AMPEL = { gruen: [46, 125, 50], gelb: [245, 159, 0], rot: [201, 42, 42], grau: [134, 142, 150] };
const AMPEL_TEXT = { gruen: "in Ordnung", gelb: "fällig", rot: "überfällig", grau: "keine Kontrolle" };
const SICHER_TEXT = Object.fromEntries(BK_VERKEHRSSICHER.map((v) => [v.id, v.label]));
const VITAL_TEXT = Object.fromEntries(BK_VITALITAET.map((v) => [v.stufe, v.text]));
const DRINGL_TEXT = Object.fromEntries(BK_DRINGLICHKEIT.map((d) => [d.id, d.label]));

const sanitize = (s) => String(s || "")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
  .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
  .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Kunde";

export const bkBerichtDateiname = (store, heute) => `Baumkataster_${sanitize(store?.kunde?.name)}_${heute}.pdf`;

/** Liefert Base64 ohne Data-URL-Präfix. */
export async function buildBaumkatasterPdf(store, { heute, filter = {}, kartenBild = null, betrieb } = {}) {
  // Kopfzeile aus dem Mandanten — ein fremder Betrieb trägt nie Blattwerks Anschrift.
  const betriebZeile = [`${betrieb?.gewerk ? betrieb.gewerk + " " : ""}${betrieb?.name || ""}`.trim(), betrieb?.anschrift || betrieb?.ort || ""].filter(Boolean).join(" · ");
  const { jsPDF } = await import("jspdf");
  const daten = bkBerichtDaten(store, filter, heute);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // Reproduzierbar (siehe buildGbuPdf): Erstellungsdatum = Berichtsdatum,
  // Datei-Id aus dem Inhalt statt zufällig.
  doc.setCreationDate(new Date(`${daten.erstellt}T12:00:00Z`));
  const kennung = `bk|${daten.kunde.id}|${daten.erstellt}|` + daten.baeume.map((b) => `${b.nr}:${b.letzteKontrolle?.id || ""}:${b.offeneMassnahmen.length}`).join(",");
  doc.setFileId((await sha256Hex(new Blob([kennung]))).slice(0, 32));

  const W = 595.28, M = 42, CW = W - 2 * M;
  const GREEN = [46, 125, 50], GRAY = [110, 118, 129], DARK = [25, 30, 36];
  let y = 0;
  const pageBreak = (need = 40) => { if (y + need > 800) { doc.addPage(); y = M; } };
  const text = (str, x, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(...(opts.color || DARK));
    const lines = doc.splitTextToSize(String(str), opts.width || CW - (x - M));
    for (const ln of lines) { pageBreak(14); doc.text(ln, x, y); y += opts.lh || 13; }
  };
  const kv = (k, v) => {
    pageBreak(16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(String(k), M, y);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(String(v ?? "—"), CW - 160);
    doc.text(lines, M + 160, y);
    y += Math.max(13, lines.length * 12);
  };
  const abschnitt = (titel) => {
    y += 10; pageBreak(30);
    text(titel, M, { bold: true, size: 9, color: GRAY });
    doc.setDrawColor(...GRAY); doc.line(M, y - 8, W - M, y - 8); y += 2;
  };
  const kopf = (titel) => {
    doc.setFillColor(...GREEN); doc.rect(0, 0, W, 86, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(titel, M, 26);
    doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
    doc.text(betriebZeile, M, 43);
    doc.setFontSize(8);
    doc.text("Baumkontrolle nach FLL-Baumkontrollrichtlinie; Maßnahmen nach ZTV-Baumpflege. Verkehrssicherungspflicht des Eigentümers (§ 823 BGB).", M, 58);
    y = 106;
  };

  // ── Deckblatt
  kopf("Baumkataster — Bericht");
  kv("Kunde", daten.kunde.name || `Kunde ${daten.kunde.id ?? ""}`);
  kv("Stand", deDatum(daten.erstellt));
  const z = daten.zusammenfassung;
  kv("Bäume im Bericht", z.anzahl);
  kv("davon kontrolliert", z.kontrolliert);
  kv("Kontrolle/Maßnahme fällig", z.faellig);
  kv("nicht verkehrssicher", z.nichtVerkehrssicher);
  kv("offene Maßnahmen", z.offeneMassnahmen);
  if (kartenBild) {
    // Optional; ein unbrauchbares Bild darf den Bericht nicht verhindern.
    try { pageBreak(CW * 0.6 + 20); doc.addImage(kartenBild, "PNG", M, y, CW, CW * 0.6); y += CW * 0.6 + 10; } catch (_) { /* ohne Karte */ }
  }

  // ── Tabelle aller Bäume
  abschnitt("Übersicht");
  const spalten = [["Nr.", 48], ["Art", 120], ["Objekt / Standort", 130], ["Letzte", 58], ["Nächste", 58], ["Sicherheit", 62], ["Offen", 35]];
  const zeile = (werte, fett = false, farbe = null) => {
    doc.setFont("helvetica", fett ? "bold" : "normal"); doc.setFontSize(8.5);
    const gebrochen = werte.map((w, i) => doc.splitTextToSize(String(w ?? "—"), spalten[i][1] - 4));
    const h = Math.max(...gebrochen.map((g) => g.length)) * 10 + 4;
    pageBreak(h);
    let x = M;
    gebrochen.forEach((g, i) => { doc.setTextColor(...(farbe && i === 5 ? farbe : DARK)); doc.text(g, x + 2, y); x += spalten[i][1]; });
    y += h;
    doc.setDrawColor(225, 228, 232); doc.line(M, y - 3, W - M, y - 3);
  };
  zeile(spalten.map((s) => s[0]), true);
  for (const b of daten.baeume) {
    const k = b.letzteKontrolle;
    zeile([b.nr, b.art, [b.objekt, b.standort].filter(Boolean).join(" · "), k ? deDatum(k.datum) : "—", deDatum(b.naechsteKontrolle),
      k ? SICHER_TEXT[k.verkehrssicher] || k.verkehrssicher : "—", b.offeneMassnahmen.length], false, AMPEL[b.sicherheit]);
  }

  // ── Je Baum
  for (const b of daten.baeume) {
    doc.addPage(); y = M;
    text(`${b.nr} — ${b.art}${b.artLat && b.artLat !== b.art ? ` (${b.artLat})` : ""}`, M, { bold: true, size: 13 });
    y += 4;
    kv("Objekt / Standort", [b.objekt, b.standort].filter(Boolean).join(" · ") || "—");
    kv("Stammumfang / Höhe / Krone", `${b.stammumfangCm ?? "—"} cm / ${b.hoeheM ?? "—"} m / ${b.kronendurchmesserM ?? "—"} m`);
    kv("Altersphase / Schutz", `${b.altersphase || "—"} / ${b.schutz}`);
    kv("Kontrollstand", `${AMPEL_TEXT[b.kontrollstand]} — nächste Kontrolle ${deDatum(b.naechsteKontrolle)}`);
    const k = b.letzteKontrolle;
    abschnitt("Letzte Kontrolle");
    if (!k) text("Noch keine Kontrolle erfasst.", M, { color: GRAY });
    else {
      kv("Datum / Art", `${deDatum(k.datum)} · ${k.artKontrolle}`);
      kv("Kontrolleur", k.kontrolleur || "—");
      kv("Vitalität", VITAL_TEXT[k.vitalitaet] || k.vitalitaet);
      kv("Verkehrssicherheit", SICHER_TEXT[k.verkehrssicher] || k.verkehrssicher);
      for (const bereich of Object.keys(BK_BEFUND_LABEL)) {
        const liste = k.befund?.[bereich] || [];
        kv(BK_BEFUND_LABEL[bereich], liste.length ? liste.join(", ") : "ohne Befund");
      }
      if (k.bemerkung) kv("Bemerkung", k.bemerkung);
      if (k.fotos?.length) kv("Fotos", k.fotos.join(", "));
      if (k.unterschrift) {
        pageBreak(70);
        try { doc.addImage(k.unterschrift, "JPEG", M + 160, y, 160, 46); } catch (_) { /* ohne Bild */ }
        doc.setFontSize(8); doc.setTextColor(...GRAY); doc.text("Unterschrift Kontrolleur", M, y + 40);
        y += 56;
      }
    }
    abschnitt("Offene Maßnahmen");
    if (!b.offeneMassnahmen.length) text("Keine.", M, { color: GRAY });
    for (const m of b.offeneMassnahmen) {
      text(`• ${m.art} — ${DRINGL_TEXT[m.dringlichkeit] || m.dringlichkeit}, bis ${deDatum(m.faelligBis)}${m.status === "beauftragt" ? " (beauftragt)" : ""}${m.bemerkung ? ` — ${m.bemerkung}` : ""}`, M);
    }
  }

  // Seitenzahlen
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(`Baumkataster ${daten.kunde.name || ""} · Stand ${deDatum(daten.erstellt)} · Seite ${i}/${n}`, W - M, 820, { align: "right" });
  }
  return doc.output("datauristring").split(",")[1];
}
