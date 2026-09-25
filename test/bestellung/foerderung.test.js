// Förder-Check beim Anlegen einer Bestellung (src/foerderung.js).
//
// Der teuerste Fehler dieses Features wäre ein Treffer, den es nicht gibt:
// Wer wegen eines falschen Hinweises auf eine Zusage wartet, bestellt drei
// Wochen lang nicht — und wer einen Treffer NICHT sieht, kauft zuerst und
// verliert den Zuschuss endgültig (SVLFG und LEADER fördern nur vor dem Kauf).
// Deshalb prüft dieser Test beide Richtungen, inklusive der Mandantengrenze:
// eine fremde Firma darf nie auf Blattwerks LEADER-Region oder auf die SVLFG
// geschickt werden.
import { describe, expect, it } from "vitest";
import {
  FOERDER_NOTIZ_MARKE,
  bestellZusatz, bestellZusatzFelder, foerderNotiz, foerderTreffer, positionenNetto, positionenText,
  prioRang, programmeFuer,
} from "../../src/foerderung.js";
import { mandantLaden } from "../../src/mandant.js";

const HEUTE = "2026-09-19";
const blattwerk = mandantLaden(null).mandant;
const fremd = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Fremd GmbH" })).mandant;

const keys = (t) => t.map((x) => x.programm.key);

describe("Programme je Mandant", () => {
  it("Blattwerk sieht alle Programme seiner Kulisse", () => {
    expect(programmeFuer(blattwerk, HEUTE).map((p) => p.key))
      .toEqual(["svlfg", "leader", "bafa-beratung", "digi-beratung-hessen"]);
  });

  it("der Landkreis zieht die Landeskulisse mit (Digi-Beratung Hessen)", () => {
    expect(blattwerk.betrieb.foerderRegion).toBe("landkreis-giessen");
    expect(programmeFuer(blattwerk, HEUTE).map((p) => p.key)).toContain("digi-beratung-hessen");
  });

  it("ein fremder Mandant erbt weder Region noch UV-Träger", () => {
    expect(fremd.betrieb.foerderRegion).toBe("");
    // Übrig bleibt nur, was bundesweit und trägerunabhängig gilt.
    expect(programmeFuer(fremd, HEUTE).map((p) => p.key)).toEqual(["bafa-beratung"]);
  });

  it("abgelaufene Richtlinien fallen weg", () => {
    expect(programmeFuer(blattwerk, "2027-01-02").map((p) => p.key))
      .toEqual(["svlfg", "leader", "digi-beratung-hessen"]);
  });
});

describe("SVLFG-Prämienkatalog", () => {
  const treffer = (text, betrag) => foerderTreffer({ mandant: blattwerk, kategorie: "psa", betragNetto: betrag, text, heute: HEUTE });

  it("erkennt ein Katalogprodukt und deckelt auf 25 % der Summe", () => {
    const t = treffer("Funk-Gehörschutz 3M WorkTunes", 400);
    expect(keys(t)).toContain("svlfg");
    // 25 % von 400 = 100 < Produktdeckel 300
    expect(t.find((x) => x.programm.key === "svlfg").schaetzung).toBe(100);
  });

  it("deckelt bei großer Bestellung auf den Produktbetrag", () => {
    const t = treffer("Defibrillator AED", 4000);
    expect(t.find((x) => x.programm.key === "svlfg").schaetzung).toBe(300);
  });

  it("schweigt bei Ware außerhalb des Katalogs", () => {
    expect(keys(treffer("Arbeitshandschuhe, 10 Paar", 80))).not.toContain("svlfg");
  });
});

describe("LEADER-Mindestinvestition", () => {
  const treffer = (betrag) => keys(foerderTreffer({ mandant: blattwerk, kategorie: "maschinen", betragNetto: betrag, text: "Häcksler", heute: HEUTE }));

  it("greift ab 1.500 € netto", () => expect(treffer(1500)).toContain("leader"));
  it("greift darunter nicht", () => expect(treffer(1499.99)).not.toContain("leader"));
});

describe("Kategorie grenzt ab", () => {
  it("Beratung trifft BAFA, nicht LEADER-Anschaffung", () => {
    const t = foerderTreffer({ mandant: blattwerk, kategorie: "fortbildung", betragNetto: 2000, text: "Steuerberater Erstberatung", heute: HEUTE });
    expect(keys(t)).toContain("bafa-beratung");
    expect(t.find((x) => x.programm.key === "bafa-beratung").schaetzung).toBe(1000);
  });

  it("Verbrauchsmaterial trifft nichts", () => {
    expect(foerderTreffer({ mandant: blattwerk, kategorie: "verbrauch", betragNetto: 3000, text: "Sägekettenöl", heute: HEUTE })).toEqual([]);
  });

  it("ohne Kategorie bleibt der Stichwort-Treffer sichtbar", () => {
    expect(keys(foerderTreffer({ mandant: blattwerk, kategorie: "", betragNetto: 600, text: "Spillwinde", heute: HEUTE }))).toContain("svlfg");
  });
});

describe("Positionen", () => {
  const lines = [
    { desc: "Funk-Gehörschutz", qty: 2, price: 150, remise_percent: 0, url: "https://shop.example/gh" },
    { desc: "Ersatzakku", qty: 1, price: 200, remise_percent: 50 },
  ];
  it("rechnet netto inklusive Rabatt", () => expect(positionenNetto(lines)).toBe(400));
  it("klebt Text und Link für die Stichwortsuche zusammen", () => {
    expect(positionenText(lines)).toContain("Funk-Gehörschutz");
    expect(positionenText(lines)).toContain("shop.example");
  });
});

describe("Zusatzfelder", () => {
  it("liest Dolibarrs leeres Array als leere Werte", () => {
    expect(bestellZusatz({ array_options: [] })).toEqual({ prio: "", kategorie: "", foerderung: "", foerderStatus: "" });
  });
  it("liest gesetzte Felder", () => {
    const z = bestellZusatz({ array_options: { options_bw_prio: "dringend", options_bw_kategorie: "psa" } });
    expect(z.prio).toBe("dringend");
    expect(z.kategorie).toBe("psa");
  });
  it("schreibt alle vier Felder, auch die leeren (sonst bleibt ein alter Wert stehen)", () => {
    expect(Object.keys(bestellZusatzFelder({ prio: "wichtig" }))).toHaveLength(4);
    expect(bestellZusatzFelder({ prio: "wichtig" }).options_bw_kategorie).toBe("");
  });
});

describe("Priorität sortiert", () => {
  it("dringend vor wichtig vor irgendwann vor ohne Angabe", () => {
    const sortiert = ["", "irgendwann", "dringend", "wichtig"].sort((a, b) => prioRang(a) - prioRang(b));
    expect(sortiert).toEqual(["dringend", "wichtig", "irgendwann", ""]);
  });
});

describe("Feste Notiz an der Bestellung", () => {
  const treffer = foerderTreffer({ mandant: blattwerk, kategorie: "psa", betragNetto: 2000, text: "Funk-Gehörschutz", heute: HEUTE });

  it("nennt jedes passende Programm mit Satz, Kontakt und Link", () => {
    const n = foerderNotiz(treffer, { heute: HEUTE });
    expect(n).toContain(FOERDER_NOTIZ_MARKE);
    expect(n).toContain("19.09.2026");
    expect(n).toContain("SVLFG-Prämiensystem 2026");
    expect(n).toContain("LEADER-Regionalprogramm");
    expect(n).toContain("zuständigen Regionalbüro erfragen");
    expect(n).toContain("https://www.svlfg.de/praemiensystem");
    // Ohne Auswahl bleibt die Warnung stehen.
    expect(n).toContain("VOR dem Kauf");
  });

  it("hält fest, welches Programm gewählt wurde", () => {
    expect(foerderNotiz(treffer, { heute: HEUTE, gewaehlt: "svlfg" }))
      .toContain("Gewählt: SVLFG-Prämiensystem 2026");
  });

  it("dokumentiert auch den Fall ohne Treffer — geprüft ist nicht vergessen", () => {
    const n = foerderNotiz([], { heute: HEUTE });
    expect(n).toContain("kein Förderprogramm passt");
    expect(n).toContain(FOERDER_NOTIZ_MARKE);
  });
});
