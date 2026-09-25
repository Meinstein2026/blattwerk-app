// Die Oberflaeche blendet Kacheln, Reiter und Schnellzugriffe ueber
// funktion("…") aus. Quelltext-Test, weil dolibarr-app.jsx nicht importierbar
// ist (Muster: test/mandant/bloecke-app.test.js).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const funktion = (name) => {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error("Funktion fehlt: " + name);
  const b = src.indexOf("\nfunction ", a + 10);
  return src.slice(a, b < 0 ? src.length : b);
};

describe("useFunktion", () => {
  it("liest die aufgeloesten Werte und faellt vor der ersten Antwort auf an zurueck", () => {
    expect(src).toMatch(/const useFunktion = \(\) => \{\s*const m = useMandant\(\);\s*return \(key\) => \(m\?\.funktionen \? m\.funktionen\[key\] === true : true\);/);
  });
});

describe("erlaubterTab kennt Funktionen", () => {
  const t = src.slice(src.indexOf("const erlaubterTab ="), src.indexOf("// ─── Main App"));
  it("Tabs haengen an Funktionen, nicht nur an Bloecken", () => {
    for (const [tab, f] of [["time", "zeiterfassung"], ["expenses", "spesen"], ["orders", "bestellungen"], ["proposals", "angebote"],
      ["invoices", "rechnungen"], ["projects", "projekte"], ["supplierinvoices", "lieferantenrechnungen"], ["gbu", "gbu"],
      ["betriebsmittel", "betriebsmittel"], ["baumkataster", "baumkataster"], ["fahrtenbuch", "fahrtenbuch"], ["kalender", "kalender"],
      ["chat", "chat"], ["telefon", "telefon"]]) {
      expect(t).toMatch(new RegExp(`${tab}: "${f}"`));
    }
    expect(t).toMatch(/return \(!noetig \|\| block\(noetig\)\) && \(!fn \|\| funktion\(fn\)\) \? tab : "home"/);
  });
});

describe("Navigation und Kacheln", () => {
  it("BottomNav: Zeit haengt an zeiterfassung", () => {
    expect(funktion("BottomNav")).toMatch(/\.\.\.\(block\("erp"\) && funktion\("zeiterfassung"\) \? \[\{ key: "time"/);
  });
  it("GeschaeftPage: jede Kachel traegt ihre Funktion", () => {
    const g = funktion("GeschaeftPage");
    for (const [key, f] of [["orders", "bestellungen"], ["supplierinvoices", "lieferantenrechnungen"]]) {
      expect(g).toMatch(new RegExp(`key: "${key}"[^\\n]*sichtbar: funktion\\("${f}"\\)`));
    }
    // Lager, Lieferungen und Lieferscheine stehen seit 20.09.2026 nicht mehr
    // unter „Geschäft", sondern auf der LagerPage hinter dem Burger-Menü-Punkt
    // „Lager" — die Funktion haengt deshalb am Menue-Eintrag, nicht mehr an
    // drei einzelnen Kacheln.
    for (const key of ["shipments", "deliveries", "warehouse"]) expect(g).not.toMatch(new RegExp(`\\{ label: "[^"]*",\\s+key: "${key}"`));
    expect(funktion("BottomNav")).toMatch(/funktion\("lager"\) \? \[\{ key: "lager"/);
    const l = funktion("LagerPage");
    for (const key of ["shipments", "deliveries", "warehouse"]) expect(l).toMatch(new RegExp(`key: "${key}"`));
    for (const [nav, f] of [["invoices", "rechnungen"], ["proposals", "angebote"], ["projects", "projekte"]]) {
      expect(g).toMatch(new RegExp(`nav: "${nav}"[^\\n]*sichtbar: funktion\\("${f}"\\)`));
    }
  });
  it("Dashboard-Schnellzugriffe", () => {
    const d = funktion("Dashboard");
    expect(d).toMatch(/funktion\("angebote"\) \? \[\{ label: "Neues Angebot"/);
    expect(d).toMatch(/funktion\("bestellungen"\) \? \[\{ label: "Bestellung aufgeben"/);
    expect(d).toMatch(/funktion\("spesen"\) \? \[\{ label: "Spesen"/);
    expect(d).toMatch(/block\("belege"\) && funktion\("lieferantenrechnungen"\) \? \[\{ label: "Lieferantenrechnung"/);
    expect(d).toMatch(/funktion\("betriebsmittel"\) \? \[\{ label: "Betriebsmittel"/);
    expect(d).toMatch(/funktion\("gbu"\) \? \[\{ label: "Arbeitsschutz"/);
  });
  it("Verwaltung: Baumkataster, Betriebsmittel; GbuPage-Chips: Personal, Betriebsanweisungen", () => {
    const v = funktion("VerwaltungPage");
    for (const f of ["baumkataster", "betriebsmittel"]) expect(v).toMatch(new RegExp(`funktion\\("${f}"\\)`));
    const g = funktion("GbuPage");
    for (const f of ["qualifikationen", "betriebsanweisungen"]) expect(g).toMatch(new RegExp(`funktion\\("${f}"\\)`));
  });
  it("abgeschalteter Tab landet mit Hinweis auf Start", () => {
    expect(src).toMatch(/Diese Funktion ist für diesen Betrieb abgeschaltet/);
  });
});

describe("processGbuQueue-Aufrufe tragen die Funktions-Wache", () => {
  it("jeder Aufruf in dolibarr-app.jsx und GbuFormSkt.jsx ist an funktionAktiv(mandant, \"gbu\") gebunden", () => {
    const guard = /funktionAktiv\((mandant|m), "gbu"\)/;
    for (const [datei, quelle] of [
      ["dolibarr-app.jsx", src],
      ["src/ui/GbuFormSkt.jsx", fs.readFileSync(path.join(process.cwd(), "src/ui/GbuFormSkt.jsx"), "utf8")],
    ]) {
      const zeilen = quelle.split("\n");
      zeilen.forEach((zeile, i) => {
        if (!zeile.includes("processGbuQueue(") || zeile.includes("function processGbuQueue(")) return;
        const kontext = i > 0 ? zeilen[i - 1] + "\n" + zeile : zeile;
        expect(kontext, `${datei}:${i + 1}`).toMatch(guard);
      });
    }
  });
});

describe("ProjectDetail: GBU-Knopf haengt an block und funktion", () => {
  it("Gefährdungsbeurteilung-Knopf braucht block(\"arbeitsschutz\") und funktion(\"gbu\")", () => {
    const p = funktion("ProjectDetail");
    expect(p).toMatch(/block\("arbeitsschutz"\) && funktion\("gbu"\) && <button[^>]*onClick=\{\(\) => setShowGbuForm\(true\)\}/);
  });
});

describe("BottomNav: Kalender-Kachel haengt an block und funktion", () => {
  it("Kalender braucht block(\"kalender\") und funktion(\"kalender\")", () => {
    expect(funktion("BottomNav")).toMatch(/block\("kalender"\) && funktion\("kalender"\) \? \[\{ key: "kalender"/);
  });
});

describe("gbuChips: Einweisungen-Chip haengt an funktion(\"betriebsmittel\")", () => {
  it("einweisungen-Chip wird ausgeblendet, wenn betriebsmittel aus ist", () => {
    expect(src).toMatch(/id !== "einweisungen" \|\| funktion\("betriebsmittel"\)/);
  });
});

describe("AdminPanel", () => {
  it("bindet den FunktionenEditor ein und der Client kennt die Setup-Endpunkte", () => {
    expect(funktion("AdminPanel")).toMatch(/<FunktionenEditor api=\{api\} mandant=\{mandant\} mandantRoh=\{mandantRoh\}/);
    expect(src).toMatch(/getAppSetup: \(\) => call\("GET", "\/blattwerkapp\/setup"\)/);
    expect(src).not.toMatch(/"\/blattwerkzeit\//);
  });
});
