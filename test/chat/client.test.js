// Übersetzung SDK-Objekt → Datensatz (src/chat/client.js) mit Attrappen statt
// Homeserver, plus Quelltextprüfungen für das, was sich nur so sichern lässt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chatRohEreignis, chatRohRaum } from "../../src/chat/client.js";
import { chatNachricht } from "../../src/chat/logik.js";

const quelle = readFileSync(new URL("../../src/chat/client.js", import.meta.url), "utf8");

const ev = (o) => ({
  getId: () => o.id, getType: () => o.typ || "m.room.message", getSender: () => o.sender, sender: o.name ? { name: o.name } : null,
  getTs: () => o.ts || 0, getContent: () => o.inhalt || {}, getPrevContent: () => o.vorher || {}, getStateKey: () => o.stateKey,
  isRedacted: () => !!o.geloescht, isDecryptionFailure: () => !!o.unlesbar, replacingEvent: () => (o.bearbeitet ? {} : null), status: o.status || null,
});
const raum = (o) => ({
  roomId: o.id, name: o.name, getMyMembership: () => o.mitgliedschaft || "join", isSpaceRoom: () => !!o.space,
  hasEncryptionStateEvent: () => !!o.e2ee, getLastActiveTimestamp: () => o.aktiv || 0,
  getUnreadNotificationCount: (art) => (art === "highlight" ? o.erwaehnungen || 0 : o.ungelesen || 0),
  getMxcAvatarUrl: () => null, getLiveTimeline: () => ({ getEvents: () => o.ereignisse || [] }),
});

describe("chatRohEreignis", () => {
  it("übernimmt alles, was die Anzeige-Logik braucht", () => {
    const r = chatRohEreignis(ev({ id: "$1", sender: "@tom:x", name: "Tom", ts: 5, inhalt: { msgtype: "m.text", body: "Moin" }, bearbeitet: true, status: "sending" }));
    expect(r).toMatchObject({ id: "$1", typ: "m.room.message", sender: "@tom:x", senderName: "Tom", ts: 5, bearbeitet: true, status: "sending", geloescht: false, unlesbar: false });
    expect(chatNachricht(r)).toMatchObject({ art: "text", text: "Moin", bearbeitet: true });
  });
  it("ohne Mitgliedsobjekt steht die Kennung als Name da", () => {
    expect(chatRohEreignis(ev({ id: "$1", sender: "@tom:x" })).senderName).toBe("@tom:x");
  });
});

describe("chatRohRaum", () => {
  const ereignisse = [
    ev({ id: "$1", sender: "@tom:x", name: "Tom Aushilfe", ts: 10, inhalt: { msgtype: "m.text", body: "Moin" } }),
    ev({ id: "$2", typ: "m.room.member", sender: "@anna:x", stateKey: "@anna:x", ts: 20, inhalt: { membership: "join", displayname: "Anna" } }),
    ev({ id: "$3", typ: "m.reaction", sender: "@anna:x", ts: 30 }),
  ];
  it("Vorschau und Zeit kommen von der letzten ECHTEN Nachricht, nicht von Beitritt oder Reaktion", () => {
    const r = chatRohRaum(raum({ id: "!a", name: "Besprechungen", ereignisse, ungelesen: 2, e2ee: true, aktiv: 30 }), { ich: "@max:x", direkt: new Map() });
    expect(r).toMatchObject({ id: "!a", name: "Besprechungen", letzteTs: 10, ungelesen: 2, verschluesselt: true, direkt: false, vorschau: "Tom: Moin" });
  });
  it("Direktchat laut m.direct, Vorschau dann ohne Namen", () => {
    const r = chatRohRaum(raum({ id: "!dm", name: "Tom", ereignisse }), { ich: "@max:x", direkt: new Map([["!dm", "@tom:x"]]) });
    expect(r).toMatchObject({ direkt: true, direktMit: "@tom:x", vorschau: "Moin" });
  });
  it("leerer Raum fällt auf die Aktivitätszeit des Servers zurück", () => {
    expect(chatRohRaum(raum({ id: "!leer", name: "Neu", aktiv: 77 }), { ich: "@max:x", direkt: new Map() })).toMatchObject({ letzteTs: 77, vorschau: "" });
  });
});

describe("Verdrahtung, die nur der Quelltext zeigt", () => {
  it("lädt das SDK dynamisch — es darf nicht ins Hauptbundle", () => {
    expect(quelle).toMatch(/import\("matrix-js-sdk"\)/);
    expect(quelle).not.toMatch(/^import .* from "matrix-js-sdk/m);
  });
  it("benutzt eigene Speichernamen — unter demselben Origin liegt Element mit den Standardnamen", () => {
    expect(quelle).toMatch(/dbName: SYNC_DB/);
    expect(quelle).toMatch(/const SYNC_DB = "blattwerk-chat-sync-v2"/);
    expect(quelle).toMatch(/cryptoDatabasePrefix: KRYPTO_PRAEFIX/);
    expect(quelle).toMatch(/const KRYPTO_PRAEFIX = "blattwerk-chat"/);
  });
  it("synchronisiert nur die Blattwerk-Räume — sonst lädt ein großes Konto bei jedem Start minutenlang", () => {
    expect(quelle).toMatch(/filter: s\.Filter\.fromJson\(sitzung\.userId, undefined, chatSyncFilter\(liste\)\)/);
    expect(quelle).toMatch(/hierarchy\?max_depth=2/);
    // Der alte Speicher mit dem ganzen Kontobestand muss weg, sonst wird er weiter geladen.
    expect(quelle).toMatch(/deleteDatabase\(n\)/);
  });
  it("kein Schritt darf ewig hängen: Nebenschritte laufen mit Zeitlimit weiter, Hauptschritte enden mit einer Meldung", () => {
    // Ansage Max: mehr als 15 s sind nicht hinnehmbar — kein Limit darüber.
    expect(quelle).toMatch(/hoechstens\(frisch, 5000, null\)/);
    expect(quelle).toMatch(/mitFrist\(store\.startup\(\), 10000/);
    for (const ms of quelle.match(/mitFrist\([^\n]*?, (\d+), "/g) || []) expect(Number(ms.match(/, (\d+), "$/)[1])).toBeLessThanOrEqual(15000);
    // Die Raumliste kommt aus dem Merker, die Abfrage läuft nebenher.
    expect(quelle).toMatch(/gemerkt \? gemerkt : hoechstens/);
    expect(quelle).toMatch(/mitFrist\(client\.initRustCrypto\(/);
    // Jeder Schritt wird gemeldet — die Release-APK hat kein Konsolen-Log, der Bildschirm ist die einzige Diagnose.
    expect(quelle.match(/schritt\("/g).length).toBeGreaterThanOrEqual(4);
  });
  it("das Zurücksetzen fasst nur die eigenen Speicher an, nie die von Element", () => {
    expect(quelle).toMatch(/filter\(\(n\) => \/blattwerk-chat\/\.test\(n \|\| ""\)\)/);
  });
  it("startet den Speicher erst NACH createClient — das SDK weist es sonst ab dem zweiten Start ab", () => {
    expect(quelle.indexOf("s.createClient(")).toBeGreaterThan(-1);
    expect(quelle.indexOf("s.createClient(")).toBeLessThan(quelle.indexOf("store.startup()"));
    expect(quelle.indexOf("store.startup()")).toBeLessThan(quelle.indexOf("client.initRustCrypto("));
  });
  it("legt nie stillschweigend neue Cross-Signing-Schlüssel an", () => {
    // bootstrapCrossSigning({}) erzeugt NEUE Schlüssel, wenn weder lokal noch im
    // Geheimnisspeicher welche liegen — das entwertet alle anderen Geräte.
    const fn = quelle.slice(quelle.indexOf("export async function chatMitSchluesselVerifizieren"));
    expect(fn.indexOf('isStored("m.cross_signing.master")')).toBeGreaterThan(-1);
    expect(fn.indexOf('isStored("m.cross_signing.master")')).toBeLessThan(fn.indexOf("k.bootstrapCrossSigning("));
    // Einzige Ausnahme: die Ersteinrichtung frischer Konten — und die nur HINTER
    // der Prüfung, dass das Konto weder Cross-Signing noch Geheimnisspeicher hat.
    expect(quelle.match(/setupNewCrossSigning/g)).toHaveLength(1);
    const erst = quelle.slice(quelle.indexOf("export async function chatErsteinrichten"));
    expect(erst.indexOf("userHasCrossSigningKeys(")).toBeGreaterThan(-1);
    expect(erst.indexOf("secretStorage.hasKey()")).toBeLessThan(erst.indexOf("setupNewCrossSigning"));
    expect(erst.indexOf("userHasCrossSigningKeys(")).toBeLessThan(erst.indexOf("setupNewCrossSigning"));
  });
  it("Emoji-Abgleich: nimmt nur Anfragen der EIGENEN Geräte an und startet SAS nur, wenn die App gefragt hat", () => {
    expect(quelle).toMatch(/if \(!anfrage\.isSelfVerification \|\| abgleich\) return;/);
    // Starten beide Seiten, verliert eine — das andere Gerät stößt an, wenn ES gefragt hat.
    expect(quelle).toMatch(/VerificationPhase\.Ready && anfrage\.initiatedByMe && !abgleich\.gestartet/);
    expect(quelle).toMatch(/startVerification\("m\.sas\.v1"\)/);
    // Der Sicherungsschlüssel kommt erst NACH dem Abgleich vom anderen Gerät.
    expect(quelle).toMatch(/KeyBackupDecryptionKeyCached, \(\) => \{ sicherungNachziehen\(\); \}/);
  });
  it("verschlüsselt Anhänge in verschlüsselten Räumen vor dem Hochladen", () => {
    const fn = quelle.slice(quelle.indexOf("export async function chatDateiSenden"), quelle.indexOf("export async function chatLoeschen"));
    expect(fn).toMatch(/hasEncryptionStateEvent\(\)/);
    expect(fn.indexOf("encryptAttachment(")).toBeLessThan(fn.indexOf("uploadContent("));
  });
  it("holt Medien mit Zugriffstoken und gibt den ☎-Raum an die Telefon-Ansicht weiter", () => {
    expect(quelle).toMatch(/Authorization: `Bearer \$\{client\.getAccessToken\(\)\}`/);
    expect(quelle).toMatch(/raum\.roomId !== TELEFON_RAUM/);
    expect(quelle).toMatch(/KLINGEL_EVENT/);
  });
});
