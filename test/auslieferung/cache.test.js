// Der Browser holte bisher bei jedem Start jede einzelne Datei neu — sie kamen
// alle mit `max-age=0`. Dateien unter assets/ tragen aber den Inhalts-Hash im
// Namen und koennen dauerhaft liegen bleiben. index.html und sw.js duerfen es
// gerade NICHT, sonst kommt die naechste Fassung der App nie an.
import { describe, expect, it } from "vitest";
import { cacheKopf } from "../../server.mjs";

const EWIG = "public, max-age=31536000, immutable";

describe("cacheKopf", () => {
  it("laesst gehashte Dateien dauerhaft liegen", () => {
    expect(cacheKopf("/app/dist/assets/index-DsQ1b2dc.js")).toBe(EWIG);
    expect(cacheKopf("/app/dist/assets/opencv-BdnDVJF-.js")).toBe(EWIG);
    expect(cacheKopf("C:\\app\\dist\\assets\\stil-abc.css")).toBe(EWIG);
  });

  it("haelt die Dateien ohne Hash im Namen frisch", () => {
    // Genau diese drei entscheiden, ob ein Update ankommt.
    expect(cacheKopf("/app/dist/index.html")).toBe("no-cache");
    expect(cacheKopf("/app/dist/sw.js")).toBe("no-cache");
    expect(cacheKopf("/app/dist/manifest.webmanifest")).toBe("no-cache");
    expect(cacheKopf("index.html")).toBe("no-cache");
  });

  it("faellt nicht auf einen Ordner herein, der nur so aehnlich heisst", () => {
    expect(cacheKopf("/app/dist/assets-alt/index.html")).toBe("no-cache");
    expect(cacheKopf("/app/dist/myassets.js")).toBe("no-cache");
  });
});
