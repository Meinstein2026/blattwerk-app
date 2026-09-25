// Anmeldung des nativen Chats — reine Bausteine, ohne Browser und ohne Netz.
import { describe, expect, it } from "vitest";
import {
  CHAT_GERAETENAME, CHAT_SITZUNG_KEY, chatLoginTokenAusUrl, chatMitTokenAnmelden, chatRueckAdresse,
  chatSitzungGueltig, chatSitzungLesen, chatSitzungLoeschen, chatSitzungMerken, chatSsoUrl, chatUrlBereinigt,
} from "../../src/chat/sitzung.js";

const HS = "https://matrix.example.org";
const speicher = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const SITZUNG = { userId: "@tom:example.org", deviceId: "ABCDEF", accessToken: "geheim", homeserver: HS };

describe("SSO-Weg", () => {
  it("baut die Anmeldeadresse mit kodierter Rücksprungadresse", () => {
    const rueck = chatRueckAdresse("https://app.example.org/");
    expect(rueck).toBe("https://app.example.org/?chat-anmeldung=1");
    expect(chatSsoUrl(HS + "/", rueck)).toBe(
      "https://matrix.example.org/_matrix/client/v3/login/sso/redirect?redirectUrl=https%3A%2F%2Fapp.example.org%2F%3Fchat-anmeldung%3D1");
  });
  it("liest den loginToken nur auf dem eigenen Rückweg", () => {
    expect(chatLoginTokenAusUrl("https://app.example.org/?chat-anmeldung=1&loginToken=abc")).toBe("abc");
    // Ein fremder Parameter gleichen Namens (z. B. aus einem geteilten Link) zählt nicht.
    expect(chatLoginTokenAusUrl("https://app.example.org/?loginToken=abc")).toBe(null);
    expect(chatLoginTokenAusUrl("https://app.example.org/?chat-anmeldung=1")).toBe(null);
    expect(chatLoginTokenAusUrl("kein url")).toBe(null);
  });
  it("räumt Token und Marke aus der Adresse, lässt alles andere stehen", () => {
    expect(chatUrlBereinigt("https://app.example.org/?chat-anmeldung=1&loginToken=abc#chat")).toBe("/#chat");
    expect(chatUrlBereinigt("https://app.example.org/?x=1&chat-anmeldung=1&loginToken=abc")).toBe("/?x=1");
  });
});

describe("Sitzung merken", () => {
  it("schreibt und liest eine vollständige Sitzung", () => {
    const s = speicher();
    chatSitzungMerken(s, SITZUNG);
    expect(chatSitzungLesen(s)).toEqual(SITZUNG);
    chatSitzungLoeschen(s);
    expect(chatSitzungLesen(s)).toBe(null);
  });
  it("weist Unvollständiges ab und verträgt kaputten Speicher", () => {
    expect(() => chatSitzungMerken(speicher(), { ...SITZUNG, accessToken: "" })).toThrow(/Unvollständig/);
    expect(chatSitzungGueltig({ ...SITZUNG, deviceId: undefined })).toBe(false);
    const s = speicher(); s.setItem(CHAT_SITZUNG_KEY, "{kaputt");
    expect(chatSitzungLesen(s)).toBe(null);
  });
});

describe("chatMitTokenAnmelden", () => {
  it("tauscht den Token gegen eine Sitzung und nennt das Gerät beim Namen", async () => {
    let gesehen;
    const holen = async (url, opt) => { gesehen = { url, body: JSON.parse(opt.body) };
      return { ok: true, status: 200, json: async () => ({ user_id: "@tom:example.org", device_id: "ABCDEF", access_token: "geheim" }) }; };
    expect(await chatMitTokenAnmelden(HS, "abc", holen)).toEqual(SITZUNG);
    expect(gesehen.url).toBe(HS + "/_matrix/client/v3/login");
    expect(gesehen.body).toEqual({ type: "m.login.token", token: "abc", initial_device_display_name: CHAT_GERAETENAME });
  });
  it("reicht die Fehlermeldung des Homeservers durch", async () => {
    const holen = async () => ({ ok: false, status: 403, json: async () => ({ errcode: "M_FORBIDDEN", error: "Invalid login token" }) });
    await expect(chatMitTokenAnmelden(HS, "alt", holen)).rejects.toThrow(/Invalid login token/);
  });
  it("lehnt eine unvollständige Antwort ab, statt eine halbe Sitzung zu merken", async () => {
    const holen = async () => ({ ok: true, status: 200, json: async () => ({ user_id: "@tom:example.org" }) });
    await expect(chatMitTokenAnmelden(HS, "abc", holen)).rejects.toThrow(/vollständige Sitzung/);
  });
});
