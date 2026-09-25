// Kataloge des Baumkatasters. Der wichtigste Test hier: die drei Befund-
// Listen, die die Vor-Ort-GBU seit Juli benutzt, kommen jetzt AUS dem
// Kataster — mit exakt denselben Werten. Ändert jemand die Kataster-Liste,
// fällt hier auf, dass die GBU-Maske (und jedes alte GBU-PDF) mitläuft.
import { describe, expect, it } from "vitest";
import {
  BK_ALTERSPHASEN, BK_BAUMARTEN, BK_BEFUND, BK_BEFUND_LABEL, BK_DRINGLICHKEIT, BK_FARBEN,
  BK_INTERVALL, BK_KONTROLLARTEN, BK_MASSNAHMEN, BK_STORE_LEER, BK_INDEX_LEER, BK_VERKEHRSSICHER, BK_VITALITAET,
  BK_GBU_GESUNDHEIT, BK_GBU_STANDSICHERHEIT,
} from "../../src/baumkataster-data.js";
import { GBU_BAUM_KRONE, GBU_BAUM_STAMM, GBU_BAUM_UMFELD } from "../../src/gbu-data.js";

// Stand vor der Umstellung (src/gbu-data.js, 16.09.2026) — wörtlich.
const ALT_UMFELD = [
  "Bodenrisse", "Absturzkanten", "Nachbarbäume", "Gewässer", "Wurzelverletzung",
  "Gebäude", "Pilzfruchtkörper", "Fallbereich frei",
];
const ALT_STAMM = [
  "Defektsymptome (Risse/Wülste/Beulen/Rippen)", "Baumchirurgische Maßnahmen",
  "Eingehende Kontrolle (Diagnosegerät)", "Pilzfruchtkörper", "Wunden",
  "Eingehende Kontrolle (Stechschnitt)", "Faulstellen", "Abgestorbene Rinde",
];
const ALT_KRONE = [
  "Vitalität", "Totholz", "Defektsymptome", "Zwieselbildung", "Ausbrüche",
  "Sturmschäden", "Insektennester", "alte Kronensicherung", "Kappung", "Faulstellen",
  "Pilzfruchtkörper", "Gefährliche Äste", "Abgebrochene Krone",
];

describe("GBU-Listen kommen aus dem Kataster", () => {
  it("die drei alten GBU-Arrays sind wertgleich zu BK_BEFUND", () => {
    expect(GBU_BAUM_UMFELD).toEqual(ALT_UMFELD);
    expect(GBU_BAUM_STAMM).toEqual(ALT_STAMM);
    expect(GBU_BAUM_KRONE).toEqual(ALT_KRONE);
  });
  it("und sind dieselben Objekte, nicht Kopien", () => {
    expect(GBU_BAUM_UMFELD).toBe(BK_BEFUND.umfeld);
    expect(GBU_BAUM_STAMM).toBe(BK_BEFUND.stamm);
    expect(GBU_BAUM_KRONE).toBe(BK_BEFUND.krone);
  });
  it("Befund kennt fünf Bereiche mit Beschriftung", () => {
    expect(Object.keys(BK_BEFUND)).toEqual(["umfeld", "wurzel", "stammfuss", "stamm", "krone"]);
    for (const k of Object.keys(BK_BEFUND)) {
      expect(BK_BEFUND[k].length).toBeGreaterThan(3);
      expect(typeof BK_BEFUND_LABEL[k]).toBe("string");
    }
  });
});

describe("Kataloge", () => {
  it("Baumarten: mindestens 60, jede mit lateinischem und deutschem Namen, keine doppelt", () => {
    expect(BK_BAUMARTEN.length).toBeGreaterThanOrEqual(60);
    for (const a of BK_BAUMARTEN) { expect(a.lat).toMatch(/^[A-Z]/); expect(a.de.length).toBeGreaterThan(2); }
    expect(new Set(BK_BAUMARTEN.map((a) => a.lat)).size).toBe(BK_BAUMARTEN.length);
  });
  it("Altersphasen, Vitalität (Roloff 0–3), Verkehrssicherheit, Kontrollarten", () => {
    expect(BK_ALTERSPHASEN).toEqual(["Jugendphase", "Reifephase", "Alterungsphase"]);
    expect(BK_VITALITAET.map((v) => v.stufe)).toEqual([0, 1, 2, 3]);
    expect(BK_VERKEHRSSICHER.map((v) => v.id)).toEqual(["ja", "eingeschraenkt", "nein"]);
    expect(BK_KONTROLLARTEN).toEqual(["Regelkontrolle", "Zusatzkontrolle", "eingehende Untersuchung"]);
  });
  it("Dringlichkeit mit Standardfristen: sofort 0 T, kurzfristig 4 W, mittelfristig 6 M, langfristig 12 M", () => {
    const d = Object.fromEntries(BK_DRINGLICHKEIT.map((x) => [x.id, x]));
    expect(d.sofort.tage).toBe(0);
    expect(d.kurzfristig.tage).toBe(28);
    expect(d.mittelfristig.monate).toBe(6);
    expect(d.langfristig.monate).toBe(12);
  });
  it("Intervalltabelle je Altersphase und Schadstufe in Monaten", () => {
    expect(BK_INTERVALL.Jugendphase).toEqual({ gesund: 36, geschwaecht: 24, geschaedigt: 12 });
    expect(BK_INTERVALL.Reifephase).toEqual({ gesund: 24, geschwaecht: 18, geschaedigt: 12 });
    expect(BK_INTERVALL.Alterungsphase).toEqual({ gesund: 12, geschwaecht: 12, geschaedigt: 12 });
  });
  it("Maßnahmen nach ZTV-Baumpflege, Farben, leere Stores", () => {
    for (const m of ["Totholzentfernung", "Kronenpflege", "Kroneneinkürzung", "Kronensicherung", "Fällung", "eingehende Untersuchung", "Wurzelbereich freistellen", "Sonstige Maßnahme"]) {
      expect(BK_MASSNAHMEN).toContain(m);
    }
    expect(Object.keys(BK_FARBEN).sort()).toEqual(["gelb", "grau", "gruen", "rot"]);
    expect(BK_STORE_LEER).toEqual({ version: 1, kunde: { id: null, name: "" }, objekte: {}, baeume: {} });
    expect(BK_INDEX_LEER).toEqual({ version: 1, kunden: {} });
  });
  it("Übersetzung in die Wortwahl der GBU (Teilprojekt B)", () => {
    expect(BK_GBU_GESUNDHEIT).toEqual({ 0: "vital", 1: "leicht eingeschränkt", 2: "deutlich eingeschränkt", 3: "absterbend" });
    expect(BK_GBU_STANDSICHERHEIT).toEqual({ ja: "gegeben", eingeschraenkt: "eingeschränkt", nein: "eingehende Untersuchung erforderlich" });
  });
});
