// Spec 2026-09-23: Rechte-Wache vor Liste/Datei, Upload-Tags, Kacheln, Kachel-Rechte, Warteschlange.
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const server = fs.readFileSync(new URL("../../server.mjs", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../../dolibarr-app.jsx", import.meta.url), "utf8");

describe("Alle Dokumente / Dokument hochladen: Verdrahtung", () => {
  it("Liste und Datei tragen die Rechte-Wache fuer thema=alle", () => {
    expect(server).toMatch(/app\.get\("\/api\/pl\/list", wachePl, nurBeiAlle,/);
    expect(server).toMatch(/app\.get\("\/api\/pl\/file\/:id", wachePl, nurBeiAlle,/);
  });
  it("Upload mit thema=alle setzt Quelle/App und optional den Beleg-Tag", () => {
    expect(server).toContain("themen: alle ? [PL_QUELLE_APP, ...(req.body?.beleg ? [PL_BELEG_TAG] : [])] : [thema]");
  });
  it("Pruefsummen-Suche ruft PAPERLESS_BASE() auf", () => {
    expect(server).not.toContain("${PAPERLESS_BASE}/api");
  });
  it("Startseite und Verwaltung filtern ueber kachelnFiltern", () => {
    expect(app).toContain("buttons={kachelnFiltern(me, [");
    expect(app).toContain("const tiles = kachelnFiltern(me, [");
    expect(app).toContain("kachel: (id) => isAdmin || hasAnyGroup(groupNames, cfg[kachelKey(id)] || [\"*\"])");
    expect(app).toContain('(allowed || []).includes("*")');
    expect(app).toContain('(name === "*" && KACHEL_RECHTE.includes(key))');
  });
  it("Upload: Scanner mit Zuschneiden, PDF, Warteschlange, Nachtragen", () => {
    expect(app).toContain('key: "hochladen"');
    expect(app).toContain("thema: PL_ALLE");
    expect(app).toContain("bilderZuPdf(");
    expect(app).toContain("<ScanCropModal file={rohFoto}");
    expect(app).toContain("await plEinreihen(nutzlast)");
    expect(app).toContain("plNachtragen({");
  });
});
