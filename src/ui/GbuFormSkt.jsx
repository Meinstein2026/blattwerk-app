// Vor-Ort-Gefährdungsbeurteilung im Aufbau des SKT-Papierformulars (Teilprojekt B,
// 16.09.2026). Ersetzt GbuForm an beiden Aufrufstellen in dolibarr-app.jsx.
// Leitgedanke: die App belegt vor, der Mensch bestätigt oder korrigiert. Jede
// Zeile zeigt „automatisch"/„geändert"; was die Automatik nicht bestätigen
// kann, bleibt OFFEN — nie „nein". Ablage (Warteschlange, Paperless/Dolibarr)
// und Signatur-Wizard sind unverändert von GbuForm übernommen.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GBU_ARBEITSARTEN, GBU_ZUGAENGE, GBU_DURCHZUFUEHRENDE_ARBEITEN, GBU_QUALIFIKATIONEN,
  GBU_BAUM_UMFELD, GBU_BAUM_STAMM, GBU_BAUM_KRONE,
  gbuArbeitsart, isBaumArbeit, composeFormular, validateGbu, gbuNeuV3, gbuUmfangText,
  gbuLetzterEinsatz, gbuUebernahmeV3, buildGbuFilename,
} from "../gbu-data.js";
import {
  kartenBild, WETTER_URL, wetterParsen, wetterBewertung, wetterZeile, GEO_URL, adresseParsen, netzempfang,
  mobilReihenfolge, dauerAusTermin, adresseAusKunde, besteGps, materialAusFristen,
  letzteKontrolle, katasterInBaumcheck, katasterUebernehmen, automatikSetzen, automatikGeaendert, automatikText,
} from "../gbu-automatik.js";
import TimeField from "../zeitfeld.jsx";
import {
  SignaturePad, SuchAuswahl, Icon, apiFetch, loadNcConfig,
  loadGbuQueue, saveGbuQueue, loadGbuLog, processGbuQueue, ewPersonen, isOpenProject,
  GBU_PDF_DB, GBU_PDF_SPEICHER, gbuPdfSpeichernLokal, gbuTeilenOderSpeichern, useMandant,
} from "../../dolibarr-app.jsx";
import { mandantBetrieb } from "../betrieb.js";
import { funktionAktiv } from "../funktionen.js";
import { idbHolen } from "../idb.js";

// Fremdmodule der Teilprojekte A (Qualifikationen) und C (Baumkataster) werden
// parallel gebaut und fehlen in diesem Zweig ggf. noch. import.meta.glob löst zur
// Bauzeit auf, was es gibt, und hat für Fehlendes keinen Eintrag — ein statisches
// `import("../qualifikationen.js")` ließe Vite beim Bauen abbrechen.
const FREMD = import.meta.glob(["../qualifikationen.js", "../baumkataster.js", "../baumkataster-data.js"]);
const ladeModul = async (pfad) => { const l = FREMD[pfad]; if (!l) return null; try { return await l(); } catch { return null; } };

const p2 = (n) => String(n).padStart(2, "0");
const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const jetztHHMM = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const nameVon = (me) => (`${me?.firstname || ""} ${me?.lastname || ""}`.trim()) || me?.login || "";

/** /api/nc/*-Aufruf mit den Nextcloud-Zugangsdaten des Geräts; nicht-2xx (z. B. 404 = Modul nicht ausgerollt) → null, kein Fehler. */
async function ncPost(url, body) {
  const nc = loadNcConfig();
  try {
    const r = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, ...body }) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Verweis an der Kataster-Kontrolle (Teilprojekt C). Offline gespeicherte
// Beurteilungen holen ihn nach, sobald die Maske mit Netz geöffnet wird.
// „Server hat geantwortet" gilt als erledigt — auch 404 (Modul nicht
// ausgerollt) — nur ein Netzfehler bleibt liegen.
const KATASTER_AUSSTEHEND = "blattwerk_gbu_kataster_ausstehend";
const ladeKatasterAusstehend = () => { try { return JSON.parse(localStorage.getItem(KATASTER_AUSSTEHEND) || "[]") || []; } catch { return []; } };
const speichereKatasterAusstehend = (liste) => { try { localStorage.setItem(KATASTER_AUSSTEHEND, JSON.stringify(liste)); } catch (_) {} };
async function katasterVerweisSenden(eintrag) {
  const nc = loadNcConfig();
  try {
    await apiFetch("/api/nc/baumkataster/kontrolle/gbu", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, ...eintrag }) });
    return true;
  } catch { return false; }
}
async function katasterVerweiseNachtragen() {
  if (!navigator.onLine) return;
  const rest = [];
  for (const e of ladeKatasterAusstehend()) if (!(await katasterVerweisSenden(e))) rest.push(e);
  speichereKatasterAusstehend(rest);
}

function AutoBadge({ status }) {
  const t = automatikText(status);
  if (!t) return null;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 7px", marginLeft: 6,
      background: status === "auto" ? "var(--k-moos-bg)" : "var(--k-ocker-bg)", color: status === "auto" ? "var(--k-moos)" : "var(--k-ocker)" }}>{t}</span>
  );
}

/** Prüfzeile mit drei Zuständen: ja / nein / offen (nichts gewählt; aktiven Chip nochmal tippen = wieder offen). */
function CheckZeile({ label, hinweis, wert, status, onChange, zusatz }) {
  return (
    <div className="gbu-item">
      <div className="gbu-item-label">
        {label}<AutoBadge status={status} />
        {hinweis && <div style={{ fontSize: 12, color: "var(--text2)" }}>{hinweis}</div>}
      </div>
      <div className="gbu-chips" style={{ alignItems: "center" }}>
        {["ja", "nein"].map((v) => (
          <button key={v} type="button" className={`gbu-chip ${wert === v ? "gbu-chip-active" : ""}`}
            onClick={() => onChange(wert === v ? "" : v)}>{v}</button>
        ))}
        {!wert && <span style={{ fontSize: 12, color: "var(--k-ocker)" }}>offen</span>}
      </div>
      {zusatz}
    </div>
  );
}

export default function GbuFormSkt({ api, me, project, onClose, onSaved, showToast }) {
  const mandant = useMandant();
  const betrieb = mandantBetrieb(mandant);
  const meName = nameVon(me);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [personen, setPersonen] = useState([]); // { login, name, mobil } aus Dolibarr
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1); // 1 Formular, 2 Unterschrift Durchführende(r), 3 zweite Person, 4 nur ohne Netz: Weitergeben
  const [gespeichertesRecord, setGespeichertesRecord] = useState(null); // fürs Weitergeben in Schritt 4
  const [teilenLaeuft, setTeilenLaeuft] = useState(false);
  const [kundeId, setKundeId] = useState(project ? String(project.socid || project.fk_soc || "") : "");
  const [projektId, setProjektId] = useState(project ? String(project.id || project.rowid) : "");
  const [d, setD] = useState(() => {
    const r = gbuNeuV3({ userName: meName, heute: heuteIso() });
    r.baustelle.dauerVon = jetztHHMM();
    r.automatik["kopf.datum"] = "auto"; r.automatik["baustelle.dauer"] = "auto";
    return r;
  });
  const [aushilfe, setAushilfe] = useState("");
  const [detailsOffen, setDetailsOffen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");
  const [lose, setLose] = useState(null);          // Betriebsmittel-Lose (Task 8)
  const [agenda, setAgenda] = useState(null);      // Dolibarr-Agenda (Task 8)
  const [qualModul, setQualModul] = useState(null); // Teilprojekt A (Task 9)
  const [qualStore, setQualStore] = useState(null);
  const [aufsichtVorschlag, setAufsichtVorschlag] = useState(null); // { name, grund }
  const [bkModul, setBkModul] = useState(null);     // Teilprojekt C (Task 9)
  const [bkBefund, setBkBefund] = useState(null);   // BK_BEFUND aus C, sonst alte Listen
  const [katalog, setKatalog] = useState(null);     // { baeume: [{ id, name, baum }] }
  const [katasterNeu, setKatasterNeu] = useState(null);   // { vorschlag, vitalitaet, verkehrssicher, laeuft }
  const gpsRef = useRef(null);
  // "Noch gemountet?"-Wache für die Automatik-Callbacks weiter unten (GPS,
  // Karte, Adresse, Wetter, Netzempfang). Muss beim Einhängen selbst wieder
  // auf true gesetzt werden, nicht nur im Ausräumen auf false: React 18
  // StrictMode (npm run dev, so auch main.jsx) hängt jeden Effekt beim ersten
  // Rendern testweise aus- und wieder ein. Ein Effekt, der nur `() => { ... }`
  // als Ausräumen zurückgibt, ohne beim (erneuten) Einhängen selbst etwas zu
  // tun, bleibt nach diesem Probelauf für immer auf false stehen — dann bricht
  // jeder der Callbacks oben beim allerersten `if (!lebt.current) return`
  // sofort ab. Betroffen wären in der Entwicklung GPS-Anzeige, Kartenbild,
  // Adress- und Wetter-Automatik sowie der Netzempfang-Check, dauerhaft und
  // ohne jede Fehlermeldung. Im Produktivbuild (kein StrictMode) fiel das nie
  // auf; im Browser mit `npm run dev` bleibt „Position wird bestimmt (10 s) …"
  // sonst stehen (gefunden 17.09.2026 beim ersten Smoke-Test der Maske).
  const lebt = useRef(true);
  useEffect(() => { lebt.current = true; return () => { lebt.current = false; }; }, []);

  // Feld setzen. art = "manuell" (Mensch) oder "auto" (Automatik). Jeder manuelle
  // Schreibvorgang markiert das Feld als „geändert" — auch dann, wenn es vorher
  // nie „auto" war. Die Automatik überschreibt danach nie mehr, was der Mensch
  // eingetragen hat. Beides landet im Datensatz und im PDF (Marker A).
  const setzen = (blockId, feld, wert, art = "manuell") => setD((p) => {
    const pfad = `${blockId}.${feld}`;
    if (art === "auto" && p.automatik[pfad] === "geaendert") return p;
    const automatik = art === "auto" ? automatikSetzen(p.automatik, pfad) : automatikGeaendert(p.automatik, pfad);
    return { ...p, [blockId]: { ...p[blockId], [feld]: wert }, automatik };
  });
  const setzeTop = (patch) => setD((p) => ({ ...p, ...patch }));
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  useEffect(() => {
    api?.getThirdparties("customer").then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    api?.getUsers().then((u) => {
      const roh = Array.isArray(u) ? u : [];
      setPersonen(ewPersonen(roh).map((p) => ({ ...p, mobil: String(roh.find((x) => x.login === p.login)?.user_mobile || "") })));
    }).catch(() => setPersonen([]));
    api?.getProjects().then((p) => {
      let arr = (Array.isArray(p) ? p : []).filter(isOpenProject);
      if (project && !arr.some((x) => String(x.id || x.rowid) === String(project.id || project.rowid))) arr = [project, ...arr];
      setProjects(arr);
    }).catch(() => {});
  }, [api, project]);
  // `me` kann direkt nach App-Start noch fehlen — Aufsicht nachziehen, solange leer.
  useEffect(() => {
    if (!meName) return;
    setD((p) => (p.kopf.aufsicht ? p : { ...p, userName: meName, kopf: { ...p.kopf, aufsicht: meName } }));
  }, [meName]);

  const art = gbuArbeitsart(d.arbeitsart);
  const bloecke = useMemo(() => (d.arbeitsart ? composeFormular(d.arbeitsart, d.zugang) : []), [d.arbeitsart, d.zugang]);
  const selProject = projects.find((p) => String(p.id || p.rowid) === projektId) || project || null;
  const selCustomer = customers.find((c) => String(c.id || c.rowid) === String(kundeId || selProject?.socid || selProject?.fk_soc || "")) || null;
  const wetterHinweis = d.wetter ? wetterBewertung(d.wetter, art?.zugangRelevant ? d.zugang : "", d.arbeitsart).hinweis : "";

  // „Wenn öfter beim Kunden": letzter Einsatz aus dem Geräte-Log (v2 oder v3).
  const letzterEinsatz = gbuLetzterEinsatz(loadGbuLog(), {
    kundeId: kundeId || selCustomer?.id || selCustomer?.rowid, kundeName: selCustomer?.name || selProject?.thirdparty_name,
  });
  const uebernehmen = () => {
    const u = gbuUebernahmeV3(letzterEinsatz);
    if (!u) return;
    setD((p) => {
      const automatik = { ...p.automatik };
      for (const f of ["einsatzort", "strasse", "standort", "festnetz", "aufsicht"]) if (u.kopf[f]) automatik[`kopf.${f}`] = "auto";
      for (const f of ["verkehrssicherung", "stromleitung", "artAbsperrung", "absperrungDurch"]) if (u.baustelle[f]) automatik[`baustelle.${f}`] = "auto";
      return {
        ...p, ...u.form,
        kopf: { ...p.kopf, ...Object.fromEntries(Object.entries(u.kopf).filter(([, v]) => v)) },
        baustelle: { ...p.baustelle, ...u.baustelle },
        personal: u.personal.length ? u.personal : p.personal,
        automatik,
      };
    });
    showToast("Übernommen — Witterung, Zeiten, Baumcheck, Material, Personalcheck und Unterschriften bitte neu beurteilen.");
  };

  const pickProject = (e) => {
    const id = e.target.value;
    const pr = projects.find((p) => String(p.id || p.rowid) === id);
    setProjektId(id);
    if (pr && (pr.socid || pr.fk_soc)) setKundeId(String(pr.socid || pr.fk_soc));
  };

  // Personal: anwesende Personen als Chips (Dolibarr-Benutzer), Aushilfen per Freitext.
  const personDa = (key) => d.personal.some((p) => p.key === key);
  const personToggle = (p) => setzeTop({
    personal: personDa(p.login) ? d.personal.filter((x) => x.key !== p.login)
      : [...d.personal, { key: p.login, name: p.name, mobil: qualStore?.personen?.[p.login]?.mobil || p.mobil || "", quals: [] }],
  });
  const aushilfeDazu = () => {
    const n = aushilfe.trim();
    if (!n) return;
    setzeTop({ personal: [...d.personal, { key: "", name: n, mobil: "", quals: [] }] });
    setAushilfe("");
  };
  const aufsichtWaehlen = (v) => {
    setzen("kopf", "aufsicht", v);
    setD((p) => ({ ...p, aufsichtAbweichung: aufsichtVorschlag && v.trim() && v.trim() !== aufsichtVorschlag.name
      ? { vorschlag: aufsichtVorschlag.name, gewaehlt: v.trim(), grund: p.aufsichtAbweichung?.grund || "" } : null }));
  };

  // ── Automatik ─────────────────────────────────────────────────────────────
  // Alles best effort und still: im Funkloch wäre sonst jede zweite Zeile ein
  // Fehler-Toast. Was nicht klappt, bleibt offen.

  // Nach der GPS-Position: Karte (OSM-Kacheln → Canvas), Adresse als Vorschlag
  // (nur wenn die Felder noch leer sind), Wetter. Alles nur online.
  const nachGps = (g) => {
    if (!navigator.onLine) return;
    const canvas = document.createElement("canvas");
    const fetchBild = async (url) => createImageBitmap(await (await fetch(url)).blob());
    kartenBild(g.lat, g.lon, { fetchBild, canvas })
      .then((bild) => { if (bild && lebt.current) setzen("kopf", "karte", bild, "auto"); })
      .catch(() => {});
    fetch(GEO_URL(g.lat, g.lon), { headers: { "Accept-Language": "de" } })
      .then((r) => r.json())
      .then((j) => {
        const a = adresseParsen(j);
        if (!a || !lebt.current) return;
        setD((p) => {
          const n = { ...p, kopf: { ...p.kopf, adresseGeo: [a.strasse, a.einsatzort].filter(Boolean).join(", ") }, automatik: { ...p.automatik } };
          if (!String(p.kopf.einsatzort || "").trim() && a.einsatzort) { n.kopf.einsatzort = a.einsatzort; n.automatik["kopf.einsatzort"] = "auto"; }
          if (!String(p.kopf.strasse || "").trim() && a.strasse) { n.kopf.strasse = a.strasse; n.automatik["kopf.strasse"] = "auto"; }
          return n;
        });
      })
      .catch(() => {});
    fetch(WETTER_URL(g.lat, g.lon))
      .then((r) => r.json())
      .then((j) => { const w = wetterParsen(j); if (w && lebt.current) setzeTop({ wetter: w }); })
      .catch(() => {});
  };

  // GPS: 10 s lang messen, die genaueste Position nehmen (wie „Baum hier anlegen" in C).
  const gpsHolen = () => {
    if (!navigator.geolocation) { setGpsStatus("Kein GPS in diesem Browser"); return; }
    if (gpsRef.current != null) navigator.geolocation.clearWatch(gpsRef.current);
    const punkte = [];
    setGpsStatus("Position wird bestimmt (10 s) …");
    const fertig = () => {
      if (gpsRef.current != null) navigator.geolocation.clearWatch(gpsRef.current);
      gpsRef.current = null;
      if (!lebt.current) return;
      const best = besteGps(punkte);
      if (!best) { setGpsStatus("Keine Position — Lageplan bleibt leer."); return; }
      setzen("kopf", "gps", best, "auto");
      setGpsStatus("");
      nachGps(best);
    };
    gpsRef.current = navigator.geolocation.watchPosition(
      (pos) => punkte.push({ lat: pos.coords.latitude, lon: pos.coords.longitude, genauigkeitM: pos.coords.accuracy, zeit: new Date(pos.timestamp).toISOString() }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    setTimeout(fertig, 10000);
  };

  // Einmal beim Öffnen: Netzempfang, Lose, Agenda, GPS.
  useEffect(() => {
    katasterVerweiseNachtragen();
    netzempfang({ onLine: navigator.onLine, fetch: (u, o) => fetch(u, o) }).then((v) => { if (lebt.current) setzen("kopf", "netz", v, "auto"); });
    if (api) {
      api.getLots().then((l) => setLose(Array.isArray(l) ? l : [])).catch(() => setLose([]));
      api.getAgendaEvents().then((e) => setAgenda(Array.isArray(e) ? e : [])).catch(() => setAgenda([]));
    }
    gpsHolen();
    return () => { if (gpsRef.current != null) navigator.geolocation?.clearWatch(gpsRef.current); };
  }, [api]);

  // Adresse aus dem Dolibarr-Kunden — solange der Mensch nichts geändert hat (setzen prüft das).
  useEffect(() => {
    const a = adresseAusKunde(selCustomer);
    if (!a) return;
    if (a.einsatzort) setzen("kopf", "einsatzort", a.einsatzort, "auto");
    if (a.strasse) setzen("kopf", "strasse", a.strasse, "auto");
  }, [selCustomer?.id, selCustomer?.rowid]);

  // Dauer bis aus dem Projekttermin (Dolibarr Agenda) am Tag der Beurteilung.
  useEffect(() => {
    if (!agenda || !projektId) return;
    const t = dauerAusTermin(agenda, projektId, d.kopf.datum);
    if (!t) return;
    if (t.von) setzen("baustelle", "dauerVon", t.von, "auto");
    if (t.bis) setzen("baustelle", "dauerBis", t.bis, "auto");
  }, [agenda, projektId]);

  // Material aus den Betriebsmittel-Fristen: alles grün → Haken, sonst offen mit Liste.
  useEffect(() => {
    if (!lose) return;
    const ids = (bloecke.find((b) => b.id === "material")?.zeilen || [])
      .filter((z) => z.automatik && z.typ === "check" && z.id !== "funkGeprueft").map((z) => z.id);
    if (!ids.length) return;
    const m = materialAusFristen(lose, heuteIso(), ids);
    for (const id of ids) setzen("material", id, m.werte[id], "auto");
    setD((p) => ({ ...p, material: { ...p.material, offeneFristen: m.offen } }));
  }, [lose, bloecke]);

  // Witterung aus den Wetterwerten, abhängig von Zugang/Arbeitsart (Höhenarbeit ist empfindlicher).
  useEffect(() => {
    if (!d.wetter) return;
    const b = wetterBewertung(d.wetter, art?.zugangRelevant ? d.zugang : "", d.arbeitsart);
    setzen("baustelle", "witterung", b.geeignet, "auto");
  }, [d.wetter, d.zugang, d.arbeitsart]);

  // Mobilnummern der Anwesenden, Aufsicht zuerst.
  useEffect(() => {
    const nums = mobilReihenfolge(d.personal, d.kopf.aufsicht);
    if (nums.length) setzen("kopf", "mobil", nums, "auto");
  }, [d.personal, d.kopf.aufsicht]);

  // ── Teilprojekt A: Qualifikationen → Aufsicht + Personalcheck „Erfahrung" ──
  // Modul oder Endpunkt fehlt (Zweig noch nicht zusammengeführt / Server alt):
  // beide Zeilen bleiben offen, die Qualifikations-Chips je Person bleiben sichtbar.
  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [modul, store] = await Promise.all([ladeModul("../qualifikationen.js"), ncPost("/api/nc/qualifikationen", {})]);
      if (!aktiv) return;
      setQualModul(modul);
      setQualStore(store && store.personen ? store : null);
    })();
    return () => { aktiv = false; };
  }, []);
  useEffect(() => {
    if (!qualModul || !qualStore) return;
    const keys = d.personal.map((p) => p.key).filter(Boolean);
    if (!keys.length) { setAufsichtVorschlag(null); return; }
    const heute = heuteIso();
    if (typeof qualModul.qualAufsicht === "function") {
      const a = qualModul.qualAufsicht(qualStore.personen, keys, heute);
      const name = a?.key ? (qualStore.personen[a.key]?.name || d.personal.find((p) => p.key === a.key)?.name || "") : "";
      setAufsichtVorschlag(name ? { name, grund: a.grund || "" } : null);
      if (name) setzen("kopf", "aufsicht", name, "auto");
    }
    if (typeof qualModul.qualPersonalcheck === "function") {
      const pc = qualModul.qualPersonalcheck(qualStore.personen, keys, art?.zugangRelevant ? d.zugang : "", heute);
      if (pc) {
        setzen("personalcheck", "erfahrung", pc.ok ? "ja" : "", "auto");
        setD((p) => ({ ...p, personalcheck: { ...p.personalcheck, erfahrungFehlt: Array.isArray(pc.fehlt) ? pc.fehlt : [] } }));
      }
    }
  }, [qualModul, qualStore, d.personal, d.zugang, d.arbeitsart]);

  // ── Teilprojekt C: Baum aus dem Kataster → Baumcheck aus der letzten Kontrolle ──
  useEffect(() => {
    let aktiv = true;
    if (!isBaumArbeit(d.arbeitsart) || !kundeId) { setKatalog(null); return; }
    (async () => {
      const [modul, daten, store] = await Promise.all([
        ladeModul("../baumkataster.js"), ladeModul("../baumkataster-data.js"), ncPost("/api/nc/baumkataster/kunde", { kundeId }),
      ]);
      if (!aktiv) return;
      setBkModul(modul);
      setBkBefund(daten?.BK_BEFUND && typeof daten.BK_BEFUND === "object" ? daten.BK_BEFUND : null);
      const baeume = store?.baeume ? Object.values(store.baeume).filter((b) => b && b.status !== "gefaellt" && b.status !== "entfernt") : [];
      setKatalog(baeume.length ? { baeume: baeume.map((b) => ({ id: b.nr, name: `${b.nr} · ${b.artDe || b.art || "Baum"}${b.standort ? " · " + b.standort : ""}`, baum: b })) } : null);
    })();
    return () => { aktiv = false; };
  }, [d.arbeitsart, kundeId]);
  const katasterBaumWaehlen = (nr) => {
    const e = katalog?.baeume.find((b) => b.id === nr);
    if (!e) { setzeTop({ katasterBaum: null }); return; }
    const vor = typeof bkModul?.bkFuerGbu === "function" ? bkModul.bkFuerGbu(e.baum) : null;
    const check = katasterInBaumcheck(vor?.baumcheck || vor?.kontrolle || vor || letzteKontrolle(e.baum));
    setD((p) => {
      const { baumcheck, automatik } = katasterUebernehmen(p.baumcheck, p.automatik, check);
      return {
        ...p,
        katasterBaum: { kundeId, nr, kontrolleId: check?.kontrolleId || null },
        baum: p.baum || `${e.baum.nr} ${e.baum.artDe || e.baum.art || ""}`.trim(),
        baumcheck, automatik,
      };
    });
  };

  const buildRecord = () => ({
    ...d,
    id: "gbu-" + Date.now(), createdAt: new Date().toISOString(), userName: meName,
    // Der einzige Login, der bei der Weitergabe an Kolleg:innen sicher
    // bekannt ist (gbuBeteiligteSchluessel in src/gbu-offline.js) — die
    // aufsichtsfuehrende Person ist dort nur ein Freitextname.
    meLogin: me?.login || "",
    kunde: selCustomer ? { id: selCustomer.id || selCustomer.rowid, name: selCustomer.name } : (selProject?.thirdparty_name ? { name: selProject.thirdparty_name } : null),
    projekt: selProject ? { id: selProject.id || selProject.rowid, ref: selProject.ref, title: selProject.title } : null,
    zugang: art?.zugangRelevant ? d.zugang : "",
    baum: String(d.baum || "").trim(), beschreibung: String(d.beschreibung || "").trim(),
    zeitrahmenStunden: d.zeitrahmenStunden === "" ? "" : Number(String(d.zeitrahmenStunden).replace(",", ".")),
    kopf: { ...d.kopf, aufsicht: String(d.kopf.aufsicht || "").trim() || meName, mobil: (d.kopf.mobil || []).map((m) => String(m || "").trim()).filter(Boolean) },
    baumcheck: isBaumArbeit(d.arbeitsart) ? d.baumcheck : null,
    personal: d.personal.filter((p) => p.name.trim()),
    zweitePersonName: String(d.zweitePersonName || "").trim(),
  });

  // Schritt 1 prüft nur das Formular (Unterschriften kommen in Schritt 2/3).
  const goToSign = () => {
    const errors = validateGbu({ ...buildRecord(), sigDurchfuehrender: "x", sigZweitePerson: "x" });
    if (errors.length) { showToast(errors[0], "error"); return; }
    setStep(2);
  };

  const save = async () => {
    const record = buildRecord();
    const errors = validateGbu(record);
    if (errors.length) { showToast(errors[0], "error"); return; }
    setSaving(true);
    if (record.katasterBaum) speichereKatasterAusstehend([...ladeKatasterAusstehend(), { ...record.katasterBaum, gbuId: record.id }]);
    // Reihenfolge ist die Regel: ERST die Warteschlange (das ist die
    // eigentliche Speicherung — geht buildGbuPdf gleich schief, ist die
    // Beurteilung trotzdem nicht weg), DANN das PDF nach IndexedDB. Nie
    // umgekehrt.
    saveGbuQueue([...loadGbuQueue(), record]);
    await gbuPdfSpeichernLokal(record, betrieb);
    if (navigator.onLine) {
      // Ungeladener Mandant sperrt nichts — dieselbe Regel wie useBlock/useFunktion.
      if (!mandant || funktionAktiv(mandant, "gbu")) await processGbuQueue(api, showToast, betrieb);
      katasterVerweiseNachtragen();
      setSaving(false);
      onSaved?.();
    } else {
      // VSG 4.2/SVLFG B09: die Beurteilung muss der Aufsichtsperson VOR ORT
      // vorliegen — "kommt automatisch mit Netz" reicht nicht. Statt sofort
      // zu schließen (onSaved) ein weiterer Schritt mit dem Weitergeben-Weg.
      setGespeichertesRecord(record);
      setSaving(false);
      setStep(4);
    }
  };

  // ── Teilprojekt C: aus der laufenden GBU heraus einen Baum ins Kataster
  // aufnehmen. Baum zuerst, dann die Kontrolle mit seiner Nummer — der
  // GBU-Verweis läuft danach von selbst über die bestehende Nachtragsliste,
  // weil katasterBaum gesetzt wird.
  const katasterAufnehmen = async () => {
    const { vorschlag, vitalitaet, verkehrssicher } = katasterNeu;
    setKatasterNeu((p) => ({ ...p, laeuft: true }));
    try {
      const a = await ncPost("/api/nc/baumkataster/baum/save", { kundeId, kundeName: selCustomer?.name || "", baum: vorschlag.baum });
      if (!a?.baum?.nr) throw new Error("Baum konnte nicht angelegt werden");
      const kontrolle = { ...vorschlag.kontrolle, vitalitaet, verkehrssicher };
      const b = await ncPost("/api/nc/baumkataster/kontrolle/save", { kundeId, nr: a.baum.nr, kontrolle, fotos: [] });
      setzeTop({ katasterBaum: { kundeId, nr: a.baum.nr, kontrolleId: b?.kontrolle?.id || null } });
      showToast(`${a.baum.nr} ins Kataster aufgenommen — die Beurteilung steht als Zusatzkontrolle darin.`);
      setKatasterNeu(null);
    } catch (e) { showToast("Aufnehmen fehlgeschlagen: " + (e?.message || e), "error"); }
    finally { setKatasterNeu((p) => (p ? { ...p, laeuft: false } : null)); }
  };

  // ── Zeichnen einer Block-Zeile je Typ ──
  const status = (b, id) => d.automatik[`${b}.${id}`];
  const zeile = (b, z) => {
    const wert = d[b.id]?.[z.id];
    if (z.typ === "check") {
      if (b.id === "material" && z.id === "funkGeprueft" && d.baustelle.funk !== "ja") return null;
      let zusatz = null;
      if (b.id === "baustelle" && z.id === "witterung" && d.wetter) {
        zusatz = <div className="fb-hinweis">{wetterZeile(d.wetter)}{wetterHinweis ? ` · ${wetterHinweis}` : ""}</div>;
      } else if (b.id === "baustelle" && z.id === "stromleitung") {
        zusatz = <input style={{ marginTop: 6 }} value={d.baustelle.stromleitungText} placeholder="Entfernung / Art, z. B. Freileitung in ca. 15 m"
          onChange={(e) => setzen("baustelle", "stromleitungText", e.target.value)} />;
      } else if (b.id === "personalcheck" && z.id === "erfahrung" && d.personalcheck.erfahrungFehlt.length) {
        zusatz = <div className="gbu-warn" style={{ marginTop: 6 }}><Icon name="warning" size={16} /> Fehlt: {d.personalcheck.erfahrungFehlt.join(", ")}</div>;
      }
      return <CheckZeile key={z.id} label={z.label} hinweis={z.hinweis} wert={wert} status={status(b.id, z.id)} onChange={(v) => setzen(b.id, z.id, v)} zusatz={zusatz} />;
    }
    if (z.typ === "zeit") {
      return (
        <div className="gbu-item" key={z.id}>
          <div className="gbu-item-label">{z.label}<AutoBadge status={status(b.id, "dauer")} /></div>
          <div className="form-row">
            <div className="field-group" style={{ flex: 1 }}><label>von</label><TimeField value={d.baustelle.dauerVon} onChange={(e) => setzen("baustelle", "dauerVon", e.target.value)} /></div>
            <div className="field-group" style={{ flex: 1 }}><label>bis (voraussichtlich)</label><TimeField value={d.baustelle.dauerBis} onChange={(e) => setzen("baustelle", "dauerBis", e.target.value)} /></div>
          </div>
        </div>
      );
    }
    if (z.typ === "wahl") {
      return (
        <div className="gbu-item" key={z.id}>
          <div className="gbu-item-label">{z.label}<AutoBadge status={status(b.id, z.id)} /></div>
          <div className="gbu-chips">
            {z.optionen.map((o) => (
              <button key={o} type="button" className={`gbu-chip ${wert === o ? "gbu-chip-active" : ""}`} onClick={() => setzen(b.id, z.id, wert === o ? "" : o)}>{o}</button>
            ))}
          </div>
        </div>
      );
    }
    // text
    return (
      <div className="gbu-item" key={z.id}>
        <div className="field-group"><label>{z.label}<AutoBadge status={status(b.id, z.id)} /></label>
          {b.id === "freigabe" ? <textarea value={wert || ""} onChange={(e) => setzen(b.id, z.id, e.target.value)} placeholder="z. B. nur Totholz vom Boden, kein Aufstieg" />
            : <input value={wert || ""} onChange={(e) => setzen(b.id, z.id, e.target.value)} />}
        </div>
        {b.id === "baustelle" && z.id === "sonstigeGefahren" && b.chips?.length > 0 && (
          <div className="gbu-chips" style={{ marginTop: 8 }}>
            {b.chips.map((c) => (
              <button key={c} type="button" className={`gbu-chip ${d.baustelle.sonstigeGefahrenChips.includes(c) ? "gbu-chip-active" : ""}`}
                onClick={() => setzen("baustelle", "sonstigeGefahrenChips", toggleIn(d.baustelle.sonstigeGefahrenChips, c))}>{c}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const befundBereiche = bkBefund
    ? Object.entries(bkBefund).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x : x?.label || x?.text || String(x)))])
    : [["umfeld", GBU_BAUM_UMFELD], ["stamm", GBU_BAUM_STAMM], ["krone", GBU_BAUM_KRONE]];
  const befundToggle = (bereich, v) => setD((p) => ({ ...p, baumcheck: { ...p.baumcheck, befund: { ...p.baumcheck.befund, [bereich]: toggleIn(p.baumcheck.befund[bereich] || [], v) } } }));

  const block = (b) => (
    <div className="form-section" key={b.id}>
      <div className="form-section-title">{b.titel}</div>
      {b.id === "baumcheck" && katalog && (
        <div className="field-group mb12"><label>Baum aus dem Kataster (letzte Kontrolle wird übernommen)</label>
          <SuchAuswahl liste={katalog.baeume} wert={d.katasterBaum?.nr || ""} platzhalter="Baumnummer oder Art tippen" leerLabel="Tippen, um zu suchen."
            onWaehlen={(nr) => katasterBaumWaehlen(nr)} />
        </div>
      )}
      {b.id === "baumcheck" && !d.katasterBaum && bkModul?.bkBaumAusGbu && kundeId && d.kopf.gps && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }}
          onClick={() => {
            const v = bkModul.bkBaumAusGbu({ ...buildRecord(), kunde: { id: kundeId } });
            if (!v) { showToast("Ohne Kunde und GPS-Position geht das nicht.", "error"); return; }
            setKatasterNeu({ vorschlag: v, vitalitaet: v.kontrolle.vitalitaet, verkehrssicher: v.kontrolle.verkehrssicher, laeuft: false });
          }}>🌳 Baum ins Kataster aufnehmen</button>
      )}
      {b.zeilen.map((z) => zeile(b, z))}
      {b.id === "baumcheck" && (
        <div className="gbu-item">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDetailsOffen((v) => !v)}>{detailsOffen ? "Befund-Details ausblenden" : "Befund-Details (Chips) einblenden"}</button>
          {detailsOffen && befundBereiche.map(([bereich, liste]) => (
            <div className="field-group" style={{ marginTop: 8 }} key={bereich}><label>{bereich}</label>
              <div className="gbu-chips">
                {liste.map((v) => (
                  <button key={v} type="button" className={`gbu-chip ${(d.baumcheck.befund[bereich] || []).includes(v) ? "gbu-chip-active" : ""}`} onClick={() => befundToggle(bereich, v)}>{v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {b.id === "material" && d.material.offeneFristen.length > 0 && (
        <div className="gbu-warn" style={{ marginTop: 8 }}><Icon name="warning" size={16} />
          Betriebsmittel mit offener Frist: {d.material.offeneFristen.map((f) => `${f.batch} (${f.grund || f.stufe})`).join(", ")} — Zeilen bleiben offen, bis du sie bestätigst.
        </div>
      )}
    </div>
  );

  return (<>
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gbu-modal">
        <div className="modal-handle" />
        <div className="modal-title">
          {step === 1 ? "Gefährdungsbeurteilung vor Ort"
            : step === 2 ? "Unterschrift: Aufsichtsführende(r) / Durchführende(r)"
            : step === 3 ? "Unterschrift: Zweite Person"
            : "Gespeichert — noch nicht bei den Kollegen"}
        </div>

        {step === 1 && (<>
          <div className="form-section">
            <div className="form-section-title">Einsatz</div>
            <div className="field-group mb12"><label>Projekt</label>
              <select value={projektId} onChange={pickProject}>
                <option value="">— Kein Projekt (nur Archiv) —</option>
                {projects.map((p) => <option key={p.id || p.rowid} value={p.id || p.rowid}>{p.ref} · {p.title}</option>)}
              </select>
            </div>
            <div className="field-group mb12"><label>Kunde</label>
              <SuchAuswahl liste={customers} wert={kundeId || String(selCustomer?.id || selCustomer?.rowid || "")} platzhalter="Kunde suchen — Name tippen"
                leerLabel="Namen tippen, um zu suchen." onWaehlen={(id) => setKundeId(id)} />
            </div>
            {letzterEinsatz && (
              <div className="gbu-uebernahme mb12">
                <div><b>Schon einmal hier gewesen</b>
                  <span>{new Date(letzterEinsatz.createdAt).toLocaleDateString("de-DE")} · {gbuArbeitsart(letzterEinsatz.arbeitsart)?.label || letzterEinsatz.arbeitsart || "Einsatz"}</span></div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={uebernehmen}>Vom letzten Einsatz übernehmen</button>
                <div className="gbu-uebernahme-hinweis">Witterung, Zeiten, Baumcheck, Material-/Personalcheck, Unterschriften werden nicht übernommen — die beurteilst du vor Ort neu.</div>
              </div>
            )}
            <div className="field-group mb12"><label>Arbeitsart</label>
              <div className="gbu-chips">
                {GBU_ARBEITSARTEN.map((a) => (
                  <button key={a.id} type="button" className={`gbu-chip ${d.arbeitsart === a.id ? "gbu-chip-active" : ""}`} onClick={() => setzeTop({ arbeitsart: a.id })}>{a.label}</button>
                ))}
              </div>
            </div>
            {isBaumArbeit(d.arbeitsart) && (<>
              <div className="field-group mb12">
                <label>{d.anzahlOffen ? "Arbeitsbereich (wo genau wird gearbeitet?) *" : "Baum/Bäume (Anzahl, Standort; Art falls bekannt) *"}</label>
                <input value={d.baum} onChange={(e) => setzeTop({ baum: e.target.value })}
                  placeholder={d.anzahlOffen ? "z. B. Schlosspark, Altbaumbestand an der Allee" : "z. B. 1 Bergahorn, Vorgarten — oder: 5 Obstbäume, Wiese"} />
              </div>
              <div className="field-group mb12">
                <label className="gbu-schalter"><input type="checkbox" checked={!!d.anzahlOffen} onChange={(e) => setzeTop({ anzahlOffen: e.target.checked })} /><span>Anzahl steht nicht fest — Arbeit nach Zeit</span></label>
              </div>
              {(d.anzahlOffen || d.zeitrahmenStunden !== "") && (
                <div className="field-group mb12"><label>Zeitrahmen in Stunden{d.anzahlOffen ? " *" : ""}</label>
                  <input type="number" inputMode="decimal" step="0.5" min="0.5" max="24" value={d.zeitrahmenStunden} onChange={(e) => setzeTop({ zeitrahmenStunden: e.target.value })} placeholder="z. B. 8" />
                  <div className="fb-hinweis">{gbuUmfangText({ anzahlOffen: d.anzahlOffen, zeitrahmenStunden: d.zeitrahmenStunden }) || "Halbe Stunden gehen (0,5 bis 24)."}</div>
                </div>
              )}
              <div className="field-group mb12"><label>Durchzuführende Arbeiten *</label>
                <div className="gbu-chips">
                  {GBU_DURCHZUFUEHRENDE_ARBEITEN.map((a) => (
                    <button key={a} type="button" className={`gbu-chip ${d.arbeiten.includes(a) ? "gbu-chip-active" : ""}`} onClick={() => setzeTop({ arbeiten: toggleIn(d.arbeiten, a) })}>{a}</button>
                  ))}
                </div>
                <input style={{ marginTop: 8 }} value={d.arbeitenSonstiges} onChange={(e) => setzeTop({ arbeitenSonstiges: e.target.value })} placeholder="Sonstiges…" />
              </div>
            </>)}
            {art?.beschreibungPflicht && (
              <div className="field-group mb12"><label>Tätigkeit beschreiben *</label>
                <input value={d.beschreibung} onChange={(e) => setzeTop({ beschreibung: e.target.value })} placeholder="z. B. Zaunbau, Pflasterarbeiten…" />
              </div>
            )}
            {art?.zugangRelevant && (
              <div className="field-group"><label>Zugang / Arbeitsverfahren</label>
                <div className="gbu-chips">
                  {GBU_ZUGAENGE.map((z) => (
                    <button key={z.id} type="button" className={`gbu-chip ${d.zugang === z.id ? "gbu-chip-active" : ""}`} onClick={() => setzeTop({ zugang: z.id })}>{z.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">Einsatzort und Erreichbarkeit</div>
            <div className="form-row mb12">
              <div className="field-group" style={{ flex: 1 }}><label>Datum<AutoBadge status={status("kopf", "datum")} /></label>
                <input type="date" value={d.kopf.datum} onChange={(e) => setzen("kopf", "datum", e.target.value)} /></div>
              <div className="field-group" style={{ flex: 1 }}><label>bis (bei Zeitraum)</label>
                <input type="date" value={d.kopf.datumBis} min={d.kopf.datum} onChange={(e) => setzen("kopf", "datumBis", e.target.value)} /></div>
            </div>
            <div className="field-group mb12"><label>Einsatzort/Ortsteil *<AutoBadge status={status("kopf", "einsatzort")} /></label>
              <input value={d.kopf.einsatzort} onChange={(e) => setzen("kopf", "einsatzort", e.target.value)} placeholder="z. B. Musterstadt Musterviertel" /></div>
            <div className="field-group mb12"><label>Straße/Nr./Park<AutoBadge status={status("kopf", "strasse")} /></label>
              <input value={d.kopf.strasse} onChange={(e) => setzen("kopf", "strasse", e.target.value)} placeholder="z. B. Zur Musterstraße 10" />
              {d.kopf.adresseGeo && <div className="fb-hinweis">Laut GPS: {d.kopf.adresseGeo}</div>}
            </div>
            <div className="field-group mb12"><label>Standort/Zufahrtsweg</label>
              <input value={d.kopf.standort} onChange={(e) => setzen("kopf", "standort", e.target.value)} placeholder="z. B. Garten hinterm Haus, Zufahrt über Feldweg" /></div>
            <div className="field-group mb12"><label>Festnetz-Nr. vor Ort</label>
              <input value={d.kopf.festnetz} onChange={(e) => setzen("kopf", "festnetz", e.target.value)} inputMode="tel" /></div>
            <div className="field-group mb12"><label>Mobil-Nr. vor Ort (1–3)<AutoBadge status={status("kopf", "mobil")} /></label>
              {[0, 1, 2].map((i) => (
                <input key={i} style={{ marginTop: i ? 6 : 0 }} inputMode="tel" value={d.kopf.mobil[i] || ""} placeholder={`${i + 1}. Mobil-Nr.`}
                  onChange={(e) => { const m = [...d.kopf.mobil]; m[i] = e.target.value; setzen("kopf", "mobil", m); }} />
              ))}
            </div>
            <CheckZeile label="Netzempfang" wert={d.kopf.netz} status={status("kopf", "netz")} onChange={(v) => setzen("kopf", "netz", v)} />
            <div className="field-group mb12"><label>Aufsichtsführende(r) *<AutoBadge status={status("kopf", "aufsicht")} /></label>
              <SuchAuswahl personen={personen} freitext wert={d.kopf.aufsicht} platzhalter="Vor- und Nachname — tippen zum Suchen" onWaehlen={aufsichtWaehlen} />
              {aufsichtVorschlag && <div className="fb-hinweis">Vorschlag laut Qualifikationen: {aufsichtVorschlag.name}{aufsichtVorschlag.grund ? ` (${aufsichtVorschlag.grund})` : ""}</div>}
              {d.aufsichtAbweichung && (
                <input style={{ marginTop: 6 }} value={d.aufsichtAbweichung.grund} placeholder="Grund für die Abweichung vom Vorschlag *"
                  onChange={(e) => setD((p) => ({ ...p, aufsichtAbweichung: { ...p.aufsichtAbweichung, grund: e.target.value } }))} />
              )}
            </div>
            <div className="gbu-item">
              <div className="gbu-item-label">Lageplan (GPS)<AutoBadge status={status("kopf", "gps")} /></div>
              <div className="form-row" style={{ alignItems: "center", gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => gpsHolen()}>Position neu bestimmen</button>
                <span style={{ fontSize: 12.5, color: "var(--text2)" }}>{gpsStatus || (d.kopf.gps ? `${d.kopf.gps.lat.toFixed(5)}, ${d.kopf.gps.lon.toFixed(5)} (±${Math.round(d.kopf.gps.genauigkeitM)} m)` : "noch keine Position")}</span>
              </div>
              {d.kopf.karte && <img src={d.kopf.karte} alt="Lageplan" style={{ width: "100%", maxWidth: 384, borderRadius: 8, marginTop: 8, display: "block" }} />}
              {d.kopf.gps && !d.kopf.karte && <div className="fb-hinweis">Karte nicht verfügbar (offline) — im PDF stehen die Koordinaten.</div>}
              <div className="fb-hinweis" style={{ fontWeight: 700 }}>Notruf 112 — Einsatzort und Zufahrt oben sind die Angaben für die Rettungskräfte.</div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Anwesendes Personal</div>
            <div className="gbu-chips mb12">
              {personen.map((p) => (
                <button key={p.login} type="button" className={`gbu-chip ${personDa(p.login) ? "gbu-chip-active" : ""}`} onClick={() => personToggle(p)}>{p.name}</button>
              ))}
            </div>
            <div className="form-row mb12" style={{ gap: 8 }}>
              <input style={{ flex: 1 }} value={aushilfe} onChange={(e) => setAushilfe(e.target.value)} placeholder="Aushilfe (Name) …" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={aushilfeDazu}>+ Person</button>
            </div>
            {d.personal.map((p, i) => (
              <div className="gbu-item" key={`${p.key}|${p.name}|${i}`}>
                <div className="form-row" style={{ alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>{p.name}{p.mobil ? <span style={{ fontSize: 12, color: "var(--text2)" }}> · {p.mobil}</span> : ""}</div>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setzeTop({ personal: d.personal.filter((_, idx) => idx !== i) })}>✕</button>
                </div>
                {!qualModul && (
                  <div className="gbu-chips" style={{ marginTop: 8 }}>
                    {GBU_QUALIFIKATIONEN.map((q) => (
                      <button key={q} type="button" className={`gbu-chip ${p.quals.includes(q) ? "gbu-chip-active" : ""}`}
                        onClick={() => setzeTop({ personal: d.personal.map((x, idx) => (idx === i ? { ...x, quals: toggleIn(x.quals, q) } : x)) })}>{q}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {bloecke.filter((b) => b.id !== "kopf").map(block)}

          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={goToSign} disabled={!d.arbeitsart}>Weiter zur Unterschrift</button>
          </div>
        </>)}

        {step === 2 && (<>
          <div className="form-section">
            <div className="form-section-title">{d.kopf.aufsicht || meName || "Aufsichtsführende(r)"} unterschreibt{d.kopf.aufsicht && d.kopf.aufsicht !== meName ? ` (Gerät: ${meName})` : ""}</div>
            <SignaturePad onChange={(s) => setzeTop({ sigDurchfuehrender: s })} initial={d.sigDurchfuehrender} height={400} />
          </div>
          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { if (!d.sigDurchfuehrender) { showToast("Bitte erst unterschreiben", "error"); return; } setStep(3); }}>Weiter</button>
          </div>
        </>)}

        {step === 3 && (<>
          <div className="form-section">
            <div className="form-section-title">{d.zugang === "skt" && art?.zugangRelevant ? "Zweite rettungsfähige Person – Name Pflicht" : "Zweite Person – optional"}</div>
            {d.zugang === "skt" && art?.zugangRelevant && (
              <div className="hint mb12">Unterschreiben muss sie nicht — das Papierformular kennt dafür keine Zeile. Ihr Name gehört aber in die Beurteilung.</div>
            )}
            <div className="field-group mb12"><label>Name zweite Person</label>
              <SuchAuswahl personen={personen} freitext wert={d.zweitePersonName} platzhalter="Vor- und Nachname" onWaehlen={(v) => setzeTop({ zweitePersonName: v })} />
            </div>
            <SignaturePad onChange={(s) => setzeTop({ sigZweitePerson: s })} initial={d.sigZweitePerson} height={400} />
          </div>
          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)} disabled={saving}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
              {saving ? "Speichere…" : !d.sigZweitePerson ? "Ohne 2. Unterschrift speichern" : "Speichern & ablegen"}
            </button>
          </div>
        </>)}

        {/* Nur ohne Netz erreicht (siehe save()): die Beurteilung liegt lokal
            vor (Warteschlange + PDF in IndexedDB), aber noch nicht bei den
            Kollegen — VSG 4.2/SVLFG B09 verlangen Einsicht VOR ORT, "kommt
            automatisch mit Netz" reicht bis dahin nicht. */}
        {step === 4 && (<>
          <div className="form-section">
            <div className="hint mb12">Ohne Netz gespeichert — bei den Kollegen ist sie noch nicht. Über „An Kollegen weitergeben" geht das auch ohne Internet (Bluetooth/Nearby Share des Geräts).</div>
          </div>
          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" disabled={teilenLaeuft} onClick={() => onSaved?.()}>Fertig</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={teilenLaeuft} onClick={async () => {
              setTeilenLaeuft(true);
              try {
                const blob = await idbHolen(GBU_PDF_DB, GBU_PDF_SPEICHER, gespeichertesRecord.id);
                if (!blob) { showToast("Kein lokales PDF zum Weitergeben.", "error"); return; }
                const dateiname = buildGbuFilename(gespeichertesRecord.createdAt, gespeichertesRecord.kunde?.name || gespeichertesRecord.projekt?.ref || "", gespeichertesRecord.arbeitsart);
                await gbuTeilenOderSpeichern(blob, dateiname, showToast);
              } finally { setTeilenLaeuft(false); }
            }}>
              {teilenLaeuft ? "…" : "An Kollegen weitergeben"}
            </button>
          </div>
        </>)}
      </div>
    </div>

    {katasterNeu && (
      <div className="modal-backdrop" onClick={() => !katasterNeu.laeuft && setKatasterNeu(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Baum ins Kataster aufnehmen</h3>
          <div className="hint">{katasterNeu.vorschlag.baum.artDe || "Baum"} · {katasterNeu.vorschlag.baum.lat.toFixed(5)}, {katasterNeu.vorschlag.baum.lon.toFixed(5)}</div>
          <div className="field-group"><label>Vitalität (Roloff 0–3)</label>
            <div className="gbu-chips">{[0, 1, 2, 3].map((s) => (
              <button key={s} type="button" className={`gbu-chip ${katasterNeu.vitalitaet === s ? "gbu-chip-active" : ""}`}
                onClick={() => setKatasterNeu((p) => ({ ...p, vitalitaet: s }))}>{s}</button>))}
            </div>
          </div>
          <div className="field-group"><label>Verkehrssicherheit</label>
            <div className="gbu-chips">{[["ja", "gegeben"], ["eingeschraenkt", "eingeschränkt"], ["nein", "nicht gegeben"]].map(([id, label]) => (
              <button key={id} type="button" className={`gbu-chip ${katasterNeu.verkehrssicher === id ? "gbu-chip-active" : ""}`}
                onClick={() => setKatasterNeu((p) => ({ ...p, verkehrssicher: id }))}>{label}</button>))}
            </div>
          </div>
          <div className="action-row action-row-2">
            <button type="button" className="btn btn-ghost" disabled={katasterNeu.laeuft} onClick={() => setKatasterNeu(null)}>Abbrechen</button>
            <button type="button" className="btn btn-primary" disabled={katasterNeu.laeuft} onClick={katasterAufnehmen}>{katasterNeu.laeuft ? "Legt an …" : "Anlegen"}</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
