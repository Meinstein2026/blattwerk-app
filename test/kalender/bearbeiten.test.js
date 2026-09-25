// Termine bearbeiten: das bestehende ICS wird umgeschrieben, nicht neu gebaut.
// Neu bauen kennt nur Titel/Zeit/Ort/Notiz und wuerde alles andere loeschen —
// allen voran die Zu-/Absagen, die genau in diesem ICS stehen. (07.08.2026)
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};
// icalUnfold steht erst hinter dem Abschnitt, wird aber darin benutzt.
const quelle = schnitt("const icalUnfold =", "const parseIcalDate")
  + schnitt("const ics2 = (n)", "/** Bestehenden Termin aendern");
const sandbox = {};
vm.createContext(sandbox);
const { icsAendern, icsIstReihe } = vm.runInContext(
  quelle.replace(/^export /gm, "") + "\n({ icsAendern, icsIstReihe })", sandbox);

const UID = "blattwerk-cal-1@blattwerk";
const ZUSAGE = "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Max Muster:mailto:max@blattwerk.app";
const ABSAGE = "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;CN=Erika Beispiel:mailto:erika@blattwerk.app";
const ics = (...extra) => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
  "UID:" + UID, "DTSTAMP:20260801T090000Z",
  "DTSTART:20260815T073000Z", "DTEND:20260815T093000Z",
  "SUMMARY:Boenstadt", "LOCATION:Boenstadt", "DESCRIPTION:Heckenschnitt",
  ZUSAGE, ABSAGE, ...extra,
  "END:VEVENT", "END:VCALENDAR",
].join("\r\n");

const NEU = {
  title: "Bönstadt (verschoben)", location: "Bönstadt Nord", note: "Heckenschnitt + Abfuhr",
  startSec: Math.floor(Date.UTC(2026, 7, 20, 8, 0, 0) / 1000),
  endSec: Math.floor(Date.UTC(2026, 7, 20, 11, 0, 0) / 1000),
  allDay: false,
};
const JETZT = new Date(Date.UTC(2026, 7, 7, 14, 30, 0));
const zeilen = (t) => t.split("\r\n");

describe("icsAendern — was sich aendern soll", () => {
  const out = icsAendern(ics(), UID, NEU, JETZT);

  it("ersetzt Titel, Ort und Notiz", () => {
    expect(zeilen(out)).toContain("SUMMARY:Bönstadt (verschoben)");
    expect(zeilen(out)).toContain("LOCATION:Bönstadt Nord");
    expect(zeilen(out)).toContain("DESCRIPTION:Heckenschnitt + Abfuhr");
  });

  it("ersetzt Anfang und Ende", () => {
    expect(zeilen(out)).toContain("DTSTART:20260820T080000Z");
    expect(zeilen(out)).toContain("DTEND:20260820T110000Z");
  });

  it("laesst keine alten Werte stehen", () => {
    expect(out).not.toContain("SUMMARY:Boenstadt");
    expect(out).not.toContain("DTSTART:20260815T073000Z");
    expect(out).not.toContain("DESCRIPTION:Heckenschnitt\r\n");
  });

  it("zaehlt SEQUENCE hoch und setzt die Zeitstempel neu", () => {
    expect(zeilen(out)).toContain("SEQUENCE:1");
    expect(zeilen(out)).toContain("DTSTAMP:20260807T143000Z");
    expect(zeilen(out)).toContain("LAST-MODIFIED:20260807T143000Z");
    expect(out).not.toContain("DTSTAMP:20260801T090000Z");
  });

  it("zaehlt eine vorhandene SEQUENCE weiter", () => {
    const o = icsAendern(ics("SEQUENCE:4"), UID, NEU, JETZT);
    expect(zeilen(o)).toContain("SEQUENCE:5");
    expect(zeilen(o).filter((l) => l.startsWith("SEQUENCE:"))).toHaveLength(1);
  });

  it("schreibt Ganztags-Termine als reines Datum", () => {
    const o = icsAendern(ics(), UID, {
      ...NEU, allDay: true,
      startSec: Math.floor(Date.UTC(2026, 8, 14) / 1000),
      endSec: Math.floor(Date.UTC(2026, 8, 16) / 1000),
    }, JETZT);
    expect(zeilen(o)).toContain("DTSTART;VALUE=DATE:20260914");
    expect(zeilen(o)).toContain("DTEND;VALUE=DATE:20260916");
  });

  it("maskiert Sonderzeichen (Komma, Semikolon, Zeilenumbruch)", () => {
    const o = icsAendern(ics(), UID, { ...NEU, title: "Hecke, Baum; hinten", note: "Zeile1\nZeile2" }, JETZT);
    expect(zeilen(o)).toContain("SUMMARY:Hecke\\, Baum\\; hinten");
    expect(zeilen(o)).toContain("DESCRIPTION:Zeile1\\nZeile2");
  });

  it("laesst Ort und Notiz weg, wenn sie geleert wurden", () => {
    const o = icsAendern(ics(), UID, { ...NEU, location: "", note: "" }, JETZT);
    expect(o).not.toMatch(/^LOCATION:/m);
    expect(o).not.toMatch(/^DESCRIPTION:/m);
  });
});

describe("icsAendern — was erhalten bleiben MUSS", () => {
  it("behaelt beide Zu-/Absagen unveraendert", () => {
    const out = icsAendern(ics(), UID, NEU, JETZT);
    expect(zeilen(out)).toContain(ZUSAGE);
    expect(zeilen(out)).toContain(ABSAGE);
  });

  it("behaelt die Wiederholungsregel", () => {
    const out = icsAendern(ics("RRULE:FREQ=WEEKLY;BYDAY=MO"), UID, NEU, JETZT);
    expect(zeilen(out)).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
  });

  it("behaelt Organisator und Kategorien", () => {
    const out = icsAendern(ics("ORGANIZER;CN=Blattwerk:mailto:team@blattwerk.app", "CATEGORIES:Baum"), UID, NEU, JETZT);
    expect(zeilen(out)).toContain("ORGANIZER;CN=Blattwerk:mailto:team@blattwerk.app");
    expect(zeilen(out)).toContain("CATEGORIES:Baum");
  });

  it("fasst eine Erinnerung nicht an — auch nicht deren DESCRIPTION", () => {
    // Der subtile Fall: VALARM enthaelt selbst DESCRIPTION und TRIGGER. Wer
    // stumpf alle DESCRIPTION-Zeilen ersetzt, zerlegt die Erinnerung.
    const out = icsAendern(
      ics("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Erinnerung", "TRIGGER:-PT15M", "END:VALARM"),
      UID, NEU, JETZT);
    expect(zeilen(out)).toContain("BEGIN:VALARM");
    expect(zeilen(out)).toContain("DESCRIPTION:Erinnerung");
    expect(zeilen(out)).toContain("TRIGGER:-PT15M");
    expect(zeilen(out)).toContain("END:VALARM");
    // ...und die echte Notiz des Termins steht trotzdem drin
    expect(zeilen(out)).toContain("DESCRIPTION:Heckenschnitt + Abfuhr");
  });

  it("aendert nur das VEVENT mit der passenden UID", () => {
    const zwei = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "BEGIN:VEVENT", "UID:anderer@blattwerk", "DTSTART:20260901T080000Z", "SUMMARY:Finger weg", "END:VEVENT",
      "BEGIN:VEVENT", "UID:" + UID, "DTSTART:20260815T073000Z", "SUMMARY:Boenstadt", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const out = icsAendern(zwei, UID, NEU, JETZT);
    expect(zeilen(out)).toContain("SUMMARY:Finger weg");
    expect(zeilen(out)).toContain("DTSTART:20260901T080000Z");
    expect(zeilen(out)).toContain("SUMMARY:Bönstadt (verschoben)");
  });

  it("behaelt den Kalender-Rahmen", () => {
    const out = icsAendern(ics(), UID, NEU, JETZT);
    expect(zeilen(out)[0]).toBe("BEGIN:VCALENDAR");
    expect(zeilen(out)[zeilen(out).length - 1]).toBe("END:VCALENDAR");
    expect(zeilen(out)).toContain("UID:" + UID);
  });
});

describe("icsIstReihe", () => {
  it("erkennt eine Wiederholung", () => {
    expect(icsIstReihe(ics("RRULE:FREQ=WEEKLY"))).toBe(true);
  });

  it("meldet bei einem einzelnen Termin nichts", () => {
    expect(icsIstReihe(ics())).toBe(false);
    expect(icsIstReihe("")).toBe(false);
    expect(icsIstReihe(null)).toBe(false);
  });
});

describe("Identitaet der Zu-/Absage", () => {
  // Die ATTENDEE-Zeile traegt Name und Mail aus Dolibarr. `buildPermissions`
  // hat die Mail frueher weggeworfen, dann griff die Ersatzadresse
  // <login>@blattwerk.app — die zu keinem echten Postfach gehoert.
  const perm = schnitt("const buildPermissions = (u, mandant)", "// A record may be deleted");
  const rsvp = schnitt("const rsvpName = (me)", "// Zu-/Absage (wie SPD Maps)");

  it("reicht die Mail aus /users/info durch", () => {
    expect(perm).toMatch(/email:\s*u\?\.email/);
  });

  it("nimmt die echte Adresse, wenn sie da ist", () => {
    const sb2 = {};
    vm.createContext(sb2);
    const { rsvpEmail, rsvpName } = vm.runInContext(
      rsvp.replace(/^export /gm, "") + "\n({ rsvpEmail, rsvpName })", sb2);
    const me = { login: "max", firstname: "Max", lastname: "Muster", email: "max@example.org" };
    expect(rsvpEmail(me)).toBe("max@example.org");
    expect(rsvpName(me)).toBe("Max Muster");
  });

  it("faellt ohne Mail weiterhin auf die Ersatzadresse zurueck", () => {
    const sb3 = {};
    vm.createContext(sb3);
    const { rsvpEmail } = vm.runInContext(
      rsvp.replace(/^export /gm, "") + "\n({ rsvpEmail })", sb3);
    expect(rsvpEmail({ login: "erika", email: "" })).toBe("erika@blattwerk.app");
  });
});
