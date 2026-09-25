// Reine Logik des Baumkatasters. Alles hier läuft ohne Netz und ohne React —
// App UND Server importieren dieselben Funktionen, damit Anzeige und Ablage
// nicht auseinanderlaufen.
import { describe, expect, it } from "vitest";
import {
  bkBaumNr, bkBaumSpeichern, bkHeute, bkId, bkIndexNormalisieren, bkIstDatum, bkNormalisieren, bkTagPlus,
  bkIntervallMonate, bkKontrolleEintragen, bkKontrolleGbuVerweisen, bkLetzteKontrolle, bkNaechsteKontrolle, bkSchadstufe,
  bkFristAusDringlichkeit, bkMassnahmeEintragen, bkMassnahmeErledigen, bkProjektFuerKunde,
  bkBerichtDaten, bkFaellig, bkFuerGbu, bkGpsBeste, bkIndexEintrag, bkStatusFarbe, bkSuche,
} from "../../src/baumkataster.js";

const JETZT = new Date("2026-09-16T10:00:00.000Z");
const LEER = { version: 1, kunde: { id: 12, name: "Schlosspark GmbH" }, objekte: {}, baeume: {} };

describe("Datum", () => {
  it("bkTagPlus rechnet Tage und Monate über UTC", () => {
    expect(bkTagPlus("2026-09-16", { tage: 28 })).toBe("2026-10-14");
    expect(bkTagPlus("2026-09-16", { monate: 6 })).toBe("2027-03-16");
    expect(bkTagPlus("2026-01-31", { monate: 1 })).toBe("2026-03-03"); // JS-Überlauf, bewusst so
    expect(bkTagPlus("kaputt", { tage: 1 })).toBe(null);
  });
  it("bkIstDatum verlangt YYYY-MM-DD", () => {
    expect(bkIstDatum("2026-09-16")).toBe(true);
    expect(bkIstDatum("16.09.2026")).toBe(false);
    expect(bkHeute()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Normalisieren", () => {
  it("füllt fehlende Felder, wirft Müll weg, hängt nr an jeden Baum", () => {
    const s = bkNormalisieren({ baeume: { "B-0001": { art: "Quercus robur" }, "B-0002": null, "B-0003": "x" } });
    expect(s.version).toBe(1);
    expect(s.kunde).toEqual({ id: null, name: "" });
    expect(s.objekte).toEqual({});
    expect(Object.keys(s.baeume)).toEqual(["B-0001"]);
    expect(s.baeume["B-0001"]).toMatchObject({ nr: "B-0001", art: "Quercus robur", kontrollen: [], massnahmen: [] });
  });
  it("kommt mit null/undefined klar", () => {
    expect(bkNormalisieren(null).baeume).toEqual({});
    expect(bkIndexNormalisieren(undefined)).toEqual({ version: 1, kunden: {} });
    expect(bkIndexNormalisieren({ kunden: "x" }).kunden).toEqual({});
  });
});

describe("Nummernvergabe", () => {
  it("beginnt bei B-0001 und zählt über die höchste vorhandene Nummer weiter", () => {
    expect(bkBaumNr(LEER)).toBe("B-0001");
    expect(bkBaumNr({ baeume: { "B-0001": {}, "B-0007": {} } })).toBe("B-0008");
  });
  it("verwendet eine gelöschte Lücke nie wieder (Nachweis: Nummer bleibt eindeutig)", () => {
    expect(bkBaumNr({ baeume: { "B-0003": {} } })).toBe("B-0004");
  });
  it("bkId ist eindeutig genug und trägt das Präfix", () => {
    expect(bkId("k", JETZT, () => 0.5)).toMatch(/^k-[0-9a-z]+-[0-9a-z]+$/);
    expect(bkId("k", JETZT, () => 0.5)).not.toBe(bkId("k", JETZT, () => 0.25));
  });
});

describe("Stammdaten speichern", () => {
  it("legt einen Baum mit fortlaufender Nummer, Zeitstempel und Person an", () => {
    const { store, baum } = bkBaumSpeichern(LEER, { art: "Quercus robur", artDe: "Stieleiche", lat: 50.1, lon: 8.6, stammumfangCm: "210", hoeheM: 22, altersphase: "Reifephase" }, { login: "max", jetzt: JETZT });
    expect(baum.nr).toBe("B-0001");
    expect(store.baeume["B-0001"]).toBe(baum);
    expect(baum).toMatchObject({ art: "Quercus robur", artDe: "Stieleiche", lat: 50.1, lon: 8.6, stammumfangCm: 210, hoeheM: 22, altersphase: "Reifephase", status: "aktiv", schutz: "keiner", angelegtVon: "max", angelegtAm: JETZT.toISOString(), kontrollen: [], massnahmen: [] });
  });
  it("verlangt eine Baumart", () => {
    expect(() => bkBaumSpeichern(LEER, { hoeheM: 3 })).toThrow(/Baumart/);
  });
  it("weist unbekannte Altersphase und Status ab", () => {
    expect(() => bkBaumSpeichern(LEER, { art: "x", altersphase: "Greis" })).toThrow(/Altersphase/);
    expect(() => bkBaumSpeichern(LEER, { art: "x", status: "weg" })).toThrow(/Status/);
  });
  it("ändert einen bestehenden Baum, ohne Kontrollen und Maßnahmen anzufassen", () => {
    const a = bkBaumSpeichern(LEER, { art: "Tilia cordata", artDe: "Winterlinde" }, { login: "max", jetzt: JETZT }).store;
    a.baeume["B-0001"].kontrollen.push({ id: "k-1", datum: "2026-09-01" });
    a.baeume["B-0001"].massnahmen.push({ id: "m-1", art: "Totholzentfernung" });
    const { store, baum } = bkBaumSpeichern(a, { nr: "B-0001", art: "Tilia cordata", artDe: "Winterlinde", status: "gefaellt", hoeheM: "18,5" }, { login: "erika", jetzt: new Date("2026-10-01T08:00:00.000Z") });
    expect(baum.status).toBe("gefaellt");
    expect(baum.hoeheM).toBe(18.5);
    expect(baum.angelegtVon).toBe("max");
    expect(baum.geaendertVon).toBe("erika");
    expect(baum.kontrollen).toEqual([{ id: "k-1", datum: "2026-09-01" }]);
    expect(baum.massnahmen).toEqual([{ id: "m-1", art: "Totholzentfernung" }]);
    expect(Object.keys(store.baeume)).toEqual(["B-0001"]);
  });
  it("eine fremde Nummer legt keinen Baum an", () => {
    expect(() => bkBaumSpeichern(LEER, { nr: "B-0099", art: "x" })).toThrow(/B-0099/);
  });
  it("verändert den übergebenen Store nicht (Server liest, ändert, schreibt)", () => {
    const vorher = JSON.stringify(LEER);
    bkBaumSpeichern(LEER, { art: "x" });
    expect(JSON.stringify(LEER)).toBe(vorher);
  });
});

const KONTROLLE = {
  datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja",
  befund: { umfeld: ["Gebäude"], wurzel: [], stammfuss: [], stamm: ["Höhlung"], krone: ["Totholz"] },
  bemerkung: "Totholz > 5 cm im Kronenmantel", fotos: [], gps: { lat: 50.1, lon: 8.6, genauigkeitM: 4 },
};
const mitBaum = (extra = {}) => bkBaumSpeichern(LEER, { art: "Quercus robur", artDe: "Stieleiche", altersphase: "Reifephase", ...extra }, { login: "max", jetzt: JETZT }).store;

describe("Intervalltabelle", () => {
  it("Schadstufe aus Vitalität und Verkehrssicherheit", () => {
    expect(bkSchadstufe({ vitalitaet: 0, verkehrssicher: "ja" })).toBe("gesund");
    expect(bkSchadstufe({ vitalitaet: 1, verkehrssicher: "ja" })).toBe("gesund");
    expect(bkSchadstufe({ vitalitaet: 2, verkehrssicher: "ja" })).toBe("geschwaecht");
    expect(bkSchadstufe({ vitalitaet: 0, verkehrssicher: "eingeschraenkt" })).toBe("geschwaecht");
    expect(bkSchadstufe({ vitalitaet: 3, verkehrssicher: "ja" })).toBe("geschaedigt");
    expect(bkSchadstufe({ vitalitaet: 0, verkehrssicher: "nein" })).toBe("geschaedigt");
  });
  it("jung 36/24/12, reif 24/18/12, alt 12 — unbekannte Phase zählt wie Reifephase", () => {
    expect(bkIntervallMonate({ vitalitaet: 0, verkehrssicher: "ja" }, { altersphase: "Jugendphase" })).toBe(36);
    expect(bkIntervallMonate({ vitalitaet: 2, verkehrssicher: "ja" }, { altersphase: "Reifephase" })).toBe(18);
    expect(bkIntervallMonate({ vitalitaet: 0, verkehrssicher: "ja" }, { altersphase: "Alterungsphase" })).toBe(12);
    expect(bkIntervallMonate({ vitalitaet: 3, verkehrssicher: "nein" }, { altersphase: "Jugendphase" })).toBe(12);
    expect(bkIntervallMonate({ vitalitaet: 0, verkehrssicher: "ja" }, {})).toBe(24);
  });
  it("nächste Kontrolle = Datum + Intervall", () => {
    expect(bkNaechsteKontrolle(KONTROLLE, { altersphase: "Reifephase" })).toEqual({ intervallMonate: 24, datum: "2028-09-16" });
  });
});

describe("Kontrolle eintragen", () => {
  it("hängt an, vergibt Id, berechnet die nächste Kontrolle, normalisiert den Befund", () => {
    const { store, kontrolle } = bkKontrolleEintragen(mitBaum(), "B-0001", KONTROLLE, { login: "max", jetzt: JETZT });
    expect(kontrolle.id).toMatch(/^k-/);
    expect(kontrolle).toMatchObject({ kontrolleur: "max", vitalitaet: 1, intervallMonate: 24, naechsteKontrolle: "2028-09-16", gbuIds: [], unterschrift: null, erfasstVon: "max" });
    expect(kontrolle.befund).toEqual({ umfeld: ["Gebäude"], wurzel: [], stammfuss: [], stamm: ["Höhlung"], krone: ["Totholz"] });
    expect(store.baeume["B-0001"].kontrollen).toEqual([kontrolle]);
  });
  it("übernimmt eine abweichende nächste Kontrolle aus dem Wizard", () => {
    const { kontrolle } = bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, intervallMonate: 6, naechsteKontrolle: "2027-03-16" }, { jetzt: JETZT });
    expect(kontrolle.intervallMonate).toBe(6);
    expect(kontrolle.naechsteKontrolle).toBe("2027-03-16");
  });
  it("ist ADDITIV — die zweite Kontrolle ersetzt die erste nicht", () => {
    const a = bkKontrolleEintragen(mitBaum(), "B-0001", KONTROLLE, { jetzt: JETZT }).store;
    const b = bkKontrolleEintragen(a, "B-0001", { ...KONTROLLE, datum: "2027-09-16", vitalitaet: 2 }, { jetzt: new Date("2027-09-16T09:00:00.000Z") });
    expect(b.store.baeume["B-0001"].kontrollen).toHaveLength(2);
    expect(b.store.baeume["B-0001"].kontrollen[0].vitalitaet).toBe(1);
    expect(bkLetzteKontrolle(b.store.baeume["B-0001"]).datum).toBe("2027-09-16");
    expect(a.baeume["B-0001"].kontrollen).toHaveLength(1); // Eingabe unverändert
  });
  it("gleiche Id ein zweites Mal (Wiederholung nach Verbindungsabbruch) verändert nichts", () => {
    const a = bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, id: "k-fest" }, { jetzt: JETZT }).store;
    const b = bkKontrolleEintragen(a, "B-0001", { ...KONTROLLE, id: "k-fest", vitalitaet: 3 }, { jetzt: JETZT });
    expect(b.doppelt).toBe(true);
    expect(b.store.baeume["B-0001"].kontrollen).toHaveLength(1);
    expect(b.kontrolle.vitalitaet).toBe(1);
  });
  it("wirft bei Unvollständigkeit — mit Feldnennung", () => {
    const s = mitBaum();
    expect(() => bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, datum: "" })).toThrow(/Datum/);
    expect(() => bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, artKontrolle: "Blick" })).toThrow(/Art der Kontrolle/);
    expect(() => bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, vitalitaet: 7 })).toThrow(/Vitalität/);
    expect(() => bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, verkehrssicher: "" })).toThrow(/Verkehrssicherheit/);
    expect(() => bkKontrolleEintragen(s, "B-0009", KONTROLLE)).toThrow(/B-0009/);
    expect(() => bkKontrolleEintragen(s, "B-0001", null)).toThrow(/Kontrolle fehlt/);
  });
  it("nimmt nur Data-URL-Bilder als Unterschrift", () => {
    const k1 = bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, unterschrift: "data:image/jpeg;base64,AAAA" }).kontrolle;
    const k2 = bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, unterschrift: "javascript:x" }).kontrolle;
    expect(k1.unterschrift).toBe("data:image/jpeg;base64,AAAA");
    expect(k2.unterschrift).toBe(null);
  });
  it("Verweis auf eine GBU: additiv, ohne Doppel, Rest der Kontrolle unverändert", () => {
    const a = bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, id: "k-1" }, { jetzt: JETZT }).store;
    const b = bkKontrolleGbuVerweisen(a, "B-0001", "k-1", "gbu-1723209600000").store;
    const c = bkKontrolleGbuVerweisen(b, "B-0001", "k-1", "gbu-1723209600000").store;
    const d = bkKontrolleGbuVerweisen(c, "B-0001", "k-1", "gbu-2").store;
    const k = d.baeume["B-0001"].kontrollen[0];
    expect(k.gbuIds).toEqual(["gbu-1723209600000", "gbu-2"]);
    expect(k.vitalitaet).toBe(1);
    expect(() => bkKontrolleGbuVerweisen(a, "B-0001", "k-9", "gbu-1")).toThrow(/k-9/);
    expect(() => bkKontrolleGbuVerweisen(a, "B-0001", "k-1", "")).toThrow(/GBU/);
  });
});

describe("Dringlichkeits-Fristen", () => {
  it("sofort 0 T, kurzfristig 4 W, mittelfristig 6 M, langfristig 12 M ab Kontrolldatum", () => {
    expect(bkFristAusDringlichkeit("sofort", "2026-09-16")).toBe("2026-09-16");
    expect(bkFristAusDringlichkeit("kurzfristig", "2026-09-16")).toBe("2026-10-14");
    expect(bkFristAusDringlichkeit("mittelfristig", "2026-09-16")).toBe("2027-03-16");
    expect(bkFristAusDringlichkeit("langfristig", "2026-09-16")).toBe("2027-09-16");
    expect(bkFristAusDringlichkeit("irgendwann", "2026-09-16")).toBe(null);
  });
});

describe("Maßnahmen", () => {
  const mitKontrolle = () => bkKontrolleEintragen(mitBaum(), "B-0001", { ...KONTROLLE, id: "k-1" }, { login: "max", jetzt: JETZT }).store;
  const M = { kontrolleId: "k-1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", datum: "2026-09-16", bemerkung: "" };

  it("legt eine offene Maßnahme mit Frist aus der Dringlichkeit an", () => {
    const { store, massnahme } = bkMassnahmeEintragen(mitKontrolle(), "B-0001", M, { login: "max", jetzt: JETZT });
    expect(massnahme).toMatchObject({ kontrolleId: "k-1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "2026-10-14", status: "offen", dolibarrTaskId: null, erledigtAm: null, erledigtVon: null, angelegtVon: "max" });
    expect(massnahme.id).toMatch(/^m-/);
    expect(store.baeume["B-0001"].massnahmen).toEqual([massnahme]);
  });
  it("übernimmt eine eigene Frist und die Dolibarr-Aufgabe", () => {
    const { massnahme } = bkMassnahmeEintragen(mitKontrolle(), "B-0001", { ...M, faelligBis: "2026-12-01", dolibarrTaskId: "123" });
    expect(massnahme.faelligBis).toBe("2026-12-01");
    expect(massnahme.dolibarrTaskId).toBe(123);
  });
  it("geht auch ohne Kontrolle (z. B. Auftrag des Kunden)", () => {
    const { massnahme } = bkMassnahmeEintragen(mitBaum(), "B-0001", { ...M, kontrolleId: null });
    expect(massnahme.kontrolleId).toBe(null);
  });
  it("wirft bei Unvollständigkeit", () => {
    const s = mitKontrolle();
    expect(() => bkMassnahmeEintragen(s, "B-0001", { ...M, art: "Streicheln" })).toThrow(/Maßnahme/);
    expect(() => bkMassnahmeEintragen(s, "B-0001", { ...M, art: "Sonstige Maßnahme" })).toThrow(/Bemerkung/);
    expect(() => bkMassnahmeEintragen(s, "B-0001", { ...M, dringlichkeit: "bald" })).toThrow(/Dringlichkeit/);
    expect(() => bkMassnahmeEintragen(s, "B-0001", { ...M, kontrolleId: "k-9" })).toThrow(/k-9/);
    expect(() => bkMassnahmeEintragen(s, "B-0002", M)).toThrow(/B-0002/);
  });
  it("gleiche Id ein zweites Mal verändert nichts", () => {
    const a = bkMassnahmeEintragen(mitKontrolle(), "B-0001", { ...M, id: "m-fest" }).store;
    const b = bkMassnahmeEintragen(a, "B-0001", { ...M, id: "m-fest", art: "Fällung" });
    expect(b.doppelt).toBe(true);
    expect(b.store.baeume["B-0001"].massnahmen).toHaveLength(1);
  });
  it("erledigen ändert NUR status, erledigtAm, erledigtVon, bemerkung", () => {
    const a = bkMassnahmeEintragen(mitKontrolle(), "B-0001", { ...M, id: "m-1" }, { jetzt: JETZT }).store;
    const SPAETER = new Date("2026-10-02T14:00:00.000Z");
    const { store, massnahme } = bkMassnahmeErledigen(a, "B-0001", "m-1", { login: "erika", jetzt: SPAETER, bemerkung: "Mit Hubsteiger erledigt" });
    expect(massnahme).toMatchObject({ id: "m-1", art: "Totholzentfernung", faelligBis: "2026-10-14", status: "erledigt", erledigtAm: SPAETER.toISOString(), erledigtVon: "erika", bemerkung: "Mit Hubsteiger erledigt" });
    expect(store.baeume["B-0001"].massnahmen).toHaveLength(1);
    // beauftragt als Zwischenschritt
    const b = bkMassnahmeErledigen(a, "B-0001", "m-1", { status: "beauftragt", login: "max" }).massnahme;
    expect(b.status).toBe("beauftragt");
    expect(b.erledigtAm).toBe(null);
    expect(() => bkMassnahmeErledigen(a, "B-0001", "m-1", { status: "gelöscht" })).toThrow(/Status/);
    expect(() => bkMassnahmeErledigen(a, "B-0001", "m-9", {})).toThrow(/m-9/);
  });
});

describe("Offenes Projekt des Kunden (Dolibarr-Aufgabe)", () => {
  const P = [
    { id: 1, socid: "12", statut: "2", date_c: 100 },
    { id: 2, socid: "12", statut: "1", date_c: 200 },
    { id: 3, socid: "12", statut: "1", date_c: 300 },
    { id: 4, socid: "99", statut: "1", date_c: 400 },
  ];
  it("nimmt das jüngste offene Projekt mit passender socid", () => {
    expect(bkProjektFuerKunde(P, 12)?.id).toBe(3);
  });
  it("nichts Offenes → null; kaputte Eingabe → null", () => {
    expect(bkProjektFuerKunde(P, 77)).toBe(null);
    expect(bkProjektFuerKunde([{ id: 5, socid: "12", statut: 2 }], 12)).toBe(null);
    expect(bkProjektFuerKunde(null, 12)).toBe(null);
  });
});

describe("Statusfarben", () => {
  const HEUTE = "2026-09-16";
  const baumMit = (k, massnahmen = []) => ({ nr: "B-0001", status: "aktiv", kontrollen: k ? [k] : [], massnahmen });
  it("Kontrollstand: grau ohne Kontrolle, rot überfällig, gelb innerhalb 60 Tagen, sonst grün", () => {
    expect(bkStatusFarbe(baumMit(null), HEUTE)).toBe("grau");
    expect(bkStatusFarbe(baumMit({ datum: "2025-01-01", naechsteKontrolle: "2026-09-15" }), HEUTE)).toBe("rot");
    expect(bkStatusFarbe(baumMit({ datum: "2025-01-01", naechsteKontrolle: "2026-11-01" }), HEUTE)).toBe("gelb");
    expect(bkStatusFarbe(baumMit({ datum: "2025-01-01", naechsteKontrolle: "2027-09-16" }), HEUTE)).toBe("gruen");
  });
  it("Verkehrssicherheit aus der letzten Kontrolle", () => {
    expect(bkStatusFarbe(baumMit(null), HEUTE, "sicherheit")).toBe("grau");
    expect(bkStatusFarbe(baumMit({ datum: "2026-09-01", verkehrssicher: "ja" }), HEUTE, "sicherheit")).toBe("gruen");
    expect(bkStatusFarbe(baumMit({ datum: "2026-09-01", verkehrssicher: "eingeschraenkt" }), HEUTE, "sicherheit")).toBe("gelb");
    expect(bkStatusFarbe(baumMit({ datum: "2026-09-01", verkehrssicher: "nein" }), HEUTE, "sicherheit")).toBe("rot");
  });
  it("offene Maßnahmen: grün ohne, gelb offen, rot sofort/überfällig — erledigte zählen nicht", () => {
    expect(bkStatusFarbe(baumMit(null, []), HEUTE, "massnahmen")).toBe("gruen");
    expect(bkStatusFarbe(baumMit(null, [{ status: "erledigt", dringlichkeit: "sofort" }]), HEUTE, "massnahmen")).toBe("gruen");
    expect(bkStatusFarbe(baumMit(null, [{ status: "offen", dringlichkeit: "langfristig", faelligBis: "2027-09-16" }]), HEUTE, "massnahmen")).toBe("gelb");
    expect(bkStatusFarbe(baumMit(null, [{ status: "offen", dringlichkeit: "sofort", faelligBis: HEUTE }]), HEUTE, "massnahmen")).toBe("rot");
    expect(bkStatusFarbe(baumMit(null, [{ status: "beauftragt", dringlichkeit: "kurzfristig", faelligBis: "2026-09-01" }]), HEUTE, "massnahmen")).toBe("rot");
  });
});

describe("Fällig, Suche, Index", () => {
  const HEUTE = "2026-09-16";
  const store = () => {
    let s = mitBaum();                                                                    // B-0001 nie kontrolliert
    s = bkBaumSpeichern(s, { art: "Tilia cordata", artDe: "Winterlinde", standort: "Allee Nord" }).store; // B-0002
    s = bkBaumSpeichern(s, { art: "Fagus sylvatica", artDe: "Rotbuche", status: "gefaellt" }).store;   // B-0003 gefällt
    s = bkKontrolleEintragen(s, "B-0002", { ...KONTROLLE, id: "k-2", datum: "2024-09-01", naechsteKontrolle: "2026-09-01" }).store;
    s = bkMassnahmeEintragen(s, "B-0002", { id: "m-2", kontrolleId: "k-2", art: "Fällung", dringlichkeit: "sofort", datum: "2026-09-10" }).store;
    return s;
  };
  it("bkFaellig: nie kontrolliert, überfällige Kontrolle, sofortige Maßnahme — rot zuerst, gefällte Bäume nie", () => {
    const f = bkFaellig(store(), HEUTE);
    expect(f.map((x) => [x.baum.nr, x.grund, x.stufe])).toEqual([
      ["B-0001", "nie kontrolliert", "rot"],
      ["B-0002", "Kontrolle überfällig", "rot"],
      ["B-0002", "Maßnahme sofort: Fällung", "rot"],
    ]);
    expect(f.some((x) => x.baum.nr === "B-0003")).toBe(false);
  });
  it("bkFaellig meldet eine Kontrolle innerhalb der Vorwarnzeit gelb", () => {
    let s = mitBaum();
    s = bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, naechsteKontrolle: "2026-10-20" }).store;
    expect(bkFaellig(s, HEUTE)[0]).toMatchObject({ grund: "Kontrolle fällig", faellig: "2026-10-20", stufe: "gelb" });
    expect(bkFaellig(s, HEUTE, 10)).toEqual([]);
  });
  it("bkSuche über Nummer, Art (dt./lat.), Standort — leer = alle nach Nummer", () => {
    const s = store();
    expect(bkSuche(s, "linde").map((b) => b.nr)).toEqual(["B-0002"]);
    expect(bkSuche(s, "QUERCUS").map((b) => b.nr)).toEqual(["B-0001"]);
    expect(bkSuche(s, "allee").map((b) => b.nr)).toEqual(["B-0002"]);
    expect(bkSuche(s, "0003").map((b) => b.nr)).toEqual(["B-0003"]);
    expect(bkSuche(s, "").map((b) => b.nr)).toEqual(["B-0001", "B-0002", "B-0003"]);
  });
  it("bkIndexEintrag zählt nur aktive Bäume und nennt die nächste Kontrolle", () => {
    expect(bkIndexEintrag(store(), HEUTE)).toEqual({ name: "Schlosspark GmbH", anzahl: 2, naechsteKontrolle: "2026-09-01", faellig: 3, stand: HEUTE });
    expect(bkIndexEintrag(LEER, HEUTE)).toEqual({ name: "Schlosspark GmbH", anzahl: 0, naechsteKontrolle: null, faellig: 0, stand: HEUTE });
  });
});

describe("GBU-Vorbelegung (Schnittstelle Teilprojekt B)", () => {
  it("liefert Baumdaten und Baumcheck-Texte aus der letzten Kontrolle", () => {
    let s = bkBaumSpeichern(LEER, { art: "Quercus robur", artDe: "Stieleiche", hoeheM: 22, stammumfangCm: 210, kronendurchmesserM: 14 }).store;
    s = bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, id: "k-alt", datum: "2025-01-01" }).store;
    s = bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, id: "k-neu", vitalitaet: 2, verkehrssicher: "eingeschraenkt",
      befund: { umfeld: ["Gebäude"], wurzel: ["Wurzelfäule"], stammfuss: ["Anfahrschäden"], stamm: ["Wunden"], krone: ["Totholz", "Kappung"] } }).store;
    expect(bkFuerGbu(s.baeume["B-0001"])).toEqual({
      baumart: "Stieleiche (Quercus robur)", hoehe: "22", bhd: "67", stammumfangCm: 210, kronendurchmesserM: 14,
      krone: "Totholz, Kappung", stamm: "Anfahrschäden, Wunden", wurzel: "Gebäude, Wurzelfäule",
      gesundheitszustand: "deutlich eingeschränkt", standsicherheit: "eingeschränkt",
      kontrolleId: "k-neu", nr: "B-0001",
    });
  });
  it("ohne Kontrolle bleiben die Baumcheck-Felder leer, die Stammdaten kommen trotzdem", () => {
    const s = bkBaumSpeichern(LEER, { artDe: "Linde" }).store;
    expect(bkFuerGbu(s.baeume["B-0001"])).toEqual({
      baumart: "Linde", hoehe: "", bhd: "", stammumfangCm: null, kronendurchmesserM: null,
      krone: "", stamm: "", wurzel: "", gesundheitszustand: "", standsicherheit: "", kontrolleId: null, nr: "B-0001",
    });
    expect(bkFuerGbu(null).nr).toBe("");
  });
});

describe("Bericht und GPS", () => {
  it("bkBerichtDaten: Zusammenfassung und je Baum letzte Kontrolle + offene Maßnahmen", () => {
    let s = mitBaum();
    s = bkBaumSpeichern(s, { artDe: "Linde", status: "entfernt" }).store;
    s = bkKontrolleEintragen(s, "B-0001", { ...KONTROLLE, id: "k-1", verkehrssicher: "nein", naechsteKontrolle: "2026-01-01" }).store;
    s = bkMassnahmeEintragen(s, "B-0001", { id: "m-1", kontrolleId: "k-1", art: "Fällung", dringlichkeit: "sofort", datum: "2026-09-16" }).store;
    s = bkMassnahmeEintragen(s, "B-0001", { id: "m-2", art: "Kronenpflege", dringlichkeit: "langfristig", datum: "2026-09-16" }).store;
    s = bkMassnahmeErledigen(s, "B-0001", "m-2", {}).store;
    const b = bkBerichtDaten(s, {}, "2026-09-16");
    expect(b.kunde.name).toBe("Schlosspark GmbH");
    expect(b.erstellt).toBe("2026-09-16");
    expect(b.baeume.map((x) => x.nr)).toEqual(["B-0001"]); // entfernte nicht
    expect(b.baeume[0]).toMatchObject({ art: "Stieleiche", artLat: "Quercus robur", naechsteKontrolle: "2026-01-01", kontrollstand: "rot", sicherheit: "rot", faellig: true });
    expect(b.baeume[0].letzteKontrolle.id).toBe("k-1");
    expect(b.baeume[0].offeneMassnahmen.map((m) => m.id)).toEqual(["m-1"]);
    expect(b.zusammenfassung).toEqual({ anzahl: 1, kontrolliert: 1, faellig: 1, nichtVerkehrssicher: 1, offeneMassnahmen: 1 });
    expect(bkBerichtDaten(s, { nurAktive: false }, "2026-09-16").baeume).toHaveLength(2);
  });
  it("bkGpsBeste nimmt den genauesten Punkt", () => {
    expect(bkGpsBeste([
      { lat: 50.1, lon: 8.6, genauigkeitM: 30 },
      { lat: 50.1001, lon: 8.6001, genauigkeitM: 4 },
      { lat: "x", lon: 8.6, genauigkeitM: 1 },
    ])).toEqual({ lat: 50.1001, lon: 8.6001, genauigkeitM: 4 });
    expect(bkGpsBeste([])).toBe(null);
    expect(bkGpsBeste([{ lat: 50, lon: 8 }])).toEqual({ lat: 50, lon: 8, genauigkeitM: null });
  });
});

describe("Herkunft und Positionshistorie", () => {
  const JETZT = new Date("2026-09-17T10:00:00.000Z");
  const SPAETER = new Date("2026-09-18T10:00:00.000Z");

  it("merkt sich, ob die Position aus GPS oder von der Karte kommt", () => {
    const { baum } = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, quelle: "karte" }, { jetzt: JETZT });
    expect(baum.quelle).toBe("karte");
    expect(baum.positionHistorie).toEqual([]);
  });

  it("nimmt nur bekannte Herkünfte, sonst leer", () => {
    const { baum } = bkBaumSpeichern({}, { artDe: "Linde", quelle: "erfunden" }, { jetzt: JETZT });
    expect(baum.quelle).toBe("");
  });

  it("schiebt die alte Position in die Historie, wenn sie sich ändert", () => {
    const a = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, genauigkeitM: 4, quelle: "gps" }, { jetzt: JETZT });
    const b = bkBaumSpeichern(a.store, { nr: a.baum.nr, lat: 50.2, lon: 8.7, quelle: "karte" }, { jetzt: SPAETER });
    expect(b.baum.lat).toBe(50.2);
    expect(b.baum.quelle).toBe("karte");
    expect(b.baum.positionHistorie).toEqual([
      { lat: 50.1, lon: 8.6, genauigkeitM: 4, quelle: "gps", bis: SPAETER.toISOString() },
    ]);
  });

  it("lässt die Historie in Ruhe, wenn nur die Bemerkung geändert wird", () => {
    const a = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, quelle: "gps" }, { jetzt: JETZT });
    const b = bkBaumSpeichern(a.store, { nr: a.baum.nr, bemerkung: "Schild montiert" }, { jetzt: SPAETER });
    expect(b.baum.positionHistorie).toEqual([]);
    expect(b.baum.lat).toBe(50.1);
  });

  // I3 aus der Whole-Branch-Review: lat und lon sind getrennt editierbare
  // Felder — wer nur eines leert, darf die Position weder halbieren noch
  // spurlos verschwinden lassen.
  it("weist eine halbe Koordinate ab, statt die Position stillschweigend zu verstümmeln", () => {
    const a = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, quelle: "gps" }, { jetzt: JETZT }).store;
    expect(() => bkBaumSpeichern(a, { nr: "B-0001", lat: "", lon: 8.6 })).toThrow(/beide Koordinaten|halbe Position/);
    expect(() => bkBaumSpeichern(a, { nr: "B-0001", lat: 50.2, lon: "" })).toThrow(/beide Koordinaten|halbe Position/);
    expect(() => bkBaumSpeichern(a, { nr: "B-0001", lat: null, lon: 8.6 })).toThrow(/beide Koordinaten|halbe Position/);
  });
  it("lässt beide Achsen abwesend beim reinen Ändern anderer Stammdaten unangetastet (Normalfall)", () => {
    const a = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, quelle: "gps" }, { jetzt: JETZT }).store;
    const b = bkBaumSpeichern(a, { nr: "B-0001", artDe: "Winterlinde" }, { jetzt: SPAETER });
    expect(b.baum.lat).toBe(50.1);
    expect(b.baum.lon).toBe(8.6);
    expect(b.baum.positionHistorie).toEqual([]);
  });
  it("protokolliert ein vollständiges Löschen der Position in der Historie, statt sie spurlos verschwinden zu lassen", () => {
    const a = bkBaumSpeichern({}, { artDe: "Stieleiche", lat: 50.1, lon: 8.6, genauigkeitM: 4, quelle: "gps" }, { jetzt: JETZT }).store;
    const b = bkBaumSpeichern(a, { nr: "B-0001", lat: "", lon: "" }, { jetzt: SPAETER });
    expect(b.baum.lat).toBe(null);
    expect(b.baum.lon).toBe(null);
    expect(b.baum.positionHistorie).toEqual([
      { lat: 50.1, lon: 8.6, genauigkeitM: 4, quelle: "gps", bis: SPAETER.toISOString() },
    ]);
  });
  it("legt beim vollständigen Löschen ohne vorherige Position keinen leeren Historieneintrag an", () => {
    const a = bkBaumSpeichern({}, { artDe: "Linde" }, { jetzt: JETZT }).store; // nie eine Position gehabt
    const b = bkBaumSpeichern(a, { nr: "B-0001", lat: "", lon: "" }, { jetzt: SPAETER });
    expect(b.baum.positionHistorie).toEqual([]);
  });
});
