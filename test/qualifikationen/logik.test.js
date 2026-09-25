// test/qualifikationen/logik.test.js
// Qualifikationen und Fortbildungen je Person (Teilprojekt A, 16.09.2026).
//
// Die App kannte Qualifikationen bislang nur als Chips je GBU
// (`GBU_QUALIFIKATIONEN`), ohne Datum und ohne Person. Dieses Modul rechnet,
// wer wann welche Fortbildung hat, wer die Aufsicht fuehrt und was ablaeuft.
// Stufen heissen wie im Arbeitsschutz (`EW_STUFEN_TEXT`), damit Farbe und
// Wortlaut dort weiterbenutzt werden.
import { describe, expect, it } from "vitest";
import { QUALI_ARTEN, QUALI_AS_BAUM, QUALI_SKT } from "../../src/qualifikationen-data.js";
import {
  QUALI_STORE, QUALI_STORE_LEER, QUALI_VORWARNUNG_TAGE, QUALI_DOLIBARR_EXTRAFELDER, QUALI_PFLICHT,
  qualArt, qualAufsicht, qualDateiname, qualDolibarrFelder, qualEintragen, qualErsthelferBedarf, qualFaelligkeiten, qualFehlende, qualG41Hinweis, qualGueltig, qualGueltigBis, qualHoechste, qualKeyOk, qualLetzte, qualNorm, qualPersonalcheck, qualPruefen, qualSlug, qualStatus, qualUid,
  qualiKeyAusLogin, qualiPersonenVereinen,
} from "../../src/qualifikationen.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const HEUTE = "2026-09-16";
const q = (o = {}) => ({ id: "q-1", art: "erste-hilfe", seit: "2025-01-10", gueltigBis: null, stelle: "DRK", nachweis: "", erfasstAm: "2025-01-10T10:00:00.000Z", erfasstVon: "max", ...o });
const person = (quals = [], o = {}) => ({ name: "Sebastian Vogel", dolibarrId: 7, mobil: "", jugendlich: false, quals, ...o });

describe("Katalog", () => {
  it("bildet die neun Arten der ersten Fassung unverändert an erster Stelle ab", () => {
    // QualifikationenTab.jsx (ausserhalb des Task-12-Scopes) nimmt
    // QUALI_ARTEN[0] als Formular-Vorbelegung und Fallback-Art — die neuen
    // Eintraege aus Task 12 muessen deshalb HINTEN angehaengt sein, sonst
    // aendert sich Blattwerks Standardauswahl stillschweigend.
    expect(QUALI_ARTEN.slice(0, 9).map((a) => a.id)).toEqual([
      "skt-b", "skt-a", "as-baum-2", "as-baum-1", "hubarbeitsbuehne",
      "erste-hilfe", "g41", "baumkontrolleur", "psa-sachkunde",
    ]);
    expect(QUALI_ARTEN[0].id).toBe("skt-b");
  });

  it("haengt die Kletter-/Saegeabschluesse aus Task 12 hinten an, ohne Aufsichtsrang", () => {
    // rang: 0 ist Absicht (siehe Kommentar bei QUALI_ARTEN in
    // qualifikationen-data.js): diese drei duerfen qualAufsicht/qualHoechste
    // nicht beeinflussen, sonst koennte jemand allein durch einen
    // Fachagrarwirt-Abschluss faelschlich als aufsichtsfuehrend erscheinen,
    // ohne eine gueltige SKT-Eintragung zu haben.
    for (const x of ["etw", "ett", "fachagrarwirt"]) {
      const a = QUALI_ARTEN.find((v) => v.id === x);
      expect(a, x).toBeTruthy();
      expect(a.rang, x).toBe(0);
    }
  });

  it("es gibt bewusst nur zwei Saegestufen — kein 'as-baum-3' (Fix-Runde Task 12, 18.09.2026)", () => {
    // Der urspruengliche Brief verlangte hier eine dritte Stufe; Recherche
    // (DGUV Information 214-059, per pdftotext selbst durchsucht, plus rund
    // 15 Ausbildungsanbieter) fand keine belegte dritte Stufe — nur Modul
    // A+B (marktueblich "AS Baum I") und Modul C+D (marktueblich
    // "AS Baum II"). Max hat entschieden: wieder raus. Diese Pruefung
    // verhindert, dass eine kuenftige Sitzung sie ohne neue Quelle wieder
    // erfindet.
    expect(QUALI_ARTEN.find((a) => a.id === "as-baum-3")).toBeUndefined();
    expect(QUALI_ARTEN.filter((a) => a.id.startsWith("as-baum")).map((a) => a.id).sort()).toEqual(["as-baum-1", "as-baum-2"]);
  });

  it("vergibt jede Kennung nur einmal", () => {
    expect(new Set(QUALI_ARTEN.map((a) => a.id)).size).toBe(QUALI_ARTEN.length);
  });

  it("kennt Rang und Gültigkeit je Art", () => {
    const art = Object.fromEntries(QUALI_ARTEN.map((a) => [a.id, a]));
    expect(art["skt-b"].rang).toBe(100);
    expect(art["skt-a"].rang).toBe(90);
    expect(art["as-baum-2"].rang).toBe(60);
    expect(art["as-baum-1"].rang).toBe(50);
    expect(art["hubarbeitsbuehne"].rang).toBe(40);
    // Fortbildungen ohne Aufsichtsrang
    for (const id of ["erste-hilfe", "g41", "baumkontrolleur", "psa-sachkunde"]) expect(art[id].rang).toBe(0);
    // unbefristet = null, sonst Monate
    expect(art["skt-b"].monate).toBeNull();
    expect(art["erste-hilfe"].monate).toBe(24);
    expect(art["g41"].monate).toBe(36);
    expect(art["baumkontrolleur"].monate).toBe(36);
    expect(art["psa-sachkunde"].monate).toBe(12);
  });

  it("hat zu jeder Art Bezeichnung und Hinweis", () => {
    for (const a of QUALI_ARTEN) {
      expect(a.label.length).toBeGreaterThan(3);
      expect(typeof a.hinweis).toBe("string");
    }
  });

  it("gruppiert SKT und AS Baum für Aufsicht und Personalcheck", () => {
    expect(QUALI_SKT).toEqual(["skt-a", "skt-b"]);
    expect(QUALI_AS_BAUM).toEqual(["as-baum-1", "as-baum-2"]);
  });
});

describe("Store", () => {
  it("liegt unter Blattwerk/App, nicht bei den Einweisungen", () => {
    expect(QUALI_STORE(MANDANT_STANDARD)).toBe("/Blattwerk/App/qualifikationen.json");
    expect(QUALI_STORE_LEER).toEqual({ version: 1, personen: {}, letzteErinnerung: "" });
  });
  it("bekommt eine fremde Firma nie in Blattwerks Ordner geschrieben (Fix Round 1 zu Task 9)", () => {
    // Dieselbe Nextcloud fuer alle Mandanten — Trennung laeuft ueber
    // Team-Ordner/Gruppe/Dienstkonto je Firma, nicht ueber getrennte
    // Instanzen. Ein fest verdrahteter Pfad waere deshalb kein harmloser
    // 404, sondern ein Schreibversuch in Blattwerks eigenen Ordner.
    const xy = { kuerzel: "xy", name: "Baum Müller GbR", nextcloud: { ordner: "Baum Müller" } };
    expect(QUALI_STORE(xy)).toBe("/Baum%20M%C3%BCller/App/qualifikationen.json");
    expect(QUALI_STORE(xy)).not.toMatch(/Blattwerk/);
  });
  it("normalisiert einen halben Store", () => {
    const s = qualNorm({ personen: { anna: { name: "Anna" } } });
    expect(s.version).toBe(1);
    expect(s.personen.anna.quals).toEqual([]);
    expect(s.letzteErinnerung).toBe("");
    expect(qualNorm(null)).toEqual(QUALI_STORE_LEER);
  });
  it("nimmt dieselbe Vorwarnzeit wie die Einweisungen", () => {
    expect(QUALI_VORWARNUNG_TAGE).toBe(30);
  });
});

describe("qualArt", () => {
  it("findet eine Art und meldet Unbekanntes als null", () => {
    expect(qualArt("skt-b").rang).toBe(100);
    expect(qualArt("zauberkunst")).toBeNull();
    expect(qualArt(undefined)).toBeNull();
  });
});

describe("qualLetzte", () => {
  it("nimmt den jüngsten Eintrag der Art — Wiederholungen ersetzen nichts", () => {
    const p = person([q({ id: "a", seit: "2023-01-10" }), q({ id: "b", seit: "2025-01-10" }), q({ id: "c", art: "skt-a", seit: "2026-01-01" })]);
    expect(qualLetzte(p, "erste-hilfe").id).toBe("b");
    expect(qualLetzte(p, "skt-a").id).toBe("c");
    expect(qualLetzte(p, "g41")).toBeNull();
  });
  it("entscheidet bei gleichem seit nach erfasstAm", () => {
    const p = person([q({ id: "alt", erfasstAm: "2025-01-10T08:00:00.000Z" }), q({ id: "neu", erfasstAm: "2025-01-10T09:00:00.000Z" })]);
    expect(qualLetzte(p, "erste-hilfe").id).toBe("neu");
  });
  it("übergeht Einträge mit kaputtem Datum und verträgt fehlende quals", () => {
    expect(qualLetzte(person([q({ seit: "irgendwann" })]), "erste-hilfe")).toBeNull();
    expect(qualLetzte({ name: "x" }, "erste-hilfe")).toBeNull();
    expect(qualLetzte(null, "erste-hilfe")).toBeNull();
  });
});

describe("qualGueltigBis", () => {
  it("nimmt das Datum der Bescheinigung, wenn eines da ist", () => {
    expect(qualGueltigBis(q({ gueltigBis: "2027-03-01" }))).toBe("2027-03-01");
  });
  it("rechnet sonst seit + Standardmonate", () => {
    expect(qualGueltigBis(q({ seit: "2025-01-31" }))).toBe("2027-01-31");   // 24 Monate
    expect(qualGueltigBis(q({ art: "psa-sachkunde", seit: "2025-02-28" }))).toBe("2026-02-28");
  });
  it("ist bei unbefristeten Arten null", () => {
    expect(qualGueltigBis(q({ art: "skt-a" }))).toBeNull();
    expect(qualGueltigBis(q({ art: "skt-a", gueltigBis: "" }))).toBeNull();
  });
});

describe("qualStatus", () => {
  it("fehlt ohne Eintrag", () => {
    expect(qualStatus(null, HEUTE)).toEqual({ stufe: "fehlt", bis: null, tage: null });
  });
  it("ist bei unbefristeten Arten gültig, ohne Ablauf", () => {
    expect(qualStatus(q({ art: "skt-b", seit: "2020-05-05" }), HEUTE)).toEqual({ stufe: "gueltig", bis: null, tage: null });
  });
  it("gültig, läuft ab, überfällig — mit 30 Tagen Vorwarnung", () => {
    expect(qualStatus(q({ gueltigBis: "2027-01-01" }), HEUTE).stufe).toBe("gueltig");
    const bald = qualStatus(q({ gueltigBis: "2026-10-01" }), HEUTE);
    expect(bald.stufe).toBe("bald");
    expect(bald.tage).toBe(15);
    expect(bald.bis).toBe("2026-10-01");
    const ueber = qualStatus(q({ gueltigBis: "2026-09-01" }), HEUTE);
    expect(ueber.stufe).toBe("ueberfaellig");
    expect(ueber.tage).toBe(-15);
  });
  it("heute fällig zählt noch als läuft ab, nicht als überfällig", () => {
    expect(qualStatus(q({ gueltigBis: HEUTE }), HEUTE).stufe).toBe("bald");
  });
  it("meldet ein kaputtes Datum als ungueltig", () => {
    expect(qualStatus(q({ seit: "2025-13-40" }), HEUTE).stufe).toBe("ungueltig");
    expect(qualStatus(q({ gueltigBis: "bald mal" }), HEUTE).stufe).toBe("ungueltig");
  });
  it("gueltig und bald gelten als gültig, der Rest nicht", () => {
    expect(qualGueltig("gueltig")).toBe(true);
    expect(qualGueltig("bald")).toBe(true);
    for (const s of ["ueberfaellig", "fehlt", "ungueltig"]) expect(qualGueltig(s)).toBe(false);
  });
});

describe("qualAufsicht", () => {
  const skt = (id, art, seit) => q({ id, art, seit, gueltigBis: null });
  const personen = {
    basti: person([skt("1", "skt-b", "2024-03-01")], { name: "Sebastian Vogel" }),
    anna: person([skt("2", "skt-a", "2022-06-01")], { name: "Anna Beispiel" }),
    max: person([skt("3", "as-baum-1", "2021-01-01")], { name: "Max Muster" }),
    tom: person([], { name: "Tom Aushilfe" }),
  };

  it("kennt die höchste gültige Qualifikation einer Person", () => {
    expect(qualHoechste(personen.basti, HEUTE)).toEqual({ art: "skt-b", rang: 100, seit: "2024-03-01" });
    expect(qualHoechste(personen.tom, HEUTE)).toBeNull();
    // Fortbildungen ohne Rang zaehlen nicht
    expect(qualHoechste(person([q({ art: "erste-hilfe", gueltigBis: "2030-01-01" })]), HEUTE)).toBeNull();
  });

  it("wählt den höchsten Rang unter den Anwesenden", () => {
    const a = qualAufsicht(personen, ["anna", "basti", "max"], HEUTE);
    expect(a.key).toBe("basti");
    expect(a.art).toBe("skt-b");
    expect(a.grund).toMatch(/SKT B/);
  });

  it("sieht nur Anwesende", () => {
    expect(qualAufsicht(personen, ["anna", "max"], HEUTE).key).toBe("anna");
  });

  it("Gleichstand: das ältere seit gewinnt, dann alphabetisch", () => {
    const p = {
      zed: person([skt("1", "skt-a", "2020-01-01")], { name: "Zed" }),
      amy: person([skt("2", "skt-a", "2023-01-01")], { name: "Amy" }),
      bob: person([skt("3", "skt-a", "2020-01-01")], { name: "Bob" }),
    };
    expect(qualAufsicht(p, ["amy", "zed", "bob"], HEUTE).key).toBe("bob"); // zed und bob gleich alt -> alphabetisch
    expect(qualAufsicht(p, ["amy", "zed"], HEUTE).key).toBe("zed");
  });

  it("lässt abgelaufene Qualifikationen nicht zählen", () => {
    const p = {
      max: person([q({ art: "skt-b", seit: "2020-01-01", gueltigBis: "2026-01-01" })], { name: "Max" }),
      ida: person([skt("1", "as-baum-1", "2020-01-01")], { name: "Ida" }),
    };
    expect(qualAufsicht(p, ["max", "ida"], HEUTE).key).toBe("ida");
  });

  it("meldet null mit Grund, wenn niemand qualifiziert ist", () => {
    const a = qualAufsicht(personen, ["tom"], HEUTE);
    expect(a.key).toBeNull();
    expect(a.grund).toMatch(/keine gültige/i);
    expect(qualAufsicht(personen, [], HEUTE).key).toBeNull();
    expect(qualAufsicht(personen, ["unbekannt"], HEUTE).key).toBeNull();
  });
});

describe("qualPersonalcheck", () => {
  const skt = (art) => q({ art, seit: "2024-01-01", gueltigBis: null });
  const personen = {
    basti: person([skt("skt-b")]), anna: person([skt("skt-a")]),
    max: person([skt("as-baum-1")]), tom: person([]),
  };

  it("SKT braucht mindestens zwei Personen mit gültigem SKT A/B", () => {
    expect(qualPersonalcheck(personen, ["basti", "anna"], "skt", HEUTE)).toEqual({ ok: true, fehlt: [] });
    const r = qualPersonalcheck(personen, ["basti", "max"], "skt", HEUTE);
    expect(r.ok).toBe(false);
    expect(r.fehlt).toEqual(["Zweite Person mit gültigem SKT A/B (1 von 2 vor Ort)"]);
    expect(qualPersonalcheck(personen, ["tom"], "skt", HEUTE).fehlt).toEqual(["Zweite Person mit gültigem SKT A/B (0 von 2 vor Ort)"]);
  });

  it("Motorsägenarbeit vom Boden braucht eine Person mit AS Baum I", () => {
    expect(qualPersonalcheck(personen, ["max", "tom"], "boden", HEUTE)).toEqual({ ok: true, fehlt: [] });
    expect(qualPersonalcheck(personen, ["tom"], "boden", HEUTE).fehlt).toEqual(["Person mit gültigem AS Baum I"]);
    // AS Baum II setzt I voraus und zaehlt mit
    expect(qualPersonalcheck({ x: person([skt("as-baum-2")]) }, ["x"], "leiter", HEUTE).ok).toBe(true);
  });

  it("abgelaufene Nachweise zählen nicht", () => {
    const p = { x: person([q({ art: "as-baum-1", seit: "2020-01-01", gueltigBis: "2026-01-01" })]) };
    expect(qualPersonalcheck(p, ["x"], "boden", HEUTE).ok).toBe(false);
  });
});

describe("qualG41Hinweis (Fix-Runde Task 12, 18.09.2026 — warnen, nicht blockieren)", () => {
  const skt = (o = {}) => q({ art: "skt-a", seit: "2020-01-01", gueltigBis: null, ...o });
  const g41 = (o = {}) => q({ art: "g41", seit: "2024-01-01", gueltigBis: null, ...o });

  it("nie gemacht → Hinweis", () => {
    const p = person([skt()]);
    const h = qualG41Hinweis(p, HEUTE);
    expect(h).toBeTruthy();
    expect(h.stufe).toBe("fehlt");
    expect(h.text).toMatch(/Kein G 41/);
  });

  it("abgelaufen → Hinweis", () => {
    const p = person([skt(), g41({ gueltigBis: "2026-01-01" })]); // 36 Monate default, hier explizit abgelaufen
    const h = qualG41Hinweis(p, HEUTE);
    expect(h).toBeTruthy();
    expect(h.stufe).toBe("ueberfaellig");
    expect(h.text).toMatch(/abgelaufen/);
  });

  it("gültig → kein Hinweis", () => {
    const p = person([skt(), g41({ seit: "2026-01-01" })]); // 36 Monate, weit in der Zukunft gültig
    expect(qualG41Hinweis(p, HEUTE)).toBeNull();
  });

  it("bald fällig (Vorwarnzeit) → kein Hinweis — das deckt die Erinnerungsmail ab, nicht diese Anzeige", () => {
    const p = person([skt(), g41({ gueltigBis: "2026-10-01" })]); // 15 Tage nach HEUTE = "bald"
    expect(qualG41Hinweis(p, HEUTE)).toBeNull();
  });

  it("wer nicht klettert (kein SKT), braucht laut Katalog kein G 41 → kein Hinweis", () => {
    const p = person([q({ art: "as-baum-1", seit: "2020-01-01" })]);
    expect(qualG41Hinweis(p, HEUTE)).toBeNull();
    expect(qualG41Hinweis(person([]), HEUTE)).toBeNull();
  });

  it("ändert die Auswahl der Aufsicht NICHT — G 41 fehlt oder abgelaufen bleibt aufsichtsberechtigt (Max' Entscheidung: warnen, nicht blockieren)", () => {
    const personen = {
      basti: person([skt({ art: "skt-b" })], { name: "Sebastian Vogel" }), // kein G 41 ueberhaupt
      anna: person([skt({ art: "skt-a" }), g41({ gueltigBis: "2020-01-01" })], { name: "Anna" }), // G 41 laengst abgelaufen
    };
    const a = qualAufsicht(personen, ["basti", "anna"], HEUTE);
    expect(a.key).toBe("basti"); // hoechster Rang gewinnt weiterhin, unabhaengig von G 41
    expect(qualG41Hinweis(personen.basti, HEUTE)).toBeTruthy();
    expect(qualG41Hinweis(personen.anna, HEUTE)).toBeTruthy();
    // dieselbe Person waere auch ohne den neuen Hinweis Aufsicht gewesen — Vergleich mit qualHoechste direkt:
    expect(qualHoechste(personen.basti, HEUTE).art).toBe("skt-b");
  });
});

describe("qualFaelligkeiten", () => {
  it("listet nur, was abläuft oder abgelaufen ist — dringendstes zuerst", () => {
    const store = qualNorm({ personen: {
      basti: person([q({ art: "erste-hilfe", gueltigBis: "2026-10-01" }), q({ id: "s", art: "skt-b", seit: "2024-01-01" })], { name: "Sebastian Vogel" }),
      anna: person([q({ art: "g41", gueltigBis: "2026-09-01" }), q({ id: "p", art: "psa-sachkunde", gueltigBis: "2028-01-01" })], { name: "Anna" }),
    } });
    const f = qualFaelligkeiten(store, HEUTE);
    expect(f.map((x) => [x.key, x.art, x.stufe, x.tage])).toEqual([
      ["anna", "g41", "ueberfaellig", -15],
      ["basti", "erste-hilfe", "bald", 15],
    ]);
    expect(f[0].label).toBe("Eignungsuntersuchung G 41");
    expect(f[0].name).toBe("Anna");
    expect(f[0].bis).toBe("2026-09-01");
  });
  it("zählt nur den neuesten Eintrag je Art", () => {
    const store = qualNorm({ personen: { x: person([q({ id: "alt", seit: "2022-01-01" }), q({ id: "neu", seit: "2026-01-01" })]) } });
    expect(qualFaelligkeiten(store, HEUTE)).toEqual([]);
  });
  it("kommt mit leerem Store klar", () => {
    expect(qualFaelligkeiten(QUALI_STORE_LEER, HEUTE)).toEqual([]);
    expect(qualFaelligkeiten(null, HEUTE)).toEqual([]);
  });
});

describe("qualFehlende (Task 12, 18.09.2026)", () => {
  it("QUALI_PFLICHT enthält nur die G-41-Regel — Ersthelfer ist bewusst eine eigene Betriebsquote", () => {
    expect(QUALI_PFLICHT.map((r) => r.art)).toEqual(["g41"]);
  });

  it("ist datumsunabhängig: ein nie eingetragener Pflichtnachweis fehlt an jedem Datum", () => {
    const p = { name: "Klara", quals: [q({ art: "skt-a", seit: "2020-01-01" })] };
    const store = { version: 1, personen: { klara: p } };
    for (const datum of ["2020-06-01", HEUTE, "2030-01-01"]) {
      expect(qualFehlende(store, datum).find((f) => f.art === "g41")).toBeTruthy();
    }
  });

  it("ein abgelaufenes G 41 ist überfällig, nicht 'fehlend' — das übernimmt weiterhin qualFaelligkeiten", () => {
    const p = { name: "Klara", quals: [
      q({ art: "skt-a", seit: "2020-01-01" }),
      q({ art: "g41", seit: "2020-01-01", gueltigBis: "2022-01-01" }),
    ] };
    const store = { version: 1, personen: { klara: p } };
    expect(qualFehlende(store, HEUTE)).toEqual([]);
    expect(qualFaelligkeiten(store, HEUTE).find((f) => f.key === "klara" && f.art === "g41")).toBeTruthy();
  });

  it("wer nicht klettert, braucht laut Katalog kein G 41", () => {
    const p = { name: "Max", quals: [q({ art: "as-baum-1", seit: "2020-01-01" })] };
    expect(qualFehlende({ version: 1, personen: { max: p } }, HEUTE)).toEqual([]);
  });

  it("sortiert nach Name, dann Art", () => {
    const store = { version: 1, personen: {
      z: { name: "Zoe", quals: [q({ art: "skt-a", seit: "2020-01-01" })] },
      a: { name: "Anna", quals: [q({ art: "skt-b", seit: "2020-01-01" })] },
    } };
    expect(qualFehlende(store, HEUTE).map((f) => f.name)).toEqual(["Anna", "Zoe"]);
  });
});

describe("qualErsthelferBedarf (§ 26 DGUV Vorschrift 1, Task 12)", () => {
  it("unter 2 Personen erfindet die Vorschrift keine Pflicht", () => {
    const store = { version: 1, personen: { a: { name: "A", quals: [] } } };
    expect(qualErsthelferBedarf(store, HEUTE)).toEqual({ soll: 0, ist: 0, fehlt: 0 });
    expect(qualErsthelferBedarf(QUALI_STORE_LEER, HEUTE)).toEqual({ soll: 0, ist: 0, fehlt: 0 });
  });

  it("2 bis 20 Personen: mindestens ein Ersthelfer", () => {
    const store = { version: 1, personen: {
      a: { name: "A", quals: [q({ art: "erste-hilfe", seit: "2025-01-01" })] },
      b: { name: "B", quals: [] },
    } };
    expect(qualErsthelferBedarf(store, HEUTE)).toEqual({ soll: 1, ist: 1, fehlt: 0 });
  });

  it("ein abgelaufener Erste-Hilfe-Kurs zählt nicht mehr als Ersthelfer", () => {
    const store = { version: 1, personen: {
      a: { name: "A", quals: [q({ art: "erste-hilfe", seit: "2020-01-01" })] }, // 24 Monate -> laengst abgelaufen
      b: { name: "B", quals: [] },
    } };
    const bedarf = qualErsthelferBedarf(store, HEUTE);
    expect(bedarf.ist).toBe(0);
    expect(bedarf.fehlt).toBe(1);
  });

  it("über 20 Personen: 10 % (gewerblicher Betrieb), aufgerundet", () => {
    const personen = {};
    for (let i = 0; i < 21; i++) personen["p" + i] = { name: "P" + i, quals: [] };
    expect(qualErsthelferBedarf({ version: 1, personen }, HEUTE).soll).toBe(3); // 21 * 0.1 = 2.1 -> 3
  });
});

describe("qualDolibarrFelder", () => {
  it("bildet SKT, AS Baum, Ersthelfer und die Kurzfassung ab", () => {
    const p = person([
      q({ id: "1", art: "skt-a", seit: "2023-05-01" }), q({ id: "2", art: "skt-b", seit: "2026-09-18" }),
      q({ id: "3", art: "as-baum-2", seit: "2022-02-02" }), q({ id: "4", art: "erste-hilfe", seit: "2026-03-01" }),
    ]);
    const f = qualDolibarrFelder(p, HEUTE);
    expect(f.options_quali_skt).toBe("B");
    expect(f.options_quali_skt_seit).toBe("2026-09-18");
    expect(f.options_quali_as_baum).toBe("II");
    expect(f.options_quali_erste_hilfe_bis).toBe("2028-03-01");
    expect(JSON.parse(f.options_quali_json)).toEqual({
      "skt-a": { seit: "2023-05-01", bis: null }, "skt-b": { seit: "2026-09-18", bis: null },
      "as-baum-2": { seit: "2022-02-02", bis: null }, "erste-hilfe": { seit: "2026-03-01", bis: "2028-03-01" },
    });
  });
  it("lässt Felder leer, wenn nichts Gültiges da ist", () => {
    const f = qualDolibarrFelder(person([q({ art: "erste-hilfe", seit: "2020-01-01" })]), HEUTE);
    expect(f.options_quali_skt).toBe("");
    expect(f.options_quali_skt_seit).toBe("");
    expect(f.options_quali_as_baum).toBe("");
    // abgelaufen bleibt als Datum sichtbar — Dolibarr soll den Ablauf zeigen, nicht verstecken
    expect(f.options_quali_erste_hilfe_bis).toBe("2022-01-01");
    expect(qualDolibarrFelder(person([]), HEUTE).options_quali_json).toBe("{}");
  });
});

describe("Schlüssel, UID, Dateiname", () => {
  it("macht aus einem Namen einen Schlüssel für Aushilfen", () => {
    expect(qualSlug("Tom Müller-Lüdenscheidt")).toBe("tom-mueller-luedenscheidt");
    expect(qualSlug("  Äöü ß  ")).toBe("aeoeue-ss");
    expect(qualSlug("x".repeat(60))).toHaveLength(40);
    expect(qualSlug("")).toBe("");
  });
  it("lässt als Schlüssel nur Login-artige Zeichen zu", () => {
    expect(qualKeyOk("max")).toBe(true);
    expect(qualKeyOk("s.vogel_2")).toBe(true);
    expect(qualKeyOk("")).toBe(false);
    expect(qualKeyOk("../x")).toBe(false);
    expect(qualKeyOk("Max")).toBe(false);
  });
  it("baut eine feste Kalender-UID je Art und Person", () => {
    expect(qualUid("erste-hilfe", "s.vogel")).toBe("blattwerk-quali-erste-hilfe-s.vogel@blattwerk");
    expect(qualUid("g41", "Änne Ü")).toBe("blattwerk-quali-g41-nne@blattwerk");
  });
  it("benennt den Nachweis mit Datum vorn und ohne Umlaute", () => {
    expect(qualDateiname({ art: "skt-b", seit: "2026-09-18" }, "s.vogel", "pdf")).toBe("QUALI_2026-09-18_skt-b_s.vogel.pdf");
  });
});

describe("qualPruefen", () => {
  it("weist unbekannte Art, kaputtes und künftiges Datum ab", () => {
    expect(qualPruefen({ art: "zauberkunst", seit: "2026-01-01" }, HEUTE)).toMatch(/Unbekannte Art/);
    expect(qualPruefen({ art: "skt-a", seit: "01.01.2026" }, HEUTE)).toMatch(/seit/);
    expect(qualPruefen({ art: "skt-a", seit: "2026-09-17" }, HEUTE)).toMatch(/Zukunft/);
    expect(qualPruefen({ art: "erste-hilfe", seit: "2026-01-01", gueltigBis: "irgendwann" }, HEUTE)).toMatch(/gültig bis/);
    expect(qualPruefen({ art: "erste-hilfe", seit: "2026-01-01", gueltigBis: "2025-12-31" }, HEUTE)).toMatch(/vor/);
    expect(qualPruefen(null, HEUTE)).toMatch(/fehlt/);
  });
  it("nimmt heute und die Vergangenheit an, gültig bis darf leer sein", () => {
    expect(qualPruefen({ art: "skt-a", seit: HEUTE }, HEUTE)).toBeNull();
    expect(qualPruefen({ art: "erste-hilfe", seit: "2026-01-01", gueltigBis: "" }, HEUTE)).toBeNull();
  });
});

describe("qualEintragen", () => {
  const meta = { heute: HEUTE, erfasstVon: "max", id: "q-test" };

  it("legt eine Person an und hängt die Fortbildung additiv an", () => {
    const s1 = qualEintragen(QUALI_STORE_LEER, "tom", { name: "Tom Aushilfe", mobil: "+49 179 1" }, null, meta);
    expect(s1.personen.tom).toEqual({ name: "Tom Aushilfe", dolibarrId: null, mobil: "+49 179 1", jugendlich: false, quals: [] });
    const s2 = qualEintragen(s1, "tom", null, { art: "erste-hilfe", seit: "2026-03-01", gueltigBis: "", stelle: "DRK", nachweis: "Qualifikationen/2026/x.pdf" }, meta);
    expect(s2.personen.tom.quals).toEqual([{
      id: "q-test", art: "erste-hilfe", seit: "2026-03-01", gueltigBis: null, stelle: "DRK",
      nachweis: "Qualifikationen/2026/x.pdf", erfasstAm: HEUTE, erfasstVon: "max",
    }]);
    const s3 = qualEintragen(s2, "tom", null, { art: "erste-hilfe", seit: "2026-09-01" }, meta);
    expect(s3.personen.tom.quals).toHaveLength(2);
    // Eingabe unveraendert (reine Funktion)
    expect(QUALI_STORE_LEER.personen).toEqual({});
    expect(s2.personen.tom.quals).toHaveLength(1);
  });

  it("aktualisiert Name/Mobil/Jugendlich einer bestehenden Person, ohne quals zu verlieren", () => {
    const s1 = qualEintragen(QUALI_STORE_LEER, "anna", { name: "Anna", dolibarrId: 3 }, { art: "skt-a", seit: "2024-01-01" }, meta);
    const s2 = qualEintragen(s1, "anna", { mobil: "+49 1", jugendlich: true }, null, meta);
    expect(s2.personen.anna.name).toBe("Anna");
    expect(s2.personen.anna.dolibarrId).toBe(3);
    expect(s2.personen.anna.mobil).toBe("+49 1");
    expect(s2.personen.anna.jugendlich).toBe(true);
    expect(s2.personen.anna.quals).toHaveLength(1);
  });

  it("wirft bei kaputtem Schlüssel, unbekannter Person ohne Daten oder ungültiger Fortbildung", () => {
    expect(() => qualEintragen(QUALI_STORE_LEER, "../x", { name: "X" }, null, meta)).toThrow(/Schlüssel/);
    expect(() => qualEintragen(QUALI_STORE_LEER, "neu", null, { art: "skt-a", seit: "2024-01-01" }, meta)).toThrow(/Person unbekannt/);
    expect(() => qualEintragen(QUALI_STORE_LEER, "neu", { name: "" }, null, meta)).toThrow(/Name/);
    expect(() => qualEintragen(QUALI_STORE_LEER, "neu", { name: "N" }, { art: "x", seit: "2024-01-01" }, meta)).toThrow(/Unbekannte Art/);
    expect(() => qualEintragen(QUALI_STORE_LEER, "neu", null, null, meta)).toThrow(/nichts/i);
  });

  it("kappt nachweis und erfasstVon wie stelle (200 bzw. 80 Zeichen)", () => {
    const s = qualEintragen(QUALI_STORE_LEER, "tom", { name: "Tom" },
      { art: "skt-a", seit: "2024-01-01", nachweis: "x".repeat(250) },
      { heute: HEUTE, erfasstVon: "y".repeat(100), id: "q-cap" });
    expect(s.personen.tom.quals[0].nachweis).toHaveLength(200);
    expect(s.personen.tom.quals[0].erfasstVon).toHaveLength(80);
  });

  it("vergibt ohne meta.id selbst eine Kennung mit q-Präfix", () => {
    const s = qualEintragen(QUALI_STORE_LEER, "n", { name: "N" }, { art: "skt-a", seit: "2024-01-01" }, { heute: HEUTE, erfasstVon: "" });
    expect(s.personen.n.quals[0].id).toMatch(/^q-[a-z0-9-]+$/);
  });
});

describe("qualiKeyAusLogin / qualiPersonenVereinen", () => {
  it("nimmt den Dolibarr-Login klein als Schlüssel, sonst den Slug", () => {
    expect(qualiKeyAusLogin("Max")).toBe("max");
    expect(qualiKeyAusLogin("s.vogel")).toBe("s.vogel");
    expect(qualiKeyAusLogin("Änne Müller")).toBe("aenne-mueller");
  });

  it("vereint Dolibarr-Nutzer und Store — Store-Daten gehen vor, Dolibarr-Mobil belegt vor", () => {
    const ausDolibarr = [
      { key: "max", name: "Max Muster", dolibarrId: 1, mobil: "+49 170" },
      { key: "basti", name: "Sebastian Vogel", dolibarrId: 7, mobil: "" },
    ];
    const storePersonen = {
      basti: { name: "Basti Vogel", dolibarrId: 7, mobil: "+49 179", jugendlich: false, quals: [q()] },
      tom: { name: "Tom Aushilfe", dolibarrId: null, mobil: "", jugendlich: true, quals: [] },
    };
    const v = qualiPersonenVereinen(ausDolibarr, storePersonen);
    expect(v.map((p) => p.key)).toEqual(["basti", "max", "tom"]); // nach Name sortiert
    expect(v[0]).toMatchObject({ name: "Basti Vogel", mobil: "+49 179", imStore: true, dolibarrId: 7 });
    expect(v[0].quals).toHaveLength(1);
    expect(v[1]).toMatchObject({ name: "Max Muster", mobil: "+49 170", imStore: false, quals: [], jugendlich: false });
    expect(v[2]).toMatchObject({ name: "Tom Aushilfe", imStore: true, dolibarrId: null, jugendlich: true });
  });

  it("verträgt leere Eingaben", () => {
    expect(qualiPersonenVereinen(null, null)).toEqual([]);
    expect(qualiPersonenVereinen([], {})).toEqual([]);
  });
});

describe("QUALI_DOLIBARR_EXTRAFELDER", () => {
  it("beschreibt genau die Felder, die qualDolibarrFelder schreibt", () => {
    const namen = QUALI_DOLIBARR_EXTRAFELDER.map((f) => "options_" + f.name).sort();
    expect(namen).toEqual(Object.keys(qualDolibarrFelder(person([]), HEUTE)).sort());
  });
  it("hat Typ und Größe wie in der Spec", () => {
    const f = Object.fromEntries(QUALI_DOLIBARR_EXTRAFELDER.map((x) => [x.name, x]));
    expect(f.quali_skt).toMatchObject({ type: "varchar", size: "2" });
    expect(f.quali_skt_seit).toMatchObject({ type: "date" });
    expect(f.quali_as_baum).toMatchObject({ type: "varchar", size: "2" });
    expect(f.quali_erste_hilfe_bis).toMatchObject({ type: "date" });
    expect(f.quali_json).toMatchObject({ type: "text" });
  });
});
