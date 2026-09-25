// src/ui/QualifikationenTab.jsx
// Reiter „Personal" im Arbeitsschutz: wer hat welche Fortbildung seit wann,
// gueltig bis wann, mit welchem Nachweis. Vierter Reiter in GbuPage.
//
// Bewusst eigene Datei statt dolibarr-app.jsx (wie src/tutorial/): das
// Register entsteht parallel zu Baumkataster und SKT-Formular, und drei
// Zweige in einer 14 000-Zeilen-Datei kollidieren. Deshalb kommt alles per
// Props (api, me, showToast, nc, ncOk) — kein Import aus dolibarr-app.jsx,
// die Datei exportiert ohnehin nur `App`.
//
// Ablauf beim Speichern: Server (Nachweis, Store, Kalender) → dann Dolibarr
// (Extrafields am Benutzer, nur Anzeige). Scheitert Dolibarr, bleibt der
// Store die Wahrheit und die Person sieht nur einen Hinweis.
import { useCallback, useEffect, useState } from "react";
import { EW_STUFEN_TEXT } from "../arbeitsschutz.js";
import {
  QUALI_ARTEN, qualArt, qualDolibarrFelder, qualFaelligkeiten, qualG41Hinweis, qualGueltigBis, qualLetzte,
  qualPruefen, qualSlug, qualStatus, qualiKeyAusLogin, qualiPersonenVereinen,
} from "../qualifikationen.js";

/** Offene Fortbildungen fuer ein Abzeichen auf Start (gleiches Muster wie blattwerk_ew_stand). */
export const QUALI_STAND_KEY = "blattwerk_quali_stand";
const standSchreiben = (s) => { try { localStorage.setItem(QUALI_STAND_KEY, JSON.stringify(s)); } catch (_) {} };
export const qualiOffenCount = () => {
  try { return Number((JSON.parse(localStorage.getItem(QUALI_STAND_KEY) || "{}") || {}).offen || 0); } catch { return 0; }
};
/** Exportiert, damit dolibarr-app.jsx denselben Stand aus dem Tages-Effekt der
 * Einweisungen mitschreiben kann (Abzeichen sonst erst nach Oeffnen des Reiters aktuell). */
export const qualiStandSchreiben = (store, heute) => {
  standSchreiben({ offen: qualFaelligkeiten(store, heute).length, stand: heute });
};

const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Farben wie EW_STUFE_FARBE in dolibarr-app.jsx (dort nicht exportiert).
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
      {stufe === "fehlt" ? "kein Nachweis" : (EW_STUFEN_TEXT[stufe] || stufe)}
    </span>
  );
}

/** POST an den eigenen Server; eine SSO-Weiterleitung wird als Fehler gemeldet. */
async function ncAnfrage(pfad, body) {
  const r = await fetch(pfad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
  if (r.type === "opaqueredirect" || r.status === 0) throw new Error("Anmeldung abgelaufen — bitte Seite neu laden");
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || String(r.status));
  return d;
}

const dateiZuBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1] || "");
  fr.onerror = rej;
  fr.readAsDataURL(file);
});

/** Dolibarr-Nutzer in die Form des Registers bringen. */
const ausDolibarr = (users) => (Array.isArray(users) ? users : [])
  .filter((u) => u && u.login && Number(u.statut ?? 1) !== 0)
  .map((u) => ({
    key: qualiKeyAusLogin(u.login),
    name: [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || String(u.login),
    dolibarrId: Number(u.id || u.rowid) || null,
    mobil: String(u.user_mobile || ""),
  }));

export default function QualifikationenTab({ api, me, showToast, nc, ncOk }) {
  const [store, setStore] = useState(null);
  const [laden, setLaden] = useState(false);
  const [nutzer, setNutzer] = useState([]);
  const [wer, setWer] = useState("");
  const [form, setForm] = useState(null);       // { art, seit, gueltigBis, stelle }
  const [datei, setDatei] = useState(null);
  const [neu, setNeu] = useState(null);         // { name, mobil }
  const [saving, setSaving] = useState(false);
  const heute = heuteIso();
  const creds = { server: nc?.server, user: nc?.user, pass: nc?.pass, calendarUrl: nc?.calendarUrl };

  const laden_ = useCallback(() => {
    if (!ncOk) return;
    setLaden(true);
    ncAnfrage("/api/nc/qualifikationen", creds)
      .then(setStore)
      .catch((e) => showToast("Register laden fehlgeschlagen: " + (e?.message || e), "error"))
      .finally(() => setLaden(false));
  }, [ncOk, nc?.server, nc?.user, nc?.pass]);
  useEffect(() => { laden_(); }, [laden_]);

  // Personen aus Dolibarr — `GET /users` haengt an user->lire; ohne das Recht
  // bleibt wenigstens die eigene Person und alles, was schon im Store steht.
  useEffect(() => {
    const selbst = me?.login ? [{ key: qualiKeyAusLogin(me.login), name: [me.firstname, me.lastname].filter(Boolean).join(" ").trim() || me.login, dolibarrId: Number(me.id) || null, mobil: "" }] : [];
    if (!api?.getUsers) { setNutzer(selbst); return; }
    // selbst zuerst: qualiPersonenVereinen ueberschreibt frueheren Eintrag mit
    // spaeterem — mit ausDolibarr(u) zuerst gewinnt sonst ihre leere Mobilnummer.
    api.getUsers().then((u) => setNutzer([...selbst, ...ausDolibarr(u)])).catch(() => setNutzer(selbst));
  }, [api, me?.login]);

  const personen = qualiPersonenVereinen(nutzer, store?.personen);
  const person = personen.find((p) => p.key === wer) || null;

  useEffect(() => {
    if (wer || !personen.length) return;
    setWer(personen.find((p) => p.key === qualiKeyAusLogin(me?.login))?.key || personen[0].key);
  }, [personen.length, me?.login]);

  // Abzeichen-Zahl ueber alle Personen merken (nicht nur die angezeigte).
  useEffect(() => {
    if (!store) return;
    qualiStandSchreiben(store, heute);
  }, [store]);

  const zeilen = QUALI_ARTEN.map((art) => {
    const letzte = person ? qualLetzte(person, art.id) : null;
    return { art, letzte, st: qualStatus(letzte, heute) };
  });
  const zahl = (stufe) => zeilen.filter((z) => z.st.stufe === stufe).length;
  // Fix-Runde Task 12 (18.09.2026): warnen, nicht blockieren — wer klettert
  // (SKT), aber kein gültiges G 41 hat, sieht das hier schon beim Pflegen
  // der Nachweise, nicht erst draußen auf der Baustelle. Reine Anzeige,
  // greift in nichts ein (kein Speichern-Sperren).
  const g41Hinweis = person ? qualG41Hinweis(person, heute) : null;

  const formOeffnen = (artId) => {
    const art = qualArt(artId) || QUALI_ARTEN[0];
    setDatei(null);
    setForm({ art: art.id, seit: heute, gueltigBis: qualGueltigBis({ art: art.id, seit: heute }) || "", stelle: "" });
  };
  const setF = (k) => (e) => setForm((f) => {
    const n = { ...f, [k]: e.target.value };
    // Standard-Gueltigkeit nachziehen, solange niemand etwas anderes eingetragen hat
    if (k === "art" || k === "seit") {
      const alt = qualGueltigBis({ art: f.art, seit: f.seit }) || "";
      if (!f.gueltigBis || f.gueltigBis === alt) n.gueltigBis = qualGueltigBis({ art: n.art, seit: n.seit }) || "";
    }
    return n;
  });

  const dolibarrSpiegeln = async (p) => {
    if (!p?.dolibarrId || !api?.updateUser) return;
    try { await api.updateUser(p.dolibarrId, { array_options: qualDolibarrFelder(p, heute) }); }
    catch { showToast("Dolibarr nicht aktualisiert — das Register in Nextcloud ist gespeichert", "error"); }
  };

  const speichern = async () => {
    if (!person) { showToast("Person wählen", "error"); return; }
    const fehler = qualPruefen(form, heute);
    if (fehler) { showToast(fehler, "error"); return; }
    setSaving(true);
    try {
      const body = {
        ...creds, personKey: person.key,
        person: person.imStore ? null : { name: person.name, dolibarrId: person.dolibarrId, mobil: person.mobil, jugendlich: false },
        qual: { art: form.art, seit: form.seit, gueltigBis: form.gueltigBis || "", stelle: form.stelle },
        nachweisBase64: datei ? await dateiZuBase64(datei) : null,
        nachweisDateiname: datei ? datei.name : null,
        erfasstVon: me?.login || "",
      };
      const d = await ncAnfrage("/api/nc/qualifikationen/save", body);
      const teile = ["Gespeichert"];
      if (d.bis) teile.push(`gültig bis ${d.bis}`);
      if (d.kalender?.ok) teile.push("Termin im Kalender");
      showToast(teile.join(" · ") + ".");
      await dolibarrSpiegeln(d.person);
      setForm(null); setDatei(null); laden_();
    } catch (e) {
      showToast("Speichern fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setSaving(false); }
  };

  const personAnlegen = async () => {
    const name = String(neu?.name || "").trim();
    const key = qualSlug(name);
    if (!key) { showToast("Name der Person fehlt", "error"); return; }
    if (personen.some((p) => p.key === key)) { showToast("Diese Person gibt es schon", "error"); return; }
    setSaving(true);
    try {
      await ncAnfrage("/api/nc/qualifikationen/save", {
        ...creds, personKey: key, person: { name, mobil: String(neu?.mobil || "").trim(), dolibarrId: null, jugendlich: !!neu?.jugendlich },
      });
      showToast(`${name} angelegt.`);
      setNeu(null); setWer(key); laden_();
    } catch (e) {
      showToast("Anlegen fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setSaving(false); }
  };

  if (!ncOk) {
    return <div className="empty-state"><p>Kein Nextcloud-Zugang — das Register kann nicht geladen werden.</p></div>;
  }

  return (
    <>
      <div className="section-label">Person</div>
      <div className="gbu-chips mb12">
        {personen.map((p) => (
          <button key={p.key} type="button" className={`gbu-chip ${wer === p.key ? "gbu-chip-active" : ""}`} onClick={() => setWer(p.key)}>
            {p.name}
          </button>
        ))}
        <button type="button" className="gbu-chip" onClick={() => setNeu({ name: "", mobil: "", jugendlich: false })}>+ Aushilfe</button>
      </div>

      {g41Hinweis && (
        <div className="quali-g41-hinweis" style={{ fontSize: 13, fontWeight: 600, color: "var(--warn)", margin: "0 0 12px" }}>
          ⚠ {g41Hinweis.text}
        </div>
      )}

      <div className="section-label">
        Fortbildungen{laden ? " · lädt…" : ""}
        {store && person && ` · ${zahl("gueltig")} gültig, ${zahl("bald")} laufen ab, ${zahl("ueberfaellig")} abgelaufen`}
        {person?.mobil ? ` · ${person.mobil}` : ""}
      </div>

      <div className="form-row mb12" style={{ gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => formOeffnen(QUALI_ARTEN[0].id)} disabled={!person}>
          + Fortbildung eintragen
        </button>
      </div>

      {zeilen.map(({ art, letzte, st }) => (
        <div key={art.id} className="list-item" style={{ display: "block" }} onClick={() => formOeffnen(art.id)}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{art.label}</div>
            <Badge stufe={st.stufe} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {!letzte
              ? art.hinweis
              : st.stufe === "ungueltig"
                ? `Eintrag vom ${letzte.seit} — Datum unbrauchbar, bitte neu eintragen`
                : `Seit ${letzte.seit}${letzte.stelle ? ` · ${letzte.stelle}` : ""}${st.bis ? ` · gültig bis ${st.bis}` : " · unbefristet"}${letzte.nachweis ? " · Nachweis abgelegt" : ""}`}
            {st.stufe === "bald" && ` (in ${st.tage} Tag(en))`}
            {st.stufe === "ueberfaellig" && ` (seit ${-st.tage} Tag(en))`}
          </div>
        </div>
      ))}

      {form && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="modal gbu-modal">
            <div className="modal-handle" />
            <div className="modal-title">Fortbildung eintragen — {person?.name}</div>
            <div className="field-group">
              <label>Art</label>
              <select value={form.art} onChange={setF("art")}>
                {QUALI_ARTEN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>{qualArt(form.art)?.hinweis}</div>
            </div>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Seit</label>
                <input type="date" value={form.seit} max={heute} onChange={setF("seit")} />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Gültig bis {qualArt(form.art)?.monate == null ? "(unbefristet)" : ""}</label>
                <input type="date" value={form.gueltigBis} onChange={setF("gueltigBis")} />
              </div>
            </div>
            <div className="field-group">
              <label>Ausstellende Stelle</label>
              <input value={form.stelle} onChange={setF("stelle")} placeholder="z. B. MBKS, DRK, SVLFG" />
            </div>
            <div className="field-group">
              <label>Nachweis (PDF oder Foto)</label>
              <div className="form-row" style={{ gap: 8 }}>
                <label className="btn btn-ghost" style={{ flex: 1, textAlign: "center" }}>
                  Datei wählen
                  <input type="file" accept="application/pdf,image/*" style={{ display: "none" }}
                    onChange={(e) => { setDatei(e.target.files?.[0] || null); e.target.value = ""; }} />
                </label>
                <label className="btn btn-ghost" style={{ flex: 1, textAlign: "center" }}>
                  Foto aufnehmen
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                    onChange={(e) => { setDatei(e.target.files?.[0] || null); e.target.value = ""; }} />
                </label>
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>{datei ? datei.name : "Ohne Nachweis wird nur der Eintrag gespeichert."}</div>
            </div>
            <div className="form-row" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setForm(null)} disabled={saving}>Abbrechen</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={speichern} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}

      {neu && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setNeu(null)}>
          <div className="modal gbu-modal">
            <div className="modal-handle" />
            <div className="modal-title">Aushilfe anlegen</div>
            <div className="field-group">
              <label>Name</label>
              <input value={neu.name} onChange={(e) => setNeu((n) => ({ ...n, name: e.target.value }))} placeholder="Vor- und Nachname" />
            </div>
            <div className="field-group">
              <label>Mobil</label>
              <input type="tel" value={neu.mobil} onChange={(e) => setNeu((n) => ({ ...n, mobil: e.target.value }))} placeholder="+49 …" />
            </div>
            <div className="field-group">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={neu.jugendlich} onChange={(e) => setNeu((n) => ({ ...n, jugendlich: e.target.checked }))} />
                unter 18 Jahre
              </label>
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>Schlüssel: {qualSlug(neu.name) || "—"} · Personen mit Dolibarr-Zugang erscheinen von selbst.</div>
            <div className="form-row" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setNeu(null)} disabled={saving}>Abbrechen</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={personAnlegen} disabled={saving}>{saving ? "Lege an…" : "Anlegen"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
