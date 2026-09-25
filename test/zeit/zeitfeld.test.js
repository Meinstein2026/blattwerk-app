import { describe, it, expect } from "vitest";
import { zeitMaske, zeitNormalisieren } from "../../src/zeitfeld.jsx";

// Warum es dieses Feld gibt, steht im Kopf von src/zeitfeld.jsx: Firefox zeigt
// bei <input type="time"> auf dem Tablet keine Bildschirmtastatur.

describe("zeitMaske", () => {
  it("setzt den Doppelpunkt beim Tippen selbst", () => {
    expect(zeitMaske("0").anzeige).toBe("0");
    expect(zeitMaske("08").anzeige).toBe("08");
    expect(zeitMaske("083").anzeige).toBe("08:3");
    expect(zeitMaske("0830").anzeige).toBe("08:30");
  });

  it("laesst einen selbst getippten Doppelpunkt stehen", () => {
    expect(zeitMaske("8:").anzeige).toBe("8:");
    expect(zeitMaske("8:3").anzeige).toBe("8:3");
    expect(zeitMaske("16:15").anzeige).toBe("16:15");
  });

  it("wirft alles weg, was keine Ziffer ist", () => {
    expect(zeitMaske("a0b8c30").anzeige).toBe("08:30");
    expect(zeitMaske("08305").anzeige).toBe("08:30");
  });

  it("gibt einen Wert erst her, wenn die Uhrzeit vollstaendig ist", () => {
    // Sonst laufen halbe Eingaben in die Dauer-Berechnung und nach Dolibarr.
    expect(zeitMaske("08").wert).toBe("");
    expect(zeitMaske("08:3").wert).toBe("");
    expect(zeitMaske("08:30").wert).toBe("08:30");
    expect(zeitMaske("").wert).toBe("");
  });

  it("nimmt keine Uhrzeit an, die es nicht gibt", () => {
    expect(zeitMaske("2530").wert).toBe("");
    expect(zeitMaske("08:75").wert).toBe("");
    expect(zeitMaske("23:59").wert).toBe("23:59");
    expect(zeitMaske("00:00").wert).toBe("00:00");
  });
});

describe("zeitNormalisieren", () => {
  it("fuellt beim Verlassen des Feldes auf HH:MM auf", () => {
    expect(zeitNormalisieren("8")).toBe("08:00");
    expect(zeitNormalisieren("8:5")).toBe("08:05");
    expect(zeitNormalisieren("830")).toBe("08:30");
    expect(zeitNormalisieren("1615")).toBe("16:15");
    expect(zeitNormalisieren("16:15")).toBe("16:15");
  });

  it("rettet den Fall, den die Maske selbst verbogen hat", () => {
    // Wer "830" fuer halb neun tippt, sieht durch die Maske "83:0". Ohne diese
    // Rueckfallregel waere das Feld beim Verlassen wieder leer.
    expect(zeitNormalisieren("83:0")).toBe("08:30");
    expect(zeitNormalisieren("16:15")).toBe("16:15");
  });

  it("laesst leer, was leer ist oder keine Uhrzeit ergibt", () => {
    expect(zeitNormalisieren("")).toBe("");
    expect(zeitNormalisieren("   ")).toBe("");
    expect(zeitNormalisieren("99")).toBe("");
    expect(zeitNormalisieren("12:99")).toBe("");
  });
});

describe("Maske und Normalisieren zusammen", () => {
  // Einzeln getestet sahen beide gut aus; der Fehler lag genau dazwischen.
  const tippen = (zeichen) => {
    let anzeige = "";
    for (const z of zeichen) anzeige = zeitMaske(anzeige + z).anzeige;
    return { anzeige, beimVerlassen: zeitNormalisieren(anzeige) };
  };

  it("nimmt jede Tippfolge an, die eine echte Uhrzeit meint", () => {
    expect(tippen("0830")).toEqual({ anzeige: "08:30", beimVerlassen: "08:30" });
    expect(tippen("830")).toEqual({ anzeige: "83:0", beimVerlassen: "08:30" });
    expect(tippen("8")).toEqual({ anzeige: "8", beimVerlassen: "08:00" });
    expect(tippen("1615")).toEqual({ anzeige: "16:15", beimVerlassen: "16:15" });
    expect(tippen("2359")).toEqual({ anzeige: "23:59", beimVerlassen: "23:59" });
    expect(tippen("0000")).toEqual({ anzeige: "00:00", beimVerlassen: "00:00" });
  });

  it("laesst kein Feld stehen, das etwas anderes zeigt als es meldet", () => {
    for (const folge of ["0830", "830", "8", "1615", "0705", "2359", "12"]) {
      const { beimVerlassen } = tippen(folge);
      expect(zeitMaske(beimVerlassen).wert).toBe(beimVerlassen);
    }
  });
});
