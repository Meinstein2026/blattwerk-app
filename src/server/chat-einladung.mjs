// src/server/chat-einladung.mjs
// Fachmodul: neue Blattwerk-Konten kommen von selbst in den Space „Blattwerk".
// Wer die App erreicht, ist über Authentik als Blattwerk-Konto ausgewiesen; der
// Server lädt GENAU dieses Konto ein (Matrix-Name = Authentik-Name, so baut MAS
// ihn) — mit dem Dienstkonto @blattwerk-app (ENV CHAT_EINLADER_TOKEN), das
// sonst nichts darf. Beitreten tut die App selbst (src/chat/client.js).
import { BLATTWERK_SPACE } from "../chat/logik.js";
import { CHAT_HOMESERVER } from "../chat/sitzung.js";

/** "" = darf eingeladen werden, sonst der Grund. Rein. */
export function einladungPruefen(userId, login, homeserver = CHAT_HOMESERVER) {
  const m = /^@([^:\s]+):(\S+)$/.exec(String(userId || ""));
  if (!login) return "kein Authentik-Nutzer erkennbar";
  if (!m || m[2] !== new URL(homeserver).host) return "Konto unbrauchbar";
  if (m[1] !== String(login).toLowerCase()) return "Konto gehört nicht zur Anmeldung";
  return "";
}

export function register(app, ctx) {
  app.post("/api/chat/einladen", async (req, res) => {
    try {
      const userId = String(req.body?.userId || ""), grund = einladungPruefen(userId, ctx.ssoUser(req));
      if (grund) return res.status(403).json({ error: grund });
      const token = process.env.CHAT_EINLADER_TOKEN;
      if (!token) return res.status(503).json({ error: "Einladen ist nicht eingerichtet" });
      const r = await fetch(`${CHAT_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(BLATTWERK_SPACE)}/invite`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }),
      });
      if (r.ok) return res.json({ ok: true });
      const f = await r.json().catch(() => ({}));
      // Schon drin oder schon eingeladen: für die App dasselbe wie Erfolg.
      if (r.status === 403 && /already (in the room|invited)/i.test(f.error || "")) return res.json({ ok: true, schon: true });
      res.status(502).json({ error: `Einladen: Status ${r.status}` });
    } catch (e) { res.status(502).json({ error: String(e?.message || e) }); }
  });
}
