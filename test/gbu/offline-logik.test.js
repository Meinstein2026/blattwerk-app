// test/gbu/offline-logik.test.js
// Reine Logik der Offline-GBU (src/gbu-offline.js): welche lokalen PDFs
// verworfen werden, wer an einer Beurteilung beteiligt ist (fuer die
// automatische Weitergabe mit Netz), und das 30-Tage-Fenster von
// /api/nc/gbu/meine. Von App UND server.mjs-Fachmodul importiert (gleiches
// Muster wie src/arbeitsschutz.js), deshalb hier ohne jeden DOM-/Netzzugriff
// geprueft.
import { describe, expect, it } from "vitest";
import {
  GBU_BETEILIGTE_STORE_LEER, gbuBeteiligteNorm, gbuBeteiligteSchluessel,
  gbuBeteiligtenEintragen, gbuMeineFilter, gbuPdfUeberzaehlige,
} from "../../src/gbu-offline.js";

describe("gbuPdfUeberzaehlige: nur die neuesten N behalten", () => {
  it("laesst eine kurze Liste unangetastet", () => {
    const e = [{ schluessel: "a", zeit: 1 }, { schluessel: "b", zeit: 2 }];
    expect(gbuPdfUeberzaehlige(e, 20)).toEqual([]);
  });
  it("verwirft die aeltesten, behaelt die neuesten max", () => {
    const e = Array.from({ length: 5 }, (_, i) => ({ schluessel: String(i), zeit: i }));
    // zeit 0..4, max 3 -> behalten 2,3,4 -> verwerfen 0,1
    expect(gbuPdfUeberzaehlige(e, 3).sort()).toEqual(["0", "1"]);
  });
  it("ist unabhaengig von der Eingabereihenfolge", () => {
    const e = [{ schluessel: "spaet", zeit: 300 }, { schluessel: "frueh", zeit: 100 }, { schluessel: "mitte", zeit: 200 }];
    expect(gbuPdfUeberzaehlige(e, 2)).toEqual(["frueh"]);
  });
  it("funktioniert mit fremden Schluessel-Formen (kein 'gbu-<epoch>')", () => {
    const e = [{ schluessel: "foto-baum-7", zeit: 5 }, { schluessel: "empf-xyz", zeit: 9 }];
    expect(gbuPdfUeberzaehlige(e, 1)).toEqual(["foto-baum-7"]);
  });
});

describe("gbuBeteiligteSchluessel: wer soll die Beurteilung automatisch bekommen", () => {
  it("nimmt die anwesende Mannschaft (personal[].key) und den Ersteller", () => {
    const record = { personal: [{ key: "anna", name: "Anna" }, { key: "tom", name: "Tom" }], kopf: { aufsicht: "Anna" } };
    expect(gbuBeteiligteSchluessel(record, "mika").sort()).toEqual(["anna", "mika", "tom"]);
  });
  it("dedupliziert, wenn Ersteller = aufsichtsfuehrende Person = anwesend", () => {
    const record = { personal: [{ key: "anna", name: "Anna" }], kopf: { aufsicht: "Anna" } };
    expect(gbuBeteiligteSchluessel(record, "anna")).toEqual(["anna"]);
  });
  it("Aushilfen ohne Login (key: '') tauchen nicht auf", () => {
    const record = { personal: [{ key: "", name: "Aushilfe Kurt" }], kopf: { aufsicht: "" } };
    expect(gbuBeteiligteSchluessel(record, "mika")).toEqual(["mika"]);
  });
  it("loest die aufsichtsfuehrende Person ueber den Namen auf, wenn sie nicht in personal[] steht (Freitext-Aufsicht)", () => {
    const record = { personal: [{ key: "tom", name: "Tom" }, { key: "anna", name: "Anna" }], kopf: { aufsicht: "anna" } };
    expect(gbuBeteiligteSchluessel(record, "mika").sort()).toEqual(["anna", "mika", "tom"]);
  });
  it("erfindet keinen Schluessel, wenn der Name zu keinem Personal-Eintrag passt", () => {
    const record = { personal: [{ key: "tom", name: "Tom" }], kopf: { aufsicht: "Jemand ganz anderes" } };
    expect(gbuBeteiligteSchluessel(record, "mika").sort()).toEqual(["mika", "tom"]);
  });
  it("versteht auch die alte v2-Form (aufsichtsfuehrender statt kopf.aufsicht)", () => {
    const record = { personal: [{ key: "tom", name: "Tom" }], aufsichtsfuehrender: "Tom" };
    expect(gbuBeteiligteSchluessel(record, "mika").sort()).toEqual(["mika", "tom"]);
  });
  it("ohne Ersteller-Login bleibt die Mannschaft trotzdem vollstaendig", () => {
    const record = { personal: [{ key: "tom", name: "Tom" }], kopf: {} };
    expect(gbuBeteiligteSchluessel(record, "")).toEqual(["tom"]);
  });
});

describe("gbuBeteiligtenEintragen: additiver Store, nach Pruefsumme zusammengefuehrt", () => {
  it("legt einen neuen Eintrag an", () => {
    const s = gbuBeteiligtenEintragen(GBU_BETEILIGTE_STORE_LEER, { filename: "a.pdf", sha256: "aa", datum: "2026-09-01", beteiligte: ["tom"] }, "2026-09-01");
    expect(s.eintraege).toHaveLength(1);
    expect(s.eintraege[0]).toMatchObject({ filename: "a.pdf", sha256: "aa", datum: "2026-09-01", beteiligte: ["tom"] });
  });
  it("dieselbe Pruefsumme (Wiederholung nach verlorener Antwort) vereint statt zu duplizieren", () => {
    let s = gbuBeteiligtenEintragen(GBU_BETEILIGTE_STORE_LEER, { filename: "a.pdf", sha256: "aa", datum: "2026-09-01", beteiligte: ["tom"] }, "2026-09-01");
    s = gbuBeteiligtenEintragen(s, { filename: "a.pdf", sha256: "aa", datum: "2026-09-01", beteiligte: ["anna"] }, "2026-09-01");
    expect(s.eintraege).toHaveLength(1);
    expect(s.eintraege[0].beteiligte.sort()).toEqual(["anna", "tom"]);
  });
  it("raeumt Eintraege auf, die aelter als 45 Tage sind", () => {
    const alt = { version: 1, eintraege: [{ filename: "alt.pdf", sha256: "bb", datum: "2026-01-01", beteiligte: ["tom"] }] };
    const s = gbuBeteiligtenEintragen(alt, { filename: "neu.pdf", sha256: "cc", datum: "2026-09-01", beteiligte: ["anna"] }, "2026-09-01");
    expect(s.eintraege.map((e) => e.filename)).toEqual(["neu.pdf"]);
  });
});

describe("gbuBeteiligteNorm: fehlerhafte/fehlende Dateien werden zu einem leeren Store", () => {
  it("normalisiert null/undefined", () => {
    expect(gbuBeteiligteNorm(null)).toEqual(GBU_BETEILIGTE_STORE_LEER);
  });
  it("verwirft Eintraege ohne beteiligte", () => {
    expect(gbuBeteiligteNorm({ eintraege: [{ filename: "x" }] }).eintraege).toEqual([]);
  });
});

describe("gbuMeineFilter: 30-Tage-Fenster je Login", () => {
  const eintraege = [
    { filename: "a.pdf", sha256: "aa", datum: "2026-09-10", beteiligte: ["tom", "anna"] },
    { filename: "b.pdf", sha256: "bb", datum: "2026-08-01", beteiligte: ["tom"] }, // > 30 Tage vor dem 18.09.
    { filename: "c.pdf", sha256: "cc", datum: "2026-09-15", beteiligte: ["anna"] },
  ];
  it("nur Eintraege des gefragten Logins, innerhalb von 30 Tagen", () => {
    expect(gbuMeineFilter(eintraege, "tom", "2026-09-18", 30).map((e) => e.filename)).toEqual(["a.pdf"]);
  });
  it("ein anderer Login sieht seine eigenen Eintraege", () => {
    expect(gbuMeineFilter(eintraege, "anna", "2026-09-18", 30).map((e) => e.filename)).toEqual(["a.pdf", "c.pdf"]);
  });
  it("kein Treffer bleibt eine leere Liste, kein Fehler", () => {
    expect(gbuMeineFilter(eintraege, "unbekannt", "2026-09-18", 30)).toEqual([]);
  });
});
