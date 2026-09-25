// OpenCV (15,5 MB) liegt seit 14.08.2026 nicht mehr im Vorab-Cache des Service
// Workers. Ohne Ersatz waere Offline-Scannen nach jedem Update tot: Fassung im
// Hof geladen, drei Stunden spaeter ohne Empfang ein Beleg — toter Knopf.
// opencvVorwaermen holt den Brocken deshalb in der Leerlaufzeit nach.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("let _cvVorgewaermt = false;");
const b = src.indexOf("// Punkte als [tl, tr, br, bl] ordnen", a);
if (a < 0 || b < 0) throw new Error("opencvVorwaermen nicht gefunden");

// loadOpenCv selbst zieht das echte Paket — hier durch eine Attrappe ersetzt.
function laden() {
  const sandbox = { geladen: 0, ergebnis: Promise.resolve({}) };
  vm.createContext(sandbox);
  vm.runInContext(
    "function loadOpenCv() { geladen++; return ergebnis; }\n" +
    src.slice(a, b) +
    "\nthis.opencvVorwaermen = opencvVorwaermen;",
    sandbox);
  return sandbox;
}

// Fenster-Attrappe: sammelt den angemeldeten Rueckruf, statt ihn auszufuehren.
function fenster(opt = {}) {
  const auftraege = [];
  return {
    navigator: { onLine: opt.online !== false, connection: opt.saveData ? { saveData: true } : undefined },
    requestIdleCallback: opt.ohneIdle ? undefined : (fn) => auftraege.push(["idle", fn]),
    setTimeout: (fn, ms) => auftraege.push(["timer", fn, ms]),
    auftraege,
  };
}

describe("opencvVorwaermen", () => {
  it("laedt nicht sofort, sondern erst in der Leerlaufzeit", async () => {
    const s = laden();
    const w = fenster();
    expect(s.opencvVorwaermen(w)).toBe(true);
    expect(s.geladen).toBe(0);            // waehrend des Starts passiert nichts
    expect(w.auftraege[0][0]).toBe("idle");
    w.auftraege[0][1]();                  // Leerlauf tritt ein
    expect(s.geladen).toBe(1);
  });

  it("nimmt den Wecker, wo es kein requestIdleCallback gibt", () => {
    const s = laden();
    const w = fenster({ ohneIdle: true });
    s.opencvVorwaermen(w);
    expect(w.auftraege[0][0]).toBe("timer");
    w.auftraege[0][1]();
    expect(s.geladen).toBe(1);
  });

  it("holt nur einmal je Sitzung", () => {
    const s = laden();
    const w = fenster();
    expect(s.opencvVorwaermen(w)).toBe(true);
    expect(s.opencvVorwaermen(w)).toBe(false);
    expect(w.auftraege.length).toBe(1);
  });

  it("laesst es offline und im Datensparmodus bleiben", () => {
    expect(laden().opencvVorwaermen(fenster({ online: false }))).toBe(false);
    expect(laden().opencvVorwaermen(fenster({ saveData: true }))).toBe(false);
  });

  it("darf es nach einem Fehlschlag noch einmal versuchen", async () => {
    const s = laden();
    s.ergebnis = Promise.reject(new Error("Netz weg"));
    const w = fenster();
    s.opencvVorwaermen(w);
    w.auftraege[0][1]();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.opencvVorwaermen(fenster())).toBe(true);
  });
});
