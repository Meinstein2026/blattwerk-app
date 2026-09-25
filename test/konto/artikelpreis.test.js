// Neu angelegte Artikel duerfen nie mit 0 € oder unter Einkaufspreis im Stamm
// landen — sonst verkauft sie das naechste Angebot geschenkt. Regel von Max
// am 20.08.2026: Verkaufspreis mindestens Einkaufspreis.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const von = "const verkaufspreisAusEinkauf =";
const bis = "\n// Restbetrag einer LIEFERANTENrechnung.";
const code = src.slice(src.indexOf(von), src.indexOf(bis, src.indexOf(von)));
const sandbox = {};
vm.createContext(sandbox);
const verkaufspreisAusEinkauf = vm.runInContext(`(() => { ${code}; return verkaufspreisAusEinkauf; })()`, sandbox);

describe("verkaufspreisAusEinkauf", () => {
  it("uebernimmt den Einkaufspreis als Netto-Verkaufspreis", () => {
    expect(verkaufspreisAusEinkauf({ price: 12.5 })).toEqual({ price: 12.5, price_base_type: "HT" });
    expect(verkaufspreisAusEinkauf({ price: "9.99" })).toEqual({ price: 9.99, price_base_type: "HT" });
  });
  it("rundet auf Cent", () => {
    expect(verkaufspreisAusEinkauf({ price: 3.33333 }).price).toBe(3.33);
  });
  it("setzt bei 0 oder fehlendem Preis GAR keinen Preis (statt 0 festzuschreiben)", () => {
    expect(verkaufspreisAusEinkauf({ price: 0 })).toEqual({});
    expect(verkaufspreisAusEinkauf({})).toEqual({});
    expect(verkaufspreisAusEinkauf({ price: "" })).toEqual({});
    expect(verkaufspreisAusEinkauf({ price: -5 })).toEqual({});
  });
});
