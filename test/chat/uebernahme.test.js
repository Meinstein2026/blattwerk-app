// Schlüssel-Übernahme aus Element (src/chat/uebernahme.js) mit einer
// Dokument-Attrappe — kein Browser, kein Element.
import { describe, expect, it, vi } from "vitest";
import { UEBERNAHME_KEY, elementSitzungPasst, geheimnisseAusElement, uebernahmeErledigt, uebernahmeMerken } from "../../src/chat/uebernahme.js";

const speicher = (o = {}) => { const m = new Map(Object.entries(o)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const dokument = (peg) => {
  const rahmen = { style: {}, setAttribute() {}, remove: vi.fn(), contentWindow: { mxMatrixClientPeg: peg } };
  return { rahmen, createElement: () => rahmen, body: { appendChild() {} } };
};
const elementClient = (o = {}) => ({
  getUserId: () => o.userId || "@tom:x", isInitialSyncComplete: () => o.bereit !== false,
  getCrypto: () => ({ exportSecretsBundle: async () => o.buendel ?? { cross_signing: { master_key: "m" }, backup: {} }, exportRoomKeysAsJson: async () => "[1,2]" }),
});

describe("Voraussetzungen", () => {
  it("nur bei einer Element-Sitzung DERSELBEN Person", () => {
    expect(elementSitzungPasst(speicher({ mx_user_id: "@tom:x" }), "@tom:x")).toBe(true);
    expect(elementSitzungPasst(speicher({ mx_user_id: "@anna:x" }), "@tom:x")).toBe(false);
    expect(elementSitzungPasst(speicher(), "@tom:x")).toBe(false);
    expect(elementSitzungPasst({ getItem() { throw new Error("gesperrt"); } }, "@tom:x")).toBe(false);
  });
  it("merkt sich den Versuch je Gerät — ein neues Gerät versucht es wieder", () => {
    const s = speicher();
    expect(uebernahmeErledigt(s, "ABC")).toBe(false);
    uebernahmeMerken(s, "ABC");
    expect(s.getItem(UEBERNAHME_KEY)).toBe("ABC");
    expect(uebernahmeErledigt(s, "ABC")).toBe(true);
    expect(uebernahmeErledigt(s, "XYZ")).toBe(false);
  });
});

describe("geheimnisseAusElement", () => {
  it("holt Bündel und Raumschlüssel und räumt den Rahmen weg", async () => {
    vi.useFakeTimers();
    const d = dokument({ get: () => elementClient() });
    const p = geheimnisseAusElement("@tom:x", { dokument: d });
    await vi.advanceTimersByTimeAsync(600);
    expect(await p).toEqual({ buendel: { cross_signing: { master_key: "m" }, backup: {} }, raumSchluessel: "[1,2]" });
    expect(d.rahmen.src).toBe("/chat/");
    expect(d.rahmen.remove).toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("wartet, bis Element synchronisiert ist", async () => {
    vi.useFakeTimers();
    let bereit = false;
    const d = dokument({ get: () => elementClient({ bereit }) });
    let fertig = false;
    const p = geheimnisseAusElement("@tom:x", { dokument: d }).then((x) => { fertig = true; return x; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fertig).toBe(false);
    bereit = true;
    await vi.advanceTimersByTimeAsync(600);
    await p;
    expect(fertig).toBe(true);
    vi.useRealTimers();
  });
  it("lehnt ein fremdes Konto und eine unverifizierte Element-Sitzung ab", async () => {
    vi.useFakeTimers();
    const fremd = geheimnisseAusElement("@tom:x", { dokument: dokument({ get: () => elementClient({ userId: "@anna:x" }) }) });
    const leer = geheimnisseAusElement("@tom:x", { dokument: dokument({ get: () => elementClient({ buendel: {} }) }) });
    const erwartet = Promise.all([expect(fremd).rejects.toThrow(/anderes Konto/), expect(leer).rejects.toThrow(/nicht verifiziert/)]);
    await vi.advanceTimersByTimeAsync(600);
    await erwartet;
    vi.useRealTimers();
  });
  it("gibt nach der Frist auf, statt ewig ein unsichtbares Element mitlaufen zu lassen", async () => {
    vi.useFakeTimers();
    const d = dokument(undefined);
    const p = geheimnisseAusElement("@tom:x", { dokument: d, warteMs: 3000 });
    const erwartet = expect(p).rejects.toThrow(/nicht geantwortet/);
    await vi.advanceTimersByTimeAsync(3100);
    await erwartet;
    expect(d.rahmen.remove).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
