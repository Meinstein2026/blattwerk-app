import { describe, it, expect } from "vitest";
import { orderQueue, resolveRefs, nextRunnable, isProcessable } from "../../src/offline/outbox.js";

describe("orderQueue", () => {
  it("stellt Abhängigkeiten vor ihre Nutzer", () => {
    const q = [
      { id: "b", deps: ["a"], createdAt: "2026-01-01T00:00:02Z" },
      { id: "a", deps: [], createdAt: "2026-01-01T00:00:01Z" },
    ];
    expect(orderQueue(q).map(e => e.id)).toEqual(["a", "b"]);
  });
  it("sortiert unabhängige nach createdAt", () => {
    const q = [
      { id: "y", deps: [], createdAt: "2026-01-01T00:00:02Z" },
      { id: "x", deps: [], createdAt: "2026-01-01T00:00:01Z" },
    ];
    expect(orderQueue(q).map(e => e.id)).toEqual(["x", "y"]);
  });
});

describe("resolveRefs", () => {
  it("ersetzt local:-Referenzen aus der idMap", () => {
    const idMap = new Map([["a", 42]]);
    const out = resolveRefs({ projectRef: "local:a", note: "x" }, idMap);
    expect(out.projectRef).toBe(42);
    expect(out.note).toBe("x");
  });
  it("lässt echte Referenzen unverändert", () => {
    const out = resolveRefs({ projectRef: 7 }, new Map());
    expect(out.projectRef).toBe(7);
  });
  it("löst local:-Lieferantenreferenzen auf (supplierinvoice -> offline-thirdparty)", () => {
    const idMap = new Map([["sup-uuid", 99]]);
    const out = resolveRefs({ supplierRef: "local:sup-uuid", ref_supplier: "RE-1" }, idMap);
    expect(out.supplierRef).toBe(99);
    expect(out.ref_supplier).toBe("RE-1");
  });
  it("lässt bereits echte Lieferanten-IDs unverändert", () => {
    const out = resolveRefs({ supplierRef: 12 }, new Map());
    expect(out.supplierRef).toBe(12);
  });
});

describe("nextRunnable", () => {
  it("gibt Eintrag zurück, dessen deps alle erledigt sind", () => {
    const entries = [{ id: "b", deps: ["a"] }];
    expect(nextRunnable(entries, new Set(["a"]))?.id).toBe("b");
  });
  it("gibt null, wenn deps offen sind", () => {
    const entries = [{ id: "b", deps: ["a"] }];
    expect(nextRunnable(entries, new Set())).toBeNull();
  });
});

describe("isProcessable", () => {
  it("lässt pending/error/syncing zu", () => {
    expect(isProcessable({ status: "pending" })).toBe(true);
    expect(isProcessable({ status: "error" })).toBe(true);
    expect(isProcessable({ status: "syncing" })).toBe(true);
  });
  it("schließt 'review' aus (unterbrochene Zeitbuchung wartet auf den Nutzer)", () => {
    expect(isProcessable({ status: "review" })).toBe(false);
  });
  it("filtert eine gemischte Outbox korrekt", () => {
    const entries = [
      { id: "a", status: "pending" },
      { id: "b", status: "review" },
      { id: "c", status: "syncing" },
    ];
    expect(entries.filter(isProcessable).map(e => e.id)).toEqual(["a", "c"]);
  });
});
