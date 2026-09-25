// Eine Firma = eine Instanz = eine Datei /data/mandant.json. Dieses Modul ist
// die einzige Stelle, die entscheidet, was ein Mandant ist und welcher Block
// laeuft — App und Server importieren es beide, damit Oberflaeche und
// Endpunkte nie auseinanderlaufen (gleiches Muster wie src/arbeitsschutz.js).

import { DOLIBARR_URL_DEFAULT } from "./verbindung.js";
import { CHAT_UPSTREAM_STANDARD } from "./chat-proxy.js";
import { FB_FAHRZEUG_STANDARD } from "./fahrtenbuch.js";
import { FUNKTION_KEYS, funktionInfo, funktionenAufloesen, funktionenStandard } from "./funktionen.js";

export const BLOECKE = ["erp", "belege", "fahrtenbuch", "chat", "arbeitsschutz", "kalender", "telefon"];
export const PROFILE = ["baumpflege"];

// Jeder Block, der ohne fremden Dienst nicht funktioniert, nennt ihn hier.
// Fehlt die Adresse, bleibt der Block aus — sonst liefe ein fremder Mandant
// still gegen Blattwerks Nextcloud oder Blattwerks Dolibarr.
export const BLOCK_DIENST = {
  erp: "dolibarr", belege: "nextcloud", fahrtenbuch: "nextcloud", chat: "matrix",
  arbeitsschutz: "nextcloud", kalender: "nextcloud",
};

export const MANDANT_STANDARD = {
  kuerzel: "bw",
  name: "Blattwerk GbR",
  // Kurzform fuers Chrome der App (Browser-Tab, Startbildschirm, Topbar,
  // Anmeldebildschirm) — `name` bleibt die volle Rechtsform fuer Nachweise
  // (GBU-Kopfzeile, Rechnungen). Ohne eigene Angabe faellt die Darstellung
  // (src/mandant-server.mjs, dolibarr-app.jsx) auf `name` zurueck.
  anzeigeName: "Blattwerk",
  ort: "Musterstadt",
  logo: "/logo.png",
  // `akzent`/`dunkel` sind die App-eigenen Akzentfarben (Buttons, Chips, CSS-
  // Variablen); `thema` ist die Chrome-/Splashscreen-Farbe (Browser-Adressleiste,
  // PWA-Hintergrund) und bewusst getrennt, weil die App heute dunkel startet
  // (`#0f1117`), waehrend `akzent` das satte Gruen der Oberflaeche ist.
  farbe: { akzent: "#43a047", dunkel: "#2e7d32", thema: "#123527" },
  profil: "baumpflege",
  kontenrahmen: "SKR03",
  ustPflichtig: false,
  bloecke: { erp: true, belege: true, fahrtenbuch: true, chat: true, arbeitsschutz: true, kalender: true, telefon: true },
  // Fachliche Funktionen unterhalb der Bloecke (src/funktionen.js). Literal
  // statt funktionenStandard("bw"), damit beim Modul-Laden kein Aufruf in ein
  // Modul laeuft, das seinerseits blockAktiv von hier importiert.
  funktionen: {
    partner: true, angebote: true, rechnungen: true, projekte: true, lieferantenrechnungen: true,
    bestellungen: true, lager: true, spesen: true, zeiterfassung: true, baumkataster: true,
    gbu: true, betriebsanweisungen: true, qualifikationen: true, betriebsmittel: true,
    fahrtenbuch: true, ueberlassung: true, kalender: true, chat: true, telefon: true, tutorial: true, bank: true,
  },
  dienste: {
    dolibarr: DOLIBARR_URL_DEFAULT,
    nextcloud: "https://nextcloud.example.org",
    matrix: CHAT_UPSTREAM_STANDARD,
    updates: "https://apps.example.org/blattwerk",
    // Gleicher Wert wie PAPERLESS_BASE (process.env.PAPERLESS_URL-Fallback)
    // in server.mjs — dort steht der eigentliche Standard, hier nur die
    // Kopie fuer wachePaperless (mandant-server.mjs).
    paperless: "http://203.0.113.41:8010",
    // Neu seit Task 11 (Zugaenge-Kacheln auf der Startseite). Fuer Blattwerk
    // selbst noch keine dokumentierte, oeffentlich verlinkbare Adresse
    // hinterlegt — lieber leer (dienstLinks() blendet leere Eintraege aus)
    // als eine geratene URL in eine produktive Konfiguration zu schreiben.
    webmail: "",
    wordpress: "",
    vaultwarden: "",
  },
  // Mailadressen der Firma. `bestellMail` bekommt die Bestellmail
  // (/api/mail/order), `arbeitsschutzMail` die taegliche Fristen-Sammelmail
  // aus asErinnerungPruefen (server.mjs). Beide standen frueher als feste
  // Blattwerk-Adresse im Quelltext bzw. als ENV-Rueckfall — eine fremde
  // Instanz ohne eigene ENV mailte damit an Blattwerk (Abschlusspruefung
  // 18.09.2026, Befund I7). Wer hier ein Feld ergaenzt: die Adresse gehoert
  // in den Mandanten, NICHT als `|| "…@example.org"` in den
  // Aufrufer.
  kontakt: {
    bestellMail: "finanzen@example.org",
    arbeitsschutzMail: "max@example.org",
  },
  // anschrift/gewerk/appName speisen ausschliesslich die GBU-Kopf-/Fusszeile
  // (src/gbu-pdf.js) — ohne eigene Angabe faellt anschrift auf `ort` zurueck,
  // gewerk/appName bleiben dann einfach leer statt eine fremde Kennung zu
  // zeigen.
  betrieb: {
    uvTraeger: "SVLFG", grundGbu: "",
    anschrift: "Musterstraße 1, 12345 Musterstadt",
    gewerk: "Baum- und Gartenpflege",
    appName: "Blattwerk",
    // Name, unter dem die Firma Vertraege schliesst — Untertitel der
    // Fahrzeug-Ueberlassungsvereinbarung (src/ueberlassung.js). Bewusst
    // getrennt von `name` und `anzeigeName`: Blattwerk unterschreibt als
    // Marke, nicht als Rechtsform "Blattwerk GbR" und nicht als Kurzform
    // "Blattwerk". Ohne eigene Angabe faellt die Vereinbarung auf `name`
    // zurueck (die Rechtsform ist fuer einen Vertragspartner immer richtig,
    // nur eben laenger).
    vertragsName: "Blattwerk",
    // Foerderkulisse fuer den Foerder-Check der Bestellungen
    // (src/foerderung.js). Steht bewusst IN `betrieb`: dieses Objekt wird fuer
    // einen fremden Mandanten komplett neu aus dessen eigenen Angaben gebaut
    // (siehe mandantLaden unten), damit bekommt eine fremde Firma nie
    // Blattwerks LEADER-Region vorgeschlagen — ein regionales Programm, fuer
    // das sie gar nicht antragsberechtigt waere.
    foerderRegion: "landkreis-giessen",
  },
  // Vorbelegungen des Fahrtenbuchs — Blattwerks Hof und Blattwerks Fahrzeug
  // (Abschlusspruefung 18.09.2026, Befund I3). Beide standen fest im Code
  // (FB_START_STANDARD in dolibarr-app.jsx, FB_FAHRZEUG_STANDARD in
  // src/fahrtenbuch.js) und wurden dadurch in JEDE Fahrt jedes Mandanten
  // geschrieben, der den Startort leer liess bzw. noch kein Fahrzeug angelegt
  // hatte. Fuer einen fremden Mandanten ohne eigene Angabe gilt: lieber gar
  // kein Vorschlag als ein falscher — `startStandard` bleibt dann "" und
  // `fahrzeug` null.
  fahrtenbuch: {
    startStandard: "Betrieb, Zur Musterstraße 10, Musterstadt",
    fahrzeug: { ...FB_FAHRZEUG_STANDARD },
  },
  // Fester Kartenausschnitt des Baumkatasters (src/baumkataster.js,
  // bkKartenStart) — Blattwerks eigener Standort ist keine sinnvolle
  // Voreinstellung fuer eine andere Firma, ohne eigene Angabe gilt die
  // Deutschland-Uebersicht (BK_START).
  baumkataster: { kartenStart: null },
  rechte: {},
};

const istObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const misch = (standard, neu) => {
  const out = { ...standard };
  for (const [k, v] of Object.entries(neu || {})) {
    if (v === undefined) continue;
    out[k] = istObjekt(standard[k]) && istObjekt(v) ? misch(standard[k], v) : v;
  }
  // Stelle sicher, dass nestedebenen Objekte deep-kopiert sind, um Mutationen des Standards zu verhindern.
  for (const k of ["bloecke", "dienste", "farbe", "betrieb", "rechte", "kontakt", "fahrtenbuch", "funktionen"]) {
    if (istObjekt(out[k]) && out[k] === standard[k]) out[k] = { ...out[k] };
  }
  return out;
};

/** Datei-Inhalt (oder null) -> { mandant, fehler }. Wirft nie. */
export const mandantLaden = (roh) => {
  if (roh == null || roh === "") return { mandant: structuredClone(MANDANT_STANDARD), fehler: null };
  let daten;
  try { daten = JSON.parse(roh); } catch {
    daten = null;
  }
  if (!istObjekt(daten)) {
    // Darstellung darf weiterlaufen, Dienste nicht: lieber eine sichtbar kaputte
    // App als eine, die stillschweigend in fremde Daten schreibt.
    const aus = Object.fromEntries(BLOECKE.map((b) => [b, false]));
    const mandant = structuredClone(MANDANT_STANDARD);
    mandant.bloecke = aus;
    mandant.dienste = { dolibarr: "", nextcloud: "", matrix: "", updates: "" };
    // Eine kaputte Datei heisst "wir wissen nicht, wessen Instanz das ist" —
    // dieselbe Regel wie bei den Diensten: Blattwerks echte Bestelladresse
    // (kontakt.bestellMail) darf hier nicht aus dem structuredClone stehen
    // bleiben, sonst mailt eine fremde, kaputt konfigurierte Instanz ihre
    // Bestellungen an Blattwerks Finanzadresse.
    mandant.kontakt = Object.fromEntries(Object.keys(MANDANT_STANDARD.kontakt).map((k) => [k, ""]));
    return { mandant, fehler: "mandant.json ist unlesbar — alle Blöcke wurden abgeschaltet." };
  }
  const mandant = misch(MANDANT_STANDARD, daten);
  // Normalisiere Objekte nach dem Merge, falls die Eingabe null/null-ähnliche Werte hatte.
  if (!istObjekt(mandant.bloecke)) mandant.bloecke = {};
  if (!istObjekt(mandant.dienste)) mandant.dienste = {};
  if (!istObjekt(mandant.farbe)) mandant.farbe = {};
  if (!istObjekt(mandant.betrieb)) mandant.betrieb = {};
  if (!istObjekt(mandant.rechte)) mandant.rechte = {};
  if (!istObjekt(mandant.kontakt)) mandant.kontakt = {};
  if (!istObjekt(mandant.fahrtenbuch)) mandant.fahrtenbuch = {};
  if (!istObjekt(mandant.funktionen)) mandant.funktionen = { ...MANDANT_STANDARD.funktionen };
  // Ein fremder Mandant erbt NIE Blattwerks Dienste, Bestelladresse oder
  // Telefonanlage — misch() uebernimmt oben fehlende dienste/kontakt-Felder
  // sonst 1:1 aus MANDANT_STANDARD, und das sind Blattwerks ECHTE Adressen
  // (Nextcloud, Paperless, Matrix, Bestellmail). Eine Mandanten-Datei, die
  // einen Dienst schlicht vergisst, wuerde sonst still gegen Blattwerks
  // Instanz laufen, statt dass der zugehoerige Block ausbleibt. Deshalb hier
  // NICHT vom Standard erben, sondern die dienste/kontakt-Objekte fuer einen
  // fremden Mandanten komplett neu aus NUR den eigenen Angaben aufbauen —
  // jedes fehlende Feld wird "" statt geerbt.
  if (mandant.kuerzel !== MANDANT_STANDARD.kuerzel) {
    const eigeneDienste = istObjekt(daten.dienste) ? daten.dienste : {};
    mandant.dienste = Object.fromEntries(
      Object.keys(MANDANT_STANDARD.dienste).map((k) => [k, typeof eigeneDienste[k] === "string" ? eigeneDienste[k] : ""])
    );
    // Das GANZE kontakt-Objekt, nicht nur bestellMail: seit 18.09.2026 steht
    // dort auch arbeitsschutzMail, und ein Feld einzeln zu leeren ist genau
    // die Stelle, an der beim naechsten Feld wieder eine Blattwerk-Adresse
    // durchrutscht.
    const eigenerKontakt = istObjekt(daten.kontakt) ? daten.kontakt : {};
    mandant.kontakt = Object.fromEntries(
      Object.keys(MANDANT_STANDARD.kontakt).map((k) => [k, typeof eigenerKontakt[k] === "string" ? eigenerKontakt[k] : ""])
    );
    if (daten.bloecke?.telefon !== true) mandant.bloecke.telefon = false;
    // Dieselbe Regel gilt fuer das GESAMTE betrieb-Objekt, das seit Task 5 in
    // die GBU-Kopf-/Fusszeile einfliesst (src/gbu-pdf.js): uvTraeger,
    // grundGbu, Anschrift, Gewerk-Bezeichnung und App-Markenname sind
    // Blattwerks eigene Firmen-/Nachweisdaten. Wie bei dienste/kontakt oben
    // wird betrieb fuer einen fremden Mandanten komplett neu aus NUR den
    // eigenen Angaben aufgebaut, jedes fehlende Feld wird "" statt geerbt —
    // sonst zeigt das Nachweis-PDF eines fremden Mandanten Blattwerks
    // Adresse UND Blattwerks Versicherungstraeger/Grund-GBU-Nummer (Fund aus
    // der Review zu Task 5: uvTraeger/grundGbu fehlten hier zunaechst).
    const eigenesBetrieb = istObjekt(daten.betrieb) ? daten.betrieb : {};
    mandant.betrieb = Object.fromEntries(
      Object.keys(MANDANT_STANDARD.betrieb).map((k) => [k, typeof eigenesBetrieb[k] === "string" ? eigenesBetrieb[k] : ""])
    );
    // Ebenso die Kurzform des Namens (anzeigeName): ohne eigene Angabe soll
    // ein fremder Mandant nicht "Blattwerk" im Browser-Tab/Startbildschirm
    // zeigen (htmlMitMandant/manifestFuer fallen sonst auf mandant.name
    // zurueck, was fuer einen fremden Mandanten ohnehin korrekt ist).
    mandant.anzeigeName = typeof daten.anzeigeName === "string" ? daten.anzeigeName : "";
    // `ort` und `logo` sind genauso Blattwerks eigene Stammdaten wie `betrieb`
    // darueber und gehoeren deshalb in dieselbe Leerliste (Abschlusspruefung
    // 18.09.2026, Befund C1). `ort` sah harmlos aus ("nur fuer Topbar/Login"),
    // laeuft aber ueber mandantOeffentlich() -> mandantBetrieb()
    // (dolibarr-app.jsx) bis in die Kopfzeile des GBU-PDFs: gbu-pdf.js nimmt
    // `betrieb.anschrift || betrieb.ort`, und weil `anschrift` fuer einen
    // fremden Mandanten schon leer ist, stand dort vorher der eigene Ort fest — im
    // Nachweis nach § 5 ArbSchG einer fremden Firma. `logo` ist derselbe Fall
    // fuer Topbar, Anmeldebildschirm und das Ueberlassungs-PDF: "/logo.png"
    // ist Blattwerks Logo-Datei, kein neutraler Standard. Ohne eigene Angabe
    // lieber gar kein Ort/Logo als ein fremdes.
    mandant.ort = typeof daten.ort === "string" ? daten.ort : "";
    mandant.logo = typeof daten.logo === "string" ? daten.logo : "";
    // Und die Fahrtenbuch-Vorbelegungen (Befund I3): Blattwerks Hofadresse in
    // der Startort-Zeile und Blattwerks Ducato als Standardfahrzeug sind
    // Stammdaten, keine sinnvollen Voreinstellungen fuer eine andere Firma.
    const eigenesFb = istObjekt(daten.fahrtenbuch) ? daten.fahrtenbuch : {};
    mandant.fahrtenbuch = {
      startStandard: typeof eigenesFb.startStandard === "string" ? eigenesFb.startStandard : "",
      fahrzeug: istObjekt(eigenesFb.fahrzeug) && String(eigenesFb.fahrzeug.name || "").trim()
        ? {
          id: String(eigenesFb.fahrzeug.id || "fahrzeug"),
          name: String(eigenesFb.fahrzeug.name || ""),
          kennzeichen: String(eigenesFb.fahrzeug.kennzeichen || ""),
        }
        : null,
    };
    // Funktionen: ein fremder Mandant erbt nicht Blattwerks "alles an",
    // sondern den Fremd-Standard (Lager, Baumkataster, Ueberlassung aus) —
    // eigene Schalter der Datei gewinnen.
    const eigeneFunktionen = istObjekt(daten.funktionen) ? daten.funktionen : {};
    mandant.funktionen = { ...funktionenStandard(mandant.kuerzel) };
    for (const k of FUNKTION_KEYS) if (typeof eigeneFunktionen[k] === "boolean") mandant.funktionen[k] = eigeneFunktionen[k];
  }
  return { mandant, fehler: null };
};

export const blockAktiv = (mandant, name) => {
  if (!mandant || !BLOECKE.includes(name)) return false;
  if (mandant.bloecke?.[name] !== true) return false;
  if (name === "arbeitsschutz" && !PROFILE.includes(mandant.profil)) return false;
  const dienst = BLOCK_DIENST[name];
  if (dienst && !(mandant.dienste?.[dienst] || "").trim()) return false;
  return true;
};

// Was die Firma auf ihrer Startseite als Kacheln sieht (Task 11, Ansage
// Inhaber 18.09.2026: "die Links die ich in einstellungen sehe ... alles
// natuerlich schon unter der eigenen Domain"). Reihenfolge = Nutzungshaeufigkeit,
// leere Adressen tauchen nicht auf: ein Link, der ins Leere zeigt, ist
// schlimmer als kein Link. Bewusst OHNE "matrix": CHAT_UPSTREAM_STANDARD ist
// eine nackte LAN-IP auf Synapses Client-API-Port, keine browsbare Seite —
// eine "Chat"-Kachel dorthin waere genau der tote Link, den diese Liste
// vermeiden soll (Chat hat ohnehin einen eigenen Reiter in der App). Anders
// als bei den uebrigen Diensten ist das hier keine Geheimnis-Frage (siehe
// mandantOeffentlich() unten), sondern schlicht kein sinnvolles Klick-Ziel.
export const DIENST_LABEL = {
  dolibarr: "ERP (Dolibarr)",
  nextcloud: "Dateien & Kalender (Nextcloud)",
  webmail: "Webmail",
  wordpress: "Website (WordPress)",
  paperless: "Dokumente (Paperless)",
  vaultwarden: "Passwörter (Vaultwarden)",
  updates: "App-Updates",
};
// Dienste, deren hinterlegte Adresse nur aus dem Firmennetz/VPN erreichbar
// ist (nackte LAN-IP statt oeffentlichem Domainnamen) — Fix-Runde Task 11:
// die Kachel bleibt bestehen (ein Mitarbeiter im Buero/per NetBird braucht
// sie), bekommt aber einen sichtbaren Hinweis statt kommentarlos ins Leere
// zu laufen, sobald jemand von unterwegs draufklickt.
const DIENST_HINWEIS = {
  paperless: "Nur im Firmennetz/VPN erreichbar.",
};
export const dienstLinks = (mandant) =>
  Object.entries(DIENST_LABEL)
    .map(([schluessel, label]) => ({
      schluessel, label,
      url: (mandant?.dienste?.[schluessel] || "").trim(),
      hinweis: DIENST_HINWEIS[schluessel] || "",
    }))
    .filter((l) => l.url);

/**
 * Adressen aendern darf nur, wer Mandanten-Admin ist — nicht jeder
 * Dolibarr-Admin (`me.isAdmin`). Rein praesentationsseitig: die eigentliche
 * Durchsetzung sitzt server-seitig in `PUT /api/mandant`
 * (`istMandantAdmin`, src/mandant-server.mjs) und weist jeden anderen mit
 * 403 ab — diese Funktion entscheidet nur, ob die App ueberhaupt ein
 * Eingabefeld zeigt, nicht ob ein Schreibversuch durchkommt.
 */
export const darfDiensteAendern = (me, _mandant) => !!(me && me.isAdmin && me.mandantAdmin);

/** Was der Browser sehen darf — Allowlist, damit nie ein Geheimnis mitfaehrt. */
export const mandantOeffentlich = (mandant) => {
  const rechte = {};
  if (istObjekt(mandant.rechte)) {
    for (const [k, v] of Object.entries(mandant.rechte)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) rechte[k] = v;
    }
  }
  return {
    kuerzel: mandant.kuerzel,
    name: mandant.name,
    anzeigeName: mandant.anzeigeName || "",
    ort: mandant.ort,
    logo: mandant.logo,
    farbe: { akzent: mandant.farbe?.akzent, dunkel: mandant.farbe?.dunkel, thema: mandant.farbe?.thema },
    profil: mandant.profil,
    kontenrahmen: mandant.kontenrahmen,
    ustPflichtig: !!mandant.ustPflichtig,
    betrieb: {
      uvTraeger: mandant.betrieb?.uvTraeger, grundGbu: mandant.betrieb?.grundGbu,
      anschrift: mandant.betrieb?.anschrift || "", gewerk: mandant.betrieb?.gewerk || "", appName: mandant.betrieb?.appName || "",
      vertragsName: mandant.betrieb?.vertragsName || "",
      // Der Foerder-Check laeuft im Browser (BestellungenForm), also muss die
      // Kulisse mit nach vorn — sie ist keine Geheimnis-Angabe, sondern der
      // Landkreis, in dem die Firma sitzt.
      foerderRegion: mandant.betrieb?.foerderRegion || "",
      foerderKontakte: mandant.betrieb?.foerderKontakte || {},
    },
    rechte,
    // Unveraendert seit Task 1-10: nur dolibarr/updates. Das ist historisch
    // der Weg, auf dem die App SELBST mit einem Dienst spricht (Dolibarr-URL
    // fuer den API-Client, Update-Adresse fuers Manifest) — dafuer wurden nur
    // diese zwei je gebraucht, und diese Enge ist keine Geheimnis-Regel,
    // sondern schlicht der historische Umfang.
    dienste: { dolibarr: mandant.dienste?.dolibarr || "", updates: mandant.dienste?.updates || "" },
    // Aufgeloest (Block + Schalter + Kaskade), damit der Browser nie selbst rechnet.
    funktionen: funktionenAufloesen(mandant),
    // Zugaenge-Kacheln der Startseite (Task 11) — eigenes, oeffentlich
    // gedachtes Feld statt einer Erweiterung von `dienste` oben. Fix-Runde
    // 18.09.2026: "nextcloud" ist HIER bewusst NICHT ausgefiltert — die
    // Web-Adresse einer Nextcloud ist kein Geheimnis (sie ist ohnehin
    // oeffentlich erreichbar, sonst muesste jede Mitarbeiterin sie sich
    // selbst besorgen), schuetzenswert sind ausschliesslich Benutzername und
    // Passwort des Dienstkontos (`mandant.nextcloud.dienstkonto`) — die
    // liest kein Aufrufer dieser Funktion, sie stecken nur in
    // server.mjs/ncTeamCreds() bzw. der Umgebung. "matrix" fehlt dagegen
    // weiterhin komplett: das ist keine Geheimnis-Frage, sondern es gibt
    // dafuer schlicht keine browsbare Adresse (siehe DIENST_LABEL oben).
    // test/mandant/konfig.test.js sichert diese Grenze explizit ab.
    zugaenge: dienstLinks(mandant),
    kontakt: { bestellMail: mandant.kontakt?.bestellMail || "" },
    // Nextcloud-Gruppe fuer die Kalender-Freigabe (Befund I6). Nur der
    // Gruppenname — Benutzername und Passwort des Dienstkontos
    // (mandant.nextcloud.dienstkonto) bleiben serverseitig, siehe der
    // Kommentar bei `zugaenge` oben.
    nextcloud: { gruppe: ncGruppe(mandant) },
    // Vorbelegungen des Fahrtenbuchs (Befund I3). Kein Geheimnis: die
    // Hofadresse steht ohnehin auf jedem Lieferschein, das Kennzeichen an der
    // Stossstange — die App braucht beides im Browser.
    fahrtenbuch: {
      startStandard: mandant.fahrtenbuch?.startStandard || "",
      fahrzeug: istObjekt(mandant.fahrtenbuch?.fahrzeug) ? { ...mandant.fahrtenbuch.fahrzeug } : null,
    },
    // Kartenausschnitt des Baumkatasters (bkKartenStart) — kein Geheimnis,
    // der Betriebssitz steht ohnehin im Impressum.
    baumkataster: { kartenStart: istObjekt(mandant.baumkataster?.kartenStart) ? { ...mandant.baumkataster.kartenStart } : null },
    bloecke: Object.fromEntries(BLOECKE.map((b) => [b, blockAktiv(mandant, b)])),
  };
};

/**
 * Rechte-Zuordnung Gruppe -> Recht. Reihenfolge: Server (Mandant) schlaegt
 * immer. Der Geraete-Wert (`ausGeraet`, aus localStorage) ist KEINE
 * allgemeine Geraete-Voreinstellung, sondern ausschliesslich der einmalige
 * Uebergang fuer Blattwerks eigene Bestandsgeraete, die vor dieser Umstellung
 * schon eine eigene Einstellung hatten — er gilt deshalb nur, wenn `mandant`
 * Blattwerk selbst ist (`kuerzel === MANDANT_STANDARD.kuerzel`) oder noch gar
 * kein Mandant geladen wurde (`mandant` ist `null`/`undefined`, Blattwerks
 * heutiger Fall ohne eigene `/data/mandant.json`). Ein FREMDER Mandant ist
 * an dieser Uebergangsregel nie beteiligt: fehlt eine Zuordnung in seiner
 * eigenen Konfiguration, gilt fuer diesen Schluessel der Standard — nie ein
 * localStorage-Wert, der vom selben Geraet unter einem anderen Mandanten
 * (oder noch vor jeder Mandanten-Umstellung) gesetzt wurde.
 */
export const rechteMischen = (standard, mandant, ausGeraet) => {
  const out = { ...standard };
  const istBlattwerkOderUngeladen = !mandant || mandant.kuerzel === MANDANT_STANDARD.kuerzel;
  if (istBlattwerkOderUngeladen) {
    for (const [k, v] of Object.entries(ausGeraet || {})) if (Array.isArray(v)) out[k] = v;
  }
  for (const [k, v] of Object.entries(mandant?.rechte || {})) if (Array.isArray(v)) out[k] = v;
  return out;
};

// Ein Segment, das (nach dem Stutzen fuehrender/abschliessender Schraeg-
// striche) nur noch aus Punkten besteht (".", "..", "...", …) waere in einem
// WebDAV-Pfad ein Sprung ins aktuelle bzw. uebergeordnete Verzeichnis, kein
// echter Ordnername — genau das Muster, gegen das dokSafe() in server.mjs
// den Dokumente-Unterordner schon schuetzt. ncOrdner() braucht dieselbe
// Pruefung: ein hand editiertes mandant.json mit `"nextcloud":{"ordner":".."}`
// oder `"name":".."` wuerde sonst ordnerUrl() einen echten Pfadsprung bauen
// lassen (encodeURIComponent laesst Punkte unveraendert durch). Fix Round 2,
// 2026-09-18 — nur per Hand erreichbar (mandantPruefen weist es beim
// regulaeren PUT /api/mandant schon vorher ab), trotzdem hier zusaetzlich
// abgefangen, weil ncOrdner() die einzige Stelle ist, die JEDER Aufrufer
// (App, server.mjs, Fachmodule) tatsaechlich benutzt.
export const istNurPunkte = (s) => /^\.*$/.test(String(s ?? "").trim());

/** Team-Ordner der Firma in Nextcloud. Nie stillschweigend „Blattwerk“ fuer
 *  eine fremde Firma — deren Dokumente gehoeren in deren eigenen Ordner. */
export const ncOrdner = (mandant) => {
  const eigen = (mandant?.nextcloud?.ordner || "").trim().replace(/^\/+|\/+$/g, "");
  if (eigen && !istNurPunkte(eigen)) return eigen;
  if (mandant?.kuerzel === MANDANT_STANDARD.kuerzel) return "Blattwerk";
  const name = String(mandant?.name || "").trim();
  return istNurPunkte(name) ? "" : name;
};

/**
 * Nextcloud-Gruppe der Firma — Vorbelegung fuer die Kalender-Freigabe
 * (NextcloudPanel, /api/nc/share-group).
 *
 * Bis 18.09.2026 stand dort fest "Blattwerk" (Abschlusspruefung, Befund I6).
 * Alle Mandanten teilen sich EINE Nextcloud; ein fremder Admin gab damit mit
 * einem Klick seinen Firmenkalender fuer Blattwerks Gruppe frei — inklusive
 * aller Termine, die dort schon drin stehen.
 *
 * Ohne eigene Angabe gilt derselbe Name wie fuer den Team-Ordner (ncOrdner):
 * Ordner und Gruppe heissen bei Blattwerk beide "Blattwerk", und das ist auch
 * fuer eine neue Firma die naheliegende Einrichtung. `nextcloud.gruppe` in der
 * mandant.json ueberschreibt das, falls die Gruppe anders heisst.
 */
export const ncGruppe = (mandant) => {
  const eigen = String(mandant?.nextcloud?.gruppe || "").trim();
  return eigen || ncOrdner(mandant);
};

/** Liegt der Pfad im Ordner dieser Firma? Schuetzt gegen ../ und gegen
 *  Pfade, die aus einer aelteren App-Fassung noch „Blattwerk/…“ schicken. */
export const ncPfadPruefen = (mandant, pfad) => {
  const p = String(pfad || "");
  if (p.includes("..")) return false;
  return p.replace(/^\/+/, "").startsWith(ncOrdner(mandant) + "/");
};

/** Pruefung fuer PUT /api/mandant. Gibt eine deutsche Meldung zurueck oder null. */
export const mandantPruefen = (neu) => {
  if (!istObjekt(neu)) return "Es wurde kein Objekt übergeben.";
  if (!/^[a-z0-9]([a-z0-9-]{0,10}[a-z0-9])?$/.test(String(neu.kuerzel || ""))) return "Das Kürzel fehlt oder enthält unerlaubte Zeichen (a–z, 0–9, Bindestrich; keine Bindestriche am Anfang oder Ende).";
  if (!String(neu.name || "").trim()) return "Der Name der Firma fehlt.";
  // Beide Felder koennen der Nextcloud-Ordner werden (ncOrdner() in diesem
  // Modul, direkt vom Namen bzw. von nextcloud.ordner abgeleitet) — ein
  // reiner Punktname waere dort ein Pfadsprung, kein Ordnername (Fix Round 2,
  // 2026-09-18). ncOrdner() faengt das ebenfalls ab, aber hier VOR dem
  // Speichern abweisen ist der bessere Ort: eine kaputte Angabe kommt so gar
  // nicht erst in die mandant.json.
  if (istNurPunkte(neu.name)) return "Der Name der Firma darf nicht nur aus Punkten bestehen.";
  if (neu.nextcloud?.ordner !== undefined && neu.nextcloud.ordner !== "" && istNurPunkte(String(neu.nextcloud.ordner).replace(/^\/+|\/+$/g, ""))) {
    return "Der Nextcloud-Ordner darf nicht nur aus Punkten bestehen.";
  }
  for (const b of Object.keys(neu.bloecke || {})) if (!BLOECKE.includes(b)) return `Unbekannter Block: ${b}`;
  if (neu.bloecke?.arbeitsschutz === true && !PROFILE.includes(neu.profil ?? MANDANT_STANDARD.profil)) {
    return "Arbeitsschutz gibt es nur mit einem bekannten Gewerk-Profil (derzeit: baumpflege).";
  }
  for (const [k, v] of Object.entries(neu.funktionen || {})) {
    if (!FUNKTION_KEYS.includes(k)) return `Unbekannte Funktion: ${k}`;
    if (typeof v !== "boolean") return `Funktion ${k}: nur an/aus (true/false) erlaubt.`;
    if (v === false && funktionInfo(k)?.pflicht) return `${funktionInfo(k).label} lässt sich nicht abschalten.`;
  }
  return null;
};
