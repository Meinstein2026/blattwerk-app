// Baumkataster — Server-Fachmodul (16.09.2026). Wird von server.mjs über
// register(app, ctx) eingehängt; importiert NICHTS aus server.mjs, damit es
// mit gefälschtem ctx in Vitest läuft (test/baumkataster/server.test.js).
//
// Ablage: Blattwerk/App/Baumkataster/<kundeId>.json (ein Store je Kunde),
//         Blattwerk/App/Baumkataster/index.json (Kundenliste, wird nach
//         jeder Änderung nachgezogen — der Kundenstore ist die Wahrheit),
//         Blattwerk/Baumkataster/<kundeId>/<nr>/<datum>-<kontrolleId>-<n>.jpg
//         (Fotos; die Kontroll-Id im Namen verhindert, dass zwei Kontrollen
//         desselben Baums mit demselben (frei änderbaren) Datum sich beim
//         Speichern gegenseitig die Fotodateien überschreiben).
// Schreiben: assertBlattwerk → MKCOL → lesen → ändern → PUT mit If-Match,
// eine Wiederholung bei 412 (Muster appStoreAendern in server.mjs; eigener
// Helfer, weil der Store danach noch für den Index gebraucht wird).
import {
  bkNormalisieren, bkIndexNormalisieren, bkIndexEintrag, bkHeute,
  bkBaumSpeichern, bkKontrolleEintragen, bkKontrolleGbuVerweisen, bkMassnahmeEintragen, bkMassnahmeErledigen,
  bkIstDatum, bkId,
} from "../baumkataster.js";
import { BK_STORE_LEER, BK_INDEX_LEER } from "../baumkataster-data.js";
import { funktionWache } from "../mandant-server.mjs";

export const BK_APP_UNTERORDNER = "Baumkataster";
// Fotos liegen im Ordner des Mandanten, nie fest unter Blattwerk. `ordnerUrl`
// ist bereits URL-kodiert (ctx.ORDNER_URL).
export const bkFotoDir = (ordnerUrl) => `${ordnerUrl}/Baumkataster`;

// Alles, was in einen Pfad wandert, wird geprüft statt umgeschrieben — ein
// Ersetzen von ".." kann selbst wieder ".." erzeugen (siehe dokSafe in server.mjs).
export const kundeIdSafe = (v) => (/^\d{1,10}$/.test(String(v ?? "").trim()) ? String(v).trim() : "");
export const baumNrSafe = (v) => (/^B-\d{4,6}$/.test(String(v || "")) ? String(v) : "");
export const fotoNameSafe = (v) => {
  const s = String(v || "").trim().slice(0, 120);
  if (/[/\\]/.test(s) || /^\.*$/.test(s) || !/\.(jpe?g|png|webp)$/i.test(s)) return "";
  return s;
};
/**
 * Idempotenzschlüssel eines Vorgangs (18.09.2026) — vom Client beim Einreihen
 * vergeben (`bkEinreihen`), über jede Wiederholung hinweg gleich. Landet bei
 * Kontrollen im Dateinamen der Fotos (Ruling R11), darum dieselbe strenge
 * Prüfung wie bei den anderen Pfadbausteinen: kein "/", kein "..", nur ein
 * überschaubares Alphabet. Ungültig oder fehlend → wie kein Schlüssel (Server
 * verhält sich dann wie vor diesem Umbau).
 */
export const vorgangIdSafe = (v) => (/^[A-Za-z0-9_-]{1,80}$/.test(String(v ?? "").trim()) ? String(v).trim() : "");
const fehlerMit = (code, text) => Object.assign(new Error(text), { code });

export function register(app, ctx) {
  const wache = funktionWache("baumkataster", ctx.mandantJetzt);
  const { ncBody, ssoUser, authHeader, ncFilesBase, assertOrdner, appStoreLesen, appStoreSchreiben } = ctx;
  // ctx.APP_DIR ist ein Getter auf den aktuellen Mandanten — je Anfrage lesen, nicht beim Start einfrieren.
  const storePfad = (kundeId) => `${ctx.APP_DIR}/${BK_APP_UNTERORDNER}/${kundeId}.json`;
  const indexPfad = () => `${ctx.APP_DIR}/${BK_APP_UNTERORDNER}/index.json`;

  const antwortFehler = (res, e) => {
    if (e?.code) return res.status(e.code).json({ error: e.message });
    return res.status(502).json({ error: String(e?.message || e) });
  };
  /** Zugangsdaten aus dem Body (bzw. Dienstkonto über ncBody); null + 400, wenn sie fehlen. */
  const zugang = (req, res) => {
    const b = ncBody(req);
    if (!b.server || !b.user || !b.pass) { res.status(400).json({ error: "Zugangsdaten fehlen" }); return null; }
    return b;
  };
  const wer = (req, b) => ssoUser(req) || String(b.login || "");

  async function ordnerSicherstellen(server, user, headers, pfade) {
    for (const dir of pfade) {
      const mk = await fetch(ncFilesBase(server, user) + dir, { method: "MKCOL", headers });
      if (mk.status !== 201 && mk.status !== 405) throw fehlerMit(502, `Ordner ${dir}: Status ${mk.status}`);
    }
  }

  async function storeAendern(b, kundeId, aendern) {
    const { server, user, pass } = b;
    const headers = { Authorization: authHeader(user, pass) };
    await assertOrdner(ncFilesBase(server, user), headers);
    await ordnerSicherstellen(server, user, headers, [ctx.APP_DIR, `${ctx.APP_DIR}/${BK_APP_UNTERORDNER}`]);
    let r, ergebnis;
    for (let versuch = 0; versuch < 2; versuch++) {
      const { store, etag } = await appStoreLesen(server, user, pass, storePfad(kundeId), BK_STORE_LEER, bkNormalisieren);
      try { ergebnis = aendern(store); } catch (e) { throw fehlerMit(400, String(e.message || e)); }
      r = await appStoreSchreiben(server, user, pass, storePfad(kundeId), ergebnis.store, etag);
      if (r.status !== 412) break;
    }
    if (r.status === 401) throw fehlerMit(401, "Anmeldung ungültig");
    if (r.status === 403) throw fehlerMit(403, "Kein Schreibrecht");
    if (r.status === 412) throw fehlerMit(409, "Gleichzeitige Änderung — bitte erneut versuchen");
    if (r.status !== 201 && r.status !== 204) throw fehlerMit(502, "Speichern: Status " + r.status);
    await indexNachziehen(b, kundeId, ergebnis.store);
    return ergebnis;
  }

  // Der Index ist eine Abkürzung für die Kundenliste, keine Wahrheit: scheitert
  // er, bleibt der Kundenstore trotzdem gespeichert — nur gemeldet, nicht geworfen.
  async function indexNachziehen(b, kundeId, store) {
    try {
      const { server, user, pass } = b;
      for (let versuch = 0; versuch < 2; versuch++) {
        const { store: idx, etag } = await appStoreLesen(server, user, pass, indexPfad(), BK_INDEX_LEER, bkIndexNormalisieren);
        const neu = { ...idx, kunden: { ...idx.kunden, [kundeId]: bkIndexEintrag(store, bkHeute()) } };
        const r = await appStoreSchreiben(server, user, pass, indexPfad(), neu, etag);
        if (r.status !== 412) return;
      }
      console.error("[baumkataster] Index: 412 auch nach Wiederholung");
    } catch (e) { console.error("[baumkataster] Index nachziehen:", e?.message || e); }
  }

  app.post("/api/nc/baumkataster/index", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const { store } = await appStoreLesen(b.server, b.user, b.pass, indexPfad(), BK_INDEX_LEER, bkIndexNormalisieren);
      res.json(store);
    } catch (e) { antwortFehler(res, e); }
  });

  app.post("/api/nc/baumkataster/kunde", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId);
      if (!kundeId) return res.status(400).json({ error: "Kunde fehlt" });
      const { store } = await appStoreLesen(b.server, b.user, b.pass, storePfad(kundeId), BK_STORE_LEER, bkNormalisieren);
      res.json(store);
    } catch (e) { antwortFehler(res, e); }
  });

  // Schreibende Endpunkte: Task 8 und 9.
  registerSchreiben(app, { zugang, antwortFehler, wer, storeAendern, ordnerSicherstellen, storePfad, ctx, wache });
}

function registerSchreiben(app, h) {
  const { zugang, antwortFehler, wer, storeAendern, wache } = h;

  app.post("/api/nc/baumkataster/baum/save", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId);
      if (!kundeId) return res.status(400).json({ error: "Kunde fehlt" });
      if (!b.baum || typeof b.baum !== "object") return res.status(400).json({ error: "Baum fehlt" });
      const login = wer(req, b);
      const vorgangId = vorgangIdSafe(b.vorgangId);
      const { store, baum } = await storeAendern(b, kundeId, (s) => {
        // Kundenkopf beim ersten Baum setzen, Name bei Bedarf nachziehen.
        const kunde = { id: Number(kundeId), name: String(b.kundeName || s.kunde.name || "").slice(0, 200) };
        return bkBaumSpeichern({ ...s, kunde }, { ...b.baum, vorgangId: vorgangId || undefined }, { login });
      });
      res.json({ ok: true, baum, store });
    } catch (e) { antwortFehler(res, e); }
  });

  app.post("/api/nc/baumkataster/massnahme/save", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId), nr = baumNrSafe(b.nr);
      if (!kundeId || !nr) return res.status(400).json({ error: "Kunde oder Baumnummer fehlt" });
      if (!b.massnahme || typeof b.massnahme !== "object") return res.status(400).json({ error: "Maßnahme fehlt" });
      const login = wer(req, b);
      // Idempotenz (18.09.2026): ohne eigene Id von b.massnahme wird die
      // Vorgangskennung zu ihrer Id — `bkMassnahmeEintragen` erkennt daran
      // eine Wiederholung (siehe dort) und legt sie kein zweites Mal an.
      const vorgangId = vorgangIdSafe(b.vorgangId);
      const massnahme = vorgangId && !b.massnahme.id ? { ...b.massnahme, id: vorgangId } : b.massnahme;
      const { store, massnahme: gespeichert } = await storeAendern(b, kundeId, (s) => bkMassnahmeEintragen(s, nr, massnahme, { login }));
      res.json({ ok: true, massnahme: gespeichert, store });
    } catch (e) { antwortFehler(res, e); }
  });

  app.post("/api/nc/baumkataster/massnahme/erledigt", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId), nr = baumNrSafe(b.nr);
      const massnahmeId = String(b.massnahmeId || "");
      if (!kundeId || !nr || !massnahmeId) return res.status(400).json({ error: "Kunde, Baumnummer oder Maßnahme fehlt" });
      const login = wer(req, b);
      const { store, massnahme } = await storeAendern(b, kundeId, (s) =>
        bkMassnahmeErledigen(s, nr, massnahmeId, { login, status: b.status || "erledigt", bemerkung: b.bemerkung }));
      res.json({ ok: true, massnahme, store });
    } catch (e) { antwortFehler(res, e); }
  });

  app.post("/api/nc/baumkataster/kontrolle/gbu", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId), nr = baumNrSafe(b.nr);
      if (!kundeId || !nr || !b.kontrolleId || !b.gbuId) return res.status(400).json({ error: "Kunde, Baumnummer, Kontrolle und GBU-Id sind Pflicht" });
      const { kontrolle } = await storeAendern(b, kundeId, (s) => bkKontrolleGbuVerweisen(s, nr, String(b.kontrolleId), String(b.gbuId)));
      res.json({ ok: true, kontrolle });
    } catch (e) { antwortFehler(res, e); }
  });

  registerKontrolle(app, h);
}

function registerKontrolle(app, h) {
  const { zugang, antwortFehler, wer, storeAendern, ordnerSicherstellen, ctx, wache } = h;
  const { authHeader, ncFilesBase, assertOrdner } = ctx;
  const fotoPfad = (kundeId, nr) => `${bkFotoDir(ctx.ORDNER_URL)}/${encodeURIComponent(kundeId)}/${encodeURIComponent(nr)}`;
  const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

  app.post("/api/nc/baumkataster/kontrolle/save", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId), nr = baumNrSafe(b.nr);
      if (!kundeId || !nr) return res.status(400).json({ error: "Kunde oder Baumnummer fehlt" });
      const k = b.kontrolle;
      if (!k || typeof k !== "object") return res.status(400).json({ error: "Kontrolle fehlt" });
      const fotos = Array.isArray(b.fotos) ? b.fotos : [];
      if (fotos.length > 10) return res.status(400).json({ error: "Höchstens 10 Fotos je Kontrolle" });
      const login = wer(req, b);
      const kontrolle = { ...k, kontrolleur: k.kontrolleur || login };
      // Kontroll-Id VOR der Foto-Schleife prägen: sie steckt gleich im
      // Dateinamen, damit zwei Kontrollen mit demselben (frei änderbaren)
      // Datum sich nicht die Fotos überschreiben (Ruling R11). Idempotenz
      // (18.09.2026): trägt der Vorgang eine Kennung, wird SIE die Kontroll-Id
      // — eine Wiederholung nach abgebrochener Verbindung prägt dieselbe Id
      // (und darum dieselben Fotodateinamen, siehe unten) und läuft weiter
      // unten in `bkKontrolleEintragen`s Idempotenz-Kurzschluss. Ohne Kennung
      // (Altbestand) verhält es sich wie bisher: jeder Versuch eine neue Id.
      const vorgangId = vorgangIdSafe(b.vorgangId);
      const kontrolleId = vorgangId || bkId("k");
      // ⚠️ Warnung für später (18.09.2026, bewusst NICHT behoben — heute
      // unerreichbar): der Dateiname ist `${datum}-${kontrolleId}-${n}.jpg`.
      // Wird `kontrolleId` aus einer client-seitig aufbewahrten `vorgangId`
      // gebildet (siehe oben) UND bekommt der Wizard-Entwurf irgendwann eine
      // Persistenz über einen App-Neustart hinweg (heute rein im
      // Arbeitsspeicher, siehe KontrolleWizard/BaumForm in
      // BaumkatasterPage.jsx), dann kann ein zweiter Versuch mit geändertem
      // `k.datum` (Kontrolldatum zwischen zwei Versuchen von Hand korrigiert)
      // unter NEUEN Dateinamen hochladen, während der deduplizierte
      // Store-Eintrag (siehe `bkKontrolleEintragen`s Idempotenz-Kurzschluss)
      // weiterhin auf die alten Dateinamen zeigt — verwaiste Fotos, kein
      // falscher Store. Wer Entwurfs-Persistenz nachrüstet: hier gegenlesen.

      // Vorprüfung gegen eine Attrappe: eine unvollständige Kontrolle soll
      // scheitern, BEVOR ein einziges Foto hochgeladen ist. Läuft weiter mit
      // id: undefined, damit sie die volle Validierung durchläuft statt in
      // den Idempotenz-Kurzschluss (schon vorhandene Id) zu fallen.
      try {
        bkKontrolleEintragen({ baeume: { [nr]: { nr, kontrollen: [], massnahmen: [] } } }, nr, { ...kontrolle, id: undefined }, { login });
      } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }

      // Alle Fotos VOR der ersten Upload validieren: verhindert verwaiste Dateien.
      const b64Array = [];
      for (let i = 0; i < fotos.length; i++) {
        const b64 = String(fotos[i]?.base64 || "").replace(/^data:[^,]*,/, "");
        if (!b64) return res.status(400).json({ error: `Foto ${i + 1} ist leer` });
        b64Array.push(b64);
      }

      // Datei VOR Store (wie einweisungen/save): scheitert ein Foto, wird
      // nichts eingetragen — sonst stünde eine Kontrolle mit Fotos in der
      // Liste, die es nicht gibt.
      const namen = [];
      if (fotos.length) {
        const { server, user, pass } = b;
        const headers = { Authorization: authHeader(user, pass) };
        await assertOrdner(ncFilesBase(server, user), headers);
        await ordnerSicherstellen(server, user, headers, [bkFotoDir(ctx.ORDNER_URL), `${bkFotoDir(ctx.ORDNER_URL)}/${encodeURIComponent(kundeId)}`, fotoPfad(kundeId, nr)]);
        const datum = bkIstDatum(kontrolle.datum) ? kontrolle.datum : bkHeute();
        for (let i = 0; i < b64Array.length; i++) {
          const name = `${datum}-${kontrolleId}-${i + 1}.jpg`;
          const up = await fetch(`${ncFilesBase(server, user)}${fotoPfad(kundeId, nr)}/${encodeURIComponent(name)}`, {
            method: "PUT", headers: { ...headers, "Content-Type": "image/jpeg" }, body: Buffer.from(b64Array[i], "base64"),
          });
          if (up.status !== 201 && up.status !== 204) return res.status(502).json({ error: `Foto ${i + 1} ablegen: Status ${up.status}` });
          namen.push(name);
        }
      }
      const { store, kontrolle: neu } = await storeAendern(b, kundeId, (s) => bkKontrolleEintragen(s, nr, { ...kontrolle, id: kontrolleId, fotos: namen }, { login }));
      res.json({ ok: true, kontrolle: neu, store });
    } catch (e) { antwortFehler(res, e); }
  });

  app.post("/api/nc/baumkataster/foto", wache, async (req, res) => {
    try {
      const b = zugang(req, res); if (!b) return;
      const kundeId = kundeIdSafe(b.kundeId), nr = baumNrSafe(b.nr), datei = fotoNameSafe(b.datei);
      if (!kundeId || !nr || !datei) return res.status(400).json({ error: "Kunde, Baumnummer oder Dateiname unbrauchbar" });
      const { server, user, pass } = b;
      const href = `${ncFilesBase(server, user)}${fotoPfad(kundeId, nr)}/${encodeURIComponent(datei)}`;
      const r = await fetch(href, { headers: { Authorization: authHeader(user, pass) } });
      if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
      if (r.status === 404) return res.status(404).json({ error: "Foto nicht gefunden" });
      if (!r.ok) return res.status(502).json({ error: "Status " + r.status });
      res.setHeader("Content-Type", MIME[datei.split(".").pop().toLowerCase()] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${datei}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { antwortFehler(res, e); }
  });
}
