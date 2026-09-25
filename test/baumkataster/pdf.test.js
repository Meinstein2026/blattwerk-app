// Kunden-Bericht: läuft in Node (jsPDF lazy), ist reproduzierbar (feste
// Erstellungszeit und Datei-Id wie bei buildGbuPdf — sonst ergäbe jede
// Wiederholung ein neues PDF) und hat mindestens eine Seite.
import { describe, expect, it, vi, afterEach } from "vitest";
import { bkBerichtDateiname, buildBaumkatasterPdf } from "../../src/baumkataster-pdf.js";
import { bkBaumSpeichern, bkKontrolleEintragen, bkMassnahmeEintragen } from "../../src/baumkataster.js";

const JETZT = new Date("2026-09-16T10:00:00.000Z");
const store = () => {
  let s = { version: 1, kunde: { id: 12, name: "Schlosspark GmbH" }, objekte: { "obj-1": { name: "Schlosspark" } }, baeume: {} };
  s = bkBaumSpeichern(s, { art: "Quercus robur", artDe: "Stieleiche", objekt: "obj-1", stammumfangCm: 210, hoeheM: 22, kronendurchmesserM: 14, altersphase: "Reifephase", standort: "Wiese am Weg" }, { login: "max", jetzt: JETZT }).store;
  s = bkBaumSpeichern(s, { art: "Tilia cordata", artDe: "Winterlinde" }, { login: "max", jetzt: JETZT }).store;
  s = bkKontrolleEintragen(s, "B-0001", { id: "k-1", datum: "2026-09-16", artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "eingeschraenkt",
    befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: ["Höhlung"], krone: ["Totholz"] }, bemerkung: "Totholz im Kronenmantel",
    unterschrift: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=" }, { login: "max", jetzt: JETZT }).store;
  s = bkMassnahmeEintragen(s, "B-0001", { id: "m-1", kontrolleId: "k-1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", datum: "2026-09-16" }, { login: "max", jetzt: JETZT }).store;
  return s;
};
const seiten = (b64) => (Buffer.from(b64, "base64").toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

describe("buildBaumkatasterPdf", () => {
  afterEach(() => vi.useRealTimers());
  it("erzeugt ein PDF mit mindestens einer Seite", async () => {
    const pdf = await buildBaumkatasterPdf(store(), { heute: "2026-09-16" });
    expect(typeof pdf).toBe("string");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(seiten(pdf)).toBeGreaterThan(0);
  });
  it("ist reproduzierbar, obwohl die Uhr weiterläuft", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T10:00:00.000Z"));
    const a = await buildBaumkatasterPdf(store(), { heute: "2026-09-16" });
    vi.setSystemTime(new Date("2026-09-16T10:03:00.000Z"));
    const b = await buildBaumkatasterPdf(store(), { heute: "2026-09-16" });
    expect(b).toBe(a);
  });
  it("unterscheidet sich bei anderem Inhalt und übersteht ein kaputtes Kartenbild", async () => {
    const a = await buildBaumkatasterPdf(store(), { heute: "2026-09-16" });
    const b = await buildBaumkatasterPdf(store(), { heute: "2026-09-17" });
    expect(b).not.toBe(a);
    await expect(buildBaumkatasterPdf(store(), { heute: "2026-09-16", kartenBild: "data:image/png;base64,kaputt" })).resolves.toBeTypeOf("string");
  });
  it("Dateiname trägt Kunde und Datum ohne Sonderzeichen", () => {
    expect(bkBerichtDateiname({ kunde: { name: "Müller & Söhne GmbH" } }, "2026-09-16")).toBe("Baumkataster_Mueller_Soehne_GmbH_2026-09-16.pdf");
  });
});
