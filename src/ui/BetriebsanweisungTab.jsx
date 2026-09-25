// src/ui/BetriebsanweisungTab.jsx
// Reiter „Betriebsanweisung" im Arbeitsschutz: Betriebsanweisung
// Seilklettertechnik erzeugen/ansehen/herunterladen und den
// Unterweisungsnachweis führen (wer wurde wann von wem unterwiesen).
//
// Bewusst eigene Datei statt dolibarr-app.jsx (wie QualifikationenTab.jsx,
// BaumkatasterPage.jsx): drei Zweige entstehen parallel, ein weiterer Umfang
// in der 14 000-Zeilen-Datei wäre eine zusätzliche Kollisionsfläche. Alles
// kommt per Props (api, me, showToast, nc, ncOk) — kein Import aus
// dolibarr-app.jsx (Kreisimport; SignaturePad ist deshalb absichtlich HIER
// noch einmal die kleine Fassung, wie schon in BaumkatasterPage.jsx).
//
// Die Betriebsanweisung selbst hat keine eigene Ablage — sie wird aus den
// Textbausteinen (betriebsanweisung-data.js) live erzeugt und ist deshalb
// immer aktuell; "Zu Grundlagen hochladen" legt eine Momentaufnahme im
// bestehenden Paperless-Archiv ab (Thema/Arbeitsschutz, derselbe Weg wie der
// Reiter „Grundlagen" — kein neues Schema). Der Unterweisungsnachweis ist
// additiv in Blattwerk/Arbeitsschutz/unterweisungen.json (server/betriebsanweisung.mjs).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EW_STUFEN_TEXT } from "../arbeitsschutz.js";
import {
  BA_ARTEN, BA_ABSCHNITTE_IDS, BA_ABSCHNITT_TITEL, baArt, baErstellen, baUwDateiname,
  baUwSlug, baUwUebersicht,
} from "../betriebsanweisung.js";
import { baBetriebKopf } from "../betriebsanweisung-data.js";
import { buildBetriebsanweisungPdf, buildUnterweisungPdf } from "../betriebsanweisung-pdf.js";
import { PL_THEMA, sha256Hex } from "../paperless.js";

const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STUFE_FARBE = {
  gueltig: { bg: "var(--k-moos-bg)", fg: "var(--k-moos)" },
  bald: { bg: "var(--k-ocker-bg)", fg: "var(--k-ocker)" },
  ueberfaellig: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  fehlt: { bg: "var(--surface2)", fg: "var(--text2)" },
  ungueltig: { bg: "var(--danger-soft)", fg: "var(--danger)" },
};
function Badge({ stufe }) {
  const c = STUFE_FARBE[stufe] || STUFE_FARBE.fehlt;
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      {stufe === "fehlt" ? "nicht unterwiesen" : (EW_STUFEN_TEXT[stufe] || stufe)}
    </span>
  );
}

/** POST an den eigenen Server; eine SSO-Weiterleitung wird als Fehler gemeldet (Muster wie QualifikationenTab.jsx). */
async function ncAnfrage(pfad, body) {
  const r = await fetch(pfad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
  if (r.type === "opaqueredirect" || r.status === 0) throw new Error("Anmeldung abgelaufen — bitte Seite neu laden");
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || String(r.status));
  return d;
}

const base64ZuBlob = (b64, typ) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: typ || "application/pdf" });
};

/**
 * Herunterladen wie dateiSpeichern() in dolibarr-app.jsx: über den eigenen
 * Server (die App-Hülle reicht Downloads nur an den System-Download-Manager
 * weiter, deren Adresse mit "http" beginnt), mit direktem Blob-Link als
 * Rückfall im normalen Browser. Bewusst eine eigene, kleine Kopie statt
 * Import — derselbe Grund wie bei SignaturePad oben.
 */
async function dateiSpeichern(b64, name, showToast) {
  try {
    const r = await fetch("/api/datei/ablegen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inhalt: b64, name, typ: "application/pdf" }),
    });
    if (!r.ok) throw new Error("Status " + r.status);
    const { url } = await r.json();
    window.location.href = url;
  } catch (e) {
    const url = URL.createObjectURL(base64ZuBlob(b64));
    const a = document.createElement("a");
    a.href = url; a.download = name || "Betriebsanweisung.pdf";
    document.body.appendChild(a); a.click(); a.remove();
  }
}

/** Kleine, eigenständige Fassung von SignaturePad (Original: dolibarr-app.jsx). */
function SignaturePad({ onChange, initial, height = 200 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(!initial);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#14243a"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (initial) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); };
      img.src = initial;
    }
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current.width / r.width), y: (e.clientY - r.top) * (canvasRef.current.height / r.height) };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
    setEmpty(false);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/jpeg", 0.85));
  };
  const clear = () => {
    const c = canvasRef.current, ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="sig-wrap">
      <canvas
        ref={canvasRef} width={700} height={Math.round(height * 1.75)} className="sig-canvas" style={{ height }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
      />
      <div className="sig-row">
        <span className="sig-hint">{empty ? "Hier unterschreiben" : ""}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>Löschen</button>
      </div>
    </div>
  );
}

/** Dolibarr-Nutzer in eine einfache Auswahlliste bringen (Muster wie QualifikationenTab.jsx). */
const ausDolibarr = (users) => (Array.isArray(users) ? users : [])
  .filter((u) => u && u.login && Number(u.statut ?? 1) !== 0)
  .map((u) => ({ login: String(u.login), name: [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || String(u.login) }));

// ─── Unterweisungs-Wizard ────────────────────────────────────────────────────

function UnterweisungForm({ variante, personen, me, onClose, onSaved, showToast, nc }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [sigUnterwiesen, setSigUnterwiesen] = useState(null);
  const [sigUnterweiser, setSigUnterweiser] = useState(null);
  const [andere, setAndere] = useState(false);
  const meName = [me?.firstname, me?.lastname].filter(Boolean).join(" ").trim() || me?.login || "";
  const [form, setForm] = useState({
    login: personen[0]?.login || "",
    name: "",
    ort: "",
    datum: heuteIso(),
    jugendlich: false,
    variante: variante || BA_ARTEN[0].id,
    einweiser: meName,
    einweiserQualifikation: "",
    abschnitte: {},
    bemerkung: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const gewaehltePersonName = andere ? form.name : (personen.find((p) => p.login === form.login)?.name || form.login);
  const gewaehlterLogin = andere ? baUwSlug(form.name) : form.login;

  const alleAbschnitte = () => setForm((f) => ({ ...f, abschnitte: Object.fromEntries(BA_ABSCHNITTE_IDS.map((id) => [id, true])) }));
  const bestaetigt = BA_ABSCHNITTE_IDS.filter((id) => form.abschnitte[id]).length;

  const fehlt = [];
  if (!gewaehlterLogin) fehlt.push("Person wählen oder Namen eingeben");
  if (!form.ort.trim()) fehlt.push("Ort der Unterweisung");
  if (form.datum > heuteIso()) fehlt.push("Datum darf nicht in der Zukunft liegen");
  if (!form.einweiser.trim()) fehlt.push("Name der unterweisenden Person");
  if (!form.einweiserQualifikation.trim()) fehlt.push("Qualifikation der unterweisenden Person");
  if (bestaetigt < BA_ABSCHNITTE_IDS.length) fehlt.push(`${BA_ABSCHNITTE_IDS.length - bestaetigt} Abschnitt(e) nicht bestätigt`);

  const weiter = () => {
    if (fehlt.length) { showToast(fehlt[0], "error"); return; }
    setStep(2);
  };

  const speichern = async () => {
    if (!sigUnterwiesen) { showToast("Unterschrift der unterwiesenen Person fehlt", "error"); return; }
    if (!sigUnterweiser) { showToast("Unterschrift der unterweisenden Person fehlt", "error"); return; }
    setSaving(true);
    try {
      const eintrag = {
        login: gewaehlterLogin, name: gewaehltePersonName, ort: form.ort.trim(), datum: form.datum,
        jugendlich: form.jugendlich, variante: form.variante,
        einweiser: form.einweiser.trim(), einweiserQualifikation: form.einweiserQualifikation.trim(),
        abschnitte: BA_ABSCHNITTE_IDS.filter((id) => form.abschnitte[id]), bemerkung: form.bemerkung,
      };
      const dateiname = baUwDateiname(eintrag);
      const pdfBase64 = await buildUnterweisungPdf({ ...eintrag, sigUnterwiesen, sigUnterweiser, erfasstAm: new Date().toISOString() });
      const d = await ncAnfrage("/api/nc/unterweisungen/save", {
        server: nc.server, user: nc.user, pass: nc.pass, eintrag, dateiname, pdfBase64, erfasstVon: me?.login || "",
      });
      showToast(`Gespeichert. Nächste Unterweisung bis ${d.faellig}${d.kalender?.ok ? " · Termin im Kalender" : ""}.`);
      onSaved();
    } catch (e) {
      showToast("Speichern fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gbu-modal">
        <div className="modal-handle" />
        <div className="modal-title">
          {step === 1 ? "Unterweisung zur Betriebsanweisung"
            : step === 2 ? "Unterschrift: unterwiesene Person"
              : "Unterschrift: unterweisende Person"}
        </div>

        {step === 1 && (<>
          <div className="form-group">
            <label>Unterwiesene Person</label>
            {!andere ? (
              <select value={form.login} onChange={set("login")}>
                {personen.map((p) => <option key={p.login} value={p.login}>{p.name}</option>)}
              </select>
            ) : (
              <input value={form.name} onChange={set("name")} placeholder="Vor- und Nachname" />
            )}
            <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setAndere((a) => !a)}>
              {andere ? "aus der Liste wählen" : "andere Person / Aushilfe"}
            </button>
          </div>

          <div className="form-group">
            <label>Betriebsanweisung (Gegenstand)</label>
            <select value={form.variante} onChange={set("variante")}>
              {BA_ARTEN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Ort der Unterweisung</label>
              <input value={form.ort} onChange={set("ort")} placeholder="z. B. Musterstraße 1, Musterstadt" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Datum</label>
              <input type="date" value={form.datum} max={heuteIso()} onChange={set("datum")} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Unterweisende Person</label>
              <input value={form.einweiser} onChange={set("einweiser")} placeholder="Name" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>deren Qualifikation</label>
              <input value={form.einweiserQualifikation} onChange={set("einweiserQualifikation")} placeholder="z. B. SKT B" />
            </div>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, margin: "8px 0" }}>
            <input type="checkbox" checked={form.jugendlich} onChange={set("jugendlich")} />
            Person ist unter 18 — Wiederholung dann halbjährlich (§ 29 Abs. 2 JArbSchG)
          </label>

          <div className="gbu-block-head" style={{ marginTop: 10 }}>
            <div className="section-label" style={{ margin: 0 }}>Inhalt der Unterweisung ({bestaetigt}/{BA_ABSCHNITTE_IDS.length})</div>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={alleAbschnitte}>
              Alle bestätigen
            </button>
          </div>
          {BA_ABSCHNITTE_IDS.map((id) => (
            <div className="gbu-item" key={id}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
                <input type="checkbox" checked={!!form.abschnitte[id]}
                  onChange={(e) => setForm((f) => ({ ...f, abschnitte: { ...f.abschnitte, [id]: e.target.checked } }))} />
                <span>{BA_ABSCHNITT_TITEL[id]}</span>
              </label>
            </div>
          ))}

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Bemerkung (freiwillig)</label>
            <textarea rows={2} value={form.bemerkung} onChange={set("bemerkung")} />
          </div>

          {fehlt.length > 0 && (
            <div className="gbu-warn" style={{ marginBottom: 10 }}>
              <span>Noch offen: {fehlt.slice(0, 3).join(" · ")}</span>
            </div>
          )}

          <div className="form-row">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={weiter} disabled={fehlt.length > 0}>Weiter</button>
          </div>
        </>)}

        {step === 2 && (<>
          <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 8px" }}>{gewaehltePersonName} bestätigt die Teilnahme.</p>
          <SignaturePad onChange={setSigUnterwiesen} initial={sigUnterwiesen} height={400} />
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (sigUnterwiesen ? setStep(3) : showToast("Bitte unterschreiben", "error"))}>Weiter</button>
          </div>
        </>)}

        {step === 3 && (<>
          <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 8px" }}>
            {form.einweiser}{form.einweiserQualifikation ? ` · ${form.einweiserQualifikation}` : ""}
          </p>
          <SignaturePad onChange={setSigUnterweiser} initial={sigUnterweiser} height={400} />
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(2)} disabled={saving}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={speichern} disabled={saving}>
              {saving ? "Speichere…" : "Protokoll speichern"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── Hauptreiter ─────────────────────────────────────────────────────────────

export default function BetriebsanweisungTab({ api, me, showToast, nc, ncOk }) {
  const heute = heuteIso();
  const meName = [me?.firstname, me?.lastname].filter(Boolean).join(" ").trim() || me?.login || "";
  const [variante, setVariante] = useState("skt-b");
  const [einsatzort, setEinsatzort] = useState("");
  const [store, setStore] = useState(null);
  const [laden, setLaden] = useState(false);
  const [nutzer, setNutzer] = useState([]);
  const [form, setForm] = useState(false);
  const [erzeugeLaeuft, setErzeugeLaeuft] = useState(false);

  const ba = useMemo(() => {
    try { return baErstellen({ variante, betrieb: baBetriebKopf(), einsatzort, ersteller: meName, heute }); }
    catch { return null; }
  }, [variante, einsatzort, meName, heute]);

  const laden_ = useCallback(() => {
    if (!ncOk) return;
    setLaden(true);
    ncAnfrage("/api/nc/unterweisungen", { server: nc?.server, user: nc?.user, pass: nc?.pass })
      .then(setStore)
      .catch((e) => showToast("Unterweisungsnachweis laden fehlgeschlagen: " + (e?.message || e), "error"))
      .finally(() => setLaden(false));
  }, [ncOk, nc?.server, nc?.user, nc?.pass]);
  useEffect(() => { laden_(); }, [laden_]);

  useEffect(() => {
    const selbst = me?.login ? [{ login: String(me.login), name: meName || me.login }] : [];
    if (!api?.getUsers) { setNutzer(selbst); return; }
    api.getUsers().then((u) => setNutzer([...selbst, ...ausDolibarr(u)])).catch(() => setNutzer(selbst));
  }, [api, me?.login, meName]);

  const uebersicht = store ? baUwUebersicht(store, heute) : [];

  const herunterladen = async () => {
    if (!ba) return;
    setErzeugeLaeuft(true);
    try {
      const b64 = await buildBetriebsanweisungPdf(ba);
      await dateiSpeichern(b64, ba.dateiname, showToast);
    } catch (e) {
      showToast("PDF konnte nicht erzeugt werden: " + (e?.message || e), "error");
    } finally { setErzeugeLaeuft(false); }
  };

  const zuGrundlagenHochladen = async () => {
    if (!ba) return;
    setErzeugeLaeuft(true);
    try {
      const b64 = await buildBetriebsanweisungPdf(ba);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const sha256 = await sha256Hex(new Blob([bytes]));
      const r = await fetch("/api/pl/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: b64, dateiname: ba.dateiname, titel: ba.dateiname.replace(/\.pdf$/i, "").replace(/_/g, " "),
          datum: heute, thema: PL_THEMA.arbeitsschutz, sha256,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || r.status); }
      showToast("In Grundlagen abgelegt.");
    } catch (e) {
      showToast("Ablage fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setErzeugeLaeuft(false); }
  };

  return (
    <>
      <div className="section-label">Betriebsanweisung Seilklettertechnik</div>
      <div className="gbu-chips mb12">
        {BA_ARTEN.map((a) => (
          <button key={a.id} type="button" className={`gbu-chip ${variante === a.id ? "gbu-chip-active" : ""}`} onClick={() => setVariante(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="field-group">
        <label>Einsatzort (für den Kopf des Ausdrucks, freiwillig)</label>
        <input value={einsatzort} onChange={(e) => setEinsatzort(e.target.value)} placeholder="z. B. Musterstraße 1, Musterstadt" />
      </div>

      {ba && (
        <div className="list-item" style={{ display: "block" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{ba.titel}</div>
          <div style={{ fontSize: 12.5, color: "var(--text2)" }}>{ba.abschnitte.anwendungsbereich}</div>
        </div>
      )}

      <div className="form-row mb12" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={herunterladen} disabled={!ba || erzeugeLaeuft}>PDF herunterladen</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={zuGrundlagenHochladen} disabled={!ba || erzeugeLaeuft || !ncOk}>Zu Grundlagen hochladen</button>
      </div>

      <div className="section-label" style={{ marginTop: 18 }}>
        Unterweisungsnachweis{laden ? " · lädt…" : ""}
      </div>
      {!ncOk ? (
        <div className="empty-state"><p>Kein Nextcloud-Zugang — der Nachweis kann nicht geladen werden.</p></div>
      ) : (<>
        <div className="action-row">
          <button className="btn btn-primary" onClick={() => setForm(true)}><span>+ Person unterweisen</span></button>
        </div>
        {uebersicht.length === 0 && !laden && (
          <div className="empty-state"><p>Noch keine Unterweisung erfasst.</p></div>
        )}
        {uebersicht.map((p) => (
          <div key={p.login} className="list-item" style={{ display: "block" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              <Badge stufe={p.status.stufe} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
              {!p.letzte
                ? "noch nie unterwiesen"
                : `${baArt(p.letzte.variante)?.label || p.letzte.variante} am ${p.letzte.datum} durch ${p.letzte.einweiser} in ${p.letzte.ort}` +
                  (p.status.faellig ? ` · fällig ${p.status.faellig}` : "")}
            </div>
          </div>
        ))}
      </>)}

      {form && (
        <UnterweisungForm
          variante={variante}
          personen={nutzer}
          me={me}
          nc={nc}
          showToast={showToast}
          onClose={() => setForm(false)}
          onSaved={() => { setForm(false); laden_(); }}
        />
      )}
    </>
  );
}
