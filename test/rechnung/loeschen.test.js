// Wer welche Rechnung loeschen darf. Der Anlass ist nicht technisch: eine
// validierte Ausgangsrechnung ist nach GoBD eine unveraenderbare Aufzeichnung,
// korrigiert wird mit Storno oder Gutschrift. (16.08.2026)
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};

// Die Regel selbst, aus der Datei geschnitten und als Funktion ausgewertet —
// so kann sie nicht auseinanderlaufen mit dem, was die App tut.
const regel = schnitt("  const darfLoeschen =", ";\n").replace("  const darfLoeschen =", "");
const sandbox = {};
vm.createContext(sandbox);
const darfLoeschen = (statut, isAdmin) =>
  vm.runInContext(`((inv, me) => (${regel}))`, sandbox)({ statut }, { isAdmin });

describe("Rechnung loeschen", () => {
  it("laesst jeden seinen Entwurf wegwerfen", () => {
    expect(darfLoeschen(0, false)).toBe(true);
    expect(darfLoeschen(0, true)).toBe(true);
  });

  it("haelt Nicht-Admins von validierten Rechnungen fern", () => {
    // Status 1 = Offen, also validiert und beim Kunden.
    expect(darfLoeschen(1, false)).toBeFalsy();
  });

  it("laesst Admins die frisch validierte Rechnung noch zurueckziehen", () => {
    // Sonst wird es in Dolibarr selbst gemacht — dort ohne diese Ueberlegung.
    expect(darfLoeschen(1, true)).toBe(true);
  });

  it("laesst bezahlte und stornierte Rechnungen fuer niemanden loeschbar", () => {
    for (const st of [2, 3]) {
      expect(darfLoeschen(st, false)).toBeFalsy();
      expect(darfLoeschen(st, true)).toBeFalsy();
    }
  });
});
