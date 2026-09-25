// Der PDF-Export eines Angebots ging nie — auch nicht bei validierten. Grund:
// Dolibarrs Datei-Zugriffspruefung (core/lib/files.lib.php) kennt beim Angebot
// nur `propal`/`propale`. Mit `proposal` antwortet /documents/builddoc mit
// Status 200 und LEEREM Inhalt: das PDF wird gebaut, aber nicht zurueckgegeben.
// Die App zeigte daraufhin "Beleg ggf. zuerst validieren" — eine Fehlspur.
// Am 10.08.2026 am Quelltext nachgelesen und an Wegwerf-Belegen gegengeprueft:
// mit `propal` kamen 48–65 KB echtes PDF, im Entwurf mit dem Vermerk
// "Nicht freigegeben". (Bei der Rechnung kennt files.lib beide Namen, deshalb
// fiel es dort nie auf.)
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const von = src.indexOf("const dateiBereich =");
const bis = src.indexOf("// Build the PDF", von);
if (von < 0 || bis < 0) throw new Error("dateiBereich nicht gefunden");
const sandbox = {};
vm.createContext(sandbox);
const { dateiBereich } = vm.runInContext(src.slice(von, bis) + "\n({ dateiBereich })", sandbox);

describe("dateiBereich", () => {
  it("uebersetzt das Angebot nach propal", () => {
    expect(dateiBereich("proposal")).toBe("propal");
  });

  it("uebersetzt die Lieferantenrechnung nach facture_fournisseur", () => {
    // Gleiche Ursache, anderer Beleg: mit `supplier_invoice` bekamen
    // Nicht-Admins 403 beim Herunterladen (gefunden 22.07.2026).
    expect(dateiBereich("supplier_invoice")).toBe("facture_fournisseur");
  });

  it("laesst Namen in Ruhe, die files.lib selbst kennt", () => {
    expect(dateiBereich("invoice")).toBe("invoice");
    expect(dateiBereich("propal")).toBe("propal");
    expect(dateiBereich("project")).toBe("project");
  });
});

describe("Wer die Uebersetzung benutzen muss", () => {
  it("der PDF-Export", () => {
    const fn = src.slice(src.indexOf("async function pdfErzeugen"), src.indexOf("// Loads selectable tasks"));
    expect(fn).toContain("modulepart: dateiBereich(modulepart)");
  });

  it("der Beleg-Download im Viewer", () => {
    const fn = src.slice(src.indexOf("function DocViewerModal"), src.indexOf("function FileUploadSection"));
    expect(fn).toContain("dateiBereich(modulepart)");
  });

  it("meldet einen Fehlschlag nicht mehr als 'zuerst validieren'", () => {
    // Der Satz schickte auf die falsche Faehrte: der Export scheiterte
    // unabhaengig vom Status.
    expect(src).not.toContain("Beleg ggf. zuerst validieren");
  });

  it("bietet den Export auch im Entwurf an", () => {
    // Ein Entwurf hat die vorlaeufige Referenz "(PROV<id>)" — die Knoepfe
    // haengen an der Referenz, nicht am Status.
    expect(src).toMatch(/disabled=\{!prop\.ref \|\| pdfLaedt\}/);
    expect(src).toMatch(/disabled=\{!inv\.ref \|\| pdfLaedt\}/);
    expect(src).toContain('pdfErzeugen(api,"proposal",prop.ref||""');
    expect(src).toContain('pdfErzeugen(api,"invoice",inv.ref||""');
  });

  it("zeigt das erzeugte PDF im eigenen Viewer, statt es wegzuschicken", () => {
    // Der alte Weg war ein <a download> auf eine blob:-Adresse. Die App-Huelle
    // verwirft die (MainActivity: `if (!url.startsWith("http")) return;`) —
    // der Export ging also ins Leere, ohne Datei und ohne Meldung.
    expect(src.match(/<DateiAnsichtModal/g) || []).toHaveLength(4); // Angebot, Rechnung, DocViewerModal, Betriebsdokumente
    expect(src).not.toContain("async function exportPdf");
  });
});

describe("Speichern laeuft ueber den Server", () => {
  const fn = src.slice(src.indexOf("async function dateiSpeichern"), src.indexOf("// Build the PDF"));

  it("legt die Datei erst am Server ab", () => {
    expect(fn).toContain('"/api/datei/ablegen"');
  });

  it("navigiert dorthin, statt ein <a download> zu bauen", () => {
    // Die WebView loest den Download-Manager erst aus, wenn sie zu einer
    // Adresse navigiert, deren Antwort "Content-Disposition: attachment" sagt.
    expect(fn).toContain("window.location.href = adresse");
  });

  it("behaelt den direkten Weg als Notnagel fuer den Browser", () => {
    expect(fn).toContain("a.download");
  });
});
