// Telefon-Ansicht: Datenseite (src/telefon.js) und Verdrahtung. Der Ablauf
// selbst (Matrix-Raum als Signalisierung, LiveKit als Tonweg, Wahl erst nach
// Beitritt) steht in messenger-hub/docs/runbook-telefonie.md.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  istDtmf,
  istKlingeln,
  KLINGEL_EVENT,
  LK_CALL_ROOM,
  nummerNormalisieren,
  sfuAnfrage,
  TELEFON_RAUM,
} from "../../src/telefon.js";
import { APP_KOSTUEM_CSS, APP_KOSTUEM_JS } from "../../src/chat-proxy.js";

const lies = (datei) => fs.readFileSync(path.join(process.cwd(), datei), "utf8");

describe("istKlingeln", () => {
  const inhalt = { notification_type: "ring" };
  it("erkennt frische Ring-Events", () => {
    expect(istKlingeln(KLINGEL_EVENT, inhalt, 2000)).toBe(true);
  });
  it("ignoriert alte Events aus der Raum-Historie", () => {
    // Beim Element-Start laeuft die Historie noch einmal durch — der letzte
    // echte Anruf von gestern darf die App nicht klingeln lassen.
    expect(istKlingeln(KLINGEL_EVENT, inhalt, 60000)).toBe(false);
  });
  it("ignoriert notification statt ring und fremde Event-Typen", () => {
    expect(istKlingeln(KLINGEL_EVENT, { notification_type: "notification" }, 0)).toBe(false);
    expect(istKlingeln("m.room.message", inhalt, 0)).toBe(false);
  });
});

describe("nummerNormalisieren", () => {
  it("putzt Trenner raus und akzeptiert 0…/+…", () => {
    expect(nummerNormalisieren("0641 580 921 49")).toBe("064158092149");
    expect(nummerNormalisieren("+49 (641) 58092-149")).toBe("+4964158092149");
  });
  it("weist zu kurze oder formfremde Eingaben ab", () => {
    // Der callbot verlangt 0…/+… mit mindestens 6 Ziffern — alles andere
    // wuerde er still ignorieren, die App sagt es lieber vorher.
    expect(nummerNormalisieren("12345")).toBe(null);
    expect(nummerNormalisieren("58092149")).toBe(null);
    expect(nummerNormalisieren("hallo")).toBe(null);
    expect(nummerNormalisieren("")).toBe(null);
  });
});

describe("sfuAnfrage", () => {
  it("baut den Element-Call-Austausch gegen lk-jwt nach", () => {
    const token = { access_token: "t", matrix_server_name: "matrix.example.org" };
    const { url, body } = sfuAnfrage(token, "GERAET1");
    expect(url).toBe("https://lkjwt.example.org/sfu/get");
    // room MUSS die Matrix-Raum-Id sein: lk-jwt hasht selbst. Wer hier den
    // fertigen LiveKit-Namen einsetzt, landet doppelt gehasht allein in
    // einem fremden Raum — der Bot waehlt dann nie (Live-Befund 20.08.).
    expect(body).toEqual({ room: TELEFON_RAUM, openid_token: token, device_id: "GERAET1" });
    expect(body.room).not.toBe(LK_CALL_ROOM);
  });
  it("kennt den im Runbook verifizierten LiveKit-Raumnamen (Log-Abgleich)", () => {
    // sha256-Ableitung aus der Raum-Id, live gemessen — enthaelt einen /.
    expect(LK_CALL_ROOM).toBe("qPBQriBth71wDT9NVLV44J7okfTGDyywKXyg/wOnZIY");
  });
});

describe("istDtmf", () => {
  it("kurze Ziffernfolgen sind Tastentoene, laengere waeren eine neue Wahl", () => {
    expect(istDtmf("2")).toBe(true);
    expect(istDtmf("*21")).toBe(true);
    expect(istDtmf("123456")).toBe(false);
    expect(istDtmf("a")).toBe(false);
  });
});

describe("Verdrahtung", () => {
  it("die Bruecke im Kostuem kennt Raum, Klingel-Event und beide Befehle", () => {
    expect(APP_KOSTUEM_JS).toContain(JSON.stringify(TELEFON_RAUM));
    expect(APP_KOSTUEM_JS).toContain(JSON.stringify(KLINGEL_EVENT));
    expect(APP_KOSTUEM_JS).toContain('"sende"');
    expect(APP_KOSTUEM_JS).toContain('"openid"');
    expect(APP_KOSTUEM_JS).toContain("getOpenIdToken");
  });
  it("der ☎-Raum ist in der Chat-Liste versteckt (eigene Telefon-Ansicht)", () => {
    expect(APP_KOSTUEM_CSS).toContain('aria-label*="Anrufe Festnetz"');
  });
  it("der Chat startet mit der Raumliste und leitet vom ☎-Raum weg", () => {
    // Element stellt sonst den zuletzt offenen Raum wieder her — nach einem
    // Telefonat waere das der ☎-Raum, den der Chat nie zeigen soll.
    expect(APP_KOSTUEM_JS).toContain('location.replace("#/room/" + SPACE)');
    expect(APP_KOSTUEM_JS).toContain('"#/room/" + TELEFON');
  });
  it("der Klingelstrom laeuft ueber den eigenen Server, das Topic bleibt geheim", () => {
    // Stufe 2: server.mjs reicht das geheime ntfy-Topic als /api/anruf/strom
    // durch — der Topic-Name (ANRUF_NTFY_URL) darf NUR aus der Env kommen,
    // und no-transform muss die compression-Middleware vom Puffern abhalten
    // (gepuffert kaeme das Klingeln erst gebuendelt = zu spaet an).
    const srv = lies("server.mjs");
    expect(srv).toContain('"/api/anruf/strom"');
    expect(srv).toContain("ANRUF_NTFY_URL");
    expect(srv).toContain("no-cache, no-transform");
    // Der APK-Dienst haengt an genau diesen Markern aus callbot/ntfy.py.
    const dienst = lies("android-build/app/src/main/java/de/blattwerk/mobile/AnrufDienst.java");
    expect(dienst).toContain('"bw-klingeln"');
    expect(dienst).toContain('"bw-ende"');
    expect(dienst).toContain("/api/anruf/strom");
  });
  it("die App hat den Telefon-Eintrag im Burger-Menue und den Deep-Link", () => {
    const src = lies("dolibarr-app.jsx");
    expect(src).toContain('{ key: "telefon",    icon: "phone",    label: "Telefon"    }');
    expect(src).toContain('window.location.hash === "#telefon"');
    expect(src).toContain("!call ");
    expect(src).toContain('"!stop"');
  });
});
