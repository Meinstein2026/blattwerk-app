// Die Rueckkamera des Durabook-Tablets liefert die ersten Bilder schwarz, weil
// die Belichtungsautomatik erst hochlaeuft (am Geraet gemessen 14.08.2026).
// Wer sofort ausloest, fotografiert den Beleg schwarz. warteAufBelichtung
// haelt den Ausloeser so lange zurueck — aber eben nicht ewig.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("async function warteAufBelichtung");
const b = src.indexOf("// ─── Beleg-Scanner", a);
if (a < 0 || b < 0) throw new Error("warteAufBelichtung nicht gefunden");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\nthis.warteAufBelichtung = warteAufBelichtung;", sandbox);
const { warteAufBelichtung } = sandbox;

// Uhr und Schlaf ohne echte Zeit: schlafen() schiebt nur den Zeiger vor.
function uhr() {
  let t = 0;
  return { jetzt: () => t, schlafen: async (ms) => { t += ms; } };
}

describe("warteAufBelichtung", () => {
  it("gibt frei, sobald die Helligkeit steht — aber nicht vor der Mindestzeit", async () => {
    const { jetzt, schlafen } = uhr();
    // hochlaufende Belichtung: 2 → 40 → 90 → 118 → dann konstant
    const werte = [2, 40, 90, 118, 120, 120, 120, 120];
    let i = 0;
    const r = await warteAufBelichtung(() => werte[Math.min(i++, werte.length - 1)], { jetzt, schlafen });
    expect(r.grund).toBe("stabil");
    expect(r.ms).toBeGreaterThanOrEqual(700);
    expect(r.ms).toBeLessThan(3000);
  });

  it("wartet den Anlauf ab, statt beim ersten stabilen Schwarz freizugeben", async () => {
    const { jetzt, schlafen } = uhr();
    // Genau die gemessene Falle: erst zweimal schwarz, dann kommt das Bild.
    const werte = [0, 0, 0, 35, 88, 130, 131, 131, 131];
    let i = 0;
    const gesehen = [];
    const r = await warteAufBelichtung(() => { const w = werte[Math.min(i++, werte.length - 1)]; gesehen.push(w); return w; }, { jetzt, schlafen });
    expect(r.grund).toBe("stabil");
    expect(gesehen.at(-1)).toBe(131); // freigegeben wurde auf dem hellen Bild, nicht auf dem schwarzen
  });

  it("gibt eine wirklich dunkle Szene nach der Hoechstzeit trotzdem frei", async () => {
    const { jetzt, schlafen } = uhr();
    const r = await warteAufBelichtung(() => 3 + (jetzt() % 7), { jetzt, schlafen, schwelle: 0.0001 });
    expect(r.grund).toBe("zeit");
    expect(r.ms).toBeLessThanOrEqual(3000 + 150);
  });

  it("laeuft weiter, solange noch gar kein Bild da ist (null)", async () => {
    const { jetzt, schlafen } = uhr();
    let i = 0;
    const r = await warteAufBelichtung(() => (i++ < 5 ? null : 100), { jetzt, schlafen });
    expect(r.grund).toBe("stabil");
    expect(r.ms).toBeGreaterThanOrEqual(700);
  });

  it("bricht ab, wenn zwischendurch die Kamera gewechselt wurde", async () => {
    const { jetzt, schlafen } = uhr();
    let gen = 1;
    const r = await warteAufBelichtung(() => { if (jetzt() >= 300) gen = 2; return 0; },
      { jetzt, schlafen, abbruch: () => gen !== 1 });
    expect(r.grund).toBe("abbruch");
    expect(r.ms).toBeLessThan(3000);
  });

  it("stolpert nicht ueber eine werfende Messung", async () => {
    const { jetzt, schlafen } = uhr();
    let i = 0;
    const r = await warteAufBelichtung(() => { if (i++ < 3) throw new Error("kein Kontext"); return 77; }, { jetzt, schlafen });
    expect(r.grund).toBe("stabil");
  });
});
