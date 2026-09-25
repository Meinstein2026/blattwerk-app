// Textuelle Verdrahtungsprüfung (wie test/einstellungen/verdrahtung.test.js):
// Leaflet darf nur lazy in BaumKarte.jsx vorkommen, sonst wächst das
// Hauptbundle um die Karte, die die meisten Bildschirme nie brauchen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lesen = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const pkg = JSON.parse(lesen("package.json"));

describe("Leaflet", () => {
  it("ist als Abhängigkeit festgehalten (1.9.x)", () => {
    expect(pkg.dependencies.leaflet).toMatch(/^\^?1\.9\./);
  });
  it("wird nur in BaumKarte.jsx geladen — dynamisch, samt Stylesheet", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/import\("leaflet"\)/);
    expect(karte).toMatch(/import "leaflet\/dist\/leaflet\.css"/);
    expect(karte).not.toMatch(/^import .* from "leaflet"/m);
    expect(lesen("dolibarr-app.jsx")).not.toMatch(/leaflet/i);
  });
  it("zeichnet Kreise (Kronendurchmesser) und Marker mit Ampelfarbe und Nummer", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/bkKronenRadiusM\(/);
    expect(karte).toMatch(/bkMarkerFarbe\(/);
    expect(karte).toMatch(/bindTooltip\(/);
    expect(karte).toMatch(/tile\.openstreetmap\.org/);
  });
  it("startet immer im festen Kartenausschnitt — der Ausschnitt wird nicht mehr gemerkt", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/bkStartAusschnitt\(/);
    expect(karte).toMatch(/bkKartenStart\(/);
    // Ein gemerkter Ausschnitt würde den festen Start beim nächsten Öffnen
    // wieder aushebeln (Ansage Max 19.09.2026).
    expect(karte).not.toMatch(/BK_KARTE_KEY|on\("moveend"/);
  });
  it("hält die Karte in einem eigenen Stapelkontext und führt ihre Größe nach", () => {
    // Leaflets z-index (200–1000) lag sonst über Kopfzeile, Fußleiste und Bögen.
    expect(lesen("src/ui/BaumkatasterPage.jsx")).toMatch(/\.bk-karte \{[^}]*isolation: isolate/);
    expect(lesen("src/ui/BaumKarte.jsx")).toMatch(/ResizeObserver/);
  });
  it("sucht Orte über Nominatim, ohne verbotenen User-Agent-Header", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/nominatim\.openstreetmap\.org\/search/);
    expect(karte).toMatch(/format=jsonv2/);
    expect(karte).toMatch(/bkOrtstreffer\(/);
    expect(karte).not.toMatch(/User-Agent/i);
    expect(karte).not.toMatch(/onChange=\{[^}]*ortSuchen/);   // nie beim Tippen
  });
  it("hat einen Knopf auf den eigenen Standort (ein Versuch, 10 s)", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/getCurrentPosition\(/);
    expect(karte).toMatch(/timeout: 10000/);
  });
  it("Kartentipp bietet „Baum hier anlegen“ an, der Marker-Tipp aber nicht", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/on\("click"/);
    expect(karte).toMatch(/Baum hier anlegen/);
    expect(karte).toMatch(/onAddAt/);
    // Der Marker stoppt die Ausbreitung, sonst öffnet jeder Tipp auf einen
    // vorhandenen Baum zusätzlich das Anlege-Popup.
    // Nicht auf einen Mechanismus festnageln: `L.DomEvent.stopPropagation`
    // oder `L.DomEvent.stop` sind beide zulaessig. Ob es wirklich greift,
    // kann ein Quelltexttest nicht sagen — das prueft die Smoke-Seite.
    expect(karte).toMatch(/DomEvent\.stopPropagation\(|DomEvent\.stop\(/);
    expect(karte).toMatch(/setTimeout\([^;]*5000|5000\)/);   // Popup blendet nach 5 s aus
  });
  it("stoppt mit dem Leaflet-Ereignis, nicht mit ev.originalEvent (echter Fehler, Browser-Smoke-Test 18.09.2026)", () => {
    // `L.DomEvent.stopPropagation(e)` setzt `e.originalEvent._stopped = true`
    // NUR, wenn `e` das LEAFLET-Ereignis ist (Zweig `else if (e.originalEvent)`
    // in Leaflets eigener DomEvent.stopPropagation). Reicht man stattdessen
    // `ev.originalEvent` (das native DOM-Ereignis) hinein, hat DAS ein eigenes
    // `.stopPropagation`, der erste Zweig greift, `_stopped` bleibt unbesetzt
    // — und `Map._handleDOMEvent` (leaflet-src.js) liefert den Klick trotzdem
    // an die Karte weiter, weil sie dort genau dieses Flag abfragt. Ergebnis:
    // ein Tipp auf einen Marker öffnete ZUSÄTZLICH „Baum hier anlegen" — im
    // Quelltext unsichtbar (der vorige Test ließ beide Varianten durch),
    // im echten Browser (scripts/bk-smoke.html) reproduzierbar.
    const karte = lesen("src/ui/BaumKarte.jsx");
    const stelle = karte.slice(karte.indexOf('.on("click", (ev) => { l.DomEvent.stopPropagation'));
    expect(stelle).toMatch(/DomEvent\.stopPropagation\(ev\)/);
    expect(stelle).not.toMatch(/stopPropagation\(ev\.originalEvent/);
  });
  it("kann eine bestehende Position per Tipp korrigieren", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/setzModus/);
    expect(karte).toMatch(/onSetzen\(/);
  });
  it("zeigt bei mehreren Kunden den Kundennamen am Marker und gibt den ganzen Baum zurück", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/mehrereKunden/);
    expect(karte).toMatch(/kundeName/);
    expect(karte).toMatch(/klick\(b\)/);        // ganzer Baum, nicht nur b.nr
    expect(karte).toMatch(/auswahl\?\.nr === b\.nr/);
  });
  it("zeichnet nicht-aktive Bäume nicht mehr — das übernimmt seit I4 wieder allein die Karte, nicht die gemeinsame Quelle", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    const zeichnenStart = karte.indexOf("const zeichnen = ()");
    const schleife = karte.slice(zeichnenStart, karte.indexOf("if (!angepasst.current)", zeichnenStart));
    expect(schleife).toMatch(/if \(b\.status !== "aktiv"\) continue;/);
  });
  it("springt bei einer Filteränderung auf das Kundengebiet, aber nicht bei jedem Rendern", () => {
    const karte = lesen("src/ui/BaumKarte.jsx");
    expect(karte).toMatch(/ziel/);
    expect(karte).toMatch(/useEffect\(\(\) => \{[^}]*ziel/s);
    expect(karte).toMatch(/"bleiben"/);
    expect(karte).toMatch(/maxZoom: 19/);
    expect(karte).toMatch(/kundenPunkte/);
  });
});

describe("BaumkatasterPage", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("importiert nichts aus dolibarr-app.jsx und lädt die Karte lazy", () => {
    expect(seite).not.toMatch(/from\s+["'][^"']*dolibarr-app/);
    expect(seite).toMatch(/lazy\(\(\) => import\("\.\/BaumKarte\.jsx"\)\)/);
    expect(seite).not.toMatch(/leaflet/i);
  });
  it("spricht die acht Endpunkte über ncPost an und erkennt die SSO-Umleitung", () => {
    for (const p of ["index", "kunde", "baum/save", "kontrolle/save", "massnahme/save", "massnahme/erledigt", "foto", "kontrolle/gbu"]) {
      expect(seite).toContain(`"/api/nc/baumkataster/${p}"`);
    }
    expect(seite).toMatch(/redirect: "manual"/);
    expect(seite).toMatch(/opaqueredirect/);
    expect(seite).toMatch(/outpost\.goauthentik\.io\/start/);
  });
  it("liest die Nextcloud-Konfiguration aus demselben Schlüssel wie NextcloudPanel", () => {
    expect(seite).toMatch(/localStorage\.getItem\("blattwerk_nextcloud"\)/);
  });
  it('nimmt für „Baum hier anlegen" die beste Position aus watchPosition innerhalb von 10 s', () => {
    expect(seite).toMatch(/watchPosition\(/);
    expect(seite).toMatch(/bkGpsBeste\(/);
    expect(seite).toMatch(/positionErmitteln\(10\)/);
  });
  it("drei Reiter Karte / Liste / Fällig und der Kontroll-Wizard", () => {
    for (const r of ['"karte"', '"liste"', '"faellig"']) expect(seite).toContain(r);
    expect(seite).toMatch(/Kontrolle durchführen/);
  });
});

describe("Kontroll-Wizard", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  const wizard = seite.slice(seite.indexOf("const SCHRITTE"));
  it("hat die fünf Schritte und Chips je Befund-Bereich", () => {
    for (const s of ["Befund", "Bewertung", "Maßnahmen", "Fotos", "Abschluss"]) expect(wizard).toContain(`"${s}"`);
    expect(wizard).toMatch(/Object\.keys\(BK_BEFUND\)\.map/);
    expect(wizard).toMatch(/<BkChips/);
    expect(wizard).toMatch(/<BkSignatur/);
  });
  it("schlägt die nächste Kontrolle aus der Intervalltabelle vor, überschreibbar", () => {
    expect(wizard).toMatch(/bkNaechsteKontrolle\(/);
    expect(wizard).toMatch(/naechsteKontrolle/);
  });
  it("speichert ERST die Kontrolle (mit Fotos), DANN die Maßnahmen mit der Kontroll-Id", () => {
    const k = wizard.indexOf('"/api/nc/baumkataster/kontrolle/save"');
    const m = wizard.indexOf('"/api/nc/baumkataster/massnahme/save"');
    expect(k).toBeGreaterThan(-1);
    expect(m).toBeGreaterThan(k);
    expect(wizard).toMatch(/kontrolleId: gespeichert\.kontrolle\.id/);
    expect(wizard).toMatch(/fotos: fotos\.map/);
  });
  it("legt die Dolibarr-Aufgabe nur im offenen Kundenprojekt an und speichert die Maßnahme auch ohne", () => {
    expect(wizard).toMatch(/bkProjektFuerKunde\(/);
    expect(wizard).toMatch(/api\.createTask\(/);
    expect(wizard).toMatch(/Kein offenes Projekt/);
    expect(wizard).toMatch(/dolibarrTaskId/);
    expect(wizard).toMatch(/Baum \$\{baum\.nr\}/);
  });
  it("verkleinert Fotos vor dem Hochladen und nimmt die Kamera", () => {
    expect(wizard).toMatch(/bildVerkleinern\(/);
    expect(wizard).toMatch(/capture="environment"/);
  });
  it("speichert die Kontrolle bei erneutem Versuch nicht doppelt", () => {
    expect(wizard).toMatch(/gespeicherteKontrolleRef/);
    const guard = wizard.indexOf("gespeicherteKontrolleRef.current");
    const k = wizard.indexOf('"/api/nc/baumkataster/kontrolle/save"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(k);
  });
  it("merkt gespeicherte Maßnahmen und Dolibarr-Aufgaben je Objekt, nicht per Index", () => {
    const massnahmeHas = wizard.indexOf("gespeicherteMassnahmenRef.current.has(");
    const m = wizard.indexOf('"/api/nc/baumkataster/massnahme/save"');
    expect(massnahmeHas).toBeGreaterThan(-1);
    expect(massnahmeHas).toBeLessThan(m);
    const taskGet = wizard.indexOf("dolibarrTasksRef.current.get(");
    const createTask = wizard.indexOf("api.createTask(");
    expect(taskGet).toBeGreaterThan(-1);
    expect(taskGet).toBeLessThan(createTask);
    expect(wizard).toMatch(/gespeicherteMassnahmenRef\.current\.add\(m\)/);
    expect(wizard).toMatch(/dolibarrTasksRef\.current\.set\(m,/);
  });
});

describe("Verdrahtung in dolibarr-app.jsx — genau drei Stellen", () => {
  const app = lesen("dolibarr-app.jsx");
  const funktion = (name) => { const a = app.indexOf(`function ${name}(`); const b = app.indexOf("\nfunction ", a + 10); return app.slice(a, b < 0 ? app.length : b); };
  it("Import oben", () => {
    expect(app).toMatch(/^import BaumkatasterPage from "\.\/src\/ui\/BaumkatasterPage\.jsx";$/m);
  });
  it("Kachel in der Verwaltung", () => {
    expect(funktion("VerwaltungPage")).toMatch(/label: "Baumkataster", nav: "baumkataster"/);
  });
  it("Tab neben Betriebsmittel, mit onBack zur Verwaltung", () => {
    expect(funktion("App")).toMatch(/\{tab === "baumkataster" && <BaumkatasterPage api=\{api\} me=\{me\} showToast=\{showToast\} betrieb=\{mandantBetrieb\(mandant\)\} onBack=\{\(\) => setTab\("verwaltung"\)\} \/>\}/);
  });
  it("und sonst nichts: der Name fällt genau dreimal (Import-Bezeichner, Import-Pfad, Tab); die Kachel kennt nur nav", () => {
    expect((app.match(/BaumkatasterPage/g) || []).length).toBe(3);
  });
});

describe("Karte als Einstieg (Präzisierung 17.09.2026)", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("zeigt beim Öffnen die Karte, nicht die Kundenwahl", () => {
    // Reiterreihenfolge Karte → Liste → Fällig, Vorgabe "karte".
    const reiter = seite.slice(seite.indexOf('["karte"'), seite.indexOf('["karte"') + 200);
    expect(reiter).toMatch(/\["karte".*\["liste".*\["faellig"/s);
    expect(seite).toMatch(/useState\("karte"\)/);
    expect(seite).not.toMatch(/<KundenWahl/);
  });
  it("lädt alle Kunden-Stores aus dem Index — einmal, nicht bei jedem Rendern", () => {
    expect(seite).toMatch(/bkBaeumeAllerKunden\(/);
    expect(seite).toMatch(/alleStoresLaden/);
    const effekt = seite.slice(seite.indexOf("alleStoresLaden"));
    expect(effekt).toMatch(/useEffect\(/);
    expect(seite).toMatch(/geladenRef|\[ncOk\]/);
  });
  it("überspringt einen unlesbaren Store und vermerkt ihn, statt die Karte leer zu lassen", () => {
    expect(seite).toMatch(/ladeFehler/);
    expect(seite).toMatch(/konnten nicht geladen werden|nicht lesbar/);
  });
  it("der Kunde ist ein Filter mit Mehrfachauswahl, kein Tor", () => {
    expect(seite).toMatch(/filter\.kunden/);
    expect(seite).toMatch(/BK_FILTER_KEY/);
    expect(seite).toMatch(/Kunde: alle|alle Kunden/);
  });
  it("Auswahl ist ein Paar aus Kunde und Nummer", () => {
    expect(seite).toMatch(/setAuswahl\(\{ kundeId/);
    expect(seite).toMatch(/auswahl\.kundeId/);
  });
  it("filtert an genau einer Stelle — Karte, Liste und Fällig lesen dasselbe Ergebnis", () => {
    expect((seite.match(/bkFilter\(/g) || []).length).toBe(1);
    expect(seite).toMatch(/zeigt \{gefiltert\.length\} von \{alleBaeume\.length\}/);
    expect(seite).toMatch(/Filter zurücksetzen/);
    expect(seite).toMatch(/bkFilterAktiv\(/);
    const karte = seite.slice(seite.indexOf("<BaumKarte"), seite.indexOf("<BaumKarte") + 500);
    expect(karte).toMatch(/baeume=\{gefiltert\}/);
  });
  it("zeigt eine Ladeanzeige, solange die Stores noch nacheinander geladen werden", () => {
    // `alleStoresLaden` lädt die Kunden-Stores sequenziell (eine Nextcloud-
    // Anfrage nach der anderen) — bei mehreren Kunden dauert das spürbar.
    // `laden` muss darum tatsächlich gerendert werden, sonst steht die Seite
    // in der Zwischenzeit mit "zeigt 0 von 0 Bäumen" da, wie kaputt.
    expect(seite).toMatch(/laden && /);
  });
});

describe("Filterleiste — alle sechs Dimensionen bedienbar (18.09.2026, Ablösung von I5)", () => {
  // I5 (Whole-Branch-Review) hatte bewusst nur das Textfeld bekommen; dieser
  // Schritt baut die restlichen fünf Bedienelemente nach — bkFilter selbst
  // (test/baumkataster/filter.test.js) war schon immer fertig.
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  const start = seite.indexOf("function BkFilterLeiste(");
  const leiste = seite.slice(start, seite.indexOf("\n}\n", start));
  it("Fundstelle ist wirklich die ganze Funktion, nicht durch einen flush-linken Zeilenanfang abgeschnitten", () => {
    expect(leiste).toMatch(/ladeFehler/);
    expect(leiste).toMatch(/kundenHinweis/);
  });
  it("hat ein Suchfeld, das filter.text schreibt", () => {
    expect(leiste).toMatch(/onChange=\{\(e\) => onChange\(\{ \.\.\.filter, text: e\.target\.value \}\)\}/);
    expect(leiste).toMatch(/value=\{filter\.text\}/);
    expect(leiste).toMatch(/Nummer, Art, Standort/);
  });
  it("Kontrolle, Verkehrssicherheit und Maßnahmen sind Chip-Gruppen, die ihr eigenes Feld schreiben", () => {
    for (const feld of ["kontrolle", "sicherheit", "massnahmen"]) {
      expect(leiste, feld).toMatch(new RegExp(`onChange\\(\\{ \\.\\.\\.filter, ${feld}: `));
    }
  });
  it("Baumart und Objekt sind Auswahllisten, die ihr eigenes Feld schreiben", () => {
    for (const feld of ["art", "objekt"]) {
      expect(leiste, feld).toMatch(new RegExp(`onChange\\(\\{ \\.\\.\\.filter, ${feld}: e\\.target\\.value \\}\\)`));
    }
  });
  it("Baumart und Objekt speisen sich aus dem tatsächlichen Bestand, nicht aus dem Katalog", () => {
    expect(leiste).toMatch(/arten\.map\(/);
    expect(leiste).toMatch(/objekteBestand\.map\(/);
    expect(leiste).not.toMatch(/BK_BAUMARTEN/);
  });
  it("eine leere Bestandsliste blendet die jeweilige Auswahl aus, statt sie leer zu zeigen", () => {
    expect(leiste).toMatch(/arten\.length > 0 &&/);
    expect(leiste).toMatch(/objekteBestand\.length > 0 &&/);
  });
  it("im Menü liegt nichts mehr hinter einem zweiten Schalter; die Kundensuche grenzt nur die Chips ein", () => {
    // 19.09.2026: die Leiste steht im Bogen hinter dem ☰-Knopf, dort ist Platz.
    expect(leiste).not.toMatch(/erweitert/);
    expect(leiste).toMatch(/kundenSuche/);
    // Gewählte Kunden bleiben trotz Suche sichtbar — sonst nicht mehr abwählbar.
    expect(leiste).toMatch(/filter\.kunden\.includes\(String\(k\.id\)\)\s*\n?\s*\|\|/);
    expect(leiste).toMatch(/onModus/);
  });
});

describe("Große Karte mit Filtermenü (19.09.2026, Vorbild SPD-Maps)", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("die Karte ist randlos und bildschirmhoch, nicht mehr 360 px", () => {
    expect(seite).toMatch(/\.bk-karte-rahmen \{[^}]*100dvh/);
    expect(seite).toMatch(/hoehe="100%"/);
  });
  it("die Filterleiste steht nur noch im Menü hinter dem ☰-Knopf", () => {
    expect(seite.match(/<BkFilterLeiste /g)).toHaveLength(1);
    const menue = seite.indexOf("{menue && (");
    expect(menue).toBeGreaterThan(-1);
    expect(seite.indexOf("<BkFilterLeiste ")).toBeGreaterThan(menue);
  });
  it("der Menüknopf liegt in der Karte und zeigt die Zahl der aktiven Filter", () => {
    expect(seite).toMatch(/className="bk-karte-rahmen">\s*\{burger\}/);
    expect(seite).toMatch(/bk-burger-zahl/);
    // Ohne Karte (Liste, Fällig, offline) muss er trotzdem erreichbar sein.
    expect(seite).toMatch(/\{!karteSichtbar && burger\}/);
  });
  it("die Ortssuche liegt als Overlay in der Karte", () => {
    expect(lesen("src/ui/BaumKarte.jsx")).toMatch(/bk-karte-suche/);
  });
});

describe("Karte bedienen", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("springt bei einer Kundenfilter-Änderung auf dessen Gebiet", () => {
    expect(seite).toMatch(/bkKundenAusschnitt\(/);
    expect(seite).toMatch(/ziel=\{/);
    // Der Sprung hängt am Kundenfilter, nicht am ganzen Filterobjekt: sonst
    // ruckt die Karte bei jedem Buchstaben im Suchfeld.
    expect(seite).toMatch(/filter\.kunden\.join\(","\)|JSON\.stringify\(filter\.kunden\)/);
  });
  it("löst die Kundenadresse nur auf, wenn der Kunde keinen verorteten Baum hat, und merkt sie sich", () => {
    expect(seite).toMatch(/bkKundenAdresse\(/);
    expect(seite).toMatch(/bkKundenOrtLesen\(/);
    expect(seite).toMatch(/bkKundenOrtMerken\(/);
    expect(seite).toMatch(/nominatim\.openstreetmap\.org\/search/);
    expect(seite).toMatch(/limit=1/);
    expect(seite).not.toMatch(/User-Agent/i);
  });
  it("legt einen Baum per Kartentipp an — mit Kundenwahl in der Maske", () => {
    expect(seite).toMatch(/onAddAt=/);
    expect(seite).toMatch(/quelle: "karte"/);
    expect(seite).toMatch(/quelle: "gps"/);
    expect(seite).toMatch(/Kunde/);
    expect(seite).toMatch(/Ohne Kunde/);
  });
  it("kann eine bestehende Position korrigieren und eine fehlende setzen", () => {
    expect(seite).toMatch(/Position korrigieren/);
    expect(seite).toMatch(/Position setzen/);
    expect(seite).toMatch(/setzModus=/);
    expect(seite).toMatch(/onSetzen=/);
  });
  it("zeigt Bäume ohne Koordinaten in der Liste mit Hinweis statt sie zu verstecken", () => {
    expect(seite).toMatch(/keine Position/);
  });
  it("zeigt im Baum-Detail die verknüpften Gefährdungsbeurteilungen", () => {
    expect(seite).toMatch(/Gefährdungsbeurteilungen/);
    expect(seite).toMatch(/gbuIds/);
  });
});

describe("GBU → Kataster", () => {
  const gbu = lesen("src/ui/GbuFormSkt.jsx");
  it("bietet das Aufnehmen nur an, wenn Modul und Endpunkt da sind", () => {
    expect(gbu).toMatch(/Baum ins Kataster aufnehmen/);
    expect(gbu).toMatch(/bkBaumAusGbu/);
    // Weiterhin über import.meta.glob, nie statisch — sonst bricht der Build
    // in Zweigen ohne die Datei ab.
    expect(gbu).not.toMatch(/^import .* from "\.\.\/baumkataster\.js"/m);
    expect(gbu).toMatch(/ladeModul\("\.\.\/baumkataster\.js"\)/);
  });
  it("legt zuerst den Baum an, dann die Kontrolle mit dem GBU-Verweis", () => {
    const a = gbu.indexOf('"/api/nc/baumkataster/baum/save"');
    const b = gbu.indexOf('"/api/nc/baumkataster/kontrolle/save"');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(gbu).toMatch(/Zusatzkontrolle|artKontrolle/);
  });
  it("lässt Vitalität und Verkehrssicherheit bestätigen, statt sie zu erfinden", () => {
    expect(gbu).toMatch(/BK_VITALITAET|vitalitaet/);
    expect(gbu).toMatch(/verkehrssicher/);
  });
  it("setzt weiterhin keinen User-Agent-Header (im Browser verboten)", () => {
    // M5 aus der Whole-Branch-Review: die reine Doppelquote-Prüfung liesse
    // 'User-Agent' (einfach quotiert) durchgehen.
    expect(gbu).not.toMatch(/['"]User-Agent['"]/i);
  });
  it("schließt den Dialog nach Erfolg, damit ein Doppeltipp keinen zweiten Baum anlegt", () => {
    const start = gbu.indexOf("const katasterAufnehmen");
    const ende = gbu.indexOf("\n  };", start);
    const funktion = gbu.slice(start, ende);
    const erfolgspfad = funktion.slice(0, funktion.indexOf("} catch"));
    expect(erfolgspfad).toMatch(/setKatasterNeu\(null\)/);
    // Die Wache im finally muss bleiben — sonst öffnet sich der Dialog nach
    // jedem Erfolg wieder, nur mit laeuft: false.
    expect(funktion).toMatch(/setKatasterNeu\(\(p\) => \(p \? \{ \.\.\.p, laeuft: false \} : null\)\)/);
  });
});

describe("Offline auf der Seite", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("benutzt die Schlüssel aus dem Offline-Modul, nicht eigene Zeichenketten", () => {
    expect(seite).toMatch(/from "\.\.\/baumkataster-offline\.js"/);
    expect(seite).toMatch(/BK_QUEUE_KEY/);
    expect(seite).toMatch(/bkCacheLesen\(|bkCacheSchreiben\(/);
    expect(seite).not.toMatch(/"blattwerk_bk_cache_/);
    expect(seite).not.toMatch(/"blattwerk_bk_ausstehend"/);
  });
  it("merkt beim Filter nur die Kundenauswahl, nicht den Textfilter", () => {
    // Task-8-Nachtrag: würde filterMerken um den Textfilter erweitert, sprünge
    // die Karte beim nächsten Öffnen doppelt — kein Test schlägt sonst an.
    expect(seite).toMatch(/JSON\.stringify\(\{ kunden: f\.kunden \}\)/);
  });
  it("Wächter (geparkter Befund, Whole-Branch-Review): filterMerken schreibt wirklich nur { kunden } in BK_FILTER_KEY", () => {
    // Der geparkte Befund "möglicher Doppelsprung der Karte beim Mounten" ist
    // NUR deshalb unschädlich, weil filterMerken ausschließlich { kunden:
    // f.kunden } speichert. Diese Zeile schreibt genau das fest — würde
    // filterMerken künftig um weitere Filterfelder erweitert (z. B. text),
    // müsste diese Invariante hier bewusst mit angefasst werden.
    expect(seite).toMatch(/localStorage\.setItem\(BK_FILTER_KEY, JSON\.stringify\(\{ kunden: f\.kunden \}\)\)/);
  });
  it("führt das Nachtrag-Ergebnis mit dem echten State zusammen, statt ihn zu überschreiben (C2 aus der Whole-Branch-Review)", () => {
    const nachtragen = seite.slice(seite.indexOf("const nachtragen ="), seite.indexOf("useEffect(() => { nachtragen(); }"));
    expect(nachtragen).toMatch(/bkNachtragZusammenfuehren\(warteschlange, warteschlangeRef\.current, rest\)/);
    expect(nachtragen).not.toMatch(/warteschlangeRef\.current = rest;/);
  });
  it("trägt beim Start, beim online-Ereignis und bei jedem neuen Vorgang nach, mit busy-Wächter", () => {
    expect(seite).toMatch(/bkNachtragen\(/);
    expect(seite).toMatch(/addEventListener\("online"/);
    expect(seite).toMatch(/nachtragLaeuft/);
    // Ein waehrend der Sitzung eingereihter Vorgang muss einen Versuch
    // ausloesen — am WLAN ohne Uplink kommt nie ein `online`-Ereignis.
    expect(seite).toMatch(/\[ncOk, warteschlange\.length\]/);
    // Wiedereintrittssperre: sonst sendet eine langsame Antwort doppelt.
    expect(seite).toMatch(/if \(nachtragLaeuft\.current/);
  });
  it("legt Fotos als Blob in IndexedDB, nicht in den localStorage", () => {
    expect(seite).toMatch(/BK_FOTO_DB/);
    // Die IndexedDB-Mechanik selbst steckt seit der Fix-Welle (18.09.2026,
    // Vorbereitung für feat/gbu-offline) in src/idb.js — die Seite ruft nur
    // noch die drei generischen Funktionen auf, kein eigenes openDB(…) mehr.
    expect(seite).toMatch(/from "\.\.\/idb\.js"/);
    expect(seite).toMatch(/idbSetzen\(|idbHolen\(|idbLoeschen\(/);
    expect(seite).not.toMatch(/openDB\(/);
    expect(seite).toMatch(/fotoSchluessel/);
    // Die Warteschlange hält nur die Schlüssel — kein base64 im localStorage.
    // Nur den OFFLINE-Zweig prüfen: der Online-Weg schickt die Bilder als
    // base64 an kontrolle/save und muss das weiter tun (verdrahtung.test.js
    // verlangt `fotos: fotos.map` im Wizard).
    const a = seite.indexOf("onOffline({");
    expect(a).toBeGreaterThan(-1);
    const offlineZweig = seite.slice(a, seite.indexOf("})", a) + 2);
    expect(offlineZweig).toMatch(/fotoSchluessel: schluessel/);
    expect(offlineZweig).not.toMatch(/base64/);
  });
  it("lässt die Maske offen, wenn der Gerätespeicher voll ist", () => {
    // Ein stiller Fehlschlag hier schließt die Maske über einen Eintrag, den
    // es nirgends gibt. `einreihen` wirft, `BaumForm.speichern` fängt.
    const ein = seite.slice(seite.indexOf("const einreihen ="), seite.indexOf("const einreihen =") + 600);
    expect(ein).toMatch(/throw new Error\("Kein Platz mehr im Gerätespeicher/);
    expect(ein).not.toMatch(/return null/);
    // queueSchreiben ohne try-Schlucker — sonst käme der volle Speicher nie an.
    expect(seite).toMatch(/const queueSchreiben = \(liste\) => localStorage\.setItem\(BK_QUEUE_KEY/);
  });
  it("entscheidet über den Statuscode, ob eingereiht wird — nicht über navigator.onLine", () => {
    // Am WLAN ohne Uplink steht navigator.onLine auf true; genau dann muss
    // eingereiht werden, sonst ist der Eintrag weg.
    expect(seite).toMatch(/res\.status === 400/);
    expect(seite).toMatch(/einreihen\(/);
    const schreibwege = seite.slice(seite.indexOf("const baumSpeichern"));
    expect(schreibwege).not.toMatch(/if \(navigator\.onLine\) throw/);
  });
  it("zeigt offline den Cache mit Stand und Anzahl wartender Vorgänge", () => {
    expect(seite).toMatch(/offline — Stand von/);
    expect(seite).toMatch(/Vorgäng/);
    expect(seite).toMatch(/bkAusstehendZusammenfuehren\(/);
  });
  it("zeigt auch den Kunden, der NUR in der Warteschlange steht", () => {
    // Erster Baum eines Kunden offline angelegt: es gibt noch keinen
    // Server-Store, der Baum waere sonst auf Karte und Liste unsichtbar.
    const teil = seite.slice(seite.indexOf("const anzeigeStores"), seite.indexOf("const anzeigeStores") + 800);
    expect(teil).toMatch(/new Set\(\[\.\.\.Object\.keys\(stores\), \.\.\.warteschlange/);
    expect(teil).toMatch(/BK_STORE_LEER/);
  });
  it("positionSetzen faengt einen Fehlschlag ab und verlaesst den Positionsmodus in jedem Fall", () => {
    // Aus der Task-8-Review: scheitert das Setzen (offline, realistischer
    // Feldfall), blieb setzePosition sonst stumm haengen — der Modus endete
    // nie, es erschien keine Meldung.
    const p = seite.slice(seite.indexOf("const positionSetzen ="), seite.indexOf("const massnahmeErledigt"));
    expect(p).toMatch(/try \{/);
    expect(p).toMatch(/catch \(e\)/);
    expect(p).toMatch(/showToast\(e\.message \|\| "Position konnte nicht gesetzt werden", "error"\)/);
    expect(p).toMatch(/finally \{[\s\S]*setSetzePosition\(null\)/);
  });
  it("meldet bei einer 400-Ablehnung keinen Erfolg beim Positionsetzen (I2 aus der Review)", () => {
    // baumSpeichern gibt bei einer 400 zurück, ohne zu werfen (zeigt seinen
    // eigenen Ablehnungs-Toast bereits selbst) — positionSetzen muss den
    // Rückgabewert auswerten, sonst zeigt es trotz Ablehnung zusätzlich
    // "Position gesetzt", widersprüchlich zum Ablehnungs-Toast.
    const bs = seite.slice(seite.indexOf("const baumSpeichern"), seite.indexOf("const positionSetzen ="));
    expect(bs).toMatch(/res\.status === 400.*return false;/);
    const p = seite.slice(seite.indexOf("const positionSetzen ="), seite.indexOf("const massnahmeErledigt"));
    expect(p).toMatch(/const ok = await baumSpeichern\(/);
    expect(p).toMatch(/if \(ok === true\) showToast\("Position gesetzt/);
    // Ohne Bedingung wäre der Erfolgstext auch bei einer Ablehnung (false) zu sehen.
    expect(p).not.toMatch(/await baumSpeichern\([^;]*;\s*showToast\("Position gesetzt/);
  });
  it("zeigt beim Einreihen (offline) nicht zusätzlich den widersprüchlichen Erfolgstext (M1 aus der Review)", () => {
    // baumSpeichern gibt im Offline-Fall zurück, dass nur EINGEREIHT wurde
    // (nicht `true`) — `einreihen` selbst zeigt bereits "Ohne Verbindung
    // gespeichert …"; ein zusätzliches "Position gesetzt" wäre widersprüchlich.
    const bs = seite.slice(seite.indexOf("const baumSpeichern"), seite.indexOf("const positionSetzen ="));
    const einreihenAufruf = bs.indexOf("einreihen({");
    const danach = bs.slice(einreihenAufruf, bs.indexOf("};", einreihenAufruf));
    expect(danach).not.toMatch(/return true;/);
    expect(danach).toMatch(/return "eingereiht";/);
    const p = seite.slice(seite.indexOf("const positionSetzen ="), seite.indexOf("const massnahmeErledigt"));
    expect(p).toMatch(/if \(ok === true\) showToast\("Position gesetzt/);
  });
});

describe("Halbe Koordinate abwehren (I3 aus der Whole-Branch-Review)", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("prüft in BaumForm beide Koordinatenfelder gemeinsam, bevor gespeichert wird", () => {
    const start = seite.indexOf("function BaumForm(");
    const speichern = seite.slice(seite.indexOf("const speichern = async () => {", start));
    const funktion = speichern.slice(0, speichern.indexOf("\n  };"));
    expect(funktion).toMatch(/lat/);
    expect(funktion).toMatch(/lon/);
    expect(funktion).toMatch(/halbe Position|beide Koordinaten/);
  });
});

describe("Rules of Hooks (C1 aus der Whole-Branch-Review)", () => {
  const seite = lesen("src/ui/BaumkatasterPage.jsx");
  it("kein Hook nach dem ersten return in BaumkatasterPage — sonst wirft React #300/#301 beim ersten Tipp auf einen Baum", () => {
    const start = seite.indexOf("export default function BaumkatasterPage");
    const ende = seite.indexOf("// ── Kontroll-Wizard");
    expect(start).toBeGreaterThan(-1);
    expect(ende).toBeGreaterThan(start);
    const komponente = seite.slice(start, ende);
    // Nicht die blosse Zeichenkette "return (" — die trifft auch auf
    // Aufräumfunktionen von Effekten ("return () => {...}"), von denen es in
    // dieser Komponente viele gibt, und würde vor dem eigentlichen JSX-Return
    // false-positiv anschlagen. Gesucht ist der erste Return, der tatsächlich
    // JSX liefert (öffnet mit "<" in der nächsten Zeile).
    const jsxReturn = /return \(\s*[\r\n]+\s*</;
    const treffer = jsxReturn.exec(komponente);
    expect(treffer).not.toBeNull();
    const danach = komponente.slice(treffer.index);
    expect(danach).not.toMatch(/\b(useMemo|useState|useEffect|useRef|useCallback)\(/);
  });
});
