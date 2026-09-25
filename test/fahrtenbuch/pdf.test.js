// Fahrtenbuch-PDF: Finanzamt-taugliche Liste (fortlaufend, mit Storno und
// Aenderungsvermerk sichtbar) — jsPDF lazy, in Node lauffaehig wie gbu-pdf.
import { describe, expect, it } from "vitest";
import { buildFahrtenbuchPdf } from "../../src/fahrtenbuch-pdf.js";
import { FB_STORE_LEER, fahrtEintragen, fahrzeugEintragen } from "../../src/fahrtenbuch.js";

const jetzt = "2026-09-01T09:00:00.000Z";
let s = fahrzeugEintragen(FB_STORE_LEER, { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 1" });
s = fahrtEintragen(s, { id: "a", datum: "2026-08-03", zeitVon: "07:30", zeitBis: "08:10", start: "Musterstadt", ziel: "Gießen",
  kmBeginn: 12000, kmEnde: 12018, zweck: "Baumpflege Müller", kundeName: "Müller GmbH", typ: "betrieblich", fahrer: "Max", fahrzeugId: "fiat" }, { login: "max", jetzt });
s = fahrtEintragen(s, { id: "a", kmEnde: 12020 }, { login: "erika", jetzt: "2026-09-02T09:00:00.000Z", grund: "Tippfehler" });
for (let i = 0; i < 60; i++) {
  s = fahrtEintragen(s, { id: "f" + i, datum: "2026-08-10", zeitVon: "09:00", zeitBis: "09:30", start: "Musterstadt", ziel: "Lich",
    kmBeginn: 12020 + i * 10, kmEnde: 12030 + i * 10, zweck: "Kunde " + i, typ: "betrieblich", fahrer: "Max", fahrzeugId: "fiat" }, { login: "max", jetzt });
}

describe("buildFahrtenbuchPdf", () => {
  it("liefert ein PDF (Base64) mit mehreren Seiten und Zusammenfassung", async () => {
    const { base64, seiten } = await buildFahrtenbuchPdf(s, { jahr: 2026, erstelltAm: "2026-09-09T10:00:00.000Z" });
    expect(base64.length).toBeGreaterThan(1000);
    expect(Buffer.from(base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    // 61 Fahrten = 5 Blätter à 14 Zeilen
    expect(seiten).toBe(5);
  });
  it("gleicher Stand ergibt dieselben Bytes (reproduzierbar)", async () => {
    const a = await buildFahrtenbuchPdf(s, { jahr: 2026, erstelltAm: "2026-09-09T10:00:00.000Z" });
    const b = await buildFahrtenbuchPdf(s, { jahr: 2026, erstelltAm: "2026-09-09T10:00:00.000Z" });
    expect(a.base64).toBe(b.base64);
  });
  it("nur das gewaehlte Jahr; ohne Jahr alles", async () => {
    const t = fahrtEintragen(s, { id: "alt", datum: "2025-12-31", zeitVon: "08:00", zeitBis: "08:30", start: "A", ziel: "B",
      kmBeginn: 1, kmEnde: 10, zweck: "x", typ: "betrieblich", fahrer: "Max", fahrzeugId: "fiat" }, { login: "max", jetzt });
    const nur = await buildFahrtenbuchPdf(t, { jahr: 2026, erstelltAm: "2026-09-09T10:00:00.000Z" });
    const alle = await buildFahrtenbuchPdf(t, { erstelltAm: "2026-09-09T10:00:00.000Z" });
    expect(nur.anzahl).toBe(61);
    expect(alle.anzahl).toBe(62);
    // Jahresfilter blendet Blätter ohne Fahrt des Jahres aus, nummeriert aber nicht um
    expect(alle.seiten).toBe(5);
  });
  it("jedes Fahrzeug bekommt eigene Blaetter", async () => {
    let t = fahrzeugEintragen(s, { id: "anh", name: "Anhänger" });
    t = fahrtEintragen(t, { id: "a2", datum: "2026-08-04", start: "A", ziel: "B", kmBeginn: 1, kmEnde: 3, typ: "betrieblich", fahrer: "Max", fahrzeugId: "anh" }, { login: "max", jetzt });
    const alle = await buildFahrtenbuchPdf(t, { erstelltAm: "2026-09-09T10:00:00.000Z" });
    expect(alle.seiten).toBe(6);
    const nurAnh = await buildFahrtenbuchPdf(t, { fahrzeugId: "anh", erstelltAm: "2026-09-09T10:00:00.000Z" });
    expect(nurAnh.seiten).toBe(1);
    expect(nurAnh.anzahl).toBe(1);
  });
});
