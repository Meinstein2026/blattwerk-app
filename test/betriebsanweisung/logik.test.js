import { describe, expect, it } from "vitest";
import {
  BA_ABSCHNITTE_IDS, BA_UW_STORE_LEER,
  baAbschnitte, baArt, baDateiname, baErstellen, baUwEintragen, baUwFaelligkeiten,
  baUwLetzte, baUwNorm, baUwPruefen, baUwStatus, baUwUebersicht, baUwUid, baVariante,
} from "../../src/betriebsanweisung.js";

describe("baVariante", () => {
  it("explizites motorsaege gewinnt immer", () => {
    expect(baVariante("boden", "maehen", { motorsaege: true })).toBe("skt-b");
    expect(baVariante("skt", "baumpflege", { motorsaege: false })).toBe("skt-a");
  });

  it("ohne SKT-Zugang gibt es keine Betriebsanweisung (nichts erfinden)", () => {
    expect(baVariante("leiter", "baumpflege")).toBeNull();
    expect(baVariante("buehne", "faellung")).toBeNull();
    expect(baVariante("boden", "maehen")).toBeNull();
  });

  it("SKT + schneidende Arbeitsart -> SKT B, sonst SKT A", () => {
    expect(baVariante("skt", "baumpflege")).toBe("skt-b");
    expect(baVariante("skt", "faellung")).toBe("skt-b");
    expect(baVariante("skt", "hecke")).toBe("skt-b");
    expect(baVariante("skt", "sonstiges")).toBe("skt-a");
  });
});

describe("baAbschnitte", () => {
  it("SKT B enthält SKT A vollständig plus Zusatz (Grundlage bildet SKT A)", () => {
    const a = baAbschnitte("skt-a"), b = baAbschnitte("skt-b");
    for (const s of a.schutzmassnahmen) expect(b.schutzmassnahmen).toContain(s);
    expect(b.schutzmassnahmen.length).toBeGreaterThan(a.schutzmassnahmen.length);
  });

  it("Störungen/Erste-Hilfe/Instandhaltung sind für beide Fassungen identisch", () => {
    const a = baAbschnitte("skt-a"), b = baAbschnitte("skt-b");
    expect(a.stoerungen).toEqual(b.stoerungen);
    expect(a.erstehilfe).toEqual(b.erstehilfe);
    expect(a.instandhaltung).toEqual(b.instandhaltung);
  });

  it("unbekannte Fassung liefert null", () => {
    expect(baAbschnitte("skt-c")).toBeNull();
  });
});

describe("baErstellen", () => {
  it("baut eine vollstaendige Anweisung", () => {
    const ba = baErstellen({ variante: "skt-b", betrieb: "Blattwerk GbR", einsatzort: "Musterstraße 1", ersteller: "Max Muster", heute: "2026-09-18" });
    expect(ba.titel).toMatch(/SKT B/);
    expect(ba.abschnitte.gefahren.length).toBeGreaterThan(0);
    expect(ba.dateiname).toMatch(/^Betriebsanweisung_.*2026-09-18.*\.pdf$/);
  });

  it("wirft bei unbekannter Fassung", () => {
    expect(() => baErstellen({ variante: "x", heute: "2026-09-18" })).toThrow(/Unbekannte Fassung/);
  });

  it("wirft bei kaputtem Datum", () => {
    expect(() => baErstellen({ variante: "skt-a", heute: "18.09.2026" })).toThrow(/Datum/);
  });
});

describe("baDateiname", () => {
  it("traegt Datum und Einsatzort, ohne Sonderzeichen", () => {
    const n = baDateiname("skt-a", "2026-09-18", "Grüner Weg 3, Gießen");
    expect(n).not.toMatch(/[ä ö ü ß]/i);
    expect(n).toMatch(/^Betriebsanweisung_.*2026-09-18.*Gruener-Weg.*\.pdf$/);
  });
});

describe("baUwPruefen — die vier Pflichtangaben (Ort, Zeitpunkt, Inhalt, Teilnahme)", () => {
  const gueltig = {
    login: "tom", name: "Tom Aushilfe", datum: "2026-09-18", ort: "Musterstraße 1",
    variante: "skt-a", einweiser: "Max Muster", einweiserQualifikation: "SKT B",
    abschnitte: [...BA_ABSCHNITTE_IDS],
  };
  it("laesst eine vollstaendige Unterweisung durch", () => {
    expect(baUwPruefen(gueltig, "2026-09-18")).toBeNull();
  });
  it("verlangt den Ort", () => {
    expect(baUwPruefen({ ...gueltig, ort: "" }, "2026-09-18")).toMatch(/Ort/);
  });
  it("verlangt ein gueltiges Datum, nicht in der Zukunft", () => {
    expect(baUwPruefen({ ...gueltig, datum: "18.09.2026" }, "2026-09-18")).toMatch(/Datum/);
    expect(baUwPruefen({ ...gueltig, datum: "2026-09-19" }, "2026-09-18")).toMatch(/Zukunft/);
  });
  it("verlangt alle sechs Abschnitte bestaetigt", () => {
    expect(baUwPruefen({ ...gueltig, abschnitte: ["anwendungsbereich"] }, "2026-09-18")).toMatch(/Nicht alle Abschnitte/);
  });
  it("verlangt Name und Qualifikation der unterweisenden Person", () => {
    expect(baUwPruefen({ ...gueltig, einweiser: "" }, "2026-09-18")).toMatch(/unterweisenden Person/);
    expect(baUwPruefen({ ...gueltig, einweiserQualifikation: "" }, "2026-09-18")).toMatch(/Qualifikation/);
  });
  it("verlangt eine bekannte Betriebsanweisung als Gegenstand", () => {
    expect(baUwPruefen({ ...gueltig, variante: "skt-c" }, "2026-09-18")).toMatch(/Betriebsanweisung/);
  });
});

describe("baUwEintragen — additiv", () => {
  const eintrag = {
    login: "tom", name: "Tom Aushilfe", datum: "2026-09-18", ort: "Musterstraße 1",
    variante: "skt-a", einweiser: "Max Muster", einweiserQualifikation: "SKT B",
    abschnitte: [...BA_ABSCHNITTE_IDS],
  };
  it("haengt an, statt zu ersetzen", () => {
    const s1 = baUwEintragen(BA_UW_STORE_LEER, eintrag, { heute: "2026-09-18" });
    expect(s1.eintraege).toHaveLength(1);
    const s2 = baUwEintragen(s1, { ...eintrag, datum: "2027-01-01" }, { heute: "2027-01-01" });
    expect(s2.eintraege).toHaveLength(2);
    expect(s1.eintraege).toHaveLength(1); // s1 bleibt unveraendert (rein)
  });

  it("wirft bei ungueltiger Unterweisung, ohne den Store zu aendern", () => {
    expect(() => baUwEintragen(BA_UW_STORE_LEER, { ...eintrag, ort: "" }, { heute: "2026-09-18" })).toThrow(/Ort/);
  });

  it("normalisiert einen kaputten Store statt zu werfen", () => {
    const s = baUwEintragen({ irgendwas: 1 }, eintrag, { heute: "2026-09-18" });
    expect(s.eintraege).toHaveLength(1);
  });
});

describe("baUwLetzte / baUwStatus / Faelligkeiten", () => {
  const basis = { ort: "X", variante: "skt-a", einweiser: "Max", einweiserQualifikation: "SKT B", abschnitte: [...BA_ABSCHNITTE_IDS] };
  it("findet den juengsten Eintrag einer Person", () => {
    let s = baUwEintragen(BA_UW_STORE_LEER, { ...basis, login: "anna", name: "Anna", datum: "2025-01-01" }, { heute: "2025-01-01" });
    s = baUwEintragen(s, { ...basis, login: "anna", name: "Anna", datum: "2026-06-01" }, { heute: "2026-06-01" });
    const letzte = baUwLetzte(s.eintraege, "anna");
    expect(letzte.datum).toBe("2026-06-01");
  });

  it("Status: fehlt ohne Eintrag, gueltig kurz danach, ueberfaellig nach einem Jahr", () => {
    expect(baUwStatus(null, "2026-09-18").stufe).toBe("fehlt");
    const s = baUwEintragen(BA_UW_STORE_LEER, { ...basis, login: "tom", name: "Tom", datum: "2026-09-18" }, { heute: "2026-09-18" });
    const letzte = baUwLetzte(s.eintraege, "tom");
    expect(baUwStatus(letzte, "2026-09-19").stufe).toBe("gueltig");
    expect(baUwStatus(letzte, "2027-10-01").stufe).toBe("ueberfaellig");
  });

  it("Jugendliche: Wiederholung halbjaehrlich, nicht jaehrlich", () => {
    const s = baUwEintragen(BA_UW_STORE_LEER, { ...basis, login: "jule", name: "Jule", datum: "2026-01-01", jugendlich: true }, { heute: "2026-01-01" });
    const letzte = baUwLetzte(s.eintraege, "jule");
    expect(baUwStatus(letzte, "2026-08-01").stufe).toBe("ueberfaellig"); // > 6 Monate
  });

  it("baUwUebersicht listet alle Personen mit Status, dringendste zuerst", () => {
    let s = baUwEintragen(BA_UW_STORE_LEER, { ...basis, login: "alt", name: "Alt", datum: "2025-01-01" }, { heute: "2025-01-01" });
    s = baUwEintragen(s, { ...basis, login: "neu", name: "Neu", datum: "2026-09-01" }, { heute: "2026-09-01" });
    const u = baUwUebersicht(s, "2026-09-18");
    expect(u.map((p) => p.login)).toEqual(["alt", "neu"]);
    expect(u[0].status.stufe).toBe("ueberfaellig");
  });

  it("baUwFaelligkeiten meldet nur bald/ueberfaellig", () => {
    let s = baUwEintragen(BA_UW_STORE_LEER, { ...basis, login: "alt", name: "Alt", datum: "2025-01-01" }, { heute: "2025-01-01" });
    s = baUwEintragen(s, { ...basis, login: "frisch", name: "Frisch", datum: "2026-09-01" }, { heute: "2026-09-01" });
    const f = baUwFaelligkeiten(s, "2026-09-18");
    expect(f.map((x) => x.login)).toEqual(["alt"]);
  });
});

describe("baUwUid", () => {
  it("ist stabil je Person, unabhaengig von der Fassung", () => {
    expect(baUwUid("Tom")).toBe(baUwUid("tom"));
    expect(baUwUid("tom")).toMatch(/^blattwerk-unterweisung-tom@blattwerk$/);
  });
});

describe("baUwNorm", () => {
  it("liefert eine leere Liste fuer kaputte/leere Stores", () => {
    expect(baUwNorm(null).eintraege).toEqual([]);
    expect(baUwNorm({}).eintraege).toEqual([]);
    expect(baUwNorm({ eintraege: "x" }).eintraege).toEqual([]);
  });
});

describe("baArt", () => {
  it("findet SKT A/B, sonst null", () => {
    expect(baArt("skt-a")?.label).toMatch(/SKT A/);
    expect(baArt("nix")).toBeNull();
  });
});
