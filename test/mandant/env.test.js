import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { envPruefen, startPruefen } from "../../scripts/mandant/env-pruefen.mjs";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const fremd = { kuerzel: "xy", name: "Baum Müller GbR", dienste: { dolibarr: "https://erp.xy.example.org" } };

describe("ENV-Abgleich", () => {
  it("meldet von Blattwerk geerbte Zugänge", () => {
    const funde = envPruefen({ SSO_NC_TEAM_USER: "blattwerk-kalender", SSO_DOLIBARR_URL: "https://dolibarr.example.org" }, fremd);
    expect(funde.join(" ")).toMatch(/SSO_NC_TEAM_USER/);
    expect(funde.join(" ")).toMatch(/SSO_DOLIBARR_URL/);
  });

  it("meldet einen fehlenden vertrauten Proxy nicht als Fehler, wenn er gesetzt ist", () => {
    const funde = envPruefen({ SSO_TRUSTED_PROXY_IPS: "198.51.100.12", SSO_DOLIBARR_URL: "https://erp.xy.example.org" }, fremd);
    expect(funde.join(" ")).not.toMatch(/SSO_TRUSTED_PROXY_IPS/);
  });

  it("warnt, wenn der vertraute Proxy fehlt — sonst scheitert jeder Login stumm", () => {
    expect(envPruefen({}, fremd).join(" ")).toMatch(/SSO_TRUSTED_PROXY_IPS/);
  });

  it("bei Blattwerk selbst ist alles in Ordnung", () => {
    expect(envPruefen({ SSO_NC_TEAM_USER: "blattwerk-kalender", SSO_TRUSTED_PROXY_IPS: "203.0.113.30" },
      { kuerzel: "bw", name: "Blattwerk GbR", dienste: { dolibarr: "https://dolibarr.example.org" } })).toEqual([]);
  });

  // --- Korrekturen/Ergänzungen aus der Aufgabenkorrektur: die GEERBT_VERBOTEN-Liste
  // im Brief war ein Ausgangspunkt, kein vollständiger Katalog. Die folgenden Fälle
  // sind aus dem echten process.env-Gebrauch in server.mjs/src/** abgeleitet.

  it("erkennt nackte IP-Adressen aus dem Homelab, die der Namens-Abgleich sonst verpasst", () => {
    // PAPERLESS_URL/BELEG_APPROVE_BASE/CHAT_UPSTREAM zeigen per Code-Default auf
    // 203.0.113.41/.50 — das sind Blattwerks eigene Hosts, aber weder "blattwerk"
    // noch der echte Domainname steht im Wert.
    const funde = envPruefen({ BELEG_APPROVE_BASE: "http://203.0.113.41:8742" }, fremd);
    expect(funde.join(" ")).toMatch(/BELEG_APPROVE_BASE/);
  });

  // Seit Befund C2 (18.09.2026) liest der Server die Paperless-Adresse aus dem
  // Mandanten (paperlessBasis) — das Fehlen von PAPERLESS_URL ist damit kein
  // Fund mehr, sondern der Normalfall: ohne ENV gilt eindeutig die Datei.
  it("verlangt PAPERLESS_URL NICHT mehr — ohne ENV gilt die Mandanten-Datei", () => {
    const m = { ...fremd, dienste: { ...fremd.dienste, paperless: "https://pl.xy.example.org" } };
    expect(envPruefen({}, m).join(" ")).not.toMatch(/PAPERLESS_URL/);
    expect(envPruefen({}, fremd).join(" ")).not.toMatch(/PAPERLESS_URL/);
  });

  it("meldet PAPERLESS_URL, die nicht zur eigenen Paperless-Instanz des Mandanten passt", () => {
    const m = { ...fremd, dienste: { ...fremd.dienste, paperless: "https://pl.xy.example.org" } };
    const funde = envPruefen({ PAPERLESS_URL: "http://203.0.113.41:8010" }, m);
    expect(funde.join(" ")).toMatch(/PAPERLESS_URL/);
  });

  it("verlangt CHAT_UPSTREAM NICHT mehr — gleiche Regel wie bei Paperless", () => {
    const m = { ...fremd, dienste: { ...fremd.dienste, matrix: "https://chat.xy.example.org" } };
    expect(envPruefen({}, m).join(" ")).not.toMatch(/CHAT_UPSTREAM/);
  });

  it("meldet, wenn die Fristen-Sammelmail gar keinen Empfänger hat", () => {
    // Anders als frueher ist das kein "geht sonst an Blattwerk" mehr (den
    // Rueckfall gibt es nicht mehr), sondern "bleibt dann aus".
    expect(envPruefen({}, fremd).join(" ")).toMatch(/ARBEITSSCHUTZ_MAIL_TO/);
    const m = { ...fremd, kontakt: { arbeitsschutzMail: "sicherheit@xy.de" } };
    expect(envPruefen({}, m).join(" ")).not.toMatch(/ARBEITSSCHUTZ_MAIL_TO/);
  });

  it("meldet fehlendes ORDER_MAIL_TO bei einem fremden Mandanten ohne eigene bestellMail", () => {
    expect(envPruefen({}, fremd).join(" ")).toMatch(/ORDER_MAIL_TO/);
  });

  it("meldet ORDER_MAIL_TO NICHT, wenn der Mandant eine eigene bestellMail hinterlegt hat — bestellWache lässt den Rückfall dann ohnehin nie greifen", () => {
    const m = { ...fremd, kontakt: { bestellMail: "buero@xy-baumpflege.de" } };
    expect(envPruefen({}, m).join(" ")).not.toMatch(/ORDER_MAIL_TO/);
  });

  it("erkennt kuerzel 'bw', dessen Dolibarr-Adresse nicht nach Blattwerk aussieht — vermutlich eine kopierte Datei", () => {
    const kaputt = { kuerzel: "bw", name: "Baum Müller GbR", dienste: { dolibarr: "https://erp.xy.example.org" } };
    expect(envPruefen({}, kaputt).join(" ")).toMatch(/kuerzel.*bw/i);
  });

  it("bei Blattwerks echter Dolibarr-Adresse unter kuerzel 'bw' gibt es dazu keine Meldung", () => {
    const funde = envPruefen({ SSO_TRUSTED_PROXY_IPS: "203.0.113.30" },
      { kuerzel: "bw", name: "Blattwerk GbR", dienste: { dolibarr: "https://dolibarr.example.org" } });
    expect(funde).toEqual([]);
  });

  // --- SSO_ALLOWED_DOLIBARR_HOSTS / SSO_ALLOWED_NC_HOSTS (Review-Fund: der
  // SSRF-Schutz für /api/sso/register[-nc] lehnt ohne den eigenen Host in der
  // Liste die Selbstregistrierung des Mandanten mit 400 ab — laut statt
  // still, aber trotzdem ein Startproblem).

  it("meldet, wenn der eigene Dolibarr-Host des Mandanten nicht in SSO_ALLOWED_DOLIBARR_HOSTS steht", () => {
    const funde = envPruefen({}, fremd); // fremd.dienste.dolibarr = erp.xy.example.org, Default-Liste kennt nur Blattwerks Hosts
    expect(funde.join(" ")).toMatch(/SSO_ALLOWED_DOLIBARR_HOSTS/);
    expect(funde.join(" ")).toMatch(/erp\.xy\.example\.org/);
  });

  it("meldet SSO_ALLOWED_DOLIBARR_HOSTS NICHT, wenn der eigene Host passend eingetragen ist", () => {
    const funde = envPruefen({ SSO_ALLOWED_DOLIBARR_HOSTS: "erp.xy.example.org" }, fremd);
    expect(funde.join(" ")).not.toMatch(/SSO_ALLOWED_DOLIBARR_HOSTS/);
  });

  it("meldet, wenn der eigene Nextcloud-Host des Mandanten nicht in SSO_ALLOWED_NC_HOSTS steht", () => {
    const m = { ...fremd, dienste: { ...fremd.dienste, nextcloud: "https://nextcloud-alt.example.org" } };
    // nextcloud-alt.example.org steht zwar im Default drin (geteilte Nextcloud) — hier
    // bewusst ein Host, der NICHT im Default steht, um den Fund zu erzwingen.
    const m2 = { ...fremd, dienste: { ...fremd.dienste, nextcloud: "https://nc.andere-firma.de" } };
    const funde = envPruefen({}, m2);
    expect(funde.join(" ")).toMatch(/SSO_ALLOWED_NC_HOSTS/);
    expect(funde.join(" ")).toMatch(/nc\.andere-firma\.de/);
    // Gegenprobe: die geteilte Nextcloud (Default-Liste) braucht keine eigene ENV.
    expect(envPruefen({}, m).join(" ")).not.toMatch(/SSO_ALLOWED_NC_HOSTS/);
  });

  it("meldet SSO_ALLOWED_NC_HOSTS NICHT, wenn der eigene Host passend eingetragen ist", () => {
    const m = { ...fremd, dienste: { ...fremd.dienste, nextcloud: "https://nc.andere-firma.de" } };
    const funde = envPruefen({ SSO_ALLOWED_NC_HOSTS: "nc.andere-firma.de" }, m);
    expect(funde.join(" ")).not.toMatch(/SSO_ALLOWED_NC_HOSTS/);
  });

  it("bei Blattwerk (kuerzel bw) mit Standard-Adressen gibt es zu beiden Allowlists keine Meldung", () => {
    const funde = envPruefen({ SSO_TRUSTED_PROXY_IPS: "203.0.113.30" }, {
      kuerzel: "bw", name: "Blattwerk GbR",
      dienste: { dolibarr: "https://dolibarr.example.org", nextcloud: "https://nextcloud.example.org" },
    });
    expect(funde).toEqual([]);
  });

  it("ohne eigenen Dolibarr/Nextcloud-Eintrag gibt es keine Allowlist-Meldung (Registrierung ist ohnehin nicht möglich)", () => {
    expect(envPruefen({}, fremd).join(" ")).not.toMatch(/SSO_ALLOWED_NC_HOSTS/);
  });
});

describe("startPruefen: Blattwerk darf nie mit Platzhaltern starten", () => {
  const echterMandant = {
    kuerzel: "bw", name: "Blattwerk GbR", ort: "Beispielstadt",
    dienste: { dolibarr: "https://doli.bw.example.net", nextcloud: "https://nextcloud.example.net" },
    betrieb: { anschrift: "Musterhofweg 1, 12345 Beispielstadt" },
  };

  it("ohne dateiVorhanden-Option (bestehende Aufrufer) bleibt alles wie zuvor", () => {
    expect(startPruefen({}, MANDANT_STANDARD)).toEqual([]);
  });

  it("bricht ab, wenn mandant.json fehlt und der Mandant Blattwerk ist", () => {
    const funde = startPruefen({}, MANDANT_STANDARD, { dateiVorhanden: false });
    expect(funde.join(" ")).toMatch(/mandant\.json fehlt/);
  });

  it("bricht ab, wenn die geladene Konfiguration noch Platzhalter enthält", () => {
    const funde = startPruefen({}, MANDANT_STANDARD, { dateiVorhanden: true });
    expect(funde.join(" ")).toMatch(/Platzhalter-Werte/);
  });

  it("lässt einen echten Mandanten ohne Platzhalter durch", () => {
    expect(startPruefen({}, echterMandant, { dateiVorhanden: true })).toEqual([]);
  });

  it("BW_PLATZHALTER_OK=1 erlaubt den Start trotzdem", () => {
    expect(startPruefen({ BW_PLATZHALTER_OK: "1" }, MANDANT_STANDARD, { dateiVorhanden: false })).toEqual([]);
  });

  it("gilt nicht für einen fremden Mandanten — example.org kann dessen echte Domain sein", () => {
    const fremdMitExampleOrg = { kuerzel: "xy", name: "Baum Müller GbR", dienste: { dolibarr: "https://erp.xy.example.org" } };
    expect(startPruefen({}, fremdMitExampleOrg, { dateiVorhanden: true })).toEqual([]);
  });
});

describe("ENV-Abgleich als CLI (Wegwerf-Mandant)", () => {
  const skript = path.resolve(__dirname, "../../scripts/mandant/env-pruefen.mjs");

  it("bricht mit einer klaren Meldung ab, wenn MANDANT_DATEI auf eine nicht existierende Datei zeigt", () => {
    const tempPfad = path.join(os.tmpdir(), `env-pruefen-test-${process.pid}-${Date.now()}.json`);
    expect(fs.existsSync(tempPfad)).toBe(false);
    let stderr = "";
    let code = 0;
    try {
      execFileSync("node", [skript], { env: { ...process.env, MANDANT_DATEI: tempPfad }, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      code = e.status;
      stderr = String(e.stderr || "");
    }
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/existiert nicht/);
  });
});
