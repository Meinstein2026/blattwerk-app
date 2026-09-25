// „Was bis Jahresende noch kommt" (Max, 11.09.2026: „nimm alle planbaren
// kosten rein ... ja bitte getrennt").
//
// Bewusst GETRENNT vom Gewinn: der Gewinn bleibt eine Tatsache aus gebuchten
// Belegen und laesst sich gegen Dolibarr abgleichen. Sobald Schaetzungen
// hineinliefen, ginge das nicht mehr. Die Vorschau steht daneben.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von); const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
const sandbox = {};
vm.createContext(sandbox);
// Die Vorschau steht innerhalb des Finanzabschnitts und braucht afaUebersicht
// von dort — deshalb der ganze Abschnitt statt nur des Vorschau-Blocks.
const { monatsBetrag, restMonate, prognose, RHYTHMEN } = vm.runInContext(
  `(() => { ${schnitt("// ─── Zahlungserfassung & Finanzübersicht",
                      "// ─── Ende Zahlungserfassung & Finanzübersicht")}; ` +
  `return { monatsBetrag, restMonate, prognose, RHYTHMEN }; })()`, sandbox);

describe("monatsBetrag", () => {
  it("rechnet jeden Rhythmus auf den Monat herunter", () => {
    expect(monatsBetrag({ betrag: 30, rhythmus: "monat" })).toBeCloseTo(30, 2);
    expect(monatsBetrag({ betrag: 90, rhythmus: "quartal" })).toBeCloseTo(30, 2);
    expect(monatsBetrag({ betrag: 180, rhythmus: "halbjahr" })).toBeCloseTo(30, 2);
    expect(monatsBetrag({ betrag: 360, rhythmus: "jahr" })).toBeCloseTo(30, 2);
  });
  it("unbekannter Rhythmus zaehlt als monatlich — lieber zu viel erwarten", () => {
    expect(monatsBetrag({ betrag: 30, rhythmus: "quatsch" })).toBeCloseTo(30, 2);
  });
  it("kommt mit fehlenden Angaben zurecht", () => {
    expect(monatsBetrag({})).toBe(0);
    expect(monatsBetrag(null)).toBe(0);
    expect(monatsBetrag({ betrag: "abc", rhythmus: "monat" })).toBe(0);
  });
});

describe("restMonate", () => {
  it("zaehlt die Monate nach dem laufenden bis Jahresende", () => {
    // Am 11.09. kommen Oktober, November, Dezember noch ganz.
    expect(restMonate("2026-09-11")).toBe(3);
    expect(restMonate("2026-01-15")).toBe(11);
    expect(restMonate("2026-12-01")).toBe(0);
  });
});

describe("prognose", () => {
  const anlagen = [
    { betrag: 3700, afaJahre: 2, gekauft: "2026-08-10", sonderAfaProzent: 20, sonderAfaJahr: 2026 },
  ];

  it("zeigt, was von der AfA dieses Jahr noch aussteht", () => {
    const p = prognose({ anlagegueter: anlagen, fixkosten: [], heute: "2026-09-11" });
    // AfA 2026 gesamt minus dem, was bis heute aufgelaufen ist.
    expect(p.restAfa).toBeCloseTo(770.83 + 740 - 308.33, 1);
  });

  it("rechnet die Fixkosten auf die Restmonate hoch", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-11",
      fixkosten: [{ name: "Internet", betrag: 30, rhythmus: "monat" },
                  { name: "Versicherung", betrag: 300, rhythmus: "quartal" }],
    });
    expect(p.restFixkosten).toBeCloseTo((30 + 100) * 3, 2);
  });

  it("abgeschaltete Posten zaehlen nicht mit", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-11",
      fixkosten: [{ name: "Internet", betrag: 30, rhythmus: "monat" },
                  { name: "Alt", betrag: 999, rhythmus: "monat", aus: true }],
    });
    expect(p.restFixkosten).toBeCloseTo(90, 2);
  });

  it("summiert beides und leitet den erwarteten Jahresgewinn ab", () => {
    const p = prognose({
      anlagegueter: anlagen, heute: "2026-09-11", gewinn: 2484.97,
      fixkosten: [{ name: "Internet", betrag: 30, rhythmus: "monat" }],
    });
    expect(p.gesamt).toBeCloseTo(p.restAfa + p.restFixkosten, 2);
    expect(p.erwarteterGewinn).toBeCloseTo(2484.97 - p.gesamt, 2);
  });

  it("im Dezember steht nichts mehr aus", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-12-20",
      fixkosten: [{ name: "Internet", betrag: 30, rhythmus: "monat" }],
    });
    expect(p.restFixkosten).toBe(0);
  });

  it("ohne alles ist die Vorschau null, nicht kaputt", () => {
    const p = prognose({ heute: "2026-09-11" });
    expect(p.restAfa).toBe(0);
    expect(p.restFixkosten).toBe(0);
    expect(p.gesamt).toBe(0);
  });

  it("eine negative Rest-AfA gibt es nicht", () => {
    // Wenn die Jahres-AfA schon uebererfuellt ist, bleibt 0 statt eines Minus.
    const p = prognose({
      anlagegueter: [{ betrag: 1200, afaJahre: 1, gekauft: "2026-01-01" }],
      fixkosten: [], heute: "2026-12-31",
    });
    expect(p.restAfa).toBeGreaterThanOrEqual(0);
  });
});

describe("RHYTHMEN", () => {
  it("bietet die vier ueblichen Zahlweisen mit deutscher Beschriftung", () => {
    expect(RHYTHMEN.map((r) => r.id)).toEqual(["monat", "quartal", "halbjahr", "jahr"]);
    for (const r of RHYTHMEN) expect(r.name).toMatch(/\S/);
  });
});

// ─── 12.09.2026: Jahresbetraege duerfen nicht gleichmaessig verteilt werden ──
// Aufgefallen an der Fiat-Versicherung: 574,95 € sahen nach einem Jahresbeitrag
// aus, waren aber der Rumpfbeitrag 16.08.–31.12.2026. Der echte Jahresbeitrag
// ist 1.533,21 €, faellig erst zum 01.01.2027 — fuer den Rest von 2026 kommt
// also NICHTS mehr. Die gleichmaessige Verteilung hat 143,73 € zu viel
// vorhergesagt.
//
// Deshalb: jeder Posten kann ein Faelligkeitsdatum tragen. Ist es gesetzt,
// zaehlen nur die Faelligkeiten, die im Rest des Jahres wirklich anfallen.
describe("prognose mit Faelligkeiten", () => {
  it("ein Jahresposten, der erst naechstes Jahr faellig wird, zaehlt nicht mehr", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "KFZ Fiat", betrag: 1533.21, rhythmus: "jahr", faellig: "2027-01-01" }],
    });
    expect(p.restFixkosten).toBe(0);
  });

  it("ein Jahresposten, der dieses Jahr noch faellig wird, zaehlt voll", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "Kfz-Steuer", betrag: 103, rhythmus: "jahr", faellig: "2026-11-15" }],
    });
    expect(p.restFixkosten).toBeCloseTo(103, 2);
  });

  it("monatliche Posten laufen ab der Faelligkeit weiter", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "Bank", betrag: 20, rhythmus: "monat", faellig: "2026-10-01" }],
    });
    expect(p.restFixkosten).toBeCloseTo(60, 2);  // Okt, Nov, Dez
  });

  it("halbjaehrlich: nur die Faelligkeiten im Rest des Jahres", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "goneo", betrag: 59.94, rhythmus: "halbjahr", faellig: "2027-01-24" }],
    });
    expect(p.restFixkosten).toBe(0);
  });

  it("ohne Faelligkeit bleibt es bei der Gleichverteilung", () => {
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "Alt", betrag: 120, rhythmus: "jahr" }],
    });
    expect(p.restFixkosten).toBeCloseTo(30, 2);  // 10 €/Monat × 3
  });

  it("eine Faelligkeit in der Vergangenheit wird vorgerollt, nicht doppelt gezaehlt", () => {
    // Bankgebuehren mit Faelligkeit 01.06.: die naechsten liegen Okt/Nov/Dez.
    const p = prognose({
      anlagegueter: [], heute: "2026-09-12",
      fixkosten: [{ name: "Bank", betrag: 20, rhythmus: "monat", faellig: "2026-06-01" }],
    });
    expect(p.restFixkosten).toBeCloseTo(60, 2);
  });
});
