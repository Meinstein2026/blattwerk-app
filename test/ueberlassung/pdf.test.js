// Das PDF ist der Nachweis mit den Unterschriften — es muss A4 hoch sein, auf
// eine Seite passen und den Aufbau der Papiervorlage tragen. jsPDF schreibt
// unkomprimiert, deshalb laesst sich der gezeichnete Text im Rohstrom pruefen;
// die Gliederung selbst haengt an `uebAbschnitte` (test/ueberlassung/vorlage.test.js).
import { describe, expect, it } from "vitest";
import { buildUeberlassungPdf } from "../../src/ueberlassung-pdf.js";
import { UEB_PFLICHTEN } from "../../src/ueberlassung.js";
import { BETRIEB_STANDARD } from "../../src/betrieb.js";

// Der Vertragspartner kommt seit 18.09.2026 vom Aufrufer (Befund I4) — in der
// App aus mandantBetrieb(). Hier Blattwerks eigene Werte, damit dieselben
// Blaetter herauskommen wie vorher.
const BW = BETRIEB_STANDARD;

const v = {
  id: "u1", fahrzeug: "Fiat Ducato · MU-ST 2001", name: "Max Extern", anschrift: "Hauptstr. 1, 12345 Musterstadt",
  geburtsdatum: "1990-05-04", telefon: "0641 1234", verhaeltnis: "extern",
  fsKlasse: "B", fsNummer: "J123456789", fsAusgestelltAm: "2015-03-12", fsAusgestelltDurch: "Landkreis Gießen",
  fsGesehenAm: "2026-09-09", fsGesehenDurch: "Max Muster",
  von: "2026-09-10", bis: "", unbefristet: true, kmUebergabe: 84210, selbstbeteiligung: 500,
  pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, true])),
  erfasstAm: "2026-09-09T12:00:00.000Z", blattwerkVertreter: "Max Muster",
};
const roh = (b64) => Buffer.from(b64, "base64").toString("latin1");

describe("buildUeberlassungPdf", () => {
  it("liefert ein PDF (Base64), reproduzierbar, auch ohne Unterschriften und Logo", async () => {
    const a = await buildUeberlassungPdf(v, { betrieb: BW });
    const b = await buildUeberlassungPdf(v, { betrieb: BW });
    expect(Buffer.from(a, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(2000);
  });

  it("A4 hoch auf einer Seite", async () => {
    const s = roh(await buildUeberlassungPdf(v, { betrieb: BW }));
    expect(s).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/); // A4 hoch
    expect((s.match(/\/Type \/Page[^s]/g) || []).length).toBe(1);
  });

  it("traegt Titel, die vier Abschnitte, die gefuellten Felder und die Selbstbeteiligung", async () => {
    const s = roh(await buildUeberlassungPdf(v, { betrieb: BW }));
    for (const t of ["1. Fahrer/in", "2. Fahrerlaubnis", "3.", "4. Pflichten"]) expect(s).toContain(t);
    for (const t of ["Max Extern", "04.05.1990", "extern", "J123456789", "12.03.2015", "09.09.2026", "10.09.2026", "84.210 km", "500,00"]) expect(s).toContain(t);
    expect(s).toContain("21 StVG");
    expect(s).toContain("MU-ST 2001");
    expect(s).not.toMatch(/_{3,}/); // keine Linien zum Ausfuellen mehr
  });

  it("nummeriert die Pflichten 1.–7. und kreuzt Bestaetigtes an", async () => {
    const s = roh(await buildUeberlassungPdf(v, { betrieb: BW }));
    for (const n of ["1.", "2.", "3.", "4.", "5.", "6.", "7."]) expect(s).toContain(n);
    // Die Haken im Kasten sind Linien, keine Buchstaben — ohne Bestaetigung fehlen sie.
    const ohne = roh(await buildUeberlassungPdf({ ...v, pflichten: {} }, { betrieb: BW }));
    expect((s.match(/ l\n/g) || []).length).toBeGreaterThan((ohne.match(/ l\n/g) || []).length);
  });

  // Zweite Ausgabe aus demselben Renderer: das Blatt zum Ausdrucken und
  // Ausfuellen von Hand. Muss auf eine Seite passen, sonst unterschreibt
  // niemand die zweite.
  it("Leerformular: eine Seite, keine Werte, Betragslinie statt Zahl", async () => {
    const s = roh(await buildUeberlassungPdf({ fahrzeug: "Fiat Ducato · MU-ST 2001" }, { leer: true, betrieb: BW }));
    expect((s.match(/\/Type \/Page[^s]/g) || []).length).toBe(1);
    for (const t of ["1. Fahrer/in", "4. Pflichten", "Name, Vorname", "km-Stand bei \u00dcbergabe", "Unterschrift Fahrer/in"]) expect(s).toContain(t);
    for (const t of ["Max Extern", "84.210", "500,00"]) expect(s).not.toContain(t);
    expect(s).toContain("______"); // Betrag wird von Hand eingetragen
    expect(s).not.toContain("Blattwerk-App."); // keine Herkunftszeile auf dem Leerblatt
  });

  it("Leerformular zeichnet keine Unterschriftsbilder, auch wenn welche mitkommen", async () => {
    const mit = Buffer.from(await buildUeberlassungPdf({ ...v, sigFahrer: "x" }, { leer: true, betrieb: BW }), "base64").length;
    const ohne = Buffer.from(await buildUeberlassungPdf({ ...v }, { leer: true, betrieb: BW }), "base64").length;
    expect(mit).toBe(ohne);
  });

  it("Beschriftungen stehen schwarz und halbfett auf dem Blatt, nicht grau", async () => {
    const s = roh(await buildUeberlassungPdf({}, { leer: true, betrieb: BW }));
    expect(s).toContain("Name, Vorname");
    expect(s).not.toContain("NAME, VORNAME"); // keine Kapitaelchen mehr
    // Graustufen-Fuellfarben (0.33 g o. ae.) gibt es im Blatt nicht mehr.
    expect(s).not.toMatch(/0\.33\d* 0\.33\d* 0\.33\d* rg/);
  });

  it("Bemerkung steht auf dem unterschriebenen Blatt, nicht auf dem Leerformular", async () => {
    const mit = roh(await buildUeberlassungPdf({ ...v, bemerkung: "Nur Anhaengerbetrieb bis 750 kg" }, { betrieb: BW }));
    expect(mit).toContain("Nur Anhaengerbetrieb bis 750 kg");
    expect(roh(await buildUeberlassungPdf(v, { betrieb: BW }))).not.toContain("Bemerkung:");
    expect(roh(await buildUeberlassungPdf({ ...v, bemerkung: "x" }, { leer: true, betrieb: BW }))).not.toContain("Bemerkung:");
  });

  it("uebersteht kaputte Unterschriftsbilder und fehlende Angaben", async () => {
    const a = await buildUeberlassungPdf({ ...v, sigFahrer: "data:image/jpeg;base64,AAAA", sigBlattwerk: "kaputt" }, { betrieb: BW });
    expect(Buffer.from(a, "base64").subarray(0, 4).toString()).toBe("%PDF");
    const b = await buildUeberlassungPdf({ id: "x" }, { betrieb: BW });
    expect(Buffer.from(b, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  // --- Befund I4 (Abschlusspruefung 18.09.2026): der Vertragspartner ---

  it("verweigert ohne Vertragspartner, statt ein Blatt mit unklarer Firma zu zeichnen", async () => {
    await expect(buildUeberlassungPdf(v)).rejects.toThrow(/betrieb\.name fehlt/);
    await expect(buildUeberlassungPdf(v, { betrieb: { name: "" } })).rejects.toThrow(/betrieb\.name fehlt/);
  });

  it("ein fremder Mandant bekommt sein Blatt ohne ein einziges Blattwerk", async () => {
    const fremd = { name: "Baum Müller GbR", ort: "Gießen", anzeigeName: "Baum Müller", appName: "Baum Müller" };
    const s = roh(await buildUeberlassungPdf(v, { betrieb: fremd }));
    expect(s).toContain("Baum M");
    expect(s).not.toContain("Blattwerk");
    expect(s).not.toContain("Musterstadt, ");   // Herkunftszeile
    expect(s).toContain("Gie");
  });

  it("ohne Ort und ohne App-Namen bleibt keine hängende Kommastelle stehen", async () => {
    const s = roh(await buildUeberlassungPdf(v, { betrieb: { name: "Baum Müller GbR" } }));
    expect(s).not.toMatch(/erstellt mit der -App/);
    expect(s).not.toMatch(/\(, /);
  });

  it("Blattwerks Herkunftszeile steht unverändert auf dem Blatt", async () => {
    const s = roh(await buildUeberlassungPdf(v, { betrieb: BW }));
    expect(s).toContain("Musterstadt, 09.09.2026");
    expect(s).toContain("erstellt mit der Blattwerk-App.");
  });
});