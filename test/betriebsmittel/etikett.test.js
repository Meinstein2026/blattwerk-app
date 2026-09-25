// Etiketten-Vorlage fuer Betriebsmittel (12.09.2026).
//
// Der Drucker (SUPVAN T50M Pro) loest 203 dpi auf und zieht Endlosetiketten,
// keine A4-Boegen. Geprueft wird deshalb dreierlei: dass jede Seite genau ein
// Etikett ist, dass nichts ueber den Rand laeuft — auf 50 x 30 mm faellt ein
// zu grosser Text nicht auf, er wird abgeschnitten, und das merkt man erst an
// der Rolle — und dass die Balken auf ganzen Druckerpunkten sitzen.
import { describe, expect, it } from "vitest";
import {
  ETIKETT_GROESSE, ETIKETT_RAND, DPI, ZEILE_MIN_PT, etikettPlan, etikettDateiname,
  buildEtikettenPdf, etikettenAusLosen, zeileEinpassen,
} from "../../src/etikett-pdf.js";
import { code128cModule } from "../../src/code128.js";

const etikett = (zeilen, code = "1149672048") => ({ code, zeilen });
const punkte = (mm) => mm * DPI / 25.4;

describe("etikettPlan", () => {
  it("legt den Strichcode ueber die Breite und den Text darunter", () => {
    const p = etikettPlan(etikett(["EH-2026-0003", "verfaellt 30.04.2029"]));
    expect(p.code.y).toBe(ETIKETT_RAND);
    for (const z of p.zeilen) expect(z.y).toBeGreaterThan(p.code.y + p.code.hoehe);
  });

  it("haelt Code und Text innerhalb des Etiketts", () => {
    const p = etikettPlan(etikett(["EH-2026-0003", "verfaellt 30.04.2029"]));
    expect(p.code.x).toBeGreaterThanOrEqual(ETIKETT_RAND - 0.2);
    expect(p.code.x + p.code.breite).toBeLessThanOrEqual(ETIKETT_GROESSE.breite - ETIKETT_RAND + 0.2);
    for (const z of p.zeilen) expect(z.y).toBeLessThanOrEqual(ETIKETT_GROESSE.hoehe - ETIKETT_RAND);
  });

  it("legt die Balken auf ganze Druckerpunkte", () => {
    // Eine Balkenkante zwischen zwei Punkten verschmiert beim Rastern. Ein
    // verschmierter 0,25-mm-Balken wird nicht mehr gelesen — deshalb ist das
    // hier eine harte Zusicherung und keine Kosmetik.
    for (const g of [{ breite: 50, hoehe: 30 }, { breite: 40, hoehe: 30 }, { breite: 30, hoehe: 15 }]) {
      const p = etikettPlan(etikett(["EH-2026-0003"]), g);
      expect(Number.isInteger(p.code.modulPunkte)).toBe(true);
      expect(Math.abs(punkte(p.code.x) - Math.round(punkte(p.code.x)))).toBeLessThan(0.001);
      expect(Math.abs(punkte(p.code.breite) - Math.round(punkte(p.code.breite)))).toBeLessThan(0.001);
    }
  });

  it("nimmt die breitesten Balken, die noch passen", () => {
    // Je breiter das Modul, desto sicherer der Scan.
    const schmal = etikettPlan(etikett(["A"]), { breite: 30, hoehe: 15 });
    const breit = etikettPlan(etikett(["A"]), { breite: 50, hoehe: 30 });
    expect(breit.code.modulPunkte).toBeGreaterThan(schmal.code.modulPunkte);
    expect(schmal.code.modulPunkte).toBeGreaterThanOrEqual(2);
  });

  it("verweigert ein Etikett, auf das der Code nicht passt", () => {
    // Lieber ein Fehler als eine Rolle voller Etiketten, die kein Scanner liest.
    expect(() => etikettPlan(etikett(["A"]), { breite: 20, hoehe: 15 })).toThrow(/zu schmal/);
  });

  it("gibt dem Strichcode die Hoehe, die der Text nicht braucht", () => {
    // Ohne Verfallsdatum bleibt nur eine Zeile — dann gehoert der freie Platz
    // den Balken, nicht einem Loch. Ein hoher Code laesst sich leichter treffen.
    const einzeilig = etikettPlan(etikett(["REIF-2026-0001"]));
    const zweizeilig = etikettPlan(etikett(["EH-2026-0003", "verfaellt 30.04.2029"]));
    expect(einzeilig.code.hoehe).toBeGreaterThan(zweizeilig.code.hoehe);
  });

  it("laesst den Text nicht an die Balken stossen", () => {
    // Auf 30 x 15 mm sah das im Probedruck aus, als haetten die Balken Fuesse.
    for (const g of [{ breite: 50, hoehe: 30 }, { breite: 40, hoehe: 30 }, { breite: 30, hoehe: 15 }]) {
      for (const z of [["REIF-2026-0001"], ["EH-2026-0003", "verfaellt 30.04.2029"]]) {
        const p = etikettPlan(etikett(z), g);
        const oberkanteText = p.zeilen[0].y - p.zeilen[0].pt * 0.72 / 2.835;   // Versalhoehe in mm
        expect(oberkanteText).toBeGreaterThan(p.code.y + p.code.hoehe);
        expect(p.zeilen.at(-1).y).toBeLessThanOrEqual(g.hoehe - ETIKETT_RAND / 2);
      }
    }
  });

  it("hebt die Seriennummer hervor", () => {
    const p = etikettPlan(etikett(["EH-2026-0003", "verfaellt 30.04.2029"]));
    expect(p.zeilen[0].fett).toBe(true);
    expect(p.zeilen[1].fett).toBe(false);
    expect(p.zeilen[0].pt).toBeGreaterThanOrEqual(p.zeilen[1].pt);
  });

  it("nimmt hoechstens zwei Zeilen an", () => {
    expect(etikettPlan(etikett(["A", "B", "C", "D"])).zeilen).toHaveLength(2);
  });

  it("bleibt ueber der Aufloesungsgrenze des Druckers", () => {
    for (const z of etikettPlan(etikett(["A", "B"]), { breite: 30, hoehe: 15 }).zeilen) {
      expect(z.pt).toBeGreaterThanOrEqual(ZEILE_MIN_PT);
    }
  });
});

describe("zeileEinpassen", () => {
  // Am 12.09.2026 im gerasterten Probedruck aufgefallen: jsPDFs `maxWidth`
  // bricht zu lange Zeilen um, statt sie zu kuerzen — die Umbruchzeile wandert
  // nach unten aus dem Etikett heraus und fehlt auf der Rolle.
  //
  // Messdoppel: jedes Zeichen ist `pt / 10` mm breit.
  const messen = (t, pt) => t.length * (pt / 10);

  it("laesst eine passende Zeile unveraendert", () => {
    expect(zeileEinpassen("EH-2026-0003", 25, 8, messen)).toEqual({ text: "EH-2026-0003", pt: 8 });
  });

  it("setzt lieber kleiner als zu kuerzen", () => {
    const e = zeileEinpassen("Erste-Hilfe-Koffer", 12, 8, messen);
    expect(e.text).toBe("Erste-Hilfe-Koffer");
    expect(e.pt).toBeLessThan(8);
  });

  it("kuerzt erst, wenn die kleinste Schrift nicht mehr reicht", () => {
    const e = zeileEinpassen("Erste-Hilfe-Koffer DIN 13157", 6, 8, messen);
    expect(e.pt).toBe(ZEILE_MIN_PT);
    expect(e.text).toMatch(/…$/);
    expect(messen(e.text, e.pt)).toBeLessThanOrEqual(6);
  });

  it("laeuft bei absurd schmaler Spalte nicht endlos", () => {
    expect(zeileEinpassen("Erste-Hilfe-Koffer", 0.1, 8, messen).text.length).toBeLessThanOrEqual(2);
  });

  it("kommt mit leerem Text klar", () => {
    expect(zeileEinpassen("", 25, 8, messen).text).toBe("");
  });
});

describe("buildEtikettenPdf", () => {
  // Doppel statt echtem jsPDF: geprueft wird die Ansteuerung, nicht die
  // PDF-Bibliothek.
  const doppel = () => {
    const rufe = [];
    class FakePdf {
      constructor(o) { rufe.push(["neu", o]); }
      addPage(...a) { rufe.push(["addPage", ...a]); }
      rect(...a) { rufe.push(["rect", ...a]); }
      setFont(...a) { rufe.push(["setFont", ...a]); }
      setFontSize(...a) { this.pt = a[0]; rufe.push(["setFontSize", ...a]); }
      getTextWidth(t) { return t.length * (this.pt / 10); }
      text(...a) { rufe.push(["text", ...a]); }
    }
    return { FakePdf, rufe };
  };

  it("macht aus jedem Stueck eine eigene Seite in Etikettengroesse", async () => {
    const { FakePdf, rufe } = doppel();
    await buildEtikettenPdf([etikett(["A"]), etikett(["B"]), etikett(["C"])], { jsPDF: FakePdf });
    expect(rufe[0][1].format).toEqual([ETIKETT_GROESSE.breite, ETIKETT_GROESSE.hoehe]);
    expect(rufe.filter((r) => r[0] === "addPage")).toHaveLength(2);
  });

  it("zeichnet die Balken als Rechtecke, nicht als Bild", async () => {
    // Als Bild wuerden die Kanten beim Rastern verschmieren.
    const { FakePdf, rufe } = doppel();
    await buildEtikettenPdf([etikett(["EH-2026-0003"])], { jsPDF: FakePdf });
    const rects = rufe.filter((r) => r[0] === "rect");
    expect(rects.length).toBeGreaterThan(20);
    for (const [, , , b] of rects) expect(b).toBeGreaterThan(0);
  });

  it("bricht lange Zeilen nicht um, sondern kuerzt sie", async () => {
    // Ein Umbruch waere unsichtbar: jsPDF meldet keinen Fehler, die zweite
    // Zeile landet nur ausserhalb des Etiketts.
    const { FakePdf, rufe } = doppel();
    await buildEtikettenPdf([etikett(["EH-2026-0003", "verfaellt 30.04.2029 und noch viel mehr Text"])], { jsPDF: FakePdf });
    const texte = rufe.filter((r) => r[0] === "text");
    expect(texte).toHaveLength(2);
    for (const [, , , , opts] of texte) expect(opts).toEqual({ align: "center" });
  });

  it("weigert sich, ein leeres PDF zu bauen", async () => {
    const { FakePdf } = doppel();
    await expect(buildEtikettenPdf([], { jsPDF: FakePdf })).rejects.toThrow(/Keine Etiketten/);
  });
});

describe("etikettenAusLosen", () => {
  const produkte = [{ id: 514, label: "Erste-Hilfe-Koffer DIN 13157" }];
  const los = (extra) => ({ rowid: 1, batch: "EH-2026-0001", fk_product: 514, array_options: { options_bm_token: "1149672048" }, ...extra });

  it("verbindet Los und Artikel", () => {
    const { etiketten, fehler } = etikettenAusLosen([los()], produkte, "2026-09-12");
    expect(fehler).toEqual([]);
    expect(etiketten[0].code).toBe("1149672048");
    expect(etiketten[0].produkt).toBe("Erste-Hilfe-Koffer DIN 13157");
  });

  it("sortiert Lose ohne Code aus, statt unaufloesbare Etiketten zu drucken", () => {
    const { etiketten, fehler } = etikettenAusLosen([los(), los({ rowid: 2, array_options: {} })], produkte, "2026-09-12");
    expect(etiketten).toHaveLength(1);
    expect(fehler).toHaveLength(1);
    expect(fehler[0].grund).toMatch(/Code/);
  });

  it("kommt ohne passenden Artikel aus", () => {
    const { etiketten } = etikettenAusLosen([los({ fk_product: 999 })], produkte, "2026-09-12");
    expect(etiketten[0].zeilen[0]).toBe("EH-2026-0001");
  });
});

describe("etikettDateiname", () => {
  it("nennt ein einzelnes Etikett nach seiner Nummer", () => {
    expect(etikettDateiname([etikett(["EH-2026-0003"])], "2026-09-12")).toBe("Etikett EH-2026-0003.pdf");
  });

  it("zaehlt bei einem Stapel", () => {
    expect(etikettDateiname([etikett(["A"]), etikett(["B"])], "2026-09-12"))
      .toBe("Etiketten 2 Stueck 2026-09-12.pdf");
  });
});

describe("Breitenbedarf", () => {
  it("braucht fuer zehn Ziffern 90 Module", () => {
    // Start + fuenf Ziffernpaare + Pruefzeichen + Stopp. Aus dieser Zahl folgt
    // die Mindestbreite der Rolle, deshalb steht sie hier fest.
    expect(code128cModule("1149672048")).toBe(90);
  });
});
