// Zahlungserfassung auf Kundenrechnungen. Die eine Falle, die dieser Test
// festnagelt: Dolibarrs addPayment (POST /invoices/{id}/payments) bucht IMMER
// den vollen Restbetrag — ein Teilbetrag, der dorthin geschickt wird, wuerde
// stillschweigend als Vollzahlung gebucht. Teilbetraege muessen deshalb ueber
// /invoices/paymentsdistributed gehen (api_invoices.class.php, Dolibarr 23,
// am 20.08.2026 gegengelesen).
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

// Den ganzen Abschnitt herausschneiden und die reinen Funktionen einsammeln.
const code = schnitt(
  "// ─── Zahlungserfassung & Finanzübersicht",
  "// ─── Ende Zahlungserfassung & Finanzübersicht"
);
const sandbox = {};
vm.createContext(sandbox);
const { restBetrag, zahlungPlan, zahlungFehler, lieferantRestBetrag, lieferantZahlungBody } = vm.runInContext(
  `(() => { ${code}; return { restBetrag, zahlungPlan, zahlungFehler, lieferantRestBetrag, lieferantZahlungBody }; })()`,
  sandbox
);

const inv = { id: 42, total_ttc: "265.00000000", remaintopay: 265, totalpaid: 0 };

describe("restBetrag", () => {
  it("nimmt remaintopay, wenn Dolibarr es liefert", () => {
    expect(restBetrag({ remaintopay: "100.5", total_ttc: "999" })).toBe(100.5);
  });
  it("rechnet sonst total_ttc minus totalpaid", () => {
    expect(restBetrag({ total_ttc: "200", totalpaid: "50" })).toBe(150);
  });
});

describe("zahlungPlan", () => {
  const wahl = { betrag: 265, datum: "2026-08-20", zahlungsartId: "2", kontoId: "1", kommentar: "" };

  it("schickt eine Vollzahlung an /invoices/{id}/payments", () => {
    const plan = zahlungPlan(inv, wahl);
    expect(plan.pfad).toBe("/invoices/42/payments");
    expect(plan.body.datepaye).toBe("2026-08-20");
    expect(plan.body.paymentid).toBe(2);
    expect(plan.body.accountid).toBe(1);
    expect(plan.body.closepaidinvoices).toBe("yes");
    expect(plan.body.arrayofamounts).toBeUndefined();
  });

  it("toleriert Rundungsdifferenzen unter einem halben Cent als Vollzahlung", () => {
    const plan = zahlungPlan(inv, { ...wahl, betrag: 265.004 });
    expect(plan.pfad).toBe("/invoices/42/payments");
  });

  it("schickt einen Teilbetrag an /invoices/paymentsdistributed", () => {
    const plan = zahlungPlan(inv, { ...wahl, betrag: 100 });
    expect(plan.pfad).toBe("/invoices/paymentsdistributed");
    expect(plan.body.arrayofamounts).toEqual({ "42": { amount: "100", multicurrency_amount: "" } });
    // closepaidinvoices bleibt "yes": Dolibarr schliesst ohnehin nur, was
    // danach wirklich vollstaendig bezahlt ist.
    expect(plan.body.closepaidinvoices).toBe("yes");
  });
});

describe("Lieferantenrechnung", () => {
  // Die Liste liefert weder totalpaid noch remaintopay — bezahlt erkennt man
  // nur an paye=1.
  it("lieferantRestBetrag: offen = voller Betrag, bezahlt = 0", () => {
    expect(lieferantRestBetrag({ paye: "0", total_ttc: "936.41" })).toBe(936.41);
    expect(lieferantRestBetrag({ paye: "1", total_ttc: "936.41" })).toBe(0);
  });

  const si = { id: 202, paye: "0", total_ttc: "936.41" };
  const wahl = { betrag: 936.41, datum: "2026-08-20", zahlungsartId: "2", kontoId: "1", kommentar: "" };

  it("nutzt payment_mode_id statt paymentid (die alte Pipeline-Falle)", () => {
    const body = lieferantZahlungBody(si, wahl);
    expect(body.payment_mode_id).toBe(2);
    expect(body.paymentid).toBeUndefined();
    expect(body.accountid).toBe(1);
    expect(body.closepaidinvoices).toBe("yes");
  });

  it("schickt datepaye als Unix-Timestamp, nicht als String (Restler-400 vom 20.08.2026)", () => {
    const body = lieferantZahlungBody(si, wahl);
    // 2026-08-20 12:00 UTC — mittags, damit keine Zeitzone den Tag kippt.
    expect(body.datepaye).toBe(Date.UTC(2026, 7, 20, 12) / 1000);
    expect(typeof body.datepaye).toBe("number");
  });

  it("lässt amount bei Vollzahlung weg (Dolibarr bucht dann den Rest)", () => {
    expect(lieferantZahlungBody(si, wahl).amount).toBeUndefined();
  });

  it("schickt amount bei Teilbetrag mit", () => {
    expect(lieferantZahlungBody(si, { ...wahl, betrag: 400 }).amount).toBe(400);
  });
});

describe("zahlungFehler", () => {
  const gut = { betrag: 100, datum: "2026-08-20", zahlungsartId: "2", kontoId: "1" };
  it("laesst eine vollstaendige Eingabe durch", () => {
    expect(zahlungFehler(gut, 265)).toBeNull();
  });
  it("weist 0, negative und fehlende Betraege ab", () => {
    expect(zahlungFehler({ ...gut, betrag: 0 }, 265)).toBeTruthy();
    expect(zahlungFehler({ ...gut, betrag: -5 }, 265)).toBeTruthy();
    expect(zahlungFehler({ ...gut, betrag: NaN }, 265)).toBeTruthy();
  });
  it("weist Ueberzahlung ab", () => {
    expect(zahlungFehler({ ...gut, betrag: 300 }, 265)).toBeTruthy();
  });
  it("laesst bei gemahnten Rechnungen bis zur Gesamtforderung durch", () => {
    // Dritter Parameter = gemahnte Gesamtforderung (Rest + Mahnkosten +
    // Zinsen). Bis dorthin ist die "Ueberzahlung" gewollt — der Mehrbetrag
    // wird nicht auf die Rechnung gebucht, sondern als vereinnahmte
    // Mahnkosten am Beleg vermerkt. Darueber bleibt es ein Fehler.
    expect(zahlungFehler({ ...gut, betrag: 270.48 }, 265, 270.48)).toBeNull();
    expect(zahlungFehler({ ...gut, betrag: 271 }, 265, 270.48)).toBeTruthy();
  });
  it("verlangt Datum, Zahlungsart und Konto", () => {
    expect(zahlungFehler({ ...gut, datum: "" }, 265)).toBeTruthy();
    expect(zahlungFehler({ ...gut, zahlungsartId: "" }, 265)).toBeTruthy();
    expect(zahlungFehler({ ...gut, kontoId: "" }, 265)).toBeTruthy();
  });
});
