// src/server/konto-gedaechtnis.mjs
// Fachmodul: Konto-Gedächtnis je Mandant (was diese Firma frueher gebucht
// hat — Lieferant/Artikel -> SKR03-Konto). Liegt serverseitig, damit ein
// neues Geraet vom ersten Beleg an denselben Vorschlag bekommt (vorher lag
// das nur in localStorage des jeweiligen Handys, blattwerk_konto_mem) und
// damit keine Firma aus den Buchungen einer anderen lernt: jeder Mandant
// bekommt ueber KONTO_DATEI eine eigene Datei, es gibt keine gemeinsame
// Ablage und keinen Parameter, mit dem ein Client eine fremde Datei waehlen
// koennte.
//
// Wird von server.mjs automatisch geladen (Ordner src/server/, `register`).
import fs from "fs";
import path from "path";

const LEER = { lieferant: {}, artikel: {} };

/** Liest das Gedächtnis einer Datei; fehlt sie oder ist sie kaputt, leer. */
export const gedaechtnisLesen = (datei) => {
  try {
    const d = JSON.parse(fs.readFileSync(datei, "utf8"));
    return { lieferant: d.lieferant || {}, artikel: d.artikel || {} };
  } catch (_) {
    return { lieferant: {}, artikel: {} };
  }
};

// Nur echte vierstellige SKR03-Konten merken — kein Fallback/Unsinn aus
// einem fehlerhaften Aufruf soll das Gedächtnis verfälschen.
const istKonto = (k) => /^\d{4}$/.test(String(k || ""));

/**
 * Merkt Lieferant->Konto und/oder Artikel->Konto in der Datei; 0600, damit
 * die Datei (liegt unter /data, kein git-crypt) nicht von anderen lesbar ist.
 */
export const gedaechtnisMerken = (datei, { lieferant, artikel, konto } = {}) => {
  if (!istKonto(konto)) return gedaechtnisLesen(datei);
  const g = gedaechtnisLesen(datei);
  if (lieferant) g.lieferant[String(lieferant).trim().toLowerCase()] = konto;
  if (artikel) g.artikel[String(artikel).trim()] = konto;
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify(g, null, 2), { mode: 0o600 });
  // writeFileSync setzt den Modus nur beim NEUANLEGEN der Datei — bei einer
  // bereits bestehenden Datei (zweiter Merken-Aufruf) bleibt ihr alter Modus
  // sonst stehen. chmod danach macht 0600 in jedem Fall verlaesslich, nicht
  // nur beim ersten Schreiben.
  fs.chmodSync(datei, 0o600);
  return g;
};

const KONTO_DATEI_STANDARD = "/data/konten-gedaechtnis.json";

export const register = (app, ctx) => {
  const kontoDatei = process.env.KONTO_DATEI || KONTO_DATEI_STANDARD;
  // Geschaeftsdaten (wer beliefert diese Firma, wie bucht sie) — nicht nur
  // der schreibende Endpunkt braucht einen erkannten Authentik-Nutzer,
  // sondern der GANZE Praefix: Authentik am Proxy ist nicht der einzige Weg
  // zum Port, genau dafuer prueft ssoUser() den vertrauenswuerdigen Proxy.
  // Ein Wächter auf dem Praefix statt je Route sorgt ausserdem dafuer, dass
  // ein kuenftiger dritter /api/konto/*-Endpunkt die Prüfung automatisch
  // erbt, statt sie erneut einzeln zu vergessen.
  app.use("/api/konto", (req, res, next) => {
    if (!ctx.ssoUser(req)) return res.status(403).json({ error: "kein Authentik-Nutzer erkennbar" });
    next();
  });
  app.get("/api/konto/gedaechtnis", (req, res) => {
    res.json(gedaechtnisLesen(kontoDatei));
  });
  app.post("/api/konto/gedaechtnis", (req, res) => {
    const { lieferant, artikel, konto } = req.body || {};
    res.json(gedaechtnisMerken(kontoDatei, { lieferant, artikel, konto }));
  });
};
