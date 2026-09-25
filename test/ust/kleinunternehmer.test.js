// Blattwerk ist Kleinunternehmer nach § 19 UStG: auf Kundenbelegen steht keine
// Umsatzsteuer, und der Fusstext des Angebots sagt das auch ausdruecklich.
// Dolibarr ist passend eingestellt (FACTURE_TVAOPTION=0), alle 87 Angebots- und
// 80 Rechnungszeilen im Bestand stehen auf 0 %.
//
// Die App war es nicht: sie legte jede Position mit 19 % an und uebernahm den
// Satz aus dem Artikel. Acht eingekaufte Artikel tragen im Katalog 19 %
// (EcoFlow, Reifen, Altreifenentsorgung, tesa, Versandkosten — von der
// Beleg-Pipeline angelegt, deren createProduct ebenfalls auf 19 % defaultete).
// Beides zusammen haette Umsatzsteuer auf ein Kundenangebot gebracht, waehrend
// darunter "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer" steht.
// Aufgefallen 10.08.2026.
//
// Einkauf ist die andere Richtung: Lieferanten stellen Blattwerk sehr wohl
// 19 % in Rechnung. Lieferantenrechnung und Bestellung behalten die Vorgabe.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const bauteil = (name, bis) => {
  const a = src.indexOf(`function ${name}(`);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error(`Bauteil nicht gefunden: ${name}`);
  return src.slice(a, b);
};

describe("Kundenbelege — Angebot und Rechnung", () => {
  const docForm = bauteil("DocForm", "// One invoice/proposal line");
  const editModal = bauteil("ProposalEditModal", "// ─── Proposal Detail");

  it("legt neue Positionen mit 0 % an", () => {
    for (const [name, quelle] of [["DocForm", docForm], ["ProposalEditModal", editModal]]) {
      expect(quelle, name).not.toMatch(/tva:\s*19\b/);
      expect(quelle, name).toMatch(/tva:\s*0\b/);
    }
  });

  it("uebernimmt den Steuersatz NICHT aus dem Artikel", () => {
    // Der Satz haengt am Steuerstatus des Absenders, nicht an der Ware — und
    // acht Artikel im Katalog tragen 19 %.
    for (const [name, quelle] of [["DocForm", docForm], ["ProposalEditModal", editModal]]) {
      expect(quelle, name).not.toMatch(/tva:\s*prod\.tva_tx/);
    }
  });

  it("laesst den Satz weiterhin von Hand umstellen", () => {
    // Kein Zwang auf 0: wird Blattwerk umsatzsteuerpflichtig, muss das Feld da sein.
    expect(src).toMatch(/\[0,7,19\]\.map/);
  });

  it("liest eine bestehende Zeile ohne Steuersatz als 0 %", () => {
    expect(src).toContain("tva: parseFloat(l.tva_tx ?? 0) || 0,");
  });
});

describe("Neue Artikel", () => {
  it("bekommen 0 % Verkaufs-Umsatzsteuer", () => {
    // createProduct legte bisher mit 19 % an — daher die acht Altlasten.
    const api = src.slice(src.indexOf("createProduct: (data)"), src.indexOf("getPurchasePrices:"));
    expect(api).toContain("tva_tx: data.tva_tx ?? 0,");
  });
});

describe("Einkauf behaelt 19 %", () => {
  const lieferant = bauteil("SupplierInvoiceForm", "function ProposalList");
  const bestellung = bauteil("BestellungenForm", "function LieferungenView");

  it("Lieferantenrechnung und Bestellung rechnen weiter mit 19 %", () => {
    // Blattwerk zahlt die Vorsteuer tatsaechlich — nur abziehen darf es sie nicht.
    expect(lieferant).toMatch(/tva:\s*19\b/);
    expect(bestellung).toMatch(/tva:\s*19\b/);
  });

  it("der hinterlegte Einkaufspreis ebenfalls", () => {
    const api = src.slice(src.indexOf("addPurchasePrice: async"), src.indexOf("downloadDocument:"));
    expect(api).toContain("tva_tx: data.tva_tx ?? 19,");
  });
});
