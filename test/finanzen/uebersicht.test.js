// Die Kontostaende-Kachel unter Verwaltung. Formeln am 20.08.2026 mit Max
// festgelegt:
//   Stand Max/Erika   = Saldo der Privateinlage-Konten (1892/1893)
//   Geldfluss           = bezahlte Kundenrechnungen − bezahlte Lieferantenrechnungen
//                         (Einlagen zaehlen nie mit, Anlagegueter voll drin)
//   Gewinn (EÜR)        = Geldfluss + Anlagegueter AUS RECHNUNGEN zurueck
//                         − betriebliche AfA (11.09.2026: Handlisten-Geraete
//                         stecken nie in `ausgaben`, sie zurueckzurechnen
//                         erfand Gewinn; Privatanteil mindert die AfA)
//                         (seit 09.09.2026: Anlagegueter > 800 € netto werden
//                         aus den Lieferantenrechnungen erkannt statt nur aus
//                         der Handliste — vorher zog jedes Geraet ausser dem
//                         Fiat den Gewinn voll runter)
//   Steuer-Ruecklage    = Satz × Gewinn
//   Bereinigter Stand   = Firmenkonten − offene Lieferantenrechnungen
//                         − Schulden an Gesellschafter − Steuer-Ruecklage
// Zwei Datenlagen, die die Rechnung kennen muss (20.08.2026 an der Instanz
// geprueft): Kundenrechnungen liefern totalpaid/remaintopay, Lieferanten-
// rechnungen NICHT — dort gilt paye=1 als voll bezahlt.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};

const code = schnitt(
  "// ─── Zahlungserfassung & Finanzübersicht",
  "// ─── Ende Zahlungserfassung & Finanzübersicht"
);
const sandbox = {};
vm.createContext(sandbox);
const {
  kontoRolle, kontoNurSteuer, afaBisher, afaJahr, afaImJahr, restwert, finanzUebersicht, GROSSGERAETE,
  GWG_GRENZE, nutzungsdauerVorschlag, anlagegueterErkennen, alleAnlagegueter, afaUebersicht, sonderAfaBetrag, sonderAfaJahrVon,
} = vm.runInContext(
  `(() => { ${code}; return { kontoRolle, kontoNurSteuer, afaBisher, afaJahr, afaImJahr, restwert, finanzUebersicht, GROSSGERAETE,
    GWG_GRENZE, nutzungsdauerVorschlag, anlagegueterErkennen, alleAnlagegueter, afaUebersicht, sonderAfaBetrag, sonderAfaJahrVon }; })()`,
  sandbox
);

describe("kontoRolle", () => {
  it("ordnet die Privateinlage-Konten den Gesellschaftern zu", () => {
    expect(kontoRolle({ account_number: "1892" })).toBe("inhaber");
    expect(kontoRolle({ account_number: "1893" })).toBe("partner");
  });
  it("alles andere ist Firmengeld", () => {
    expect(kontoRolle({ account_number: "1200" })).toBe("firma");
    expect(kontoRolle({ account_number: "1000" })).toBe("firma");
    expect(kontoRolle({})).toBe("firma");
  });
});

describe("kontoNurSteuer", () => {
  // Max' Vorgabe 20.08.2026: die VR-Konten zählen nur fürs Finanzamt als
  // Einlage, in der internen Ansicht nicht.
  it("erkennt die VR-Konten am Namen", () => {
    expect(kontoNurSteuer({ label: "Max VR Konto" })).toBe(true);
    expect(kontoNurSteuer({ label: "Erika VR Konto" })).toBe(true);
  });
  it("lässt normale Konten in der internen Sicht", () => {
    expect(kontoNurSteuer({ label: "Max Privat" })).toBe(false);
    expect(kontoNurSteuer({ label: "Musterbank eG" })).toBe(false);
    expect(kontoNurSteuer({ label: "Bargeld" })).toBe(false);
  });
});

describe("afaBisher", () => {
  const fiat = { name: "Fiat", betrag: 3600, gekauft: "2026-08-11", afaJahre: 6 };
  it("zaehlt angefangene Monate mit", () => {
    // Kaufmonat = 1. Monat: 3600 / 72 Monate = 50 €/Monat
    expect(afaBisher(fiat, "2026-08-20")).toBe(50);
    expect(afaBisher(fiat, "2026-09-01")).toBe(100);
  });
  it("liefert 0 vor dem Kauf", () => {
    expect(afaBisher(fiat, "2026-07-01")).toBe(0);
  });
  it("laeuft nie ueber den Kaufpreis hinaus", () => {
    expect(afaBisher(fiat, "2099-01-01")).toBe(3600);
  });
});

describe("afaJahr / restwert / afaImJahr", () => {
  const fiat = { name: "Fiat", betrag: 3600, gekauft: "2026-08-11", afaJahre: 6 };
  it("Jahres-AfA ist linear", () => {
    expect(afaJahr(fiat)).toBe(600);
  });
  it("Restwert = Anschaffung minus bisherige AfA", () => {
    expect(restwert(fiat, "2026-09-01")).toBe(3500);
    expect(restwert(fiat, "2099-01-01")).toBe(0);
  });
  it("AfA im Anschaffungsjahr nur ab Kaufmonat (§ 7 Abs. 1 S. 4 EStG)", () => {
    // Aug–Dez = 5 Monate à 50 €
    expect(afaImJahr(fiat, 2026)).toBe(250);
    expect(afaImJahr(fiat, 2027)).toBe(600);
    expect(afaImJahr(fiat, 2025)).toBe(0);
    // Letztes Jahr: Jan–Jul 2032 = 7 Monate
    expect(afaImJahr(fiat, 2032)).toBe(350);
    expect(afaImJahr(fiat, 2033)).toBe(0);
  });
});

describe("nutzungsdauerVorschlag (amtliche AfA-Tabelle)", () => {
  it("kennt die typischen GaLaBau-Geraete", () => {
    expect(nutzungsdauerVorschlag("Rasentraktor Husqvarna")).toBe(9);
    expect(nutzungsdauerVorschlag("Stihl Motorsäge MS 261")).toBe(5);
    expect(nutzungsdauerVorschlag("Freischneider FS 460")).toBe(5);
    expect(nutzungsdauerVorschlag("Häcksler GTM")).toBe(8);
    expect(nutzungsdauerVorschlag("Anhänger 750 kg")).toBe(11);
    expect(nutzungsdauerVorschlag("Fiat Ducato Transporter")).toBe(6);
    expect(nutzungsdauerVorschlag("Laptop ThinkPad")).toBe(3);
  });
  it("faellt sonst auf einen allgemeinen Werkzeug-Wert zurueck", () => {
    expect(nutzungsdauerVorschlag("Rüttelplatte")).toBe(7);
    expect(nutzungsdauerVorschlag("")).toBe(7);
  });
});

describe("anlagegueterErkennen", () => {
  const rechnungen = [
    // Zeile ueber 800 € netto mit Geraete-Schlagwort -> Anlagegut
    { id: 11, ref: "SI-11", ref_supplier: "R-1", statut: "2", paye: "1", date: 1786449600, total_ht: "1500", total_ttc: "1785",
      lines: [
        { rowid: 1, desc: "Rasentraktor Husqvarna TS 142", total_ht: "1300", total_ttc: "1547" },
        { rowid: 2, desc: "Motoröl 5 l", total_ht: "200", total_ttc: "238" },
      ] },
    // Zeile ueber 800 € ohne Schlagwort: Kandidat, aber nicht automatisch Anlagegut
    { id: 12, ref: "SI-12", statut: "2", paye: "1", date: "2026-07-01", total_ht: "1200", total_ttc: "1284",
      lines: [{ rowid: 3, desc: "Containerpflanzen Lieferung Baumschule", total_ht: "1200", total_ttc: "1284" }] },
    // Ohne Zeilen: ganze Rechnung, ueber der Grenze, Konto 04xx -> Anlagegut
    { id: 13, ref: "SI-13", label: "Anhänger Humbaur", statut: "1", paye: "0", date: "2026-06-15", total_ht: "2000", total_ttc: "2380",
      lines: [{ rowid: 4, desc: "Tandemanhänger", total_ht: "2000", total_ttc: "2380", fk_code_ventilation: "100500440" }] },
    // Unter der GWG-Grenze: nie
    { id: 14, ref: "SI-14", statut: "2", paye: "1", date: "2026-05-01", total_ht: "790", total_ttc: "940",
      lines: [{ rowid: 5, desc: "Heckenschere HS 82", total_ht: "790", total_ttc: "940" }] },
    // Entwurf: nie
    { id: 15, ref: "SI-15", statut: "0", paye: "0", date: "2026-05-01", total_ht: "5000", total_ttc: "5950",
      lines: [{ rowid: 6, desc: "Motorsäge", total_ht: "5000", total_ttc: "5950" }] },
  ];
  it("die Grenze ist die GWG-Grenze von 800 € netto", () => {
    expect(GWG_GRENZE).toBe(800);
  });
  it("findet Kandidaten je Rechnungszeile ueber 800 € netto, nicht darunter", () => {
    const k = anlagegueterErkennen(rechnungen);
    expect(k.map((a) => a.key)).toEqual(["lr-11-1", "lr-12-3", "lr-13-4"]);
  });
  it("erkennt Geraete am Schlagwort oder am Anlagekonto, Pflanzen bleiben Kandidat", () => {
    const k = anlagegueterErkennen(rechnungen);
    expect(k.find((a) => a.key === "lr-11-1").anlagegut).toBe(true);
    expect(k.find((a) => a.key === "lr-12-3").anlagegut).toBe(false);
    expect(k.find((a) => a.key === "lr-13-4").anlagegut).toBe(true);
  });
  it("traegt Netto, Brutto als AfA-Basis (Kleinunternehmer), Datum und Nutzungsdauer", () => {
    const a = anlagegueterErkennen(rechnungen).find((x) => x.key === "lr-11-1");
    expect(a.name).toBe("Rasentraktor Husqvarna TS 142");
    expect(a.netto).toBe(1300);
    expect(a.betrag).toBe(1547);
    expect(a.gekauft).toBe("2026-08-11");
    expect(a.afaJahre).toBe(9);
    expect(a.bezahlt).toBe(true);
    expect(anlagegueterErkennen(rechnungen).find((x) => x.key === "lr-13-4").bezahlt).toBe(false);
  });
  it("Konfiguration je Geraet ueberstimmt Erkennung und Nutzungsdauer", () => {
    const k = anlagegueterErkennen(rechnungen, {
      "lr-12-3": { anlagegut: true, afaJahre: 4, name: "Grossgeraet X" },
      "lr-11-1": { anlagegut: false },
    });
    expect(k.find((a) => a.key === "lr-12-3")).toMatchObject({ anlagegut: true, afaJahre: 4, name: "Grossgeraet X" });
    expect(k.find((a) => a.key === "lr-11-1").anlagegut).toBe(false);
  });
  it("alleAnlagegueter = Handliste + erkannte, nur die als Anlagegut markierten", () => {
    const hand = [{ key: "manuell-0", name: "Fiat", betrag: 3700, gekauft: "2026-08-11", afaJahre: 6 }];
    const alle = alleAnlagegueter({ lieferantenRechnungen: rechnungen, grossgeraete: hand });
    expect(alle.map((a) => a.key)).toEqual(["manuell-0", "lr-11-1", "lr-13-4"]);
    // Handliste laesst sich je Eintrag abschalten.
    const ohne = alleAnlagegueter({ lieferantenRechnungen: rechnungen, grossgeraete: hand, konfig: { "manuell-0": { anlagegut: false } } });
    expect(ohne.map((a) => a.key)).toEqual(["lr-11-1", "lr-13-4"]);
  });
});

describe("GROSSGERAETE", () => {
  // Zweimal am 11.09.2026 geaendert: erst geleert (der Fiat stand doppelt
  // drin, einmal hier und einmal als Lieferantenrechnung), dann als
  // maßgebliche Liste aus Dolibarrs Anlagen-Modul wieder gefuellt — weil
  // die Rechnungs-Erkennung die beiden Kaeufe von 2025 nicht finden kann.
  // Gegen das Doppeltzaehlen schuetzt jetzt `rechnungRef`, nicht die Leere.
  it("fuehrt jedes Anlagegut genau einmal", () => {
    const keys = GROSSGERAETE.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("nennt fuer die Rechnungs-Kaeufe den Beleg, damit sie nicht doppelt zaehlen", () => {
    for (const g of GROSSGERAETE.filter((x) => x.inAusgaben)) {
      expect(g.rechnungRef).toMatch(/^SI\d/);
    }
  });
});

describe("finanzUebersicht", () => {
  // Nachbau der echten Kontenlage vom 20.08.2026 (vereinfachte Zahlen).
  const konten = [
    { label: "Volksbank", account_number: "1200", balance: "1000", clos: "0" },
    { label: "Bargeld", account_number: "1000", balance: "-100", clos: "0" },
    { label: "Max VR", account_number: "1892", balance: "-500", clos: "0" },
    { label: "Max Privat", account_number: "1892", balance: "-100", clos: "0" },
    { label: "Erika", account_number: "1893", balance: "0", clos: "0" },
  ];
  const rechnungen = [
    { statut: "2", total_ttc: "800", totalpaid: "800", remaintopay: 0 },   // bezahlt
    { statut: "1", total_ttc: "200", totalpaid: "50", remaintopay: 150 },  // teilbezahlt
    { statut: "0", total_ttc: "999", totalpaid: "0", remaintopay: 999 },   // Entwurf: zaehlt nirgends
    { statut: "3", total_ttc: "500", totalpaid: "0", remaintopay: 500 },   // Storno: zaehlt nirgends
  ];
  const lieferantenRechnungen = [
    { statut: "2", paye: "1", total_ttc: "300" },  // bezahlt
    { statut: "1", paye: "0", total_ttc: "120" },  // offen
    { statut: "0", paye: "0", total_ttc: "999" },  // Entwurf: zaehlt nicht
  ];
  const grossgeraete = [{ name: "Fiat", betrag: 3600, gekauft: "2026-08-11", afaJahre: 6 }];
  const u = finanzUebersicht({
    konten, rechnungen, lieferantenRechnungen,
    heute: "2026-08-20", grossgeraete, steuerSatz: 0.3,
  });

  it("Gesellschafter-Stand OHNE die VR-Konten (die zählen nur steuerlich)", () => {
    // "Max VR" (−500) bleibt draußen, nur "Max Privat" (−100) zählt.
    expect(u.standInhaber).toBe(-100);
    expect(u.standPartner).toBe(0);
  });
  it("Firmenkonten = Bank + Bargeld", () => {
    expect(u.firmenKonten).toBe(900);
  });
  it("Geldfluss = gezahlte Kundenbetraege minus bezahlte Lieferantenrechnungen", () => {
    // 800 + 50 (Teilzahlung zaehlt mit ihrem gezahlten Teil) − 300
    expect(u.geldfluss).toBe(550);
  });
  it("Gewinn zieht die AfA ab; der Handlisten-Fiat wird NICHT zurueckgerechnet", () => {
    // Korrigiert 11.09.2026: frueher stand hier 3600/4100. Der Fiat steht in
    // der Handliste, weil es dazu KEINE Lieferantenrechnung gibt — er kann
    // also nicht in `ausgaben` stecken und darf nicht zurueckgerechnet werden.
    // 550 − 50 AfA = 500
    expect(u.anlagenAbzug).toBe(0);
    expect(u.afaSumme).toBe(50);
    expect(u.gewinn).toBe(500);
  });
  it("offene Posten: Kunden nach Restbetrag, Lieferanten nur validierte unbezahlte", () => {
    expect(u.offeneKunden).toBe(150);
    expect(u.offeneLieferanten).toBe(120);
  });
  it("Steuer-Ruecklage rechnet auf dem EÜR-Gewinn", () => {
    // Basis = 550 − 50 AfA = 500 → 30 % = 150
    expect(u.steuerBasis).toBe(500);
    expect(u.steuerRuecklage).toBe(150);
  });
  it("aus Lieferantenrechnungen erkannte Anlagegueter werden nicht mehr voll abgezogen", () => {
    // Bezahlter Rasentraktor 1547 brutto (1300 netto) am 11.08.2026, 9 Jahre:
    // AfA bis 20.08.2026 = 1 Monat = 1547/108 = 14,32
    const lr = [
      ...lieferantenRechnungen,
      { id: 11, ref: "SI-11", statut: "2", paye: "1", date: "2026-08-11", total_ht: "1300", total_ttc: "1547",
        lines: [{ rowid: 1, desc: "Rasentraktor Husqvarna", total_ht: "1300", total_ttc: "1547" }] },
    ];
    const v = finanzUebersicht({ konten, rechnungen, lieferantenRechnungen: lr, heute: "2026-08-20", grossgeraete, steuerSatz: 0.3 });
    expect(v.geldfluss).toBe(550 - 1547);
    expect(v.anlagenAbzug).toBe(1547); // nur die Rechnung, nicht der Handlisten-Fiat
    expect(v.afaSumme).toBeCloseTo(50 + 1547 / 108, 2);
    expect(v.gewinn).toBeCloseTo(500 - 1547 / 108, 2);
    expect(v.anlagegueter.map((a) => a.key)).toEqual(["manuell-0", "lr-11-1"]);
  });
  it("unbezahlte Anlagegueter: AfA laeuft, aber nichts wird zurueckgerechnet", () => {
    const lr = [
      { id: 13, statut: "1", paye: "0", date: "2026-06-15", total_ht: "2000", total_ttc: "2380",
        lines: [{ rowid: 4, desc: "Anhänger", total_ht: "2000", total_ttc: "2380" }] },
    ];
    const v = finanzUebersicht({ konten, rechnungen: [], lieferantenRechnungen: lr, heute: "2026-08-20", grossgeraete: [], steuerSatz: 0.3 });
    expect(v.ausgaben).toBe(0);
    expect(v.anlagenAbzug).toBe(0);
    // Jun–Aug = 3 Monate à 2380/132
    expect(v.afaSumme).toBeCloseTo(3 * 2380 / 132, 2);
    expect(v.gewinn).toBeCloseTo(-3 * 2380 / 132, 2);
  });
  it("bereinigter Stand zieht Schulden an Gesellschafter (ohne VR) und Ruecklage ab", () => {
    // 900 − 120 − 100 − 150 = 530
    expect(u.bereinigt).toBe(530);
  });
  it("negative Steuerbasis erzeugt keine negative Ruecklage", () => {
    const v = finanzUebersicht({
      konten, rechnungen: [], lieferantenRechnungen,
      heute: "2026-08-20", grossgeraete: [], steuerSatz: 0.3,
    });
    expect(v.steuerRuecklage).toBe(0);
  });
});

// ─── 11.09.2026: drei Fehler in der Gewinn-/Einlagen-Rechnung ───────────────
// Max: „ich habe doch mehr einlagen als 600€ allein der fiat und wir hatten
// vorher gewinn -3000€ und jetzt +6000€". An der Instanz nachgerechnet:
//   1. Die Handliste rechnet Geld zurueck, das nie in `ausgaben` stand. Ein
//      Handlisten-Eintrag existiert genau deshalb, weil es KEINE Lieferanten-
//      rechnung dazu gibt (privat gezahlt) — er kann also nicht „voll in den
//      Ausgaben stecken". Ihn zurueckzurechnen erfindet Gewinn.
//      Die alte Kopfzeile oben („Anlagegueter zurueckgerechnet") war deshalb
//      zu pauschal: zurueckgerechnet wird nur, was aus einer Rechnung kam.
//   2. Privatanteil war gar nicht abgebildet — beim Fiat sind rund 30 % privat.
//   3. Die Einlagen-Kachel zeigte nur das Konto ohne „VR" im Namen (639,50)
//      statt der tatsaechlichen Einlage (~7.494).
describe("Anlagegueter aus der Handliste (privat gezahlt)", () => {
  const basis = {
    konten: [], rechnungen: [], lieferantenRechnungen: [], heute: "2026-09-11", steuerSatz: 0,
  };
  const fiat = [{ key: "manuell-0", name: "Fiat", betrag: 3700, netto: 3700, gekauft: "2026-08-11", afaJahre: 6 }];

  it("rechnet einen Handlisten-Eintrag NICHT in den Anlagen-Abzug", () => {
    const f = finanzUebersicht({ ...basis, grossgeraete: fiat });
    expect(f.anlagenAbzug).toBe(0);
  });

  it("setzt seine AfA trotzdem an — er mindert den Gewinn", () => {
    const f = finanzUebersicht({ ...basis, grossgeraete: fiat });
    expect(f.afaSumme).toBeCloseTo(afaBisher({ betrag: 3700, afaJahre: 6, gekauft: "2026-08-11" }, "2026-09-11"), 2);
    expect(f.gewinn).toBeCloseTo(-f.afaSumme, 2);
  });

  it("rechnet dagegen ein Geraet aus einer Lieferantenrechnung weiter zurueck", () => {
    const lr = [{ id: 9, ref: "SI-9", statut: 1, paye: 1, date: "2026-08-11", total_ttc: "3700", total_ht: "3700", label: "Heckkipper" }];
    const f = finanzUebersicht({ ...basis, lieferantenRechnungen: lr, grossgeraete: [] });
    expect(f.anlagenAbzug).toBe(3700);
  });
});

describe("Privatanteil (Nutzungsanteil)", () => {
  const basis = { konten: [], rechnungen: [], lieferantenRechnungen: [], heute: "2027-08-11", steuerSatz: 0, grossgeraete: [] };
  const lr = [{ id: 9, ref: "SI-9", statut: 1, paye: 1, date: "2026-08-11", total_ttc: "3600", total_ht: "3600", label: "Fiat Ducato" }];

  it("ohne Angabe bleibt alles betrieblich (100 %)", () => {
    const f = finanzUebersicht({ ...basis, lieferantenRechnungen: lr });
    expect(f.afaSumme).toBeCloseTo(650, 2); // 3600/72 je Monat, Aug 26–Aug 27 = 13
  });

  it("bei 70 % betrieblich mindert nur der betriebliche Teil der AfA den Gewinn", () => {
    const f = finanzUebersicht({ ...basis, lieferantenRechnungen: lr, anlagenKonfig: { "lr-9-ges": { nutzungsanteil: 0.7 } } });
    expect(f.afaSumme).toBeCloseTo(455, 2);   // 70 % von 650
    expect(f.afaVoll).toBeCloseTo(650, 2);
    expect(f.privatanteilAfa).toBeCloseTo(195, 2);
  });
});

describe("Einlagen der Gesellschafter", () => {
  const konten = [
    { account_number: "1892", label: "Max Privat", balance: "-639.50", clos: 0 },
    { account_number: "1892", label: "Max VR Konto", balance: "-6854.91", clos: 0 },
    { account_number: "1893", label: "Erika Konto", balance: "0", clos: 0 },
  ];
  const f = () => finanzUebersicht({ konten, rechnungen: [], lieferantenRechnungen: [], heute: "2026-09-11", grossgeraete: [], steuerSatz: 0 });

  it("liefert die tatsaechliche Einlage inklusive der VR-Konten", () => {
    expect(f().einlageInhaber).toBeCloseTo(7494.41, 2);
    expect(f().einlagePartner).toBeCloseTo(0, 2);
  });

  it("laesst die interne Sicht unveraendert (Max' Vorgabe 20.08.2026)", () => {
    expect(f().standInhaber).toBeCloseTo(-639.50, 2);
    expect(f().schuldenGesellschafter).toBeCloseTo(639.50, 2);
  });
});

// ─── 11.09.2026: „aber die afa von den 3 ist ja hoeher als 500€!!" ──────────
// Max hat recht — es gibt drei verschiedene AfA-Zahlen, und die App zeigte
// nur die kleinste:
//   bis heute   524,49  (aufgelaufen seit dem jeweiligen Kaufmonat)
//   ganzes 2026 854,36  (die Zahl fuer die EUER dieses Jahres)
//   je Jahr    1319,50  (voller Satz, sobald alle drei ein ganzes Jahr laufen)
// `afaImJahr` gab es schon, wurde aber nirgends angezeigt.
describe("afaUebersicht", () => {
  const g = [
    { betrag: 5670, afaJahre: 11, gekauft: "2026-02-19" },
    { betrag: 1499, afaJahre: 8, gekauft: "2026-05-10" },
    { betrag: 3700, afaJahre: 6, gekauft: "2026-08-10" },
  ];

  it("trennt aufgelaufen, Kalenderjahr und vollen Jahressatz", () => {
    const u = afaUebersicht(g, "2026-09-11");
    expect(u.bisHeute).toBeCloseTo(524.49, 2);
    expect(u.imJahr).toBeCloseTo(854.36, 2);
    expect(u.proJahr).toBeCloseTo(1319.50, 2);
  });

  it("im Folgejahr laufen alle drei voll — Kalenderjahr = Jahressatz", () => {
    const u = afaUebersicht(g, "2027-12-31");
    expect(u.imJahr).toBeCloseTo(u.proJahr, 2);
  });

  it("der Nutzungsanteil schlaegt auf alle drei Zahlen durch", () => {
    const halb = g.map((x) => ({ ...x, nutzungsanteil: 0.5 }));
    const voll = afaUebersicht(g, "2026-09-11");
    const u = afaUebersicht(halb, "2026-09-11");
    expect(u.bisHeute).toBeCloseTo(voll.bisHeute / 2, 2);
    expect(u.imJahr).toBeCloseTo(voll.imJahr / 2, 2);
    expect(u.proJahr).toBeCloseTo(voll.proJahr / 2, 2);
  });

  it("ohne Anlagegueter ist alles null", () => {
    const u = afaUebersicht([], "2026-09-11");
    expect(u).toEqual({ bisHeute: 0, imJahr: 0, proJahr: 0, sonderAfa: 0 });
  });
});

// ─── Sonderabschreibung § 7g Abs. 5 EStG ────────────────────────────────────
// Beschluss im Vault (Projects/fahrzeugsuche-arbeitsfahrzeug.md, 14.08.2026):
// Fiat linear ueber 2 Jahre PLUS 740 € Sonder-AfA (20 % von 3.700), von Hand
// gebucht auf 4852 an 0940 zum 31.12.2026. Die App kannte davon nichts — sie
// liest nur Lieferantenrechnungen, Journalbuchungen sieht sie nicht.
//
// Voraussetzung ist fast ausschliessliche betriebliche Nutzung (>= 90 %).
// Deshalb haengt die Sonder-AfA hier am Nutzungsanteil: faellt der darunter,
// gibt es sie nicht — das soll die App nicht stillschweigend uebergehen.
describe("sonderAfa", () => {
  const fiat = { betrag: 3700, afaJahre: 2, gekauft: "2026-08-10", nutzungsanteil: 0.9, sonderAfaProzent: 20 };

  it("rechnet den Prozentsatz auf die Anschaffungskosten", () => {
    expect(sonderAfaBetrag(fiat)).toBeCloseTo(740, 2);
  });

  it("ohne Angabe gibt es keine", () => {
    expect(sonderAfaBetrag({ betrag: 3700, gekauft: "2026-08-10" })).toBe(0);
  });

  it("deckelt bei 20 % — mehr laesst § 7g Abs. 5 nicht zu", () => {
    expect(sonderAfaBetrag({ ...fiat, sonderAfaProzent: 50 })).toBeCloseTo(740, 2);
  });

  it("entfaellt unter 90 % betrieblicher Nutzung", () => {
    expect(sonderAfaBetrag({ ...fiat, nutzungsanteil: 0.7 })).toBe(0);
    expect(sonderAfaBetrag({ ...fiat, nutzungsanteil: 0.9 })).toBeCloseTo(740, 2);
  });

  it("faellt ins Anschaffungsjahr, solange kein anderes Jahr gewaehlt ist", () => {
    expect(sonderAfaJahrVon(fiat)).toBe(2026);
    expect(sonderAfaJahrVon({ ...fiat, sonderAfaJahr: 2028 })).toBe(2028);
  });
});

describe("afaUebersicht mit Sonder-AfA", () => {
  const g = [{ betrag: 3700, afaJahre: 2, gekauft: "2026-08-10", nutzungsanteil: 0.9, sonderAfaProzent: 20 }];

  it("zaehlt die Sonder-AfA ins Kalenderjahr", () => {
    const u = afaUebersicht(g, "2026-09-11");
    // linear Aug–Dez = 5 Monate à 3700/24, davon 90 % = 693,75
    expect(u.imJahr).toBeCloseTo(770.83 * 0.9 + 740, 2);
    expect(u.sonderAfa).toBeCloseTo(740, 2);
  });

  it("laesst sie aber aus dem Aufgelaufenen heraus, solange das Jahr laeuft", () => {
    // Gebucht wird sie zum 31.12. — am 11.09. ist sie noch nicht da.
    const u = afaUebersicht(g, "2026-09-11");
    expect(u.bisHeute).toBeCloseTo(3700 / 24 * 2 * 0.9, 2);
  });

  it("ist sie einmal gebucht, zaehlt sie im Aufgelaufenen mit", () => {
    const u = afaUebersicht(g, "2027-03-01");
    expect(u.bisHeute).toBeGreaterThan(740);
  });

  it("der volle Jahressatz kennt sie nicht — sie gibt es nur einmal", () => {
    expect(afaUebersicht(g, "2026-09-11").proJahr).toBeCloseTo(3700 / 2 * 0.9, 2);
  });
});

// ─── Die Anlagenliste kommt aus Dolibarrs Anlagen-Modul (11.09.2026) ────────
// Bis dahin riet die App die Anlagegueter aus Lieferantenrechnungen — und
// uebersah dadurch alles, was ohne Rechnung in Dolibarr steht: Kofferanhaenger
// und Haecksler (beide 2025 gekauft, Beleg ist der Kaufvertrag in der
// Nextcloud). Dolibarr fuehrt sie im Anlagen-Modul (llx_asset), das REST-API
// gibt sie aber nicht heraus (HTTP 501), deshalb stehen sie hier.
//
// Entscheidend ist `inAusgaben`: nur was ueber eine bezahlte Lieferanten-
// rechnung auch wirklich in `ausgaben` gelandet ist, darf zurueckgerechnet
// werden. Die zwei aus 2025 duerfen es nicht — sonst wird wieder Gewinn
// erfunden, derselbe Fehler wie heute frueh beim Fiat.
describe("GROSSGERAETE aus dem Anlagen-Modul", () => {
  it("kennt alle fuenf Anlagegueter", () => {
    expect(GROSSGERAETE.map((g) => g.name)).toEqual([
      "Anhänger Koffer 750kg", "Häcksler", "Heckkipper", "Stubbenfräse", "Fiat Ducato",
    ]);
  });

  it("nur die drei aus 2026 stecken in den Ausgaben", () => {
    const drin = GROSSGERAETE.filter((g) => g.inAusgaben).map((g) => g.name);
    expect(drin).toEqual(["Heckkipper", "Stubbenfräse", "Fiat Ducato"]);
  });

  it("traegt ueberall die Sonderabschreibung § 7g Abs. 5", () => {
    for (const g of GROSSGERAETE) expect(g.sonderAfaProzent).toBe(20);
  });

  it("rechnet nur die drei aus 2026 zurueck", () => {
    const f = finanzUebersicht({
      konten: [], rechnungen: [], lieferantenRechnungen: [], heute: "2026-09-11", steuerSatz: 0,
    });
    expect(f.anlagenAbzug).toBeCloseTo(5670 + 1499 + 3700, 2);
  });

  it("setzt fuer alle fuenf AfA an, auch fuer die ohne Rechnung", () => {
    const f = finanzUebersicht({
      konten: [], rechnungen: [], lieferantenRechnungen: [], heute: "2026-09-11", steuerSatz: 0,
    });
    expect(f.anlagegueter).toHaveLength(5);
    expect(f.afa.bisHeute).toBeGreaterThan(0);
  });
});
