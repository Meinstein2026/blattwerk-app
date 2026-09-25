// Zugriffsschutz der Verwaltungs-Endpunkte (Befund 1, Abschlussprüfung
// 2026-08-09): /api/pl/list und /api/pl/file/:id nehmen keine Zugangsdaten
// entgegen — die einzige Schranke ist die thema-Whitelist. Ein Endpunkt, der
// nur das Präfix "Thema/" prüft, gibt das gesamte Bereich/Blattwerk-Archiv
// heraus (Lohn, Steuer, Bank, ...), nicht nur die vier Themen, die der
// Verwaltungs-Reiter zeigen soll.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
/** Quelltext eines GET-Endpunkts, ohne Kommentarzeilen (die sonst mitgeprüft würden). */
const endpunkt = (pfad) => {
  const a = src.indexOf(`app.get("${pfad}"`);
  if (a < 0) throw new Error("Endpunkt fehlt: " + pfad);
  const b = src.indexOf("\napp.", a + 10);
  return src.slice(a, b < 0 ? src.length : b)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
};

describe("Befund 1: thema-Whitelist statt Präfixprüfung", () => {
  const liste = endpunkt("/api/pl/list");
  const datei = endpunkt("/api/pl/file/:id");

  it("PL_THEMA_ERLAUBT besteht aus den Werten von PL_THEMA, nicht aus einem Präfixmuster", () => {
    expect(src).toMatch(/const PL_THEMA_ERLAUBT = new Set\(Object\.values\(PL_THEMA\)\)/);
  });

  it("/api/pl/list prüft thema gegen die Whitelist", () => {
    expect(liste).toMatch(/if \(!PL_THEMA_ERLAUBT\.has\(thema\)\) return res\.status\(400\)/);
    // Die alte, zu schwache Prüfung darf nicht wiederkommen.
    expect(liste).not.toMatch(/thema\.startsWith\(.Thema\/.\)/);
  });

  it("/api/pl/file/:id reicht eine ID nicht mehr ungeprüft durch", () => {
    // Vorher stand hier wörtlich "ist Absicht und ungefaehrlich" — genau das
    // war der Befund: das Dienstkonto sieht das ganze Bereich/Blattwerk-
    // Archiv, nicht nur die vier Verwaltungs-Themen. Die ID wird jetzt gegen
    // die Paperless-Tags des Dokuments selbst geprüft.
    expect(datei).not.toMatch(/ist Absicht und ungefaehrlich/);
    expect(datei).toMatch(/themaIds\.includes\(t\)/);
    expect(datei).toMatch(/status\(404\)\.json\(\{ error: "nicht gefunden" \}\)/);
  });

  it("/api/pl/file/:id prüft das Thema, BEVOR der Dateiinhalt geladen wird", () => {
    // Sonst ginge ein Dokument mit falschem Thema trotzdem einmal komplett
    // durch die Leitung, bevor es abgelehnt wird.
    const pruefung = datei.indexOf("themaIds.includes(t)");
    const download = datei.indexOf("/download/");
    expect(pruefung).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(download);
  });

  it("ein einzelnes fehlendes Themen-Schlagwort in Paperless blockiert nicht alle anderen", () => {
    // plId(...).catch(() => null) statt eines gemeinsamen Promise.all-Fehlschlags:
    // ist z. B. Thema/Betriebsdokument in Paperless noch nicht angelegt, sollen
    // GBU/Prüfprotokoll/Arbeitsschutz trotzdem funktionieren.
    expect(datei).toMatch(/plId\("tags", t\)\.catch\(\(\) => null\)/);
  });
});

describe("Befund 3: Einweisungsprotokolle serverseitig ausgeschlossen, nicht per Client-Parameter", () => {
  const liste = endpunkt("/api/pl/list");
  const datei = endpunkt("/api/pl/file/:id");

  it("/api/pl/list koppelt den Ausschluss fest an thema === PL_THEMA.arbeitsschutz", () => {
    expect(liste).toMatch(/thema === PL_THEMA\.arbeitsschutz \? \[await plId\("tags", PL_THEMA_UNTERWEISUNG\)\] : \[\]/);
  });

  it("der Ausschluss ist NICHT aus der Anfrage des Aufrufers ableitbar", () => {
    // Ein waehlbarer Parameter (z. B. req.query.ohneThema) liesse sich bei
    // einem Aufruf direkt gegen den Endpunkt einfach weglassen — dann waeren
    // die Einweisungsprotokolle wieder in der Liste. Der Ausschluss darf
    // deshalb nur von thema abhaengen, nie vom Request selbst.
    expect(liste).not.toMatch(/req\.query\.ohneThema/);
    expect(liste).not.toMatch(/req\.body\.ohneThema/);
  });

  it("/api/pl/file/:id sperrt Thema/Unterweisung unbedingt, unabhängig vom Thema-Treffer", () => {
    // Ein Einweisungsprotokoll traegt IMMER auch Thema/Arbeitsschutz (eines
    // der vier erlaubten Themen) und wuerde die reine Themenpruefung von
    // Befund 1 sonst bestehen, sobald jemand seine ID kennt oder erraet.
    expect(datei).toMatch(/const unterweisungId = await plId\("tags", PL_THEMA_UNTERWEISUNG\)\.catch\(\(\) => null\)/);
    expect(datei).toMatch(/if \(!hatErlaubtesThema \|\| istUnterweisung\)/);
  });

  it("PL_THEMA_UNTERWEISUNG wird importiert, aber nicht in die thema-Whitelist gemischt", () => {
    expect(src).toMatch(/import \{ PL_THEMA, PL_THEMA_UNTERWEISUNG,/);
    // PL_THEMA_ERLAUBT entsteht aus Object.values(PL_THEMA) — PL_THEMA selbst
    // hat weiterhin nur die vier Werte (siehe test/paperless/query.test.js).
    // Würde PL_THEMA_UNTERWEISUNG dort mitzählen, ließe sie sich wieder als
    // `thema` anfordern.
    expect(src).not.toMatch(/PL_THEMA\s*=\s*\{[^}]*Unterweisung/s);
  });
});
