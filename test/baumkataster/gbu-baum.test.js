// GBU → Kataster (Spec Abschnitt 4): wer eine Gefährdungsbeurteilung für einen
// Baum macht, hat den Baum danach im Kataster — mit der Baumsicherheits-
// beurteilung als erster Kontrolle.
import { describe, expect, it } from "vitest";
import { bkBaumAusGbu, bkBaumSpeichern, bkFuerGbu, bkKontrolleEintragen } from "../../src/baumkataster.js";
import { BK_KONTROLLARTEN } from "../../src/baumkataster-data.js";

const HEUTE = "2026-09-17";
const GBU = {
  id: "gbu-1758100000000",
  kunde: { id: 12, name: "Stadt Musterstadt" },
  baum: "Stieleiche am Spielplatz",
  kopf: { datum: "2026-09-17", einsatzort: "Musterstadt", strasse: "Schulstraße 3", gps: { lat: 50.5333, lon: 8.7, genauigkeitM: 6 } },
  baumcheck: {
    krone: "Totholz > 5 cm", stamm: "Höhlung", wurzel: "Bodenverdichtung",
    gesundheit: "leicht eingeschränkt", standsicherheit: "eingeschränkt",
    hoehe: "22", bhd: "70",
    befund: { umfeld: ["Bodenverdichtung"], wurzel: [], stammfuss: [], stamm: ["Höhlung"], krone: ["Totholz > 5 cm"] },
  },
};

describe("bkBaumAusGbu", () => {
  it("nimmt Kunde, Position und Art aus der Beurteilung", () => {
    const r = bkBaumAusGbu(GBU, HEUTE);
    expect(r.kundeId).toBe(12);
    expect(r.baum.lat).toBe(50.5333);
    expect(r.baum.lon).toBe(8.7);
    expect(r.baum.genauigkeitM).toBe(6);
    expect(r.baum.quelle).toBe("gps");
    expect(r.baum.artDe).toBe("Stieleiche am Spielplatz");
    expect(r.baum.standort).toBe("Schulstraße 3");
  });

  it("rechnet den BHD in den Stammumfang zurück (der Kataster speichert den Umfang)", () => {
    const r = bkBaumAusGbu(GBU, HEUTE);
    expect(r.baum.hoeheM).toBe(22);
    expect(r.baum.stammumfangCm).toBe(Math.round(70 * Math.PI));
  });

  it("legt die Baumsicherheitsbeurteilung als Zusatzkontrolle an", () => {
    const r = bkBaumAusGbu(GBU, HEUTE);
    expect(r.kontrolle.artKontrolle).toBe("Zusatzkontrolle");
    expect(BK_KONTROLLARTEN).toContain(r.kontrolle.artKontrolle);
    expect(r.kontrolle.datum).toBe("2026-09-17");
    expect(r.kontrolle.befund.krone).toEqual(["Totholz > 5 cm"]);
    expect(r.kontrolle.bemerkung).toContain("gbu-1758100000000");
  });

  it("leitet Vitalität und Verkehrssicherheit aus der GBU-Bewertung ab", () => {
    expect(bkBaumAusGbu(GBU, HEUTE).kontrolle).toMatchObject({ vitalitaet: 1, verkehrssicher: "eingeschraenkt" });
    const gesund = { ...GBU, baumcheck: { ...GBU.baumcheck, gesundheit: "vital", standsicherheit: "gegeben" } };
    expect(bkBaumAusGbu(gesund, HEUTE).kontrolle).toMatchObject({ vitalitaet: 0, verkehrssicher: "ja" });
    const tot = { ...GBU, baumcheck: { ...GBU.baumcheck, gesundheit: "abgestorben", standsicherheit: "eingehende Untersuchung erforderlich" } };
    expect(bkBaumAusGbu(tot, HEUTE).kontrolle).toMatchObject({ vitalitaet: 3, verkehrssicher: "nein" });
  });

  it("gibt null zurück, wenn Kunde oder Position fehlen — ohne beides wäre der Eintrag wertlos", () => {
    expect(bkBaumAusGbu({ ...GBU, kunde: null }, HEUTE)).toBe(null);
    expect(bkBaumAusGbu({ ...GBU, kopf: { ...GBU.kopf, gps: null } }, HEUTE)).toBe(null);
    expect(bkBaumAusGbu(null, HEUTE)).toBe(null);
  });

  it("nimmt heute, wenn die Beurteilung kein Datum trägt", () => {
    const r = bkBaumAusGbu({ ...GBU, kopf: { ...GBU.kopf, datum: "" } }, HEUTE);
    expect(r.kontrolle.datum).toBe(HEUTE);
  });

  it("das Ergebnis läuft durch die echten Mutatoren — und kommt bei bkFuerGbu wieder heraus", () => {
    const r = bkBaumAusGbu(GBU, HEUTE);
    const { store, baum } = bkBaumSpeichern({}, r.baum, { login: "max" });
    const { store: s2 } = bkKontrolleEintragen(store, baum.nr, r.kontrolle, { login: "max" });
    const zurueck = bkFuerGbu(s2.baeume[baum.nr]);
    expect(zurueck.baumart).toContain("Stieleiche am Spielplatz");
    expect(zurueck.bhd).toBe("70");
    expect(zurueck.krone).toBe("Totholz > 5 cm");
    expect(zurueck.standsicherheit).toBe("eingeschränkt");
  });
});
