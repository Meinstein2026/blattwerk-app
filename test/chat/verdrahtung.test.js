// Nativer Chat: was sich nur am Quelltext sichern lässt. Ansage Max
// 19.09.2026: „Element direkt fest einbinden, nicht als Bild im Bild".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lies = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), "utf8");
const app = lies("dolibarr-app.jsx");
const seite = lies("src/ui/ChatPage.jsx");

describe("App-Seite", () => {
  it("bindet die native Chat-Seite ein und reicht Meldungen und die Ungelesen-Zahl durch", () => {
    expect(app).toMatch(/import ChatBereich from "\.\/src\/ui\/ChatPage\.jsx"/);
    expect(app).toMatch(/<ChatBereich sichtbar=\{[^}]+\} showToast=\{showToast\} onUngelesen=\{setChatUngelesen\} \/>/);
  });
  it("tauscht den loginToken sofort und nimmt ihn aus der Adresszeile", () => {
    const i = app.indexOf("chatLoginTokenAusUrl(window.location.href)");
    expect(i).toBeGreaterThan(-1);
    const block = app.slice(i, i + 700);
    expect(block.indexOf("replaceState")).toBeGreaterThan(-1);
    // Erst aufräumen, dann tauschen: scheitert der Tausch, darf das verbrauchte
    // Token nicht in der Adresse stehen bleiben (Neuladen = zweiter Fehlversuch).
    expect(block.indexOf("replaceState")).toBeLessThan(block.indexOf("chatMitTokenAnmelden("));
    expect(block).toMatch(/chatSitzungMerken\(localStorage, sitzung\)/);
  });
  it("der Chat steckt im Menü — die Marke steht deshalb am Menü-Knopf UND am Eintrag", () => {
    expect(app.match(/nav-marke/g).length).toBeGreaterThanOrEqual(4);
    expect(app).toMatch(/m\.key === "chat" && chatUngelesen > 0/);
  });
  it("das Telefon spricht direkt mit dem Chat-Client, nicht mehr per postMessage mit einem iframe", () => {
    expect(app).toMatch(/chatTelefonSenden\(daten\.text\)/);
    expect(app).toMatch(/chatOpenId\(\)/);
    expect(app).toMatch(/return chatTelefonAbonnieren\(horche\)/);
    expect(app).not.toMatch(/iframe\[title="Blattwerk Chat"\]/);
    expect(app).not.toMatch(/ziel: "bw-telefon"/);
  });
});

describe("Chat-Seite", () => {
  it("rendert keinen iframe und kein HTML aus Nachrichten", () => {
    expect(seite).not.toMatch(/<iframe/);
    // formatted_body ist fremdes HTML — angezeigt wird nur der Klartext mit Links.
    expect(seite).not.toMatch(/dangerouslySetInnerHTML|formatted_body/);
    expect(seite).toMatch(/rel="noopener noreferrer"/);
  });
  it("ein Tipp auf die Nachricht öffnet die Aktionen, statt vom Verlauf sofort wieder geschlossen zu werden", () => {
    expect(seite).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); onTipp\(z\.id\); \}\}/);
    expect(seite).toMatch(/className="chat-aktionen" onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
  it("zeigt beim Start sofort die Liste vom letzten Mal — ohne Vorschau aus verschlüsselten Räumen im localStorage", () => {
    expect(seite).toMatch(/stand\.phase !== "bereit" && gemerkt\.length/);
    expect(seite).toMatch(/vorschau: r\.verschluesselt \? "" : r\.vorschau/);
    // Abmelden räumt sie weg — sonst sähe die nächste Person am Gerät fremde Raumnamen.
    expect(seite).toMatch(/localStorage\.removeItem\(LISTE_KEY\)/);
  });
  it("bleibt unsichtbar eingehängt, statt beim Reiterwechsel den Client zu verlieren", () => {
    expect(seite).toMatch(/display: sichtbar \? "flex" : "none"/);
  });
  it("zeigt den ☎-Raum nicht und beschränkt sich auf den Blattwerk-Space", () => {
    expect(seite).toMatch(/nurSpace = true/);
    expect(app).not.toMatch(/nurSpace/);          // die App schaltet die Grenze nie ab
    expect(seite).toMatch(/chatRaumListe\(chatRaeume\(\), \{ kinder: nurSpace \? chatSpaceKinder\(\) : \[\], mitglieder: chatSpaceMitglieder\(\), telefonRaum: TELEFON_RAUM/);
  });
  it("übernimmt die Schlüssel einmal von selbst und bietet sonst den Sicherheitsschlüssel an", () => {
    expect(seite).toMatch(/elementSitzungPasst\(localStorage, sitzung\.userId\) && !uebernahmeErledigt\(localStorage, sitzung\.deviceId\)/);
    expect(seite).toMatch(/chatMitSchluesselVerifizieren\(schluessel\)/);
    // Der Versuch wird auch im Fehlerfall gemerkt — sonst lädt jeder App-Start
    // 45 s lang ein unsichtbares Element.
    const fn = seite.slice(seite.indexOf("const ausElement = useCallback"), seite.indexOf("// Einmal je Gerät von selbst"));
    expect(fn).toMatch(/finally \{ uebernahmeMerken\(localStorage, sitzung\.deviceId\)/);
  });
  it("speichert Dateien über den eigenen Server — die APK-Hülle kann keine blob:-Adressen laden", () => {
    expect(seite).toMatch(/\/api\/datei\/ablegen/);
  });
  it("Element bleibt als Notausgang erreichbar", () => {
    expect(seite).toMatch(/window\.location\.assign\("\/chat\/"\)/);
  });
});

describe("Auslieferung", () => {
  it("SDK und Krypto-WASM liegen nicht im Vorab-Cache, sondern kommen bei Bedarf", () => {
    const vite = lies("vite.config.js");
    expect(vite).toMatch(/globIgnores: \[[^\]]*browser-index-\*\.js[^\]]*matrix_sdk_crypto_wasm/);
    expect(vite).toMatch(/urlPattern: [^\n]*matrix_sdk_crypto_wasm\|browser-index/);
  });
});
