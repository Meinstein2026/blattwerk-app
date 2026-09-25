// src/server/betriebsanweisung.mjs
// Fachmodul: Unterweisungsnachweis zur Betriebsanweisung Seilklettertechnik
// (Blattwerk/Arbeitsschutz/unterweisungen.json). Wird von server.mjs
// automatisch geladen (Ordner src/server/, `register`).
//
// Eigener, kleiner Store neben einweisungen.json (nicht darin: das
// Datenmodell der Geräteeinweisungen verlangt Hersteller/Typ/Seriennummer,
// das passt für ein Arbeitsverfahren nicht) — aber dasselbe Muster: additiv,
// If-Match beim Schreiben. Reihenfolge wie bei /api/nc/einweisungen/save:
// ERST das unterschriebene Protokoll (PDF) ablegen, DANN den Eintrag
// schreiben — scheitert die Datei, bleibt der Store unverändert, sonst
// stünde ein Nachweis in der Liste, zu dem es kein Protokoll gibt.
//
// ctx.appStoreAendern übernimmt Lesen/Ändern/Schreiben mit If-Match und
// einer Wiederholung bei 412 (server.mjs); der Kalendertermin läuft über
// dessen `danach`-Hook, damit er in derselben Antwort landet.
import { baUwEintragen, baUwFaelligkeiten, BA_UW_STORE, BA_UW_STORE_LEER, baUwNorm, baUwPruefen, baUwUid } from "../betriebsanweisung.js";
import { ewFaelligAm } from "../arbeitsschutz.js";
import { funktionWache } from "../mandant-server.mjs";

const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const htmlEsc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fehler = (res, e) => (e && e.code) ? res.status(e.code).json({ error: e.message }) : res.status(502).json({ error: String((e && e.message) || e) });

let ctxRef = null;

export function register(app, ctx) {
  ctxRef = ctx;
  const wache = funktionWache("betriebsanweisungen", ctx.mandantJetzt);

  app.post("/api/nc/unterweisungen", wache, async (req, res) => {
    try {
      const { server, user, pass } = ctx.ncBody(req);
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const { store } = await ctx.appStoreLesen(server, user, pass, BA_UW_STORE, BA_UW_STORE_LEER, baUwNorm);
      res.json(baUwNorm(store));
    } catch (e) { fehler(res, e); }
  });

  app.post("/api/nc/unterweisungen/save", wache, async (req, res) => {
    try {
      const b = ctx.ncBody(req);
      const { server, user, pass } = b;
      if (!server || !user || !pass) return res.status(400).json({ error: "Zugangsdaten fehlen" });
      const eintrag = b.eintrag && typeof b.eintrag === "object" ? b.eintrag : null;
      if (!eintrag) return res.status(400).json({ error: "Unterweisung fehlt" });
      const heute = heuteIso();
      // Validierung VOR jedem Zugriff: eine unvollständige Unterweisung soll
      // weder eine Datei noch einen Ordner hinterlassen.
      const mangel = baUwPruefen(eintrag, heute);
      if (mangel) return res.status(400).json({ error: mangel });
      if (!b.pdfBase64 || !b.dateiname) return res.status(400).json({ error: "Unterschriebenes Protokoll (PDF) fehlt" });

      const headers = { Authorization: ctx.authHeader(user, pass) };
      const base = ctx.ncFilesBase(server, user);
      await ctx.assertOrdner(base, headers);

      // 1. Protokoll ablegen — Jahresordner idempotent (405 = gibt es schon).
      const jahr = String(eintrag.datum).slice(0, 4);
      const dsafe = String(b.dateiname).replace(/[/\\]/g, "_");
      for (const dir of [ctx.AS_DIR, ctx.AS_DIR + "/Unterweisungen", `${ctx.AS_DIR}/Unterweisungen/${jahr}`]) {
        const mk = await fetch(base + dir, { method: "MKCOL", headers });
        if (mk.status !== 201 && mk.status !== 405) return res.status(502).json({ error: "Ordner anlegen: Status " + mk.status });
      }
      const up = await fetch(`${base}${ctx.AS_DIR}/Unterweisungen/${jahr}/${encodeURIComponent(dsafe)}`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/pdf" }, body: Buffer.from(b.pdfBase64, "base64"),
      });
      if (up.status !== 201 && up.status !== 204) return res.status(502).json({ error: "Protokoll ablegen: Status " + up.status });
      const ncPfad = `${ctx.ORDNER}/Arbeitsschutz/Unterweisungen/${jahr}/${dsafe}`;

      // 2. Store additiv aendern (Datei liegt bereits, s.o.).
      const erfasstVon = ctx.ssoUser(req) || String(b.erfasstVon || "");
      let neuLogin = null, neuJugendlich = false;
      await ctx.appStoreAendern(req, res, {
        pfad: BA_UW_STORE, leer: BA_UW_STORE_LEER, normalisieren: baUwNorm,
        aendern: (store) => {
          const ergebnis = baUwEintragen(store, eintrag, { heute, jetzt: new Date().toISOString(), erfasstVon });
          neuLogin = String(eintrag.login);
          neuJugendlich = !!eintrag.jugendlich;
          return ergebnis;
        },
        danach: async (ergebnis, creds) => {
          const faellig = ewFaelligAm(eintrag.datum, neuJugendlich);
          const kalender = await ctx.asTerminSchreiben(b, {
            uid: baUwUid(neuLogin),
            datum: faellig,
            titel: `Unterweisung fällig: Betriebsanweisung Seilklettertechnik — ${eintrag.name}`,
            text: `Letzte Unterweisung am ${eintrag.datum} durch ${eintrag.einweiser}. Wiederholung ` +
              `${neuJugendlich ? "halbjährlich (§ 29 Abs. 2 JArbSchG)" : "jährlich"}, spätestens ${faellig}.`,
          });
          if (!kalender.ok) console.error("[betriebsanweisung] Kalender:", kalender.grund);
          return { faellig, kalender, ncPfad };
        },
      });
    } catch (e) { fehler(res, e); }
  });
}

// ─── Erinnerung (Sammelmail aus server.mjs) ─────────────────────────────────

/** HTML-Abschnitt fuer die Sammelmail; leer, wenn nichts ansteht. Rein. */
export function betriebsanweisungErinnerungText(store, heute) {
  const faellig = baUwFaelligkeiten(store, heute);
  if (!faellig.length) return "";
  const zeile = (t) => (t < 0 ? `seit ${-t} Tag(en) abgelaufen` : t === 0 ? "läuft heute ab" : `läuft in ${t} Tag(en) ab`);
  const rows = faellig.map((f) =>
    `<li><b>Unterweisung Betriebsanweisung SKT</b> — ${htmlEsc(f.name)}: ${htmlEsc(zeile(f.tage))} (fällig ${htmlEsc(f.faellig)})</li>`).join("");
  return `<p style="margin:0 0 6px">Unterweisungen:</p><ul style="margin:0 0 12px;padding-left:20px">${rows}</ul>`;
}

/** Liest den Store mit den Zugangsdaten des Dienstkontos und liefert den Abschnitt. */
export async function betriebsanweisungErinnerungHtml(creds, heute) {
  if (!ctxRef || !creds) return "";
  try {
    const { store } = await ctxRef.appStoreLesen(creds.server, creds.user, creds.pass, BA_UW_STORE, BA_UW_STORE_LEER, baUwNorm);
    return betriebsanweisungErinnerungText(store, heute);
  } catch (e) {
    console.error("[betriebsanweisung] Erinnerung:", (e && e.message) || e);
    return "";
  }
}

/** Anzahl der fälligen Unterweisungen für den Mail-Betreff. */
export async function betriebsanweisungErinnerungAnzahl(creds, heute) {
  if (!ctxRef || !creds) return 0;
  try {
    const { store } = await ctxRef.appStoreLesen(creds.server, creds.user, creds.pass, BA_UW_STORE, BA_UW_STORE_LEER, baUwNorm);
    return baUwFaelligkeiten(store, heute).length;
  } catch (e) {
    console.error("[betriebsanweisung] Erinnerung:", (e && e.message) || e);
    return 0;
  }
}
