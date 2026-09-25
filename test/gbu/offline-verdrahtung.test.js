// test/gbu/offline-verdrahtung.test.js
// Verdrahtung der Offline-Vor-Ort-GBU in dolibarr-app.jsx / GbuFormSkt.jsx:
// kein jsdom im Projekt (vite.config.js: environment "node"), deshalb wie
// test/ueberlassung/ablage.test.js und test/gbu/strictmode-lebt.test.js eine
// Quelltextprüfung statt eines Renderings. Nagelt die Regeln fest, die sonst
// unbemerkt wegrefactort werden könnten:
//  - das PDF landet NIE im localStorage (Kontingent, siehe CLAUDE.md),
//  - canShare wird VOR share geprüft,
//  - die Warteschlange wird VOR dem PDF-Aufbau geschrieben (save() darf die
//    Beurteilung nicht verlieren, wenn buildGbuPdf scheitert).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const formSkt = fs.readFileSync(path.join(process.cwd(), "src/ui/GbuFormSkt.jsx"), "utf8");

const abschnitt = (src, startMarker, endMarker) => {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error("Marker fehlt: " + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  return src.slice(a, b < 0 ? src.length : b);
};

describe("gbuPdfSpeichernLokal: PDF geht nach IndexedDB, nie nach localStorage", () => {
  const funktion = abschnitt(app, "async function gbuPdfSpeichernLokal(record, betrieb) {", "\n}\n");
  it("benutzt idbSetzen mit dem GBU_PDF_DB/GBU_PDF_SPEICHER-Paar", () => {
    expect(funktion).toMatch(/idbSetzen\(GBU_PDF_DB, GBU_PDF_SPEICHER, record\.id/);
  });
  it("schreibt an keiner Stelle in den localStorage", () => {
    expect(funktion).not.toMatch(/localStorage/);
  });
  it("räumt danach auf (gbuPdfAufraeumen)", () => {
    expect(funktion).toMatch(/gbuPdfAufraeumen\(\)/);
  });
});

describe("gbuTeilenOderSpeichern: canShare VOR share, kein Absturz bei Abbruch", () => {
  const funktion = abschnitt(app, "async function gbuTeilenOderSpeichern(", "\n}\n");
  it("prüft canShare, bevor share aufgerufen wird", () => {
    const iCanShare = funktion.indexOf("navigator.canShare(");
    const iShare = funktion.indexOf("navigator.share(");
    expect(iCanShare).toBeGreaterThan(-1);
    expect(iShare).toBeGreaterThan(-1);
    expect(iCanShare).toBeLessThan(iShare);
  });
  it("ein Abbruch durch den Menschen (AbortError) fällt still auf Speichern zurück, kein Fehler-Toast", () => {
    expect(funktion).toMatch(/AbortError/);
  });
  it("die Speichern-Ausweichstelle geht über das vorhandene dateiSpeichern, keine zweite Bauart", () => {
    expect(funktion).toMatch(/dateiSpeichern\(/);
  });
});

describe("GbuFormSkt.save(): Warteschlange VOR dem PDF-Aufbau", () => {
  const funktion = abschnitt(formSkt, "const save = async () => {", "\n  };");
  it("saveGbuQueue steht vor gbuPdfSpeichernLokal", () => {
    const iQueue = funktion.indexOf("saveGbuQueue(");
    const iPdf = funktion.indexOf("gbuPdfSpeichernLokal(");
    expect(iQueue).toBeGreaterThan(-1);
    expect(iPdf).toBeGreaterThan(-1);
    expect(iQueue).toBeLessThan(iPdf);
  });
  it("ohne Netz wird NICHT sofort geschlossen (onSaved), sondern Schritt 4 gezeigt", () => {
    expect(funktion).toMatch(/setStep\(4\)/);
    // Im offline-Zweig darf onSaved nicht direkt aufgerufen werden — das würde
    // die Maske schließen, bevor "An Kollegen weitergeben" sichtbar war.
    const offlineZweig = funktion.slice(funktion.indexOf("} else {"));
    expect(offlineZweig).not.toMatch(/onSaved\?\.\(\)/);
  });
});

describe("buildRecord(): meLogin ist der einzige sicher bekannte Login", () => {
  it("setzt meLogin aus dem me-Prop", () => {
    const funktion = abschnitt(formSkt, "const buildRecord = () => ({", "\n  });");
    expect(funktion).toMatch(/meLogin:\s*me\?\.login/);
  });
});

describe("GbuPage: Archiv-Anzeige gated NUR auf navigator.onLine, kein zweiter Sonderweg", () => {
  it("zeigeArchiv verlangt canViewAllGbu UND online", () => {
    expect(app).toMatch(/const zeigeArchiv = !!me\?\.canViewAllGbu && online;/);
  });
});
