// src/server/qualifikationen.mjs
// Fachmodul: Qualifikations-Register (<Ordner>/App/qualifikationen.json,
// QUALI_STORE(mandant) in ../qualifikationen.js — Blattwerk bleibt
// "Blattwerk", ein fremder Mandant bekommt seinen eigenen Ordner).
//
// Wird von server.mjs automatisch geladen (Ordner src/server/, `register`).
// Alle Nextcloud-Helfer kommen ueber `ctx` — deshalb laesst sich der Handler
// in test/qualifikationen/ablage.test.js mit Attrappen wirklich ausfuehren.
//
// Reihenfolge im Speichern ist die Regel aus /api/nc/einweisungen/save:
// erst der Nachweis (PDF/Foto) in <Ordner>/Arbeitsschutz/Qualifikationen/
// <Jahr>/, dann der Store. Geht die Datei schief, wird nichts eingetragen —
// sonst stuende im Register eine Fortbildung ohne Beleg.
//
// Bewusst NICHT ctx.appStoreAendern: das antwortet selbst mit dem ganzen
// Store, und der Kalendertermin soll in dieselbe Antwort — deshalb hier die
// Lesen-Aendern-Schreiben-Schleife mit einer Wiederholung bei 412 von Hand,
// wortgleich zu appStoreAendern.
//
// Kalendertermin: es gibt ihn, sobald ein Ablaufdatum existiert — aus dem
// Katalog oder von der Bescheinigung (auch bei einer unbefristeten Art;
// ein auf der Bescheinigung stehendes Ablaufdatum ist eine echte Frist).
//
// ctxRef ist ein Singleton fuer den einen Serverprozess (qualiErinnerungHtml
// braucht ihn ausserhalb des Request-Handlers); Tests rufen register() bei
// jedem aufbau() erneut auf und ersetzen ihn damit unschaedlich.
import {
  QUALI_STORE, QUALI_STORE_LEER, qualArt, qualDateiname, qualEintragen, qualErsthelferBedarf, qualFaelligkeiten,
  qualFehlende, qualGueltigBis, qualKeyOk, qualNorm, qualPruefen, qualUid,
} from "../qualifikationen.js";
import { funktionWache } from "../mandant-server.mjs";

/** Zugelassene Nachweis-Dateien; alles andere weist der Server ab. */
const NACHWEIS_TYP = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
// Nachschlagen nur ueber hasOwnProperty: eine Endung "constructor" o.ae.
// darf nicht an Object.prototype vorbeischmuggeln (liefert sonst eine
// Funktion statt undefined und die Allowlist waere umgangen).
const nachweisTyp = (ext) => (Object.prototype.hasOwnProperty.call(NACHWEIS_TYP, ext) ? NACHWEIS_TYP[ext] : null);

// Browser und Server sollen denselben Kalendertag meinen; der Container
// laeuft in UTC, deshalb hier fest auf Europe/Berlin statt Systemzeit.
const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const htmlEsc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fehler = (res, e) => {
  if (e && e.code) return res.status(e.code).json({ error: e.message });
  return res.status(502).json({ error: String((e && e.message) || e) });
};

// Der bei register() gereichte ctx — qualiErinnerungHtml braucht ihn, um den
// Store aus dem Stundentakt in server.mjs heraus lesen zu koennen.
let ctxRef = null;

export function register(app, ctx) {
  ctxRef = ctx;
  const wache = funktionWache("qualifikationen", ctx.mandantJetzt);

  app.post("/api/nc/qualifikationen", wache, async (req, res) => {
    try {
      const { server, user, pass } = ctx.ncBody(req);
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const { store: rawStore } = await ctx.appStoreLesen(server, user, pass, QUALI_STORE(ctx.mandantJetzt()), QUALI_STORE_LEER, qualNorm);
      const store = qualNorm(rawStore);
      res.json(store);
    } catch (e) { fehler(res, e); }
  });

  app.post("/api/nc/qualifikationen/save", wache, async (req, res) => {
    try {
      const b = ctx.ncBody(req);
      const { server, user, pass } = b;
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const key = String(b.personKey || "").trim();
      if (!qualKeyOk(key)) return res.status(400).json({ error: "Schlüssel der Person unbrauchbar" });
      const person = b.person && typeof b.person === "object" ? b.person : null;
      const qual = b.qual && typeof b.qual === "object" ? { ...b.qual } : null;
      if (qual) {
        // Nur der Server setzt nachweis (nach erfolgreichem PUT weiter unten) —
        // ein mitgeschicktes qual.nachweis vom Client wird nie uebernommen.
        delete qual.nachweis;
        // Getrimmt PRUEFEN und speichern, sonst passiert " 2026-03-01" die
        // Zukunfts-Pruefung und landet als Ordner "Qualifikationen/ 202/".
        qual.seit = String(qual.seit ?? "").trim();
        qual.gueltigBis = qual.gueltigBis ? String(qual.gueltigBis).trim() : qual.gueltigBis;
      }
      if (!person && !qual) return res.status(400).json({ error: "Es gibt nichts einzutragen" });
      if (!qual && b.nachweisBase64) return res.status(400).json({ error: "Nachweis ohne Fortbildung" });
      const heute = heuteIso();
      // Validierung VOR jedem Zugriff: eine kaputte Fortbildung soll keine
      // Datei hinterlassen.
      if (qual) {
        const f = qualPruefen(qual, heute);
        if (f) return res.status(400).json({ error: f });
      }
      let typ = null, ext = "";
      if (qual && b.nachweisBase64) {
        ext = String(b.nachweisDateiname || "").split(".").pop().toLowerCase();
        typ = nachweisTyp(ext);
        if (!typ) return res.status(400).json({ error: "Nachweis nur als PDF, JPG oder PNG" });
      }

      const headers = { Authorization: ctx.authHeader(user, pass) };
      const base = ctx.ncFilesBase(server, user);
      await ctx.assertOrdner(base, headers);

      // 1. Nachweis ablegen — Jahresordner idempotent (405 = gibt es schon).
      // ctx.AS_DIR ist bereits URL-kodiert (Getter auf AS_DIR() in
      // server.mjs) — NICHT nochmal durch ctx.ncPfad() schicken, sonst wird
      // aus einem Ordnernamen mit Leerzeichen/Umlaut ein doppelt kodierter,
      // falscher Ordner angelegt (Fix Round 2, 2026-09-18).
      if (typ) {
        const jahr = qual.seit.slice(0, 4);
        const dsafe = qualDateiname(qual, key, ext);
        for (const dir of [ctx.AS_DIR, ctx.AS_DIR + "/Qualifikationen", `${ctx.AS_DIR}/Qualifikationen/${jahr}`]) {
          const mk = await fetch(base + dir, { method: "MKCOL", headers });
          if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + mk.status });
        }
        const up = await fetch(`${base}${ctx.AS_DIR}/Qualifikationen/${jahr}/${encodeURIComponent(dsafe)}`, {
          method: "PUT", headers: { ...headers, "Content-Type": typ }, body: Buffer.from(b.nachweisBase64, "base64"),
        });
        if (up.status !== 201 && up.status !== 204) return res.status(502).json({ error: "Nachweis ablegen: Status " + up.status });
        qual.nachweis = `Qualifikationen/${jahr}/${dsafe}`;
      }

      // 2. Store: lesen, additiv aendern, mit If-Match schreiben. ctx.APP_DIR
      // ist ebenfalls bereits kodiert (siehe oben).
      const mkApp = await fetch(base + ctx.APP_DIR, { method: "MKCOL", headers });
      if (mkApp.status !== 201 && mkApp.status !== 405) return res.status(502).json({ error: "Ordner App: Status " + mkApp.status });
      // jetzt ist ein Zeitstempel (nicht nur ein Datum) fuer den
      // Gleichstands-Tiebreak in qualLetzte, wenn zwei Eintraege dasselbe
      // "seit" haben.
      const meta = { heute, jetzt: new Date().toISOString(), erfasstVon: ctx.ssoUser(req) || String(b.erfasstVon || "") };
      const storePfad = QUALI_STORE(ctx.mandantJetzt());
      let versuch = 0, r, ergebnis;
      while (versuch < 2) {
        const { store, etag } = await ctx.appStoreLesen(server, user, pass, storePfad, QUALI_STORE_LEER, qualNorm);
        try { ergebnis = qualEintragen(store, key, person, qual, meta); } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
        r = await ctx.appStoreSchreiben(server, user, pass, storePfad, ergebnis, etag);
        if (r.status !== 412) break;
        versuch++;
      }
      if (r.status === 401) return res.status(401).json({ error: "Anmeldung ungültig" });
      if (r.status === 403) return res.status(403).json({ error: "Kein Schreibrecht" });
      if (r.status === 412) return res.status(409).json({ error: "Gleichzeitige Änderung — bitte erneut versuchen" });
      if (r.status !== 201 && r.status !== 204) return res.status(502).json({ error: "Speichern: Status " + r.status });

      // 3. Kalendertermin — sobald ein Ablaufdatum existiert, feste UID
      // (Wiederholung ueberschreibt). Scheitert er, bleibt der Eintrag
      // trotzdem gueltig.
      const p = ergebnis.personen[key];
      const bis = qual ? qualGueltigBis(qual) : null;
      let kalender = null;
      if (qual && bis) {
        kalender = await ctx.asTerminSchreiben(b, {
          uid: qualUid(qual.art, key),
          datum: bis,
          titel: `Fortbildung fällig: ${qualArt(qual.art).label} — ${p.name}`,
          text: `Letzte Fortbildung am ${qual.seit}${qual.stelle ? ` bei ${qual.stelle}` : ""}. Gültig bis ${bis}.`,
        });
        if (!kalender.ok) console.error("[qualifikationen] Kalender:", kalender.grund);
      }
      res.json({ ok: true, person: p, bis, kalender, nachweis: (qual && qual.nachweis) || null });
    } catch (e) { fehler(res, e); }
  });
}

// ─── Erinnerung (Sammelmail aus server.mjs, Abschnitt „Fortbildungen") ──────

/**
 * HTML-Abschnitt fuer die Sammelmail; leer, wenn nichts ansteht. Rein.
 *
 * Drei unabhaengige Teile (Task 12, 18.09.2026): die bestehende
 * "Fortbildungen"-Liste (Ablauf/abgelaufen, unveraendert), dazu neu
 * "Fehlende Pflichtnachweise" (nie eingetragen, z. B. G 41 ohne SKT-Traeger)
 * und "Ersthelfer im Betrieb" (Betriebsquote nach § 26 DGUV Vorschrift 1).
 * Jeder Teil traegt sich selbst leer bei, wenn er nichts zu melden hat — die
 * fruehe Rueckgabe "" darf deshalb NICHT mehr allein an den Faelligkeiten
 * haengen, sonst wuerde eine fehlende Pflicht ohne jede Faelligkeit
 * (der Hauptfall dieser Aufgabe) die Mail nie erreichen.
 */
export function qualiErinnerungText(store, heute) {
  const teile = [];

  const faellig = qualFaelligkeiten(store, heute);
  if (faellig.length) {
    const zeile = (t) => (t < 0 ? `seit ${-t} Tag(en) abgelaufen` : t === 0 ? "läuft heute ab" : `läuft in ${t} Tag(en) ab`);
    const rows = faellig.map((f) =>
      `<li><b>${htmlEsc(f.label)}</b> — ${htmlEsc(f.name)}: ${htmlEsc(zeile(f.tage))} (gültig bis ${htmlEsc(f.bis)})</li>`).join("");
    teile.push(`<p style="margin:0 0 6px">Fortbildungen:</p><ul style="margin:0 0 12px;padding-left:20px">${rows}</ul>`);
  }

  const fehlend = qualFehlende(store, heute);
  if (fehlend.length) {
    const rows = fehlend.map((f) =>
      `<li><b>${htmlEsc((qualArt(f.art) && qualArt(f.art).label) || f.art)}</b> — ${htmlEsc(f.name)}: fehlt (${htmlEsc(f.grund)})</li>`).join("");
    teile.push(`<p style="margin:0 0 6px">Fehlende Pflichtnachweise:</p><ul style="margin:0 0 12px;padding-left:20px">${rows}</ul>`);
  }

  const bedarf = qualErsthelferBedarf(store, heute);
  if (bedarf.fehlt > 0) {
    teile.push(`<p style="margin:0 0 12px">Ersthelfer im Betrieb: ${bedarf.ist} von ${bedarf.soll}</p>`);
  }

  return teile.join("");
}

/**
 * Liest den Store mit den Zugangsdaten des Dienstkontos und liefert den
 * Abschnitt. Die Tagesmarke der Sammelmail (letzteErinnerung in
 * einweisungen.json) gilt mit — deshalb hier keine eigene.
 */
export async function qualiErinnerungHtml(creds, heute) {
  if (!ctxRef || !creds) return "";
  try {
    const { store } = await ctxRef.appStoreLesen(creds.server, creds.user, creds.pass, QUALI_STORE(ctxRef.mandantJetzt()), QUALI_STORE_LEER, qualNorm);
    return qualiErinnerungText(store, heute);
  } catch (e) {
    console.error("[qualifikationen] Erinnerung:", (e && e.message) || e);
    return "";
  }
}

/**
 * Anzahl der offenen Fristen fuer den Mail-Betreff — bislang zaehlte er nur
 * Einweisungen und Pruefungen, bei nur Fortbildungen faellig stand faelschlich
 * "0 offene Frist(en)" (16.09.2026). Eigener Lesevorgang statt Rueckgabewert
 * von qualiErinnerungHtml, um dessen bestehende Signatur (und die Tests
 * darauf) nicht anzufassen.
 *
 * Seit Task 12 (18.09.2026) zaehlt zusaetzlich, was qualiErinnerungText neu
 * zeigt — sonst wiederholt sich derselbe Fehler: eine fehlende Pflicht oder
 * eine Ersthelfer-Luecke ohne jede Faelligkeit stuende im Mailtext, aber der
 * Betreff meldete weiter "0 offene Frist(en)". Die Ersthelfer-Luecke zaehlt
 * als EIN offener Punkt, nicht als bedarf.fehlt einzelne — es ist eine
 * Betriebsquote, keine Liste einzelner Personen.
 */
export async function qualiErinnerungAnzahl(creds, heute) {
  if (!ctxRef || !creds) return 0;
  try {
    const { store } = await ctxRef.appStoreLesen(creds.server, creds.user, creds.pass, QUALI_STORE(ctxRef.mandantJetzt()), QUALI_STORE_LEER, qualNorm);
    const bedarf = qualErsthelferBedarf(store, heute);
    return qualFaelligkeiten(store, heute).length + qualFehlende(store, heute).length + (bedarf.fehlt > 0 ? 1 : 0);
  } catch (e) {
    console.error("[qualifikationen] Erinnerung:", (e && e.message) || e);
    return 0;
  }
}
