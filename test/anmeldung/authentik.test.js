// Anmelden über Authentik statt API-Schlüssel.
//
// Nach dem Abmelden stand bisher ein Formular für Dolibarr-URL und API-Key da —
// eine Frage, die im Einsatz niemand beantworten kann: den Schlüssel hat nur,
// wer sich in Dolibarr ins eigene Profil klickt. Vor der App hängt aber ohnehin
// Authentik, der Server kennt den hinterlegten Zugang also bereits
// (`/api/sso/config`). Der Regelweg ist deshalb ein Knopf; das Formular bleibt
// nur als Ausweg für den Erstzugang und für Aufrufe an Authentik vorbei.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("export const SSO_ABGELAUFEN");
const b = src.indexOf("// ─── Nextcloud-Kalender", a);
if (a < 0 || b < 0) throw new Error("SSO-Abschnitt in dolibarr-app.jsx nicht gefunden");
const sandbox = { window: undefined };
vm.createContext(sandbox);
const { ssoAnmeldung } = vm.runInContext(
  src.slice(a, b).replace(/^export /gm, "") + "\n({ ssoAnmeldung })", sandbox);

describe("ssoAnmeldung", () => {
  it("übernimmt den hinterlegten Zugang", () => {
    const erg = ssoAnmeldung({
      username: "erika", name: "Erika Meier",
      dolibarr: { url: "https://dolibarr.example.org", key: "geheim" },
    });
    expect(erg.stand).toBe("bereit");
    expect(erg.name).toBe("Erika Meier");
    expect(erg.config).toEqual({ url: "https://dolibarr.example.org", key: "geheim" });
  });

  it("schneidet den Schrägstrich am Ende ab, wie die Handeingabe auch", () => {
    // createApi hängt "/api/index.php" an — mit doppeltem Schrägstrich
    // antwortet Dolibarr 404, und der Fehler sieht aus wie ein falscher Key.
    const erg = ssoAnmeldung({ username: "erika", dolibarr: { url: "https://d.example/", key: "k" } });
    expect(erg.config.url).toBe("https://d.example");
  });

  it("erkennt: angemeldet, aber noch kein Zugang hinterlegt (erstes Gerät)", () => {
    // ssoLookup liefert null, bis irgendwer den Schlüssel einmal eingetragen
    // hat. Dann führt kein Weg am Formular vorbei — es muss erreichbar bleiben.
    const erg = ssoAnmeldung({ username: "erika", name: "Erika Meier", dolibarr: null });
    expect(erg.stand).toBe("ohne-zugang");
    expect(erg.name).toBe("Erika Meier");
  });

  it("nimmt den Anmeldenamen, wenn kein Klarname kommt", () => {
    expect(ssoAnmeldung({ username: "erika", dolibarr: null }).name).toBe("erika");
  });

  it("erkennt einen Aufruf, der gar nicht über Authentik läuft", () => {
    // ssoUser() gibt nur etwas her, wenn die Anfrage vom Reverse Proxy kommt —
    // sonst wäre der Header frei fälschbar. Ohne Namen ist der Knopf sinnlos.
    expect(ssoAnmeldung({ username: null, dolibarr: null }).stand).toBe("ohne-authentik");
    expect(ssoAnmeldung(null).stand).toBe("ohne-authentik");
  });

  it("traut einem Zugang ohne Namen nicht", () => {
    // Ein Zugang ohne erkannte Identität kann nur aus einer gefälschten
    // Antwort stammen.
    expect(ssoAnmeldung({ username: null, dolibarr: { url: "https://d.example", key: "k" } }).stand)
      .toBe("ohne-authentik");
  });

  it("behandelt einen halben Zugang wie keinen", () => {
    expect(ssoAnmeldung({ username: "erika", dolibarr: { url: "https://d.example" } }).stand).toBe("ohne-zugang");
    expect(ssoAnmeldung({ username: "erika", dolibarr: { key: "k" } }).stand).toBe("ohne-zugang");
  });
});

describe("LoginScreen", () => {
  const von = src.indexOf("function LoginScreen(");
  const bis = src.indexOf("\nfunction ", von + 1);
  const screen = src.slice(von, bis);

  it("bietet die Anmeldung über Authentik an", () => {
    expect(screen).toMatch(/Authentik/);
    expect(screen).toMatch(/\/api\/sso\/config/);
  });

  it("richtet beide Wege gleich ein", () => {
    // window.__api ist keine Bequemlichkeit für die Konsole: die
    // Offline-Warteschlange (runSync, refreshRefCache) hängt daran. Führte der
    // Authentik-Weg an dieser Zeile vorbei, würde auf genau den Geräten, die
    // ihn nutzen, still nichts mehr nachgetragen. Deshalb ein gemeinsamer
    // Abschluss statt zweier Kopien.
    expect(screen).toMatch(/const verbinden = async/);
    expect((screen.match(/window\.__api =/g) || []).length).toBe(1);
    expect((screen.match(/await verbinden\(/g) || []).length).toBe(2);
  });

  it("lässt die Handeingabe erreichbar", () => {
    expect(screen).toMatch(/API Key/);
    expect(screen).toMatch(/setManuell\(true\)/);
  });
});
