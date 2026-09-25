// Isolierte Smoke-Testseite fuer src/ui/GbuFormSkt.jsx (17.09.2026) — siehe
// scripts/gbu-smoke.html. Mockt api, me, project, showToast sowie fetch
// (/api/nc/*, Nominatim, Open-Meteo, OSM-Kacheln) und navigator.geolocation,
// damit die Maske ohne Dolibarr-Login, ohne echte Zugangsdaten und ohne
// echten Netzverkehr durchgeklickt werden kann. NICHT Teil der Produktiv-App.
import { StrictMode, useState } from "react"; // main.jsx haengt App ebenfalls in StrictMode ein — bewusst genauso hier
import { createRoot } from "react-dom/client";
import GbuFormSkt from "../src/ui/GbuFormSkt.jsx";

// ── Sichtbares Log (zusaetzlich zur Browser-Konsole) ────────────────────────
const logEl = document.getElementById("log");
function log(...args) {
  const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  console.log("[gbu-smoke]", ...args);
  if (logEl) {
    const line = document.createElement("div");
    line.textContent = text;
    logEl.prepend(line);
  }
}
window.addEventListener("error", (e) => log("FEHLER:", e.message, `${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => log("UNHANDLED REJECTION:", e.reason?.message || String(e.reason)));

// ── navigator.geolocation mocken: kein echter Berechtigungsdialog, keine
// echte Position. gpsHolen() in GbuFormSkt wartet trotzdem hart 10s
// (setTimeout(fertig, 10000)) — das ist Absicht im Original und bleibt so. ──
const FAKE_POS = { lat: 50.6849, lon: 8.6942 }; // Musterstadt
// navigator.geolocation ist in Chrome ein Getter ohne Setter — direktes
// Zuweisen scheitert mit "Cannot set property geolocation", darum defineProperty.
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    watchPosition: (success) => {
      setTimeout(() => success({
        coords: { latitude: FAKE_POS.lat, longitude: FAKE_POS.lon, accuracy: 8 },
        timestamp: Date.now(),
      }), 100);
      return 1;
    },
    clearWatch: () => {},
  },
});

// ── fetch mocken: /api/nc/*, Nominatim, Open-Meteo, OSM-Kacheln ─────────────
// Verhindert echten Netzverkehr zu externen Diensten (Auftrag: "keine echten
// externen Dienste provozieren") und exerciert nebenbei die Automatik-Zweige
// (Teilprojekt A Qualifikationen, Teilprojekt C Baumkataster), die bei
// bloßem 404 nie liefen.
const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const QUALI_STORE = {
  version: 1,
  personen: {
    test: { name: "Test Person", mobil: "0170 0000000", quals: [{ art: "skt-b", seit: "2022-01-01" }] },
    maria: { name: "Maria Baum", mobil: "0170 0000000", quals: [{ art: "skt-a", seit: "2021-06-01" }] },
  },
};

const BAUM_STORE = {
  baeume: {
    "T-001": {
      nr: "T-001", artDe: "Bergahorn", art: "Acer pseudoplatanus", standort: "Vorgarten", status: "aktiv",
      stammumfangCm: 120, hoeheM: 15, kronendurchmesserM: 8,
      kontrollen: [{
        id: "K1", datum: "2026-06-01", vitalitaet: 0, verkehrssicher: "ja",
        befund: { krone: ["gesund"], stammfuss: ["ok"], umfeld: ["frei"] },
      }],
    },
  },
};

const echterFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(typeof input === "string" ? input : input?.url || "");
  if (url.includes("/api/nc/qualifikationen")) { log("fetch-mock: qualifikationen"); return json(QUALI_STORE); }
  if (url.includes("/api/nc/baumkataster/kunde")) { log("fetch-mock: baumkataster/kunde"); return json(BAUM_STORE); }
  if (url.includes("/api/nc/baumkataster/kontrolle/gbu")) { log("fetch-mock: kataster-verweis"); return json({ ok: true }); }
  if (url.includes("/api/appupdate/manifest")) { return json({ ok: true }); }
  if (url.includes("nominatim.openstreetmap.org")) {
    log("fetch-mock: nominatim (reverse geocoding)");
    return json({ address: { city: "Musterstadt", suburb: "Musterviertel", road: "Zur Musterstraße", house_number: "10" } });
  }
  if (url.includes("api.open-meteo.com")) {
    log("fetch-mock: open-meteo");
    return json({ current: { wind_speed_10m: 8, wind_gusts_10m: 14, precipitation: 0, time: new Date().toISOString() } });
  }
  if (url.includes("tile.openstreetmap.org")) return echterFetch(TINY_PNG); // winziges 1x1-PNG statt echter Kachel
  if (url.startsWith("/api/")) { log("fetch-mock: unbekannter /api/-Aufruf ->", url, "(404)"); return new Response("", { status: 404 }); }
  return echterFetch(input, init);
};

// ── Dolibarr-Api-Attrappe ────────────────────────────────────────────────────
const heuteUnix = (hh, mm) => { const d = new Date(); d.setHours(hh, mm, 0, 0); return Math.floor(d.getTime() / 1000); };

const CUSTOMERS = [{ id: "1", rowid: "1", name: "Testkunde Mustermann GmbH", address: "Musterstraße 12", zip: "12345", town: "Musterstadt", socid: "1" }];
const USERS_ROH = [
  { id: "10", login: "test", firstname: "Test", lastname: "Person", user_mobile: "0170 0000000", statut: 1 },
  { id: "11", login: "maria", firstname: "Maria", lastname: "Baum", user_mobile: "0170 0000000", statut: 1 },
];
const TEST_PROJECT = { id: "100", rowid: "100", socid: "1", fk_soc: "1", ref: "PRJ100", title: "Testprojekt Baumpflege", statut: 1 };
const PROJECTS = [TEST_PROJECT];
const AGENDA = [{ fk_project: "100", datep: heuteUnix(9, 0), datef: heuteUnix(15, 0) }];
// Verbandkasten ueberfaellig -> materialAusFristen() muss die Materialzeilen
// offen lassen und die Warnung "Betriebsmittel mit offener Frist" zeigen.
const LOSE = [
  { id: 1, batch: "Verbandkasten-01", eatby: "2020-01-01" },
  { id: 2, batch: "Helm-01" },
];

const wait = (v) => new Promise((r) => setTimeout(() => r(v), 60));
const makeApi = () => ({
  getThirdparties: (typ) => { log("api.getThirdparties", typ); return wait(CUSTOMERS); },
  getUsers: () => { log("api.getUsers"); return wait(USERS_ROH); },
  getProjects: () => { log("api.getProjects"); return wait(PROJECTS); },
  getLots: () => { log("api.getLots"); return wait(LOSE); },
  getAgendaEvents: () => { log("api.getAgendaEvents"); return wait(AGENDA); },
});

const ME = { login: "test", firstname: "Test", lastname: "Person" };
const showToast = (msg, art) => log(`toast(${art || "info"}):`, msg);

function Smoke() {
  const [projektModus, setProjektModus] = useState("none"); // "none" | "test"
  const [key, setKey] = useState(0);
  const [offen, setOffen] = useState(true);
  const [api] = useState(makeApi);

  const neu = (modus) => { setProjektModus(modus); setKey((k) => k + 1); setOffen(true); };

  return (
    <div style={{ padding: 16 }}>
      <h3>GbuFormSkt — Smoke-Test</h3>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => neu("none")}>Neu öffnen: project=null</button>
        <button onClick={() => neu("test")}>Neu öffnen: project=Testprojekt</button>
        <span>aktuell: project={projektModus}</span>
      </div>
      {offen ? (
        <GbuFormSkt
          key={key}
          api={api}
          me={ME}
          project={projektModus === "test" ? TEST_PROJECT : null}
          showToast={showToast}
          onClose={() => { log("onClose() aufgerufen"); setOffen(false); }}
          onSaved={() => { log("onSaved() aufgerufen"); setOffen(false); }}
        />
      ) : (
        <div>Geschlossen — oben erneut öffnen.</div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Smoke />
  </StrictMode>,
);
