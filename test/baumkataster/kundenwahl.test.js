// Kundenzeile in der Kundenwahl (Ruling zu Important 4 aus dem finalen
// Review): `faellig` im index.json ist eine gegen den Stand zum Zeitpunkt des
// letzten Schreibens gerechnete Zahl und friert danach ein (bkIndexEintrag).
// Ohne Prüfung stünde ein Kunde, bei dem seither etwas fällig geworden ist,
// weiter fälschlich mit "nichts fällig" da. Echter Verhaltenstest statt
// Quelltextmuster — gleiche vm-Ausschnitt-Technik wie test/angebot/bearbeiten.test.js.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "src/ui/BaumkatasterPage.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
const quelle = schnitt("const deDatum =", "\n") + "\n" + schnitt("function kundenZeile(", "\n}\n") + "\n}\n";
const sandbox = {};
vm.createContext(sandbox);
const { kundenZeile } = vm.runInContext(quelle + "\n({ kundenZeile })", sandbox);

const HEUTE = "2026-09-16";
const I = (extra) => ({ anzahl: 5, faellig: 3, naechsteKontrolle: "2026-10-01", stand: HEUTE, ...extra });

describe("kundenZeile", () => {
  it("zeigt die Fällig-Zahl, solange der Index-Stand von heute ist", () => {
    expect(kundenZeile(I(), HEUTE)).toBe("5 Bäume · 3 fällig · nächste Kontrolle 01.10.2026");
  });

  it('zeigt "nichts fällig", wenn der Stand frisch ist und niemand fällig ist', () => {
    expect(kundenZeile(I({ faellig: 0 }), HEUTE)).toBe("5 Bäume · nichts fällig · nächste Kontrolle 01.10.2026");
  });

  it("zeigt die Fällig-Zahl NICHT mehr, wenn der Stand veraltet ist — auch kein falsches „nichts fällig\"", () => {
    // Genau der Bug: ohne diese Prüfung stünde hier weiterhin "nichts fällig",
    // obwohl seit dem 14.09. etwas fällig geworden sein kann.
    const zeile = kundenZeile(I({ faellig: 0, stand: "2026-09-14" }), HEUTE);
    expect(zeile).not.toMatch(/fällig/);
    expect(zeile).toBe("5 Bäume · nächste Kontrolle 01.10.2026 (Stand 14.09.2026)");
  });

  it("nennt den veralteten Stand auch, wenn zuletzt etwas fällig war", () => {
    const zeile = kundenZeile(I({ faellig: 3, stand: "2026-09-14" }), HEUTE);
    expect(zeile).not.toMatch(/fällig/);
    expect(zeile).toContain("(Stand 14.09.2026)");
  });
});
