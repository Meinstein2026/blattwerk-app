// Freigabe erst nach der KI-Prüfung (Ansage 17.09.2026): Der Prüfer auf Giza
// schreibt seinen Befund in note_private; bis dahin ist der Entwurf sichtbar,
// aber nicht validierbar. Textuelle Verdrahtungsprüfung wie bei Einstellungen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const ausschnitt = (von, bis) => src.slice(src.indexOf(von), src.indexOf(bis));
const ctx = vm.createContext({});
vm.runInContext(ausschnitt("const PRUEF_MARKE", "function ventilationKonto"), ctx);
const { pruefungSteht, pruefungText } = ctx;

describe("KI-Prüfung als Freigabe-Schranke", () => {
  it("ohne Block gilt der Beleg als ungeprüft", () => {
    expect(pruefungSteht({ note_private: "Handnotiz" })).toBe(false);
    expect(pruefungSteht({})).toBe(false);
  });
  it("mit Block ist er geprüft und der Befund lesbar", () => {
    const inv = { note_private: "x\n=== KI-Prüfung (Giza) ===\nUrteil: OK\n- alles gut\n=== Ende KI-Prüfung ===" };
    expect(pruefungSteht(inv)).toBe(true);
    expect(pruefungText(inv)).toContain("Urteil: OK");
    expect(pruefungText(inv)).not.toContain("Ende KI-Prüfung");
  });
  it("der Validieren-Knopf hängt an der Prüfung", () => {
    const i = src.indexOf("function SupplierInvoiceDetail(");
    const teil = src.slice(i, src.indexOf("\nfunction ", i + 10));
    expect(teil).toMatch(/canValidateSupplierInvoices && \(pruefungSteht\(inv\)/);
    expect(teil).toMatch(/Prüfung läuft …/);
  });
});
