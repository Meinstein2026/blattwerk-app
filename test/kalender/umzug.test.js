// Der Blattwerk-Kalender ist am 06.08.2026 von Max' Privatkonto auf das
// Besitzer-Konto `blattwerk-kalender` umgezogen. Geraete schicken ihre alte,
// gespeicherte Adresse weiter mit — der Server biegt sie um.
import { describe, expect, it } from "vitest";
import { resolveCalendarUrl } from "../../server.mjs";

const NC = "https://nextcloud.example.org/remote.php/dav/calendars";

describe("resolveCalendarUrl", () => {
  it("hebt Max' eigenen alten Kalender auf seine Freigabe-Sicht", () => {
    expect(resolveCalendarUrl(`${NC}/max/blattwerk/`)).toBe(
      `${NC}/max/blattwerk_shared_by_blattwerk-kalender`
    );
  });

  it("hebt die alte Freigabe-Sicht eines Mitglieds auf die neue", () => {
    expect(resolveCalendarUrl(`${NC}/erika.beispiel/blattwerk_shared_by_max`)).toBe(
      `${NC}/erika.beispiel/blattwerk_shared_by_blattwerk-kalender`
    );
  });

  it("laesst den Pfad des Besitzers unveraendert", () => {
    const eigen = `${NC}/blattwerk-kalender/blattwerk`;
    expect(resolveCalendarUrl(eigen + "/")).toBe(eigen);
  });

  it("laesst fremde Kalender in Ruhe und schneidet nur den Schraegstrich ab", () => {
    const fremd = `${NC}/max/personal`;
    expect(resolveCalendarUrl(fremd + "/")).toBe(fremd);
    expect(resolveCalendarUrl(`${NC}/max/blattwerk-archiv`)).toBe(`${NC}/max/blattwerk-archiv`);
    expect(resolveCalendarUrl("")).toBe("");
  });
});
