// Abnahme der Fahrtenbuch-Prüfkette samt externem Zeitstempel — gegen den
// ECHTEN Zeitstempel-Dienst, aber mit einer Nextcloud-Attrappe als Ablage.
//
// Warum nicht gegen die echte Nextcloud: eine Testfahrt im Fahrtenbuch liesse
// sich nie wieder loeschen (nur stornieren), und sie wuerde die Kette
// fortschreiben. Die Attrappe spricht genau die WebDAV-Methoden, die
// server.mjs benutzt (PROPFIND, MKCOL, GET, PUT mit If-Match/If-None-Match) —
// der komplette Server-Weg laeuft also durch, nur die Ablage ist geliehen.
//
// Bewusst nicht Teil von `npm test`: braucht Netz und startet einen Prozess.
//   node test/fahrtenbuch/abnahme-stempel.mjs
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NC_PORT = 3098, APP_PORT = 3099;
const CREDS = { server: "http://127.0.0.1:" + NC_PORT, user: "testuser", pass: "geheim" };
const JSON_PFAD = "/Blattwerk/App/fahrtenbuch.json";
const dateien = new Map();   // Pfad -> Buffer
const etags = new Map();
let etagZaehler = 0;

// ─── Nextcloud-Attrappe ─────────────────────────────────────────────────────
const nc = http.createServer((req, res) => {
  const pfad = decodeURIComponent(req.url.replace("/remote.php/dav/files/" + CREDS.user, ""));
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (req.method === "PROPFIND") {
      if (pfad === "/Blattwerk/") return res.writeHead(207).end("<d:multistatus/>");
      const drin = [...dateien.keys()].filter((p) => p.startsWith(pfad.replace(/\/$/, "") + "/"));
      const eintraege = drin.map((p) =>
        "<d:response><d:href>/remote.php/dav/files/" + CREDS.user + p + "</d:href>"
        + "<d:propstat><d:prop><d:getcontentlength>" + dateien.get(p).length
        + "</d:getcontentlength></d:prop></d:propstat></d:response>").join("");
      const xml = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' + eintraege + "</d:multistatus>";
      return res.writeHead(207, { "Content-Type": "application/xml" }).end(xml);
    }
    if (req.method === "MKCOL") return res.writeHead(201).end();
    if (req.method === "GET") {
      if (!dateien.has(pfad)) return res.writeHead(404).end();
      return res.writeHead(200, { etag: etags.get(pfad) }).end(dateien.get(pfad));
    }
    if (req.method === "PUT") {
      if (req.headers["if-none-match"] === "*" && dateien.has(pfad)) return res.writeHead(412).end();
      if (req.headers["if-match"] && req.headers["if-match"] !== etags.get(pfad)) return res.writeHead(412).end();
      dateien.set(pfad, body);
      etags.set(pfad, '"e' + (++etagZaehler) + '"');
      return res.writeHead(201).end();
    }
    res.writeHead(405).end();
  });
});

// ─── Hilfen ─────────────────────────────────────────────────────────────────
const post = async (weg, nutzlast) => {
  const r = await fetch("http://127.0.0.1:" + APP_PORT + weg, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...CREDS, ...nutzlast }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const fahrt = (id, x = {}) => ({
  id, datum: "2026-09-12", zeitVon: "08:00", zeitBis: "08:40",
  start: "Musterstadt", ziel: "Gießen", kmBeginn: 1000, kmEnde: 1018,
  zweck: "Abnahme Prüfkette", typ: "betrieblich", fahrer: "max", fahrzeugId: "fiat", ...x,
});
let fehler = 0;
const pruefe = (name, bedingung, zusatz = "") => {
  console.log((bedingung ? "  ok    " : "FEHLER  ") + name + (zusatz ? " — " + zusatz : ""));
  if (!bedingung) fehler++;
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonStand = () => JSON.parse(dateien.get(JSON_PFAD) || "{}");
const tsrListe = () => [...dateien.keys()].filter((p) => p.endsWith(".tsr")).sort();

const serverStarten = async (env) => {
  const kind = spawn(process.execPath, ["server.mjs"],
    { env: { ...process.env, PORT: String(APP_PORT), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  kind.stderr.on("data", (d) => process.stderr.write("[server] " + d));
  for (let i = 0; i < 60; i++) {
    try { await fetch("http://127.0.0.1:" + APP_PORT + "/"); return kind; } catch { await warte(250); }
  }
  throw new Error("Server startet nicht");
};

// ─── Ablauf ─────────────────────────────────────────────────────────────────
await new Promise((r) => nc.listen(NC_PORT, r));
console.log("Nextcloud-Attrappe auf " + NC_PORT + "\n");
let server = await serverStarten({});

console.log("1) Zwei Fahrten eintragen, echter Stempel bei DigiCert");
const a = await post("/api/nc/fahrtenbuch/save", { login: "max", fahrt: fahrt("a") });
pruefe("erste Fahrt gespeichert", a.status === 200 && a.body.fahrten?.length === 1, "HTTP " + a.status);
pruefe("Kette steht bei 1", a.body.kette?.n === 1, "n=" + a.body.kette?.n);
pruefe("Kette rechnet auf", a.body.kettePruefung?.ok === true);
pruefe("extern gestempelt", a.body.stempel?.ok === true, a.body.stempel?.fehler || "");

const b = await post("/api/nc/fahrtenbuch/save", { login: "max", fahrt: fahrt("b", { kmBeginn: 1018, kmEnde: 1040 }) });
pruefe("zweite Fahrt gespeichert", b.status === 200 && b.body.fahrten?.length === 2);
pruefe("Kette steht bei 2", b.body.kette?.n === 2, "n=" + b.body.kette?.n);
pruefe("zweiter Stempel", b.body.stempel?.ok === true, b.body.stempel?.fehler || "");

console.log("\n2) Was liegt in der Ablage?");
const tsr = tsrListe();
pruefe("zwei .tsr neben der JSON", tsr.length === 2, tsr.join(", "));
pruefe("JSON enthaelt die Kette", jsonStand().kette?.n === 2);

console.log("\n3) openssl prueft den Stempel wie der Steuerpruefer");
const kette = jsonStand().kette;
const datei = path.join(os.tmpdir(), "abnahme.tsr");
fs.writeFileSync(datei, dateien.get(tsr[1]));
const ossl = (args) => execFileSync("openssl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const text = ossl(["ts", "-reply", "-in", datei, "-text"]);
pruefe("Stempel wurde erteilt", /Status: Granted/.test(text));
pruefe("Stempel traegt den Kettenhash", text.replace(/[^0-9a-f]/g, "").includes(kette.hash.slice(0, 32)));
console.log("        " + (text.match(/Time stamp: .*/) || [""])[0]);
try {
  const ca = ["/etc/ssl/certs/ca-certificates.crt", "C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt"]
    .find((p) => fs.existsSync(p));
  const v = ossl(["ts", "-verify", "-digest", kette.hash, "-in", datei, "-CAfile", ca]);
  pruefe("Signatur gegen die CA geprueft", /Verification: OK/.test(v));
} catch (e) {
  pruefe("Signatur gegen die CA geprueft", false, String(e.stderr || e.message).trim().split("\n").pop());
}

console.log("\n4) Laden meldet Kette und Stempelstand");
const laden = await post("/api/nc/fahrtenbuch", {});
pruefe("Kette intakt", laden.body.kettePruefung?.ok === true);
pruefe("Stempelstand = Kettenstand", laden.body.stempelStand?.nr === 2, JSON.stringify(laden.body.stempelStand));

console.log("\n5) Stiller Eingriff in die abgelegte JSON faellt auf");
const echt = dateien.get(JSON_PFAD);
const roh = jsonStand();
roh.fahrten[0].kmEnde = 1200;
dateien.set(JSON_PFAD, Buffer.from(JSON.stringify(roh)));
const manipuliert = await post("/api/nc/fahrtenbuch", {});
pruefe("Kette meldet Bruch", manipuliert.body.kettePruefung?.ok === false);
pruefe("Bruch beim ersten Vorgang", manipuliert.body.kettePruefung?.bruch === 1, "bruch=" + manipuliert.body.kettePruefung?.bruch);
dateien.set(JSON_PFAD, echt);

console.log("\n6) Faellt der Zeitstempel-Dienst aus, bleibt die Fahrt trotzdem");
server.kill(); await warte(500);
server = await serverStarten({ FB_TSA_URL: "http://127.0.0.1:3097/tot" });
const c = await post("/api/nc/fahrtenbuch/save", { login: "max", fahrt: fahrt("c", { kmBeginn: 1040, kmEnde: 1055 }) });
pruefe("Fahrt trotz totem Dienst gespeichert", c.status === 200 && c.body.fahrten?.length === 3);
pruefe("Kette ist fortgeschrieben", c.body.kette?.n === 3, "n=" + c.body.kette?.n);
pruefe("Stempel nennt den Grund", c.body.stempel?.ok === false && /ECONNREFUSED/.test(c.body.stempel?.fehler || ""), c.body.stempel?.fehler);
pruefe("kein halber Stempel abgelegt", tsrListe().length === 2);

server.kill(); nc.close();
console.log("\n" + (fehler ? fehler + " FEHLER" : "Alles grün"));
process.exit(fehler ? 1 : 0);
