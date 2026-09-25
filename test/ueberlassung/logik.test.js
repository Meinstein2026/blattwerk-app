// Fahrzeug-Ueberlassungsvereinbarung (09.09.2026): wer den Firmenwagen faehrt
// (auch Externe), unterschreibt vorher — Halterpflichten nach § 21 StVG
// (Fuehrerschein im Original gesehen), Pflichten, Selbstbeteiligung.
import { describe, expect, it } from "vitest";
import {
  UEB_STORE_LEER, UEB_PFLICHTEN, UEB_FS_KLASSEN, UEB_SELBSTBETEILIGUNG_STANDARD,
  uebFehlt, uebStatus, uebEintragen, uebWiderrufen, uebFahrerNamen, uebDateiname, uebStatusLabel,
} from "../../src/ueberlassung.js";

const v = (x = {}) => ({
  id: "u1", fahrzeugId: "fiat", fahrzeug: "Fiat Ducato · MU-ST 2001",
  name: "Max Extern", anschrift: "Hauptstr. 1, 12345 Musterstadt", geburtsdatum: "1990-05-04", verhaeltnis: "extern",
  fsKlasse: "B", fsNummer: "J123456789", fsGesehenAm: "2026-09-09", fsGesehenDurch: "Max Muster",
  von: "2026-09-10", bis: "", unbefristet: true,
  selbstbeteiligung: 500, pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, true])),
  ...x,
});

describe("Stammdaten", () => {
  it("Store, Pflichten, Klassen, Selbstbeteiligung", () => {
    expect(UEB_STORE_LEER).toEqual({ version: 1, vereinbarungen: [] });
    expect(UEB_PFLICHTEN.map((p) => p.id)).toEqual(expect.arrayContaining(["fahrtenbuch", "schaeden", "bussgelder", "selbstbeteiligung", "alkohol", "rueckgabe", "betrieblich"]));
    expect(UEB_FS_KLASSEN).toContain("B");
    expect(UEB_SELBSTBETEILIGUNG_STANDARD).toBe(500);
  });
});

describe("uebFehlt", () => {
  it("vollstaendig -> nichts fehlt", () => expect(uebFehlt(v())).toEqual([]));
  it("nennt jedes fehlende Pflichtfeld", () => {
    const f = uebFehlt(v({ name: "", anschrift: "", geburtsdatum: "", fsKlasse: "", fsNummer: "", fsGesehenAm: "", fsGesehenDurch: "", von: "" }));
    for (const w of ["Name", "Anschrift", "Geburtsdatum", "Führerscheinklasse", "Führerscheinnummer", "im Original gesehen", "durch wen", "Beginn"]) {
      expect(f.join(" | ")).toMatch(new RegExp(w));
    }
  });
  it("neue Pflichtfelder der Papiervorlage", () => {
    expect(uebFehlt(v({ verhaeltnis: "" })).join()).toMatch(/Verhältnis/);
    // km-Stand ist freiwillig (oft vor der Schluesseluebergabe unterschrieben),
    // muss aber eine Zahl sein, wenn er dasteht.
    expect(uebFehlt(v({ kmUebergabe: "" }))).toEqual([]);
    expect(uebFehlt(v({ kmUebergabe: 84210 }))).toEqual([]);
    expect(uebFehlt(v({ kmUebergabe: "viele" })).join()).toMatch(/km-Stand/);
    expect(uebFehlt(v({ kmUebergabe: -5 })).join()).toMatch(/km-Stand/);
  });
  it("Ende vor Beginn, negative Selbstbeteiligung, nicht bestaetigte Pflichten", () => {
    expect(uebFehlt(v({ unbefristet: false, bis: "2026-09-01" })).join()).toMatch(/Ende/);
    expect(uebFehlt(v({ unbefristet: false, bis: "" })).join()).toMatch(/Ende/);
    expect(uebFehlt(v({ selbstbeteiligung: -1 })).join()).toMatch(/Selbstbeteiligung/);
    expect(uebFehlt(v({ pflichten: { fahrtenbuch: true } })).join()).toMatch(/Pflichten/);
    expect(uebFehlt(v({ fsGesehenAm: "2099-01-01" })).join()).toMatch(/Zukunft/);
  });
});

describe("uebStatus", () => {
  it("gueltig / kuenftig / abgelaufen / widerrufen", () => {
    expect(uebStatus(v(), "2026-09-15")).toBe("gueltig");
    expect(uebStatus(v(), "2026-09-09")).toBe("kuenftig");
    expect(uebStatus(v({ unbefristet: false, bis: "2026-12-31" }), "2027-01-01")).toBe("abgelaufen");
    expect(uebStatus(v({ unbefristet: false, bis: "2026-12-31" }), "2026-12-31")).toBe("gueltig");
    expect(uebStatus(v({ widerrufenAm: "2026-10-01T10:00:00.000Z" }), "2026-10-02")).toBe("widerrufen");
    expect(uebStatusLabel("gueltig")).toBe("gültig");
    expect(uebStatusLabel("abgelaufen")).toBe("abgelaufen");
    expect(uebStatusLabel("widerrufen")).toBe("widerrufen");
  });
});

describe("Ablage (rein)", () => {
  const jetzt = "2026-09-09T12:00:00.000Z";
  it("eintragen ist additiv, setzt Erfassung, nimmt keine Unterschriften mit", () => {
    const s1 = uebEintragen(UEB_STORE_LEER, { ...v(), sigFahrer: "data:image/jpeg;base64,xxx", sigBlattwerk: "data:..." }, { jetzt, login: "max", datei: "x.pdf", ncPfad: "Blattwerk/Fahrtenbuch/Ueberlassungen/2026/x.pdf" });
    expect(s1.vereinbarungen).toHaveLength(1);
    expect(s1.vereinbarungen[0]).toMatchObject({ id: "u1", name: "Max Extern", erfasstAm: jetzt, erfasstVon: "max", datei: "x.pdf" });
    expect(s1.vereinbarungen[0].sigFahrer).toBeUndefined();
    // Die Allowlist FELDER muss jedes neue Feld kennen, sonst zeigt das PDF es
    // und die abgelegte JSON nicht.
    const voll = uebEintragen(UEB_STORE_LEER, v({ id: "uf", verhaeltnis: "Aushilfe", fsAusgestelltAm: "2015-03-12", fsAusgestelltDurch: "Landkreis Gießen", kmUebergabe: 84210, telefon: "0641 1", bemerkung: "x", blattwerkVertreter: "Max" }), { jetzt, login: "max" });
    expect(voll.vereinbarungen[0]).toMatchObject({ verhaeltnis: "Aushilfe", fsAusgestelltAm: "2015-03-12", fsAusgestelltDurch: "Landkreis Gießen", kmUebergabe: 84210, telefon: "0641 1", bemerkung: "x", blattwerkVertreter: "Max" });
    const s2 = uebEintragen(s1, v({ id: "u2", name: "Anna" }), { jetzt, login: "max" });
    expect(s2.vereinbarungen.map((x) => x.id)).toEqual(["u1", "u2"]);
    expect(() => uebEintragen(s2, v({ id: "u1" }), { jetzt, login: "max" })).toThrow(/gibt es schon/);
    expect(() => uebEintragen(s2, v({ id: "u3", name: "" }), { jetzt, login: "max" })).toThrow(/Name/);
  });
  it("widerrufen markiert, loescht nicht", () => {
    const s1 = uebEintragen(UEB_STORE_LEER, v(), { jetzt, login: "max" });
    const s2 = uebWiderrufen(s1, "u1", { jetzt: "2026-10-01T10:00:00.000Z", login: "erika", grund: "Fahrer ausgeschieden" });
    expect(s2.vereinbarungen[0]).toMatchObject({ widerrufenAm: "2026-10-01T10:00:00.000Z", widerrufenVon: "erika", widerrufGrund: "Fahrer ausgeschieden" });
    expect(() => uebWiderrufen(s2, "u9", { jetzt, login: "erika", grund: "x" })).toThrow(/nicht gefunden/);
    expect(() => uebWiderrufen(s1, "u1", { jetzt, login: "erika", grund: "" })).toThrow(/Grund/);
  });
  it("Fahrernamen: nur gueltige (und kuenftige) Vereinbarungen, je Fahrzeug", () => {
    let s = uebEintragen(UEB_STORE_LEER, v(), { jetzt, login: "max" });
    s = uebEintragen(s, v({ id: "u2", name: "Alt Fahrer", von: "2025-01-01", unbefristet: false, bis: "2026-01-31" }), { jetzt, login: "max" });
    s = uebEintragen(s, v({ id: "u3", name: "Anhänger Fahrer", fahrzeugId: "anh" }), { jetzt, login: "max" });
    s = uebWiderrufen(uebEintragen(s, v({ id: "u4", name: "Weg Fahrer" }), { jetzt, login: "max" }), "u4", { jetzt, login: "max", grund: "x" });
    expect(uebFahrerNamen(s, { heute: "2026-09-15", fahrzeugId: "fiat" })).toEqual(["Max Extern"]);
    expect(uebFahrerNamen(s, { heute: "2026-09-15" })).toEqual(["Anhänger Fahrer", "Max Extern"]);
  });
  it("Dateiname ohne Sonderzeichen", () => {
    expect(uebDateiname(v({ name: "Max Müller/Extern" }))).toBe("Ueberlassung_MU-ST-2001_Max-Mueller-Extern_2026-09-10.pdf");
  });
});
