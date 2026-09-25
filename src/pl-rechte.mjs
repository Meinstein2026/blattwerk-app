// Liegt bewusst NICHT in src/server/: der Auto-Loader dort erwartet register().
// Rechte-Wache fuer „Alle Dokumente" (thema=alle, Spec 2026-09-23). Die Liste zeigt
// die ganze Blattwerk-Ablage inklusive Bank/Steuer/Personal, deshalb serverseitig:
// Mandanten-Admin, Dolibarr-Admin (admin=1 oder Gruppe admins) oder eine Gruppe aus
// mandant.rechte.kachel_alleDokumente (Adminbereich, src/kacheln.js; "*" = alle).
// Im Zweifel (Dolibarr nicht erreichbar, kein Schluessel hinterlegt) 403, nie durchlassen.
import { PL_RECHT_ALLE_STANDARD } from "./paperless.js";

const norm = (v) => String(v || "").trim().toLowerCase();
const ADMIN_GRUPPEN = ["admins", "admin", "administratoren"];

export const darfRecht = (gruppen, erlaubt) => {
  const liste = (erlaubt || []).map(norm);
  if (liste.includes("*")) return true;
  return (gruppen || []).map(norm).some((g) => liste.includes(g));
};

/** Dolibarr-Gruppen eines SSO-Nutzers ueber seinen hinterlegten Schluessel (SSO-Store), 5 min gemerkt. */
export function dolibarrGruppenLader({ fetchFn = fetch, storeLoad, jetzt = () => Date.now(), ttlMs = 5 * 60 * 1000 }) {
  const cache = new Map();
  return async (username) => {
    const k = norm(username);
    const c = cache.get(k);
    if (c && jetzt() - c.t < ttlMs) return c.wert;
    const eintrag = (storeLoad() || {})[username];
    if (!eintrag?.url || !eintrag?.key) return null;
    const kopf = { headers: { DOLAPIKEY: eintrag.key, Accept: "application/json" }, redirect: "manual" };
    const base = String(eintrag.url).replace(/\/+$/, "");
    const ri = await fetchFn(`${base}/api/index.php/users/info`, kopf);
    if (!ri.ok) return null;
    const u = await ri.json();
    const rg = await fetchFn(`${base}/api/index.php/users/${encodeURIComponent(u.id)}/groups`, kopf);
    const liste = rg.ok ? await rg.json() : [];
    const gruppen = (Array.isArray(liste) ? liste : []).map((g) => g?.name || g?.nom || g?.label).filter(Boolean);
    const wert = { admin: Number(u.admin) === 1, gruppen };
    cache.set(k, { t: jetzt(), wert });
    return wert;
  };
}

export function plAlleWache({ ssoUser, istMandantAdmin, gruppenLaden, rechte }) {
  return async (req, res, next) => {
    const name = ssoUser(req);
    if (name && istMandantAdmin(name)) return next();
    try {
      const info = name ? await gruppenLaden(name) : null;
      const erlaubt = rechte()?.kachel_alleDokumente || PL_RECHT_ALLE_STANDARD;
      if (info && (info.admin || info.gruppen.map(norm).some((g) => ADMIN_GRUPPEN.includes(g)) || darfRecht(info.gruppen, erlaubt))) {
        return next();
      }
    } catch (_) { /* unten 403 */ }
    res.status(403).json({ error: "Keine Berechtigung für alle Dokumente" });
  };
}
