// Die Datei-Ausleihe im Server: ein Durchreiche-Fach, damit der
// System-Download-Manager der App-Huelle eine echte http-Adresse bekommt.
// Ohne sie tat "Speichern" in der installierten App nichts — sie reicht nur
// Downloads weiter, deren URL mit "http" beginnt, und ein im Browser erzeugtes
// PDF liegt als blob: vor. (10.08.2026)
import { beforeEach, describe, expect, it } from "vitest";
import { dateiAblage, dateiAufraeumen, dateiName } from "../../server.mjs";

describe("dateiName", () => {
  it("laesst einen gewoehnlichen Namen stehen", () => {
    expect(dateiName("PR2608-0018.pdf")).toBe("PR2608-0018.pdf");
  });

  it("behaelt die Klammern eines Entwurfs", () => {
    // Ein Entwurf heisst "(PROV37).pdf" — das ist die echte Referenz.
    expect(dateiName("(PROV37).pdf")).toBe("(PROV37).pdf");
  });

  it("wirft jeden Pfad weg", () => {
    // Der Name landet in Content-Disposition und steuert, wohin der
    // Download-Manager schreibt: "../" darf dort nicht ankommen.
    expect(dateiName("../../etc/passwd")).toBe("passwd");
    expect(dateiName("/srv/geheim/liste.pdf")).toBe("liste.pdf");
    expect(dateiName("C:\\Windows\\wichtig.pdf")).toBe("wichtig.pdf");
    expect(dateiName("..")).toBe("beleg.pdf");
  });

  it("entfernt Anfuehrungszeichen und Zeilenumbrueche", () => {
    // Sonst liesse sich der Kopf aufbrechen und ein zweiter anhaengen.
    expect(dateiName('re"chnung.pdf')).toBe("rechnung.pdf");
    expect(dateiName("a.pdf\r\nX-Beliebig: 1")).toBe("a.pdfX-Beliebig: 1");
  });

  it("faellt auf einen Namen zurueck, wenn nichts uebrig bleibt", () => {
    expect(dateiName("")).toBe("beleg.pdf");
    expect(dateiName(null)).toBe("beleg.pdf");
  });

  it("deckelt die Laenge", () => {
    expect(dateiName("x".repeat(500)).length).toBe(120);
  });
});

describe("dateiAufraeumen", () => {
  const legen = (marke, bis) => dateiAblage.set(marke, { daten: Buffer.from("x"), name: "a.pdf", typ: "application/pdf", bis });

  beforeEach(() => dateiAblage.clear());

  it("wirft Abgelaufenes weg", () => {
    legen("alt", 1000);
    legen("frisch", 9999);
    dateiAufraeumen(5000);
    expect(dateiAblage.has("alt")).toBe(false);
    expect(dateiAblage.has("frisch")).toBe(true);
  });

  it("deckelt die Menge und wirft das Aelteste zuerst weg", () => {
    // Reissleine: das Fach liegt im Arbeitsspeicher eines Containers, der
    // wochenlang laeuft. Ohne Deckel waere jedes angesehene PDF fuer immer drin.
    for (let i = 0; i < 25; i++) legen(`m${i}`, 9999);
    dateiAufraeumen(1000);
    expect(dateiAblage.size).toBe(20);
    expect(dateiAblage.has("m0")).toBe(false);
    expect(dateiAblage.has("m24")).toBe(true);
  });

  it("kommt mit einem leeren Fach klar", () => {
    expect(() => dateiAufraeumen(1)).not.toThrow();
    expect(dateiAblage.size).toBe(0);
  });
});
