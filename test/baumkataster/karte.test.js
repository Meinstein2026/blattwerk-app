// Karte: nur die Logik hinter den Markern. Leaflet selbst wird nicht
// geladen (kein DOM in Vitest, und der Bundle-Test in verdrahtung.test.js
// sichert, dass es nur lazy in BaumKarte.jsx vorkommt).
import { describe, expect, it } from "vitest";
import { bkKronenRadiusM, bkMarkerFarbe } from "../../src/baumkataster.js";
import { BK_FARBEN } from "../../src/baumkataster-data.js";

describe("Marker", () => {
  const HEUTE = "2026-09-16";
  const baum = (k, m = []) => ({ nr: "B-0001", status: "aktiv", kontrollen: k ? [k] : [], massnahmen: m, kronendurchmesserM: 14 });
  it("Farbe je Modus als Hex aus BK_FARBEN", () => {
    expect(bkMarkerFarbe(baum(null), HEUTE, "kontrolle")).toBe(BK_FARBEN.grau);
    expect(bkMarkerFarbe(baum({ datum: "2026-09-01", naechsteKontrolle: "2028-09-01", verkehrssicher: "nein" }), HEUTE, "kontrolle")).toBe(BK_FARBEN.gruen);
    expect(bkMarkerFarbe(baum({ datum: "2026-09-01", naechsteKontrolle: "2028-09-01", verkehrssicher: "nein" }), HEUTE, "sicherheit")).toBe(BK_FARBEN.rot);
    expect(bkMarkerFarbe(baum(null, [{ status: "offen", dringlichkeit: "langfristig", faelligBis: "2027-01-01" }]), HEUTE, "massnahmen")).toBe(BK_FARBEN.gelb);
  });
  it("Kreis = halber Kronendurchmesser, ohne Angabe 2 m", () => {
    expect(bkKronenRadiusM(baum(null))).toBe(7);
    expect(bkKronenRadiusM({ kronendurchmesserM: null })).toBe(2);
    expect(bkKronenRadiusM({ kronendurchmesserM: "0" })).toBe(2);
  });
});
