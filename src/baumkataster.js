// Baumkataster — reine Logik (16.09.2026). Kein React, kein Netz; App UND
// server.mjs (über src/server/baumkataster.mjs) importieren dieselben
// Funktionen. Alle Mutatoren geben einen NEUEN Store zurück (der übergebene
// bleibt unverändert) — der Server liest, ändert, schreibt mit If-Match.
//
// Grundsatz: Kontrollen sind Nachweise und werden NIE überschrieben oder
// gelöscht. Maßnahmen ändern nur status/erledigt*/bemerkung.
import {
  BK_STORE_LEER, BK_INDEX_LEER, BK_ALTERSPHASEN, BK_STATUS, BK_SCHUTZ,
  BK_KONTROLLARTEN, BK_VITALITAET, BK_VERKEHRSSICHER, BK_BEFUND, BK_INTERVALL,
  BK_MASSNAHMEN, BK_DRINGLICHKEIT,
  BK_FARBEN, BK_VORWARNUNG_TAGE, BK_GBU_GESUNDHEIT, BK_GBU_STANDSICHERHEIT,
} from "./baumkataster-data.js";
import { mandantAusCache } from "./mandant-client.js";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const bkIstDatum = (s) => ISO.test(String(s || ""));

/** ISO-Datum plus Tage/Monate, über UTC gerechnet (keine Zeitzone, keine Sommerzeit). */
export function bkTagPlus(iso, { tage = 0, monate = 0 } = {}) {
  const m = ISO.exec(String(iso || ""));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1 + monate, +m[3] + tage)).toISOString().slice(0, 10);
}

export const bkHeute = () => new Date().toISOString().slice(0, 10);

const istObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function bkNormalisieren(s) {
  const st = istObjekt(s) ? s : {};
  const baeume = {};
  for (const [nr, b] of Object.entries(istObjekt(st.baeume) ? st.baeume : {})) {
    if (!istObjekt(b)) continue;
    baeume[nr] = {
      ...b, nr,
      kontrollen: Array.isArray(b.kontrollen) ? b.kontrollen : [],
      massnahmen: Array.isArray(b.massnahmen) ? b.massnahmen : [],
    };
  }
  return {
    ...BK_STORE_LEER, ...st, version: 1,
    kunde: { ...BK_STORE_LEER.kunde, ...(istObjekt(st.kunde) ? st.kunde : {}) },
    objekte: istObjekt(st.objekte) ? st.objekte : {},
    baeume,
  };
}

export const bkIndexNormalisieren = (s) => ({
  ...BK_INDEX_LEER, ...(istObjekt(s) ? s : {}), version: 1,
  kunden: istObjekt(s?.kunden) ? s.kunden : {},
});

/** Nächste freie Nummer je Kunde: höchste vorhandene + 1. Lücken werden nie neu vergeben. */
export function bkBaumNr(store) {
  let max = 0;
  for (const nr of Object.keys(store?.baeume || {})) {
    const m = /^B-(\d+)$/.exec(nr);
    if (m) max = Math.max(max, +m[1]);
  }
  return "B-" + String(max + 1).padStart(4, "0");
}

export const bkId = (praefix, jetzt = new Date(), zufall = Math.random) =>
  `${praefix}-${jetzt.getTime().toString(36)}-${Math.floor(zufall() * 1e6).toString(36)}`;

/** Zahl ≥ 0 aus Eingabe (Komma erlaubt), sonst null. */
export const bkZahl = (v) => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const koord = (v) => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Woher die Koordinaten stammen. Von Hand auf der Karte gesetzt ist kein Messwert — das steht im Datensatz, nicht nur im Kopf des Erfassers. */
export const BK_QUELLEN = ["gps", "karte"];

/**
 * Alte Position anhängen, wenn die neue eine ANDERE ist. `angefasst` heißt
 * „lat oder lon war Teil dieses Speicherns" — ohne Beteiligung (der Normalfall
 * beim Ändern nur der Baumart) ändert sich nichts.
 *
 * I3 (Whole-Branch-Review): ein vollständiges Löschen (`neuLat` UND `neuLon`
 * beide `null`, weil der Erfasser beide Felder geleert hat) zählt genauso als
 * Positionsänderung wie eine Korrektur — die alte Position bleibt als
 * Nachweis stehen, statt spurlos zu verschwinden. Eine HALBE Koordinate
 * (genau eine Achse `null`) kommt hier nie an: `bkBaumSpeichern` weist sie
 * vorher ab.
 */
function bkPositionHistorie(alt, neuLat, neuLon, jetzt, angefasst) {
  const bisher = Array.isArray(alt.positionHistorie) ? alt.positionHistorie : [];
  if (!angefasst) return bisher;
  if (alt.lat == null || alt.lon == null) return bisher;   // nichts zu bewahren
  if (neuLat != null && neuLon != null && alt.lat === neuLat && alt.lon === neuLon) return bisher;
  return [...bisher, { lat: alt.lat, lon: alt.lon, genauigkeitM: alt.genauigkeitM ?? null, quelle: alt.quelle || "", bis: jetzt.toISOString() }];
}

/**
 * Baum anlegen (ohne `nr`) oder Stammdaten ändern (mit `nr`). Kontrollen und
 * Maßnahmen bleiben unangetastet — die laufen über ihre eigenen Funktionen.
 */
export function bkBaumSpeichern(store, daten, { login = "", jetzt = new Date() } = {}) {
  const s = bkNormalisieren(store);
  const d = istObjekt(daten) ? daten : {};
  // Idempotenz (18.09.2026): eine Neuanlage (kein `nr`, der Server vergibt sie
  // erst hier) trägt vom Client eine stabile `vorgangId` — stirbt die App nach
  // einem angenommenen `baum/save`, bevor die Antwort ankommt, sendet der
  // nächste Versuch dieselbe Kennung erneut. Ohne diese Prüfung entstünde ein
  // zweiter Baum für denselben Vorgang, der für immer stehen bliebe (additiv,
  // wie Kontrollen und Maßnahmen). Fehlt die Kennung (Altbestand vor diesem
  // Umbau), verhält sich alles wie bisher.
  if (!d.nr && d.vorgangId) {
    const vorhanden = Object.values(s.baeume).find((b) => b.vorgangId && b.vorgangId === d.vorgangId);
    if (vorhanden) return { store: s, baum: vorhanden, doppelt: true };
  }
  const art = String(d.art || "").trim();
  const artDe = String(d.artDe || "").trim();
  if (d.nr && !s.baeume[d.nr]) throw new Error(`Baum ${d.nr} gibt es nicht.`);
  if (d.altersphase && !BK_ALTERSPHASEN.includes(d.altersphase)) throw new Error("Altersphase unbekannt.");
  if (d.status && !BK_STATUS.includes(d.status)) throw new Error("Status unbekannt.");
  if (d.schutz && !BK_SCHUTZ.includes(d.schutz)) throw new Error("Schutzstatus unbekannt.");
  // I3 (Whole-Branch-Review): lat/lon sind getrennt editierbare Felder — wer
  // nur eines leert, darf die Position nicht kommentarlos halbieren. Beide
  // Achsen abwesend (der Normalfall beim Ändern nur der Baumart) bleibt
  // erlaubt; beide anwesend und beide leer heißt „Position vollständig
  // löschen" und wird unten protokolliert, nicht hier abgewiesen.
  const positionAngefasst = d.lat !== undefined || d.lon !== undefined;
  const neuLat = d.lat !== undefined ? koord(d.lat) : null;
  const neuLon = d.lon !== undefined ? koord(d.lon) : null;
  if (positionAngefasst && (neuLat == null) !== (neuLon == null)) {
    throw new Error("Bitte beide Koordinaten angeben oder beide leer lassen — eine halbe Position kann nicht gespeichert werden.");
  }
  const nr = d.nr || bkBaumNr(s);
  const alt = s.baeume[nr] || null;
  // Nur eine Neuanlage braucht zwingend eine Baumart — eine reine
  // Positionskorrektur von der Karte schickt sonst nichts mit.
  if (!alt && !art && !artDe) throw new Error("Baumart angeben (deutsch oder lateinisch).");
  const nimm = (feld, wandeln = (x) => x) => (d[feld] !== undefined ? wandeln(d[feld]) : (alt ? alt[feld] : null));
  const baum = {
    nr,
    objekt: String(nimm("objekt") || ""),
    art: art || (alt?.art || ""), artDe: artDe || (alt?.artDe || ""),
    lat: nimm("lat", koord), lon: nimm("lon", koord),
    genauigkeitM: nimm("genauigkeitM", bkZahl),
    quelle: BK_QUELLEN.includes(String(nimm("quelle") || "")) ? String(nimm("quelle")) : "",
    stammumfangCm: nimm("stammumfangCm", bkZahl),
    hoeheM: nimm("hoeheM", bkZahl),
    kronendurchmesserM: nimm("kronendurchmesserM", bkZahl),
    altersphase: String(nimm("altersphase") || ""),
    standort: String(nimm("standort") || "").slice(0, 300),
    schutz: String(nimm("schutz") || "keiner"),
    status: String(nimm("status") || "aktiv"),
    bemerkung: String(nimm("bemerkung") || "").slice(0, 2000),
    angelegtAm: alt?.angelegtAm || jetzt.toISOString(),
    angelegtVon: alt?.angelegtVon || login,
    geaendertAm: jetzt.toISOString(),
    geaendertVon: login,
    kontrollen: alt ? alt.kontrollen : [],
    massnahmen: alt ? alt.massnahmen : [],
    // Ein Standort ist Teil des Nachweises: eine korrigierte Position löscht
    // die alte nicht, sie wandert mit ihrem Ende in die Historie.
    positionHistorie: alt ? bkPositionHistorie(alt, neuLat, neuLon, jetzt, positionAngefasst) : [],
    // Nur bei der Neuanlage gesetzt (siehe Idempotenz-Prüfung oben); bei einer
    // Stammdatenänderung bleibt die Kennung der ursprünglichen Anlage stehen.
    vorgangId: alt ? (alt.vorgangId ?? null) : (d.vorgangId || null),
  };
  return { store: { ...s, baeume: { ...s.baeume, [nr]: baum } }, baum };
}

// ─── Kontrollen ─────────────────────────────────────────────────────────────

/** Jüngste Kontrolle nach Datum, bei gleichem Datum nach Erfassungszeit. */
export function bkLetzteKontrolle(baum) {
  const ks = Array.isArray(baum?.kontrollen) ? baum.kontrollen : [];
  if (!ks.length) return null;
  return [...ks].sort((a, b) => `${a.datum}|${a.erfasstAm || ""}`.localeCompare(`${b.datum}|${b.erfasstAm || ""}`)).pop();
}

export function bkSchadstufe(k) {
  const v = Number(k?.vitalitaet);
  if (v >= 3 || k?.verkehrssicher === "nein") return "geschaedigt";
  if (v === 2 || k?.verkehrssicher === "eingeschraenkt") return "geschwaecht";
  return "gesund";
}

export function bkIntervallMonate(kontrolle, baum) {
  const phase = BK_INTERVALL[baum?.altersphase] || BK_INTERVALL.Reifephase;
  return phase[bkSchadstufe(kontrolle)];
}

export function bkNaechsteKontrolle(kontrolle, baum) {
  const intervallMonate = bkIntervallMonate(kontrolle, baum);
  return { intervallMonate, datum: bkTagPlus(kontrolle?.datum, { monate: intervallMonate }) };
}

/**
 * Kontrolle eintragen — ADDITIV. Eine schon vorhandene Id (Wiederholung nach
 * Verbindungsabbruch) lässt den Store unverändert, statt die Kontrolle zu
 * überschreiben: Kontrollen sind Nachweise.
 */
export function bkKontrolleEintragen(store, nr, k, { login = "", jetzt = new Date() } = {}) {
  const s = bkNormalisieren(store);
  const baum = s.baeume[nr];
  if (!baum) throw new Error(`Baum ${nr} gibt es nicht.`);
  if (!istObjekt(k)) throw new Error("Kontrolle fehlt.");
  if (k.id) {
    const da = baum.kontrollen.find((x) => x.id === k.id);
    if (da) return { store: s, kontrolle: da, doppelt: true };
  }
  if (!bkIstDatum(k.datum)) throw new Error("Datum der Kontrolle (YYYY-MM-DD) fehlt.");
  if (!BK_KONTROLLARTEN.includes(k.artKontrolle)) throw new Error("Art der Kontrolle wählen.");
  const vit = Number(k.vitalitaet);
  if (!BK_VITALITAET.some((v) => v.stufe === vit)) throw new Error("Vitalität (0–3) bewerten.");
  if (!BK_VERKEHRSSICHER.some((v) => v.id === k.verkehrssicher)) throw new Error("Verkehrssicherheit bewerten.");
  const befund = {};
  for (const bereich of Object.keys(BK_BEFUND)) {
    befund[bereich] = Array.isArray(k.befund?.[bereich]) ? k.befund[bereich].map((x) => String(x)) : [];
  }
  const gps = istObjekt(k.gps) && Number.isFinite(Number(k.gps.lat)) && Number.isFinite(Number(k.gps.lon))
    ? { lat: Number(k.gps.lat), lon: Number(k.gps.lon), genauigkeitM: bkZahl(k.gps.genauigkeitM) }
    : null;
  const neu = {
    id: k.id ? String(k.id) : bkId("k", jetzt),
    datum: k.datum,
    kontrolleur: String(k.kontrolleur || login),
    artKontrolle: k.artKontrolle,
    vitalitaet: vit,
    verkehrssicher: k.verkehrssicher,
    befund,
    bemerkung: String(k.bemerkung || "").slice(0, 2000),
    fotos: Array.isArray(k.fotos) ? k.fotos.map((x) => String(x)) : [],
    gps,
    unterschrift: typeof k.unterschrift === "string" && k.unterschrift.startsWith("data:image/") ? k.unterschrift : null,
    gbuIds: [],
    erfasstAm: jetzt.toISOString(),
    erfasstVon: login,
  };
  const vorschlag = bkNaechsteKontrolle(neu, baum);
  neu.intervallMonate = Number(k.intervallMonate) > 0 ? Number(k.intervallMonate) : vorschlag.intervallMonate;
  neu.naechsteKontrolle = bkIstDatum(k.naechsteKontrolle) ? k.naechsteKontrolle : bkTagPlus(neu.datum, { monate: neu.intervallMonate });
  const kontrollen = [...baum.kontrollen, neu];
  return { store: { ...s, baeume: { ...s.baeume, [nr]: { ...baum, kontrollen } } }, kontrolle: neu, doppelt: false };
}

/** Teilprojekt B: nach dem Speichern einer GBU deren Id an der Kontrolle vermerken. */
export function bkKontrolleGbuVerweisen(store, nr, kontrolleId, gbuId) {
  const s = bkNormalisieren(store);
  const baum = s.baeume[nr];
  if (!baum) throw new Error(`Baum ${nr} gibt es nicht.`);
  const id = String(gbuId || "").trim();
  if (!id) throw new Error("GBU-Id fehlt.");
  const i = baum.kontrollen.findIndex((x) => x.id === kontrolleId);
  if (i < 0) throw new Error(`Kontrolle ${kontrolleId} gibt es nicht.`);
  const alt = baum.kontrollen[i];
  const gbuIds = Array.isArray(alt.gbuIds) ? alt.gbuIds : [];
  const kontrolle = gbuIds.includes(id) ? alt : { ...alt, gbuIds: [...gbuIds, id] };
  const kontrollen = baum.kontrollen.map((x, j) => (j === i ? kontrolle : x));
  return { store: { ...s, baeume: { ...s.baeume, [nr]: { ...baum, kontrollen } } }, kontrolle };
}

// ─── Maßnahmen ──────────────────────────────────────────────────────────────

export function bkFristAusDringlichkeit(dringlichkeit, datum) {
  const d = BK_DRINGLICHKEIT.find((x) => x.id === dringlichkeit);
  if (!d || !bkIstDatum(datum)) return null;
  return bkTagPlus(datum, { tage: d.tage || 0, monate: d.monate || 0 });
}

export function bkMassnahmeEintragen(store, nr, m, { login = "", jetzt = new Date() } = {}) {
  const s = bkNormalisieren(store);
  const baum = s.baeume[nr];
  if (!baum) throw new Error(`Baum ${nr} gibt es nicht.`);
  if (!istObjekt(m)) throw new Error("Maßnahme fehlt.");
  if (m.id) {
    const da = baum.massnahmen.find((x) => x.id === m.id);
    if (da) return { store: s, massnahme: da, doppelt: true };
  }
  if (!BK_MASSNAHMEN.includes(m.art)) throw new Error("Maßnahme aus dem Katalog wählen.");
  const bemerkung = String(m.bemerkung || "").trim().slice(0, 2000);
  if (m.art === "Sonstige Maßnahme" && !bemerkung) throw new Error('Bei "Sonstige Maßnahme" die Bemerkung ausfüllen.');
  if (!BK_DRINGLICHKEIT.some((d) => d.id === m.dringlichkeit)) throw new Error("Dringlichkeit wählen.");
  const kontrolleId = m.kontrolleId ? String(m.kontrolleId) : null;
  if (kontrolleId && !baum.kontrollen.some((k) => k.id === kontrolleId)) throw new Error(`Kontrolle ${kontrolleId} gibt es nicht.`);
  const basis = bkIstDatum(m.datum) ? m.datum : jetzt.toISOString().slice(0, 10);
  const neu = {
    id: m.id ? String(m.id) : bkId("m", jetzt),
    kontrolleId,
    art: m.art,
    dringlichkeit: m.dringlichkeit,
    faelligBis: bkIstDatum(m.faelligBis) ? m.faelligBis : bkFristAusDringlichkeit(m.dringlichkeit, basis),
    status: "offen",
    dolibarrTaskId: Number(m.dolibarrTaskId) > 0 ? Number(m.dolibarrTaskId) : null,
    erledigtAm: null,
    erledigtVon: null,
    bemerkung,
    angelegtAm: jetzt.toISOString(),
    angelegtVon: login,
  };
  const massnahmen = [...baum.massnahmen, neu];
  return { store: { ...s, baeume: { ...s.baeume, [nr]: { ...baum, massnahmen } } }, massnahme: neu, doppelt: false };
}

/** Nur status/erledigtAm/erledigtVon/bemerkung — alles andere bleibt (Nachweis). */
export function bkMassnahmeErledigen(store, nr, massnahmeId, { login = "", jetzt = new Date(), status = "erledigt", bemerkung } = {}) {
  const s = bkNormalisieren(store);
  const baum = s.baeume[nr];
  if (!baum) throw new Error(`Baum ${nr} gibt es nicht.`);
  if (!["beauftragt", "erledigt"].includes(status)) throw new Error("Status muss beauftragt oder erledigt sein.");
  const i = baum.massnahmen.findIndex((x) => x.id === massnahmeId);
  if (i < 0) throw new Error(`Maßnahme ${massnahmeId} gibt es nicht.`);
  const alt = baum.massnahmen[i];
  const massnahme = {
    ...alt, status,
    erledigtAm: status === "erledigt" ? jetzt.toISOString() : null,
    erledigtVon: status === "erledigt" ? login : null,
    bemerkung: bemerkung !== undefined ? String(bemerkung).slice(0, 2000) : alt.bemerkung,
  };
  const massnahmen = baum.massnahmen.map((x, j) => (j === i ? massnahme : x));
  return { store: { ...s, baeume: { ...s.baeume, [nr]: { ...baum, massnahmen } } }, massnahme };
}

/** Jüngstes offenes Dolibarr-Projekt (statut ≠ 2) des Kunden — oder null. */
export function bkProjektFuerKunde(projekte, kundeId) {
  const liste = (Array.isArray(projekte) ? projekte : [])
    .filter((p) => p && Number(p.statut) !== 2 && String(p.socid ?? p.fk_soc ?? "") === String(kundeId))
    .sort((a, b) => Number(b.date_c || 0) - Number(a.date_c || 0));
  return liste[0] || null;
}

// ─── Auswertung ─────────────────────────────────────────────────────────────

/** Ampel für Karte und Liste. modus: kontrolle | sicherheit | massnahmen */
export function bkStatusFarbe(baum, heute, modus = "kontrolle") {
  const k = bkLetzteKontrolle(baum);
  if (modus === "sicherheit") {
    if (!k) return "grau";
    return k.verkehrssicher === "ja" ? "gruen" : k.verkehrssicher === "eingeschraenkt" ? "gelb" : "rot";
  }
  if (modus === "massnahmen") {
    const offen = (baum?.massnahmen || []).filter((m) => m && m.status !== "erledigt");
    if (!offen.length) return "gruen";
    return offen.some((m) => m.dringlichkeit === "sofort" || (m.faelligBis && m.faelligBis < heute)) ? "rot" : "gelb";
  }
  if (!k || !k.naechsteKontrolle) return "grau";
  if (k.naechsteKontrolle < heute) return "rot";
  return k.naechsteKontrolle <= bkTagPlus(heute, { tage: BK_VORWARNUNG_TAGE }) ? "gelb" : "gruen";
}

export const bkMarkerFarbe = (baum, heute, modus) => BK_FARBEN[bkStatusFarbe(baum, heute, modus)];

/** Kreis auf der Karte = Kronenprojektion; ohne Angabe ein kleiner Punkt von 2 m. */
export const bkKronenRadiusM = (baum) => {
  const d = Number(baum?.kronendurchmesserM);
  return d > 0 ? d / 2 : 2;
};

/** Alles, was Aufmerksamkeit braucht — rot vor gelb, dann nach Fälligkeit. Nur aktive Bäume. */
export function bkFaellig(store, heute, vorwarnTage = BK_VORWARNUNG_TAGE) {
  const s = bkNormalisieren(store);
  const grenze = bkTagPlus(heute, { tage: vorwarnTage });
  const out = [];
  for (const b of Object.values(s.baeume)) {
    if (b.status !== "aktiv") continue;
    const k = bkLetzteKontrolle(b);
    if (!k) out.push({ baum: b, grund: "nie kontrolliert", faellig: null, stufe: "rot" });
    else if (k.naechsteKontrolle && k.naechsteKontrolle < heute) out.push({ baum: b, grund: "Kontrolle überfällig", faellig: k.naechsteKontrolle, stufe: "rot" });
    else if (k.naechsteKontrolle && k.naechsteKontrolle <= grenze) out.push({ baum: b, grund: "Kontrolle fällig", faellig: k.naechsteKontrolle, stufe: "gelb" });
    for (const m of b.massnahmen) {
      if (!m || m.status === "erledigt") continue;
      if (m.dringlichkeit === "sofort") out.push({ baum: b, grund: `Maßnahme sofort: ${m.art}`, faellig: m.faelligBis || null, stufe: "rot", massnahme: m });
      else if (m.faelligBis && m.faelligBis < heute) out.push({ baum: b, grund: `Maßnahme überfällig: ${m.art}`, faellig: m.faelligBis, stufe: "rot", massnahme: m });
      else if (m.faelligBis && m.faelligBis <= grenze) out.push({ baum: b, grund: `Maßnahme fällig: ${m.art}`, faellig: m.faelligBis, stufe: "gelb", massnahme: m });
    }
  }
  const rang = { rot: 0, gelb: 1 };
  return out.sort((a, b) => (rang[a.stufe] - rang[b.stufe]) || a.baum.nr.localeCompare(b.baum.nr) || String(a.faellig || "").localeCompare(String(b.faellig || "")));
}

export function bkSuche(store, text) {
  const s = bkNormalisieren(store);
  const q = String(text || "").trim().toLowerCase();
  return Object.values(s.baeume)
    .filter((b) => !q || [b.nr, b.art, b.artDe, b.standort, s.objekte[b.objekt]?.name].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => a.nr.localeCompare(b.nr));
}

/**
 * Alle Stores zu EINER Liste — die Karte ist der Einstieg und zeigt die Bäume
 * aller Kunden (Präzisierung 17.09.2026). Kunde und Kundenname hängen ab hier
 * an jedem Baum: eine Baumnummer ist nur innerhalb eines Stores eindeutig.
 *
 * I4 (Whole-Branch-Review): nicht-aktive Bäume (gefällt, entfernt) werden
 * HIER NICHT ausgefiltert — das ist die Basisfassung: `bkSuche` zeigte sie mit
 * dem Vermerk "(status)", nur die Karte blendete sie aus. Diese Funktion ist
 * die EINZIGE Quelle für Karte, Liste und Fällig (Präzisierung 17.09.2026) —
 * ein Filter hier hätte einen gefällten Baum aus der ganzen Oberfläche
 * verschwinden lassen, samt seiner Kontrollhistorie. `BaumKarte.jsx` filtert
 * beim Zeichnen selbst; `bkFaellig` filtert für den Fällig-Reiter selbst
 * (sonst stünde ein gefällter Baum als "nie kontrolliert" rot da).
 */
export function bkBaeumeAllerKunden(stores) {
  const out = [];
  for (const [kundeId, roh] of Object.entries(istObjekt(stores) ? stores : {})) {
    if (!istObjekt(roh)) continue;
    const s = bkNormalisieren(roh);
    for (const b of Object.values(s.baeume)) {
      out.push({ ...b, kundeId: String(kundeId), kundeName: s.kunde.name || String(kundeId) });
    }
  }
  return out.sort((a, b) => String(a.kundeName).localeCompare(String(b.kundeName)) || String(a.nr).localeCompare(String(b.nr)));
}

/** Punkte für fitBounds — ein Baum ohne Koordinaten hat keinen Platz auf der Karte, bleibt aber in der Liste. */
export const bkVerortet = (baeume) => (Array.isArray(baeume) ? baeume : [])
  .map((b) => [Number(b?.lat), Number(b?.lon)])
  .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

/**
 * Filter für Karte, Liste UND Fällig. Anders als `bkStatusFarbe`, das nur
 * einfärbt, blendet das hier aus — alle Ansichten rendern aus demselben
 * Ergebnis, damit der Zähler „zeigt X von Y" keiner von ihnen widerspricht.
 * Ein nie kontrollierter Baum gilt als fällig UND als überfällig: er ist der
 * dringendere Fall, nicht der harmlosere. `kunden` ist eine Mehrfachauswahl,
 * leer heißt „alle" — der Normalfall.
 */
export const BK_FILTER_LEER = { kunden: [], kontrolle: "alle", sicherheit: "alle", massnahmen: "alle", art: "", objekt: "", text: "" };

export const bkFilterAktiv = (filter) => {
  const f = { ...BK_FILTER_LEER, ...(istObjekt(filter) ? filter : {}) };
  return (Array.isArray(f.kunden) && f.kunden.length > 0)
    || f.kontrolle !== "alle" || f.sicherheit !== "alle" || f.massnahmen !== "alle"
    || !!String(f.art).trim() || !!String(f.objekt).trim() || !!String(f.text).trim();
};

export function bkFilter(baeume, filter, heute) {
  const f = { ...BK_FILTER_LEER, ...(istObjekt(filter) ? filter : {}) };
  const kunden = (Array.isArray(f.kunden) ? f.kunden : []).map(String);
  const art = String(f.art || "").trim().toLowerCase();
  const text = String(f.text || "").trim().toLowerCase();
  const objekt = String(f.objekt || "").trim();
  const grenze = bkTagPlus(heute, { tage: BK_VORWARNUNG_TAGE });
  const treffer = (b) => {
    if (kunden.length && !kunden.includes(String(b.kundeId))) return false;
    const k = bkLetzteKontrolle(b);
    if (f.kontrolle !== "alle") {
      const naechste = k?.naechsteKontrolle || null;
      const ueberfaellig = !naechste || naechste < heute;
      if (f.kontrolle === "ueberfaellig" && !ueberfaellig) return false;
      if (f.kontrolle === "faellig" && !(ueberfaellig || naechste <= grenze)) return false;
    }
    if (f.sicherheit !== "alle" && (k?.verkehrssicher || "") !== f.sicherheit) return false;
    if (f.massnahmen !== "alle") {
      const offen = (Array.isArray(b.massnahmen) ? b.massnahmen : []).filter((m) => m && m.status !== "erledigt");
      if (f.massnahmen === "keine" && offen.length) return false;
      if (f.massnahmen === "offen" && !offen.length) return false;
      if (f.massnahmen === "sofort" && !offen.some((m) => m.dringlichkeit === "sofort")) return false;
    }
    if (art && ![b.artDe, b.art].some((x) => String(x || "").toLowerCase().includes(art))) return false;
    if (objekt && String(b.objekt || "") !== objekt) return false;
    if (text && ![b.nr, b.art, b.artDe, b.standort, b.bemerkung, b.kundeName].some((x) => String(x || "").toLowerCase().includes(text))) return false;
    return true;
  };
  return (Array.isArray(baeume) ? baeume : []).filter((b) => b && treffer(b))
    .sort((a, b) => String(a.kundeName || "").localeCompare(String(b.kundeName || "")) || String(a.nr).localeCompare(String(b.nr)));
}

/**
 * Bestandslisten für die Auswahlen „Baumart" und „Objekt" in der Filterleiste
 * (18.09.2026) — nur was in den geladenen Bäumen tatsächlich vorkommt,
 * alphabetisch und ohne Duplikate. Eine leere Liste heißt: die Leiste blendet
 * die Auswahl aus, statt eine leere Auswahl anzuzeigen.
 */
export function bkArtenImBestand(baeume) {
  const namen = new Set();
  for (const b of Array.isArray(baeume) ? baeume : []) {
    const name = String(b?.artDe || b?.art || "").trim();
    if (name) namen.add(name);
  }
  return [...namen].sort((a, b) => a.localeCompare(b, "de"));
}

/** `objekte` ist die Namenskarte (id → { name }) wie sonst im Store — ohne Eintrag fällt der Name auf die Id zurück. */
export function bkObjekteImBestand(baeume, objekte) {
  const ids = new Set();
  for (const b of Array.isArray(baeume) ? baeume : []) {
    const id = String(b?.objekt || "").trim();
    if (id) ids.add(id);
  }
  const namenkarte = istObjekt(objekte) ? objekte : {};
  return [...ids]
    .map((id) => ({ id, name: namenkarte[id]?.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Eintrag für index.json — Kundenliste ohne alle Stores zu laden. */
export function bkIndexEintrag(store, heute) {
  const s = bkNormalisieren(store);
  const aktive = Object.values(s.baeume).filter((b) => b.status === "aktiv");
  const termine = aktive.map((b) => bkLetzteKontrolle(b)?.naechsteKontrolle).filter(Boolean).sort();
  return { name: s.kunde.name || "", anzahl: aktive.length, naechsteKontrolle: termine[0] || null, faellig: bkFaellig(s, heute).length, stand: heute };
}

/**
 * Vorbelegung der GBU (Teilprojekt B): Stammdaten + Baumcheck-Freitexte aus
 * der letzten Kontrolle. Feldnamen sind Vertrag — nicht umbenennen.
 */
export function bkFuerGbu(baum) {
  const b = istObjekt(baum) ? baum : {};
  const k = bkLetzteKontrolle(b);
  const bef = k?.befund || {};
  const liste = (...bereiche) => bereiche.flatMap((x) => (Array.isArray(bef[x]) ? bef[x] : [])).join(", ");
  const umfang = bkZahl(b.stammumfangCm);
  const krone = bkZahl(b.kronendurchmesserM);
  const hoehe = bkZahl(b.hoeheM);
  return {
    baumart: b.artDe && b.art ? `${b.artDe} (${b.art})` : (b.artDe || b.art || ""),
    hoehe: hoehe != null ? String(hoehe) : "",
    bhd: umfang > 0 ? String(Math.round(umfang / Math.PI)) : "",
    stammumfangCm: umfang > 0 ? umfang : null,
    kronendurchmesserM: krone > 0 ? krone : null,
    krone: liste("krone"),
    stamm: liste("stammfuss", "stamm"),
    wurzel: liste("umfeld", "wurzel"),
    gesundheitszustand: k ? (BK_GBU_GESUNDHEIT[k.vitalitaet] || "") : "",
    standsicherheit: k ? (BK_GBU_STANDSICHERHEIT[k.verkehrssicher] || "") : "",
    kontrolleId: k?.id || null,
    nr: b.nr || "",
  };
}

// Rückweg von BK_GBU_GESUNDHEIT/BK_GBU_STANDSICHERHEIT. Ein Baumcheck der GBU
// kennt keine Roloff-Stufe und kein „verkehrssicher" — die Maske lässt beides
// vor dem Anlegen bestätigen, das hier ist nur der Vorschlag.
// `BK_GBU_GESUNDHEIT` ist { 0: "vital", 1: "leicht eingeschränkt",
// 2: "deutlich eingeschränkt", 3: "absterbend" } — vier Roloff-Stufen. Die
// GBU-Maske (`GBU_GESUNDHEIT` in gbu-data.js) kennt eine fünfte Ausprägung
// „abgestorben"; sie hat in Roloff keine eigene Stufe und gehört zu 3.
const GBU_VITALITAET_ZURUECK = {
  ...Object.fromEntries(Object.entries(BK_GBU_GESUNDHEIT).map(([stufe, text]) => [text, Number(stufe)])),
  abgestorben: 3,
};
const GBU_SICHER_ZURUECK = Object.fromEntries(
  Object.entries(BK_GBU_STANDSICHERHEIT).map(([id, text]) => [text, id]));

/**
 * Gegenrichtung zu `bkFuerGbu`: aus einer gespeicherten Gefährdungsbeurteilung
 * einen Katasterbaum samt erster Kontrolle bauen. Ohne Kunde oder Position
 * gibt es nichts zu speichern (ein Baum ohne Standort ist kein Kataster).
 */
export function bkBaumAusGbu(record, heute = bkHeute()) {
  const r = istObjekt(record) ? record : {};
  const kundeId = r.kunde?.id ?? null;
  const gps = istObjekt(r.kopf?.gps) ? r.kopf.gps : null;
  const lat = gps ? Number(gps.lat) : NaN, lon = gps ? Number(gps.lon) : NaN;
  if (kundeId == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const bc = istObjekt(r.baumcheck) ? r.baumcheck : {};
  const bhd = bkZahl(bc.bhd);
  const befund = {};
  for (const bereich of Object.keys(BK_BEFUND)) {
    befund[bereich] = Array.isArray(bc.befund?.[bereich]) ? bc.befund[bereich].map(String) : [];
  }
  const datum = bkIstDatum(r.kopf?.datum) ? r.kopf.datum : heute;
  return {
    kundeId,
    baum: {
      artDe: String(r.baum || "").trim(), art: "",
      lat, lon, genauigkeitM: bkZahl(gps.genauigkeitM), quelle: "gps",
      hoeheM: bkZahl(bc.hoehe),
      stammumfangCm: bhd != null && bhd > 0 ? Math.round(bhd * Math.PI) : null,
      standort: String(r.kopf?.strasse || r.kopf?.einsatzort || "").trim(),
      bemerkung: `Aus Gefährdungsbeurteilung ${r.id || ""} übernommen.`.trim(),
    },
    kontrolle: {
      datum,
      artKontrolle: "Zusatzkontrolle",
      vitalitaet: GBU_VITALITAET_ZURUECK[bc.gesundheit] ?? 1,
      verkehrssicher: GBU_SICHER_ZURUECK[bc.standsicherheit] || "ja",
      befund,
      bemerkung: `Baumsicherheitsbeurteilung aus GBU ${r.id || ""}`.trim(),
    },
  };
}

/** Struktur für den Kunden-Bericht (PDF). filter: { objekt, nurAktive = true, nurFaellig = false } */
export function bkBerichtDaten(store, filter = {}, heute = bkHeute()) {
  const s = bkNormalisieren(store);
  const { objekt = "", nurAktive = true, nurFaellig = false } = filter || {};
  const faelligNrs = new Set(bkFaellig(s, heute).map((f) => f.baum.nr));
  const baeume = Object.values(s.baeume)
    .filter((b) => (!nurAktive || b.status === "aktiv") && (!objekt || b.objekt === objekt) && (!nurFaellig || faelligNrs.has(b.nr)))
    .sort((a, b) => a.nr.localeCompare(b.nr))
    .map((b) => {
      const k = bkLetzteKontrolle(b);
      return {
        nr: b.nr, art: b.artDe || b.art || "", artLat: b.art || "",
        objekt: s.objekte[b.objekt]?.name || b.objekt || "", standort: b.standort || "",
        stammumfangCm: b.stammumfangCm, hoeheM: b.hoeheM, kronendurchmesserM: b.kronendurchmesserM,
        altersphase: b.altersphase || "", schutz: b.schutz || "keiner", status: b.status,
        letzteKontrolle: k, naechsteKontrolle: k?.naechsteKontrolle || null,
        kontrollstand: bkStatusFarbe(b, heute, "kontrolle"), sicherheit: bkStatusFarbe(b, heute, "sicherheit"),
        offeneMassnahmen: b.massnahmen.filter((m) => m && m.status !== "erledigt"),
        faellig: faelligNrs.has(b.nr),
      };
    });
  return {
    kunde: s.kunde, erstellt: heute, baeume,
    zusammenfassung: {
      anzahl: baeume.length,
      kontrolliert: baeume.filter((b) => b.letzteKontrolle).length,
      faellig: baeume.filter((b) => b.faellig).length,
      nichtVerkehrssicher: baeume.filter((b) => b.sicherheit === "rot").length,
      offeneMassnahmen: baeume.reduce((n, b) => n + b.offeneMassnahmen.length, 0),
    },
  };
}

/** Aus mehreren watchPosition-Meldungen die genaueste; Punkte ohne Zahlen fallen raus. */
export function bkGpsBeste(punkte) {
  let best = null;
  for (const p of Array.isArray(punkte) ? punkte : []) {
    const lat = Number(p?.lat), lon = Number(p?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const g = bkZahl(p.genauigkeitM);
    if (!best || (g ?? Infinity) < (best.genauigkeitM ?? Infinity)) best = { lat, lon, genauigkeitM: g };
  }
  return best;
}

// ─── Karte ──────────────────────────────────────────────────────────────────

/** Weltansicht — der Rückfall, wenn weder Mandant noch Merker noch Bäume noch GPS etwas hergeben. */
export const BK_START = { lat: 51.1657, lon: 10.4515, zoom: 6 };

/**
 * Fester Startausschnitt der Karte (Ansage Inhaber 19.09.2026 — die Karte
 * soll IMMER dort aufgehen, nicht beim zuletzt verschobenen Ausschnitt und
 * nicht auf alle Bäume gefittet). Kommt aus `mandant.baumkataster.kartenStart`
 * (mandant.json), ersatzweise die Deutschland-Übersicht BK_START.
 */
export function bkKartenStart() {
  const eigener = mandantAusCache()?.baumkataster?.kartenStart;
  const lat = Number(eigener?.lat), lon = Number(eigener?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const zoom = Number(eigener?.zoom);
    return { lat, lon, zoom: Number.isFinite(zoom) ? zoom : 13 };
  }
  return BK_START;
}

/**
 * Trefferliste aus Nominatim (`format=jsonv2`). Die Koordinaten kommen dort
 * als Zeichenketten; ungeparst landet später `setView(["50.5", "8.7"])` in
 * Leaflet und die Karte springt nirgendwohin.
 */
export function bkOrtstreffer(json) {
  const out = [];
  for (const t of Array.isArray(json) ? json : []) {
    const lat = parseFloat(t?.lat), lon = parseFloat(t?.lon);
    const name = String(t?.display_name || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !name) continue;
    out.push({ name, lat, lon, typ: String(t.type || "") });
    if (out.length === 5) break;
  }
  return out;
}

export const BK_KUNDE_OHNE_BAEUME = "Kunde hat noch keine verorteten Bäume";

/**
 * Suchzeichenkette für Nominatim aus einem Dolibarr-Kunden. Ohne Ort oder PLZ
 * gibt es nichts zu suchen — eine Straße allein findet Nominatim nicht, und
 * ein Fehlversuch kostet eine Anfrage, die wir nach Nutzungsrichtlinie sparen.
 */
export function bkKundenAdresse(thirdparty) {
  const t = istObjekt(thirdparty) ? thirdparty : {};
  const strasse = String(t.address || "").trim().replace(/\s*\n\s*/g, ", ");
  const plz = String(t.zip || "").trim();
  const ort = String(t.town || "").trim();
  const land = String(t.country || "").trim();
  if (!ort && !plz) return null;
  return [strasse, [plz, ort].filter(Boolean).join(" "), land].filter(Boolean).join(", ");
}

const punktAus = (o) => {
  const lat = Number(o?.lat), lon = Number(o?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

/**
 * Startausschnitt beim Öffnen: gemerkter Kundenfilter → sonst immer der feste
 * Kartenausschnitt (bkKartenStart()). Gibt nur den Deskriptor zurück;
 * ausgeführt wird er in BaumKarte.jsx. Der Kundenfilter ist eine sichtbare,
 * bewusste Auswahl — wer einen Kunden gewählt hat, soll dessen Bäume sehen.
 */
export function bkStartAusschnitt(kundenPunkte = []) {
  if (Array.isArray(kundenPunkte) && kundenPunkte.length) return { typ: "bounds", punkte: kundenPunkte };
  return { typ: "start", ...bkKartenStart() };
}

/**
 * Sprung bei einer Kundenfilter-Änderung: Bäume → Kundenadresse → stehen
 * bleiben. Bei genau EINEM Baum kein fitBounds — das zoomt auf einen einzelnen
 * Punkt unbrauchbar weit hinein.
 */
export function bkKundenAusschnitt(punkte, kundenOrt) {
  const ps = Array.isArray(punkte) ? punkte : [];
  if (ps.length === 1) return { typ: "punkt", lat: ps[0][0], lon: ps[0][1], zoom: 18 };
  if (ps.length > 1) return { typ: "bounds", punkte: ps };
  const p = punktAus(kundenOrt);
  if (p) return { typ: "ort", ...p, zoom: 16 };
  return { typ: "bleiben", hinweis: BK_KUNDE_OHNE_BAEUME };
}
