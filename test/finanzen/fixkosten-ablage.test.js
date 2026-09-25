// Ablage der Fixkosten (Blattwerk/App/fixkosten.json). Gleiches Muster wie die
// Anlagen-Konfiguration: reine Funktion, additiv je Schluessel, nur bekannte
// Felder — damit ein Tippfehler im Aufruf nichts Fremdes in die Datei schreibt.
import { describe, expect, it } from "vitest";
import { fixkostenEintragen } from "../../server.mjs";

describe("fixkostenEintragen", () => {
  it("legt einen Posten an", () => {
    const s = fixkostenEintragen({}, "k1", { name: "Internet", betrag: 29.9, rhythmus: "monat" });
    expect(s.posten.k1).toEqual({ name: "Internet", betrag: 29.9, rhythmus: "monat" });
  });

  it("ergaenzt bestehende Posten, statt sie zu ersetzen", () => {
    let s = fixkostenEintragen({}, "k1", { name: "Internet", betrag: 29.9, rhythmus: "monat" });
    s = fixkostenEintragen(s, "k1", { betrag: 34.9 });
    expect(s.posten.k1).toEqual({ name: "Internet", betrag: 34.9, rhythmus: "monat" });
  });

  it("nimmt nur bekannte Felder auf", () => {
    const s = fixkostenEintragen({}, "k1", { name: "X", betrag: 10, rhythmus: "jahr", boeses: "feld" });
    expect(Object.keys(s.posten.k1).sort()).toEqual(["betrag", "name", "rhythmus"]);
  });

  it("weist unbekannte Rhythmen ab", () => {
    const s = fixkostenEintragen({}, "k1", { name: "X", betrag: 10, rhythmus: "woche" });
    expect(s.posten.k1.rhythmus).toBeUndefined();
  });

  it("weist unsinnige Betraege ab", () => {
    expect(fixkostenEintragen({}, "k1", { name: "X", betrag: -5 }).posten.k1?.betrag).toBeUndefined();
    expect(fixkostenEintragen({}, "k1", { name: "X", betrag: "viel" }).posten.k1?.betrag).toBeUndefined();
  });

  it("kann einen Posten abschalten, ohne ihn zu verlieren", () => {
    let s = fixkostenEintragen({}, "k1", { name: "Alt", betrag: 10, rhythmus: "monat" });
    s = fixkostenEintragen(s, "k1", { aus: true });
    expect(s.posten.k1.aus).toBe(true);
    expect(s.posten.k1.name).toBe("Alt");
  });

  it("leere Konfiguration loescht den Posten", () => {
    let s = fixkostenEintragen({}, "k1", { name: "Weg", betrag: 10, rhythmus: "monat" });
    s = fixkostenEintragen(s, "k1", {});
    expect(s.posten.k1).toBeUndefined();
  });

  it("laesst den uebergebenen Speicher unveraendert", () => {
    const vorher = { version: 1, posten: { a: { name: "A", betrag: 1, rhythmus: "monat" } } };
    const kopie = JSON.parse(JSON.stringify(vorher));
    fixkostenEintragen(vorher, "b", { name: "B", betrag: 2, rhythmus: "monat" });
    expect(vorher).toEqual(kopie);
  });

  it("kommt mit kaputtem Speicher zurecht", () => {
    expect(fixkostenEintragen(null, "k1", { name: "X", betrag: 1, rhythmus: "monat" }).posten.k1).toBeTruthy();
    expect(fixkostenEintragen({ posten: "kaputt" }, "k1", { name: "X", betrag: 1 }).posten.k1).toBeTruthy();
  });
});
