// Ablage der Arbeitsschutz-Unterlagen und der Einweisungsnachweise.
//
// Hintergrund des wichtigsten Tests hier: seit die App das Dienstkonto des
// Team-Kalenders einsetzt, laufen auch die Datei-Endpunkte darunter. Dieses
// Konto hatte den Blattwerk-Ordner nicht — und `gbu-upload` legt seine
// Ordnerkette per MKCOL selbst an. Ohne Vorpruefung entsteht dabei klaglos ein
// zweiter Blattwerk-Ordner im Heimatverzeichnis des Dienstkontos, die
// Gefaehrdungsbeurteilung landet dort und niemand merkt es. (07.08.2026)
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { asPersonen, ncBody, ncTeamCreds, parseDirListing } from "../../server.mjs";

const src = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
/** Quelltext eines Endpunkts, ohne Kommentarzeilen (die sonst mitgeprüft würden). */
const endpunkt = (pfad) => {
  const a = src.indexOf(`app.post("${pfad}"`);
  if (a < 0) throw new Error("Endpunkt fehlt: " + pfad);
  const b = src.indexOf("\napp.", a + 10);
  return src.slice(a, b < 0 ? src.length : b)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
};

const dav = (...eintraege) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${eintraege.join("")}</d:multistatus>`;
const datei = (href, size = 1234, mod = "Fri, 07 Aug 2026 15:05:00 GMT") =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
  `<d:getcontentlength>${size}</d:getcontentlength>` +
  `<d:getlastmodified>${mod}</d:getlastmodified>` +
  `</d:prop></d:propstat></d:response>`;
const ordner = (href) => `<d:response><d:href>${href}</d:href></d:response>`;

describe("parseDirListing", () => {
  const BASIS = "/remote.php/dav/files/blattwerk-kalender/Blattwerk/Arbeitsschutz/";

  it("liest Name, Größe und Datum", () => {
    const out = parseDirListing(dav(ordner(BASIS), datei(BASIS + "Grundlagen.pdf", 276296)));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Grundlagen.pdf");
    expect(out[0].size).toBe(276296);
    expect(out[0].modified).toContain("2026");
  });

  it("lässt Ordner weg — auch den eigenen", () => {
    const out = parseDirListing(dav(ordner(BASIS), ordner(BASIS + "Einweisungen/"), datei(BASIS + "a.pdf")));
    expect(out.map((f) => f.name)).toEqual(["a.pdf"]);
  });

  it("dekodiert Umlaute im Dateinamen", () => {
    const out = parseDirListing(dav(datei(BASIS + "Ger%C3%A4teeinweisung.pdf")));
    expect(out[0].name).toBe("Geräteeinweisung.pdf");
  });

  it("verschluckt sich nicht an einer kaputten Kodierung", () => {
    const out = parseDirListing(dav(datei(BASIS + "kaputt%ZZ.pdf"), datei(BASIS + "gut.pdf")));
    expect(out.map((f) => f.name)).toEqual(["gut.pdf"]);
  });

  it("kommt mit leerer Antwort klar", () => {
    expect(parseDirListing(dav())).toEqual([]);
    expect(parseDirListing("")).toEqual([]);
  });
});

describe("asPersonen", () => {
  it("leitet die Personen aus den Einträgen ab", () => {
    const out = asPersonen([
      { login: "max", name: "Max Muster" },
      { login: "erika", name: "Erika Beispiel" },
      { login: "max", name: "Max Muster" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.login).sort()).toEqual(["erika", "max"]);
  });

  it("übergeht Einträge ohne Login", () => {
    expect(asPersonen([{ name: "Niemand" }, null, { login: "max" }])).toHaveLength(1);
  });
});

describe("Grundsatzunterlagen", () => {
  const liste = endpunkt("/api/nc/arbeitsschutz-list");
  const datei_ = endpunkt("/api/nc/arbeitsschutz-file");

  it("zeigt sie ohne Rechteprüfung — sie sind für alle da", () => {
    expect(liste).not.toMatch(/viewAllGbu|canView/);
  });

  it("liefert nur PDF, nicht die ODT-Zwillinge", () => {
    // Der Ordner enthaelt zu jedem Dokument eine ODT-Fassung zum
    // Weiterschreiben. Der Betrachter der App kann die nicht darstellen —
    // ein Treffer darauf waere ein toter Fingertipp.
    expect(liste).toMatch(/\\\.pdf\$\/i\.test/);
    expect(datei_).toMatch(/\\\.pdf\$\/i\.test/);
  });

  it("lässt den Dateinamen den Ordner nicht verlassen", () => {
    expect(datei_).toMatch(/replace\(\/\[\/\\\\\]\/g, "_"\)/);
  });

  it("meldet einen fehlenden Ordner als leer, nicht als Fehler", () => {
    expect(liste).toMatch(/status === 404\) return res\.json\(\{ files: \[\] \}\)/);
  });
});

describe("Vorprüfung: schreibt das Konto überhaupt am richtigen Ort?", () => {
  it("prüft vor dem Anlegen der Ordnerkette", () => {
    const up = endpunkt("/api/nc/gbu-upload");
    const pruefung = up.indexOf("assertOrdner");
    const mkcol = up.indexOf("MKCOL");
    expect(pruefung).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(mkcol);
  });

  it("sagt beim Beleg-Upload im Klartext, was fehlt", () => {
    // WebDAV antwortet dort mit 409, wenn der Zielordner fehlt. Als nackte
    // Zahl versteht das niemand.
    // Der Ordnername kommt seit 18.09.2026 aus dem Mandanten (ordner()), nicht
    // mehr fest „Blattwerk" — eine fremde Firma wuerde sonst nach einem
    // Ordner suchen, den es bei ihr gar nicht gibt.
    expect(endpunkt("/api/nc/putfile")).toMatch(/status === 409[\s\S]{0,200}\$\{ordner\(\)\}\/Belege/);
  });

  it("behandelt ein fehlendes Verzeichnis nicht als Anmeldefehler", () => {
    const fn = src.slice(src.indexOf("export async function assertOrdner"), src.indexOf("function parseDirListing"));
    expect(fn).toMatch(/status === 401[\s\S]*code: 401/);
    expect(fn).toMatch(/status === 404[\s\S]*code: 409/);
  });
});

describe("Einweisungsnachweise", () => {
  const save = endpunkt("/api/nc/einweisungen/save");
  const lesen = src.slice(src.indexOf("async function asStoreLesen"), src.indexOf("async function asStoreSchreiben"));

  it("hängt jede Wiederholung an, statt die vorige zu ersetzen", () => {
    // Die Nachweiskette muss auch Jahre spaeter lueckenlos sein; wer nur den
    // letzten Stand behaelt, kann eine zurueckliegende Frist nicht mehr belegen.
    expect(save).toMatch(/store\.eintraege\.push\(neu\)/);
    expect(save).not.toMatch(/eintraege\s*=\s*\[/);
    expect(save).not.toMatch(/splice|filter\(\(e\)/);
  });

  it("schreibt mit If-Match, damit sich zwei Geräte nicht überschreiben", () => {
    const schreiben = src.slice(src.indexOf("async function asStoreSchreiben"), src.indexOf('app.post("/api/nc/einweisungen"'));
    expect(schreiben).toMatch(/If-Match/);
    expect(save).toMatch(/412/); // bei Konflikt neu lesen statt blind ueberschreiben
  });

  it("weist unbekannte Geräte und kaputte Daten ab", () => {
    expect(save).toMatch(/ewGeraet\(eintrag\.geraet\)/);
    expect(save).toMatch(/ewParse\(eintrag\.datum\)/);
  });

  it("ersetzt eine unlesbare Datei nicht durch eine leere", () => {
    // Darin stehen Nachweise, die niemand rekonstruieren kann.
    expect(lesen).toMatch(/unlesbar/);
    expect(lesen).toMatch(/code: 409/);
  });

  it("behandelt eine noch fehlende Datei als leeren Anfang", () => {
    expect(lesen).toMatch(/status === 404\) return \{ store: \{ \.\.\.AS_STORE_LEER \}/);
  });

  it("verwirft die Einweisung nicht, wenn der Kalendereintrag scheitert", () => {
    // Der Nachweis ist das Wichtige; die Erinnerung ist Zugabe.
    const termin = src.slice(src.indexOf("async function asTerminSchreiben"));
    expect(termin.slice(0, 1200)).toMatch(/try \{/);
    expect(termin).toMatch(/return \{ ok: false, grund:/);
  });

  it("nimmt für den Kalendertermin die feste UID", () => {
    expect(save).toMatch(/uid: ewUid\(neu\.geraet, neu\.login\)/);
  });
});

describe("Tägliche Erinnerung", () => {
  const job = src.slice(src.indexOf("async function asErinnerungPruefen"), src.indexOf("const ewTageBis"));

  it("merkt sich den Tag in der Datei, nicht im Arbeitsspeicher", () => {
    // Sonst faengt nach jedem Neustart des Containers alles von vorne an und
    // dieselbe Mail kommt mehrfach.
    expect(job).toMatch(/store\.letzteErinnerung === heute\) return/);
    expect(job).toMatch(/frisch\.letzteErinnerung = heute/);
  });

  it("hakt den Tag auch dann ab, wenn nichts offen ist", () => {
    expect(job).toMatch(/!faellig\.length && !pruefungen\.length[\s\S]{0,120}tagAbhaken\(\)/);
  });

  it("setzt die Tagesmarke mit frischem ETag, nicht mit dem von vor der Mail", () => {
    // Zwischen Lesen und Schreiben liegt der Mailversand. Traegt in der Zeit
    // jemand eine Einweisung ein, laeuft das PUT mit dem alten ETag ins 412 —
    // und ohne Nachfassen ginge dieselbe Mail Stunde um Stunde erneut raus.
    const helfer = job.slice(job.indexOf("const tagAbhaken"), job.indexOf("const { store }"));
    expect(helfer).toMatch(/asStoreLesen\([\s\S]*asStoreSchreiben\(/);
    expect(helfer).toMatch(/status !== 412/);
    expect(helfer).toMatch(/versuch < 3/);
    // ...und der Rueckgabewert wird nicht stillschweigend weggeworfen
    expect(helfer).toMatch(/console\.error/);
  });

  it("schreibt nicht mitten in der Nacht", () => {
    expect(job).toMatch(/stunde < 6\) return/);
  });

  it("schweigt ohne SMTP-Konfiguration, statt zu scheitern", () => {
    expect(job).toMatch(/if \(!cfg\.host \|\| !cfg\.user \|\| !cfg\.pass\) return/);
  });

  it("lässt sich abschalten und läuft im Test nicht mit", () => {
    expect(src).toMatch(/!process\.env\.VITEST && process\.env\.ARBEITSSCHUTZ_ERINNERUNG !== "0"/);
  });

  it("ruft im Stundentakt tatsächlich die Prüfung auf", () => {
    // asStundentakt reicht im Kern weiter an asErinnerungPruefen durch
    // (Befund K3), nimmt seit Task 10 aber Mandant + Prüf-Funktion
    // injizierbar entgegen — die eigentliche Verhaltensprüfung (Block aus =
    // kein Aufruf, Block an = Aufruf) steht deshalb NICHT hier als
    // Quelltext-Match, sondern behavioral in
    // test/arbeitsschutz/erinnerung-block.test.js. Hier nur der schmalere
    // Regressionsschutz: leert jemand den Standardwert versehentlich, fiele
    // ein Ausfall der Fristenerinnerung sonst monatelang niemandem auf.
    const stundentakt = src.slice(src.indexOf("async function asStundentakt"), src.indexOf("if (!process.env.VITEST"));
    expect(stundentakt).toMatch(/pruefen = asErinnerungPruefen/);
    expect(stundentakt).toMatch(/await pruefen\(\)/);
  });

  it("nennt in der Mail die Rechtsgrundlage der Frist", () => {
    expect(job).toMatch(/BetrSichV/);
    expect(job).toMatch(/JArbSchG/);
  });
});

describe("Weg des Handys: Zugangsdaten kommen vom Server", () => {
  // Ein Geraet ohne eigenen Nextcloud-Login schickt `pass: ""` — falsy, also
  // setzt `ncBody` das Dienstkonto ein. Genau dieser Weg ist der, den das
  // Handy geht, und er war fuer die neuen Endpunkte noch nirgends geprueft.
  const TEAM = {
    SSO_NC_TEAM_USER: "blattwerk-kalender",
    SSO_NC_TEAM_PASS: "geheim",
    SSO_NC_TEAM_CAL: "https://nc/remote.php/dav/calendars/blattwerk-kalender/blattwerk/",
  };
  const req = (body, { user = "max", ip = "203.0.113.30" } = {}) => ({
    body, socket: { remoteAddress: ip }, headers: user ? { "x-authentik-username": user } : {},
  });

  beforeEach(() => Object.assign(process.env, TEAM));
  afterEach(() => Object.keys(TEAM).forEach((k) => delete process.env[k]));

  it("setzt sie ein, wenn das Gerät ein leeres Passwort schickt", () => {
    const out = ncBody(req({ server: "https://nc", user: "", pass: "" }));
    expect(out.user).toBe("blattwerk-kalender");
    expect(out.pass).toBe("geheim");
  });

  it("reicht den Einweisungs-Eintrag unverändert durch", () => {
    const eintrag = { geraet: "haecksler", login: "max", datum: "2026-08-07" };
    expect(ncBody(req({ pass: "", eintrag })).eintrag).toEqual(eintrag);
  });

  it("gibt ohne Authentik-Identität nichts heraus", () => {
    expect(ncBody(req({ pass: "" }, { user: null })).pass).toBe("");
  });

  it("nimmt für den Kalendertermin das Dienstkonto-Kalenderziel", () => {
    // asTerminSchreiben faellt auf ncTeamCreds().calendarUrl zurueck, wenn die
    // Anfrage selbst keinen Kalender nennt.
    expect(ncTeamCreds().calendarUrl).toBe(TEAM.SSO_NC_TEAM_CAL);
    const termin = src.slice(src.indexOf("async function asTerminSchreiben"));
    expect(termin).toMatch(/creds\.calendarUrl \|\| \(ncTeamCreds\(\) \|\| \{\}\)\.calendarUrl/);
  });
});

describe("Zweitablage in Paperless", () => {
  const pl = src.slice(src.indexOf("const PAPERLESS_BASE"), src.indexOf("// ---------- Erinnerung"));
  const save = endpunkt("/api/nc/einweisungen/save");

  // Adresse und Beschriftung kommen seit 18.09.2026 aus dem Mandanten
  // (Befund C2) — geprueft wird deshalb das Ergebnis, nicht mehr der
  // Quelltext. Der Test liegt vollstaendig in test/mandant/paperless.test.js;
  // hier bleibt nur, was die Hausordnung des Archivs selbst betrifft.
  it("setzt genau einen Bereich — die Hausordnung des Archivs", () => {
    // „Jedes Dokument hat genau einen Bereich/*" ist die Invariante des
    // Tagsystems; Herkunft wird nie geraten, sondern gesetzt.
    expect(pl).toMatch(/const tagIds = \[await plId\("tags", PL_BEREICH\(\)\)\]/);
  });

  it("löst Schlagworte über den Namen auf und meldet Fehlendes", () => {
    // IDs in ENV-Variablen zu pflegen ist eine Fehlerquelle; ein fehlender
    // Tag soll benannt werden, nicht stillschweigend wegfallen.
    expect(pl).toMatch(/name__iexact=/);
    expect(pl).toMatch(/fehlt in Paperless/);
  });

  it("datiert das Dokument auf seinen eigenen Tag, nicht auf den Upload", () => {
    expect(pl).toMatch(/form\.append\("created", datum\)/);
  });

  it("lässt eine Einweisung nicht an Paperless scheitern", () => {
    expect(pl).toMatch(/return \{ ok: false, grund:/);
    expect(save).toMatch(/if \(!paperless\.ok\) console\.error/);
  });

  it("schweigt ohne Token, statt zu scheitern", () => {
    expect(pl).toMatch(/if \(!plAktiv\(\)\) return \{ ok: false, grund: "kein PAPERLESS_TOKEN gesetzt" \}/);
  });
});

describe("Protokoll-Ablage", () => {
  const save = endpunkt("/api/nc/einweisungen/save");

  it("prüft die Vollständigkeit noch einmal auf dem Server", () => {
    // Das Formular kann umgangen werden; die Akte ist die Stelle, an der ein
    // unvollstaendiges Protokoll nicht hineinkommt.
    expect(save).toMatch(/const mangel = ewFehlt\(eintrag\)/);
    expect(save).toMatch(/Unvollständig/);
  });

  it("legt das PDF ab, BEVOR der Nachweis eingetragen wird", () => {
    // Sonst stuende in der Uebersicht eine Einweisung, zu der es kein
    // Protokoll gibt.
    const pdf = save.indexOf("Protokoll ablegen: Status");
    const eintrag = save.indexOf("store.eintraege.push(neu)");
    expect(pdf).toBeGreaterThan(-1);
    expect(pdf).toBeLessThan(eintrag);
  });

  it("sortiert die Protokolle nach Jahr, getrennt vom Vor-Ort-Archiv", () => {
    // Nicht in <Ordner>/Gefährdungsbeurteilungen/<Jahr>/ — dort sucht
    // gbu-list, die Protokolle würden das Vor-Ort-Archiv zumüllen.
    expect(save).toMatch(/AS_DIR\(\) \+ "\/Einweisungen"/);
    expect(save).toMatch(/\$\{ordner\(\)\}\/Arbeitsschutz\/Einweisungen\/\$\{jahr\}/);
  });
});
