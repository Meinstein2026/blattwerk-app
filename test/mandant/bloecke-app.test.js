import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { mandantAusCache, mandantHolen } from "../../src/mandant-client.js";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const funktion = (name) => {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error("Funktion fehlt: " + name);
  const b = src.indexOf("\nfunction ", a + 10);
  return src.slice(a, b < 0 ? src.length : b);
};
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};

describe("Mandant im Client", () => {
  beforeEach(() => { globalThis.localStorage = (() => { const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(); });

  it("holt vom Server und merkt sich die Fassung", async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ name: "Baum Müller GbR", bloecke: { erp: true } }) });
    const m = await mandantHolen();
    expect(m.name).toBe("Baum Müller GbR");
    expect(mandantAusCache().name).toBe("Baum Müller GbR");
  });

  it("ohne Netz kommt die letzte bekannte Fassung", async () => {
    globalThis.localStorage.setItem("blattwerk_mandant", JSON.stringify({ name: "Baum Müller GbR", bloecke: {} }));
    globalThis.fetch = async () => { throw new Error("offline"); };
    const m = await mandantHolen();
    expect(m.name).toBe("Baum Müller GbR");
  });
});

describe("Blöcke in der Oberfläche", () => {
  it("App lädt den Mandanten und stellt ihn bereit", () => {
    const s = funktion("App");
    expect(s).toMatch(/mandantHolen\(/);
    expect(s).toMatch(/<MandantContext\.Provider/);
  });
  it("BottomNav und Dashboard fragen die Blöcke ab", () => {
    expect(funktion("BottomNav")).toMatch(/block\("kalender"\)/);
    expect(funktion("Dashboard")).toMatch(/block\("arbeitsschutz"\)/);
    expect(funktion("Dashboard")).toMatch(/block\("belege"\)/);
  });
  it("ein abgeschalteter Bereich ist auch über einen gespeicherten Tab nicht erreichbar", () => {
    expect(funktion("App")).toMatch(/erlaubterTab\(/);
    expect(src).toMatch(/const erlaubterTab = \(/);
  });
  // Fix Runde 1: VerwaltungPage rief bei den Kacheln "Gefährdungsbeurteilungen"
  // und "Betriebsmittel" onNavigate (= setTab) direkt auf, ohne durch den
  // Block zu gehen — ein abgeschalteter Arbeitsschutz-Block ließ sich darüber
  // trotzdem öffnen. Die Wache muss die Kachel selbst verschwinden lassen
  // (nicht nur den Navigationsaufruf technisch verhindern), deshalb wird
  // hier geprüft, dass block("arbeitsschutz") wirklich als Sichtbarkeits-
  // Bedingung um genau diese beiden Kacheln liegt.
  it("VerwaltungPage blendet Gefährdungsbeurteilungen und Betriebsmittel aus, wenn der Arbeitsschutz-Block aus ist", () => {
    const s = funktion("VerwaltungPage");
    expect(s).toMatch(/block\("arbeitsschutz"\) && funktion\("gbu"\) \? \[\{ label: "Gefährdungsbeurteilungen", nav: "gbu"/);
    expect(s).toMatch(/block\("arbeitsschutz"\) && funktion\("betriebsmittel"\) \? \[\{ label: "Betriebsmittel", nav: "betriebsmittel"/);
  });
  // Fix Runde 2: der allererste Tab-Zustand (Kaltstart, z. B. aus einem
  // #chat-/#telefon-/#freigaben-Deep-Link per Push/onNewIntent) wurde direkt
  // aus dem Hash gesetzt, bevor `block` ueberhaupt deklariert war — der
  // [mandant]-Effekt korrigierte das erst NACH dem ersten Rendern, sodass die
  // tote Seite kurz mountete und ihre eigenen Lade-Effekte feuerte. `block`
  // wird jetzt vor `tab` deklariert, und der Kaltstart-Tab laeuft selbst
  // schon durch erlaubterTab.
  it("ein Kaltstart-Deep-Link setzt den ersten Tab bereits durch erlaubterTab", () => {
    const s = funktion("App");
    expect(s).toMatch(/window\.location\.hash === "#freigaben"\) return erlaubterTab\("geschaeft", block, funktion\)/);
    expect(s).toMatch(/window\.location\.hash === "#chat"\) return erlaubterTab\("chat", block, funktion\)/);
    expect(s).toMatch(/window\.location\.hash === "#telefon"\) return erlaubterTab\("telefon", block, funktion\)/);
  });
  it("GeschaeftPages Kaltstart-Subview #freigaben startet nicht ohne den belege-Block", () => {
    const s = funktion("GeschaeftPage");
    expect(s).toMatch(/window\.location\.hash === "#freigaben" && block\("belege"\) && funktion\("lieferantenrechnungen"\)\) \? "freigaben" : null/);
  });
});

// Der Vertrag, der die laufende Blattwerk-Instanz schuetzt: ohne Konfiguration
// (mandant = null) UND mit einer Konfiguration ohne bloecke-Feld beantwortet
// jeder Block-Helfer "an", und erlaubterTab laesst jeden Tab unangetastet.
// Echter Ausschnitt statt Nachbau (vm-Ausschnitt-Technik wie in
// test/angebot/bearbeiten.test.js) — ein Drift zwischen Test und Code faellt
// damit auf, statt dass der Test nur eine zweite Meinung ueber den Code ist.
describe("Blattwerk unveraendert: ohne Konfiguration ist jeder Block an", () => {
  const quelle = schnitt("const MandantContext = createContext(null);", "\n\n// ─── Main App");
  let aktuellerMandant = null;
  const sandbox = {
    createContext: (standard) => ({ _standard: standard }),
    useContext: () => aktuellerMandant,
  };
  vm.createContext(sandbox);
  const { useBlock, erlaubterTab } = vm.runInContext(
    quelle + "\n({ useBlock, erlaubterTab })", sandbox);

  const alleTabs = [
    "geschaeft", "invoices", "proposals", "supplierinvoices", "customers", "partners",
    "suppliers", "projects", "time", "expenses", "orders", "kalender", "fahrtenbuch",
    "chat", "telefon", "gbu", "betriebsmittel",
  ];

  it("mandant = null: jeder Block ist an, kein Tab wird umgeleitet", () => {
    aktuellerMandant = null;
    const block = useBlock();
    for (const b of ["erp", "belege", "fahrtenbuch", "chat", "arbeitsschutz", "kalender", "telefon", "irgendwas"]) {
      expect(block(b)).toBe(true);
    }
    for (const t of alleTabs) expect(erlaubterTab(t, block)).toBe(t);
  });

  it("Konfiguration ohne bloecke-Feld: jeder Block ist an, kein Tab wird umgeleitet", () => {
    aktuellerMandant = { kuerzel: "bw", name: "Blattwerk GbR" }; // kein `bloecke`
    const block = useBlock();
    for (const b of ["erp", "belege", "arbeitsschutz"]) expect(block(b)).toBe(true);
    for (const t of alleTabs) expect(erlaubterTab(t, block)).toBe(t);
  });

  it("zur Gegenprobe: ein tatsächlich abgeschalteter Block leitet um", () => {
    aktuellerMandant = { bloecke: { erp: false, kalender: true } };
    const block = useBlock();
    expect(block("erp")).toBe(false);
    expect(block("kalender")).toBe(true);
    expect(erlaubterTab("time", block)).toBe("home");
    expect(erlaubterTab("kalender", block)).toBe("kalender");
  });
});
