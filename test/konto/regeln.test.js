// Buchungskonto-Vorschlag: App (regelnFuer("baumpflege") in src/konto-regeln.js)
// und Pipeline (KONTO_RULES in pipeline/common.py) MÜSSEN dasselbe Konto
// vorschlagen — sonst zeigt die App im Entwurf etwas anderes an, als der
// Finisher bucht. common.py sagt das selbst in einem Kommentar; bis
// 2026-08-06 waren die Listen trotzdem auseinandergelaufen (der App fehlte
// "bankgeb", der Pipeline "bockleiter" u. a.). Dieser Test hält sie zusammen.
//
// Seit Task 8 (Mandantenfähigkeit) lebt die App-Regelliste nicht mehr als
// wörtlicher Textblock in dolibarr-app.jsx, sondern in src/konto-regeln.js,
// aufgeteilt in gewerksneutrale Grundregeln (KONTO_GRUND) und ein
// Baumpflege-Paket (KONTO_PROFIL.baumpflege) — einzelne Konten mit
// gemischten Stichwörtern (z. B. 3100, 4985, 3400) stehen dort als ZWEI
// benachbarte Einträge mit demselben Konto, damit die produktionsbewährte
// Konto-Reihenfolge (Fachlogik, z. B. 4969 vor 3100) erhalten bleibt, statt
// alle Baumpflege-Regeln vor alle Grundregeln zu hängen. Der Test liest die
// App-Seite deshalb über den Import statt über between()-Textparsing (das
// gab es nur, weil die App-Datei JSX ist und sich nicht direkt importieren
// ließ — src/konto-regeln.js ist reines JS und importierbar) und fasst
// benachbarte Einträge desselben Kontos für den Vergleich mit der Pipeline
// wieder zu einer Zeile zusammen; die Konto-Reihenfolge bleibt dabei
// unverändert, weil beide Hälften immer direkt nebeneinander stehen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { regelnFuer } from "../../src/konto-regeln.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pySrc = fs.readFileSync(path.join(root, "pipeline/common.py"), "utf8");

const between = (src, start, endMarker) => {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`${start} nicht gefunden`);
  const to = src.indexOf(endMarker, from);
  return src.slice(from, to);
};
const pyRegeln = [...between(pySrc, "KONTO_RULES = [", "\n]")
  .matchAll(/\("(\d+)",\s*(\[[^\]]*\])\)/g)]
  .map(([, account, kw]) => ({ account, keywords: JSON.parse(kw) }));
const pyStd = /KONTO_DEFAULT = "(\d+)"/.exec(pySrc)[1];

// KONTO_STD in dolibarr-app.jsx — unverändert seit Task 8, steht dort weiter
// als eigene Konstante (nicht Teil der Aufteilung), deshalb hier fest.
const appStd = "4900";

// Rohliste, wie die App sie fürs Blattwerk-Profil tatsächlich verwendet
// (regelnFuer("baumpflege") in dolibarr-app.jsx) — für die Vorschlags-
// Verhaltenstests unten wird direkt hiermit gematcht.
const appRegeln = regelnFuer("baumpflege");

// Für den Strukturvergleich mit der Pipeline (die weiterhin eine Regel pro
// Konto kennt) benachbarte Einträge desselben Kontos zu einer Zeile
// zusammenfassen. Reihenfolge der KONTEN bleibt erhalten (erstes Auftreten
// zählt); Reihenfolge der STICHWÖRTER innerhalb eines Kontos ist dagegen
// nicht fachlich bedeutsam — suggestKonto/_match_konto nutzen `some()`,
// welches Stichwort innerhalb eines Kontos zuerst matcht, ist irrelevant,
// solange das Konto dasselbe bleibt.
const appGrouped = [];
for (const r of appRegeln) {
  const letzte = appGrouped[appGrouped.length - 1];
  if (letzte && letzte.account === r.account) letzte.keywords.push(...r.keywords);
  else appGrouped.push({ account: r.account, keywords: [...r.keywords] });
}

// Spiegelt suggestKonto/_match_konto: erste Regel mit Teilstring-Treffer gewinnt.
const suggest = (regeln, std) => (desc) => {
  const t = (desc || "").toLowerCase();
  if (t.trim()) for (const r of regeln) if (r.keywords.some((k) => k && t.includes(k))) return r.account;
  return std;
};
const appKonto = suggest(appRegeln, appStd);
const pyKonto = suggest(pyRegeln, pyStd);

describe("Konto-Regeln App ↔ Pipeline", () => {
  it("liest beide Tabellen vollständig ein (nach Zusammenfassen gesplitteter Konten)", () => {
    expect(appGrouped.length).toBeGreaterThan(25);
    expect(pyRegeln.length).toBe(appGrouped.length);
  });

  it("hat dieselbe Kontenreihenfolge (Reihenfolge = Priorität = Fachlogik)", () => {
    expect(pyRegeln.map((r) => r.account)).toEqual(appGrouped.map((r) => r.account));
  });

  it("hat je Konto dieselben Stichwörter (als Menge — Reihenfolge INNERHALB eines Kontos ist nicht fachlich bedeutsam)", () => {
    appGrouped.forEach((r, i) => {
      expect({ konto: r.account, keywords: [...pyRegeln[i].keywords].sort() })
        .toEqual({ konto: r.account, keywords: [...r.keywords].sort() });
    });
  });

  it("nutzt denselben Fallback", () => {
    expect(pyStd).toBe(appStd);
  });

  it("matcht mit unveränderter Semantik (Teilstring, erste Regel gewinnt)", () => {
    // Ändert sich diese Zeile, muss auch die Nachbildung oben mitgezogen werden.
    expect(pySrc).toContain("if any(k in t for k in keywords):");
  });
});

// Leitern sind Werkzeuge/Kleingeräte (4985). Vor dem 2026-08-06 kannte die Liste
// nur tritt-/bock-/teleskopleiter, alles andere fiel auf den Ungeklärt-Fallback.
const LEITERN = [
  "Stehleiter Alu 2x9 Sprossen", "Anlegeleiter 3,0 m", "Schiebeleiter 2-teilig",
  "Klappleiter", "Gelenkleiter 4x3", "Mehrzweckleiter Alu", "Sprossenleiter",
  "Stufenleiter 8 Stufen", "Podestleiter", "Plattformleiter", "Obstbaumleiter",
  "Aluleiter", "Alu-Leiter 3x9", "Holzleiter", "Glasfaserleiter",
  "Hailo Leiter 2x7", "Leitern-Set 2 Stück", "Trittleiter 4 Stufen",
];

describe("Konto-Vorschlag", () => {
  it.each(LEITERN)("bucht „%s\" auf 4985 (Werkzeuge und Kleingeräte)", (desc) => {
    expect(appKonto(desc)).toBe("4985");
    expect(pyKonto(desc)).toBe("4985");
  });

  // Gegenprobe: „leiter" darf NICHT als bloßes Teilwort greifen — Berufs-
  // bezeichnungen auf Fremdleistungs-/Lohnbelegen enden genauso auf -leiter.
  it.each([
    ["Bauleiter Tagespauschale", "4674"],
    ["Projektleiter Stunden", "4900"],
    ["Kolonnenleiter Zuschlag", "4900"],
    ["Blitzableiter Prüfung", "4900"],
  ])("hält „%s\" von 4985 fern", (desc, konto) => {
    expect(appKonto(desc)).toBe(konto);
    expect(pyKonto(desc)).toBe(konto);
  });

  // Weitere Handwerkzeuge, die vorher falsch oder gar nicht griffen.
  it.each([
    ["Schraubendreher-Satz 6-teilig", "4985"],   // vorher 3400 über „schraube"
    ["Wasserwaage 60 cm", "4985"],
    ["Trennscheibe 230 mm", "4985"],
    ["Meißel flach", "4985"],
    ["Kehrbesen 40 cm", "4985"],
    ["Bankgebühren Juli", "4970"],               // „bankgeb" fehlte der App
    ["Kraftstoff Super E10", "4530"],            // Bestandsfall bleibt stabil
    ["Rindenmulch 70 l", "3400"],
    ["Heckenpflanze Thuja", "3300"],
    ["Wurzelfräsen Subunternehmer", "3100"],
    ["Irgendwas Unbekanntes", "4900"],           // Fallback „ungeklärt"
  ])("bucht „%s\" auf %s", (desc, konto) => {
    expect(appKonto(desc)).toBe(konto);
    expect(pyKonto(desc)).toBe(konto);
  });

  // Entsorgung: seit 17.08.2026 auf 3100 (Fremdleistung), weil Blattwerk
  // ausschließlich auftragsbezogen entsorgt — der Grünschnitt kommt vom
  // Kundengrundstück, die Kosten gehören in den Rohertrag des Auftrags, auch
  // ohne 1:1-Weiterberechnung. 4969 bleibt dem eigenen Betriebsabfall.
  // Die Reihenfolge ist hier tragend: „Altreifenentsorgung" enthält „entsorg"
  // und ginge bei umgekehrter Reihenfolge als Fremdleistung durch. Seit
  // Task 8 stehen 4969 (Grundregel) und der Entsorgungsteil von 3100
  // (Baumpflege-Paket) in zwei verschiedenen Listen, die regelnFuer()
  // wieder in genau dieser Reihenfolge zusammensetzt (siehe src/konto-regeln.js).
  it.each([
    ["Anlieferung Grünschnitt", "3100"],          // der Beleg vom 17.08.2026
    ["Entsorgung Astgut", "3100"],
    ["Annahmegebühr Deponie", "3100"],
    ["Containerdienst Bauschutt", "3100"],
    ["Wiegeschein Kompostwerk", "3100"],
    ["Altreifenentsorgung PKW", "4969"],          // eigener Fuhrpark
    ["Abfallgebühren Betriebshof", "4969"],
    ["Restmülltonne Jahresbeitrag", "4969"],
  ])("bucht „%s\" auf %s", (desc, konto) => {
    expect(appKonto(desc)).toBe(konto);
    expect(pyKonto(desc)).toBe(konto);
  });
});
