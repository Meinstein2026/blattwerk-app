// Der Team-Kalender ist seit dem Umzug am 06.08.2026 verbindlich. Hier wird
// geprueft, dass gespeicherte alte (private) Adressen mitgenommen werden und
// die Auswahl den Team-Kalender trifft.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// dolibarr-app.jsx ist eine einzelne grosse Datei (bewusst so, siehe CLAUDE.md)
// und exportiert diese Helfer nicht. Der Abschnitt wird deshalb aus der Quelle
// gelesen und in einer leeren Sandbox ausgefuehrt — so prueft der Test die
// ECHTE Implementierung statt einer Kopie, die spaeter auseinanderlaeuft.
// Die Quelle ist eine Datei aus diesem Repo, keine Eingabe von aussen.
const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("const NC_TEAM_KALENDER =");
const b = src.indexOf("const loadNcConfig =", a);
if (a < 0 || b < 0) throw new Error("Kalender-Abschnitt in dolibarr-app.jsx nicht gefunden");
// Der Abschnitt nutzt intern() (src/intern.js) für den Namen des alten
// Kalenders — außerhalb des Moduls importiert die Sandbox das nicht, deshalb
// hier als Platzhalter-Version nachgereicht (liefert immer den Default).
const sandbox = { intern: (_name, platzhalter) => platzhalter };
vm.createContext(sandbox);
// `const` landet nicht auf dem Sandbox-Objekt — deshalb am Ende ein Ausdruck,
// dessen Wert runInContext zurueckgibt.
const { ncTeamKalenderUrl, ncFindTeamKalender } = vm.runInContext(
  src.slice(a, b) + "\n({ ncTeamKalenderUrl, ncFindTeamKalender })", sandbox);

const NC = "https://nextcloud.example.org/remote.php/dav/calendars";

describe("ncTeamKalenderUrl", () => {
  it("hebt Max' privaten Kalender auf den Team-Kalender", () => {
    expect(ncTeamKalenderUrl(`${NC}/max/blattwerk/`))
      .toBe(`${NC}/max/blattwerk_shared_by_blattwerk-kalender/`);
  });

  it("hebt die alte Freigabe-Sicht eines Mitglieds", () => {
    expect(ncTeamKalenderUrl(`${NC}/erika.beispiel/blattwerk_shared_by_max`))
      .toBe(`${NC}/erika.beispiel/blattwerk_shared_by_blattwerk-kalender/`);
  });

  it("laesst den Pfad des Besitzer-Kontos in Ruhe", () => {
    const eigen = `${NC}/blattwerk-kalender/blattwerk/`;
    expect(ncTeamKalenderUrl(eigen)).toBe(eigen);
  });

  it("fasst fremde Kalender nicht an", () => {
    expect(ncTeamKalenderUrl(`${NC}/max/personal/`)).toBe(`${NC}/max/personal/`);
    expect(ncTeamKalenderUrl("")).toBe("");
  });
});

describe("ncFindTeamKalender", () => {
  const privat = { name: "Blattwerk (Max Muster)", url: `${NC}/max/blattwerk_shared_by_max/`, writable: true };
  const team = { name: "Blattwerk (blattwerk-kalender)", url: `${NC}/max/blattwerk_shared_by_blattwerk-kalender/`, writable: true };

  it("nimmt den Team-Kalender, auch wenn der private zuerst kommt", () => {
    expect(ncFindTeamKalender([privat, team])).toBe(team);
  });

  it("faellt auf den Namen zurueck, wenn es den Team-Kalender nicht gibt", () => {
    expect(ncFindTeamKalender([privat])).toBe(privat);
  });

  it("waehlt nichts, wenn nichts passt", () => {
    expect(ncFindTeamKalender([{ name: "Privat", url: `${NC}/max/personal/`, writable: true }])).toBeUndefined();
    expect(ncFindTeamKalender([])).toBeUndefined();
  });
});
