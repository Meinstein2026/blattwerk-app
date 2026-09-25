import { describe, expect, it } from "vitest";
import {
  BLOECKE, MANDANT_STANDARD, blockAktiv, mandantLaden, mandantOeffentlich, mandantPruefen,
} from "../../src/mandant.js";
import { bestellWache } from "../../src/mandant-server.mjs";

describe("Mandanten-Konfiguration", () => {
  it("funktionen sind Teil der oeffentlichen Antwort und immer vollstaendig", () => {
    const { mandant } = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "X" }));
    const oeff = mandantOeffentlich(mandant);
    expect(typeof oeff.funktionen).toBe("object");
    expect(Object.values(oeff.funktionen).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("ohne Datei gilt Blattwerk", () => {
    const { mandant, fehler } = mandantLaden(null);
    expect(fehler).toBe(null);
    expect(mandant.kuerzel).toBe("bw");
    expect(mandant.name).toBe("Blattwerk GbR");
    expect(mandant.profil).toBe("baumpflege");
    expect(BLOECKE.every((b) => typeof mandant.bloecke[b] === "boolean")).toBe(true);
  });

  it("ergänzt fehlende Felder aus dem Standard", () => {
    const { mandant } = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR" }));
    expect(mandant.name).toBe("Baum Müller GbR");
    expect(mandant.farbe.akzent).toBe(MANDANT_STANDARD.farbe.akzent);
  });

  it("ohne Dienst-URL ist der Block aus, auch wenn er auf true steht", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "Baum Müller GbR",
      bloecke: { kalender: true }, dienste: { nextcloud: "" },
    }));
    expect(blockAktiv(mandant, "kalender")).toBe(false);
  });

  it("kaputte Datei: Blattwerk-Darstellung, aber alle Dienst-Blöcke aus", () => {
    const { mandant, fehler } = mandantLaden("{kein json");
    expect(fehler).toMatch(/mandant\.json/i);
    expect(blockAktiv(mandant, "kalender")).toBe(false);
    expect(blockAktiv(mandant, "chat")).toBe(false);
    expect(blockAktiv(mandant, "erp")).toBe(false);
  });

  it("kaputte Datei: auch die Bestelladresse bleibt leer, nicht Blattwerks eigene", () => {
    const { mandant } = mandantLaden("{kein json");
    expect(mandant.kontakt.bestellMail).toBe("");
    const res = { code: 200, body: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    bestellWache(() => mandant)({}, res, () => { throw new Error("darf nicht weitergehen"); });
    expect(res.code).toBe(404);
  });

  it("telefon ist bei einem fremden Mandanten aus", () => {
    const { mandant } = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR" }));
    expect(blockAktiv(mandant, "telefon")).toBe(false);
  });

  it("ein fremder Mandant ohne eigene Dienste erbt NICHTS von Blattwerk — alle Adressen bleiben leer", () => {
    const { mandant } = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR" }));
    expect(mandant.dienste.nextcloud).toBe("");
    expect(mandant.dienste.paperless).toBe("");
    expect(mandant.dienste.matrix).toBe("");
    expect(mandant.dienste.dolibarr).toBe("");
    expect(mandant.dienste.updates).toBe("");
    expect(mandant.kontakt.bestellMail).toBe("");
    for (const b of ["erp", "belege", "fahrtenbuch", "kalender", "arbeitsschutz", "chat"]) {
      expect(blockAktiv(mandant, b)).toBe(false);
    }
  });

  // Review-Fund zu Task 5: uvTraeger/grundGbu fehlten zunaechst in der
  // Anti-Vererbungs-Sperre unten (nur die vier Darstellungsfelder waren
  // abgedeckt) — ein fremder Mandant ohne eigenes betrieb haette Blattwerks
  // Versicherungstraeger "SVLFG" und (waere er je befuellt) Blattwerks
  // Grund-GBU-Nummer auf der eigenen Gefährdungsbeurteilung stehen gehabt.
  it("ein fremder Mandant ohne eigenes betrieb erbt NICHTS von Blattwerk — auch uvTraeger/grundGbu bleiben leer", () => {
    const { mandant } = mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR" }));
    expect(mandant.betrieb.uvTraeger).toBe("");
    expect(mandant.betrieb.grundGbu).toBe("");
    expect(mandant.betrieb.anschrift).toBe("");
    expect(mandant.betrieb.gewerk).toBe("");
    expect(mandant.betrieb.appName).toBe("");
  });

  it("ein fremder Mandant mit eigenem betrieb bekommt genau seine eigenen Werte, nichts von Blattwerk gemischt", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "Baum Müller GbR",
      betrieb: { uvTraeger: "BG Bau", grundGbu: "GBU-M-001" },
    }));
    expect(mandant.betrieb.uvTraeger).toBe("BG Bau");
    expect(mandant.betrieb.grundGbu).toBe("GBU-M-001");
    // Nicht mitgeliefert -> leer, nicht von Blattwerk geerbt.
    expect(mandant.betrieb.anschrift).toBe("");
    expect(mandant.betrieb.gewerk).toBe("");
    expect(mandant.betrieb.appName).toBe("");
  });

  it("ein fremder Mandant, der nur dienste.dolibarr setzt, bekommt NUR erp — die übrigen Dienste bleiben leer", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "Baum Müller GbR", dienste: { dolibarr: "https://erp.xy.example" },
    }));
    expect(mandant.dienste.dolibarr).toBe("https://erp.xy.example");
    expect(mandant.dienste.nextcloud).toBe("");
    expect(mandant.dienste.paperless).toBe("");
    expect(mandant.dienste.matrix).toBe("");
    expect(mandant.dienste.updates).toBe("");
    expect(blockAktiv(mandant, "erp")).toBe(true);
    for (const b of ["belege", "fahrtenbuch", "kalender", "arbeitsschutz", "chat"]) {
      expect(blockAktiv(mandant, b)).toBe(false);
    }
  });

  it("unbekanntes Profil verhindert Arbeitsschutz", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "X", profil: "dachdecker", bloecke: { arbeitsschutz: true },
    }));
    expect(blockAktiv(mandant, "arbeitsschutz")).toBe(false);
  });

  it("liefert keine Geheimnisse an den Browser", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "X", geheim: { smtpPass: "s3hr" }, dolibarrKey: "abc",
    }));
    const oeff = JSON.stringify(mandantOeffentlich(mandant));
    expect(oeff).not.toMatch(/s3hr|abc/);
    expect(oeff).toMatch(/"name":"X"/);
  });

  it("mandantPruefen weist Unsinn ab und lässt Gültiges durch", () => {
    expect(mandantPruefen({ kuerzel: "", name: "X" })).toMatch(/kürzel/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "" })).toMatch(/name/i);
    expect(mandantPruefen({ kuerzel: "x y", name: "X" })).toMatch(/kürzel/i);
    expect(mandantPruefen({ kuerzel: "-xy", name: "X" })).toMatch(/kürzel/i);
    expect(mandantPruefen({ kuerzel: "xy-", name: "X" })).toMatch(/kürzel/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", bloecke: { unbekannt: true } })).toMatch(/unbekannt/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", profil: "dachdecker", bloecke: { arbeitsschutz: true } }))
      .toMatch(/profil/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", bloecke: { erp: true } })).toBe(null);
  });

  // Fix Round 2 (2026-09-18): weder mandantPruefen noch ncOrdner() (siehe
  // test/mandant/ablage.test.js) wiesen einen Ordnernamen ab, der nur aus
  // Punkten besteht — ein hand editiertes mandant.json mit
  // `"nextcloud":{"ordner":".."}` haette ordnerUrl() einen echten WebDAV-
  // Pfadsprung bauen lassen (encodeURIComponent laesst Punkte unveraendert
  // durch). Hier direkt beim PUT /api/mandant abweisen, bevor so eine Angabe
  // je in die Datei kommt.
  it("weist einen reinen Punktnamen (Pfadsprung) für Name und Nextcloud-Ordner ab", () => {
    expect(mandantPruefen({ kuerzel: "xy", name: "..", bloecke: {} })).toMatch(/punkt/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", nextcloud: { ordner: ".." }, bloecke: {} })).toMatch(/punkt/i);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", nextcloud: { ordner: "/../" }, bloecke: {} })).toMatch(/punkt/i);
    // Ein echter Ordnername bleibt erlaubt, auch mit Punkten darin (z. B. Abkürzungen).
    expect(mandantPruefen({ kuerzel: "xy", name: "X", nextcloud: { ordner: "Baum Müller" }, bloecke: {} })).toBe(null);
    expect(mandantPruefen({ kuerzel: "xy", name: "X", bloecke: {} })).toBe(null);
  });

  it("Blattwerk-Standard aktiviert alle Blöcke", () => {
    const { mandant } = mandantLaden(null);
    expect(blockAktiv(mandant, "erp")).toBe(true);
    expect(blockAktiv(mandant, "belege")).toBe(true);
    expect(blockAktiv(mandant, "fahrtenbuch")).toBe(true);
    expect(blockAktiv(mandant, "chat")).toBe(true);
    expect(blockAktiv(mandant, "arbeitsschutz")).toBe(true);
    expect(blockAktiv(mandant, "kalender")).toBe(true);
    expect(blockAktiv(mandant, "telefon")).toBe(true);
  });

  it("tiefe Geheimnisse in betrieb/farbe/rechte erscheinen nicht im öffentlichen Output", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy",
      name: "X",
      betrieb: { uvTraeger: "ok", smtpPass: "geheim123", otherSecret: "nein" },
      farbe: { akzent: "#fff", hidden: "secret" },
      rechte: { user: ["read"], admin: "supergeheim" },
    }));
    const oeff = JSON.stringify(mandantOeffentlich(mandant));
    expect(oeff).not.toMatch(/geheim123|smtpPass|otherSecret|hidden|secret|supergeheim/);
    expect(oeff).toMatch(/uvTraeger/);
    expect(oeff).toMatch(/"akzent"/);
    expect(oeff).toMatch(/"user":\["read"\]/);
  });

  // Präzisiert am 18.09.2026 (Fix-Runde Task 11), nachdem eine frühere
  // Fassung dieses Tests versehentlich auch die Nextcloud-WEBADRESSE verbot.
  // Die Grenze, die hier wirklich gilt und die naechste Sitzung nicht wieder
  // verschieben soll:
  //   - Die Web-Adresse eines Dienstes (z. B. https://nextcloud…) ist KEIN
  //     Geheimnis — sie ist ohnehin oeffentlich erreichbar, eine Mitarbeiterin
  //     wuerde sie sonst selbst eintippen. Deshalb darf `zugaenge` (die
  //     kuratierte Kachel-Liste, dienstLinks() in src/mandant.js) sie zeigen.
  //   - Schuetzenswert sind ausschliesslich ECHTE Zugangsdaten: Benutzername/
  //     Kalenderadresse des Dienstkontos (`mandant.nextcloud.dienstkonto`,
  //     server.mjs: ncTeamCreds()) und erst recht dessen Passwort — letzteres
  //     verlaesst server.mjs ohnehin nie (liegt nur in SSO_NC_TEAM_PASS bzw.
  //     im Server-Store), ersteres darf trotzdem nicht in mandantOeffentlich()
  //     auftauchen.
  //   - Der rohe `dienste`-Block (das Feld, das es schon vor `zugaenge` gab)
  //     bleibt bewusst auf dolibarr/updates beschraenkt — nicht weil die
  //     anderen Adressen geheim waeren, sondern weil `dienste` historisch der
  //     Weg ist, auf dem die App selbst mit einem Dienst spricht, und dafuer
  //     nur diese zwei je gebraucht wurden.
  //   - "matrix" bleibt vollstaendig aussen vor, auch aus `zugaenge`:
  //     CHAT_UPSTREAM_STANDARD ist eine nackte LAN-IP auf Synapses
  //     Client-API-Port, kein Browser-Ziel — anders als bei Nextcloud ist das
  //     hier keine Geheimnis-Frage, sondern schlicht kein sinnvoller Link
  //     (siehe DIENST_LABEL in src/mandant.js, das "matrix" deshalb gar nicht
  //     erst auflistet).
  it("dienste bleibt auf dolibarr/updates beschränkt; zugaenge darf die Nextcloud-Webadresse zeigen, nie das Dienstkonto oder Matrix", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy",
      name: "X",
      dienste: { dolibarr: "https://doli.example.com", nextcloud: "https://nc.example.com", matrix: "http://198.51.100.5:8090" },
      // Zugangsdaten des Dienstkontos — anderer Schluessel als dienste.nextcloud,
      // NIE Teil der oeffentlichen Antwort (Benutzername reicht schon als
      // Zugangsdatum, das Passwort steht hier ohnehin nicht — das bleibt
      // ausschliesslich in der Umgebung, siehe server.mjs ncTeamCreds()).
      nextcloud: { dienstkonto: { user: "dienstkonto-benutzer", calendarUrl: "https://nc.example.com/geheimer-kalenderpfad" } },
    }));
    const oeff = mandantOeffentlich(mandant);

    // Der rohe dienste-Block bleibt exakt die alte, enge Allowlist.
    expect(Object.keys(oeff.dienste).sort()).toEqual(["dolibarr", "updates"]);

    // zugaenge darf die Nextcloud-Webadresse zeigen — das ist der Zweck der
    // Kachel: eine Mitarbeiterin kommt von der Startseite aus in Dateien und
    // Kalender.
    expect(oeff.zugaenge.find((z) => z.schluessel === "nextcloud")?.url).toBe("https://nc.example.com");

    // Aber: kein Dienstkonto, kein Matrix, keine LAN-IP irgendwo im Output.
    const serialisiert = JSON.stringify(oeff);
    expect(serialisiert).not.toMatch(/dienstkonto|geheimer-kalenderpfad/i);
    expect(serialisiert).not.toMatch(/matrix/i);
    expect(serialisiert).not.toMatch(/10\.0\.0\.5/);
  });

  it("mandantLaden wirft nie, auch bei kaputten Objekten", () => {
    expect(() => mandantLaden(JSON.stringify({ bloecke: null, dienste: null, farbe: null }))).not.toThrow();
    const { mandant } = mandantLaden(JSON.stringify({ bloecke: null, dienste: null }));
    expect(typeof mandant.bloecke).toBe("object");
    expect(typeof mandant.dienste).toBe("object");
  });

  it("mandantLaden gibt immer eine tiefe Kopie zurück (keine Verunreinigung des Standards)", () => {
    const { mandant: m1 } = mandantLaden(null);
    m1.bloecke.erp = false;
    const { mandant: m2 } = mandantLaden(null);
    expect(m2.bloecke.erp).toBe(true);
  });
});
