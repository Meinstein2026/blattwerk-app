// Fahrtenbuch als PDF — das Papierformular 1:1 (Vorlage docs/fahrtenbuch-
// papier.html, A4 quer): Logo + „Fahrtenbuch", Kopffelder Fahrzeug/Kennzeichen,
// Zeitraum, Blatt; 7 Spalten Datum | km-Stand Beginn | Ende | Ziel | Zweck |
// Art (B/W/P) | Fahrer; 14 Zeilen je Blatt; Fußzeile = Legende. Storno-Zeilen
// bleiben durchgestrichen stehen, Änderungsvermerke stehen klein unter der
// Legende (auf Papier: durchstreichen, lesbar lassen, neu eintragen).
// jsPDF lazy geladen (nach dem ersten Laden auch offline), in Node testbar.
import { BLATT_ZEILEN, fahrtenBlaetter, fbDatumDE, kuerzelAus, zeileAusFahrt } from "./fahrtenbuch.js";
import { sha256Hex } from "./paperless.js";

const MM = 2.8346;
const W = 841.89, H = 595.28, M = 10 * MM;
// Spaltenbreiten wie im Formular (mm); Zweck nimmt den Rest.
const SPALTEN = [
  { k: "datum", t: "Datum", b: 24 },
  { k: "kmBeginn", t: "km-Stand\nBeginn", b: 24, r: true },
  { k: "kmEnde", t: "km-Stand\nEnde", b: 24, r: true },
  { k: "ziel", t: "Ziel", b: 52 },
  { k: "zweck", t: "Zweck / Kunde, Auftrag", b: 0 },
  { k: "art", t: "Art\nB · W · P", b: 18, c: true },
  { k: "fahrer", t: "Fahrer", b: 34 },
];
const ZEILE_H = 10.2 * MM, KOPF_H = 9.5 * MM;

export async function buildFahrtenbuchPdf(store, { jahr, fahrzeugId, erstelltAm, logo } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const erstellt = erstelltAm ? new Date(erstelltAm) : new Date();
  doc.setCreationDate(erstellt);
  // Datei-ID muss 32 Hex-Zeichen sein — sonst verwirft jsPDF sie still und
  // würfelt, und zwei Exporte desselben Stands wären nie byte-gleich.
  doc.setFileId((await sha256Hex(new Blob(["fahrtenbuch|" + (jahr || "alle") + "|" + (fahrzeugId || "alle") + "|" + erstellt.toISOString()]))).slice(0, 32));

  const fahrzeuge = (store?.fahrzeuge || []).filter((v) => !fahrzeugId || v.id === fahrzeugId);
  const imJahr = (f) => !jahr || String(f.datum || "").startsWith(String(jahr) + "-");
  const breiten = SPALTEN.map((sp) => sp.b * MM);
  const fest = breiten.reduce((a, b) => a + b, 0);
  breiten[4] = W - 2 * M - fest;
  let seite = 0, anzahl = 0;

  const blatt = (fz, bl) => {
    if (seite > 0) doc.addPage();
    seite++;
    // Kopf: Logo + Titel links, drei Felder rechts
    let x = M;
    if (logo) { try { doc.addImage(logo, "PNG", M, M, 14 * MM, 14 * MM); x = M + 18 * MM; } catch (_) { x = M; } }
    doc.setTextColor(17, 17, 17); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("Fahrtenbuch", x, M + 12 * MM);
    const felder = [
      ["Fahrzeug / Kennzeichen", [fz.name, fz.kennzeichen].filter(Boolean).join(" · "), 70],
      ["Zeitraum", bl.von ? `${fbDatumDE(bl.von)} – ${fbDatumDE(bl.bis)}` : "", 55],
      ["Blatt", String(bl.nr), 20],
    ];
    let fx = W - M - felder.reduce((s, f) => s + f[2] * MM, 0) - 4 * MM * (felder.length - 1);
    for (const [label, wert, breite] of felder) {
      doc.setFontSize(7); doc.setTextColor(68, 68, 68); doc.setFont("helvetica", "normal");
      doc.text(label.toUpperCase(), fx, M + 7 * MM);
      doc.setFontSize(12); doc.setTextColor(17, 17, 17); doc.setFont("helvetica", "bold");
      doc.text(doc.splitTextToSize(wert || "", breite * MM)[0] || "", fx, M + 12.5 * MM);
      doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6); doc.line(fx, M + 14 * MM, fx + breite * MM, M + 14 * MM);
      fx += breite * MM + 4 * MM;
    }
    // Tabelle
    let y = M + 18 * MM;
    const xs = []; let xx = M; for (const b of breiten) { xs.push(xx); xx += b; }
    const xEnd = xx;
    doc.setLineWidth(0.6); doc.setDrawColor(17, 17, 17);
    const zelle = (cx, cy, b, h, fill) => { if (fill) { doc.setFillColor(...fill); doc.rect(cx, cy, b, h, "FD"); } else doc.rect(cx, cy, b, h, "S"); };
    SPALTEN.forEach((sp, i) => {
      zelle(xs[i], y, breiten[i], KOPF_H, [234, 234, 234]);
      const zeilen = sp.t.split("\n");
      zeilen.forEach((t, j) => {
        const klein = j > 0 && sp.k === "art";
        doc.setFont("helvetica", klein ? "normal" : "bold"); doc.setFontSize(klein ? 8 : 9); doc.setTextColor(17, 17, 17);
        const lh = 10; const start = y + KOPF_H / 2 - ((zeilen.length - 1) * lh) / 2 + 3.2;
        doc.text(t, xs[i] + breiten[i] / 2, start + j * lh, { align: "center" });
      });
    });
    y += KOPF_H;
    const vermerke = [];
    for (let i = 0; i < BLATT_ZEILEN; i++) {
      const f = bl.fahrten[i];
      const fill = i % 2 === 1 ? [250, 250, 250] : null;
      SPALTEN.forEach((sp, ci) => zelle(xs[ci], y, breiten[ci], ZEILE_H, fill));
      if (f) {
        const z = zeileAusFahrt(f);
        const fremd = !imJahr(f);
        if (!fremd) anzahl++;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
        doc.setTextColor(...(f.storniert ? [176, 0, 0] : fremd ? [150, 150, 150] : [17, 17, 17]));
        const werte = { ...z, datum: fbDatumDE(z.datum) };
        SPALTEN.forEach((sp, ci) => {
          const t = doc.splitTextToSize(String(werte[sp.k] ?? ""), breiten[ci] - 5)[0] || "";
          const ty = y + ZEILE_H / 2 + 3.3;
          if (sp.r) doc.text(t, xs[ci] + breiten[ci] - 3, ty, { align: "right" });
          else if (sp.c) doc.text(t, xs[ci] + breiten[ci] / 2, ty, { align: "center" });
          else doc.text(t, xs[ci] + 3, ty);
        });
        if (f.storniert) { doc.setDrawColor(176, 0, 0); doc.setLineWidth(0.9); doc.line(M + 2, y + ZEILE_H / 2, xEnd - 2, y + ZEILE_H / 2); doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6); }
        for (const h of Array.isArray(f.historie) ? f.historie : []) {
          vermerke.push(`Zeile ${i + 1}${f.storniert ? " (Storno)" : ""}: ${fbDatumDE(String(h.geaendertAm || "").slice(0, 10))} ${kuerzelAus(h.geaendertVon) || h.geaendertVon || ""} – ${h.grund || ""}`);
        }
      }
      y += ZEILE_H;
    }
    y += 2.5 * MM + 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(51, 51, 51);
    let lx = M;
    for (const [fett, rest] of [["B", " betrieblich (Kunde/Auftrag) · "], ["W", " Wohnung–Betrieb · "], ["P", " privat (nur km-Stände nötig) — sofort nach der Fahrt eintragen, Fehler durchstreichen statt radieren."]]) {
      doc.setFont("helvetica", "bold"); doc.text(fett, lx, y); lx += doc.getTextWidth(fett);
      doc.setFont("helvetica", "normal"); doc.text(rest, lx, y); lx += doc.getTextWidth(rest);
    }
    if (vermerke.length) {
      doc.setTextColor(176, 0, 0); doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
      doc.text("Änderungsvermerke: " + vermerke.join(" | "), M, y + 11, { maxWidth: xEnd - M });
    }
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 120); doc.setFont("helvetica", "normal");
    // Prüfkette: Stand der Hash-Kette zum Zeitpunkt des Ausdrucks. Stimmt sie
    // später nicht mehr mit dem Speicher überein, wurde nachträglich geändert.
    const kette = store?.kette?.n ? ` · Prüfkette ${store.kette.n} Vorgänge, SHA-256 ${store.kette.hash}` : "";
    doc.text(`Erstellt ${erstellt.toLocaleDateString("de-DE")} · Seite ${seite}${kette}`, W - M, H - 5 * MM, { align: "right" });
  };

  for (const fz of fahrzeuge) {
    const blaetter = fahrtenBlaetter(store, { fahrzeugId: fz.id }).filter((bl) => !jahr || bl.fahrten.some(imJahr) || (bl.nr === 1 && !bl.fahrten.length));
    for (const bl of blaetter) blatt(fz, bl);
  }
  if (!seite) blatt({ name: "", kennzeichen: "" }, { nr: 1, fahrten: [], von: "", bis: "", summe: { betrieblich: 0, wohnungBetrieb: 0, privat: 0 } });

  const base64 = doc.output("datauristring").split(",")[1];
  return { base64, seiten: doc.getNumberOfPages(), anzahl };
}
