// Konto-Vorschläge pro Firma: Grundregeln gelten für jedes Gewerk, das
// Baumpflege-Paket kommt für Blattwerk (mandant.profil = "baumpflege") dazu
// und geht vor. Das Gedächtnis (welcher Lieferant/Artikel bucht auf welches
// Konto) liegt serverseitig je Mandant, damit ein neues Gerät vom ersten
// Beleg an denselben Vorschlag bekommt und keine Firma aus den Buchungen
// einer anderen lernt — dafür ist `datei` immer der mandanteneigene Pfad.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KONTO_GRUND, KONTO_PROFIL, regelnFuer } from "../../src/konto-regeln.js";
import { gedaechtnisLesen, gedaechtnisMerken } from "../../src/server/konto-gedaechtnis.mjs";

const treffer = (regeln, text) => {
  const t = text.toLowerCase();
  for (const r of regeln) if (r.keywords.some((k) => k && t.includes(k))) return r.account;
  return null;
};

let dir, datei;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "konto-")); datei = path.join(dir, "konten-gedaechtnis.json"); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Konto-Vorschläge", () => {
  it("Grundregeln sind gewerksneutral und treffen Bürobelege", () => {
    expect(treffer(KONTO_GRUND, "Druckerpapier")).toBe("4930");
    expect(treffer(KONTO_GRUND, "Diesel")).toBe("4530");
    expect(treffer(KONTO_GRUND, "Sägekette")).toBe(null);
  });

  it("das Baumpflege-Paket ergänzt das Gewerk und geht vor", () => {
    const regeln = regelnFuer("baumpflege");
    expect(treffer(regeln, "Sägekette")).toBe("4985");
    // "Kettenhaftöl" trifft auf das Stichwort "haftöl" (Konto 3000, Maschinen-
    // Betriebsstoffe) — wie im heutigen DEFAULT_KONTO_REGELN, keine Erfindung.
    expect(treffer(regeln, "Kettenhaftöl")).toBe("3000");
    expect(treffer(regeln, "Druckerpapier")).toBe("4930");
    expect(KONTO_PROFIL.baumpflege.length).toBeGreaterThan(5);
  });

  it("ohne bekanntes Profil bleiben nur die Grundregeln", () => {
    expect(regelnFuer("dachdecker")).toEqual(KONTO_GRUND);
  });

  // Reihenfolge ist Fachlogik (siehe dolibarr-app.jsx-Kommentar bei 4969/3100):
  // „Altreifenentsorgung“ muss weiter auf 4969 (eigener Betriebsabfall) statt
  // auf 3100 (auftragsbezogene Entsorgung, Stichwort „entsorg“) laufen, obwohl
  // beide Regeln jetzt auf zwei verschiedene Konto-Einträge verteilt sind.
  it("hält die produktionsbewährte Priorität auch nach der Aufteilung", () => {
    const regeln = regelnFuer("baumpflege");
    expect(treffer(regeln, "Altreifenentsorgung PKW")).toBe("4969");
    expect(treffer(regeln, "Entsorgung Astgut")).toBe("3100");
  });

  it("das Gedächtnis liegt auf dem Server und ist pro Instanz eigen", () => {
    expect(gedaechtnisLesen(datei)).toEqual({ lieferant: {}, artikel: {} });
    gedaechtnisMerken(datei, { lieferant: "Forstbedarf Müller", konto: "4985" });
    gedaechtnisMerken(datei, { artikel: "EK-KETTENOEL", konto: "3030" });
    const g = gedaechtnisLesen(datei);
    expect(g.lieferant["forstbedarf müller"]).toBe("4985");
    expect(g.artikel["EK-KETTENOEL"]).toBe("3030");
    expect(fs.statSync(datei).mode & 0o777).toBe(0o600);
  });

  it("zwei Dateien (= zwei Mandanten) lernen unabhängig voneinander", () => {
    const datei2 = path.join(dir, "konten-gedaechtnis-2.json");
    gedaechtnisMerken(datei, { lieferant: "Baumschule A", konto: "3300" });
    gedaechtnisMerken(datei2, { lieferant: "Dachdecker B", konto: "4800" });
    expect(gedaechtnisLesen(datei).lieferant["baumschule a"]).toBe("3300");
    expect(gedaechtnisLesen(datei2).lieferant["baumschule a"]).toBeUndefined();
    expect(gedaechtnisLesen(datei2).lieferant["dachdecker b"]).toBe("4800");
  });
});
