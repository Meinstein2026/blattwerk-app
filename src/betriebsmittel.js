// Betriebsmittel-Register — ein Los je Einzelstueck (12.09.2026).
//
// Warum es das gibt: Dolibarrs Barcode haengt am ARTIKEL. Alle vier Reifen
// desselben Typs haetten denselben Code, und niemand koennte sagen, welcher
// davon vorne links sitzt, wie alt er ist oder wie tief sein Profil noch ist.
// Traeger der Stueck-Identitaet ist deshalb das Los (`llx_product_lot`):
// eigene Nummer, eigener Barcode, eigene Datumsangaben.
//
// Dolibarr fuehrt diese Daten zwar, rechnet aber NICHTS daraus aus und warnt
// bei keiner Frist. Das ist die Aufgabe dieses Moduls. Die Stufen heissen
// absichtlich wie im Arbeitsschutz (`EW_STUFEN_TEXT` in arbeitsschutz.js),
// damit Farbe und Wortlaut dort weiterbenutzt werden koennen.
//
// Die vier Fristen am Stueck sind unabhaengig voneinander:
//
//   eatby                          Verfall des Inhalts   — Verbandkasten
//   letzte_pruefung + qc_frequency wiederkehrende Pruefung — PSA, jaehrlich
//   eol_date                       festes Lebensende     — Akku, Helm
//   manufacturing_date + lifetime  Alter ab Herstellung  — Reifen, Helm
//
// ACHTUNG: `qc_frequency` und `lifetime` werden hier als TAGE gelesen. So
// legt die App sie an. Wer die Werte in Dolibarrs Oberflaeche von Hand setzt,
// muss dieselbe Einheit benutzen.
import { ewTage, fristStatus, EW_VORWARNUNG_TAGE } from "./arbeitsschutz.js";

export const BM_VORWARNUNG_TAGE = EW_VORWARNUNG_TAGE; // 30

/**
 * Datumsangabe auf den Tag bringen.
 *
 * ACHTUNG, am lebenden Dolibarr 22.0.4 nachgemessen: die REST-Schnittstelle
 * gibt Datumsfelder als **Unix-Zeitstempel in Sekunden** zurueck
 * (`eatby: 1872194400`), nicht als Zeichenkette — obwohl in der Datenbank
 * `2029-04-30` steht. Wer hier nur auf `YYYY-MM-DD` prueft, bekommt fuer
 * jedes gefuellte Datum „ungueltig" und damit eine Ampel, die nie warnt.
 */
const tag = (wert) => {
  if (wert === null || wert === undefined || wert === "") return null;
  if (typeof wert === "number" || /^\d{9,}$/.test(String(wert).trim())) {
    const ms = Number(wert) * 1000;
    if (!Number.isFinite(ms)) return null;
    // ORTSZEIT, nicht UTC: Dolibarr legt ein reines Datum als Mitternacht der
    // Server-Zeitzone ab. Der 30.04.2029 kommt als 1872194400 an, das ist in
    // UTC der 29.04. um 22 Uhr — mit `toISOString()` waere jedes Datum im
    // Sommerhalbjahr einen Tag zu frueh.
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const s = String(wert).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s; // kein Datum -> unveraendert, damit `fristStatus` es als ungueltig meldet
};

/**
 * Ein Los aus der REST-Schnittstelle in die Form bringen, mit der hier
 * gerechnet wird. Zwei Dinge passieren dabei:
 *
 * 1. **Extrafields flach ziehen.** Sie kommen als `array_options` mit dem
 *    Praefix `options_`.
 * 2. **Den Etiketten-Code aus `bm_token` holen — NICHT aus `barcode`.** Die
 *    Spalte `llx_product_lot.barcode` gibt es zwar, aber Dolibarrs
 *    /productlots schreibt sie nicht: POST und PUT antworten mit 200 und
 *    lassen sie NULL (12.09.2026 an der Instanz geprueft). Der Code liegt
 *    deshalb im Extrafield `bm_token`, das nachweislich hin und zurueck geht.
 */
export const bmLos = (roh) => {
  if (!roh) return null;
  const ao = roh.array_options || {};
  const nimm = (name) => (ao[`options_${name}`] !== undefined ? ao[`options_${name}`] : roh[name]);
  return {
    ...roh,
    id: roh.id ?? roh.rowid,
    token: nimm("bm_token") || null,
    einbauposition: nimm("einbauposition") || null,
    profiltiefe_mm: nimm("profiltiefe_mm") ?? null,
    letzte_pruefung: tag(nimm("letzte_pruefung")),
    eatby: tag(roh.eatby),
    sellby: tag(roh.sellby),
    eol_date: tag(roh.eol_date),
    manufacturing_date: tag(roh.manufacturing_date),
    scrapping_date: tag(roh.scrapping_date),
  };
};

/** ISO-Datum plus n Tage. Ueber UTC gerechnet, damit keine Zeitzone hineinspielt. */
export const bmPlusTage = (iso, tage) => {
  const d = tag(iso);
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const n = Number(tage);
  if (!m || !Number.isFinite(n)) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
};

/**
 * Alle Fristen eines Loses zum Stichtag. Ein Stueck ohne jedes Datum hat
 * keine — das ist der Normalfall und ausdruecklich kein Mangel.
 */
export const bmFristen = (rohLos, heute, vorwarnung = BM_VORWARNUNG_TAGE) => {
  const los = bmLos(rohLos);
  if (!los) return [];
  const out = [];
  const dazu = (grund, bis) => out.push({ grund, faellig: tag(bis), ...fristStatus(tag(bis), heute, vorwarnung) });

  if (los.eatby) dazu("Verfall", los.eatby);
  if (los.eol_date) dazu("Lebensende", los.eol_date);
  if (los.manufacturing_date && Number(los.lifetime) > 0) {
    dazu("Alter", bmPlusTage(los.manufacturing_date, los.lifetime));
  }
  if (Number(los.qc_frequency) > 0) {
    // Ein Pruefintervall ohne je erfolgte Pruefung ist nicht „gueltig" — sonst
    // waere ein nie gepruefter Klettergurt gruen. Es ist offen.
    if (los.letzte_pruefung) dazu("Pruefung", bmPlusTage(los.letzte_pruefung, los.qc_frequency));
    else out.push({ grund: "Pruefung", faellig: null, stufe: "offen", tage: null });
  }
  return out;
};

// Reihenfolge der Dringlichkeit. „offen" steht vor „bald": ein nie gepruefter
// Klettergurt ist ein groesseres Problem als ein Verbandkasten, der in drei
// Wochen ablaeuft.
const RANG = { ueberfaellig: 0, offen: 1, ungueltig: 2, bald: 3, gueltig: 4, kein: 5 };
const BM_AUFFAELLIG = ["ueberfaellig", "offen", "ungueltig", "bald"];
export const bmAuffaellig = (stufe) => BM_AUFFAELLIG.includes(stufe);

/** Die schaerfste Frist eines Loses. Bei Gleichstand die frueher faellige. */
export const bmStatus = (los, heute, vorwarnung = BM_VORWARNUNG_TAGE) => {
  const fristen = bmFristen(los, heute, vorwarnung);
  if (!fristen.length) return { stufe: "kein", grund: null, faellig: null, tage: null };
  return fristen.slice().sort((a, b) => {
    const r = (RANG[a.stufe] ?? 9) - (RANG[b.stufe] ?? 9);
    if (r !== 0) return r;
    return String(a.faellig || "9999").localeCompare(String(b.faellig || "9999"));
  })[0];
};

/**
 * Die Lose, die Aufmerksamkeit brauchen — das Dringendste zuerst. Alles
 * andere bleibt bewusst draussen: eine Liste, in der auch Unauffaelliges
 * steht, wird nicht gelesen.
 */
export const bmFaellige = (lose, heute, vorwarnung = BM_VORWARNUNG_TAGE) =>
  (Array.isArray(lose) ? lose : [])
    .map((l) => ({ ...l, status: bmStatus(l, heute, vorwarnung) }))
    .filter((l) => bmAuffaellig(l.status.stufe))
    .sort((a, b) => {
      const r = (RANG[a.status.stufe] ?? 9) - (RANG[b.status.stufe] ?? 9);
      if (r !== 0) return r;
      return (a.status.tage ?? 0) - (b.status.tage ?? 0);
    });

// ─── Der Code am Stueck ─────────────────────────────────────────────────────
//
// Der aufgedruckte Code ist eine undurchsichtige Zufallsnummer, KEINE
// Artikel- oder Seriennummer. Wer ihn scannt, sieht nichts — die Bedeutung
// entsteht erst, wenn die App das Los dazu nachschlaegt und der Server die
// Berechtigung prueft. Ein Standard-Barcode ist von jeder Scanner-App lesbar;
// „nur ueber die App" ist deshalb eine Eigenschaft der Aufloesung, nicht des
// Codes.

// Ohne 0/O und 1/I/L: der Code muss abtippbar sein, wenn der Aufdruck leidet.
// Das Token ist eine reine Ziffernfolge. Grund ist der Strichcode: Code 128
// packt im Zeichensatz C zwei Ziffern in ein Symbol und ist damit doppelt so
// dicht wie mit Buchstaben. Zehn Ziffern ergeben 90 Module — die passen bei
// 203 dpi mit drei Punkten je Modul auf eine 40-mm-Rolle. Mit Buchstaben
// waeren es 145 Module gewesen, also entweder zu breit oder zu fein.
export const BM_TOKEN_LAENGE = 10;      // neun Zufallsziffern + Pruefziffer

/**
 * Pruefziffer nach Luhn. Faengt fremde Codes und Zahlendreher ab — mit einer
 * bekannten Ausnahme: den Dreher **0 <-> 9** erkennt Luhn bauartbedingt nicht,
 * beide Reihenfolgen ergeben dieselbe Summe. Betrifft rund 2,5 % aller
 * Vertauschungen. Folge im Betrieb: so eine Nummer kommt durch die Pruefung,
 * findet aber kein Los — die App meldet „unbekannt", statt das falsche Stueck
 * zu oeffnen. Festgehalten in `test/betriebsmittel/fristen.test.js`.
 */
const luhn = (ziffern) => {
  let summe = 0;
  const s = String(ziffern);
  for (let i = 0; i < s.length; i++) {
    // Von rechts gezaehlt wird jede zweite Ziffer verdoppelt. Die Pruefziffer
    // kommt noch dazu, deshalb ist die letzte Stelle hier eine gerade Position.
    let z = Number(s[s.length - 1 - i]);
    if (i % 2 === 0) { z *= 2; if (z > 9) z -= 9; }
    summe += z;
  }
  return (10 - (summe % 10)) % 10;
};

export const bmToken = (laenge = BM_TOKEN_LAENGE) => {
  const stellen = laenge - 1;
  const n = new Uint8Array(stellen);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(n);
  else for (let i = 0; i < stellen; i++) n[i] = Math.floor(Math.random() * 256);
  // 256 % 10 !== 0, die obersten sechs Werte wuerden 0..5 bevorzugen. Bei
  // 10^9 Moeglichkeiten ist das harmlos, aber es kostet nichts, sie zu meiden.
  let s = "";
  for (let i = 0; i < stellen; i++) s += String((n[i] >= 250 ? 0 : n[i]) % 10);
  return s + luhn(s);
};

/** Was auf dem Etikett im Strichcode steht: das Token, sonst nichts. */
export const bmCode = (token) => String(token);

/**
 * Liest das eigene Format. Fremde Codes geben `null` zurueck statt eines
 * Ratens — sonst sucht die App zu jedem EAN-Code der Welt ein Los. Neben der
 * Laenge muss die Pruefziffer stimmen; ein zufaellig gescannter Zehnstellen-
 * Code kommt damit nur in einem von zehn Faellen ueberhaupt durch, und dann
 * findet ihn die Datenbank nicht.
 */
export const bmCodeLesen = (text) => {
  const s = String(text || "").trim();
  if (!new RegExp(`^\\d{${BM_TOKEN_LAENGE}}$`).test(s)) return null;
  return luhn(s.slice(0, -1)) === Number(s[s.length - 1]) ? s : null;
};

/**
 * Kuerzel fuer die Seriennummer, aus der Artikelbezeichnung. Vier Buchstaben
 * aus dem ersten Wort: „Akku Makita 18 V" -> AKKU, „Reifen 155/80R13N" -> REIF,
 * „Erste-Hilfe-Koffer" -> ERST. Bewusst stumpf und damit vorhersagbar — wer
 * eine Nummer liest, soll den Artikel erraten koennen, ohne eine Tabelle.
 */
export const bmKuerzel = (bezeichnung) => {
  const wort = String(bezeichnung || "")
    .toUpperCase()
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
    .split(/[^A-Z]+/).filter(Boolean)[0] || "";
  return (wort.slice(0, 4) || "STCK").padEnd(4, "X");
};

/**
 * Die lesbare Nummer neben dem Code: Kuerzel, Jahr, laufende Zahl. Sie steht
 * auf dem Etikett, damit man ein Stueck ansprechen kann, ohne zu scannen.
 */
export const bmSeriennummer = (kuerzel, jahr, nummer = null, vorhanden = []) => {
  let n = Number(nummer);
  if (!Number.isFinite(n) || n <= 0) {
    const muster = new RegExp(`^${kuerzel}-${jahr}-(\\d+)$`);
    const hoechste = (vorhanden || []).reduce((max, s) => {
      const m = String(s || "").match(muster);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    n = hoechste + 1;
  }
  return `${kuerzel}-${jahr}-${String(n).padStart(4, "0")}`;
};

// ─── Etikett ────────────────────────────────────────────────────────────────

const BM_ZEILE_MAX = 28; // passt auf 48 mm bei 203 dpi in lesbarer Groesse

const kuerzen = (s, max = BM_ZEILE_MAX) => {
  const t = String(s || "").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
};

const deutsch = (iso) => {
  const m = String(tag(iso) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
};

/**
 * Was auf das Etikett kommt. Das Verfallsdatum steht bewusst im Klartext
 * darauf — der Sinn eines Verbandkasten-Etiketts ist, dass man das Datum
 * sieht, OHNE zu scannen.
 */
export const bmEtikett = (rohLos, produkt, heute) => {
  const los = bmLos(rohLos);
  if (!los?.token) throw new Error("Etikett ohne Code: dem Los fehlt der Etiketten-Code");
  // Auf dem Etikett steht nur, was man ohne Scannen wirklich braucht: die
  // Nummer, um das Stueck anzusprechen, und — wo es eine gibt — die Frist.
  // Die Artikelbezeichnung steht nicht drauf (Ansage Inhaber 12.09.2026): sie
  // frisst die Breite, und wer den Koffer in der Hand haelt, sieht ohnehin,
  // dass es ein Koffer ist.
  const zeilen = [kuerzen(los.batch || "")];
  const s = bmStatus(los, heute);
  const verfall = deutsch(los.eatby);
  if (verfall) zeilen.push(kuerzen(`verfaellt ${verfall}`));
  else if (s.grund === "Pruefung" && s.faellig) zeilen.push(kuerzen(`Pruefung ${deutsch(s.faellig)}`));
  return { code: bmCode(los.token), zeilen: zeilen.filter(Boolean), status: s, produkt: produkt?.label || null };
};
