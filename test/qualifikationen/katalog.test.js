// test/qualifikationen/katalog.test.js
// Kletter- und Saegequalifikationen (ETW, ETT, Fachagrarwirt) und Erinnerung
// an fehlende Pflichtnachweise (Task 12, 18.09.2026).
//
// Ursprünglich wortgleich zum Task-Brief (Step 2) übernommen, der brief hatte
// dort noch "as-baum-3" verlangt — Recherche ergab keine belegte dritte
// DGUV-214-059-Stufe, Max hat entschieden: wieder raus (Fix-Runde,
// 18.09.2026), siehe Katalog-Test unten. Recherche/Quellen stehen in den
// Kommentaren bei QUALI_ARTEN (qualifikationen-data.js) und
// QUALI_PFLICHT/qualErsthelferBedarf/qualG41Hinweis (qualifikationen.js),
// Zusammenfassung im Bericht.
import { describe, expect, it } from "vitest";
import { QUALI_ARTEN, QUALI_SKT } from "../../src/qualifikationen-data.js";
import { qualErsthelferBedarf, qualFehlende } from "../../src/qualifikationen.js";

const id = (x) => QUALI_ARTEN.find((a) => a.id === x);

describe("Katalog", () => {
  it("kennt die Baumpflege-Abschlüsse", () => {
    // Der Brief nannte hier ursprünglich auch "as-baum-3" — Recherche ergab
    // keine belegte dritte DGUV-214-059-Stufe (nur Modul A+B = "AS Baum I",
    // Modul C+D = "AS Baum II"). Max hat entschieden: wieder raus, siehe
    // "es gibt bewusst nur zwei Sägestufen" unten und den Kommentar in
    // qualifikationen-data.js.
    for (const x of ["etw", "ett", "fachagrarwirt"]) expect(id(x), x).toBeTruthy();
  });
  it("es gibt bewusst nur zwei Sägestufen (AS Baum I und II) — kein 'as-baum-3'", () => {
    // Quelle: DGUV Information 214-059 "Ausbildung für Arbeiten mit der
    // Motorsäge und die Durchführung von Baumarbeiten"
    // (https://publikationen.dguv.de/widgets/pdf/download/article/1296, per
    // pdftotext selbst durchsucht) kennt nur Modul A+B (marktüblich
    // "AS Baum I") und Modul C+D (marktüblich "AS Baum II") — keine dritte
    // Stufe, auch bei rund 15 Ausbildungsanbietern kein Treffer (Stand
    // 18.09.2026, Fix-Runde Task 12). Diese Prüfung soll verhindern, dass
    // eine künftige Sitzung "AS Baum III" aus Versehen wieder erfindet.
    expect(id("as-baum-3")).toBeFalsy();
    expect(QUALI_ARTEN.filter((a) => a.id.startsWith("as-baum")).map((a) => a.id).sort()).toEqual(["as-baum-1", "as-baum-2"]);
  });
  it("befristete Nachweise tragen eine Frist, unbefristete nicht", () => {
    expect(id("etw").monate).toBeGreaterThan(0);
    expect(id("skt-a").monate).toBe(null);
  });
  it("die Rangfolge bleibt eindeutig", () => {
    const raenge = QUALI_ARTEN.filter((a) => a.rang > 0).map((a) => a.rang);
    expect(new Set(raenge).size).toBe(raenge.length);
  });
  it("bestehende Kennungen bleiben unverändert", () => {
    for (const x of ["skt-a", "skt-b", "as-baum-1", "as-baum-2", "erste-hilfe", "g41"]) expect(id(x), x).toBeTruthy();
    expect(QUALI_SKT).toEqual(["skt-a", "skt-b"]);
  });
});

describe("Fehlende Pflichtnachweise", () => {
  const person = (name, quals) => ({ name, quals });
  const store = { version: 1, personen: {
    klara: person("Klara", [{ art: "skt-a", seit: "2025-05-01" }]),
    ben: person("Ben", [{ art: "as-baum-1", seit: "2025-05-01" }, { art: "g41", seit: "2025-05-01" }]),
  } };

  it("wer klettert, braucht G 41 — fehlt er, wird erinnert", () => {
    const fehlt = qualFehlende(store, "2026-09-18");
    expect(fehlt.find((f) => f.key === "klara" && f.art === "g41")).toBeTruthy();
    expect(fehlt.find((f) => f.key === "ben" && f.art === "g41")).toBeFalsy();
  });

  it("Ersthelfer zählt als Betriebsquote, nicht pro Person", () => {
    const bedarf = qualErsthelferBedarf(store, "2026-09-18");
    expect(bedarf.ist).toBe(0);
    expect(bedarf.soll).toBeGreaterThan(0);
    expect(qualFehlende(store, "2026-09-18").filter((f) => f.art === "erste-hilfe").length).toBe(0);
  });
});
