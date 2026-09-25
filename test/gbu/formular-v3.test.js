// GBU im Aufbau des SKT-Papierformulars (16.09.2026): Blöcke, Zusammensetzung
// je Arbeitsart/Zugang, leerer Datensatz. Die Zeilen-Ids hier sind die
// Schlüssel im Datensatz — wer eine umbenennt, bricht Maske, PDF und alte
// Log-Einträge zugleich.
import { describe, expect, it } from "vitest";
import {
  GBU_BLOECKE, composeFormular, gbuNeuV3, GBU_GESUNDHEIT, GBU_STANDSICHERHEIT,
  validateGbu, gbuUebernahmeV3, gbuUebernahme,
} from "../../src/gbu-data.js";
import fs from "node:fs";
import path from "node:path";

const ids = (bloecke, id) => bloecke.find((b) => b.id === id)?.zeilen.map((z) => z.id) || null;

describe("GBU_BLOECKE: die sechs Kästen des Papierformulars", () => {
  it("hat genau die Blöcke des Papiers in dessen Reihenfolge", () => {
    expect(GBU_BLOECKE.map((b) => b.id)).toEqual(["kopf", "baustelle", "baumcheck", "material", "personalcheck", "freigabe"]);
  });
  it("jede Zeile hat id, label, typ und Spalte", () => {
    for (const b of GBU_BLOECKE) for (const z of b.zeilen) {
      expect(z.id).toBeTruthy(); expect(z.label).toBeTruthy();
      expect(["check", "text", "wahl", "zeit", "datum", "liste", "gps"]).toContain(z.typ);
      expect([1, 2]).toContain(z.spalte);
    }
  });
});

describe("composeFormular: SKT-Baumpflege zeigt alles", () => {
  const f = composeFormular("baumpflege", "skt");
  it("alle sechs Blöcke", () => {
    expect(f.map((b) => b.id)).toEqual(["kopf", "baustelle", "baumcheck", "material", "personalcheck", "freigabe"]);
  });
  it("Baustellencheck vollständig inkl. Fallbereich/Abseiltechniken", () => {
    expect(ids(f, "baustelle")).toEqual(["verkehrssicherung", "witterung", "kommunikation", "funk", "absperrungDurch",
      "dauer", "stromleitung", "sonstigeGefahren", "fallbereichFrei", "abseiltechniken", "artAbsperrung"]);
  });
  it("Material mit den SKT-Punkten, ohne Bühnen-Rettungsplan", () => {
    expect(ids(f, "material")).toEqual(["psaDoppelt", "abseilmaterial", "rettungsmaterial", "ersteHilfe", "funkGeprueft", "sonstiges"]);
  });
  it('Personalcheck-Hinweis „mind. 2 SKT" nur bei SKT', () => {
    const skt = f.find((b) => b.id === "personalcheck").zeilen.find((z) => z.id === "auftragBesprochen");
    expect(skt.hinweis).toMatch(/2 ausgebildete Anwender SKT/);
    const boden = composeFormular("baumpflege", "boden").find((b) => b.id === "personalcheck").zeilen.find((z) => z.id === "auftragBesprochen");
    expect(boden.hinweis).toBe("");
  });
  it("die alten Arbeitsart- und Zugangs-Checklisten stehen als Chips im Baustellencheck", () => {
    const chips = f.find((b) => b.id === "baustelle").chips;
    expect(chips).toContain("Baumansprache durchgeführt (Vitalität, Totholz, Risse, Pilzbefall)");
    expect(chips).toContain("Ankerpunkt tragfähig gewählt (Baumansprache!)");
  });
  it('Freigabe mit „Baum ist sicher"', () => expect(ids(f, "freigabe")).toEqual(["baumSicher", "einschraenkungen"]));
});

describe("composeFormular: Hecke vom Boden", () => {
  const f = composeFormular("hecke", "boden");
  it("kein Baumcheck", () => expect(f.map((b) => b.id)).not.toContain("baumcheck"));
  it("kein Fallbereich, keine Abseiltechniken", () => {
    expect(ids(f, "baustelle")).not.toContain("fallbereichFrei");
    expect(ids(f, "baustelle")).not.toContain("abseiltechniken");
  });
  it("Material ohne SKT-Punkte und ohne Bühne", () => expect(ids(f, "material")).toEqual(["ersteHilfe", "funkGeprueft", "sonstiges"]));
  it('Freigabe ohne „Baum ist sicher"', () => expect(ids(f, "freigabe")).toEqual(["einschraenkungen"]));
  it("Chips der Heckenschnitt-Checkliste", () => {
    expect(f.find((b) => b.id === "baustelle").chips).toContain("Nester/Brutstätten geprüft (Vogelschutz, §39 BNatSchG)");
  });
});

describe("composeFormular: Bühne und nicht zugangsrelevante Arbeiten", () => {
  it("Baumpflege von der Bühne: Rettungsplan Bühne statt SKT-Material, Baumcheck bleibt", () => {
    const f = composeFormular("baumpflege", "buehne");
    expect(ids(f, "material")).toEqual(["rettungsplanBuehne", "ersteHilfe", "funkGeprueft", "sonstiges"]);
    expect(f.map((b) => b.id)).toContain("baumcheck");
  });
  it("Mähen ignoriert einen Zugang (nicht zugangRelevant)", () => {
    const f = composeFormular("maehen", "skt");
    expect(ids(f, "material")).toEqual(["ersteHilfe", "funkGeprueft", "sonstiges"]);
    expect(f.find((b) => b.id === "baustelle").chips).not.toContain("Ankerpunkt tragfähig gewählt (Baumansprache!)");
  });
  it("unbekannte Arbeitsart: Kopf, Baustelle, Material, Personal, Freigabe ohne Chips", () => {
    const f = composeFormular("", "");
    expect(f.map((b) => b.id)).toEqual(["kopf", "baustelle", "material", "personalcheck", "freigabe"]);
    expect(f.find((b) => b.id === "baustelle").chips).toEqual([]);
  });
});

describe("gbuNeuV3: leerer Datensatz", () => {
  const r = gbuNeuV3({ userName: "Max M.", heute: "2026-09-16" });
  it("trägt version 3 und alle Blöcke", () => {
    expect(r.version).toBe(3);
    for (const k of ["kopf", "baustelle", "baumcheck", "material", "personalcheck", "freigabe", "automatik"]) expect(r[k]).toBeTypeOf("object");
    expect(r.personal).toEqual([]); expect(r.aufsichtAbweichung).toBe(null); expect(r.wetter).toBe(null); expect(r.katasterBaum).toBe(null);
  });
  it("Kopf: Datum heute, Aufsicht = Anwender, Mobil leer, Netz offen, kein GPS, keine Karte", () => {
    expect(r.kopf.datum).toBe("2026-09-16"); expect(r.kopf.datumBis).toBe("");
    expect(r.kopf.aufsicht).toBe("Max M.");
    expect(r.kopf.mobil).toEqual([]);
    expect(r.kopf.netz).toBe("");
    expect(r.kopf.gps).toBe(null); expect(r.kopf.karte).toBe(null);
  });
  it("alle Check-Zeilen sind offen, nicht nein", () => {
    for (const b of GBU_BLOECKE) for (const z of b.zeilen) if (z.typ === "check") expect(r[b.id][z.id]).toBe("");
  });
  it("Baustelle: Dauer, Stromleitungstext und Chips vorhanden; Baumcheck mit Befund-Listen", () => {
    expect(r.baustelle.dauerVon).toBe(""); expect(r.baustelle.dauerBis).toBe("");
    expect(r.baustelle.stromleitungText).toBe(""); expect(r.baustelle.sonstigeGefahrenChips).toEqual([]);
    expect(r.baumcheck.befund).toEqual({ umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] });
    expect(r.material.offeneFristen).toEqual([]); expect(r.personalcheck.erfahrungFehlt).toEqual([]);
  });
  it("Optionen der Wahl-Zeilen sind die des Papiers", () => {
    expect(GBU_GESUNDHEIT).toEqual(["vital", "leicht eingeschränkt", "deutlich eingeschränkt", "absterbend", "abgestorben"]);
    expect(GBU_STANDSICHERHEIT).toEqual(["gegeben", "eingeschränkt", "eingehende Untersuchung erforderlich"]);
  });
});

// Ein vollständig ausgefüllter SKT-Einsatz — Basis für die Negativfälle.
const voll = () => {
  const r = gbuNeuV3({ userName: "Max M.", heute: "2026-09-16" });
  Object.assign(r, {
    arbeitsart: "baumpflege", zugang: "skt", baum: "1 Bergahorn, Vorgarten", arbeiten: ["Totholzentnahme"],
    personal: [{ key: "max", name: "Max M.", mobil: "", quals: [] }, { key: "jk", name: "Jan K.", mobil: "", quals: [] }],
    sigDurchfuehrender: "x", sigZweitePerson: "x", zweitePersonName: "Jan K.",
  });
  r.kopf.einsatzort = "Musterstadt Musterviertel";
  Object.assign(r.baustelle, { verkehrssicherung: "nein", witterung: "ja", kommunikation: "ja", funk: "nein", stromleitung: "nein", fallbereichFrei: "ja", abseiltechniken: "ja" });
  Object.assign(r.baumcheck, { gesundheit: "vital", standsicherheit: "gegeben" });
  Object.assign(r.material, { psaDoppelt: "ja", abseilmaterial: "ja", rettungsmaterial: "ja", ersteHilfe: "ja" });
  Object.assign(r.personalcheck, { auftragBesprochen: "ja", erfahrung: "ja", kommunikation: "ja", rettung: "ja" });
  r.freigabe.baumSicher = "ja";
  return r;
};

describe("validateGbu v3", () => {
  it("ein vollständiger SKT-Einsatz geht durch", () => expect(validateGbu(voll())).toEqual([]));
  it("v2-Datensätze laufen weiter durch die alte Prüfung", () => {
    expect(validateGbu({ arbeitsart: "maehen", items: {}, sigDurchfuehrender: "x" }).join(" ")).toMatch(/Alle Punkte bewerten/);
  });
  it("offen ist nicht nein: eine unbeantwortete Pflichtzeile wird mit Namen genannt", () => {
    const r = voll(); r.baustelle.witterung = "";
    expect(validateGbu(r).join(" ")).toMatch(/Witterung geeignet/);
  });
  it("Einsatzort oder Straße → der Notruf braucht eine Adresse", () => {
    const r = voll(); r.kopf.einsatzort = "";
    expect(validateGbu(r).join(" ")).toMatch(/Notruf/);
    r.kopf.strasse = "Zur Musterstraße 10";
    expect(validateGbu(r)).toEqual([]);
  });
  it("Aufsichtsführende(r) ist Pflicht", () => {
    const r = voll(); r.kopf.aufsicht = "";
    expect(validateGbu(r).join(" ")).toMatch(/Aufsichtsführende/);
  });
  it("Baum nicht sicher → Einschränkungen Pflicht", () => {
    const r = voll(); r.freigabe.baumSicher = "nein";
    expect(validateGbu(r).join(" ")).toMatch(/Einschränkungen/);
    r.freigabe.einschraenkungen = "nur Totholz vom Boden";
    expect(validateGbu(r)).toEqual([]);
  });
  it("Widerspruch: eingehende Untersuchung nötig, aber Baum freigegeben", () => {
    const r = voll(); r.baumcheck.standsicherheit = "eingehende Untersuchung erforderlich";
    expect(validateGbu(r).join(" ")).toMatch(/Widerspruch/);
  });
  it("ein „nein“ im Material-, Personalcheck oder bei Witterung/Kommunikation verlangt Einschränkungen", () => {
    for (const [block, feld] of [["material", "ersteHilfe"], ["personalcheck", "rettung"], ["baustelle", "witterung"], ["baustelle", "kommunikation"]]) {
      const r = voll(); r[block][feld] = "nein";
      expect(validateGbu(r).join(" "), `${block}.${feld}`).toMatch(/Einschränkungen/);
    }
  });
  it("Funk erforderlich → „Funk überprüft“ muss beantwortet sein", () => {
    const r = voll(); r.baustelle.funk = "ja";
    expect(validateGbu(r).join(" ")).toMatch(/Funk überprüft/);
    r.material.funkGeprueft = "ja";
    expect(validateGbu(r)).toEqual([]);
  });
  it("SKT: zwei Personen vor Ort, Name der zweiten Person, aber KEINE zweite Unterschrift", () => {
    const r = voll(); r.personal = [r.personal[0]];
    expect(validateGbu(r).join(" ")).toMatch(/zwei Personen/);
    // Ohne Unterschrift der zweiten Person laesst sich speichern — das Papierformular
    // kennt dafuer keine Zeile, unterschrieben wird nur von der aufsichtsfuehrenden Person.
    const r2 = voll(); r2.sigZweitePerson = null;
    expect(validateGbu(r2)).toEqual([]);
    // Ihr Name bleibt Pflicht: wer gerettet haette, muss im Nachhinein feststehen.
    const r3 = voll(); r3.sigZweitePerson = null; r3.zweitePersonName = "";
    expect(validateGbu(r3).join(" ")).toMatch(/zweiten rettungsfähigen Person/);
  });
  it("Hecke vom Boden: kein Baumcheck, keine SKT-Pflichten, eine Person reicht", () => {
    const r = gbuNeuV3({ userName: "L", heute: "2026-09-16" });
    Object.assign(r, { arbeitsart: "hecke", zugang: "boden", personal: [{ key: "l", name: "L", mobil: "", quals: [] }], sigDurchfuehrender: "x" });
    r.kopf.einsatzort = "Lich";
    Object.assign(r.baustelle, { verkehrssicherung: "nein", witterung: "ja", kommunikation: "ja", funk: "nein", stromleitung: "nein" });
    r.material.ersteHilfe = "ja";
    Object.assign(r.personalcheck, { auftragBesprochen: "ja", erfahrung: "ja", kommunikation: "ja", rettung: "ja" });
    r.baumcheck = null;
    expect(validateGbu(r)).toEqual([]);
  });
  it("Abweichung von der vorgeschlagenen Aufsicht braucht einen Grund", () => {
    const r = voll(); r.aufsichtAbweichung = { vorschlag: "Jan K.", gewaehlt: "Max M.", grund: "" };
    expect(validateGbu(r).join(" ")).toMatch(/Grund/);
    r.aufsichtAbweichung.grund = "Jan kommt erst um 10";
    expect(validateGbu(r)).toEqual([]);
  });
  it("Zeitrahmen-Regeln gelten wie in v2", () => {
    const r = voll(); r.anzahlOffen = true; r.baum = "Schlosspark";
    expect(validateGbu(r).join(" ")).toMatch(/Zeitrahmen|Stunden/);
    r.zeitrahmenStunden = 8;
    expect(validateGbu(r)).toEqual([]);
  });
  it("Baumarbeiten brauchen Baum/Bereich und Arbeiten", () => {
    const r = voll(); r.baum = ""; r.arbeiten = [];
    const f = validateGbu(r).join(" ");
    expect(f).toMatch(/Baum\/Bäume/); expect(f).toMatch(/Durchzuführende Arbeiten/);
  });
});

describe("gbuUebernahmeV3: aus v3 und v2 in die neue Maske", () => {
  const v3 = () => {
    const r = gbuNeuV3({ userName: "L", heute: "2026-09-10" });
    Object.assign(r, { arbeitsart: "baumpflege", zugang: "skt", baum: "Allee", arbeiten: ["Kronenpflege"],
      personal: [{ key: "max", name: "Max M.", mobil: "0179", quals: [] }] });
    Object.assign(r.kopf, { einsatzort: "Lich", strasse: "Kirchplatz 2", standort: "Parkplatz hinter der Kirche", festnetz: "06404 1",
      aufsicht: "Max M.", netz: "ja", gps: { lat: 1, lon: 2 }, karte: "data:x" });
    Object.assign(r.baustelle, { verkehrssicherung: "ja", witterung: "ja", stromleitung: "nein", stromleitungText: "keine",
      artAbsperrung: "Schilder", absperrungDurch: "Blattwerk", sonstigeGefahrenChips: ["Gebäude"], dauerVon: "07:00" });
    r.freigabe.baumSicher = "ja"; r.baumcheck.gesundheit = "vital";
    return r;
  };
  it("übernimmt Einsatz, Ort, Absperrung, Stromleitung, Verkehrssicherung, Personal", () => {
    const u = gbuUebernahmeV3(v3());
    expect(u.form).toMatchObject({ arbeitsart: "baumpflege", zugang: "skt", baum: "Allee", arbeiten: ["Kronenpflege"], anzahlOffen: false, zeitrahmenStunden: "" });
    expect(u.kopf).toEqual({ einsatzort: "Lich", strasse: "Kirchplatz 2", standort: "Parkplatz hinter der Kirche", festnetz: "06404 1", aufsicht: "Max M." });
    expect(u.baustelle).toEqual({ verkehrssicherung: "ja", stromleitung: "nein", stromleitungText: "keine", artAbsperrung: "Schilder", absperrungDurch: "Blattwerk", sonstigeGefahrenChips: ["Gebäude"] });
    expect(u.personal).toEqual([{ key: "max", name: "Max M.", mobil: "0179", quals: [] }]);
  });
  it("übernimmt NICHT Witterung, Zeiten, Netz, GPS, Karte, Baumcheck, Freigabe", () => {
    const u = gbuUebernahmeV3(v3());
    expect(u.baustelle.witterung).toBeUndefined(); expect(u.baustelle.dauerVon).toBeUndefined();
    expect(u.kopf.netz).toBeUndefined(); expect(u.kopf.gps).toBeUndefined(); expect(u.kopf.karte).toBeUndefined();
    expect(u.baumcheck).toBeUndefined(); expect(u.freigabe).toBeUndefined();
  });
  it("aus einem v2-Eintrag: Freitexte in die neuen Felder, Stromleitung/Verkehr abgeleitet", () => {
    const u = gbuUebernahmeV3({ arbeitsart: "hecke", zugang: "boden", einsatzort: "Lich, Kirchplatz 2", aufsichtsfuehrender: "Max M.",
      stromEntfernung: "keine", verkehrssicherungsart: "Warnkleidung", personal: [{ name: "Jan K.", quals: ["SKT A"] }] });
    expect(u.kopf).toMatchObject({ einsatzort: "Lich, Kirchplatz 2", aufsicht: "Max M.", strasse: "" });
    expect(u.baustelle).toMatchObject({ stromleitung: "nein", stromleitungText: "keine", verkehrssicherung: "ja", artAbsperrung: "Warnkleidung" });
    expect(u.personal).toEqual([{ key: "", name: "Jan K.", mobil: "", quals: ["SKT A"] }]);
  });
  it("Ableitung: Text mit Entfernung → ja, „nicht erforderlich“ → nein, nichts → offen", () => {
    expect(gbuUebernahmeV3({ stromEntfernung: "Freileitung in ca. 8 m" }).baustelle.stromleitung).toBe("ja");
    expect(gbuUebernahmeV3({ verkehrssicherungsart: "nicht erforderlich" }).baustelle.verkehrssicherung).toBe("nein");
    expect(gbuUebernahmeV3({}).baustelle.stromleitung).toBe("");
    expect(gbuUebernahmeV3({}).baustelle.verkehrssicherung).toBe("");
  });
  it("nichts rein, nichts raus", () => expect(gbuUebernahmeV3(null)).toBe(null));
  it("das alte gbuUebernahme stolpert nicht über einen v3-Eintrag im Log", () => {
    const u = gbuUebernahme(v3());
    expect(u.form.arbeitsart).toBe("baumpflege"); expect(u.items).toEqual({}); expect(u.baumdaten).toBe(null);
  });
});

// ── Verdrahtung der neuen Maske (Quelltext-Test wie test/fahrtenbuch/verdrahtung.test.js)
const maske = () => fs.readFileSync(path.join(process.cwd(), "src/ui/GbuFormSkt.jsx"), "utf8");

describe("GbuFormSkt.jsx: Maske im Aufbau des SKT-Formulars", () => {
  const src = maske();
  it("ist die Standard-Exportfunktion mit den Props von GbuForm", () => {
    expect(src).toMatch(/export default function GbuFormSkt\(\{ api, me, project, onClose, onSaved, showToast \}\)/);
  });
  it("baut das Formular aus composeFormular und prüft mit validateGbu (v3)", () => {
    expect(src).toMatch(/composeFormular\(/); expect(src).toMatch(/validateGbu\(/); expect(src).toMatch(/gbuNeuV3\(/);
  });
  it("Ablage und Wizard bleiben: Warteschlange, processGbuQueue, SignaturePad, drei Schritte", () => {
    expect(src).toMatch(/saveGbuQueue\(\[\.\.\.loadGbuQueue\(\), record\]\)/);
    expect(src).toMatch(/processGbuQueue\(api, showToast, betrieb\)/);
    expect(src).toMatch(/<SignaturePad/); expect(src).toMatch(/step === 3/);
  });
  it("Übernahme vom letzten Einsatz beim Kunden über gbuUebernahmeV3", () => {
    expect(src).toMatch(/gbuLetzterEinsatz\(loadGbuLog\(\)/); expect(src).toMatch(/gbuUebernahmeV3\(/);
    expect(src).toMatch(/Vom letzten Einsatz übernehmen/);
  });
  it("Fremdmodule nie statisch: kein import von qualifikationen/baumkataster, dafür import.meta.glob", () => {
    expect(src).not.toMatch(/^import .*(qualifikationen|baumkataster)/m);
    expect(src).toMatch(/import\.meta\.glob\(/);
  });
  it("jede Prüfzeile kennt drei Zustände und zeigt automatisch/geändert", () => {
    expect(src).toMatch(/function CheckZeile/); expect(src).toMatch(/automatikText\(/);
    expect(src).toMatch(/wert === v \? "" : v/); // nochmal tippen = wieder offen
  });
  it("Kopf: Datum, Einsatzort, Straße, Standort, Festnetz, Mobil 1–3, Netzempfang, Aufsicht, Notruf 112", () => {
    for (const s of ["Einsatzort/Ortsteil", "Straße/Nr./Park", "Standort/Zufahrtsweg", "Festnetz", "Mobil-Nr.", "Netzempfang", "Aufsichtsführende(r)", "Notruf 112"]) expect(src, s).toContain(s);
  });
});

describe("GbuFormSkt.jsx: Automatik", () => {
  const src = maske();
  it("Netzempfang über navigator.onLine + Manifest-Ping", () => {
    expect(src).toMatch(/netzempfang\(\{ onLine: navigator\.onLine/);
  });
  it("GPS: watchPosition mit hoher Genauigkeit, 10 s, dann beste Position", () => {
    expect(src).toMatch(/navigator\.geolocation\.watchPosition\(/); expect(src).toMatch(/enableHighAccuracy: true/);
    expect(src).toMatch(/setTimeout\(fertig, 10000\)/); expect(src).toMatch(/besteGps\(punkte\)/);
    expect(src).toMatch(/navigator\.geolocation\.clearWatch\(/);
  });
  it("nach der Position: Karte per fetch + createImageBitmap, Nominatim ohne User-Agent (im Browser verboten), Open-Meteo", () => {
    expect(src).toMatch(/kartenBild\(g\.lat, g\.lon/); expect(src).toMatch(/createImageBitmap\(/);
    expect(src).toMatch(/GEO_URL\(g\.lat, g\.lon\)/); expect(src).toMatch(/"Accept-Language": "de"/);
    // M5 aus der Whole-Branch-Review: die reine Doppelquote-Prüfung liesse
    // 'User-Agent' (einfach quotiert) durchgehen.
    expect(src).not.toMatch(/['"]User-Agent['"]/i);
    expect(src).toMatch(/WETTER_URL\(g\.lat, g\.lon\)/); expect(src).toMatch(/wetterParsen\(/);
  });
  it("Adresse aus dem Kunden, Dauer aus dem Projekttermin, Material aus den Fristen, Mobil aus dem Personal", () => {
    expect(src).toMatch(/adresseAusKunde\(selCustomer\)/); expect(src).toMatch(/dauerAusTermin\(agenda, projektId/);
    expect(src).toMatch(/materialAusFristen\(lose/); expect(src).toMatch(/mobilReihenfolge\(d\.personal, d\.kopf\.aufsicht\)/);
    expect(src).toMatch(/api\.getLots\(\)/); expect(src).toMatch(/api\.getAgendaEvents\(\)/);
  });
  it("Witterung aus der Bewertung, nie „nein“ — nur die Bewertung entscheidet", () => {
    expect(src).toMatch(/wetterBewertung\(d\.wetter/);
    expect(src).not.toMatch(/setzen\("baustelle", "witterung", "nein"/);
  });
  it("Automatik schreibt immer mit art \"auto\" (nie manuell)", () => {
    const autoAufrufe = (src.match(/, "auto"\)/g) || []).length;
    expect(autoAufrufe).toBeGreaterThanOrEqual(8);
  });
  it("der Waechter in setzen() ueberschreibt nie ein bereits geaendertes Feld (I-1, Final-Review 16.09.2026)", () => {
    expect(src).toMatch(/if \(art === "auto" && p\.automatik\[pfad\] === "geaendert"\) return p;/);
  });
});

describe("GbuFormSkt.jsx: Teilprojekte A und C nur dynamisch, mit Fallback", () => {
  const src = maske();
  it("lädt qualifikationen.js und den Store, nutzt qualAufsicht/qualPersonalcheck nur, wenn vorhanden", () => {
    expect(src).toMatch(/ladeModul\("\.\.\/qualifikationen\.js"\)/); expect(src).toMatch(/ncPost\("\/api\/nc\/qualifikationen"/);
    expect(src).toMatch(/typeof qualModul\.qualAufsicht === "function"/); expect(src).toMatch(/typeof qualModul\.qualPersonalcheck === "function"/);
  });
  it("lädt baumkataster.js, baumkataster-data.js und den Kunden-Store; bkFuerGbu nur, wenn vorhanden", () => {
    expect(src).toMatch(/ladeModul\("\.\.\/baumkataster\.js"\)/); expect(src).toMatch(/ladeModul\("\.\.\/baumkataster-data\.js"\)/);
    expect(src).toMatch(/ncPost\("\/api\/nc\/baumkataster\/kunde", \{ kundeId \}\)/);
    expect(src).toMatch(/typeof bkModul\?\.bkFuerGbu === "function"/); expect(src).toMatch(/katasterInBaumcheck\(/); expect(src).toMatch(/letzteKontrolle\(/);
  });
  it("nach dem Speichern: Verweis an der Kontrolle — auch für offline gespeicherte Beurteilungen nachgetragen", () => {
    expect(src).toMatch(/blattwerk_gbu_kataster_ausstehend/);
    expect(src).toMatch(/\{ \.\.\.record\.katasterBaum, gbuId: record\.id \}/);
    expect(src).toMatch(/apiFetch\("\/api\/nc\/baumkataster\/kontrolle\/gbu"/);
    expect((src.match(/katasterVerweiseNachtragen\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it("Abweichung von der vorgeschlagenen Aufsicht wird mit Vorschlag/Gewählt/Grund festgehalten", () => {
    expect(src).toMatch(/aufsichtAbweichung: aufsichtVorschlag && v\.trim\(\) && v\.trim\(\) !== aufsichtVorschlag\.name/);
  });
  it("ohne Modul A bleiben die alten Qualifikations-Chips je Person", () => {
    expect(src).toMatch(/\{!qualModul && \(/); expect(src).toMatch(/GBU_QUALIFIKATIONEN\.map/);
  });
});

describe("dolibarr-app.jsx: GbuFormSkt ersetzt GbuForm an den Aufrufstellen", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  it("importiert die neue Maske", () => {
    expect(app).toMatch(/^import GbuFormSkt from "\.\/src\/ui\/GbuFormSkt\.jsx";$/m);
  });
  it("beide Aufrufstellen (Arbeitsschutz-Seite, Projekt-Detail) nutzen GbuFormSkt, keine mehr GbuForm", () => {
    expect((app.match(/<GbuFormSkt\b/g) || []).length).toBe(2);
    expect(app).not.toMatch(/<GbuForm[\s>]/);
  });
  it("GbuForm bleibt vorerst im File (Abbau ist ein eigener Schritt)", () => {
    expect(app).toMatch(/^function GbuForm\(/m);
  });
  it("exportiert die Helfer, die GbuFormSkt braucht — jeden genau einmal", () => {
    const m = app.match(/^export \{ ([^}]+) \};$/m);
    expect(m).not.toBe(null);
    const namen = m[1].split(",").map((s) => s.trim());
    for (const n of ["SignaturePad", "SuchAuswahl", "Icon", "apiFetch", "loadNcConfig", "loadGbuQueue", "saveGbuQueue", "loadGbuLog", "processGbuQueue", "ewPersonen", "isOpenProject"]) expect(namen).toContain(n);
    expect(new Set(namen).size).toBe(namen.length);
  });
});
