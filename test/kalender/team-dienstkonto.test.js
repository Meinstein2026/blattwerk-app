// Der Team-Kalender soll ohne Anmeldung am Gerät da sein: der Server setzt die
// Zugangsdaten selbst ein. Entscheidend ist dabei, dass das Passwort des
// Dienstkontos den Server NIE verlässt — es ist das Besitzer-Konto des
// Team-Kalenders, wer es hat, kann den Kalender löschen. (07.08.2026)
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ncBody, ncManaged, ncTeamCreds } from "../../server.mjs";

const TEAM = {
  SSO_NC_TEAM_USER: "blattwerk-kalender",
  SSO_NC_TEAM_PASS: "geheim",
  SSO_NC_TEAM_CAL: "https://nextcloud.example.org/remote.php/dav/calendars/blattwerk-kalender/blattwerk/",
};
const setTeamEnv = () => Object.assign(process.env, TEAM);
const clearTeamEnv = () => Object.keys(TEAM).forEach((k) => delete process.env[k]);
/** Anfrage wie sie beim Server ankommt: nur vom NPM (.30) gilt der Header. */
const req = (body, { user = "max", ip = "203.0.113.30" } = {}) => ({
  body,
  socket: { remoteAddress: ip },
  headers: user ? { "x-authentik-username": user } : {},
});

afterEach(clearTeamEnv);

describe("ncTeamCreds", () => {
  it("liefert nichts, solange das Dienstkonto nicht konfiguriert ist", () => {
    expect(ncTeamCreds()).toBe(null);
  });

  it("liefert nichts bei halber Konfiguration — lieber gar kein Zugang als ein kaputter", () => {
    process.env.SSO_NC_TEAM_USER = TEAM.SSO_NC_TEAM_USER;
    expect(ncTeamCreds()).toBe(null);
  });

  it("haengt an die Kalenderadresse den Schraegstrich an (CalDAV-Sammlung)", () => {
    setTeamEnv();
    process.env.SSO_NC_TEAM_CAL = TEAM.SSO_NC_TEAM_CAL.replace(/\/$/, "");
    expect(ncTeamCreds().calendarUrl).toBe(TEAM.SSO_NC_TEAM_CAL);
  });
});

describe("ncManaged", () => {
  it("gibt ohne Authentik-Identitaet nichts heraus", () => {
    setTeamEnv();
    expect(ncManaged(req({}, { user: null }))).toBe(null);
  });

  it("vertraut dem Header nur vom bekannten Proxy — sonst waere er faelschbar", () => {
    setTeamEnv();
    expect(ncManaged(req({}, { ip: "198.51.100.99" }))).toBe(null);
  });

  it("liefert dem angemeldeten Nutzer das Dienstkonto", () => {
    setTeamEnv();
    expect(ncManaged(req({})).user).toBe("blattwerk-kalender");
  });
});

describe("ncBody", () => {
  it("setzt die Zugangsdaten ein, wenn das Geraet keine hat", () => {
    setTeamEnv();
    const out = ncBody(req({ calendarUrl: "egal" }));
    expect(out.user).toBe("blattwerk-kalender");
    expect(out.pass).toBe("geheim");
    expect(out.calendarUrl).toBe("egal"); // nur die Zugangsdaten, nicht die Auswahl
  });

  it("laesst ein Geraet mit eigenem Nextcloud-Konto unangetastet", () => {
    setTeamEnv();
    const out = ncBody(req({ user: "erika.beispiel", pass: "eigenes" }));
    expect(out.user).toBe("erika.beispiel");
    expect(out.pass).toBe("eigenes");
  });

  it("gibt ohne Authentik-Identitaet nichts heraus", () => {
    setTeamEnv();
    const out = ncBody(req({ calendarUrl: "egal" }, { user: null }));
    expect(out.pass).toBeUndefined();
  });

  it("reicht ohne konfiguriertes Dienstkonto einfach durch", () => {
    const out = ncBody(req({ calendarUrl: "egal" }));
    expect(out.pass).toBeUndefined();
  });
});

describe("/api/sso/config", () => {
  it("gibt das Passwort NICHT heraus", () => {
    // Der Kern der Sache: die App soll den Kalender kennen, nicht aufsperren.
    const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
    const a = src.indexOf('app.get("/api/sso/config"');
    // Kommentare raus — sonst schlaegt der Hinweis "ohne pass" selbst an.
    const block = src.slice(a, src.indexOf("app.post(", a))
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(block).toContain("nextcloud: nc ?");
    expect(block).not.toMatch(/\bpass\b/);
  });
});

describe("App: Zugang ohne Passwort", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  // `eval` ist hier unbedenklich und Absicht: ausgewertet wird ausschliesslich
  // eine Zeile aus der eigenen Quelldatei im Repo (fester Pfad, keine Eingabe
  // von aussen) — dieselbe Technik wie das vm.runInContext in sso.test.js. Die
  // Alternative waere, die Helfer aus der 8000-Zeilen-JSX zu exportieren, was
  // ein Bundling-Setup fuer die Tests noetig machen wuerde.
  const grab = (name) => {
    const line = src.split("\n").find((l) => l.startsWith(`const ${name} = (c) =>`));
    if (!line) throw new Error(name + " nicht gefunden");
    return eval("(" + line.replace(`const ${name} = `, "").replace(/;\s*$/, "") + ")");
  };
  const ncReady = grab("ncReady");
  const ncHasAccess = grab("ncHasAccess");
  const managed = { enabled: true, managed: true, server: "https://nc", user: "blattwerk-kalender", pass: "", calendarUrl: "https://nc/cal/" };

  it("erkennt den serverseitigen Zugang als verbunden", () => {
    expect(ncReady(managed)).toBe(true);
    expect(ncHasAccess(managed)).toBe(true);
  });

  it("verlangt ohne `managed` weiterhin ein Passwort", () => {
    expect(ncReady({ ...managed, managed: false })).toBe(false);
    expect(ncHasAccess({ ...managed, managed: false })).toBe(false);
  });

  it("bleibt bei eigenem Konto mit Passwort verbunden", () => {
    const eigen = { ...managed, managed: false, pass: "eigenes" };
    expect(ncReady(eigen)).toBe(true);
    expect(ncHasAccess(eigen)).toBe(true);
  });

  it("gilt ohne gewaehlten Kalender nicht als kalenderbereit, aber als zugriffsfaehig", () => {
    // Belege und GBU-Archiv brauchen nur den Zugang, keinen Kalender.
    const ohneKalender = { ...managed, calendarUrl: "" };
    expect(ncReady(ohneKalender)).toBe(false);
    expect(ncHasAccess(ohneKalender)).toBe(true);
  });
});

describe("Uebernahme beim Start", () => {
  // Beim allerersten Start legt die App einen Eintrag an, der nur die
  // vorbefuellte Server-Adresse enthaelt. Prueft man auf "noch nichts
  // gespeichert", blockiert genau dieser Eintrag den Team-Kalender fuer immer.
  const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const line = src.split("\n").find((l) => l.includes("const leer ="));

  it("stuetzt sich nicht mehr auf das blosse Vorhandensein des Eintrags", () => {
    expect(src).not.toContain('if (!localStorage.getItem("blattwerk_nextcloud"))');
  });

  it("haelt einen Eintrag mit blosser Server-Adresse fuer leer", () => {
    expect(line).toBeTruthy();
    const leer = (v) => eval("(" + line.replace("const leer =", "").replace(/;\s*$/, "").replace(/vorhanden/g, "v") + ")");
    expect(leer({ server: "https://nc" })).toBe(true);
  });

  it("laesst eine angefangene eigene Anmeldung und den Team-Kalender in Ruhe", () => {
    const leer = (v) => eval("(" + line.replace("const leer =", "").replace(/;\s*$/, "").replace(/vorhanden/g, "v") + ")");
    expect(leer({ server: "https://nc", user: "erika.beispiel", pass: "eigenes" })).toBe(false);
    expect(leer({ server: "https://nc", calendarUrl: "https://nc/cal/" })).toBe(false);
    expect(leer({ server: "https://nc", managed: true })).toBe(false);
  });
});

describe("Abfrage haengt nicht am Dolibarr-Zugang", () => {
  // Der Kalender kam erst dazu, nachdem der Dolibarr-Zugang schon stand. Solange
  // die Abfrage bei vorhandenem Zugang abbrach, wurde er nie nachgeholt.
  const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const a = src.indexOf('apiFetch("/api/sso/config")');
  // Bis zum naechsten Effekt, nicht bis `const logout`: dazwischen steht seit
  // dem Arbeitsschutz-Umbau der taegliche Abgleich der Einweisungsfristen.
  const block = src.slice(Math.max(0, a - 900), src.indexOf("// Stand der Einweisungen", a));

  it("bricht nicht mehr ab, nur weil ein Dolibarr-Zugang existiert", () => {
    expect(block).not.toContain("if (config) return;");
  });

  it("laeuft genau einmal beim Start", () => {
    expect(block).toContain("ssoGeholt.current");
    expect(block).toMatch(/\}, \[\]\);\s*$/);
  });

  it("ueberschreibt einen vorhandenen Dolibarr-Zugang nicht", () => {
    expect(block).toContain('!localStorage.getItem("dolibarr_config")');
  });
});

describe("Abmelden fuehrt nicht in die Sackgasse", () => {
  // Bliebe `managed` beim Abmelden stehen, waere der Eintrag danach weder
  // verbunden (kein calendarUrl) noch leer (wegen `managed`) — der
  // Team-Kalender kaeme nie wieder. Ein Klick, dauerhaft kaputt.
  const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const zeile = src.split("\n").find((l) => l.includes("const logout = () => { set({ user"));

  it("setzt `managed` mit zurueck", () => {
    expect(zeile).toContain("managed: false");
  });

  it("der zurueckgesetzte Eintrag gilt wieder als leer", () => {
    const leerZeile = src.split("\n").find((l) => l.includes("const leer ="));
    const leer = (v) => eval("(" + leerZeile.replace("const leer =", "").replace(/;\s*$/, "").replace(/vorhanden/g, "v") + ")");
    expect(leer({ server: "https://nc", user: "", pass: "", calendarUrl: "", managed: false })).toBe(true);
  });
});
