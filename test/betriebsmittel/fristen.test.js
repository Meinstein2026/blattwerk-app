// Fristen am Einzelstueck (Betriebsmittel-Register, 12.09.2026).
//
// Ein Los in Dolibarr (llx_product_lot) ist ein einzelner Reifen, ein einzelner
// Akku, ein einzelner Verbandkasten. An ihm haengen bis zu vier verschiedene
// Fristen, die nichts miteinander zu tun haben:
//
//   eatby                            Verfall des Inhalts (Verbandkasten)
//   letzte_pruefung + qc_frequency   wiederkehrende Pruefung (PSA: jaehrlich)
//   eol_date                         festes Lebensende (Akku, Helm)
//   manufacturing_date + lifetime    Alter ab Herstellung (Reifen, Helm)
//
// Dolibarr rechnet davon NICHTS aus und warnt bei keiner. Genau deshalb gibt
// es dieses Modul: die schaerfste der vier Fristen entscheidet, ob das Stueck
// in der App rot wird. Die Stufen heissen bewusst wie im Arbeitsschutz
// (`EW_STUFEN_TEXT`), damit Farbe und Wortlaut dort weiterbenutzt werden.
import { describe, expect, it } from "vitest";
import {
  BM_VORWARNUNG_TAGE, bmFristen, bmStatus, bmFaellige,
  bmToken, bmCode, bmCodeLesen, bmSeriennummer, bmKuerzel, bmEtikett, bmLos,
} from "../../src/betriebsmittel.js";

const HEUTE = "2026-09-12";

/** Minimales Los; einzelne Felder werden im Test ueberschrieben. */
const los = (extra = {}) => ({ rowid: 1, batch: "AKKU-2026-0001", fk_product: 435, ...extra });

describe("bmFristen", () => {
  it("kennt ohne jedes Datum gar keine Frist", () => {
    expect(bmFristen(los(), HEUTE)).toEqual([]);
  });

  it("nimmt das Verfallsdatum als Frist auf", () => {
    const f = bmFristen(los({ eatby: "2027-03-01" }), HEUTE);
    expect(f).toHaveLength(1);
    expect(f[0].grund).toBe("Verfall");
    expect(f[0].faellig).toBe("2027-03-01");
    expect(f[0].stufe).toBe("gueltig");
  });

  it("rechnet die naechste Pruefung aus letzter Pruefung plus Intervall", () => {
    // PSA gegen Absturz: jaehrliche Sachkundigenpruefung, hier 365 Tage.
    const f = bmFristen(los({ letzte_pruefung: "2026-03-01", qc_frequency: 365 }), HEUTE);
    expect(f[0].grund).toBe("Pruefung");
    expect(f[0].faellig).toBe("2027-03-01");
  });

  it("meldet eine faellige Pruefung, zu der es noch gar keine gibt", () => {
    // Intervall hinterlegt, aber nie geprueft: das ist nicht „gueltig", sondern
    // offen — sonst waere ein nie gepruefter Klettergurt gruen.
    const f = bmFristen(los({ qc_frequency: 365 }), HEUTE);
    expect(f).toHaveLength(1);
    expect(f[0].grund).toBe("Pruefung");
    expect(f[0].stufe).toBe("offen");
    expect(f[0].faellig).toBe(null);
  });

  it("rechnet das Alter ab Herstelldatum plus Lebensdauer", () => {
    const f = bmFristen(los({ manufacturing_date: "2020-09-12", lifetime: 365 * 6 }), HEUTE);
    expect(f[0].grund).toBe("Alter");
    expect(f[0].stufe).toBe("ueberfaellig");
  });

  it("nimmt ein ausdrueckliches Lebensende so, wie es dasteht", () => {
    const f = bmFristen(los({ eol_date: "2026-09-30" }), HEUTE);
    expect(f[0].grund).toBe("Lebensende");
    expect(f[0].stufe).toBe("bald");
  });

  it("haelt mehrere Fristen am selben Stueck auseinander", () => {
    const f = bmFristen(los({ eatby: "2028-01-01", eol_date: "2026-09-20" }), HEUTE);
    expect(f.map((x) => x.grund).sort()).toEqual(["Lebensende", "Verfall"]);
  });

  it("laesst sich von einem kaputten Datum nicht aus dem Tritt bringen", () => {
    const f = bmFristen(los({ eatby: "irgendwann" }), HEUTE);
    expect(f[0].stufe).toBe("ungueltig");
  });

  it("versteht Dolibarrs Datumsangaben mit Uhrzeit", () => {
    // llx_product_lot.eol_date ist datetime, eatby ist date — die API liefert
    // beides gemischt.
    const f = bmFristen(los({ eol_date: "2026-09-30 00:00:00" }), HEUTE);
    expect(f[0].faellig).toBe("2026-09-30");
    expect(f[0].stufe).toBe("bald");
  });
});

describe("bmStatus", () => {
  it("ist ohne jede Frist weder gruen noch rot", () => {
    // Die meisten Stuecke haben gar kein Datum. Gruen waere eine Behauptung.
    expect(bmStatus(los(), HEUTE).stufe).toBe("kein");
  });

  it("nimmt von mehreren Fristen die schaerfste, nicht die naechste", () => {
    const s = bmStatus(los({ eatby: "2026-09-15", eol_date: "2026-01-01" }), HEUTE);
    expect(s.stufe).toBe("ueberfaellig");
    expect(s.grund).toBe("Lebensende");
  });

  it("meldet bei gleicher Stufe die frueher faellige Frist", () => {
    const s = bmStatus(los({ eatby: "2026-09-20", eol_date: "2026-09-14" }), HEUTE);
    expect(s.stufe).toBe("bald");
    expect(s.grund).toBe("Lebensende");
  });

  it("warnt genau ab der Vorwarnzeit, nicht frueher", () => {
    const knapp = bmStatus(los({ eatby: "2026-10-12" }), HEUTE); // 30 Tage
    const weit = bmStatus(los({ eatby: "2026-10-13" }), HEUTE);  // 31 Tage
    expect(BM_VORWARNUNG_TAGE).toBe(30);
    expect(knapp.stufe).toBe("bald");
    expect(weit.stufe).toBe("gueltig");
  });

  it("wertet den Tag des Ablaufs noch nicht als ueberfaellig", () => {
    expect(bmStatus(los({ eatby: HEUTE }), HEUTE).tage).toBe(0);
    expect(bmStatus(los({ eatby: HEUTE }), HEUTE).stufe).toBe("bald");
  });
});

describe("bmFaellige", () => {
  const lose = [
    los({ rowid: 1, batch: "A", eatby: "2026-01-01" }),          // ueberfaellig
    los({ rowid: 2, batch: "B", eatby: "2026-09-20" }),          // bald
    los({ rowid: 3, batch: "C", eatby: "2030-01-01" }),          // gueltig
    los({ rowid: 4, batch: "D" }),                                // kein
    los({ rowid: 5, batch: "E", qc_frequency: 365 }),             // offen
  ];

  it("zeigt nur, was Aufmerksamkeit braucht", () => {
    expect(bmFaellige(lose, HEUTE).map((l) => l.batch)).toEqual(["A", "E", "B"]);
  });

  it("sortiert das Dringendste nach oben", () => {
    const [erst] = bmFaellige(lose, HEUTE);
    expect(erst.status.stufe).toBe("ueberfaellig");
  });

  it("kommt mit einer leeren Liste klar", () => {
    expect(bmFaellige([], HEUTE)).toEqual([]);
    expect(bmFaellige(null, HEUTE)).toEqual([]);
  });
});

describe("Code am Einzelstueck", () => {
  it("erzeugt Token, die sich nicht wiederholen", () => {
    const viele = new Set(Array.from({ length: 500 }, () => bmToken()));
    expect(viele.size).toBe(500);
  });

  it("erzeugt zehnstellige Ziffernfolgen", () => {
    // Ziffern, weil Code 128 im Zeichensatz C zwei davon in ein Symbol packt.
    // Mit Buchstaben waere der Strichcode zu breit fuer eine 40-mm-Rolle.
    for (let i = 0; i < 200; i++) expect(bmToken()).toMatch(/^\d{10}$/);
  });

  it("traegt eine Pruefziffer", () => {
    for (let i = 0; i < 200; i++) expect(bmCodeLesen(bmToken())).not.toBe(null);
  });

  it("packt das Token unveraendert in den Strichcode", () => {
    const t = bmToken();
    expect(bmCode(t)).toBe(t);
  });

  it("liest das eigene Format wieder aus", () => {
    const t = bmToken();
    expect(bmCodeLesen(bmCode(t))).toBe(t);
  });

  it("weist fremde Codes ab, statt sie zu raten", () => {
    // Ein Fremdcode darf nicht als Betriebsmittel durchgehen — sonst sucht die
    // App zu jedem EAN-Code der Welt ein Los.
    expect(bmCodeLesen("4006381333931")).toBe(null);      // EAN-13, zu lang
    expect(bmCodeLesen("BWM1:ABCDEFGH23456789")).toBe(null);
    expect(bmCodeLesen("")).toBe(null);
    expect(bmCodeLesen(null)).toBe(null);
  });

  it("faengt einen Zahlendreher ab", () => {
    // Genau dafuer ist die Pruefziffer da: wer eine Nummer abtippt, vertauscht
    // zwei Stellen, und die App soll das merken statt das falsche Stueck zu
    // oeffnen.
    // Feste Nummern statt `bmToken()`: mit einer zufaelligen Nummer scheiterte
    // dieser Test in etwa jedem vierzigsten Lauf — nicht aus Unachtsamkeit,
    // sondern weil Luhn den Dreher 0 <-> 9 bauartbedingt NICHT erkennt (siehe
    // den Fall darunter). Ein Test, der mal rot und mal gruen ist, sagt nichts.
    for (const t of ["1234567897", "9876543126", "1357924685", "2468135799"]) {
      const gedreht = t.slice(0, 3) + t[4] + t[3] + t.slice(5);
      expect(bmCodeLesen(gedreht)).toBe(null);
    }
  });

  it("erkennt den Dreher 0 <-> 9 NICHT — bekannte Grenze des Verfahrens", () => {
    // Luhn faengt jeden Dreher benachbarter Ziffern ab, ausser 09 <-> 90:
    // beide ergeben dieselbe Quersumme. Das ist keine Nachlaessigkeit, sondern
    // die bekannte Luecke des Verfahrens, und sie steht hier, damit niemand
    // spaeter glaubt, die Pruefziffer fange alles ab. Praktische Folge: eine
    // falsch abgetippte Nummer dieser Sorte kommt durch die Pruefung und
    // findet in der Datenbank kein Los — die App meldet dann „unbekannt",
    // statt das falsche Stueck zu oeffnen.
    const t = "0979044724";
    const gedreht = t.slice(0, 3) + t[4] + t[3] + t.slice(5); // 9 <-> 0
    expect(gedreht).toBe("0970944724");
    expect(bmCodeLesen(gedreht)).toBe(gedreht);
  });

  it("verraet fuer sich genommen nichts", () => {
    // „Nur ueber die App lesbar" heisst: der Code ist eine undurchsichtige
    // Nummer. Wer ihn scannt, sieht keine Artikel-, Kunden- oder Preisangabe.
    expect(bmCode(bmToken())).toMatch(/^\d{10}$/);
  });
});

describe("bmKuerzel", () => {
  it("nimmt vier Buchstaben aus dem ersten Wort", () => {
    expect(bmKuerzel("Akku Makita 18 V 3 Ah")).toBe("AKKU");
    expect(bmKuerzel("Reifen 155/80R13N KR209")).toBe("REIF");
    expect(bmKuerzel("Erste-Hilfe-Koffer DIN 13157")).toBe("ERST");
  });

  it("schreibt Umlaute aus, statt sie zu verschlucken", () => {
    expect(bmKuerzel("Ölkanister")).toBe("OELK");
  });

  it("fuellt kurze Woerter auf, damit die Nummer immer gleich lang ist", () => {
    expect(bmKuerzel("Öl 2-Takt")).toBe("OELX");
    expect(bmKuerzel("")).toBe("STCK");
    expect(bmKuerzel(null)).toBe("STCK");
  });
});

describe("bmSeriennummer", () => {
  it("baut eine lesbare Nummer aus Kuerzel, Jahr und laufender Zahl", () => {
    expect(bmSeriennummer("AKKU", 2026, 7)).toBe("AKKU-2026-0007");
  });

  it("zaehlt bei bestehenden Nummern desselben Jahres weiter", () => {
    const vorhanden = ["AKKU-2026-0001", "AKKU-2026-0009", "REIF-2026-0004", "AKKU-2025-0099"];
    expect(bmSeriennummer("AKKU", 2026, null, vorhanden)).toBe("AKKU-2026-0010");
  });

  it("faengt in einem neuen Jahr wieder bei eins an", () => {
    expect(bmSeriennummer("AKKU", 2027, null, ["AKKU-2026-0042"])).toBe("AKKU-2027-0001");
  });
});

describe("bmLos", () => {
  // Am lebenden Dolibarr 22.0.4 nachgemessen (12.09.2026). Beides hat beim
  // ersten Versuch die Ampel lahmgelegt, deshalb steht es hier als Test.
  it("versteht Datumsangaben als Unix-Zeitstempel", () => {
    // Die REST-Schnittstelle liefert 1872194400, in der Datenbank steht
    // 2029-04-30. Wer nur auf YYYY-MM-DD prueft, sieht ueberall „ungueltig".
    // Ortszeit, nicht UTC: Dolibarr legt ein reines Datum als Mitternacht der
    // Server-Zeitzone ab. Der Stempel wird hier aus einem Ortsdatum gebaut,
    // damit der Test in jeder Zeitzone dasselbe prueft.
    const stempel = Math.round(new Date(2029, 3, 30).getTime() / 1000);
    expect(bmLos({ eatby: stempel }).eatby).toBe("2029-04-30");
    expect(bmLos({ eatby: String(stempel) }).eatby).toBe("2029-04-30");
  });

  it("zieht die Extrafields flach", () => {
    const l = bmLos({ rowid: 4, array_options: {
      options_bm_token: "ABCDEFGH23456789", options_einbauposition: "VL",
      options_letzte_pruefung: Math.round(new Date(2026, 1, 28).getTime() / 1000),
      options_profiltiefe_mm: 7.5 } });
    expect(l.token).toBe("ABCDEFGH23456789");
    expect(l.einbauposition).toBe("VL");
    expect(l.letzte_pruefung).toBe("2026-02-28");
    expect(l.profiltiefe_mm).toBe(7.5);
  });

  it("nimmt den Code aus bm_token, nicht aus barcode", () => {
    // llx_product_lot.barcode existiert, aber /productlots schreibt die Spalte
    // nicht — POST und PUT geben 200 und lassen sie NULL. Wer sich darauf
    // verlaesst, druckt Etiketten ohne Code.
    expect(bmLos({ barcode: "AUSDERSPALTE1234" }).token).toBe(null);
  });

  it("laesst ein leeres Los leer", () => {
    expect(bmLos(null)).toBe(null);
  });
});

describe("bmEtikett", () => {
  const produkt = { ref: "PR-0000174", label: "Erste-Hilfe-Koffer DIN 13157" };
  const mitCode = (extra) => los({ array_options: { options_bm_token: "1149672048" }, ...extra });

  it("traegt den Code und die Seriennummer", () => {
    const e = bmEtikett(mitCode({ batch: "EH-2026-0003" }), produkt, HEUTE);
    expect(e.code).toBe("1149672048");
    expect(e.zeilen[0]).toBe("EH-2026-0003");
  });

  it("laesst die Artikelbezeichnung vom Etikett weg", () => {
    // Ansage Max 12.09.2026: neben dem Strichcode braucht es keinen Text.
    // Die Bezeichnung kommt trotzdem mit zurueck — die Liste in der App zeigt
    // sie an, nur die Rolle bleibt frei davon.
    const e = bmEtikett(mitCode({ batch: "EH-2026-0003" }), produkt, HEUTE);
    expect(e.zeilen).not.toContain("Erste-Hilfe-Koffer DIN 13157");
    expect(e.produkt).toBe("Erste-Hilfe-Koffer DIN 13157");
  });

  it("druckt das Verfallsdatum mit aufs Etikett", () => {
    // Der Sinn eines Verbandkasten-Etiketts ist, dass man das Datum sieht,
    // OHNE zu scannen.
    const e = bmEtikett(mitCode({ batch: "EH-2026-0003", eatby: "2029-04-30" }), produkt, HEUTE);
    expect(e.zeilen).toContain("verfaellt 30.04.2029");
  });

  it("bleibt bei zwei Zeilen", () => {
    // Mehr passt unter den Strichcode nicht, ohne dass die Nummer schrumpft.
    const e = bmEtikett(mitCode({ batch: "EH-2026-0003", eatby: "2029-04-30" }), produkt, HEUTE);
    expect(e.zeilen.length).toBeLessThanOrEqual(2);
  });

  it("verweigert ein Etikett ohne Code", () => {
    // Ein Etikett ohne Token waere nicht aufloesbar — lieber gar keins.
    expect(() => bmEtikett(los(), produkt, HEUTE)).toThrow(/Code/);
  });
});
