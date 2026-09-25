import { describe, expect, it } from "vitest";
import { darfRecht, dolibarrGruppenLader, plAlleWache } from "../../src/pl-rechte.mjs";
import { kachelKey } from "../../src/kacheln.js";

const antwort = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const wache = (o) => plAlleWache({
  ssoUser: () => "anna", istMandantAdmin: () => false,
  gruppenLaden: async () => ({ admin: false, gruppen: [] }), rechte: () => ({}), ...o,
});
const lauf = async (w) => { const res = antwort(); let weiter = false; await w({}, res, () => { weiter = true; }); return { weiter, res }; };

describe("darfRecht", () => {
  it("Stern erlaubt allen", () => expect(darfRecht([], ["*"])).toBe(true));
  it("vergleicht ohne Gross/Klein", () => expect(darfRecht(["Finanzen"], ["finanzen"])).toBe(true));
  it("fremde Gruppe nicht", () => expect(darfRecht(["Mitarbeiter"], ["finanzen"])).toBe(false));
  it("ohne Liste nicht", () => expect(darfRecht(["x"], undefined)).toBe(false));
});

describe("plAlleWache", () => {
  it("liest denselben Schluessel wie der Adminbereich", () => expect(kachelKey("alleDokumente")).toBe("kachel_alleDokumente"));
  it("Mandanten-Admin darf", async () => expect((await lauf(wache({ istMandantAdmin: () => true }))).weiter).toBe(true));
  it("Dolibarr-Admin darf", async () => expect((await lauf(wache({ gruppenLaden: async () => ({ admin: true, gruppen: [] }) }))).weiter).toBe(true));
  it("Standard: nur Admin-Gruppen", async () => {
    expect((await lauf(wache({ gruppenLaden: async () => ({ admin: false, gruppen: ["Admins"] }) }))).weiter).toBe(true);
    const { weiter, res } = await lauf(wache({ gruppenLaden: async () => ({ admin: false, gruppen: ["Mitarbeiter"] }) }));
    expect(weiter).toBe(false);
    expect(res.code).toBe(403);
  });
  it("im Adminbereich freigegebene Gruppe darf", async () => {
    const w = wache({ gruppenLaden: async () => ({ admin: false, gruppen: ["Finanzen"] }), rechte: () => ({ kachel_alleDokumente: ["finanzen"] }) });
    expect((await lauf(w)).weiter).toBe(true);
  });
  it("ohne SSO-Nutzer 403", async () => expect((await lauf(wache({ ssoUser: () => "" }))).res.code).toBe(403));
  it("Dolibarr weg: 403 statt durchlassen", async () => expect((await lauf(wache({ gruppenLaden: async () => { throw new Error("weg"); } }))).res.code).toBe(403));
  it("kein hinterlegter Schluessel: 403", async () => expect((await lauf(wache({ gruppenLaden: async () => null }))).res.code).toBe(403));
});

describe("dolibarrGruppenLader", () => {
  const store = () => ({ anna: { url: "https://doli.example/", key: "k" } });
  const fetchFn = (aufrufe) => async (url) => {
    aufrufe.push(url);
    if (url.endsWith("/users/info")) return { ok: true, json: async () => ({ id: 7, admin: "0" }) };
    if (url.endsWith("/users/7/groups")) return { ok: true, json: async () => [{ name: "Finanzen" }, { nom: "Team" }] };
    return { ok: false, json: async () => ({}) };
  };
  it("liest Gruppen und merkt sie 5 Minuten", async () => {
    const aufrufe = []; let t = 0;
    const laden = dolibarrGruppenLader({ fetchFn: fetchFn(aufrufe), storeLoad: store, jetzt: () => t });
    expect(await laden("anna")).toEqual({ admin: false, gruppen: ["Finanzen", "Team"] });
    expect(aufrufe[0]).toBe("https://doli.example/api/index.php/users/info");
    await laden("anna");
    expect(aufrufe.length).toBe(2);
    t = 5 * 60 * 1000 + 1;
    await laden("anna");
    expect(aufrufe.length).toBe(4);
  });
  it("unbekannter Nutzer: null", async () => {
    expect(await dolibarrGruppenLader({ fetchFn: fetchFn([]), storeLoad: store })("bert")).toBeNull();
  });
});
