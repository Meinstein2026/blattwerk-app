// Abnahme gegen die laufende Dolibarr-Instanz.
//
// Die Tests in addtimespent.test.js pruefen den Quelltext — sie sehen, dass dort
// `datum:` steht und die Route auf /blattwerkzeit/timespent zeigt. Was sie NICHT
// sehen: ob Dolibarr die so gebaute Nutzlast auch annimmt und den Beginn behaelt.
// Genau das ist bei dieser Sache die interessante Frage, denn der Grund fuer das
// eigene Modul war ja, dass eine plausibel aussehende Nutzlast mit 400 abprallt.
//
// Dieses Skript nimmt deshalb die ECHTEN Funktionen aus dolibarr-app.jsx, baut
// die Buchung so, wie die Stoppuhr und die manuelle Maske es tun, schickt sie an
// die echte Instanz, liest sie zurueck und raeumt hinterher auf.
//
// Bewusst nicht Teil von `npm test`: es braucht Netz, einen Schluessel und es
// schreibt (kurz) in die Produktivdatenbank. Endung .mjs statt .test.js, damit
// vitest es nicht einsammelt.
//
//   DOLAPIKEY=… node test/zeit/abnahme-live.mjs
//
// Voraussetzung: Erreichbarkeit von dolibarr.example.org, also LAN
// Standort 1 oder NetBird.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const BASIS = process.env.DOLIBARR_URL || "https://dolibarr.example.org/api/index.php";
const KEY = process.env.DOLAPIKEY;
const AUFGABE = Number(process.env.TASK_ID || 1);

if (!KEY) {
  console.error("DOLAPIKEY fehlt. Aufruf: DOLAPIKEY=… node test/zeit/abnahme-live.mjs");
  process.exit(2);
}

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};

// Die echten Funktionen der App, nicht nachgebaute. Wenn jemand sie aendert,
// aendert sich damit auch, was hier abgenommen wird.
const sandbox = {};
vm.createContext(sandbox);
const app = vm.runInContext(
  schnitt("const fmtDoliDateTime =", "\nconst normalizeAgendaDate")
    + "\n" + schnitt("async function saveTimeSpent", "// Turn a raw Dolibarr API error")
    + "\n({ fmtDoliDateTime, zeitraumText, zeitNotiz, zeitpunktAus, spanneRechnen, saveTimeSpent,"
    + "   monatsGrenzen, nachTagen, fmtDauer })",
  sandbox,
);

// Auch die Routen kommen aus dem Quelltext — sonst prueft das Skript Adressen,
// die die App vielleicht gar nicht mehr benutzt.
const routeTreffer = src.match(/addTaskTimeSpent:\s*\(data\)\s*=>\s*call\("POST",\s*"([^"]+)"/);
if (!routeTreffer) throw new Error("Route von addTaskTimeSpent nicht im Quelltext gefunden");
const ROUTE = routeTreffer[1];

const leseRoute = src.match(/getMeineZeiten:[\s\S]{0,200}?call\("GET",\s*`([^`]+)`/);
if (!leseRoute) throw new Error("Route von getMeineZeiten nicht im Quelltext gefunden");
// `${encodeURIComponent(von)}` usw. durch Platzhalter ersetzen, den Rest so lassen.
const LESE_ROUTE = (von, bis) => leseRoute[1]
  .replace("${encodeURIComponent(von)}", encodeURIComponent(von))
  .replace("${encodeURIComponent(bis)}", encodeURIComponent(bis));

const ruf = async (methode, pfad, koerper) => {
  const antwort = await fetch(BASIS + pfad, {
    method: methode,
    headers: { DOLAPIKEY: KEY, "Content-Type": "application/json" },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  const text = await antwort.text();
  if (!antwort.ok) throw new Error(`API Error ${antwort.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};

// Genau das Objekt, das die App an saveTimeSpent uebergibt.
const api = { addTaskTimeSpent: (data) => ruf("POST", ROUTE, data) };

let pass = 0, fail = 0;
const pruefe = (ok, was, detail = "") => {
  if (ok) { pass++; console.log("  ok   " + was); return; }
  fail++;
  console.log("  FAIL " + was);
  if (detail) console.log("       " + detail);
};

const zeilen = () => ruf("GET", `/tasks/${AUFGABE}/timespent`);
const aufraeumen = [];

const tag = new Date().toISOString().slice(0, 10);

try {
  console.log(`Abnahme gegen ${BASIS}`);
  console.log(`Route aus dem Quelltext: POST ${ROUTE}`);
  console.log(`Aufgabe ${AUFGABE}, Tag ${tag}\n`);

  const vorher = (await zeilen()).length;

  // ── Fall 1: Stoppuhr ─────────────────────────────────────────────────────
  // 07:30 gestartet, 11:00 gestoppt, keine Pause — so, wie useTimeTracker.stop()
  // die Werte zusammensetzt.
  console.log("Stoppuhr 07:30–11:00");
  const beginn = app.zeitpunktAus(tag, "07:30");
  const ende = app.zeitpunktAus(tag, "11:00");
  const dauer = Math.floor((ende - beginn) / 1000);
  const notiz = app.zeitNotiz(app.zeitraumText(beginn, ende), "ABNAHME Claude, wird geloescht");

  const r1 = await app.saveTimeSpent(api, AUFGABE, {
    date: app.fmtDoliDateTime(beginn), duration: dauer, userId: 0, note: notiz,
  });
  pruefe(r1?.success?.code === 200, "Dolibarr nimmt die Buchung an", JSON.stringify(r1));

  const nach1 = await zeilen();
  const z1 = nach1[nach1.length - 1];
  if (z1) aufraeumen.push(z1.timespent_line_id);

  pruefe(nach1.length === vorher + 1, "genau eine neue Zeile", `${vorher} -> ${nach1.length}`);
  pruefe(
    Number(z1.timespent_line_datehour) * 1000 === beginn,
    "der gespeicherte Beginn ist 07:30, nicht Mitternacht",
    `erwartet ${new Date(beginn).toLocaleString("de-DE")}, bekommen ${new Date(Number(z1.timespent_line_datehour) * 1000).toLocaleString("de-DE")}`,
  );
  pruefe(String(z1.timespent_line_withhour) === "1", "withhour = 1, Dolibarr zeigt also die Uhrzeit an");
  pruefe(Number(z1.timespent_line_duration) === dauer, "Dauer stimmt", `${z1.timespent_line_duration} vs ${dauer}`);
  pruefe(z1.timespent_line_note === notiz, "Notiz kommt unveraendert an", z1.timespent_line_note);
  pruefe(/^07:30–11:00/.test(z1.timespent_line_note), "Zeitraum steht vorn in der Notiz");

  // ── Fall 2: manuelle Maske mit Pause ─────────────────────────────────────
  // Hier ist die Notiz die einzige Stelle, an der das Ende steht: Beginn + Dauer
  // ergeben 15:30, geendet wurde aber um 16:00.
  console.log("\nManuell 08:00–16:00, 30 min Pause");
  const s = app.spanneRechnen(tag, "08:00", "16:00", 30);
  pruefe(!s.fehler, "Spanne geht auf", s.fehler || "");
  pruefe(s.dauer === 7.5 * 3600, "Pause ist abgezogen", `${s.dauer}s`);

  const notiz2 = app.zeitNotiz(app.zeitraumText(s.beginn, s.ende, s.pause), "ABNAHME Claude, wird geloescht");
  const r2 = await app.saveTimeSpent(api, AUFGABE, {
    date: app.fmtDoliDateTime(s.beginn), duration: s.dauer, userId: 0, note: notiz2,
  });
  pruefe(r2?.success?.code === 200, "Dolibarr nimmt die Buchung an", JSON.stringify(r2));

  const nach2 = await zeilen();
  const z2 = nach2[nach2.length - 1];
  if (z2) aufraeumen.push(z2.timespent_line_id);

  pruefe(Number(z2.timespent_line_datehour) * 1000 === s.beginn, "Beginn 08:00 gespeichert");
  pruefe(z2.timespent_line_note.includes("Pause 30 min"), "die Pause steht in der Notiz", z2.timespent_line_note);
  pruefe(
    z2.timespent_line_note.startsWith("08:00–16:00"),
    "das Ende 16:00 steht in der Notiz — aus Beginn + Dauer waere es 15:30",
    z2.timespent_line_note,
  );

  // ── Fall 3: die eigene Monatsuebersicht ──────────────────────────────────
  // Die beiden Buchungen von oben liegen beide auf heute, muessen also zu einem
  // Tag zusammenfallen. Das ist genau das, was jemand beim Nachlesen sieht.
  console.log("\nMeine Zeiten, laufender Monat");
  const jetzt = new Date();
  const { von, bis } = app.monatsGrenzen(jetzt.getFullYear(), jetzt.getMonth());
  const uebersicht = await ruf("GET", LESE_ROUTE(app.fmtDoliDateTime(von), app.fmtDoliDateTime(bis)));

  pruefe(Array.isArray(uebersicht.zeilen), "der Endpunkt liefert Zeilen", JSON.stringify(uebersicht).slice(0, 200));
  const meine = uebersicht.zeilen.filter((z) => [z1, z2].some((x) => Number(x.timespent_line_id) === z.id));
  pruefe(meine.length === 2, "beide Probebuchungen sind darin", `${meine.length} von 2`);
  pruefe(
    meine.every((z) => z.aufgabe && z.projekt),
    "Aufgabe und Projekt stehen dabei",
    JSON.stringify(meine.map((z) => [z.projekt, z.aufgabe])),
  );
  pruefe(
    meine.every((z) => /^\d{2}:\d{2}–/.test(z.notiz)),
    "der Zeitraum ist beim Nachlesen sichtbar",
    JSON.stringify(meine.map((z) => z.notiz)),
  );

  const tage = app.nachTagen(meine);
  pruefe(tage.length === 1, "beide fallen auf denselben Tag zusammen", `${tage.length} Tage`);
  pruefe(
    tage[0]?.dauer === dauer + s.dauer,
    "die Tagessumme stimmt",
    `${app.fmtDauer(tage[0]?.dauer)} statt ${app.fmtDauer(dauer + s.dauer)}`,
  );

  // Fremde Zeiten darf der Endpunkt gar nicht erst herausgeben.
  pruefe(uebersicht.login === "max" || typeof uebersicht.login === "string", "die Antwort nennt, wessen Zeiten es sind", String(uebersicht.login));
} catch (e) {
  fail++;
  console.log("\nAbbruch: " + e.message);
} finally {
  // Aufraeumen auch nach einem Fehler: was hier liegen bleibt, steht in einer
  // echten Zeiterfassung und muesste von Hand gesucht werden.
  console.log("");
  for (const id of aufraeumen) {
    try {
      await ruf("DELETE", `/tasks/${AUFGABE}/timespent/${id}`);
      console.log(`  Probezeile ${id} geloescht`);
    } catch (e) {
      console.log(`  ACHTUNG: Probezeile ${id} konnte NICHT geloescht werden — bitte in Dolibarr entfernen (${e.message})`);
      fail++;
    }
  }
  try {
    console.log(`  Aufgabe ${AUFGABE} hat jetzt ${(await zeilen()).length} Zeilen`);
  } catch { /* egal, Aufraeummeldung steht schon oben */ }
}

console.log(`\n${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
