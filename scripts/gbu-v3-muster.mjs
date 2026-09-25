// Muster-PDFs der v3-GBU zum Sichtvergleich mit dem Papierformular
// (Fotos MBKS-Kurs, 14.09.2026) und zur Abnahme "GBU-PDF auf ein Blatt"
// (../blattwerk-betrieb/docs/superpowers/specs/2026-09-17-gbu-pdf-ein-blatt-design.md).
// Aufruf: node scripts/gbu-v3-muster.mjs
// Schreibt ~/Downloads/gbu-v3-voll.pdf (Baumpflege + SKT, alle Blöcke, lange
// Freitexte, beide Unterschriften) und ~/Downloads/gbu-v3-klein.pdf
// (Heckenschnitt vom Boden, ohne Baumcheck). Die Karte ist hier EINE echte
// OSM-Kachel, nur für den vollen Fall (in Node gibt es kein Canvas; im
// Browser entsteht der 384-px-Ausschnitt mit Marker). Ohne Netz bleibt die
// Karte leer — dann steht dort der Offline-Text.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gbuNeuV3 } from "../src/gbu-data.js";
import { buildGbuPdf } from "../src/gbu-pdf.js";
import { tileXY } from "../src/gbu-automatik.js";

// ─── Voller Fall: Baumpflege + Zugang SKT, alle Blöcke, lange Freitexte ─────
export function musterVoll() {
  const r = gbuNeuV3({ userName: "Sebastian Vogel", heute: "2026-09-14" });
  Object.assign(r, {
    id: "gbu-1757830000000", createdAt: "2026-09-14T05:52:00.000Z",
    arbeitsart: "baumpflege", zugang: "skt", kunde: { id: 42, name: "MBKS – SKT-A-Kurs" }, projekt: { id: 7, ref: "PJ2609-017", title: "SKT-A Kurs Wiesbaden" },
    baum: "Eichen und Buchen am Schloss Freudenberg", arbeiten: ["Totholzentnahme", "Kronenpflege"], anzahlOffen: true, zeitrahmenStunden: 8,
    personal: [
      { key: "sz", name: "Sebastian Vogel", mobil: "0170 0000000", quals: ["SKT B"] },
      { key: "max", name: "Max Muster", mobil: "0170 0000000", quals: ["SKT A"] },
    ],
    wetter: { windKmh: 12, boenKmh: 31, niederschlagMm: 0, zeit: "2026-09-14T07:45", quelle: "open-meteo" },
    automatik: {
      "kopf.datum": "auto", "kopf.einsatzort": "auto", "kopf.strasse": "geaendert", "kopf.mobil": "auto", "kopf.netz": "auto", "kopf.aufsicht": "auto", "kopf.gps": "auto",
      "baustelle.witterung": "auto", "baustelle.dauer": "auto", "baustelle.stromleitung": "auto", "baustelle.verkehrssicherung": "auto",
      "material.psaDoppelt": "auto", "material.rettungsmaterial": "auto", "material.ersteHilfe": "auto", "personalcheck.erfahrung": "auto",
      "baumcheck.krone": "auto", "baumcheck.stamm": "auto", "baumcheck.wurzel": "auto", "baumcheck.gesundheit": "auto", "baumcheck.standsicherheit": "auto",
    },
    aufsichtAbweichung: null,
    katasterBaum: { kundeId: "42", nr: "B-0007", kontrolleId: "k-2026-08" },
  });
  Object.assign(r.kopf, {
    datumBis: "2026-09-18", einsatzort: "Wiesbaden Dotzheim", strasse: "Freudenbergstraße 224–226", standort: "Schloss Freudenberg, Wald hinter dem Parkplatz, Zufahrt Ludwig-Erhard-Straße",
    festnetz: "", mobil: ["0170 0000000", "0170 0000000"], netz: "ja", aufsicht: "Sebastian Vogel",
    gps: { lat: 50.0745, lon: 8.2101, genauigkeitM: 6, zeit: "2026-09-14T05:50:00.000Z" },
  });
  Object.assign(r.baustelle, {
    verkehrssicherung: "ja", witterung: "ja", kommunikation: "ja", funk: "nein", absperrungDurch: "MBKS", dauerVon: "08:00", dauerBis: "17:00",
    stromleitung: "nein", stromleitungText: "keine",
    sonstigeGefahren: "Jugendgruppen, Spaziergänger mit Hunden im Einfahrtsbereich",
    sonstigeGefahrenChips: ["Fallbereich für Schnittgut gesichert", "Ankerpunkt tragfähig gewählt (Baumansprache!)"],
    fallbereichFrei: "ja", abseiltechniken: "ja", artAbsperrung: "Schilder, Bodenpersonal",
  });
  Object.assign(r.baumcheck, {
    krone: "gut, etwas Totholz im oberen Kronenbereich, weitere Kontrolle nach dem Schnitt empfohlen",
    stamm: "gut, keine Höhlungen oder Pilzkonsolen sichtbar", wurzel: "gut, keine Auffälligkeiten im Wurzelanlauf erkennbar",
    gesundheit: "vital", standsicherheit: "gegeben",
    befund: { umfeld: [], wurzel: [], stammfuss: [], stamm: [], krone: ["Totholz > 5 cm"] },
  });
  Object.assign(r.material, { psaDoppelt: "ja", abseilmaterial: "nein", rettungsmaterial: "ja", ersteHilfe: "ja", sonstiges: "", offeneFristen: [] });
  Object.assign(r.personalcheck, { auftragBesprochen: "ja", erfahrung: "ja", kommunikation: "ja", rettung: "ja", erfahrungFehlt: [] });
  Object.assign(r.freigabe, {
    baumSicher: "ja",
    einschraenkungen: "Abseilmaterial nachholen, bis dahin nur Totholz ohne Rigging; bei aufkommendem Wind über 40 km/h Kronenarbeit abbrechen",
  });
  r.sigDurchfuehrender = SIG; r.sigZweitePerson = SIG; r.zweitePersonName = "Max Muster";
  return r;
}

// ─── Kleiner Fall: Heckenschnitt vom Boden, ohne Baumcheck ──────────────────
export function musterKlein() {
  const r = gbuNeuV3({ userName: "Max Muster", heute: "2026-09-17" });
  Object.assign(r, {
    id: "gbu-1758100000000", createdAt: "2026-09-17T07:10:00.000Z",
    arbeitsart: "hecke", zugang: "boden", kunde: { id: 12, name: "Gärtnerei Sonnenhof" }, projekt: { id: 3, ref: "PJ2609-031", title: "Heckenpflege Herbst" },
    baum: "", arbeiten: [], anzahlOffen: false, zeitrahmenStunden: 3,
    personal: [{ key: "l", name: "Max Muster", mobil: "0170 0000000", quals: [] }],
    wetter: { windKmh: 8, boenKmh: 14, niederschlagMm: 0, zeit: "2026-09-17T07:00", quelle: "open-meteo" },
    automatik: { "kopf.netz": "auto", "baustelle.witterung": "auto" },
  });
  Object.assign(r.kopf, {
    einsatzort: "Musterstadt Musterviertel", strasse: "Am Sonnenhof 4", standort: "Gärtnerei, Einfahrt links",
    festnetz: "", mobil: ["0170 0000000"], netz: "ja", aufsicht: "Max Muster",
    gps: { lat: 50.5432, lon: 8.6811, genauigkeitM: 8, zeit: "2026-09-17T07:08:00.000Z" }, karte: null,
  });
  Object.assign(r.baustelle, {
    verkehrssicherung: "nein", witterung: "ja", kommunikation: "ja", funk: "nein", absperrungDurch: "",
    dauerVon: "07:30", dauerBis: "10:30", stromleitung: "nein", stromleitungText: "",
    sonstigeGefahren: "", sonstigeGefahrenChips: [], artAbsperrung: "",
  });
  Object.assign(r.material, { ersteHilfe: "ja", funkGeprueft: "nein", sonstiges: "" });
  Object.assign(r.personalcheck, { auftragBesprochen: "ja", kommunikation: "ja", erfahrung: "ja", rettung: "ja", erfahrungFehlt: [] });
  Object.assign(r.freigabe, { einschraenkungen: "" });
  r.sigDurchfuehrender = SIG;
  return r;
}

// 1x1-PNG als Unterschrift-Attrappe — reicht für Sichtprüfung von Größe/Position.
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function schreiben(name, record) {
  const pdf = await buildGbuPdf(record);
  const ziel = path.join(os.homedir(), "Downloads", name);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, Buffer.from(pdf, "base64"));
  console.log("geschrieben:", ziel, `(${Math.round(pdf.length * 0.75 / 1024)} KB)`);
}

// Nur beim direkten Aufruf ausführen, nicht beim Import aus dem Test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const voll = musterVoll();
  // Genau eine echte OSM-Kachel laden — nur für den vollen Fall.
  try {
    const { x, y } = tileXY(voll.kopf.gps.lat, voll.kopf.gps.lon, 17);
    const res = await fetch(`https://tile.openstreetmap.org/17/${x}/${y}.png`, { headers: { "User-Agent": "Blattwerk-App (Muster-PDF)" } });
    if (!res.ok) throw new Error(String(res.status));
    voll.kopf.karte = "data:image/png;base64," + Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (e) {
    console.warn("Karte nicht geladen (", e?.message || e, ") — Offline-Text im PDF.");
    voll.kopf.karte = null;
  }
  await schreiben("gbu-v3-voll.pdf", voll);
  await schreiben("gbu-v3-klein.pdf", musterKlein());
}
