// Der Referenz-Cache wird beim App-Start gefuellt. Er holte vier Listen
// nacheinander und schrieb jeden Datensatz einzeln nach IndexedDB — beides
// genau dann, wenn der Bildschirm noch aufgebaut wird. Diese Tests halten
// fest, dass er nebeneinander laedt und satzweise schreibt.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gespeichert = [];
vi.mock("../../src/offline/db.js", () => ({
  putRef: vi.fn(),
  putRefs: vi.fn(async (typ, eintraege) => { gespeichert.push([typ, eintraege]); }),
  getAllRefs: vi.fn(async () => []),
  clearRefType: vi.fn(async () => {}),
  setRefMeta: vi.fn(async () => {}),
  getRefMeta: vi.fn(async () => null),
}));

const { refreshRefCache } = await import("../../src/offline/cache.js");
const { putRefs } = await import("../../src/offline/db.js");

// API, die mitschreibt, wann jeder Aufruf begann und endete.
function apiAttrappe(verzoegerungMs = 20) {
  const spur = [];
  const liste = (name, rows) => () => new Promise((r) => {
    spur.push(["start", name]);
    setTimeout(() => { spur.push(["ende", name]); r(rows); }, verzoegerungMs);
  });
  return {
    spur,
    getProjects: liste("projects", [{ id: 1, ref: "P1", title: "A", socid: 5, statut: 1 }]),
    getTasks: liste("tasks", [{ id: 2, fk_project: 1, label: "T" }]),
    getThirdparties: liste("thirdparties", [{ id: 3, name: "K", client: 1, fournisseur: 0 }]),
    getProducts: liste("products", [{ id: 4, ref: "A1", label: "Artikel", price: 1, tva_tx: 0 }]),
  };
}

describe("refreshRefCache", () => {
  beforeEach(() => { gespeichert.length = 0; vi.clearAllMocks(); });

  it("holt die vier Listen nebeneinander, nicht nacheinander", async () => {
    const api = apiAttrappe();
    await refreshRefCache(api);
    // Nacheinander hiesse: start/ende/start/ende/… Nebeneinander starten alle
    // vier, bevor die erste fertig ist.
    const ersteVier = api.spur.slice(0, 4).map(([was]) => was);
    expect(ersteVier).toEqual(["start", "start", "start", "start"]);
  });

  it("schreibt je Typ einen Satz statt jeden Datensatz einzeln", async () => {
    await refreshRefCache(apiAttrappe(0));
    expect(putRefs).toHaveBeenCalledTimes(4);
    const typen = gespeichert.map(([typ]) => typ).sort();
    expect(typen).toEqual(["product", "project", "task", "thirdparty"]);
    expect(gespeichert.find(([t]) => t === "thirdparty")[1])
      .toEqual([[3, { id: 3, name: "K", client: 1, fournisseur: 0 }]]);
  });

  it("laesst den alten Cache stehen, wenn eine Liste fehlschlaegt", async () => {
    const api = apiAttrappe(0);
    api.getProducts = () => Promise.reject(new Error("offline"));
    const r = await refreshRefCache(api);
    expect(r.products).toBe(-1);
    expect(r.anyLoaded).toBe(true); // die anderen drei sind da
    expect(gespeichert.map(([t]) => t)).not.toContain("product");
  });
});
