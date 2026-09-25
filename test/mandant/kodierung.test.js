// test/mandant/kodierung.test.js
// Regressionstest gegen doppelte URL-Kodierung des Firmenordners (Fix Round 2,
// 2026-09-18).
//
// ordnerUrl()/AS_DIR()/APP_DIR()/UEB_DIR() liefern bereits mit
// encodeURIComponent kodierte Segmente. An sechs Stellen lief zusaetzlich der
// alte Helfer ncPfad() darueber (server.mjs: einweisungen/save,
// appStoreAendern, ueberlassungen/save, tutorial/save; qualifikationen.mjs:
// Nachweis-Ordnerkette, App-Ordner). Fuer "Blattwerk" ist das ein Nulleffekt
// (keine Sonderzeichen) — deshalb blieb es in allen bisherigen Tests
// unbemerkt. Fuer einen Firmennamen mit Leerzeichen/Umlaut wurde aus
// "Baum%20M%C3%BCller" ein "Baum%2520M%25C3%25BCller": die MKCOL-Kette legte
// einen FALSCHEN Ordner an, der nachfolgende (korrekt einfach kodierte) PUT
// fand seinen Elternordner nicht mehr — 502.
//
// Ein Textmuster im Quelltext (wie zuvor in test/ueberlassung/ablage.test.js)
// haette diese Klasse Fehler nie gefunden: `ncPfad(dir)` stand im Quelltext,
// war aber falsch angewandt. Deshalb hier ein ECHTER Lauf: server.mjs wird
// mit einem Mandanten geladen, dessen Name Leerzeichen UND Umlaut enthaelt
// ("Baum Müller GbR"), gegen eine Mock-WebDAV, und es werden die
// TATSAECHLICH angefragten URLs geprueft.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { UEB_PFLICHTEN } from "../../src/ueberlassung.js";

// MANDANT_DATEI wird von server.mjs nur EINMAL beim Modul-Import gelesen
// (mandantHandler-Singleton) — deshalb muss die Umgebungsvariable VOR dem
// Import stehen. Vitest isoliert jede Testdatei in einem eigenen Modul-
// Graphen, andere Testdateien (die "Blattwerk" ohne eigene mandant.json
// laden) sind davon nicht betroffen.
const MANDANT_DATEI = path.join(os.tmpdir(), `mandant-kodierung-${process.pid}-${Date.now()}.json`);
const XY = {
  kuerzel: "xy",
  name: "Baum Müller GbR",
  nextcloud: { ordner: "Baum Müller" },
  bloecke: { erp: true, belege: true, fahrtenbuch: true, chat: true, arbeitsschutz: true, kalender: true, telefon: true },
  // ueberlassung ist fuer einen fremden Mandanten per Vorbelegung AUS
  // (src/funktionen.js, standardFremd: false) — dieser Test prueft die
  // URL-Kodierung von /api/nc/ueberlassungen/save, nicht die Funktions-Wache
  // (die hat test/mandant/funktionen-server.test.js), deshalb hier an.
  funktionen: { ueberlassung: true },
  dienste: { dolibarr: "https://x.example", nextcloud: "https://nc.example", matrix: "https://m.example", updates: "" },
};
fs.writeFileSync(MANDANT_DATEI, JSON.stringify(XY));
process.env.MANDANT_DATEI = MANDANT_DATEI;

const { app } = await import("../../server.mjs");

// Mock-WebDAV: MKCOL/PUT/PROPFIND -> 201 (idempotent anlegen/schreiben
// gelingt immer), GET -> 404 (Store-Dateien existieren noch nicht — das ist
// der reguläre "leerer Anfang"-Weg in appStoreLesen/qualifikationen.mjs, ein
// leeres 201-Body wäre dagegen kein gültiges JSON und würde faelschlich als
// "Datei unlesbar" (409) durchschlagen).
let davServer, davBase;
let appServer, appBase;
let protokoll = [];

beforeAll(async () => {
  davServer = http.createServer((req, res) => {
    protokoll.push(`${req.method} ${req.url}`);
    if (req.method === "GET") { res.writeHead(404); return res.end(); }
    res.writeHead(201);
    res.end();
  });
  await new Promise((resolve) => davServer.listen(0, "127.0.0.1", resolve));
  davBase = `http://127.0.0.1:${davServer.address().port}`;

  // Express-Apps sind ein gueltiger http.RequestListener — ein eigener
  // Server reicht, kein app.listen() aus server.mjs noetig (das laeuft
  // wegen process.env.VITEST ohnehin nicht).
  appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  appBase = `http://127.0.0.1:${appServer.address().port}`;
});

afterEach(() => { protokoll = []; });

afterAll(async () => {
  await new Promise((resolve) => davServer.close(resolve));
  await new Promise((resolve) => appServer.close(resolve));
  try { fs.unlinkSync(MANDANT_DATEI); } catch {}
});

async function post(pfad, body) {
  const r = await fetch(`${appBase}${pfad}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

/**
 * Jede angefragte URL muss GENAU EINFACH kodiert sein: das Ordnersegment
 * "Baum%20M%C3%BCller" muss vorkommen, und "%25" (das kodierte "%") darf
 * NICHT vorkommen — "%25" ist der Fingerabdruck einer doppelten Kodierung
 * (encodeURIComponent("%") === "%25").
 */
const einfachKodiert = (zeilen) => {
  expect(zeilen.length).toBeGreaterThan(0);
  for (const z of zeilen) {
    expect(z).toContain("Baum%20M%C3%BCller");
    expect(z).not.toMatch(/%25/);
  }
};

describe("Firmenordner: keine doppelte URL-Kodierung (Fix Round 2)", () => {
  it("ueberlassungen/save: MKCOL-Kette UND PUT treffen denselben, einfach kodierten Ordner", async () => {
    const vereinbarung = {
      id: "u1", fahrzeugId: "fiat", fahrzeug: "Fiat Ducato", name: "Max Extern",
      anschrift: "Hauptstr. 1", geburtsdatum: "1990-05-04", verhaeltnis: "extern",
      fsKlasse: "B", fsNummer: "J1", fsGesehenAm: "2026-09-09", fsGesehenDurch: "Max",
      von: "2026-09-10", bis: "", unbefristet: true, selbstbeteiligung: 500,
      pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, true])),
    };
    const { status } = await post("/api/nc/ueberlassungen/save", {
      server: davBase, user: "xy-app", pass: "geheim",
      vereinbarung, pdfBase64: Buffer.from("x").toString("base64"), dateiname: "vereinbarung.pdf",
    });
    expect(status).toBe(200);
    const mkcols = protokoll.filter((z) => z.startsWith("MKCOL"));
    const puts = protokoll.filter((z) => z.startsWith("PUT"));
    einfachKodiert(mkcols);
    einfachKodiert(puts);
    // Vor Fix Round 2 lag der PUT unter ".../Baum%20M%C3%BCller/..." (einfach
    // kodiert, korrekt), waehrend MKCOL unter
    // ".../Baum%2520M%25C3%25BCller/..." lag (doppelt kodiert) — zwei
    // VERSCHIEDENE Ordner. Jetzt muessen alle denselben Elternordner treffen.
    const putOrdner = puts[0].replace(/^PUT /, "").split("/").slice(0, -1).join("/");
    expect(mkcols.some((z) => z.endsWith(putOrdner))).toBe(true);
  });

  it("fahrtenbuch/save (APP_DIR-Speicher, appStoreAendern): MKCOL einfach kodiert", async () => {
    const { status } = await post("/api/nc/fahrtenbuch/save", {
      server: davBase, user: "xy-app", pass: "geheim", login: "max",
      fahrzeug: { id: "fiat", kennzeichen: "MU-ST 2001", name: "Fiat Ducato" },
    });
    expect(status).toBe(200);
    einfachKodiert(protokoll.filter((z) => z.startsWith("MKCOL")));
  });

  it("qualifikationen/save (Fachmodul über ctx.mandantJetzt()): Nachweis- UND App-Ordner einfach kodiert", async () => {
    const { status } = await post("/api/nc/qualifikationen/save", {
      server: davBase, user: "xy-app", pass: "geheim",
      personKey: "tom", person: { name: "Tom" },
      qual: { art: "erste-hilfe", seit: "2026-03-01" },
      nachweisBase64: Buffer.from("%PDF-1.4").toString("base64"), nachweisDateiname: "x.pdf",
    });
    expect(status).toBe(200);
    const mkcols = protokoll.filter((z) => z.startsWith("MKCOL"));
    // Zwei getrennte Ordnerketten: Arbeitsschutz/Qualifikationen/<Jahr> (Nachweis)
    // UND App (Store) — beide muessen einfach kodiert sein.
    expect(mkcols.some((z) => z.includes("/Arbeitsschutz/Qualifikationen"))).toBe(true);
    expect(mkcols.some((z) => z.endsWith("/App"))).toBe(true);
    einfachKodiert(mkcols);
  });
});
