// Sanity-Check der Textbausteine: nichts leer, nichts doppelt, sechs
// Abschnitte in der verlangten Reihenfolge. Die inhaltliche Richtigkeit
// (Fundstellen) ist keine Testfrage, sondern steht als Kommentar in der
// Datei — hier geht es nur um die Form.
import { describe, expect, it } from "vitest";
import {
  BA_ABSCHNITTE_IDS, BA_ABSCHNITT_TITEL, BA_ARTEN,
  BA_ANWENDUNGSBEREICH_A, BA_ANWENDUNGSBEREICH_B,
  BA_AUSRUESTUNG_NORMEN, BA_ERSTE_HILFE, BA_GEFAHREN_A, BA_GEFAHREN_B,
  BA_INSTANDHALTUNG, BA_SCHUTZMASSNAHMEN_A, BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH,
  BA_STOERUNGEN, BA_UNTERNEHMER_ERKLAERUNG,
} from "../../src/betriebsanweisung-data.js";

describe("BA_ARTEN", () => {
  it("kennt genau SKT A und SKT B", () => {
    expect(BA_ARTEN.map((a) => a.id)).toEqual(["skt-a", "skt-b"]);
    for (const a of BA_ARTEN) expect(a.label.length).toBeGreaterThan(0);
  });
});

describe("Abschnitte", () => {
  it("sechs IDs mit Titel, in der verlangten Reihenfolge", () => {
    expect(BA_ABSCHNITTE_IDS).toEqual([
      "anwendungsbereich", "gefahren", "schutzmassnahmen", "stoerungen", "erstehilfe", "instandhaltung",
    ]);
    for (const id of BA_ABSCHNITTE_IDS) expect(BA_ABSCHNITT_TITEL[id]).toBeTruthy();
  });
});

describe("Textbausteine", () => {
  it("Anwendungsbereich je Fassung ist ein nicht-leerer Text", () => {
    expect(BA_ANWENDUNGSBEREICH_A).toMatch(/Seilklettertechnik/);
    expect(BA_ANWENDUNGSBEREICH_A).toMatch(/ohne Motorsägeneinsatz/);
    expect(BA_ANWENDUNGSBEREICH_B).toMatch(/Motorsägen/);
  });

  it("Gefahrenlisten sind nicht leer und ohne Duplikate", () => {
    for (const liste of [BA_GEFAHREN_A, BA_GEFAHREN_B]) {
      expect(liste.length).toBeGreaterThan(5);
      expect(new Set(liste).size).toBe(liste.length);
      for (const g of liste) expect(g.trim().length).toBeGreaterThan(0);
    }
  });

  it("Schutzmaßnahmen SKT A enthalten die Kernregeln aus der Vorschrift", () => {
    expect(BA_SCHUTZMASSNAHMEN_A).toContain("Jeder Anwender der SKT muss ausgebildeter Ersthelfer sein.");
    expect(BA_SCHUTZMASSNAHMEN_A.some((s) => /Rettungsseil/.test(s))).toBe(true);
    expect(BA_SCHUTZMASSNAHMEN_A.length).toBeGreaterThan(20);
  });

  it("Schutzmaßnahmen SKT B (zusätzlich) verweisen nicht mehr redundant auf SKT A", () => {
    expect(BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH.some((s) => /SKT A.*zwingend/.test(s))).toBe(false);
    expect(BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH.some((s) => /Motorsäge/.test(s))).toBe(true);
  });

  it("Störungen, Erste Hilfe, Instandhaltung sind für beide Fassungen gemeinsam gepflegt", () => {
    expect(BA_STOERUNGEN.length).toBe(4);
    expect(BA_ERSTE_HILFE.some((s) => /Notruf/.test(s))).toBe(true);
    expect(BA_INSTANDHALTUNG.some((s) => /BGG 906/.test(s))).toBe(true);
  });

  it("Normen der Ausrüstung stammen aus VSG 4.2", () => {
    expect(BA_AUSRUESTUNG_NORMEN.some((s) => /EN 12841/.test(s))).toBe(true);
  });

  it("Unternehmer-Erklärung ist die wörtliche Bestätigung der Vorschrift", () => {
    expect(BA_UNTERNEHMER_ERKLAERUNG).toMatch(/betrieblichen Verhältnissen und Erkenntnissen der Gefährdungsbeurteilung/);
  });
});
