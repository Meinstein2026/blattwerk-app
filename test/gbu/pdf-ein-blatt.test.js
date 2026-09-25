// Abnahme "GBU-PDF auf ein Blatt" (../blattwerk-betrieb/docs/superpowers/specs/2026-09-17-gbu-pdf-ein-blatt-design.md):
// beide Muster-Faelle aus scripts/gbu-v3-muster.mjs erzeugen, ueber pdfinfo auf
// GENAU eine Seite pruefen und ueber den mit pdftotext extrahierten Text
// belegen, dass die langen Freitexte vollstaendig (nicht abgeschnitten) drin
// stehen. Bewusst OHNE `-layout`: bei den zweispaltigen Kaesten (Baustellencheck)
// reisst `-layout` einen mehrzeiligen Freitext der rechten Spalte auseinander
// und mischt Zeilen der linken Spalte dazwischen - das normale pdftotext folgt
// der Zeichenreihenfolge im Content-Stream (Spalte komplett, dann naechste
// Spalte) und liefert die Freitexte dadurch als einen zusammenhaengenden Block.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildGbuPdf } from "../../src/gbu-pdf.js";
import { musterKlein, musterVoll } from "../../scripts/gbu-v3-muster.mjs";

// Seit der Mandantenfähigkeit verlangt buildGbuPdf den Betrieb vom Aufrufer.
const BW = { betrieb: { name: "Blattwerk GbR", anschrift: "Musterstraße 1, 12345 Musterstadt", uvTraeger: "SVLFG", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk" } };

// Kein Netz im Test: musterVoll()/musterKlein() setzen kopf.karte nicht (bleibt
// beim gbuNeuV3()-Default null) - die echte OSM-Kachel laedt nur der
// Skript-Aufruf selbst (node scripts/gbu-v3-muster.mjs), nicht der Import hier.
const schreiben = async (record) => {
  const pdf = await buildGbuPdf(record, BW);
  const ziel = path.join(os.tmpdir(), `gbu-ein-blatt-test-${record.id}.pdf`);
  fs.writeFileSync(ziel, Buffer.from(pdf, "base64"));
  return ziel;
};

const seitenzahl = (pdfPfad) => {
  const info = execFileSync("pdfinfo", [pdfPfad], { encoding: "utf8" });
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
};

const text = (pdfPfad) => execFileSync("pdftotext", [pdfPfad, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");

// ─── Kasten-Ueberlappung erkennen (17.09.2026, Nachbesserung) ───────────────
// Ein reiner Seitenzahl-Test haette den gemeldeten Fehler nie gefunden: im
// kleinen Fall (Heckenschnitt vom Boden) lag der fette Erklaerungssatz nach
// der Freigabe-Box halb IN der Box - die untere Kastenlinie schnitt durch die
// erste Textzeile. Zwei GETRENNTE Ursachen kamen zusammen, beide mit
// GBU_DEBUG_BOX bzw. direkt am Content-Stream belegt (nicht geraten):
//
// 1) kasten()s Hoehenformel zaehlte den oberen Innenabstand (BOX_TOP) nicht
//    mit, obwohl das Zeichnen genau dort beginnt (y = oben + BOX_TOP) - jede
//    Box war dadurch um BOX_TOP-BOX_BOTTOM (4pt) zu knapp bemessen, bei
//    mehrzeiligen Kaesten durch Restplatz kaschiert, beim EINZEILIGEN
//    Freigabe-Kasten sichtbar. Gefixt: h zaehlt BOX_TOP jetzt mit.
// 2) Selbst mit korrektem h reichte der reine BOX_GAP (2pt) NICHT aus, um die
//    Oberlaenge einer fetten 8,5pt-Zeile (~6pt hoch) zu decken - ein
//    Kastentitel bekommt diese Reserve automatisch (er wird bei y+7
//    gezeichnet), der Freigabesatz direkt nach der Box nicht. Gefixt: eigener
//    SATZ_ABSTAND vor dem Freigabesatz. Siehe freigabesatzAbstand()-Test unten.
//
// Dieser Test prueft NUR Ursache 1, direkt am rohen PDF-Content-Stream, nicht
// nur das Endergebnis: jsPDF zeichnet in fester Reihenfolge Titel -> Rechteck
// (der Kastenrahmen) -> Zeileninhalt -> naechster Titel. Fuer jeden Kasten wird
// darum a) sein Rahmen-Rechteck (Breite = CW, das erkennt jede der fuenf
// generischen Kaesten - Kopf- und Kartenkasten haben andere Breiten und sind
// hier nicht gemeint) und b) alle Textzeilen-Positionen (Td) VOR dem naechsten
// bekannten Titel bzw. vor dem Freigabesatz ("Auf Grundlage...") gesammelt.
// Die unterste (kleinste PDF-Y, da PDF-Y von unten nach oben zaehlt) dieser
// Zeilen darf die Kastenunterkante nicht unterschreiten. Ursache 2 (der
// tatsaechlich gemeldete Fehler) prueft separat freigabesatzAbstand() weiter
// unten - dieser Test allein haette den Fehler NICHT gefunden, weil der
// Freigabesatz bewusst als Grenz-Marker (nicht als Kasten-Inhalt) behandelt
// wird und dadurch aus "inhalt" ausgeschlossen ist.
const KASTEN_TITEL = ["Baustellencheck", "Baumcheck (Sicherheitsbeurteilung)", "Material- und Ausrüstungscheck", "Personalcheck", "Freigabe"];
const MINDESTABSTAND = 0.5; // pt - reine Gleichheit waere schon eine beruehrende Linie

const rohPdf = (pdfPfad) => fs.readFileSync(pdfPfad).toString("latin1");

/** Prueft fuer jeden der fuenf generischen Kaesten: Inhalt endet VOR (oberhalb) der Kastenunterkante. */
const kastenUeberlappungen = (raw) => {
  const rects = [...raw.matchAll(/34\.\d* ([\d.]+) 527\.\d* (-[\d.]+) re/g)]
    .map((m) => ({ index: m.index, ende: m.index + m[0].length, oben: Number(m[1]), h: Number(m[2]), unten: Number(m[1]) + Number(m[2]) }));
  const tds = [...raw.matchAll(/[\d.]+ ([\d.]+) Td/g)].map((m) => ({ index: m.index, y: Number(m[1]) }));
  // Das eigene Td des Grenz-Markers (naechster Titel bzw. Freigabesatz) muss
  // VON der Grenze ausgeschlossen werden - jsPDF schreibt "X Y Td\n(Text) Tj",
  // die Markersuche findet aber "(Text) Tj" und liegt damit HINTER dessen
  // eigenem Td. Ohne diese Korrektur zaehlte das erste Td des naechsten
  // Markers noch zum Inhalt des VORIGEN Kastens ("abstand" waere dadurch
  // trotz korrekt gezeichneter Box faelschlich negativ).
  const tdVorIndex = (marker) => {
    const kandidaten = tds.filter((td) => td.index < marker);
    return kandidaten.length ? kandidaten[kandidaten.length - 1].index : marker;
  };
  // In-PDF-Strings sind runde Klammern escaped ("\(", "\)") - "Baumcheck
  // (Sicherheitsbeurteilung)" steht im Content-Stream als
  // "Baumcheck \(Sicherheitsbeurteilung\)".
  const escapePdf = (s) => s.replace(/([()])/g, "\\$1");
  const titelStellen = KASTEN_TITEL
    .map((titel) => ({ titel, index: raw.indexOf(`(${escapePdf(titel)}) Tj`) }))
    .filter((t) => t.index !== -1)
    .sort((a, b) => a.index - b.index);
  const freigabesatzIndex = raw.indexOf("(Auf Grundlage");

  const befunde = [];
  titelStellen.forEach((t, i) => {
    // Das Rechteck DIESES Kastens ist das erste, dessen Position hinter dem Titel liegt.
    const rect = rects.find((r) => r.index > t.index);
    if (!rect) return;
    const naechsterMarker = titelStellen[i + 1]?.index ?? freigabesatzIndex;
    const grenze = tdVorIndex(naechsterMarker);
    const inhalt = tds.filter((td) => td.index > rect.ende && td.index < grenze);
    if (!inhalt.length) return;
    const unterste = Math.min(...inhalt.map((td) => td.y));
    befunde.push({ titel: t.titel, kastenUnterkante: rect.unten, unterste, abstand: unterste - rect.unten });
  });
  return befunde;
};

// ─── Freigabesatz-Abstand (der tatsaechlich gemeldete Fall) ─────────────────
// Der obige Test prueft nur, ob eine Zeile INNERHALB eines Kastens ueber
// dessen eigene Unterkante hinauslaeuft - das ist eine echte, separate
// Ursache (siehe Kommentar oben), erklaert aber NICHT den gemeldeten Fehler:
// der fette Erklaerungssatz ("Auf Grundlage...") wird ausserhalb des
// Freigabe-Kastens gezeichnet, direkt im Anschluss an "y = oben + h +
// BOX_GAP". Ein Kastentitel bekommt automatisch mehr Reserve (er wird bei
// y+7 gezeichnet), der Freigabesatz nicht - mit BOX_GAP allein (2pt) schneidet
// die Kastenlinie durch die Oberlaengen einer fetten 8,5pt-Zeile (ca. 6pt
// hoch). Gefixt mit einem zusaetzlichen SATZ_ABSTAND vor dem Freigabesatz;
// dieser Test prueft die Wirkung direkt am Content-Stream, unabhaengig von
// der Kasten-Hoehenformel.
const MIN_OBERLAENGE = 5; // pt - Oberlaenge einer fetten 8,5pt-Zeile ist ca. 6pt hoch
const freigabesatzAbstand = (raw) => {
  const rects = [...raw.matchAll(/34\.\d* ([\d.]+) 527\.\d* (-[\d.]+) re/g)]
    .map((m) => ({ unten: Number(m[1]) + Number(m[2]) }));
  const freigabeRect = rects[rects.length - 1]; // Freigabe ist immer der letzte der fuenf Kaesten
  const idxSatz = raw.indexOf("(Auf Grundlage");
  const tdDavor = [...raw.matchAll(/[\d.]+ ([\d.]+) Td/g)].filter((m) => m.index < idxSatz).pop();
  return freigabeRect.unten - Number(tdDavor[1]);
};

describe("GBU-PDF passt auf ein Blatt", () => {
  it("voller Fall (Baumpflege + SKT, alle Bloecke, lange Freitexte, beide Unterschriften): genau eine Seite", async () => {
    const ziel = await schreiben(musterVoll());
    expect(seitenzahl(ziel)).toBe(1);
  });

  it("kleiner Fall (Heckenschnitt vom Boden, ohne Baumcheck): genau eine Seite", async () => {
    const ziel = await schreiben(musterKlein());
    expect(seitenzahl(ziel)).toBe(1);
  });

  it("voller Fall: Standort/Zufahrt (zweizeilig) steht vollstaendig im extrahierten Text", async () => {
    const t = text(await schreiben(musterVoll()));
    expect(t).toContain("Schloss Freudenberg, Wald hinter dem Parkplatz, Zufahrt Ludwig-Erhard-Straße");
  });

  it("voller Fall: Sonstige Gefahren am Einsatzort (dreizeilig) steht vollstaendig im extrahierten Text", async () => {
    const t = text(await schreiben(musterVoll()));
    expect(t).toContain("Jugendgruppen, Spaziergänger mit Hunden im Einfahrtsbereich; Fallbereich für Schnittgut gesichert; Ankerpunkt tragfähig gewählt (Baumansprache!)");
  });

  it("voller Fall: Einschraenkungen f. Einsatz (zweizeilig) steht vollstaendig im extrahierten Text", async () => {
    const t = text(await schreiben(musterVoll()));
    expect(t).toContain("Abseilmaterial nachholen, bis dahin nur Totholz ohne Rigging; bei aufkommendem Wind über 40 km/h Kronenarbeit abbrechen");
  });

  it("voller Fall: Baumcheck-Freitext (dreizeilig) steht vollstaendig im extrahierten Text, ohne die Zeile darunter zu verschlucken", async () => {
    const t = text(await schreiben(musterVoll()));
    expect(t).toContain("gut, etwas Totholz im oberen Kronenbereich, weitere Kontrolle nach dem Schnitt empfohlen");
    // Regressionsschutz fuer den waehrend dieser Aufgabe gefundenen Bug: die
    // dritte Zeile lief unten aus dem Kasten und ueberlappte "Gesundheitszustand".
    expect(t).toContain("Gesundheitszustand");
  });

  it("voller Fall: beide Unterschriften stehen drin (SKT verlangt die zweite rettungsfaehige Person)", async () => {
    const t = text(await schreiben(musterVoll()));
    expect(t).toContain("Unterschrift Aufsichtsführende(r): Sebastian Vogel");
    expect(t).toContain("Max Muster (zweite rettungsfähige Person, DGUV R 112-199)");
  });

  it("kleiner Fall: kein Baumcheck, keine zweite Unterschrift, trotzdem alle Pflichtfelder mit Beschriftung sichtbar", async () => {
    const t = text(await schreiben(musterKlein()));
    expect(t).not.toContain("Baumcheck");
    expect(t).not.toContain("Baum ist sicher");
    expect(t).toContain("Unterschrift Aufsichtsführende(r): Max Muster");
    // Leere Pflichtfelder (kein Netz? doch vorhanden; Festnetz z. B. leer) duerfen
    // nicht verschwinden - die Beschriftung muss stehen bleiben.
    expect(t).toContain("Festnetz-Nr. vor Ort:");
    expect(t).toContain("Sonstige Gefahren am Einsatzort:");
  });

  it("voller Fall: kein Kasten-Inhalt reicht unter die eigene Kastenunterkante (alle fuenf Kaesten)", async () => {
    const befunde = kastenUeberlappungen(rohPdf(await schreiben(musterVoll())));
    expect(befunde.length).toBe(5); // Baustellencheck, Baumcheck, Material, Personalcheck, Freigabe
    for (const b of befunde) expect(b.abstand, `${b.titel}: Inhalt bis ${b.unterste}, Kastenunterkante bei ${b.kastenUnterkante}`).toBeGreaterThan(MINDESTABSTAND);
  });

  it("kleiner Fall: Freigabe-Kasten hat nur EINE Zeile - genau der Fall, in dem der Erklaerungssatz zuvor halb im Kasten lag", async () => {
    const befunde = kastenUeberlappungen(rohPdf(await schreiben(musterKlein())));
    expect(befunde.length).toBe(4); // kein Baumcheck bei Heckenschnitt vom Boden
    const freigabe = befunde.find((b) => b.titel === "Freigabe");
    expect(freigabe.abstand).toBeGreaterThan(MINDESTABSTAND);
    // Regressionswert: vor dem Fix war abstand hier -4 (Text lief 4pt unter die Linie).
    for (const b of befunde) expect(b.abstand, `${b.titel}: Inhalt bis ${b.unterste}, Kastenunterkante bei ${b.kastenUnterkante}`).toBeGreaterThan(MINDESTABSTAND);
  });

  it("beide Faelle: Freigabesatz hat genug Abstand zur Freigabe-Kastenlinie fuer die Oberlaengen einer fetten Zeile (der gemeldete Fehler)", async () => {
    for (const record of [musterVoll(), musterKlein()]) {
      const abstand = freigabesatzAbstand(rohPdf(await schreiben(record)));
      expect(abstand, `Freigabesatz-Abstand: ${abstand}pt`).toBeGreaterThan(MIN_OBERLAENGE);
    }
  });

  it("beide Faelle: nichts wurde abgeschnitten - Fusszeile mit Rechtsgrundlage steht vollstaendig da", async () => {
    for (const record of [musterVoll(), musterKlein()]) {
      const t = text(await schreiben(record));
      expect(t).toContain("Ergänzt den tätigkeitsbezogenen Grundlagenteil der Gefährdungsbeurteilung des Betriebs (Fassung 2 vom 07.08.2026) sowie die SVLFG-Vorlage GBU-W-C006 Seilklettertechnik.");
      expect(t).toContain("A = automatisch vorbelegt (GPS, Kundenadresse, Wetter, Netz, Fristen, Qualifikationen, Kataster) und von der aufsichtsführenden Person so bestätigt; ohne A = von Hand eingetragen oder geändert.");
    }
  });
});
