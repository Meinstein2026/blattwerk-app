// Überträgt den aktuellen Stand (HEAD) ins öffentliche Repo — ohne alles, was in
// .gitattributes als export-ignore steht, legt dort EINEN Commit an und pusht ihn.
//
//   npm run veroeffentlichen                 # prüfen, committen, pushen
//   npm run veroeffentlichen -- --ohne-push  # nur prüfen + lokal committen
//
// Zielordner: ../blattwerk-app-oeffentlich (Klon des öffentlichen Repos),
// abweichend per BW_OEFFENTLICH=<pfad>.
//
// Bricht ab, wenn der Export noch interne Daten enthält (VERBOTEN unten).
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ohnePush = process.argv.includes("--ohne-push");
const ziel = resolve(process.env.BW_OEFFENTLICH || process.argv.slice(2).find((a) => !a.startsWith("--")) || "../blattwerk-app-oeffentlich");
if (!existsSync(join(ziel, ".git"))) throw new Error(`Kein Git-Repo unter ${ziel} — öffentliches Repo dort klonen oder BW_OEFFENTLICH setzen.`);

// Generische Muster (keine Firmendaten) bleiben hier — private IP-Bereiche
// und Handynummern sind Formate, keine konkreten Betriebsgeheimnisse.
const GENERISCH = [
  /192\.168\.\d+\.\d+/, /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+/, /\b10\.\d+\.\d+\.\d+/,
  // Handynummern — nicht mitten in einer Hex-/Ziffernkette (false positive: OID-Konstante
  // in test/fahrtenbuch/zeitstempel.test.js) und nicht der eigene Platzhalter "0170 0000000".
  /(?<!\d)(?!0170 0000000)01[5-7]\d[\s/-]?\d{6,8}(?!\d)/,
];

// Firmenspezifische Muster (echte Hosts/Namen/Orte) stehen NICHT im Quelltext,
// sondern in einer Datei im separaten Betriebs-Repo — eine Regex pro Zeile,
// Leerzeilen/#-Kommentare werden übersprungen. Pfad per ENV BW_VERBOTEN
// überschreibbar (z. B. für einen anderen Checkout-Ort).
const verbotenDatei = process.env.BW_VERBOTEN || resolve(process.cwd(), "..", "blattwerk-betrieb", "verboten.txt");
if (!existsSync(verbotenDatei)) {
  throw new Error(
    `Muster-Datei fehlt: ${verbotenDatei}\n` +
    `Liegt das Betriebs-Repo woanders, den Pfad per ENV BW_VERBOTEN setzen.`
  );
}
const ausDatei = readFileSync(verbotenDatei, "utf8")
  .split("\n")
  .map((z) => z.trim())
  .filter((z) => z && !z.startsWith("#"))
  .map((z) => {
    const m = /^\/(.*)\/([a-z]*)$/.exec(z);
    if (!m) throw new Error(`Ungültige Zeile in ${verbotenDatei}: ${z} (erwartet /regex/flags)`);
    return new RegExp(m[1], m[2]);
  });
const VERBOTEN = [...GENERISCH, ...ausDatei];

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

if (sh("git status --porcelain")) throw new Error("Arbeitsverzeichnis nicht sauber — erst committen.");
const stand = sh("git rev-parse --short HEAD");

// 1. Export in ein Temp-Verzeichnis
const tmp = mkdtempSync(join(tmpdir(), "bw-export-"));
// tar ohne -C: Git-Bash-tar versteht keine Windows-Pfade, deshalb cwd=tmp
execSync(`git -C "${process.cwd()}" archive --format=tar HEAD | tar -x`, { cwd: tmp, stdio: "inherit", shell: true });

// 2. Prüfen, bevor irgendetwas im Ziel landet
// Echte Binärformate erst gar nicht als Text einlesen — Byte-Scan bringt dort
// nichts (ein Bild ist kein Text, egal welche Kodierung). Textformate, in
// denen ein Base64-Blob stecken könnte (.html/.js/...), werden ganz normal
// als Text gescannt, der Blob ist dort ohnehin schon Klartext.
const BINAER_ENDUNGEN = /\.(png|jpe?g|gif|ico|webp|pdf|apk|woff2?|ttf|eot|otf|zip|gz|tar|mp4|mp3|wasm)$/i;
const funde = [];
const pruefe = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { pruefe(p); continue; }
    const relPfad = p.slice(tmp.length + 1);
    // Dateiname/-pfad selbst ist ebenfalls ein moeglicher Fund (z. B. ein
    // interner Hostname als Verzeichnisname) — unabhaengig vom Inhalt.
    for (const re of VERBOTEN) {
      if (re.test(relPfad)) funde.push(`${relPfad} (Pfad/Dateiname)  ${re}`);
    }
    if (BINAER_ENDUNGEN.test(name)) continue;
    // UTF-8 statt latin1: sonst matchen Umlaut-Muster (z. B. /gie(ß|ss)enerland/i)
    // nie, weil jedes Mehrbyte-Zeichen als zwei falsche latin1-Zeichen ankommt.
    const text = readFileSync(p, "utf8");
    if (text.includes("\0")) continue; // sonstige Binärdatei ohne bekannte Endung
    text.split("\n").forEach((zeile, i) => {
      const m = VERBOTEN.find((re) => re.test(zeile));
      if (m) funde.push(`${relPfad}:${i + 1}  ${m}`);
    });
  }
};
pruefe(tmp);
if (funde.length) {
  rmSync(tmp, { recursive: true, force: true });
  console.error(`Abbruch — ${funde.length} interne Treffer im Export:\n` + funde.join("\n"));
  process.exit(1);
}

// Erst den öffentlichen Stand holen — der GitHub-Knopf oder ein anderer
// Rechner kann inzwischen veröffentlicht haben, sonst scheitert der Push.
if (!ohnePush) execSync("git pull -q --ff-only", { cwd: ziel, stdio: "inherit" });

// 3. Ziel ersetzen (außer .git) und committen
for (const name of readdirSync(ziel)) if (name !== ".git") rmSync(join(ziel, name), { recursive: true, force: true });
cpSync(tmp, ziel, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
sh("git add -A", ziel);
if (!sh("git status --porcelain", ziel)) { console.log("Keine Änderungen gegenüber dem öffentlichen Stand — nichts zu veröffentlichen."); process.exit(0); }
// Neutrale Commit-Identität statt der globalen Git-Config des Rechners, der
// den Export ausführt — sonst steht im öffentlichen Repo z. B. der echte
// Name/die echte Mailadresse des Betreibers. Ueberschreibbar (z. B. für ein
// echtes Projekt-Bot-Konto), Default ist bewusst neutral.
const autor = process.env.BW_PUBLIC_AUTHOR || "Blattwerk";
const mail = process.env.BW_PUBLIC_EMAIL || "noreply@users.noreply.github.com";
sh(`git -c user.name="${autor}" -c user.email="${mail}" commit -q -m "Stand ${stand}"`, ziel);
// Nachpruefen statt nur zu hoffen: author/committer koennten trotzdem auf ein
// verbotenes Muster treffen (z. B. wenn BW_PUBLIC_AUTHOR falsch gesetzt wurde).
const identitaet = sh("git log -1 --format=%an%n%ae%n%cn%n%ce", ziel).split("\n");
for (const feld of identitaet) {
  const m = VERBOTEN.find((re) => re.test(feld));
  if (m) throw new Error(`Commit-Autor/-Committer im öffentlichen Repo trifft ein verbotenes Muster: "${feld}" (${m})`);
}
console.log(`Commit „Stand ${stand}" im öffentlichen Repo angelegt (Autor: ${autor} <${mail}>).`);
if (ohnePush) { console.log(`Nicht gepusht (--ohne-push). Zum Veröffentlichen: git -C "${ziel}" push`); process.exit(0); }
execSync("git push", { cwd: ziel, stdio: "inherit" });
console.log("Veröffentlicht.");
