// Die Abfrage an Paperless ist der Punkt, an dem aus „zeig mir die
// Prüfprotokolle" entweder genau die Prüfprotokolle werden — oder das halbe
// Archiv. `tags__id__all` verknüpft UND; ein Komma zu viel oder ein OR-Filter
// und in der Liste stehen fremde Unterlagen.
import { describe, expect, it } from "vitest";
import {
  PL_THEMA, PL_THEMA_UNTERWEISUNG, plDuplikat, plKurz, plListeQuery, plPruefsummeQuery, sha256Hex,
} from "../../src/paperless.js";

describe("plListeQuery", () => {
  it("verknüpft alle Schlagworte UND, nicht ODER", () => {
    expect(plListeQuery([173, 193])).toContain("tags__id__all=173,193");
  });

  it("sortiert neueste zuerst nach Dokumentdatum, nicht nach Ablagedatum", () => {
    expect(plListeQuery([173, 193])).toContain("ordering=-created");
  });

  it("holt genug für eine Übersicht auf einmal", () => {
    expect(plListeQuery([173])).toContain("page_size=100");
  });

  it("schließt ohne ohneIds gar nichts aus (Befund 3, unverändertes Verhalten)", () => {
    expect(plListeQuery([173])).not.toContain("tags__id__none");
    expect(plListeQuery([173], [])).not.toContain("tags__id__none");
  });

  it("schließt mit ohneIds die genannten Schlagworte per tags__id__none aus", () => {
    expect(plListeQuery([173], [9])).toContain("tags__id__none=9");
    expect(plListeQuery([173], [9, 21])).toContain("tags__id__none=9,21");
  });
});

describe("Befund 1: Thema-Whitelist darf Unterweisung nicht mit öffnen", () => {
  it("PL_THEMA_UNTERWEISUNG ist kein Wert von PL_THEMA", () => {
    // Sonst würde die server.mjs-Whitelist (new Set(Object.values(PL_THEMA)))
    // ausgerechnet das Schlagwort wieder als `thema` erlauben, das Befund 3
    // aus der Grundlagen-Liste heraushalten soll — der Fix von Befund 3 wäre
    // über /api/pl/list?thema=Thema/Unterweisung sofort wieder umgangen.
    expect(Object.values(PL_THEMA)).not.toContain(PL_THEMA_UNTERWEISUNG);
  });

  it("nennt genau die vier Themen, die die App wirklich benutzt", () => {
    expect(Object.values(PL_THEMA).sort()).toEqual([
      "Thema/Betriebsdokument", "Thema/Gefährdungsbeurteilung",
      "Thema/Prüfprotokoll", "Thema/Arbeitsschutz",
    ].sort());
  });
});

describe("plPruefsummeQuery", () => {
  it("fragt die Prüfsumme unabhängig von Groß- und Kleinschreibung ab", () => {
    expect(plPruefsummeQuery("AbC123")).toBe("checksum__iexact=AbC123&page_size=1");
  });
});

describe("plDuplikat", () => {
  it("meldet den vorhandenen Treffer mit Titel", () => {
    const a = { count: 1, results: [{ id: 42, title: "Police 2026" }] };
    expect(plDuplikat(a)).toEqual({ id: 42, titel: "Police 2026" });
  });

  it("kein Treffer heißt: darf hochgeladen werden", () => {
    expect(plDuplikat({ count: 0, results: [] })).toBeNull();
    expect(plDuplikat(null)).toBeNull();
  });

  it("kaputte Antwort ohne results-Feld lehnt ab", () => {
    expect(() => plDuplikat({})).toThrow();
    expect(() => plDuplikat({ results: "nicht-array" })).toThrow();
  });
});

describe("plKurz", () => {
  it("holt das Gültig-bis aus dem richtigen Zusatzfeld", () => {
    const doc = {
      id: 7, title: "Betriebshaftpflicht", created: "2026-01-05",
      custom_fields: [{ field: 3, value: "egal" }, { field: 1, value: "2027-01-04" }],
    };
    expect(plKurz(doc, 1)).toEqual({
      id: 7, titel: "Betriebshaftpflicht", datum: "2026-01-05", gueltigBis: "2027-01-04",
    });
  });

  it("kommt ohne Zusatzfeld aus", () => {
    const doc = { id: 8, title: "Gewerbeschein", created: "2025-03-01T00:00:00+01:00" };
    expect(plKurz(doc, 1)).toEqual({
      id: 8, titel: "Gewerbeschein", datum: "2025-03-01", gueltigBis: "",
    });
  });
});

describe("PL_THEMA", () => {
  it("nennt die Schlagworte genau so, wie sie im Archiv heißen", () => {
    expect(PL_THEMA.pruefprotokoll).toBe("Thema/Prüfprotokoll");
    expect(PL_THEMA.betriebsdokument).toBe("Thema/Betriebsdokument");
    expect(PL_THEMA.gbu).toBe("Thema/Gefährdungsbeurteilung");
    expect(PL_THEMA.arbeitsschutz).toBe("Thema/Arbeitsschutz");
  });
});

describe("sha256Hex", () => {
  it("berechnet SHA256 und gibt das Ergebnis als zweistellige Hex aus", async () => {
    expect(await sha256Hex(new Blob([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
