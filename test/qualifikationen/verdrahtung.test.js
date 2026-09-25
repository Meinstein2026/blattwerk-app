// test/qualifikationen/verdrahtung.test.js
// Verdrahtung des Qualifikations-Registers in server.mjs und dolibarr-app.jsx.
//
// server.mjs wird an vier Zeilen angefasst (Import, Abschnitt holen, Leer-Bedingung, Mailzeile),
// dolibarr-app.jsx an vier Stellen (Import, Reiter, Abzeichen, Tages-Effekt seit 17.09.2026).
// Damit parallele Zweige (Baumkataster, SKT-Formular) nicht kollidieren. Diese Pruefung
// sichert, dass die Stellen da sind — und dass es nicht mehr wurden.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const srv = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");

describe("server.mjs: Sammelmail", () => {
  const job = srv.slice(srv.indexOf("async function asErinnerungPruefen"), srv.indexOf("const ewTageBis"));

  it("importiert Mailabschnitt und Anzahl aus dem Fachmodul", () => {
    expect(srv).toMatch(/import \{ qualiErinnerungAnzahl, qualiErinnerungHtml \} from "\.\/src\/server\/qualifikationen\.mjs";/);
  });

  it('holt den Abschnitt "Fortbildungen" genau einmal, vor der Leer-Abkürzung', () => {
    const treffer = job.match(/const qualiHtml = await qualiErinnerungHtml\(creds, heute\);/g) || [];
    expect(treffer).toHaveLength(1);
    expect(job.indexOf("const qualiHtml")).toBeLessThan(job.indexOf("!faellig.length && !pruefungen.length"));
    expect((srv.match(/qualiErinnerungHtml/g) || []).length).toBe(2); // Import + Aufruf
  });

  it("mailt auch dann, wenn nur Fortbildungen fällig sind (Entscheidung Max, 16.09.2026)", () => {
    expect(job).toMatch(/!faellig\.length && !pruefungen\.length && !qualiHtml[\s\S]{0,120}tagAbhaken\(\)/);
  });

  it('hängt den Abschnitt in den Mailtext — genau eine Zeile, nach den Prüfungen, vor dem Rechtshinweis', () => {
    const html = job.slice(job.indexOf("const html = `"), job.indexOf("</body></html>`"));
    expect((html.match(/\$\{qualiHtml\}/g) || []).length).toBe(1);
    expect(html).toMatch(/pRows[\s\S]*\$\{qualiHtml\}[\s\S]*BetrSichV/);
  });

  it("verändert sonst nichts an der Erinnerung", () => {
    // Die bestehende Tagesmarke bleibt, wie test/arbeitsschutz/ablage.test.js sie prueft.
    expect(job).toMatch(/store\.letzteErinnerung === heute\) return/);
    expect(job).toMatch(/frisch\.letzteErinnerung = heute/);
  });

  it('zaehlt faellige Fortbildungen im Betreff mit, sonst stand faelschlich "0 offene Frist(en)" (17.09.2026)', () => {
    const treffer = job.match(/const qualiAnzahl = await qualiErinnerungAnzahl\(creds, heute\);/g) || [];
    expect(treffer).toHaveLength(1);
    expect(job).toMatch(/subject: `\[Blattwerk\] Arbeitsschutz: \$\{faellig\.length \+ pruefungen\.length \+ qualiAnzahl\} offene Frist\(en\)`/);
  });
});

describe("src/ui/QualifikationenTab.jsx", () => {
  const ui = fs.readFileSync(path.join(process.cwd(), "src/ui/QualifikationenTab.jsx"), "utf8");

  it("ist die Standard-Export-Komponente und hängt an nichts in dolibarr-app.jsx", () => {
    expect(ui).toMatch(/export default function QualifikationenTab\(\{ api, me, showToast, nc, ncOk \}\)/);
    expect(ui).not.toMatch(/from\s+["'][^"']*dolibarr-app/); // kein Import — Kommentare dürfen die Datei nennen
  });

  it("spiegelt nach dem Speichern nach Dolibarr und meldet einen Fehlschlag nur als Hinweis", () => {
    expect(ui).toMatch(/api\.updateUser\(p\.dolibarrId, \{ array_options: qualDolibarrFelder\(p, heute\) \}\)/);
    expect(ui).toMatch(/Dolibarr nicht aktualisiert/);
  });

  it("spricht die beiden Endpunkte des Fachmoduls an", () => {
    expect(ui).toMatch(/"\/api\/nc\/qualifikationen"/);
    expect(ui).toMatch(/"\/api\/nc\/qualifikationen\/save"/);
  });

  it("nimmt den Nachweis als PDF oder Foto entgegen", () => {
    expect(ui).toMatch(/accept="application\/pdf,image\/\*"/);
    expect(ui).toMatch(/capture="environment"/);
  });

  it("merkt sich die Zahl der offenen Fortbildungen für ein Abzeichen", () => {
    expect(ui).toMatch(/QUALI_STAND_KEY = "blattwerk_quali_stand"/);
    expect(ui).toMatch(/qualFaelligkeiten\(/);
  });

  it("lässt die eigene Person zuerst, damit ihre Dolibarr-Mobilnummer nicht von einem leeren Wert überschrieben wird", () => {
    expect(ui).toMatch(/setNutzer\(\[\.\.\.selbst, \.\.\.ausDolibarr\(u\)\]\)/);
  });

  it("zeigt den G-41-Hinweis der gewählten Person, ohne etwas zu sperren (Fix-Runde Task 12, 18.09.2026)", () => {
    expect(ui).toMatch(/import \{[\s\S]{0,200}qualG41Hinweis[\s\S]{0,200}\} from "\.\.\/qualifikationen\.js";/);
    expect(ui).toMatch(/const g41Hinweis = person \? qualG41Hinweis\(person, heute\) : null;/);
    expect(ui).toMatch(/\{g41Hinweis && \(/);
    // reine Anzeige: kein disabled/return/throw haengt an g41Hinweis
    expect(ui).not.toMatch(/disabled=\{[^}]*g41Hinweis/);
  });
});

describe("dolibarr-app.jsx: Reiter Personal", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const funktion = (name) => {
    const a = app.indexOf(`function ${name}(`);
    if (a < 0) throw new Error("Funktion fehlt: " + name);
    const b = app.indexOf("\nfunction ", a + 10);
    return app.slice(a, b < 0 ? app.length : b);
  };

  it("importiert Komponente, Abzeichen-Zähler und Stand-Schreiber aus src/ui", () => {
    expect(app).toMatch(/import QualifikationenTab, \{ qualiOffenCount, qualiStandSchreiben \} from "\.\/src\/ui\/QualifikationenTab\.jsx";/);
  });

  it("zieht den Qualifikations-Stand im selben Tages-Effekt wie die Einweisungen nach, statt erst beim Öffnen des Reiters (17.09.2026)", () => {
    const effekt = app.slice(app.indexOf("Stand der Einweisungen einmal am Tag nachziehen"), app.indexOf("Fristen der Betriebsmittel"));
    expect(effekt).toMatch(/apiFetch\("\/api\/nc\/qualifikationen", \{/);
    expect(effekt).toMatch(/qualiStandSchreiben\(qualiStore, heuteIso\(\)\)/);
  });

  it("zeigt Personal als vierten Reiter und rendert den Tab mit denselben Props wie Einweisungen", () => {
    const gbu = funktion("GbuPage");
    expect(gbu).toMatch(/\["vorort", "Vor Ort"\], \["grundlagen", "Grundlagen"\], \["einweisungen", "Einweisungen"\], \["personal", "Personal"\]/);
    expect(gbu).toMatch(/\{tab === "personal" && \(\s*<QualifikationenTab api=\{api\} me=\{me\} showToast=\{showToast\} nc=\{nc\} ncOk=\{ncOk\} \/>\s*\)\}/);
  });

  it("zählt offene Fortbildungen im Abzeichen der Kachel Arbeitsschutz mit (Entscheidung Max, 16.09.2026)", () => {
    expect(app).toMatch(/badge: gbuPendingCount\(\) \+ ewOffenCount\(\) \+ qualiOffenCount\(\) \}/);
    expect((app.match(/qualiOffenCount\(\)/g) || []).length).toBe(1);
  });

  it("fasst die Datei sonst nicht an — Komponente genau drei Fundstellen (Import zählt doppelt)", () => {
    expect((app.match(/QualifikationenTab/g) || []).length).toBe(3);
  });
});

describe("dolibarr-app.jsx: GbuForm — G-41-Hinweis (Fix-Runde Task 12, 18.09.2026)", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
  const funktion = (name) => {
    const a = app.indexOf(`function ${name}(`);
    if (a < 0) throw new Error("Funktion fehlt: " + name);
    const b = app.indexOf("\nfunction ", a + 10);
    return app.slice(a, b < 0 ? app.length : b);
  };
  const gbuForm = funktion("GbuForm");

  it("importiert die reine Logik, statt eine eigene Aufsichtsprüfung zu bauen", () => {
    expect(app).toMatch(/import \{ qualG41Hinweis, qualiKeyAusLogin, qualiPersonenVereinen \} from "\.\/src\/qualifikationen\.js";/);
  });

  it("holt das Qualifikations-Register zusätzlich zum bestehenden Tages-Effekt (personenbezogen statt nur die Zahl)", () => {
    expect(gbuForm).toMatch(/apiFetch\("\/api\/nc\/qualifikationen", \{/);
    expect(gbuForm).toMatch(/qualiPersonenVereinen\(/);
  });

  it("zeigt den Hinweis bei Aufsichtsführende(r) UND bei jeder Person im eingesetzten Personal", () => {
    expect(gbuForm).toMatch(/const aufsichtG41 = g41Fuer\(form\.aufsichtsfuehrender\);/);
    expect(gbuForm).toMatch(/\{aufsichtG41 && \(/);
    expect(gbuForm).toMatch(/const personG41 = g41Fuer\(p\.name\);/);
    expect(gbuForm).toMatch(/\{personG41 && \(/);
  });

  it("blockiert nichts — kein disabled, kein Validierungsfehler hängt am G-41-Hinweis", () => {
    // goToSign/save validieren ueber validateGbu(buildRecord()), das den
    // G-41-Hinweis gar nicht kennt — hier nur die Gegenprobe, dass niemand
    // ihn nachtraeglich als Sperre verdrahtet hat.
    expect(gbuForm).not.toMatch(/disabled=\{[^}]*(aufsichtG41|personG41)/);
    expect(gbuForm).not.toMatch(/errors\.push\([^)]*[Gg]41/);
  });
});

describe("qualiStandSchreiben (Abzeichen ohne geöffneten Reiter)", () => {
  let mem;
  beforeEach(() => {
    mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      clear: () => { mem.clear(); },
    };
  });
  afterEach(() => { delete globalThis.localStorage; });

  it("schreibt den Stand so, dass qualiOffenCount ihn anschließend liest", async () => {
    const { qualiOffenCount, qualiStandSchreiben } = await import("../../src/ui/QualifikationenTab.jsx");
    const { qualNorm } = await import("../../src/qualifikationen.js");
    expect(qualiOffenCount()).toBe(0);
    const store = qualNorm({ personen: {
      anna: { name: "Anna", quals: [{ id: "1", art: "g41", seit: "2023-01-01", gueltigBis: "2020-01-01" }] },
    } });
    qualiStandSchreiben(store, "2026-09-17");
    expect(qualiOffenCount()).toBe(1);
  });
});
