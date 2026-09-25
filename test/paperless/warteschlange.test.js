import { describe, expect, it } from "vitest";
import { plAusstehend, plEinreihen, plNachtragen, plWsAntwort } from "../../src/pl-warteschlange.js";

const speicher = () => {
  const m = new Map();
  return {
    m,
    setzen: async (k, v) => { m.set(k, v); },
    holen: async (k) => m.get(k) ?? null,
    loeschen: async (k) => { m.delete(k); },
    schluessel: async () => [...m.keys()],
  };
};

describe("plWsAntwort", () => {
  it("ordnet Status zu", () => {
    expect(plWsAntwort(200)).toBe("fertig");
    expect(plWsAntwort(400)).toBe("verwerfen");
    expect(plWsAntwort(502)).toBe("spaeter");
    expect(plWsAntwort(0)).toBe("spaeter");
  });
});

describe("Warteschlange", () => {
  it("reiht ein und traegt in Reihenfolge nach", async () => {
    const s = speicher();
    await plEinreihen({ titel: "b" }, { speicher: s, jetzt: 2000 });
    await plEinreihen({ titel: "a" }, { speicher: s, jetzt: 1000 });
    expect(await plAusstehend({ speicher: s })).toBe(2);
    const gesendet = [];
    const n = await plNachtragen({ speicher: s, senden: async (x) => { gesendet.push(x.titel); return { status: 200 }; } });
    expect(n).toBe(2);
    expect(gesendet).toEqual(["a", "b"]);
    expect(await plAusstehend({ speicher: s })).toBe(0);
  });
  it("kein Netz: nichts geht verloren", async () => {
    const s = speicher();
    await plEinreihen({ titel: "a" }, { speicher: s, jetzt: 1 });
    const n = await plNachtragen({ speicher: s, senden: async () => { throw new TypeError("Failed to fetch"); } });
    expect(n).toBe(0);
    expect(await plAusstehend({ speicher: s })).toBe(1);
  });
  it("Archiv weg (502): bleibt liegen, bricht ab", async () => {
    const s = speicher();
    await plEinreihen({ titel: "a" }, { speicher: s, jetzt: 1 });
    await plEinreihen({ titel: "b" }, { speicher: s, jetzt: 2 });
    let aufrufe = 0;
    await plNachtragen({ speicher: s, senden: async () => { aufrufe++; return { status: 502 }; } });
    expect(aufrufe).toBe(1);
    expect(await plAusstehend({ speicher: s })).toBe(2);
  });
  it("400 wird verworfen und gemeldet", async () => {
    const s = speicher();
    await plEinreihen({ titel: "kaputt" }, { speicher: s, jetzt: 1 });
    const gemeldet = [];
    await plNachtragen({ speicher: s, senden: async () => ({ status: 400 }), melden: (x, st) => gemeldet.push([x.titel, st]) });
    expect(gemeldet).toEqual([["kaputt", 400]]);
    expect(await plAusstehend({ speicher: s })).toBe(0);
  });
});
