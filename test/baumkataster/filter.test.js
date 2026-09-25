// bkFilter blendet AUS — Karte, Liste und Fällig rendern aus demselben
// Ergebnis, damit sie nie auseinanderlaufen (Spec Abschnitt 2). Der Kunde ist
// seit der Präzisierung vom 17.09.2026 ein Filter, keine Voraussetzung.
import { describe, expect, it } from "vitest";
import {
  BK_FILTER_LEER, bkArtenImBestand, bkBaeumeAllerKunden, bkFilter, bkFilterAktiv,
  bkObjekteImBestand, bkVerortet,
} from "../../src/baumkataster.js";

const HEUTE = "2026-09-17";
const baum = (nr, o = {}) => ({
  nr, status: "aktiv", art: "", artDe: "", standort: "", objekt: "",
  kundeId: "12", kundeName: "Stadt Musterstadt",
  kontrollen: [], massnahmen: [], ...o,
});
const kontrolle = (o) => ({ id: "k-1", datum: "2026-01-01", vitalitaet: 1, verkehrssicher: "ja", ...o });
const f = (o) => ({ ...BK_FILTER_LEER, ...o });

const EICHE = baum("B-0001", {
  artDe: "Stieleiche", art: "Quercus robur", standort: "Wiese", objekt: "obj-1",
  kontrollen: [kontrolle({ naechsteKontrolle: "2028-01-01", verkehrssicher: "ja" })],
});
const LINDE = baum("B-0002", {
  artDe: "Winterlinde", art: "Tilia cordata", standort: "Wegrand", objekt: "obj-2",
  kontrollen: [kontrolle({ naechsteKontrolle: "2026-09-20", verkehrssicher: "eingeschraenkt" })],
  massnahmen: [{ id: "m-1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "2026-12-01", status: "offen" }],
});
const AHORN = baum("B-0003", {
  artDe: "Bergahorn", art: "Acer pseudoplatanus", standort: "Hof", objekt: "obj-1",
  kontrollen: [kontrolle({ naechsteKontrolle: "2026-01-01", verkehrssicher: "nein" })],
  massnahmen: [{ id: "m-2", art: "Fällung", dringlichkeit: "sofort", faelligBis: "2026-09-17", status: "offen" }],
});
const ALLE = [EICHE, LINDE, AHORN];
const nrs = (liste) => liste.map((b) => b.nr);

describe("bkBaeumeAllerKunden", () => {
  const stores = {
    12: { version: 1, kunde: { id: 12, name: "Stadt Musterstadt" }, objekte: {}, baeume: {
      "B-0001": { nr: "B-0001", status: "aktiv" }, "B-0002": { nr: "B-0002", status: "gefaellt" } } },
    7: { version: 1, kunde: { id: 7, name: "Awo Gießen" }, objekte: {}, baeume: {
      "B-0001": { nr: "B-0001", status: "aktiv" } } },
  };
  it("flacht alle Stores ab und hängt Kunde an jeden Baum", () => {
    const alle = bkBaeumeAllerKunden(stores);
    expect(alle.map((b) => `${b.kundeName}/${b.nr}`)).toEqual(["Awo Gießen/B-0001", "Stadt Musterstadt/B-0001", "Stadt Musterstadt/B-0002"]);
    expect(alle[0].kundeId).toBe("7");
  });
  // I4 aus der Whole-Branch-Review: die Basisfassung filterte nicht-aktive
  // Bäume NICHT hier weg (nur die Karte tat das) — dieser Zweig hatte den
  // Filter versehentlich an die einzige gemeinsame Quelle gehängt, wodurch ein
  // gefällter Baum aus Liste UND Fällig verschwand, samt seiner Kontroll-
  // historie. Gefiltert wird jetzt wieder erst in BaumKarte.jsx.
  it("lässt gefällte und entfernte Bäume NICHT weg — das erledigt allein die Karte — und verträgt Unsinn", () => {
    expect(bkBaeumeAllerKunden(stores).length).toBe(3);
    expect(bkBaeumeAllerKunden(stores).some((b) => b.nr === "B-0002" && b.status === "gefaellt")).toBe(true);
    expect(bkBaeumeAllerKunden(null)).toEqual([]);
    expect(bkBaeumeAllerKunden({ 9: null })).toEqual([]);
  });
});

describe("bkVerortet", () => {
  it("gibt nur Bäume mit brauchbaren Koordinaten als Punktpaare", () => {
    expect(bkVerortet([baum("B-1", { lat: 50, lon: 8 }), baum("B-2"), baum("B-3", { lat: "x", lon: 8 })]))
      .toEqual([[50, 8]]);
    expect(bkVerortet(null)).toEqual([]);
  });
});

describe("bkFilter", () => {
  it("ohne Filter kommen alle zurück, nach Kunde und Nummer sortiert", () => {
    expect(nrs(bkFilter([AHORN, EICHE, LINDE], BK_FILTER_LEER, HEUTE))).toEqual(["B-0001", "B-0002", "B-0003"]);
    expect(bkFilterAktiv(BK_FILTER_LEER)).toBe(false);
  });

  it("Kunden-Mehrfachauswahl: leer heißt alle", () => {
    const fremd = baum("B-0004", { kundeId: "7", kundeName: "Awo Gießen" });
    const menge = [...ALLE, fremd];
    expect(nrs(bkFilter(menge, f({ kunden: [] }), HEUTE))).toEqual(["B-0004", "B-0001", "B-0002", "B-0003"]);
    expect(nrs(bkFilter(menge, f({ kunden: ["7"] }), HEUTE))).toEqual(["B-0004"]);
    expect(nrs(bkFilter(menge, f({ kunden: ["7", "12"] }), HEUTE))).toEqual(["B-0004", "B-0001", "B-0002", "B-0003"]);
    expect(bkFilterAktiv(f({ kunden: ["7"] }))).toBe(true);
    // Kunden-Ids kommen aus Dolibarr mal als Zahl, mal als Zeichenkette.
    expect(nrs(bkFilter(menge, f({ kunden: [7] }), HEUTE))).toEqual(["B-0004"]);
  });

  it("zeigt auch Bäume ohne Position — sie sollen nicht unsichtbar werden", () => {
    const ohne = baum("B-0005", { standort: "noch nicht verortet" });
    expect(nrs(bkFilter([ohne], BK_FILTER_LEER, HEUTE))).toEqual(["B-0005"]);
  });

  it("Kontrolle fällig zeigt gelb und rot, überfällig nur rot", () => {
    expect(nrs(bkFilter(ALLE, f({ kontrolle: "faellig" }), HEUTE))).toEqual(["B-0002", "B-0003"]);
    expect(nrs(bkFilter(ALLE, f({ kontrolle: "ueberfaellig" }), HEUTE))).toEqual(["B-0003"]);
  });

  it("Verkehrssicherheit je Stufe", () => {
    expect(nrs(bkFilter(ALLE, f({ sicherheit: "ja" }), HEUTE))).toEqual(["B-0001"]);
    expect(nrs(bkFilter(ALLE, f({ sicherheit: "eingeschraenkt" }), HEUTE))).toEqual(["B-0002"]);
    expect(nrs(bkFilter(ALLE, f({ sicherheit: "nein" }), HEUTE))).toEqual(["B-0003"]);
  });

  it("Maßnahmen offen, sofort und keine", () => {
    expect(nrs(bkFilter(ALLE, f({ massnahmen: "offen" }), HEUTE))).toEqual(["B-0002", "B-0003"]);
    expect(nrs(bkFilter(ALLE, f({ massnahmen: "sofort" }), HEUTE))).toEqual(["B-0003"]);
    expect(nrs(bkFilter(ALLE, f({ massnahmen: "keine" }), HEUTE))).toEqual(["B-0001"]);
  });

  it("Art trifft deutsch und lateinisch, Objekt genau", () => {
    expect(nrs(bkFilter(ALLE, f({ art: "linde" }), HEUTE))).toEqual(["B-0002"]);
    expect(nrs(bkFilter(ALLE, f({ art: "Quercus" }), HEUTE))).toEqual(["B-0001"]);
    expect(nrs(bkFilter(ALLE, f({ objekt: "obj-1" }), HEUTE))).toEqual(["B-0001", "B-0003"]);
  });

  it("Freitext sucht in Nummer, Art und Standort", () => {
    expect(nrs(bkFilter(ALLE, f({ text: "wegrand" }), HEUTE))).toEqual(["B-0002"]);
    expect(nrs(bkFilter(ALLE, f({ text: "B-0003" }), HEUTE))).toEqual(["B-0003"]);
    // Seit 19.09.2026 auch der Kundenname — im Filtermenü gibt es EIN Suchfeld.
    const fremd = baum("B-0009", { kundeId: "7", kundeName: "Awo Gießen" });
    expect(nrs(bkFilter([...ALLE, fremd], f({ text: "awo" }), HEUTE))).toEqual(["B-0009"]);
  });

  it("kombiniert mit UND, nicht mit ODER", () => {
    expect(nrs(bkFilter(ALLE, f({ kontrolle: "faellig", massnahmen: "sofort" }), HEUTE))).toEqual(["B-0003"]);
    expect(nrs(bkFilter(ALLE, f({ kontrolle: "ueberfaellig", sicherheit: "ja" }), HEUTE))).toEqual([]);
  });

  it("nie kontrollierte Bäume gelten als fällig und als überfällig", () => {
    const neu = baum("B-0009");
    expect(nrs(bkFilter([neu], f({ kontrolle: "faellig" }), HEUTE))).toEqual(["B-0009"]);
    expect(nrs(bkFilter([neu], f({ kontrolle: "ueberfaellig" }), HEUTE))).toEqual(["B-0009"]);
  });

  it("verträgt Unsinn statt einer Liste", () => {
    expect(bkFilter(null, BK_FILTER_LEER, HEUTE)).toEqual([]);
    expect(nrs(bkFilter(ALLE, null, HEUTE))).toEqual(["B-0001", "B-0002", "B-0003"]);
  });

  it("bkFilterAktiv erkennt jede gesetzte Einschränkung", () => {
    expect(bkFilterAktiv(f({ text: "x" }))).toBe(true);
    expect(bkFilterAktiv(f({ kontrolle: "faellig" }))).toBe(true);
    expect(bkFilterAktiv(f({ text: "   " }))).toBe(false);
  });
});

// Bestandslisten für die Auswahlen „Baumart" und „Objekt" in der Filterleiste
// — nur was in den geladenen Bäumen tatsächlich vorkommt, alphabetisch, ohne
// Duplikate. Reine Funktionen, damit die Leiste selbst nur noch rendert.
describe("bkArtenImBestand", () => {
  it("liefert die vorkommenden Arten alphabetisch, ohne Duplikate", () => {
    expect(bkArtenImBestand(ALLE)).toEqual(["Bergahorn", "Stieleiche", "Winterlinde"]);
  });
  it("weicht auf den lateinischen Namen aus, wenn Deutsch fehlt", () => {
    const b = baum("B-0006", { artDe: "", art: "Fraxinus excelsior" });
    expect(bkArtenImBestand([b])).toEqual(["Fraxinus excelsior"]);
  });
  it("lässt Bäume ganz ohne Art aus und verträgt Unsinn", () => {
    const ohne = baum("B-0007", { artDe: "", art: "" });
    expect(bkArtenImBestand([ohne])).toEqual([]);
    expect(bkArtenImBestand(null)).toEqual([]);
    expect(bkArtenImBestand([])).toEqual([]);
  });
  it("dedupliziert gleichnamige Arten", () => {
    const zweite = baum("B-0008", { artDe: "Stieleiche", art: "Quercus robur" });
    expect(bkArtenImBestand([EICHE, zweite])).toEqual(["Stieleiche"]);
  });
});

describe("bkObjekteImBestand", () => {
  const objekte = { "obj-1": { name: "Nordwiese" }, "obj-2": { name: "Am Bach" } };
  it("liefert nur vorkommende Objekte, nach Namen sortiert", () => {
    expect(bkObjekteImBestand(ALLE, objekte)).toEqual([
      { id: "obj-2", name: "Am Bach" },
      { id: "obj-1", name: "Nordwiese" },
    ]);
  });
  it("fällt ohne Namenseintrag auf die Id zurück", () => {
    expect(bkObjekteImBestand([baum("B-0009", { objekt: "obj-9" })], {})).toEqual([{ id: "obj-9", name: "obj-9" }]);
  });
  it("lässt Bäume ohne Objekt aus und verträgt Unsinn", () => {
    const ohne = baum("B-0010", { objekt: "" });
    expect(bkObjekteImBestand([ohne], objekte)).toEqual([]);
    expect(bkObjekteImBestand(null, objekte)).toEqual([]);
    expect(bkObjekteImBestand(ALLE, null)).toEqual([
      { id: "obj-1", name: "obj-1" },
      { id: "obj-2", name: "obj-2" },
    ]);
  });
  it("dedupliziert gleiche Objekt-Ids", () => {
    const zweite = baum("B-0011", { objekt: "obj-1" });
    expect(bkObjekteImBestand([EICHE, zweite], objekte)).toEqual([{ id: "obj-1", name: "Nordwiese" }]);
  });
});
