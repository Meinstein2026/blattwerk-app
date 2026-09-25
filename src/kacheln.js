// Katalog der Kacheln (Startseite + Verwaltung), deren Sichtbarkeit im
// Adminbereich je Dolibarr-Gruppe einstellbar ist (Spec 2026-09-23, Wunsch
// Inhaber: „alle Kacheln"). Recht-Schluessel "kachel_<id>" in mandant.rechte,
// Standard ["*"] = alle. Erkannt wird eine Kachel an ihrem LABEL, damit die
// bestehenden Kachel-Zeilen unveraendert bleiben (Tests lesen sie woertlich).
// NUR Anzeige — ausser alleDokumente: das prueft auch der Server
// (src/pl-rechte.mjs). Kontostaende und Bank fehlen hier bewusst, sie
// haengen an eigenen Finanzrechten (viewFinanzen, viewBank).
import { PL_RECHT_ALLE_STANDARD } from "./paperless.js";

export const KACHELN = [
  { id: "angebote", label: "Neues Angebot", ort: "Startseite" },
  { id: "bestellungen", label: "Bestellung aufgeben", ort: "Startseite" },
  { id: "zeiterfassung", label: "Zeiterfassung", ort: "Startseite" },
  { id: "fahrtenbuch", label: "Fahrtenbuch", ort: "Startseite" },
  { id: "arbeitsschutz", label: "Arbeitsschutz", ort: "Startseite" },
  { id: "betriebsmittel", label: "Betriebsmittel", ort: "Startseite + Verwaltung" },
  { id: "lieferantenrechnung", label: "Lieferantenrechnung", ort: "Startseite" },
  { id: "spesen", label: "Spesen", ort: "Startseite" },
  { id: "gbu", label: "Gefährdungsbeurteilungen", ort: "Verwaltung" },
  { id: "wichtigeDokumente", label: "Wichtige Dokumente", ort: "Verwaltung" },
  { id: "pruefprotokolle", label: "Kletterzeug-Prüfprotokolle", ort: "Verwaltung" },
  { id: "baumkataster", label: "Baumkataster", ort: "Verwaltung" },
  { id: "hochladen", label: "Dokument hochladen", ort: "Verwaltung" },
  { id: "alleDokumente", label: "Alle Dokumente", ort: "Verwaltung", standard: PL_RECHT_ALLE_STANDARD },
];

export const kachelKey = (id) => "kachel_" + id;
export const KACHEL_RECHTE = KACHELN.map((k) => kachelKey(k.id));
export const KACHEL_STANDARD = Object.fromEntries(KACHELN.map((k) => [kachelKey(k.id), k.standard || ["*"]]));
export const kachelId = (label) => KACHELN.find((k) => k.label === label)?.id || null;

/**
 * Kacheln ausblenden, die `me` nicht sehen darf. Unbekannte Kacheln (nicht im
 * Katalog) bleiben immer sichtbar, ebenso alles, solange `me.kachel` fehlt
 * (/users/info fehlgeschlagen) — lieber eine Kachel zu viel als eine leere Seite.
 */
export const kachelnFiltern = (me, liste) =>
  liste.filter((t) => {
    const id = kachelId(t.label);
    return !id || typeof me?.kachel !== "function" || me.kachel(id);
  });
