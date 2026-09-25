// Firmen-Hinterlegung des Sicherheitsschlüssels (src/chat/hinterlegung.js +
// src/server/chat-hinterlegung.mjs): die App verschlüsselt für Max'
// öffentlichen Schlüssel, der Server legt NUR den Geheimtext ab.
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { HINTERLEGUNG_LEER, hinterlegungEintragen, hinterlegungNorm, hinterlegungPruefen, hinterlegungVerschluesseln } from "../../src/chat/hinterlegung.js";
import { register } from "../../src/server/chat-hinterlegung.mjs";

const SCHLUESSEL = "EsTc 5Rr1 4Jhp Uc18 hwCn 2b9T LSvj 5h4T TkP8 bdeK JGTa RCb5";

describe("hinterlegungVerschluesseln", () => {
  it("nur der private Schlüssel bekommt den Klartext zurück (RSA-OAEP/SHA-256, wie der openssl-Einzeiler)", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const chiffre = await hinterlegungVerschluesseln(spki, SCHLUESSEL);
    expect(chiffre).not.toContain("EsTc");
    const klar = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(chiffre, "base64"));
    expect(klar.toString("utf8")).toBe(SCHLUESSEL);
  });
});

describe("hinterlegungEintragen", () => {
  const e = { userId: "@tom:x", deviceId: "ABC", chiffre: "QUJD", login: "tom", am: "2026-09-19T08:00:00Z" };
  it("additiv: eine neue Einrichtung verdrängt die alte nicht, fremde Konten bleiben", () => {
    let s = hinterlegungEintragen(HINTERLEGUNG_LEER, e);
    s = hinterlegungEintragen(s, { ...e, userId: "@anna:x", login: "anna" });
    s = hinterlegungEintragen(s, { ...e, deviceId: "DEF", am: "2026-10-01T08:00:00Z" });
    expect(s.konten["@tom:x"].map((x) => x.deviceId)).toEqual(["ABC", "DEF"]);
    expect(s.konten["@anna:x"]).toHaveLength(1);
  });
  it("dasselbe Gerät noch einmal (Wiederholung nach Netzfehler) ersetzt den eigenen Eintrag", () => {
    const s = hinterlegungEintragen(hinterlegungEintragen(HINTERLEGUNG_LEER, e), { ...e, chiffre: "WFla" });
    expect(s.konten["@tom:x"]).toEqual([{ deviceId: "ABC", chiffre: "WFla", login: "tom", am: e.am }]);
  });
  it("weist Unbrauchbares ab", () => {
    expect(hinterlegungPruefen({ ...e, userId: "tom" })).toMatch(/Konto/);
    expect(hinterlegungPruefen({ ...e, chiffre: "kein base64!" })).toMatch(/Geheimtext/);
    expect(hinterlegungPruefen({ ...e, chiffre: "A".repeat(5000) })).toMatch(/Geheimtext/);
    expect(hinterlegungPruefen(e)).toBe("");
  });
  it("normalisiert eine kaputte Datei nicht zu Datenverlust", () => {
    expect(hinterlegungNorm({ konten: { "@tom:x": [e] }, fremd: 1 }).konten["@tom:x"]).toHaveLength(1);
    expect(hinterlegungNorm(null)).toEqual(HINTERLEGUNG_LEER);
  });
});

describe("Server-Endpunkt", () => {
  const aufbau = () => {
    const routen = {}, ctx = {
      ssoUser: () => "tom",
      appStoreAendern: async (_req, res, { pfad, aendern }) => { ctx.pfad = pfad; ctx.ergebnis = aendern(HINTERLEGUNG_LEER); return res.json({ ok: true, ...ctx.ergebnis }); },
    };
    register({ post: (p, fn) => { routen[p] = fn; } }, ctx);
    return { routen, ctx };
  };
  const antwort = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });

  it("legt den Geheimtext mit dem Authentik-Namen ab und gibt ihn NICHT zurück", async () => {
    const { routen, ctx } = aufbau(), res = antwort();
    await routen["/api/nc/chat-hinterlegung"]({ body: { userId: "@tom:x", deviceId: "ABC", chiffre: "QUJD", login: "gefaelscht" } }, res);
    expect(ctx.pfad).toBe("/Blattwerk/App/chat-hinterlegung.json");
    expect(ctx.ergebnis.konten["@tom:x"][0]).toMatchObject({ deviceId: "ABC", chiffre: "QUJD", login: "tom" });
    expect(res.body).toEqual({ ok: true });
  });
  it("400 bei unbrauchbarer Eingabe", async () => {
    const { routen } = aufbau(), res = antwort();
    await routen["/api/nc/chat-hinterlegung"]({ body: { userId: "tom", deviceId: "A", chiffre: "QUJD" } }, res);
    expect(res.code).toBe(400);
  });
});

describe("hinterlegungSenden / hinterlegungNachholen", () => {
  const speicherNeu = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
  it("merkt den Geheimtext bei Netzfehler und reicht ihn später nach", async () => {
    const { hinterlegungSenden, hinterlegungNachholen } = await import("../../src/chat/hinterlegung.js");
    const speicher = speicherNeu(), e = { userId: "@tom:x", deviceId: "ABC", chiffre: "QUJD" };
    expect(await hinterlegungSenden(e, { holen: async () => { throw new Error("offline"); }, speicher })).toBe(false);
    expect(speicher.m.size).toBe(1);
    const gesendet = [];
    expect(await hinterlegungNachholen({ holen: async (_u, init) => { gesendet.push(JSON.parse(init.body)); return { ok: true }; }, speicher })).toBe(true);
    expect(gesendet).toEqual([e]);
    expect(speicher.m.size).toBe(0);
  });
});
