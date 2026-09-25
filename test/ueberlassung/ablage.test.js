// Ablage der Ueberlassungsvereinbarungen: JSON in Blattwerk/App/ueberlassungen.json
// (gleicher Lesen-Aendern-Schreiben-Pfad wie fahrtenbuch.json), PDF unter
// Blattwerk/Fahrtenbuch/Ueberlassungen/<Jahr>/ (Muster einweisungen/save).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
const endpunkt = (pfad) => {
  const a = src.indexOf(`app.post("${pfad}"`);
  if (a < 0) throw new Error("Endpunkt fehlt: " + pfad);
  const b = src.indexOf("\napp.", a + 10);
  return src.slice(a, b < 0 ? src.length : b).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
};

describe("Endpunkte Ueberlassung", () => {
  it("lesen, speichern, widerrufen, Datei", () => {
    for (const p of ["/api/nc/ueberlassungen", "/api/nc/ueberlassungen/save", "/api/nc/ueberlassungen/widerruf", "/api/nc/ueberlassungen/datei"]) {
      expect(() => endpunkt(p)).not.toThrow();
    }
  });
  it("speichern prueft den Firmenordner VOR der Ordnerkette und legt das PDF im Fahrtenbuch-Ordner ab", () => {
    const save = endpunkt("/api/nc/ueberlassungen/save");
    expect(save.indexOf("assertOrdner")).toBeGreaterThan(-1);
    expect(save.indexOf("assertOrdner")).toBeLessThan(save.indexOf("MKCOL"));
    expect(save).toMatch(/Ueberlassungen/);
    expect(save).toMatch(/application\/pdf/);
    expect(save).toMatch(/appStoreAendern\(/);
    expect(save).toMatch(/uebEintragen\(/);
  });
  it("widerruf verlangt Id und Grund", () => {
    const w = endpunkt("/api/nc/ueberlassungen/widerruf");
    expect(w).toMatch(/uebWiderrufen\(/);
    expect(w).toMatch(/if \(!id\) return res\.status\(400\)/);
  });
  it("Datei-Abruf ist auf den Ueberlassungs-Ordner beschraenkt", () => {
    const d = endpunkt("/api/nc/ueberlassungen/datei");
    // UEB_DIR() statt eines fest verdrahteten "Blattwerk/…" — der Ordner
    // haengt seit Task 9 vom Mandanten ab (siehe ncOrdner in src/mandant.js).
    expect(d).toMatch(/UEB_DIR\(\)/);
    expect(d).toMatch(/\.\./);
  });
  // `ncPfad` ist der Name der HILFSFUNKTION (server.mjs, Segment-fuer-Segment-
  // Kodierer) UND der Name des persistierten Feldes (Ablagepfad im
  // gespeicherten Datensatz, siehe `ablagePfad`/`neu.ncPfad`). Eine lokale
  // Variable, die den FUNKTIONSNAMEN verdeckt, liesse MKCOL bei JEDEM
  // Speichern an "ncPfad is not a function" sterben. Kein Test fuehrt den
  // Handler hier aus, deshalb steht die Regel als Textmuster.
  //
  // Fix Round 2 (2026-09-18): die Handler-Funktion ncPfad() selbst wird beim
  // Speichern gar nicht mehr aufgerufen — ordnerUrl()/UEB_DIR() liefern
  // bereits URL-kodierte Segmente, ein zusaetzlicher Durchlauf durch
  // ncPfad() haette sie DOPPELT kodiert (aus "Baum%20M%C3%BCller" wurde
  // "Baum%2520M%25C3%25BCller" — falscher Ordner). Das faellt bei "Blattwerk"
  // nie auf (keine Sonderzeichen), deshalb prueft der echte Verhaltenstest
  // dafuer mit einem Mandanten mit Leerzeichen+Umlaut im Namen gegen eine
  // Mock-WebDAV: test/mandant/kodierung.test.js.
  it("speichern verdeckt die Pfad-Hilfsfunktion nicht und ruft sie nicht mehr auf", () => {
    const save = endpunkt("/api/nc/ueberlassungen/save");
    expect(save).not.toMatch(/(let|const|var)[^;\n]*\bncPfad\b\s*(,|;|=)/);
    expect(save).not.toMatch(/ncPfad\(/);
  });
});

describe("Verdrahtung in der App", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const fb = app.slice(app.indexOf("// ─── Fahrtenbuch "), app.indexOf("// ─── Ende Fahrtenbuch"));
  it("Reiter Fahrer / Ueberlassung mit zwei Unterschriften und PDF", () => {
    expect(fb).toMatch(/"ueberlassung", "Fahrer \/ Überlassung"/);
    expect((fb.match(/<SignaturePad/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(fb).toMatch(/buildUeberlassungPdf/);
    expect(fb).toMatch(/\/api\/nc\/ueberlassungen\/save/);
    expect(fb).toMatch(/uebFahrerNamen\(/);
    expect(fb).toMatch(/UEB_SELBSTBETEILIGUNG_STANDARD/);
  });
  it("Formular fragt alle Felder der Papiervorlage ab", () => {
    for (const feld of ["verhaeltnis", "fsAusgestelltAm", "fsAusgestelltDurch", "kmUebergabe", "fsGesehenAm", "fsGesehenDurch", "selbstbeteiligung"]) {
      expect(fb).toMatch(new RegExp(`set\\("${feld}"\\)`));
    }
    expect(fb).toMatch(/UEB_VERHAELTNIS/);
    expect(fb).toMatch(/uebPflichtText\(p, form, uebBetrieb\)/); // Betrag und Firmenname statt Platzhalter
  });
  it("Fahrer-Auswahl im Blatt zieht Vereinbarungen UND Dolibarr-Personen", () => {
    const liste = fb.slice(fb.indexOf('id="fb-fahrer"'), fb.indexOf('id="fb-fahrer"') + 300);
    expect(liste).toMatch(/personen\.map/);
    expect(liste).toMatch(/uebFahrerNamen\(uebAlle/);
  });
  it("Leerformular zum Ausdrucken kommt aus demselben Renderer", () => {
    expect(fb).toMatch(/Leerformular/);
    const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
    const h = app.slice(app.indexOf("const uebLeerformular"), app.indexOf("const uebLeerformular") + 500);
    expect(h).toMatch(/buildUeberlassungPdf\(/);
    expect(h).toMatch(/leer: true/);
    // Genau zwei Aufrufe (ausgefuellt + leer), beide auf denselben Renderer —
    // ein zweiter Zeichner liesse Papier und App auseinanderlaufen.
    expect((app.match(/buildUeberlassungPdf\(/g) || []).length).toBe(2);
  });
  it("Offline: eigene Warteschlange, PDF wird NICHT zwischengelagert", () => {
    expect(fb).toMatch(/UEB_QUEUE_KEY/);
    expect(fb).toMatch(/uebNachtragen/);
    // Beim Nachtragen wird das PDF neu gebaut statt aus dem Speicher geholt.
    const q = fb.slice(fb.indexOf("const uebNachtragen"), fb.indexOf("const uebSpeichern"));
    expect(q).toMatch(/uebPdfBauen\(a\.vereinbarung, a, betrieb\)/);
    const sp = fb.slice(fb.indexOf("const uebSpeichern"), fb.indexOf("const uebSpeichern") + 2400);
    expect(sp).toMatch(/\{ vereinbarung: v, sigFahrer: sigs\.sigFahrer, sigBlattwerk: sigs\.sigBlattwerk \}/);
    expect(sp).not.toMatch(/pdfBase64\s*\}/); // kein PDF in der Warteschlange
    // Voller Gerätespeicher darf nicht still schlucken (fbMerken tut das).
    expect(sp).toMatch(/localStorage\.setItem\(UEB_QUEUE_KEY/);
    expect(sp).toMatch(/Kein Platz mehr im Gerätespeicher/);
  });
});
