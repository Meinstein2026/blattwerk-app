// test/qualifikationen/ablage.test.js
// Ablage des Qualifikations-Registers (Fachmodul src/server/qualifikationen.mjs).
//
// Anders als bei den Einweisungen laesst sich der Handler hier WIRKLICH
// ausfuehren: das Modul bekommt seine Helfer ueber `ctx` gereicht, und die
// werden mit Attrappen ersetzt. Geprueft wird deshalb das Verhalten, nicht
// der Quelltext — vor allem die Reihenfolge "Nachweis zuerst, dann Store":
// sonst stuende im Register eine Fortbildung, zu der es keinen Nachweis gibt.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qualiErinnerungAnzahl, qualiErinnerungHtml, qualiErinnerungText, register } from "../../src/server/qualifikationen.mjs";
import { QUALI_STORE_LEER, qualNorm } from "../../src/qualifikationen.js";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HEUTE = iso(new Date());
const MORGEN = iso(new Date(Date.now() + 86400000));

function aufbau({ store = QUALI_STORE_LEER, schreibStatus = 204 } = {}) {
  const routen = {};
  // Reicht wache jetzt als zweites Argument mit (funktionWache, server.mjs) —
  // die Attrappe nimmt deshalb das LETZTE app.post-Argument als eigentlichen
  // Handler, statt des Zweiten. Diese Tests pruefen den Handler direkt, ohne
  // die Middleware-Kette (die hat funktionen-server.test.js).
  const app = { post: (pfad, ...fns) => { routen[pfad] = fns[fns.length - 1]; } };
  const protokoll = [];
  const ctx = {
    ncBody: (req) => req.body,
    ssoUser: () => "max",
    authHeader: () => "Basic x",
    ncFilesBase: () => "https://nc/remote.php/dav/files/kalender",
    ncPfad: (p) => p,
    assertOrdner: async () => { protokoll.push("assert"); },
    mandantJetzt: () => MANDANT_STANDARD,
    APP_DIR: "/Blattwerk/App",
    AS_DIR: "/Blattwerk/Arbeitsschutz",
    appStoreLesen: async () => { protokoll.push("lesen"); return { store: JSON.parse(JSON.stringify(store)), etag: '"1"' }; },
    appStoreSchreiben: async (_s, _u, _p, _pfad, st) => { protokoll.push("schreiben"); ctx.geschrieben = st; return { status: schreibStatus }; },
    asTerminSchreiben: async (_creds, t) => { protokoll.push("termin"); ctx.termin = t; return { ok: true, uid: t.uid }; },
  };
  register(app, ctx);
  return { routen, ctx, protokoll };
}
const antwort = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const req = (body) => ({ body: { server: "https://nc", user: "k", pass: "p", ...body }, socket: {}, headers: {} });
const PDF = Buffer.from("%PDF-1.4 test").toString("base64");

let fetchAlt, protokollRef, putStatus;
beforeEach(() => {
  fetchAlt = globalThis.fetch;
  putStatus = 201;
  globalThis.fetch = vi.fn(async (url, init) => {
    protokollRef?.push(`${init.method} ${url}`);
    return { status: init.method === "MKCOL" ? 201 : putStatus };
  });
});
afterEach(() => { globalThis.fetch = fetchAlt; protokollRef = null; });

describe("register", () => {
  it("hängt beide Endpunkte ein", () => {
    const { routen } = aufbau();
    expect(Object.keys(routen).sort()).toEqual(["/api/nc/qualifikationen", "/api/nc/qualifikationen/save"]);
  });

  it("liefert beim Lesen den normalisierten Store", async () => {
    const { routen } = aufbau({ store: { personen: { anna: { name: "Anna" } } } });
    const res = antwort();
    await routen["/api/nc/qualifikationen"](req({}), res);
    expect(res.code).toBe(200);
    expect(res.body.personen.anna.quals).toEqual([]);
    expect(res.body.version).toBe(1);
  });

  it("verlangt Zugangsdaten", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"]({ body: { personKey: "tom" }, socket: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
});

describe("save — Validierung vor jedem Zugriff", () => {
  it("400 bei unbekannter Art, ohne Nextcloud anzufassen", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "zauberkunst", seit: "2026-01-01" } }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Unbekannte Art/);
    expect(protokoll).toEqual([]);
  });

  it("400 bei Datum in der Zukunft", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-a", seit: MORGEN } }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Zukunft/);
    expect(protokoll).toEqual([]);
  });

  it("400 bei kaputtem Schlussel oder leerem Auftrag", async () => {
    const { routen } = aufbau();
    let res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "../x", person: { name: "X" } }), res);
    expect(res.code).toBe(400);
    res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom" }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/nichts/i);
  });

  it("400 bei unbekannter Person ohne Personendaten (aus qualEintragen)", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "neu", qual: { art: "skt-a", seit: "2026-01-01" } }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Person unbekannt/);
  });

  it("weist andere Dateitypen als PDF/JPG/PNG ab", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({
      personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-a", seit: "2026-01-01" },
      nachweisBase64: PDF, nachweisDateiname: "nachweis.exe",
    }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/PDF/);
  });

  it("laesst sich nicht ueber eine Object.prototype-Eigenschaft als PDF durchschmuggeln", async () => {
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({
      personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-a", seit: "2026-01-01" },
      nachweisBase64: PDF, nachweisDateiname: "boese.constructor",
    }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/PDF/);
  });

  it("weist Nachweis ohne Fortbildung ab", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({
      personKey: "tom", person: { name: "Tom" }, nachweisBase64: PDF, nachweisDateiname: "x.pdf",
    }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Nachweis ohne Fortbildung/);
    expect(protokoll).toEqual([]);
  });
});

describe("save — heute richtet sich nach Berlin, nicht nach der Serverzeit (UTC)", () => {
  // TZ wird auf UTC gesetzt, um den Container nachzustellen — sonst laeuft der
  // Test unbemerkt gruen, weil diese Maschine bereits in Europe/Berlin steht.
  let tzAlt;
  beforeEach(() => { tzAlt = process.env.TZ; process.env.TZ = "UTC"; });
  afterEach(() => {
    vi.useRealTimers();
    if (tzAlt === undefined) delete process.env.TZ; else process.env.TZ = tzAlt;
  });

  it("nimmt ein Datum an, das in Berlin schon der naechste Kalendertag ist", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T22:30:00Z")); // 00:30 Uhr in Berlin (CEST)
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-a", seit: "2026-09-17" } }), res);
    expect(res.code).toBe(200);
  });

  it("weist den Tag danach weiterhin als Zukunft ab", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T22:30:00Z"));
    const { routen } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-a", seit: "2026-09-18" } }), res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/Zukunft/);
  });
});

describe("save — Datum wird vor der Pruefung und dem Ablegen getrimmt", () => {
  it("legt den Nachweis im richtigen Jahresordner ab und speichert das getrimmte Datum", async () => {
    const { routen, ctx, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({
      personKey: "tom", person: { name: "Tom" },
      qual: { art: "erste-hilfe", seit: " 2026-03-01", gueltigBis: " 2028-03-01 ", stelle: "DRK" },
      nachweisBase64: PDF, nachweisDateiname: "Bescheinigung.pdf",
    }), res);
    expect(res.code).toBe(200);
    expect(protokoll.some((z) => z.startsWith("PUT") && z.includes("/Qualifikationen/2026/QUALI_2026-03-01_erste-hilfe_tom.pdf"))).toBe(true);
    const q = ctx.geschrieben.personen.tom.quals[0];
    expect(q.seit).toBe("2026-03-01");
    expect(q.gueltigBis).toBe("2028-03-01");
  });
});

describe("save — client-Nachweis wird verworfen", () => {
  it("ignoriert ein mitgeschicktes qual.nachweis, wenn keine eigene Datei mitkommt", async () => {
    const { routen, ctx } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({
      personKey: "tom", person: { name: "Tom" },
      qual: { art: "skt-a", seit: "2026-01-01", nachweis: "../../../etc/passwd" },
    }), res);
    expect(res.code).toBe(200);
    expect(ctx.geschrieben.personen.tom.quals[0].nachweis).toBe("");
  });
});

describe("save — Nachweis zuerst, dann Store", () => {
  const auftrag = {
    personKey: "tom", person: { name: "Tom Aushilfe", mobil: "+49 1" },
    qual: { art: "erste-hilfe", seit: "2026-03-01", stelle: "DRK" },
    nachweisBase64: PDF, nachweisDateiname: "Bescheinigung.pdf",
  };

  it("legt die Datei im Jahresordner ab, BEVOR der Store geschrieben wird", async () => {
    const { routen, ctx, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req(auftrag), res);
    expect(res.code).toBe(200);
    const put = protokoll.findIndex((z) => /^PUT .*\/Blattwerk\/Arbeitsschutz\/Qualifikationen\/2026\/QUALI_2026-03-01_erste-hilfe_tom\.pdf$/.test(z));
    const store = protokoll.indexOf("schreiben");
    expect(put).toBeGreaterThan(-1);
    expect(put).toBeLessThan(store);
    expect(protokoll.indexOf("assert")).toBeLessThan(protokoll.findIndex((z) => z.startsWith("MKCOL")));
    expect(protokoll.some((z) => z === "MKCOL https://nc/remote.php/dav/files/kalender/Blattwerk/Arbeitsschutz/Qualifikationen/2026")).toBe(true);
    const q = ctx.geschrieben.personen.tom.quals[0];
    expect(q.nachweis).toBe("Qualifikationen/2026/QUALI_2026-03-01_erste-hilfe_tom.pdf");
    expect(q.erfasstVon).toBe("max");
    // erfasstAm ist ein Zeitstempel (fuer den Gleichstands-Tiebreak in qualLetzte),
    // kein blosses Datum — HEUTE ist lokal, toISOString() ist UTC, daher kein Tagesvergleich.
    expect(q.erfasstAm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(res.body.person.name).toBe("Tom Aushilfe");
    expect(res.body.bis).toBe("2028-03-01");
    expect(res.body.nachweis).toBe(q.nachweis);
  });

  it("schreibt den Store NICHT, wenn der Nachweis nicht abgelegt werden kann", async () => {
    const { routen, protokoll } = aufbau(); protokollRef = protokoll;
    putStatus = 507;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req(auftrag), res);
    expect(res.code).toBe(502);
    expect(res.body.error).toMatch(/Nachweis ablegen/);
    expect(protokoll).not.toContain("schreiben");
  });

  it("geht ohne Nachweis direkt zum Store (Person ohne Fortbildung)", async () => {
    const { routen, ctx, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" } }), res);
    expect(res.code).toBe(200);
    expect(protokoll.filter((z) => z.startsWith("PUT"))).toEqual([]);
    expect(ctx.geschrieben.personen.tom.quals).toEqual([]);
    expect(res.body.bis).toBeNull();
    expect(res.body.kalender).toBeNull();
  });

  it("haengt an, statt zu ersetzen", async () => {
    const vorher = qualNorm({ personen: { tom: { name: "Tom", quals: [{ id: "alt", art: "erste-hilfe", seit: "2024-01-01", gueltigBis: null }] } } });
    const { routen, ctx } = aufbau({ store: vorher });
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", qual: { art: "erste-hilfe", seit: "2026-03-01" } }), antwort());
    expect(ctx.geschrieben.personen.tom.quals.map((x) => x.seit)).toEqual(["2024-01-01", "2026-03-01"]);
  });

  it("liest bei 412 neu und gibt nach zwei Versuchen 409", async () => {
    const { routen, protokoll } = aufbau({ schreibStatus: 412 }); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" } }), res);
    expect(res.code).toBe(409);
    expect(protokoll.filter((z) => z === "schreiben")).toHaveLength(2);
  });
});

describe("save — Kalendertermin", () => {
  it("nur fuer befristete Arten, mit fester UID und dem Ablaufdatum", async () => {
    const { routen, ctx } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "erste-hilfe", seit: "2026-03-01" } }), res);
    expect(ctx.termin.uid).toBe("blattwerk-quali-erste-hilfe-tom@blattwerk");
    expect(ctx.termin.datum).toBe("2028-03-01");
    expect(ctx.termin.titel).toMatch(/Ersthelfer/);
    expect(ctx.termin.titel).toMatch(/Tom/);
    expect(res.body.kalender).toEqual({ ok: true, uid: ctx.termin.uid });
  });

  it("nimmt das Datum der Bescheinigung, wenn eines mitkommt", async () => {
    const { routen, ctx } = aufbau();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "g41", seit: "2026-03-01", gueltigBis: "2027-06-30" } }), antwort());
    expect(ctx.termin.datum).toBe("2027-06-30");
  });

  it("legt fuer unbefristete Arten keinen Termin an", async () => {
    const { routen, ctx, protokoll } = aufbau(); protokollRef = protokoll;
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-b", seit: "2026-03-01" } }), res);
    expect(ctx.termin).toBeUndefined();
    expect(protokoll).not.toContain("termin");
    expect(res.body.kalender).toBeNull();
  });

  it("legt trotzdem einen Termin an, wenn eine unbefristete Art ein Ablaufdatum mitbekommt (Ruling: ein auf der Bescheinigung stehendes Datum ist eine echte Frist)", async () => {
    const { routen, ctx } = aufbau();
    const res = antwort();
    await routen["/api/nc/qualifikationen/save"](req({ personKey: "tom", person: { name: "Tom" }, qual: { art: "skt-b", seit: "2026-03-01", gueltigBis: "2027-01-01" } }), res);
    expect(ctx.termin.datum).toBe("2027-01-01");
    expect(res.body.bis).toBe("2027-01-01");
  });
});

describe("Erinnerung", () => {
  // Tom hat SKT A, aber nie ein G 41 eingetragen, und mit nur diesen zwei
  // Personen im Store fehlt zugleich der Ersthelfer (§ 26 DGUV Vorschrift 1,
  // 2 bis 20 Personen -> mindestens einer, hier: keiner) — seit Task 12
  // (18.09.2026) sind das zwei ZUSAETZLICHE, von "heute" unabhaengige
  // Befunde neben der bestehenden Faelligkeit (Annas G 41 laeuft ab).
  const store = qualNorm({ personen: {
    anna: { name: "Anna <B>", quals: [{ id: "1", art: "g41", seit: "2023-01-01", gueltigBis: "2026-09-01" }] },
    tom: { name: "Tom", quals: [{ id: "2", art: "skt-a", seit: "2020-01-01", gueltigBis: null }] },
  } });

  it("baut einen eigenen Abschnitt Fortbildungen mit Ablauf und Name — unveraendert zu vorher", () => {
    const html = qualiErinnerungText(store, "2026-09-16");
    expect(html).toMatch(/Fortbildungen:/);
    expect(html).toMatch(/Eignungsuntersuchung G 41/);
    expect(html).toMatch(/seit 15 Tag\(en\) abgelaufen/);
    expect(html).toMatch(/gültig bis 2026-09-01/);
    expect(html).toContain("Anna &lt;B&gt;"); // HTML wird maskiert
    expect(html).not.toMatch(/SKT A/);          // unbefristet, nichts zu melden (bestehender Weg)
  });

  it("ergänzt Task 12: fehlende Pflichtnachweise und die Ersthelfer-Quote als eigene Abschnitte", () => {
    const html = qualiErinnerungText(store, "2026-09-16");
    expect(html).toMatch(/Fehlende Pflichtnachweise:/);
    expect(html).toMatch(/Eignungsuntersuchung G 41.*Tom: fehlt \(arbeitet in Absturzgefahr \(SKT\)\)/);
    expect(html).toMatch(/Ersthelfer im Betrieb: 0 von 1/);
  });

  it("ist leer nur ganz ohne Personen", () => {
    expect(qualiErinnerungText(QUALI_STORE_LEER, "2026-09-16")).toBe("");
  });

  it("ist NICHT mehr leer fern vom Faelligkeitsdatum: Toms fehlendes G 41 und die Ersthelfer-Luecke sind nicht datumsabhaengig (Task 12)", () => {
    const html = qualiErinnerungText(store, "2025-01-01");
    expect(html).not.toBe("");
    expect(html).not.toMatch(/Fortbildungen:/); // an dem Datum ist noch nichts faellig — das bleibt so
    expect(html).toMatch(/Fehlende Pflichtnachweise:/);
    expect(html).toMatch(/Ersthelfer im Betrieb: 0 von 1/);
  });

  it("liest den Store ueber den gemerkten ctx", async () => {
    aufbau({ store });
    const html = await qualiErinnerungHtml({ server: "https://nc", user: "k", pass: "p" }, "2026-09-16");
    expect(html).toMatch(/Fortbildungen:/);
  });

  it("schweigt, wenn der Store nicht lesbar ist", async () => {
    const { ctx } = aufbau();
    ctx.appStoreLesen = async () => { throw new Error("kaputt"); };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await qualiErinnerungHtml({ server: "https://nc", user: "k", pass: "p" }, "2026-09-16")).toBe("");
    expect(fehler).toHaveBeenCalled();
    fehler.mockRestore();
    expect(await qualiErinnerungHtml(null, "2026-09-16")).toBe("");
  });

  // Der Mail-Betreff ("N offene Frist(en)") zaehlte bislang nur Einweisungen und
  // Pruefungen — stehen nur Fortbildungen an, meldete er faelschlich "0 offene
  // Frist(en)" (16.09.2026). qualiErinnerungAnzahl liefert die fehlende Zahl.
  // Seit Task 12 (18.09.2026) zaehlt sie zusaetzlich fehlende Pflichtnachweise
  // (Tom: G 41, +1) und die Ersthelfer-Luecke (EIN Punkt, nicht pro Person, +1):
  // 1 (Annas faelliges G 41) + 1 (Toms fehlendes G 41) + 1 (Ersthelfer) = 3.
  it("liefert die Anzahl der offenen Fristen inkl. fehlender Pflichtnachweise und Ersthelfer-Luecke fuer den Mail-Betreff", async () => {
    aufbau({ store });
    expect(await qualiErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, "2026-09-16")).toBe(3);
  });

  it("zaehlt Toms fehlendes G 41 und die Ersthelfer-Luecke auch fern vom Faelligkeitsdatum mit (2 von 3)", async () => {
    aufbau({ store });
    expect(await qualiErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, "2025-01-01")).toBe(2);
  });

  it("ist 0 ohne Personen, unabhängig vom Datum, oder wenn der Store nicht lesbar ist bzw. Zugangsdaten fehlen", async () => {
    aufbau({ store: QUALI_STORE_LEER });
    expect(await qualiErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, "2025-01-01")).toBe(0);
    const { ctx } = aufbau({ store });
    ctx.appStoreLesen = async () => { throw new Error("kaputt"); };
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await qualiErinnerungAnzahl({ server: "https://nc", user: "k", pass: "p" }, "2026-09-16")).toBe(0);
    fehler.mockRestore();
    expect(await qualiErinnerungAnzahl(null, "2026-09-16")).toBe(0);
  });
});
