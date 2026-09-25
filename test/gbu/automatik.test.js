// Automatik der v3-GBU (16.09.2026): alles reine Logik, Netz und Canvas werden
// hineingereicht. Die Kachelwerte stammen aus der Web-Mercator-Formel von OSM
// (Slippy-Map): z=1 teilt die Welt in 2x2, (0°,0°) liegt genau in der Mitte.
import { describe, expect, it } from "vitest";
import {
  tileXY, kartenAusschnitt, kartenBild, KARTE_ZOOM, KARTE_GROESSE, TILE_GROESSE,
  WETTER_URL, wetterParsen, windText, niederschlagText, wetterBewertung, wetterZeile, GEO_URL, adresseParsen,
  netzempfang, mobilReihenfolge, dauerAusTermin, adresseAusKunde, besteGps, materialAusFristen,
  letzteKontrolle, katasterInBaumcheck, BK_VITALITAET_TEXT, automatikSetzen, automatikGeaendert, automatikText,
  katasterUebernehmen,
} from "../../src/gbu-automatik.js";

describe("tileXY: Slippy-Map-Kacheln", () => {
  it("Weltmitte bei Zoom 1 ist Kachel 1/1; bei Zoom 0 gibt es nur 0/0", () => {
    expect(tileXY(0, 0, 1)).toMatchObject({ x: 1, y: 1 });
    expect(tileXY(50.52, 8.7, 0)).toMatchObject({ x: 0, y: 0 });
  });
  it("Musterstadt (50,52 N / 8,70 O) liegt bei Zoom 17 auf 68703/44156", () => {
    const t = tileXY(50.52, 8.7, 17);
    expect(t.x).toBe(68703); expect(t.y).toBe(44156);
    expect(t.xf).toBeCloseTo(68703.573, 2); expect(t.yf).toBeCloseTo(44156.236, 2);
  });
  it("Norden ist oben, Osten rechts", () => {
    expect(tileXY(51, 8.7, 17).yf).toBeLessThan(tileXY(50, 8.7, 17).yf);
    expect(tileXY(50, 9, 17).xf).toBeGreaterThan(tileXY(50, 8, 17).xf);
  });
});

describe("kartenAusschnitt: 3x3 Kacheln um die Position, Fenster 384 px", () => {
  const a = kartenAusschnitt(50.52, 8.7);
  it("Vorgaben: Zoom 17, 384 px, Marker in der Mitte", () => {
    expect(KARTE_ZOOM).toBe(17); expect(KARTE_GROESSE).toBe(384); expect(TILE_GROESSE).toBe(256);
    expect(a.z).toBe(17); expect(a.groesse).toBe(384);
    expect(a.marker).toEqual({ x: 192, y: 192 });
  });
  it("liefert nur Kacheln, die das Fenster schneiden — hier sechs", () => {
    expect(a.kacheln).toHaveLength(6);
    for (const k of a.kacheln) {
      expect(k.px).toBeLessThan(384); expect(k.px + 256).toBeGreaterThan(0);
      expect(k.py).toBeLessThan(384); expect(k.py + 256).toBeGreaterThan(0);
    }
  });
  it("die Kachel der Position liegt so, dass der Marker in ihr steht", () => {
    const mitte = a.kacheln.find((k) => k.x === 68703 && k.y === 44156);
    expect(mitte).toMatchObject({ px: 45, py: 132 });
    expect(mitte.px).toBeLessThanOrEqual(192); expect(mitte.px + 256).toBeGreaterThan(192);
  });
  it("URLs zeigen auf tile.openstreetmap.org", () => {
    for (const k of a.kacheln) expect(k.url).toBe(`https://tile.openstreetmap.org/17/${k.x}/${k.y}.png`);
  });
});

// Canvas-Attrappe: merkt sich die Zeichenaufrufe, mehr nicht.
const stubCanvas = () => {
  const calls = [];
  const ctx = {
    fillRect: (...a) => calls.push(["fillRect", ...a]), drawImage: (...a) => calls.push(["drawImage", ...a]),
    beginPath: () => calls.push(["beginPath"]), arc: (...a) => calls.push(["arc", ...a]),
    fill: () => calls.push(["fill"]), stroke: () => calls.push(["stroke"]), fillText: (...a) => calls.push(["fillText", ...a]),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: (typ, q) => `data:${typ};q=${q};base64,AAA` };
  return { canvas, calls };
};

describe("kartenBild: Kacheln laden, zeichnen, Marker, Attribution", () => {
  it("zeichnet jede geladene Kachel an ihre Position und liefert ein JPEG", async () => {
    const { canvas, calls } = stubCanvas();
    const bild = await kartenBild(50.52, 8.7, { fetchBild: async (url) => ({ url }), canvas });
    expect(bild).toBe("data:image/jpeg;q=0.82;base64,AAA");
    expect(canvas.width).toBe(384); expect(canvas.height).toBe(384);
    const gezeichnet = calls.filter((c) => c[0] === "drawImage");
    expect(gezeichnet).toHaveLength(6);
    expect(gezeichnet.some((c) => c[1].url.endsWith("/17/68703/44156.png") && c[2] === 45 && c[3] === 132)).toBe(true);
    expect(calls.some((c) => c[0] === "arc" && c[1] === 192 && c[2] === 192)).toBe(true);
    expect(calls.some((c) => c[0] === "fillText" && /OpenStreetMap/.test(c[1]))).toBe(true);
  });
  it("keine einzige Kachel geladen → null (offline)", async () => {
    const { canvas } = stubCanvas();
    expect(await kartenBild(50.52, 8.7, { fetchBild: async () => { throw new Error("offline"); }, canvas })).toBe(null);
  });
  it("eine fehlende Kachel bleibt grau, das Bild entsteht trotzdem", async () => {
    const { canvas, calls } = stubCanvas();
    let n = 0;
    const bild = await kartenBild(50.52, 8.7, { fetchBild: async () => { if (++n === 2) throw new Error("404"); return {}; }, canvas });
    expect(bild).toMatch(/^data:image\/jpeg/);
    expect(calls.filter((c) => c[0] === "drawImage")).toHaveLength(5);
  });
});

describe("Wetter: Open-Meteo", () => {
  const antwort = { current: { time: "2026-09-16T07:45", wind_speed_10m: 12.3, wind_gusts_10m: 31.0, precipitation: 0 } };
  it("URL fragt genau die drei Werte ab", () => {
    expect(WETTER_URL(50.52, 8.7)).toBe("https://api.open-meteo.com/v1/forecast?latitude=50.52&longitude=8.7&current=wind_speed_10m,wind_gusts_10m,precipitation");
  });
  it("Parser holt Wind, Böen, Niederschlag, Zeit", () => {
    expect(wetterParsen(antwort)).toEqual({ windKmh: 12.3, boenKmh: 31, niederschlagMm: 0, zeit: "2026-09-16T07:45", quelle: "open-meteo" });
    expect(wetterParsen({ error: true })).toBe(null); expect(wetterParsen(null)).toBe(null);
    expect(wetterParsen({ current: { wind_speed_10m: "x" } })).toBe(null);
  });
  it("Windkategorien wie die alte Auswahlliste; Böen ziehen die Kategorie hoch", () => {
    expect(windText(5, 8)).toBe("windstill"); expect(windText(20, 25)).toBe("leichter Wind");
    expect(windText(40, 45)).toBe("mäßiger Wind"); expect(windText(55, 60)).toBe("starker Wind/Böen");
    expect(windText(20, 60)).toBe("starker Wind/Böen");
  });
  it("Niederschlag: trocken / feucht / Regen", () => {
    expect(niederschlagText(0)).toBe("trocken"); expect(niederschlagText(0.2)).toBe("feucht"); expect(niederschlagText(1.5)).toBe("Regen");
  });
  it("ruhiges Wetter → Witterung „ja“ (automatisch)", () => {
    expect(wetterBewertung({ windKmh: 10, boenKmh: 20, niederschlagMm: 0 }, "skt", "baumpflege")).toEqual({ geeignet: "ja", hinweis: "" });
  });
  it("Böen bei Höhenarbeit → offen mit Warnung, nie „nein“", () => {
    const b = wetterBewertung({ windKmh: 30, boenKmh: 60, niederschlagMm: 0 }, "skt", "baumpflege");
    expect(b.geeignet).toBe(""); expect(b.hinweis).toMatch(/Wind|Böen/);
  });
  it("Regen beim Klettern → offen mit Nässe-Hinweis", () => {
    const b = wetterBewertung({ windKmh: 5, boenKmh: 8, niederschlagMm: 0.8 }, "skt", "baumpflege");
    expect(b.geeignet).toBe(""); expect(b.hinweis).toMatch(/Nässe|Rutsch/);
  });
  it("starker Wind auch am Boden → offen; feucht → offen", () => {
    expect(wetterBewertung({ windKmh: 55, boenKmh: 70, niederschlagMm: 0 }, "boden", "hecke").geeignet).toBe("");
    expect(wetterBewertung({ windKmh: 5, boenKmh: 8, niederschlagMm: 0.2 }, "boden", "hecke").hinweis).toMatch(/feucht/);
  });
  it("ohne Wetterdaten bleibt alles offen", () => expect(wetterBewertung(null, "skt", "baumpflege")).toEqual({ geeignet: "", hinweis: "" }));
  it("Anzeigezeile für Maske und PDF", () => {
    expect(wetterZeile(wetterParsen(antwort))).toBe("Wind 12 km/h · Böen 31 km/h · 0,0 mm (Open-Meteo 07:45)");
    expect(wetterZeile(null)).toBe("");
  });
});

describe("Adresse: Nominatim reverse", () => {
  it("URL mit jsonv2", () => expect(GEO_URL(50.52, 8.7)).toBe("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=50.52&lon=8.7"));
  it("Ort + Ortsteil als Einsatzort, Straße + Hausnummer als Straße", () => {
    expect(adresseParsen({ address: { road: "Zur Musterstraße", house_number: "10", town: "Musterstadt", suburb: "Musterviertel", postcode: "12345" } }))
      .toEqual({ einsatzort: "Musterstadt Musterviertel", strasse: "Zur Musterstraße 10" });
  });
  it("Dorf ohne Ortsteil, Straße ohne Nummer", () => {
    expect(adresseParsen({ address: { road: "Hauptstraße", village: "Hattenrod" } })).toEqual({ einsatzort: "Hattenrod", strasse: "Hauptstraße" });
  });
  it("Fehlerantwort oder Müll → null", () => {
    expect(adresseParsen({ error: "Unable to geocode" })).toBe(null);
    expect(adresseParsen(null)).toBe(null); expect(adresseParsen({ address: {} })).toBe(null);
  });
});

describe("netzempfang: onLine + Ping auf das Update-Manifest, 3 s", () => {
  it("offline → nein, ohne einen Ping zu versuchen", async () => {
    let gerufen = false;
    expect(await netzempfang({ onLine: false, fetch: async () => { gerufen = true; } })).toBe("nein");
    expect(gerufen).toBe(false);
  });
  it("Antwort da → ja, auch bei 403 (Empfang ist Empfang)", async () => {
    expect(await netzempfang({ onLine: true, fetch: async () => ({ ok: true }) })).toBe("ja");
    expect(await netzempfang({ onLine: true, fetch: async () => ({ ok: false, status: 403 }) })).toBe("ja");
  });
  it("Netzfehler → nein", async () => {
    expect(await netzempfang({ onLine: true, fetch: async () => { throw new TypeError("Failed to fetch"); } })).toBe("nein");
  });
  it("keine Antwort in der Frist → nein (Abbruch über AbortSignal)", async () => {
    const haengt = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("abort"))));
    expect(await netzempfang({ onLine: true, fetch: haengt, timeoutMs: 20 })).toBe("nein");
  });
  it("fragt das Update-Manifest ohne Cache", async () => {
    let aufruf = null;
    await netzempfang({ onLine: true, fetch: async (url, o) => { aufruf = [url, o]; return { ok: true }; } });
    expect(aufruf[0]).toBe("/api/appupdate/manifest"); expect(aufruf[1].cache).toBe("no-store");
  });
});

describe("mobilReihenfolge: Aufsicht zuerst, dann die anderen, höchstens drei", () => {
  const personal = [
    { key: "jk", name: "Jan K.", mobil: "0170 1" }, { key: "max", name: "Max M.", mobil: "0179 2" },
    { key: "x", name: "X", mobil: "" }, { key: "y", name: "Y", mobil: "0179 2" }, { key: "z", name: "Z", mobil: "0151 3" }, { key: "w", name: "W", mobil: "0160 4" },
  ];
  it("Aufsicht über den Schlüssel", () => expect(mobilReihenfolge(personal, "max")).toEqual(["0179 2", "0170 1", "0151 3"]));
  it("Aufsicht über den Namen (Aushilfe ohne Schlüssel)", () => expect(mobilReihenfolge(personal, "Jan K.")).toEqual(["0170 1", "0179 2", "0151 3"]));
  it("ohne Aufsicht: Reihenfolge der Liste, Leere und Dubletten fallen raus", () => {
    expect(mobilReihenfolge(personal, "")).toEqual(["0170 1", "0179 2", "0151 3"]);
    expect(mobilReihenfolge([], "max")).toEqual([]); expect(mobilReihenfolge(null, "")).toEqual([]);
  });
});

describe("dauerAusTermin: Projekttermin aus der Dolibarr-Agenda", () => {
  const events = [
    { id: 1, fk_project: "7", datep: "2026-09-16 07:30:00", datef: "2026-09-16 15:45:00" },
    { id: 2, fk_project: "7", datep: "2026-09-15 08:00:00", datef: "2026-09-15 12:00:00" },
    { id: 3, fk_project: "9", datep: "2026-09-16 09:00:00", datef: "2026-09-16 10:00:00" },
  ];
  it("findet den Termin des Projekts am Tag", () => expect(dauerAusTermin(events, 7, "2026-09-16")).toEqual({ von: "07:30", bis: "15:45" }));
  it("Unix-Sekunden (so liefert GET /agendaevents) werden in Ortszeit gelesen", () => {
    const s = (t) => Math.floor(new Date(t).getTime() / 1000);
    expect(dauerAusTermin([{ fk_project: 7, datep: s("2026-09-16T07:30:00"), datef: s("2026-09-16T15:45:00") }], "7", "2026-09-16")).toEqual({ von: "07:30", bis: "15:45" });
  });
  it("ohne Ende nur Beginn; ohne Treffer null", () => {
    expect(dauerAusTermin([{ fk_project: "7", datep: "2026-09-16 07:30:00" }], 7, "2026-09-16")).toEqual({ von: "07:30", bis: "" });
    expect(dauerAusTermin(events, 7, "2026-09-17")).toBe(null); expect(dauerAusTermin(null, 7, "2026-09-16")).toBe(null);
    expect(dauerAusTermin(events, "", "2026-09-16")).toBe(null);
  });
});

describe("adresseAusKunde: Dolibarr-Adresse als Vorbelegung", () => {
  it("Straße aus address, Ort aus PLZ + Stadt", () => {
    expect(adresseAusKunde({ address: "Zur Musterstraße 10", zip: "12345", town: "Musterstadt" })).toEqual({ einsatzort: "12345 Musterstadt", strasse: "Zur Musterstraße 10" });
  });
  it("mehrzeilige Adresse: erste Zeile; nichts → null", () => {
    expect(adresseAusKunde({ address: "Am Park 3\nHinterhaus", town: "Lich" })).toEqual({ einsatzort: "Lich", strasse: "Am Park 3" });
    expect(adresseAusKunde({})).toBe(null); expect(adresseAusKunde(null)).toBe(null);
  });
});

describe("besteGps: die genaueste Position aus 10 s Messung", () => {
  it("nimmt die kleinste Genauigkeit", () => {
    expect(besteGps([{ lat: 1, lon: 1, genauigkeitM: 30, zeit: "a" }, { lat: 2, lon: 2, genauigkeitM: 8, zeit: "b" }, { lat: 3, lon: 3, genauigkeitM: 12, zeit: "c" }]))
      .toEqual({ lat: 2, lon: 2, genauigkeitM: 8, zeit: "b" });
  });
  it("leer → null", () => { expect(besteGps([])).toBe(null); expect(besteGps(null)).toBe(null); });
});

describe("materialAusFristen: Betriebsmittel-Fristen → Haken oder offen mit Liste", () => {
  const ids = ["psaDoppelt", "rettungsmaterial", "ersteHilfe"];
  it("alles grün → alle Zeilen ja", () => {
    expect(materialAusFristen([{ batch: "GURT-2026-001" }, { batch: "EH-2026-002", eatby: "2027-01-01" }], "2026-09-16", ids))
      .toEqual({ werte: { psaDoppelt: "ja", rettungsmaterial: "ja", ersteHilfe: "ja" }, offen: [] });
  });
  it("eine Frist abgelaufen → alle Zeilen offen, die Liste nennt das Stück", () => {
    const m = materialAusFristen([{ batch: "EH-2026-002", eatby: "2026-09-01" }], "2026-09-16", ids);
    expect(m.werte).toEqual({ psaDoppelt: "", rettungsmaterial: "", ersteHilfe: "" });
    expect(m.offen).toEqual([{ batch: "EH-2026-002", grund: "Verfall", stufe: "ueberfaellig" }]);
  });
  it("keine Lose geladen → nichts entscheiden (alles offen, keine Liste)", () => {
    expect(materialAusFristen(null, "2026-09-16", ids)).toEqual({ werte: { psaDoppelt: "", rettungsmaterial: "", ersteHilfe: "" }, offen: [] });
  });
});

describe("Kataster-Adapter (Teilprojekt C): letzte Kontrolle → Baumcheck", () => {
  const baum = { nr: "B-0001", kontrollen: [
    { id: "k1", datum: "2026-01-01", vitalitaet: 0, verkehrssicher: "ja", befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] } },
    { id: "k2", datum: "2026-09-01", vitalitaet: 1, verkehrssicher: "eingeschraenkt", befund: { umfeld: ["Gebäude"], wurzel: [], stammfuss: ["Pilzfruchtkörper"], stamm: ["Höhlung"], krone: ["Totholz > 5 cm"] } },
  ] };
  it("die jüngste Kontrolle nach Datum, nicht nach Listenplatz", () => {
    expect(letzteKontrolle(baum).id).toBe("k2");
    expect(letzteKontrolle({ kontrollen: [baum.kontrollen[1], baum.kontrollen[0]] }).id).toBe("k2");
    expect(letzteKontrolle({ kontrollen: [] })).toBe(null); expect(letzteKontrolle(null)).toBe(null);
  });
  it("Befunde werden zu den drei Freitexten, Vitalität und Verkehrssicherheit zu den Papierbegriffen", () => {
    expect(katasterInBaumcheck(letzteKontrolle(baum))).toEqual({
      krone: "Totholz > 5 cm", stamm: "Pilzfruchtkörper, Höhlung", wurzel: "Gebäude",
      gesundheit: "leicht eingeschränkt", standsicherheit: "eingeschränkt",
      befund: { umfeld: ["Gebäude"], wurzel: [], stammfuss: ["Pilzfruchtkörper"], stamm: ["Höhlung"], krone: ["Totholz > 5 cm"] },
      kontrolleId: "k2",
    });
  });
  it("ohne Befund steht „ohne Befund“; ja → gegeben, nein → eingehende Untersuchung", () => {
    const b = katasterInBaumcheck(baum.kontrollen[0]);
    expect(b).toMatchObject({ krone: "ohne Befund", stamm: "ohne Befund", wurzel: "ohne Befund", gesundheit: "vital", standsicherheit: "gegeben", kontrolleId: "k1" });
    expect(katasterInBaumcheck({ id: "k3", vitalitaet: 3, verkehrssicher: "nein" })).toMatchObject({ gesundheit: "absterbend", standsicherheit: "eingehende Untersuchung erforderlich" });
    expect(BK_VITALITAET_TEXT).toEqual(["vital", "leicht eingeschränkt", "deutlich eingeschränkt", "absterbend"]);
  });
  it("nimmt die flache Form von bkFuerGbu (gesundheitszustand statt gesundheit)", () => {
    const flach = { baumart: "Bergahorn", hoehe: 18, bhd: 45, krone: "Totholz > 5 cm", stamm: "ohne Befund", wurzel: "ohne Befund", gesundheitszustand: "leicht eingeschränkt", standsicherheit: "eingeschränkt", kontrolleId: "k-2026-08", nr: "B-0007" };
    expect(katasterInBaumcheck(flach)).toEqual({ krone: "Totholz > 5 cm", stamm: "ohne Befund", wurzel: "ohne Befund", gesundheit: "leicht eingeschränkt", standsicherheit: "eingeschränkt", befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] }, kontrolleId: "k-2026-08" });
  });
  it("nimmt auch ein fertiges Baumcheck-Objekt (bkFuerGbu) unverändert an", () => {
    const fertig = { krone: "gut", stamm: "gut", wurzel: "gut", gesundheit: "vital", standsicherheit: "gegeben", kontrolleId: "k9" };
    expect(katasterInBaumcheck(fertig)).toEqual({ ...fertig, befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] } });
    expect(katasterInBaumcheck(null)).toBe(null);
  });
});

describe("katasterUebernehmen: Kataster-Baum wählen darf keine Handeingabe im Baumcheck überschreiben", () => {
  // Gleiche Fehlerklasse wie die Witterung (siehe „Automatik-Markierungen" unten):
  // katasterBaumWaehlen in GbuFormSkt.jsx schrieb bisher ungeschützt an setD vorbei
  // und überschrieb ein von Hand ausgefülltes Baumcheck-Feld samt Marker "auto".
  const baum = {
    krone: "Totholz > 5 cm", stamm: "Pilzfruchtkörper", wurzel: "ohne Befund",
    gesundheit: "vital", standsicherheit: "gegeben",
    befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] }, kontrolleId: "k1",
  };

  it("ein von Hand ausgefülltes Feld bleibt erhalten und wird NICHT als 'auto' markiert", () => {
    const daten = { krone: "eigene Beobachtung vor Ort", stamm: "", wurzel: "", gesundheit: "", standsicherheit: "" };
    const automatik = { "baumcheck.krone": "geaendert" };
    const r = katasterUebernehmen(daten, automatik, baum);
    expect(r.baumcheck.krone).toBe("eigene Beobachtung vor Ort");
    expect(r.automatik["baumcheck.krone"]).toBe("geaendert");
  });

  it("unberührte Felder werden weiterhin aus dem Kataster befüllt und als 'auto' markiert", () => {
    const daten = { krone: "eigene Beobachtung vor Ort", stamm: "", wurzel: "", gesundheit: "", standsicherheit: "" };
    const automatik = { "baumcheck.krone": "geaendert" };
    const r = katasterUebernehmen(daten, automatik, baum);
    expect(r.baumcheck.stamm).toBe("Pilzfruchtkörper");
    expect(r.automatik["baumcheck.stamm"]).toBe("auto");
    expect(r.baumcheck.gesundheit).toBe("vital");
    expect(r.automatik["baumcheck.gesundheit"]).toBe("auto");
    expect(r.baumcheck.standsicherheit).toBe("gegeben");
    expect(r.automatik["baumcheck.standsicherheit"]).toBe("auto");
  });
});

describe("Automatik-Markierungen", () => {
  it("setzen, ändern, beschriften", () => {
    const a = automatikSetzen({}, "kopf.netz");
    expect(a).toEqual({ "kopf.netz": "auto" });
    expect(automatikGeaendert(a, "kopf.netz")).toEqual({ "kopf.netz": "geaendert" });
    // I-1 (Final-Review 16.09.2026): automatikGeaendert markierte bisher NUR, wenn das
    // Feld vorher "auto" war (Ergebnis {} statt {"kopf.netz": "geaendert"}). Ein
    // manueller Wert auf einem noch nie automatisierten Feld blieb dadurch unmarkiert,
    // und eine später eintreffende Automatik konnte ihn stillschweigend überschreiben.
    expect(automatikGeaendert({}, "kopf.netz")).toEqual({ "kopf.netz": "geaendert" });
    expect(automatikText("auto")).toBe("automatisch"); expect(automatikText("geaendert")).toBe("geändert"); expect(automatikText(undefined)).toBe("");
  });

  // Nachgebaut exakt wie in GbuFormSkt.jsx `setzen()`: der Waechter dort lässt einen
  // Automatik-Wert nur durch, solange das Feld noch nicht "geaendert" ist.
  function reduzierterSetzen(automatik, pfad, art) {
    if (art === "auto" && automatik[pfad] === "geaendert") return automatik;
    return art === "auto" ? automatikSetzen(automatik, pfad) : automatikGeaendert(automatik, pfad);
  }

  it("Witterung: 'nein' von Hand übersteht das später eintreffende Wetter, obwohl das Feld vorher nie 'auto' war", () => {
    let automatik = {}; // Witterung war noch nie automatisiert — GBU wird geöffnet, Mensch trägt sofort "nein" ein
    automatik = reduzierterSetzen(automatik, "baustelle.witterung", "manuell");
    expect(automatik["baustelle.witterung"]).toBe("geaendert");
    automatik = reduzierterSetzen(automatik, "baustelle.witterung", "auto"); // Open-Meteo trifft 10-15s später ein
    expect(automatik["baustelle.witterung"]).toBe("geaendert"); // bleibt geändert — Automatik darf den Wert nicht anfassen
  });

  it("manuell auf 'offen' zurückgestellt (aktiven Chip nochmal tippen) bleibt offen, auch wenn danach die Automatik 'ja' liefert", () => {
    let automatik = { "material.psaDoppelt": "auto" };
    automatik = reduzierterSetzen(automatik, "material.psaDoppelt", "manuell"); // Chip nochmal getippt -> Wert wird ""
    expect(automatik["material.psaDoppelt"]).toBe("geaendert");
    automatik = reduzierterSetzen(automatik, "material.psaDoppelt", "auto");
    expect(automatik["material.psaDoppelt"]).toBe("geaendert");
  });
});
