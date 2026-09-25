// Gefährdungsbeurteilung: „wenn öfter beim Kunden, alles übernehmen" + Suche
// (11.09.2026)
//
// Wer dreimal die Woche beim selben Kunden dieselbe Hecke schneidet, tippt
// heute jedes Mal dasselbe Formular neu. Die Übernahme füllt den wiederkehrenden
// Teil aus dem letzten Einsatz bei diesem Kunden vor.
//
// Was NICHT übernommen wird, ist der Punkt der Sache: Wetter, Uhrzeit und
// Unterschriften. Eine Beurteilung, die das Wetter von vorgestern weiterträgt,
// ist keine Beurteilung mehr — sie ist eine Kopie, und genau das verbietet
// § 5 ArbSchG (Beurteilung der tatsächlichen Verhältnisse vor Ort).
import { describe, expect, it } from "vitest";
import { gbuLetzterEinsatz, gbuUebernahme, gbuSuche } from "../../src/gbu-data.js";

const eintrag = (x = {}) => ({
  id: "gbu-1", createdAt: "2026-09-08T07:12:00.000Z",
  kunde: { id: 42, name: "Müller GmbH" },
  projekt: { id: 7, ref: "PJ2609", title: "Hecke" },
  arbeitsart: "baumpflege", zugang: "hubsteiger",
  niederschlag: "Regen", wind: "starker Wind/Böen",
  beschreibung: "Kronenpflege", baum: "1 Bergahorn, Vorgarten", besonderheiten: "Zaun aus Glas",
  einsatzort: "Lich, Kirchplatz 2", aufsichtsfuehrender: "Max M.",
  dauerVon: "07:12", dauerBis: "11:00",
  personal: [{ name: "Max M.", quals: ["AS-Baum I"] }, { name: "Jan K.", quals: [] }],
  arbeiten: ["Totholz entfernen"], arbeitenSonstiges: "",
  stromEntfernung: "8 m", kommunikationsart: "Zuruf", verkehrssicherungsart: "Warnkleidung",
  baumdaten: { baumart: "Bergahorn", hoehe: "14", bhd: "45", stock: "", haenger: ["Normalbaum"], umfeld: [], stamm: [], krone: [], gewicht: "gleichmäßig", kronenzustand: "begrünt", sicher: "ja", bemerkung: "" },
  items: { "grund:psa": { status: "ok", massnahme: "" }, "grund:wetter": { status: "mangel", massnahme: "Wetterbesserung abgewartet" } },
  sigDurchfuehrender: null, sigZweitePerson: null,
  ...x,
});

describe("Letzter Einsatz beim selben Kunden", () => {
  const log = [
    eintrag({ id: "neu-fremd", createdAt: "2026-09-10T08:00:00.000Z", kunde: { id: 99, name: "Schmitt" } }),
    eintrag({ id: "passt-neu", createdAt: "2026-09-09T08:00:00.000Z" }),
    eintrag({ id: "passt-alt", createdAt: "2026-09-01T08:00:00.000Z" }),
  ];
  it("findet den jüngsten Eintrag zu diesem Kunden", () => {
    expect(gbuLetzterEinsatz(log, { kundeId: 42 })?.id).toBe("passt-neu");
  });
  it("findet ihn auch nur über den Namen (Einsätze ohne Kundennummer)", () => {
    const ohneId = [eintrag({ id: "nur-name", kunde: { name: "Müller GmbH" } })];
    expect(gbuLetzterEinsatz(ohneId, { kundeName: "müller gmbh" })?.id).toBe("nur-name");
  });
  it("ohne Kunde und ohne Treffer: nichts", () => {
    expect(gbuLetzterEinsatz(log, {})).toBe(null);
    expect(gbuLetzterEinsatz(log, { kundeId: 1234 })).toBe(null);
    expect(gbuLetzterEinsatz(null, { kundeId: 42 })).toBe(null);
  });
  it("sortiert nach Datum, nicht nach Listenreihenfolge", () => {
    const verdreht = [log[2], log[1]];
    expect(gbuLetzterEinsatz(verdreht, { kundeId: 42 })?.id).toBe("passt-neu");
  });
});

describe("Was übernommen wird", () => {
  const u = gbuUebernahme(eintrag());
  it("übernimmt den wiederkehrenden Teil des Einsatzes", () => {
    expect(u.form).toMatchObject({
      arbeitsart: "baumpflege", zugang: "hubsteiger",
      einsatzort: "Lich, Kirchplatz 2", aufsichtsfuehrender: "Max M.",
      beschreibung: "Kronenpflege", baum: "1 Bergahorn, Vorgarten", besonderheiten: "Zaun aus Glas",
      stromEntfernung: "8 m", kommunikationsart: "Zuruf", verkehrssicherungsart: "Warnkleidung",
    });
    expect(u.form.arbeiten).toEqual(["Totholz entfernen"]);
    expect(u.personal).toEqual([{ name: "Max M.", quals: ["AS-Baum I"] }, { name: "Jan K.", quals: [] }]);
    expect(u.baumdaten.baumart).toBe("Bergahorn");
  });
  it("übernimmt NICHT das Wetter — das ist der Kern der Beurteilung vor Ort", () => {
    expect(u.form.niederschlag).toBeUndefined();
    expect(u.form.wind).toBeUndefined();
  });
  it("übernimmt NICHT Uhrzeit, Unterschriften, Id oder Zeitstempel", () => {
    for (const k of ["dauerVon", "dauerBis", "id", "createdAt", "sigDurchfuehrender", "sigZweitePerson", "uploadedPl", "uploadedDolibarr"]) {
      expect(u.form[k]).toBeUndefined();
    }
    expect(u.sigDurchfuehrender).toBeUndefined();
  });
  it("übernimmt die abgehakte Checkliste, aber keinen gemeldeten Mangel", () => {
    // Ein „ok" von letzter Woche darf man mit einem Blick bestätigen. Ein
    // Mangel ist dagegen ein Zustand, der behoben sein kann oder auch nicht —
    // der muss neu beurteilt werden, sonst schleppt ihn die Kopie mit.
    expect(u.items["grund:psa"]).toEqual({ status: "ok" });
    expect(u.items["grund:wetter"]).toBeUndefined();
  });
  it("verträgt einen halbleeren Eintrag", () => {
    const u2 = gbuUebernahme({ kunde: { id: 1 } });
    expect(u2.form.arbeitsart).toBe("");
    expect(u2.personal).toEqual([]);
    expect(u2.items).toEqual({});
    expect(u2.baumdaten).toBe(null);
  });
  it("nichts rein, nichts raus", () => {
    expect(gbuUebernahme(null)).toBe(null);
  });
});

describe("Suche über Kunden und Verantwortliche", () => {
  const kunden = [
    { id: 1, name: "Müller GmbH" },
    { id: 2, name: "Stadt Musterstadt — Bauhof" },
    { id: 3, name: "Mueller & Sohn" },
    { id: 4, nom: "Gärtnerei Schmitt" },
  ];
  it("leere Suche liefert alles (die Liste bleibt bedienbar)", () => {
    expect(gbuSuche(kunden, "")).toHaveLength(4);
    expect(gbuSuche(kunden, "   ")).toHaveLength(4);
  });
  it("findet unabhängig von Groß-/Kleinschreibung", () => {
    expect(gbuSuche(kunden, "müller").map((k) => k.id)).toEqual([1]);
  });
  it("Umlaute und ihre Umschrift finden einander — auf dem Handy tippt niemand ue", () => {
    expect(gbuSuche(kunden, "mueller").map((k) => k.id)).toEqual([1, 3]);
    expect(gbuSuche(kunden, "müller").map((k) => k.id)).toEqual([1]);
    expect(gbuSuche(kunden, "gartnerei").map((k) => k.id)).toEqual([4]);
  });
  it("sucht in der Mitte des Namens, nicht nur am Anfang", () => {
    expect(gbuSuche(kunden, "bauhof").map((k) => k.id)).toEqual([2]);
  });
  it("mehrere Wörter müssen alle vorkommen, Reihenfolge egal", () => {
    expect(gbuSuche(kunden, "bauhof musterstadt").map((k) => k.id)).toEqual([2]);
    expect(gbuSuche(kunden, "bauhof giessen")).toEqual([]);
  });
  it("kommt mit Personen (name/login) genauso klar", () => {
    const personen = [{ login: "max", name: "Max Muster" }, { login: "jk", name: "Jan Krüger" }];
    expect(gbuSuche(personen, "krueger").map((p) => p.login)).toEqual(["jk"]);
    expect(gbuSuche(personen, "max").map((p) => p.login)).toEqual(["max"]);
  });
  it("verträgt Müll", () => {
    expect(gbuSuche(null, "x")).toEqual([]);
    expect(gbuSuche([null, { name: "Da" }], "da")).toHaveLength(1);
  });
});

// ── Verdrahtung im Formular ─────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const funktion = (name) => {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error("Funktion fehlt: " + name);
  const b = src.indexOf("\nfunction ", a + 10);
  return src.slice(a, b < 0 ? src.length : b);
};

describe("Suche und Übernahme im GBU-Formular", () => {
  const form = funktion("GbuForm");
  it("Kunde wird gesucht, nicht mehr durch eine lange Liste gescrollt", () => {
    expect(form).toMatch(/<SuchAuswahl/);
    expect(form).not.toMatch(/— Kunde wählen —/);
    expect(src).toMatch(/function SuchAuswahl\(/);
    expect(funktion("SuchAuswahl")).toMatch(/gbuSuche\(/);
  });
  it("Aufsichtsführende(r) und Personal bekommen dieselbe Suche über die Dolibarr-Benutzer", () => {
    expect(form).toMatch(/ewPersonen\(/);
    // Zweimal Personen-Suche: Aufsichtsführende(r) und jede Personal-Zeile.
    expect((form.match(/personen=\{personen\}/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it("bietet die Übernahme vom letzten Einsatz beim selben Kunden an", () => {
    expect(form).toMatch(/gbuLetzterEinsatz\(/);
    expect(form).toMatch(/gbuUebernahme\(/);
    expect(form).toMatch(/Vom letzten Einsatz übernehmen/);
  });
  it("sagt dazu, was bewusst NICHT übernommen wird", () => {
    expect(form).toMatch(/Wetter/);
    expect(form).toMatch(/Unterschrift/);
  });
});
