// Einstellungen (09.09.2026): Geraete-/App-Einstellungen wohnen im Burger-Menue
// unter „Einstellungen", das Profil traegt nur noch die Person. Textuelle
// Verdrahtungspruefung wie bei Fahrtenbuch/Service-Worker.
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

describe("Einstellungen im Burger-Menü", () => {
  it("Menüpunkt und Seite", () => {
    expect(funktion("BottomNav")).toMatch(/key: "einstellungen"/);
    expect(funktion("App")).toMatch(/tab === "einstellungen"\s*&&\s*<EinstellungenPage/);
  });
  it("die Seite trägt Darstellung, Buchungskonten, App-Update, Nextcloud und Adminbereich", () => {
    const s = funktion("EinstellungenPage");
    expect(s).toMatch(/setTheme\(/);
    expect(s).toMatch(/<KontoConfigPanel/);
    expect(s).toMatch(/<AppUpdatePanel/);
    expect(s).toMatch(/<NextcloudPanel/);
    expect(s).toMatch(/<AdminPanel/);
    expect(s).toMatch(/refreshRefCache\(/);
  });
  it("im Profil bleibt nur die Person: Daten, Zugang, Tutorial, Abmelden", () => {
    const p = funktion("Profile");
    expect(p).toMatch(/Persönliche Daten/);
    expect(p).toMatch(/Abmelden/);
    expect(p).toMatch(/onShowTutorial/);
    for (const x of ["<KontoConfigPanel", "<AppUpdatePanel", "<NextcloudPanel", "<AdminPanel", "setTheme("]) expect(p).not.toContain(x);
  });
  it("Verweise zeigen auf Einstellungen, nicht mehr aufs Profil", () => {
    expect(src).not.toMatch(/Profil → (App-Update|Nextcloud)/);
    expect(src).toMatch(/Einstellungen → App-Update/);
  });
  it("Deep-Link #einstellungen öffnet die Seite", () => {
    expect(funktion("App")).toMatch(/#einstellungen/);
  });
});
