// Automatik der Vor-Ort-GBU (SKT-Formular, 16.09.2026): reine Logik ohne
// Netzzugriff. Alles, was nach draußen geht (fetch, Canvas, Geolocation), wird
// vom Aufrufer hineingereicht — so ist jede Entscheidung mit Testdaten prüfbar
// und die Maske (src/ui/GbuFormSkt.jsx) bleibt dünn.
//
// Grundsatz: was die Automatik nicht bestätigen kann, bleibt OFFEN ("") — nie "nein".
import { gbuWetterWarnung, GBU_WIND } from "./gbu-data.js";
import { bmFaellige } from "./betriebsmittel.js";

// ─── Karte: OSM-Kacheln ohne Leaflet ─────────────────────────────────────────
// Slippy-Map-Mathematik (Web Mercator). 3x3 Kacheln um die Position, davon ein
// 384-px-Fenster mit der Position in der Mitte — bei Zoom 17 rund 450 m Kante,
// Straßennamen lesbar. Das Bild wandert als DataURL in den Datensatz, damit das
// PDF auch beim späteren Nachtragen aus der Warteschlange (offline) gleich bleibt.
export const TILE_GROESSE = 256;
export const KARTE_ZOOM = 17;
export const KARTE_GROESSE = 384;

export function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const latR = (lat * Math.PI) / 180;
  const xf = ((lon + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return { x: Math.floor(xf), y: Math.floor(yf), xf, yf };
}

export function kartenAusschnitt(lat, lon, z = KARTE_ZOOM, groesse = KARTE_GROESSE) {
  const { x, y, xf, yf } = tileXY(lat, lon, z);
  // Marker-Pixel im 3x3-Mosaik (Ursprung = Kachel x-1/y-1), daraus der Fensterursprung.
  const mx = (xf - (x - 1)) * TILE_GROESSE, my = (yf - (y - 1)) * TILE_GROESSE;
  const ox = mx - groesse / 2, oy = my - groesse / 2;
  const kacheln = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = (dx + 1) * TILE_GROESSE - ox, py = (dy + 1) * TILE_GROESSE - oy;
      if (px + TILE_GROESSE <= 0 || py + TILE_GROESSE <= 0 || px >= groesse || py >= groesse) continue;
      const tx = x + dx, ty = y + dy;
      kacheln.push({ url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, x: tx, y: ty, px: Math.round(px), py: Math.round(py) });
    }
  }
  return { z, groesse, kacheln, marker: { x: groesse / 2, y: groesse / 2 } };
}

/**
 * Kartenbild als JPEG-DataURL. `fetchBild(url)` liefert etwas, das drawImage
 * nimmt (Browser: createImageBitmap(blob)); `canvas` ist ein Canvas-Element.
 * Fehlende Kacheln bleiben grau; ist gar keine da (offline), gibt es null.
 */
export async function kartenBild(lat, lon, { fetchBild, canvas, z = KARTE_ZOOM, groesse = KARTE_GROESSE } = {}) {
  const a = kartenAusschnitt(lat, lon, z, groesse);
  const bilder = await Promise.all(a.kacheln.map((k) => Promise.resolve().then(() => fetchBild(k.url)).catch(() => null)));
  if (bilder.every((b) => !b)) return null;
  canvas.width = groesse; canvas.height = groesse;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e6e6e6"; ctx.fillRect(0, 0, groesse, groesse);
  bilder.forEach((b, i) => { if (b) ctx.drawImage(b, a.kacheln[i].px, a.kacheln[i].py); });
  // Marker: roter Punkt mit weißem Rand.
  ctx.beginPath(); ctx.arc(a.marker.x, a.marker.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#e03131"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  // Attribution (Lizenzpflicht ODbL).
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(0, groesse - 14, groesse, 14);
  ctx.fillStyle = "#333333"; ctx.font = "10px sans-serif"; ctx.fillText("© OpenStreetMap-Mitwirkende", 4, groesse - 4);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// ─── Wetter: Open-Meteo (aktuelle Werte) ─────────────────────────────────────
export const WETTER_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_gusts_10m,precipitation`;

export function wetterParsen(json) {
  const c = json?.current;
  if (!c) return null;
  const windKmh = Number(c.wind_speed_10m), boenKmh = Number(c.wind_gusts_10m), niederschlagMm = Number(c.precipitation);
  if (![windKmh, boenKmh, niederschlagMm].every(Number.isFinite)) return null;
  return { windKmh, boenKmh, niederschlagMm, zeit: String(c.time || ""), quelle: "open-meteo" };
}

// Kategorien der alten Auswahlliste (GBU_WIND), damit gbuWetterWarnung weiter
// gilt. Grenzen nach Beaufort in km/h: bis 11 = 0–1 Bft, bis 28 = 2–3 Bft,
// bis 49 = 4–6 Bft, ab 50 = 7 Bft. Böen zählen voll — eine Böe wirft aus dem Baum.
export function windText(windKmh, boenKmh) {
  const v = Math.max(Number(windKmh) || 0, Number(boenKmh) || 0);
  if (v < 12) return GBU_WIND[0];
  if (v < 29) return GBU_WIND[1];
  if (v < 50) return GBU_WIND[2];
  return GBU_WIND[3];
}

export function niederschlagText(mm) {
  const v = Number(mm) || 0;
  if (v <= 0) return "trocken";
  if (v < 0.5) return "feucht";
  return "Regen";
}

/** „Witterung geeignet": nur bei ruhigem, trockenem Wetter automatisch „ja"; sonst offen + Hinweis. */
export function wetterBewertung(w, zugangId, arbeitsartId) {
  if (!w) return { geeignet: "", hinweis: "" };
  const wind = windText(w.windKmh, w.boenKmh), nied = niederschlagText(w.niederschlagMm);
  const warnung = gbuWetterWarnung(wind, nied, zugangId, arbeitsartId);
  if (warnung) return { geeignet: "", hinweis: warnung };
  if (wind === GBU_WIND[3]) return { geeignet: "", hinweis: "Starker Wind/Böen — Eignung selbst beurteilen." };
  if (nied !== "trocken") return { geeignet: "", hinweis: `Niederschlag (${nied}) — Eignung selbst beurteilen.` };
  return { geeignet: "ja", hinweis: "" };
}

export function wetterZeile(w) {
  if (!w) return "";
  const r = (n) => String(Math.round(Number(n) || 0));
  const mm = (Number(w.niederschlagMm) || 0).toFixed(1).replace(".", ",");
  const uhr = /T\d{2}:\d{2}/.test(w.zeit || "") ? " " + w.zeit.slice(11, 16) : "";
  return `Wind ${r(w.windKmh)} km/h · Böen ${r(w.boenKmh)} km/h · ${mm} mm (Open-Meteo${uhr})`;
}

// ─── Adresse: Nominatim reverse (nur online, nur als Vorschlag) ──────────────
export const GEO_URL = (lat, lon) => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

export function adresseParsen(json) {
  const a = json?.address;
  if (!a || json.error) return null;
  const ort = a.city || a.town || a.village || a.municipality || "";
  const ortsteil = a.suburb || a.city_district || a.hamlet || a.neighbourhood || "";
  const einsatzort = [ort, ortsteil].filter(Boolean).join(" ");
  const strasse = [a.road, a.house_number].filter(Boolean).join(" ");
  if (!einsatzort && !strasse) return null;
  return { einsatzort, strasse };
}

// ─── Netzempfang: onLine + Ping mit Frist ────────────────────────────────────
// Antwort = Empfang, egal welcher Status (ein 403 vom NPM ist trotzdem Netz).
// Kein Ergebnis in der Frist oder Netzfehler = kein Empfang.
export async function netzempfang({ onLine, fetch: f, timeoutMs = 3000, url = "/api/appupdate/manifest" } = {}) {
  if (onLine === false) return "nein";
  if (typeof f !== "function") return "nein";
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), timeoutMs);
  try {
    const r = await f(url, { signal: ac?.signal, cache: "no-store" });
    return r ? "ja" : "nein";
  } catch {
    return "nein";
  } finally {
    clearTimeout(timer);
  }
}

// ─── Mobilnummern: Aufsicht zuerst ───────────────────────────────────────────
export function mobilReihenfolge(personal, aufsicht, max = 3) {
  const liste = (Array.isArray(personal) ? personal : []).filter(Boolean);
  const a = String(aufsicht || "").trim().toLowerCase();
  const istAufsicht = (p) => !!a && (String(p.key || "").toLowerCase() === a || String(p.name || "").trim().toLowerCase() === a);
  const sortiert = [...liste.filter(istAufsicht), ...liste.filter((p) => !istAufsicht(p))];
  const out = [];
  for (const p of sortiert) {
    const m = String(p.mobil || "").trim();
    if (m && !out.includes(m)) out.push(m);
  }
  return out.slice(0, max);
}

// ─── Dauer aus dem Projekttermin (Dolibarr Agenda) ───────────────────────────
const p2 = (n) => String(n).padStart(2, "0");
const tagUndZeit = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const d = new Date(Number(v) * 1000);
    return { tag: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, zeit: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { tag: m[1], zeit: m[2] } : null;
};

export function dauerAusTermin(events, projektId, datumIso) {
  const pid = String(projektId || "");
  if (!pid || !Array.isArray(events)) return null;
  for (const e of events) {
    if (String(e?.fk_project ?? "") !== pid) continue;
    const von = tagUndZeit(e.datep);
    if (!von || von.tag !== datumIso) continue;
    const bis = tagUndZeit(e.datef);
    return { von: von.zeit, bis: bis ? bis.zeit : "" };
  }
  return null;
}

// ─── Adresse aus dem Dolibarr-Kunden ─────────────────────────────────────────
export function adresseAusKunde(kunde) {
  if (!kunde) return null;
  const strasse = String(kunde.address || "").split(/\r?\n/)[0].trim();
  const einsatzort = [kunde.zip, kunde.town].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  if (!strasse && !einsatzort) return null;
  return { einsatzort, strasse };
}

// ─── GPS: beste von mehreren Messungen ───────────────────────────────────────
export function besteGps(punkte) {
  const liste = (Array.isArray(punkte) ? punkte : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!liste.length) return null;
  const best = liste.reduce((a, b) => ((Number(b.genauigkeitM) || Infinity) < (Number(a.genauigkeitM) || Infinity) ? b : a));
  return { lat: best.lat, lon: best.lon, genauigkeitM: best.genauigkeitM, zeit: best.zeit };
}

// ─── Material aus den Betriebsmittel-Fristen ─────────────────────────────────
// Alles grün → Haken an allen automatisierbaren Materialzeilen; sonst bleiben
// sie offen und die Liste sagt, welches Stück warum. Keine Lose → nichts entscheiden.
export function materialAusFristen(lose, heute, zeilenIds) {
  const werte = {};
  const ids = Array.isArray(zeilenIds) ? zeilenIds : [];
  if (!Array.isArray(lose)) { for (const id of ids) werte[id] = ""; return { werte, offen: [] }; }
  const faellig = bmFaellige(lose, heute);
  for (const id of ids) werte[id] = faellig.length ? "" : "ja";
  return { werte, offen: faellig.map((l) => ({ batch: l.batch, grund: l.status?.grund ?? null, stufe: l.status?.stufe })) };
}

// ─── Baumkataster (Teilprojekt C) → Baumcheck ────────────────────────────────
export const BK_VITALITAET_TEXT = ["vital", "leicht eingeschränkt", "deutlich eingeschränkt", "absterbend"]; // Roloff 0–3
const BEFUND_LEER = () => ({ umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: [] });

export function letzteKontrolle(baum) {
  const k = Array.isArray(baum?.kontrollen) ? baum.kontrollen.filter(Boolean) : [];
  if (!k.length) return null;
  return k.slice().sort((a, b) => String(b.datum || "").localeCompare(String(a.datum || "")))[0];
}

export function katasterInBaumcheck(quelle) {
  if (!quelle) return null;
  const befundVon = (b) => ({ ...BEFUND_LEER(), ...Object.fromEntries(Object.entries(b || {}).map(([k, v]) => [k, Array.isArray(v) ? [...v] : []])) });
  // Bereits ein Baumcheck (z. B. aus bkFuerGbu(baum).baumcheck) oder flache Form mit krone/gesundheitszustand: nur normalisieren.
  if (typeof quelle.krone === "string" || quelle.gesundheitszustand !== undefined) {
    return {
      krone: quelle.krone, stamm: String(quelle.stamm || ""), wurzel: String(quelle.wurzel || ""),
      gesundheit: String(quelle.gesundheitszustand ?? quelle.gesundheit ?? ""), standsicherheit: String(quelle.standsicherheit || ""),
      befund: befundVon(quelle.befund), kontrolleId: quelle.kontrolleId || null,
    };
  }
  const befund = befundVon(quelle.befund);
  const text = (...listen) => { const t = listen.flat().filter(Boolean).join(", "); return t || "ohne Befund"; };
  const vs = String(quelle.verkehrssicher || "");
  return {
    krone: text(befund.krone),
    stamm: text(befund.stammfuss, befund.stamm),
    wurzel: text(befund.wurzel, befund.umfeld),
    gesundheit: BK_VITALITAET_TEXT[Number(quelle.vitalitaet)] || "",
    standsicherheit: vs === "ja" ? "gegeben" : vs === "eingeschraenkt" ? "eingeschränkt" : vs === "nein" ? "eingehende Untersuchung erforderlich" : "",
    befund, kontrolleId: quelle.id || null,
  };
}

// Kataster-Baum → Baumcheck übernehmen (katasterBaumWaehlen in GbuFormSkt.jsx),
// ohne ein von Hand ausgefülltes Feld zu überschreiben — gleiche Fehlerklasse
// wie bei der Witterung (siehe automatikGeaendert unten, I-1, Final-Review
// 16.09.2026): ein Feld, das der Mensch angefasst hat (automatik[pfad] bereits
// "geaendert"), darf die Automatik nicht anfassen; sonst bekäme eine manuelle
// Eingabe fälschlich den Marker "automatisch". Nur unberührte Felder werden
// aus dem Kataster befüllt und als "auto" markiert. `baum` ist das Ergebnis
// von katasterInBaumcheck.
export function katasterUebernehmen(daten, automatik, baum) {
  const neueDaten = { ...(daten || {}) };
  const neueAutomatik = { ...(automatik || {}) };
  if (!baum) return { baumcheck: neueDaten, automatik: neueAutomatik };
  neueDaten.befund = baum.befund;
  for (const f of ["krone", "stamm", "wurzel", "gesundheit", "standsicherheit"]) {
    if (!baum[f] || neueAutomatik[`baumcheck.${f}`] === "geaendert") continue;
    neueDaten[f] = baum[f];
    neueAutomatik[`baumcheck.${f}`] = "auto";
  }
  return { baumcheck: neueDaten, automatik: neueAutomatik };
}

// ─── Markierung „automatisch" / „geändert" je Feld ───────────────────────────
export const automatikSetzen = (automatik, pfad) => ({ ...(automatik || {}), [pfad]: "auto" });
// Jeder manuelle Schreibvorgang markiert "geaendert" — unabhängig davon, ob das
// Feld vorher "auto" war oder noch nie belegt (I-1, Final-Review 16.09.2026):
// sonst überschreibt eine später eintreffende Automatik eine manuelle Eingabe
// auf einem Feld, das die Automatik noch nicht vorbelegt hatte, stillschweigend.
export const automatikGeaendert = (automatik, pfad) => ({ ...(automatik || {}), [pfad]: "geaendert" });
export const automatikText = (status) => (status === "auto" ? "automatisch" : status === "geaendert" ? "geändert" : "");
