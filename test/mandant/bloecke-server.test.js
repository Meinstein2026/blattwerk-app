import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bestellEmpfaenger, bestellWache, blockWache, wachePaperless } from "../../src/mandant-server.mjs";
import { MANDANT_STANDARD, mandantLaden } from "../../src/mandant.js";

const antwort = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

describe("Blöcke sperren Endpunkte", () => {
  it("lässt durch, wenn der Block an ist", () => {
    const wache = blockWache("arbeitsschutz", () => ({ profil: "baumpflege", bloecke: { arbeitsschutz: true }, dienste: { nextcloud: "https://nc" } }));
    const res = antwort();
    let weiter = false;
    wache({}, res, () => { weiter = true; });
    expect(weiter).toBe(true);
  });

  it("antwortet 404, wenn der Block aus ist", () => {
    const wache = blockWache("arbeitsschutz", () => ({ profil: "baumpflege", bloecke: { arbeitsschutz: false } }));
    const res = antwort();
    wache({}, res, () => { throw new Error("darf nicht weitergehen"); });
    expect(res.code).toBe(404);
    expect(res.body.error).toMatch(/nicht freigeschaltet/);
  });

  it("die GBU-Endpunkte hängen an arbeitsschutz, die Kalender-Endpunkte an kalender", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
    for (const pfad of ["/api/nc/gbu-upload", "/api/nc/gbu-list", "/api/nc/gbu-file", "/api/nc/einweisungen"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheArbeitsschutz`));
    }
    for (const pfad of ["/api/nc/events", "/api/nc/event", "/api/nc/calendars"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheKalender`));
    }
    expect(src).toMatch(/"\/api\/mail\/order",\s*wacheBestellung/);
    expect(src).toMatch(/"\/api\/nc\/fahrtenbuch",\s*wacheFahrtenbuch/);
    // Chat: die beiden Skript-Routen VOR den app.use-Mounts und die Mounts
    // selbst muessen alle wacheChat tragen, sonst bliebe ein Umweg am Proxy
    // vorbei offen.
    expect(src).toMatch(/`\/chat\/\$\{APP_RUECKKEHR_PFAD\}`,\s*wacheChat/);
    expect(src).toMatch(/`\/chat\/\$\{APP_KOSTUEM_PFAD\}`,\s*wacheChat/);
    expect(src).toMatch(/app\.use\("\/chat",\s*wacheChat/);
    expect(src).toMatch(/app\.use\("\/branding",\s*wacheChat/);
    // Paperless: alle drei /api/pl/*-Routen haengen an wachePl.
    for (const pfad of ["/api/pl/list", "/api/pl/file/:id", "/api/pl/upload"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*wachePl`));
    }
    // Nachgetragen 18.09.2026 (Befund I5): diese Routen hatten gar keine Wache.
    for (const pfad of ["/api/nc/putfile", "/api/nc/dokumente-list", "/api/nc/dokumente-file", "/api/nc/dokumente-upload"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheBelege`));
    }
    for (const pfad of ["/api/nc/anlagen", "/api/nc/anlagen/save", "/api/nc/fixkosten", "/api/nc/fixkosten/save"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*wacheErp`));
    }
    // Und die bewusste Ausnahme: das Pflicht-Tutorial gehoert zu keinem Block
    // und bleibt offen (Begruendung steht bei den Wachen in server.mjs).
    for (const pfad of ["/api/nc/tutorial", "/api/nc/tutorial/save"]) {
      expect(src).toMatch(new RegExp(`"${pfad}",\\s*async`));
    }
  });

  // Die Zeilen oben sind Quelltextmuster (sie pruefen, dass die Wache an der
  // Route HAENGT). Was die Wache dann TUT, gehoert hierher — mit denselben
  // Mandanten, die im Betrieb vorkommen.
  it("Belege und ERP: die neuen Wachen lassen Blattwerk durch und sperren einen Mandanten mit abgeschaltetem Block", () => {
    const durch = (wache, mandant) => {
      const res = antwort();
      let weiter = false;
      wache({}, res, () => { weiter = true; });
      return { weiter, code: res.code, body: res.body };
    };
    for (const block of ["belege", "erp"]) {
      // Blattwerk: alle Bloecke an, eigene Dienste hinterlegt.
      expect(durch(blockWache(block, () => MANDANT_STANDARD)).weiter).toBe(true);

      // Fremder Mandant, Block ausdruecklich aus.
      const aus = mandantLaden(JSON.stringify({
        kuerzel: "xy", name: "Baum Müller GbR",
        bloecke: { [block]: false },
        dienste: { nextcloud: "https://nc.xy", dolibarr: "https://erp.xy" },
      })).mandant;
      const gesperrt = durch(blockWache(block, () => aus));
      expect(gesperrt.weiter).toBe(false);
      expect(gesperrt.code).toBe(404);
      expect(gesperrt.body).toEqual({ error: "Dieser Bereich ist für diese Firma nicht freigeschaltet." });

      // Und der stille Fall: Block auf true, aber kein Dienst hinterlegt —
      // ohne Adresse liefe die Anfrage sonst gegen Blattwerks Instanz.
      const ohneDienst = mandantLaden(JSON.stringify({
        kuerzel: "xy", name: "Baum Müller GbR", bloecke: { [block]: true },
      })).mandant;
      expect(durch(blockWache(block, () => ohneDienst)).code).toBe(404);

      // Gegenprobe: mit eigenem Dienst geht es durch.
      const eigen = mandantLaden(JSON.stringify({
        kuerzel: "xy", name: "Baum Müller GbR", bloecke: { [block]: true },
        dienste: { nextcloud: "https://nc.xy", dolibarr: "https://erp.xy" },
      })).mandant;
      expect(durch(blockWache(block, () => eigen)).weiter).toBe(true);
    }
  });

  it("die Chat-Wache lässt durch, wenn der Block an ist, und antwortet 404 mit der Standardmeldung, wenn er aus ist", () => {
    const wache = blockWache("chat", () => ({ bloecke: { chat: true }, dienste: { matrix: "https://chat.example" } }));
    const res = antwort();
    let weiter = false;
    wache({}, res, () => { weiter = true; });
    expect(weiter).toBe(true);

    const wacheAus = blockWache("chat", () => ({ bloecke: { chat: false } }));
    const res2 = antwort();
    wacheAus({}, res2, () => { throw new Error("darf nicht weitergehen"); });
    expect(res2.code).toBe(404);
    expect(res2.body).toEqual({ error: "Dieser Bereich ist für diese Firma nicht freigeschaltet." });
  });

  it("die Paperless-Wache lässt Blattwerk am Standard-Mandanten durch, einen Mandanten ohne dienste.paperless aber nicht", () => {
    const wache = wachePaperless(() => MANDANT_STANDARD);
    const res = antwort();
    let weiter = false;
    wache({}, res, () => { weiter = true; });
    expect(weiter).toBe(true);

    const wacheFremd = wachePaperless(() => ({ kuerzel: "xy", dienste: {} }));
    const res2 = antwort();
    wacheFremd({}, res2, () => { throw new Error("darf nicht weitergehen"); });
    expect(res2.code).toBe(404);
    expect(res2.body).toEqual({ error: "Dieser Bereich ist für diese Firma nicht freigeschaltet." });

    const wacheFremdMitAdresse = wachePaperless(() => ({ kuerzel: "xy", dienste: { paperless: "https://pl.xy.example" } }));
    const res3 = antwort();
    let weiter3 = false;
    wacheFremdMitAdresse({}, res3, () => { weiter3 = true; });
    expect(weiter3).toBe(true);
  });

  it("die Bestellmail-Wache lässt Blattwerk am Standard-Mandanten durch, einen fremden Mandanten ohne eigene Adresse aber nicht", () => {
    const wache = bestellWache(() => MANDANT_STANDARD);
    const res = antwort();
    let weiter = false;
    wache({}, res, () => { weiter = true; });
    expect(weiter).toBe(true);

    const wacheFremd = bestellWache(() => ({ kuerzel: "xy", kontakt: { bestellMail: "" } }));
    const res2 = antwort();
    wacheFremd({}, res2, () => { throw new Error("darf nicht weitergehen"); });
    expect(res2.code).toBe(404);
    expect(res2.body.error).toMatch(/keine Bestelladresse/);

    const wacheFremdMitAdresse = bestellWache(() => ({ kuerzel: "xy", kontakt: { bestellMail: "einkauf@xy.de" } }));
    const res3 = antwort();
    let weiter3 = false;
    wacheFremdMitAdresse({}, res3, () => { weiter3 = true; });
    expect(weiter3).toBe(true);
  });

  it("die Bestellmail geht an die Adresse des Mandanten, nicht an eine feste Blattwerk-Adresse", () => {
    expect(bestellEmpfaenger(MANDANT_STANDARD)).toBe("finanzen@example.org");
    expect(bestellEmpfaenger({ kuerzel: "xy", kontakt: { bestellMail: "einkauf@xy.de" } })).toBe("einkauf@xy.de");
    // Ohne eigene Adresse (durch bestellWache eigentlich ausgeschlossen) greift
    // ORDER_MAIL_TO, sonst zuletzt die feste Blattwerk-Adresse.
    delete process.env.ORDER_MAIL_TO;
    expect(bestellEmpfaenger({ kuerzel: "xy", kontakt: {} })).toBe("finanzen@example.org");
    process.env.ORDER_MAIL_TO = "fallback@example.org";
    expect(bestellEmpfaenger({ kuerzel: "xy", kontakt: {} })).toBe("fallback@example.org");
    delete process.env.ORDER_MAIL_TO;
  });
});
