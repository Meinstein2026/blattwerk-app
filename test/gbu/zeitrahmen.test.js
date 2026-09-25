// Einsatz nach Zeit statt nach Stückzahl (11.09.2026)
//
// Max' Fall: „Macht innerhalb von 8 h bei so vielen Bäumen wie möglich
// Totholzentfernung." Die Anzahl steht vorher nicht fest, abgerechnet und
// gearbeitet wird nach Zeit. Bis jetzt verlangte das Formular eine Angabe im
// Feld „Baum/Bäume" — eine erfundene Zahl wäre schlimmer als keine.
//
// Neu: `anzahlOffen` + `zeitrahmenStunden`. Dann beschreibt `baum` den
// BEREICH, nicht die Stückzahl, und der Zeitrahmen ist ein eigenes Feld —
// er muss im Datensatz und im PDF stehen, sonst ist er nirgends belegt.
import { describe, expect, it } from "vitest";
import { validateGbu, gbuUmfangText, gbuUebernahme } from "../../src/gbu-data.js";

const basis = (x = {}) => ({
  arbeitsart: "baumpflege", zugang: "boden",
  baum: "Schlosspark, Altbaumbestand an der Allee",
  arbeiten: ["Totholz entfernen"], arbeitenSonstiges: "",
  baumdaten: { sicher: "ja", bemerkung: "" },
  items: {}, sigDurchfuehrender: "x",
  ...x,
});
// Alle Checklistenpunkte auf OK — sonst verdeckt „Alle Punkte bewerten" die
// Meldung, um die es hier geht.
const ohneCheckliste = (r) => validateGbu(r).filter((f) => !/Alle Punkte bewerten/.test(f));

describe("Umfang: Zeitrahmen statt Stückzahl", () => {
  it("ohne Zeitrahmen bleibt alles wie bisher", () => {
    expect(ohneCheckliste(basis())).toEqual([]);
  });

  it("„Anzahl offen“ ohne Stundenzahl wird abgewiesen — sonst steht nirgends ein Maß", () => {
    const f = ohneCheckliste(basis({ anzahlOffen: true }));
    expect(f.join(" ")).toMatch(/Zeitrahmen|Stunden/i);
  });

  it("„Anzahl offen“ mit Stundenzahl geht durch", () => {
    expect(ohneCheckliste(basis({ anzahlOffen: true, zeitrahmenStunden: 8 }))).toEqual([]);
  });

  it("unsinnige Stundenzahlen werden abgewiesen", () => {
    for (const h of [0, -3, 25, "acht"]) {
      expect(ohneCheckliste(basis({ anzahlOffen: true, zeitrahmenStunden: h })).join(" "), String(h))
        .toMatch(/Zeitrahmen|Stunden/i);
    }
  });

  it("bei offener Anzahl muss der Bereich beschrieben sein — irgendwo wird ja gearbeitet", () => {
    const f = ohneCheckliste(basis({ anzahlOffen: true, zeitrahmenStunden: 8, baum: "" }));
    expect(f.join(" ")).toMatch(/Bereich/i);
  });

  it("ein Zeitrahmen darf auch bei fester Anzahl dabeistehen", () => {
    expect(ohneCheckliste(basis({ zeitrahmenStunden: 6 }))).toEqual([]);
  });
});

describe("Umfang als Text (Maske und PDF zeigen denselben Satz)", () => {
  it("nach Zeit, Anzahl offen", () => {
    expect(gbuUmfangText({ anzahlOffen: true, zeitrahmenStunden: 8 }))
      .toBe("8 h — so viele Bäume wie möglich, Anzahl vorher offen");
  });
  it("halbe Stunden bleiben erhalten", () => {
    expect(gbuUmfangText({ anzahlOffen: true, zeitrahmenStunden: 4.5 })).toMatch(/4,5 h/);
  });
  it("Zeitrahmen bei fester Anzahl", () => {
    expect(gbuUmfangText({ zeitrahmenStunden: 6 })).toBe("6 h vorgesehen");
  });
  it("ohne Zeitrahmen kein Satz", () => {
    expect(gbuUmfangText({})).toBe("");
    expect(gbuUmfangText(null)).toBe("");
    expect(gbuUmfangText({ anzahlOffen: true })).toBe("");
  });
});

describe("Übernahme trägt den Zeitrahmen mit", () => {
  it("Zeitrahmen und die offene Anzahl gehören zum wiederkehrenden Einsatz", () => {
    const u = gbuUebernahme({ anzahlOffen: true, zeitrahmenStunden: 8, baum: "Schlosspark" });
    expect(u.form.anzahlOffen).toBe(true);
    expect(u.form.zeitrahmenStunden).toBe(8);
    expect(u.form.baum).toBe("Schlosspark");
  });
  it("ohne Zeitrahmen bleibt das Feld leer statt undefined", () => {
    expect(gbuUebernahme({}).form.zeitrahmenStunden).toBe("");
    expect(gbuUebernahme({}).form.anzahlOffen).toBe(false);
  });
});

describe("Übernahme darf die Baumsicherheit NICHT mitbringen", () => {
  // Der Fehler, der am 11.09. zuerst mit ausgeliefert wurde: `baumdaten` wurde
  // komplett kopiert, also auch `sicher`. Genau dieses Feld ist das einzige
  // Tor, das sagt „hier hat jemand hingeschaut“ — validateGbu verlangt es.
  // Unter einem Zeitrahmen mit unbekannter Baumzahl wiegt das doppelt: dann
  // ist nicht einmal klar, um welchen Baum es ginge.
  const alt = {
    baumdaten: {
      baumart: "Bergahorn", hoehe: "14", bhd: "45", stock: "60",
      haenger: ["Vorhänger"], umfeld: ["Gebäude"], stamm: [], krone: [],
      gewicht: "einseitig", kronenzustand: "dürr",
      sicher: "ja", bemerkung: "war voriges Mal in Ordnung",
    },
  };
  const u = gbuUebernahme(alt);

  it("die Bewertung „Baum ist sicher“ kommt nicht mit", () => {
    expect(u.baumdaten.sicher).toBe("");
  });
  it("die Bemerkung dazu auch nicht", () => {
    expect(u.baumdaten.bemerkung).toBe("");
  });
  it("die Beurteilung ist danach wieder unvollständig — genau so soll es sein", () => {
    const record = { ...basis(), baumdaten: u.baumdaten };
    expect(ohneCheckliste(record).join(" ")).toMatch(/Baumsicherheitsbeurteilung/);
  });
  it("Maße desselben Baums bleiben — die ändern sich zwischen zwei Besuchen nicht", () => {
    expect(u.baumdaten).toMatchObject({ baumart: "Bergahorn", hoehe: "14", bhd: "45", stock: "60" });
  });
  it("auch der beurteilte Zustand (Hänger, Umfeld, Krone) wird neu angeschaut", () => {
    expect(u.baumdaten.haenger).toEqual([]);
    expect(u.baumdaten.umfeld).toEqual([]);
    expect(u.baumdaten.gewicht).toBe("");
    expect(u.baumdaten.kronenzustand).toBe("");
  });
});

// ── PDF: der Zeitrahmen muss im Nachweis stehen ─────────────────────────────
// Ein nach Zeit bemessener Einsatz, dessen Zeitrahmen nur in der Maske stand
// und nicht im PDF, wäre im Nachhinein nicht belegbar.
import { buildGbuPdf } from "../../src/gbu-pdf.js";

// buildGbuPdf verweigert seit der Review zu Task 5 ohne betrieb.name — Werte
// wie mandantBetrieb(null) in dolibarr-app.jsx (Blattwerks eigene Konfig).
const BLATTWERK_BETRIEB = {
  name: "Blattwerk GbR", ort: "Musterstadt", uvTraeger: "SVLFG", grundGbu: "",
  anschrift: "Musterstraße 1, 12345 Musterstadt", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk",
};

const pdfText = async (record) => {
  const base64 = await buildGbuPdf({
    id: "gbu-1", createdAt: "2026-09-11T07:00:00.000Z", userName: "Max",
    niederschlag: "trocken", wind: "windstill",
    ...record,
  }, { betrieb: BLATTWERK_BETRIEB });
  // jsPDF komprimiert nicht; die Textstücke stehen als (…)Tj im Rumpf.
  return Buffer.from(base64, "base64").toString("latin1");
};

describe("Zeitrahmen im PDF", () => {
  it("nennt Umfang und Arbeitsbereich statt einer Stückzahl", async () => {
    const roh = await pdfText(basis({ anzahlOffen: true, zeitrahmenStunden: 8 }));
    expect(roh).toContain("UMFANG");
    expect(roh).toContain("ARBEITSBEREICH");
    expect(roh).not.toContain("BAUM/B");
  });
  it("schreibt die Grenze der Gruppenbeurteilung hin", async () => {
    const roh = await pdfText(basis({ anzahlOffen: true, zeitrahmenStunden: 8 }));
    expect(roh).toMatch(/nach Zeit bemessen/);
    expect(roh).toMatch(/gesondert beurteilt/);
  });
  it("bei fester Anzahl bleibt alles wie vorher", async () => {
    const roh = await pdfText(basis({ baum: "1 Bergahorn, Vorgarten" }));
    expect(roh).toContain("BAUM/B");
    expect(roh).not.toMatch(/nach Zeit bemessen/);
    expect(roh).not.toContain("UMFANG");
  });
});
