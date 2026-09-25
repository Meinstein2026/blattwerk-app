// Code 128 C (12.09.2026).
//
// Eine Mustertabelle mit 107 Zeilen ist genau die Sorte Code, bei der eine
// vertauschte Zeile nicht auffaellt: der Strichcode sieht tadellos aus und
// liest sich als Unsinn. Deshalb sind die Erwartungen hier **gegen einen
// echten Decoder** entstanden (`pyzbar`/zbar, gegen die gerasterten Etiketten
// bei 203 dpi) und nicht aus derselben Tabelle abgeleitet, die geprueft wird.
import { describe, expect, it } from "vitest";
import { code128cWerte, code128cElemente, code128cModule, code128cBalken } from "../../src/code128.js";

describe("code128cWerte", () => {
  it("rahmt die Ziffernpaare mit Start, Pruefzeichen und Stopp", () => {
    expect(code128cWerte("1234567890")).toEqual([105, 12, 34, 56, 78, 90, 85, 106]);
  });

  it("rechnet das Pruefzeichen nach Position gewichtet", () => {
    // 105 + 1*11 + 2*49 + 3*67 + 4*20 + 5*48 = 735; 735 mod 103 = 14.
    expect(code128cWerte("1149672048")).toEqual([105, 11, 49, 67, 20, 48, 14, 106]);
  });

  it("weist alles ab, was kein Ziffernpaar ist", () => {
    // Ein Etikett mit falsch kodiertem Code waere schlimmer als gar keins.
    expect(() => code128cWerte("12345")).toThrow(/gerader Laenge/);
    expect(() => code128cWerte("12A4")).toThrow(/Ziffernfolge/);
    expect(() => code128cWerte("")).toThrow();
  });
});

describe("code128cElemente", () => {
  it("liefert die vom Decoder bestaetigte Elementfolge", () => {
    // Diese Folge ist der Gegenprobe entnommen: als Bild gerendert liest zbar
    // daraus wieder "1149672048".
    expect(code128cElemente("1149672048")).toEqual([
      2, 1, 1, 2, 3, 2, 2, 3, 1, 2, 1, 2, 2, 1, 1, 3, 3, 1, 1, 4, 1, 1, 2, 2,
      2, 2, 1, 2, 3, 1, 3, 1, 3, 1, 2, 1, 1, 2, 2, 2, 3, 1, 2, 3, 3, 1, 1, 1, 2,
    ]);
  });

  it("endet auf einem Balken", () => {
    // Der Stopp traegt hinten zwei Module extra — ohne die fehlt dem Decoder
    // die letzte Kante.
    const e = code128cElemente("1149672048");
    expect(e.length % 2).toBe(1);
    expect(e[e.length - 1]).toBe(2);
  });
});

describe("code128cModule", () => {
  it("braucht fuer zehn Ziffern 90 Module", () => {
    // Daraus folgt die Mindestbreite der Etikettenrolle, deshalb steht die
    // Zahl hier fest: 11 (Start) + 5x11 + 11 (Pruefzeichen) + 13 (Stopp).
    expect(code128cModule("1149672048")).toBe(90);
  });

  it("waechst um 11 Module je Ziffernpaar", () => {
    expect(code128cModule("12345678901234") - code128cModule("1234567890")).toBe(22);
  });
});

describe("code128cBalken", () => {
  it("gibt nur die schwarzen Elemente zurueck", () => {
    const balken = code128cBalken("1149672048");
    expect(balken).toHaveLength(25);
    expect(balken[0]).toEqual({ x: 0, breite: 2 });
  });

  it("laesst die Balken einander nicht beruehren", () => {
    // Zwei aneinanderstossende Balken waeren ein breiter Balken — der Code
    // waere still kaputt.
    const balken = code128cBalken("1149672048");
    for (let i = 1; i < balken.length; i++) {
      expect(balken[i].x).toBeGreaterThan(balken[i - 1].x + balken[i - 1].breite);
    }
  });

  it("endet genau auf der Gesamtbreite", () => {
    const balken = code128cBalken("1149672048");
    const letzter = balken[balken.length - 1];
    expect(letzter.x + letzter.breite).toBe(code128cModule("1149672048"));
  });
});
