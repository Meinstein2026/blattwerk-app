// Ablage des Tutorial-Abschlusses.
//
// Der eine Punkt, an dem hier still etwas verlorengehen kann, ist das
// Zusammenführen: schreibt ein Gerät den ganzen Speicher zurück, ohne den
// frischen Stand zu lesen, verschwinden die Abschlüsse, die inzwischen von
// anderen Geräten dazugekommen sind. Deshalb ist tutEintragen additiv und
// eine reine Funktion — genau das lässt sich prüfen, ohne WebDAV zu spielen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tutEintragen } from "../../server.mjs";

const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
const endpunkt = (pfad) => {
  const a = src.indexOf(`app.post("${pfad}"`);
  if (a < 0) throw new Error("Endpunkt fehlt: " + pfad);
  const b = src.indexOf("\napp.", a + 10);
  return src.slice(a, b < 0 ? src.length : b)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
};

describe("tutEintragen", () => {
  it("trägt einen Abschluss ein", () => {
    const s = tutEintragen({ version: 1, abgeschlossen: {} }, "max", 1, "2026-08-09");
    expect(s.abgeschlossen.max).toEqual({ am: "2026-08-09", fassung: 1 });
  });
  it("löscht die Abschlüsse der anderen nicht", () => {
    const vorher = { version: 1, abgeschlossen: { erika: { am: "2026-08-01", fassung: 1 } } };
    const s = tutEintragen(vorher, "max", 1, "2026-08-09");
    expect(s.abgeschlossen.erika).toEqual({ am: "2026-08-01", fassung: 1 });
    expect(s.abgeschlossen.max.fassung).toBe(1);
  });
  it("überschreibt den eigenen alten Eintrag mit der neuen Fassung", () => {
    const vorher = { version: 1, abgeschlossen: { max: { am: "2026-01-01", fassung: 1 } } };
    const s = tutEintragen(vorher, "max", 2, "2026-08-09");
    expect(s.abgeschlossen.max).toEqual({ am: "2026-08-09", fassung: 2 });
  });
  it("verträgt einen Speicher ohne abgeschlossen-Feld", () => {
    const s = tutEintragen({}, "max", 1, "2026-08-09");
    expect(s.abgeschlossen.max.fassung).toBe(1);
  });
});

describe("Endpunkte", () => {
  const save = endpunkt("/api/nc/tutorial/save");
  it("lesen und schreiben gibt es beide", () => {
    expect(() => endpunkt("/api/nc/tutorial")).not.toThrow();
    expect(save.length).toBeGreaterThan(0);
  });
  it("schreiben prüft den Firmenordner VOR der Ordnerkette", () => {
    // Ohne assertOrdner legt die MKCOL-Kette dem Dienstkonto klaglos einen
    // zweiten Firmenordner ins Heimatverzeichnis (siehe einweisungen/save).
    // Die Reihenfolge ist der eigentliche Schutz, nicht das blosse Vorkommen:
    // hinter dem MKCOL geprueft, ist der falsche Ordner schon angelegt.
    const pruefung = save.indexOf("assertOrdner");
    const mkcol = save.indexOf("MKCOL");
    expect(pruefung).toBeGreaterThan(-1);
    expect(mkcol).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(mkcol);
  });
  it("schreiben verlangt Login und Fassung", () => {
    // Nicht nur nach den Woertern "login"/"fassung" suchen — das traf schon
    // die Zeile, die die Variable anlegt, und bliebe gruen, wenn der
    // Waechter darunter verschwindet. Den Waechter selbst pruefen.
    expect(save.indexOf("if (!login) return res.status(400)")).toBeGreaterThan(-1);
    expect(save.indexOf("if (!Number.isInteger(fassung)")).toBeGreaterThan(-1);
  });
  it("schreiben nutzt If-Match", () => {
    // Am Endpunkt selbst steht nur der Aufruf — der Header wird in
    // tutStoreSchreiben gesetzt. Wer hier den Endpunkt absucht, prueft nichts:
    // der Name der Funktion steht dort zwangslaeufig, ob sie den Header setzt
    // oder nicht. Also die Funktion selbst herausschneiden (wie es
    // test/arbeitsschutz/ablage.test.js fuer asStoreSchreiben macht).
    const schreiben = src.slice(
      src.indexOf("async function tutStoreSchreiben"),
      src.indexOf('app.post("/api/nc/tutorial"')
    );
    expect(schreiben).toMatch(/If-Match/);
    // Ohne Datei (etag null, HTTP 404 beim Lesen) trotzdem nicht blind
    // anlegen: If-None-Match: * schuetzt die Erstanlage vor zwei Geraeten,
    // die gleichzeitig den allerersten Abschluss schreiben (Befund S7).
    expect(schreiben).toMatch(/If-None-Match/);
    // Nicht nur die Zahl 412 irgendwo suchen — das traf schon einen blossen
    // Kommentar. Den tatsaechlichen Wiederholungspfad pruefen: die Schleife
    // bricht NUR bei etwas anderem als 412 ab, sonst liest sie neu und
    // schreibt erneut.
    const schleife = save.indexOf("while (versuch < 2)");
    const abbruch = save.indexOf("if (r.status !== 412) break;");
    expect(schleife).toBeGreaterThan(-1);
    expect(abbruch).toBeGreaterThan(schleife);
  });
});

describe("Uebersprungen wird als solches vermerkt", () => {
  it("schreibt das Merkmal nur, wenn abgekuerzt wurde", () => {
    const durchlaufen = tutEintragen({}, "max", 2, "2026-08-16", false);
    expect(durchlaufen.abgeschlossen.max).toEqual({ am: "2026-08-16", fassung: 2 });

    const abgekuerzt = tutEintragen({}, "erika", 2, "2026-08-16", true);
    expect(abgekuerzt.abgeschlossen.erika).toEqual({ am: "2026-08-16", fassung: 2, uebersprungen: true });
  });

  it("laesst fremde Eintraege in Ruhe", () => {
    const vorher = { version: 1, abgeschlossen: { max: { am: "2026-08-01", fassung: 2 } } };
    const nachher = tutEintragen(vorher, "erika", 2, "2026-08-16", true);
    expect(nachher.abgeschlossen.max).toEqual({ am: "2026-08-01", fassung: 2 });
  });
});
