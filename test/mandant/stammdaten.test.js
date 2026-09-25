// Befund C1 der Abschlusspruefung (18.09.2026): `ort` wurde an fremde
// Mandanten vererbt und stand damit im Kopf ihres Nachweises nach § 5 ArbSchG
// ("… · Musterstadt · UV-Träger: …"). Der Weg war lang genug, um ihn zu
// uebersehen: mandant.js (ort im Standard) -> mandantLaden (nicht geleert) ->
// mandantOeffentlich (durchgereicht) -> mandantBetrieb (uebernommen) ->
// gbu-pdf.js (`betrieb.anschrift || betrieb.ort`).
//
// Deshalb pruefen die Tests hier nicht den Quelltext, sondern das Ergebnis:
// was steht am Ende im PDF. Dasselbe fuer `logo` (Topbar, Anmeldebildschirm,
// Ueberlassungs-PDF).
import { describe, expect, it } from "vitest";
import { MANDANT_STANDARD, mandantLaden, mandantOeffentlich, ncGruppe, ncOrdner } from "../../src/mandant.js";
import { BETRIEB_STANDARD, mandantBetrieb, mandantMarke } from "../../src/betrieb.js";
import { buildGbuPdf } from "../../src/gbu-pdf.js";
import { FB_FAHRZEUG_STANDARD } from "../../src/fahrtenbuch.js";

const REKORD = {
  id: "gbu-1723209600000", createdAt: "2026-08-09T10:15:30.000Z", userName: "Test",
  kunde: { name: "Testkunde" }, projekt: null, arbeitsart: "maehen", zugang: "",
  niederschlag: "trocken", wind: "leicht", beschreibung: "Rasen gemäht", baum: "", besonderheiten: "",
  zweitePersonName: "", einsatzort: "Musterweg 1", aufsichtsfuehrender: "Test",
  dauerVon: "08:00", dauerBis: "12:00", personal: [{ name: "Test", quals: [] }],
  arbeiten: [], arbeitenSonstiges: "", stromEntfernung: "", kommunikationsart: "",
  verkehrssicherungsart: "", baumdaten: null, items: {},
  uploadedDolibarr: false, uploadedPl: false,
};
// jsPDF schreibt unkomprimiert — der gezeichnete Text steht im Rohstrom.
const roh = async (betrieb) => Buffer.from(await buildGbuPdf(REKORD, { betrieb }), "base64").toString("latin1");

const fremd = (extra = {}) => mandantOeffentlich(
  mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR", ...extra })).mandant,
);
const blattwerk = () => mandantOeffentlich(mandantLaden(null).mandant);

describe("Stammdaten werden nicht an fremde Mandanten vererbt", () => {
  it("ein fremder Mandant ohne eigenen Ort hat keinen Ort — auch nicht in den Betriebsdaten", () => {
    expect(fremd().ort).toBe("");
    expect(mandantBetrieb(fremd()).ort).toBe("");
  });

  it("ein fremder Mandant ohne eigenes Logo bekommt nicht Blattwerks /logo.png", () => {
    expect(fremd().logo).toBe("");
    expect(mandantBetrieb(fremd()).logo).toBe("");
  });

  it("ein eigener Ort und ein eigenes Logo kommen durch", () => {
    const m = fremd({ ort: "Gießen", logo: "/mandant-logo.png" });
    expect(m.ort).toBe("Gießen");
    expect(m.logo).toBe("/mandant-logo.png");
  });

  it("Blattwerk behält Ort und Logo unverändert", () => {
    expect(blattwerk().ort).toBe("Musterstadt");
    expect(blattwerk().logo).toBe("/logo.png");
  });

  it("im GBU-Kopf eines fremden Mandanten ohne eigenen Ort steht kein Musterstadt", async () => {
    const s = await roh(mandantBetrieb(fremd()));
    expect(s).toContain("Baum M");            // die eigene Firma steht drin
    expect(s).not.toContain("Musterstadt");
    expect(s).not.toContain("Musterstraße");
    // "SVLFG" steht bewusst NICHT auf der Verbotsliste: der Name taucht im
    // PDF auch in den festen Rechtsverweisen auf (VSG-Vorschriften,
    // SVLFG-Formular GBU-W-C006) und gilt fuer jeden Baumpflegebetrieb. Der
    // mandantenbezogene Teil ist `betrieb.uvTraeger` in der Kopfzeile — und
    // der ist fuer einen fremden Mandanten leer:
    expect(mandantBetrieb(fremd()).uvTraeger).toBe("");
    expect(s).not.toContain("UV-Träger: SVLFG");
  });

  it("mit eigenem Ort steht der eigene Ort im GBU-Kopf", async () => {
    const s = await roh(mandantBetrieb(fremd({ ort: "Gießen" })));
    expect(s).toContain("Gie");
    expect(s).not.toContain("Musterstadt");
  });

  it("buildGbuPdf verweigert weiterhin ohne Firmennamen", async () => {
    await expect(buildGbuPdf(REKORD, { betrieb: { ...mandantBetrieb(fremd()), name: "" } }))
      .rejects.toThrow(/betrieb\.name fehlt/);
  });

  it("eine fremde mandant.json mit leerem Namen wird NICHT zu Blattwerk GbR", () => {
    // Ohne die kuerzel-Bedingung in mandantBetrieb() haette der Rueckfall hier
    // "Blattwerk GbR" geliefert — und die Verweigerung oben koennte ueber die
    // App nie greifen.
    const m = mandantOeffentlich(mandantLaden(JSON.stringify({ kuerzel: "xy", name: "" })).mandant);
    expect(mandantBetrieb(m).name).toBe("");
  });

  it("Blattwerks Betriebsdaten bleiben vollständig — auch wenn noch nichts geladen ist", () => {
    expect(mandantBetrieb(blattwerk())).toMatchObject({
      name: "Blattwerk GbR", ort: "Musterstadt", anschrift: "Musterstraße 1, 12345 Musterstadt",
      uvTraeger: "SVLFG", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk",
      vertragsName: "Blattwerk",
    });
    expect(mandantBetrieb(null)).toEqual(BETRIEB_STANDARD);
  });

  it("die Kopie der Blattwerk-Werte in src/betrieb.js deckt sich mit MANDANT_STANDARD", () => {
    // src/betrieb.js haelt die Werte bewusst doppelt (kein Import, sonst zieht
    // das Browser-Bundle server-seitige Module mit). Dieser Test ist die
    // Klammer: laeuft eine der beiden Kopien weg, faellt es hier auf.
    expect(BETRIEB_STANDARD).toEqual({
      name: MANDANT_STANDARD.name, ort: MANDANT_STANDARD.ort,
      anzeigeName: MANDANT_STANDARD.anzeigeName, logo: MANDANT_STANDARD.logo,
      ...MANDANT_STANDARD.betrieb,
    });
  });

  it("Topbar und Anmeldebildschirm zeigen kein Blattwerk-Logo für eine fremde Firma", () => {
    expect(mandantMarke(fremd())).toEqual({ firma: "Baum Müller GbR", logo: "", gewerk: "" });
    expect(mandantMarke(fremd({ anzeigeName: "Baum Müller", logo: "/bm.png", betrieb: { gewerk: "Baumpflege" } })))
      .toEqual({ firma: "Baum Müller", logo: "/bm.png", gewerk: "Baumpflege" });
  });

  it("Blattwerks Marke bleibt unverändert — geladen wie ungeladen", () => {
    const soll = { firma: "Blattwerk", logo: "/logo.png", gewerk: "Baum- und Gartenpflege" };
    expect(mandantMarke(blattwerk())).toEqual(soll);
    expect(mandantMarke(null)).toEqual(soll);
  });

  // --- Befund I3: Blattwerk-Stammdaten im Fahrtenbuch jedes Mandanten ---

  it("Blattwerks Fahrtenbuch-Vorbelegungen bleiben unverändert", () => {
    expect(blattwerk().fahrtenbuch).toEqual({
      startStandard: "Betrieb, Zur Musterstraße 10, Musterstadt",
      fahrzeug: { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 2001" },
    });
  });

  it("ein fremder Mandant bekommt weder Blattwerks Hof noch Blattwerks Ducato", () => {
    // Das war der Befund: FB_START_STANDARD wurde bei leerem Startort in JEDE
    // Fahrt geschrieben, FB_FAHRZEUG_STANDARD war das Standardfahrzeug jedes
    // Mandanten. Lieber gar kein Vorschlag als ein falscher.
    expect(fremd().fahrtenbuch).toEqual({ startStandard: "", fahrzeug: null });
  });

  it("eigene Angaben kommen durch", () => {
    const m = fremd({ fahrtenbuch: { startStandard: "Hof, Musterweg 1, Gießen", fahrzeug: { id: "t1", name: "Sprinter", kennzeichen: "GI-BM 1" } } });
    expect(m.fahrtenbuch.startStandard).toBe("Hof, Musterweg 1, Gießen");
    expect(m.fahrtenbuch.fahrzeug).toEqual({ id: "t1", name: "Sprinter", kennzeichen: "GI-BM 1" });
  });

  it("ein Fahrzeug ohne Bezeichnung zählt nicht als Angabe", () => {
    // Sonst stünde in der Fahrzeugliste ein namenloser Eintrag, den niemand
    // zuordnen kann — der Platzhalter der App ist dafür der ehrlichere Weg.
    expect(fremd({ fahrtenbuch: { fahrzeug: { id: "x", kennzeichen: "GI-X 1" } } }).fahrtenbuch.fahrzeug).toBe(null);
  });

  it("MANDANT_STANDARD und FB_FAHRZEUG_STANDARD bleiben dasselbe Fahrzeug", () => {
    expect(MANDANT_STANDARD.fahrtenbuch.fahrzeug).toEqual(FB_FAHRZEUG_STANDARD);
  });

  // --- Befund I6: Kalender-Freigabe an Blattwerks Gruppe mit einem Klick ---

  it("die Vorbelegung der Kalender-Freigabe ist die eigene Gruppe, nie Blattwerks", () => {
    // Alle Mandanten teilen sich EINE Nextcloud — „Blattwerk" als Vorbelegung
    // haette einem fremden Admin mit einem Klick seinen Kalender in Blattwerks
    // Gruppe gelegt.
    expect(fremd().nextcloud.gruppe).toBe("Baum Müller GbR");
    expect(fremd({ nextcloud: { gruppe: "baum-mueller" } }).nextcloud.gruppe).toBe("baum-mueller");
    expect(fremd().nextcloud.gruppe).not.toBe("Blattwerk");
  });

  it("Blattwerks Gruppe bleibt Blattwerk", () => {
    expect(blattwerk().nextcloud.gruppe).toBe("Blattwerk");
    expect(ncGruppe(mandantLaden(null).mandant)).toBe("Blattwerk");
  });

  it("ohne eigene Gruppe gilt der Name des Team-Ordners", () => {
    const m = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR", nextcloud: { ordner: "BaumMueller" } })).mandant;
    expect(ncGruppe(m)).toBe(ncOrdner(m));
    expect(ncGruppe(m)).toBe("BaumMueller");
  });

  it("das Dienstkonto verlässt den Server nicht", () => {
    const m = fremd({ nextcloud: { gruppe: "bm", dienstkonto: { user: "bm-kalender", pass: "geheim" } } });
    expect(JSON.stringify(m)).not.toMatch(/geheim|bm-kalender/);
    expect(m.nextcloud).toEqual({ gruppe: "bm" });
  });
});