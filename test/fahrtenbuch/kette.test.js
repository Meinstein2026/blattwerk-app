// Prüfkette (12.09.2026): jeder Vorgang haengt per SHA-256 am Vorgaenger.
// Wer die JSON in Nextcloud von Hand umschreibt, bricht die Kette ab dort —
// das ist der Nachweis gegenueber dem Finanzamt, dass nachtraegliche
// Aenderungen nur ueber die App (mit Vermerk und Historie) moeglich waren.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FB_STORE_LEER, fahrtEintragen, kettePruefen, fbStempelText } from "../../src/fahrtenbuch.js";

const sha256 = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const fahrt = (x = {}) => ({
  datum: "2026-09-01", start: "Musterstadt", ziel: "Gießen", kmBeginn: 100, kmEnde: 118,
  zweck: "Baumpflege", typ: "betrieblich", fahrer: "max", fahrzeugId: "fiat", ...x,
});
const t0 = "2026-09-01T09:00:00.000Z", t1 = "2026-09-02T09:00:00.000Z", t2 = "2026-09-03T09:00:00.000Z";

const drei = () => {
  const s1 = fahrtEintragen(FB_STORE_LEER, { id: "a", ...fahrt() }, { login: "max", jetzt: t0, sha256 });
  const s2 = fahrtEintragen(s1, { id: "b", ...fahrt({ datum: "2026-09-02", kmBeginn: 118, kmEnde: 140 }) }, { login: "erika", jetzt: t1, sha256 });
  return fahrtEintragen(s2, { id: "a", ...fahrt({ kmEnde: 120 }) }, { login: "max", jetzt: t2, grund: "Tippfehler", sha256 });
};

describe("Prüfkette", () => {
  it("nummeriert Vorgaenge fortlaufend und rechnet nach", () => {
    const s = drei();
    expect(s.kette.n).toBe(3);
    expect(s.fahrten[0].kettenNr).toBe(3);        // Aenderung = juengster Vorgang
    expect(s.fahrten[0].historie[0].kettenNr).toBe(1);
    expect(s.fahrten[1].kettenNr).toBe(2);
    expect(s.kette.hash).toBe(s.fahrten[0].hash);
    expect(kettePruefen(s, sha256)).toEqual({ ok: true, n: 3, hash: s.kette.hash, bruch: null, ohneKette: 0 });
  });

  it("ist deterministisch (gleiche Vorgaenge, gleicher Hash)", () => {
    expect(drei().kette.hash).toBe(drei().kette.hash);
  });

  it("bricht, wenn eine alte Zeile still umgeschrieben wird", () => {
    const s = drei();
    const manipuliert = { ...s, fahrten: s.fahrten.map((f) => f.id === "b" ? { ...f, kmEnde: 130 } : f) };
    expect(kettePruefen(manipuliert, sha256)).toMatchObject({ ok: false, bruch: 2 });
    // Auch die Historie ist abgesichert — nicht nur der aktuelle Stand.
    const hist = { ...s, fahrten: s.fahrten.map((f) => f.id === "a" ? { ...f, historie: [{ ...f.historie[0], grund: "" }] } : f) };
    expect(kettePruefen(hist, sha256)).toMatchObject({ ok: false, bruch: 3 });
  });

  it("bricht, wenn ein Vorgang fehlt oder der Kettenstand nicht passt", () => {
    const s = drei();
    const ohneB = { ...s, fahrten: s.fahrten.filter((f) => f.id !== "b") };
    expect(kettePruefen(ohneB, sha256)).toMatchObject({ ok: false, bruch: 2 });
    expect(kettePruefen({ ...s, kette: { hash: "x", n: 3 } }, sha256)).toMatchObject({ ok: false, bruch: 4 });
  });

  it("zaehlt Fahrten aus der Zeit vor der Kette, ohne sie zu pruefen", () => {
    const alt = fahrtEintragen(FB_STORE_LEER, { id: "alt", ...fahrt() }, { login: "max", jetzt: t0 }); // ohne sha256
    const s = fahrtEintragen(alt, { id: "neu", ...fahrt() }, { login: "max", jetzt: t1, sha256 });
    expect(s.fahrten[0].kettenNr).toBeUndefined();
    expect(kettePruefen(s, sha256)).toMatchObject({ ok: true, n: 1, ohneKette: 1 });
  });
});

describe("Auskunft zum externen Zeitstempel", () => {
  const kette = { kette: { hash: "x", n: 5 } };
  it("sagt, bis wohin gestempelt ist", () => {
    expect(fbStempelText({ ...kette, stempelStand: { nr: 5 } })).toBe("Extern gestempelt bis Vorgang 5.");
    expect(fbStempelText({ ...kette, stempelStand: { nr: 3 } })).toBe("Extern gestempelt bis Vorgang 3 (2 noch offen).");
    expect(fbStempelText({ ...kette, stempelStand: { nr: 0 } })).toBe("Noch kein externer Zeitstempel.");
  });
  it("meldet einen fehlgeschlagenen Stempel, statt ihn zu verschweigen", () => {
    expect(fbStempelText({ ...kette, stempel: { ok: false, fehler: "Zeitstempel-Dienst: Status 503" } }))
      .toMatch(/fehlgeschlagen \(Zeitstempel-Dienst: Status 503\)/);
  });
  it("schweigt, solange es keine Kette gibt", () => {
    expect(fbStempelText(FB_STORE_LEER)).toBe("");
  });
});
