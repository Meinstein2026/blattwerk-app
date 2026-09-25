// Die Prüfungen des Pflicht-Tutorials. Sie sind der eigentliche Lehrstoff:
// eine Prüfung, die nur „falsch" sagt, bringt niemandem etwas bei — deshalb
// wird hier nicht nur geprüft, DASS eine Eingabe abgelehnt wird, sondern auch,
// dass die Ablehnung das richtige Feld benennt.
import { describe, expect, it } from "vitest";
import {
  TUTORIAL_VERSION, TUTORIAL_CODE, tutorialCodeStimmt, UEBUNGEN, UEBUNG_ZUSCHNITT_ZIEL, UEBUNG_ZUSCHNITT_START,
  pruefeZeit, pruefeGbu, pruefeZuschnitt, pruefeBeleg, pruefeKunde, pruefeProjekt,
  tagVersetzt, dtDe, zahl, tutorialEntscheidung,
} from "../../src/tutorial/uebungen.js";

const HEUTE = "2026-08-09";

// Nachtrag aus der Prüfung vom 09.08.2026 (Befund W6): die Kette, die über
// "pflicht" entscheidet, stand vorher ungetestet mitten im Effekt in
// dolibarr-app.jsx — genau dort saß Befund K1 (geräteweiter statt
// login-eigener Schlüssel). Jetzt reine Funktion, hier vollständig geprüft.
describe("tutorialEntscheidung", () => {
  const FERTIG = { abgeschlossen: { max: { am: "2026-08-01", fassung: TUTORIAL_VERSION } } };
  const ALT = { abgeschlossen: { max: { am: "2026-01-01", fassung: Math.max(0, TUTORIAL_VERSION - 1) } } };
  const UNBEKANNT = { abgeschlossen: {} };

  it("Server meldet abgeschlossen mit aktueller Fassung -> frei", () => {
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: FERTIG, login: "max" })).toBe("frei");
  });
  it("Server meldet ältere Fassung -> pflicht", () => {
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: ALT, login: "max" })).toBe("pflicht");
  });
  it("Server meldet nichts ueber diese Person -> pflicht", () => {
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: UNBEKANNT, login: "max" })).toBe("pflicht");
  });
  it("Server antwortet gar nicht und lokal ist nichts -> anbieten", () => {
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: null, login: "max" })).toBe("anbieten");
  });
  it("Server antwortet gar nicht, lokal ist es fertig -> frei", () => {
    expect(tutorialEntscheidung({ lokaleFassung: TUTORIAL_VERSION, antwort: null, login: "max" })).toBe("frei");
  });
  it("Server antwortet, lokal fertig, Server weiß nichts -> nachtragen", () => {
    expect(tutorialEntscheidung({ lokaleFassung: TUTORIAL_VERSION, antwort: UNBEKANNT, login: "max" })).toBe("nachtragen");
  });
  it("kein Login -> immer anbieten, niemals pflicht", () => {
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: UNBEKANNT, login: "" })).toBe("anbieten");
    expect(tutorialEntscheidung({ lokaleFassung: 0, antwort: null, login: undefined })).toBe("anbieten");
    expect(tutorialEntscheidung({ lokaleFassung: TUTORIAL_VERSION, antwort: FERTIG, login: null })).toBe("anbieten");
  });
});

describe("Hilfsfunktionen", () => {
  it("rechnet Tage über Monatsgrenzen", () => {
    expect(tagVersetzt("2026-08-01", -1)).toBe("2026-07-31");
    expect(tagVersetzt("2026-12-31", 1)).toBe("2027-01-01");
    expect(tagVersetzt("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("schreibt Datum deutsch", () => {
    expect(dtDe("2026-08-08")).toBe("08.08.2026");
  });
  it("nimmt Komma wie Punkt", () => {
    expect(zahl("18,90")).toBe(18.9);
    expect(zahl("18.90")).toBe(18.9);
    expect(zahl("")).toBe(null);
    expect(zahl("zwei")).toBe(null);
  });
});

describe("Übung 1: Zeit buchen", () => {
  // Seit 12.08.2026 werden Beginn, Ende und Pause geübt statt einer Stundenzahl:
  // § 17 MiLoG verlangt Beginn und Ende, und die echte Maske fragt sie ab.
  const richtig = { datum: "2026-08-08", von: "08:00", bis: "11:00", pause: "30", aufgabe: "t1", beschreibung: "Hecke geschnitten" };
  it("nimmt die richtige Eingabe an", () => {
    expect(pruefeZeit(richtig, HEUTE)).toBe(null);
  });
  it("nimmt die Pause auch mit Komma", () => {
    expect(pruefeZeit({ ...richtig, pause: "30,0" }, HEUTE)).toBe(null);
  });
  it("benennt das Datum, wenn heute statt gestern gebucht wird", () => {
    const f = pruefeZeit({ ...richtig, datum: HEUTE }, HEUTE);
    expect(f.feld).toBe("datum");
    expect(f.text).toContain("08.08.2026");
  });
  it("benennt den Beginn, nicht bloß „falsch“", () => {
    expect(pruefeZeit({ ...richtig, von: "09:00" }, HEUTE).feld).toBe("von");
  });
  it("benennt das Ende", () => {
    expect(pruefeZeit({ ...richtig, bis: "10:30" }, HEUTE).feld).toBe("bis");
  });
  it("benennt die Pause, weil sie von der Arbeitszeit abgeht", () => {
    expect(pruefeZeit({ ...richtig, pause: "0" }, HEUTE).feld).toBe("pause");
  });
  it("benennt die Aufgabe, wenn die falsche gewählt ist", () => {
    expect(pruefeZeit({ ...richtig, aufgabe: "t3" }, HEUTE).feld).toBe("aufgabe");
  });
  it("verlangt eine Beschreibung", () => {
    expect(pruefeZeit({ ...richtig, beschreibung: "   " }, HEUTE).feld).toBe("beschreibung");
  });
});

describe("Übung 2: Gefährdungsbeurteilung", () => {
  const punkteOk = {
    psa: { wert: "ok", massnahme: "" },
    saege: { wert: "mangel", massnahme: "Gerät getauscht" },
    rettung: { wert: "ok", massnahme: "" },
  };
  const richtig = {
    einsatzort: "Musterweg 5, Musterstadt", wind: "maessig", arbeitsart: "faellung",
    baum: "1 Birke, Vorgarten", arbeiten: ["Fällung"], zugang: "boden",
    punkte: punkteOk, unterschrift: "data:image/png;base64,x",
  };
  it("nimmt die richtige Eingabe an", () => {
    expect(pruefeGbu(richtig)).toBe(null);
  });
  it("verlangt den Einsatzort", () => {
    expect(pruefeGbu({ ...richtig, einsatzort: "" }).feld).toBe("einsatzort");
  });
  it("verlangt die Arbeitsart aus dem Auftrag", () => {
    expect(pruefeGbu({ ...richtig, arbeitsart: "heckenschnitt" }).feld).toBe("arbeitsart");
  });
  it("verlangt den Baum bei einer Fällung", () => {
    expect(pruefeGbu({ ...richtig, baum: "" }).feld).toBe("baum");
  });
  it("benennt einen unbewerteten Prüfpunkt mit seinem Namen", () => {
    const f = pruefeGbu({ ...richtig, punkte: { ...punkteOk, rettung: { wert: "", massnahme: "" } } });
    expect(f.feld).toBe("punkt-rettung");
    expect(f.text).toContain("Erste-Hilfe");
  });
  it("lässt die klemmende Kettenbremse nicht als OK durchgehen", () => {
    const f = pruefeGbu({ ...richtig, punkte: { ...punkteOk, saege: { wert: "ok", massnahme: "" } } });
    expect(f.feld).toBe("punkt-saege");
  });
  it("verlangt zu jedem Mangel eine Maßnahme", () => {
    const f = pruefeGbu({ ...richtig, punkte: { ...punkteOk, saege: { wert: "mangel", massnahme: "" } } });
    expect(f.feld).toBe("massnahme-saege");
  });
  it("verlangt die Unterschrift zuletzt", () => {
    expect(pruefeGbu({ ...richtig, unterschrift: "" }).feld).toBe("unterschrift");
  });
});

describe("Übung 3: Beleg erfassen", () => {
  it("nimmt einen Zuschnitt innerhalb der Toleranz an", () => {
    expect(pruefeZuschnitt(UEBUNG_ZUSCHNITT_ZIEL)).toBe(null);
    const knapp = UEBUNG_ZUSCHNITT_ZIEL.map((p) => ({ x: p.x + 0.03, y: p.y - 0.03 }));
    expect(pruefeZuschnitt(knapp)).toBe(null);
  });
  it("lehnt die unveränderten Startecken ab und benennt die Ecke", () => {
    const f = pruefeZuschnitt(UEBUNG_ZUSCHNITT_START);
    expect(f.feld).toBe("ecke-0");
    expect(f.text).toContain("Ecke");
  });

  const richtig = { lieferant: "l1", datum: "2026-08-03", menge: "2", preis: "18,90", konto: "3400" };
  it("nimmt die richtige Eingabe an", () => {
    expect(pruefeBeleg(richtig)).toBe(null);
  });
  it("verlangt den Lieferanten", () => {
    expect(pruefeBeleg({ ...richtig, lieferant: "" }).feld).toBe("lieferant");
  });
  it("lässt den falschen Lieferanten nicht durch — auf dem Beleg steht l1, nicht l2", () => {
    expect(pruefeBeleg({ ...richtig, lieferant: "l2" }).feld).toBe("lieferant");
  });
  it("erkennt den falsch gelesenen Preis und nennt den richtigen", () => {
    const f = pruefeBeleg({ ...richtig, preis: "1,89" });
    expect(f.feld).toBe("preis");
    expect(f.text).toContain("18,90");
  });
  it("nimmt den Preis auch mit Punkt", () => {
    expect(pruefeBeleg({ ...richtig, preis: "18.90" })).toBe(null);
  });
  it("lässt 4900 nicht stehen, nimmt aber jedes andere Konto", () => {
    expect(pruefeBeleg({ ...richtig, konto: "4900" }).feld).toBe("konto");
    expect(pruefeBeleg({ ...richtig, konto: "4985" })).toBe(null);
  });
});

describe("Übung 4: Kunde und Projekt", () => {
  const kunde = { name: "Mustermann Grünanlagen GmbH", adresse: "Musterstraße 12", plz: "12345", ort: "Musterstadt" };
  it("nimmt die richtige Eingabe an", () => {
    expect(pruefeKunde(kunde)).toBe(null);
  });
  it("nimmt Umlaut-Ersatzschreibung an", () => {
    expect(pruefeKunde({ ...kunde, name: "Mustermann Gruenanlagen GmbH", ort: "Musterstadt" })).toBe(null);
  });
  it("benennt die PLZ", () => {
    expect(pruefeKunde({ ...kunde, plz: "12340" }).feld).toBe("plz");
  });
  it("benennt die Adresse, wenn die Hausnummer fehlt", () => {
    expect(pruefeKunde({ ...kunde, adresse: "Musterstraße" }).feld).toBe("adresse");
  });

  const projekt = { titel: "Heckenschnitt Musterstraße", kunde: "k1", dateStart: "2026-08-10", timeStart: "08:00" };
  it("nimmt das richtige Projekt an", () => {
    expect(pruefeProjekt(projekt, HEUTE)).toBe(null);
  });
  it("benennt das Startdatum mit dem richtigen Tag", () => {
    const f = pruefeProjekt({ ...projekt, dateStart: HEUTE }, HEUTE);
    expect(f.feld).toBe("dateStart");
    expect(f.text).toContain("10.08.2026");
  });
  it("verlangt den Kunden", () => {
    expect(pruefeProjekt({ ...projekt, kunde: "" }, HEUTE).feld).toBe("kunde");
  });
});

describe("Aufbau", () => {
  it("hat vier Übungen in fester Reihenfolge", () => {
    expect(UEBUNGEN.map((u) => u.id)).toEqual(["zeit", "gbu", "beleg", "kundeprojekt"]);
  });
  it("jede Übung hat einen Auftrag im Klartext", () => {
    for (const u of UEBUNGEN) {
      expect(u.titel.length).toBeGreaterThan(3);
      expect(u.auftrag.length).toBeGreaterThan(30);
    }
  });
  it("die Fassungsnummer ist eine positive ganze Zahl", () => {
    expect(Number.isInteger(TUTORIAL_VERSION)).toBe(true);
    expect(TUTORIAL_VERSION).toBeGreaterThan(0);
  });
});

// Nachtrag aus der Prüfung vom 09.08.2026: von den Ablehnungs-Zweigen oben
// waren zehn nur mit richtigen Eingaben belegt. Wer einen davon löscht, bleibt
// grün — und zwei Zweige waren tatsächlich löchrig (leeres Buchungskonto, die
// Hausnummer 512 statt 12). Deshalb hier zu JEDEM Zweig eine falsche Eingabe.
describe("Jeder Ablehnungs-Zweig wird mit einer falschen Eingabe belegt", () => {
  const HEUTE_N = "2026-08-09";

  it("Zeit: falscher Beginn", () => {
    const e = { datum: "2026-08-08", von: "07:00", bis: "11:00", pause: "30", aufgabe: "t1", beschreibung: "x" };
    expect(pruefeZeit(e, HEUTE_N).feld).toBe("von");
  });

  it("Zeit: falsches Ende", () => {
    const e = { datum: "2026-08-08", von: "08:00", bis: "12:00", pause: "30", aufgabe: "t1", beschreibung: "x" };
    expect(pruefeZeit(e, HEUTE_N).feld).toBe("bis");
  });

  it("Zeit: falsche Pause", () => {
    const e = { datum: "2026-08-08", von: "08:00", bis: "11:00", pause: "45", aufgabe: "t1", beschreibung: "x" };
    expect(pruefeZeit(e, HEUTE_N).feld).toBe("pause");
  });

  const gbu = {
    einsatzort: "Musterweg 5", wind: "maessig", arbeitsart: "faellung",
    baum: "1 Birke", arbeiten: ["Fällung"], zugang: "boden",
    punkte: {
      psa: { wert: "ok", massnahme: "" },
      saege: { wert: "mangel", massnahme: "Gerät getauscht" },
      rettung: { wert: "ok", massnahme: "" },
    },
    unterschrift: "x",
  };
  it("GBU: falscher Wind", () => {
    expect(pruefeGbu({ ...gbu, wind: "windstill" }).feld).toBe("wind");
  });
  it("GBU: Fällung fehlt bei den Arbeiten", () => {
    expect(pruefeGbu({ ...gbu, arbeiten: ["Kronenpflege"] }).feld).toBe("arbeiten");
  });
  it("GBU: kein Zugang gewählt", () => {
    expect(pruefeGbu({ ...gbu, zugang: "" }).feld).toBe("zugang");
  });

  const beleg = { lieferant: "l1", datum: "2026-08-03", menge: "2", preis: "18,90", konto: "3400" };
  it("Beleg: falsches Rechnungsdatum", () => {
    expect(pruefeBeleg({ ...beleg, datum: "2026-08-04" }).feld).toBe("datum");
  });
  it("Beleg: falsche Menge", () => {
    expect(pruefeBeleg({ ...beleg, menge: "1" }).feld).toBe("menge");
  });
  it("Beleg: gar kein Konto gewählt gilt nicht als bestanden", () => {
    // Sonst zählt ein nie angefasstes Auswahlfeld als geprüft.
    expect(pruefeBeleg({ ...beleg, konto: "" }).feld).toBe("konto");
    expect(pruefeBeleg({ ...beleg, konto: undefined }).feld).toBe("konto");
  });

  const kunde = { name: "Mustermann Grünanlagen GmbH", adresse: "Musterstraße 12", plz: "12345", ort: "Musterstadt" };
  it("Kunde: falscher Name", () => {
    expect(pruefeKunde({ ...kunde, name: "Meier Garten GmbH" }).feld).toBe("name");
  });
  it("Kunde: falscher Ort", () => {
    expect(pruefeKunde({ ...kunde, ort: "Marburg" }).feld).toBe("ort");
  });
  it("Kunde: falsche Hausnummer wird nicht als Teilzeichenkette durchgewinkt", () => {
    expect(pruefeKunde({ ...kunde, adresse: "Musterstraße 512" }).feld).toBe("adresse");
    expect(pruefeKunde({ ...kunde, adresse: "Musterstraße 120" }).feld).toBe("adresse");
  });

  const projekt = { titel: "Heckenschnitt Musterstraße", kunde: "k1", dateStart: "2026-08-10", timeStart: "08:00" };
  it("Projekt: Titel ohne die Arbeit", () => {
    expect(pruefeProjekt({ ...projekt, titel: "Neues Projekt" }, HEUTE_N).feld).toBe("titel");
  });
  it("Projekt: falsche Startzeit", () => {
    expect(pruefeProjekt({ ...projekt, timeStart: "09:00" }, HEUTE_N).feld).toBe("timeStart");
  });

  it("Zuschnitt: ein Loch im Eckenarray meldet die Ecke, statt zu stürzen", () => {
    const kaputt = [...UEBUNG_ZUSCHNITT_ZIEL];
    kaputt[2] = undefined;
    expect(pruefeZuschnitt(kaputt).feld).toBe("ecke-2");
  });
  it("Zuschnitt: kein Array oder falsche Länge meldet ecke-0, statt zu stürzen", () => {
    expect(pruefeZuschnitt(null).feld).toBe("ecke-0");
    expect(pruefeZuschnitt([UEBUNG_ZUSCHNITT_ZIEL[0]]).feld).toBe("ecke-0");
  });
});

describe("Überspringen mit Code", () => {
  it("nimmt den Code an, egal wie er getippt wurde", () => {
    expect(tutorialCodeStimmt(TUTORIAL_CODE)).toBe(true);
    expect(tutorialCodeStimmt(" 000 00 ")).toBe(true);
    expect(tutorialCodeStimmt("000-00")).toBe(true);
  });

  it("laesst nichts durch, was nicht der Code ist", () => {
    expect(tutorialCodeStimmt("")).toBe(false);
    expect(tutorialCodeStimmt("   ")).toBe(false);
    expect(tutorialCodeStimmt(null)).toBe(false);
    expect(tutorialCodeStimmt(undefined)).toBe(false);
    expect(tutorialCodeStimmt("00001")).toBe(false);
    expect(tutorialCodeStimmt("000000")).toBe(false);
  });
});
