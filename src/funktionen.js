// Funktionen unterhalb der Bloecke — die fachliche Ebene der Mandantenfaehigkeit.
//
// Ein Block (src/mandant.js) bindet einen Dienst: ohne Nextcloud-Adresse kein
// Arbeitsschutz. Eine Funktion ist eine fachliche Einheit darunter (Angebote,
// Lager, Zeiterfassung …) mit den Dolibarr-Modulen, die sie braucht. Diese
// Datei ist die EINZIGE Stelle, die entscheidet, ob eine Funktion laeuft —
// Oberflaeche (useFunktion) und Server (funktionWache) importieren sie beide,
// gleiches Muster wie blockAktiv/blockWache.
//
// Die Tabelle steht im Code, nicht in der Mandanten-Datei: die Datei traegt
// nur Schalter (funktionen: {key: bool}); welches Dolibarr-Modul dahinter
// steckt, weiss nur die App. Spec: ../blattwerk-betrieb/docs/superpowers/specs/2026-09-19-funktionen-design.md
import { blockAktiv } from "./mandant.js";
import { BESTELL_EXTRAFELDER } from "./foerderung.js";
// Aus qualifikationen-data.js, nicht qualifikationen.js: letzteres importiert
// mandant.js, das seinerseits diese Datei importiert — ein Zyklus, der
// QUALI_DOLIBARR_EXTRAFELDER je nach Einstiegspunkt undefiniert lassen kann.
import { QUALI_DOLIBARR_EXTRAFELDER } from "./qualifikationen-data.js";

// key, label, block (String oder Liste — alle muessen an sein), dolibarr
// (interne Modulnamen aus GET /setup/modules), standardFremd, braucht (hart:
// Funktion geht mit aus), weich (nur Hinweis, nichts geht aus), pflicht
// (nicht abschaltbar, sobald der Block an ist).
export const FUNKTIONEN = [
  { key: "partner", label: "Geschäftspartner", block: "erp", dolibarr: ["societe"], standardFremd: true, braucht: [], pflicht: true },
  { key: "angebote", label: "Angebote", block: "erp", dolibarr: ["propal"], standardFremd: true, braucht: ["partner"] },
  { key: "rechnungen", label: "Rechnungen", block: "erp", dolibarr: ["facture", "banque"], standardFremd: true, braucht: ["partner"] },
  { key: "projekte", label: "Projekte", block: "erp", dolibarr: ["projet"], standardFremd: true, braucht: ["partner"] },
  { key: "lieferantenrechnungen", label: "Lieferantenrechnungen", block: "erp", dolibarr: ["fournisseur"], standardFremd: true, braucht: ["partner"] },
  { key: "bestellungen", label: "Bestellungen", block: "erp", dolibarr: ["fournisseur", "product"], standardFremd: true, braucht: ["partner"] },
  { key: "lager", label: "Lager & Lieferscheine", block: "erp", dolibarr: ["stock", "product", "expedition"], standardFremd: false, braucht: [] },
  { key: "spesen", label: "Spesen", block: "erp", dolibarr: ["expensereport"], standardFremd: true, braucht: [] },
  { key: "bank", label: "Bank (Bankzeilen & Kontoauszüge)", block: "erp", dolibarr: ["banque"], standardFremd: false, braucht: [] },
  { key: "zeiterfassung", label: "Zeiterfassung", block: "erp", dolibarr: ["projet", "blattwerkapp"], standardFremd: true, braucht: ["projekte"] },
  { key: "baumkataster", label: "Baumkataster", block: ["erp", "belege"], dolibarr: ["productbatch"], standardFremd: false, braucht: ["partner"] },
  { key: "gbu", label: "Gefährdungsbeurteilung", block: "arbeitsschutz", dolibarr: [], standardFremd: true, braucht: [], weich: ["projekte"] },
  { key: "betriebsanweisungen", label: "Betriebsanweisungen & Unterweisungen", block: "arbeitsschutz", dolibarr: [], standardFremd: true, braucht: [] },
  { key: "qualifikationen", label: "Personal & Qualifikationen", block: "arbeitsschutz", dolibarr: [], standardFremd: true, braucht: [] },
  { key: "betriebsmittel", label: "Betriebsmittel & Einweisungen", block: "arbeitsschutz", dolibarr: ["productbatch"], standardFremd: true, braucht: [] },
  { key: "fahrtenbuch", label: "Fahrtenbuch", block: "fahrtenbuch", dolibarr: [], standardFremd: true, braucht: [] },
  { key: "ueberlassung", label: "Fahrzeug-Überlassung", block: "fahrtenbuch", dolibarr: [], standardFremd: false, braucht: ["fahrtenbuch"] },
  { key: "kalender", label: "Kalender", block: "kalender", dolibarr: ["agenda"], standardFremd: true, braucht: [] },
  { key: "chat", label: "Chat", block: "chat", dolibarr: [], standardFremd: true, braucht: [] },
  { key: "telefon", label: "Telefon", block: "telefon", dolibarr: [], standardFremd: true, braucht: ["chat"] },
  { key: "tutorial", label: "Einführung (Tutorial)", block: "", dolibarr: [], standardFremd: true, braucht: [] },
];

export const FUNKTION_KEYS = FUNKTIONEN.map((f) => f.key);
const VON_KEY = Object.fromEntries(FUNKTIONEN.map((f) => [f.key, f]));

/** Vorbelegung, wenn die Mandanten-Datei keinen Schalter nennt. */
export const funktionenStandard = (kuerzel) =>
  Object.fromEntries(FUNKTIONEN.map((f) => [f.key, kuerzel === "bw" ? true : f.standardFremd]));

const bloeckeAn = (mandant, f) => [].concat(f.block).every((b) => !b || blockAktiv(mandant, b));

/**
 * Alle Funktionen aufgeloest: Block an, Schalter an (oder Standard), harte
 * braucht-Kette an, Pflicht-Funktionen immer an. Ein Objekt {key: bool}, das
 * mandantOeffentlich() 1:1 an den Browser gibt.
 */
export const funktionenAufloesen = (mandant) => {
  const standard = funktionenStandard(mandant?.kuerzel);
  const schalter = mandant?.funktionen && typeof mandant.funktionen === "object" ? mandant.funktionen : {};
  const roh = {};
  for (const f of FUNKTIONEN) {
    const an = f.pflicht ? true : (typeof schalter[f.key] === "boolean" ? schalter[f.key] : standard[f.key]);
    roh[f.key] = an && bloeckeAn(mandant, f);
  }
  // Harte Kaskade bis zum Fixpunkt — die Tabelle ist klein, das ist billig.
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const f of FUNKTIONEN) {
      if (roh[f.key] && f.braucht.some((k) => !roh[k])) { roh[f.key] = false; geaendert = true; }
    }
  }
  return roh;
};

export const funktionAktiv = (mandant, key) => funktionenAufloesen(mandant)[key] === true;

/** Tabelle mit Zustand fuer Admin-Seite und Installer. */
export const funktionenFuer = (mandant) => {
  const auf = funktionenAufloesen(mandant);
  return FUNKTIONEN.map((f) => ({ ...f, aktiv: auf[f.key], blockAktiv: bloeckeAn(mandant, f) }));
};

/** Welche Funktionen gehen mit aus, wenn `key` aus geht (transitiv, nur hart). */
export const kaskade = (key) => {
  const raus = new Set();
  let neu = [key];
  while (neu.length) {
    const naechste = [];
    for (const f of FUNKTIONEN) {
      if (!raus.has(f.key) && f.key !== key && f.braucht.some((k) => neu.includes(k))) { raus.add(f.key); naechste.push(f.key); }
    }
    neu = naechste;
  }
  return [...raus];
};

export const funktionInfo = (key) => VON_KEY[key] || null;

// Welche Zusatzfelder eine Funktion in Dolibarr braucht (elementtype + Felddefinition).
const ZUSATZFELDER = {
  bestellungen: BESTELL_EXTRAFELDER.map((f) => ({ elementtype: "commande_fournisseur", ...f })),
  qualifikationen: QUALI_DOLIBARR_EXTRAFELDER.map((f) => ({ elementtype: "user", ...f })),
};
const KONTENRAHMEN_STANDARD = "SKR03";

/**
 * Soll/Ist je aktiver Funktion. moduleAktiv = Liste aus GET /setup/modules
 * (null = nicht erreichbar), setup = Antwort von GET /blattwerkapp/setup
 * (null = Modul fehlt oder nicht erreichbar).
 */
export const dolibarrAbgleich = (mandant, { moduleAktiv, setup }) => {
  if (!Array.isArray(moduleAktiv)) return { punkte: [], einrichtbar: false, geprueft: false };
  const punkte = [];
  const appDa = moduleAktiv.includes("blattwerkapp") && !!setup;
  punkte.push({ funktion: "app", label: "Blattwerk-App-Modul", art: "blattwerkapp", name: "blattwerkapp", fehlt: !appDa });
  for (const f of funktionenFuer(mandant)) {
    if (!f.aktiv) continue;
    for (const m of f.dolibarr) punkte.push({ funktion: f.key, label: f.label, art: "modul", name: m, fehlt: !moduleAktiv.includes(m) });
    for (const z of ZUSATZFELDER[f.key] || []) {
      const voll = `${z.elementtype}.${z.name}`;
      punkte.push({ funktion: f.key, label: f.label, art: "zusatzfeld", name: voll, fehlt: !(setup?.zusatzfelder?.[voll]) });
    }
  }
  if (funktionAktiv(mandant, "rechnungen") || funktionAktiv(mandant, "lieferantenrechnungen")) {
    punkte.push({ funktion: "rechnungen", label: "Rechnungen", art: "kontenrahmen", name: KONTENRAHMEN_STANDARD, fehlt: (setup?.kontenrahmen || null) !== KONTENRAHMEN_STANDARD });
  }
  return { punkte, einrichtbar: appDa && !!setup?.admin, geprueft: true };
};

/** Aus den Punkten den POST-Body fuer /blattwerkapp/setup — nur, was fehlt. */
export const einrichtungsAuftrag = (punkte) => {
  const body = {};
  const module = [...new Set(punkte.filter((p) => p.fehlt && p.art === "modul").map((p) => p.name))];
  if (module.length) body.module = module;
  const alle = Object.values(ZUSATZFELDER).flat();
  const felder = punkte.filter((p) => p.fehlt && p.art === "zusatzfeld").map((p) => alle.find((z) => `${z.elementtype}.${z.name}` === p.name)).filter(Boolean);
  if (felder.length) body.zusatzfelder = felder.map(({ elementtype, name, label, type, size }) => ({ elementtype, name, label, type, size }));
  if (punkte.some((p) => p.fehlt && p.art === "kontenrahmen")) body.kontenrahmen = KONTENRAHMEN_STANDARD;
  return body;
};

// Offline-Warteschlangen einer abgeschalteten Funktion bleiben liegen —
// weder verworfen noch hochgeladen. Hier nur das Zaehlen; die Anzeige mit
// Export/Wieder-einschalten sitzt im AdminPanel.
const WARTESCHLANGEN = [
  { key: "gbu", speicher: "blattwerk_gbu_queue", zaehle: (v) => (Array.isArray(v) ? v.length : 0) },
  { key: "fahrtenbuch", speicher: "blattwerk_fahrtenbuch_entwuerfe", zaehle: (v) => Object.keys(v?.entwuerfe || {}).length },
];
export const WARTESCHLANGEN_SPEICHER = Object.fromEntries(WARTESCHLANGEN.map((w) => [w.key, w.speicher]));

export const warteschlangenStand = (mandant, speicher) => {
  const auf = funktionenAufloesen(mandant);
  const stand = [];
  for (const w of WARTESCHLANGEN) {
    if (auf[w.key]) continue;
    let wert = null;
    try { wert = JSON.parse(speicher.getItem(w.speicher) || "null"); } catch { wert = null; }
    const anzahl = w.zaehle(wert);
    if (anzahl > 0) stand.push({ key: w.key, label: funktionInfo(w.key).label, anzahl });
  }
  return stand;
};
