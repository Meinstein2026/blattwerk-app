// Förder-Check für Bestellungen — Regeltabelle + reine Logik, keine Oberfläche.
//
// Quelle der Inhalte: Vault-Notiz "foerdermoeglichkeiten-blattwerk-2026"
// (Recherche 17.09.2026, ergänzt 19.09.2026). Wer hier etwas ändert, ändert
// sie dort mit — die Notiz ist die Wahrheit, diese Datei die maschinenlesbare
// Kopie für den Check beim Anlegen einer Bestellung.
//
// Der eigentliche Nutzen ist NICHT die Zuschusshöhe, sondern die Warnung
// "erst Antrag, dann kaufen": SVLFG und LEADER fördern ausschließlich vor der
// Bestellung. Wer zuerst kauft, verliert den Zuschuss vollständig.
//
// Mandantenfähigkeit (gleiches Muster wie regelnFuer() in konto-regeln.js):
// ein Programm nennt selbst, für wen es gilt — `region` wird gegen
// `betrieb.foerderRegion` geprüft, `uvTraeger` gegen `betrieb.uvTraeger`,
// `gewerk` gegen `profil`. Beide betrieb-Felder sind für einen fremden
// Mandanten "" (mandantLaden baut `betrieb` neu auf, siehe mandant.js), damit
// fällt jedes regionale bzw. SVLFG-Programm bei ihm still weg, statt eine
// fremde Firma auf ein Programm zu schicken, für das sie nicht antragsberechtigt
// ist. Bundesweite, trägerunabhängige Programme bleiben für alle sichtbar.

export const FOERDER_STAND = "2026-09-19";

/** Kategorien einer Bestellung. Reihenfolge = Reihenfolge im Formular. */
export const FOERDER_KATEGORIEN = [
  { key: "psa", label: "PSA / Sicherheit" },
  { key: "maschinen", label: "Maschinen / Geräte" },
  { key: "fahrzeug", label: "Fahrzeug" },
  { key: "it", label: "IT / Digital" },
  { key: "verbrauch", label: "Verbrauchsmaterial" },
  { key: "fortbildung", label: "Fortbildung / Beratung" },
];

/** Dringlichkeit einer Bestellung. `rang` sortiert die Liste (klein = oben). */
export const FOERDER_PRIOS = [
  { key: "dringend", label: "Dringend", punkt: "🔴", farbe: "#e53935", rang: 0 },
  { key: "wichtig", label: "Wichtig", punkt: "🟡", farbe: "#f9a825", rang: 1 },
  { key: "irgendwann", label: "Irgendwann", punkt: "🟢", farbe: "#43a047", rang: 2 },
];

export const prioInfo = (key) => FOERDER_PRIOS.find((p) => p.key === key) || null;
export const kategorieLabel = (key) => FOERDER_KATEGORIEN.find((k) => k.key === key)?.label || "";
/** Ohne Angabe ganz unten, aber vor nichts anderem — sonst wandern alte
 *  Bestellungen ohne Priorität über die dringenden. */
export const prioRang = (key) => prioInfo(key)?.rang ?? 9;

/** Status des Förderantrags. Dolibarr kennt keinen eigenen Bestellstatus
 *  dafür, deshalb ein Zusatzfeld: "wartet" heißt NICHT bestellen. */
export const FOERDER_STATUS = [
  { key: "wartet", label: "Wartet auf Förderzusage", cls: "badge-draft" },
  { key: "zugesagt", label: "Förderung zugesagt", cls: "badge-paid" },
  { key: "abgelehnt", label: "Förderung abgelehnt", cls: "badge-cancelled" },
];
export const foerderStatusInfo = (key) => FOERDER_STATUS.find((s) => s.key === key) || null;

// Produktliste des SVLFG-Prämiensystems 2026 mit dem jeweiligen Höchstbetrag.
// Stichwörter klein geschrieben und in beiden Schreibweisen (Umlaut + ae/oe/ue),
// weil Bestellpositionen von Hand getippt werden.
const SVLFG_PRODUKTE = [
  { label: "Gehörschutz mit Funk", max: 300, worte: ["funk-gehörschutz", "funkgehörschutz", "funk-gehoerschutz", "gehörschutz mit funk", "bluetooth-gehörschutz", "kommunikationsgehörschutz"] },
  { label: "Kommunikations-/Notrufsystem", max: 300, worte: ["kommunikationssystem", "notrufsystem", "funkgerät", "funkgeraet", "gegensprechanlage"] },
  { label: "Personen-Notsignal-Gerät (PNA)", max: 375, worte: ["personen-notsignal", "personennotsignal", "pna-gerät", "pna-geraet", "totmannschalter"] },
  { label: "Spillwinde", max: 375, worte: ["spillwinde", "seilwinde"] },
  { label: "Funkferngesteuerter Fällkeil", max: 500, worte: ["fällkeil", "faellkeil", "funkkeil", "funkfällkeil"] },
  { label: "Höhensicherungsgerät", max: 50, worte: ["höhensicherungsgerät", "hoehensicherungsgeraet", "höhensicherung", "hoehensicherung"] },
  { label: "Otoplastiken", max: 75, worte: ["otoplastik", "gehörschutzstöpsel nach abdruck", "maßgefertigter gehörschutz"] },
  { label: "Sonnenschutz-/Kühlkleidung", max: 800, worte: ["kühlkleidung", "kuehlkleidung", "kühlweste", "kuehlweste", "sonnenschutzkleidung", "uv-schutzkleidung"] },
  { label: "Defibrillator", max: 300, worte: ["defibrillator", "aed-gerät", "aed-geraet"] },
  { label: "Ein-Personen-Gerüst", max: 150, worte: ["ein-personen-gerüst", "einpersonengerüst", "ein-personen-geruest"] },
];

// Bewusst NICHT in dieser Liste (Entscheidung Inhaber, 19.09.2026):
// - EEW Modul 6 (BAFA, 33 % ab 2.000 €): foerdert nur den Ersatz einer fossil
//   betriebenen Bestandsanlage, die seit mindestens 5 Jahren im Eigentum ist.
//   Ein 2026 gegruendeter Betrieb kann das nicht erfuellen — das Programm
//   haette bei jeder Maschinenbestellung ab 2.000 € einen Treffer gemeldet,
//   den niemand einloesen kann. Beleg in der Vault-Notiz.
// - Reine Begleitangebote ohne Geldfluss (ZuKIPro, Mittelstand-Digital):
//   gehoeren in die Notiz, nicht in einen Check, der eine Bestellung aufhaelt.
export const FOERDER_PROGRAMME = [
  {
    key: "svlfg",
    name: "SVLFG-Prämiensystem 2026",
    traeger: "Sozialversicherung für Landwirtschaft, Forsten und Gartenbau",
    uvTraeger: "SVLFG",
    kategorien: ["psa", "maschinen"],
    produkte: SVLFG_PRODUKTE,
    satz: 0.25,
    satzText: "bis 25 % der Anschaffung",
    deckelText: "je Produkt gedeckelt UND auf 25 % des LBG-Beitrags 2024 — bei kleinem Beitrag entsprechend klein",
    vorKauf: true,
    frist: null,
    fristText: "keine Stichtage, aber nur EIN Antrag pro Unternehmen und Jahr",
    ablauf: [
      "Antrag im Portal „meine SVLFG“ stellen — vor dem Kauf.",
      "Zusage abwarten (ohne Zusage gibt es rückwirkend nichts).",
      "Erst dann bestellen und kaufen.",
      "Rechnung einreichen, Zuschuss wird erstattet.",
    ],
    kontakt: "Team Präventionszuschüsse, 0561 785-10479",
    links: [{ label: "svlfg.de/praemiensystem", url: "https://www.svlfg.de/praemiensystem" }],
  },
  {
    key: "leader",
    name: "LEADER-Regionalprogramm — Kleinstunternehmen",
    traeger: "zuständiges regionales LEADER-Büro",
    region: "landkreis-giessen",
    kategorien: ["psa", "maschinen", "fahrzeug", "it", "fortbildung"],
    minNetto: 1500,
    satz: 0.25,
    satzText: "25–80 % der Nettokosten",
    deckelText: "Mindestinvestition 1.500 € netto bei Anschaffungen/Dienstleistungen (10.000 € baulich)",
    vorKauf: true,
    frist: null,
    fristText: "keine festen Stichtage, Termine werden individuell vereinbart",
    ablauf: [
      "Projektskizze ans Regionalbüro schicken (formlos, Vorhaben + Kosten + Nutzen für die Region).",
      "Beratungstermin, dann förmlicher Antrag.",
      "Bewilligung abwarten — erst danach bestellen.",
      "Nach Umsetzung Verwendungsnachweis einreichen.",
    ],
    kontakt: "beim zuständigen Regionalbüro erfragen",
    links: [],
  },
  {
    key: "bafa-beratung",
    name: "BAFA „Förderung unternehmerischen Know-hows“",
    traeger: "Bundesamt für Wirtschaft und Ausfuhrkontrolle",
    kategorien: ["fortbildung"],
    satz: 0.5,
    satzText: "50 % der Beratungskosten",
    deckelText: "förderfähig max. 3.500 € (Jungunternehmen < 2 Jahre) bzw. 3.000 € → rund 1.500–1.750 € Zuschuss, max. 2 Beratungen/Jahr",
    maxZuschuss: 1750,
    vorKauf: true,
    frist: "2026-12-31",
    fristText: "Richtlinie läuft bis 31.12.2026",
    hinweis: "Nur Beratung (Steuer, Organisation, Digitalisierung, KI) — keine Anschaffung. Wer noch kein Jahr besteht, muss VOR dem Antrag ein Informationsgespräch beim regionalen Ansprechpartner (in Hessen: RKW Hessen) führen; das ist der zeitliche Flaschenhals. Nachfolgeprogramm ab 2027 ist nicht geplant.",
    ablauf: [
      "Informationsgespräch beim RKW Hessen vereinbaren (Pflicht, solange der Betrieb kein Jahr besteht).",
      "Antrag im BAFA-Portal stellen — vor Beginn der Beratung.",
      "Beratung durchführen lassen, Verwendungsnachweis einreichen.",
    ],
    kontakt: "RKW Hessen (regionaler Ansprechpartner in Hessen), 06107 96593-45",
    links: [{ label: "bafa.de — Unternehmensberatung", url: "https://www.bafa.de/DE/Wirtschaft/Beratung_Finanzierung/Unternehmensberatung/unternehmensberatung_node.html" }],
  },
  {
    // Recherche 19.09.2026: der größte Hebel für Technik-/KI-Themen, weil
    // Beratung zu Digitalisierung, IT-Sicherheit und KI-Einführung darunter
    // fällt — Hardware selbst wird bundesweit seit 2024 nirgends mehr
    // bezuschusst (go-digital, Digital Jetzt und DIGI-Zuschuss sind beendet).
    key: "digi-beratung-hessen",
    name: "Digi-Beratung Hessen (RKW)",
    traeger: "Land Hessen / RKW Hessen, Bewilligung WIBank",
    region: "hessen",
    kategorien: ["it", "fortbildung"],
    satz: 0.5,
    satzText: "50 % des Honorars, 400 € je Tagewerk",
    deckelText: "bis 15 Tagewerke je Kalenderjahr → theoretisch bis 6.000 €/Jahr",
    maxZuschuss: 6000,
    vorKauf: true,
    frist: null,
    fristText: "keine Stichtage, aber Windhundprinzip — das Landesbudget war 2025 schon im August leer",
    hinweis: "Fördert externe Beratung (Prozessdigitalisierung, digitales Marketing, IT-Sicherheit, KI-Einführung), keine Geräte und keine Abos.",
    ablauf: [
      "Beratungsvorhaben mit dem RKW Hessen besprechen.",
      "Antrag im WIBank-Onlineportal stellen — vor Beratungsbeginn.",
      "Beratung durchführen, Verwendungsnachweis einreichen.",
    ],
    kontakt: "RKW Hessen, Region Gießen: Selina Türck, 06107 96593-45",
    links: [{ label: "rkw-hessen.de — Digitalisierungsberatung", url: "https://www.rkw-hessen.de/beratungsfoerderung/digitalisierungsberatung.html" }],
  },
];

const norm = (s) => String(s ?? "").toLowerCase();

// "landkreis-giessen" -> ["landkreis-giessen", "hessen"]. Die Zuordnung steht
// hier und nicht im Mandanten: eine Firma traegt ein, wo sie sitzt, nicht,
// welche Foerderkulissen daraus folgen.
const REGION_OBER = { "landkreis-giessen": ["hessen"] };
const foerderRegionen = (region) => {
  const r = norm(region);
  return r ? [r, ...(REGION_OBER[r] || [])] : [];
};

/** Gilt das Programm für diesen Mandanten? Siehe Kopfkommentar. */
const giltFuer = (programm, mandant) => {
  const betrieb = mandant?.betrieb || {};
  // Eine Region deckt ihre Oberregion mit ab: wer "landkreis-giessen"
  // eingetragen hat, liegt auch in Hessen. Deshalb Praefix-Vergleich ueber
  // die Kulissenliste des Mandanten statt Gleichheit auf einem Wert.
  if (programm.region && !foerderRegionen(betrieb.foerderRegion).includes(norm(programm.region))) return false;
  if (programm.uvTraeger && norm(betrieb.uvTraeger) !== norm(programm.uvTraeger)) return false;
  if (programm.gewerk && norm(mandant?.profil) !== norm(programm.gewerk)) return false;
  return true;
};

/** Abgelaufen? Ein Programm ohne `frist` läuft weiter. */
const abgelaufen = (programm, heute) => !!programm.frist && String(heute) > programm.frist;

/**
 * Regionale Kontaktdaten (Name des Regionalbüros, Mail, Telefon, Links) stehen
 * nicht im Code, sondern in der Mandanten-Datei unter
 * `betrieb.foerderKontakte.<programm-key>` und überschreiben die neutralen
 * Angaben der Tabelle.
 */
export const programmMitKontakt = (p, mandant) =>
  p ? { ...p, ...(mandant?.betrieb?.foerderKontakte?.[p.key] || {}) } : p;

export const programmeFuer = (mandant, heute = new Date().toISOString().slice(0, 10)) =>
  FOERDER_PROGRAMME.filter((p) => giltFuer(p, mandant) && !abgelaufen(p, heute)).map((p) => programmMitKontakt(p, mandant));

/**
 * Förder-Check für eine Bestellung im Entwurf.
 * @param {object}   opts
 * @param {object}   opts.mandant       Mandant (für Region/UV-Träger/Gewerk)
 * @param {string}   opts.kategorie     Kategorie-Key der Bestellung ("" = unbekannt)
 * @param {number}   opts.betragNetto   Nettosumme der Bestellung
 * @param {string}   opts.text          Positionstexte, zusammengeklebt
 * @param {string}   [opts.heute]       ISO-Datum, für Tests
 * @returns {Array} Treffer, größter geschätzter Zuschuss zuerst
 */
export const foerderTreffer = ({ mandant, kategorie = "", betragNetto = 0, text = "", heute = new Date().toISOString().slice(0, 10) }) => {
  const suchtext = norm(text);
  const betrag = Number(betragNetto) || 0;
  const treffer = [];

  for (const p of programmeFuer(mandant, heute)) {
    // Kategorie zählt nur, wenn eine gewählt wurde — sonst würde der Check
    // beim Tippen der ersten Position stumm bleiben, also genau dann, wenn er
    // gebraucht wird.
    if (kategorie && p.kategorien && !p.kategorien.includes(kategorie)) continue;

    if (p.produkte) {
      const gefunden = p.produkte.filter((pr) => pr.worte.some((w) => suchtext.includes(w)));
      if (!gefunden.length) continue;
      // Pro erkanntem Produkt der kleinere Wert aus Produktdeckel und Satz auf
      // die Bestellsumme. Ohne Betrag (noch nichts eingetippt) nur der Deckel.
      const satzBetrag = betrag > 0 ? betrag * p.satz : null;
      const summe = gefunden.reduce((s, pr) => s + (satzBetrag == null ? pr.max : Math.min(pr.max, satzBetrag)), 0);
      treffer.push({
        programm: p,
        grund: `Passt zum Prämienkatalog: ${gefunden.map((g) => g.label).join(", ")}`,
        produkte: gefunden,
        schaetzung: Math.round(summe),
        unsicher: satzBetrag == null,
      });
      continue;
    }

    if (p.minNetto && betrag < p.minNetto) continue;
    const roh = betrag > 0 ? betrag * p.satz : null;
    const gedeckelt = roh == null ? null : Math.round(p.maxZuschuss ? Math.min(roh, p.maxZuschuss) : roh);
    treffer.push({
      programm: p,
      grund: p.minNetto
        ? `Anschaffung ab ${p.minNetto.toLocaleString("de-DE")} € netto`
        : `Kategorie ${kategorieLabel(kategorie) || "Beratung"}`,
      produkte: [],
      schaetzung: gedeckelt,
      unsicher: gedeckelt == null,
    });
  }

  return treffer.sort((a, b) => (b.schaetzung ?? 0) - (a.schaetzung ?? 0));
};

/** Positionen → ein Suchtext für foerderTreffer(). */
export const positionenText = (lines = []) =>
  lines.map((l) => `${l.desc || ""} ${l.url || ""}`).join(" \n ");

/** Positionen → Nettosumme (Preis im Bestellformular ist netto je Stück). */
export const positionenNetto = (lines = []) =>
  lines.reduce((s, l) => s + (parseFloat(l.qty || 0) * parseFloat(l.price || 0) * (1 - parseFloat(l.remise_percent || 0) / 100)), 0);

// ─── Dolibarr-Zusatzfelder (llx_commande_fournisseur_extrafields) ────────────
// Angelegt von scripts/bestell-extrafields.mjs. Die Namen stehen hier, damit
// Skript, App und Server dieselben benutzen.
export const BESTELL_EXTRAFELDER = [
  { name: "bw_prio", label: "Priorität", type: "varchar", size: 16 },
  { name: "bw_kategorie", label: "Kategorie", type: "varchar", size: 24 },
  { name: "bw_foerderung", label: "Förderprogramm", type: "varchar", size: 32 },
  { name: "bw_foerder_status", label: "Förderstatus", type: "varchar", size: 16 },
];

/** Extrafields einer Bestellung flach lesen — Dolibarr liefert bei fehlenden
 *  Feldern ein leeres Array statt eines Objekts. */
export const bestellZusatz = (order) => {
  const ao = order?.array_options;
  const o = ao && !Array.isArray(ao) ? ao : {};
  return {
    prio: o.options_bw_prio || "",
    kategorie: o.options_bw_kategorie || "",
    foerderung: o.options_bw_foerderung || "",
    foerderStatus: o.options_bw_foerder_status || "",
  };
};

/** Umgekehrter Weg: Felder → array_options fürs Schreiben. */
export const bestellZusatzFelder = ({ prio = "", kategorie = "", foerderung = "", foerderStatus = "" }) => ({
  options_bw_prio: prio,
  options_bw_kategorie: kategorie,
  options_bw_foerderung: foerderung,
  options_bw_foerder_status: foerderStatus,
});

// ─── Feste Notiz an der Bestellung ───────────────────────────────────────────
// Der Live-Check im Formular ist weg, sobald das Formular zu ist. Damit später
// noch nachvollziehbar ist, WAS geprüft wurde und WELCHE Programme gepasst
// hätten, schreibt die App das Ergebnis als Text in `note_private` der
// Bestellung (nicht note_public — das steht auf der Bestellung an den
// Lieferanten). Bewusst eine Momentaufnahme: Programme ändern sich, aber was
// am Bestelltag galt, bleibt nachlesbar.
export const FOERDER_NOTIZ_MARKE = "Förder-Check";

const euro = (n) => `${Math.round(n).toLocaleString("de-DE")} €`;

export const foerderNotiz = (treffer = [], { heute = new Date().toISOString().slice(0, 10), gewaehlt = "" } = {}) => {
  const datum = heute.split("-").reverse().join(".");
  if (!treffer.length) {
    return `${FOERDER_NOTIZ_MARKE} ${datum}: kein Förderprogramm passt zu dieser Bestellung (Stand ${FOERDER_STAND}).`;
  }
  const zeilen = treffer.map((t) => {
    const p = t.programm;
    const betrag = t.schaetzung != null && !t.unsicher ? `, grob ${euro(t.schaetzung)}` : "";
    return `- ${p.name}: ${p.satzText}${betrag}. ${t.grund}. ${p.vorKauf ? "Antrag VOR dem Kauf" : "Antrag jederzeit"} — ${p.kontakt}. ${p.links[0]?.url || ""}`;
  });
  const gewaehltName = gewaehlt ? treffer.find((t) => t.programm.key === gewaehlt)?.programm.name : "";
  return [
    `${FOERDER_NOTIZ_MARKE} ${datum} — diese Programme passen zu dieser Bestellung:`,
    ...zeilen,
    gewaehltName
      ? `Gewählt: ${gewaehltName}. Erst den Antrag stellen, Zusage abwarten, dann kaufen.`
      : "Kein Antrag gewählt — wer trotzdem fördern lassen will, muss VOR dem Kauf beantragen.",
    `Programmstand ${FOERDER_STAND}; vor dem Antrag auf der Programmseite nachsehen, Fristen ändern sich.`,
  ].join("\n");
};
