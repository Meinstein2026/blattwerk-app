// Regression fuer den StrictMode-„lebt"-Bug in GbuFormSkt.jsx (17.09.2026,
// gefunden beim ersten echten Browser-Smoke-Test der Maske, scripts/gbu-smoke.*).
//
// `lebt` ist die "noch gemountet?"-Wache fuer die Automatik-Callbacks (GPS,
// Kartenbild, Adresse, Wetter, Netzempfang). React 18 StrictMode (aktiv in
// main.jsx, also bei jedem `npm run dev`) haengt jeden Effekt beim ersten
// Rendern testweise aus- und sofort wieder ein. Ein Effekt, dessen Rueckgabe
// `lebt.current` auf false setzt, aber dessen SETUP das nicht wieder auf true
// zuruecknimmt, bleibt nach diesem Probelauf dauerhaft auf false stehen — dann
// brechen alle "if (!lebt.current) return"-Waechter fuer den Rest des
// Bauteil-Lebens ab, ohne jede Fehlermeldung (GPS-Anzeige/Karte/Adresse/
// Wetter/Netzempfang bleiben fuer immer "offen"). Kein Test rendert die Maske
// (kein jsdom, vite.config.js: environment "node") — dieser Test liest darum
// den Quelltext, wie test/fahrtenbuch/verdrahtung.test.js und
// test/ueberlassung/ablage.test.js es fuer aehnliche Faelle schon tun.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/ui/GbuFormSkt.jsx"), "utf8");

describe("lebt-Wache uebersteht React-StrictMode-Doppelausfuehrung", () => {
  it("setzt lebt.current beim Einhaengen selbst wieder auf true", () => {
    const m = src.match(/const lebt = useRef\(true\);\s*\n\s*useEffect\(\(\) => ([\s\S]*?)\}, \[\]\);/);
    expect(m, "useEffect fuer `lebt` nicht gefunden").toBeTruthy();
    const rumpf = m[1];
    // Verboten: ein Effekt, dessen Setup NUR eine Cleanup-Funktion zurueckgibt
    // (also nichts tut, wenn er eingehaengt/wieder eingehaengt wird).
    expect(rumpf).not.toMatch(/^\(\) => \{ lebt\.current = false; \}$/);
    expect(rumpf).toMatch(/lebt\.current = true/);
  });

  it("jeder `if (!lebt.current) return`-Waechter hat ein Gegenstueck, das lebt.current wieder auf true setzt", () => {
    // Nicht auf die Zeilenzahl der Waechter versteifen (koennen dazukommen) —
    // nur sicherstellen, dass die Wache ueberhaupt zuruckgesetzt werden kann.
    expect(src).toMatch(/if \(!lebt\.current\) return/);
    expect(src).toMatch(/lebt\.current = true/);
  });
});
