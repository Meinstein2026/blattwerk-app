// Baumkataster offline (17.09.2026). Kein React, kein Netz, kein DOM — alle
// Adapter werden hineingereicht, damit das hier in Vitest (environment: node)
// prüfbar bleibt und die Oberfläche nur noch verdrahtet.
//
// Es werden VORGÄNGE eingereiht, keine Store-Abzüge: ein ganzer Store würde
// beim Nachtragen überschreiben, was ein anderes Gerät inzwischen eingetragen
// hat. Die Server-Endpunkte sind additiv und lösen das von selbst.
//
// Fotos liegen NICHT hier und nicht im localStorage, sondern als Blob in
// IndexedDB; die Warteschlange hält nur ihre Schlüssel. Zwei Bilder in einem
// base64-Feld sprengen das Kontingent (siehe Überlassung in CLAUDE.md).
import { bkNormalisieren } from "./baumkataster.js";

export const BK_CACHE_PRAEFIX = "blattwerk_bk_cache_";
export const BK_QUEUE_KEY = "blattwerk_bk_ausstehend";
export const BK_FILTER_KEY = "blattwerk_bk_filter";
export const BK_KUNDENORT_KEY = "blattwerk_bk_kundenort";
export const BK_FOTO_DB = "blattwerk-bk-fotos";
export const BK_FOTO_STORE = "fotos";

const PFADE = {
  baum: "/api/nc/baumkataster/baum/save",
  kontrolle: "/api/nc/baumkataster/kontrolle/save",
  massnahme: "/api/nc/baumkataster/massnahme/save",
  "massnahme-erledigt": "/api/nc/baumkataster/massnahme/erledigt",
  "gbu-verweis": "/api/nc/baumkataster/kontrolle/gbu",
};

export const bkVorgangPfad = (typ) => PFADE[typ] || null;

/**
 * Idempotenzschlüssel eines Vorgangs (18.09.2026) — Zeit+Zufall, wie die
 * Warteschlangen-Id selbst, aber ein EIGENES Feld (siehe `bkEinreihen`).
 * Exportiert, weil ihn nicht nur `bkEinreihen` vergibt: der Kontroll-Wizard
 * (`BaumkatasterPage.jsx`) prägt dieselbe Kennung schon BEIM ÖFFNEN in seinen
 * Entwurf (Kontrolle und jede Maßnahme je eine), damit auch der SYNCHRONE
 * Online-Weg — nicht nur die Warteschlange — dem Server eine Wiederholung
 * erkennbar macht. Scheitert der Online-Versuch und der Vorgang wandert in
 * die Warteschlange, reicht er dieselbe Kennung weiter (siehe unten).
 */
export const bkVorgangId = (jetzt = new Date(), zufall = Math.random) =>
  `bkv-${jetzt.getTime().toString(36)}-${Math.floor(zufall() * 1e6).toString(36)}`;

/**
 * Hinten anhängen — die Reihenfolge der Warteschlange ist die Eintragsreihenfolge.
 *
 * `vorgangId` ist eine EIGENE Kennung, getrennt von `id` (die nur die
 * Warteschlange selbst verwaltet, siehe `bkNachtragZusammenfuehren`): sie
 * bleibt über jede Wiederholung hinweg gleich, weil `bkNachtragen` denselben
 * Eintrag erneut sendet, statt einen neuen anzulegen. Der Server (`baum/save`,
 * `kontrolle/save`, `massnahme/save`) erkennt daran eine Wiederholung und legt
 * den Vorgang kein zweites Mal an — ohne diese Kennung (Altbestand aus einer
 * älteren Fassung, die schon in einer Warteschlange liegt) verhält er sich wie
 * bisher. Trägt der eingereihte Vorgang schon eine `vorgangId` (Übergabe vom
 * synchronen Online-Weg, der beim Scheitern hierher wechselt), wird SIE
 * übernommen statt eine neue zu würfeln — sonst verlöre genau der Vorgang
 * seine Kennung, der zuerst online versucht wurde und dann in die
 * Warteschlange fiel.
 */
export function bkEinreihen(liste, vorgang, { jetzt = new Date(), zufall = Math.random } = {}) {
  if (!bkVorgangPfad(vorgang?.typ)) throw new Error(`Unbekannte Vorgangsart: ${vorgang?.typ}`);
  const eintrag = {
    id: `bkq-${jetzt.getTime().toString(36)}-${Math.floor(zufall() * 1e6).toString(36)}`,
    vorgangId: vorgang.vorgangId || bkVorgangId(jetzt, zufall),
    typ: vorgang.typ,
    kundeId: vorgang.kundeId ?? null,
    kundeName: vorgang.kundeName || "",
    lokalId: vorgang.lokalId || null,
    fotoSchluessel: Array.isArray(vorgang.fotoSchluessel) ? vorgang.fotoSchluessel : [],
    nutzlast: vorgang.nutzlast || {},
    zeit: jetzt.toISOString(),
  };
  return { liste: [...(Array.isArray(liste) ? liste : []), eintrag], eintrag };
}

/**
 * Die Baumnummer vergibt der Server beim Nachtragen (bkBaumNr). Erst danach
 * wissen Kontrolle und Maßnahme, an welchem Baum sie hängen — eine offline
 * erfundene Nummer wäre entweder unbekannt (400) oder gehörte einem fremden
 * Baum, den inzwischen ein anderes Gerät angelegt hat.
 */
export function bkQueueNrEinsetzen(liste, lokalId, nr) {
  if (!lokalId || !nr) return Array.isArray(liste) ? liste : [];
  return (Array.isArray(liste) ? liste : []).map((e) =>
    e.lokalId === lokalId && e.typ !== "baum" ? { ...e, nutzlast: { ...e.nutzlast, nr } } : e);
}

/**
 * Spiegelt `bkQueueNrEinsetzen`, aber für die Kontroll-Id: die vergibt der
 * Server erst beim Nachtragen von `kontrolle/save` (`daten.kontrolle.id`).
 * Erst danach wissen wartende Maßnahmen derselben lokalId, zu welcher
 * Kontrolle sie gehören. Trifft NUR `massnahme`-Vorgänge — anders als bei der
 * Baumnummer (die auch die Kontrolle selbst braucht) hat die Kontrolle hier
 * kein `nutzlast.massnahme`, in das etwas einzusetzen wäre.
 */
export function bkQueueKontrolleIdEinsetzen(liste, lokalId, kontrolleId) {
  if (!lokalId || !kontrolleId) return Array.isArray(liste) ? liste : [];
  return (Array.isArray(liste) ? liste : []).map((e) =>
    e.lokalId === lokalId && e.typ === "massnahme"
      ? { ...e, nutzlast: { ...e.nutzlast, massnahme: { ...e.nutzlast.massnahme, kontrolleId } } }
      : e);
}

export const bkOffeneVorgaenge = (liste, kundeId) =>
  (Array.isArray(liste) ? liste : []).filter((e) => kundeId == null || String(e.kundeId) === String(kundeId));

/**
 * Anzeige: Serverstand plus das, was noch auf Empfang wartet — sonst
 * verschwände ein gerade angelegter Baum vor den Augen des Erfassers.
 * Platzhalter-Nummern beginnen mit "neu-" und treffen darum nie `baumNrSafe`.
 */
export function bkAusstehendZusammenfuehren(store, liste, kundeId) {
  const s = bkNormalisieren(store);
  const baeume = { ...s.baeume };
  for (const e of bkOffeneVorgaenge(liste, kundeId)) {
    if (e.typ !== "baum" || e.nutzlast?.baum?.nr) continue;
    const nr = `neu-${e.id}`;
    baeume[nr] = { ...e.nutzlast.baum, nr, status: "aktiv", kontrollen: [], massnahmen: [], ausstehend: true };
  }
  return { ...s, baeume };
}

// ─── Cache ──────────────────────────────────────────────────────────────────

export function bkCacheLesen(speicher, kundeId) {
  try {
    const roh = speicher?.getItem(BK_CACHE_PRAEFIX + kundeId);
    if (!roh) return null;
    const d = JSON.parse(roh);
    if (!d || typeof d !== "object" || !d.store) return null;
    return { store: bkNormalisieren(d.store), stand: d.stand || null };
  } catch { return null; }
}

/** Ein voller Gerätespeicher darf die Seite nicht zerlegen — der Cache ist nur eine Abkürzung. */
export function bkCacheSchreiben(speicher, kundeId, store, jetzt = new Date()) {
  try { speicher?.setItem(BK_CACHE_PRAEFIX + kundeId, JSON.stringify({ stand: jetzt.toISOString(), store })); }
  catch (_) { /* kein Platz: der Serverstand bleibt trotzdem angezeigt */ }
}

/**
 * Aufgelöste Kundenadressen, alle in EINEM Schlüssel. Nominatim darf nicht bei
 * jedem Kundenwechsel gefragt werden (Nutzungsrichtlinie, außerdem langsam);
 * ein Treffer gilt nur zu genau der Adresse, zu der er geholt wurde — ändert
 * sie sich im Dolibarr, muss neu gesucht werden.
 */
const istObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const kundenOrte = (speicher) => {
  try { const d = JSON.parse(speicher?.getItem(BK_KUNDENORT_KEY) || "{}"); return istObj(d) ? d : {}; }
  catch { return {}; }
};

export function bkKundenOrtLesen(speicher, kundeId, adresse) {
  const e = kundenOrte(speicher)[String(kundeId)];
  if (!istObj(e) || e.adresse !== adresse) return null;
  const lat = Number(e.lat), lon = Number(e.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

export function bkKundenOrtMerken(speicher, kundeId, adresse, punkt, jetzt = new Date()) {
  try {
    const alle = { ...kundenOrte(speicher), [String(kundeId)]: { lat: punkt.lat, lon: punkt.lon, adresse, abgefragtAm: jetzt.toISOString() } };
    speicher?.setItem(BK_KUNDENORT_KEY, JSON.stringify(alle));
  } catch (_) { /* kein Platz: dann wird beim nächsten Mal erneut gesucht */ }
}

/**
 * Ergebnis eines Nachtrag-Laufs mit dem echten (zwischenzeitlich gewachsenen)
 * State zusammenführen (C2 aus der Whole-Branch-Review). `bkNachtragen`
 * arbeitet auf `schnappschuss` — der Warteschlange zu BEGINN des Laufs.
 * Während des `await` kann `einreihen` neue Vorgänge in den echten State
 * (`aktuell`) schreiben. Ein reines "warteschlange = rest" nach dem Lauf
 * würde diese löschen: eine unterschriebene Kontrolle samt Fotos, während der
 * vorige Nachtrag noch lief, wäre unwiederbringlich weg.
 *
 * `rest` (aus `bkNachtragen`) trägt die von `bkQueueNrEinsetzen`/
 * `bkQueueKontrolleIdEinsetzen` nachgetragenen Nutzlasten — ein reines
 * Filtern von `aktuell` allein würde die verlieren. Reihenfolge: `rest`
 * zuerst (die waren zuerst da), dann alles aus `aktuell`, was der
 * Schnappschuss noch nicht kannte.
 *
 * `geaendert` ist zusätzlich zur Liste dabei, damit der Aufrufer einen
 * überflüssigen State-/localStorage-Schreibvorgang unterlässt, wenn während
 * des ganzen Laufs weder etwas verarbeitet noch etwas Neues eingereiht wurde.
 */
export function bkNachtragZusammenfuehren(schnappschuss, aktuell, rest) {
  const s = Array.isArray(schnappschuss) ? schnappschuss : [];
  const a = Array.isArray(aktuell) ? aktuell : [];
  const r = Array.isArray(rest) ? rest : [];
  const gesehen = new Set(s.map((e) => e.id));
  const neuEingereiht = a.filter((e) => !gesehen.has(e.id));
  const liste = [...r, ...neuEingereiht];
  const geaendert = liste.length !== a.length || r.length !== s.length;
  return { liste, geaendert };
}

// ─── Nachtragen ─────────────────────────────────────────────────────────────

/**
 * Warteschlange abarbeiten. `senden(pfad, nutzlast)` liefert `{status, daten}`
 * und wirft bei Netzfehler.
 * 400 = fachlich abgelehnt → verwerfen und melden, sonst hinge der Vorgang für
 * immer. Alles andere (5xx, Netz) bleibt liegen und wird später erneut
 * versucht; ab dem ersten Liegenbleiber wird abgebrochen, damit die
 * Reihenfolge erhalten bleibt (Kontrolle vor Maßnahme).
 * Rückgabe: `stores` ist ein Store JE erfolgreich verarbeitetem Kunden (die
 * Warteschlange kann mehrere Kunden gleichzeitig enthalten, z. B. Vormittags-
 * und Nachmittagsbesuch) — `letzte` bleibt zusätzlich der reine Antwortkörper
 * des zuletzt erfolgreichen Vorgangs, unverändert für bestehende Aufrufer.
 *
 * `speichern(offen)` (18.09.2026, Idempotenz) wird nach JEDEM verarbeiteten
 * Vorgang aufgerufen — erfolgreich gesendet, endgültig abgelehnt (400) oder
 * per Kaskade verworfen —, mit der zu diesem Zeitpunkt noch offenen
 * Restliste. Vorher stand die Warteschlange erst nach dem GANZEN Lauf wieder
 * im Gerätespeicher: stirbt die App mittendrin (Android räumt WebView-
 * Activities jederzeit ab), wären bereits angenommene Vorgänge beim nächsten
 * Start erneut gesendet worden. `speichern` ist optional, damit reine
 * Verhaltenstests ohne Persistenz weiterlaufen.
 */
export async function bkNachtragen(liste, { senden, fotosLesen, fotosLoeschen, melden, speichern } = {}) {
  let offen = Array.isArray(liste) ? liste.slice() : [];
  let letzte = null;
  // Je Kunde der Store aus dessen letztem erfolgreichen Vorgang — die
  // Warteschlange kann mehrere Kunden gleichzeitig enthalten (Vormittags-
  // und Nachmittagsbesuch), `letzte` allein gehört nur dem zuletzt
  // gesendeten Vorgang und würde die anderen Kunden verschweigen.
  const stores = {};
  const verworfen = [];
  while (offen.length) {
    const e = offen[0];
    const pfad = bkVorgangPfad(e.typ);
    if (!pfad) { offen = offen.slice(1); verworfen.push(e); continue; }
    // kundeId steht am EINTRAG, nicht in der Nutzlast — jeder Endpunkt
    // verlangt sie und antwortet sonst 400, und 400 verwirft hier.
    // vorgangId ebenso: sie ist Sache der Warteschlange, keine fachliche
    // Nutzlast, und fehlt bei Einträgen aus einer älteren App-Fassung.
    let koerper = {
      kundeId: e.kundeId, ...(e.kundeName ? { kundeName: e.kundeName } : {}),
      ...(e.vorgangId ? { vorgangId: e.vorgangId } : {}), ...e.nutzlast,
    };
    try {
      if (e.fotoSchluessel?.length && fotosLesen) koerper = { ...koerper, fotos: await fotosLesen(e.fotoSchluessel) };
      const { status, daten } = await senden(pfad, koerper);
      if (status === 400) {
        verworfen.push({ ...e, fehler: daten?.error || "abgelehnt" });
        melden?.(`Nachtrag abgelehnt: ${daten?.error || "?"}`);
        // Scheitert die Baum-Anlage ODER die Kontrolle, haben ihre wartenden
        // Folgevorgänge (Kontrollen/Maßnahmen bzw. Maßnahmen) keinen Baum
        // bzw. keine Kontrolle mehr, an die sie gehören — sie würden einzeln
        // nachscheitern und je eine eigene Meldung erzeugen. Eine Ursache,
        // eine Meldung.
        if ((e.typ === "baum" || e.typ === "kontrolle") && e.lokalId) {
          for (const x of offen.slice(1)) if (x.lokalId === e.lokalId) {
            verworfen.push({ ...x, fehler: e.typ === "baum" ? "Baum wurde abgelehnt" : "Kontrolle wurde abgelehnt" });
            if (x.fotoSchluessel?.length && fotosLoeschen) await fotosLoeschen(x.fotoSchluessel);
          }
          offen = offen.filter((x) => x === e || x.lokalId !== e.lokalId);
        }
      } else if (status < 200 || status >= 300) {
        break; // 5xx/401/409: später erneut, Reihenfolge bleibt
      } else {
        letzte = daten;
        if (daten?.store && e.kundeId != null) stores[String(e.kundeId)] = daten.store;
        if (e.typ === "baum" && e.lokalId && daten?.baum?.nr) {
          offen = bkQueueNrEinsetzen(offen, e.lokalId, daten.baum.nr);
        }
        if (e.typ === "kontrolle" && e.lokalId && daten?.kontrolle?.id) {
          offen = bkQueueKontrolleIdEinsetzen(offen, e.lokalId, daten.kontrolle.id);
        }
      }
      // Fix-Runde 1 (18.09.2026, I1): ERST aus `offen` entfernen, DANN die
      // Fotos löschen. Ein bereits vom Server angenommener Vorgang (200 oder
      // fachlich abgelehnte 400) darf nicht erneut gesendet werden, auch wenn
      // die Fotolöschung selbst scheitert (VersionError, blockiert durch
      // einen zweiten Tab) — der `catch` unten bricht sonst mit `e` noch am
      // Kopf von `offen`, und der nächste Lauf sendet denselben Vorgang
      // doppelt (additiv, also für immer). Die Kaskade weiter oben
      // (abgelehnter Baum/Kontrolle reisst wartende Folgevorgänge mit) ist
      // davon unberührt — sie entfernt ihre Einträge bereits vorher selbst.
      offen = offen.slice(1);
      // Sofort persistieren, VOR der (bestenfalls nachrangigen) Fotolöschung:
      // ein Absturz zwischen beidem darf den gerade verarbeiteten Vorgang
      // nicht wieder in der gespeicherten Warteschlange auftauchen lassen.
      await speichern?.(offen);
      if (e.fotoSchluessel?.length && fotosLoeschen) await fotosLoeschen(e.fotoSchluessel);
    } catch (_) {
      break; // Netzfehler: alles Weitere bleibt liegen
    }
  }
  return { rest: offen, letzte, stores, verworfen };
}
