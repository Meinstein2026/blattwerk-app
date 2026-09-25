// Karte des Baumkatasters (Leaflet + OSM-Kacheln, nur online). Diese Datei
// wird von BaumkatasterPage.jsx über React.lazy geladen und lädt Leaflet
// selbst dynamisch — so bleibt das Hauptbundle frei davon. Das Stylesheet
// hängt am selben Chunk; Vite bindet es beim Laden des Chunks ein.
//
// Marker = Kreismarker in Ampelfarbe (bkMarkerFarbe) mit der Baumnummer als
// festem Label, darunter ein Kreis mit dem halben Kronendurchmesser. Es
// werden bewusst keine Bild-Marker benutzt: die Standard-Icons von Leaflet
// brauchen Bildpfade, die im Vite-Bundle nicht stimmen.
//
// Seit 17.09.2026 ist die Karte der EINSTIEG (wie bei SPD-Maps) und zeigt die
// Bäume aller Kunden. Startausschnitt aus bkStartAusschnitt: gemerkter Kunde,
// sonst IMMER der feste Kartenausschnitt des Mandanten (bkKartenStart(),
// Ansage Inhaber 19.09.2026 — vorher gemerkter Ausschnitt → Bäume → GPS →
// Welt). Dazu Ortssuche über Nominatim und Eintragen per Kartentipp (Vorbild
// SPD-Maps MapView).
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { bkKartenStart, bkKronenRadiusM, bkMarkerFarbe, bkOrtstreffer, bkStartAusschnitt } from "../baumkataster.js";

// Bedienelemente liegen seit 19.09.2026 IN der Karte (Vorbild SPD-Maps: große
// Karte, alles Weitere als Overlay). Links oben bleibt Platz für den
// Menüknopf der Seite (44 px + Rand), die Zoom-Knöpfe rutschen darunter.
// Steht hier und nicht im Stylesheet der Seite, weil die Seite die
// Kartenbibliothek nicht kennen darf (test/baumkataster/verdrahtung.test.js).
const CSS = `
.bk-karte-huelle { position: relative; }
.bk-karte-suche { position: absolute; top: 10px; left: 62px; right: 10px; z-index: 2; display: flex; gap: 6px; }
.bk-karte-suche input { flex: 1; min-width: 0; height: 44px; border-radius: 22px; padding: 0 16px; background: var(--surface); box-shadow: 0 1px 6px rgba(0,0,0,.35); }
.bk-karte-suche button { height: 44px; min-width: 44px; border-radius: 22px; background: var(--surface); box-shadow: 0 1px 6px rgba(0,0,0,.35); }
.bk-karte-huelle .bk-treffer { position: absolute; top: 60px; left: 10px; right: 10px; z-index: 2; background: var(--surface); box-shadow: 0 1px 6px rgba(0,0,0,.35); }
.bk-karte-hinweis { position: absolute; left: 10px; right: 10px; bottom: 64px; z-index: 2; }
.bk-karte .leaflet-top { top: 54px; }
`;

const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=";

/** Auswahl ist ein Paar: dieselbe Baumnummer gibt es bei jedem Kunden. */
const auswahlGleich = (auswahl, b) => !!auswahl && auswahl?.nr === b.nr && String(auswahl.kundeId) === String(b.kundeId);

/** Ein Versuch, 10 s — mehr wäre Warten ohne Gegenwert. */
const einmalPosition = () => new Promise((resolve) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
});

export default function BaumKarte({
  baeume, heute, modus, auswahl, onWahl, hoehe = 360,
  onAddAt, setzModus = false, onSetzen, kundenPunkte = [], ziel = null, mehrereKunden = false,
}) {
  const behaelter = useRef(null);
  const karte = useRef(null);
  const ebene = useRef(null);
  const L = useRef(null);
  const angepasst = useRef(false);
  const groesse = useRef(null);
  const aktuell = useRef({});
  aktuell.current = { baeume, heute, modus, auswahl, onWahl, onAddAt, setzModus, onSetzen, kundenPunkte, mehrereKunden, ziel };

  const [ort, setOrt] = useState("");
  const [treffer, setTreffer] = useState([]);
  const [sucht, setSucht] = useState(false);

  /** Sprung auf ein Kundengebiet (oder Stillstand bei "bleiben"). */
  const zielAnwenden = (z, m) => {
    if (!z || z.typ === "bleiben") return;
    if (z.typ === "bounds") m.fitBounds(z.punkte, { padding: [30, 30], maxZoom: 19 });
    else m.setView([z.lat, z.lon], z.zoom);
  };

  const zeichnen = () => {
    const l = L.current, m = karte.current, e = ebene.current;
    if (!l || !m || !e) return;
    const { baeume: bs, heute: h, modus: md, auswahl: aw, onWahl: klick, kundenPunkte: kp, mehrereKunden: mk } = aktuell.current;
    e.clearLayers();
    const punkte = [];
    for (const b of Array.isArray(bs) ? bs : []) {
      // I4 (Whole-Branch-Review): nicht-aktive Bäume (gefällt, entfernt)
      // gehören auf die Karte nicht mehr — anders als in Liste und Fällig,
      // wo sie (Liste) bzw. per eigenem Filter (Fällig) sichtbar bleiben.
      // `bkBaeumeAllerKunden` liefert sie inzwischen mit, gefiltert wird
      // bewusst erst hier (wie in der Basisfassung vor diesem Zweig).
      if (b.status !== "aktiv") continue;
      const lat = Number(b.lat), lon = Number(b.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;   // ohne Position nur in der Liste
      const farbe = bkMarkerFarbe(b, h, md);
      const gewaehlt = auswahlGleich(aw, b);
      punkte.push([lat, lon]);
      l.circle([lat, lon], { radius: bkKronenRadiusM(b), color: farbe, weight: 1, fillColor: farbe, fillOpacity: 0.15 }).addTo(e);
      l.circleMarker([lat, lon], { radius: gewaehlt ? 10 : 7, color: "#ffffff", weight: gewaehlt ? 3 : 1.5, fillColor: farbe, fillOpacity: 1 })
        // Bei mehreren Kunden auf der Karte sagt die Baumnummer allein nichts —
        // sie ist nur innerhalb eines Kundenstores eindeutig.
        .bindTooltip(mk && b.kundeName ? `${b.nr} · ${b.kundeName}` : b.nr,
          { permanent: true, direction: "top", offset: [0, -8], className: "bk-label" })
        // stopPropagation: ohne das öffnet der Tipp auf einen vorhandenen Baum
        // zusätzlich das Anlege-Popup der Karte darunter. Gestoppt wird das
        // LEAFLET-Ereignis `ev` selbst, NICHT `ev.originalEvent` (Fund vom
        // Browser-Smoke-Test 18.09.2026, scripts/bk-smoke.html): Leaflets
        // Map._handleDOMEvent liefert einen Klick an mehrere Ziele (Marker,
        // dann Karte) und bricht nur ab, wenn `data.originalEvent._stopped`
        // gesetzt ist. Genau das setzt `L.DomEvent.stopPropagation` nur, wenn
        // man ihr ein Objekt MIT `.originalEvent` gibt (der Leaflet-eigene
        // Zweig) — das native DOM-Ereignis hat ein eigenes `.stopPropagation`
        // und nimmt den falschen, wirkungslosen Zweig. Mit `ev.originalEvent`
        // öffnete ein Marker-Tipp „Baum hier anlegen" MIT, nur im Browser
        // sichtbar, kein Quelltexttest schlug an.
        .on("click", (ev) => { l.DomEvent.stopPropagation(ev); klick && klick(b); })
        .addTo(e);
    }
    if (!angepasst.current) {
      angepasst.current = true;
      zielAnwenden(bkStartAusschnitt(kp), m);
    }
  };

  useEffect(() => {
    let aktiv = true;
    import("leaflet").then((mod) => {
      if (!aktiv || !behaelter.current) return;
      const l = mod.default || mod;
      L.current = l;
      const start = bkKartenStart();
      const m = l.map(behaelter.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lon], start.zoom);
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap-Mitwirkende" }).addTo(m);
      ebene.current = l.layerGroup().addTo(m);
      karte.current = m;

      // Kartentipp: im Korrekturmodus setzt er direkt die neue Position,
      // sonst öffnet er ein kurzlebiges Popup (Muster SPD-Maps MapView).
      m.on("click", (ev) => {
        const { lat, lng } = ev.latlng;
        const { setzModus: setzt, onSetzen, onAddAt: anlegen } = aktuell.current;
        if (setzt) { onSetzen && onSetzen(lat, lng); return; }
        if (!anlegen) return;
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "btn btn-primary btn-sm";
        knopf.textContent = "🌳 Baum hier anlegen";
        const popup = l.popup({ closeButton: false, autoClose: true }).setLatLng(ev.latlng).setContent(knopf).openOn(m);
        const uhr = setTimeout(() => m.closePopup(popup), 5000);
        popup.on("remove", () => clearTimeout(uhr));
        knopf.onclick = () => { clearTimeout(uhr); m.closePopup(popup); anlegen(lat, lng); };
      });

      zeichnen();
      // Leaflet lädt asynchron: war beim allerersten Rendern schon ein `ziel`
      // da (gemerkter Kundenfilter), wäre der [ziel]-Effekt oben bereits vor
      // diesem Zeitpunkt gelaufen und leer ausgegangen (karte.current war noch
      // null) — er feuert erst wieder bei einer ERNEUTEN Filteränderung. Darum
      // hier einmalig nachholen, mit dem zu diesem Zeitpunkt aktuellen Wert.
      zielAnwenden(aktuell.current.ziel, m);
      // Größe nachführen, sobald der Behälter sie ändert. Ein einmaliges
      // invalidateSize nach 100 ms reichte auf dem Handy nicht: dreht man das
      // Gerät, klappt die Tastatur auf oder kommt das Layout später zur Ruhe,
      // rechnet Leaflet mit der alten Größe weiter — graue Flächen, Kacheln
      // nur in einer Ecke, Mittelpunkt verschoben.
      if (typeof ResizeObserver !== "undefined") {
        groesse.current = new ResizeObserver(() => m.invalidateSize());
        groesse.current.observe(behaelter.current);
      } else setTimeout(() => m.invalidateSize(), 100);
    }).catch(() => { /* offline: die Seite zeigt statt der Karte die Liste */ });
    return () => { aktiv = false; if (groesse.current) groesse.current.disconnect(); if (karte.current) { karte.current.remove(); karte.current = null; } };
  }, []);

  useEffect(() => { zeichnen(); }, [baeume, heute, modus, auswahl, mehrereKunden]);

  // Sprung auf das Gebiet der gewählten Kunden. Hängt an der Objektidentität
  // des Deskriptors — die Seite baut ihn nur bei einer Filteränderung neu, also
  // stört der Sprung die manuelle Navigation nicht.
  useEffect(() => {
    const m = karte.current;
    if (!m) return;
    zielAnwenden(ziel, m);
  }, [ziel]);

  // Ortssuche — nur auf Enter oder Knopfdruck, nie beim Tippen (Nominatims
  // Nutzungsbedingungen: höchstens eine Anfrage je Sekunde). Der Kopf, der im
  // Browser verboten ist und still verworfen würde, wird bewusst NICHT gesetzt.
  const ortSuchen = async () => {
    const q = ort.trim();
    if (!q || sucht) return;
    setSucht(true);
    try {
      const r = await fetch(NOMINATIM + encodeURIComponent(q), { headers: { "Accept-Language": "de" } });
      setTreffer(bkOrtstreffer(await r.json()));
    } catch { setTreffer([]); }
    finally { setSucht(false); }
  };
  const hinspringen = (t) => {
    setTreffer([]); setOrt(t.name);
    if (karte.current) karte.current.setView([t.lat, t.lon], 16);
  };
  const zumStandort = async () => {
    const p = await einmalPosition();
    if (p && karte.current) karte.current.setView([p.lat, p.lon], 17);
  };

  return (
    <div className="bk-karte-huelle" style={{ height: hoehe }}>
      <style>{CSS}</style>
      <div className="bk-karte-suche">
        <input value={ort} placeholder="Ort, Straße, PLZ …" onChange={(e) => setOrt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ortSuchen(); } }} />
        <button type="button" className="btn btn-sm" disabled={sucht} onClick={ortSuchen} title="Ort suchen">{sucht ? "…" : "🔍"}</button>
        <button type="button" className="btn btn-sm" onClick={zumStandort} title="Auf meinen Standort">◎</button>
      </div>
      {treffer.length > 0 && (
        <div className="bk-treffer">
          {treffer.map((t, i) => <button key={i} type="button" className="btn btn-ghost btn-sm" onClick={() => hinspringen(t)}>{t.name}</button>)}
        </div>
      )}
      {setzModus && <div className="gbu-warn bk-karte-hinweis">Tippe auf die Karte, um die neue Position zu setzen.</div>}
      <div ref={behaelter} className="bk-karte" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
