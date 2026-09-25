// PDF der v3-GBU: Aufbau nach dem Papierformular „Gefahrenermittlung –
// Seilklettertechnik" (Kopfkasten links, Lageplan rechts mit Notruf 112, fünf
// Kästen). Geprüft wird am rohen PDF-Rumpf (jsPDF komprimiert Text nicht) —
// Umlaute meiden wir in den Erwartungen, jsPDF schreibt sie als WinAnsi-Bytes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGbuPdf } from "../../src/gbu-pdf.js";
import { gbuNeuV3 } from "../../src/gbu-data.js";

// Seit der Mandantenfähigkeit verlangt buildGbuPdf den Betrieb vom Aufrufer.
const BW = { betrieb: { name: "Blattwerk GbR", anschrift: "Musterstraße 1, 12345 Musterstadt", uvTraeger: "SVLFG", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk" } };

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const skt = () => {
  const r = gbuNeuV3({ userName: "Sebastian Vogel", heute: "2026-09-14" });
  Object.assign(r, {
    id: "gbu-1757830000000", createdAt: "2026-09-14T05:52:00.000Z",
    arbeitsart: "baumpflege", zugang: "skt", kunde: { id: 42, name: "MBKS Kurs" }, projekt: { id: 7, ref: "PJ2609", title: "SKT-A Kurs" },
    baum: "Eichen am Schloss Freudenberg", arbeiten: ["Totholzentnahme"],
    personal: [{ key: "sz", name: "Sebastian Vogel", mobil: "0170 0000000", quals: [] }, { key: "max", name: "Max Muster", mobil: "0170 0000000", quals: [] }],
    wetter: { windKmh: 12, boenKmh: 31, niederschlagMm: 0, zeit: "2026-09-14T07:45", quelle: "open-meteo" },
    automatik: { "kopf.netz": "auto", "baustelle.witterung": "auto", "kopf.einsatzort": "geaendert" },
  });
  Object.assign(r.kopf, { datumBis: "2026-09-18", einsatzort: "Wiesbaden Dotzheim", strasse: "Freudenbergstrasse 224-226", standort: "Schloss Freudenberg, Wald hinter dem Parkplatz",
    mobil: ["0170 0000000", "0170 0000000"], netz: "ja", aufsicht: "Sebastian Vogel",
    gps: { lat: 50.0745, lon: 8.2101, genauigkeitM: 6, zeit: "2026-09-14T05:50:00.000Z" } });
  Object.assign(r.baustelle, { verkehrssicherung: "ja", witterung: "ja", kommunikation: "ja", funk: "nein", absperrungDurch: "MBKS", dauerVon: "08:00", dauerBis: "17:00",
    stromleitung: "nein", sonstigeGefahren: "Jugendgruppen", sonstigeGefahrenChips: ["Fallbereich für Schnittgut gesichert"], fallbereichFrei: "ja", abseiltechniken: "ja", artAbsperrung: "Schilder, Bodenpersonal" });
  Object.assign(r.baumcheck, { krone: "gut, etwas Totholz", stamm: "gut", wurzel: "gut", gesundheit: "vital", standsicherheit: "gegeben" });
  Object.assign(r.material, { psaDoppelt: "ja", abseilmaterial: "nein", rettungsmaterial: "ja", ersteHilfe: "ja" });
  Object.assign(r.personalcheck, { auftragBesprochen: "ja", erfahrung: "ja", kommunikation: "ja", rettung: "ja" });
  Object.assign(r.freigabe, { baumSicher: "ja", einschraenkungen: "Abseilmaterial nachholen" });
  return r;
};
const roh = async (r) => Buffer.from(await buildGbuPdf(r, BW), "base64").toString("latin1");

describe("PDF v3: Aufbau des Papierformulars", () => {
  it("Titel, die fuenf Kaesten, Notruf 112, Unterschrift Aufsichtsfuehrende(r)", async () => {
    const t = await roh(skt());
    for (const s of ["Gefahrenermittlung", "Notruf 112", "Baustellencheck", "Baumcheck", "Material- und Ausr", "Personalcheck", "Baum ist sicher", "Unterschrift Aufsichtsf"]) {
      expect(t, s).toContain(s);
    }
  });
  it("ohne Karte: Hinweis + Koordinaten aus dem GPS", async () => {
    const t = await roh(skt());
    expect(t).toMatch(/Karte nicht verf/); expect(t).toContain("50.07450"); expect(t).toContain("8.21010");
  });
  it("mit Karte: Bild eingebettet, kein Hinweis", async () => {
    const r = skt(); r.kopf.karte = PNG_1x1;
    const t = await roh(r);
    expect(t).toMatch(/\/Subtype ?\/Image/); expect(t).not.toMatch(/Karte nicht verf/);
  });
  it("ohne GPS und ohne Karte: „keine GPS-Position“", async () => {
    const r = skt(); r.kopf.gps = null;
    expect(await roh(r)).toMatch(/keine GPS-Position/);
  });
  it("Legende fuer den Marker A und Wetterwerte stehen drin", async () => {
    const t = await roh(skt());
    expect(t).toMatch(/automatisch vorbelegt/); expect(t).toMatch(/Open-Meteo/);
  });
  it("Hecke vom Boden: kein Baumcheck, kein „Baum ist sicher“, kein SKT-Material", async () => {
    const r = gbuNeuV3({ userName: "Max", heute: "2026-09-16" });
    Object.assign(r, { id: "gbu-2", createdAt: "2026-09-16T06:00:00.000Z", arbeitsart: "hecke", zugang: "boden", personal: [{ key: "l", name: "Max", mobil: "", quals: [] }] });
    r.kopf.einsatzort = "Lich"; r.baumcheck = null;
    const t = await roh(r);
    expect(t).not.toContain("Baumcheck"); expect(t).not.toContain("Baum ist sicher"); expect(t).not.toContain("2x Betriebssichere PSA");
    expect(t).toContain("Baustellencheck"); expect(t).toContain("Erste Hilfe");
  });
  it("Abweichung der Aufsicht vom Vorschlag steht mit Grund im PDF", async () => {
    const r = skt(); r.aufsichtAbweichung = { vorschlag: "Max Muster", gewaehlt: "Sebastian Vogel", grund: "Max erst ab 10 Uhr" };
    const t = await roh(r);
    expect(t).toContain("Vorschlag"); expect(t).toContain("Max erst ab 10 Uhr");
  });
  it("Fussnote: Grund-GBU Fassung 2 vom 07.08.2026 und Paragraf 6 ArbSchG", async () => {
    const t = await roh(skt());
    expect(t).toContain("Fassung 2 vom 07.08.2026"); expect(t).toContain("6 ArbSchG");
  });
  it("Umbruch im Kopfkasten: langer Standort/Zufahrtsweg bricht um statt abzuschneiden", async () => {
    const r = skt();
    r.kopf.standort = "Schloss Freudenberg, Wald hinter dem Parkplatz, Zufahrt Ludwig-Erhard-Strasse";
    const t = await roh(r);
    expect(t).toContain("Zufahrt Ludwig-Erhard");
  });
  it("Hoehenbudget des Kopfkastens: Zeilenumbruch bei 9pt gezeichnet, nicht bei 8pt budgetiert", async () => {
    // splitTextToSize() misst mit der aktuell gesetzten Schriftgroesse, wenn
    // keine fontSize uebergeben wird. Das einmalige Budget vor der Schleife
    // laeuft mit 8pt, gezeichnet wird aber mit 9pt - bei diesem Standort-Text
    // macht das den Unterschied zwischen 2 und 3 Zeilen. Verglichen wird die
    // Hoehe des Kopfkasten-Rechtecks (erster "re"-Operator mit Breite 300,
    // linker Rand 34) zwischen einer kurzen und dieser langen Standort-Angabe:
    // bei korrektem (9pt-)Budget kostet der Sprung von 1 auf 3 Zeilen 2 * 9pt
    // mehr Kastenhoehe als der kurze Text (1 Zeile) - bei falschem (8pt-)
    // Budget nur 1 * 9pt, weil bei 8pt nur 2 statt 3 Zeilen budgetiert werden.
    // (9pt statt vormals 10pt seit dem Ein-Blatt-Layout vom 17.09.2026 -
    // KOPF_ZEILE in gbu-pdf.js; das Prinzip der Pruefung bleibt dasselbe.)
    const hoehe = async (standort) => {
      const r = skt();
      r.kopf.standort = standort;
      const t = await roh(r);
      const m = t.match(/34\.\d* [\d.]+ 300\.\d* (-[\d.]+) re/);
      return -Number(m[1]);
    };
    const hKurz = await hoehe("Lich");
    const hLang = await hoehe("Stadtpark Sued, Haupteingang Bahnhofstrasse, dann 200 m Richtung Spielplatz");
    expect(hLang - hKurz).toBe(18);
  });
  // MINOR (bewusst offen): Label/Wert-Ueberlappung laesst sich mit roh() nicht
  // pruefen - beide Textfragmente landen unabhaengig von ihrer x-Position als
  // eigene Tj-Literale im Content-Stream, eine Stringsuche sieht keine
  // Ueberlappung. Dafuer braeuchte es eine Koordinatenpruefung der Td/Tm-
  // Operatoren oder pdftotext, keine deklarierte Projektabhaengigkeit.

  // I-2 (Final-Review 16.09.2026): kasten() mass die Kastenhoehe bisher mit dem
  // Font, der zufaellig gerade aktiv war (vor der ersten Box "Notruf 112" in
  // font(true, 11)), statt mit dem Font, mit dem zeichneZeile() tatsaechlich
  // zeichnet (font(false, 8.5)). Das machte Kaesten zu gross ODER zu klein.
  const kastenHoehen = (t) => [...t.matchAll(/34\.\d* [\d.]+ 527\.\d* (-?[\d.]+) re/g)].map((m) => -Number(m[1]));
  it("Baustellencheck-Kasten: Hoehe im 8,5pt-Zeichenfont gemessen, nicht im 11pt-fetten Font von 'Notruf 112' davor", async () => {
    // Review-Messwert mit dem Muster-Datensatz: 153pt (falscher 11pt-Font) vs.
    // 133pt (richtiger 8,5pt-Font) - 20pt verschenkte Hoehe.
    const r = skt();
    Object.assign(r.kopf, { standort: "Schloss Freudenberg, Wald hinter dem Parkplatz, Zufahrt Ludwig-Erhard-Strasse" });
    Object.assign(r.baustelle, { sonstigeGefahren: "Jugendgruppen, Spaziergaenger mit Hunden",
      sonstigeGefahrenChips: ["Fallbereich fuer Schnittgut gesichert", "Ankerpunkt tragfaehig gewaehlt (Baumansprache!)"] });
    const [baustelle] = kastenHoehen(await roh(r));
    expect(baustelle).toBeLessThan(140);
  });
  it("Baumcheck-Zweig: textH misst im gleichen Font wie das Zeichnen, unabhaengig vom Font, den die Baustelle-Box zuletzt hinterlaesst", async () => {
    // Zwei Datensaetze mit IDENTISCHEM Baumcheck-Text. Einziger Unterschied: ob
    // fuer "Art d. Absperrung" (letzte Zeile der Baustelle-Box) der Marker A
    // gezeichnet wird - der hinterlaesst font(true, 5.5, GRUEN) statt
    // font(false, 8.5, DUNKEL). Bei korrektem Fix ist die Baumcheck-Box-Hoehe
    // in beiden Faellen gleich; vorher haengt sie vom Marker ab.
    const kroneText = "deutlich sichtbares Totholz im oberen Kronenbereich, weitere Beobachtung noetig, ggf. Rueckschnitt";
    const ohneMarker = skt(); ohneMarker.baumcheck.krone = kroneText;
    const mitMarker = skt(); mitMarker.baumcheck.krone = kroneText;
    mitMarker.automatik = { ...mitMarker.automatik, "baustelle.artAbsperrung": "auto" };
    const [, hOhne] = kastenHoehen(await roh(ohneMarker));
    const [, hMit] = kastenHoehen(await roh(mitMarker));
    expect(hOhne).toBe(hMit);
  });
  // Nachbau des Muster-Datensatzes aus scripts/gbu-v3-muster.mjs (ohne Kartenladen,
  // sonst wortgleich) - erst mit diesem vollen Umfang reicht das 20pt-Defizit, um
  // die Freigabe-Box wirklich auf Seite 2 zu druecken; die kleinere skt()-Grund-
  // ausstattung dieser Testdatei allein tut das nicht (zu kurzer Kopftext).
  const musterAehnlich = () => {
    const r = gbuNeuV3({ userName: "Sebastian Vogel", heute: "2026-09-14" });
    Object.assign(r, {
      id: "gbu-1757830000000", createdAt: "2026-09-14T05:52:00.000Z",
      arbeitsart: "baumpflege", zugang: "skt", kunde: { id: 42, name: "MBKS – SKT-A-Kurs" }, projekt: { id: 7, ref: "PJ2609-017", title: "SKT-A Kurs Wiesbaden" },
      baum: "Eichen und Buchen am Schloss Freudenberg", arbeiten: ["Totholzentnahme", "Kronenpflege"], anzahlOffen: true, zeitrahmenStunden: 8,
      personal: [{ key: "sz", name: "Sebastian Vogel", mobil: "0170 0000000", quals: ["SKT B"] }, { key: "max", name: "Max Muster", mobil: "0170 0000000", quals: ["SKT A"] }],
      wetter: { windKmh: 12, boenKmh: 31, niederschlagMm: 0, zeit: "2026-09-14T07:45", quelle: "open-meteo" },
      automatik: {
        "kopf.datum": "auto", "kopf.einsatzort": "auto", "kopf.strasse": "geaendert", "kopf.mobil": "auto", "kopf.netz": "auto", "kopf.aufsicht": "auto", "kopf.gps": "auto",
        "baustelle.witterung": "auto", "baustelle.dauer": "auto", "baustelle.stromleitung": "auto", "baustelle.verkehrssicherung": "auto",
        "material.psaDoppelt": "auto", "material.rettungsmaterial": "auto", "material.ersteHilfe": "auto", "personalcheck.erfahrung": "auto",
        "baumcheck.krone": "auto", "baumcheck.stamm": "auto", "baumcheck.wurzel": "auto", "baumcheck.gesundheit": "auto", "baumcheck.standsicherheit": "auto",
      },
      aufsichtAbweichung: null,
    });
    Object.assign(r.kopf, {
      datumBis: "2026-09-18", einsatzort: "Wiesbaden Dotzheim", strasse: "Freudenbergstraße 224–226", standort: "Schloss Freudenberg, Wald hinter dem Parkplatz, Zufahrt Ludwig-Erhard-Straße",
      festnetz: "", mobil: ["0170 0000000", "0170 0000000"], netz: "ja", aufsicht: "Sebastian Vogel",
      gps: { lat: 50.0745, lon: 8.2101, genauigkeitM: 6, zeit: "2026-09-14T05:50:00.000Z" }, karte: null,
    });
    Object.assign(r.baustelle, {
      verkehrssicherung: "ja", witterung: "ja", kommunikation: "ja", funk: "nein", absperrungDurch: "MBKS", dauerVon: "08:00", dauerBis: "17:00",
      stromleitung: "nein", stromleitungText: "keine", sonstigeGefahren: "Jugendgruppen, Spaziergänger mit Hunden",
      sonstigeGefahrenChips: ["Fallbereich für Schnittgut gesichert", "Ankerpunkt tragfähig gewählt (Baumansprache!)"],
      fallbereichFrei: "ja", abseiltechniken: "ja", artAbsperrung: "Schilder, Bodenpersonal",
    });
    Object.assign(r.baumcheck, { krone: "gut, etwas Totholz", stamm: "gut", wurzel: "gut", gesundheit: "vital", standsicherheit: "gegeben" });
    Object.assign(r.material, { psaDoppelt: "ja", abseilmaterial: "nein", rettungsmaterial: "ja", ersteHilfe: "ja", offeneFristen: [] });
    Object.assign(r.personalcheck, { auftragBesprochen: "ja", erfahrung: "ja", kommunikation: "ja", rettung: "ja", erfahrungFehlt: [] });
    Object.assign(r.freigabe, { baumSicher: "ja", einschraenkungen: "Abseilmaterial nachholen, bis dahin nur Totholz ohne Rigging" });
    return r;
  };
  // jsPDF schreibt je Seite einen eigenen Content-Stream; deren Reihenfolge im
  // Rumpf folgt der Seitenreihenfolge. Seit dem Ein-Blatt-Layout (17.09.2026,
  // ../blattwerk-betrieb/docs/superpowers/specs/2026-09-17-gbu-pdf-ein-blatt-design.md) landen
  // Freigabe-Kasten UND Unterschriften im SELBEN (einzigen) Stream - die
  // frueher hier gepruefte "welcher Stream kommt zuerst" ist damit nicht mehr
  // aussagekraeftig (es gibt nur noch einen). Ersetzt durch: genau ein Stream
  // (= eine Seite), und "Einschr" steht darin textlich vor "Unterschrift
  // Aufsichtsf" (Zeichenreihenfolge auf dem einen Blatt).
  const streamIndex = (t, marker) => t.split(/endstream/g).findIndex((s) => s.includes(marker));
  it("Muster-Datensatz: passt komplett auf eine Seite, Freigabe-Kasten steht darin vor den Unterschriften", async () => {
    const t = await roh(musterAehnlich());
    const idxFreigabe = streamIndex(t, "Einschr");
    const idxUnterschrift = streamIndex(t, "Unterschrift Aufsichtsf");
    expect(idxFreigabe).toBe(idxUnterschrift); // derselbe (einzige) Content-Stream
    const stream = t.split(/endstream/g)[idxFreigabe];
    expect(stream.indexOf("Einschr")).toBeLessThan(stream.indexOf("Unterschrift Aufsichtsf"));
  });
});

describe("PDF v3: Reproduzierbarkeit und v2 weiterhin druckbar", () => {
  afterEach(() => vi.useRealTimers());
  it("derselbe Datensatz ergibt byte-gleiche PDFs, auch Minuten spaeter", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T06:00:00.000Z"));
    const a = await buildGbuPdf(skt(), BW);
    vi.setSystemTime(new Date("2026-09-14T06:05:00.000Z"));
    expect(await buildGbuPdf(skt(), BW)).toBe(a);
  });
  it("v2-Datensaetze (ohne version) laufen durch das alte Layout", async () => {
    const t = await roh({ id: "gbu-1", createdAt: "2026-08-09T10:15:30.000Z", userName: "Max", arbeitsart: "maehen", zugang: "", niederschlag: "trocken", wind: "windstill", items: {}, personal: [] });
    expect(t).toContain("Einsatzort"); expect(t).not.toContain("Lageplan");
  });
});
