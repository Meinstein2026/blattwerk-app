// Update-Anbindung an apps-alt.example.org/blattwerk — reine Auswertung,
// ohne Netz und ohne Android. Verglichen wird nur der versionCode; versionName
// ist Anzeigetext ("1.10" wäre als String kleiner als "1.9").
import { describe, expect, it } from "vitest";
import {
  UPDATE_BASE_DEFAULT, normalizeUpdateBase, manifestUrl, apkUrl, pruefeManifest,
  updateTag, stillFaellig,
} from "../../src/update.js";

describe("normalizeUpdateBase", () => {
  it.each([
    ["apps-alt.example.org/blattwerk", "https://apps-alt.example.org/blattwerk"],
    ["  apps-alt.example.org/blattwerk  ", "https://apps-alt.example.org/blattwerk"],
    ["https://apps-alt.example.org/blattwerk/", "https://apps-alt.example.org/blattwerk"],
    ["https://apps-alt.example.org/blattwerk///", "https://apps-alt.example.org/blattwerk"],
    ["http://203.0.113.41:8095/blattwerk", "http://203.0.113.41:8095/blattwerk"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("%s -> %s", (eingabe, erwartet) => {
    expect(normalizeUpdateBase(eingabe)).toBe(erwartet);
  });

  it("nimmt https an, wenn kein Schema angegeben ist (Host laeuft hinter NPM mit TLS)", () => {
    expect(normalizeUpdateBase(UPDATE_BASE_DEFAULT)).toMatch(/^https:\/\//);
  });
});

describe("manifestUrl", () => {
  it("haengt manifest.json an", () => {
    expect(manifestUrl("apps-alt.example.org/blattwerk"))
      .toBe("https://apps-alt.example.org/blattwerk/manifest.json");
  });
  it("liefert leer ohne Basis", () => {
    expect(manifestUrl("")).toBe("");
  });
});

describe("apkUrl", () => {
  const base = "apps-alt.example.org/blattwerk";
  it("relativ", () => {
    expect(apkUrl(base, "Blattwerk-1.2.apk"))
      .toBe("https://apps-alt.example.org/blattwerk/Blattwerk-1.2.apk");
  });
  it("relativ mit ./", () => {
    expect(apkUrl(base, "./Blattwerk-1.2.apk"))
      .toBe("https://apps-alt.example.org/blattwerk/Blattwerk-1.2.apk");
  });
  it("absoluter Pfad bleibt auf demselben Host", () => {
    expect(apkUrl(base, "/blattwerk/alt/Blattwerk-1.1.apk"))
      .toBe("https://apps-alt.example.org/blattwerk/alt/Blattwerk-1.1.apk");
  });
  it("vollstaendiger Link bleibt unveraendert", () => {
    expect(apkUrl(base, "https://anderer.host/x.apk")).toBe("https://anderer.host/x.apk");
  });
  it("leer, wenn das Manifest keine APK nennt", () => {
    expect(apkUrl(base, "")).toBe("");
    expect(apkUrl(base, null)).toBe("");
  });
});

describe("pruefeManifest", () => {
  it("meldet ein neueres Paket", () => {
    const r = pruefeManifest({ versionCode: 4, versionName: "1.3", apk: "a.apk", notes: "Neu" }, 3);
    expect(r).toMatchObject({ verfuegbar: true, versionCode: 4, versionName: "1.3", apk: "a.apk", notes: "Neu" });
  });

  it.each([
    [3, 3, "gleiche Version"],
    [2, 3, "aelteres Manifest"],
  ])("versionCode %s bei installiert %s -> kein Update (%s)", (code, jetzt) => {
    expect(pruefeManifest({ versionCode: code, versionName: "x" }, jetzt))
      .toMatchObject({ verfuegbar: false, grund: "aktuell" });
  });

  it("vergleicht NICHT den versionName (1.10 waere als String kleiner als 1.9)", () => {
    const r = pruefeManifest({ versionCode: 10, versionName: "1.10" }, 9);
    expect(r.verfuegbar).toBe(true);
  });

  it.each([
    [{}, "ohne versionCode"],
    [{ versionCode: "abc" }, "unlesbarer versionCode"],
    [{ versionCode: 0 }, "versionCode 0"],
    [null, "kein Objekt"],
    ["kaputt", "String statt Objekt"],
  ])("wirft nicht bei kaputtem Manifest (%#: %s)", (m) => {
    expect(pruefeManifest(m, 3).verfuegbar).toBe(false);
  });

  it("meldet nichts, wenn die eigene Version unbekannt ist (Browser statt APK)", () => {
    expect(pruefeManifest({ versionCode: 99 }, undefined))
      .toMatchObject({ verfuegbar: false, grund: "Eigene Version unbekannt" });
  });
});

// ─── Server-Proxy: interne Ersatz-Origin (09.09.2026) ────────────────────────
// Der Container holt das Manifest serverseitig; ueber den oeffentlichen Namen
// kommt er bei NPM mit der WAN-IP an und die Access-List „Sicherung" sagt 403.
// Deshalb zuerst der nginx `apps-static` direkt (interne Origin), die
// oeffentliche Adresse nur als Rueckfall. Die APK-Adresse fuer das Geraet
// bleibt die oeffentliche — das Geraet laedt selbst.
import { updateManifestZiele } from "../../server.mjs";
import { updateFehlerText } from "../../src/update.js";
import fs from "node:fs";
import path from "node:path";

describe("updateManifestZiele", () => {
  it("interne Origin zuerst, oeffentliche als Rueckfall — Pfad bleibt", () => {
    expect(updateManifestZiele("https://apps-alt.example.org/blattwerk", "http://203.0.113.41:8095")).toEqual([
      "http://203.0.113.41:8095/blattwerk/manifest.json",
      "https://apps-alt.example.org/blattwerk/manifest.json",
    ]);
  });
  it("ohne interne Origin nur die oeffentliche; Schraegstriche werden bereinigt", () => {
    expect(updateManifestZiele("https://apps-alt.example.org/blattwerk/", "")).toEqual([
      "https://apps-alt.example.org/blattwerk/manifest.json",
    ]);
    expect(updateManifestZiele("https://apps-alt.example.org/blattwerk", "http://203.0.113.41:8095/")[0])
      .toBe("http://203.0.113.41:8095/blattwerk/manifest.json");
  });
  it("Endpunkt probiert die Ziele der Reihe nach und nutzt UPDATE_INTERNAL_ORIGIN", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
    const a = src.indexOf('app.get("/api/appupdate/manifest"');
    const ep = src.slice(a, src.indexOf("\napp.", a + 10));
    expect(ep).toMatch(/updateManifestZiele\(/);
    expect(src).toMatch(/UPDATE_INTERNAL_ORIGIN/);
    expect(src).toMatch(/http:\/\/203\.0\.113\.41:8095/);
    expect(ep).toMatch(/for \(const ziel of/);
  });
});

describe("updateFehlerText", () => {
  it("403 bekommt den Hinweis auf LAN/NetBird", () => {
    expect(updateFehlerText("Update-Host antwortet mit 403")).toMatch(/LAN Standort 1|NetBird/);
    expect(updateFehlerText("HTTP 403")).toMatch(/NetBird/);
  });
  it("andere Fehler bleiben, wie sie sind", () => {
    expect(updateFehlerText("HTTP 500")).toBe("HTTP 500");
    expect(updateFehlerText("")).toBe("");
  });
});

// Umzug auf die neue Domain (11.09.2026): der Standard-Update-Ort ist der neue Name.
// Der alte bleibt im NPM auf demselben Proxy-Host erreichbar, damit Geraete mit
// gespeicherter alter Adresse ihr Update weiter finden — deshalb steht er in
// der Allowlist des Servers, aber nicht mehr in der Vorbelegung.
describe("Update-Ort nach dem Umzug", () => {
  it("die Vorbelegung zeigt auf apps.example.org", () => {
    expect(UPDATE_BASE_DEFAULT).toBe("apps.example.org/blattwerk");
    expect(manifestUrl(UPDATE_BASE_DEFAULT)).toBe("https://apps.example.org/blattwerk/manifest.json");
  });
  it("eine gespeicherte alte Adresse bleibt benutzbar", () => {
    expect(manifestUrl("apps-alt.example.org/blattwerk"))
      .toBe("https://apps-alt.example.org/blattwerk/manifest.json");
  });
});

// 11.09.2026: Der stille Check lief bisher nur, wenn die Einstellungen offen
// waren (er steckte im Panel). Jetzt laeuft er beim App-Start — aber hoechstens
// einmal am Tag, sonst meldet sich die App bei jedem Oeffnen.
describe("stillFaellig", () => {
  it("ist faellig, wenn heute noch nicht geschaut wurde", () => {
    expect(stillFaellig(null, "2026-09-11")).toBe(true);
    expect(stillFaellig("2026-09-10", "2026-09-11")).toBe(true);
  });
  it("ist nicht faellig, wenn heute schon geschaut wurde", () => {
    expect(stillFaellig("2026-09-11", "2026-09-11")).toBe(false);
  });
});

describe("updateTag", () => {
  it("baut den Tagesschluessel aus der lokalen Zeit", () => {
    expect(updateTag(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(updateTag(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
