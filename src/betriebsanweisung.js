// src/betriebsanweisung.js
// Betriebsanweisung Seilklettertechnik + Unterweisungsnachweis — reine Logik
// (18.09.2026). Ohne Netz und ohne React, damit sie sich prüfen lässt; App
// UND Server importieren dieses Modul.
//
// Zwei Teile:
//   1. Die Betriebsanweisung selbst (baVariante, baErstellen, baDateiname):
//      eine einsatzortbezogene Anweisung „vor Beginn der Arbeiten" (b09.txt
//      Zeile 236-242) — sie hat KEINE eigene Ablauffrist, sondern gilt für
//      den Einsatz/Tag, für den sie erstellt wurde.
//   2. Der Unterweisungsnachweis (baUw*): wer wurde wann von wem unterwiesen.
//      Bewusst nach demselben Muster wie die Geräteeinweisungen in
//      arbeitsschutz.js — additive Einträge, dieselbe Fristenrechnung
//      (ewFaelligAm/ewStatus, jährlich bzw. halbjährlich bei Jugendlichen),
//      dieselben Stufen-Namen (EW_STUFEN_TEXT). Kein zweiter Apparat: die
//      Fristenrechnung wird hier nicht neu erfunden, sondern wiederverwendet
//      — ewStatus() prüft ohne ein `geraet`-Feld am Eintrag nur Datum und
//      Alter, das passt auch für ein Arbeitsverfahren statt eines Geräts.
import { EW_VORWARNUNG_TAGE, ewFaelligAm, ewParse, ewStatus, ewTage } from "./arbeitsschutz.js";
import {
  BA_ABSCHNITTE_IDS, BA_ABSCHNITT_TITEL, BA_ANWENDUNGSBEREICH_A, BA_ANWENDUNGSBEREICH_B,
  BA_ARTEN, BA_ERSTE_HILFE, BA_GEFAHREN_A, BA_GEFAHREN_B, BA_INSTANDHALTUNG,
  BA_SCHUTZMASSNAHMEN_A, BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH, BA_STOERUNGEN,
} from "./betriebsanweisung-data.js";

export {
  BA_ABSCHNITTE_IDS, BA_ABSCHNITT_TITEL, BA_ARTEN,
};

export const baArt = (id) => BA_ARTEN.find((a) => a.id === id) || null;

// Arbeitsarten, bei denen ein SKT-Einsatz erfahrungsgemäß mit Motorsäge
// verbunden ist (Baumpflege/-schnitt, Fällung, Heckenschnitt in der Höhe).
// Bewusst als eigene, kleine Liste HIER gepflegt statt aus gbu-data.js
// importiert: die Datei gehört einem parallel laufenden Zweig (GBU-Formular),
// diese Liste ist nur ein Vorschlag für den Wizard, keine Wahrheit über die
// Arbeitsart selbst.
export const BA_MOTORSAEGE_ARBEITSARTEN = ["baumpflege", "faellung", "hecke"];

/**
 * Welche Fassung passt zum Einsatz? Ein ausdrücklich übergebenes
 * `motorsaege` (true/false) gewinnt immer — das ist die verlässlichste
 * Angabe, weil sie direkt beantwortet, was gebraucht wird. Ohne diese Angabe
 * wird aus Zugang und Arbeitsart geraten; ohne SKT-Zugang gibt es nach der
 * Vorschrift keine passende Betriebsanweisung, also `null` (lieber nichts
 * anbieten als eine erfundene Anweisung für Bühne/Leiter/Boden).
 */
export function baVariante(zugangId, arbeitsartId, { motorsaege } = {}) {
  if (motorsaege === true) return "skt-b";
  if (motorsaege === false) return "skt-a";
  if (zugangId !== "skt") return null;
  return BA_MOTORSAEGE_ARBEITSARTEN.includes(arbeitsartId) ? "skt-b" : "skt-a";
}

/**
 * Baut die sechs Abschnitte für eine Fassung zusammen. SKT B ist ERGÄNZEND
 * zu SKT A (b09.txt Zeile 698, 710): Anwendungsbereich und Gefahren stehen in
 * der Vorschrift für B eigenständig, die Schutzmaßnahmen dagegen bauen
 * ausdrücklich auf SKT A auf — deshalb hier A-Liste + B-Zusatzliste
 * aneinandergehängt, statt den Verweissatz („SKT A ist zwingend zu
 * beachten") unkommentiert stehen zu lassen.
 */
export function baAbschnitte(variante) {
  if (variante === "skt-b") {
    return {
      anwendungsbereich: BA_ANWENDUNGSBEREICH_B,
      gefahren: BA_GEFAHREN_B,
      schutzmassnahmen: [...BA_SCHUTZMASSNAHMEN_A, ...BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH],
      stoerungen: BA_STOERUNGEN,
      erstehilfe: BA_ERSTE_HILFE,
      instandhaltung: BA_INSTANDHALTUNG,
    };
  }
  if (variante === "skt-a") {
    return {
      anwendungsbereich: BA_ANWENDUNGSBEREICH_A,
      gefahren: BA_GEFAHREN_A,
      schutzmassnahmen: BA_SCHUTZMASSNAHMEN_A,
      stoerungen: BA_STOERUNGEN,
      erstehilfe: BA_ERSTE_HILFE,
      instandhaltung: BA_INSTANDHALTUNG,
    };
  }
  return null;
}

const umlauteWeg = (s) => String(s || "")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue");
const dateiSicher = (s) => umlauteWeg(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/** Dateiname der Betriebsanweisung, Datum vorn (sortiert von selbst). */
export const baDateiname = (variante, heute, einsatzort) =>
  `Betriebsanweisung_${dateiSicher(baArt(variante)?.label || variante)}_${heute}` +
  (einsatzort ? `_${dateiSicher(einsatzort).slice(0, 40)}` : "") + ".pdf";

/**
 * Stellt eine Betriebsanweisung für einen Einsatz zusammen. Wirft mit
 * deutschem Text bei unbekannter Fassung — der Server gibt das als 400
 * weiter, die App zeigt es als Toast.
 */
export function baErstellen({ variante, betrieb, einsatzort, ersteller, heute }) {
  const art = baArt(variante);
  if (!art) throw new Error("Unbekannte Fassung der Betriebsanweisung");
  if (!ewParse(heute)) throw new Error("Datum unbrauchbar (YYYY-MM-DD)");
  const abschnitte = baAbschnitte(variante);
  return {
    variante,
    titel: art.label,
    betrieb: String(betrieb || "").trim(),
    einsatzort: String(einsatzort || "").trim(),
    ersteller: String(ersteller || "").trim(),
    erstelltAm: heute,
    dateiname: baDateiname(variante, heute, einsatzort),
    abschnitte,
  };
}

// ─── Unterweisungsnachweis ───────────────────────────────────────────────────
// Ablage: Blattwerk/Arbeitsschutz/unterweisungen.json — eigener, kleiner
// Store neben einweisungen.json (nicht darin: das Datenmodell der
// Geräteeinweisungen verlangt Hersteller/Typ/Seriennummer, das passt für ein
// Arbeitsverfahren nicht). Gleiches Muster: additiv, If-Match beim
// Schreiben (server/betriebsanweisung.mjs), Fristenrechnung hier.
export const BA_UW_STORE = "/Blattwerk/Arbeitsschutz/unterweisungen.json";
export const BA_UW_STORE_LEER = { version: 1, eintraege: [] };
export const BA_UW_VORWARNUNG_TAGE = EW_VORWARNUNG_TAGE;

/** Halbe oder fremde Stores in die erwartete Form bringen. */
export const baUwNorm = (s) => {
  const store = s && typeof s === "object" ? s : {};
  const eintraege = Array.isArray(store.eintraege) ? store.eintraege : [];
  return { version: 1, eintraege };
};

/** Schlüssel für Personen ohne Dolibarr-Login (Aushilfen, Externe) aus dem Namen. */
export const baUwSlug = (name) => umlauteWeg(name).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
export const baUwKeyOk = (key) => /^[a-z0-9._-]{1,40}$/.test(String(key || ""));

/**
 * Fehlertext oder null. Die vier von der Vorschrift verlangten Angaben
 * (b09.txt Zeile 588-591: „Ort, Zeitpunkt und Inhalt der Unterweisung sind
 * schriftlich niederzulegen und die Teilnahme an der Unterweisung ist von
 * den Unterwiesenen durch Unterschrift zu bestätigen") sind Pflicht: Datum
 * (Zeitpunkt), Ort, Inhalt (alle sechs Abschnitte bestätigt) und — geprüft
 * vom Aufrufer vor dem Speichern, hier nicht — die Unterschrift.
 */
export function baUwPruefen(eintrag, heute) {
  if (!eintrag || typeof eintrag !== "object") return "Unterweisung fehlt";
  if (!baUwKeyOk(eintrag.login)) return "Schlüssel der unterwiesenen Person unbrauchbar";
  if (!String(eintrag.name || "").trim()) return "Name der unterwiesenen Person fehlt";
  if (!ewParse(eintrag.datum)) return 'Datum unbrauchbar (YYYY-MM-DD)';
  if (String(eintrag.datum) > String(heute || "")) return "Die Unterweisung kann nicht in der Zukunft liegen";
  if (!String(eintrag.ort || "").trim()) return "Ort der Unterweisung fehlt";
  if (!baArt(eintrag.variante)) return "Unbekannte Betriebsanweisung (Gegenstand)";
  if (!String(eintrag.einweiser || "").trim()) return "Name der unterweisenden Person fehlt";
  if (!String(eintrag.einweiserQualifikation || "").trim()) return "Qualifikation der unterweisenden Person fehlt";
  const abschnitte = Array.isArray(eintrag.abschnitte) ? eintrag.abschnitte : [];
  const fehlend = BA_ABSCHNITTE_IDS.filter((id) => !abschnitte.includes(id));
  if (fehlend.length) return "Nicht alle Abschnitte der Betriebsanweisung bestätigt: " + fehlend.map((id) => BA_ABSCHNITT_TITEL[id]).join(", ");
  return null;
}

const neueId = () => "uw-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

/**
 * Eintragen — rein und additiv, wie bei den Geräteeinweisungen: jede
 * Wiederholung kommt dazu, nichts wird ersetzt. Wirft mit deutschem Text
 * (der Server gibt es als 400 weiter).
 */
export function baUwEintragen(store, eintrag, meta = {}) {
  const heute = meta.heute || "";
  const fehler = baUwPruefen(eintrag, heute);
  if (fehler) throw new Error(fehler);
  const s = baUwNorm(store);
  const neu = {
    id: meta.id || neueId(),
    login: String(eintrag.login),
    name: String(eintrag.name).trim().slice(0, 120),
    jugendlich: !!eintrag.jugendlich,
    datum: String(eintrag.datum),
    ort: String(eintrag.ort).trim().slice(0, 160),
    variante: eintrag.variante,
    einweiser: String(eintrag.einweiser).trim().slice(0, 120),
    einweiserQualifikation: String(eintrag.einweiserQualifikation).trim().slice(0, 160),
    abschnitte: [...BA_ABSCHNITTE_IDS],
    bemerkung: String(eintrag.bemerkung || "").slice(0, 500),
    erfasstAm: meta.jetzt || heute,
    erfasstVon: String(meta.erfasstVon || "").slice(0, 80),
  };
  return { ...s, eintraege: [...s.eintraege, neu] };
}

/** Jüngster Eintrag einer Person (mehrere sind der Normalfall, additiv). */
export const baUwLetzte = (eintraege, login) =>
  (Array.isArray(eintraege) ? eintraege : [])
    .filter((e) => e && e.login === login && ewParse(e.datum))
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : String(b.erfasstAm || "").localeCompare(String(a.erfasstAm || ""))))[0] || null;

/** Fälligkeit/Status: dieselbe Rechnung wie bei den Geräteeinweisungen (§ 29 JArbSchG bei Jugendlichen inklusive). */
export const baUwStatus = (eintrag, heute, vorwarnung = BA_UW_VORWARNUNG_TAGE) => ewStatus(eintrag, heute, vorwarnung);

/** Alle Personen mit mindestens einem Eintrag, jüngste Unterweisung + Status, dringendste zuerst. */
export function baUwUebersicht(store, heute) {
  const eintraege = baUwNorm(store).eintraege;
  const logins = [...new Set(eintraege.map((e) => e.login))];
  return logins.map((login) => {
    const letzte = baUwLetzte(eintraege, login);
    return { login, name: letzte?.name || login, letzte, status: baUwStatus(letzte, heute) };
  }).sort((a, b) => (a.status.tage ?? 0) - (b.status.tage ?? 0));
}

/** Was fällig/überfällig ist — für die Sammelmail-Erinnerung, gleiches Muster wie qualFaelligkeiten. */
export function baUwFaelligkeiten(store, heute, vorwarnung = BA_UW_VORWARNUNG_TAGE) {
  return baUwUebersicht(store, heute)
    .filter((p) => p.status.stufe === "ueberfaellig" || p.status.stufe === "bald")
    .map((p) => ({ login: p.login, name: p.name, faellig: p.status.faellig, tage: p.status.tage, stufe: p.status.stufe }));
}

/** Feste UID je Person: eine Wiederholung überschreibt den Termin, statt einen zweiten anzulegen. */
export const baUwUid = (login) =>
  `blattwerk-unterweisung-${String(login || "").toLowerCase().replace(/[^a-z0-9._-]/g, "")}@blattwerk`;

/** Dateiname des unterschriebenen Protokolls, Datum vorn. */
export const baUwDateiname = (eintrag) =>
  `UW_${eintrag.datum}_${dateiSicher(baArt(eintrag.variante)?.label || eintrag.variante)}_${dateiSicher(eintrag.name || eintrag.login)}.pdf`;

/** Tage bis zur Fälligkeit, für Anzeige/Tests — reine Hilfsfunktion. */
export const baUwTageBis = (datum, heute) => ewTage(heute, datum);
export { ewFaelligAm };
