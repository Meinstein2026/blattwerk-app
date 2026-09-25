// Anzeige-Logik des nativen Chats (src/chat/logik.js) — was die Seite aus den
// Ereignissen macht, ohne Homeserver und ohne SDK.
import { describe, expect, it } from "vitest";
import {
  chatBeitrittsRaeume, chatDateiGroesse, chatFarbe, chatInitialen, chatKurztext, chatListenZeit, chatMarke, chatMedienUrl, chatMsgtypFuer,
  chatNachricht, chatOhneZitat, chatOrdnerBilden, chatRaumListe, chatSasEmojis, chatSyncFilter, chatSyncRaeume, chatTagesTitel, chatUhrzeit, chatUngelesenGesamt, chatVorschau, chatZeitleiste,
} from "../../src/chat/logik.js";

const ZONE = "Europe/Berlin";
const T = (iso) => new Date(iso).getTime();
const msg = (id, sender, ts, inhalt, rest = {}) => ({ id, typ: "m.room.message", sender, senderName: sender === "@tom:x" ? "Tom Aushilfe" : "Max M", ts: T(ts), inhalt, ...rest });
const txt = (body, rest = {}) => ({ msgtype: "m.text", body, ...rest });

describe("chatOhneZitat", () => {
  it("nimmt den Antwort-Rückfall heraus", () => {
    expect(chatOhneZitat("> <@tom:x> Wann?\n> morgen\n\nUm acht.")).toBe("Um acht.");
  });
  it("lässt eine normale Nachricht stehen — auch eine, die später ein > enthält", () => {
    expect(chatOhneZitat("Hallo\n> kein Zitat")).toBe("Hallo\n> kein Zitat");
  });
});

describe("chatNachricht", () => {
  it("Text, Hinweis, Emote", () => {
    expect(chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", txt("Moin")))).toMatchObject({ art: "text", text: "Moin", senderName: "Tom Aushilfe" });
    expect(chatNachricht(msg("2", "@bot:x", "2026-09-19T08:00:00Z", { msgtype: "m.notice", body: "Beleg erkannt" }))).toMatchObject({ art: "hinweis" });
    expect(chatNachricht(msg("3", "@tom:x", "2026-09-19T08:00:00Z", { msgtype: "m.emote", body: "winkt" })).text).toBe("* Tom Aushilfe winkt");
  });
  it("Bild: verschlüsselt (file) wie unverschlüsselt (url), Unterschrift nur bei eigenem Dateinamen", () => {
    const offen = chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", { msgtype: "m.image", body: "baum.jpg", url: "mxc://x/abc", info: { mimetype: "image/jpeg", w: 800, h: 600, size: 1234 } }));
    expect(offen).toMatchObject({ art: "bild", mxc: "mxc://x/abc", datei: null, name: "baum.jpg", text: "", breite: 800, hoehe: 600 });
    const zu = chatNachricht(msg("2", "@tom:x", "2026-09-19T08:00:00Z", { msgtype: "m.image", body: "Eiche am Tor", filename: "IMG_1.jpg", file: { url: "mxc://x/def", key: {}, iv: "a", hashes: {} } }));
    expect(zu).toMatchObject({ art: "bild", mxc: "mxc://x/def", name: "IMG_1.jpg", text: "Eiche am Tor" });
    expect(zu.datei).toBeTruthy();
  });
  it("gelöscht und unlesbar bekommen eine Platzhalterzeile statt zu verschwinden", () => {
    expect(chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", {}, { geloescht: true })).art).toBe("geloescht");
    expect(chatNachricht({ ...msg("2", "@tom:x", "2026-09-19T08:00:00Z", {}), typ: "m.room.encrypted" }).art).toBe("unlesbar");
    expect(chatNachricht(msg("3", "@tom:x", "2026-09-19T08:00:00Z", txt("x"), { unlesbar: true })).art).toBe("unlesbar");
  });
  it("Bearbeitungsereignisse und Reaktionen sind keine eigene Zeile", () => {
    expect(chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", txt("* neu", { "m.relates_to": { rel_type: "m.replace", event_id: "0" } })))).toBe(null);
    expect(chatNachricht({ id: "2", typ: "m.reaction", sender: "@tom:x", ts: 1, inhalt: {} })).toBe(null);
  });
  it("Beitritt, Verlassen, Rauswurf, Umbenennung", () => {
    const m = (inhalt, vorher, sender = "@tom:x") => chatNachricht({ id: "m", typ: "m.room.member", sender, stateKey: "@tom:x", ts: 1, inhalt, vorher });
    expect(m({ membership: "join", displayname: "Tom" }, { membership: "invite" }).text).toBe("Tom ist beigetreten");
    expect(m({ membership: "leave" }, { membership: "join", displayname: "Tom" }).text).toBe("Tom hat den Raum verlassen");
    expect(m({ membership: "leave" }, { membership: "join", displayname: "Tom" }, "@max:x").text).toBe("Tom wurde entfernt");
    expect(m({ membership: "join", displayname: "Thomas" }, { membership: "join", displayname: "Tom" }).text).toBe("Tom heißt jetzt Thomas");
    // Nur das Profilbild geändert — keine Zeile wert.
    expect(m({ membership: "join", displayname: "Tom", avatar_url: "mxc://x/1" }, { membership: "join", displayname: "Tom" })).toBe(null);
  });
});

describe("Kurztext und Vorschau", () => {
  const bild = chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", { msgtype: "m.image", body: "a.jpg", url: "mxc://x/a" }));
  it("Medien bekommen ein Sinnbild", () => {
    expect(chatKurztext(bild)).toBe("📷 Foto");
    expect(chatKurztext(chatNachricht(msg("2", "@tom:x", "2026-09-19T08:00:00Z", { msgtype: "m.file", body: "Angebot.pdf", url: "mxc://x/b" })))).toBe("📎 Angebot.pdf");
  });
  it("»Du:« für Eigenes, Vorname in Gruppen, nichts davor im Direktchat", () => {
    const n = chatNachricht(msg("1", "@tom:x", "2026-09-19T08:00:00Z", txt("Bin  da\nin 5 min")));
    expect(chatVorschau(n, "@tom:x")).toBe("Du: Bin da in 5 min");
    expect(chatVorschau(n, "@max:x")).toBe("Tom: Bin da in 5 min");
    expect(chatVorschau(n, "@max:x", { direkt: true })).toBe("Bin da in 5 min");
  });
});

describe("Zeit", () => {
  const JETZT = T("2026-09-19T10:00:00Z");
  it("Uhrzeit in deutscher Schreibweise und Ortszeit", () => {
    expect(chatUhrzeit(T("2026-09-19T06:05:00Z"), ZONE)).toBe("08:05");
  });
  it("Heute, Gestern, Wochentag, mit Jahr nur bei anderem Jahr", () => {
    expect(chatTagesTitel(T("2026-09-19T06:00:00Z"), JETZT, ZONE)).toBe("Heute");
    expect(chatTagesTitel(T("2026-09-18T21:00:00Z"), JETZT, ZONE)).toBe("Gestern");
    expect(chatTagesTitel(T("2026-09-16T10:00:00Z"), JETZT, ZONE)).toBe("Mittwoch, 16. September");
    expect(chatTagesTitel(T("2025-12-24T10:00:00Z"), JETZT, ZONE)).toBe("Mittwoch, 24. Dezember 2025");
  });
  it("der Tageswechsel folgt der Ortszeit, nicht UTC", () => {
    // 22:30 UTC am 18. ist in Berlin schon der 19.
    expect(chatTagesTitel(T("2026-09-18T22:30:00Z"), JETZT, ZONE)).toBe("Heute");
  });
  it("Raumliste: Uhrzeit, Gestern, Datum", () => {
    expect(chatListenZeit(T("2026-09-19T06:05:00Z"), JETZT, ZONE)).toBe("08:05");
    expect(chatListenZeit(T("2026-09-18T12:00:00Z"), JETZT, ZONE)).toBe("Gestern");
    expect(chatListenZeit(T("2026-09-01T12:00:00Z"), JETZT, ZONE)).toBe("01.09.26");
    expect(chatListenZeit(0, JETZT, ZONE)).toBe("");
  });
});

describe("chatZeitleiste", () => {
  const JETZT = T("2026-09-19T10:00:00Z");
  const roh = [
    msg("1", "@tom:x", "2026-09-18T08:00:00Z", txt("Moin")),
    msg("2", "@tom:x", "2026-09-18T08:02:00Z", txt("Bin am Hof")),
    msg("3", "@tom:x", "2026-09-18T08:20:00Z", txt("Noch da?")),
    { id: "4", typ: "m.reaction", sender: "@max:x", ts: T("2026-09-18T08:21:00Z"), inhalt: {} },
    msg("5", "@max:x", "2026-09-19T07:00:00Z", txt("> <@tom:x> Noch da?\n\nJa", { "m.relates_to": { "m.in_reply_to": { event_id: "3" } } })),
  ];
  const z = chatZeitleiste(roh, { ich: "@max:x", jetzt: JETZT, zone: ZONE });
  it("setzt Tagestrenner und lässt Unsichtbares weg", () => {
    expect(z.map((x) => x.typ)).toEqual(["tag", "nachricht", "nachricht", "nachricht", "tag", "nachricht"]);
    expect(z[0].titel).toBe("Gestern");
    expect(z[4].titel).toBe("Heute");
  });
  it("gruppiert denselben Absender binnen fünf Minuten", () => {
    expect(z.filter((x) => x.typ === "nachricht").map((x) => x.kopf)).toEqual([true, false, true, true]);
  });
  it("kennzeichnet Eigenes und löst das Antwort-Zitat auf", () => {
    const antwort = z[5];
    expect(antwort).toMatchObject({ eigen: true, text: "Ja", zitat: { name: "Tom Aushilfe", text: "Noch da?" } });
    expect(z[1].eigen).toBe(false);
  });
  it("ein Zitat auf eine nicht geladene Nachricht bleibt ein Zitat", () => {
    const solo = chatZeitleiste([roh[4]], { ich: "@max:x", jetzt: JETZT, zone: ZONE });
    expect(solo[1].zitat).toEqual({ name: "", text: "Nachricht" });
  });
  it("eine Systemzeile unterbricht die Gruppe", () => {
    const mit = chatZeitleiste([roh[0], { id: "s", typ: "m.room.encryption", sender: "@max:x", ts: T("2026-09-18T08:01:00Z"), inhalt: {} }, roh[1]], { ich: "@max:x", jetzt: JETZT, zone: ZONE });
    expect(mit.map((x) => x.typ)).toEqual(["tag", "nachricht", "system", "nachricht"]);
    expect(mit[3].kopf).toBe(true);
  });
  it("verträgt Unsinn", () => {
    expect(chatZeitleiste(null)).toEqual([]);
    expect(chatZeitleiste([null, 5, {}])).toEqual([]);
  });
});

describe("chatRaumListe", () => {
  const R = (id, rest = {}) => ({ id, name: id, mitgliedschaft: "join", letzteTs: 0, ungelesen: 0, ...rest });
  const raeume = [
    R("!belege", { name: "Blattwerk Belege", letzteTs: 10 }), R("!besprechung", { name: "Besprechungen", letzteTs: 30, ungelesen: 2 }),
    R("!telefon", { letzteTs: 99 }), R("!space", { istSpace: true }), R("!privat", { name: "SPD Musterstadt", letzteTs: 50 }),
    R("!dm", { name: "Tom", direkt: true, direktMit: "@tom:x", letzteTs: 20 }), R("!wa", { name: "Tante Erna (WA)", direkt: true, direktMit: "@whatsapp_49:x", letzteTs: 60 }), R("!neu", { name: "Neuer Raum", mitgliedschaft: "invite" }), R("!weg", { mitgliedschaft: "leave" }),
  ];
  const opt = { kinder: ["!belege", "!besprechung", "!telefon"], mitglieder: ["@tom:x", "@max:x"], telefonRaum: "!telefon" };
  it("zeigt Space-Räume und Direktchats mit Kollegen — nicht den ☎-Raum, keine Spaces, keine privaten Chats", () => {
    // "!wa" ist ein privater Brücken-Chat desselben Kontos, "!neu" eine Einladung von außerhalb.
    expect(chatRaumListe(raeume, opt).map((r) => r.id)).toEqual(["!besprechung", "!dm", "!belege"]);
  });
  it("eine Einladung in einen Space-Raum steht ganz oben", () => {
    expect(chatRaumListe(raeume, { ...opt, kinder: [...opt.kinder, "!neu"] }).map((r) => r.id)[0]).toBe("!neu");
  });
  it("ohne bekannte Space-Kinder lieber alle beigetretenen Räume als eine leere Liste", () => {
    expect(chatRaumListe(raeume, { telefonRaum: "!telefon" }).map((r) => r.id)).toEqual(["!neu", "!wa", "!privat", "!besprechung", "!dm", "!belege"]);
  });
  it("Suche nach dem Raumnamen", () => {
    expect(chatRaumListe(raeume, { ...opt, suche: "beleg" }).map((r) => r.id)).toEqual(["!belege"]);
  });
  it("Marke am Reiter: Ungelesenes plus offene Einladungen", () => {
    expect(chatUngelesenGesamt(chatRaumListe(raeume, { ...opt, kinder: [...opt.kinder, "!neu"] }))).toBe(3);
    expect([chatMarke(0), chatMarke(7), chatMarke(120)]).toEqual(["", "7", "99+"]);
  });
});

describe("chatOrdnerBilden", () => {
  const R = (id, rest = {}) => ({ id, name: id, mitgliedschaft: "join", letzteTs: 0, ungelesen: 0, ...rest });
  const liste = [R("!besprechung", { letzteTs: 30, ungelesen: 2 }), R("!wa1", { name: "Kunde A", letzteTs: 50, ungelesen: 1, vorschau: "Hallo" }), R("!belege", { letzteTs: 10 }), R("!wa2", { name: "Kunde B", mitgliedschaft: "invite" })];
  const ordner = { id: "!waspace", name: "WhatsApp Business" };
  it("fasst die Ordner-Räume zu einem Eintrag zusammen, einsortiert nach letzter Aktivität", () => {
    const aus = chatOrdnerBilden(liste, ["!wa1", "!wa2"], ordner);
    expect(aus.map((r) => r.id)).toEqual(["!waspace", "!besprechung", "!belege"]);
    expect(aus[0]).toMatchObject({ ordner: true, name: "WhatsApp Business", letzteTs: 50, ungelesen: 2, vorschau: "Kunde A: Hallo" });
    expect(aus[0].raeume.map((r) => r.id)).toEqual(["!wa1", "!wa2"]);
    expect(chatUngelesenGesamt(aus)).toBe(4);
  });
  it("ohne Ordner-Räume kein leerer Eintrag", () => {
    expect(chatOrdnerBilden(liste, [], ordner)).toEqual(liste);
    expect(chatOrdnerBilden(liste, ["!gibtsnicht"], ordner)).toEqual(liste);
  });
});

describe("Kleinkram", () => {
  it("Initialen", () => {
    expect([chatInitialen("Tom Aushilfe"), chatInitialen("@max:x"), chatInitialen("Besprechungen"), chatInitialen("")]).toEqual(["TA", "MX", "B", "?"]);
  });
  it("Farbe ist je Person fest und kommt aus der Palette", () => {
    expect(chatFarbe("@tom:x")).toBe(chatFarbe("@tom:x"));
    expect(chatFarbe("@tom:x")).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("Dateigröße in deutscher Schreibweise", () => {
    expect([chatDateiGroesse(900), chatDateiGroesse(20480), chatDateiGroesse(2.5 * 1024 * 1024)]).toEqual(["900 B", "20 KB", "2,5 MB"]);
  });
  it("Medien laufen über den authentifizierten Endpunkt", () => {
    expect(chatMedienUrl("https://m.x/", "mxc://m.x/abc")).toBe("https://m.x/_matrix/client/v1/media/download/m.x/abc");
    expect(chatMedienUrl("https://m.x", "mxc://m.x/abc", { breite: 320, hoehe: 240 })).toBe("https://m.x/_matrix/client/v1/media/thumbnail/m.x/abc?width=320&height=240&method=scale");
    expect(chatMedienUrl("https://m.x", "https://boese.example/x")).toBe(null);
  });
  it("Nachrichtentyp nach MIME", () => {
    expect(["image/png", "video/mp4", "audio/ogg", "application/pdf", ""].map(chatMsgtypFuer)).toEqual(["m.image", "m.video", "m.audio", "m.file", "m.file"]);
  });
});

describe("chatSasEmojis", () => {
  it("übersetzt die Namen — die Gegenseite zeigt sie in der Sprache ihres Geräts", () => {
    expect(chatSasEmojis([["🔧", "spanner"], ["👍", "thumbs up"], ["💡", "Light Bulb"]])).toEqual([
      { zeichen: "🔧", name: "Schraubenschlüssel" }, { zeichen: "👍", name: "Daumen hoch" }, { zeichen: "💡", name: "Glühbirne" }]);
  });
  it("ein unbekannter Name bleibt stehen, Unsinn ergibt eine leere Liste", () => {
    expect(chatSasEmojis([["🦖", "dinosaur"]])).toEqual([{ zeichen: "🦖", name: "dinosaur" }]);
    expect(chatSasEmojis(null)).toEqual([]);
  });
});

describe("Sync nur für Blattwerk", () => {
  const basis = { space: "!space", kinder: ["!belege", "!besprechung"], mitglieder: ["@tom:x", "@max:x"], telefonRaum: "!telefon",
    direkt: { "@tom:x": ["!dm-tom"], "@whatsapp_49:x": ["!wa1", "!wa2"], "@anna:fremd": ["!dm-anna"] } };
  it("Space, Kinder, ☎-Raum und Direktchats mit Kollegen — keine privaten Chats", () => {
    expect(chatSyncRaeume(basis)).toEqual(["!belege", "!besprechung", "!dm-tom", "!space", "!telefon"]);
  });
  it("ohne erreichbaren Space keine Grenze — lieber langsam als leer", () => {
    expect(chatSyncRaeume({ ...basis, kinder: null })).toBe(null);
    expect(chatSyncRaeume({ ...basis, space: "" })).toBe(null);
  });
  it("verträgt fehlendes m.direct", () => {
    expect(chatSyncRaeume({ ...basis, direkt: undefined })).toEqual(["!belege", "!besprechung", "!space", "!telefon"]);
  });
  it("der Filter lässt Lesebestätigungen durch, Präsenz und Tippanzeige nicht", () => {
    expect(chatSyncFilter(["!a"])).toEqual({ room: { timeline: { limit: 30 }, ephemeral: { types: ["m.receipt"] }, rooms: ["!a"] }, presence: { not_types: ["*"] } });
    expect(chatSyncFilter(null).room.rooms).toBeUndefined();
  });
});


describe("chatBeitrittsRaeume", () => {
  it("nur offene Space-Räume, nie verlassene, nie den Space selbst", () => {
    const baum = [{ room_id: "!s:x", join_rule: "invite" }, { room_id: "!a:x", join_rule: "restricted" }, { room_id: "!b:x", join_rule: "invite" },
      { room_id: "!c:x", join_rule: "restricted" }, { room_id: "!d:x", join_rule: "public" }, { room_id: "!e:x", join_rule: "restricted" }];
    expect(chatBeitrittsRaeume(baum, { "!c:x": "leave", "!e:x": "join" }, "!s:x")).toEqual(["!a:x", "!d:x"]);
  });
});
