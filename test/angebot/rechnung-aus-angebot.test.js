// Aus einem Angebot eine Rechnung machen. Dolibarrs eigene Umrechnung schlaegt
// auf dieser Instanz durchweg fehl (alle vier bekannten REST-Varianten), es
// laeuft also immer der Ersatzweg in der App — nachweisbar an `note_private`,
// das auf jeder so erzeugten Rechnung steht. Deshalb gehoert genau dieser
// Ersatzweg geprueft. (16.08.2026)
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
const sandbox = {};
vm.createContext(sandbox);
const { rechnungZeileAusAngebot } = vm.runInContext(
  schnitt("const rechnungZeileAusAngebot =", "\nfunction ")
  + "\n({ rechnungZeileAusAngebot })", sandbox);

// So liefert GET /proposals/{id} eine Zeile: alles als Zeichenkette.
const angebotszeile = (extra = {}) => ({
  id: "174", desc: "", qty: "30", subprice: "1.25000000",
  tva_tx: "0.000", remise_percent: "0", fk_product: "25", product_type: "1",
  ...extra,
});

describe("rechnungZeileAusAngebot", () => {
  it("nimmt den Rabatt mit", () => {
    // Der Fall aus Angebot PR2608-0021: 30 x 1,25 EUR mit 100 % Nachlass,
    // im Angebot also 0,00 EUR. Ohne remise_percent wurden daraus 37,50 EUR
    // auf der Rechnung, und der Kunde bekam eine um 37,50 EUR zu hohe Rechnung.
    expect(rechnungZeileAusAngebot(angebotszeile({ remise_percent: "100" })).remise_percent).toBe(100);
    expect(rechnungZeileAusAngebot(angebotszeile({ remise_percent: "12.5" })).remise_percent).toBe(12.5);
    expect(rechnungZeileAusAngebot(angebotszeile()).remise_percent).toBe(0);
  });

  it("erfindet keinen Positionstext, wo ein Artikel steht", () => {
    // Leerer Text + Artikel heisst in Dolibarr "nimm den Artikelnamen".
    expect(rechnungZeileAusAngebot(angebotszeile()).desc).toBe("");
    expect(rechnungZeileAusAngebot(angebotszeile({ desc: "Hecke schneiden" })).desc).toBe("Hecke schneiden");
    // Ohne Artikel braucht die Zeile dagegen irgendeinen Text.
    expect(rechnungZeileAusAngebot(angebotszeile({ fk_product: "", desc: "" })).desc).toBe("Position");
  });

  it("uebernimmt Menge, Preis, Steuersatz und Art der Zeile", () => {
    const z = rechnungZeileAusAngebot(angebotszeile({ qty: "4", subprice: "60.00000000", tva_tx: "19.000", product_type: "0" }));
    expect(z).toMatchObject({ qty: 4, subprice: 60, tva_tx: 19, product_type: 0, fk_product: 25 });
  });

  it("laesst den Steuersatz 0 stehen, statt auf 19 auszuweichen", () => {
    // Blattwerk rechnet als Kleinunternehmer mit 0 % — ein Vorgabewert von 19
    // wuerde hier jede Zeile verfaelschen.
    expect(rechnungZeileAusAngebot(angebotszeile({ tva_tx: "0" })).tva_tx).toBe(0);
    // Fehlt der Satz ganz, bleibt die alte Annahme 19 %.
    const ohne = { ...angebotszeile() }; delete ohne.tva_tx;
    expect(rechnungZeileAusAngebot(ohne).tva_tx).toBe(19);
  });

  it("haengt fk_product nur an, wenn es eines gibt", () => {
    expect(rechnungZeileAusAngebot(angebotszeile({ fk_product: "" })).fk_product).toBeUndefined();
    expect(rechnungZeileAusAngebot(angebotszeile({ fk_product: "0" })).fk_product).toBeUndefined();
  });
});

describe("Der Lieferschein draengt sich nicht mehr auf", () => {
  // Blattwerk ist ein Dienstleistungsbetrieb; in Dolibarr steht seit Bestehen
  // kein einziger Lieferschein. Der Dialog sprang trotzdem nach jedem
  // Validieren einer Rechnung von selbst auf.
  const validieren = schnitt("  const validate = async () => {", "  const remove = async () => {");

  it("oeffnet nach dem Validieren keinen Dialog", () => {
    expect(validieren).not.toContain("setShowShipmentDialog(true)");
  });

  it("laesst ihn aber erreichbar", () => {
    // Ohne diesen Knopf waere LieferscheinDialog toter Quelltext.
    expect(src).toContain('onClick={() => setShowShipmentDialog(true)}');
  });
});

describe("Das Angebot wird danach abgehakt", () => {
  // Sonst steht ein laengst abgerechnetes Angebot in der Liste weiter als
  // offen — und der "In Rechnung"-Knopf haengt an statut [1,2], legt also
  // beim zweiten Tippen eine zweite Rechnung an.
  const ablauf = schnitt("  const createInvoiceFromProposal = async () => {", "  const statusMap =");

  it("setzt das Angebot auf Fakturiert", () => {
    expect(ablauf).toContain("api.setProposalInvoiced(prop.id)");
    expect(src).toContain("setProposalInvoiced: (id) => call(\"POST\", `/proposals/${id}/setinvoiced`, {})");
  });

  it("laesst die Rechnung stehen, wenn nur das Abhaken scheitert", () => {
    // Die Rechnung ist an der Stelle schon angelegt. Wuerde der Fehler die
    // ganze Aktion umwerfen, meldete die App "konnte nicht erstellt werden",
    // und der naechste Versuch legte eine zweite Rechnung an.
    expect(ablauf).toMatch(/try \{ await api\.setProposalInvoiced\(prop\.id\); \}\s*\n\s*catch \(_\) \{ abgehakt = false; \}/);
  });

  it("sagt es, wenn das Angebot offen geblieben ist", () => {
    expect(ablauf).toContain("Fakturiert");
    expect(ablauf).toContain('abgehakt ? undefined : "error"');
  });

  it("bietet den Knopf nicht mehr an, sobald fakturiert ist", () => {
    // statut 4 = Fakturiert; der Knopf haengt an [1,2].
    expect(src).toContain("{[1,2].includes(Number(prop.statut)) && me?.canValidateInvoices");
  });
});

describe("Von Hand abhaken", () => {
  // Nicht jeder Auftrag wird ueber die App abgerechnet — Sammelrechnung, Bar,
  // ein Beleg direkt aus Dolibarr. Ohne diesen Weg blieben genau die fuer
  // immer als offen in der Liste stehen.
  const handisch = schnitt("  const alsFakturiert = async () => {", "  const setStatus = async (status) => {");

  it("setzt den Status, ohne eine Rechnung anzulegen", () => {
    expect(handisch).toContain("api.setProposalInvoiced(prop.id)");
    expect(handisch).not.toContain("createInvoice");
  });

  it("sagt vorher, dass keine Rechnung entsteht", () => {
    // Sonst tippt jemand hier statt auf "In Rechnung" und wundert sich, wo
    // die Rechnung geblieben ist.
    expect(handisch).toMatch(/window\.confirm\([^)]*KEINE Rechnung/);
  });

  it("bietet den Knopf nur bei angenommenen Angeboten an", () => {
    expect(src).toContain("{Number(prop.statut)===2 && me?.canSetProposalStatus && <button className=\"btn btn-secondary\" onClick={alsFakturiert}");
  });
});
