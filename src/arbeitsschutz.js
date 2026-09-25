// Einweisungen an Arbeitsmitteln — Fristen, Status und Vollstaendigkeit.
//
// Die Checklisten-Inhalte stehen in `einweisung-data.js` (aus der Papiervorlage
// „Einweisung an Arbeitsmitteln" vom 07.08.2026 erzeugt, 16 Geraete, 26
// geraetespezifische Kopffelder, 12 Voraussetzungen, 129 Inhaltspunkte). Hier
// liegt nur, was gerechnet und geprueft wird.
//
// Rechtlicher Rahmen: § 12 Abs. 1 BetrSichV (Unterweisung vor der ersten
// Verwendung, Wiederholung mindestens jaehrlich, Datum und Namen schriftlich),
// § 12 Abs. 1 ArbSchG, § 4 Abs. 1 DGUV Vorschrift 1, § 29 Abs. 2 JArbSchG
// (unter 18-Jaehrige hoechstens sechs Monate).
//
// WICHTIG — drei Zustaende, nicht zwei: „nie eingewiesen" ist NICHT dasselbe
// wie „abgelaufen". Das Protokollblatt sagt dazu ausdruecklich: „Leeres Feld
// bedeutet: Gerät darf von dieser Person nicht benutzt werden." Eine Anzeige,
// die Fehlendes als „faellig" ausgibt, behauptet, die Person sei einmal
// freigegeben gewesen. Deshalb `fehlt` als eigene Stufe.

import {
  EINWEISUNG_GERAETE, EINWEISUNG_KOPF_FELDER, EINWEISUNG_PRAXIS,
  EINWEISUNG_INTERVALL_MONATE, EINWEISUNG_INTERVALL_MONATE_JUGENDLICH,
} from "./einweisung-data.js";

export { EINWEISUNG_GERAETE, EINWEISUNG_KOPF_FELDER, EINWEISUNG_PRAXIS };

export const EW_MONATE_ERWACHSEN = EINWEISUNG_INTERVALL_MONATE;   // 12
export const EW_MONATE_JUGEND = EINWEISUNG_INTERVALL_MONATE_JUGENDLICH; // 6
/** Ab wann vorgewarnt wird (Tage vor Ablauf). */
export const EW_VORWARNUNG_TAGE = 30;

export const EW_GERAETE = EINWEISUNG_GERAETE;
export const ewGeraet = (id) => EINWEISUNG_GERAETE.find((x) => x.id === id) || null;

// ─── Voraussetzungen ────────────────────────────────────────────────────────
// Eine Einweisung ersetzt keinen Lehrgang. Wo eine Qualifikation vorausgesetzt
// ist, darf gar nicht erst eingewiesen werden — deshalb ist die Voraussetzung
// keine blosse Ankreuzzeile, sondern verlangt Stelle und Datum des Nachweises.
//
// Welche Angaben das sind, steht in der Papiervorlage als Platzhalter im Text
// („Ausstellende Stelle: _____ Datum: _____"). Die Vorlage gehoert einer
// anderen Stelle; deshalb wird sie hier gelesen statt kopiert — sonst laufen
// Formular und Papier bei der naechsten Umformulierung auseinander.
// ACHTUNG: Wer drueben die Platzhalter umformuliert, muss hier Bescheid geben.

const PLATZHALTER = /:\s*_{3,}/g;
const FELD_SCHLUESSEL = {
  "ausstellende stelle": { key: "stelle", label: "Ausstellende Stelle", typ: "text" },
  "stelle": { key: "stelle", label: "Ausstellende Stelle", typ: "text" },
  "datum": { key: "datum", label: "Datum des Nachweises", typ: "datum" },
  "gültig bis": { key: "gueltigBis", label: "gültig bis", typ: "datum" },
};
// Laengste Bezeichnung zuerst, damit „Ausstellende Stelle" gewinnt und nicht
// das darin enthaltene „Stelle".
const FELD_NAMEN = Object.keys(FELD_SCHLUESSEL).sort((a, b) => b.length - a.length);

/**
 * Zerlegt eine Voraussetzung in Text + die Felder, die dazu erfasst werden.
 * Ohne Felder ist es eine reine Bestaetigung (z. B. „Mindestalter 18 Jahre"),
 * mit Feldern ein Nachweis, der ohne Stelle und Datum nichts wert ist.
 *
 * Gelesen wird rueckwaerts vom Doppelpunkt: der Satz davor besteht selbst aus
 * Buchstaben, Punkten und Leerzeichen („…für das Führen von Erdbaumaschinen.
 * Stelle:"), eine Suche vorwaerts verschluckt ihn mit und findet die
 * Bezeichnung dann gar nicht mehr.
 */
export function ewVoraussetzung(v) {
  const roh = String(v?.label || "");
  const klein = roh.toLowerCase();
  const felder = [];
  let erster = roh.length;
  PLATZHALTER.lastIndex = 0;
  let m;
  while ((m = PLATZHALTER.exec(roh)) !== null) {
    const vor = klein.slice(0, m.index).replace(/\s+$/, "");
    const name = FELD_NAMEN.find((n) => vor.endsWith(n));
    if (!name) continue;
    const def = FELD_SCHLUESSEL[name];
    const start = vor.length - name.length;
    if (start < erster) erster = start;
    if (!felder.some((f) => f.key === def.key)) felder.push({ ...def });
  }
  // Der Generator der Vorlage laesst gelegentlich das Leerzeichen nach dem
  // Satzpunkt weg („…AS-Baum II).Ausstellende Stelle:"). Beim Anzeigen
  // geradeziehen, nicht in der fremden Datei herumschreiben.
  const text = roh.slice(0, erster).replace(/\.([A-ZÄÖÜ])/g, ". $1").trim();
  return { id: v?.id, text, felder };
}

export const ewVoraussetzungen = (geraetId) =>
  (ewGeraet(geraetId)?.voraussetzungen || []).map(ewVoraussetzung);

/** Alle Kopffelder eines Geraets: die allgemeinen zuerst, dann die eigenen. */
export const ewKopfFelder = (geraetId) => [
  ...EINWEISUNG_KOPF_FELDER,
  ...(ewGeraet(geraetId)?.kopfFelder || []).map((f) => ({ pflicht: false, ...f })),
];

/** Ist eine einzelne Voraussetzung belegt? */
export const ewVoraussetzungErfuellt = (vDef, wert) => {
  if (!wert || wert.erfuellt !== true) return false;
  for (const f of vDef.felder) {
    const v = String(wert[f.key] || "").trim();
    if (!v) return false;
    if (f.typ === "datum" && !ewParse(v)) return false;
  }
  return true;
};

/** Sind ALLE Voraussetzungen des Geraets belegt? Ohne Voraussetzungen: ja. */
export const ewAlleVoraussetzungen = (eintrag) => {
  const defs = ewVoraussetzungen(eintrag?.geraet);
  if (!defs.length) return true;
  const werte = eintrag?.voraussetzungen || {};
  return defs.every((d) => ewVoraussetzungErfuellt(d, werte[d.id]));
};

// ─── Vollstaendigkeit eines Protokolls ──────────────────────────────────────

/**
 * Was fehlt, bevor unterschrieben werden darf. Leere Liste = vollstaendig.
 * Bewusst als Liste und nicht als Wahrheitswert: das Formular soll sagen,
 * WAS fehlt, nicht nur DASS etwas fehlt.
 */
export function ewFehlt(eintrag) {
  const mangel = [];
  const g = ewGeraet(eintrag?.geraet);
  if (!g) return ["Arbeitsmittel wählen"];
  if (!eintrag.login) mangel.push("Eingewiesene Person wählen");
  if (!ewParse(eintrag.datum)) mangel.push("Datum der Einweisung");
  if (!String(eintrag.einweiser || "").trim()) mangel.push("Name der einweisenden Person");
  if (!String(eintrag.einweiserQualifikation || "").trim()) mangel.push("Qualifikation der einweisenden Person");

  const kopf = eintrag.kopf || {};
  for (const f of ewKopfFelder(eintrag.geraet)) {
    if (!f.pflicht) continue;
    const v = kopf[f.id];
    if (f.typ === "bool" ? v !== true : !String(v || "").trim()) mangel.push(f.label);
  }

  for (const d of ewVoraussetzungen(eintrag.geraet)) {
    if (!ewVoraussetzungErfuellt(d, (eintrag.voraussetzungen || {})[d.id])) {
      mangel.push("Voraussetzung: " + d.text.slice(0, 60));
    }
  }

  // Beide Praxis-Haken sind Pflicht. „Vorführen allein genügt nicht" steht so
  // in der Vorlage — ohne den zweiten Haken ist das Protokoll wertlos.
  for (const p of EINWEISUNG_PRAXIS) {
    if ((eintrag.praxis || {})[p.id] !== true) mangel.push(p.label);
  }

  const offeneInhalte = g.inhalte.filter((i) => (eintrag.inhalte || {})[i.id] !== true).length;
  if (offeneInhalte) mangel.push(`${offeneInhalte} von ${g.inhalte.length} Inhalten nicht bestätigt`);
  return mangel;
}

export const ewVollstaendig = (eintrag) => ewFehlt(eintrag).length === 0;

// ─── Datumsrechnung ─────────────────────────────────────────────────────────
// Bewusst auf reinen ISO-Datumsstrings (YYYY-MM-DD), nicht auf Date-Objekten:
// eine Einweisung hat ein Kalenderdatum, keine Uhrzeit. Über Zeitzonen hinweg
// verschiebt sich ein Date sonst um einen Tag und aus „heute fällig" wird
// „gestern überfällig".

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Zerlegt YYYY-MM-DD; null, wenn es kein gültiges Datum ist. */
export const ewParse = (iso) => {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Kalendertag muss es wirklich geben (31.02. fällt hier raus).
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
};

export const ewFormat = ({ y, m, d }) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Monate addieren, mit Klemmen auf den letzten Tag des Zielmonats.
 * Ohne das rutscht der 31.08. + 6 Monate über `setMonth` auf den 03.03. —
 * die Frist würde um zwei Tage zu spät ablaufen. Ebenso 29.02. + 12 Monate:
 * das Ergebnis ist der 28.02., nicht der 01.03.
 */
export const ewPlusMonate = (iso, monate) => {
  const p = ewParse(iso);
  if (!p) return null;
  const gesamt = (p.y * 12 + (p.m - 1)) + Number(monate || 0);
  const y = Math.floor(gesamt / 12);
  const m = (gesamt % 12) + 1;
  const letzter = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ewFormat({ y, m, d: Math.min(p.d, letzter) });
};

/** Tage zwischen zwei ISO-Daten (b − a). */
export const ewTage = (a, b) => {
  const pa = ewParse(a), pb = ewParse(b);
  if (!pa || !pb) return null;
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.round(ms / 86400000);
};

/** Fälligkeitsdatum der Wiederholung. Jugendliche: halbjährlich. */
export const ewFaelligAm = (datum, jugendlich = false) =>
  ewPlusMonate(datum, jugendlich ? EW_MONATE_JUGEND : EW_MONATE_ERWACHSEN);

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * Bewertet einen Einweisungs-Eintrag zum Stichtag `heute` (ISO).
 * Stufen:
 *   fehlt        — kein Eintrag. Gerät ist für diese Person nicht freigegeben.
 *   ungueltig    — Eintrag vorhanden, aber unbrauchbar (kaputtes Datum).
 *   offen        — Voraussetzung nicht belegt (Lehrgang, Beauftragung, G 41).
 *   ueberfaellig — Frist abgelaufen.
 *   bald         — läuft binnen `vorwarnung` Tagen ab.
 *   gueltig      — alles in Ordnung.
 */
export const ewStatus = (eintrag, heute, vorwarnung = EW_VORWARNUNG_TAGE) => {
  if (!eintrag || !eintrag.datum) return { stufe: "fehlt", faellig: null, tage: null };
  const faellig = ewFaelligAm(eintrag.datum, !!eintrag.jugendlich);
  if (!faellig) return { stufe: "ungueltig", faellig: null, tage: null };
  const tage = ewTage(heute, faellig);
  if (tage === null) return { stufe: "ungueltig", faellig, tage: null };
  // Die Qualifikation ist Voraussetzung, nicht Beiwerk: fehlt sie, ist die
  // Einweisung zwar dokumentiert, das Gerät aber trotzdem gesperrt.
  if (!ewAlleVoraussetzungen(eintrag)) return { stufe: "offen", faellig, tage };
  if (tage < 0) return { stufe: "ueberfaellig", faellig, tage };
  if (tage <= vorwarnung) return { stufe: "bald", faellig, tage };
  return { stufe: "gueltig", faellig, tage };
};

export const EW_STUFEN_TEXT = {
  fehlt: "nicht eingewiesen",
  ungueltig: "Datum unklar",
  offen: "Nachweis fehlt",
  ueberfaellig: "überfällig",
  bald: "läuft ab",
  gueltig: "gültig",
};

/**
 * Einstufung eines ausdrücklich hinterlegten Ablaufdatums („Gültig bis" aus
 * Paperless). Anders als `ewStatus` wird hier nichts gerechnet — das Datum
 * steht am Dokument. Gleiche Vorwarnzeit und gleiche Stufen-Namen, damit
 * Farbe und Text aus `EW_STUFEN_TEXT` weiterbenutzt werden können.
 *
 * „kein" ist bewusst eine eigene Stufe: die meisten Unterlagen haben gar kein
 * Ablaufdatum. Die dürfen weder grün („gültig", wäre eine Behauptung) noch rot
 * erscheinen.
 */
export const fristStatus = (bis, heute, vorwarnung = EW_VORWARNUNG_TAGE) => {
  if (!bis) return { stufe: "kein", tage: null };
  const tage = ewTage(heute, bis);
  if (tage === null) return { stufe: "ungueltig", tage: null };
  if (tage < 0) return { stufe: "ueberfaellig", tage };
  if (tage <= vorwarnung) return { stufe: "bald", tage };
  return { stufe: "gueltig", tage };
};

/** Stufen, bei denen das Gerät von dieser Person nicht benutzt werden darf. */
export const EW_STUFEN_SPERREND = ["fehlt", "ungueltig", "offen", "ueberfaellig"];
export const ewGesperrt = (stufe) => EW_STUFEN_SPERREND.includes(stufe);

/**
 * Jüngster Eintrag für Gerät + Person. Mehrere Einträge sind der Normalfall:
 * jede Wiederholung wird zusätzlich abgelegt, nichts wird überschrieben — die
 * Nachweiskette muss lückenlos bleiben.
 */
export const ewLetzte = (eintraege, geraetId, login) =>
  (Array.isArray(eintraege) ? eintraege : [])
    .filter((e) => e && e.geraet === geraetId && e.login === login && ewParse(e.datum))
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))[0] || null;

/**
 * Alles, was Aufmerksamkeit braucht — sortiert nach Dringlichkeit.
 * `personen` = [{ login, name, jugendlich? }]. Ohne Personen keine Liste:
 * lieber nichts melden als Meldungen ohne Adressaten.
 */
export const ewFaelligkeiten = (eintraege, personen, heute, vorwarnung = EW_VORWARNUNG_TAGE) => {
  const out = [];
  for (const p of personen || []) {
    for (const geraet of EW_GERAETE) {
      const letzte = ewLetzte(eintraege, geraet.id, p.login);
      if (!letzte) continue; // „nie eingewiesen" ist keine Frist, sondern eine Sperre
      const st = ewStatus({ ...letzte, jugendlich: letzte.jugendlich ?? p.jugendlich }, heute, vorwarnung);
      if (st.stufe === "ueberfaellig" || st.stufe === "bald") {
        out.push({ geraet: geraet.id, label: geraet.label, login: p.login, name: p.name, ...st });
      }
    }
  }
  return out.sort((a, b) => (a.tage ?? 0) - (b.tage ?? 0));
};

/** Geräte, die einer Person mangels Einweisung verschlossen sind. */
export const ewSperren = (eintraege, personen, heute) => {
  const out = [];
  for (const p of personen || []) {
    for (const geraet of EW_GERAETE) {
      const letzte = ewLetzte(eintraege, geraet.id, p.login);
      const st = ewStatus(letzte && { ...letzte, jugendlich: letzte.jugendlich ?? p.jugendlich }, heute);
      if (ewGesperrt(st.stufe)) {
        out.push({ geraet: geraet.id, label: geraet.label, login: p.login, name: p.name, ...st });
      }
    }
  }
  return out;
};

// ─── Kalender + Ablage ──────────────────────────────────────────────────────

/**
 * Feste UID je Gerät+Person. Entscheidend: bei einer Wiederholung wird derselbe
 * Termin überschrieben statt ein zweiter angelegt — sonst sammelt der
 * Team-Kalender mit jeder Auffrischung eine weitere Leiche.
 * Der Dolibarr-Login ist der Schlüssel, nicht der Anzeigename: er ist stabil
 * und ASCII, ein Name mit Umlaut überlebt den Weg durch iCal nicht unfallfrei.
 */
export const ewUid = (geraetId, login) =>
  `blattwerk-einweisung-${String(geraetId || "").replace(/[^a-z0-9-]/gi, "")}-${
    String(login || "").toLowerCase().replace(/[^a-z0-9._-]/g, "")}@blattwerk`;

/** UID für Termine, die nicht an einem Gerät hängen (z. B. GBU-Überprüfung). */
export const ewPruefUid = (id) =>
  `blattwerk-arbeitsschutz-${String(id || "").replace(/[^a-z0-9-]/gi, "")}@blattwerk`;

const dateiSicher = (s) => String(s || "")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
  .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Dateiname des unterschriebenen Protokolls.
 * Bewusst mit Datum vorn, damit die Jahresordner von selbst sortieren, und
 * ohne Umlaute — die ueberleben den Weg durch WebDAV, Scanner und Paperless
 * nicht ueberall unbeschadet.
 */
export const ewDateiname = (eintrag) =>
  `EW_${eintrag.datum}_${dateiSicher(ewGeraet(eintrag.geraet)?.label || eintrag.geraet)}` +
  `_${dateiSicher(eintrag.name || eintrag.login)}.pdf`;
