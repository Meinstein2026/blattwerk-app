// Selbst-Einladung in den Blattwerk-Space (src/server/chat-einladung.mjs).
import { afterEach, describe, expect, it, vi } from "vitest";
import { einladungPruefen, register } from "../../src/server/chat-einladung.mjs";

const HS = "https://matrix.example.org", ICH = "@tom.aushilfe:matrix.example.org";
const antwort = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const route = (login) => { let fn; register({ post: (_p, f) => { fn = f; } }, { ssoUser: () => login }); return fn; };
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CHAT_EINLADER_TOKEN; });

describe("einladungPruefen", () => {
  it("nur das EIGENE Konto auf dem eigenen Homeserver", () => {
    expect(einladungPruefen(ICH, "Tom.Aushilfe", HS)).toBe("");
    expect(einladungPruefen("@max:matrix.example.org", "tom.aushilfe", HS)).toMatch(/gehört nicht/);
    expect(einladungPruefen("@tom.aushilfe:matrix.org", "tom.aushilfe", HS)).toMatch(/unbrauchbar/);
    expect(einladungPruefen(ICH, null, HS)).toMatch(/Authentik/);
  });
});

describe("POST /api/chat/einladen", () => {
  it("lädt mit dem Dienstkonto ein; »schon drin« zählt als Erfolg", async () => {
    process.env.CHAT_EINLADER_TOKEN = "geheim";
    const rufe = [];
    vi.stubGlobal("fetch", async (url, init) => { rufe.push([url, init]); return rufe.length === 1 ? { ok: true } : { ok: false, status: 403, json: async () => ({ error: `${ICH} is already in the room.` }) }; });
    const a = antwort(); await route("tom.aushilfe")({ body: { userId: ICH } }, a);
    expect(a.body).toEqual({ ok: true });
    expect(rufe[0][0]).toContain("/rooms/!example%3Amatrix.example.org/invite");
    expect(rufe[0][1].headers.Authorization).toBe("Bearer geheim");
    expect(JSON.parse(rufe[0][1].body)).toEqual({ user_id: ICH });
    const b = antwort(); await route("tom.aushilfe")({ body: { userId: ICH } }, b);
    expect(b.body).toEqual({ ok: true, schon: true });
  });
  it("fremdes Konto: 403, ohne den Homeserver zu fragen", async () => {
    process.env.CHAT_EINLADER_TOKEN = "geheim";
    const holen = vi.fn(); vi.stubGlobal("fetch", holen);
    const a = antwort(); await route("tom.aushilfe")({ body: { userId: "@max:matrix.example.org" } }, a);
    expect(a.code).toBe(403); expect(holen).not.toHaveBeenCalled();
  });
});
