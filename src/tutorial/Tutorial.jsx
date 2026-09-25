// Ablaufsteuerung und nachgebaute Eingabemasken des Pflicht-Tutorials.
//
// Bewusst ohne jeden Zugriff nach draußen: kein fetch, kein `api`-Objekt, kein
// Import aus dolibarr-app.jsx. Der einzige Weg nach außen sind die Rückrufe
// onFertig (alle vier Übungen bestanden) und onSpaeter (nur wenn nicht
// pflicht). Was eine Eingabe „richtig" macht, steht in uebungen.js — hier
// stehen nur die nachgebauten Masken und die Reihenfolge, in der sie
// erscheinen.
//
// UEBUNGEN (aus uebungen.js) legt alle vier Übungen in fester Reihenfolge
// fest: zeit, gbu, beleg, kundeprojekt. Alle vier sind hier gebaut, siehe
// Maske() weiter unten.
import TimeField from "../zeitfeld.jsx";
import { useEffect, useRef, useState } from "react";
import {
  UEBUNGEN, UEBUNG_AUFGABEN, UEBUNG_GBU_PUNKTE, UEBUNG_GBU_MASSNAHMEN,
  UEBUNG_BELEG, UEBUNG_BELEG_VORBELEGT, UEBUNG_KONTEN, UEBUNG_LIEFERANTEN,
  UEBUNG_ZUSCHNITT_ZIEL, UEBUNG_ZUSCHNITT_START,
  pruefeZeit, pruefeGbu, pruefeZuschnitt, pruefeBeleg, pruefeKunde, pruefeProjekt,
  zahl,
} from "./uebungen.js";
// Reines Datenmodul ohne React und ohne Netzzugriff (siehe dortiger
// Kommentar) — die Sperre oben verbietet nur den Import aus
// dolibarr-app.jsx. Beschriftungen hier aus derselben Quelle wie die echte
// Maske, damit eine geänderte Beschriftung das Tutorial nicht heimlich
// veralten lässt (Befund S9 der Abschlussprüfung).
import { GBU_NIEDERSCHLAG, GBU_ARBEITSARTEN, GBU_ZUGAENGE, GBU_DURCHZUFUEHRENDE_ARBEITEN } from "../gbu-data.js";

/**
 * Geräteweiter Schlüssel wäre auf einem geteilten Gerät falsch: die zweite
 * Person, die sich anmeldet, sähe sonst den Übungsstand der ersten. Deshalb
 * pro Login ein eigener Schlüssel — und ohne Login (noch nicht angemeldet)
 * wird weder gelesen noch geschrieben.
 */
const standKey = (login) => `blattwerk_tutorial_stand:${login}`;

/**
 * Zwischenstand lesen. Alles außer einer ganzen Zahl 0…UEBUNGEN.length-1
 * zählt als „kein Stand" — lieber noch einmal von vorn als mit einem Index,
 * den es nicht gibt (z. B. nach einem Umbau, der eine Übung entfernt hat).
 */
function ladeStand(login) {
  if (!login) return 0;
  try {
    const i = JSON.parse(localStorage.getItem(standKey(login)) || "null")?.index;
    return Number.isInteger(i) && i >= 0 && i < UEBUNGEN.length ? i : 0;
  } catch {
    return 0;
  }
}

function speichereStand(index, login) {
  if (!login) return;
  try { localStorage.setItem(standKey(login), JSON.stringify({ index })); } catch (_) {}
}

/**
 * Fehlermarkierung als eigene Klasse statt `border-color`: `outline`
 * verschiebt kein Layout (anders als `border`) und wirkt auch dort, wo kein
 * eigener `border-style` gesetzt ist — z. B. bei den Chip-Gruppen
 * (`.gbu-chips`), deren Regel in dolibarr-app.jsx nur display/flex-wrap/gap
 * setzt. `basis` ist die vorhandene Klasse des Elements, falls es eine hat.
 */
const cx = (basis, falsch) => (falsch ? `${basis ? basis + " " : ""}tutorial-markiert` : (basis || undefined));

// ─── Übung „Zeit buchen" — Nachbau von ManualTimeEntry (dolibarr-app.jsx:8873) ─
function UebungZeit({ heute, uebung, onBestanden }) {
  // Vorbelegt mit heute, nicht mit gestern: den Tag auf gestern zu
  // korrigieren ist Teil dessen, was hier geübt wird (siehe pruefeZeit).
  // Pause auf 30 vorbelegt wie in der echten Maske; Von und Bis bleiben leer,
  // weil das Eintragen von Beginn und Ende genau der Handgriff ist, um den es
  // hier geht.
  const [form, setForm] = useState({ datum: heute, von: "", bis: "", pause: 30, aufgabe: "", beschreibung: "" });
  const [fehler, setFehler] = useState(null);
  const [bestanden, setBestanden] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const stil = (k) => cx(undefined, fehler?.feld === k);
  // Meldung nach jeder Prüfung ins Bild holen — bei den langen Masken liegt
  // sie sonst unterhalb des Scrollbereichs der Karte (siehe .tutorial-uebung
  // .modal im CSS-Block), und „Weiter"/„Eintragen" wirkt wie tot.
  const meldungRef = useRef(null);
  useEffect(() => {
    if (fehler || bestanden) meldungRef.current?.scrollIntoView({ block: "nearest" });
  }, [fehler, bestanden]);

  const eintragen = () => {
    const r = pruefeZeit(form, heute);
    setFehler(r);
    setBestanden(!r);
  };

  return (
    <>
      <div className="modal">
        <div className="modal-title">Manuelle Zeiterfassung</div>
        <div className="field-group mb12"><label>Datum</label><input type="date" value={form.datum} onChange={set("datum")} className={stil("datum")} /></div>
        <div className="form-row mb12">
          <div className="field-group"><label>Von</label><TimeField value={form.von} onChange={set("von")} className={stil("von")} /></div>
          <div className="field-group"><label>Bis</label><TimeField value={form.bis} onChange={set("bis")} className={stil("bis")} /></div>
        </div>
        <div className="field-group mb12"><label>Pause (Minuten)</label><input type="number" value={form.pause} onChange={set("pause")} min="0" max="480" step="5" className={stil("pause")} /></div>
        <div className="field-group mb12">
          <label>Aufgabe</label>
          <select value={form.aufgabe} onChange={set("aufgabe")} className={stil("aufgabe")}>
            <option value="">— Aufgabe wählen —</option>
            {UEBUNG_AUFGABEN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="field-group mb20"><label>Beschreibung</label><input value={form.beschreibung} onChange={set("beschreibung")} placeholder="Was wurde gemacht?" className={stil("beschreibung")} /></div>
        <button className="btn btn-primary" onClick={eintragen}>Eintragen</button>
      </div>
      {fehler && <div className="tutorial-fehler" ref={meldungRef}>{fehler.text}</div>}
      {bestanden && (
        <div className="tutorial-erfolg" ref={meldungRef}>
          {uebung.fertig}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBestanden}>Weiter</button>
        </div>
      )}
    </>
  );
}

// ─── Übung „Kunde und Projekt" — Nachbau von ThirdpartyForm (dolibarr-app.jsx:4755)
//     und ProjectForm (dolibarr-app.jsx:7470), hintereinander in einer Übung ─
function UebungKundeProjekt({ heute, uebung, onBestanden }) {
  const [phase, setPhase] = useState("kunde"); // "kunde" -> "projekt"
  const [kunde, setKunde] = useState({ name: "", email: "", telefon: "", adresse: "", plz: "", ort: "" });
  const [kundeFehler, setKundeFehler] = useState(null);
  const [projekt, setProjekt] = useState({
    titel: "", referenz: "", kunde: "", dateStart: "", timeStart: "08:00",
    dateEnd: "", timeEnd: "17:00", budget: "", statut: "Entwurf", description: "",
  });
  const [projektFehler, setProjektFehler] = useState(null);
  const [bestanden, setBestanden] = useState(false);

  const setK = (k) => (e) => setKunde((p) => ({ ...p, [k]: e.target.value }));
  const setP = (k) => (e) => setProjekt((p) => ({ ...p, [k]: e.target.value }));
  const stilK = (k) => cx(undefined, kundeFehler?.feld === k);
  const stilP = (k) => cx(undefined, projektFehler?.feld === k);
  // Meldung nach jeder Prüfung ins Bild holen (siehe UebungZeit). Ein Ref
  // reicht: pro Phase ist immer nur höchstens eine Meldung gleichzeitig da.
  const meldungRef = useRef(null);
  useEffect(() => {
    if (kundeFehler || projektFehler || bestanden) meldungRef.current?.scrollIntoView({ block: "nearest" });
  }, [kundeFehler, projektFehler, bestanden]);

  const speichern = () => {
    const r = pruefeKunde(kunde);
    setKundeFehler(r);
    // Sofort weiter, ohne Zwischenbestätigung — nur die Kunde/Projekt-Übung
    // hat zwei Masken hintereinander, siehe Aufgabenbeschreibung.
    if (!r) setPhase("projekt");
  };

  const erstellen = () => {
    const r = pruefeProjekt(projekt, heute);
    setProjektFehler(r);
    setBestanden(!r);
  };

  if (phase === "kunde") {
    return (
      <>
        <div className="modal">
          <div className="modal-title">Neuer Kunde</div>
          <div className="field-group mb12"><label>Name *</label><input value={kunde.name} onChange={setK("name")} placeholder="Firmenname oder Person" className={stilK("name")} /></div>
          <div className="field-group mb12"><label>E-Mail</label><input type="email" value={kunde.email} onChange={setK("email")} placeholder="email@beispiel.de" /></div>
          <div className="field-group mb12"><label>Telefon</label><input type="tel" value={kunde.telefon} onChange={setK("telefon")} placeholder="+49 ..." /></div>
          <div className="field-group mb12"><label>Adresse</label><input value={kunde.adresse} onChange={setK("adresse")} placeholder="Straße und Hausnummer" className={stilK("adresse")} /></div>
          <div className="form-row mb20">
            <div className="field-group"><label>PLZ</label><input value={kunde.plz} onChange={setK("plz")} placeholder="12345" className={stilK("plz")} /></div>
            <div className="field-group"><label>Ort</label><input value={kunde.ort} onChange={setK("ort")} placeholder="Stadt" className={stilK("ort")} /></div>
          </div>
          <button className="btn btn-primary" onClick={speichern}>Speichern</button>
        </div>
        {kundeFehler && <div className="tutorial-fehler" ref={meldungRef}>{kundeFehler.text}</div>}
      </>
    );
  }

  return (
    <>
      <div className="tutorial-hinweis">Kunde angelegt — jetzt das Projekt dazu.</div>
      <div className="modal">
        <div className="modal-title">Neues Projekt</div>
        <div className="field-group mb12"><label>Titel *</label><input value={projekt.titel} onChange={setP("titel")} placeholder="Projektname" className={stilP("titel")} /></div>
        <div className="field-group mb12"><label>Referenz (optional)</label><input value={projekt.referenz} onChange={setP("referenz")} placeholder="Leer lassen für automatische Vergabe" /></div>
        <div className="field-group mb12">
          <label>Kunde optional</label>
          {/* Bewusst ein einfaches select statt SearchSelect: das lebt in
              dolibarr-app.jsx und ist nicht exportiert. Kein Autoselect auf
              den eben angelegten Kunden — das Zuordnen ist Teil der Übung,
              siehe pruefeProjekt. */}
          <select value={projekt.kunde} onChange={setP("kunde")} className={stilP("kunde")}>
            <option value="">— Kunde wählen —</option>
            <option value={kunde.name}>{kunde.name}</option>
          </select>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Startdatum</label><input type="date" value={projekt.dateStart} onChange={setP("dateStart")} className={stilP("dateStart")} /></div>
          <div className="field-group"><label>Startzeit</label><TimeField value={projekt.timeStart} onChange={setP("timeStart")} className={stilP("timeStart")} /></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Enddatum</label><input type="date" value={projekt.dateEnd} onChange={setP("dateEnd")} /></div>
          <div className="field-group"><label>Endzeit</label><TimeField value={projekt.timeEnd} onChange={setP("timeEnd")} /></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Budget (€)</label><input type="number" value={projekt.budget} onChange={setP("budget")} min="0" step="0.01" placeholder="0,00" /></div>
          <div className="field-group">
            <label>Status</label>
            <select value={projekt.statut} onChange={setP("statut")}>
              <option value="Entwurf">Entwurf</option>
              <option value="Offen">Offen</option>
            </select>
          </div>
        </div>
        <div className="field-group mb20"><label>Beschreibung</label><textarea value={projekt.description} onChange={setP("description")} placeholder="Worum geht es?" rows={3} /></div>
        <button className="btn btn-primary" onClick={erstellen}>Erstellen</button>
      </div>
      {projektFehler && <div className="tutorial-fehler" ref={meldungRef}>{projektFehler.text}</div>}
      {bestanden && (
        <div className="tutorial-erfolg" ref={meldungRef}>
          {uebung.fertig}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBestanden}>Weiter</button>
        </div>
      )}
    </>
  );
}

// ─── Übung „Gefährdungsbeurteilung" — Nachbau von GbuForm (dolibarr-app.jsx:1740),
//     verkürzt: nur Einsatz, Arbeitsart, Zugang, drei Prüfpunkte, Unterschrift.
//     Beschriftungen/Optionen wörtlich aus GbuForm bzw. src/gbu-data.js. ─────
// Niederschlag: keine Auswahl, unten direkt GBU_NIEDERSCHLAG verwendet —
// vorher eine wörtliche Kopie hier (Befund S9).

// Werte bewusst nicht die Beschriftung selbst (anders als bei Niederschlag):
// pruefeGbu prüft e.wind === "maessig", nicht den angezeigten Text. Bleibt
// eigens definiert: gbu-data.js kennt für Wind keine IDs, dort ist der
// Anzeige-Text selbst der gespeicherte Wert (siehe GBU_WIND dort).
const GBU_WIND_UEBUNG = [
  ["windstill", "windstill"],
  ["leicht", "leichter Wind"],
  ["maessig", "mäßiger Wind"],
  ["stark", "starker Wind/Böen"],
];
// Verkürzter Nachbau: nur die vier Arbeitsarten, um die es in der Übung
// gehen kann (kein Fräsen/keine Erdarbeiten/kein „Sonstiges" — es geht um
// eine Fällung). Aus GBU_ARBEITSARTEN gefiltert statt abgeschrieben, damit
// eine geänderte Beschriftung nicht heimlich veraltet (Befund S9).
const GBU_ARBEITSARTEN_UEBUNG = GBU_ARBEITSARTEN
  .filter((a) => ["baumpflege", "faellung", "hecke", "maehen"].includes(a.id))
  .map(({ id, label }) => ({ id, label }));
// Verkürzter Nachbau: ohne Kronensicherung/-schnitt — pruefeGbu verlangt nur
// „Fällung" bei den durchzuführenden Arbeiten (Befund S9).
const GBU_ARBEITEN_UEBUNG = GBU_DURCHZUFUEHRENDE_ARBEITEN
  .filter((a) => !["Kronensicherung", "Kronensicherungsschnitt"].includes(a));
// Zugänge: keine Auswahl, alle vier aus gbu-data.js — nur auf id/label
// gekürzt, die Übung braucht recht/items nicht (Befund S9).
const GBU_ZUGAENGE_UEBUNG = GBU_ZUGAENGE.map(({ id, label }) => ({ id, label }));

// Dreizustands-Schalter je Prüfpunkt — Nachbau von GbuTriState (dolibarr-app.jsx:1730).
function GbuTriState({ value, onChange }) {
  return (
    <div className="gbu-tri">
      {[["ok", "OK"], ["mangel", "Mangel"], ["nr", "n. r."]].map(([v, l]) => (
        <button key={v} type="button" className={`gbu-tri-btn ${value === v ? `gbu-tri-${v}` : ""}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

// Unterschrift, verkürzt: eine Zeichenfläche statt des vollen SignaturePad-
// Nachbaus (dolibarr-app.jsx:1665) — `unterschrift` wird beim ersten Strich
// wahr, mehr prüft pruefeGbu nicht (siehe uebungen.js).
function GbuUnterschrift({ value, onChange, fehlerhaft }) {
  const canvasRef = useRef(null);
  const zeichnend = useRef(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 700, 200);
    ctx.strokeStyle = "#14243a"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  // Zeichenkoordinaten auf die tatsächliche (per CSS skalierte) Canvas-Größe
  // umrechnen — sonst zeichnet man auf einem schmalen Bildschirm daneben.
  const position = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (700 / r.width), y: (e.clientY - r.top) * (200 / r.height) };
  };
  const start = (e) => {
    e.preventDefault();
    zeichnend.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = position(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
    if (!value) onChange(true);
  };
  const zeichne = (e) => {
    if (!zeichnend.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = position(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const ende = () => { zeichnend.current = false; };
  const neuZeichnen = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 700, 200);
    onChange(false);
  };

  return (
    <div className={cx("sig-wrap", fehlerhaft)}>
      <canvas
        ref={canvasRef} width={700} height={200} className="sig-canvas"
        onPointerDown={start} onPointerMove={zeichne} onPointerUp={ende} onPointerLeave={ende}
      />
      <div className="sig-row">
        <span className="sig-hint">{value ? "" : "Mit dem Finger unterschreiben"}</span>
        <button type="button" className="btn btn-secondary btn-xs" onClick={neuZeichnen}>Neu zeichnen</button>
      </div>
    </div>
  );
}

function UebungGbu({ uebung, name, onBestanden }) {
  const [form, setForm] = useState({
    einsatzort: "", aufsicht: name || "",
    niederschlag: GBU_NIEDERSCHLAG[0], wind: GBU_WIND_UEBUNG[0][0],
    arbeitsart: "", baum: "", arbeiten: [], zugang: "",
    punkte: {}, unterschrift: false,
  });
  const [fehler, setFehler] = useState(null);
  const [bestanden, setBestanden] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const stil = (k) => cx(undefined, fehler?.feld === k);
  const toggleArbeiten = (a) => setForm((f) => ({ ...f, arbeiten: f.arbeiten.includes(a) ? f.arbeiten.filter((x) => x !== a) : [...f.arbeiten, a] }));
  const setPunkt = (id, patch) => setForm((f) => ({ ...f, punkte: { ...f.punkte, [id]: { ...(f.punkte[id] || {}), ...patch } } }));
  // Meldung nach jeder Prüfung ins Bild holen (siehe UebungZeit) — bei dieser
  // langen Maske ist das der wahrscheinlichste Anruf am ersten Tag.
  const meldungRef = useRef(null);
  useEffect(() => {
    if (fehler || bestanden) meldungRef.current?.scrollIntoView({ block: "nearest" });
  }, [fehler, bestanden]);

  const speichern = () => {
    const r = pruefeGbu(form);
    setFehler(r);
    setBestanden(!r);
  };

  return (
    <>
      <div className="modal">
        <div className="modal-title">Gefährdungsbeurteilung vor Ort</div>

        <div className="form-section">
          <div className="form-section-title">Einsatz</div>
          <div className="field-group mb12">
            <label>Einsatzort (Adresse/Beschreibung — auch für den Notruf)</label>
            <input value={form.einsatzort} onChange={set("einsatzort")} placeholder="z. B. Zur Musterstraße 10, Musterstadt — Garten hinterm Haus" className={stil("einsatzort")} />
          </div>
          <div className="field-group mb12">
            <label>Aufsichtsführende(r)</label>
            <input value={form.aufsicht} onChange={set("aufsicht")} />
          </div>
          <div className="form-row">
            <div className="field-group"><label>Niederschlag</label>
              <select value={form.niederschlag} onChange={set("niederschlag")}>
                {GBU_NIEDERSCHLAG.map((w) => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div className="field-group"><label>Wind</label>
              <select value={form.wind} onChange={set("wind")} className={stil("wind")}>
                {GBU_WIND_UEBUNG.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Arbeitsart</div>
          <div className={cx("gbu-chips", fehler?.feld === "arbeitsart")}>
            {GBU_ARBEITSARTEN_UEBUNG.map((a) => (
              <button key={a.id} type="button" className={`gbu-chip ${form.arbeitsart === a.id ? "gbu-chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, arbeitsart: a.id }))}>{a.label}</button>
            ))}
          </div>
          {form.arbeitsart === "faellung" && (<>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label>Baum/Bäume (Anzahl, Standort; Art falls bekannt) *</label>
              <input value={form.baum} onChange={set("baum")} placeholder="z. B. 1 Bergahorn, Vorgarten — oder: 5 Obstbäume, Wiese" className={stil("baum")} />
            </div>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label>Durchzuführende Arbeiten *</label>
              <div className={cx("gbu-chips", fehler?.feld === "arbeiten")}>
                {GBU_ARBEITEN_UEBUNG.map((a) => (
                  <button key={a} type="button" className={`gbu-chip ${form.arbeiten.includes(a) ? "gbu-chip-active" : ""}`}
                    onClick={() => toggleArbeiten(a)}>{a}</button>
                ))}
              </div>
            </div>
          </>)}
        </div>

        <div className="form-section">
          <div className="form-section-title">Zugang / Arbeitsverfahren</div>
          <div className={cx("gbu-chips", fehler?.feld === "zugang")}>
            {GBU_ZUGAENGE_UEBUNG.map((z) => (
              <button key={z.id} type="button" className={`gbu-chip ${form.zugang === z.id ? "gbu-chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, zugang: z.id }))}>{z.label}</button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Personal & Organisation</div>
          {UEBUNG_GBU_PUNKTE.map((p) => {
            const st = form.punkte[p.id] || {};
            const falscherPunkt = fehler?.feld === "punkt-" + p.id;
            return (
              <div className="gbu-item" key={p.id}>
                <div className="gbu-item-label" style={falscherPunkt ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{p.label}</div>
                <GbuTriState value={st.wert} onChange={(v) => setPunkt(p.id, { wert: v })} />
                {st.wert === "mangel" && (
                  <div className="field-group" style={{ marginTop: 8 }}>
                    <select value={st.massnahme || ""} onChange={(e) => setPunkt(p.id, { massnahme: e.target.value })} className={stil("massnahme-" + p.id)}>
                      <option value="">— Maßnahme wählen —</option>
                      {UEBUNG_GBU_MASSNAHMEN.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="form-section">
          <div className="form-section-title">Unterschrift</div>
          <GbuUnterschrift value={form.unterschrift} onChange={(v) => setForm((f) => ({ ...f, unterschrift: v }))} fehlerhaft={fehler?.feld === "unterschrift"} />
        </div>

        <button className="btn btn-primary" onClick={speichern}>Speichern & ablegen</button>
      </div>
      {fehler && <div className="tutorial-fehler" ref={meldungRef}>{fehler.text}</div>}
      {bestanden && (
        <div className="tutorial-erfolg" ref={meldungRef}>
          {uebung.fertig}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBestanden}>Weiter</button>
        </div>
      )}
    </>
  );
}

// ─── Übung „Beleg erfassen" — Zuschnitt: Nachbau von ScanCropModal
//     (dolibarr-app.jsx:5948). Kopf: Nachbau von SupplierInvoiceForm
//     (dolibarr-app.jsx:6349) plus Positionszeile DocLine
//     (dolibarr-app.jsx:7318). Der Beleg ist ein gezeichnetes SVG (siehe
//     Bewusste Verkürzungen in der Spec) — kein Binärbild im Repo, kein
//     OpenCV, kein Tesseract. ──────────────────────────────────────────────

// Anzeigefläche des Zuschnitt-SVG — Basis für alle Pixelwerte. Sowohl die
// Beleg-Zeichnung als auch die Prüfung (pruefeZuschnitt) leiten sich aus
// UEBUNG_ZUSCHNITT_ZIEL/-START ab (relative Koordinaten 0…1), nicht aus einer
// zweiten, getippten Zahlenreihe — sonst zeigt das Bild eine andere Kante,
// als die Prüfung erwartet.
const ZUSCHNITT_VB = { w: 300, h: 400 };
const toPx = (p) => ({ x: p.x * ZUSCHNITT_VB.w, y: p.y * ZUSCHNITT_VB.h });
const BELEG_ZIEL_PX = UEBUNG_ZUSCHNITT_ZIEL.map(toPx);
const BELEG_ZIEL_BBOX = {
  minX: Math.min(...BELEG_ZIEL_PX.map((c) => c.x)), maxX: Math.max(...BELEG_ZIEL_PX.map((c) => c.x)),
  minY: Math.min(...BELEG_ZIEL_PX.map((c) => c.y)), maxY: Math.max(...BELEG_ZIEL_PX.map((c) => c.y)),
};

/**
 * Der gezeichnete Beispielbeleg: helles, leicht schräges Rechteck (die Schräge
 * kommt aus UEBUNG_ZUSCHNITT_ZIEL selbst) auf dunklem Grund, mit den echten
 * Werten aus UEBUNG_BELEG als lesbarem Text. Ohne Props, rein aus den
 * Konstanten — wird sowohl im Zuschnitt-Schritt als auch, auf den Zuschnitt
 * begrenzt, im Prüf-Schritt eingebettet.
 */
function BelegZeichnung() {
  const [ol, obr] = BELEG_ZIEL_PX;
  const breite = obr.x - ol.x;
  const hoehe = BELEG_ZIEL_BBOX.maxY - BELEG_ZIEL_BBOX.minY;
  const links = ol.x + breite * 0.08;
  const rechts = ol.x + breite * 0.92;
  const zeile = (f) => ol.y + hoehe * f;
  const preis = UEBUNG_BELEG.preis.toFixed(2).replace(".", ",");
  const summe = (UEBUNG_BELEG.preis * UEBUNG_BELEG.menge).toFixed(2).replace(".", ",");
  const [jahr, monat, tag] = UEBUNG_BELEG.datum.split("-");
  return (
    <>
      <polygon points={BELEG_ZIEL_PX.map((c) => `${c.x},${c.y}`).join(" ")} fill="#f3efe4" stroke="#cec5ac" strokeWidth="1" />
      <text x={links} y={zeile(0.10)} fontSize="13" fontWeight="700" fill="#22252b">{UEBUNG_BELEG.lieferant}</text>
      <text x={links} y={zeile(0.19)} fontSize="10.5" fill="#54585f">{UEBUNG_BELEG.nummer}</text>
      <text x={links} y={zeile(0.27)} fontSize="10.5" fill="#54585f">{`${tag}.${monat}.${jahr}`}</text>
      <rect x={links} y={zeile(0.33)} width={breite * 0.84} height="1.4" fill="#cec5ac" />
      <rect x={links} y={zeile(0.41)} width={breite * 0.68} height="6" fill="#ddd6c2" />
      <rect x={links} y={zeile(0.51)} width={breite * 0.5} height="6" fill="#ddd6c2" />
      <text x={links} y={zeile(0.65)} fontSize="10.5" fill="#22252b">{`${UEBUNG_BELEG.menge} × ${UEBUNG_BELEG.beschreibung}`}</text>
      <text x={rechts} y={zeile(0.73)} fontSize="10.5" fill="#22252b" textAnchor="end">{preis} €</text>
      <rect x={links} y={zeile(0.80)} width={breite * 0.84} height="1.4" fill="#cec5ac" />
      <text x={links} y={zeile(0.90)} fontSize="12" fontWeight="700" fill="#22252b">Summe</text>
      <text x={rechts} y={zeile(0.90)} fontSize="12" fontWeight="700" fill="#22252b" textAnchor="end">{summe} €</text>
    </>
  );
}

/**
 * Vier ziehbare Ecken über der Beleg-Zeichnung — Bedienung wie ScanCropModal:
 * Pointer-Events + setPointerCapture, das trifft Maus und Finger
 * gleichermaßen. Ecken bleiben relativ (0…1) und werden beim Ziehen darauf
 * begrenzt. Die von pruefeZuschnitt genannte Ecke (fehlerFeld) wird sichtbar
 * hervorgehoben (größer, rot).
 */
function BelegZuschnitt({ ecken, setEcken, fehlerFeld }) {
  const svgRef = useRef(null);
  const dragRef = useRef(-1);
  const fehlerIndex = fehlerFeld?.startsWith("ecke-") ? Number(fehlerFeld.slice(5)) : -1;

  const toRel = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.max(0, Math.min(1, p.x / ZUSCHNITT_VB.w)),
      y: Math.max(0, Math.min(1, p.y / ZUSCHNITT_VB.h)),
    };
  };
  const onPointerDown = (i) => (e) => {
    e.preventDefault();
    dragRef.current = i;
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragRef.current < 0) return;
    const p = toRel(e);
    if (!p) return;
    const i = dragRef.current;
    setEcken((cs) => cs.map((c, idx) => (idx === i ? p : c)));
  };
  const onPointerUp = () => { dragRef.current = -1; };

  const eckenPx = ecken.map(toPx);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${ZUSCHNITT_VB.w} ${ZUSCHNITT_VB.h}`}
      style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto 10px", touchAction: "none", background: "#20242c", borderRadius: "var(--radius-sm)" }}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
    >
      <BelegZeichnung />
      <polygon points={eckenPx.map((c) => `${c.x},${c.y}`).join(" ")} fill="rgba(67,160,71,0.18)" stroke="var(--accent)" strokeWidth="2" />
      {eckenPx.map((c, i) => (
        <circle
          key={i} cx={c.x} cy={c.y} r={i === fehlerIndex ? 16 : 12}
          fill={i === fehlerIndex ? "var(--danger)" : "var(--accent)"}
          stroke="#fff" strokeWidth="2" style={{ cursor: "grab" }}
          onPointerDown={onPointerDown(i)}
        />
      ))}
    </svg>
  );
}

function UebungBeleg({ uebung, onBestanden }) {
  const [phase, setPhase] = useState("zuschnitt"); // "zuschnitt" -> "pruefen"
  const [ecken, setEcken] = useState(() => UEBUNG_ZUSCHNITT_START.map((p) => ({ ...p })));
  const [zuschnittFehler, setZuschnittFehler] = useState(null);
  const [form, setForm] = useState(() => ({ ...UEBUNG_BELEG_VORBELEGT }));
  const [fehler, setFehler] = useState(null);
  const [bestanden, setBestanden] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const stil = (k) => cx(undefined, fehler?.feld === k);
  // Meldung nach jeder Prüfung ins Bild holen (siehe UebungZeit). Ein Ref
  // reicht: pro Phase ist immer nur höchstens eine Meldung gleichzeitig da.
  const meldungRef = useRef(null);
  useEffect(() => {
    if (zuschnittFehler || fehler || bestanden) meldungRef.current?.scrollIntoView({ block: "nearest" });
  }, [zuschnittFehler, fehler, bestanden]);

  const uebernehmen = () => {
    const r = pruefeZuschnitt(ecken);
    setZuschnittFehler(r);
    if (!r) setPhase("pruefen");
  };

  const erstellen = () => {
    const r = pruefeBeleg(form);
    setFehler(r);
    setBestanden(!r);
  };

  // Preis ist Brutto/Stück, wie im Original — die Summe ist der Punkt, an dem
  // der verrutschte Preis auffällt (siehe Aufgabenbeschreibung).
  const summe = (zahl(form.menge) || 0) * (zahl(form.preis) || 0);

  if (phase === "zuschnitt") {
    return (
      <>
        <div className="modal">
          <div className="modal-title">Beleg zuschneiden</div>
          <BelegZuschnitt ecken={ecken} setEcken={setEcken} fehlerFeld={zuschnittFehler?.feld} />
          <div className="tutorial-hinweis">Ecken auf die Belegkanten ziehen, dann übernehmen.</div>
          <button className="btn btn-primary" onClick={uebernehmen}>Übernehmen</button>
        </div>
        {zuschnittFehler && <div className="tutorial-fehler" ref={meldungRef}>{zuschnittFehler.text}</div>}
      </>
    );
  }

  return (
    <>
      <div className="tutorial-hinweis">Beleg zugeschnitten — jetzt prüfen, was der Automat gelesen hat.</div>
      <svg
        viewBox={`${BELEG_ZIEL_BBOX.minX} ${BELEG_ZIEL_BBOX.minY} ${BELEG_ZIEL_BBOX.maxX - BELEG_ZIEL_BBOX.minX} ${BELEG_ZIEL_BBOX.maxY - BELEG_ZIEL_BBOX.minY}`}
        style={{ width: 150, display: "block", margin: "0 auto 14px", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)" }}
      >
        <BelegZeichnung />
      </svg>
      <div className="modal">
        <div className="modal-title">Neue Lieferantenrechnung</div>

        <div className="field-group mb12">
          <label>Lieferant *</label>
          <select value={form.lieferant} onChange={set("lieferant")} className={stil("lieferant")}>
            <option value="">— Lieferant wählen —</option>
            {UEBUNG_LIEFERANTEN.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div className="field-group mb12">
          <label>Rechnungs-Nr. des Lieferanten</label>
          <input value={form.nummer} onChange={set("nummer")} />
        </div>
        <div className="field-group mb16">
          <label>Rechnungsdatum</label>
          <input type="date" value={form.datum} onChange={set("datum")} className={stil("datum")} />
        </div>

        <div className="line-item-row">
          <div className="field-group mb12">
            <label>Beschreibung</label>
            <input value={form.beschreibung} onChange={set("beschreibung")} />
          </div>
          <div className="form-row mb12">
            <div className="field-group"><label>Menge</label><input type="number" value={form.menge} onChange={set("menge")} min="0" step="0.01" className={stil("menge")} /></div>
            <div className="field-group"><label>Preis (€)</label><input type="number" value={form.preis} onChange={set("preis")} min="0" step="0.01" className={stil("preis")} /></div>
          </div>
          <div className="field-group mb12">
            <label>MwSt</label>
            <select value={form.mwst} onChange={set("mwst")}>
              {[0, 7, 19].map((t) => <option key={t} value={t}>{t}%</option>)}
            </select>
          </div>
          <div className="field-group mb12">
            <label>Buchungskonto <span style={{ fontWeight: 400, color: "var(--text3)", textTransform: "none", letterSpacing: 0 }}>· Vorschlag, bitte prüfen</span></label>
            <select value={form.konto} onChange={set("konto")} className={stil("konto")}>
              {UEBUNG_KONTEN.map((k) => <option key={k.number} value={k.number}>{k.number} · {k.label}</option>)}
            </select>
          </div>
        </div>
        <div className="line-total">Gesamt (brutto): {summe.toFixed(2).replace(".", ",")} €</div>

        <button className="btn btn-primary" onClick={erstellen}>Erstellen</button>
      </div>
      {fehler && <div className="tutorial-fehler" ref={meldungRef}>{fehler.text}</div>}
      {bestanden && (
        <div className="tutorial-erfolg" ref={meldungRef}>
          {uebung.fertig}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBestanden}>Weiter</button>
        </div>
      )}
    </>
  );
}

// ─── Auswahl der Maske je Übung ────────────────────────────────────────────
function Maske({ uebung, heute, name, onBestanden }) {
  switch (uebung.id) {
    case "zeit": return <UebungZeit heute={heute} uebung={uebung} onBestanden={onBestanden} />;
    case "gbu": return <UebungGbu uebung={uebung} name={name} onBestanden={onBestanden} />;
    case "beleg": return <UebungBeleg uebung={uebung} onBestanden={onBestanden} />;
    case "kundeprojekt": return <UebungKundeProjekt heute={heute} uebung={uebung} onBestanden={onBestanden} />;
    default: return null;
  }
}

// ─── Ablaufsteuerung ────────────────────────────────────────────────────────
export default function TutorialUebungen({ heute, name, login, pflicht, onFertig, onSpaeter, onAbmelden }) {
  const [index, setIndex] = useState(() => ladeStand(login));
  // onFertig darf nur einmal feuern — ein zweiter Klick auf "App öffnen",
  // bevor der Aufrufer die Übung ausblendet, darf keinen zweiten Aufruf auslösen.
  const fertigGerufen = useRef(false);

  const weiter = () => {
    const next = index + 1;
    // Den Abschluss (next === UEBUNGEN.length) bewusst nicht als Stand
    // sichern: ladeStand() akzeptiert ohnehin nur 0…UEBUNGEN.length-1, ein
    // Absturz genau auf dem Abschlussbildschirm fängt also wieder bei der
    // ersten Übung an statt mit einem ungültigen Index dazustehen.
    if (next < UEBUNGEN.length) speichereStand(next, login);
    setIndex(next);
  };

  const appOeffnen = () => {
    if (fertigGerufen.current) return;
    fertigGerufen.current = true;
    onFertig();
  };

  const fertig = index >= UEBUNGEN.length;
  const uebung = fertig ? null : UEBUNGEN[index];

  return (
    <div className="tutorial-backdrop">
      <div className="tutorial-card tutorial-uebung">
        {fertig ? (
          <div style={{ textAlign: "center" }}>
            <h2>Fertig.</h2>
            <p>Du kennst jetzt die vier Handgriffe.</p>
            <button className="btn btn-primary" onClick={appOeffnen}>App öffnen</button>
          </div>
        ) : (
          <>
            <div className="tutorial-fortschritt">Übung {index + 1} von {UEBUNGEN.length}</div>
            <div className="tutorial-dots">
              {UEBUNGEN.map((_, i) => (
                <span key={i} className={"tutorial-dot" + (i === index ? " active" : "")} />
              ))}
            </div>
            <div className="tutorial-auftrag">
              <b>{uebung.titel}</b>
              <div>{uebung.auftrag}</div>
              <div className="tutorial-hinweis">Nichts davon wird wirklich angelegt.</div>
            </div>
            <Maske uebung={uebung} heute={heute} name={name} onBestanden={weiter} />
          </>
        )}
        {/* Im Pflicht-Modus gibt es keinen Weg an der Übung vorbei — aber einen
            aus der App heraus. Ohne ihn steht jemand, dessen Maske klemmt oder
            der schlicht nicht weiterkommt, vor einem Bildschirm ohne einzigen
            Ausgang; helfen könnte dann nur, wer die Datei in Nextcloud von Hand
            ändert. Abmelden hebt die Pflicht nicht auf: nach dem nächsten
            Anmelden ist die Übung wieder fällig. */}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          {pflicht ? (
            <>
              <button className="btn btn-ghost" onClick={onAbmelden}>Abmelden</button>
              <div className="tutorial-hinweis">Die Übung bleibt fällig — beim nächsten Anmelden geht es hier weiter.</div>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onSpaeter}>Später</button>
          )}
        </div>
      </div>
    </div>
  );
}
