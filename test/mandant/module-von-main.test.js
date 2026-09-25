// Merge mit main (19.09.2026): Baumkataster, Betriebsanweisung und der
// Fahrtenbuch-Stempel kamen mit festen Blattwerk-Pfaden. Ein fremder Mandant
// darf dort nie in Blattwerks Ordner landen — und kein Modul darf ohne
// Block-Wache ausgeliefert werden.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { bkFotoDir } from "../../src/server/baumkataster.mjs";

const lies = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Server-Module sind mandantenfähig", () => {
  it("Fotos des Katasters liegen im Ordner des Mandanten", () => {
    expect(bkFotoDir("/Baum%20M%C3%BCller")).toBe("/Baum%20M%C3%BCller/Baumkataster");
  });
  it("kein Modul unter src/server trägt einen festen Blattwerk-Pfad oder die alten Helfer", () => {
    for (const f of readdirSync(new URL("../../src/server/", import.meta.url))) {
      const src = ohneKommentare(lies("src/server/" + f));
      expect(src, f).not.toMatch(/["'`]\/?Blattwerk\//);
      expect(src, f).not.toMatch(/assertBlattwerk|ncPfad\(/);
    }
  });
  it("die neuen Routen hängen per Präfix an ihrem Block", () => {
    const s = lies("server.mjs");
    expect(s).toMatch(/app\.use\("\/api\/nc\/baumkataster", wacheErp\)/);
    expect(s).toMatch(/app\.use\(\["\/api\/nc\/unterweisungen", "\/api\/nc\/gbu"\], wacheArbeitsschutz\)/);
    expect(s).toMatch(/app\.use\(\["\/api\/chat", "\/api\/nc\/chat-hinterlegung"\], wacheChat\)/);
  });
  it("PDFs tragen den Betrieb des Mandanten, nicht Blattwerks Anschrift", () => {
    for (const f of ["src/gbu-pdf.js", "src/baumkataster-pdf.js"]) expect(ohneKommentare(lies(f)), f).not.toMatch(/Musterstraße|Blattwerk GbR|Blattwerk-App/);
  });
});
