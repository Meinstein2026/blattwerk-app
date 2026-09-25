// Baumkataster (Teilprojekt C, 16.09.2026) — Oberfläche.
// Die Karte ist der Einstieg (Präzisierung 17.09.2026, Vorbild SPD-Maps): alle
// Kunden werden auf einen Schlag geladen, der Kunde ist ein Filter mit
// Mehrfachauswahl statt einer Pflichtwahl vorweg. Reiter Karte / Liste /
// Fällig → Baum-Detail (Stammdaten, Historie, Maßnahmen, Fotos) →
// „Kontrolle durchführen" (Wizard) → „Bericht (PDF)".
//
// Bewusst OHNE Import aus dolibarr-app.jsx (Kreisimport; drei Zweige
// entstehen parallel). Netzzugang über ncPost (gleiche SSO-Prüfung wie
// apiFetch), Zugangsdaten aus demselben localStorage-Schlüssel wie
// NextcloudPanel. Stile: bestehende Klassen + der Block CSS unten.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { idbHolen, idbLoeschen, idbSetzen } from "../idb.js";
import {
  BK_ALTERSPHASEN, BK_BAUMARTEN, BK_BEFUND, BK_BEFUND_LABEL, BK_DRINGLICHKEIT, BK_FARBEN, BK_KONTROLLARTEN,
  BK_MASSNAHMEN, BK_SCHUTZ, BK_STATUS, BK_STORE_LEER, BK_VERKEHRSSICHER, BK_VITALITAET,
} from "../baumkataster-data.js";
import {
  BK_FILTER_LEER, bkArtenImBestand, bkBaeumeAllerKunden, bkFaellig, bkFilter, bkFilterAktiv,
  bkFristAusDringlichkeit, bkGpsBeste, bkHeute, bkKundenAdresse, bkKundenAusschnitt, bkLetzteKontrolle,
  bkNaechsteKontrolle, bkNormalisieren, bkObjekteImBestand, bkOrtstreffer, bkProjektFuerKunde,
  bkStatusFarbe, bkVerortet,
} from "../baumkataster.js";
import {
  BK_FILTER_KEY, BK_FOTO_DB, BK_FOTO_STORE, BK_QUEUE_KEY, bkAusstehendZusammenfuehren,
  bkCacheLesen, bkCacheSchreiben, bkEinreihen, bkKundenOrtLesen, bkKundenOrtMerken,
  bkNachtragen, bkNachtragZusammenfuehren, bkOffeneVorgaenge, bkVorgangId,
} from "../baumkataster-offline.js";
import { bkBerichtDateiname, buildBaumkatasterPdf } from "../baumkataster-pdf.js";

const BaumKarte = lazy(() => import("./BaumKarte.jsx"));

// ── Zugang ──────────────────────────────────────────────────────────────────
const ncKonfig = () => { try { return JSON.parse(localStorage.getItem("blattwerk_nextcloud") || "null") || {}; } catch { return {}; } };
const ncBereit = (c) => !!(c && c.server && c.user && (c.managed || c.pass));
const ncCreds = (c) => ({ server: c.server, user: c.user, pass: c.pass || "" });

/** POST an /api/nc/* mit derselben SSO-Umleitungsprüfung wie apiFetch in dolibarr-app.jsx. */
async function ncPost(pfad, body) {
  const res = await fetch(pfad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
  if (res.type === "opaqueredirect" || res.redirected === true || res.status === 0) {
    if (typeof window !== "undefined") window.location.href = "/outpost.goauthentik.io/start?rd=" + encodeURIComponent(window.location.pathname + window.location.search);
    throw new Error("Anmeldung abgelaufen – die App meldet dich gerade neu an.");
  }
  return res;
}
async function ncJson(pfad, body) {
  const res = await ncPost(pfad, body);
  const daten = await res.json().catch(() => ({}));
  // Statuscode am Fehler vermerkt (nicht nur im Text): der Kontroll-Wizard
  // muss eine 400 (fachlich abgelehnt) von einem Netz-/Serverfehler
  // unterscheiden können, ohne die Fehlermeldung zu parsen.
  if (!res.ok) { const fehler = new Error(daten.error || ("Status " + res.status)); fehler.status = res.status; throw fehler; }
  return daten;
}

// Fotos gehören nicht in den localStorage: zwei Kontrollfotos in einem
// base64-Feld sprengen das Kontingent, und dann wäre der Nachweis weg. Blobs
// hier, die Warteschlange hält nur die Schlüssel.
//
// Die IndexedDB-Mechanik selbst (Fix-Welle 18.09.2026) steckt nicht mehr hier,
// sondern generisch in src/idb.js — Vorbereitung für die Zusammenführung mit
// feat/gbu-offline, das dieselbe Mechanik für eine PDF-Ablage braucht. Diese
// drei Funktionen sind nur noch dünne, foto-spezifische Hüllen darüber.
const fotosSichern = async (queueId, base64Liste) => {
  const schluessel = base64Liste.map((_, i) => `${queueId}-${i + 1}`);
  await idbSetzen(BK_FOTO_DB, BK_FOTO_STORE, schluessel.map((k, i) => ({ schluessel: k, wert: base64Liste[i] })));
  return schluessel;
};
const fotosLesen = async (schluessel) => {
  const werte = await idbHolen(BK_FOTO_DB, BK_FOTO_STORE, schluessel);
  const out = [];
  for (const b64 of werte) if (b64) out.push({ base64: b64 });
  return out;
};
const fotosLoeschen = (schluessel) => idbLoeschen(BK_FOTO_DB, BK_FOTO_STORE, schluessel);
const queueLesen = () => { try { return JSON.parse(localStorage.getItem(BK_QUEUE_KEY) || "[]") || []; } catch { return []; } };
// Bewusst ohne try-Schlucker: ein voller Speicher muss als Fehler sichtbar
// werden, sonst verschwindet eine unterschriebene Kontrolle stillschweigend.
const queueSchreiben = (liste) => localStorage.setItem(BK_QUEUE_KEY, JSON.stringify(liste));

/** Gemerkter Filter: nur die Kundenauswahl überlebt die Sitzung — ein
 * gemerkter Textfilter wäre beim nächsten Öffnen nur verwirrend. */
const filterLesen = () => {
  try { const k = JSON.parse(localStorage.getItem(BK_FILTER_KEY) || "null"); return { ...BK_FILTER_LEER, kunden: Array.isArray(k?.kunden) ? k.kunden.map(String) : [] }; }
  catch { return { ...BK_FILTER_LEER }; }
};
const filterMerken = (f) => { try { localStorage.setItem(BK_FILTER_KEY, JSON.stringify({ kunden: f.kunden })); } catch (_) {} };

// ── Helfer ──────────────────────────────────────────────────────────────────
const deDatum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${m[3]}.${m[2]}.${m[1]}` : "—"; };
const personName = (me) => (`${me?.firstname || ""} ${me?.lastname || ""}`.trim()) || me?.login || "";
const AMPEL_TEXT = { gruen: "in Ordnung", gelb: "bald fällig", rot: "überfällig", grau: "nie kontrolliert" };

/**
 * Zeile für einen Kunden — jetzt Titel der Chips in der Filterleiste statt
 * Untertitel der (entfallenen) Kundenwahl. `i.faellig` ist im Index eine an
 * `i.stand` (Datum des letzten Schreibens) gerechnete Zahl und friert danach
 * ein (`bkIndexEintrag`) — ohne diese Prüfung stünde ein Kunde, bei dem seit
 * dem letzten Schreibzugriff etwas fällig geworden ist, fälschlich weiter mit
 * "nichts fällig" da. Ist der Stand nicht mehr von heute, wird die Zahl darum
 * durch die (immer aktuelle) nächste Kontrolle samt Stand ersetzt.
 */
function kundenZeile(i, heute) {
  const baeume = `${i.anzahl} Bäume`;
  if (i.stand === heute) return `${baeume} · ${i.faellig ? `${i.faellig} fällig` : "nichts fällig"} · nächste Kontrolle ${deDatum(i.naechsteKontrolle)}`;
  return `${baeume} · nächste Kontrolle ${deDatum(i.naechsteKontrolle)} (Stand ${deDatum(i.stand)})`;
}

/** Beste GPS-Position innerhalb von `sekunden` (watchPosition, Abbruch bei ≤ 5 m). */
function positionErmitteln(sekunden = 10) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const punkte = [];
    let fertig = false;
    const ende = () => { if (fertig) return; fertig = true; navigator.geolocation.clearWatch(id); clearTimeout(t); resolve(bkGpsBeste(punkte)); };
    const id = navigator.geolocation.watchPosition(
      (pos) => { punkte.push({ lat: pos.coords.latitude, lon: pos.coords.longitude, genauigkeitM: pos.coords.accuracy }); if (pos.coords.accuracy <= 5) ende(); },
      () => ende(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: sekunden * 1000 },
    );
    const t = setTimeout(ende, sekunden * 1000);
  });
}

/** Foto auf max. 1600 px verkleinern, als JPEG-Base64 (ohne Präfix). */
function bildVerkleinern(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const f = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild nicht lesbar")); };
    img.src = url;
  });
}

function herunterladen(base64, name) {
  const bin = atob(base64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const CSS = `
.bk-reiter { display: flex; gap: 6px; margin: 10px 0; align-items: center; }
.bk-reiter button { flex: 1; }
.bk-punkt { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
/* Eigener Stapelkontext: die Ebenen der Kartenbibliothek tragen z-index 200–1000 und lagen
   ohne ihn ÜBER Kopfzeile (90), Fußleiste (100) und den Bögen von unten (200)
   — auf dem Handy schob sich die Karte beim Scrollen über die Leisten und
   schien durch „Baum anlegen" hindurch. */
.bk-karte { position: relative; z-index: 0; isolation: isolate; }
/* Große Karte (19.09.2026, Vorbild SPD-Maps): randlos bis an die Bildschirm-
   kanten und so hoch, wie zwischen Seitenkopf und Fußleiste Platz ist. Alles
   Weitere liegt als Overlay in der Karte. 16px = Innenabstand von .main. */
.bk-karte-rahmen { position: relative; margin: 0 -16px; height: calc(100dvh - 262px); min-height: 340px; }
.bk-burger { position: relative; width: 44px; height: 44px; padding: 0; border-radius: 22px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 20px; line-height: 1; cursor: pointer; box-shadow: 0 1px 6px rgba(0,0,0,.35); flex: none; }
.bk-burger.aktiv { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent), 0 1px 6px rgba(0,0,0,.35); }
.bk-burger-zahl { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
.bk-karte-rahmen > .bk-burger { position: absolute; top: 10px; left: 10px; z-index: 3; }
.bk-karte-fuss { position: absolute; left: 10px; right: 10px; bottom: 22px; z-index: 3; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; pointer-events: none; }
.bk-karte-fuss > * { pointer-events: auto; }
.bk-karte-fuss .bk-zaehler { margin: 0; padding: 6px 10px; border-radius: 14px; background: var(--surface); color: var(--text); box-shadow: 0 1px 6px rgba(0,0,0,.35); }
.bk-fab { width: 56px; height: 56px; border-radius: 28px; border: none; background: var(--accent); color: #fff; font-size: 30px; line-height: 1; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.bk-menue-kopf { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.bk-menue-kopf h3 { margin: 0; }
.bk-filterleiste .gbu-chips { margin-bottom: 12px; }
.bk-label { background: rgba(255,255,255,.9); border: none; box-shadow: none; font-weight: 700; font-size: 11px; padding: 1px 5px; }
.bk-fotos { display: flex; flex-wrap: wrap; gap: 8px; }
.bk-fotos img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
.bk-sig { border: 1.5px dashed var(--border); border-radius: 12px; background: #fff; }
.bk-sig canvas { width: 100%; height: 160px; display: block; touch-action: none; }
.bk-schritt { font-size: 12px; color: var(--text2); margin-bottom: 6px; }
.bk-massnahme { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
.bk-massnahme.erledigt { opacity: .6; text-decoration: line-through; }
.bk-treffer { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border); border-radius: 10px; padding: 4px; margin-bottom: 6px; }
.bk-zaehler { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text2); margin: 6px 0; }
`;

// ── Bausteine ───────────────────────────────────────────────────────────────
function BkChips({ werte, auswahl, onChange }) {
  const toggle = (w) => onChange(auswahl.includes(w) ? auswahl.filter((x) => x !== w) : [...auswahl, w]);
  return (
    <div className="gbu-chips">
      {werte.map((w) => (
        <button key={w} type="button" className={`gbu-chip ${auswahl.includes(w) ? "gbu-chip-active" : ""}`} onClick={() => toggle(w)}>{w}</button>
      ))}
    </div>
  );
}

/** Unterschriften-Fläche (Kopie von SignaturePad in dolibarr-app.jsx, JPEG-Data-URL). */
function BkSignatur({ onChange }) {
  const ref = useRef(null); const malt = useRef(false);
  useEffect(() => { const c = ref.current, ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = "#14243a"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current.width / r.width), y: (e.clientY - r.top) * (ref.current.height / r.height) }; };
  const start = (e) => { e.preventDefault(); malt.current = true; const ctx = ref.current.getContext("2d"); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke(); };
  const move = (e) => { if (!malt.current) return; e.preventDefault(); const ctx = ref.current.getContext("2d"); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (!malt.current) return; malt.current = false; onChange(ref.current.toDataURL("image/jpeg", 0.85)); };
  const leeren = () => { const c = ref.current, ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div className="bk-sig">
      <canvas ref={ref} width={700} height={280} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="action-row" style={{ padding: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={leeren}>Löschen</button></div>
    </div>
  );
}

/** Foto über den Server holen (der Endpunkt ist POST, ein <img src> geht nicht direkt). */
function BkFoto({ creds, kundeId, nr, datei }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null, aktiv = true;
    ncPost("/api/nc/baumkataster/foto", { ...creds, kundeId, nr, datei })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (aktiv && b) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch(() => {});
    return () => { aktiv = false; if (u) URL.revokeObjectURL(u); };
  }, [kundeId, nr, datei]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={datei} /></a> : <div className="hint">{datei}</div>;
}

function Feld({ label, children }) {
  return <div className="field-group"><label>{label}</label>{children}</div>;
}

// ── Baum anlegen / bearbeiten ───────────────────────────────────────────────
function BaumForm({ vorlage, kunden = [], objekte, onClose, onSave, showToast }) {
  // vorgangId (18.09.2026, Idempotenz-Nachtrag zum Wizard): beim ÖFFNEN der
  // Maske vergeben, nicht beim Senden — dieselbe Begründung wie bei
  // `k.vorgangId` in KontrolleWizard. Nur für eine NEUANLAGE (kein `nr`)
  // wertet der Server sie überhaupt aus (`bkBaumSpeichern`); bei einer
  // Stammdatenänderung eines bestehenden Baums schadet sie nicht, tut aber
  // nichts — Änderungen sind ohnehin nicht additiv.
  const [f, setF] = useState(() => ({
    nr: vorlage?.nr || "", kundeId: vorlage?.kundeId != null ? String(vorlage.kundeId) : "",
    art: vorlage?.art || "", artDe: vorlage?.artDe || "", objekt: vorlage?.objekt || "",
    lat: vorlage?.lat ?? "", lon: vorlage?.lon ?? "", genauigkeitM: vorlage?.genauigkeitM ?? "",
    quelle: vorlage?.quelle || "",
    stammumfangCm: vorlage?.stammumfangCm ?? "", hoeheM: vorlage?.hoeheM ?? "", kronendurchmesserM: vorlage?.kronendurchmesserM ?? "",
    altersphase: vorlage?.altersphase || "Reifephase", standort: vorlage?.standort || "", schutz: vorlage?.schutz || "keiner",
    status: vorlage?.status || "aktiv", bemerkung: vorlage?.bemerkung || "",
    vorgangId: bkVorgangId(),
  }));
  const [gps, setGps] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const artWaehlen = (e) => {
    const a = BK_BAUMARTEN.find((x) => x.lat === e.target.value);
    setF((p) => ({ ...p, art: a ? a.lat : p.art, artDe: a ? a.de : p.artDe }));
  };
  const position = async () => {
    setGps(true);
    const p = await positionErmitteln(10);
    setGps(false);
    if (!p) { showToast("Keine GPS-Position bekommen", "error"); return; }
    setF((x) => ({ ...x, lat: p.lat, lon: p.lon, genauigkeitM: p.genauigkeitM ?? "", quelle: "gps" }));
    showToast(`Position übernommen (± ${p.genauigkeitM != null ? Math.round(p.genauigkeitM) : "?"} m)`);
  };
  const speichern = async () => {
    if (!f.kundeId) { showToast("Ohne Kunde kann der Baum nicht gespeichert werden — der Kataster hängt am Kunden.", "error"); return; }
    if (!f.art && !f.artDe) { showToast("Baumart angeben", "error"); return; }
    // I3 (Whole-Branch-Review): lat und lon sind getrennt editierbare Felder
    // — hier nur ein Vor-Ort-Hinweis, damit die Meldung schon vor dem Absenden
    // erscheint. Die eigentliche, verbindliche Prüfung sitzt in
    // `bkBaumSpeichern` (server- UND clientseitig, derselbe Weg).
    const latLeer = f.lat === "" || f.lat == null, lonLeer = f.lon === "" || f.lon == null;
    if (latLeer !== lonLeer) { showToast("Bitte beide Koordinaten angeben oder beide leer lassen — eine halbe Position kann nicht gespeichert werden.", "error"); return; }
    setSpeichert(true);
    try { await onSave(f); onClose(); } catch (e) { showToast(e.message || "Speichern fehlgeschlagen", "error"); }
    finally { setSpeichert(false); }
  };
  return (
    <div className="modal-backdrop" onClick={() => !speichert && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{f.nr ? `Baum ${f.nr} bearbeiten` : "Baum anlegen"}</h3>
        {kunden.length > 0 && (
          <Feld label="Kunde">
            <select value={f.kundeId} onChange={set("kundeId")}>
              <option value="">— Kunde wählen —</option>
              {kunden.map((k) => <option key={k.id} value={String(k.id)}>{k.name}</option>)}
            </select>
          </Feld>
        )}
        <Feld label="Baumart (Katalog)">
          <select value={BK_BAUMARTEN.some((a) => a.lat === f.art) ? f.art : ""} onChange={artWaehlen}>
            <option value="">— Freitext unten —</option>
            {BK_BAUMARTEN.map((a) => <option key={a.lat} value={a.lat}>{a.de} ({a.lat})</option>)}
          </select>
        </Feld>
        <Feld label="Deutsch"><input value={f.artDe} onChange={set("artDe")} placeholder="z. B. Stieleiche" /></Feld>
        <Feld label="Lateinisch"><input value={f.art} onChange={set("art")} placeholder="z. B. Quercus robur" /></Feld>
        {Object.keys(objekte).length > 0 && (
          <Feld label="Objekt"><select value={f.objekt} onChange={set("objekt")}><option value="">—</option>{Object.entries(objekte).map(([id, o]) => <option key={id} value={id}>{o.name}</option>)}</select></Feld>
        )}
        <Feld label="Standort"><input value={f.standort} onChange={set("standort")} placeholder="Wiese, Wegrand …" /></Feld>
        <div className="action-row action-row-2">
          <Feld label="Breite (lat)"><input inputMode="decimal" value={f.lat} onChange={set("lat")} /></Feld>
          <Feld label="Länge (lon)"><input inputMode="decimal" value={f.lon} onChange={set("lon")} /></Feld>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={gps} onClick={position}>{gps ? "GPS läuft (bis 10 s) …" : "Baum hier anlegen — aktuelle Position"}</button>
        <div className="action-row action-row-2" style={{ marginTop: 10 }}>
          <Feld label="Stammumfang (cm, 1 m Höhe)"><input inputMode="decimal" value={f.stammumfangCm} onChange={set("stammumfangCm")} /></Feld>
          <Feld label="Höhe (m)"><input inputMode="decimal" value={f.hoeheM} onChange={set("hoeheM")} /></Feld>
        </div>
        <div className="action-row action-row-2">
          <Feld label="Kronendurchmesser (m)"><input inputMode="decimal" value={f.kronendurchmesserM} onChange={set("kronendurchmesserM")} /></Feld>
          <Feld label="Altersphase"><select value={f.altersphase} onChange={set("altersphase")}>{BK_ALTERSPHASEN.map((a) => <option key={a}>{a}</option>)}</select></Feld>
        </div>
        <div className="action-row action-row-2">
          <Feld label="Schutz"><select value={f.schutz} onChange={set("schutz")}>{BK_SCHUTZ.map((a) => <option key={a}>{a}</option>)}</select></Feld>
          {f.nr && <Feld label="Status"><select value={f.status} onChange={set("status")}>{BK_STATUS.map((a) => <option key={a}>{a}</option>)}</select></Feld>}
        </div>
        <Feld label="Bemerkung"><textarea rows={2} value={f.bemerkung} onChange={set("bemerkung")} /></Feld>
        <div className="action-row action-row-2">
          <button type="button" className="btn btn-ghost" disabled={speichert} onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn btn-primary" disabled={speichert} onClick={speichern}>{speichert ? "Speichert …" : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Baum-Detail ─────────────────────────────────────────────────────────────
function BaumDetail({ baum, objekte, creds, kundeId, heute, onBack, onBearbeiten, onKontrolle, onErledigt, onPositionKorrigieren, showToast }) {
  const k = bkLetzteKontrolle(baum);
  const objekt = objekte[baum.objekt]?.name || baum.objekt || "";
  const punkt = (modus) => <span className="bk-punkt" style={{ background: BK_FARBEN[bkStatusFarbe(baum, heute, modus)] }} />;
  const [arbeitet, setArbeitet] = useState(null);
  const erledigt = async (m) => {
    setArbeitet(m.id);
    try { await onErledigt(m); } catch (e) { showToast(e.message || "Konnte nicht eintragen", "error"); } finally { setArbeitet(null); }
  };
  return (
    <div className="main">
      <div className="page-header"><div className="back-btn" onClick={onBack}>‹</div><h2>{baum.nr} · {baum.artDe || baum.art}</h2></div>
      <div className="list-card">
        <div className="list-card-main">
          <div className="list-card-sub">{[baum.art, objekt, baum.standort].filter(Boolean).join(" · ")}</div>
          <div className="list-card-sub">Umfang {baum.stammumfangCm ?? "—"} cm · Höhe {baum.hoeheM ?? "—"} m · Krone {baum.kronendurchmesserM ?? "—"} m · {baum.altersphase || "—"} · Schutz: {baum.schutz}</div>
          <div className="list-card-sub">{punkt("kontrolle")}Kontrolle: {AMPEL_TEXT[bkStatusFarbe(baum, heute, "kontrolle")]}{k?.naechsteKontrolle ? ` (nächste ${deDatum(k.naechsteKontrolle)})` : ""}</div>
          <div className="list-card-sub">{punkt("sicherheit")}Verkehrssicherheit: {k ? (BK_VERKEHRSSICHER.find((v) => v.id === k.verkehrssicher)?.label || "—") : "—"}</div>
          {baum.status !== "aktiv" && <div className="hint">Status: {baum.status}</div>}
          {(() => {
            const gbus = [...new Set(baum.kontrollen.flatMap((x) => x.gbuIds || []))];
            return gbus.length > 0 ? <div className="list-card-sub">Gefährdungsbeurteilungen: {gbus.join(", ")}</div> : null;
          })()}
        </div>
        <div className="action-row action-row-2">
          <button className="btn btn-ghost btn-sm" onClick={onBearbeiten}>Stammdaten</button>
          <button className="btn btn-primary btn-sm" onClick={onKontrolle}>Kontrolle durchführen</button>
        </div>
        <div className="action-row">
          <button className="btn btn-ghost btn-sm" onClick={onPositionKorrigieren}>Position korrigieren</button>
        </div>
      </div>

      <h3>Maßnahmen</h3>
      {!baum.massnahmen.length && <div className="empty-state"><p>Keine Maßnahmen.</p></div>}
      {[...baum.massnahmen].reverse().map((m) => (
        <div key={m.id} className={`bk-massnahme ${m.status === "erledigt" ? "erledigt" : ""}`}>
          <div><strong>{m.art}</strong> · {BK_DRINGLICHKEIT.find((d) => d.id === m.dringlichkeit)?.label || m.dringlichkeit} · bis {deDatum(m.faelligBis)} · {m.status}{m.dolibarrTaskId ? ` · Aufgabe #${m.dolibarrTaskId}` : ""}</div>
          {m.bemerkung && <div className="hint">{m.bemerkung}</div>}
          {m.status !== "erledigt" && <button className="btn btn-ghost btn-sm" disabled={arbeitet === m.id} onClick={() => erledigt(m)}>Erledigt</button>}
        </div>
      ))}

      <h3>Kontrollen</h3>
      {!baum.kontrollen.length && <div className="empty-state"><p>Noch nie kontrolliert.</p></div>}
      {[...baum.kontrollen].reverse().map((x) => (
        <div key={x.id} className="list-card">
          <div className="list-card-main">
            <div className="list-card-title">{deDatum(x.datum)} · {x.artKontrolle} · {x.kontrolleur}</div>
            <div className="list-card-sub">Vitalität {x.vitalitaet} · {BK_VERKEHRSSICHER.find((v) => v.id === x.verkehrssicher)?.label} · nächste {deDatum(x.naechsteKontrolle)}</div>
            {Object.keys(BK_BEFUND_LABEL).map((b) => x.befund?.[b]?.length ? <div key={b} className="list-card-sub">{BK_BEFUND_LABEL[b]}: {x.befund[b].join(", ")}</div> : null)}
            {x.bemerkung && <div className="hint">{x.bemerkung}</div>}
            {x.gbuIds?.length > 0 && <div className="hint">GBU: {x.gbuIds.join(", ")}</div>}
            {x.fotos?.length > 0 && <div className="bk-fotos">{x.fotos.map((d) => <BkFoto key={d} creds={creds} kundeId={kundeId} nr={baum.nr} datei={d} />)}</div>}
            {x.unterschrift && <img src={x.unterschrift} alt="Unterschrift" style={{ height: 40, marginTop: 6 }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filterleiste ────────────────────────────────────────────────────────────
// Chip-Werte der drei Ampel-Dimensionen (18.09.2026) — Logik dahinter
// (bkFilter, sechs Dimensionen) ist seit I5 schon reviewt, hier nur die
// Bedienelemente. Reihenfolge "alle" zuerst, wie bei der Kundenauswahl.
const BK_KONTROLLE_CHIPS = [
  { id: "alle", label: "alle" },
  { id: "faellig", label: "fällig" },
  { id: "ueberfaellig", label: "überfällig" },
];
const BK_SICHERHEIT_CHIPS = [
  { id: "alle", label: "alle" },
  { id: "ja", label: "verkehrssicher" },
  { id: "eingeschraenkt", label: "eingeschränkt" },
  { id: "nein", label: "nicht sicher" },
];
const BK_MASSNAHMEN_CHIPS = [
  { id: "alle", label: "alle" },
  { id: "offen", label: "offene Maßnahmen" },
  { id: "sofort", label: "sofort nötig" },
  { id: "keine", label: "keine offenen" },
];

/** Eine Ampel-Chipgruppe: Vorbild sind die vorhandenen Chips in dieser Datei (BkChips, Kundenauswahl). */
function BkFilterChips({ label, werte, wert, onWahl }) {
  return (
    <Feld label={label}>
      <div className="gbu-chips">
        {werte.map((w) => (
          <button key={w.id} type="button" className={`gbu-chip ${wert === w.id ? "gbu-chip-active" : ""}`}
            onClick={() => onWahl(w.id)}>{w.label}</button>
        ))}
      </div>
    </Feld>
  );
}

/**
 * Kunde als Filter mit Mehrfachauswahl, kein Tor mehr (Präzisierung
 * 17.09.2026). Der Zähler „zeigt X von Y" steht in der Seite (dort sind
 * `gefiltert`/`alleBaeume` im Gültigkeitsbereich) und kommt hier nur als
 * fertige `zaehler`-Eigenschaft rein.
 *
 * Alle sechs Filterdimensionen bedienbar (18.09.2026, löst I5 ab). Seit
 * 19.09.2026 steht die Leiste nicht mehr über der Karte, sondern im Menü
 * hinter dem ☰-Knopf IN der Karte (Ansage Inhaber: „Filter schwierig zu
 * erkennen", Vorbild SPD-Maps). Im Bogen ist Platz, darum liegt nichts mehr
 * hinter einem zweiten Schalter: Suche, Kunden (ab sieben mit eigener
 * Kundensuche), die drei Ampel-Chipgruppen, Baumart, Objekt, Markerfarbe. `arten`/`objekteBestand`
 * kommen aus dem tatsächlichen Bestand (bkArtenImBestand/bkObjekteImBestand),
 * nicht aus dem Katalog — eine leere Liste blendet die jeweilige Auswahl aus.
 */
export function BkFilterLeiste({ filter, onChange, kundenListe, zaehler, arten, objekteBestand, ladeFehler, kundenHinweis, modus, onModus }) {
  // Kundensuche: grenzt nur die Chips ein, der Filter selbst bleibt unberührt.
  // Gewählte Kunden bleiben immer stehen — sonst ließe sich eine Auswahl nicht
  // mehr abwählen, sobald die Suche sie ausblendet.
  const [kundenSuche, setKundenSuche] = useState("");
  const ks = kundenSuche.trim().toLowerCase();
  const kundenSichtbar = kundenListe.filter((k) => !ks || filter.kunden.includes(String(k.id))
    || `${k.name} ${k.zeile || ""}`.toLowerCase().includes(ks));
  return (
    <div className="bk-filterleiste">
      <Feld label="Suche">
        <input value={filter.text} onChange={(e) => onChange({ ...filter, text: e.target.value })}
          placeholder="Nummer, Art, Standort, Kunde …" />
      </Feld>
      <Feld label="Kunde">
        {kundenListe.length > 6 && (
          <input value={kundenSuche} onChange={(e) => setKundenSuche(e.target.value)}
            placeholder="Kunde suchen …" style={{ marginBottom: 8 }} />
        )}
      <div className="gbu-chips">
        <button type="button" className={`gbu-chip ${filter.kunden.length === 0 ? "gbu-chip-active" : ""}`}
          onClick={() => onChange({ ...filter, kunden: [] })}>Kunde: alle</button>
        {kundenSichtbar.map((k) => (
          <button key={k.id} type="button" className={`gbu-chip ${filter.kunden.includes(String(k.id)) ? "gbu-chip-active" : ""}`}
            title={k.zeile || undefined}
          onClick={() => onChange({ ...filter, kunden: filter.kunden.includes(String(k.id))
              ? filter.kunden.filter((x) => x !== String(k.id))
              : [...filter.kunden, String(k.id)] })}>{k.name}</button>
        ))}
      </div>
      </Feld>
      <BkFilterChips label="Kontrolle" werte={BK_KONTROLLE_CHIPS} wert={filter.kontrolle}
        onWahl={(v) => onChange({ ...filter, kontrolle: v })} />
      <BkFilterChips label="Verkehrssicherheit" werte={BK_SICHERHEIT_CHIPS} wert={filter.sicherheit}
        onWahl={(v) => onChange({ ...filter, sicherheit: v })} />
      <BkFilterChips label="Maßnahmen" werte={BK_MASSNAHMEN_CHIPS} wert={filter.massnahmen}
        onWahl={(v) => onChange({ ...filter, massnahmen: v })} />
      {arten.length > 0 && (
        <Feld label="Baumart">
          <select value={filter.art} onChange={(e) => onChange({ ...filter, art: e.target.value })}>
            <option value="">alle</option>
            {arten.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Feld>
      )}
      {objekteBestand.length > 0 && (
        <Feld label="Objekt">
          <select value={filter.objekt} onChange={(e) => onChange({ ...filter, objekt: e.target.value })}>
            <option value="">alle</option>
            {objekteBestand.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Feld>
      )}
      {onModus && (
        <Feld label="Farbe der Marker nach">
          <select value={modus} onChange={(e) => onModus(e.target.value)}>
            <option value="kontrolle">Kontrollstand</option><option value="sicherheit">Verkehrssicherheit</option><option value="massnahmen">offene Maßnahmen</option>
          </select>
        </Feld>
      )}
      {kundenHinweis && <div className="hint">{kundenHinweis}</div>}
      {zaehler}
      {ladeFehler.length > 0 && (
        <div className="hint">{ladeFehler.map((f) => f.name).join(", ")} — Kataster konnten nicht geladen werden.</div>
      )}
    </div>
  );
}

/**
 * Für Teilprojekt B: nach dem Speichern einer GBU mit gewähltem Kataster-Baum
 * deren Id an der Kontrolle vermerken. creds wie in dieser Seite (ncCreds).
 */
export async function bkGbuVerweisSchreiben(creds, { kundeId, nr, kontrolleId, gbuId }) {
  return ncJson("/api/nc/baumkataster/kontrolle/gbu", { ...creds, kundeId, nr, kontrolleId, gbuId });
}

// ── Seite ───────────────────────────────────────────────────────────────────
export default function BaumkatasterPage({ api, me, showToast, onBack, betrieb }) {
  const [nc] = useState(ncKonfig);
  const creds = useMemo(() => ncCreds(nc), [nc]);
  const ncOk = ncBereit(nc);
  const heute = bkHeute();
  const [kunden, setKunden] = useState([]);           // Dolibarr-Kunden (für Namen und Adresse)
  const [index, setIndex] = useState({});
  const [stores, setStores] = useState({});           // { [kundeId]: Store }
  const [ladeFehler, setLadeFehler] = useState([]);   // Kunden, deren Store nicht lesbar war
  const [laden, setLaden] = useState(true);
  const [reiter, setReiter] = useState("karte");      // Karte ist der Einstieg
  const [modus, setModus] = useState("kontrolle");
  const [menue, setMenue] = useState(false);          // Filtermenü hinter dem ☰-Knopf
  const [filter, setFilter] = useState(() => filterLesen());
  const [auswahl, setAuswahl] = useState(null);       // { kundeId, nr } | null
  const geladenRef = useRef(false);
  const [form, setForm] = useState(null);             // null | { vorlage }
  const [wizard, setWizard] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [ziel, setZiel] = useState(null);              // Sprung-Deskriptor für die Karte
  const [kundenHinweis, setKundenHinweis] = useState("");
  const [kartenZiel, setKartenZiel] = useState(null);  // { lat, lon } beim Kartentipp
  const [setzePosition, setSetzePosition] = useState(null);   // { kundeId, nr }
  const [letzterKunde, setLetzterKunde] = useState("");
  const [warteschlange, setWarteschlange] = useState(queueLesen);
  const [cacheStand, setCacheStand] = useState(null);
  const nachtragLaeuft = useRef(false);
  // Fix-Runde 1 (18.09.2026): der Kontroll-Wizard reiht offline eine
  // Kontrolle UND mehrere Maßnahmen direkt hintereinander ein, alles im
  // selben Tick. `einreihen` läse ohne diesen Ref immer den `warteschlange`-
  // Stand vom Renderbeginn und der zweite Aufruf würde den ersten Eintrag
  // überschreiben, statt auf ihm aufzubauen.
  const warteschlangeRef = useRef(warteschlange);
  useEffect(() => { warteschlangeRef.current = warteschlange; }, [warteschlange]);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  // Alle Stores einmal laden. Ein unlesbarer Store lässt die Karte nicht leer
  // — statt zu fehlen, kommt er PRO KUNDE aus dem Cache (Task 9), erst wenn
  // auch der fehlt, landet er in `ladeFehler`.
  const alleStoresLaden = useCallback(async (idx) => {
    const ids = Object.keys(idx || {});
    const neu = {}, kaputt = [];
    let aeltester = null;
    for (const id of ids) {
      try {
        const s = bkNormalisieren(await ncJson("/api/nc/baumkataster/kunde", { ...creds, kundeId: id }));
        neu[id] = s;
        bkCacheSchreiben(localStorage, id, s);
      } catch (_) {
        const c = bkCacheLesen(localStorage, id);
        if (c) {
          neu[id] = c.store;
          // Ältester Cache-Stand: der Hinweis soll nicht behaupten, alles sei frisch.
          if (!aeltester || String(c.stand) < String(aeltester)) aeltester = c.stand;
        } else kaputt.push({ kundeId: id, name: idx[id]?.name || id });
      }
    }
    setStores(neu);
    setLadeFehler(kaputt);
    setCacheStand(aeltester);
  }, [creds]);

  useEffect(() => {
    if (!ncOk) { setLaden(false); showToast("Nextcloud ist nicht verbunden — Einstellungen → Nextcloud", "error"); return; }
    if (geladenRef.current) return;   // genau einmal, nicht bei jedem Rendern
    geladenRef.current = true;
    Promise.all([
      api?.getThirdparties ? api.getThirdparties("customer").catch(() => []) : Promise.resolve([]),
      ncJson("/api/nc/baumkataster/index", creds).catch(() => ({ kunden: {} })),
    ]).then(async ([ks, idx]) => {
      setKunden(Array.isArray(ks) ? ks : []);
      setIndex(idx.kunden || {});
      await alleStoresLaden(idx.kunden || {});
    }).finally(() => setLaden(false));
  }, [ncOk]);

  const kundeVon = useCallback((kundeId) => kunden.find((k) => String(k.id ?? k.rowid) === String(kundeId))
    || { id: kundeId, name: index[String(kundeId)]?.name || String(kundeId) }, [kunden, index]);
  const storeSetzen = useCallback((kundeId, store) =>
    setStores((p) => ({ ...p, [String(kundeId)]: bkNormalisieren(store) })), []);

  // Vereinigung aus Server-Stores und Warteschlange (Task 9).
  const anzeigeStores = useMemo(() => {
    // Die Vereinigung, nicht nur `stores`: ein Kunde, für den es noch gar
    // keinen Server-Store gibt (erster Baum offline angelegt) oder dessen
    // Store nicht geladen werden konnte, steht NUR in der Warteschlange —
    // ohne ihn hier wäre der gerade angelegte Baum auf Karte und Liste
    // unsichtbar, und genau das soll die Zusammenführung verhindern.
    const ids = new Set([...Object.keys(stores), ...warteschlange.map((e) => String(e.kundeId))]);
    const out = {};
    for (const id of ids) {
      const basis = stores[id] || { ...BK_STORE_LEER, kunde: { id: Number(id) || null, name: kundeVon(id).name } };
      out[id] = bkAusstehendZusammenfuehren(basis, warteschlange, id);
    }
    return out;
  }, [stores, warteschlange, kundeVon]);

  // EINE Quelle für Karte, Liste und Fällig — sonst widerspricht der Zähler
  // einer der drei Ansichten.
  const alleBaeume = useMemo(() => bkBaeumeAllerKunden(anzeigeStores), [anzeigeStores]);
  const gefiltert = useMemo(() => bkFilter(alleBaeume, filter, heute), [alleBaeume, filter, heute]);
  const filterSetzen = (f) => { setFilter(f); filterMerken(f); };
  const mehrereKunden = new Set(gefiltert.map((b) => b.kundeId)).size > 1;

  /** Adresse des Kunden über Nominatim, aus dem Zwischenspeicher wenn möglich. Ohne den im Browser verbotenen Kopf für den Nutzeragenten. */
  const kundenOrtHolen = useCallback(async (kundeId) => {
    const adresse = bkKundenAdresse(kundeVon(kundeId));
    if (!adresse) return null;
    const gemerkt = bkKundenOrtLesen(localStorage, kundeId, adresse);
    if (gemerkt) return gemerkt;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(adresse)}`, { headers: { "Accept-Language": "de" } });
      const t = bkOrtstreffer(await r.json())[0];
      if (!t) return null;
      const punkt = { lat: t.lat, lon: t.lon };
      bkKundenOrtMerken(localStorage, kundeId, adresse, punkt);
      return punkt;
    } catch { return null; }
  }, [kundeVon]);

  // Sprung auf das Gebiet der gewählten Kunden. Hängt an der Kundenauswahl,
  // nicht am ganzen Filter — sonst ruckt die Karte bei jedem Buchstaben im
  // Suchfeld.
  const kundenSchluessel = filter.kunden.join(",");
  useEffect(() => {
    if (laden) return;
    let aktiv = true;
    (async () => {
      const menge = filter.kunden.length
        ? alleBaeume.filter((b) => filter.kunden.includes(String(b.kundeId)))
        : alleBaeume;
      const punkte = bkVerortet(menge);
      // Nur bei genau einem Kunden ohne verorteten Baum lohnt die Adresse.
      const ort = (!punkte.length && filter.kunden.length === 1) ? await kundenOrtHolen(filter.kunden[0]) : null;
      if (!aktiv) return;
      const d = bkKundenAusschnitt(punkte, ort);
      setKundenHinweis(d.typ === "bleiben" ? d.hinweis : "");
      if (d.typ !== "bleiben") setZiel(d);   // neue Objektidentität = die Karte springt einmal
    })();
    return () => { aktiv = false; };
  }, [kundenSchluessel, laden]);

  // Vereinigung von Index und tatsächlich vorhandenen Bäumen — ein Kunde,
  // dessen Store nur aus dem Cache kommt oder (ab Task 9) nur in der
  // Warteschlange steht, fehlt sonst als Chip.
  const kundenListe = useMemo(() => {
    const ids = new Set([...Object.keys(index), ...alleBaeume.map((b) => String(b.kundeId))]);
    return [...ids]
      .map((id) => ({ id, name: index[id]?.name || kundeVon(id).name, zeile: index[id] ? kundenZeile(index[id], heute) : "" }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [index, alleBaeume, kundeVon, heute]);

  // Vereinigung der Objekte aller Kunden für die Objekt-Auswahl im Formular.
  // Objekt-Ids sind nur je Kunde eindeutig — zwei Kunden mit derselben Id
  // zeigten hier denselben Namen; kein heutiger Datenpfad erzeugt das.
  const objekteAllerKunden = useMemo(() => {
    const out = {};
    for (const s of Object.values(stores)) Object.assign(out, bkNormalisieren(s).objekte);
    return out;
  }, [stores]);

  // Bestandslisten für die Filterleiste (Baumart, Objekt) — aus ALLEN
  // geladenen Bäumen, nicht aus dem schon gefilterten Ergebnis: sonst
  // verschwänden Auswahlmöglichkeiten, sobald ein anderer Filter zuschlägt.
  const bestandArten = useMemo(() => bkArtenImBestand(alleBaeume), [alleBaeume]);
  const bestandObjekte = useMemo(() => bkObjekteImBestand(alleBaeume, objekteAllerKunden), [alleBaeume, objekteAllerKunden]);

  // Nachtragen: beim Öffnen der Seite, beim `online`-Ereignis, und (über die
  // Abhängigkeit auf die Länge) bei jedem neu eingereihten Vorgang — sonst
  // wartete ein während der Sitzung eingereihter Vorgang auf ein
  // `online`-Ereignis, das am WLAN ohne Uplink nie kommt.
  const nachtragen = useCallback(async () => {
    if (nachtragLaeuft.current || !ncOk || !warteschlange.length) return;
    nachtragLaeuft.current = true;
    // Fix-Runde 1 (18.09.2026, C2): `bkNachtragen` läuft auf dem Schnappschuss
    // `warteschlange` aus dem Closure. Während des `await` kann `einreihen`
    // (Kontroll-Wizard, Baum anlegen …) längst neue Vorgänge in
    // `warteschlangeRef.current` geschrieben haben — ein reines
    // `warteschlange = rest` würde die überschreiben und stillschweigend
    // verwerfen. `bkNachtragZusammenfuehren` führt beides zusammen.
    //
    // I-neu (18.09.2026, Idempotenz): dieselbe Zusammenführung läuft jetzt
    // NACH JEDEM Vorgang (`speichern`-Rückruf von `bkNachtragen`), nicht erst
    // am Ende des ganzen Laufs — stirbt die App mittendrin (Android räumt
    // WebView-Activities jederzeit ab), stand die Warteschlange vorher noch
    // mit allen längst angenommenen Vorgängen im Gerätespeicher, und der
    // nächste Start hätte sie erneut gesendet.
    const zwischenspeichern = (rest) => {
      const { liste, geaendert } = bkNachtragZusammenfuehren(warteschlange, warteschlangeRef.current, rest);
      if (geaendert) { warteschlangeRef.current = liste; setWarteschlange(liste); queueSchreiben(liste); }
    };
    try {
      const { rest, stores: nachtragStores } = await bkNachtragen(warteschlange, {
        senden: async (pfad, koerper) => {
          const res = await ncPost(pfad, { ...creds, login: me?.login || "", ...koerper });
          return { status: res.status, daten: await res.json().catch(() => ({})) };
        },
        fotosLesen, fotosLoeschen,
        melden: (t) => showToast(t, "error"),
        speichern: zwischenspeichern,
      });
      zwischenspeichern(rest);
      // Je betroffenem Kunden dessen eigenen Store aktualisieren — die
      // Warteschlange kann mehrere Kunden gleichzeitig enthalten (Vormittags-
      // und Nachmittagsbesuch), nicht nur den zuletzt erfolgreichen.
      for (const [kundeId, roh] of Object.entries(nachtragStores || {})) {
        const s = bkNormalisieren(roh);
        storeSetzen(kundeId, s);
        bkCacheSchreiben(localStorage, kundeId, s);
      }
    } finally { nachtragLaeuft.current = false; }
  }, [ncOk, warteschlange, creds, me, storeSetzen]);

  useEffect(() => { nachtragen(); }, [ncOk, warteschlange.length]);
  useEffect(() => {
    const an = () => nachtragen();
    window.addEventListener("online", an);
    return () => window.removeEventListener("online", an);
  }, [nachtragen]);

  // Wirft bei vollem Gerätespeicher, statt null zurückzugeben: die Maske
  // schließt sonst über ihren eigenen erfolgreichen `await` hinweg, und der
  // Eintrag ist weg — genau der Fehler, den CLAUDE.md für `fbMerken` notiert
  // („ein unterschriebener Nachweis wäre dann weg"). Deshalb schreibt
  // `queueSchreiben` auch ohne try-Schlucker.
  const einreihen = (vorgang) => {
    // Aus warteschlangeRef, nicht aus dem State direkt: der Kontroll-Wizard
    // reiht Kontrolle + mehrere Maßnahmen synchron hintereinander ein, jeder
    // Aufruf muss auf dem Ergebnis des vorigen aufbauen.
    const { liste, eintrag } = bkEinreihen(warteschlangeRef.current, vorgang);
    try { queueSchreiben(liste); }
    catch (_) { throw new Error("Kein Platz mehr im Gerätespeicher — bitte mit Verbindung erneut speichern."); }
    warteschlangeRef.current = liste;
    setWarteschlange(liste);
    showToast("Ohne Verbindung gespeichert — wird nachgetragen, sobald Empfang da ist.");
    return eintrag;
  };

  const baumSpeichern = async (f) => {
    const kundeId = String(f.kundeId || auswahl?.kundeId || "");
    const k = kundeVon(kundeId);
    const nutzlast = { kundeId, kundeName: k.name, baum: f };
    try {
      // vorgangId (18.09.2026, Idempotenz-Nachtrag zum Wizard): `BaumForm`
      // vergibt sie beim Öffnen (`f.vorgangId`) — TOP-LEVEL mitschicken, denn
      // dort liest sie der Server (`bkBaumSpeichern` erkennt daran eine
      // Wiederholung bei einer Neuanlage und legt sie nicht zweimal an).
      // Fehlt sie (Aufrufer wie die Kartentipp-Positionskorrektur, die immer
      // eine `nr` mitschickt), verhält sich der Server wie bisher.
      const res = await ncPost("/api/nc/baumkataster/baum/save", { ...creds, login: me?.login || "", vorgangId: f.vorgangId, ...nutzlast });
      const d = await res.json().catch(() => ({}));
      // **Der Statuscode entscheidet, nicht `navigator.onLine`.** Eine 400 ist
      // fachlich abgelehnt (fehlende Baumart) und darf NIE in die
      // Warteschlange — dort würde sie ewig kreisen. Alles andere (kein Netz,
      // 5xx, Zeitüberschreitung) wird eingereiht. `navigator.onLine` ist dafür
      // untauglich: am WLAN ohne Uplink steht es auf `true`, und genau das ist
      // der Funkloch-Fall, für den dieses Feature gebaut wird — der Baum ginge
      // verloren statt zu warten. Gleiches Muster wie das Fahrtenbuch.
      // Rückgabewert statt Wurf: `positionSetzen` (und jeder künftige Aufrufer,
      // der ihn auswertet) muss zwischen Ablehnung (false), Erfolg (true) und
      // Fix-Runde 1 (18.09.2026, M1): eingereiht ("eingereiht", offline)
      // unterscheiden können, ohne den schon gezeigten Ablehnungs- bzw.
      // Einreih-Toast durch einen zweiten, widersprüchlichen Erfolgs-Toast zu
      // verdoppeln. Aufrufer, die den Rückgabewert ignorieren (BaumForm),
      // verhalten sich unverändert — alle drei Werte sind truthy oder false,
      // `=== true` ist der einzige Unterschied, der zählt.
      if (res.status === 400) { showToast(d.error || "Abgelehnt", "error"); return false; }
      if (!res.ok) throw new Error(d.error || res.status);
      storeSetzen(kundeId, d.store);
      bkCacheSchreiben(localStorage, kundeId, bkNormalisieren(d.store));
      setLetzterKunde(kundeId);
      showToast(`${d.baum.nr} gespeichert`);
      setAuswahl({ kundeId, nr: d.baum.nr });
      return true;
    } catch (_) { /* unten in die Warteschlange */ }
    // Die Nummer vergibt der Server beim Nachtragen — hier nur eine lokale Id,
    // damit spätere Kontrollen desselben Baums sie nachgetragen bekommen.
    // `einreihen` selbst zeigt schon "Ohne Verbindung gespeichert …" — der
    // Rückgabewert ist NICHT `true`, sonst zeigt `positionSetzen` zusätzlich
    // den widersprüchlichen Erfolgstext "Position gesetzt" (M1 aus der Review).
    // vorgangId reicht weiter, statt `bkEinreihen` neu würfeln zu lassen —
    // derselbe Grund wie beim Kontroll-Wizard: der Online-Versuch ist gerade
    // gescheitert, ob er den Server schon erreicht hat, weiß niemand hier.
    einreihen({
      typ: "baum", kundeId, kundeName: k.name, lokalId: `lok-${Date.now().toString(36)}`,
      vorgangId: f.vorgangId,
      nutzlast: { ...nutzlast, baum: { ...f, nr: f.nr || undefined } },
    });
    return "eingereiht";
  };
  const positionSetzen = async (lat, lon) => {
    const { kundeId, nr } = setzePosition;
    try {
      const ok = await baumSpeichern({ kundeId, nr, lat, lon, genauigkeitM: "", quelle: "karte" });
      // Nur bei tatsächlichem SOFORTIGEM Erfolg — eine 400 zeigt bereits ihren
      // eigenen Ablehnungs-Toast, ein Einreihen (offline) bereits seinen
      // eigenen "Ohne Verbindung gespeichert …"-Toast (siehe baumSpeichern);
      // beides darf nicht zusätzlich als "gesetzt" gemeldet werden.
      if (ok === true) showToast("Position gesetzt — die alte bleibt in der Historie.");
    } catch (e) {
      // Aus der Task-8-Review: ohne Fehlerausgang blieb der Positionsmodus
      // bei einem Fehlschlag (offline, realistischer Feldfall) stumm hängen.
      showToast(e.message || "Position konnte nicht gesetzt werden", "error");
    } finally {
      setSetzePosition(null);
    }
  };
  const massnahmeErledigt = async (m) => {
    const kundeId = auswahl.kundeId;
    try {
      const res = await ncPost("/api/nc/baumkataster/massnahme/erledigt", { ...creds, login: me?.login || "", kundeId, nr: auswahl.nr, massnahmeId: m.id });
      const d = await res.json().catch(() => ({}));
      if (res.status === 400) { showToast(d.error || "Abgelehnt", "error"); return; }
      if (!res.ok) throw new Error(d.error || res.status);
      storeSetzen(kundeId, d.store);
      bkCacheSchreiben(localStorage, kundeId, bkNormalisieren(d.store));
      showToast(`${m.art} erledigt`);
      return;
    } catch (_) { /* unten in die Warteschlange */ }
    einreihen({ typ: "massnahme-erledigt", kundeId, kundeName: kundeVon(kundeId).name, nutzlast: { nr: auswahl.nr, massnahmeId: m.id } });
  };
  // Der Bericht braucht weiterhin EINEN Store — nur angeboten, wenn genau ein Kunde gefiltert ist.
  const bericht = async () => {
    const kundeId = filter.kunden.length === 1 ? filter.kunden[0] : null;
    if (!kundeId || !stores[kundeId]) return;
    setPdfLaeuft(true);
    try { herunterladen(await buildBaumkatasterPdf(stores[kundeId], { heute, betrieb }), bkBerichtDateiname(stores[kundeId], heute)); }
    catch (e) { showToast("PDF fehlgeschlagen: " + (e.message || e), "error"); }
    finally { setPdfLaeuft(false); }
  };

  // Je Kunde einen eigenen Pseudo-Store bauen, nicht einen gemeinsamen mit
  // zusammengesetzten Schlüsseln: `bkFaellig` schickt den Store durch
  // `bkNormalisieren`, und das schreibt `baeume[nr] = { ...b, nr }` — ein
  // Schlüssel wie "12|B-0001" würde die echte Baumnummer überschreiben.
  //
  // Fix-Runde 1 (18.09.2026, C1): dieser Hook MUSS vor dem bedingten `return`
  // unten stehen. Er stand vorher dahinter — ein Mount ohne Auswahl rendert
  // mit diesem Hook, ein Tipp auf einen Baum setzt `auswahl`, der `return`
  // greift und die Seite rendert einen Hook weniger. React #300 beim Hinein-,
  // #301 beim Zurückspringen. Kein Hook darf in dieser Komponente mehr hinter
  // einem `return` stehen (Rules of Hooks) — siehe
  // test/baumkataster/verdrahtung.test.js, Beschreibung „Rules of Hooks".
  const faellig = useMemo(() => {
    const jeKunde = {};
    // Ausstehende (noch nicht vom Server bestätigte) Bäume haben keine
    // richtige Nummer und keine Kontrollhistorie — ohne diesen Ausschluss
    // gälten sie als „nie kontrolliert" mit Stufe rot, noch bevor der erste
    // Empfang überhaupt da war.
    for (const b of gefiltert.filter((b) => !b.ausstehend)) (jeKunde[b.kundeId] ||= {})[b.nr] = b;
    const rang = { rot: 0, gelb: 1 };
    return Object.values(jeKunde)
      .flatMap((baeume) => bkFaellig({ baeume }, heute))
      .sort((a, b) => (rang[a.stufe] - rang[b.stufe])
        || String(a.baum.kundeName || "").localeCompare(String(b.baum.kundeName || ""))
        || String(a.baum.nr).localeCompare(String(b.baum.nr)));
  }, [gefiltert, heute]);

  if (auswahl) {
    const store = stores[String(auswahl.kundeId)];
    const baum = store?.baeume?.[auswahl.nr];
    if (baum) return (
      <>
        <style>{CSS}</style>
        <BaumDetail baum={baum} objekte={store.objekte} creds={creds} kundeId={auswahl.kundeId} heute={heute}
          onBack={() => setAuswahl(null)} onBearbeiten={() => setForm({ vorlage: { ...baum, kundeId: auswahl.kundeId } })} onKontrolle={() => setWizard(true)}
          onErledigt={massnahmeErledigt}
          onPositionKorrigieren={() => { setSetzePosition({ kundeId: auswahl.kundeId, nr: baum.nr }); setAuswahl(null); setReiter("karte"); }}
          showToast={showToast} />
        {form && <BaumForm vorlage={form.vorlage} objekte={store.objekte} onClose={() => setForm(null)} onSave={baumSpeichern} showToast={showToast} />}
        {wizard && <KontrolleWizard baum={baum} creds={creds} kunde={kundeVon(auswahl.kundeId)} me={me} api={api} heute={heute}
          onClose={() => setWizard(false)} onGespeichert={(d) => { if (d?.store) storeSetzen(auswahl.kundeId, d.store); setWizard(false); }}
          onOffline={einreihen} showToast={showToast} />}
      </>
    );
  }

  const zaehler = (
    <div className="bk-zaehler">
      zeigt {gefiltert.length} von {alleBaeume.length} Bäumen
      {bkFilterAktiv(filter) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => filterSetzen({ ...BK_FILTER_LEER })}>Filter zurücksetzen</button>}
    </div>
  );

  // Zahl der aktiven Filterdimensionen — steht als Marke am Menüknopf, damit
  // ein wirkender Filter nie unsichtbar ist (die Leiste selbst ist ja zu).
  const filterZahl = (filter.kunden.length ? 1 : 0) + ["kontrolle", "sicherheit", "massnahmen"].filter((k) => filter[k] !== "alle").length
    + ["art", "objekt", "text"].filter((k) => String(filter[k] || "").trim()).length;
  const burger = (
    <button type="button" className={`bk-burger ${filterZahl ? "aktiv" : ""}`} title="Filter & Suche" aria-label="Filter und Suche" onClick={() => setMenue(true)}>
      ☰{filterZahl > 0 && <span className="bk-burger-zahl">{filterZahl}</span>}
    </button>
  );
  const karteSichtbar = reiter === "karte" && online && !laden;
  const baumAnlegen = () => setForm({ vorlage: { kundeId: filter.kunden.length === 1 ? filter.kunden[0] : (letzterKunde || "") } });

  return (
    <div className="main">
      <style>{CSS}</style>
      <div className="page-header"><div className="back-btn" onClick={onBack}>‹</div><h2>Baumkataster</h2></div>
      {(cacheStand || warteschlange.length > 0) && (
        <div className="gbu-warn" style={{ marginBottom: 10 }}>
          {cacheStand ? `offline — Stand von ${new Date(cacheStand).toLocaleString("de-DE")}` : "Verbindung da"}
          {warteschlange.length > 0 ? ` · ${bkOffeneVorgaenge(warteschlange, null).length} Vorgänge warten` : ""}
        </div>
      )}
      {laden && <div className="loading"><div className="spinner" /> Lade…</div>}
      <div className="bk-reiter">
        {/* In der Karte sitzt der Menüknopf als Overlay; ohne Karte (Liste,
            Fällig, offline) steht er hier. */}
        {!karteSichtbar && burger}
        {[["karte", "Karte"], ["liste", "Liste"], ["faellig", `Fällig${faellig.length ? ` (${faellig.length})` : ""}`]].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${reiter === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setReiter(id)}>{label}</button>
        ))}
      </div>
      {!karteSichtbar && (
        <>
          {zaehler}
          <div className="action-row" style={{ marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={baumAnlegen}>+ Baum anlegen</button>
          </div>
        </>
      )}

      {reiter === "karte" && (laden ? null : online ? (
        <div className="bk-karte-rahmen">
          {burger}
          <Suspense fallback={<div className="loading"><div className="spinner" /> Karte lädt…</div>}>
            <BaumKarte baeume={gefiltert} heute={heute} modus={modus} auswahl={auswahl} mehrereKunden={mehrereKunden}
              hoehe="100%"
              kundenPunkte={filter.kunden.length ? bkVerortet(gefiltert) : []}
              ziel={ziel}
              onWahl={(b) => { if (!b.ausstehend) setAuswahl({ kundeId: b.kundeId, nr: b.nr }); }}
              onAddAt={(lat, lon) => setKartenZiel({ lat, lon })}
              setzModus={!!setzePosition} onSetzen={positionSetzen} />
          </Suspense>
          <div className="bk-karte-fuss">
            {zaehler}
            <button type="button" className="bk-fab" title="Baum anlegen" onClick={baumAnlegen}>+</button>
          </div>
        </div>
      ) : <div className="empty-state"><p>Offline — die Karte braucht Verbindung. Die Liste geht auch ohne.</p></div>)}

      {menue && (
        <div className="modal-backdrop" onClick={() => setMenue(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="bk-menue-kopf">
              <h3>Filter & Suche</h3>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMenue(false)}>Fertig</button>
            </div>
            <BkFilterLeiste filter={filter} onChange={filterSetzen} kundenListe={kundenListe}
              zaehler={zaehler} arten={bestandArten} objekteBestand={bestandObjekte}
              ladeFehler={ladeFehler} kundenHinweis={kundenHinweis} modus={modus} onModus={setModus} />
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }}
              disabled={pdfLaeuft || filter.kunden.length !== 1 || !stores[filter.kunden[0]]} onClick={bericht}>
              {pdfLaeuft ? "PDF …" : filter.kunden.length === 1 ? "Bericht (PDF)" : "Bericht (PDF) — dafür genau einen Kunden wählen"}
            </button>
          </div>
        </div>
      )}

      {reiter === "liste" && (
        <>
          {!gefiltert.length && <div className="empty-state"><p>Noch kein Baum erfasst.</p></div>}
          {gefiltert.map((b) => (
            <div key={`${b.kundeId}|${b.nr}`} className="list-card" onClick={b.ausstehend ? undefined : () => setAuswahl({ kundeId: b.kundeId, nr: b.nr })}>
              <div className="list-card-main">
                <div className="list-card-title"><span className="bk-punkt" style={{ background: BK_FARBEN[bkStatusFarbe(b, heute, "kontrolle")] }} />{b.nr} · {b.artDe || b.art}{mehrereKunden ? ` · ${b.kundeName}` : ""}{b.status !== "aktiv" ? ` (${b.status})` : ""}</div>
                <div className="list-card-sub">{[objekteAllerKunden[b.objekt]?.name, b.standort].filter(Boolean).join(" · ") || "—"} · nächste Kontrolle {deDatum(bkLetzteKontrolle(b)?.naechsteKontrolle)}</div>
                {/* Noch keine Servernummer — nicht antippbar, wartet auf Nachtrag. */}
                {b.ausstehend && <div className="hint">Wartet auf Verbindung.</div>}
                {(b.lat == null || b.lon == null) && (
                  <div className="hint">keine Position —
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); setSetzePosition({ kundeId: b.kundeId, nr: b.nr }); setReiter("karte"); }}>Position setzen</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {reiter === "faellig" && (
        <>
          {!faellig.length && <div className="empty-state"><p>Nichts fällig.</p></div>}
          {faellig.map((f, i) => (
            <div key={i} className="list-card" onClick={() => setAuswahl({ kundeId: f.baum.kundeId, nr: f.baum.nr })}>
              <div className="list-card-main">
                <div className="list-card-title"><span className="bk-punkt" style={{ background: BK_FARBEN[f.stufe] }} />{f.baum.nr} · {f.baum.artDe || f.baum.art}{mehrereKunden ? ` · ${f.baum.kundeName}` : ""}</div>
                <div className="list-card-sub">{f.grund}{f.faellig ? ` · ${deDatum(f.faellig)}` : ""}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {form && <BaumForm vorlage={form.vorlage} kunden={kundenListe}
        objekte={(filter.kunden.length === 1 && stores[filter.kunden[0]]?.objekte) || objekteAllerKunden}
        onClose={() => setForm(null)} onSave={baumSpeichern} showToast={showToast} />}
      {kartenZiel && (
        <BaumForm vorlage={{ lat: kartenZiel.lat, lon: kartenZiel.lon, genauigkeitM: "", quelle: "karte",
            kundeId: filter.kunden.length === 1 ? filter.kunden[0] : (letzterKunde || "") }}
          kunden={kundenListe} objekte={objekteAllerKunden}
          onClose={() => setKartenZiel(null)} onSave={baumSpeichern} showToast={showToast} />
      )}
    </div>
  );
}

// ── Kontroll-Wizard (Task 12) ────────────────────────────────────────────────
const SCHRITTE = ["Befund", "Bewertung", "Maßnahmen", "Fotos", "Abschluss"];
const toEpoch = (iso, hh) => { const [y, m, d] = String(iso).split("-").map(Number); return Math.floor(new Date(y, m - 1, d, hh, 0, 0).getTime() / 1000); };

function KontrolleWizard({ baum, creds, kunde, me, api, heute, onClose, onGespeichert, onOffline, showToast }) {
  const [schritt, setSchritt] = useState(0);
  // vorgangId (18.09.2026, Idempotenz-Nachtrag): wird HIER beim Öffnen des
  // Wizards vergeben — Teil des Entwurfs, nicht des Sendevorgangs — und bleibt
  // über jeden Speicherversuch (auch über einen Wechsel online → Warteschlange,
  // siehe `speichern`/`onOffline` unten) hinweg gleich. Ohne das würde ein
  // zweiter Versuch, dessen `gespeicherteKontrolleRef` durch einen App-Neustart
  // zwischen Serverantwort und Verarbeitung verloren ging (Android räumt
  // WebView-Activities jederzeit ab), dieselbe Kontrolle ein zweites Mal
  // anlegen — additiv, also für immer. Der In-Memory-Merker bleibt die ERSTE
  // Bremse (schneller, kein Netz nötig), diese Kennung die zweite.
  const [k, setK] = useState(() => ({
    datum: heute, artKontrolle: "Regelkontrolle", vitalitaet: 1, verkehrssicher: "ja",
    befund: Object.fromEntries(Object.keys(BK_BEFUND).map((b) => [b, []])), bemerkung: "",
    intervallMonate: "", naechsteKontrolle: "", unterschrift: null, gps: null,
    vorgangId: bkVorgangId(),
  }));
  const [massnahmen, setMassnahmen] = useState([]);   // { art, dringlichkeit, faelligBis, bemerkung, aufgabe, vorgangId }
  const [neu, setNeu] = useState({ art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "", bemerkung: "", aufgabe: true });
  const [fotos, setFotos] = useState([]);              // { base64, vorschau }
  const [speichert, setSpeichert] = useState(false);
  // Wiederaufnahme bei Teilausfall: einmal gespeicherte Kontrolle und schon
  // erledigte Maßnahmen dürfen bei einem erneuten Klick nicht noch einmal
  // angelegt werden (Kontrollen sind additiv, nie löschbar; Dolibarr-Aufgaben
  // wären sonst doppelt). Fortschritt hängt an der Objekt-Identität der
  // Maßnahme (nicht am Index) — ein Entfernen aus der Liste zwischen zwei
  // Versuchen verschiebt sonst die Indizes und eine noch nicht gespeicherte
  // Maßnahme ginge still verloren.
  const gespeicherteKontrolleRef = useRef(null);
  const gespeicherteMassnahmenRef = useRef(new Set());
  const dolibarrTasksRef = useRef(new Map());
  // Zuletzt bekannte Antwort des Servers, fortgeschrieben nach JEDEM
  // erfolgreichen kontrolle/save UND massnahme/save — nicht nur die
  // Kontroll-Antwort. Ohne das würde ein erneuter Versuch nach Teilausfall
  // (Maßnahme 2 entfernt, erneut gespeichert) wieder den Stand VOR allen
  // Maßnahmen an onGespeichert übergeben, weil Maßnahme 1 dann übersprungen
  // wird (schon gespeichert) und die lokale Variable nie erneut vorrückt.
  const letzterStoreRef = useRef(null);
  const set = (feld, wert) => setK((p) => ({ ...p, [feld]: wert }));
  const vorschlag = bkNaechsteKontrolle(k, baum);
  const naechste = k.naechsteKontrolle || vorschlag.datum;

  useEffect(() => { positionErmitteln(10).then((p) => { if (p) set("gps", p); }); }, []);

  const massnahmeDazu = () => {
    if (neu.art === "Sonstige Maßnahme" && !neu.bemerkung.trim()) { showToast('Bei „Sonstige Maßnahme" die Bemerkung ausfüllen', "error"); return; }
    // vorgangId je Maßnahme SCHON HIER vergeben (beim Hinzufügen zur Liste,
    // nicht erst beim Senden) — dieselbe Begründung wie bei k.vorgangId oben.
    setMassnahmen((m) => [...m, { ...neu, vorgangId: bkVorgangId(), faelligBis: neu.faelligBis || bkFristAusDringlichkeit(neu.dringlichkeit, k.datum) }]);
    setNeu({ art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "", bemerkung: "", aufgabe: true });
  };
  const fotoDazu = async (e) => {
    const dateien = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of dateien.slice(0, 10 - fotos.length)) {
      try { const b64 = await bildVerkleinern(f); setFotos((x) => [...x, { base64: b64, vorschau: "data:image/jpeg;base64," + b64 }]); }
      catch (err) { showToast(err.message || "Foto nicht lesbar", "error"); }
    }
  };

  const speichern = async () => {
    if (!k.unterschrift) { showToast("Bitte unterschreiben", "error"); return; }
    setSpeichert(true);
    try {
      // 1. Kontrolle (der Server legt zuerst die Fotos ab, dann den Eintrag).
      // Schon gespeichert (erneuter Versuch nach Teilausfall)? Dann NICHT
      // noch einmal anlegen, sondern mit dem gemerkten Ergebnis weiterarbeiten.
      let gespeichert = gespeicherteKontrolleRef.current;
      if (!gespeichert) {
        const kontrolleNutzlast = { ...k, kontrolleur: personName(me), naechsteKontrolle: naechste, intervallMonate: k.intervallMonate || vorschlag.intervallMonate };
        try {
          gespeichert = await ncJson("/api/nc/baumkataster/kontrolle/save", {
            ...creds, kundeId: kunde.id, nr: baum.nr, login: me?.login || "",
            vorgangId: k.vorgangId,
            kontrolle: kontrolleNutzlast,
            fotos: fotos.map((f) => ({ base64: f.base64 })),
          });
        } catch (fehler) {
          // Statuscode entscheidet wie bei baumSpeichern/massnahmeErledigt,
          // nicht navigator.onLine (WLAN ohne Uplink meldet online = true).
          // Eine 400 ist fachlich abgelehnt und darf nie in die Warteschlange.
          if (fehler.status === 400) { showToast(fehler.message || "Abgelehnt", "error"); return; }
          // Offline/Serverfehler: Fotos zuerst als Blob sichern (nur ihre
          // Schlüssel wandern in die Warteschlange), dann die Kontrolle
          // einreihen — ein Fehlschlag hier (VersionError, blockierte
          // Aktualisierung durch einen zweiten Tab) darf keine unbehandelte
          // Ablehnung werden, sonst schließt der Wizard ohne Eintrag und ohne
          // erkennbaren Grund. `eintrag.id` ist nur der Blob-Präfix — die
          // Warteschlange vergibt beim Einreihen (`bkEinreihen`) ihre eigene,
          // längere Id; `bkNachtragen` löscht die Fotos ohnehin über
          // `fotoSchluessel`, nicht über die Eintrags-Id.
          const eintrag = { id: `bkq-${Date.now().toString(36)}` };
          let schluessel;
          try { schluessel = await fotosSichern(eintrag.id, fotos.map((f) => f.base64)); }
          catch (_) { throw new Error("Fotos konnten auf dem Gerät nicht zwischengespeichert werden — bitte mit Verbindung erneut speichern."); }
          // Dieselbe lokalId für Kontrolle UND Maßnahmen: `bkNachtragen`
          // trägt die vom Server vergebene Kontroll-Id (`bkQueueKontrolleIdEinsetzen`,
          // baumkataster-offline.js) nach dem erfolgreichen Nachtrag der
          // Kontrolle in alle wartenden Maßnahmen mit dieser Id nach — sonst
          // gingen im selben Durchlauf erfasste Maßnahmen verloren.
          const lokalId = `lok-${Date.now().toString(36)}`;
          // vorgangId REICHT WEITER, statt eine neue zu würfeln (`bkEinreihen`
          // übernimmt eine mitgegebene Kennung) — der Online-Versuch ist
          // gerade gescheitert, aber ob er den Server schon erreicht hat,
          // weiß niemand hier; dieselbe Kennung lässt einen wartenden
          // Nachtrag das erkennen.
          onOffline({
            typ: "kontrolle", kundeId: kunde.id, lokalId, fotoSchluessel: schluessel,
            vorgangId: k.vorgangId,
            nutzlast: { nr: baum.nr, kontrolle: kontrolleNutzlast },
          });
          for (const m of massnahmen) {
            onOffline({
              typ: "massnahme", kundeId: kunde.id, lokalId,
              vorgangId: m.vorgangId,
              nutzlast: { nr: baum.nr, massnahme: { kontrolleId: null, art: m.art, dringlichkeit: m.dringlichkeit, faelligBis: m.faelligBis, bemerkung: m.bemerkung, datum: k.datum, dolibarrTaskId: null } },
            });
          }
          onGespeichert(null);
          return;
        }
        gespeicherteKontrolleRef.current = gespeichert;
      }
      if (letzterStoreRef.current == null) letzterStoreRef.current = gespeichert;
      // 2. Maßnahmen — jede einzeln, mit der Id der eben gespeicherten Kontrolle.
      // Bei Wiederholung schon gespeicherte (per Objekt-Identität) überspringen.
      let projekt;
      for (const m of massnahmen) {
        if (gespeicherteMassnahmenRef.current.has(m)) continue;
        let dolibarrTaskId = dolibarrTasksRef.current.get(m) ?? null;
        if (m.aufgabe && api?.createTask && dolibarrTaskId == null) {
          if (projekt === undefined) projekt = bkProjektFuerKunde(await api.getProjects().catch(() => []), kunde.id);
          if (!projekt) showToast("Kein offenes Projekt beim Kunden — Maßnahme ohne Dolibarr-Aufgabe gespeichert");
          else {
            try {
              const t = await api.createTask({
                ref: `BK-${Date.now().toString(36).toUpperCase().slice(-6)}`, fk_project: parseInt(projekt.id),
                label: `${m.art} Baum ${baum.nr}`,
                description: `${baum.artDe || baum.art}, ${baum.standort || "Standort s. Kataster"}. Kontrolle vom ${deDatum(k.datum)}. ${m.bemerkung}`.trim(),
                date_start: toEpoch(k.datum, 8), date_end: toEpoch(m.faelligBis, 17),
              });
              dolibarrTaskId = typeof t === "number" ? t : (t?.id || t?.rowid || null);
              if (dolibarrTaskId != null) dolibarrTasksRef.current.set(m, dolibarrTaskId);
            } catch (e) { showToast("Dolibarr-Aufgabe fehlgeschlagen: " + (e?.message || e), "error"); }
          }
        }
        letzterStoreRef.current = await ncJson("/api/nc/baumkataster/massnahme/save", {
          ...creds, kundeId: kunde.id, nr: baum.nr, login: me?.login || "",
          vorgangId: m.vorgangId,
          massnahme: { kontrolleId: gespeichert.kontrolle.id, art: m.art, dringlichkeit: m.dringlichkeit, faelligBis: m.faelligBis, bemerkung: m.bemerkung, datum: k.datum, dolibarrTaskId },
        });
        gespeicherteMassnahmenRef.current.add(m);
      }
      showToast(`Kontrolle ${baum.nr} gespeichert${massnahmen.length ? ` · ${massnahmen.length} Maßnahme(n)` : ""}`);
      onGespeichert(letzterStoreRef.current);
    } catch (e) {
      showToast(
        gespeicherteKontrolleRef.current
          ? "Kontrolle ist schon gespeichert — nur die Maßnahmen fehlen noch: " + (e?.message || e)
          : "Speichern fehlgeschlagen: " + (e?.message || e),
        "error",
      );
    }
    finally { setSpeichert(false); }
  };

  return (
    <div className="modal-backdrop" onClick={() => !speichert && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="bk-schritt">Schritt {schritt + 1}/{SCHRITTE.length} · {SCHRITTE[schritt]}</div>
        <h3>Kontrolle {baum.nr} · {baum.artDe || baum.art}</h3>

        {schritt === 0 && Object.keys(BK_BEFUND).map((b) => (
          <Feld key={b} label={BK_BEFUND_LABEL[b]}>
            <BkChips werte={BK_BEFUND[b]} auswahl={k.befund[b]} onChange={(v) => set("befund", { ...k.befund, [b]: v })} />
          </Feld>
        ))}

        {schritt === 1 && (
          <>
            <div className="action-row action-row-2">
              <Feld label="Datum"><input type="date" value={k.datum} onChange={(e) => set("datum", e.target.value)} /></Feld>
              <Feld label="Art der Kontrolle"><select value={k.artKontrolle} onChange={(e) => set("artKontrolle", e.target.value)}>{BK_KONTROLLARTEN.map((a) => <option key={a}>{a}</option>)}</select></Feld>
            </div>
            <Feld label="Vitalität (Roloff)">
              <div className="gbu-chips">{BK_VITALITAET.map((v) => <button key={v.stufe} type="button" className={`gbu-chip ${k.vitalitaet === v.stufe ? "gbu-chip-active" : ""}`} onClick={() => set("vitalitaet", v.stufe)}>{v.stufe} · {v.text}</button>)}</div>
            </Feld>
            <Feld label="Verkehrssicherheit">
              <div className="gbu-chips">{BK_VERKEHRSSICHER.map((v) => <button key={v.id} type="button" className={`gbu-chip ${k.verkehrssicher === v.id ? "gbu-chip-active" : ""}`} onClick={() => set("verkehrssicher", v.id)}>{v.label}</button>)}</div>
            </Feld>
            <Feld label="Bemerkung"><textarea rows={3} value={k.bemerkung} onChange={(e) => set("bemerkung", e.target.value)} /></Feld>
          </>
        )}

        {schritt === 2 && (
          <>
            {massnahmen.map((m, i) => (
              <div key={i} className="bk-massnahme">
                <strong>{m.art}</strong> · {BK_DRINGLICHKEIT.find((d) => d.id === m.dringlichkeit)?.label} · bis {deDatum(m.faelligBis)}{m.aufgabe ? " · Dolibarr-Aufgabe" : ""}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMassnahmen((x) => x.filter((_, j) => j !== i))}>Entfernen</button>
              </div>
            ))}
            <Feld label="Maßnahme"><select value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>{BK_MASSNAHMEN.map((a) => <option key={a}>{a}</option>)}</select></Feld>
            <Feld label="Dringlichkeit"><select value={neu.dringlichkeit} onChange={(e) => setNeu({ ...neu, dringlichkeit: e.target.value, faelligBis: "" })}>{BK_DRINGLICHKEIT.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Feld>
            <Feld label={`Fällig bis (Vorschlag ${deDatum(bkFristAusDringlichkeit(neu.dringlichkeit, k.datum))})`}><input type="date" value={neu.faelligBis} onChange={(e) => setNeu({ ...neu, faelligBis: e.target.value })} /></Feld>
            <Feld label="Bemerkung"><input value={neu.bemerkung} onChange={(e) => setNeu({ ...neu, bemerkung: e.target.value })} /></Feld>
            <label className="hint"><input type="checkbox" checked={neu.aufgabe} onChange={(e) => setNeu({ ...neu, aufgabe: e.target.checked })} /> Aufgabe im Kundenprojekt anlegen (Dolibarr)</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={massnahmeDazu}>+ Maßnahme aufnehmen</button>
          </>
        )}

        {schritt === 3 && (
          <>
            <div className="bk-fotos">{fotos.map((f, i) => <img key={i} src={f.vorschau} alt={`Foto ${i + 1}`} onClick={() => setFotos((x) => x.filter((_, j) => j !== i))} />)}</div>
            <Feld label={`Fotos (${fotos.length}/10, tippen = entfernen)`}><input type="file" accept="image/*" capture="environment" multiple onChange={fotoDazu} /></Feld>
          </>
        )}

        {schritt === 4 && (
          <>
            <Feld label={`Nächste Kontrolle (Vorschlag ${vorschlag.intervallMonate} Monate → ${deDatum(vorschlag.datum)})`}>
              <input type="date" value={naechste || ""} onChange={(e) => set("naechsteKontrolle", e.target.value)} />
            </Feld>
            <div className="hint">{k.gps ? `Position: ${k.gps.lat.toFixed(5)}, ${k.gps.lon.toFixed(5)} (± ${Math.round(k.gps.genauigkeitM ?? 0)} m)` : "Keine GPS-Position"} · Kontrolleur: {personName(me)}</div>
            <Feld label="Unterschrift Kontrolleur"><BkSignatur onChange={(v) => set("unterschrift", v)} /></Feld>
          </>
        )}

        <div className="action-row action-row-2" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" disabled={speichert} onClick={() => (schritt === 0 ? onClose() : setSchritt(schritt - 1))}>{schritt === 0 ? "Abbrechen" : "Zurück"}</button>
          {schritt < SCHRITTE.length - 1
            ? <button type="button" className="btn btn-primary" onClick={() => setSchritt(schritt + 1)}>Weiter</button>
            : <button type="button" className="btn btn-primary" disabled={speichert} onClick={speichern}>{speichert ? "Speichert …" : "Kontrolle speichern"}</button>}
        </div>
      </div>
    </div>
  );
}
