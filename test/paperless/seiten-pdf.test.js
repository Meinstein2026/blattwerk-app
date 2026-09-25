import { describe, expect, it } from "vitest";
import { bilderZuPdf } from "../../src/seiten-pdf.js";

// Kleinstes gueltiges JPEG (1x1 Pixel).
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"));
const seiten = (pdf) => (Buffer.from(pdf).toString("latin1").match(/\/Type \/Page\b(?!s)/g) || []).length;

describe("bilderZuPdf", () => {
  it("macht eine Seite je Bild", async () => {
    const pdf = await bilderZuPdf([JPEG, JPEG, JPEG]);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(seiten(pdf)).toBe(3);
  });
  it("wirft ohne Bilder statt eine leere PDF zu liefern", async () => {
    await expect(bilderZuPdf([])).rejects.toThrow("keine Seiten");
  });
});
