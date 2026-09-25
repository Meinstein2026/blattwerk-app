// src/server/chat-hinterlegung.mjs
// Fachmodul: Firmen-Hinterlegung der Chat-Sicherheitsschlüssel
// (Blattwerk/App/chat-hinterlegung.json). Der Server sieht NUR Geheimtext —
// siehe src/chat/hinterlegung.js. Der Name kommt aus Authentik, nie vom Gerät.
import { HINTERLEGUNG_LEER, HINTERLEGUNG_STORE, hinterlegungEintragen, hinterlegungNorm, hinterlegungPruefen } from "../chat/hinterlegung.js";

export function register(app, ctx) {
  app.post("/api/nc/chat-hinterlegung", async (req, res) => {
    try {
      const b = req.body || {};
      const grund = hinterlegungPruefen(b);
      if (grund) return res.status(400).json({ error: grund });
      const eintrag = { userId: b.userId, deviceId: b.deviceId, chiffre: b.chiffre, login: ctx.ssoUser(req) || "", am: new Date().toISOString() };
      // Die Antwort trägt bewusst nicht den ganzen Store (fremde Geheimtexte).
      const still = { status: (c) => { res.status(c); return still; }, json: (o) => res.json(o && o.error ? o : { ok: true }) };
      await ctx.appStoreAendern(req, still, { pfad: HINTERLEGUNG_STORE, leer: HINTERLEGUNG_LEER, normalisieren: hinterlegungNorm, aendern: (s) => hinterlegungEintragen(s, eintrag) });
    } catch (e) { res.status(e?.code || 502).json({ error: String(e?.message || e) }); }
  });
}
