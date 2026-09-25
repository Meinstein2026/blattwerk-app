// Offline-Betrieb des Katasters: Cache + EINE Warteschlange aus Vorgängen
// (keine Store-Abzüge — die würden überschreiben, was ein anderes Gerät
// inzwischen eingetragen hat). Alle Adapter werden injiziert, damit das ohne
// DOM, localStorage und IndexedDB in Vitest läuft.
import { describe, expect, it, vi } from "vitest";
import {
  BK_CACHE_PRAEFIX, BK_QUEUE_KEY, bkAusstehendZusammenfuehren, bkCacheLesen, bkCacheSchreiben,
  bkEinreihen, bkKundenOrtLesen, bkKundenOrtMerken, bkNachtragen, bkNachtragZusammenfuehren,
  bkOffeneVorgaenge, bkQueueKontrolleIdEinsetzen, bkQueueNrEinsetzen, bkVorgangPfad,
} from "../../src/baumkataster-offline.js";

const JETZT = new Date("2026-09-17T12:00:00.000Z");
const opt = { jetzt: JETZT, zufall: () => 0.5 };

/** Attrappe für localStorage — reicht für getItem/setItem. */
function speicher(inhalt = {}) {
  const d = { ...inhalt };
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, _d: d };
}

describe("Vorgangs-Pfade", () => {
  it("bildet die fünf Vorgangsarten auf die Endpunkte ab", () => {
    expect(bkVorgangPfad("baum")).toBe("/api/nc/baumkataster/baum/save");
    expect(bkVorgangPfad("kontrolle")).toBe("/api/nc/baumkataster/kontrolle/save");
    expect(bkVorgangPfad("massnahme")).toBe("/api/nc/baumkataster/massnahme/save");
    expect(bkVorgangPfad("massnahme-erledigt")).toBe("/api/nc/baumkataster/massnahme/erledigt");
    expect(bkVorgangPfad("gbu-verweis")).toBe("/api/nc/baumkataster/kontrolle/gbu");
    expect(bkVorgangPfad("stores-tauschen")).toBe(null);
  });
});

describe("Einreihen", () => {
  it("hängt hinten an und vergibt eine Id — die Reihenfolge ist die Eintragsreihenfolge", () => {
    const a = bkEinreihen([], { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "Linde" } } }, opt);
    const b = bkEinreihen(a.liste, { typ: "kontrolle", kundeId: 12, nutzlast: { nr: "B-0001" } }, opt);
    expect(b.liste.map((x) => x.typ)).toEqual(["baum", "kontrolle"]);
    expect(a.eintrag.id).toMatch(/^bkq-/);
    expect(a.eintrag.zeit).toBe(JETZT.toISOString());
    expect(a.liste).not.toBe(b.liste);
  });
  it("weist eine unbekannte Vorgangsart ab, statt sie ewig liegen zu lassen", () => {
    expect(() => bkEinreihen([], { typ: "quatsch", kundeId: 1, nutzlast: {} }, opt)).toThrow(/Vorgangsart/);
  });
  it("vergibt beim Einreihen zusätzlich eine stabile vorgangId (Idempotenz, 18.09.2026) — getrennt von der Warteschlangen-Id", () => {
    const a = bkEinreihen([], { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "Linde" } } }, opt);
    expect(a.eintrag.vorgangId).toMatch(/^bkv-/);
    expect(a.eintrag.vorgangId).not.toBe(a.eintrag.id);
  });
  it("übernimmt eine vom Aufrufer mitgegebene vorgangId, statt eine neue zu würfeln — sonst verliert ein online gescheiterter und in die Warteschlange gefallener Vorgang seine Kennung", () => {
    const a = bkEinreihen([], { typ: "kontrolle", kundeId: 12, vorgangId: "bkv-schon-vergeben", nutzlast: { nr: "B-0001", kontrolle: {} } }, opt);
    expect(a.eintrag.vorgangId).toBe("bkv-schon-vergeben");
  });
});

describe("Nummern-Nachtrag", () => {
  it("trägt die vom Server vergebene Nummer in alle wartenden Folgevorgänge nach", () => {
    const { liste: l1, eintrag: baumEintrag } = bkEinreihen([], { typ: "baum", kundeId: 12, lokalId: "lok-1", nutzlast: { baum: { artDe: "Linde" } } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, kontrolle: { datum: "2026-09-17" } } }, opt);
    const { liste: l3 } = bkEinreihen(l2, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, massnahme: { art: "Fällung" } } }, opt);
    const { liste: l4 } = bkEinreihen(l3, { typ: "kontrolle", kundeId: 12, nutzlast: { nr: "B-0099", kontrolle: {} } }, opt);
    const fertig = bkQueueNrEinsetzen(l4, "lok-1", "B-0007");
    expect(fertig.map((x) => x.nutzlast.nr)).toEqual([undefined, "B-0007", "B-0007", "B-0099"]);
    expect(baumEintrag.nutzlast.baum.nr).toBeUndefined();
  });
});

describe("Kontroll-Id-Nachtrag", () => {
  it("trägt die vom Server vergebene Kontroll-Id in alle wartenden Maßnahmen nach, nicht in die Kontrolle selbst", () => {
    const { liste: l1 } = bkEinreihen([], { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: "B-0001", kontrolle: { datum: "2026-09-17" } } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: "B-0001", massnahme: { kontrolleId: null, art: "Kronenpflege" } } }, opt);
    const { liste } = bkEinreihen(l2, { typ: "massnahme", kundeId: 12, nutzlast: { nr: "B-0002", massnahme: { kontrolleId: "k-9", art: "Fällung" } } }, opt);
    const fertig = bkQueueKontrolleIdEinsetzen(liste, "lok-1", "k-1");
    expect(fertig.map((x) => x.nutzlast.massnahme?.kontrolleId ?? null)).toEqual([null, "k-1", "k-9"]);
    // Die Kontrolle selbst hat kein `nutzlast.massnahme` — nichts zu treffen.
    expect(fertig[0].nutzlast.massnahme).toBeUndefined();
  });
});

describe("Cache", () => {
  it("schreibt je Kunde einen Schlüssel mit Stand", () => {
    const s = speicher();
    bkCacheSchreiben(s, 12, { version: 1, baeume: { "B-0001": { nr: "B-0001" } } }, JETZT);
    expect(Object.keys(s._d)).toEqual([BK_CACHE_PRAEFIX + "12"]);
    const gelesen = bkCacheLesen(s, 12);
    expect(gelesen.stand).toBe(JETZT.toISOString());
    expect(gelesen.store.baeume["B-0001"].nr).toBe("B-0001");
  });
  it("gibt null zurück, wenn nichts oder Müll drinsteht", () => {
    expect(bkCacheLesen(speicher(), 12)).toBe(null);
    expect(bkCacheLesen(speicher({ [BK_CACHE_PRAEFIX + "12"]: "{kaputt" }), 12)).toBe(null);
  });
  it("verträgt einen vollen Speicher, ohne die Seite zu zerlegen", () => {
    const voll = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => bkCacheSchreiben(voll, 12, { version: 1 }, JETZT)).not.toThrow();
  });
});

describe("Kundenort-Zwischenspeicher", () => {
  it("gibt den Treffer nur zurück, wenn die Adresse dieselbe ist", () => {
    const s = speicher();
    bkKundenOrtMerken(s, 12, "12345 Musterstadt", { lat: 50.53, lon: 8.7 }, JETZT);
    expect(bkKundenOrtLesen(s, 12, "12345 Musterstadt")).toEqual({ lat: 50.53, lon: 8.7 });
    // Adresse im Dolibarr geändert → neu abfragen, nicht den alten Ort nehmen.
    expect(bkKundenOrtLesen(s, 12, "35390 Gießen")).toBe(null);
    expect(bkKundenOrtLesen(s, 99, "12345 Musterstadt")).toBe(null);
  });
  it("hält alle Kunden in EINEM Schlüssel — Nominatim wird nicht bei jedem Wechsel gefragt", () => {
    const s = speicher();
    bkKundenOrtMerken(s, 12, "a", { lat: 1, lon: 2 }, JETZT);
    bkKundenOrtMerken(s, 7, "b", { lat: 3, lon: 4 }, JETZT);
    expect(Object.keys(s._d)).toEqual(["blattwerk_bk_kundenort"]);
    expect(bkKundenOrtLesen(s, 12, "a")).toEqual({ lat: 1, lon: 2 });
    expect(bkKundenOrtLesen(s, 7, "b")).toEqual({ lat: 3, lon: 4 });
  });
  it("verträgt Müll im Speicher und einen vollen Speicher", () => {
    expect(bkKundenOrtLesen(speicher({ blattwerk_bk_kundenort: "{kaputt" }), 12, "a")).toBe(null);
    const voll = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => bkKundenOrtMerken(voll, 12, "a", { lat: 1, lon: 2 }, JETZT)).not.toThrow();
  });
});

describe("Anzeige mit wartenden Vorgängen", () => {
  it("zeigt offline angelegte Bäume mit Platzhalter-Nummer und Merkmal ausstehend", () => {
    const { liste } = bkEinreihen([], { typ: "baum", kundeId: 12, lokalId: "lok-1", nutzlast: { baum: { artDe: "Linde", lat: 50, lon: 8 } } }, opt);
    const store = bkAusstehendZusammenfuehren({ version: 1, kunde: { id: 12 }, objekte: {}, baeume: {} }, liste, 12);
    const b = Object.values(store.baeume);
    expect(b.length).toBe(1);
    expect(b[0].ausstehend).toBe(true);
    expect(b[0].artDe).toBe("Linde");
    expect(b[0].nr).toMatch(/^neu-/);
  });
  it("zählt nur die Vorgänge des gewählten Kunden", () => {
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, nutzlast: { baum: {} } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "baum", kundeId: 13, nutzlast: { baum: {} } }, opt);
    expect(bkOffeneVorgaenge(l2, 12).length).toBe(1);
    expect(bkOffeneVorgaenge(l2, null).length).toBe(2);
  });
});

describe("Nachtragen", () => {
  const baum = (lokalId) => ({ typ: "baum", kundeId: 12, lokalId, nutzlast: { baum: { artDe: "Linde" } } });

  it("schickt in Reihenfolge, räumt Erledigtes weg und liefert die letzte Antwort", async () => {
    const { liste: l1 } = bkEinreihen([], baum("lok-1"), opt);
    const { liste } = bkEinreihen(l1, { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-0001", massnahmeId: "m-1" } }, opt);
    const gesehen = [];
    const senden = vi.fn(async (pfad) => {
      gesehen.push(pfad);
      return { status: 200, daten: { ok: true, baum: { nr: "B-0007" }, store: { version: 1, baeume: {} } } };
    });
    const r = await bkNachtragen(liste, { senden });
    expect(gesehen).toEqual(["/api/nc/baumkataster/baum/save", "/api/nc/baumkataster/massnahme/erledigt"]);
    expect(r.rest).toEqual([]);
    expect(r.letzte.store.version).toBe(1);
  });

  it("setzt kundeId aus dem Eintrag vor die Nutzlast — sonst antwortet jeder Endpunkt mit 400", async () => {
    const { liste } = bkEinreihen([], {
      typ: "kontrolle", kundeId: 12, kundeName: "Stadt Musterstadt",
      nutzlast: { nr: "B-0001", kontrolle: { datum: "2026-09-17" } },   // ohne kundeId, wie die Maske sie baut
    }, opt);
    let gesendet = null;
    const senden = vi.fn(async (_p, koerper) => { gesendet = koerper; return { status: 200, daten: { ok: true, store: { version: 1 } } }; });
    await bkNachtragen(liste, { senden });
    expect(gesendet.kundeId).toBe(12);
    expect(gesendet.kundeName).toBe("Stadt Musterstadt");
    expect(gesendet.nr).toBe("B-0001");
  });

  it("setzt die vorgangId aus dem Eintrag vor die Nutzlast — der Server erkennt daran eine Wiederholung (Idempotenz, 18.09.2026)", async () => {
    const { liste } = bkEinreihen([], baum("lok-1"), opt);
    let gesendet = null;
    const senden = vi.fn(async (_p, koerper) => { gesendet = koerper; return { status: 200, daten: { ok: true, baum: { nr: "B-0007" }, store: { version: 1 } } }; });
    await bkNachtragen(liste, { senden });
    expect(gesendet.vorgangId).toBe(liste[0].vorgangId);
    expect(gesendet.vorgangId).toMatch(/^bkv-/);
  });

  it("fehlt einem Alteintrag die vorgangId (Warteschlange aus einer älteren Fassung), sendet er trotzdem — ohne das Feld", async () => {
    const alt = { id: "bkq-alt", typ: "baum", kundeId: 12, kundeName: "", lokalId: null, fotoSchluessel: [], nutzlast: { baum: { artDe: "Linde" } }, zeit: JETZT.toISOString() };
    let gesendet = null;
    const senden = vi.fn(async (_p, koerper) => { gesendet = koerper; return { status: 200, daten: { ok: true, store: { version: 1 } } }; });
    const r = await bkNachtragen([alt], { senden });
    expect(gesendet.vorgangId).toBeUndefined();
    expect(r.rest).toEqual([]);
  });

  it("setzt die echte Nummer in die Folgevorgänge, bevor sie abgeschickt werden", async () => {
    const { liste: l1 } = bkEinreihen([], baum("lok-1"), opt);
    const { liste } = bkEinreihen(l1, { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, kontrolle: { datum: "2026-09-17" } } }, opt);
    const koerper = [];
    const senden = vi.fn(async (pfad, nutzlast) => {
      koerper.push(nutzlast);
      return { status: 200, daten: { ok: true, baum: { nr: "B-0007" }, store: { version: 1 } } };
    });
    await bkNachtragen(liste, { senden });
    expect(koerper[1].nr).toBe("B-0007");
  });

  it("verwirft einen mit 400 abgelehnten Vorgang und meldet ihn — sonst hinge er ewig", async () => {
    const { liste } = bkEinreihen([], { typ: "massnahme", kundeId: 12, nutzlast: { nr: "B-0001", massnahme: {} } }, opt);
    const melden = vi.fn();
    const senden = vi.fn(async () => ({ status: 400, daten: { error: "Dringlichkeit wählen." } }));
    const r = await bkNachtragen(liste, { senden, melden });
    expect(r.rest).toEqual([]);
    expect(r.verworfen.length).toBe(1);
    expect(melden).toHaveBeenCalledWith(expect.stringContaining("Dringlichkeit wählen."));
  });

  it("setzt die Kontroll-Id in die wartenden Maßnahmen, bevor sie abgeschickt werden", async () => {
    const { liste: l1 } = bkEinreihen([], { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: "B-0001", kontrolle: { datum: "2026-09-17" } } }, opt);
    const { liste } = bkEinreihen(l1, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: "B-0001", massnahme: { kontrolleId: null, art: "Kronenpflege" } } }, opt);
    const koerper = [];
    const senden = vi.fn(async (pfad, nutzlast) => {
      koerper.push(nutzlast);
      return { status: 200, daten: { ok: true, kontrolle: { id: "k-1" }, store: { version: 1 } } };
    });
    await bkNachtragen(liste, { senden });
    expect(koerper[1].massnahme.kontrolleId).toBe("k-1");
  });

  it("verkettet Baumnummer UND Kontroll-Id in eine wartende Maßnahme — Baum → Kontrolle → Maßnahmen offline hintereinander", async () => {
    // Der schwierige Fall: drei Vorgänge mit derselben lokalId. `baum/save`
    // liefert zuerst die Nummer (muss in Kontrolle UND Maßnahmen), danach
    // liefert `kontrolle/save` die Kontroll-Id (nur in die Maßnahmen) — beide
    // Ersetzungen wirken auf `offen`, bevor der jeweils nächste Vorgang
    // abgeschickt wird, und treffen unterschiedliche Felder.
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, lokalId: "lok-1", nutzlast: { baum: { artDe: "Linde" } } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, kontrolle: { datum: "2026-09-17" } } }, opt);
    const { liste: l3 } = bkEinreihen(l2, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, massnahme: { kontrolleId: null, art: "Kronenpflege" } } }, opt);
    const { liste } = bkEinreihen(l3, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: null, massnahme: { kontrolleId: null, art: "Totholzentfernung" } } }, opt);
    const koerper = [];
    const senden = vi.fn(async (pfad, nutzlast) => {
      koerper.push(nutzlast);
      if (pfad.endsWith("/baum/save")) return { status: 200, daten: { ok: true, baum: { nr: "B-0007" }, store: { version: 1 } } };
      if (pfad.endsWith("/kontrolle/save")) return { status: 200, daten: { ok: true, kontrolle: { id: "k-123" }, store: { version: 1 } } };
      return { status: 200, daten: { ok: true, store: { version: 1 } } };
    });
    const r = await bkNachtragen(liste, { senden });
    expect(r.rest).toEqual([]);
    // Beide Maßnahmen-Körper tragen am Ende beides.
    expect(koerper[2].nr).toBe("B-0007");
    expect(koerper[2].massnahme.kontrolleId).toBe("k-123");
    expect(koerper[3].nr).toBe("B-0007");
    expect(koerper[3].massnahme.kontrolleId).toBe("k-123");
  });

  it("aktualisiert JEDEN erfolgreich verarbeiteten Kunden — nicht nur den zuletzt gesendeten (I1 aus der Review)", async () => {
    // Vormittagsbesuch bei Kunde 12, Nachmittagsbesuch bei Kunde 34, beide
    // noch in derselben Warteschlange, wenn endlich wieder Empfang da ist.
    // Vorher hing der zurückgegebene Store am zuletzt erfolgreichen Vorgang
    // — der Baum von Kunde 12 wäre aus Karte/Liste verschwunden, obwohl er
    // beim Server angekommen ist.
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "Linde" } } }, opt);
    const { liste } = bkEinreihen(l1, { typ: "baum", kundeId: 34, nutzlast: { baum: { artDe: "Eiche" } } }, opt);
    const senden = vi.fn(async (_pfad, koerper) => ({
      status: 200,
      daten: { ok: true, baum: { nr: "B-0001" }, store: { version: 1, kundeId: koerper.kundeId } },
    }));
    const r = await bkNachtragen(liste, { senden });
    expect(r.rest).toEqual([]);
    expect(r.stores[12].kundeId).toBe(12);
    expect(r.stores[34].kundeId).toBe(34);
  });

  it("verwirft mit einer abgelehnten Kontrolle auch deren wartende Maßnahmen — eine Ursache, eine Meldung", async () => {
    const { liste: l1 } = bkEinreihen([], { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", fotoSchluessel: ["f-1"], nutzlast: { nr: "B-0001", kontrolle: {} } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "massnahme", kundeId: 12, lokalId: "lok-1", nutzlast: { nr: "B-0001", massnahme: { kontrolleId: null, art: "Kronenpflege" } } }, opt);
    const { liste } = bkEinreihen(l2, { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-9", massnahmeId: "m-1" } }, opt);
    const melden = vi.fn();
    const fotosLoeschen = vi.fn(async () => {});
    const senden = vi.fn(async (pfad) => (pfad.endsWith("/kontrolle/save")
      ? { status: 400, daten: { error: "Vitalität (0–3) bewerten." } }
      : { status: 200, daten: { ok: true, store: { version: 1 } } }));
    const r = await bkNachtragen(liste, { senden, fotosLesen: async () => [], fotosLoeschen, melden });
    expect(r.rest).toEqual([]);
    expect(r.verworfen.length).toBe(2);              // Kontrolle + ihre Maßnahme
    expect(melden).toHaveBeenCalledTimes(1);          // nur einmal gemeldet
    expect(fotosLoeschen).toHaveBeenCalledWith(["f-1"]);
    // Der fremde Vorgang laeuft weiter durch.
    expect(senden.mock.calls.map((c) => c[0])).toContain("/api/nc/baumkataster/massnahme/erledigt");
  });

  it("verwirft mit dem abgelehnten Baum auch dessen wartende Kontrollen — eine Ursache, eine Meldung", async () => {
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, lokalId: "lok-1", nutzlast: { baum: {} } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "kontrolle", kundeId: 12, lokalId: "lok-1", fotoSchluessel: ["f-1"], nutzlast: { nr: null, kontrolle: {} } }, opt);
    const { liste } = bkEinreihen(l2, { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-9", massnahmeId: "m-1" } }, opt);
    const melden = vi.fn();
    const fotosLoeschen = vi.fn(async () => {});
    const senden = vi.fn(async (pfad) => (pfad.endsWith("/baum/save")
      ? { status: 400, daten: { error: "Baumart angeben" } }
      : { status: 200, daten: { ok: true, store: { version: 1 } } }));
    const r = await bkNachtragen(liste, { senden, fotosLesen: async () => [], fotosLoeschen, melden });
    expect(r.rest).toEqual([]);
    expect(r.verworfen.length).toBe(2);              // Baum + seine Kontrolle
    expect(melden).toHaveBeenCalledTimes(1);          // nur einmal gemeldet
    expect(fotosLoeschen).toHaveBeenCalledWith(["f-1"]);
    // Der fremde Vorgang laeuft weiter durch.
    expect(senden.mock.calls.map((c) => c[0])).toContain("/api/nc/baumkataster/massnahme/erledigt");
  });

  it("lässt bei Netzfehler alles Weitere liegen und probiert es später erneut", async () => {
    const { liste: l1 } = bkEinreihen([], { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-1", massnahmeId: "m-1" } }, opt);
    const { liste } = bkEinreihen(l1, { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-2", massnahmeId: "m-2" } }, opt);
    const senden = vi.fn(async () => { throw new Error("Failed to fetch"); });
    const r = await bkNachtragen(liste, { senden });
    expect(senden).toHaveBeenCalledTimes(1);
    expect(r.rest.length).toBe(2);
  });

  it("lässt einen Vorgang bei 502 liegen, verwirft ihn aber nicht", async () => {
    const { liste } = bkEinreihen([], { typ: "massnahme-erledigt", kundeId: 12, nutzlast: { nr: "B-1", massnahmeId: "m-1" } }, opt);
    const senden = vi.fn(async () => ({ status: 502, daten: { error: "Status 502" } }));
    const r = await bkNachtragen(liste, { senden });
    expect(r.rest.length).toBe(1);
    expect(r.verworfen).toEqual([]);
  });

  it("holt die Fotos erst beim Senden aus dem Blob-Speicher und löscht sie danach", async () => {
    const { liste } = bkEinreihen([], {
      typ: "kontrolle", kundeId: 12, fotoSchluessel: ["f-1", "f-2"],
      nutzlast: { nr: "B-0001", kontrolle: { datum: "2026-09-17" } },
    }, opt);
    const fotosLesen = vi.fn(async (s) => s.map((k) => ({ base64: "AAAA" + k })));
    const fotosLoeschen = vi.fn(async () => {});
    let gesendet = null;
    const senden = vi.fn(async (_p, n) => { gesendet = n; return { status: 200, daten: { ok: true, store: { version: 1 } } }; });
    await bkNachtragen(liste, { senden, fotosLesen, fotosLoeschen });
    expect(gesendet.fotos).toEqual([{ base64: "AAAAf-1" }, { base64: "AAAAf-2" }]);
    expect(fotosLoeschen).toHaveBeenCalledWith(["f-1", "f-2"]);
  });

  it("löscht die Blobs auch dann, wenn der Server den Vorgang mit 400 verwirft", async () => {
    const { liste } = bkEinreihen([], {
      typ: "kontrolle", kundeId: 12, fotoSchluessel: ["f-9"],
      nutzlast: { nr: "B-0001", kontrolle: {} },
    }, opt);
    const fotosLoeschen = vi.fn(async () => {});
    const senden = vi.fn(async () => ({ status: 400, daten: { error: "Vitalität (0–3) bewerten." } }));
    await bkNachtragen(liste, { senden, fotosLesen: async () => [], fotosLoeschen, melden: () => {} });
    expect(fotosLoeschen).toHaveBeenCalledWith(["f-9"]);
  });

  it("sendet einen bereits angenommenen Vorgang nicht erneut, wenn nur die Fotolöschung scheitert (I1 aus der Review)", async () => {
    // Der Server hat den Vorgang schon angenommen (status 200) — scheitert
    // danach nur noch das Löschen der Foto-Blobs (VersionError, blockiert
    // durch einen zweiten Tab), darf der Vorgang NICHT in der Warteschlange
    // bleiben, sonst kommt er beim nächsten Lauf doppelt an.
    const { liste } = bkEinreihen([], {
      typ: "kontrolle", kundeId: 12, fotoSchluessel: ["f-1"],
      nutzlast: { nr: "B-0001", kontrolle: {} },
    }, opt);
    const senden = vi.fn(async () => ({ status: 200, daten: { ok: true, store: { version: 1 } } }));
    const fotosLoeschen = vi.fn(async () => { throw new Error("VersionError"); });
    const r = await bkNachtragen(liste, { senden, fotosLesen: async () => [], fotosLoeschen });
    expect(senden).toHaveBeenCalledTimes(1);
    expect(r.rest).toEqual([]);
  });

  it("persistiert nach JEDEM Vorgang (Idempotenz-Kernstest 2, 18.09.2026): ein Abbruch nach dem zweiten von vier verliert nichts und sendet nichts doppelt", async () => {
    // Vier Vorgänge, wie ein Kontroll-Wizard sie hintereinander einreiht.
    const { liste: l1 } = bkEinreihen([], { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "v1" } } }, opt);
    const { liste: l2 } = bkEinreihen(l1, { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "v2" } } }, opt);
    const { liste: l3 } = bkEinreihen(l2, { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "v3" } } }, opt);
    const { liste: vier } = bkEinreihen(l3, { typ: "baum", kundeId: 12, nutzlast: { baum: { artDe: "v4" } } }, opt);

    // `speichern` steht hier für "in den Gerätespeicher schreiben" — das ist
    // der einzige Ort, an dem ein Absturz mittendrin etwas übersteht.
    let persistiert = vier;
    const speichern = vi.fn(async (offen) => { persistiert = offen; });

    let zaehler = 0;
    const gesendetLauf1 = [];
    const sendenLauf1 = vi.fn(async (_pfad, koerper) => {
      gesendetLauf1.push(koerper.baum.artDe);
      zaehler++;
      // Abbruch NACH dem zweiten Vorgang: der dritte Sendeversuch scheitert
      // (Verbindung weg, oder — ebenso plausibel — die App wurde in diesem
      // Moment von Android abgeräumt und der Prozess existiert schlicht nicht
      // mehr, um eine Antwort noch zu verarbeiten).
      if (zaehler === 3) throw new Error("Verbindung weg");
      return { status: 200, daten: { ok: true, baum: { nr: "B-0001" }, store: { version: 1 } } };
    });
    const lauf1 = await bkNachtragen(vier, { senden: sendenLauf1, speichern });
    // v1 und v2 wurden angenommen, v3 wurde VERSUCHT (und scheiterte) — v4 nie.
    expect(gesendetLauf1).toEqual(["v1", "v2", "v3"]);
    // Genau nach dem zweiten erfolgreichen Vorgang zuletzt gespeichert — NICHT
    // erst am Ende des (hier ohnehin abgebrochenen) Laufs.
    expect(persistiert.map((e) => e.nutzlast.baum.artDe)).toEqual(["v3", "v4"]);
    expect(lauf1.rest.map((e) => e.nutzlast.baum.artDe)).toEqual(["v3", "v4"]);

    // "Neu laden": die zuletzt PERSISTIERTE Liste nehmen (nicht einfach
    // `lauf1.rest`, auch wenn beides hier übereinstimmt) und weiterlaufen.
    const gesendetLauf2 = [];
    const sendenLauf2 = vi.fn(async (_pfad, koerper) => {
      gesendetLauf2.push(koerper.baum.artDe);
      return { status: 200, daten: { ok: true, baum: { nr: "B-0002" }, store: { version: 1 } } };
    });
    const lauf2 = await bkNachtragen(persistiert, { senden: sendenLauf2, speichern });
    expect(lauf2.rest).toEqual([]);
    // v3 wird erneut geschickt (Lauf 1 wusste nie, ob er ankam), v4 zum
    // ersten Mal — v1/v2 tauchen hier NICHT wieder auf.
    expect(gesendetLauf2).toEqual(["v3", "v4"]);
  });

  it("macht ohne Warteschlange gar nichts", async () => {
    const senden = vi.fn();
    const r = await bkNachtragen([], { senden });
    expect(senden).not.toHaveBeenCalled();
    expect(r.rest).toEqual([]);
    expect(r.letzte).toBe(null);
  });
});

describe("Nachtrag mit der Warteschlange zusammenführen (C2 aus der Whole-Branch-Review)", () => {
  // bkNachtragen arbeitet auf einem Schnappschuss der Warteschlange. Während
  // des awaits kann `einreihen` (Kontroll-Wizard, Baum anlegen …) neue
  // Einträge in den echten State schreiben. Ein reines "warteschlange = rest"
  // nach dem Lauf würde die verlieren — genau der Feldfall aus der Review:
  // ein laufender Nachtrag, parallel eine abgeschlossene Kontrolle, die
  // offline eingereiht wird, und der zurückkehrende Nachtrag löscht sie.
  it("behält einen währenddessen neu eingereihten Vorgang, statt ihn zu löschen", () => {
    const schnappschuss = [{ id: "a" }, { id: "b" }];
    const rest = [];                                        // beide erfolgreich verarbeitet
    const aktuell = [...schnappschuss, { id: "c" }];         // c kam waehrend des awaits dazu
    const { liste, geaendert } = bkNachtragZusammenfuehren(schnappschuss, aktuell, rest);
    expect(liste.map((e) => e.id)).toEqual(["c"]);
    expect(geaendert).toBe(true);
  });
  it("setzt noch nachzutragende Einträge VOR die neu eingereihten", () => {
    const schnappschuss = [{ id: "a" }, { id: "b" }];
    const rest = [{ id: "b" }];                              // a erfolgreich, b haengt noch
    const aktuell = [...schnappschuss, { id: "c" }];
    const { liste } = bkNachtragZusammenfuehren(schnappschuss, aktuell, rest);
    expect(liste.map((e) => e.id)).toEqual(["b", "c"]);
  });
  it("erkennt auch einen ausgetauschten Eintrag mit gleicher Anzahl (nicht nur reines Zaehlen)", () => {
    // a erfolgreich verarbeitet UND waehrenddessen kommt genau ein neuer
    // Eintrag dazu — die Gesamtzahl bleibt gleich, der Inhalt aber nicht.
    const schnappschuss = [{ id: "a" }];
    const rest = [];
    const aktuell = [{ id: "a" }, { id: "c" }];
    const { liste, geaendert } = bkNachtragZusammenfuehren(schnappschuss, aktuell, rest);
    expect(liste.map((e) => e.id)).toEqual(["c"]);
    expect(geaendert).toBe(true);
  });
  it("meldet keine Änderung, wenn nichts verarbeitet und nichts Neues eingereiht wurde", () => {
    const schnappschuss = [{ id: "a" }];
    const { liste, geaendert } = bkNachtragZusammenfuehren(schnappschuss, schnappschuss, schnappschuss);
    expect(geaendert).toBe(false);
    expect(liste.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("Schlüsselnamen", () => {
  it("stehen an genau einer Stelle", () => {
    expect(BK_QUEUE_KEY).toBe("blattwerk_bk_ausstehend");
    expect(BK_CACHE_PRAEFIX).toBe("blattwerk_bk_cache_");
  });
});
