// Die stündliche Arbeitsschutz-Erinnerung (asStundentakt/asErinnerungPruefen
// in server.mjs) hing bis zum Review von Task 10 an KEINEM Block — eine
// Instanz mit abgeschaltetem `arbeitsschutz` hätte trotzdem stündlich
// Fristen-Sammelmails verschickt, weil `asErinnerungPruefen` einzig davon
// abhing, ob ein Nextcloud-Team-Konto und ein SMTP-Zugang in der ENV standen.
// „Durch den ENV-Abgleich praktisch entschärft" reicht als Begründung nicht:
// eine Firma mit abgeschaltetem Arbeitsschutz darf keine
// Arbeitsschutz-Erinnerungen verschicken, unabhängig von der ENV.
//
// Die eigentliche Mailschleife (`asErinnerungPruefen`) braucht SMTP/Nextcloud
// und die aktuelle Uhrzeit (`stunde < 6`) — ein echter End-to-End-Test wäre
// entweder netzwerkabhängig oder zeitabhängig. `asStundentakt` nimmt deshalb
// Mandant UND Prüf-Funktion als (in Produktion ungenutzte) Parameter entgegen:
// so lässt sich die Verdrahtung — läuft die Prüfung überhaupt an? — ohne
// Mocks für fetch/SMTP/Uhrzeit prüfen. Kein reiner Quelltext-Test: die
// Funktion wird wirklich aufgerufen.
import { describe, expect, it, vi } from "vitest";
import { asStundentakt } from "../../server.mjs";
import { MANDANT_STANDARD } from "../../src/mandant.js";

const mitArbeitsschutz = (an) => ({
  ...MANDANT_STANDARD,
  bloecke: { ...MANDANT_STANDARD.bloecke, arbeitsschutz: an },
});

describe("asStundentakt — Block-Wache vor der Erinnerungsmail", () => {
  it("Block aus: die Prüfung (und damit jeder Mailversand-Pfad) wird gar nicht erst aufgerufen", async () => {
    const pruefen = vi.fn(async () => {});
    await asStundentakt(mitArbeitsschutz(false), pruefen);
    expect(pruefen).not.toHaveBeenCalled();
  });

  it("Block an (Blattwerks Standard-Konfiguration): unverändertes Verhalten — die Prüfung läuft an", async () => {
    const pruefen = vi.fn(async () => {});
    await asStundentakt(mitArbeitsschutz(true), pruefen);
    expect(pruefen).toHaveBeenCalledTimes(1);
  });

  it("unbekanntes Gewerk-Profil (arbeitsschutz laut blockAktiv trotzdem aus): ebenfalls kein Aufruf", () => {
    const pruefen = vi.fn(async () => {});
    const mandant = { ...mitArbeitsschutz(true), profil: "unbekannt" };
    return asStundentakt(mandant, pruefen).then(() => {
      expect(pruefen).not.toHaveBeenCalled();
    });
  });

  it("ohne Argumente (Produktivaufruf aus dem Stundentakt) bleibt Blattwerk unverändert: die eingebaute Standard-Konfiguration hat arbeitsschutz an", () => {
    expect(MANDANT_STANDARD.bloecke.arbeitsschutz).toBe(true);
  });
});
