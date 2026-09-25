// Verdrahtung in dolibarr-app.jsx — sichert gegen stilles Wegrefactoren
// (Muster wie test/update/service-worker.test.js): Menüpunkt, Seitenwechsel,
// Persistenz-Endpunkte, und dass die Finanzübersicht die Anlagen-
// Konfiguration wirklich benutzt statt nur zu laden.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const abschnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
const fahrtenbuch = abschnitt("// ─── Fahrtenbuch ", "// ─── Ende Fahrtenbuch");
const funktion = (name) => {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error("Funktion fehlt: " + name);
  const b = src.indexOf("\nfunction ", a + 10);
  return src.slice(a, b < 0 ? src.length : b);
};

describe("Fahrtenbuch in der App", () => {
  it("steht im Burger-Menü und wird als Seite angezeigt", () => {
    expect(funktion("BottomNav")).toMatch(/key: "fahrtenbuch"/);
    expect(funktion("App")).toMatch(/tab === "fahrtenbuch"\s*&&\s*<FahrtenbuchPage/);
  });
  it("liest und schreibt über die Nextcloud-Ablage und hält einen lokalen Cache", () => {
    const seite = fahrtenbuch;
    expect(seite).toMatch(/\/api\/nc\/fahrtenbuch"/);
    expect(seite).toMatch(/\/api\/nc\/fahrtenbuch\/save/);
    expect(seite).toMatch(/blattwerk_fahrtenbuch_cache/);
    expect(seite).toMatch(/blattwerk_fahrtenbuch_ausstehend/);
  });
  it("zeichnet per Geolocation auf und rechnet die Strecke aus den Punkten", () => {
    const seite = fahrtenbuch;
    expect(seite).toMatch(/navigator\.geolocation\.watchPosition/);
    expect(seite).toMatch(/streckeAusPunkten\(/);
  });
  it("exportiert CSV und PDF über den Download-Weg der App", () => {
    const seite = fahrtenbuch;
    expect(seite).toMatch(/fahrtenCsv\(/);
    expect(seite).toMatch(/buildFahrtenbuchPdf/);
    expect(seite).toMatch(/dateiSpeichern\(/);
  });
  it("Kundenliste kommt aus Dolibarr", () => {
    expect(fahrtenbuch).toMatch(/getThirdparties\("customer"\)/);
  });

  // ── Handy-Ansicht (09.09.2026) ──
  // Auf dem Bildschirm Karten, im PDF weiter das Papierblatt. Beides ist leicht
  // versehentlich rueckgaengig gemacht, deshalb hier festgenagelt.
  it("zeigt Karten statt Papierblatt — keine 7-Spalten-Tabelle mehr im Bildschirm", () => {
    expect(fahrtenbuch).toMatch(/fahrtenListe\(/);
    expect(fahrtenbuch).toMatch(/fb-karte/);
    expect(fahrtenbuch).not.toMatch(/fb-tabelle|fb-papier|BLATT_ZEILEN|blattNr/);
    // Das breite Blatt-Layout darf im Stylesheet nicht wieder auftauchen.
    expect(src).not.toMatch(/min-width: 860px/);
  });
  it("das PDF bleibt das Papierblatt", () => {
    expect(fahrtenbuch).toMatch(/buildFahrtenbuchPdf/);
    const pdf = fs.readFileSync(path.join(process.cwd(), "src/fahrtenbuch-pdf.js"), "utf8");
    expect(pdf).toMatch(/fahrtenBlaetter\(/);
    expect(pdf).toMatch(/BLATT_ZEILEN/);
  });
  it("die Maske fragt Uhrzeit, Startort und Strecke ab — das Blatt zeigte sie nie", () => {
    for (const feld of ["zeitVon", "zeitBis", "start", "distanz", "kmBeginn", "kmEnde", "zweck", "fahrer"]) {
      expect(fahrtenbuch).toMatch(new RegExp(`setWert\\("${feld}"`));
    }
  });
  it("Aenderungsvermerk und Storno bleiben in der Maske erreichbar", () => {
    expect(fahrtenbuch).toMatch(/Änderungsvermerk \(Pflicht\)/);
    expect(fahrtenbuch).toMatch(/eintragen\(true\)/);
    // Storno und Aenderung muessen an der Karte sichtbar bleiben (geschlossene Form).
    expect(fahrtenbuch).toMatch(/fb-karte-storno/);
    expect(fahrtenbuch).toMatch(/k\.lfdNr/);
  });
  it("GPS schreibt in die sichtbaren Felder der Maske", () => {
    expect(fahrtenbuch).toMatch(/zeitVon: fbUhrzeit\(a\.seit\)/);
    expect(fahrtenbuch).toMatch(/_gps: \{ punkte/);
  });
  it("Fahrer und Startort werden vor dem Eintragen aufgeloest — ein leeres Feld darf sie nicht loeschen", () => {
    expect(fahrtenbuch).toMatch(/const fahrer = String\(edit\.werte\.fahrer \|\| ""\)\.trim\(\) \|\| edit\.alt\?\.fahrer \|\| meName/);
    expect(fahrtenbuch).toMatch(/const start = String\(edit\.werte\.start \|\| ""\)\.trim\(\) \|\|/);
    expect(fahrtenbuch).toMatch(/fahrtAusZeile\(\{ \.\.\.edit\.werte, start, fahrer \}, vorlage\)/);
  });
  // Ohne diese Pruefung koennte eine spaetere Aenderung den Endmarker
  // verschieben; der `fahrtenbuch`-Ausschnitt oben schrumpfte still und
  // *alle* Greps in dieser Datei gingen ins Leere statt fehlzuschlagen.
  it("der Abschnitt ist wirklich die Fahrtenbuch-Seite (Marker stehen noch)", () => {
    expect(src.indexOf("// ─── Ende Fahrtenbuch")).toBeGreaterThan(src.indexOf("// ─── Fahrtenbuch "));
    expect(fahrtenbuch).toMatch(/function FahrtenbuchPage\(/);
    expect(fahrtenbuch.length).toBeGreaterThan(10000);
  });
});

describe("Anlagegüter in der Finanzübersicht", () => {
  const seite = funktion("FinanzenPage");
  it("lädt die Konfiguration und gibt sie an die Rechnung weiter", () => {
    expect(seite).toMatch(/\/api\/nc\/anlagen"/);
    expect(seite).toMatch(/anlagenKonfig:/);
  });
  it("speichert Nutzungsdauer/Einstufung je Gerät", () => {
    expect(seite).toMatch(/\/api\/nc\/anlagen\/save/);
  });
  it("zeigt die Anlagenübersicht mit AfA und Restwert", () => {
    expect(seite).toMatch(/afaJahr\(/);
    expect(seite).toMatch(/restwert\(/);
  });
});
