import { describe, it, expect } from "vitest";
import { versionInfo, instanzenPruefen, versionUrl, versionZeile, versionenHtml } from "../../src/version.js";

describe("Versionsauskunft", () => {
  it("nimmt den Commit von Coolify, kürzt ihn und verrät nichts außer Stand und Kürzel", () => {
    const v = versionInfo({ env: { SOURCE_COMMIT: "d30f62fabcdef0123", DOLIBARR_KEY: "geheim" }, pkgVersion: "1.0.0", mandant: { kuerzel: "xy", name: "Baum Müller" }, gestartet: "2026-09-19T10:00:00Z" });
    expect(v).toEqual({ app: "blattwerk-app", version: "1.0.0", commit: "d30f62f", kuerzel: "xy", gestartet: "2026-09-19T10:00:00Z" });
    expect(JSON.stringify(v)).not.toMatch(/geheim|Müller/);
  });
  it("ohne Commit steht ehrlich 'unbekannt'", () => expect(versionInfo({}).commit).toBe("unbekannt"));
});

describe("Übersicht", () => {
  it("wirft kaputte Einträge weg und kennt zwei Arten", () => {
    const l = instanzenPruefen([{ name: "Blattwerk", url: "https://app.example.org/" }, { name: "Kalender", url: "https://apps.example.org/kalender", art: "manifest" }, { name: "x", url: "file:///etc/passwd" }, null]);
    expect(l.map(versionUrl)).toEqual(["https://app.example.org/api/version", "https://apps.example.org/kalender/manifest.json"]);
    expect(instanzenPruefen("kaputt")).toEqual([]);
  });
  it("erkennt aktuell, veraltet, unbekannt und nicht erreichbar", () => {
    const i = { name: "XY", art: "app" };
    expect(versionZeile(i, { commit: "d30f62f" }, "d30f62fabc").status).toBe("aktuell");
    expect(versionZeile(i, { commit: "1111111" }, "d30f62f").status).toBe("veraltet");
    expect(versionZeile(i, { commit: "unbekannt" }, "d30f62f").status).toBe("unbekannt");
    expect(versionZeile(i, { fehler: "Zeitüberschreitung" }, "d30f62f").status).toBe("nicht erreichbar");
    expect(versionZeile({ name: "Kalender", art: "manifest" }, { versionName: "2.0" }, "x")).toMatchObject({ stand: "2.0", status: "ok" });
  });
  it("die Seite maskiert fremde Angaben", () => {
    expect(versionenHtml([{ name: "<script>", stand: "a", status: "aktuell", hinweis: "" }], "abc")).not.toMatch(/<script>/);
  });
});
