// Chat-Tab: Element-Web wird von server.mjs unter /chat/ same-origin
// durchgereicht (src/chat-proxy.js). Die Tests sichern die Header-Regeln,
// das Einbauen des "Zur App"-Knopfs und die Verdrahtung in App und Config.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  APP_KOSTUEM_CSS,
  APP_KOSTUEM_JS,
  APP_KOSTUEM_PFAD,
  APP_RUECKKEHR_JS,
  APP_RUECKKEHR_PFAD,
  BLATTWERK_SPACE,
  chatAnfrageHeader,
  chatAntwortHeader,
  chatIndexUmschreiben,
  chatIstIndex,
} from "../../src/chat-proxy.js";

const lies = (datei) => fs.readFileSync(path.join(process.cwd(), datei), "utf8");

describe("chatAntwortHeader", () => {
  it("laesst Cache-Header durch und wirft Verbindungs-Header weg", () => {
    const header = chatAntwortHeader(Object.entries({
      "ETag": '"abc"',
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
      "Content-Length": "4767",
    }));
    expect(header).toEqual({ ETag: '"abc"', "Cache-Control": "no-cache" });
  });
});

describe("chatAnfrageHeader", () => {
  it("reicht nur Inhalts- und Bedingungs-Header weiter", () => {
    const weiter = chatAnfrageHeader({
      "accept": "text/html",
      "if-none-match": '"abc"',
      "accept-encoding": "gzip",
      "cookie": "authentik_session=geheim",
      "authorization": "Bearer geheim",
    });
    // accept-encoding bleibt draussen (Kompression macht die App selbst),
    // Cookies/Auth gehen den Element-Container nichts an.
    expect(weiter).toEqual({ accept: "text/html", "if-none-match": '"abc"' });
  });
});

describe("chatIndexUmschreiben", () => {
  it("haengt Kostuem in den Kopf und das Rueckkehr-Skript vor </body>", () => {
    const raus = chatIndexUmschreiben("<html><head>k</head><body>x</body></html>");
    expect(raus).toBe(
      `<html><head>k<style>${APP_KOSTUEM_CSS}</style><script src="${APP_KOSTUEM_PFAD}"></script></head>` +
      `<body>x<script src="${APP_RUECKKEHR_PFAD}"></script></body></html>`,
    );
  });

  it("kommt auch ohne </head>/</body> nicht ohne die Einschuebe aus", () => {
    const raus = chatIndexUmschreiben("<html>x");
    expect(raus).toContain(APP_RUECKKEHR_PFAD);
    expect(raus).toContain(APP_KOSTUEM_PFAD);
  });

  it("das Rueckkehr-Skript zeigt den Knopf nur in der Vollbild-Fassung", () => {
    // Im iframe (App-Tab) darf kein zweiter Rueckweg auftauchen.
    expect(APP_RUECKKEHR_JS).toContain("window.self !== window.top");
  });

  it("das Kostuem nagelt den Space Blattwerk fest und versteckt die Space-Leiste", () => {
    // Elements SpaceStore liest mx_active_space als ROHEN Raum-Id-String beim
    // Booten (im Bundle verifiziert: getItem(P) ohne JSON.parse) — deshalb
    // muss der Wert unzitiert im localStorage stehen.
    expect(APP_KOSTUEM_JS).toContain(`var SPACE = ${JSON.stringify(BLATTWERK_SPACE)}`);
    expect(APP_KOSTUEM_JS).toContain('localStorage.setItem("mx_active_space", SPACE)');
    // Die Space-Startseite laeuft unter #/room/<Space-Id> und zaehlt als
    // Liste — sonst versteckt der Raum-Modus die Raumliste (schwarzer Chat).
    expect(APP_KOSTUEM_JS).toContain('h.indexOf(SPACE) < 0');
    expect(APP_KOSTUEM_CSS).toContain(".mx_SpacePanel");
  });
});

describe("chatIstIndex", () => {
  it("trifft nur die HTML-Wurzel", () => {
    expect(chatIstIndex("/", "text/html")).toBe(true);
    expect(chatIstIndex("/index.html", "text/html; charset=utf-8")).toBe(true);
    expect(chatIstIndex("/jitsi.html", "text/html")).toBe(false);
    expect(chatIstIndex("/", "application/json")).toBe(false);
  });
});

describe("Verdrahtung", () => {
  it("server.mjs bedient /chat vor dem SPA-Fallback", () => {
    const src = lies("server.mjs");
    const chat = src.indexOf('app.use("/chat"');
    const statisch = src.indexOf("Statisches Frontend");
    expect(chat).toBeGreaterThan(-1);
    expect(chat).toBeLessThan(statisch);
  });

  it("der Service Worker laesst /chat-Navigationen in Ruhe", () => {
    // Ohne den Denylist-Eintrag beantwortet der SW die iframe-Navigation
    // mit der App-Shell — im Chat-Tab laedt dann die App statt Element.
    expect(lies("vite.config.js")).toContain("/^\\/chat(\\/|$)/");
  });

  it("die App zeigt Element nicht mehr im iframe — der Proxy bleibt als Notausgang", () => {
    // Seit 19.09.2026 ist der Chat nativ (src/ui/ChatPage.jsx, siehe
    // test/chat/verdrahtung.test.js). /chat/ bedient nur noch „In Element
    // öffnen" und die einmalige Schlüssel-Übernahme.
    const src = lies("dolibarr-app.jsx");
    expect(src).toContain('{ key: "chat",       icon: "chat",     label: "Chat"       }');
    expect(src).not.toContain('src="/chat/"');
    expect(src).not.toMatch(/<iframe[^>]*Blattwerk Chat/);
  });
});
