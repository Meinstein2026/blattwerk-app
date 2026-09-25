// Nachbesserung 18.09.2026 nach Sichtprüfung: die Kopfzeile lief rechts vom
// Blatt ab ("… Stand 12/07 (VSG 4.2" — der Rest fehlte), weil sie mit einem
// einzeiligen doc.text() statt mit splitTextToSize() gezeichnet wurde — der
// gleiche Fehlertyp, der im GBU-PDF schon einmal drin war
// (test/gbu/pdf-ein-blatt.test.js). Zusätzlich sollte SKT A auf ein Blatt
// passen. Gleiche Technik wie dort: pdfinfo für die Seitenzahl, pdftotext
// (ohne -layout, siehe Begründung im GBU-Test) für den vollständigen Text.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildBetriebsanweisungPdf } from "../../src/betriebsanweisung-pdf.js";
import { baErstellen } from "../../src/betriebsanweisung.js";
import { BA_QUELLE } from "../../src/betriebsanweisung-data.js";

const schreiben = async (ba, name) => {
  const pdf = await buildBetriebsanweisungPdf(ba);
  const ziel = path.join(os.tmpdir(), `betriebsanweisung-ein-blatt-test-${name}.pdf`);
  fs.writeFileSync(ziel, Buffer.from(pdf, "base64"));
  return ziel;
};

const seitenzahl = (pdfPfad) => {
  const info = execFileSync("pdfinfo", [pdfPfad], { encoding: "utf8" });
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
};

// Bewusst OHNE -layout (Begründung: test/gbu/pdf-ein-blatt.test.js).
const text = (pdfPfad, seite) => {
  const args = seite ? ["-f", String(seite), "-l", String(seite)] : [];
  return execFileSync("pdftotext", [...args, pdfPfad, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
};

// Langer, echt vorkommender Einsatzort — stresst genau den Fall, der die
// Kopfzeile zuvor abgeschnitten hat.
const LANGER_EINSATZORT = "Musterstraße 123a, Gewerbegebiet Nord, 12345 Musterstadt-Musterfeld";

const baA = baErstellen({ variante: "skt-a", betrieb: "Blattwerk GbR", einsatzort: LANGER_EINSATZORT, ersteller: "Max Muster", heute: "2026-09-18" });
const baB = baErstellen({ variante: "skt-b", betrieb: "Blattwerk GbR", einsatzort: LANGER_EINSATZORT, ersteller: "Max Muster", heute: "2026-09-18" });

describe("Kopfzeile läuft nicht mehr rechts vom Blatt ab", () => {
  it("SKT A: die volle Quellenangabe steht vollständig im extrahierten Text (nicht abgeschnitten)", async () => {
    const ziel = await schreiben(baA, "skt-a-kopf");
    const t = text(ziel);
    // Genau die Zeichenkette, die vorher hart abgeschnitten wurde ("… VSG 4.2" ohne
    // schließende Klammer) — jetzt muss die komplette Quelle inkl. Klammer dastehen.
    expect(t).toContain(BA_QUELLE.replace(/\s+/g, " "));
    expect(t).toMatch(/VSG 4\.2\)/); // die schließende Klammer, die vorher fehlte
  });

  it("SKT A: ein langer Einsatzort steht vollständig da, nicht gekürzt", async () => {
    const ziel = await schreiben(baA, "skt-a-einsatzort");
    const t = text(ziel);
    expect(t).toContain(LANGER_EINSATZORT);
  });

  it("SKT B: dieselbe Quellenangabe ist ebenfalls vollständig (beide Fassungen nutzen denselben Kopf-Code)", async () => {
    const ziel = await schreiben(baB, "skt-b-kopf");
    const t = text(ziel);
    expect(t).toContain(BA_QUELLE.replace(/\s+/g, " "));
  });
});

// ─── Trennlinie unter dem Abschnittstitel darf keine Textzeile überlappen ───
// Nachbesserung 18.09.2026: beim Verdichten des Layouts rutschte der Abstand
// zwischen der grünen Linie unter jedem Abschnittstitel und der ersten
// Textzeile darunter auf/unter die Oberlänge der Schrift - gemessen am
// Content-Stream von SKT A: Linie bei PDF-y=735.89, nächste Zeile (8,7pt)
// bei Td-y=729.89, nur 6,0pt Abstand; Helveticas Oberlänge liegt laut AFM bei
// 718/1000 em, bei 8,7pt also ≈ 6,25pt - mehr als die vorhandenen 6,0pt, die
// Linie schnitt also durch die Oberlänge. Technik wie in
// test/gbu/pdf-ein-blatt.test.js (kastenUeberlappungen/freigabesatzAbstand):
// Positionen direkt aus dem Content-Stream lesen, nicht raten. Die
// Schriftgröße kommt dabei aus dem tatsächlich gesetzten "Tf"-Operator, nicht
// aus einer Annahme im Test - ein Test, der nur die Seitenzahl prüft, hätte
// diesen Fehler nicht gefunden.
const HELVETICA_OBERLAENGE = 0.718; // AFM-Wert

/** Alle Content-Streams (eines je Seite bei mehrseitigen PDFs), aneinandergehängt. */
const contentStreams = (pdfPfad) => {
  const raw = fs.readFileSync(pdfPfad).toString("latin1");
  return [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]).join("\n");
};

/**
 * Für jede grüne Abschnittslinie (RG-Farbe wie GREEN in betriebsanweisung-pdf.js,
 * gefolgt von "m ... l ... S"): Position der Linie, Schriftgröße (nächstes Tf)
 * und Grundlinie (nächstes Td) der direkt folgenden Textzeile.
 */
const titelLinienAbstaende = (content) => {
  const linien = [...content.matchAll(/0\.18 0\.49 0\.2 RG\r?\n[\d.]+ ([\d.]+) m\r?\n[\d.]+ [\d.]+ l\r?\nS/g)]
    .map((m) => ({ index: m.index, y: Number(m[1]) }));
  const groessen = [...content.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map((m) => ({ index: m.index, size: Number(m[1]) }));
  const grundlinien = [...content.matchAll(/[\d.]+ ([\d.]+) Td/g)].map((m) => ({ index: m.index, y: Number(m[1]) }));
  return linien.map((l) => {
    const groesse = groessen.find((g) => g.index > l.index)?.size ?? null;
    const naechste = grundlinien.find((td) => td.index > l.index) ?? null;
    return {
      linieY: l.y,
      textY: naechste?.y ?? null,
      groesse,
      abstand: naechste ? l.y - naechste.y : null,
      oberlaenge: groesse != null ? groesse * HELVETICA_OBERLAENGE : null,
    };
  });
};

describe("Trennlinie unter dem Abschnittstitel überlappt keine Textzeile", () => {
  it("SKT A: jede der sechs Abschnittslinien (plus Kenntnisnahme) hat mehr Abstand zur nächsten Zeile als deren Oberlänge", async () => {
    const befunde = titelLinienAbstaende(contentStreams(await schreiben(baA, "skt-a-linien")));
    expect(befunde.length).toBe(7); // 6 Abschnitte + Kenntnisnahme
    for (const b of befunde) {
      expect(b.textY, "keine Textzeile nach der Linie gefunden").not.toBeNull();
      expect(b.abstand, `Linie bei ${b.linieY}, Zeile (${b.groesse}pt) bei ${b.textY}: Abstand ${b.abstand}pt, nötig > ${b.oberlaenge}pt`).toBeGreaterThan(b.oberlaenge);
    }
  });

  it("SKT B: dieselbe Prüfung über beide Seiten", async () => {
    const befunde = titelLinienAbstaende(contentStreams(await schreiben(baB, "skt-b-linien")));
    expect(befunde.length).toBeGreaterThanOrEqual(7);
    for (const b of befunde) {
      expect(b.abstand, `Linie bei ${b.linieY}, Zeile (${b.groesse}pt) bei ${b.textY}: Abstand ${b.abstand}pt, nötig > ${b.oberlaenge}pt`).toBeGreaterThan(b.oberlaenge);
    }
  });
});

describe("Seitenzahl", () => {
  it("SKT A passt auf eine Seite", async () => {
    const ziel = await schreiben(baA, "skt-a-seiten");
    expect(seitenzahl(ziel)).toBe(1);
  });

  it("SKT B braucht hoechstens zwei Seiten", async () => {
    const ziel = await schreiben(baB, "skt-b-seiten");
    expect(seitenzahl(ziel)).toBeLessThanOrEqual(2);
  });

  it("SKT B: falls zwei Seiten, liegt der Umbruch VOR Kenntnisnahme, nicht mitten in einer Liste", async () => {
    const ziel = await schreiben(baB, "skt-b-umbruch");
    const seiten = seitenzahl(ziel);
    if (seiten === 1) return; // ohnehin auf einer Seite - Anforderung erfüllt
    const seite1 = text(ziel, 1);
    const seite2 = text(ziel, 2);
    // "Kenntnisnahme" darf nicht auf Seite 1 vorkommen, dafür vollständig auf Seite 2 -
    // sonst liegt der Umbruch mitten in diesem Block statt davor.
    expect(seite1).not.toMatch(/Kenntnisnahme/i);
    expect(seite2).toMatch(/Kenntnisnahme/i);
    // Kein Abschnittstitel darf ohne seine eigene Liste auf einer Seite
    // haengen bleiben: wo immer ein Titel steht, steht auf DERSELBEN Seite
    // auch mindestens ein Punkt seiner Liste (Titel und Liste sind je ein
    // Baustein und brechen nur gemeinsam um, siehe block() im PDF-Modul).
    const paare = [
      [/INSTANDHALTUNG UND PR/i, "BGG 906"],
      [/Genormte Ausrüstung/i, "EN 12841"],
      [/VERHALTEN BEI UNF.LLEN/i, "Der Sicherung des Retters"],
    ];
    for (const [titelMuster, listenpunkt] of paare) {
      const seite = titelMuster.test(seite1) ? seite1 : seite2;
      expect(seite).toContain(listenpunkt);
    }
    // Erklärung + Unterschriftslinie des Erstellers gehören ebenfalls
    // zusammen auf eine Seite.
    const erklaerungSeite = /Es wird bestätigt/.test(seite1) ? seite1 : seite2;
    expect(erklaerungSeite).toContain("Unterschrift der/des Erstellenden");
  });
});
