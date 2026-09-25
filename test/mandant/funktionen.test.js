// Funktionen unterhalb der Bloecke (src/funktionen.js): eine Tabelle, eine
// Entscheidung. Der teuerste Fehler waere eine Funktion, die an ist, obwohl
// ihr Block aus ist — dann ruft die Oberflaeche einen Dienst, den der Mandant
// gar nicht hat. Deshalb prueft dieser Test Block-Bindung, Kaskade und die
// Standards fuer Blattwerk gegen fremd.
import { describe, expect, it } from "vitest";
import {
  dolibarrAbgleich, einrichtungsAuftrag,
  FUNKTIONEN, FUNKTION_KEYS, funktionAktiv, funktionenAufloesen, funktionenFuer, funktionenStandard, kaskade, warteschlangenStand,
} from "../../src/funktionen.js";
import { BLOECKE, mandantLaden, mandantOeffentlich, mandantPruefen, MANDANT_STANDARD } from "../../src/mandant.js";

const bw = () => mandantLaden(null).mandant;
const fremd = (extra = {}) => mandantLaden(JSON.stringify({
  kuerzel: "xy", name: "Baum Müller GbR", profil: "baumpflege",
  bloecke: { erp: true, belege: true, fahrtenbuch: true, chat: true, arbeitsschutz: true, kalender: true, telefon: true },
  dienste: { dolibarr: "https://erp.example", nextcloud: "https://nc.example", matrix: "https://m.example" },
  ...extra,
})).mandant;

describe("Tabelle", () => {
  it("jede Funktion nennt existierende Bloecke und existierende braucht-Funktionen, ohne Zyklen", () => {
    for (const f of FUNKTIONEN) {
      for (const b of [].concat(f.block)) if (b) expect(BLOECKE).toContain(b);
      for (const k of f.braucht) expect(FUNKTION_KEYS).toContain(k);
      expect(kaskade(f.key)).not.toContain(f.key);
    }
    expect(new Set(FUNKTION_KEYS).size).toBe(FUNKTIONEN.length);
  });
  it("partner ist Pflicht, lager/baumkataster/ueberlassung sind fremd aus", () => {
    const s = funktionenStandard("xy");
    expect(s.partner).toBe(true);
    expect(s.lager).toBe(false); expect(s.baumkataster).toBe(false); expect(s.ueberlassung).toBe(false);
    expect(s.angebote).toBe(true);
    expect(Object.values(funktionenStandard("bw")).every(Boolean)).toBe(true);
  });
  it("dolibarr-Modulnamen sind die internen Namen aus GET /setup/modules", () => {
    const bekannt = ["propal", "facture", "banque", "projet", "societe", "fournisseur", "product", "stock", "expedition", "expensereport", "productbatch", "agenda", "blattwerkapp"];
    for (const f of FUNKTIONEN) for (const m of f.dolibarr) expect(bekannt).toContain(m);
  });
});

describe("Aufloesung", () => {
  it("Blattwerk ohne Abschnitt: alles an", () => {
    expect(Object.values(funktionenAufloesen(bw())).every(Boolean)).toBe(true);
  });
  it("fremd ohne Abschnitt: Standard fremd", () => {
    const a = funktionenAufloesen(fremd());
    expect(a.lager).toBe(false); expect(a.rechnungen).toBe(true);
  });
  it("Block aus ⇒ Funktion aus, auch wenn der Schalter an ist", () => {
    const m = fremd({ bloecke: { erp: false, arbeitsschutz: true }, funktionen: { angebote: true } });
    expect(funktionAktiv(m, "angebote")).toBe(false);
    expect(funktionAktiv(m, "gbu")).toBe(true);
  });
  it("baumkataster braucht erp UND belege", () => {
    expect(funktionAktiv(fremd({ bloecke: { erp: true, belege: false }, funktionen: { baumkataster: true } }), "baumkataster")).toBe(false);
    expect(funktionAktiv(fremd({ funktionen: { baumkataster: true } }), "baumkataster")).toBe(true);
  });
  it("harte Kaskade: projekte aus ⇒ zeiterfassung aus; gbu bleibt (weich)", () => {
    const m = fremd({ funktionen: { projekte: false } });
    expect(funktionAktiv(m, "zeiterfassung")).toBe(false);
    expect(funktionAktiv(m, "gbu")).toBe(true);
    expect(kaskade("projekte")).toEqual(expect.arrayContaining(["zeiterfassung"]));
    expect(kaskade("projekte")).not.toContain("gbu");
  });
  it("partner laesst sich nicht abschalten", () => {
    expect(funktionAktiv(fremd({ funktionen: { partner: false } }), "partner")).toBe(true);
  });
  it("unbekannter Schluessel ist aus", () => {
    expect(funktionAktiv(bw(), "gibtsnicht")).toBe(false);
  });
  it("funktionenFuer liefert die Tabelle mit Zustand", () => {
    const liste = funktionenFuer(fremd({ bloecke: { erp: false } }));
    const lager = liste.find((f) => f.key === "lager");
    expect(lager.aktiv).toBe(false); expect(lager.blockAktiv).toBe(false);
    expect(liste.find((f) => f.key === "gbu").blockAktiv).toBe(true);
  });
});

describe("Mandanten-Datei", () => {
  it("MANDANT_STANDARD hat fuer jede Funktion einen Schalter, alle an", () => {
    expect(Object.keys(MANDANT_STANDARD.funktionen).sort()).toEqual([...FUNKTION_KEYS].sort());
    expect(Object.values(MANDANT_STANDARD.funktionen).every(Boolean)).toBe(true);
  });
  it("fremder Mandant erbt Blattwerks Schalter NICHT, sondern bekommt den Fremd-Standard", () => {
    const m = fremd();
    expect(m.funktionen.lager).toBe(false);
    expect(m.funktionen.angebote).toBe(true);
  });
  it("eigene Schalter der Datei gewinnen", () => {
    expect(fremd({ funktionen: { lager: true } }).funktionen.lager).toBe(true);
  });
  it("mandantOeffentlich liefert aufgeloeste Werte fuer alle Keys", () => {
    const oeff = mandantOeffentlich(fremd({ bloecke: { erp: false }, funktionen: { lager: true } }));
    expect(Object.keys(oeff.funktionen).sort()).toEqual([...FUNKTION_KEYS].sort());
    expect(oeff.funktionen.lager).toBe(false);
    expect(oeff.funktionen.gbu).toBe(true);
  });
  it("mandantPruefen weist unbekannte Funktionen und partner:false ab", () => {
    const basis = { kuerzel: "xy", name: "X" };
    expect(mandantPruefen({ ...basis, funktionen: { gibtsnicht: true } })).toMatch(/Unbekannte Funktion: gibtsnicht/);
    expect(mandantPruefen({ ...basis, funktionen: { partner: false } })).toMatch(/Geschäftspartner/);
    expect(mandantPruefen({ ...basis, funktionen: { lager: "ja" } })).toMatch(/lager/);
    expect(mandantPruefen({ ...basis, funktionen: { lager: true } })).toBe(null);
  });
});

describe("Warteschlangen abgeschalteter Funktionen", () => {
  const speicher = (werte) => ({ getItem: (k) => (k in werte ? werte[k] : null) });
  it("zaehlt nur Funktionen, die aus sind und Eintraege haben", () => {
    const m = fremd({ funktionen: { gbu: false, fahrtenbuch: false } });
    const s = speicher({
      blattwerk_gbu_queue: JSON.stringify([{ id: 1 }, { id: 2 }]),
      blattwerk_fahrtenbuch_entwuerfe: JSON.stringify({ entwuerfe: { a: {}, b: {}, c: {} } }),
    });
    expect(warteschlangenStand(m, s)).toEqual([
      { key: "gbu", label: "Gefährdungsbeurteilung", anzahl: 2 },
      { key: "fahrtenbuch", label: "Fahrtenbuch", anzahl: 3 },
    ]);
  });
  it("aktive Funktionen und leere Speicher tauchen nicht auf", () => {
    expect(warteschlangenStand(fremd(), speicher({ blattwerk_gbu_queue: "[{}]" }))).toEqual([]);
    expect(warteschlangenStand(fremd({ funktionen: { gbu: false } }), speicher({}))).toEqual([]);
  });
  it("kaputter Speicherinhalt zaehlt als 0, wirft nicht", () => {
    expect(warteschlangenStand(fremd({ funktionen: { gbu: false } }), speicher({ blattwerk_gbu_queue: "{kaputt" }))).toEqual([]);
  });
});

describe("Dolibarr-Abgleich", () => {
  const m = fremd({ funktionen: { lager: true } });
  it("meldet je aktiver Funktion das fehlende Modul", () => {
    const a = dolibarrAbgleich(m, { moduleAktiv: ["societe", "propal", "facture", "banque", "projet", "fournisseur", "product", "expensereport", "agenda", "blattwerkapp"], setup: { admin: true, module: {}, zusatzfelder: {}, kontenrahmen: "SKR03" } });
    const fehlt = a.punkte.filter((p) => p.fehlt).map((p) => `${p.funktion}:${p.art}:${p.name}`);
    expect(fehlt).toContain("lager:modul:stock");
    expect(fehlt).toContain("lager:modul:expedition");
    expect(fehlt).not.toContain("angebote:modul:propal");
    expect(a.geprueft).toBe(true); expect(a.einrichtbar).toBe(true);
  });
  it("fehlendes blattwerkapp ist der erste Punkt und macht nicht einrichtbar", () => {
    const a = dolibarrAbgleich(m, { moduleAktiv: ["societe"], setup: null });
    expect(a.punkte[0]).toMatchObject({ art: "blattwerkapp", fehlt: true });
    expect(a.einrichtbar).toBe(false);
  });
  it("nicht erreichbar ⇒ nicht geprueft, keine Punkte", () => {
    const a = dolibarrAbgleich(m, { moduleAktiv: null, setup: null });
    expect(a.geprueft).toBe(false); expect(a.punkte).toEqual([]);
  });
  it("Zusatzfelder der Bestellungen fehlen ⇒ Punkt je Feld", () => {
    const a = dolibarrAbgleich(m, { moduleAktiv: ["societe", "fournisseur", "product", "blattwerkapp"], setup: { admin: true, module: {}, zusatzfelder: { "commande_fournisseur.bw_prio": true }, kontenrahmen: null } });
    const fehlt = a.punkte.filter((p) => p.fehlt && p.art === "zusatzfeld").map((p) => p.name);
    expect(fehlt).toContain("commande_fournisseur.bw_kategorie");
    expect(fehlt).not.toContain("commande_fournisseur.bw_prio");
    expect(a.punkte.some((p) => p.art === "kontenrahmen" && p.fehlt)).toBe(true);
  });
  it("Auftrag enthaelt nur Fehlendes", () => {
    const a = dolibarrAbgleich(m, { moduleAktiv: ["societe", "propal", "blattwerkapp"], setup: { admin: true, module: {}, zusatzfelder: {}, kontenrahmen: "SKR03" } });
    const b = einrichtungsAuftrag(a.punkte);
    expect(b.module).toContain("stock"); expect(b.module).not.toContain("propal");
    expect(b.zusatzfelder.map((f) => `${f.elementtype}.${f.name}`)).toContain("commande_fournisseur.bw_prio");
    expect(b.kontenrahmen).toBeUndefined();
  });
});
