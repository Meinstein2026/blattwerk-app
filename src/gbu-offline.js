// src/gbu-offline.js
// Reine Logik der Offline-Vor-Ort-GBU (kein DOM, kein Netz, kein IndexedDB-
// Zugriff) — von dolibarr-app.jsx UND vom Fachmodul src/server/gbu-offline.mjs
// importiert, damit Anzeige/Aufraeumen auf dem Geraet und die Beteiligten-
// Ablage in Nextcloud nicht auseinanderlaufen (gleiches Muster wie
// src/arbeitsschutz.js oder src/fahrtenbuch.js).
//
// Drei Dinge stecken hier drin:
//  1. gbuPdfUeberzaehlige — welche lokal abgelegten PDFs beim Aufraeumen
//     verworfen werden (die letzten 20 Beurteilungen bleiben, Rest raus).
//  2. gbuBeteiligteSchluessel — wer bei einer Beurteilung dabei war (fuer die
//     automatische Weitergabe an Kolleg:innen, sobald wieder Netz da ist).
//  3. Der Beteiligten-Store (Blattwerk/App/gbu-beteiligte.json) plus das
//     30-Tage-Fenster von /api/nc/gbu/meine.

/**
 * Von einer Liste { schluessel, zeit } die Schluessel jenseits der neuesten
 * `max` (nach `zeit` absteigend) zurueckgeben — das sind die zu loeschenden.
 * Bewusst ohne jede Annahme ueber die Form von `schluessel` (kein Parsen von
 * "gbu-<epoch>" o.ae.): der Kataster-Zweig legt seine Fotos unter eigenen
 * Schluesseln ab und braucht dieselbe Auswahl.
 */
export function gbuPdfUeberzaehlige(eintraege, max = 20) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  if (liste.length <= max) return [];
  return [...liste]
    .sort((a, b) => (b.zeit || 0) - (a.zeit || 0))
    .slice(max)
    .map((e) => e.schluessel);
}

const nameGetrimmt = (s) => String(s || "").trim();
const nameNorm = (s) => nameGetrimmt(s).toLowerCase();

/**
 * Dolibarr-Logins aller Beteiligten einer Beurteilung: die anwesende
 * Mannschaft (`personal[].key`, Aushilfen ohne Login liefern keinen), die
 * aufsichtsfuehrende Person (v3: `kopf.aufsicht`, v2: `aufsichtsfuehrender`
 * — ein Freitextname, wird ueber `personal[].name` auf einen Login
 * abgebildet; passt keiner, wird KEIN Schluessel erfunden) und der
 * Ersteller/die Erstellerin des Geraets (`meLogin` — der einzige Login, der
 * immer sicher bekannt ist, siehe buildRecord in GbuFormSkt.jsx). Rueckgabe
 * dedupliziert und ohne leere Werte.
 */
export function gbuBeteiligteSchluessel(record, meLogin) {
  const personal = Array.isArray(record?.personal) ? record.personal : [];
  const aufsichtName = nameNorm(record?.kopf?.aufsicht ?? record?.aufsichtsfuehrender);
  const schluessel = new Set();
  if (nameGetrimmt(meLogin)) schluessel.add(nameGetrimmt(meLogin));
  for (const p of personal) {
    const key = nameGetrimmt(p?.key);
    if (key) schluessel.add(key);
  }
  if (aufsichtName) {
    const treffer = personal.find((p) => nameNorm(p?.name) === aufsichtName);
    if (treffer && nameGetrimmt(treffer.key)) schluessel.add(nameGetrimmt(treffer.key));
  }
  return [...schluessel];
}

// ─── Beteiligten-Store (Blattwerk/App/gbu-beteiligte.json) ─────────────────
export const GBU_BETEILIGTE_STORE = "/Blattwerk/App/gbu-beteiligte.json";
export const GBU_BETEILIGTE_STORE_LEER = { version: 1, eintraege: [] };
// Deutlich groesser als das 30-Tage-Fenster von gbuMeineFilter: ein Geraet,
// das laenger offline war, soll trotzdem noch etwas nachziehen koennen.
const GBU_BETEILIGTE_AUFBEWAHREN_TAGE = 45;

const tageDiff = (heuteIso, datumIso) => {
  const heute = new Date(`${String(heuteIso).slice(0, 10)}T00:00:00Z`).getTime();
  const datum = new Date(`${String(datumIso).slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(heute) || Number.isNaN(datum)) return Infinity;
  return Math.round((heute - datum) / 86400000);
};

/** Store aus Nextcloud in eine verlaessliche Form bringen (fehlende/kaputte Datei -> leer). */
export function gbuBeteiligteNorm(store) {
  const eintraege = Array.isArray(store?.eintraege) ? store.eintraege : [];
  return {
    version: 1,
    eintraege: eintraege
      .filter((e) => e && typeof e === "object" && Array.isArray(e.beteiligte) && e.beteiligte.length)
      .map((e) => ({
        filename: nameGetrimmt(e.filename), sha256: nameGetrimmt(e.sha256), datum: nameGetrimmt(e.datum),
        beteiligte: [...new Set(e.beteiligte.map(nameGetrimmt).filter(Boolean))],
      })),
  };
}

/**
 * Neuen Eintrag additiv einpflegen: dieselbe Pruefsumme (Wiederholung nach
 * einer verlorenen Server-Antwort — derselbe Fall wie beim Paperless-Upload
 * selbst, siehe submitGbuRecord) wird zusammengefuehrt statt dupliziert.
 * Bei jedem Schreiben werden Eintraege jenseits von
 * GBU_BETEILIGTE_AUFBEWAHREN_TAGE verworfen, sonst waechst die Datei
 * unbegrenzt.
 */
export function gbuBeteiligtenEintragen(store, eintrag, heuteIso) {
  const s = gbuBeteiligteNorm(store);
  const sha256 = nameGetrimmt(eintrag?.sha256);
  const beteiligte = [...new Set((eintrag?.beteiligte || []).map(nameGetrimmt).filter(Boolean))];
  const neu = {
    filename: nameGetrimmt(eintrag?.filename), sha256, datum: nameGetrimmt(eintrag?.datum), beteiligte,
  };
  const vorhanden = s.eintraege.find((e) => e.sha256 && e.sha256 === sha256);
  let eintraege;
  if (vorhanden) {
    eintraege = s.eintraege.map((e) => (e === vorhanden
      ? { ...e, beteiligte: [...new Set([...e.beteiligte, ...beteiligte])] }
      : e));
  } else {
    eintraege = [...s.eintraege, neu];
  }
  eintraege = eintraege.filter((e) => tageDiff(heuteIso, e.datum) <= GBU_BETEILIGTE_AUFBEWAHREN_TAGE);
  return { version: 1, eintraege };
}

/**
 * Beurteilungen der letzten `tageFenster` Tage, an denen `login` beteiligt
 * ist — die Antwort von POST /api/nc/gbu/meine.
 */
export function gbuMeineFilter(eintraege, login, heuteIso, tageFenster = 30) {
  const gesucht = nameGetrimmt(login);
  if (!gesucht) return [];
  return (Array.isArray(eintraege) ? eintraege : [])
    .filter((e) => Array.isArray(e?.beteiligte) && e.beteiligte.includes(gesucht))
    .filter((e) => tageDiff(heuteIso, e.datum) <= tageFenster);
}
