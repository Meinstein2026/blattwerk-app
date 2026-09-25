// Versionsauskunft und Übersicht über alle Instanzen (19.09.2026).
// Reine Logik, kein Netz, kein Dateizugriff — damit testbar.
//
// Jede Instanz (Blattwerk und jede befreundete Firma) meldet unter
// /api/version, welcher Stand läuft. Die Übersicht vergleicht das mit dem
// Soll (Stand der eigenen Instanz = Vorreiter) und zeigt, wer hinterherhängt.

const kurz = (c) => String(c || "").trim().slice(0, 7);

/** Auskunft einer Instanz. Bewusst ohne Adressen, Schlüssel oder Personen. */
export function versionInfo({ env = {}, pkgVersion = "", mandant = null, gestartet = "" } = {}) {
  // Coolify setzt SOURCE_COMMIT; GIT_COMMIT für Handbetrieb (docker build --build-arg).
  const commit = kurz(env.SOURCE_COMMIT || env.GIT_COMMIT) || "unbekannt";
  return { app: "blattwerk-app", version: String(pkgVersion || ""), commit, kuerzel: String(mandant?.kuerzel || ""), gestartet: String(gestartet || "") };
}

/** Liste aus instanzen.json prüfen: [{ name, url, art? }], art = "app" | "manifest". */
export function instanzenPruefen(roh) {
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((e) => e && typeof e.name === "string" && /^https?:\/\//i.test(String(e.url || "")))
    .map((e) => ({ name: e.name.trim(), url: String(e.url).replace(/\/+$/, ""), art: e.art === "manifest" ? "manifest" : "app" }));
}

/** Adresse, unter der die Version einer Instanz zu holen ist. */
export const versionUrl = (inst) => (inst.art === "manifest" ? `${inst.url}/manifest.json` : `${inst.url}/api/version`);

/** Antwort einer Instanz → Zeile der Übersicht. `soll` = Commit des Vorreiters. */
export function versionZeile(inst, antwort, soll) {
  if (!antwort || antwort.fehler) return { name: inst.name, art: inst.art, stand: "—", status: "nicht erreichbar", hinweis: String(antwort?.fehler || "") };
  if (inst.art === "manifest") {
    // Update-Manifeste der Android-Apps (apps.example.org/<app>/manifest.json).
    const v = antwort.versionName || antwort.version || "";
    return { name: inst.name, art: inst.art, stand: String(v || "?"), status: v ? "ok" : "unbekannt", hinweis: "" };
  }
  const stand = /^[0-9a-f]{7,40}$/i.test(String(antwort.commit || "")) ? kurz(antwort.commit) : "unbekannt";
  const status = stand === "unbekannt" ? "unbekannt" : stand === kurz(soll) ? "aktuell" : "veraltet";
  return { name: inst.name, art: inst.art, stand, status, hinweis: [antwort.kuerzel, antwort.gestartet && `seit ${antwort.gestartet}`].filter(Boolean).join(" · ") };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Schlichte HTML-Seite für den PC — bewusst ohne React, sie soll auch laufen, wenn die App kaputt ist. */
export function versionenHtml(zeilen, soll) {
  const farbe = { aktuell: "#2f9e44", ok: "#2f9e44", veraltet: "#e8590c", unbekannt: "#868e96", "nicht erreichbar": "#c92a2a" };
  const tr = zeilen.map((z) => `<tr><td>${esc(z.name)}</td><td><code>${esc(z.stand)}</code></td><td style="color:${farbe[z.status] || "#868e96"};font-weight:600">${esc(z.status)}</td><td>${esc(z.hinweis)}</td></tr>`).join("");
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Versionen</title>
<style>body{font:15px system-ui;margin:2rem auto;max-width:860px;padding:0 1rem;color-scheme:light dark}table{border-collapse:collapse;width:100%}td,th{padding:.5rem .6rem;border-bottom:1px solid #8884;text-align:left}</style>
<h1>Versionen</h1><p>Soll (diese Instanz): <code>${esc(kurz(soll) || "unbekannt")}</code></p>
<table><tr><th>Instanz</th><th>Stand</th><th>Status</th><th>Hinweis</th></tr>${tr}</table></html>`;
}
