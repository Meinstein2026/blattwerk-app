// Fahrtenbuch (seit 09.09.2026): reine Logik ohne React, damit die
// Finanzamt-Regeln pruefbar sind, ohne eine Maske zu rendern.
//   - fortlaufende Nummer, nachtraegliche Aenderungen nur mit Vermerk und
//     alter Fassung in der Historie (ordnungsgemaesses Fahrtenbuch: nichts
//     wird ueberschrieben, nichts geloescht — Storno bleibt sichtbar)
//   - Distanz aus km-Stand oder direkt, GPS-Strecke per Haversine
//   - Auswertung betriebliche km je Monat/Jahr + 0,30 €/km
import { describe, expect, it } from "vitest";
import {
  FAHRTTYPEN, KM_PAUSCHALE, FB_STORE_LEER,
  haversineKm, streckeAusPunkten, fahrtDistanz, fahrtFehler,
  fahrtEintragen, fahrzeugEintragen, kmStandJeFahrzeug, fahrtenAuswertung, fahrtenCsv,
  ausstehendeZusammenfuehren,
} from "../../src/fahrtenbuch.js";

const fahrt = (x = {}) => ({
  datum: "2026-09-01", zeitVon: "07:30", zeitBis: "08:10",
  start: "Musterstadt, Zur Musterstraße 10", ziel: "Gießen, Marktplatz",
  kmBeginn: 12000, kmEnde: 12018,
  zweck: "Baumpflege Kunde Müller", kundeId: "42", kundeName: "Müller GmbH", projektId: "",
  typ: "betrieblich", fahrer: "max", fahrzeugId: "fiat",
  ...x,
});

describe("Stammdaten", () => {
  it("kennt die drei Fahrttypen und die Pauschale", () => {
    expect(FAHRTTYPEN.map((t) => t.key)).toEqual(["betrieblich", "privat", "wohnung_betrieb"]);
    expect(KM_PAUSCHALE).toBe(0.3);
    expect(FB_STORE_LEER).toEqual({ version: 1, fahrten: [], fahrzeuge: [], kette: { hash: "", n: 0 } });
  });
});

describe("Strecke", () => {
  it("Haversine: Musterstadt → Gießen rund 9 km", () => {
    const km = haversineKm({ lat: 50.5236, lon: 8.7017 }, { lat: 50.5841, lon: 8.6784 });
    expect(km).toBeGreaterThan(6.5);
    expect(km).toBeLessThan(7.5);
  });
  it("summiert GPS-Punkte, ignoriert Rauschen und ungenaue Punkte", () => {
    const punkte = [
      { lat: 50.5236, lon: 8.7017, genauigkeit: 10 },
      { lat: 50.52361, lon: 8.70171, genauigkeit: 10 },   // 1 m Rauschen im Stand
      { lat: 50.55, lon: 8.69, genauigkeit: 500 },         // Funkzelle, unbrauchbar
      { lat: 50.5841, lon: 8.6784, genauigkeit: 8 },
    ];
    const km = streckeAusPunkten(punkte);
    expect(km).toBeGreaterThan(6.5);
    expect(km).toBeLessThan(7.5);
    expect(streckeAusPunkten([])).toBe(0);
    expect(streckeAusPunkten([punkte[0]])).toBe(0);
  });
  it("Distanz: aus km-Stand, sonst aus dem Distanzfeld", () => {
    expect(fahrtDistanz(fahrt())).toBe(18);
    expect(fahrtDistanz(fahrt({ kmBeginn: "", kmEnde: "", distanz: 12.5 }))).toBe(12.5);
    expect(fahrtDistanz(fahrt({ kmBeginn: "", kmEnde: "", distanz: "" }))).toBe(0);
  });
});

describe("fahrtFehler", () => {
  it("laesst eine vollstaendige Fahrt durch", () => {
    expect(fahrtFehler(fahrt())).toBeNull();
    expect(fahrtFehler(fahrt({ kmBeginn: "", kmEnde: "", distanz: 5 }))).toBeNull();
  });
  it("verlangt Datum, Orte, Zweck, Fahrzeug und eine Strecke", () => {
    expect(fahrtFehler(fahrt({ datum: "" }))).toMatch(/Datum/);
    expect(fahrtFehler(fahrt({ start: "" }))).toMatch(/Startort/);
    expect(fahrtFehler(fahrt({ ziel: "" }))).toMatch(/Zielort/);
    expect(fahrtFehler(fahrt({ zweck: "", typ: "betrieblich" }))).toMatch(/Zweck/);
    expect(fahrtFehler(fahrt({ fahrzeugId: "" }))).toMatch(/Fahrzeug/);
    expect(fahrtFehler(fahrt({ kmBeginn: "", kmEnde: "", distanz: "" }))).toMatch(/km/);
  });
  it("km-Stand Ende darf nicht vor dem Beginn liegen", () => {
    expect(fahrtFehler(fahrt({ kmBeginn: 100, kmEnde: 90 }))).toMatch(/km-Stand/);
  });
  it("Privatfahrten brauchen keinen Zweck (Datenschutz), Wohnung–Betrieb auch nicht", () => {
    expect(fahrtFehler(fahrt({ typ: "privat", zweck: "" }))).toBeNull();
    expect(fahrtFehler(fahrt({ typ: "wohnung_betrieb", zweck: "" }))).toBeNull();
  });
});

describe("fahrtEintragen (ordnungsgemaesses Fahrtenbuch)", () => {
  const jetzt = "2026-09-01T09:00:00.000Z";
  it("neue Fahrt bekommt die naechste laufende Nummer und den Anleger", () => {
    const s1 = fahrtEintragen(FB_STORE_LEER, { id: "a", ...fahrt() }, { login: "max", jetzt });
    expect(s1.fahrten).toHaveLength(1);
    expect(s1.fahrten[0]).toMatchObject({ id: "a", lfdNr: 1, angelegtAm: jetzt, angelegtVon: "max", historie: [] });
    const s2 = fahrtEintragen(s1, { id: "b", ...fahrt({ datum: "2026-08-30" }) }, { login: "erika", jetzt });
    expect(s2.fahrten.map((f) => f.lfdNr)).toEqual([1, 2]);
    // Nummer folgt der Reihenfolge der Eintragung, nicht dem Fahrtdatum —
    // genau das macht Nachtraege erkennbar.
    expect(s2.fahrten[1].datum).toBe("2026-08-30");
  });
  it("aendert nichts am uebergebenen Speicher", () => {
    const vorher = { version: 1, fahrten: [], fahrzeuge: [] };
    fahrtEintragen(vorher, { id: "a", ...fahrt() }, { login: "max", jetzt });
    expect(vorher.fahrten).toHaveLength(0);
  });
  it("Aenderung nur mit Vermerk; alte Fassung wandert in die Historie", () => {
    const s1 = fahrtEintragen(FB_STORE_LEER, { id: "a", ...fahrt() }, { login: "max", jetzt });
    expect(() => fahrtEintragen(s1, { id: "a", ...fahrt({ kmEnde: 12020 }) }, { login: "max", jetzt: "2026-09-02T09:00:00.000Z" }))
      .toThrow(/Änderungsvermerk/);
    const s2 = fahrtEintragen(s1, { id: "a", ...fahrt({ kmEnde: 12020 }) },
      { login: "erika", jetzt: "2026-09-02T09:00:00.000Z", grund: "Tippfehler km-Stand" });
    const f = s2.fahrten[0];
    expect(f.lfdNr).toBe(1);
    expect(f.kmEnde).toBe(12020);
    expect(f.angelegtVon).toBe("max");
    expect(f.historie).toHaveLength(1);
    expect(f.historie[0]).toMatchObject({ kmEnde: 12018, geaendertAm: "2026-09-02T09:00:00.000Z", geaendertVon: "erika", grund: "Tippfehler km-Stand" });
    expect(f.historie[0].historie).toBeUndefined();
    // Unveraenderte Fahrt ohne Vermerk erneut speichern ist kein Fehler (Nachtragen offline).
    expect(fahrtEintragen(s2, { ...f }, { login: "erika", jetzt }).fahrten[0].historie).toHaveLength(1);
  });
  it("Storno bleibt als Zeile stehen", () => {
    const s1 = fahrtEintragen(FB_STORE_LEER, { id: "a", ...fahrt() }, { login: "max", jetzt });
    const s2 = fahrtEintragen(s1, { id: "a", storniert: true }, { login: "max", jetzt, grund: "doppelt erfasst" });
    expect(s2.fahrten).toHaveLength(1);
    expect(s2.fahrten[0]).toMatchObject({ storniert: true, lfdNr: 1, kmEnde: 12018 });
    expect(s2.fahrten[0].historie[0].grund).toBe("doppelt erfasst");
  });
  it("Fahrzeuge werden je Id ersetzt, nicht verdoppelt", () => {
    const s1 = fahrzeugEintragen(FB_STORE_LEER, { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 1" });
    const s2 = fahrzeugEintragen(s1, { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 12" });
    expect(s2.fahrzeuge).toEqual([{ id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 12" }]);
  });
});

describe("Auswertung", () => {
  const jetzt = "2026-09-01T09:00:00.000Z";
  let s = FB_STORE_LEER;
  s = fahrzeugEintragen(s, { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 1" });
  s = fahrtEintragen(s, { id: "a", ...fahrt({ datum: "2026-08-03", kmBeginn: 12000, kmEnde: 12018 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "b", ...fahrt({ datum: "2026-08-04", typ: "privat", kmBeginn: 12018, kmEnde: 12050 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "c", ...fahrt({ datum: "2026-09-01", typ: "wohnung_betrieb", kmBeginn: 12050, kmEnde: 12060 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "d", ...fahrt({ datum: "2026-09-02", kmBeginn: "", kmEnde: "", distanz: 7.5 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "e", ...fahrt({ datum: "2025-12-31", kmBeginn: 11000, kmEnde: 11100 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "f", ...fahrt({ datum: "2026-09-03", kmBeginn: 12060, kmEnde: 12999 }) }, { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "f", storniert: true }, { login: "max", jetzt, grund: "Testeintrag" });

  it("km-Stand je Fahrzeug = hoechster Endstand der nicht stornierten Fahrten", () => {
    expect(kmStandJeFahrzeug(s)).toEqual({ fiat: 12060 });
  });
  it("betriebliche km je Monat und Jahr mit Pauschale, Storno und Fremdjahr aussen vor", () => {
    const a = fahrtenAuswertung(s, 2026);
    expect(a.monate[7]).toMatchObject({ monat: 8, betrieblich: 18, privat: 32, wohnungBetrieb: 0, gesamt: 50 });
    expect(a.monate[8]).toMatchObject({ monat: 9, betrieblich: 7.5, privat: 0, wohnungBetrieb: 10, gesamt: 17.5 });
    expect(a.monate[7].pauschale).toBeCloseTo(5.4, 2);
    expect(a.jahr).toMatchObject({ betrieblich: 25.5, privat: 32, wohnungBetrieb: 10, gesamt: 67.5 });
    expect(a.jahr.pauschale).toBeCloseTo(7.65, 2);
    expect(a.jahr.anteilBetrieblich).toBeCloseTo(25.5 / 67.5, 4);
  });
  it("CSV: Kopfzeile, Semikolon, deutsche Zahlen, Storno und Aenderungen sichtbar", () => {
    const csv = fahrtenCsv(s);
    const zeilen = csv.split("\n");
    expect(zeilen[0]).toBe("Lfd. Nr.;Datum;Von;Bis;Startort;Zielort;km-Stand Beginn;km-Stand Ende;Distanz km;Fahrttyp;Zweck;Kunde;Fahrer;Fahrzeug;Status;Änderungen");
    expect(zeilen).toHaveLength(1 + 6);
    expect(zeilen[1]).toContain("1;03.08.2026;07:30;08:10;");
    expect(zeilen[1]).toContain(";12000;12018;18,0;Betrieblich;");
    expect(zeilen[4]).toContain(";7,5;Betrieblich;");
    expect(zeilen[6]).toContain(";Storniert;");
    expect(zeilen[6]).toMatch(/Testeintrag/);
  });
  it("CSV maskiert Semikolon und Anfuehrungszeichen im Text", () => {
    const t = fahrtEintragen(FB_STORE_LEER, { id: "x", ...fahrt({ zweck: 'Kunde "Müller"; Baum' }) }, { login: "max", jetzt });
    expect(fahrtenCsv(t).split("\n")[1]).toContain('"Kunde ""Müller""; Baum"');
  });
});

describe("Offline-Nachtrag", () => {
  it("ausstehende Fahrten liegen ueber dem Cache, ohne Nummer", () => {
    const cache = { version: 1, fahrten: [{ id: "a", lfdNr: 1, datum: "2026-09-01" }], fahrzeuge: [] };
    const aus = [{ fahrt: { id: "b", datum: "2026-09-02" }, login: "max" }, { fahrt: { id: "a", datum: "2026-09-01", zweck: "neu" }, login: "max", grund: "x" }];
    const z = ausstehendeZusammenfuehren(cache, aus);
    expect(z.fahrten.map((f) => f.id)).toEqual(["a", "b"]);
    expect(z.fahrten[0]).toMatchObject({ lfdNr: 1, zweck: "neu", ausstehend: true });
    expect(z.fahrten[1]).toMatchObject({ lfdNr: null, ausstehend: true });
  });
});

// ─── Papierblatt (09.09.2026, reduzierte Fassung): 14 Zeilen, 7 Spalten ────
import { BLATT_ZEILEN, FB_ART, FB_FAHRZEUG_STANDARD, fahrtenBlaetter, zeileAusFahrt, fahrtAusZeile, kuerzelAus } from "../../src/fahrtenbuch.js";

describe("Papierblatt", () => {
  const jetzt = "2026-09-01T09:00:00.000Z";
  const basis = (i, x = {}) => ({ id: "b" + i, datum: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}`, zeitVon: "07:00", zeitBis: "07:30",
    start: "Hof", ziel: "Kunde " + i, kmBeginn: 1000 + i * 10, kmEnde: 1010 + i * 10, zweck: "Pflege", typ: "betrieblich", fahrer: "Max Muster", fahrzeugId: "fiat", ...x });
  let s = fahrzeugEintragen(FB_STORE_LEER, { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 2001" });
  s = fahrzeugEintragen(s, { id: "anh", name: "Anhänger" });
  for (let i = 0; i < 16; i++) s = fahrtEintragen(s, basis(i), { login: "max", jetzt });
  s = fahrtEintragen(s, basis(99, { id: "x", fahrzeugId: "anh", typ: "privat" }), { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "b3", storniert: true }, { login: "max", jetzt, grund: "doppelt" });

  it("14 Zeilen je Blatt, fortlaufend nach Nummer, je Fahrzeug eigene Blaetter", () => {
    expect(BLATT_ZEILEN).toBe(14);
    expect(FB_FAHRZEUG_STANDARD.kennzeichen).toBe("MU-ST 2001");
    const bl = fahrtenBlaetter(s, { fahrzeugId: "fiat" });
    expect(bl).toHaveLength(2);
    expect(bl[0].nr).toBe(1);
    expect(bl[0].fahrten).toHaveLength(14);
    expect(bl[1].fahrten).toHaveLength(2);
    expect(bl[0].fahrten.map((f) => f.lfdNr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(fahrtenBlaetter(s, { fahrzeugId: "anh" })[0].fahrten.map((f) => f.id)).toEqual(["x"]);
  });
  it("Storno belegt seine Zeile weiter, zaehlt aber nicht in die Blattsumme", () => {
    const bl = fahrtenBlaetter(s, { fahrzeugId: "fiat" });
    expect(bl[0].fahrten[3].storniert).toBe(true);
    // 13 gueltige × 10 km
    expect(bl[0].summe).toEqual({ betrieblich: 130, wohnungBetrieb: 0, privat: 0 });
    expect(bl[0].von).toBe("2026-08-01");
    expect(bl[0].bis).toBe("2026-08-14");
  });
  it("ohne Fahrten gibt es trotzdem ein leeres Blatt 1", () => {
    const bl = fahrtenBlaetter(FB_STORE_LEER, { fahrzeugId: "fiat" });
    expect(bl).toEqual([{ nr: 1, fahrten: [], von: "", bis: "", summe: { betrieblich: 0, wohnungBetrieb: 0, privat: 0 } }]);
  });
  it("ausstehende (noch unnummerierte) Fahrten stehen am Ende", () => {
    const z = ausstehendeZusammenfuehren(s, [{ fahrt: basis(50, { id: "neu", fahrzeugId: "fiat" }) }]);
    const bl = fahrtenBlaetter(z, { fahrzeugId: "fiat" });
    expect(bl[1].fahrten.map((f) => f.id)).toEqual(["b14", "b15", "neu"]);
  });
  it("zeileAusFahrt: die 7 Spalten des Formulars, Art als Kuerzel", () => {
    expect(FB_ART).toEqual({ betrieblich: "B", wohnung_betrieb: "W", privat: "P" });
    const z = zeileAusFahrt(basis(1, { typ: "wohnung_betrieb", fahrer: "Erika Meier" }));
    expect(z).toMatchObject({ datum: "2026-08-02", kmBeginn: 1010, kmEnde: 1020, ziel: "Kunde 1", zweck: "Pflege", art: "W", fahrer: "Erika Meier", km: 10 });
    expect(zeileAusFahrt(basis(1, { kundeName: "Müller GmbH" })).zweck).toBe("Pflege · Müller GmbH");
    expect(zeileAusFahrt(basis(1, { typ: "privat" })).art).toBe("P");
    expect(zeileAusFahrt(basis(1, { kmBeginn: "", kmEnde: "", distanz: 7.5 })).km).toBe(7.5);
  });
  it("fahrtAusZeile: Art-Kuerzel wird Fahrttyp, km-Staende werden Zahlen, GPS-Distanz bleibt ohne km-Stand", () => {
    const vorlage = { id: "n1", fahrzeugId: "fiat", fahrer: "Max", kundeId: "42", kundeName: "Müller GmbH" };
    const f = fahrtAusZeile({ datum: "2026-09-02", kmBeginn: "2000", kmEnde: "2012", ziel: "Lich", zweck: "Baumpflege", art: "b", fahrer: "Max" }, vorlage);
    expect(f).toMatchObject({ id: "n1", datum: "2026-09-02", kmBeginn: 2000, kmEnde: 2012, typ: "betrieblich", fahrzeugId: "fiat", kundeId: "42", fahrer: "Max", distanz: "" });
    expect(fahrtAusZeile({ datum: "2026-09-02", kmBeginn: "10", kmEnde: "18", ziel: "Wohnung", art: "W" }, vorlage).typ).toBe("wohnung_betrieb");
    expect(fahrtAusZeile({ datum: "2026-09-02", kmBeginn: "10", kmEnde: "18", ziel: "Bad", art: "P" }, vorlage).typ).toBe("privat");
    expect(fahrtAusZeile({ datum: "2026-09-02", ziel: "Bad", art: "", kmBeginn: "", kmEnde: "", km: "7,5" }, vorlage)).toMatchObject({ typ: "betrieblich", distanz: 7.5 });
    expect(fahrtFehler(fahrtAusZeile({ datum: "2026-09-02", ziel: "Lich", zweck: "x", kmBeginn: "1", kmEnde: "5", art: "B" }, { ...vorlage, start: "Hof" }))).toBeNull();
  });
  it("Kuerzel aus dem Namen", () => {
    expect(kuerzelAus("Max Muster")).toBe("MM");
    expect(kuerzelAus("erika")).toBe("E");
    expect(kuerzelAus("")).toBe("");
  });
});

// ─── Handy-Ansicht (09.09.2026): Liste nach Monaten statt Papierblatt ───────
import { fahrtenListe, fahrtKarte } from "../../src/fahrtenbuch.js";

describe("Handy-Ansicht", () => {
  const jetzt = "2026-09-01T09:00:00.000Z";
  const f = (id, x = {}) => ({ id, datum: "2026-08-10", zeitVon: "07:00", zeitBis: "07:30", start: "Hof", ziel: "Kunde " + id,
    kmBeginn: 1000, kmEnde: 1010, zweck: "Pflege", typ: "betrieblich", fahrer: "Max Muster", fahrzeugId: "fiat", ...x });
  let s = fahrzeugEintragen(FB_STORE_LEER, { id: "fiat", name: "Fiat Ducato" });
  s = fahrtEintragen(s, f("a"), { login: "max", jetzt });
  s = fahrtEintragen(s, f("b", { datum: "2026-09-02", typ: "privat" }), { login: "max", jetzt });
  s = fahrtEintragen(s, f("c", { datum: "2026-09-03", typ: "wohnung_betrieb" }), { login: "max", jetzt });
  s = fahrtEintragen(s, f("d", { datum: "2026-09-04" }), { login: "max", jetzt });
  s = fahrtEintragen(s, { id: "d", storniert: true }, { login: "max", jetzt, grund: "doppelt erfasst" });
  s = fahrtEintragen(s, f("z", { fahrzeugId: "anh" }), { login: "max", jetzt });

  it("gruppiert nach Monaten, neueste zuerst", () => {
    const l = fahrtenListe(s, { fahrzeugId: "fiat" });
    expect(l.monate.map((m) => m.key)).toEqual(["2026-09", "2026-08"]);
    expect(l.monate[0].label).toBe("September 2026");
    // innerhalb des Monats die zuletzt eingetragene oben
    expect(l.monate[0].fahrten.map((x) => x.id)).toEqual(["d", "c", "b"]);
    expect(l.anzahl).toBe(4);
  });
  it("Storno bleibt in der Liste, zaehlt aber nicht in die Summe", () => {
    const l = fahrtenListe(s, { fahrzeugId: "fiat" });
    expect(l.monate[0].fahrten[0]).toMatchObject({ id: "d", storniert: true });
    // b privat 10, c Wohnung-Betrieb 10, d storniert -> 0 betrieblich im September
    expect(l.monate[0].summe).toEqual({ betrieblich: 0, wohnungBetrieb: 10, privat: 10, gesamt: 20 });
    expect(l.summe).toEqual({ betrieblich: 10, wohnungBetrieb: 10, privat: 10, gesamt: 30 });
  });
  it("filtert nach Fahrzeug und Jahr", () => {
    expect(fahrtenListe(s, { fahrzeugId: "anh" }).anzahl).toBe(1);
    expect(fahrtenListe(s, { fahrzeugId: "fiat", jahr: 2025 }).anzahl).toBe(0);
  });
  it("ausstehende (unnummerierte) Fahrten stehen oben", () => {
    const z = ausstehendeZusammenfuehren(s, [{ fahrt: f("neu", { datum: "2026-09-05" }) }]);
    expect(fahrtenListe(z, { fahrzeugId: "fiat" }).monate[0].fahrten[0].id).toBe("neu");
  });
  it("fahrtKarte zeigt mehr als die 7 Papierspalten: Uhrzeit, Startort, Vermerk", () => {
    const k = fahrtKarte(s.fahrten.find((x) => x.id === "d"));
    expect(k).toMatchObject({ lfdNr: 4, datum: "2026-09-04", zeitVon: "07:00", zeitBis: "07:30",
      start: "Hof", ziel: "Kunde d", kmBeginn: 1000, kmEnde: 1010, km: 10, art: "B", storniert: true, geaendert: true });
    expect(k.grund).toBe("doppelt erfasst");
    expect(fahrtKarte(s.fahrten.find((x) => x.id === "b"))).toMatchObject({ art: "P", storniert: false, geaendert: false });
  });
  it("fahrtAusZeile nimmt Uhrzeit und `distanz` aus der Handy-Maske mit", () => {
    const g = fahrtAusZeile({ datum: "2026-09-09", ziel: "Lich", zweck: "x", art: "B", zeitVon: "08:00", zeitBis: "09:15", distanz: "12,5" },
      { id: "n", fahrzeugId: "fiat", start: "Hof" });
    expect(g).toMatchObject({ zeitVon: "08:00", zeitBis: "09:15", distanz: 12.5, start: "Hof" });
    expect(fahrtFehler(g)).toBeNull();
  });
});

// Geräte, die noch mit der Papierblatt-Fassung vom Vormittag des 09.09.2026
// gespeichert haben, können ungesendete Fahrten in ihrer Warteschlange liegen
// haben. Deren Nutzlast muss die neue Ansicht unverändert lesen können —
// sonst verschwindet eine noch nicht übertragene Fahrt beim Update
// wortlos vom Handy, und das ist genau der Verlust, den das Buch ausschließt.
describe("Warteschlange aus der Papierblatt-Fassung", () => {
  const altFormat = { fahrt: {
    id: "alt1", fahrzeugId: "fiat", fahrer: "Max Muster", start: "Hof",
    zeitVon: "07:15", zeitBis: "09:40", distanz: "",
    kundeId: "", kundeName: "", projektId: "", projektName: "",
    gps: { punkte: 12, km: 8.3, von: "2026-09-09T05:15:00.000Z", bis: "2026-09-09T07:40:00.000Z" },
    datum: "2026-09-09", kmBeginn: 124500, kmEnde: 124540, ziel: "Lich", zweck: "Heckenschnitt",
    typ: "betrieblich", storniert: false,
  } };
  const s = fahrzeugEintragen(FB_STORE_LEER, { id: "fiat", name: "Fiat Ducato" });

  it("wird in der Kartenliste angezeigt und als ausstehend erkannt", () => {
    const z = ausstehendeZusammenfuehren(s, [altFormat]);
    const l = fahrtenListe(z, { fahrzeugId: "fiat" });
    expect(l.anzahl).toBe(1);
    const k = fahrtKarte(l.monate[0].fahrten[0]);
    expect(k).toMatchObject({ ausstehend: true, lfdNr: null, zeitVon: "07:15", zeitBis: "09:40",
      start: "Hof", ziel: "Lich", zweck: "Heckenschnitt", km: 40, art: "B", fahrer: "Max Muster" });
  });
  it("laesst sich unveraendert nachtragen — der Server vergibt dann die Nummer", () => {
    const nach = fahrtEintragen(s, altFormat.fahrt, { login: "max", jetzt: "2026-09-09T12:00:00.000Z" });
    const f = nach.fahrten[0];
    expect(f.lfdNr).toBe(1);
    expect(f).toMatchObject({ zeitVon: "07:15", zeitBis: "09:40", start: "Hof", fahrer: "Max Muster" });
    expect(f.gps).toEqual(altFormat.fahrt.gps);
  });
});
