// Entwürfe im Fahrtenbuch (11.09.2026)
//
// Eine angefangene Fahrt soll das Schließen der App überleben, ohne schon im
// Fahrtenbuch zu stehen: ein Entwurf bekommt KEINE laufende Nummer, taucht in
// keinem Export auf und zählt in keiner Summe mit. Sonst wäre die geschlossene
// Form verletzt — eine Nummer, die später doch noch verworfen wird, sieht aus
// wie eine gelöschte Fahrt.
//
// Deshalb liegen Entwürfe in einer eigenen Liste (nur auf dem Gerät), nicht im
// Store. Erst „Eintragen" macht daraus eine Fahrt.
import { describe, expect, it } from "vitest";
import {
  FB_ENTWUERFE_LEER, entwurfSpeichern, entwurfLoeschen, entwurfOffen, entwurfKarte,
  fahrtenAuswertung, fahrtenCsv, fahrtenListe,
} from "../../src/fahrtenbuch.js";

const werte = (x = {}) => ({
  datum: "2026-09-11", zeitVon: "07:30", zeitBis: "",
  start: "Musterstadt, Zur Musterstraße 10", ziel: "Gießen, Marktplatz",
  kmBeginn: 12000, kmEnde: "", distanz: "",
  zweck: "Baumpflege Müller", art: "B", fahrer: "Max",
  ...x,
});

describe("Entwürfe ablegen", () => {
  it("leere Liste ist ein Array", () => {
    expect(FB_ENTWUERFE_LEER).toEqual([]);
  });

  it("legt einen Entwurf mit Id, Fahrzeug und Zeitstempel ab", () => {
    const l = entwurfSpeichern(FB_ENTWUERFE_LEER, { id: "e1", fahrzeugId: "fiat", werte: werte() }, { jetzt: "2026-09-11T09:00:00Z" });
    expect(l).toHaveLength(1);
    expect(l[0].id).toBe("e1");
    expect(l[0].fahrzeugId).toBe("fiat");
    expect(l[0].werte.ziel).toBe("Gießen, Marktplatz");
    expect(l[0].gespeichertAm).toBe("2026-09-11T09:00:00Z");
  });

  it("ein zweiter Stand desselben Entwurfs ersetzt den ersten (kein Doppel)", () => {
    const a = entwurfSpeichern(FB_ENTWUERFE_LEER, { id: "e1", fahrzeugId: "fiat", werte: werte() }, { jetzt: "t1" });
    const b = entwurfSpeichern(a, { id: "e1", fahrzeugId: "fiat", werte: werte({ ziel: "Lich" }) }, { jetzt: "t2" });
    expect(b).toHaveLength(1);
    expect(b[0].werte.ziel).toBe("Lich");
    expect(b[0].gespeichertAm).toBe("t2");
  });

  it("neueste Entwürfe stehen oben", () => {
    let l = entwurfSpeichern(FB_ENTWUERFE_LEER, { id: "e1", werte: werte() }, { jetzt: "t1" });
    l = entwurfSpeichern(l, { id: "e2", werte: werte() }, { jetzt: "t2" });
    expect(l.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("ohne Id kein Entwurf", () => {
    expect(() => entwurfSpeichern(FB_ENTWUERFE_LEER, { werte: werte() })).toThrow(/Id/);
  });

  it("verträgt kaputte Listen aus dem Gerätespeicher", () => {
    expect(entwurfSpeichern(null, { id: "e1", werte: werte() })).toHaveLength(1);
    expect(entwurfLoeschen(undefined, "e1")).toEqual([]);
  });

  it("löscht gezielt einen Entwurf", () => {
    let l = entwurfSpeichern(FB_ENTWUERFE_LEER, { id: "e1", werte: werte() });
    l = entwurfSpeichern(l, { id: "e2", werte: werte() });
    expect(entwurfLoeschen(l, "e1").map((e) => e.id)).toEqual(["e2"]);
    expect(entwurfLoeschen(l, "gibtsnicht")).toHaveLength(2);
  });

  it("die Werte werden kopiert — spätere Tipper im Formular ändern den Entwurf nicht", () => {
    const w = werte();
    const l = entwurfSpeichern(FB_ENTWUERFE_LEER, { id: "e1", werte: w });
    w.ziel = "woanders";
    expect(l[0].werte.ziel).toBe("Gießen, Marktplatz");
  });
});

describe("Was dem Entwurf noch fehlt", () => {
  it("vollständige Fahrt: nichts offen", () => {
    expect(entwurfOffen(werte({ kmEnde: 12018 }))).toEqual([]);
  });
  it("benennt fehlende Pflichtangaben in der Reihenfolge der Maske", () => {
    expect(entwurfOffen(werte({ datum: "", ziel: "", kmEnde: "" }))).toEqual(["Datum", "Ziel", "Strecke"]);
  });
  it("Zweck fehlt nur bei betrieblichen Fahrten", () => {
    expect(entwurfOffen(werte({ kmEnde: 12018, zweck: "" }))).toEqual(["Zweck"]);
    expect(entwurfOffen(werte({ kmEnde: 12018, zweck: "", art: "P" }))).toEqual([]);
  });
  it("Strecke gilt auch ohne km-Stand als da, wenn eine Distanz eingetragen ist", () => {
    expect(entwurfOffen(werte({ kmBeginn: "", kmEnde: "", distanz: 18 }))).toEqual([]);
  });
});

describe("Entwurfs-Karte", () => {
  it("zeigt Ziel, Zweck, Art und was noch fehlt", () => {
    const e = { id: "e1", werte: werte({ kmEnde: "" }), gespeichertAm: "2026-09-11T09:00:00Z" };
    const k = entwurfKarte(e);
    expect(k).toMatchObject({ id: "e1", datum: "2026-09-11", ziel: "Gießen, Marktplatz", zweck: "Baumpflege Müller", art: "B" });
    expect(k.offen).toEqual(["Strecke"]);
  });
  it("ein noch leerer Entwurf kippt die Karte nicht um", () => {
    const k = entwurfKarte({ id: "e2" });
    expect(k.id).toBe("e2");
    expect(k.ziel).toBe("");
    expect(k.offen).toContain("Datum");
  });
});

describe("Entwürfe bleiben aus dem Fahrtenbuch heraus", () => {
  // Der Store kennt Entwürfe gar nicht — diese Prüfung nagelt fest, dass ein
  // versehentlich mit abgelegter Entwurf (`entwurf: true`) weder Nummer noch
  // Kilometer bekommt, falls jemand die Trennung später aufweicht.
  const store = {
    version: 1, fahrzeuge: [{ id: "fiat", name: "Ducato" }],
    fahrten: [
      { id: "f1", lfdNr: 1, datum: "2026-09-01", typ: "betrieblich", fahrzeugId: "fiat", kmBeginn: 100, kmEnde: 120, ziel: "Gießen", zweck: "Kunde" },
      { id: "e1", lfdNr: null, entwurf: true, datum: "2026-09-02", typ: "betrieblich", fahrzeugId: "fiat", distanz: 500, ziel: "Entwurf" },
    ],
  };
  it("zählt nicht in die Auswertung", () => {
    expect(fahrtenAuswertung(store, 2026).jahr.gesamt).toBe(20);
  });
  it("steht nicht im CSV-Export", () => {
    expect(fahrtenCsv(store)).not.toMatch(/Entwurf/);
  });
  it("taucht nicht in der Monatsliste auf", () => {
    const l = fahrtenListe(store, { fahrzeugId: "fiat" });
    expect(l.anzahl).toBe(1);
    expect(l.summe.gesamt).toBe(20);
  });
});

// ── Verdrahtung in der App ──────────────────────────────────────────────────
// Gleiches Muster wie test/fahrtenbuch/verdrahtung.test.js: der Entwurf ist
// leicht wegrefactort, und dann wäre eine angefangene Fahrt beim nächsten
// Öffnen still weg.
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const fahrtenbuch = (() => {
  const a = src.indexOf("// ─── Fahrtenbuch ");
  const b = src.indexOf("// ─── Ende Fahrtenbuch", a);
  return src.slice(a, b);
})();

describe("Entwürfe in der App", () => {
  it("holt die Entwurfs-Logik aus src/fahrtenbuch.js statt sie nachzubauen", () => {
    for (const name of ["entwurfSpeichern", "entwurfLoeschen", "entwurfKarte"]) {
      expect(src).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
  it("legt Entwürfe im Gerätespeicher ab — eigener Schlüssel neben Cache und Warteschlange", () => {
    expect(fahrtenbuch).toMatch(/blattwerk_fahrtenbuch_entwuerfe/);
  });
  it("die Maske hat einen Knopf „Als Entwurf sichern“", () => {
    expect(fahrtenbuch).toMatch(/Als Entwurf sichern/);
    expect(fahrtenbuch).toMatch(/entwurfSichern/);
  });
  it("zeigt offene Entwürfe als eigene Karten über den Fahrten", () => {
    expect(fahrtenbuch).toMatch(/fb-entwurf/);
    expect(fahrtenbuch).toMatch(/entwurfKarte\(/);
  });
  it("aus einem Entwurf wird beim Eintragen eine Fahrt — der Entwurf verschwindet", () => {
    expect(fahrtenbuch).toMatch(/entwurfLoeschen\(/);
  });
  it("ein Entwurf geht nie über die Nextcloud-Ablage — sonst bekäme er eine Nummer", () => {
    // Der Entwurf darf nirgends in den Speicher-Auftrag geraten.
    expect(fahrtenbuch).not.toMatch(/fahrt:\s*\{[^}]*entwurf/);
    expect(fahrtenbuch).toMatch(/nur auf diesem Gerät/);
  });
});
