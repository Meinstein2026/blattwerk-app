// src/server/gbu-offline.mjs
// Fachmodul: Weitergabe der Vor-Ort-GBU an Kolleg:innen ohne dass jemand
// danach fragen muss (VSG 4.2/SVLFG B09 verlangen die Beurteilung EINSATZORT-
// BEZOGEN und VOR Ort einsehbar — ein Abgleich, der erst mit Netz laeuft,
// kommt zu spaet).
//
// Zwei Endpunkte, ein additiver Store (Blattwerk/App/gbu-beteiligte.json):
//  - POST /api/nc/gbu/beteiligte: traegt der Server bei jedem erfolgreichen
//    Paperless-Upload einer Beurteilung ein (submitGbuRecord ruft das direkt
//    im Anschluss auf). Kein neues Schema noetig, aber auch keine Nutzdaten
//    ausser dem, was fuer den Dateiverweis noetig ist (Dateiname/Pruefsumme/
//    Datum) plus die Login-Schluessel der Beteiligten.
//  - POST /api/nc/gbu/meine: ein Geraet zieht damit die Beurteilungen der
//    letzten 30 Tage, in denen der angemeldete Dolibarr-Login als Beteiligter
//    steht, mit Paperless-Dokument-Id (sofern der Consumer sie inzwischen
//    verarbeitet hat — plUpload liefert nur die Aufgaben-UUID zurueck, nie
//    die Dokument-Id, siehe ctx.plChecksumSuche).
//
// Reine Logik (Store-Form, 30-Tage-Fenster, Beteiligte bestimmen) steht in
// src/gbu-offline.js, von App UND diesem Modul importiert.
import { GBU_BETEILIGTE_STORE, GBU_BETEILIGTE_STORE_LEER, gbuBeteiligteNorm, gbuBeteiligtenEintragen, gbuMeineFilter } from "../gbu-offline.js";
import { funktionWache } from "../mandant-server.mjs";

// Browser und Server sollen denselben Kalendertag meinen; der Container laeuft
// in UTC (gleiches Muster wie qualifikationen.mjs).
const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const fehler = (res, e) => {
  if (e && e.code) return res.status(e.code).json({ error: e.message });
  return res.status(502).json({ error: String((e && e.message) || e) });
};

export function register(app, ctx) {
  const wache = funktionWache("gbu", ctx.mandantJetzt);
  app.post("/api/nc/gbu/beteiligte", wache, async (req, res) => {
    try {
      const b = ctx.ncBody(req);
      const { server, user, pass } = b;
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const filename = String(b.filename || "").trim();
      const sha256 = String(b.sha256 || "").trim();
      const datum = String(b.datum || "").trim();
      if (!filename || !sha256 || !datum) return res.status(400).json({ error: "unvollständige Angaben" });
      const beteiligte = [...new Set((Array.isArray(b.beteiligte) ? b.beteiligte : []).map((k) => String(k || "").trim()).filter(Boolean))];
      // Aushilfen ohne Dolibarr-Login (leeres key) fallen hier still raus —
      // fuer sie gibt es keinen Login, an den die App etwas zustellen koennte.
      // Niemand zum Benachrichtigen ist kein Fehler, nur nichts zu tun.
      if (!beteiligte.length) return res.json({ ok: true, uebersprungen: true });
      await ctx.appStoreAendern(req, res, {
        pfad: GBU_BETEILIGTE_STORE, leer: GBU_BETEILIGTE_STORE_LEER, normalisieren: gbuBeteiligteNorm,
        aendern: (store) => gbuBeteiligtenEintragen(store, { filename, sha256, datum, beteiligte }, heuteIso()),
      });
    } catch (e) { fehler(res, e); }
  });

  app.post("/api/nc/gbu/meine", wache, async (req, res) => {
    try {
      const b = ctx.ncBody(req);
      const { server, user, pass } = b;
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const login = String(b.login || "").trim();
      if (!login) return res.status(400).json({ error: "Login fehlt" });
      const { store: roh } = await ctx.appStoreLesen(server, user, pass, GBU_BETEILIGTE_STORE, GBU_BETEILIGTE_STORE_LEER, gbuBeteiligteNorm);
      const store = gbuBeteiligteNorm(roh);
      const treffer = gbuMeineFilter(store.eintraege, login, heuteIso(), 30);
      // Jede Pruefsumme einzeln und mit .catch(null): Paperless hat das
      // Dokument evtl. noch nicht verarbeitet (plUpload liefert nur die
      // Aufgaben-UUID) oder ist gerade nicht erreichbar — das darf die
      // anderen Treffer dieser Antwort nicht mitreissen, das Geraet
      // versucht es beim naechsten Aufruf erneut.
      const eintraege = await Promise.all(treffer.map(async (e) => ({
        filename: e.filename, datum: e.datum,
        plId: (await ctx.plChecksumSuche(e.sha256).catch(() => null))?.id ?? null,
      })));
      res.json({ ok: true, eintraege });
    } catch (e) { fehler(res, e); }
  });
}
