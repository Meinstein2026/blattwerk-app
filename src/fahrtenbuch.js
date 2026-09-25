// Fahrtenbuch — reine Logik ohne React, von der App UND von server.mjs
// importiert (gleiches Muster wie arbeitsschutz.js), damit Anzeige und
// serverseitige Zusammenführung nicht auseinanderlaufen.
//
// Anforderungen an ein ordnungsgemäßes Fahrtenbuch (BMF, R 8.1 Abs. 9 LStR,
// BFH VI R 33/10): zeitnah, fortlaufend, in geschlossener Form; nachträgliche
// Änderungen müssen erkennbar sein. Deshalb:
//   - jede Fahrt bekommt bei der Eintragung eine laufende Nummer, die nie
//     wieder vergeben oder umsortiert wird (Nachträge fallen dadurch auf);
//   - eine Änderung braucht einen Vermerk (`grund`) und legt die alte Fassung
//     in `historie` ab — nichts wird überschrieben;
//   - Löschen gibt es nicht, nur Storno (`storniert: true` mit Vermerk), die
//     Zeile bleibt im Export sichtbar.
// Speicherort: Blattwerk/App/fahrtenbuch.json in Nextcloud (über
// /api/nc/fahrtenbuch[/save], additiv mit If-Match), lokaler Cache +
// Warteschlange in localStorage für Funklöcher.

export const FAHRTTYPEN = [
  { key: "betrieblich",     label: "Betrieblich" },
  { key: "privat",          label: "Privat" },
  { key: "wohnung_betrieb", label: "Wohnung–Betrieb" },
];
export const FAHRTTYP_LABEL = Object.fromEntries(FAHRTTYPEN.map((t) => [t.key, t.label]));
// Kilometerpauschale § 9 Abs. 1 S. 3 Nr. 4a EStG (Pkw), als Ausgaben-Vorschlag.
export const KM_PAUSCHALE = 0.30;
export const FB_STORE_LEER = { version: 1, fahrten: [], fahrzeuge: [], kette: { hash: "", n: 0 } };

const zahl = (v) => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const rund1 = (n) => Math.round(n * 10) / 10;

// ─── Strecke ────────────────────────────────────────────────────────────────
export function haversineKm(a, b) {
  const R = 6371.0088;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Summe der Teilstrecken. Punkte mit schlechter Genauigkeit (Funkzelle) fallen
// raus, und Schritte unter `minSchrittKm` zählen nicht — im Stand springt das
// GPS sonst um ein paar Meter und die Strecke wächst, ohne dass jemand fährt.
export function streckeAusPunkten(punkte, { maxGenauigkeitM = 100, minSchrittKm = 0.005 } = {}) {
  const gut = (Array.isArray(punkte) ? punkte : []).filter((p) =>
    p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.genauigkeit > maxGenauigkeitM));
  let km = 0;
  for (let i = 1; i < gut.length; i++) {
    const d = haversineKm(gut[i - 1], gut[i]);
    if (d >= minSchrittKm) km += d;
  }
  return rund1(km);
}

// ─── Eine Fahrt ─────────────────────────────────────────────────────────────
export function fahrtDistanz(f) {
  const a = zahl(f?.kmBeginn), b = zahl(f?.kmEnde);
  if (a != null && b != null) return rund1(b - a);
  return zahl(f?.distanz) ?? 0;
}

export function fahrtFehler(f) {
  if (!f?.datum) return "Bitte ein Datum wählen.";
  if (!String(f.start || "").trim()) return "Bitte den Startort eintragen.";
  if (!String(f.ziel || "").trim()) return "Bitte den Zielort eintragen.";
  if (!f.fahrzeugId) return "Bitte ein Fahrzeug wählen.";
  if (!FAHRTTYP_LABEL[f.typ]) return "Bitte den Fahrttyp wählen.";
  // Bei betrieblichen Fahrten verlangt das Finanzamt Zweck und Geschäftspartner;
  // Privatfahrten dürfen bewusst ohne bleiben.
  if (f.typ === "betrieblich" && !String(f.zweck || "").trim()) return "Bitte den Zweck der Fahrt angeben (Kunde, Anlass).";
  const a = zahl(f.kmBeginn), b = zahl(f.kmEnde);
  if ((a == null) !== (b == null)) return "km-Stand: bitte Beginn und Ende angeben — oder beides leer lassen und die Distanz eintragen.";
  if (a != null && b < a) return "km-Stand Ende liegt vor dem Beginn.";
  if (!(fahrtDistanz(f) > 0)) return "Bitte km-Stand (Beginn/Ende) oder eine Distanz in km eintragen.";
  return null;
}

// ─── Speicher (reine Zusammenführung) ───────────────────────────────────────
const storeNorm = (store) => {
  const s = store && typeof store === "object" ? store : {};
  return {
    ...s,
    version: 1,
    fahrten: Array.isArray(s.fahrten) ? s.fahrten : [],
    fahrzeuge: Array.isArray(s.fahrzeuge) ? s.fahrzeuge : [],
    kette: s.kette && typeof s.kette === "object" ? { hash: String(s.kette.hash || ""), n: Number(s.kette.n) || 0 } : { hash: "", n: 0 },
  };
};
// Felder, die eine Fahrt inhaltlich ausmachen — nur die entscheiden, ob es
// eine Änderung ist (Verwaltungsfelder wie historie/lfdNr nicht).
const FAHRT_FELDER = ["datum", "zeitVon", "zeitBis", "start", "ziel", "kmBeginn", "kmEnde", "distanz", "zweck",
  "kundeId", "kundeName", "projektId", "projektName", "typ", "fahrer", "kuerzel", "fahrzeugId", "storniert", "gps"];
const nurFelder = (f) => Object.fromEntries(FAHRT_FELDER.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
const gleich = (a, b) => FAHRT_FELDER.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// ─── Prüfkette ──────────────────────────────────────────────────────────────
// Jeder Vorgang (neue Fahrt, Änderung, Storno) bekommt eine fortlaufende
// Nummer und einen Hash über Vorgänger-Hash + Inhalt. Wer eine Zeile später in
// der JSON-Datei umschreibt, bricht die Kette ab dort — kettePruefen zeigt es.
// `sha256(text) -> hex` reicht der Server hinein (Node crypto); ohne Funktion
// läuft fahrtEintragen wie bisher ohne Kette (nur Tests der übrigen Logik).
const vorgangText = (zustand, meta) =>
  JSON.stringify([meta.kettenNr, zustand.id, zustand.lfdNr, meta.art, meta.zeit, meta.login, meta.grund, nurFelder(zustand)]);
const vorgangMeta = (zustaende, k) => k === 0
  ? { art: "neu", zeit: zustaende[0].angelegtAm || "", login: zustaende[0].angelegtVon || "", grund: "" }
  : { art: "aenderung", zeit: zustaende[k - 1].geaendertAm || "", login: zustaende[k - 1].geaendertVon || "", grund: zustaende[k - 1].grund || "" };
const kettenGlied = (kette, zustand, meta, sha256) => {
  const kettenNr = kette.n + 1;
  const hash = sha256(kette.hash + "|" + vorgangText({ ...zustand, kettenNr }, { ...meta, kettenNr }));
  return { zustand: { ...zustand, kettenNr, hash }, kette: { hash, n: kettenNr } };
};

/**
 * Kette nachrechnen. Ergebnis: { ok, n, hash, bruch, ohneKette }.
 * `bruch` = erste Vorgangsnummer, deren Hash nicht mehr stimmt (oder fehlt);
 * `ohneKette` = Fahrten aus der Zeit vor der Kette (kein kettenNr), sie
 * werden nicht geprüft, aber gezählt.
 */
export function kettePruefen(store, sha256) {
  const s = storeNorm(store);
  const glieder = [];
  let ohneKette = 0;
  for (const f of s.fahrten) {
    const zustaende = [...(Array.isArray(f.historie) ? f.historie : []), f];
    if (!zustaende.some((z) => z.kettenNr)) { ohneKette++; continue; }
    zustaende.forEach((z, k) => { if (z.kettenNr) glieder.push({ z, meta: { ...vorgangMeta(zustaende, k), kettenNr: z.kettenNr } }); });
  }
  glieder.sort((a, b) => a.z.kettenNr - b.z.kettenNr);
  let hash = "", n = 0;
  for (const { z, meta } of glieder) {
    n++;
    if (z.kettenNr !== n) return { ok: false, n: n - 1, hash, bruch: n, ohneKette };
    hash = sha256(hash + "|" + vorgangText(z, meta));
    if (hash !== z.hash) return { ok: false, n: n - 1, hash, bruch: n, ohneKette };
  }
  const ok = n === s.kette.n && hash === s.kette.hash;
  return { ok, n, hash, bruch: ok ? null : n + 1, ohneKette };
}

export function fahrtEintragen(store, fahrt, { login, jetzt, grund, sha256 } = {}) {
  const s = storeNorm(store);
  if (!fahrt?.id) throw new Error("Fahrt ohne Id");
  const idx = s.fahrten.findIndex((f) => f.id === fahrt.id);
  const anketten = (zustand, meta) => {
    if (!sha256) return { zustand, kette: s.kette };
    return kettenGlied(s.kette, zustand, meta, sha256);
  };
  if (idx < 0) {
    const lfdNr = s.fahrten.reduce((m, f) => Math.max(m, Number(f.lfdNr) || 0), 0) + 1;
    const neu = { id: fahrt.id, lfdNr, ...nurFelder(fahrt), angelegtAm: jetzt, angelegtVon: login || "", historie: [] };
    const g = anketten(neu, { art: "neu", zeit: jetzt, login: login || "", grund: "" });
    return { ...s, fahrten: [...s.fahrten, g.zustand], kette: g.kette };
  }
  const alt = s.fahrten[idx];
  const neu = { ...alt, ...nurFelder(fahrt) };
  if (gleich(alt, neu)) return s; // Nachtragen derselben Fassung: kein Vorgang
  const vermerk = String(grund || "").trim();
  if (!vermerk) throw new Error("Änderungsvermerk fehlt — nachträgliche Änderungen brauchen einen Grund.");
  const { historie, ...altOhne } = alt;
  const eintrag = { ...altOhne, geaendertAm: jetzt, geaendertVon: login || "", grund: vermerk };
  const g = anketten(neu, { art: "aenderung", zeit: jetzt, login: login || "", grund: vermerk });
  const fahrten = s.fahrten.slice();
  fahrten[idx] = { ...g.zustand, historie: [...(Array.isArray(historie) ? historie : []), eintrag] };
  return { ...s, fahrten, kette: g.kette };
}

export function fahrzeugEintragen(store, fahrzeug) {
  const s = storeNorm(store);
  if (!fahrzeug?.id) throw new Error("Fahrzeug ohne Id");
  const rest = s.fahrzeuge.filter((f) => f.id !== fahrzeug.id);
  const alt = s.fahrzeuge.find((f) => f.id === fahrzeug.id);
  const idx = alt ? s.fahrzeuge.indexOf(alt) : rest.length;
  const neu = { id: fahrzeug.id, name: String(fahrzeug.name || "").trim(), kennzeichen: String(fahrzeug.kennzeichen || "").trim() };
  if (fahrzeug.kmStart != null && fahrzeug.kmStart !== "") neu.kmStart = zahl(fahrzeug.kmStart);
  rest.splice(idx, 0, neu);
  return { ...s, fahrzeuge: rest };
}

// ─── Auswertung ─────────────────────────────────────────────────────────────
// Gueltig = zaehlt in Summen und Exporte. Storno bleibt sichtbar, aber zaehlt
// nicht; ein Entwurf (siehe unten) gehoert gar nicht erst ins Buch — landet er
// doch einmal im Store, darf er trotzdem keine Kilometer beisteuern.
const aktiv = (f) => f && !f.storniert && !f.entwurf;

// Laufender Kilometerstand je Fahrzeug: höchster Endstand aller gültigen
// Fahrten, ersatzweise der beim Fahrzeug hinterlegte Startstand.
export function kmStandJeFahrzeug(store) {
  const s = storeNorm(store);
  const aus = {};
  for (const v of s.fahrzeuge) if (v.kmStart != null) aus[v.id] = v.kmStart;
  for (const f of s.fahrten) {
    if (!aktiv(f)) continue;
    const e = zahl(f.kmEnde);
    if (e == null) continue;
    if (aus[f.fahrzeugId] == null || e > aus[f.fahrzeugId]) aus[f.fahrzeugId] = e;
  }
  return aus;
}

export function fahrtenAuswertung(store, jahr, { fahrzeugId } = {}) {
  const s = storeNorm(store);
  const leer = () => ({ betrieblich: 0, privat: 0, wohnungBetrieb: 0, gesamt: 0, pauschale: 0 });
  const monate = Array.from({ length: 12 }, (_, i) => ({ monat: i + 1, ...leer() }));
  const summe = leer();
  const add = (z, typ, km) => {
    if (typ === "betrieblich") z.betrieblich += km;
    else if (typ === "privat") z.privat += km;
    else if (typ === "wohnung_betrieb") z.wohnungBetrieb += km;
    z.gesamt += km;
    z.pauschale = z.betrieblich * KM_PAUSCHALE;
  };
  for (const f of s.fahrten) {
    if (!aktiv(f)) continue;
    if (fahrzeugId && f.fahrzeugId !== fahrzeugId) continue;
    const [j, m] = String(f.datum || "").split("-").map(Number);
    if (j !== Number(jahr) || !(m >= 1 && m <= 12)) continue;
    const km = fahrtDistanz(f);
    add(monate[m - 1], f.typ, km);
    add(summe, f.typ, km);
  }
  const r1 = (z) => { for (const k of ["betrieblich", "privat", "wohnungBetrieb", "gesamt"]) z[k] = rund1(z[k]); return z; };
  monate.forEach(r1); r1(summe);
  return { jahr: { ...summe, anteilBetrieblich: summe.gesamt > 0 ? summe.betrieblich / summe.gesamt : 0 }, monate };
}

// ─── Export ─────────────────────────────────────────────────────────────────
export const fbDatumDE = (iso) => {
  const [j, m, t] = String(iso || "").split("-");
  return j && m && t ? `${t}.${m}.${j}` : String(iso || "");
};
export const fbZahlDE = (n, stellen = 1) => (Number(n) || 0).toFixed(stellen).replace(".", ",");
const fbZeitpunktDE = (isoZeit) => {
  const d = new Date(isoZeit);
  return Number.isNaN(d.getTime()) ? String(isoZeit || "") : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const fahrtAenderungenText = (f) => (Array.isArray(f?.historie) ? f.historie : [])
  .map((h) => `${fbZeitpunktDE(h.geaendertAm)} ${h.geaendertVon || ""}: ${h.grund || ""}`.trim())
  .join(" | ");

/**
 * Auskunft über den externen Zeitstempel (RFC 3161, siehe src/zeitstempel.js)
 * für die Anzeige. `stempelStand` kommt beim Laden vom Server, `stempel` ist
 * das Ergebnis des letzten Speicherns.
 */
export function fbStempelText(store) {
  const n = Number(store?.kette?.n) || 0;
  if (!n) return "";
  if (store?.stempel && !store.stempel.ok) {
    return `Externer Zeitstempel fehlgeschlagen (${store.stempel.fehler}) — der nächste Eintrag stempelt erneut.`;
  }
  const gestempelt = Number(store?.stempelStand?.nr) || 0;
  if (!gestempelt) return "Noch kein externer Zeitstempel.";
  if (gestempelt >= n) return `Extern gestempelt bis Vorgang ${gestempelt}.`;
  return `Extern gestempelt bis Vorgang ${gestempelt} (${n - gestempelt} noch offen).`;
}

export function fahrtenZeilen(store) {
  const s = storeNorm(store);
  const fz = Object.fromEntries(s.fahrzeuge.map((v) => [v.id, [v.name, v.kennzeichen].filter(Boolean).join(" ")]));
  return s.fahrten.filter((f) => !f?.entwurf).slice().sort((a, b) => (a.lfdNr || 0) - (b.lfdNr || 0)).map((f) => ({
    lfdNr: f.lfdNr ?? "",
    datum: fbDatumDE(f.datum),
    von: f.zeitVon || "", bis: f.zeitBis || "",
    start: f.start || "", ziel: f.ziel || "",
    kmBeginn: zahl(f.kmBeginn) ?? "", kmEnde: zahl(f.kmEnde) ?? "",
    distanz: fbZahlDE(fahrtDistanz(f)),
    typ: FAHRTTYP_LABEL[f.typ] || f.typ || "",
    zweck: f.zweck || "",
    kunde: f.kundeName || "",
    fahrer: f.fahrer || "",
    fahrzeug: fz[f.fahrzeugId] || f.fahrzeugId || "",
    status: f.storniert ? "Storniert" : (Array.isArray(f.historie) && f.historie.length ? "Geändert" : ""),
    aenderungen: fahrtAenderungenText(f),
    _f: f,
  }));
}

const CSV_KOPF = ["Lfd. Nr.", "Datum", "Von", "Bis", "Startort", "Zielort", "km-Stand Beginn", "km-Stand Ende", "Distanz km",
  "Fahrttyp", "Zweck", "Kunde", "Fahrer", "Fahrzeug", "Status", "Änderungen"];
const csvFeld = (v) => {
  const s = String(v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function fahrtenCsv(store) {
  const zeilen = fahrtenZeilen(store).map((z) => [z.lfdNr, z.datum, z.von, z.bis, z.start, z.ziel, z.kmBeginn, z.kmEnde, z.distanz,
    z.typ, z.zweck, z.kunde, z.fahrer, z.fahrzeug, z.status, z.aenderungen].map(csvFeld).join(";"));
  return [CSV_KOPF.join(";"), ...zeilen].join("\n");
}

// ─── Offline-Warteschlange ──────────────────────────────────────────────────
// Für die Anzeige ohne Empfang: die ausstehenden Einträge über den letzten
// Server-Stand legen. Neue Fahrten haben noch keine Nummer — die vergibt
// erst der Server beim Nachtragen, sonst könnten zwei Geräte dieselbe vergeben.
export function ausstehendeZusammenfuehren(cache, ausstehend) {
  const s = storeNorm(cache);
  const fahrten = s.fahrten.map((f) => ({ ...f }));
  for (const a of Array.isArray(ausstehend) ? ausstehend : []) {
    const f = a?.fahrt;
    if (!f?.id) continue;
    const idx = fahrten.findIndex((x) => x.id === f.id);
    if (idx >= 0) fahrten[idx] = { ...fahrten[idx], ...nurFelder(f), ausstehend: true };
    else fahrten.push({ id: f.id, lfdNr: null, ...nurFelder(f), ausstehend: true });
  }
  return { ...s, fahrten };
}

// ─── Papierblatt (09.09.2026, reduzierte Fassung) ───────────────────────────
// Die App zeigt das gedruckte Formular (docs/fahrtenbuch-papier.html): Kopf
// mit Fahrzeug/Kennzeichen, Zeitraum, Blatt-Nr.; 7 Spalten Datum | km-Stand
// Beginn | km-Stand Ende | Ziel | Zweck/Kunde | Art (B/W/P) | Fahrer; 14
// Zeilen je Blatt, je Fahrzeug eigene Blätter, fortlaufend nach laufender
// Nummer. Storno belegt seine Zeile weiter (durchgestrichen, wie auf Papier),
// zählt aber nicht in die Summe. Unnummerierte (ausstehende) Fahrten hinten.
// Das Datenmodell behält Uhrzeit/Startort/Distanz — das Blatt zeigt sie nicht.
export const BLATT_ZEILEN = 14;
export const FB_ART = { betrieblich: "B", wohnung_betrieb: "W", privat: "P" };
export const FB_ART_TYP = { B: "betrieblich", W: "wohnung_betrieb", P: "privat" };
// BLATTWERKS Fahrzeug, nicht "das Standardfahrzeug" jedes Mandanten
// (Abschlusspruefung 18.09.2026, Befund I3). Der Wert ist seitdem nur noch die
// Quelle fuer MANDANT_STANDARD.fahrtenbuch.fahrzeug (src/mandant.js); die App
// nimmt IMMER den Wert aus dem Mandanten. Wer hier etwas eintraegt, traegt es
// fuer Blattwerk ein — nicht als Vorgabe fuer alle.
export const FB_FAHRZEUG_STANDARD = { id: "fiat", name: "Fiat Ducato", kennzeichen: "MU-ST 2001" };

export function fahrtenBlaetter(store, { fahrzeugId } = {}) {
  const s = storeNorm(store);
  const alle = s.fahrten
    .filter((f) => !f?.entwurf)
    .filter((f) => !fahrzeugId || f.fahrzeugId === fahrzeugId)
    .slice()
    .sort((a, b) => (a.lfdNr ?? Infinity) - (b.lfdNr ?? Infinity));
  const blaetter = [];
  for (let i = 0; i < Math.max(1, Math.ceil(alle.length / BLATT_ZEILEN)); i++) {
    const fahrten = alle.slice(i * BLATT_ZEILEN, (i + 1) * BLATT_ZEILEN);
    const gueltig = fahrten.filter(aktiv);
    const summe = { betrieblich: 0, wohnungBetrieb: 0, privat: 0 };
    for (const f of gueltig) {
      const km = fahrtDistanz(f);
      if (f.typ === "privat") summe.privat += km;
      else if (f.typ === "wohnung_betrieb") summe.wohnungBetrieb += km;
      else summe.betrieblich += km;
    }
    for (const k of Object.keys(summe)) summe[k] = rund1(summe[k]);
    const daten = gueltig.map((f) => f.datum).filter(Boolean).sort();
    blaetter.push({ nr: i + 1, fahrten, von: daten[0] || "", bis: daten[daten.length - 1] || "", summe });
  }
  return blaetter;
}

export const kuerzelAus = (name) => String(name || "").trim().split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 3);

// Eine Fahrt als Formularzeile (7 Spalten).
export function zeileAusFahrt(f) {
  const zweckTeile = [f.zweck, f.kundeName, f.projektName].map((x) => String(x || "").trim()).filter(Boolean);
  const zweck = zweckTeile.filter((t, i) => i === 0 || !zweckTeile[0].includes(t)).join(" · ");
  return {
    datum: f.datum || "",
    kmBeginn: zahl(f.kmBeginn) ?? "", kmEnde: zahl(f.kmEnde) ?? "",
    ziel: f.ziel || "", zweck,
    art: FB_ART[f.typ] || "B",
    fahrer: f.fahrer || "",
    km: fahrtDistanz(f),
  };
}

// Umkehrung fürs Direkt-Eintippen: Art-Kürzel → Fahrttyp (Vorgabe B);
// steht kein km-Stand, bleibt eine vorhandene Distanz (z. B. aus GPS) erhalten.
// `km` und `distanz` heissen dasselbe — das Papierblatt kennt nur `km`, die
// Handy-Maske schreibt `distanz`; beide muessen hier ankommen, sonst faellt bei
// einer GPS-Fahrt ohne km-Stand die Strecke still weg.
export function fahrtAusZeile(z, vorlage = {}) {
  const art = String(z.art || "B").trim().toUpperCase().slice(0, 1);
  const kmBeginn = zahl(z.kmBeginn), kmEnde = zahl(z.kmEnde);
  return {
    ...vorlage,
    datum: z.datum || "",
    kmBeginn: kmBeginn ?? "", kmEnde: kmEnde ?? "",
    distanz: kmBeginn != null && kmEnde != null ? "" : (zahl(z.km ?? z.distanz) ?? vorlage.distanz ?? ""),
    ziel: String(z.ziel || "").trim(), zweck: String(z.zweck || "").trim(),
    typ: FB_ART_TYP[art] || "betrieblich",
    fahrer: String(z.fahrer ?? vorlage.fahrer ?? "").trim(),
    start: String(z.start ?? vorlage.start ?? "").trim(),
    zeitVon: String(z.zeitVon ?? vorlage.zeitVon ?? "").trim(),
    zeitBis: String(z.zeitBis ?? vorlage.zeitBis ?? "").trim(),
  };
}

// ─── Handy-Ansicht (09.09.2026) ─────────────────────────────────────────────
// Auf dem Blatt oben steht das Papierformular — 7 Spalten nebeneinander, das
// geht auf einem Handy nur mit Querscrollen. Die App zeigt die Fahrten deshalb
// als Liste nach Monaten (neueste zuerst), das Papierblatt lebt unverändert im
// PDF weiter (`fahrtenBlaetter`, src/fahrtenbuch-pdf.js). Beide Ansichten
// lesen denselben Speicher, es wird nichts doppelt gehalten.
// Storno bleibt auch hier in der Liste (durchgestrichen) und zählt nicht in
// die Summe — geschlossene Form heißt: nichts verschwindet.
export const FB_MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

const fbSummeLeer = () => ({ betrieblich: 0, wohnungBetrieb: 0, privat: 0, gesamt: 0 });
const fbSummeAddieren = (z, f) => {
  if (!aktiv(f)) return z;
  const km = fahrtDistanz(f);
  if (f.typ === "privat") z.privat += km;
  else if (f.typ === "wohnung_betrieb") z.wohnungBetrieb += km;
  else z.betrieblich += km;
  z.gesamt += km;
  return z;
};
const fbSummeRunden = (z) => { for (const k of Object.keys(z)) z[k] = rund1(z[k]); return z; };

export function fahrtenListe(store, { fahrzeugId, jahr } = {}) {
  const s = storeNorm(store);
  const alle = s.fahrten
    .filter((f) => !f?.entwurf)
    .filter((f) => !fahrzeugId || f.fahrzeugId === fahrzeugId)
    .filter((f) => !jahr || String(f.datum || "").startsWith(String(jahr) + "-"));
  // Neueste zuerst: nach laufender Nummer absteigend. Noch unnummerierte
  // (ausstehende) Fahrten haben Infinity und stehen damit ganz oben — sie sind
  // die zuletzt eingetragenen und die, um die man sich kümmern muss.
  const sortiert = alle.slice().sort((a, b) => (b.lfdNr ?? Infinity) - (a.lfdNr ?? Infinity));
  const nachKey = new Map();
  for (const f of sortiert) {
    const key = String(f.datum || "").slice(0, 7) || "0000-00";
    if (!nachKey.has(key)) nachKey.set(key, []);
    nachKey.get(key).push(f);
  }
  const monate = [...nachKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, fahrten]) => {
      const [j, m] = key.split("-").map(Number);
      return {
        key, jahr: j || null, monat: m || null,
        label: m >= 1 && m <= 12 ? `${FB_MONATSNAMEN[m - 1]} ${j}` : "Ohne Datum",
        fahrten,
        summe: fbSummeRunden(fahrten.reduce(fbSummeAddieren, fbSummeLeer())),
      };
    });
  return {
    monate,
    anzahl: alle.length,
    summe: fbSummeRunden(alle.reduce(fbSummeAddieren, fbSummeLeer())),
  };
}

// Was die Karte in der App zeigt — anders als `zeileAusFahrt` (7 Papierspalten)
// nimmt sie auch Uhrzeit, Startort und die Vermerke mit, dafür ist auf dem
// Handy Platz. Das Kürzel `art` bleibt gleich, damit die Eingabe beides bedient.
export function fahrtKarte(f) {
  const zweckTeile = [f?.zweck, f?.kundeName, f?.projektName].map((x) => String(x || "").trim()).filter(Boolean);
  const letzte = Array.isArray(f?.historie) && f.historie.length ? f.historie[f.historie.length - 1] : null;
  return {
    id: f?.id || "", lfdNr: f?.lfdNr ?? null,
    datum: f?.datum || "", zeitVon: f?.zeitVon || "", zeitBis: f?.zeitBis || "",
    start: f?.start || "", ziel: f?.ziel || "",
    kmBeginn: zahl(f?.kmBeginn) ?? "", kmEnde: zahl(f?.kmEnde) ?? "",
    km: fahrtDistanz(f),
    zweck: zweckTeile.filter((t, i) => i === 0 || !zweckTeile[0].includes(t)).join(" · "),
    art: FB_ART[f?.typ] || "B",
    fahrer: f?.fahrer || "",
    storniert: !!f?.storniert,
    ausstehend: !!f?.ausstehend,
    geaendert: Array.isArray(f?.historie) && f.historie.length > 0,
    grund: letzte?.grund || "",
  };
}

// ─── Entwürfe (11.09.2026) ──────────────────────────────────────────────────
// „Fahrtenbuch auch Entwurf": eine angefangene Fahrt soll das Schließen der App
// überleben, ohne schon im Buch zu stehen. Ein Entwurf bekommt deshalb KEINE
// laufende Nummer, steht in keinem Export und zählt in keiner Summe — sonst
// wäre die geschlossene Form verletzt: eine vergebene Nummer, die später doch
// verworfen wird, sieht aus wie eine gelöschte Fahrt.
//
// Entwürfe liegen darum in einer eigenen Liste neben dem Store (in der App:
// localStorage, nur auf dem Gerät). Erst „Eintragen" macht daraus eine Fahrt —
// dann greift wie bisher `fahrtEintragen` mit Nummer und Historie.
export const FB_ENTWUERFE_LEER = [];

const entwListe = (l) => (Array.isArray(l) ? l : []);

export function entwurfSpeichern(liste, entwurf, { jetzt } = {}) {
  if (!entwurf?.id) throw new Error("Entwurf ohne Id");
  const rest = entwListe(liste).filter((e) => e?.id !== entwurf.id);
  const neu = {
    id: entwurf.id,
    fahrzeugId: entwurf.fahrzeugId || "",
    // Kopie: das Formular tippt sonst weiter im abgelegten Entwurf herum.
    werte: { ...(entwurf.werte || {}) },
    gespeichertAm: jetzt ?? new Date().toISOString(),
  };
  return [neu, ...rest];
}

export function entwurfLoeschen(liste, id) {
  return entwListe(liste).filter((e) => e?.id !== id);
}

// Was noch fehlt, damit aus dem Entwurf eine eintragbare Fahrt wird — in der
// Reihenfolge der Eingabemaske, damit die Karte von oben nach unten führt.
// Bewusst nicht `fahrtFehler`: das liefert einen Satz für den Toast, hier soll
// die Karte kurze Stichworte zeigen.
export function entwurfOffen(werte) {
  const w = werte && typeof werte === "object" ? werte : {};
  const offen = [];
  if (!String(w.datum || "").trim()) offen.push("Datum");
  if (!String(w.ziel || "").trim()) offen.push("Ziel");
  const a = zahl(w.kmBeginn), b = zahl(w.kmEnde);
  const strecke = (a != null && b != null && b - a > 0) || (zahl(w.distanz) ?? 0) > 0;
  if (!strecke) offen.push("Strecke");
  const art = String(w.art || "B").toUpperCase().slice(0, 1);
  if (art === "B" && !String(w.zweck || "").trim()) offen.push("Zweck");
  return offen;
}

// Ein Entwurf als Karte für die Liste — dasselbe Muster wie `fahrtKarte`, aber
// ohne laufende Nummer und mit der Liste des noch Fehlenden.
export function entwurfKarte(e) {
  const w = e?.werte && typeof e.werte === "object" ? e.werte : {};
  const a = zahl(w.kmBeginn), b = zahl(w.kmEnde);
  return {
    id: e?.id || "",
    datum: w.datum || "",
    zeitVon: w.zeitVon || "", zeitBis: w.zeitBis || "",
    start: w.start || "", ziel: w.ziel || "",
    zweck: w.zweck || "",
    art: String(w.art || "B").toUpperCase().slice(0, 1),
    km: a != null && b != null ? rund1(b - a) : (zahl(w.distanz) ?? 0),
    fahrer: w.fahrer || "",
    gespeichertAm: e?.gespeichertAm || "",
    offen: entwurfOffen(w),
  };
}
