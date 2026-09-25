// jsPDF schreibt unkomprimiert, deshalb laesst sich der gezeichnete Text im
// Rohstrom pruefen (Technik wie test/ueberlassung/pdf.test.js).
import { describe, expect, it } from "vitest";
import { buildBetriebsanweisungPdf, buildUnterweisungPdf } from "../../src/betriebsanweisung-pdf.js";
import { BA_ABSCHNITTE_IDS, baErstellen } from "../../src/betriebsanweisung.js";

const roh = (b64) => Buffer.from(b64, "base64").toString("latin1");
const seiten = (s) => (s.match(/\/Type \/Page[^s]/g) || []).length;

const baA = baErstellen({ variante: "skt-a", betrieb: "Blattwerk GbR", einsatzort: "Musterstraße 1, Musterstadt", ersteller: "Max Muster", heute: "2026-09-18" });
const baB = baErstellen({ variante: "skt-b", betrieb: "Blattwerk GbR", einsatzort: "Musterstraße 1, Musterstadt", ersteller: "Max Muster", heute: "2026-09-18" });

describe("buildBetriebsanweisungPdf", () => {
  it("liefert ein PDF (Base64)", async () => {
    const b64 = await buildBetriebsanweisungPdf(baA);
    expect(Buffer.from(b64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  it("A4 hoch, traegt Titel, Einsatzort und die sechs Abschnitte", async () => {
    const s = roh(await buildBetriebsanweisungPdf(baA));
    expect(s).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
    expect(s).toContain("Betriebsanweisung");
    expect(s).toContain("Musterstra");
    for (const t of ["ANWENDUNGSBEREICH", "GEFAHREN F", "SCHUTZMASSNAHMEN", "VERHALTEN BEI ST", "VERHALTEN BEI UNF", "INSTANDHALTUNG"]) {
      expect(s.toUpperCase()).toContain(t);
    }
  });

  it("SKT A: ohne Motorsäge im Anwendungsbereich, SKT B: mit Motorsäge", async () => {
    const sA = roh(await buildBetriebsanweisungPdf(baA));
    const sB = roh(await buildBetriebsanweisungPdf(baB));
    expect(sA).toMatch(/ohne Motors/);
    expect(sB).toMatch(/Motors.*gen/);
  });

  it("traegt einen Kenntnisnahme-Block mit leeren Zeilen zum Unterschreiben", async () => {
    const s = roh(await buildBetriebsanweisungPdf(baA));
    expect(s.toUpperCase()).toContain("KENNTNISNAHME");
    expect(s).toContain("Name");
    expect(s).toContain("Unterschrift");
  });

  it("nennt die Fundstelle der Vorschrift", async () => {
    const s = roh(await buildBetriebsanweisungPdf(baA));
    expect(s).toMatch(/VSG 4\.2/);
    expect(s).toMatch(/B09/);
  });

  it("SKT B braucht nicht mehr als zwei Seiten (Betriebsanweisung mit Kenntnisnahme-Block)", async () => {
    const s = roh(await buildBetriebsanweisungPdf(baB));
    expect(seiten(s)).toBeLessThanOrEqual(2);
  });

  it("uebersteht fehlende Angaben", async () => {
    const b64 = await buildBetriebsanweisungPdf({ variante: "skt-a", abschnitte: null });
    expect(Buffer.from(b64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("buildUnterweisungPdf", () => {
  const record = {
    login: "tom", name: "Tom Aushilfe", datum: "2026-09-18", ort: "Musterstraße 1",
    variante: "skt-a", einweiser: "Max Muster", einweiserQualifikation: "SKT B",
    abschnitte: [...BA_ABSCHNITTE_IDS], erfasstAm: "2026-09-18T12:00:00.000Z",
  };

  it("liefert ein PDF mit Personen, Ort, Datum und allen sechs Inhalten", async () => {
    const s = roh(await buildUnterweisungPdf(record));
    expect(Buffer.from(await buildUnterweisungPdf(record), "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(s).toContain("Tom Aushilfe");
    expect(s).toContain("Max Muster");
    expect(s).toContain("Musterstra");
    expect(s).toContain("18.09.2026");
    for (const t of ["Anwendungsbereich", "Gefahren f", "Schutzma", "Störungen", "Erste Hilfe", "Instandhaltung"]) expect(s).toContain(t);
  });

  it("zeigt die Wiederholungsfrist (jaehrlich, 12 Monate)", async () => {
    const s = roh(await buildUnterweisungPdf(record));
    expect(s).toContain("18.09.2027");
  });

  it("Jugendliche: Frist halbjaehrlich", async () => {
    const s = roh(await buildUnterweisungPdf({ ...record, jugendlich: true }));
    expect(s).toContain("18.03.2027");
    expect(s).toMatch(/29 Abs\. 2 JArbSchG/);
  });

  it("uebersteht kaputte Unterschriftsbilder und fehlende Abschnitte", async () => {
    const b64 = await buildUnterweisungPdf({ ...record, sigUnterwiesen: "kaputt", abschnitte: [] });
    expect(Buffer.from(b64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });
});
