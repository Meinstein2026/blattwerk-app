// Die abgenommene Papiervorlage (docs/fahrzeug-ueberlassung-papier.html) ist
// die Gestaltungsvorgabe fuer das PDF. Damit „exakt nach Vorlage" pruefbar ist
// und nicht bloss behauptet, liest dieser Test die Vorlage ein und vergleicht
// Ueberschriften, Feldbeschriftungen, Kasten und Pflichtenliste mit dem, was
// `uebAbschnitte` liefert. Wer die Vorlage aendert, sieht hier sofort, was im
// PDF nachgezogen werden muss.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  UEB_PFLICHTEN, UEB_PFLICHTEN_KASTEN, UEB_PFLICHTEN_LISTE, UEB_TITEL, UEB_FUSSNOTE,
  UEB_UNTERSCHRIFTEN, uebAbschnitte, uebKennzeichen, uebPflichtText, uebEuro,
} from "../../src/ueberlassung.js";
import { BETRIEB_STANDARD } from "../../src/betrieb.js";

// Die Papiervorlage ist Blattwerks abgenommene Fassung — sie traegt deshalb
// Blattwerks Namen. Seit Befund I4 (18.09.2026) kommt der Name in
// `uebAbschnitte` aus dem Mandanten; mit Blattwerks eigenen Werten muss Wort
// fuer Wort dasselbe herauskommen wie auf dem Papier. Genau das prueft dieser
// Test seitdem — und der letzte Block unten die Gegenprobe: mit einem fremden
// Mandanten steht dort NICHT mehr Blattwerk.
const BW = BETRIEB_STANDARD;

const html = fs.readFileSync(path.join(process.cwd(), "docs/fahrzeug-ueberlassung-papier.html"), "utf8");
const entity = (s) => s.replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
  .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
const alle = (re, quelle = html) => [...quelle.matchAll(re)].map((m) => entity(m[1].replace(/<[^>]+>/g, "").trim()));

const h2 = alle(/<h2>([\s\S]*?)<\/h2>/g);
const felder = alle(/<div class="feld"[^>]*><span>([\s\S]*?)<\/span>/g);
const listenPunkte = alle(/<li>([\s\S]*?)<\/li>/g);
const kastenZeilen = alle(/<span class="check"><\/span>([^<]*)/g);

const v = {
  fahrzeug: "Fiat Ducato · MU-ST 2001", name: "Max Extern", anschrift: "Hauptstr. 1, 12345 Musterstadt",
  geburtsdatum: "1990-05-04", telefon: "0641 1234", verhaeltnis: "extern",
  fsKlasse: "B", fsNummer: "J123456789", fsAusgestelltAm: "2015-03-12", fsAusgestelltDurch: "Landkreis Gießen",
  fsGesehenAm: "2026-09-09", fsGesehenDurch: "Max Muster",
  von: "2026-09-10", bis: "", unbefristet: true, kmUebergabe: 84210, selbstbeteiligung: 500,
  blattwerkVertreter: "Max Muster",
  pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, true])),
};

describe("Papiervorlage ist gelesen worden", () => {
  it("liefert Ueberschriften, Felder, Kasten und Pflichtenliste", () => {
    expect(h2.length).toBe(4);
    expect(felder.length).toBeGreaterThanOrEqual(13);
    expect(listenPunkte.length).toBe(7);
    expect(kastenZeilen.length).toBe(2);
    expect(html).toContain(UEB_TITEL);
  });
});

describe("uebAbschnitte bildet die Vorlage ab", () => {
  const abschnitte = uebAbschnitte(v, { betrieb: BW });

  it("dieselben vier Abschnitte in derselben Reihenfolge", () => {
    expect(abschnitte.map((a) => `${a.nr}. ${a.titel}`)).toEqual(h2);
  });

  it("jede Beschriftung der Vorlage kommt genau einmal vor", () => {
    const vorlagen = abschnitte.flatMap((a) => (a.felder || []).map((f) => f.vorlage));
    for (const l of felder) expect(vorlagen).toContain(l);
    expect(new Set(vorlagen).size).toBe(vorlagen.length);
  });

  it("keine Beschriftung ohne Entsprechung auf dem Papier", () => {
    for (const f of abschnitte.flatMap((a) => a.felder || [])) expect(felder).toContain(f.vorlage);
  });

  it("Felder sind gefuellt statt leer gelassen", () => {
    const werte = Object.fromEntries(abschnitte.flatMap((a) => (a.felder || []).map((f) => [f.label, f.wert])));
    expect(werte["Name, Vorname"]).toBe("Max Extern");
    expect(werte["Geburtsdatum"]).toBe("04.05.1990");
    expect(werte["Verhältnis zu Blattwerk"]).toBe("extern");
    expect(werte["ausgestellt am / durch"]).toBe("12.03.2015 · Landkreis Gießen");
    expect(werte["Original gesehen am"]).toBe("09.09.2026");
    expect(werte["Zeitraum von"]).toBe("10.09.2026");
    expect(werte["bis"]).toMatch(/unbefristet/);
    expect(werte["km-Stand bei Übergabe"]).toMatch(/84\.210 km/);
    expect(Object.values(werte).filter((w) => w === "—")).toHaveLength(0);
  });

  it("befristet zeigt das Enddatum statt „unbefristet“", () => {
    const w = uebAbschnitte({ ...v, unbefristet: false, bis: "2026-12-31" }, { betrieb: BW })[2].felder.find((f) => f.label === "bis");
    expect(w.wert).toBe("31.12.2026");
  });

  it("Kasten unter 3. traegt die zwei Zeilen des Papiers", () => {
    const kasten = abschnitte[2].kasten;
    expect(kasten.map((k) => k.id)).toEqual(UEB_PFLICHTEN_KASTEN.map((p) => p.id));
    expect(kasten).toHaveLength(2);
    for (const [i, k] of kasten.entries()) expect(k.text).toBe(kastenZeilen[i].trim());
  });

  it("Pflichtenliste unter 4. ist die nummerierte Liste des Papiers", () => {
    const punkte = abschnitte[3].punkte;
    expect(punkte).toHaveLength(listenPunkte.length);
    expect(punkte.map((p) => p.id)).toEqual(UEB_PFLICHTEN_LISTE.map((p) => p.id));
    for (const [i, p] of punkte.entries()) {
      // Auf dem Papier steht bei der Selbstbeteiligung eine Linie; im PDF der Betrag.
      const papier = listenPunkte[i].replace(/______ €\s*\(Vorschlag 500 €\)/, uebEuro(500));
      expect(p.text.replace(/ /g, " ")).toBe(papier);
    }
  });

  it("Leerformular: dieselbe Gliederung, aber ohne Werte", () => {
    const l = uebAbschnitte({}, { leer: true, betrieb: BW });
    expect(l.map((a) => `${a.nr}. ${a.titel}`)).toEqual(h2);
    // Leere Felder bleiben leer — kein „—", da schreibt jemand von Hand hinein.
    for (const f of l.flatMap((a) => a.felder || [])) expect(f.wert).toBe("");
    for (const k of l[2].kasten) expect(k.bestaetigt).toBe(false);
    // Die Pflichtenliste ist dann Wort fuer Wort die des Papiers, Linie inklusive.
    for (const [i, p] of l[3].punkte.entries()) expect(p.text).toBe(listenPunkte[i]);
  });

  it("Leerformular nimmt vorbelegte Werte trotzdem mit", () => {
    const l = uebAbschnitte({ von: "2026-09-09" }, { leer: true, betrieb: BW });
    expect(l[2].felder.find((f) => f.label === "Zeitraum von").wert).toBe("09.09.2026");
    expect(l[0].felder.find((f) => f.label === "Anschrift").wert).toBe("");
  });

  it("Selbstbeteiligung wird eingesetzt, nicht als Linie gelassen", () => {
    const p = UEB_PFLICHTEN.find((x) => x.id === "selbstbeteiligung");
    expect(uebPflichtText(p, { selbstbeteiligung: 750 }, BW)).toMatch(/750,00/);
    expect(uebPflichtText(p, v, BW)).not.toMatch(/_{3,}|\{selbstbeteiligung\}|\{betrieb\}/);
  });

  it("Unterschriftszeilen und Fussnote wie auf dem Papier", () => {
    expect(UEB_UNTERSCHRIFTEN(v, BW).map((u) => u.rolle.replace(/ \(Max Muster\)/, ""))).toEqual([
      "Ort, Datum · Unterschrift Fahrer/in", "Ort, Datum · Unterschrift Blattwerk",
    ]);
    expect(entity(html)).toContain(UEB_FUSSNOTE);
  });

  it("Kennzeichen kommt aus dem Fahrzeugnamen", () => {
    expect(uebKennzeichen(v)).toBe("MU-ST 2001");
    expect(uebKennzeichen({ fahrzeug: "MU-ST 2002" })).toBe("MU-ST 2002");
    expect(uebKennzeichen({ fahrzeugId: "fiat" })).toBe("fiat");
  });

});

describe("Ein fremder Mandant unterschreibt bei seiner eigenen Firma (Befund I4)", () => {
  const fremd = { name: "Baum Müller GbR", anzeigeName: "Baum Müller", vertragsName: "Baum Müller Baumpflege" };
  const abschnitte = uebAbschnitte(v, { betrieb: fremd });

  it("kein Blattwerk mehr in Beschriftungen und Pflichten", () => {
    // Nur die ANGEZEIGTEN Texte — `sigBlattwerk`/`blattwerkVertreter` sind
    // Feldnamen im gespeicherten Datensatz und bleiben bewusst stehen.
    const alles = JSON.stringify(abschnitte) + UEB_UNTERSCHRIFTEN(v, fremd).map((u) => u.rolle).join(" ");
    expect(alles).not.toMatch(/Blattwerk/);
    expect(alles).not.toMatch(/\{betrieb\}/);
  });

  it("die eigene Firma steht an genau denselben Stellen", () => {
    const labels = abschnitte.flatMap((a) => (a.felder || []).map((f) => f.label));
    expect(labels).toContain("Verhältnis zu Baum Müller");
    expect(labels).toContain("geprüft durch (Baum Müller)");
    expect(abschnitte[2].kasten[0].text).toMatch(/betriebliche Fahrten von Baum Müller\./);
    expect(UEB_UNTERSCHRIFTEN(v, fremd)[1].rolle).toMatch(/Unterschrift Baum Müller/);
  });

  it("die Gliederung bleibt dieselbe — nur der Name wechselt", () => {
    expect(abschnitte.map((a) => `${a.nr}. ${a.titel}`)).toEqual(h2);
    expect(abschnitte[3].punkte).toHaveLength(listenPunkte.length);
  });

  it("ohne Kurzform gilt die Rechtsform, ohne Vertragsnamen ebenfalls", () => {
    const nur = { name: "Baum Müller GbR" };
    expect(uebAbschnitte(v, { betrieb: nur })[0].felder.find((f) => f.label.startsWith("Verhältnis")).label)
      .toBe("Verhältnis zu Baum Müller GbR");
  });
});