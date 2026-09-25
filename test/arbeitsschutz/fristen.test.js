// Fristen der Einweisungen an Arbeitsmitteln.
//
// Der wunde Punkt ist nicht die Rechnung, sondern die Bedeutung: „nie
// eingewiesen" darf niemals als „faellig" erscheinen. Faellig heisst, die
// Person war einmal freigegeben und die Frist laeuft ab. Wer nie eingewiesen
// wurde, darf das Geraet ueberhaupt nicht anfassen — das Protokollblatt sagt
// dazu: „Leeres Feld bedeutet: Gerät darf von dieser Person nicht benutzt
// werden." Eine Anzeige, die beides vermischt, behauptet eine Freigabe, die es
// nie gab. (07.08.2026)
import { describe, expect, it } from "vitest";
import {
  EW_GERAETE, EW_MONATE_ERWACHSEN, EW_MONATE_JUGEND, EW_VORWARNUNG_TAGE,
  ewDateiname, ewFaelligAm, ewFaelligkeiten, ewFehlt, ewGeraet, ewGesperrt,
  ewKopfFelder, ewLetzte, ewParse, ewPlusMonate, ewPruefUid, ewSperren,
  ewStatus, ewTage, ewUid, ewVoraussetzung, ewVoraussetzungen, fristStatus,
} from "../../src/arbeitsschutz.js";

const HEUTE = "2026-08-07";
const eintrag = (o = {}) => ({
  geraet: "heckenschere", login: "max", name: "Max Muster",
  datum: "2026-08-01", jugendlich: false, qualifikationBelegt: false, ...o,
});

describe("Geräteliste", () => {
  it("bildet die 16 Arbeitsmittel des Protokolls ab", () => {
    expect(EW_GERAETE).toHaveLength(16);
  });

  it("vergibt jede Kennung nur einmal", () => {
    expect(new Set(EW_GERAETE.map((g) => g.id)).size).toBe(16);
  });

  it("merkt sich, wo eine Voraussetzung erfüllt sein muss", () => {
    // Motorsaege, Akku-Motorsaege im Baum, Hubarbeitsbuehne, Minibagger,
    // Kletterausruestung — genau die fuenf Blaetter mit eigenem Feld.
    const mitQuali = EW_GERAETE.filter((g) => g.voraussetzungen.length).map((g) => g.id);
    expect(mitQuali).toEqual([
      "motorsaege", "akku-baumsaege", "hubarbeitsbuehne", "minibagger", "psa-absturz",
    ]);
  });

  it("hat zu jedem Gerät Inhalte und stabile Punkt-IDs", () => {
    // Die IDs sind durchnummeriert und nicht aus dem Text abgeleitet: eine
    // Umformulierung der Vorlage darf gespeicherte Protokolle nicht entwerten.
    for (const g of EW_GERAETE) {
      expect(g.inhalte.length, g.id).toBeGreaterThan(0);
      expect(g.inhalte.every((i) => /^p\d+$/.test(i.id)), g.id).toBe(true);
    }
    expect(EW_GERAETE.reduce((n, g) => n + g.inhalte.length, 0)).toBe(129);
  });

  it("findet ein Gerät über die Kennung und meldet Unbekanntes", () => {
    expect(ewGeraet("haecksler").label).toBe("Häcksler");
    expect(ewGeraet("kettensaege-2000")).toBe(null);
  });

  it("hat kurze, handverlesene Kennungen", () => {
    // Abgeschnittene Label-Slugs (frueher „persoenliche-schutzausruestung-…")
    // wuerden bei einer Umbenennung des Labels gespeicherte Protokolle
    // verwaisen lassen.
    expect(EW_GERAETE.map((g) => g.id)).toContain("psa-absturz");
    expect(EW_GERAETE.every((g) => g.id.length <= 20)).toBe(true);
  });
});

describe("ewParse", () => {
  it("nimmt ein gültiges Datum", () => {
    expect(ewParse("2026-08-07")).toEqual({ y: 2026, m: 8, d: 7 });
  });

  it("weist Tage zurück, die es nicht gibt", () => {
    expect(ewParse("2026-02-30")).toBe(null);
    expect(ewParse("2026-13-01")).toBe(null);
    expect(ewParse("2026-00-10")).toBe(null);
  });

  it("kommt mit Müll klar", () => {
    expect(ewParse("")).toBe(null);
    expect(ewParse(null)).toBe(null);
    expect(ewParse("07.08.2026")).toBe(null);
  });
});

describe("ewPlusMonate", () => {
  it("rechnet den Regelfall", () => {
    expect(ewPlusMonate("2026-08-07", 12)).toBe("2027-08-07");
    expect(ewPlusMonate("2026-08-07", 6)).toBe("2027-02-07");
  });

  it("klemmt auf den letzten Tag des Zielmonats", () => {
    // Ohne Klemmen rutscht der 31.08. + 6 Monate ueber setMonth auf den 03.03.
    // und die Frist liefe zwei Tage zu spaet ab.
    expect(ewPlusMonate("2026-08-31", 6)).toBe("2027-02-28");
    expect(ewPlusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(ewPlusMonate("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("überlebt den Schalttag", () => {
    expect(ewPlusMonate("2028-02-29", 12)).toBe("2029-02-28");
    expect(ewPlusMonate("2027-02-28", 12)).toBe("2028-02-28");
  });

  it("trägt den Jahreswechsel richtig", () => {
    expect(ewPlusMonate("2026-12-15", 1)).toBe("2027-01-15");
    expect(ewPlusMonate("2026-11-30", 6)).toBe("2027-05-30");
  });

  it("gibt bei kaputtem Datum nichts zurück", () => {
    expect(ewPlusMonate("2026-02-30", 12)).toBe(null);
  });
});

describe("ewFaelligAm", () => {
  it("gilt jährlich (§ 12 Abs. 1 BetrSichV, § 4 DGUV Vorschrift 1)", () => {
    expect(EW_MONATE_ERWACHSEN).toBe(12);
    expect(ewFaelligAm("2026-08-07", false)).toBe("2027-08-07");
  });

  it("gilt halbjährlich bei unter 18-Jährigen (§ 29 Abs. 2 JArbSchG)", () => {
    expect(EW_MONATE_JUGEND).toBe(6);
    expect(ewFaelligAm("2026-08-07", true)).toBe("2027-02-07");
  });
});

describe("ewTage", () => {
  it("zählt vorwärts und rückwärts", () => {
    expect(ewTage("2026-08-07", "2026-08-08")).toBe(1);
    expect(ewTage("2026-08-07", "2026-08-06")).toBe(-1);
    expect(ewTage("2026-08-07", "2026-08-07")).toBe(0);
  });

  it("lässt sich von der Sommerzeit nicht verschieben", () => {
    // Die Umstellung faellt in Deutschland auf den 25.10.2026. Ueber Date-
    // Objekte in Ortszeit gerechnet kaeme hier 30,96 statt 31 heraus — und
    // gerundet dann ein Tag zu wenig.
    expect(ewTage("2026-10-11", "2026-11-11")).toBe(31);
    expect(ewTage("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("ewStatus — die drei Zustände", () => {
  it("meldet ohne Eintrag nicht Fälligkeit, sondern Fehlen", () => {
    const st = ewStatus(null, HEUTE);
    expect(st.stufe).toBe("fehlt");
    expect(st.faellig).toBe(null);
    expect(ewGesperrt(st.stufe)).toBe(true);
  });

  it("meldet eine frische Einweisung als gültig", () => {
    expect(ewStatus(eintrag(), HEUTE).stufe).toBe("gueltig");
  });

  it("meldet eine abgelaufene Einweisung als überfällig", () => {
    const st = ewStatus(eintrag({ datum: "2025-01-05" }), HEUTE);
    expect(st.stufe).toBe("ueberfaellig");
    expect(st.tage).toBeLessThan(0);
    expect(ewGesperrt(st.stufe)).toBe(true);
  });

  it("warnt vor, bevor die Frist abläuft", () => {
    // 12 Monate nach dem 20.08.2025 -> 20.08.2026, das sind 13 Tage.
    const st = ewStatus(eintrag({ datum: "2025-08-20" }), HEUTE);
    expect(st.stufe).toBe("bald");
    expect(st.tage).toBe(13);
    expect(ewGesperrt(st.stufe)).toBe(false); // noch gültig, nur bald fällig
  });

  it("zählt den Fälligkeitstag selbst noch nicht als überfällig", () => {
    // Grenzfall: heute genau faellig. Wer hier „ueberfaellig" meldet, sperrt
    // ein Geraet einen Tag zu frueh.
    const st = ewStatus(eintrag({ datum: "2025-08-07" }), HEUTE);
    expect(st.tage).toBe(0);
    expect(st.stufe).toBe("bald");
  });

  it("hält den Vorwarn-Rand ein", () => {
    const genauAmRand = ewStatus(eintrag({ datum: "2025-09-06" }), HEUTE);
    expect(genauAmRand.tage).toBe(EW_VORWARNUNG_TAGE);
    expect(genauAmRand.stufe).toBe("bald");
    const einenTagSpaeter = ewStatus(eintrag({ datum: "2025-09-07" }), HEUTE);
    expect(einenTagSpaeter.tage).toBe(EW_VORWARNUNG_TAGE + 1);
    expect(einenTagSpaeter.stufe).toBe("gueltig");
  });

  it("rechnet für Jugendliche mit dem halben Abstand", () => {
    const erwachsen = ewStatus(eintrag({ datum: "2026-01-10" }), HEUTE);
    const jugend = ewStatus(eintrag({ datum: "2026-01-10", jugendlich: true }), HEUTE);
    expect(erwachsen.stufe).toBe("gueltig");
    expect(jugend.stufe).toBe("ueberfaellig"); // 10.07.2026 war die Frist
  });

  it("erkennt ein unbrauchbares Datum, statt es zu verrechnen", () => {
    expect(ewStatus(eintrag({ datum: "2026-02-30" }), HEUTE).stufe).toBe("ungueltig");
  });
});

describe("ewStatus — Qualifikation ist Voraussetzung, nicht Beiwerk", () => {
  it("sperrt ein Gerät mit Qualifikationspflicht ohne Nachweis", () => {
    // Der dokumentierte Fall im Betrieb: Max fehlt die Fachkunde Motorsaege
    // (offener Punkt 4 der Grundbeurteilung). Eine sauber protokollierte
    // Einweisung darf dieses Defizit nicht zudecken.
    const st = ewStatus(eintrag({ geraet: "motorsaege" }), HEUTE);
    expect(st.stufe).toBe("offen");
    expect(ewGesperrt(st.stufe)).toBe(true);
    expect(st.faellig).toBe("2027-08-01"); // Frist wird trotzdem gefuehrt
  });

  it("gibt dasselbe Gerät erst mit Stelle UND Datum frei", () => {
    // Ein blosser Haken genuegt nicht — ohne ausstellende Stelle und Datum
    // ist der Lehrgangsnachweis nicht ueberpruefbar.
    const nurHaken = eintrag({ geraet: "motorsaege", voraussetzungen: { v1: { erfuellt: true }, v2: { erfuellt: true } } });
    expect(ewStatus(nurHaken, HEUTE).stufe).toBe("offen");
    const ohneDatum = eintrag({ geraet: "motorsaege", voraussetzungen: { v1: { erfuellt: true, stelle: "SVLFG" }, v2: { erfuellt: true } } });
    expect(ewStatus(ohneDatum, HEUTE).stufe).toBe("offen");
    const vollstaendig = eintrag({ geraet: "motorsaege", voraussetzungen: {
      v1: { erfuellt: true, stelle: "SVLFG", datum: "2026-03-01" }, v2: { erfuellt: true } } });
    expect(ewStatus(vollstaendig, HEUTE).stufe).toBe("gueltig");
  });

  it("verlangt JEDE Voraussetzung, nicht nur die erste", () => {
    // psa-absturz hat drei: Lehrgang, G 41 und die zweite rettungsfaehige
    // Person. Genau die dritte ist im Betrieb das offene Defizit.
    const zweiVonDrei = eintrag({ geraet: "psa-absturz", voraussetzungen: {
      v1: { erfuellt: true, stelle: "SVLFG", datum: "2026-03-01" },
      v2: { erfuellt: true, datum: "2026-03-01", gueltigBis: "2029-03-01" },
    } });
    expect(ewStatus(zweiVonDrei, HEUTE).stufe).toBe("offen");
  });

  it("prüft auch das Ablaufdatum eines Nachweises auf Brauchbarkeit", () => {
    const kaputt = eintrag({ geraet: "akku-baumsaege", voraussetzungen: {
      v1: { erfuellt: true, stelle: "SVLFG", datum: "2026-03-01" },
      v2: { erfuellt: true, datum: "2026-03-01", gueltigBis: "irgendwann" },
    } });
    expect(ewStatus(kaputt, HEUTE).stufe).toBe("offen");
  });

  it("verlangt den Nachweis nicht, wo keiner vorgeschrieben ist", () => {
    expect(ewStatus(eintrag({ geraet: "rasenmaeher" }), HEUTE).stufe).toBe("gueltig");
  });

  it("meldet Überfälligkeit auch bei fehlendem Nachweis nicht als gültig", () => {
    const st = ewStatus(eintrag({ geraet: "minibagger", datum: "2024-01-01" }), HEUTE);
    expect(ewGesperrt(st.stufe)).toBe(true);
  });

  it("verlangt keinen Nachweis, wo die Vorlage keinen vorsieht", () => {
    expect(ewStatus(eintrag({ geraet: "leitern" }), HEUTE).stufe).toBe("gueltig");
  });
});

describe("ewLetzte", () => {
  const liste = [
    eintrag({ datum: "2024-05-05" }),
    eintrag({ datum: "2026-03-03" }),
    eintrag({ datum: "2025-01-01" }),
    eintrag({ login: "erika", datum: "2026-07-07" }),
    eintrag({ geraet: "haecksler", datum: "2026-07-30" }),
  ];

  it("nimmt die jüngste Einweisung", () => {
    expect(ewLetzte(liste, "heckenschere", "max").datum).toBe("2026-03-03");
  });

  it("verwechselt Personen und Geräte nicht", () => {
    expect(ewLetzte(liste, "heckenschere", "erika").datum).toBe("2026-07-07");
    expect(ewLetzte(liste, "haecksler", "max").datum).toBe("2026-07-30");
    expect(ewLetzte(liste, "minibagger", "max")).toBe(null);
  });

  it("übergeht Einträge mit kaputtem Datum, statt an ihnen zu scheitern", () => {
    const mitMuell = [eintrag({ datum: "irgendwann" }), eintrag({ datum: "2025-06-06" })];
    expect(ewLetzte(mitMuell, "heckenschere", "max").datum).toBe("2025-06-06");
  });

  it("kommt ohne Liste klar", () => {
    expect(ewLetzte(null, "heckenschere", "max")).toBe(null);
    expect(ewLetzte([], "heckenschere", "max")).toBe(null);
  });
});

describe("ewFaelligkeiten — was in die Erinnerung gehört", () => {
  const personen = [
    { login: "max", name: "Max Muster" },
    { login: "erika", name: "Erika Beispiel" },
  ];

  it("meldet nie eingewiesene Geräte NICHT als Frist", () => {
    // Sonst stuenden beim ersten Start 32 „Fristen" in der Mail, von denen
    // keine einzige eine ist.
    expect(ewFaelligkeiten([], personen, HEUTE)).toEqual([]);
  });

  it("meldet Abgelaufenes und bald Ablaufendes", () => {
    const liste = [
      eintrag({ datum: "2025-01-05" }),                                  // ueberfaellig
      eintrag({ geraet: "haecksler", datum: "2025-08-20" }),             // bald
      eintrag({ geraet: "rasenmaeher", datum: "2026-08-01" }),           // gueltig
    ];
    const out = ewFaelligkeiten(liste, personen, HEUTE);
    expect(out.map((o) => o.geraet)).toEqual(["heckenschere", "haecksler"]);
  });

  it("stellt das Dringendste nach vorn", () => {
    const liste = [
      eintrag({ geraet: "haecksler", datum: "2025-08-20" }),   // in 13 Tagen
      eintrag({ datum: "2024-01-01" }),                        // laengst ueberfaellig
    ];
    const out = ewFaelligkeiten(liste, personen, HEUTE);
    expect(out[0].geraet).toBe("heckenschere");
    expect(out[0].tage).toBeLessThan(out[1].tage);
  });

  it("nennt Person und Gerät im Klartext — die Mail liest ein Mensch", () => {
    const out = ewFaelligkeiten([eintrag({ datum: "2025-01-05" })], personen, HEUTE);
    expect(out[0].name).toBe("Max Muster");
    expect(out[0].label).toBe("Heckenschere");
  });

  it("meldet ohne Personen nichts", () => {
    expect(ewFaelligkeiten([eintrag({ datum: "2024-01-01" })], [], HEUTE)).toEqual([]);
  });
});

describe("ewSperren", () => {
  const personen = [{ login: "max", name: "Max Muster" }];

  it("führt jedes Gerät ohne Einweisung als gesperrt", () => {
    expect(ewSperren([], personen, HEUTE)).toHaveLength(EW_GERAETE.length);
  });

  it("nimmt ein freigegebenes Gerät heraus", () => {
    const out = ewSperren([eintrag()], personen, HEUTE);
    expect(out.map((o) => o.geraet)).not.toContain("heckenschere");
    expect(out).toHaveLength(EW_GERAETE.length - 1);
  });

  it("hält ein Gerät ohne Qualifikationsnachweis gesperrt", () => {
    const out = ewSperren([eintrag({ geraet: "motorsaege" })], personen, HEUTE);
    expect(out.find((o) => o.geraet === "motorsaege").stufe).toBe("offen");
  });
});

describe("ewUid — eine Auffrischung darf keinen zweiten Termin anlegen", () => {
  it("bleibt über Wiederholungen hinweg gleich", () => {
    expect(ewUid("motorsaege-verbrenner", "max"))
      .toBe(ewUid("motorsaege-verbrenner", "max"));
  });

  it("trennt Personen und Geräte", () => {
    expect(ewUid("motorsaege-verbrenner", "max")).not.toBe(ewUid("motorsaege-verbrenner", "erika"));
    expect(ewUid("motorsaege-verbrenner", "max")).not.toBe(ewUid("haecksler", "max"));
  });

  it("folgt dem Muster der übrigen Blattwerk-Termine", () => {
    expect(ewUid("haecksler", "max")).toBe("blattwerk-einweisung-haecksler-max@blattwerk");
    expect(ewPruefUid("grundbeurteilung")).toBe("blattwerk-arbeitsschutz-grundbeurteilung@blattwerk");
  });

  it("überlebt einen Login mit Sonderzeichen", () => {
    // Ein UID mit Umlaut oder Leerzeichen kommt durch iCal nicht unversehrt
    // zurueck — und dann zeigt die Auffrischung auf einen anderen Termin.
    const uid = ewUid("haecksler", "Max Müller");
    expect(uid).toBe("blattwerk-einweisung-haecksler-maxmller@blattwerk");
    expect(uid).toMatch(/^[a-z0-9.@_-]+$/);
  });
});

describe("ewVoraussetzung — Nachweis statt Ankreuzzeile", () => {
  // Die Papiervorlage schreibt die zu erfassenden Angaben als Platzhalter in
  // den Text („Ausstellende Stelle: ____ Datum: ____"). Sie werden gelesen,
  // nicht kopiert — sonst laufen Formular und Papier auseinander.
  const vonGeraet = (id, vid) => ewVoraussetzungen(id).find((v) => v.id === vid);

  it("erkennt Stelle und Datum, auch ohne Leerzeichen nach dem Punkt", () => {
    const v = vonGeraet("motorsaege", "v1");
    expect(v.felder.map((f) => f.key)).toEqual(["stelle", "datum"]);
    expect(v.text).toMatch(/^Nachweis der Fachkunde/);
    expect(v.text).not.toMatch(/_/);
    expect(v.text).not.toMatch(/Ausstellende Stelle/);
  });

  it("verwechselt die Feldbezeichnung nicht mit dem Satz davor", () => {
    // Der Satz besteht selbst nur aus Buchstaben, Punkten und Leerzeichen —
    // vorwaerts gesucht verschluckt ein Muster ihn mitsamt der Bezeichnung.
    const v = vonGeraet("minibagger", "v1");
    expect(v.felder.map((f) => f.key)).toEqual(["stelle", "datum"]);
    expect(v.text).toBe("Ausbildung und schriftliche Beauftragung für das Führen von Erdbaumaschinen.");
  });

  it("kennt das Ablaufdatum der Höhentauglichkeit", () => {
    const v = vonGeraet("psa-absturz", "v2");
    expect(v.felder.map((f) => f.key)).toEqual(["datum", "gueltigBis"]);
  });

  it("lässt reine Bestätigungen ohne Felder", () => {
    expect(vonGeraet("hubarbeitsbuehne", "v3").felder).toEqual([]);
    expect(vonGeraet("hubarbeitsbuehne", "v3").text).toBe("Mindestalter 18 Jahre.");
  });

  it("hinterlässt in keiner der zwölf Voraussetzungen einen Platzhalter", () => {
    for (const g of EW_GERAETE) {
      for (const v of ewVoraussetzungen(g.id)) {
        expect(v.text, `${g.id}/${v.id}`).not.toMatch(/_{2,}/);
        expect(v.text.trim().endsWith(":"), `${g.id}/${v.id}`).toBe(false);
      }
    }
  });

  it("kommt mit einer Voraussetzung ohne Platzhalter klar", () => {
    expect(ewVoraussetzung({ id: "x", label: "Nur ein Satz." })).toEqual({ id: "x", text: "Nur ein Satz.", felder: [] });
    expect(ewVoraussetzung(null).text).toBe("");
  });
});

describe("ewKopfFelder", () => {
  it("hängt die gerätespezifischen an die allgemeinen an", () => {
    const allg = ewKopfFelder("heckenschere").filter((f) => !/^k\d+$/.test(f.id));
    expect(allg.map((f) => f.id)).toEqual(["hersteller", "seriennr", "baujahr", "anleitung", "anleitungAusgehaendigt"]);
    // Der Anhaenger bringt die sicherheitsrelevanten Felder mit.
    expect(ewKopfFelder("anhaenger").filter((f) => /^k\d+$/.test(f.id))).toHaveLength(5);
  });

  it("macht Hersteller und Serien-Nr. zur Pflicht", () => {
    const pflicht = ewKopfFelder("haecksler").filter((f) => f.pflicht).map((f) => f.id);
    expect(pflicht).toContain("hersteller");
    expect(pflicht).toContain("seriennr");
  });
});

describe("ewFehlt — was vor der Unterschrift fehlt", () => {
  const voll = (o = {}) => {
    const g = ewGeraet("heckenschere");
    const inhalte = {};
    for (const i of g.inhalte) inhalte[i.id] = true;
    return {
      geraet: "heckenschere", login: "max", name: "Max Muster", datum: "2026-08-07",
      einweiser: "Erika Beispiel", einweiserQualifikation: "European Treeworker",
      kopf: { hersteller: "Stihl HS 82", seriennr: "12345", anleitung: true, k1: "AK 30" },
      inhalte, praxis: { vorgefuehrt: true, nachvollzogen: true }, ...o,
    };
  };

  it("meldet nichts, wenn alles da ist", () => {
    expect(ewFehlt(voll())).toEqual([]);
  });

  it("verlangt beide Praxis-Haken", () => {
    // „Vorführen allein genügt nicht" steht so in der Vorlage.
    expect(ewFehlt(voll({ praxis: { vorgefuehrt: true } }))).toContain(
      "Die eingewiesene Person hat die wesentlichen Handgriffe selbst ausgeführt.");
  });

  it("verlangt Hersteller und Serien-Nr.", () => {
    const ohne = ewFehlt(voll({ kopf: { anleitung: true } }));
    expect(ohne).toContain("Hersteller / Typ");
    expect(ohne).toContain("Serien- / Inventar-Nr.");
  });

  it("verlangt die Qualifikation der einweisenden Person", () => {
    // Ein Protokoll ohne sie belegt nicht, WER eingewiesen hat.
    expect(ewFehlt(voll({ einweiserQualifikation: "" }))).toContain("Qualifikation der einweisenden Person");
  });

  it("zählt nicht bestätigte Inhalte", () => {
    const teil = voll();
    delete teil.inhalte.p1;
    expect(ewFehlt(teil).join(" ")).toMatch(/1 von 9 Inhalten nicht bestätigt/);
  });

  it("verlangt die Voraussetzungen mitsamt ihren Feldern", () => {
    const g = ewGeraet("motorsaege");
    const inhalte = {};
    for (const i of g.inhalte) inhalte[i.id] = true;
    const m = voll({ geraet: "motorsaege", inhalte, kopf: { hersteller: "Stihl MS 261", seriennr: "9", anleitung: true } });
    expect(ewFehlt(m).some((x) => x.startsWith("Voraussetzung:"))).toBe(true);
    m.voraussetzungen = { v1: { erfuellt: true, stelle: "SVLFG", datum: "2026-03-01" }, v2: { erfuellt: true } };
    expect(ewFehlt(m)).toEqual([]);
  });

  it("meldet ein unbekanntes Gerät als Erstes", () => {
    expect(ewFehlt({ geraet: "laserschwert" })).toEqual(["Arbeitsmittel wählen"]);
  });
});

describe("ewDateiname", () => {
  it("stellt das Datum voran und wirft Umlaute raus", () => {
    // Umlaute ueberleben den Weg durch WebDAV, Scanner und Paperless nicht
    // ueberall unbeschadet.
    const n = ewDateiname({ datum: "2026-08-07", geraet: "haecksler", name: "Max Muster" });
    expect(n).toBe("EW_2026-08-07_Haecksler_Max-Muster.pdf");
    expect(n).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("bleibt auch beim längsten Gerätenamen brauchbar", () => {
    const n = ewDateiname({ datum: "2026-08-07", geraet: "psa-absturz", name: "Erika Beispiel" });
    expect(n).toMatch(/^EW_2026-08-07_Persoenliche-Schutzausruestung/);
    expect(n).not.toMatch(/[äöüßÄÖÜ /\\]/);
  });
});

describe("fristStatus (ausdrückliches Gültig-bis)", () => {
  it("ohne Datum ist es keine Frist, nicht etwa eine abgelaufene", () => {
    expect(fristStatus("", HEUTE)).toEqual({ stufe: "kein", tage: null });
    expect(fristStatus(null, HEUTE)).toEqual({ stufe: "kein", tage: null });
  });

  it("kaputtes Datum wird als unklar gemeldet, nicht als gültig", () => {
    expect(fristStatus("2026-13-99", HEUTE).stufe).toBe("ungueltig");
  });

  it("gestern abgelaufen ist überfällig", () => {
    expect(fristStatus("2026-08-06", HEUTE)).toEqual({ stufe: "ueberfaellig", tage: -1 });
  });

  it("heute ist der letzte Tag — noch nicht überfällig", () => {
    expect(fristStatus(HEUTE, HEUTE)).toEqual({ stufe: "bald", tage: 0 });
  });

  it("innerhalb der Vorwarnzeit läuft es ab", () => {
    expect(fristStatus("2026-09-05", HEUTE).stufe).toBe("bald");   // 29 Tage
  });

  it("einen Tag nach der Vorwarnzeit ist alles in Ordnung", () => {
    expect(fristStatus("2026-09-07", HEUTE)).toEqual({ stufe: "gueltig", tage: 31 });
  });

  it("die Vorwarnzeit ist überschreibbar", () => {
    expect(fristStatus("2026-10-01", HEUTE, 90).stufe).toBe("bald");
  });
});
