// src/qualifikationen.js
// Qualifikationen und Fortbildungen je Person — reine Logik (16.09.2026).
//
// Wer hat welche Fortbildung seit wann, gueltig bis wann? Daraus folgen drei
// Dinge: die aufsichtsfuehrende Person bei der Gefaehrdungsbeurteilung
// (`qualAufsicht`), die Vorbelegung des Personalchecks (`qualPersonalcheck`)
// und die Fristueberwachung (`qualFaelligkeiten`). Alles hier ist ohne
// Netz und ohne React, damit es sich pruefen laesst — App UND Server
// importieren dieses Modul, damit Anzeige und Erinnerung nicht auseinanderlaufen.
//
// Datumsrechnung kommt aus arbeitsschutz.js (ISO-Strings, keine Date-Objekte;
// Begruendung dort). Die Stufen-Namen sind dieselben wie bei den Einweisungen,
// damit `EW_STUFEN_TEXT` und die Farben weiterbenutzt werden koennen.
import { EW_VORWARNUNG_TAGE, ewParse, ewPlusMonate, fristStatus } from "./arbeitsschutz.js";
import { QUALI_ARTEN, QUALI_AS_BAUM, QUALI_DOLIBARR_EXTRAFELDER, QUALI_SKT } from "./qualifikationen-data.js";
import { ncOrdner } from "./mandant.js";

export { QUALI_ARTEN, QUALI_AS_BAUM, QUALI_DOLIBARR_EXTRAFELDER, QUALI_SKT };

// ─── Ablage ─────────────────────────────────────────────────────────────────
// Bewusst unter <Ordner>/App wie anlagen.json und nicht in einweisungen.json:
// das ist der Nachweis nach § 12 BetrSichV fuer Arbeitsmittel, Lehrgaenge
// einer Person gehoeren fachlich nicht hinein.
//
// Funktion statt fester Zeichenkette (Fix Round 1 zu Task 9, 2026-09-17):
// derselbe Fehler wie bei AS_DIR/APP_DIR in server.mjs vor dem Umbau — ein
// fest verdrahtetes "/Blattwerk/App/qualifikationen.json" waere KEIN 404 auf
// einer fremden Instanz, sondern ein Schreibversuch in Blattwerks eigenen
// Ordner auf DERSELBEN Nextcloud (Trennung laeuft ueber Team-Ordner/Gruppe/
// Dienstkonto je Firma, nicht ueber getrennte Instanzen). Ob das scheitert,
// haengt allein an den Rechten des fremden Dienstkontos ab — also an
// Konfiguration, nicht am Code. ncOrdner(mandant) wie ueberall sonst: fuer
// Blattwerk immer "Blattwerk" (bestehende Daten bleiben erreichbar), fuer
// jeden anderen Mandanten dessen eigener Ordner, nie Blattwerk.
// URL-kodiert wie AS_DIR()/APP_DIR() in server.mjs, weil der Rueckgabewert
// dort direkt an ncFilesBase(server, user) angehaengt wird.
export const QUALI_STORE = (mandant) => `/${encodeURIComponent(ncOrdner(mandant))}/App/qualifikationen.json`;
export const QUALI_STORE_LEER = { version: 1, personen: {}, letzteErinnerung: "" };
export const QUALI_VORWARNUNG_TAGE = EW_VORWARNUNG_TAGE;

/** Halbe oder fremde Stores in die erwartete Form bringen. */
export const qualNorm = (s) => {
  const store = s && typeof s === "object" ? s : {};
  const personen = {};
  for (const [key, p] of Object.entries(store.personen && typeof store.personen === "object" ? store.personen : {})) {
    if (!p || typeof p !== "object") continue;
    personen[key] = {
      name: String(p.name || key),
      dolibarrId: p.dolibarrId == null ? null : Number(p.dolibarrId),
      mobil: String(p.mobil || ""),
      jugendlich: !!p.jugendlich,
      quals: Array.isArray(p.quals) ? p.quals : [],
    };
  }
  return { version: 1, personen, letzteErinnerung: String(store.letzteErinnerung || "") };
};

export const qualArt = (id) => QUALI_ARTEN.find((a) => a.id === id) || null;

// ─── Neuester Eintrag, Gueltigkeit, Status ──────────────────────────────────

/**
 * Juengster Eintrag einer Art bei dieser Person. Mehrere Eintraege sind der
 * Normalfall: jede Wiederholung kommt dazu, nichts wird ersetzt — sonst
 * liesse sich spaeter nicht belegen, dass die Frist damals gewahrt war.
 */
export const qualLetzte = (person, artId) =>
  (Array.isArray(person?.quals) ? person.quals : [])
    .filter((e) => e && e.art === artId && ewParse(e.seit))
    .sort((a, b) => (a.seit < b.seit ? 1 : a.seit > b.seit ? -1 : String(b.erfasstAm || "").localeCompare(String(a.erfasstAm || ""))))[0] || null;

/**
 * Ablaufdatum: was auf der Bescheinigung steht, sonst seit + Standardmonate
 * der Art, bei unbefristeten Arten null.
 */
export const qualGueltigBis = (eintrag) => {
  if (!eintrag) return null;
  if (eintrag.gueltigBis) return String(eintrag.gueltigBis);
  const art = qualArt(eintrag.art);
  if (!art || art.monate == null) return null;
  return ewPlusMonate(eintrag.seit, art.monate);
};

/**
 * Stufen: fehlt (kein Eintrag) | ungueltig (kaputtes Datum) | ueberfaellig |
 * bald (binnen Vorwarnzeit) | gueltig. Unbefristet = gueltig ohne Ablauf.
 */
export const qualStatus = (eintrag, heute, vorwarnung = QUALI_VORWARNUNG_TAGE) => {
  if (!eintrag) return { stufe: "fehlt", bis: null, tage: null };
  if (!ewParse(eintrag.seit)) return { stufe: "ungueltig", bis: null, tage: null };
  const bis = qualGueltigBis(eintrag);
  if (bis === null) return { stufe: "gueltig", bis: null, tage: null };
  const st = fristStatus(bis, heute, vorwarnung);
  return { stufe: st.stufe, bis, tage: st.tage };
};

export const qualGueltig = (stufe) => stufe === "gueltig" || stufe === "bald";

// ─── Aufsicht und Personalcheck ─────────────────────────────────────────────

/** Hoechste GUELTIGE Qualifikation mit Aufsichtsrang; null, wenn keine. */
export const qualHoechste = (person, heute) => {
  let best = null;
  for (const art of QUALI_ARTEN) {
    if (!art.rang) continue;
    const letzte = qualLetzte(person, art.id);
    if (!letzte || !qualGueltig(qualStatus(letzte, heute).stufe)) continue;
    if (!best || art.rang > best.rang) best = { art: art.id, rang: art.rang, seit: letzte.seit };
  }
  return best;
};

/**
 * Wer fuehrt die Aufsicht? Hoechster Rang unter den Anwesenden; bei
 * Gleichstand die Person mit dem aelteren `seit` (laenger dabei), dann
 * alphabetisch nach Schluessel — damit das Ergebnis reproduzierbar ist und
 * nicht von der Reihenfolge der Auswahl abhaengt. Eine manuelle Abweichung
 * speichert der Aufrufer selbst (`aufsichtAbweichung`, GBU-Teilprojekt).
 */
export const qualAufsicht = (personen, anwesendeKeys, heute) => {
  const kandidaten = [];
  for (const key of Array.isArray(anwesendeKeys) ? anwesendeKeys : []) {
    const p = personen?.[key];
    if (!p) continue;
    const h = qualHoechste(p, heute);
    if (h) kandidaten.push({ key, name: p.name || key, ...h });
  }
  if (!kandidaten.length) {
    return { key: null, name: null, art: null, rang: 0, grund: "Keine gültige SKT-/AS-Baum-Qualifikation unter den Anwesenden" };
  }
  kandidaten.sort((a, b) => b.rang - a.rang || (a.seit < b.seit ? -1 : a.seit > b.seit ? 1 : 0) || a.key.localeCompare(b.key));
  const w = kandidaten[0];
  return { key: w.key, name: w.name, art: w.art, rang: w.rang, grund: `${qualArt(w.art).label} seit ${w.seit}` };
};

const zaehleGueltig = (personen, keys, arten, heute) =>
  (Array.isArray(keys) ? keys : []).filter((key) => {
    const p = personen?.[key];
    return !!p && arten.some((a) => qualGueltig(qualStatus(qualLetzte(p, a), heute).stufe));
  }).length;

/**
 * „Ausreichende Erfahrung" im Personalcheck: SKT verlangt zwei Personen mit
 * gueltigem SKT A/B (Rettung aus dem Baum braucht eine zweite Kletterin);
 * jede andere Zugangsart mit Motorsaege verlangt AS Baum I (II schliesst I ein).
 */
export const qualPersonalcheck = (personen, anwesendeKeys, zugangId, heute) => {
  const fehlt = [];
  if (zugangId === "skt") {
    const n = zaehleGueltig(personen, anwesendeKeys, QUALI_SKT, heute);
    if (n < 2) fehlt.push(`Zweite Person mit gültigem SKT A/B (${n} von 2 vor Ort)`);
  } else if (zaehleGueltig(personen, anwesendeKeys, QUALI_AS_BAUM, heute) < 1) {
    fehlt.push("Person mit gültigem AS Baum I");
  }
  return { ok: fehlt.length === 0, fehlt };
};

/**
 * G 41 (Absturzgefahr) fehlt oder ist abgelaufen — nur ein HINWEIS, kein
 * Ausschluss (Entscheidung Inhaber, Fix-Runde Task 12, 18.09.2026): ein
 * überfälliger Untersuchungstermin darf keinen Einsatz platzen lassen, die
 * fehlende arbeitsmedizinische Vorsorge muss aber sichtbar bleiben, wo die
 * Aufsicht ausgewählt oder angezeigt wird (Gefährdungsbeurteilung,
 * Personalcheck). Deshalb bewusst NICHT in `qualAufsicht`/`qualPersonalcheck`
 * verdrahtet — deren Auswahl/Ergebnis bleibt unverändert (siehe
 * "aendert die Aufsichts-Auswahl nicht" in logik.test.js); dies ist eine
 * eigene, zusaetzliche Abfrage fuer die Anzeige. Reine Logik hier, damit App
 * und Server dieselbe Aussage treffen.
 *
 * Betrifft nur, wer klettert: G 41 haengt an der Absturzgefahr (SKT), siehe
 * QUALI_PFLICHT weiter unten — wer keine SKT-Kennung hat, bekommt nie einen
 * Hinweis. "bald" (Vorwarnzeit, noch gueltig) zaehlt hier bewusst NICHT als
 * Hinweis — das deckt bereits die Erinnerungsmail (qualFaelligkeiten) ab,
 * dieser Hinweis ist fuer den akuten Fall vor Ort (nie gemacht/abgelaufen).
 */
export const qualG41Hinweis = (person, heute) => {
  if (!QUALI_SKT.some((a) => qualLetzte(person, a))) return null;
  const st = qualStatus(qualLetzte(person, "g41"), heute);
  if (st.stufe === "gueltig" || st.stufe === "bald") return null;
  const text = st.stufe === "fehlt"
    ? "Kein G 41 (Absturzgefahr) hinterlegt"
    : st.stufe === "ueberfaellig"
      ? `G 41 (Absturzgefahr) seit ${-st.tage} Tag(en) abgelaufen`
      : "G 41 (Absturzgefahr): Datum unbrauchbar";
  return { stufe: st.stufe, text };
};

// ─── Faelligkeiten (Abzeichen, Erinnerungsmail) ─────────────────────────────

/** Was ablaeuft oder abgelaufen ist, ueber alle Personen — dringendstes zuerst. */
export const qualFaelligkeiten = (store, heute, vorwarnung = QUALI_VORWARNUNG_TAGE) => {
  const out = [];
  const personen = store?.personen && typeof store.personen === "object" ? store.personen : {};
  for (const [key, p] of Object.entries(personen)) {
    for (const art of QUALI_ARTEN) {
      const letzte = qualLetzte(p, art.id);
      if (!letzte) continue; // „nie gemacht" ist keine Frist
      const st = qualStatus(letzte, heute, vorwarnung);
      if (st.stufe === "bald" || st.stufe === "ueberfaellig") {
        out.push({ key, name: p.name || key, art: art.id, label: art.label, bis: st.bis, tage: st.tage, stufe: st.stufe });
      }
    }
  }
  return out.sort((a, b) => (a.tage ?? 0) - (b.tage ?? 0));
};

// ─── Fehlende Pflichtnachweise (Task 12, 18.09.2026) ───────────────────────
// qualFaelligkeiten (oben) faengt nur ab, was schon einmal eingetragen wurde
// und jetzt ablaeuft/abgelaufen ist — "nie gemacht" erzeugt dort bewusst
// keine Faelligkeit (`if (!letzte) continue`). Dieser Pfad bleibt unveraendert
// (bestehende Blattwerk-Mail bleibt wortgleich); fehlende Pflichtnachweise
// bekommen einen eigenen, zusaetzlichen Weg.

/**
 * Wer welchen Nachweis zwingend braucht. Ersthelfer steht bewusst NICHT hier
 * — das ist eine Betriebsquote (§ 26 DGUV Vorschrift 1), keine Pflicht je
 * Kopf, siehe qualErsthelferBedarf.
 *
 * G 41 (arbeitsmedizinische Vorsorge Absturzgefahr) ist fuer SKT-Klettern
 * Pflichtvorsorge nach Anhang Teil 4 Abs. (2) Nr. 2 ArbMedVV (regelmaessige
 * Benutzung von PSA gegen Absturz) — angeordnet vom Arbeitgeber vor
 * Aufnahme der Taetigkeit, nicht freiwillig. Wer eine SKT-Kennung im Store
 * hat (je Art, unabhaengig vom Ablaufdatum der SKT selbst), zaehlt als
 * "klettert" und braucht G 41.
 */
export const QUALI_PFLICHT = [
  { art: "g41", wenn: (p) => QUALI_SKT.some((a) => qualLetzte(p, a)), grund: "arbeitet in Absturzgefahr (SKT)" },
];

/**
 * Wer einen zwingenden Nachweis NIE erbracht hat, ueber alle Personen. Ein
 * abgelaufener Nachweis ist HIER kein Fehlen mehr (der Fall gehoert zu
 * qualFaelligkeiten oben) — nur ein nie eingetragener zaehlt.
 */
export const qualFehlende = (store, heute) => {
  const out = [];
  const personen = store?.personen && typeof store.personen === "object" ? store.personen : {};
  for (const [key, p] of Object.entries(personen)) {
    for (const regel of QUALI_PFLICHT) {
      if (!regel.wenn(p)) continue;
      if (qualLetzte(p, regel.art)) continue; // vorhanden (auch wenn abgelaufen) -> nicht "fehlend"
      out.push({ key, name: p.name || key, art: regel.art, grund: regel.grund });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de") || a.art.localeCompare(b.art));
};

/**
 * Ersthelfer sind eine BETRIEBSQUOTE, keine Pflicht je Kopf — § 26 DGUV
 * Vorschrift 1: "bei 2 bis 20 anwesenden Versicherten ein Ersthelfer",
 * darueber 10 % in "sonstigen Betrieben" (Baumpflege/GaLaBau ist ein
 * gewerblicher Betrieb, nicht die 5 % fuer Verwaltungs-/Handelsbetriebe;
 * Quelle: BGHM „§ 26 Zahl und Ausbildung der Ersthelfer"). Unter 2 Personen
 * schweigt die Vorschrift — hier bewusst KEINE Pflicht erfunden (soll = 0),
 * statt eine eigene Annahme unterzuschieben. `soll` bezieht sich auf ALLE
 * im Store gefuehrten Personen (nicht nur Anwesende bei einer einzelnen
 * GBU) — die Quote ist eine Betriebsgroesse, keine Einsatzgroesse.
 * Nur GUELTIGE Erste-Hilfe-Nachweise zaehlen als "ist": ein abgelaufener
 * Kurs (Fortbildung alle 24 Monate) ist kein Ersthelfer mehr.
 *
 * Die 10 % sind fest verdrahtet, nicht konfigurierbar (Entscheidung Inhaber,
 * 18.09.2026 — bleibt vorerst so, kein Umbau jetzt). Fuer einen kuenftigen
 * NICHT-Baumpflege-Mandanten (Verwaltungs-/Handelsbetrieb) waeren es 5 %
 * statt 10 % — dann muesste dieser Wert aus dem Mandanten-Profil kommen
 * statt hartcodiert zu sein.
 */
export const qualErsthelferBedarf = (store, heute) => {
  const personen = store?.personen && typeof store.personen === "object" ? store.personen : {};
  const keys = Object.keys(personen);
  const n = keys.length;
  const soll = n < 2 ? 0 : n <= 20 ? 1 : Math.ceil(n * 0.1);
  const ist = keys.filter((k) => qualGueltig(qualStatus(qualLetzte(personen[k], "erste-hilfe"), heute).stufe)).length;
  return { soll, ist, fehlt: Math.max(0, soll - ist) };
};

// ─── Dolibarr-Spiegelung ────────────────────────────────────────────────────
// Extrafields am Benutzer (llx_user_extrafields), angelegt einmalig ueber
// scripts/quali-extrafields.mjs. Nur Anzeige in Dolibarr — der Store in
// Nextcloud bleibt die Wahrheit, es gibt keinen Rueckweg.

const stufeGueltig = (person, artId, heute) => {
  const l = qualLetzte(person, artId);
  return l && qualGueltig(qualStatus(l, heute).stufe) ? l : null;
};

export const qualDolibarrFelder = (person, heute) => {
  const sktB = stufeGueltig(person, "skt-b", heute), sktA = stufeGueltig(person, "skt-a", heute);
  const skt = sktB || sktA;
  const asII = stufeGueltig(person, "as-baum-2", heute), asI = stufeGueltig(person, "as-baum-1", heute);
  const eh = qualLetzte(person, "erste-hilfe");
  const kompakt = {};
  for (const art of QUALI_ARTEN) {
    const l = qualLetzte(person, art.id);
    if (l) kompakt[art.id] = { seit: l.seit, bis: qualGueltigBis(l) };
  }
  return {
    options_quali_skt: sktB ? "B" : sktA ? "A" : "",
    options_quali_skt_seit: skt ? skt.seit : "",
    options_quali_as_baum: asII ? "II" : asI ? "I" : "",
    options_quali_erste_hilfe_bis: eh ? qualGueltigBis(eh) || "" : "",
    options_quali_json: JSON.stringify(kompakt),
  };
};

// ─── Schluessel, UID, Dateiname ─────────────────────────────────────────────

const umlauteWeg = (s) => String(s || "")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue");

/** Schluessel fuer Personen ohne Dolibarr-Login (Aushilfen) aus dem Namen. */
export const qualSlug = (name) => umlauteWeg(name).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

/** Login oder Slug — nichts, was einen Pfad oder eine UID kaputtmacht. */
export const qualKeyOk = (key) => /^[a-z0-9._-]{1,40}$/.test(String(key || ""));

/**
 * Feste UID je Art + Person: eine Wiederholung ueberschreibt denselben Termin,
 * statt einen zweiten anzulegen (wie `ewUid` bei den Einweisungen).
 */
export const qualUid = (artId, key) =>
  `blattwerk-quali-${String(artId || "").replace(/[^a-z0-9-]/gi, "")}-${
    String(key || "").toLowerCase().replace(/[^a-z0-9._-]/g, "")}@blattwerk`;

/** Dateiname des Nachweises: Datum vorn (Jahresordner sortieren von selbst). */
export const qualDateiname = (qual, key, ext) =>
  `QUALI_${qual.seit}_${String(qual.art).replace(/[^a-z0-9-]/gi, "")}_${String(key).replace(/[^a-z0-9._-]/gi, "")}.${ext}`;

// ─── Pruefen und Eintragen ──────────────────────────────────────────────────

/** Fehlertext oder null. Wird vom Server VOR dem Ablegen der Datei gerufen. */
export const qualPruefen = (qual, heute) => {
  if (!qual || typeof qual !== "object") return "Fortbildung fehlt";
  if (!qualArt(qual.art)) return "Unbekannte Art der Fortbildung";
  if (!ewParse(qual.seit)) return 'Datum „seit" unbrauchbar (YYYY-MM-DD)';
  if (qual.seit > heute) return 'Das Datum „seit" darf nicht in der Zukunft liegen';
  if (qual.gueltigBis) {
    if (!ewParse(qual.gueltigBis)) return 'Datum „gültig bis" unbrauchbar (YYYY-MM-DD)';
    if (qual.gueltigBis < qual.seit) return '„gültig bis" liegt vor „seit"';
  }
  return null;
};

const neueId = () => "q-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

/**
 * Person anlegen/aktualisieren und/oder Fortbildung anhaengen — rein und
 * additiv. Wirft mit deutschem Text; der Server gibt den als 400 weiter.
 */
export const qualEintragen = (store, key, personDaten, qual, meta = {}) => {
  if (!qualKeyOk(key)) throw new Error("Schlüssel der Person unbrauchbar");
  if (!personDaten && !qual) throw new Error("Es gibt nichts einzutragen");
  const s = qualNorm(store);
  const heute = meta.heute || "";
  const alt = s.personen[key];
  if (!alt && !personDaten) throw new Error("Person unbekannt — bitte zuerst anlegen");
  const p = alt ? { ...alt, quals: [...alt.quals] } : { name: "", dolibarrId: null, mobil: "", jugendlich: false, quals: [] };
  if (personDaten && typeof personDaten === "object") {
    if (personDaten.name !== undefined) p.name = String(personDaten.name || "").trim().slice(0, 120);
    if (personDaten.dolibarrId !== undefined) p.dolibarrId = personDaten.dolibarrId == null || personDaten.dolibarrId === "" ? null : Number(personDaten.dolibarrId);
    if (personDaten.mobil !== undefined) p.mobil = String(personDaten.mobil || "").trim().slice(0, 40);
    if (personDaten.jugendlich !== undefined) p.jugendlich = !!personDaten.jugendlich;
  }
  if (!p.name) throw new Error("Name der Person fehlt");
  if (qual) {
    const fehler = qualPruefen(qual, heute);
    if (fehler) throw new Error(fehler);
    p.quals.push({
      id: meta.id || neueId(),
      art: qual.art,
      seit: qual.seit,
      gueltigBis: qual.gueltigBis ? String(qual.gueltigBis) : null,
      stelle: String(qual.stelle || "").trim().slice(0, 120),
      nachweis: String(qual.nachweis || "").slice(0, 200),
      // Zeitstempel, nicht nur ein Datum — sonst greift der
      // Gleichstands-Tiebreak in qualLetzte bei gleichem "seit" nie.
      erfasstAm: meta.jetzt || heute,
      erfasstVon: String(meta.erfasstVon || "").slice(0, 80),
    });
  }
  return { ...s, personen: { ...s.personen, [key]: p } };
};

// ─── Personenliste fuer die Anzeige ─────────────────────────────────────────

/** Schluessel aus dem Dolibarr-Login; wo der nicht taugt, der Slug. */
export const qualiKeyAusLogin = (login) => {
  const k = String(login || "").toLowerCase();
  return qualKeyOk(k) ? k : qualSlug(login);
};

/**
 * Dolibarr-Nutzer ∪ Store. Was im Store steht, gewinnt (dort wurde bewusst
 * eingetragen); Dolibarr liefert Kandidaten ohne Eintrag und die Vorbelegung
 * der Mobilnummer. `imStore` sagt dem Formular, ob beim ersten Speichern die
 * Personendaten mitgeschickt werden muessen.
 */
export const qualiPersonenVereinen = (ausDolibarr, storePersonen) => {
  const m = new Map();
  for (const d of Array.isArray(ausDolibarr) ? ausDolibarr : []) {
    if (!d || !d.key) continue;
    m.set(d.key, { key: d.key, name: d.name || d.key, dolibarrId: d.dolibarrId ?? null, mobil: d.mobil || "", jugendlich: false, quals: [], imStore: false });
  }
  for (const [key, p] of Object.entries(storePersonen && typeof storePersonen === "object" ? storePersonen : {})) {
    if (!p) continue;
    const vorher = m.get(key);
    m.set(key, {
      key, name: p.name || vorher?.name || key,
      dolibarrId: p.dolibarrId ?? vorher?.dolibarrId ?? null,
      mobil: p.mobil || vorher?.mobil || "",
      jugendlich: !!p.jugendlich,
      quals: Array.isArray(p.quals) ? p.quals : [],
      imStore: true,
    });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
};
