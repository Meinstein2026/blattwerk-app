// Ortssuche (Nominatim), Kundenadresse und Kartenausschnitte. Alles rein — die
// Karte führt den Deskriptor nur aus, damit die Reihenfolge ohne DOM prüfbar
// bleibt (Spec Abschnitt 1 in der Fassung der Präzisierung vom 17.09.2026).
import { describe, expect, it, beforeEach } from "vitest";
import { BK_KUNDE_OHNE_BAEUME, BK_START, bkKartenStart, bkKundenAdresse, bkKundenAusschnitt, bkOrtstreffer, bkStartAusschnitt } from "../../src/baumkataster.js";

// Gekürzte, aber echte Antwortform von
// https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=Musterstadt
const ANTWORT = [
  { place_id: 1, lat: "50.5333333", lon: "8.7000000", display_name: "Musterstadt, Landkreis Gießen, Hessen, Deutschland", type: "town", category: "place" },
  { place_id: 2, lat: "50.5411", lon: "8.6899", display_name: "Musterviertel, Musterstadt, Hessen, Deutschland", type: "suburb", category: "place" },
];

describe("bkOrtstreffer", () => {
  it("wandelt Nominatims String-Koordinaten in Zahlen", () => {
    expect(bkOrtstreffer(ANTWORT)).toEqual([
      { name: "Musterstadt, Landkreis Gießen, Hessen, Deutschland", lat: 50.5333333, lon: 8.7, typ: "town" },
      { name: "Musterviertel, Musterstadt, Hessen, Deutschland", lat: 50.5411, lon: 8.6899, typ: "suburb" },
    ]);
  });
  it("wirft unbrauchbare Treffer weg und nimmt höchstens fünf", () => {
    const viele = Array.from({ length: 9 }, (_, i) => ({ lat: String(50 + i), lon: "8", display_name: "Ort " + i }));
    expect(bkOrtstreffer([...viele, { lat: "keine Zahl", lon: "8", display_name: "Müll" }, { lat: "50", lon: "8" }]).length).toBe(5);
  });
  it("verträgt Unsinn statt einer Liste", () => {
    expect(bkOrtstreffer(null)).toEqual([]);
    expect(bkOrtstreffer({ error: "Unable to geocode" })).toEqual([]);
  });
});

describe("bkKundenAdresse", () => {
  it("baut die Suchzeichenkette aus Straße, PLZ, Ort und Land", () => {
    expect(bkKundenAdresse({ address: "Schulstraße 3", zip: "12345", town: "Musterstadt", country: "Deutschland" }))
      .toBe("Schulstraße 3, 12345 Musterstadt, Deutschland");
  });
  it("kommt auch mit PLZ und Ort allein aus", () => {
    expect(bkKundenAdresse({ zip: "12345", town: "Musterstadt" })).toBe("12345 Musterstadt");
    expect(bkKundenAdresse({ town: "Gießen" })).toBe("Gießen");
  });
  it("gibt null zurück, wenn weder Ort noch PLZ dastehen — eine Straße allein findet Nominatim nicht", () => {
    expect(bkKundenAdresse({ address: "Schulstraße 3" })).toBe(null);
    expect(bkKundenAdresse({})).toBe(null);
    expect(bkKundenAdresse(null)).toBe(null);
  });
});

describe("bkStartAusschnitt", () => {
  const KUNDEN = [[51.5, 9.5]];

  beforeEach(() => { globalThis.localStorage = (() => { const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(); });

  it("ein gemerkter Kundenfilter schlägt den festen Start", () => {
    expect(bkStartAusschnitt(KUNDEN)).toEqual({ typ: "bounds", punkte: KUNDEN });
  });
  it("sonst IMMER der feste Kartenausschnitt — kein gemerkter Ausschnitt, kein Fit auf Bäume, kein GPS", () => {
    // Ansage Max 19.09.2026. Vorher: gemerkt → Bäume → GPS → Welt.
    expect(bkStartAusschnitt([])).toEqual({ typ: "start", ...BK_START });
    expect(bkStartAusschnitt()).toEqual({ typ: "start", ...BK_START });
    expect(bkStartAusschnitt(null)).toEqual({ typ: "start", ...BK_START });
  });
  it("bkKartenStart() faellt ohne Mandant auf die Deutschland-Uebersicht zurueck", () => {
    expect(bkKartenStart()).toEqual(BK_START);
  });
  it("bkKartenStart() nimmt den Kartenausschnitt aus der Mandanten-Konfiguration", () => {
    globalThis.localStorage.setItem("blattwerk_mandant", JSON.stringify({
      baumkataster: { kartenStart: { lat: 52.1, lon: 9.1, zoom: 14 } },
    }));
    expect(bkKartenStart()).toEqual({ lat: 52.1, lon: 9.1, zoom: 14 });
    expect(bkStartAusschnitt([])).toEqual({ typ: "start", lat: 52.1, lon: 9.1, zoom: 14 });
  });
});

describe("bkKundenAusschnitt — Sprung bei Filteränderung", () => {
  it("fittet auf die Bäume des oder der gewählten Kunden", () => {
    const p = [[50.1, 8.6], [50.2, 8.7]];
    expect(bkKundenAusschnitt(p, null)).toEqual({ typ: "bounds", punkte: p });
  });
  it("bei genau einem Baum setView mit Zoom 18 — fitBounds zoomte unbrauchbar weit hinein", () => {
    expect(bkKundenAusschnitt([[50.1, 8.6]], null)).toEqual({ typ: "punkt", lat: 50.1, lon: 8.6, zoom: 18 });
  });
  it("ohne verortete Bäume auf die Kundenadresse, Zoom 16", () => {
    expect(bkKundenAusschnitt([], { lat: 50.53, lon: 8.7 })).toEqual({ typ: "ort", lat: 50.53, lon: 8.7, zoom: 16 });
  });
  it("ohne Bäume und ohne auflösbare Adresse bleibt der Ausschnitt stehen", () => {
    expect(bkKundenAusschnitt([], null)).toEqual({ typ: "bleiben", hinweis: BK_KUNDE_OHNE_BAEUME });
    expect(bkKundenAusschnitt([], { lat: "x", lon: 8 }).typ).toBe("bleiben");
    expect(BK_KUNDE_OHNE_BAEUME).toBe("Kunde hat noch keine verorteten Bäume");
  });
  it("zurück auf „alle“ heißt: auf alle Bäume fitten", () => {
    const alle = [[50, 8], [51, 9], [52, 10]];
    expect(bkKundenAusschnitt(alle, null)).toEqual({ typ: "bounds", punkte: alle });
  });
});
