// PDF der Fahrzeug-Überlassungsvereinbarung — A4 hoch, Logo, Aufbau exakt nach
// der abgenommenen Papiervorlage `docs/fahrzeug-ueberlassung-papier.html`:
// Marke + Titel, Untertitel mit Kennzeichen und § 21 StVG, vier nummerierte
// Abschnitte, Kasten unter 3., nummerierte Pflichtenliste unter 4., zwei
// Unterschriftsspalten, Fußnote. Der Unterschied zum Papier: die Felder sind
// gefüllt statt leer — die Linie bleibt trotzdem stehen, damit das Blatt
// wiedererkennbar ist.
//
// **Ein Renderer, zwei Ausgaben.** `leer: true` zeichnet dasselbe Blatt ohne
// Werte: das Leerformular zum Ausdrucken und Ausfüllen von Hand (Schreibhöhe
// 9,4 mm wie auf dem Papier). Deshalb sind die Beschriftungen **schwarz und
// halbfett**, nicht grau in Kapitälchen — grau ist auf Papier und unter der
// Handschrift kaum zu lesen. Beide Wege müssen durch diese eine Funktion,
// sonst laufen gedrucktes und digitales Blatt auseinander.
//
// Diese Datei *zeichnet* nur. Was gezeichnet wird, sagt `uebAbschnitte` in
// src/ueberlassung.js; die Vorlage selbst ist in test/ueberlassung/vorlage.test.js
// gegen die HTML-Datei gespannt. Wer hier ein Feld vermisst, ändert dort.
// Clientseitig, jsPDF lazy, in Node testbar, reproduzierbar über Erstellungs-
// datum + Datei-ID aus dem Datensatz.
import { UEB_FUSSNOTE, UEB_TITEL, UEB_UNTERSCHRIFTEN, UEB_UNTERTITEL, uebAbschnitte, uebBetriebNamen, uebDatumDE } from "./ueberlassung.js";
import { sha256Hex } from "./paperless.js";

const mm = (n) => (n * 72) / 25.4;

/**
 * `betrieb` kommt vom Aufrufer (mandantBetrieb(), src/betrieb.js) — hier steht
 * kein Firmenname mehr fest (Abschlusspruefung 18.09.2026, Befund I4).
 *
 * Ohne Firmennamen wird verweigert, aus demselben Grund wie bei buildGbuPdf:
 * eine Ueberlassungsvereinbarung ohne erkennbaren Vertragspartner ist kein
 * Nachweis nach § 21 StVG, sondern ein Blatt, das nur so aussieht. Lieber ein
 * Fehler beim Erzeugen als eine Unterschrift unter der falschen Firma.
 *
 * Auch `logo` gehoert dem Mandanten: der Aufrufer laedt `betrieb.logo`, nicht
 * fest "/logo.png" — das ist Blattwerks Logo-Datei.
 */
export async function buildUeberlassungPdf(v, { logo, leer = false, betrieb } = {}) {
  if (!uebBetriebNamen(betrieb).lang) {
    throw new Error("buildUeberlassungPdf: betrieb.name fehlt — ohne Vertragspartner wird keine Überlassungsvereinbarung erzeugt.");
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const erstellt = new Date(v.erfasstAm || Date.now());
  doc.setCreationDate(erstellt);
  doc.setFileId((await sha256Hex(new Blob(["ueberlassung|" + String(v.id || "") + "|" + erstellt.toISOString()]))).slice(0, 32));

  const W = 595.28, H = 841.89;
  const L = mm(16), R = W - mm(16), CW = R - L, UNTEN = H - mm(11);
  const DARK = [17, 17, 17], MID = [34, 34, 34];
  let y = mm(13);

  const umbruch = (platz) => { if (y + platz > UNTEN) { doc.addPage(); y = mm(13); return true; } return false; };
  const setzen = (stil, groesse, farbe) => { doc.setFont("helvetica", stil); doc.setFontSize(groesse); doc.setTextColor(...farbe); };

  // ── Marke: Logo + Titel, darunter Betrieb/Kennzeichen/§ 21 StVG
  let tx = L;
  if (logo) { try { doc.addImage(logo, "PNG", L, y, mm(14), mm(14)); tx = L + mm(18); } catch (_) {} }
  setzen("bold", 17, DARK);
  doc.text(UEB_TITEL, tx, y + mm(9));
  y += mm(16);
  setzen("normal", 8.5, MID);
  for (const ln of doc.splitTextToSize(UEB_UNTERTITEL(v, betrieb), CW)) { doc.text(ln, L, y); y += 11; }
  y += mm(3);

  // ── Abschnitte 1–4
  for (const a of uebAbschnitte(v, { leer, betrieb })) {
    umbruch(60);
    setzen("bold", 10, DARK);
    doc.text(`${a.nr}. ${a.titel}`, L, y);
    y += 4;
    doc.setDrawColor(...DARK); doc.setLineWidth(0.6); doc.line(L, y, R, y);
    y += mm(4.2);

    // Felder in Zeilen, Breiten wie auf dem Papier (Summe je Zeile = 1).
    // `.feld` ist dort 9,4 mm hoch, die Beschriftung sitzt unmittelbar über der
    // Linie — der Platz darüber ist der Schreibraum für die Handschrift.
    let zeile = [], breite = 0;
    const zeileZeichnen = (felder) => {
      if (!felder.length) return;
      const hoehe = mm(9.4) + mm(1.8);
      umbruch(hoehe + 4);
      let x = L;
      for (const f of felder) {
        const w = f.breite * CW - (f.breite < 1 ? mm(6) : 0);
        // Der Wert steht auf der Linie, eine Zeile wie auf dem Papier: lieber
        // kleiner setzen als abschneiden, erst unter 6,5 pt wird gekürzt.
        let groesse = 11, wert = String(f.wert || "");
        if (wert) {
          setzen("normal", groesse, DARK);
          while (doc.getTextWidth(wert) > w && groesse > 6.5) { groesse -= 0.5; doc.setFontSize(groesse); }
          while (doc.getTextWidth(wert) > w && wert.length > 1) wert = wert.slice(0, -2) + "…";
          doc.text(wert, x, y + mm(5.4));
        }
        doc.setDrawColor(...DARK); doc.setLineWidth(0.7);
        doc.line(x, y + mm(9.4), x + w, y + mm(9.4));
        // Beschriftung: schwarz und halbfett direkt über der Linie (Vorlage:
        // 7,4 pt, font-weight 600) — grau war auf dem Ausdruck zu blass.
        setzen("bold", 7.4, DARK);
        doc.text(String(f.label), x, y + mm(8.6));
        x += f.breite * CW;
      }
      y += hoehe;
    };
    for (const f of a.felder || []) {
      if (breite + f.breite > 1.001) { zeileZeichnen(zeile); zeile = []; breite = 0; }
      zeile.push(f); breite += f.breite;
    }
    zeileZeichnen(zeile);

    // Kasten unter „3. Überlassung": Ankreuzfelder wie auf dem Papier.
    if (a.kasten?.length) {
      y += mm(1.5);
      setzen("normal", 9.2, DARK);
      const zeilen = a.kasten.map((k) => doc.splitTextToSize(k.text, CW - mm(9)));
      const innen = zeilen.reduce((n, z) => n + z.length * 11.5, 0) + mm(4);
      umbruch(innen + 6);
      const oben = y;
      let ky = y + mm(2) + 8;
      for (const [i, z] of zeilen.entries()) {
        doc.setDrawColor(...DARK); doc.setLineWidth(0.6);
        doc.rect(L + mm(3), ky - 7.5, 9, 9, "S");
        if (a.kasten[i].bestaetigt) { doc.setLineWidth(1); doc.line(L + mm(3) + 2, ky - 3.4, L + mm(3) + 4, ky - 1); doc.line(L + mm(3) + 4, ky - 1, L + mm(3) + 7.5, ky - 6.5); }
        setzen("normal", 9.2, DARK);
        for (const ln of z) { doc.text(ln, L + mm(9), ky); ky += 11.5; }
      }
      doc.setDrawColor(...DARK); doc.setLineWidth(0.6);
      doc.rect(L, oben, CW, innen, "S");
      y = oben + innen + mm(1.5);
    }

    // Nummerierte Pflichtenliste unter „4. Pflichten".
    if (a.punkte?.length) {
      setzen("normal", 9.1, DARK);
      for (const [i, p] of a.punkte.entries()) {
        const z = doc.splitTextToSize(p.text, CW - mm(6));
        umbruch(z.length * 11.5 + 4);
        setzen("normal", 9.1, DARK);
        doc.text(`${i + 1}.`, L, y + 8);
        let py = y + 8;
        for (const ln of z) { doc.text(ln, L + mm(6), py); py += 11.5; }
        // `py` steht eine Zeile unter der letzten Grundlinie — die zaehlt nicht
        // mit, sonst waechst jeder Punkt um eine Leerzeile und das Blatt
        // laeuft auf Seite 2 ueber.
        y = py - 11.5 + mm(2.4);
      }
    }
    y += mm(3.6);
  }

  // Bemerkung: steht nicht auf der Papiervorlage und ist deshalb kein Feld,
  // gehört aber aufs unterschriebene Blatt — sonst steht sie nur in der JSON
  // und niemand hat sie je gesehen. Auf dem Leerformular entfällt sie.
  if (!leer && String(v.bemerkung || "").trim()) {
    setzen("normal", 9.1, DARK);
    const z = doc.splitTextToSize("Bemerkung: " + String(v.bemerkung).trim(), CW);
    umbruch(z.length * 11.5 + 8);
    for (const ln of z) { doc.text(ln, L, y + 8); y += 11.5; }
    y += mm(1.5);
  }

  // ── Unterschriften: zwei Spalten wie auf dem Papier, Bilder über der Linie.
  // Unterschriften und Fußnote werden zusammen umbrochen — ein Blatt, auf dem
  // die Unterschriftslinien allein auf Seite 2 stehen, unterschreibt niemand.
  const fussZeilen = doc.splitTextToSize(UEB_FUSSNOTE, CW).length;
  const schwanz = mm(23) + 34 + fussZeilen * 9.5 + 12;
  y += mm(6);
  umbruch(schwanz);
  const spalte = (CW - mm(12)) / 2, oben = y;
  for (const [i, u] of UEB_UNTERSCHRIFTEN(v, betrieb).entries()) {
    const x = L + i * (spalte + mm(12));
    const bild = leer ? null : v[u.bild];
    if (bild) {
      try {
        const eig = doc.getImageProperties(bild);
        const skala = Math.min(spalte / eig.width, mm(20) / eig.height);
        const bw = eig.width * skala, bh = eig.height * skala;
        doc.addImage(bild, String(bild).startsWith("data:image/png") ? "PNG" : "JPEG", x + (spalte - bw) / 2, oben + mm(22) - bh, bw, bh);
      } catch (_) {}
    }
    doc.setDrawColor(...DARK); doc.setLineWidth(0.6);
    doc.line(x, oben + mm(23), x + spalte, oben + mm(23));
    setzen("normal", 8.2, DARK);
    let uy = oben + mm(23) + 10;
    for (const ln of doc.splitTextToSize(u.rolle, spalte)) { doc.text(ln, x, uy); uy += 9.5; }
    if (!leer && u.name) { setzen("normal", 8.5, DARK); doc.text(doc.splitTextToSize(u.name, spalte).slice(0, 1), x, uy + 2); }
  }
  y = oben + mm(23) + 38;

  // ── Fußnote wie auf dem Papier, darunter die Herkunft des Blattes
  setzen("normal", 7.6, MID);
  for (const ln of doc.splitTextToSize(UEB_FUSSNOTE, CW)) { doc.text(ln, L, y); y += 9.5; }
  if (!leer) {
    // Herkunft des Blattes: Sitz der Firma, Datum, App-Name — alles aus dem
    // Mandanten. Vorher stand hier der eigene Ort fest, … · erstellt mit der
    // Blattwerk-App." (Befund I4; die Variable heisst `datum`, frueher
    // missverstaendlich `ort`). Fehlt ein Teil, faellt er weg, statt eine
    // haengende Kommastelle oder "erstellt mit der -App" zu hinterlassen.
    const datum = uebDatumDE(String(v.erfasstAm || "").slice(0, 10)) || uebDatumDE(v.von);
    const herkunft = [String(betrieb?.ort || "").trim(), datum].filter(Boolean).join(", ");
    const appName = String(betrieb?.appName || "").trim();
    const zeile = [herkunft, appName ? `erstellt mit der ${appName}-App.` : ""].filter(Boolean).join(" · ");
    if (zeile) doc.text(herkunft && !appName ? zeile + "." : zeile, L, y + 3);
  }

  return doc.output("datauristring").split(",")[1];
}
