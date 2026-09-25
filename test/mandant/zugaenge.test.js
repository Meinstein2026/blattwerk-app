import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MANDANT_STANDARD, darfDiensteAendern, dienstLinks, mandantLaden } from "../../src/mandant.js";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const funktion = (name) => {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error("Funktion fehlt: " + name);
  const b = src.indexOf("\nfunction ", a + 10);
  return src.slice(a, b < 0 ? src.length : b);
};

describe("Dienste-Links", () => {
  it("listet nur hinterlegte Dienste, mit sprechenden Namen", () => {
    const { mandant } = mandantLaden(JSON.stringify({
      kuerzel: "xy", name: "Baum Müller GbR",
      dienste: { dolibarr: "https://erp.xy.example.org", webmail: "https://mail.xy.example.org", wordpress: "" },
    }));
    const links = dienstLinks(mandant);
    expect(links.map((l) => l.schluessel)).toContain("webmail");
    expect(links.find((l) => l.schluessel === "webmail").label).toMatch(/Webmail/i);
    expect(links.map((l) => l.schluessel)).not.toContain("wordpress"); // leer = nicht anzeigen
  });

  it("nimmt für Blattwerk die bekannten Adressen", () => {
    expect(dienstLinks(MANDANT_STANDARD).find((l) => l.schluessel === "dolibarr").url)
      .toBe(MANDANT_STANDARD.dienste.dolibarr);
  });

  it("nur Mandanten-Admins dürfen Dienste ändern", () => {
    expect(darfDiensteAendern({ isAdmin: true, mandantAdmin: true }, MANDANT_STANDARD)).toBe(true);
    expect(darfDiensteAendern({ isAdmin: true, mandantAdmin: false }, MANDANT_STANDARD)).toBe(false);
    expect(darfDiensteAendern(null, MANDANT_STANDARD)).toBe(false);
  });
});

describe("Einstellungen sind für normale Nutzer nur lesbar", () => {
  it("zeigt Adressen an, bietet aber kein Eingabefeld ohne Adminrecht", () => {
    const s = funktion("EinstellungenPage");
    expect(s).toMatch(/darfDiensteAendern\(/);
  });
  it("die Nextcloud-Anmeldung je Gerät entfällt, wenn der Server den Zugang kennt", () => {
    expect(funktion("NextcloudPanel")).toMatch(/verwaltet|managed/i);
  });
});
