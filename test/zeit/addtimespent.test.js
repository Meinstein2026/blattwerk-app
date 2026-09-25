// Zeiterfassung ging ueber die REST-API zunaechst gar nicht: POST
// /tasks/{id}/addtimespent antwortete mit HTTP 500 und leerem Body — mit und
// ohne user_id, an jeder Aufgabe.
//
// Die Ursache liegt NICHT in dieser App und nicht bei den Rechten. Dolibarr
// 23.0.2 stirbt schon in Restlers Parameter-Pruefung, bevor die Methode
// ueberhaupt laeuft:
//
//   PHP Fatal error: Uncaught TypeError: Illegal offset type in isset or empty
//     in Luracast/Restler/Data/Validator.php:427   (Restler->validate())
//
// Der Docblock von `addTimeSpent` deklarierte zwei Union-Typen
// (`@param datetime|string $date` und `@param int|null $progress`). Restler
// macht daraus einen Array-Typ, und `isset($array[$array])` ist der Fatal.
// Behoben am 10.08.2026 durch Aendern der beiden Docblock-Zeilen im Container
// auf `string` bzw. `int` — eine reine Dokumentationsaenderung, das Verhalten
// von $progress (Vorgabe -1, Pruefung auf null) bleibt unberuehrt. Danach:
// {"success":{"code":200,"message":"Time spent added"}}.
//
// ACHTUNG: /var/www/html ist KEIN Bind-Mount und das Image laeuft auf dem
// rollenden Tag dolibarr/dolibarr:23 — der Patch ueberlebt `docker restart`,
// aber kein Image-Update. Nach jedem Dolibarr-Update neu setzen, solange es
// upstream nicht behoben ist. Anleitung: brain/Knowledge/dolibarr-belegtexte.md
//
// ─────────────────────────────────────────────────────────────────────────────
// 12.08.2026 — § 17 MiLoG verlangt von jeder Schicht Beginn, Ende UND Dauer.
// Gebucht wurden bisher nur Datum und Dauer; zwei der drei Angaben fehlten.
//
// Der naheliegende Weg waere, die Uhrzeit einfach mitzuschicken. Dolibarrs
// eigener Docblock verspricht das auch ("YYYY-MM-DD HH:MI:SS in GMT", Beispiel
// im Kommentar), api_tasks.class.php setzt timespent_datehour und
// timespent_withhour=1, und projet/tasks/time.php:2231 wuerde daraus
// dol_print_date(…, 'dayhour') machen. Alles vorhanden.
//
// Trotzdem geht es nicht. Gegen die laufende Instanz geprueft:
//   POST {"date":"2026-08-12 05:30:00", …}
//   → 400 "Invalid value specified for `date`. Expecting date in `YYYY-MM-DD`"
//
// Restler traegt den Parameter wegen seines Namens als Typ `date` in den
// Routen-Cache ein (properties.type=date in /var/www/documents/api/temp/
// routes.php) und prueft mit Validator::date(), das nur `YYYY-MM-DD` durchlaesst
// — der Aufruf erreicht Dolibarrs Methode gar nicht erst. Von der App aus ist
// daran nichts zu drehen; es waere ein weiterer Docblock-Eingriff im Container,
// und davon haengt schon einer (siehe oben), der kein Image-Update ueberlebt.
//
// Geloest ist das jetzt mit einem eigenen Dolibarr-Modul, `blattwerkapp`, das
// den Parameter `datum` nennt statt `date` — damit greift die Namensregel nicht.
// Quelltext: ~/Dokumente/App-Entwicklung/Dolibarr-Zeit, installiert unter
// /srv/appdata/dolibarr/custom/blattwerkapp. Das Verzeichnis ist ein echter
// Bind-Mount und ueberlebt Image-Updates; der Docblock-Eingriff oben tut das
// nicht, und an so etwas darf ein gesetzlicher Nachweis nicht haengen. Die App
// ruft `addtimespent` seither gar nicht mehr auf.
//
// Am 12.08.2026 an der laufenden Instanz abgenommen: element_datehour = 07:30,
// element_date = 00:00 (Tagesspalte, DATE-Typ), withhour = 1. Probezeile danach
// per DELETE {id}/timespent/{lineid} wieder entfernt.
//
// Beginn und Ende stehen trotzdem zusaetzlich im Klartext in der Notiz. Dolibarr
// kennt kein Ende, und sobald eine Pause in der Buchung steckt, ist es aus
// Beginn + Dauer nicht mehr zu rekonstruieren.
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

const sandbox = {};
vm.createContext(sandbox);
const {
  zeitraumText, zeitNotiz, zeitpunktAus, spanneRechnen, pausenHinweis,
  fmtDauer, monatsGrenzen, nachTagen, nachtragGrenze, nachtragHinweis,
} = vm.runInContext(
  schnitt("const uhrzeit =", "const normalizeAgendaDate")
    + "\n({ zeitraumText, zeitNotiz, zeitpunktAus, spanneRechnen, pausenHinweis,"
    + "   fmtDauer, monatsGrenzen, nachTagen, nachtragGrenze, nachtragHinweis })",
  sandbox,
);

describe("Die Nutzlast beim Buchen", () => {
  const fn = schnitt("async function saveTimeSpent", "// Turn a raw Dolibarr API error");

  const route = schnitt("addTaskTimeSpent:", "\n");

  it("schneidet die Uhrzeit nicht mehr ab", () => {
    // Der Beginn ist eine der drei Angaben, die § 17 MiLoG verlangt.
    expect(fn).not.toContain("slice(0, 10)");
    expect(fn).toContain("datum: date");
  });

  it("bucht ueber das eigene Modul, nicht ueber addtimespent", () => {
    expect(route).toContain("/blattwerkapp/timespent");
    // Der Kern-Endpunkt darf in keiner gebauten URL mehr auftauchen. In
    // Kommentaren schon — dort steht, warum er nicht mehr benutzt wird.
    expect(route).not.toContain("addtimespent");
    expect(src).not.toMatch(/\/tasks\/\$\{[^}]+\}\/addtimespent/);
  });

  it("nennt den Parameter datum, nicht date", () => {
    // Genau daran haengt alles: Restler prueft einen Parameter namens `date`
    // wegen seines Namens als reines Datum (Routes.php:155, $fieldTypesByName).
    // Wer ihn hier umbenennt, bekommt 400 und verliert den Beginn wieder — und
    // zwar laut: das Modul prueft das Format serverseitig per Regex.
    expect(fn).toMatch(/datum:/);
  });
});

describe("Der Beginn geht nicht verloren, nur weil Dolibarr ihn nicht nimmt", () => {
  // Die eigentliche Absicherung gegen einen Rueckbau: wer den Zeitraum aus der
  // Notiz entfernt, weil er ihn fuer Deko haelt, macht die Aufzeichnung wieder
  // unvollstaendig — und zwar unsichtbar.
  const timer = schnitt("const stop = async () => {", "return { state, elapsed, saving");
  const maske = schnitt("function ManualTimeEntry(", "// ─── Expenses / Mileage");

  it("die Stoppuhr schreibt den Zeitraum in die Notiz", () => {
    expect(timer).toContain("zeitNotiz(zeitraumText(startedAt, endedAt), state.note)");
    expect(timer).not.toMatch(/note:\s*state\.note\s*\|\|/);
  });

  it("die manuelle Maske ebenfalls, samt Pause", () => {
    expect(maske).toContain("zeitNotiz(zeitraumText(spanne.beginn, spanne.ende, spanne.pause), note)");
  });
});

describe("Beginn und Ende in der Notiz", () => {
  // Dolibarr speichert Beginn und Dauer, aber kein Ende. Ohne Pause laesst es
  // sich ausrechnen, mit Pause nicht mehr — deshalb steht der Zeitraum zusaetzlich
  // im Klartext in der Spalte, die bei der Abrechnung ohnehin gelesen wird.
  const am = (hhmm) => zeitpunktAus("2026-08-12", hhmm);

  it("schreibt Von und Bis aus", () => {
    expect(zeitraumText(am("07:30"), am("11:45"))).toBe("07:30–11:45");
  });

  it("nennt die Pause, wenn es eine gab", () => {
    expect(zeitraumText(am("08:00"), am("16:30"), 45 * 60)).toBe("08:00–16:30, Pause 45 min");
  });

  it("setzt bei einer Nachtschicht das Datum ans Ende", () => {
    // "22:00–02:00" laese sich sonst, als haette die Schicht vor ihrem Beginn
    // geendet.
    const ende = zeitpunktAus("2026-08-13", "02:00");
    expect(zeitraumText(am("22:00"), ende)).toBe("22:00–13.08. 02:00");
  });

  it("stellt den Zeitraum vor die Beschreibung", () => {
    // Dolibarrs Notiz-Spalte schneidet lange Texte ab; die gesetzliche Angabe
    // muss der Teil sein, der stehen bleibt.
    expect(zeitNotiz("07:30–11:45", "Hecke Wagner")).toBe("07:30–11:45 · Hecke Wagner");
  });

  it("kommt ohne Beschreibung aus", () => {
    expect(zeitNotiz("07:30–11:45", "")).toBe("07:30–11:45");
  });

  it("bleibt nicht leer, wenn beides fehlt", () => {
    expect(zeitNotiz("", "")).toBe("Zeiterfassung");
  });
});

describe("Die Spanne einer nachgetragenen Schicht", () => {
  it("zieht die Pause von der Anwesenheit ab", () => {
    const s = spanneRechnen("2026-08-12", "08:00", "16:00", 30);
    expect(s.brutto).toBe(8 * 3600);
    expect(s.dauer).toBe(8 * 3600 - 30 * 60);
  });

  it("liest ein frueheres Bis als Nachtschicht, nicht als Tippfehler", () => {
    const s = spanneRechnen("2026-08-12", "22:00", "02:00", 0);
    expect(s.dauer).toBe(4 * 3600);
  });

  it("weist eine Pause zurueck, die die Schicht auffrisst", () => {
    const s = spanneRechnen("2026-08-12", "08:00", "09:00", 60);
    expect(s.fehler).toBeTruthy();
    expect(s.dauer).toBeUndefined();
  });

  it("verlangt Beginn und Ende", () => {
    expect(spanneRechnen("2026-08-12", "", "16:00", 0).fehler).toBeTruthy();
    expect(spanneRechnen("", "08:00", "16:00", 0).fehler).toBeTruthy();
  });

  it("baut den Zeitpunkt in der Zeitzone des Geraets", () => {
    // Nicht UTC: § 17 MiLoG meint die Uhr, auf die die Person geschaut hat.
    // fmtDoliDateTime rechnet danach nach GMT um, das ist die andere Baustelle.
    const t = new Date(zeitpunktAus("2026-08-12", "07:30"));
    expect(t.getHours()).toBe(7);
    expect(t.getMinutes()).toBe(30);
  });
});

describe("Der Pausenhinweis", () => {
  // § 4 ArbZG. Der Eintrag wird nicht aufgehalten — wer durchgearbeitet hat,
  // soll das eintragen koennen, statt es sich passend zu rechnen.
  it("schweigt bei einer kurzen Schicht", () => {
    expect(pausenHinweis(4 * 3600, 0)).toBe("");
  });

  it("meldet sich ab mehr als sechs Stunden ohne halbe Stunde Pause", () => {
    expect(pausenHinweis(7 * 3600, 15 * 60)).toMatch(/30 Minuten/);
  });

  it("verlangt ab mehr als neun Stunden dreiviertel Stunde", () => {
    expect(pausenHinweis(10 * 3600, 30 * 60)).toMatch(/45 Minuten/);
  });

  it("ist zufrieden, wenn die Pause reicht", () => {
    expect(pausenHinweis(8 * 3600, 30 * 60)).toBe("");
  });
});

describe("Was die Fehlermeldung sagt", () => {
  const fn = schnitt("const doliError = (e)", "const isOpenProject");

  it("schickt nicht mehr auf die Rechte-Faehrte", () => {
    // Der alte Text riet, das Recht „Zeit erfassen" zu pruefen. Damit haette
    // man beliebig lange gesucht: der Aufruf kam nie bei Dolibarrs Rechte-
    // pruefung an, er starb vorher in Restler.
    expect(fn).not.toContain("das Recht „Zeit erfassen\"");
    expect(src).not.toContain("Bitte prüfen, ob der API-Benutzer das Recht");
  });

  it("zeigt auf die Stelle, an der es heute haengen kann", () => {
    // Frueher stand hier der Dolibarr-Fehler in addtimespent. Seit die App ueber
    // das eigene Modul bucht, ist ein leerer 500er ein anderes Problem — am
    // ehesten ein Modul, das nach einem Update fehlt oder abgeschaltet ist.
    expect(fn).toMatch(/BlattwerkZeit/);
  });

  it("sagt, dass ein erneuter Versuch nicht hilft", () => {
    expect(fn).toMatch(/nicht.*ein erneuter Versuch/s);
  });
});

describe("Die manuelle Maske", () => {
  const maske = schnitt("function ManualTimeEntry(", "// ─── Expenses / Mileage");

  it("fragt Beginn und Ende ab, keine blosse Stundenzahl", () => {
    expect(maske).toContain('<TimeField');
    expect(maske).not.toMatch(/label>Stunden<\/label/);
  });

  it("erfindet keine Uhrzeit mehr", () => {
    // fmtManualDate setzte jede nachgetragene Schicht auf 12:00 GMT.
    expect(src).not.toContain("const fmtManualDate");
    expect(maske).not.toContain("fmtManualDate");
  });

  it("laesst nicht speichern, solange etwas dagegen spricht", () => {
    // `sperre` fasst drei Gruende zusammen: Spanne geht nicht auf, zu weit
    // zurueck, in der Zukunft.
    expect(maske).toContain("disabled={saving||!!sperre}");
    expect(maske).toContain("if(sperre){showToast(sperre,\"error\");return;}");
  });

  it("begrenzt das Datumsfeld auf den erlaubten Zeitraum", () => {
    // Ohne min/max stuende die Grenze nur in der Pruefung — man koennte ein
    // Datum von 2019 eintippen und bekaeme erst beim Speichern eine Absage.
    expect(maske).toMatch(/min=\{`\$\{frueheste/);
    expect(maske).toContain("max={todayISO()}");
  });
});

describe("Nachtragen: wie weit zurueck", () => {
  // Entscheidung vom 12.08.2026: bis zum Ersten des Vormonats. Weit genug, um
  // einen vergessenen Tag vor der Abrechnung zu retten; nicht so weit, dass aus
  // dem Korrekturweg eine Sammelerfassung am Jahresende wird.
  it("reicht bis zum Ersten des Vormonats", () => {
    const g = nachtragGrenze(new Date(2026, 7, 12));
    expect(g.getFullYear()).toBe(2026);
    expect(g.getMonth()).toBe(6);
    expect(g.getDate()).toBe(1);
  });

  it("rechnet ueber den Jahreswechsel richtig", () => {
    const g = nachtragGrenze(new Date(2027, 0, 5));
    expect(g.getFullYear()).toBe(2026);
    expect(g.getMonth()).toBe(11);
  });

  it("weist auf die Sieben-Tage-Frist hin, ohne zu sperren", () => {
    // § 17 MiLoG will die Aufzeichnung binnen sieben Tagen. Ein fehlender
    // Eintrag ist schlechter als ein verspaeteter — deshalb nur ein Hinweis.
    const heute = new Date(2026, 7, 20);
    expect(nachtragHinweis(new Date(2026, 7, 19).getTime(), heute)).toBe("");
    expect(nachtragHinweis(new Date(2026, 7, 13).getTime(), heute)).toBe("");
    expect(nachtragHinweis(new Date(2026, 7, 10).getTime(), heute)).toMatch(/sieben Tagen/);
  });
});

describe("Die Monatsuebersicht", () => {
  it("nimmt die lokale Monatsgrenze, nicht die von UTC", () => {
    // Sonst fielen die ersten Stunden des Ersten in den Vormonat — und der
    // Monat ist das, was auf der Lohnabrechnung steht.
    const { von, bis } = monatsGrenzen(2026, 7);
    expect(von.getDate()).toBe(1);
    expect(von.getHours()).toBe(0);
    expect(bis.getMonth()).toBe(7);
    expect(bis.getDate()).toBe(31);
    expect(bis.getHours()).toBe(23);
  });

  it("trifft auch den Februar", () => {
    expect(monatsGrenzen(2026, 1).bis.getDate()).toBe(28);
    expect(monatsGrenzen(2028, 1).bis.getDate()).toBe(29);
  });

  it("buendelt nach Kalendertagen und summiert je Tag", () => {
    const t = (tag, stunde) => Math.floor(new Date(2026, 7, tag, stunde).getTime() / 1000);
    const tage = nachTagen([
      { id: 1, beginn: t(10, 8), dauer: 3600 },
      { id: 2, beginn: t(10, 13), dauer: 1800 },
      { id: 3, beginn: t(11, 9), dauer: 7200 },
    ]);
    expect(tage.length).toBe(2);
    // Neueste zuerst — beim Nachlesen sucht niemand von unten.
    expect(tage[0].dauer).toBe(7200);
    expect(tage[1].dauer).toBe(5400);
    expect(tage[1].zeilen.length).toBe(2);
  });

  it("kommt mit gar keinen Zeilen zurecht", () => {
    expect(nachTagen(undefined)).toEqual([]);
    expect(nachTagen([])).toEqual([]);
  });

  it("schreibt Summen als Stunden, nicht als Stoppuhr", () => {
    expect(fmtDauer(7.5 * 3600)).toBe("7:30 h");
    expect(fmtDauer(0)).toBe("0:00 h");
    expect(fmtDauer(37 * 3600 + 15 * 60)).toBe("37:15 h");
  });
});

describe("Wer die Uebersicht zu sehen bekommt", () => {
  const client = schnitt("getMeineZeiten:", "// Projects");

  it("fragt den eigenen Endpunkt ohne Benutzer-Parameter", () => {
    // Der Endpunkt liefert immer die Zeiten der Person, deren Schluessel den
    // Aufruf macht. Ein Benutzer-Parameter waere die Stelle, an der aus der
    // eigenen Uebersicht der Blick auf fremde Arbeitszeiten wird.
    expect(client).toContain("/blattwerkapp/meine?von=");
    expect(client).not.toMatch(/benutzer=|user_id=|fk_user/);
  });
});
