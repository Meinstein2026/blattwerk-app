// funktionWache sperrt Routen einer abgeschalteten Funktion — Muster wie
// blockWache (test/mandant/bloecke-server.test.js). Der zweite Teil liest den
// Quelltext: jede Funktions-Route muss ihre Wache tragen, sonst waere die
// Sperre nur in der Oberflaeche.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { funktionWache, paperlessFunktionWache } from "../../src/mandant-server.mjs";
import { PL_THEMA, PL_THEMA_FUNKTION } from "../../src/paperless.js";

const antwort = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const mandant = (funktionen, bloecke = { erp: true, belege: true, fahrtenbuch: true, arbeitsschutz: true }) => () => ({
  kuerzel: "xy", profil: "baumpflege", bloecke,
  dienste: { dolibarr: "https://erp.example", nextcloud: "https://nc.example" }, funktionen,
});

describe("funktionWache", () => {
  it("laesst durch, wenn die Funktion an ist", () => {
    let weiter = false;
    funktionWache("gbu", mandant({ gbu: true }))({}, antwort(), () => { weiter = true; });
    expect(weiter).toBe(true);
  });
  it("antwortet 404 mit dem Funktionsnamen, wenn sie aus ist", () => {
    const res = antwort();
    funktionWache("lager", mandant({ lager: false }))({}, res, () => { throw new Error("darf nicht weitergehen"); });
    expect(res.code).toBe(404);
    expect(res.body.error).toMatch(/"lager"/);
  });
  it("sperrt auch, wenn nur der Block aus ist", () => {
    const res = antwort();
    funktionWache("gbu", mandant({ gbu: true }, { arbeitsschutz: false }))({}, res, () => { throw new Error("nein"); });
    expect(res.code).toBe(404);
  });
});

describe("paperlessFunktionWache", () => {
  const req = (thema) => ({ body: { thema } });
  it("laesst durch, wenn die zugeordnete Funktion an ist", () => {
    let weiter = false;
    paperlessFunktionWache(PL_THEMA_FUNKTION, mandant({ gbu: true }))(req(PL_THEMA.gbu), antwort(), () => { weiter = true; });
    expect(weiter).toBe(true);
  });
  it("antwortet 404 mit dem Funktionsnamen, wenn die zugeordnete Funktion aus ist", () => {
    const res = antwort();
    paperlessFunktionWache(PL_THEMA_FUNKTION, mandant({ gbu: false }))(req(PL_THEMA.gbu), res, () => { throw new Error("darf nicht weitergehen"); });
    expect(res.code).toBe(404);
    expect(res.body.error).toMatch(/"gbu"/);
  });
  it("sperrt Betriebsanweisung/Unterweisung an betriebsanweisungen und Einweisung/Geraeteeinweisung an betriebsmittel", () => {
    for (const thema of ["Thema/Betriebsanweisung", "Thema/Unterweisung"]) {
      const res = antwort();
      paperlessFunktionWache(PL_THEMA_FUNKTION, mandant({ betriebsanweisungen: false }))(req(thema), res, () => { throw new Error("nein"); });
      expect(res.code).toBe(404);
      expect(res.body.error).toMatch(/"betriebsanweisungen"/);
    }
    for (const thema of ["Thema/Einweisung", "Thema/Geräteeinweisung"]) {
      const res = antwort();
      paperlessFunktionWache(PL_THEMA_FUNKTION, mandant({ betriebsmittel: false }))(req(thema), res, () => { throw new Error("nein"); });
      expect(res.code).toBe(404);
      expect(res.body.error).toMatch(/"betriebsmittel"/);
    }
  });
  it("laesst ein unbekanntes/nicht zugeordnetes Thema unabhaengig vom Funktionsstand durch", () => {
    let weiter = false;
    paperlessFunktionWache(PL_THEMA_FUNKTION, mandant({}))(req(PL_THEMA.arbeitsschutz), antwort(), () => { weiter = true; });
    expect(weiter).toBe(true);
  });
});

describe("Routen tragen ihre Wache", () => {
  const lese = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("server.mjs", () => {
    const src = lese("server.mjs");
    for (const pfad of ["/api/nc/gbu-upload", "/api/nc/gbu-list", "/api/nc/gbu-file"]) expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheArbeitsschutz,\\s*wacheGbu`));
    for (const pfad of ["/api/nc/fahrtenbuch", "/api/nc/fahrtenbuch/save"]) expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheFahrtenbuch,\\s*wacheFahrtenbuchFn`));
    for (const pfad of ["/api/nc/ueberlassungen", "/api/nc/ueberlassungen/save", "/api/nc/ueberlassungen/widerruf", "/api/nc/ueberlassungen/datei"]) expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheFahrtenbuch,\\s*wacheUeberlassung`));
    for (const pfad of ["/api/nc/einweisungen", "/api/nc/einweisungen/save"]) expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheArbeitsschutz,\\s*wacheBetriebsmittel`));
    expect(src).toMatch(/"\/api\/mail\/order",\s*wacheBestellung,\s*wacheBestellungen/);
    expect(src).toMatch(/"\/api\/pl\/upload",\s*wachePl,\s*wachePlFunktion/);
  });
  it("src/server-Module", () => {
    expect(lese("src/server/baumkataster.mjs")).toMatch(/const wache = funktionWache\("baumkataster", ctx\.mandantJetzt\)/);
    expect((lese("src/server/baumkataster.mjs").match(/app\.post\("\/api\/nc\/baumkataster\/[^"]+",\s*wache,/g) || []).length).toBe(8);
    expect(lese("src/server/qualifikationen.mjs")).toMatch(/app\.post\("\/api\/nc\/qualifikationen",\s*wache,/);
    expect(lese("src/server/qualifikationen.mjs")).toMatch(/app\.post\("\/api\/nc\/qualifikationen\/save",\s*wache,/);
    expect(lese("src/server/betriebsanweisung.mjs")).toMatch(/app\.post\("\/api\/nc\/unterweisungen",\s*wache,/);
    expect(lese("src/server/gbu-offline.mjs")).toMatch(/app\.post\("\/api\/nc\/gbu\/meine",\s*wache,/);
    expect(lese("src/server/gbu-offline.mjs")).toMatch(/app\.post\("\/api\/nc\/gbu\/beteiligte",\s*wache,/);
  });
});
