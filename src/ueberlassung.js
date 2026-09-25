// Fahrzeug-Überlassungsvereinbarung (09.09.2026) — reine Logik, von App und
// server.mjs importiert. Wer den Firmenwagen fährt (auch Externe), unter-
// schreibt vorher: Halterpflichten nach § 21 StVG (Führerschein im Original
// gesehen), nur betriebliche Nutzung, Fahrtenbuch, Schäden, Bußgelder,
// Selbstbeteiligung, Alkohol-/Drogenverbot, Rückgabe.
//
// **Der Vertragspartner ist der Mandant, nicht Blattwerk** (Abschlussprüfung
// 18.09.2026, Befund I4). Bis dahin stand „Blattwerk" fest in den Pflichten,
// in den Feldbeschriftungen, in der Unterschriftszeile und im Untertitel — ein
// fremder Fahrer unterschrieb damit einen Vertrag mit der falschen Firma
// (§ 21 StVG). Der Name kommt jetzt überall aus `betrieb` (siehe
// `uebBetriebNamen`); wer hier eine neue Zeile schreibt, setzt `{betrieb}`
// hinein und lässt `uebPflichtText`/`uebAbschnitte` einsetzen — genauso wie
// `{selbstbeteiligung}`. Für Blattwerk kommt dabei Wort für Wort dasselbe
// heraus wie auf der abgenommenen Papiervorlage. Ablage wie die
// Einweisungen: JSON (Blattwerk/App/ueberlassungen.json) + PDF im Blattwerk-
// Ordner (Blattwerk/Fahrtenbuch/Ueberlassungen/<Jahr>/). Das PDF ist der
// Nachweis mit Unterschriften — die JSON trägt nur die Daten, nie die Bilder.

export const UEB_STORE_LEER = { version: 1, vereinbarungen: [] };
export const UEB_SELBSTBETEILIGUNG_STANDARD = 500;

export const UEB_FS_KLASSEN = ["B", "BE", "B96", "C1", "C1E", "C", "CE", "L", "T"];
export const UEB_VERHAELTNIS = ["Mitarbeiter/in", "Aushilfe", "extern"];
// Pflichten in der Reihenfolge der Papiervorlage. Die beiden mit `box` stehen
// dort im Kasten unter „3. Überlassung", der Rest ist die nummerierte Liste
// unter „4. Pflichten". `{selbstbeteiligung}` wird mit dem vereinbarten Betrag
// gefüllt — auf dem Papier steht dort eine Linie, im PDF die Zahl.
export const UEB_PFLICHTEN = [
  { id: "betrieblich",       box: true, text: "Nutzung ausschließlich für betriebliche Fahrten von {betrieb}. Privatfahrten sind nicht gestattet." },
  { id: "fahrtenbuch",       box: true, text: "Jede Fahrt wird unmittelbar im Fahrtenbuch des Fahrzeugs eingetragen (Datum, km-Stand Beginn/Ende, Ziel, Zweck, Art, Fahrer)." },
  { id: "fuehrerschein",     text: "Das Fahrzeug wird nur mit gültiger Fahrerlaubnis geführt; der Verlust oder Entzug der Fahrerlaubnis ist {betrieb} sofort mitzuteilen." },
  { id: "schaeden",          text: "Vor Fahrtantritt sind Beleuchtung, Bereifung und Ladungssicherung zu prüfen; Mängel und Schäden werden sofort gemeldet, Unfälle zusätzlich mit Unfallbericht (Polizei bei Fremdschaden)." },
  { id: "bussgelder",        text: "Bußgelder, Verwarngelder und Gebühren aus dem eigenen Fahrverhalten trägt der Fahrer / die Fahrerin; {betrieb} benennt den Fahrer gegenüber der Behörde." },
  { id: "selbstbeteiligung", text: "Bei selbst verschuldeten Schäden trägt der Fahrer / die Fahrerin die Selbstbeteiligung der Kaskoversicherung bis zu {selbstbeteiligung} je Schadensfall; Vorsatz und grobe Fahrlässigkeit bleiben unberührt." },
  { id: "alkohol",           text: "Fahren unter Einfluss von Alkohol, Drogen oder beeinträchtigenden Medikamenten ist untersagt; das Telefonieren ohne Freisprecheinrichtung ebenso." },
  { id: "rueckgabe",         text: "Das Fahrzeug wird nicht an Dritte weitergegeben. Rückgabe mit Schlüssel, Fahrzeugpapieren, Tankkarte und vollständigem Fahrtenbuch." },
  { id: "widerruf",          text: "Die Vereinbarung kann von beiden Seiten jederzeit widerrufen werden; sie endet automatisch mit dem Ende der Zusammenarbeit." },
];
export const UEB_PFLICHTEN_KASTEN = UEB_PFLICHTEN.filter((p) => p.box);
export const UEB_PFLICHTEN_LISTE = UEB_PFLICHTEN.filter((p) => !p.box);

export const uebEuro = (n) => (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
// Ohne vereinbarten Betrag (Leerformular zum Ausfuellen von Hand) bleibt die
// Linie der Papiervorlage stehen — mit Betrag steht die Zahl da.
export const UEB_BETRAG_LINIE = `______ € (Vorschlag ${UEB_SELBSTBETEILIGUNG_STANDARD} €)`;
/**
 * Namen der Firma fuer die Vereinbarung.
 * - `lang`: der Vertragspartner im Untertitel. Eine Firma unterschreibt als
 *   eigene Marke (betrieb.vertragsName), nicht als Rechtsform — ohne eigene
 *   Angabe ist die Rechtsform (`name`) aber immer richtig, nur laenger.
 * - `kurz`: der Name im Fliesstext (Pflichten, Feldbeschriftungen,
 *   Unterschriftszeile). Blattwerk: "Blattwerk" (betrieb.anzeigeName).
 * Beides leer heisst: kein Betrieb bekannt — buildUeberlassungPdf verweigert
 * dann, statt ein Blatt mit unklarem Vertragspartner zu zeichnen.
 */
export const uebBetriebNamen = (betrieb) => {
  const name = String(betrieb?.name || "").trim();
  return {
    lang: String(betrieb?.vertragsName || "").trim() || name,
    kurz: String(betrieb?.anzeigeName || "").trim() || name,
  };
};
// `{betrieb}` wird mit der Kurzform gefuellt, `{selbstbeteiligung}` mit dem
// vereinbarten Betrag. Ein fehlender Betriebsname laesst den Platzhalter
// stehen statt ihn durch nichts zu ersetzen — das faellt beim Lesen auf,
// waehrend "Fahrten von ." wie ein Tippfehler aussaehe. Regulaer erreicht das
// niemand: buildUeberlassungPdf verweigert vorher.
export const uebPflichtText = (p, v, betrieb) => {
  const n = Number(v?.selbstbeteiligung);
  const kurz = uebBetriebNamen(betrieb).kurz;
  return String(p?.text || "")
    .replace("{selbstbeteiligung}", Number.isFinite(n) && String(v?.selbstbeteiligung ?? "").trim() !== "" ? uebEuro(n) : UEB_BETRAG_LINIE)
    .replace("{betrieb}", kurz || "{betrieb}");
};

const istDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const heuteISO = () => new Date().toISOString().slice(0, 10);

export function uebFehlt(v) {
  const f = [];
  const t = (k) => String(v?.[k] || "").trim();
  if (!t("fahrzeug") && !t("fahrzeugId")) f.push("Fahrzeug fehlt");
  if (!t("name")) f.push("Name des Fahrers fehlt");
  if (!t("anschrift")) f.push("Anschrift fehlt");
  if (!istDatum(v?.geburtsdatum)) f.push("Geburtsdatum fehlt");
  if (!t("verhaeltnis")) f.push("Verhältnis zum Betrieb fehlt");
  if (!t("fsKlasse")) f.push("Führerscheinklasse fehlt");
  if (!t("fsNummer")) f.push("Führerscheinnummer fehlt");
  if (!istDatum(v?.fsGesehenAm)) f.push("Führerschein im Original gesehen am: Datum fehlt");
  else if (v.fsGesehenAm > heuteISO()) f.push("Führerschein-Sichtung liegt in der Zukunft");
  if (!t("fsGesehenDurch")) f.push("Führerschein gesehen: durch wen fehlt");
  if (!istDatum(v?.von)) f.push("Beginn der Überlassung fehlt");
  if (!v?.unbefristet) {
    if (!istDatum(v?.bis)) f.push("Ende der Überlassung fehlt (oder unbefristet wählen)");
    else if (istDatum(v?.von) && v.bis < v.von) f.push("Ende liegt vor dem Beginn");
  }
  const sb = Number(v?.selbstbeteiligung);
  if (!Number.isFinite(sb) || sb < 0) f.push("Selbstbeteiligung: Betrag fehlt oder negativ");
  // km-Stand bei Übergabe ist freiwillig (die Vereinbarung wird oft vor der
  // Schlüsselübergabe unterschrieben), muss aber eine Zahl sein, wenn sie da ist.
  if (String(v?.kmUebergabe ?? "").trim() !== "") {
    const km = Number(v.kmUebergabe);
    if (!Number.isFinite(km) || km < 0) f.push("km-Stand bei Übergabe: keine gültige Zahl");
  }
  const p = v?.pflichten && typeof v.pflichten === "object" ? v.pflichten : {};
  if (!UEB_PFLICHTEN.every((x) => p[x.id] === true)) f.push("Alle Pflichten müssen bestätigt sein");
  return f;
}

export function uebStatus(v, heute = heuteISO()) {
  if (v?.widerrufenAm) return "widerrufen";
  if (istDatum(v?.von) && v.von > heute) return "kuenftig";
  if (!v?.unbefristet && istDatum(v?.bis) && v.bis < heute) return "abgelaufen";
  return "gueltig";
}
export const uebStatusLabel = (s) => ({ gueltig: "gültig", kuenftig: "ab Beginn gültig", abgelaufen: "abgelaufen", widerrufen: "widerrufen" }[s] || s);

const storeNorm = (store) => {
  const s = store && typeof store === "object" ? store : {};
  return { ...s, version: 1, vereinbarungen: Array.isArray(s.vereinbarungen) ? s.vereinbarungen : [] };
};
// Allowlist: was hier nicht steht, landet nicht in der JSON — auch wenn das
// Formular und das PDF es zeigen. Neues Feld = hier eintragen.
const FELDER = ["id", "fahrzeugId", "fahrzeug", "name", "anschrift", "geburtsdatum", "telefon", "verhaeltnis",
  "fsKlasse", "fsNummer", "fsAusgestelltAm", "fsAusgestelltDurch", "fsGesehenAm", "fsGesehenDurch",
  "von", "bis", "unbefristet", "kmUebergabe", "selbstbeteiligung", "pflichten", "bemerkung", "blattwerkVertreter"];

export function uebEintragen(store, v, { jetzt, login, datei, ncPfad } = {}) {
  const s = storeNorm(store);
  if (!v?.id) throw new Error("Vereinbarung ohne Id");
  const fehlt = uebFehlt(v);
  if (fehlt.length) throw new Error("Unvollständig: " + fehlt.join(", "));
  if (s.vereinbarungen.some((x) => x.id === v.id)) throw new Error("Diese Vereinbarung gibt es schon");
  const neu = Object.fromEntries(FELDER.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]));
  neu.unbefristet = !!v.unbefristet;
  neu.selbstbeteiligung = Number(v.selbstbeteiligung);
  neu.erfasstAm = jetzt || new Date().toISOString();
  neu.erfasstVon = login || "";
  if (datei) neu.datei = datei;
  if (ncPfad) neu.ncPfad = ncPfad;
  return { ...s, vereinbarungen: [...s.vereinbarungen, neu] };
}

export function uebWiderrufen(store, id, { jetzt, login, grund } = {}) {
  const s = storeNorm(store);
  const idx = s.vereinbarungen.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Vereinbarung nicht gefunden");
  if (!String(grund || "").trim()) throw new Error("Grund des Widerrufs fehlt");
  const liste = s.vereinbarungen.slice();
  liste[idx] = { ...liste[idx], widerrufenAm: jetzt || new Date().toISOString(), widerrufenVon: login || "", widerrufGrund: String(grund).trim() };
  return { ...s, vereinbarungen: liste };
}

export function uebFahrerNamen(store, { heute = heuteISO(), fahrzeugId } = {}) {
  const s = storeNorm(store);
  return [...new Set(s.vereinbarungen
    .filter((v) => (!fahrzeugId || v.fahrzeugId === fahrzeugId) && ["gueltig", "kuenftig"].includes(uebStatus(v, heute)))
    .map((v) => String(v.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

const ascii = (s) => String(s || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
  .replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
export function uebDateiname(v) {
  const fz = String(v?.fahrzeug || "").split("·").pop().trim() || String(v?.fahrzeugId || "Fahrzeug");
  return `Ueberlassung_${ascii(fz)}_${ascii(v?.name)}_${v?.von || ""}.pdf`;
}

// ─── Aufbau des Blattes ─────────────────────────────────────────────────────
// Einzige Quelle für die Gliederung; `docs/fahrzeug-ueberlassung-papier.html`
// ist die abgenommene Papiervorlage, `test/ueberlassung/vorlage.test.js` liest
// sie ein und prüft, dass jede Überschrift und jedes Feld hier vorkommt. Das
// PDF zeichnet nur noch, was diese Funktion liefert — gefüllte Werte statt der
// Linien des Papiers. `vorlage` ist die wortgleiche Beschriftung des Papiers,
// `label` die (kürzere) im PDF.
export const UEB_TITEL = "Fahrzeug-Überlassungsvereinbarung";
// Der Vertragspartner: `vertragsName` des Mandanten, ersatzweise sein Name.
// Die frühere feste UEB_BETRIEB-Konstante war genau der Fund I4 — sie steht
// jetzt als betrieb.vertragsName in der Mandanten-Konfiguration.
export const UEB_UNTERTITEL = (v, betrieb) =>
  `${uebBetriebNamen(betrieb).lang} · Firmenfahrzeug, Kennzeichen ${uebKennzeichen(v)} · Halterpflichten nach § 21 StVG`;
export const UEB_FUSSNOTE = "Kopie an den Fahrer / die Fahrerin. Aufbewahrung bei den Fahrzeugunterlagen; Führerscheinprüfung halbjährlich wiederholen und unter 2. vermerken.";
// `blattwerkVertreter`/`sigBlattwerk` behalten ihre Namen: das sind
// Feldnamen im gespeicherten Datensatz (FELDER unten, ueberlassungen.json)
// und in den localStorage-Schlüsseln — ein Umbenennen wuerde bestehende
// Vereinbarungen und Warteschlangen unlesbar machen. Nur der ANGEZEIGTE Text
// kommt aus dem Mandanten.
export const UEB_UNTERSCHRIFTEN = (v, betrieb) => [
  { rolle: "Ort, Datum · Unterschrift Fahrer/in", name: String(v?.name || "").trim(), bild: "sigFahrer" },
  { rolle: `Ort, Datum · Unterschrift ${uebBetriebNamen(betrieb).kurz}${v?.blattwerkVertreter ? ` (${String(v.blattwerkVertreter).trim()})` : ""}`, name: String(v?.blattwerkVertreter || "").trim(), bild: "sigBlattwerk" },
];

export function uebKennzeichen(v) {
  const fz = String(v?.fahrzeug || "").trim();
  if (fz.includes("·")) return fz.split("·").pop().trim();
  return fz || String(v?.fahrzeugId || "");
}

export const uebDatumDE = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

// `leer: true` liefert dasselbe Blatt ohne Werte — das Leerformular zum
// Ausdrucken und Ausfuellen von Hand. Mitgegebene Werte (Fahrzeug, Datum)
// bleiben trotzdem stehen; nur Fehlendes bleibt leer statt „—".
export function uebAbschnitte(v = {}, { leer = false, betrieb } = {}) {
  const E = leer ? "" : "—";
  // Wie in den Pflichten: `{betrieb}` in Beschriftung und Vorlage, damit die
  // Papiervorlage und das PDF derselben Quelle folgen.
  const kurz = uebBetriebNamen(betrieb).kurz || "{betrieb}";
  const mitBetrieb = (s) => String(s).replace("{betrieb}", kurz);
  const oder = (s) => (String(s ?? "").trim() ? String(s).trim() : E);
  const ausgestellt = [uebDatumDE(v.fsAusgestelltAm), String(v.fsAusgestelltDurch || "").trim()].filter(Boolean).join(" · ");
  return [
    { nr: 1, titel: "Fahrer/in", felder: [
      { vorlage: "Name, Vorname", label: "Name, Vorname", breite: 0.6, wert: oder(v.name) },
      { vorlage: "Geburtsdatum", label: "Geburtsdatum", breite: 0.4, wert: oder(uebDatumDE(v.geburtsdatum)) },
      { vorlage: "Anschrift", label: "Anschrift", breite: 1, wert: oder(v.anschrift) },
      { vorlage: "Telefon", label: "Telefon", breite: 0.4, wert: oder(v.telefon) },
      { vorlage: mitBetrieb("Verhältnis zu {betrieb} (Mitarbeiter/in, Aushilfe, extern)"), label: mitBetrieb("Verhältnis zu {betrieb}"), breite: 0.6, wert: oder(v.verhaeltnis) },
    ] },
    { nr: 2, titel: "Fahrerlaubnis", felder: [
      { vorlage: "Führerscheinklasse(n)", label: "Führerscheinklasse(n)", breite: 0.3, wert: oder(v.fsKlasse) },
      { vorlage: "Führerschein-Nr.", label: "Führerschein-Nr.", breite: 0.4, wert: oder(v.fsNummer) },
      { vorlage: "ausgestellt am / durch", label: "ausgestellt am / durch", breite: 0.3, wert: oder(ausgestellt) },
      { vorlage: "Original gesehen am", label: "Original gesehen am", breite: 0.35, wert: oder(uebDatumDE(v.fsGesehenAm)) },
      { vorlage: mitBetrieb("geprüft durch ({betrieb})"), label: mitBetrieb("geprüft durch ({betrieb})"), breite: 0.65, wert: oder(v.fsGesehenDurch) },
    ] },
    { nr: 3, titel: "Überlassung", felder: [
      { vorlage: "Zeitraum von", label: "Zeitraum von", breite: 0.3, wert: oder(uebDatumDE(v.von)) },
      { vorlage: "bis (leer = unbefristet)", label: "bis", breite: 0.3, wert: v.unbefristet ? "unbefristet" : oder(uebDatumDE(v.bis)) },
      { vorlage: "km-Stand bei Übergabe", label: "km-Stand bei Übergabe", breite: 0.4, wert: String(v.kmUebergabe ?? "").trim() ? `${Number(v.kmUebergabe).toLocaleString("de-DE")} km` : E },
    ], kasten: UEB_PFLICHTEN_KASTEN.map((p) => ({ id: p.id, text: uebPflichtText(p, v, betrieb), bestaetigt: v?.pflichten?.[p.id] === true })) },
    { nr: 4, titel: "Pflichten des Fahrers / der Fahrerin",
      punkte: UEB_PFLICHTEN_LISTE.map((p) => ({ id: p.id, text: uebPflichtText(p, v, betrieb), bestaetigt: v?.pflichten?.[p.id] === true })) },
  ];
}
