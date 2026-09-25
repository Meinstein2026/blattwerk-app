// Befund C2 der Abschlusspruefung (18.09.2026): Wache und Route meinten
// verschiedene Dinge. `wachePaperless` prueft `dienste.paperless`, die Routen
// /api/pl/list|file|upload sprachen aber eine Konstante an
// (`process.env.PAPERLESS_URL || "http://203.0.113.41:8010"`). Ohne gesetzte
// ENV lud ein fremder Mandant seine Dokumente in Blattwerks Paperless, und
// Blattwerks Liste zeigte sie. Zusaetzlich waren Bereich und Korrespondent
// fest verdrahtet — auch eine korrekt konfigurierte fremde Instanz
// beschriftete ihre Dokumente als Blattwerk.
//
// Geprueft wird deshalb das ERGEBNIS der Ableitung, nicht der Quelltext.
import { afterEach, describe, expect, it } from "vitest";
import { MANDANT_STANDARD, mandantLaden } from "../../src/mandant.js";
import { arbeitsschutzEmpfaenger, chatUpstream, paperlessBasis, paperlessNamen } from "../../src/mandant-server.mjs";
import { startPruefen } from "../../scripts/mandant/env-pruefen.mjs";

const fremd = (extra = {}) => mandantLaden(JSON.stringify({ kuerzel: "xy", name: "Baum Müller GbR", ...extra })).mandant;
const blattwerk = () => mandantLaden(null).mandant;

afterEach(() => {
  delete process.env.PAPERLESS_URL;
  delete process.env.CHAT_UPSTREAM;
  delete process.env.ARBEITSSCHUTZ_MAIL_TO;
});

describe("Paperless-Adresse kommt aus dem Mandanten", () => {
  it("Blattwerk spricht unverändert seine eigene Instanz an", () => {
    expect(paperlessBasis(blattwerk())).toBe("http://203.0.113.41:8010");
  });

  it("ein fremder Mandant mit eigener Instanz spricht seine eigene an", () => {
    expect(paperlessBasis(fremd({ dienste: { paperless: "https://pl.xy.example.org/" } })))
      .toBe("https://pl.xy.example.org");
  });

  it("ein fremder Mandant ohne eigene Instanz bekommt KEINE Adresse — auch nicht aus der ENV", () => {
    // Das war der eigentliche Befund: die ENV war der Umweg, auf dem
    // Blattwerks Adresse doch noch in eine fremde Instanz kam.
    process.env.PAPERLESS_URL = "http://203.0.113.41:8010";
    expect(paperlessBasis(fremd())).toBe("");
  });

  it("die ENV bleibt Rückfall für Blattwerk, wenn dessen Datei keine Adresse trägt", () => {
    process.env.PAPERLESS_URL = "http://paperless.intern:8010";
    expect(paperlessBasis(mandantLaden(JSON.stringify({ kuerzel: "bw", name: "Blattwerk GbR", dienste: { paperless: "" } })).mandant))
      .toBe("http://paperless.intern:8010");
  });
});

describe("Beschriftung der Dokumente kommt aus dem Mandanten", () => {
  it("für Blattwerk kommt Zeichen für Zeichen dasselbe heraus wie vorher", () => {
    expect(paperlessNamen(blattwerk())).toEqual({
      bereich: "Bereich/Blattwerk",
      korrespondent: "Baum- und Gartenpflege Blattwerk GbR",
    });
  });

  it("ein fremder Mandant beschriftet mit seinem eigenen Namen", () => {
    const n = paperlessNamen(fremd({ betrieb: { gewerk: "Baumpflege" } }));
    expect(n.bereich).toBe("Bereich/Baum Müller GbR");
    expect(n.korrespondent).toBe("Baumpflege Baum Müller GbR");
    expect(JSON.stringify(n)).not.toMatch(/Blattwerk/);
  });

  it("eine eigene Kurzform schlägt den Firmennamen", () => {
    expect(paperlessNamen(fremd({ anzeigeName: "Baum Müller" })).bereich).toBe("Bereich/Baum Müller");
  });

  it("wer andere Schlagworte braucht, kann beide überschreiben", () => {
    const n = paperlessNamen(fremd({ paperless: { bereich: "Bereich/BM", korrespondent: "Baum Müller" } }));
    expect(n).toEqual({ bereich: "Bereich/BM", korrespondent: "Baum Müller" });
  });
});

describe("Chat-Upstream und Arbeitsschutz-Mail folgen derselben Regel", () => {
  it("Blattwerk unverändert", () => {
    expect(chatUpstream(blattwerk())).toBe("http://203.0.113.50:8090");
    expect(arbeitsschutzEmpfaenger(blattwerk())).toBe("max@example.org");
  });

  it("ein fremder Mandant ohne eigene Angabe erbt nichts — auch nicht über die ENV", () => {
    process.env.CHAT_UPSTREAM = "http://203.0.113.50:8090";
    expect(chatUpstream(fremd())).toBe("");
    expect(arbeitsschutzEmpfaenger(fremd())).toBe("");
  });

  it("mit eigener Angabe gilt die eigene", () => {
    expect(chatUpstream(fremd({ dienste: { matrix: "http://chat.xy:8090" } }))).toBe("http://chat.xy:8090");
    expect(arbeitsschutzEmpfaenger(fremd({ kontakt: { arbeitsschutzMail: "sicherheit@xy.de" } }))).toBe("sicherheit@xy.de");
  });

  it("ARBEITSSCHUTZ_MAIL_TO bleibt Rückfall, wenn der Mandant keine Adresse trägt", () => {
    process.env.ARBEITSSCHUTZ_MAIL_TO = "sicherheit@xy.de";
    expect(arbeitsschutzEmpfaenger(fremd())).toBe("sicherheit@xy.de");
  });
});

describe("Startprüfung: widersprechen sich Datei und Umgebung, fährt der Server nicht hoch", () => {
  it("ohne ENV kein Widerspruch — dann gilt eindeutig die Mandanten-Datei", () => {
    expect(startPruefen({}, blattwerk())).toEqual([]);
    expect(startPruefen({}, fremd({ dienste: { paperless: "https://pl.xy.example.org" } }))).toEqual([]);
  });

  it("gleiche Adresse in beiden ist kein Widerspruch (auch mit Schrägstrich am Ende)", () => {
    expect(startPruefen({ PAPERLESS_URL: "http://203.0.113.41:8010/" }, blattwerk())).toEqual([]);
  });

  it("Paperless: ENV zeigt woanders hin als die Datei", () => {
    const f = startPruefen({ PAPERLESS_URL: "http://203.0.113.41:8010" },
      fremd({ dienste: { paperless: "https://pl.xy.example.org" } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/PAPERLESS_URL/);
    expect(f[0]).toMatch(/dienste\.paperless/);
  });

  it("Chat-Upstream und Arbeitsschutz-Mail laufen durch dieselbe Prüfung", () => {
    const f = startPruefen({
      CHAT_UPSTREAM: "http://203.0.113.50:8090",
      ARBEITSSCHUTZ_MAIL_TO: "max@example.org",
    }, fremd({ dienste: { matrix: "http://chat.xy:8090" }, kontakt: { arbeitsschutzMail: "sicherheit@xy.de" } }));
    expect(f).toHaveLength(2);
    expect(f.join(" ")).toMatch(/CHAT_UPSTREAM/);
    expect(f.join(" ")).toMatch(/ARBEITSSCHUTZ_MAIL_TO/);
  });

  it("gilt auch für Blattwerk selbst — ein Widerspruch ist auch dort einer", () => {
    expect(startPruefen({ PAPERLESS_URL: "https://pl.fremd.example" }, MANDANT_STANDARD)).toHaveLength(1);
  });
});
