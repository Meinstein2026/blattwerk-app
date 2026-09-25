// test/mandant/katalog.test.js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { katalogPlan, kontoReparaturPlan } from "../../scripts/mandant/katalog-einspielen.mjs";
import { regelnFuer } from "../../src/konto-regeln.js";

const katalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/mandant/katalog-baumpflege.json"), "utf8"));

// SKR03-Kontenplan kommt aus der Produktion (dolibarr-app.jsx, DEFAULT_KONTEN)
// — Text-Extraktion, weil die Datei JSX ist und sich nicht importieren lässt.
// Die Schlagwort-Regeln kommen seit Task 8 (Mandantenfähigkeit) dagegen aus
// src/konto-regeln.js (reines JS, importierbar); regelnFuer("baumpflege")
// ist die exakt gleiche, produktionsbewährte Reihenfolge, die vorher hier
// als Text aus DEFAULT_KONTO_REGELN gelesen wurde (siehe test/konto/regeln.test.js).
const appSrc = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const between = (src, start, endMarker) => {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`${start} nicht gefunden`);
  const to = src.indexOf(endMarker, from);
  return src.slice(from, to);
};
const gueltigeKonten = new Set(
  [...between(appSrc, "const DEFAULT_KONTEN = [", "\n];").matchAll(/number:\s*"(\d+)"/g)].map(([, n]) => n)
);
const regeln = regelnFuer("baumpflege");
// Spiegelt suggestKonto: erste Regel mit Teilstring-Treffer gewinnt, sonst kein Treffer.
const schlagwortKonto = (text) => {
  const t = (text || "").toLowerCase();
  for (const r of regeln) if (r.keywords.some((k) => k && t.includes(k))) return r.account;
  return null;
};

describe("Startkatalog Baumpflege", () => {
  it("enthält Verkaufsleistungen und Einkaufsartikel", () => {
    const verkauf = katalog.filter((e) => e.bereich === "verkauf");
    const einkauf = katalog.filter((e) => e.bereich === "einkauf");
    expect(verkauf.length).toBeGreaterThanOrEqual(15);
    expect(einkauf.length).toBeGreaterThanOrEqual(12);
    expect(verkauf.map((e) => e.label)).toContain("Fällung in Seilklettertechnik");
    expect(einkauf.map((e) => e.label)).toContain("Kettenhaftöl");
  });

  it("jeder Eintrag hat Referenz, Einheit und keinen Preis", () => {
    for (const e of katalog) {
      expect(e.ref).toMatch(/^[A-Z0-9-]+$/);
      expect(e.einheit).toBeTruthy();
      expect(e.preis).toBeUndefined();
    }
  });

  it("Einkaufsartikel tragen ein SKR03-Konto", () => {
    for (const e of katalog.filter((x) => x.bereich === "einkauf")) expect(e.konto).toMatch(/^\d{4}$/);
  });

  it("Referenzen sind eindeutig", () => {
    const refs = katalog.map((e) => e.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("legt nichts doppelt an", () => {
    const plan = katalogPlan(katalog, [{ ref: katalog[0].ref }], { ustPflichtig: false });
    expect(plan.anlegen.find((e) => e.ref === katalog[0].ref)).toBeUndefined();
    expect(plan.vorhandenBleibt).toContain(katalog[0].ref);
  });

  it("Kleinunternehmer bekommt 0 %, sonst 19 %", () => {
    expect(katalogPlan(katalog, [], { ustPflichtig: false }).anlegen[0].tva_tx).toBe(0);
    expect(katalogPlan(katalog, [], { ustPflichtig: true }).anlegen[0].tva_tx).toBe(19);
  });
});

describe("SKR03-Konten bleiben mit der Produktion synchron (dolibarr-app.jsx)", () => {
  it("liest die Schlagwort-Tabelle vollständig ein", () => {
    // Ohne diese Wächter-Prüfung würde eine Reformatierung von
    // DEFAULT_KONTO_REGELN (Mehrzeiler, Inline-Kommentar) die Regex still
    // leerlaufen lassen — der nächste Test prüft dann nichts mehr, weil
    // "wo ein Schlagwort trifft" bei 0 Regeln nie zutrifft, und besteht
    // fälschlich grün. Schwelle wie in test/konto/regeln.test.js.
    expect(regeln.length).toBeGreaterThan(25);
  });

  it("jedes Katalog-Konto existiert im Kontenplan der App", () => {
    for (const e of katalog.filter((x) => x.bereich === "einkauf")) {
      expect(gueltigeKonten.has(e.konto), `${e.ref}: Konto ${e.konto} kennt der Kontenplan nicht`).toBe(true);
    }
  });

  it("wo das Label ein Schlagwort trifft, stimmt das Katalog-Konto mit der Buchungsregel überein", () => {
    // EK-MIETE-HAECK ist eine bewusste, dokumentierte Ausnahme: "häcksler" ist
    // nur als Werkzeug-Schlagwort hinterlegt (4985, Kauf/Eigentum), hier wird
    // aber eine Maschine GEMIETET (4960, Miete Einrichtungen). Sobald die
    // Rechnungszeile mit diesem Artikel verknüpft ist, hat dessen eigenes
    // accountancy_code_buy ohnehin Vorrang vor der Schlagwort-Regel (siehe
    // CLAUDE.md, „Booking-account suggestion") — die Schlagwort-Regel greift
    // nur bei freier Textbuchung ohne Artikelbezug.
    const AUSNAHMEN = new Set(["EK-MIETE-HAECK"]);
    for (const e of katalog.filter((x) => x.bereich === "einkauf")) {
      if (AUSNAHMEN.has(e.ref)) continue;
      const treffer = schlagwortKonto(e.label);
      if (treffer) expect(treffer, `${e.ref} (${e.label}) → Regel schlägt ${treffer} vor, Katalog trägt ${e.konto}`).toBe(e.konto);
    }
  });
});

describe("Konto-Reparatur an bereits vorhandenen Artikeln", () => {
  it("trägt ein FEHLENDES SKR03-Konto nach, rührt aber sonst nichts an", () => {
    const vorhanden = [
      { ref: "EK-KRAFTSTOFF", id: 101, accountancy_code_buy: "" }, // fehlt (z. B. PUT scheiterte beim ersten Lauf)
      { ref: "EK-SCHWERT", id: 103, accountancy_code_buy: "4985" }, // schon richtig
    ];
    const plan = kontoReparaturPlan(katalog, vorhanden);
    expect(plan.reparieren).toEqual([{ ref: "EK-KRAFTSTOFF", id: 101, konto: "4530" }]);
    expect(plan.abweichend).toEqual([]);
    // Der Reparatur-Eintrag trägt ausschließlich ref/id/konto — Preis und
    // Bezeichnung eines vorhandenen Artikels werden nie mitgeschickt.
    for (const e of plan.reparieren) expect(Object.keys(e).sort()).toEqual(["id", "konto", "ref"]);
  });

  it("lässt ein ABWEICHENDES, aber vorhandenes Konto unverändert und meldet es nur", () => {
    // Ein Kunde oder dessen Steuerberater kann das Konto bewusst geändert
    // haben — genau wie bei Preisen darf kein späterer Lauf das stillschweigend
    // zurücksetzen. Nur ein wirklich FEHLENDES Konto wird nachgetragen.
    const vorhanden = [{ ref: "EK-SAEGEKETTE", id: 102, accountancy_code_buy: "4900" }];
    const plan = kontoReparaturPlan(katalog, vorhanden);
    expect(plan.reparieren).toEqual([]);
    expect(plan.abweichend).toEqual([
      { ref: "EK-SAEGEKETTE", id: 102, katalogKonto: "4985", vorhandenesKonto: "4900" },
    ]);
  });

  it("lässt Verkaufsleistungen (ohne Konto) unberührt", () => {
    const verkaufRef = katalog.find((e) => e.bereich === "verkauf").ref;
    expect(kontoReparaturPlan(katalog, [{ ref: verkaufRef, id: 200, accountancy_code_buy: "" }]))
      .toEqual({ reparieren: [], abweichend: [] });
  });

  it("lässt noch nicht angelegte Artikel dem normalen Anlegen-Weg (kein Reparaturfall)", () => {
    expect(kontoReparaturPlan(katalog, [])).toEqual({ reparieren: [], abweichend: [] });
  });
});
