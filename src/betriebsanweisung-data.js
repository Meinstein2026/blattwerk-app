// src/betriebsanweisung-data.js
// Textbausteine der Betriebsanweisung Seilklettertechnik (18.09.2026).
//
// Anlass: Die SVLFG verlangt für den SKT-Einsatz drei Dinge vor Ort — die
// einsatzortbezogene Gefährdungsbeurteilung (gibt es bereits, GbuFormSkt),
// eine Betriebsanweisung (hier) und die Unterweisung der Versicherten
// (src/betriebsanweisung.js, Unterweisungsnachweis). Wörtlich in b09.txt,
// Zeile 121-124 unter der Überschrift „Weitere Anforderungen an den
// Betrieb": „schriftliche Gefährdungsbeurteilung für Einsatz der SKT" /
// „schriftliche Betriebsanweisung für Einsatz der SKT" — eine Pflicht des
// BETRIEBS, unabhängig davon, ob und wie viele Beschäftigte es gibt.
// Ebenso b09.txt Zeile 236-242 und vsg42.txt Zeile 386-402: der Unternehmer
// hat VOR Beginn der Arbeiten die Betriebsanweisung zu erstellen; sie ist
// „am Arbeitsplatz vorzuhalten" (vsg42.txt Zeile 400-402).
//
// Alle Inhalte unten sind wortgetreu (bis auf Rechtschreib-/Layoutglättung
// aus dem PDF-Textextrakt) aus den beiden Vorschriftentexten übernommen,
// die im Worktree als b09.txt (SVLFG-Broschüre „Seilklettertechnik im
// Gartenbau") und vsg42.txt (UVV Gartenbau, Obstbau und Parkanlagen)
// liegen. NICHTS davon ist frei formuliert. Fundstellen stehen je Block.
//
// Zwei Fassungen, weil die Vorschrift selbst zwei Betriebsanweisungen kennt:
//   skt-a: „Seilklettertechnik (SKT A)" — SKT OHNE Motorsägeneinsatz
//          (b09.txt Zeile 611-687).
//   skt-b: „Seilklettertechnik mit Motorsäge (SKT B)" — ergänzt SKT A um
//          Motorsägen- und Abseiltechnik-Gefahren (b09.txt Zeile 690-763).
//          Die Vorschrift sagt selbst: „Grundlage bildet die Betriebs­
//          anweisung Seilklettertechnik (SKT A)" (Zeile 698) und „Die
//          Betriebsanweisung für die Seilklettertechnik (SKT A) ist
//          zwingend zu beachten" (Zeile 710) — SKT B ergänzt A also, statt
//          sie zu ersetzen; die Zusammenstellung dazu steht in
//          betriebsanweisung.js (baErstellen).
//
// „Verhalten bei Störungen", „Verhalten bei Unfällen/Erste Hilfe" und
// „Sachgerechter Umgang mit PSA und Ausrüstung" (= Instandhaltung und
// Prüfung) sind in beiden Fassungen der Vorschrift inhaltsgleich
// (b09.txt Zeile 660-682 bzw. 737-758) — hier deshalb bewusst nur einmal
// hinterlegt statt doppelt gepflegt.

import { mandantBetrieb } from "./betrieb.js";
import { mandantAusCache } from "./mandant-client.js";

/** Rückfall, wenn (noch) kein Mandant geladen ist — siehe BETRIEB_STANDARD. */
export const BA_BETRIEB = "Baum- und Gartenpflege Blattwerk GbR · Musterstraße 1, 12345 Musterstadt · UV-Träger: SVLFG";

/**
 * Betriebszeile der Betriebsanweisung aus der Mandanten-Konfiguration —
 * gleiches Muster wie der Kopf in gbu-pdf.js/einweisung-pdf.js, statt fest im
 * Quelltext zu stehen.
 */
export function baBetriebKopf() {
  const betrieb = mandantBetrieb(mandantAusCache());
  const gewerk = betrieb.gewerk ? `${betrieb.gewerk} ` : "";
  const anschrift = betrieb.anschrift || betrieb.ort || "";
  return `${gewerk}${betrieb.name || ""} · ${anschrift} · UV-Träger: ${betrieb.uvTraeger || ""}`;
}

export const BA_QUELLE = 'SVLFG-Broschüre B09 „Seilklettertechnik im Gartenbau", Stand 12/07 (VSG 4.2)';

export const BA_ARTEN = [
  { id: "skt-a", label: "Seilklettertechnik (SKT A)" },
  { id: "skt-b", label: "Seilklettertechnik mit Motorsäge (SKT B)" },
];

// ─── SKT A — b09.txt Zeile 611-687 ──────────────────────────────────────────

// b09.txt Zeile 615.
export const BA_ANWENDUNGSBEREICH_A = "Einsatz der Seilklettertechnik bei Baumarbeiten (ohne Motorsägeneinsatz).";

// b09.txt Zeile 618-623 (zweispaltige Liste, hier zusammengeführt).
export const BA_GEFAHREN_A = [
  "Absturz durch Seildurchtrennung",
  "Absturz durch Fehler in der Seilklettertechnik",
  "Sturz-/Pendelsturz ins Sicherungssystem",
  "Verletzung durch Arbeitsgerät",
  "Fallende Objekte",
  "Versagende Ankerpunkte",
  "Gefährliche Witterung",
  "Strom im Bereich von Freileitungen",
  "Versagende Ausrüstung",
  "Holz unter Spannung",
];

// b09.txt Zeile 627-658 (rechte Spalte der Vorlage; die linke Spalte ist ein
// Kran-Glossar aus einem anderen Kapitel und gehört fachlich nicht hierher).
export const BA_SCHUTZMASSNAHMEN_A = [
  "Nur ausgebildete und geprüfte, gesundheitlich geeignete Anwender dürfen die SKT einsetzen.",
  "Anwender der SKT dürfen nur ihrer Qualifikation und Erfahrung entsprechende Arbeiten durchführen.",
  "Jeder Anwender der SKT muss ausgebildeter Ersthelfer sein.",
  "Arbeitseinsätze sind durch einen Aufsichtsführenden zu leiten.",
  "Mindestens zwei ausgebildete und ausgerüstete Anwender in Ruf- und Sichtverbindung bei jedem Arbeitseinsatz.",
  "Vor Beginn der Arbeiten ist eine Gefährdungsermittlung durchzuführen.",
  "Auf Grundlage der Gefährdungsermittlung sind geeignete Arbeitsverfahren auszuwählen.",
  "Entsprechend der Gefährdungsermittlung ist ein Rettungsseil einzusetzen.",
  "Jede Person auf der Baustelle hat die erforderliche PSA zu tragen.",
  "Ständige Sicherung im absturzgefährdeten Bereich.",
  "Nur geeignete, betriebssichere Ausrüstung einsetzen (Prüfung vor/nach und während der Anwendung).",
  "Die Ausrüstung nur entsprechend der Sicherheitsregeln einsetzen.",
  "Ausrüstung zur Sicherung von Personen darf nicht für andere Zwecke benutzt werden.",
  "Nur ausreichend belastbare und tragfähige Ankerpunkte benutzen.",
  "Die SKT nicht bei gefahrbringender Witterung einsetzen.",
  "Der Gefahrenbereich ist festzulegen und abzusichern.",
  "Der Gefahrenbereich ist vor dem Abwerfen von Objekten zu überprüfen.",
  "Vor dem Abwerfen von Objekten ist ein Warnruf zwingend erforderlich, die Antwort ist abzuwarten.",
  "Bei Arbeiten an Stromleitungen Sicherheitsabstände einhalten oder Freischaltung veranlassen.",
  "Arbeit im Baum erst beginnen, wenn sichere, stabile Arbeitsposition eingenommen wurde.",
  "In der Arbeitsposition und bei Gefahr der Seildurchtrennung zusätzliche Sicherung.",
  "Nur selbstblockierende Einstellvorrichtungen benutzen.",
  "Nur geeignete Knoten und Endverbindungen benutzen.",
  "Seilenden sind entsprechend zu sichern.",
  "Nur Sicherheitskarabinerhaken benutzen (automatisch verriegelnd/drei Bewegungen zum Öffnen).",
  "Die VSG 4.2 und die Sicherheitsregeln für die SKT sind einzuhalten.",
];

// ─── SKT B — b09.txt Zeile 690-763, ERGÄNZEND zu SKT A ──────────────────────

// b09.txt Zeile 697-698.
export const BA_ANWENDUNGSBEREICH_B =
  "Ergänzende Betriebsanweisung für Einsatz der Seilklettertechnik in Verbindung mit Motorsägen und Abseiltechnik " +
  "(Grundlage bildet die Betriebsanweisung Seilklettertechnik (SKT A)).";

// b09.txt Zeile 700-707 (zweispaltige Liste, zusammengeführt). Eigenständige
// Liste der Vorschrift für SKT B, nicht additiv zu BA_GEFAHREN_A gemeint.
export const BA_GEFAHREN_B = [
  "Absturz durch Seildurchtrennung",
  "Absturz durch Fehler in der Sicherheitstechnik",
  "Sturz-/Pendelsturz ins Sicherungssystem",
  "Versagen des Ankerpunktes",
  "durch höhere Lasten beim Abseilen von Ästen und Stammteilen",
  "Einsatz der Motorsäge",
  "fehlende Absicherung des Gefahrenbereiches",
  "Steigeiseneinsatz",
  "Einklemmen der Motorsäge",
  "gefährliche Witterung",
  "Strom im Bereich von Freileitungen",
  "versagende Ausrüstung",
  "Holz unter Spannung",
];

// b09.txt Zeile 711-735. Der erste Punkt der Vorschrift („Die Betriebs­
// anweisung für die Seilklettertechnik (SKT A) ist zwingend zu beachten.")
// ist hier weggelassen, weil betriebsanweisung.js SKT A bei „mit Motorsäge"
// ohnehin voranstellt (baErstellen) — der Verweis wäre sonst doppelt zu lesen.
export const BA_SCHUTZMASSNAHMEN_B_ZUSAETZLICH = [
  "Vor Beginn der Arbeiten ist eine Gefährdungsermittlung durchzuführen. Auf Grundlage der Gefährdungsermittlung sind geeignete Arbeits- u. Sicherungsverfahren einzusetzen.",
  "Baumsicherheitsbeurteilung vor/während der Arbeit, nur ausreichend belastbare und tragfähige Ankerpunkte nutzen.",
  "Jede Person auf der Baustelle hat die erforderliche PSA zu tragen.",
  "Mindestens zwei ausgebildete und ausgerüstete Anwender in Ruf- und Sichtverbindung bei jedem Arbeitseinsatz.",
  "Nur geeignete, betriebssichere Ausrüstung einsetzen (Prüfung vor/nach und während der Anwendung).",
  "Der Gefahrenbereich ist festzulegen und abzusichern und vor dem Abwerfen von Objekten zu überprüfen.",
  "Vor dem Abwerfen von Objekten ist ein Warnruf zwingend erforderlich, die Antwort ist abzuwarten.",
  "Geeignete Abseiltechniken mit betriebssicherer Ausrüstung einsetzen.",
  "Hohe Fangstöße vermeiden, Ankerpunkt oberhalb der Last wählen, wenn möglich, Lasten dynamisch abseilen.",
  "Belastbarkeit der Ankerpunkte und der Ausrüstung (Sicherheitsfaktor 1-10) beachten.",
  "Größe und Gewicht der abzuseilenden Stücke beachten.",
  "Lasten richtig anschlagen, Aufenthalt unter der Last vermeiden.",
  "Geeignete, situationsgerechte Schnitttechniken einsetzen, Fäll- und Fallrichtung sowie Spannung im Holz beachten.",
  "Sichere Arbeitsposition im Hinblick auf ein Pendeln der Last einnehmen.",
  "Arbeit im Baum erst beginnen, wenn sichere, stabile Arbeitsposition (Drei Punkte) eingenommen wurde.",
  "Doppelte Sicherung (Redundanz) beim Motorsägeneinsatz, Halteseil mit Durchtrennschutz verwenden.",
  "Motorsäge mit beiden Händen führen, Kettenbremse nur zum Schneiden lösen.",
  "Halteseil der Motorsäge muss Sollbruchstelle haben.",
  "Sicherungsseil vor dem Fällschnitt vom zu fällenden Stück lösen, Position des Halteseiles überprüfen.",
  "Steigeisen vorsichtig einsetzen.",
  "Die VSG 4.2 und die Sicherheitsregeln für die SKT sind einzuhalten.",
];

// ─── Für beide Fassungen gleich — b09.txt Zeile 660-682 (SKT A) / 737-758 (SKT B) ──

/** b09.txt Zeile 661-664. */
export const BA_STOERUNGEN = [
  "Beschädigte Ausrüstung ist sofort der Benutzung zu entziehen.",
  "Jeder sicherheitsrelevante Vorfall ist Aufsichtsführenden umgehend mitzuteilen.",
  "Bei gefahrbringender Witterung sind die Arbeiten sofort einzustellen.",
  "Bei Personen im Gefahrenbereich Arbeit sofort stoppen, erst wenn der Gefahrenbereich frei ist fortsetzen.",
];

/**
 * b09.txt Zeile 669-676. „Ersthelfer" und „Notruf" stehen in der Vorlage als
 * Kopfzeile mit Leerstellen (Zeile 668: „Ersthelfer: Herr / Frau ______
 * Notruf: 112") — betriebsspezifisch, deshalb Platzhalter statt Bullet.
 */
export const BA_ERSTE_HILFE = [
  "Alle Arbeiten sind sofort einzustellen.",
  "Ruhe bewahren/Verletzten ansprechen/Situation beurteilen und auf Gefahren überprüfen/Maßnahmen planen.",
  "Notruf absetzen: Wer/Was/Wo/Wie viele/Welche, genaue Ortsbeschreibung/Einweiser.",
  "Die Rettung ist unter Berücksichtigung der Situation unverzüglich einzuleiten.",
  "Nach Erreichen des Verletzten Erste Hilfe leisten und abhängig von seinem Zustand weitere Maßnahmen ergreifen.",
  "Personen, die im Gurt hingen, müssen, wenn keine dringenden medizinischen Gründe dagegen sprechen, halbsitzend oder in Kauerstellung gelagert werden.",
  "Der Sicherung des Retters ist Vorrang zu geben.",
];
export const BA_NOTRUF_STANDARD = "112";

/**
 * b09.txt Zeile 679-682: „Sachgerechter Umgang mit PSA und Ausrüstung" — im
 * Reiter/PDF „Instandhaltung und Prüfung" genannt (Aufgabenstellung), weil das
 * der in Arbeitsschutz-Betriebsanweisungen übliche Abschnittsname ist und
 * genau diese vier Punkte beschreibt (Lagerung, Aussonderung, Prüfung durch
 * den Anwender, jährliche Prüfung durch eine befähigte Person). Ergänzt um
 * die Normenliste aus vsg42.txt Zeile 429-450 (Ausrüstung für die SKT).
 */
export const BA_INSTANDHALTUNG = [
  "Die Ausrüstung ist entsprechend der Anweisung der Hersteller frei von schädlichen Einflüssen zu lagern.",
  "Beschädigte, kontaminierte und unbrauchbar gewordene Ausrüstung ist sofort außer Betrieb zu nehmen.",
  "Die Ausrüstung ist vor, während und nach der Benutzung durch den Anwender zu überprüfen.",
  "Die Ausrüstung ist einmal jährlich von einem Sachkundigen nach BGG 906 mit schriftlichem Nachweis zu prüfen.",
];

/** vsg42.txt Zeile 431-449 — genormte Ausrüstung, die die SKT voraussetzt. */
export const BA_AUSRUESTUNG_NORMEN = [
  "Sitzgurt EN 813, EN 358 und optional EN 361",
  "Kletterseile mit geringer Dehnung, EN 1891",
  "Sicherungs- und Klemmknotenseile/-schlingen nach EN 358, EN 566 oder EN 795 B",
  "Kambiumschoner nach EN 795 B und CEN/TS 16415 (2-Personen-Nutzung)",
  "Bandfalldämpfer nach EN 355",
  "Bandschlingen nach EN 566 und EN 354 (Verbindungsmittel)",
  "Karabiner nach EN 362 und EN 12275, Mindestbruchlast 20 kN, automatisch schließend/verriegelnd, mind. drei Bewegungen zum Öffnen",
  "Verstelleinrichtungen nach EN 12841",
  "Seilklemmen nach EN 567",
  "Umlenkrollen als PSA nach EN 12278",
];

/** b09.txt Zeile 684-687 / 760-763 — Erklärung des Unternehmers, wortgleich in beiden Fassungen. */
export const BA_UNTERNEHMER_ERKLAERUNG =
  "Es wird bestätigt, dass die Inhalte dieser Betriebsanweisung mit den betrieblichen Verhältnissen und Erkenntnissen der Gefährdungsbeurteilung übereinstimmen.";

/** Die sechs Gliederungspunkte, in der in der Aufgabenstellung verlangten Reihenfolge. */
export const BA_ABSCHNITTE_IDS = [
  "anwendungsbereich",
  "gefahren",
  "schutzmassnahmen",
  "stoerungen",
  "erstehilfe",
  "instandhaltung",
];
export const BA_ABSCHNITT_TITEL = {
  anwendungsbereich: "Anwendungsbereich",
  gefahren: "Gefahren für Mensch und Umwelt",
  schutzmassnahmen: "Schutzmaßnahmen und Verhaltensregeln",
  stoerungen: "Verhalten bei Störungen",
  erstehilfe: "Verhalten bei Unfällen und Erste Hilfe",
  instandhaltung: "Instandhaltung und Prüfung",
};
