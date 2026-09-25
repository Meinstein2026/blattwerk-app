import { describe, expect, it } from "vitest";
import { KACHELN, KACHEL_RECHTE, KACHEL_STANDARD, kachelId, kachelKey, kachelnFiltern } from "../../src/kacheln.js";

describe("Kachel-Katalog", () => {
  it("Labels und IDs sind eindeutig", () => {
    expect(new Set(KACHELN.map((k) => k.label)).size).toBe(KACHELN.length);
    expect(new Set(KACHELN.map((k) => k.id)).size).toBe(KACHELN.length);
  });
  it("Standard: alle sehen alles, nur Alle Dokumente nur Admins", () => {
    expect(KACHEL_STANDARD[kachelKey("spesen")]).toEqual(["*"]);
    expect(KACHEL_STANDARD.kachel_alleDokumente).toEqual(["admins", "admin", "administratoren"]);
    expect(KACHEL_RECHTE).toContain("kachel_alleDokumente");
  });
  it("findet die Kachel am Label", () => {
    expect(kachelId("Dokument hochladen")).toBe("hochladen");
    expect(kachelId("Kontostände")).toBeNull();
  });
});

describe("kachelnFiltern", () => {
  const liste = [{ label: "Spesen" }, { label: "Alle Dokumente" }, { label: "Kontostände" }];
  it("blendet aus, was me.kachel verneint, Unbekanntes bleibt", () => {
    const me = { kachel: (id) => id !== "alleDokumente" };
    expect(kachelnFiltern(me, liste).map((t) => t.label)).toEqual(["Spesen", "Kontostände"]);
  });
  it("ohne me.kachel bleibt alles sichtbar", () => {
    expect(kachelnFiltern({ id: null, isAdmin: false }, liste)).toHaveLength(3);
  });
});
