// Isolierte Smoke-Testseite für BkFilterLeiste (src/ui/BaumkatasterPage.jsx)
// und BaumKarte (src/ui/BaumKarte.jsx) — siehe scripts/bk-smoke.html. Mountet
// BEIDE Bausteine direkt statt der ganzen Seite: die Seite selbst braucht
// Nextcloud-Zugangsdaten, Dolibarr-`api` und ncPost/fetch — für den Beleg
// "Marker-Tipp öffnet kein Anlege-Fenster" reicht die Karte allein, mit einem
// sichtbaren Log statt echter Detail-Ansicht. Kein Dolibarr-Login, keine
// echten Zugangsdaten, kein echter Netzverkehr außer OSM-Kacheln (sparsam:
// kleiner Kartenausschnitt, niedriger Zoom). NICHT Teil der Produktiv-App —
// Vorbild scripts/gbu-smoke.html/.jsx.
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import BaumKarte from "../src/ui/BaumKarte.jsx";
import { BkFilterLeiste } from "../src/ui/BaumkatasterPage.jsx";
import { BK_FILTER_LEER, bkArtenImBestand, bkFilter, bkFilterAktiv, bkObjekteImBestand } from "../src/baumkataster.js";

// ── Sichtbares Log (zusätzlich zur Browser-Konsole) ─────────────────────────
const logEl = document.getElementById("log");
function log(...args) {
  const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  console.log("[bk-smoke]", ...args);
  if (logEl) {
    const line = document.createElement("div");
    line.textContent = text;
    logEl.prepend(line);
  }
}
window.addEventListener("error", (e) => log("FEHLER:", e.message, `${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => log("UNHANDLED REJECTION:", e.reason?.message || String(e.reason)));

// ── Testbäume (fest, kein Nextcloud) — ein Kunde, drei Bäume rund um
// Musterstadt (dieselbe Gegend wie gbu-smoke), damit die Karte nicht springt. ──
const HEUTE = "2026-09-18";
const OBJEKTE = { "obj-1": { name: "Nordwiese" }, "obj-2": { name: "Am Bach" } };
const KUNDE = { id: "1", name: "Testkunde Mustermann GmbH" };
const BAEUME = [
  {
    nr: "B-0001", status: "aktiv", kundeId: "1", kundeName: KUNDE.name,
    artDe: "Stieleiche", art: "Quercus robur", objekt: "obj-1", standort: "Wiese",
    lat: 50.6849, lon: 8.6942, kronendurchmesserM: 8,
    kontrollen: [{ id: "k1", datum: "2026-01-01", vitalitaet: 1, verkehrssicher: "ja", naechsteKontrolle: "2028-01-01" }],
    massnahmen: [],
  },
  {
    nr: "B-0002", status: "aktiv", kundeId: "1", kundeName: KUNDE.name,
    artDe: "Winterlinde", art: "Tilia cordata", objekt: "obj-2", standort: "Wegrand",
    lat: 50.6855, lon: 8.6950, kronendurchmesserM: 6,
    kontrollen: [{ id: "k2", datum: "2026-01-01", vitalitaet: 2, verkehrssicher: "eingeschraenkt", naechsteKontrolle: "2026-09-20" }],
    massnahmen: [{ id: "m1", art: "Totholzentfernung", dringlichkeit: "kurzfristig", faelligBis: "2026-12-01", status: "offen" }],
  },
  {
    nr: "B-0003", status: "aktiv", kundeId: "1", kundeName: KUNDE.name,
    artDe: "Bergahorn", art: "Acer pseudoplatanus", objekt: "obj-1", standort: "Hof",
    lat: 50.6842, lon: 8.6935, kronendurchmesserM: 10,
    kontrollen: [{ id: "k3", datum: "2026-01-01", vitalitaet: 3, verkehrssicher: "nein", naechsteKontrolle: "2026-01-01" }],
    massnahmen: [{ id: "m2", art: "Fällung", dringlichkeit: "sofort", faelligBis: "2026-09-17", status: "offen" }],
  },
];

function Smoke() {
  const [filter, setFilter] = useState(() => ({ ...BK_FILTER_LEER }));
  const [auswahl, setAuswahl] = useState(null);
  const gefiltert = useMemo(() => bkFilter(BAEUME, filter, HEUTE), [filter]);
  const arten = useMemo(() => bkArtenImBestand(BAEUME), []);
  const objekteBestand = useMemo(() => bkObjekteImBestand(BAEUME, OBJEKTE), []);

  const onChange = (f) => { log("filter geändert:", JSON.stringify(f)); setFilter(f); };
  const zaehler = (
    <div style={{ fontSize: 12, opacity: 0.8, margin: "6px 0" }}>
      zeigt {gefiltert.length} von {BAEUME.length} Bäumen
      {bkFilterAktiv(filter) && <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => setFilter({ ...BK_FILTER_LEER })}>Filter zurücksetzen</button>}
    </div>
  );

  return (
    <div>
      <h3>1. BkFilterLeiste — alle sechs Dimensionen</h3>
      <BkFilterLeiste
        filter={filter} onChange={onChange} kundenListe={[KUNDE]} zaehler={zaehler}
        arten={arten} objekteBestand={objekteBestand} ladeFehler={[]} kundenHinweis=""
      />
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Übrig: {gefiltert.map((b) => b.nr).join(", ") || "—"}</div>

      <h3 style={{ marginTop: 24 }}>2. BaumKarte — Marker-Tipp vs. freie Fläche vs. Verschieben</h3>
      <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.8 }}>
        Erwartung: Tipp auf einen Marker → „onWahl" im Log, KEIN Anlege-Popup. Tipp auf freie Fläche → Popup „Baum
        hier anlegen", Klick darauf → „onAddAt" im Log. Verschieben (Ziehen) der Karte → nichts davon.
      </div>
      <BaumKarte
        baeume={gefiltert} heute={HEUTE} modus="kontrolle" auswahl={auswahl} hoehe={420}
        mehrereKunden={false} kundenPunkte={[]} ziel={null}
        onWahl={(b) => { log("onWahl:", b.nr, "(Baum-Detail würde hier öffnen, KEIN Anlege-Fenster)"); setAuswahl({ kundeId: b.kundeId, nr: b.nr }); }}
        onAddAt={(lat, lon) => log("onAddAt:", lat.toFixed(5), lon.toFixed(5), "(Anlege-Fenster würde hier öffnen)")}
        setzModus={false} onSetzen={() => log("onSetzen aufgerufen (sollte in diesem Test nie passieren)")}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Smoke />
  </StrictMode>,
);
