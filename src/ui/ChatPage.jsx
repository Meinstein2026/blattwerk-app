// Nativer Chat (seit 19.09.2026) — Ansage Inhaber: „Element direkt fest
// einbinden, nicht als Bild im Bild, nur die Chats sichtbar, ohne internes
// Fenster". Bis dahin lief Element-Web im iframe, per Proxy kostümiert
// (src/chat-proxy.js). Jetzt spricht die App selbst Matrix:
//
//   src/chat/sitzung.js     Anmeldung (SSO → eigenes Gerät)
//   src/chat/client.js      Matrix-SDK samt Ende-zu-Ende-Verschlüsselung
//   src/chat/uebernahme.js  einmalige Schlüssel-Übernahme aus Element
//   src/chat/logik.js       was angezeigt wird (rein, getestet)
//
// Ein-Spalten-Aufbau wie jede Handy-Chat-App: Raumliste ODER Verlauf.
// Die Element-Instanz unter /chat/ bleibt als Notausgang erreichbar
// (Videoanrufe, Raumverwaltung) — verlinkt im ⋯-Menü der Raumliste.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  chatAbgleichAbbrechen, chatAbgleichBestaetigen, chatAbgleichSchliessen, chatAbgleichStarten,
  chatAbmelden, chatAbonnieren, chatAeltereLaden, chatBeitreten, chatDateiSenden, chatEreignisse, chatErneutSenden, chatErsteinrichten,
  chatGeheimnisseUebernehmen, chatGelesen, chatIch, chatLoeschen, chatMedium, chatMitSchluesselVerifizieren, chatRaeume,
  chatRaumInfo, chatReagieren, chatSenden, chatOrdnerKinder, chatSpaceKinder, chatSpaceMitglieder, chatSpeicherZuruecksetzen, chatStand, chatStarten, chatVerlassen,
} from "../chat/client.js";
import {
  chatDateiGroesse, chatFarbe, chatInitialen, chatKurztext, chatListenZeit, chatMarke, chatOrdnerBilden, chatRaumListe, chatUhrzeit,
  chatUngelesenGesamt, chatZeitleiste,
  WHATSAPP_SPACE,
} from "../chat/logik.js";
import { CHAT_HOMESERVER, chatRueckAdresse, chatSitzungLesen, chatSitzungLoeschen, chatSsoUrl } from "../chat/sitzung.js";
import { HINTERLEGUNG_SCHLUESSEL, hinterlegungNachholen, hinterlegungSenden, hinterlegungVerschluesseln } from "../chat/hinterlegung.js";
import { elementSitzungPasst, geheimnisseAusElement, uebernahmeErledigt, uebernahmeMerken } from "../chat/uebernahme.js";
import { TELEFON_RAUM } from "../telefon.js";

// Zuletzt gezeigte Raumliste — steht beim nächsten Start SOFORT da, während der
// Client im Hintergrund hochfährt (WASM laden, Speicher öffnen, erster Sync).
// Nur Anzeige-Daten, keine Nachrichteninhalte aus verschlüsselten Räumen: deren
// Vorschau wird vor dem Ablegen entfernt.
const LISTE_KEY = "blattwerk_chat_liste";
const listeLesen = () => { try { const l = JSON.parse(localStorage.getItem(LISTE_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
const listeMerken = (liste) => {
  try { localStorage.setItem(LISTE_KEY, JSON.stringify(liste.slice(0, 40).map((r) => ({ ...r, vorschau: r.verschluesselt ? "" : r.vorschau })))); } catch (_) {}
};

const SCHNELL_REAKTIONEN = ["👍", "❤️", "😂", "✅", "🙏"];

const CSS = `
.chat-huelle { display: flex; flex-direction: column; position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; bottom: calc(58px + env(safe-area-inset-bottom)); z-index: 95; background: var(--bg); color: var(--text); }
.chat-kopf { display: flex; align-items: center; gap: 10px; padding: 10px 12px; padding-top: calc(10px + env(safe-area-inset-top)); background: var(--surface); border-bottom: 1px solid var(--border); flex: none; }
.chat-kopf h2 { flex: 1; min-width: 0; margin: 0; font-size: 18px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-kopf-knopf { width: 40px; height: 40px; border-radius: 20px; border: none; background: transparent; color: var(--text); font-size: 22px; cursor: pointer; flex: none; }
.chat-kopf-knopf:active { background: var(--surface2); }
.chat-mitte { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.chat-leer { padding: 32px 24px; text-align: center; color: var(--text2); font-size: 14px; line-height: 1.5; }
.chat-karte { padding: 24px; display: flex; flex-direction: column; gap: 14px; justify-content: center; flex: 1; }
.chat-suche { padding: 8px 12px; flex: none; }
.chat-suche input { width: 100%; height: 40px; border-radius: 20px; padding: 0 16px; }
.chat-banner { margin: 8px 12px 0; padding: 10px 12px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--border); font-size: 13px; line-height: 1.45; flex: none; }
.chat-banner.warn { border-color: var(--warn); }
.chat-banner .action-row { margin-top: 8px; gap: 8px; flex-wrap: wrap; }

.chat-raum { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--border); }
.chat-raum:active { background: var(--surface2); }
.chat-avatar { width: 44px; height: 44px; border-radius: 22px; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 15px; }
.chat-avatar.klein { width: 30px; height: 30px; border-radius: 15px; font-size: 11px; }
.chat-raum-text { flex: 1; min-width: 0; }
.chat-raum-name { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-raum-vorschau { font-size: 13px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.chat-raum.ungelesen .chat-raum-vorschau { color: var(--text); font-weight: 600; }
.chat-raum-rechts { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.chat-raum-zeit { font-size: 11px; color: var(--text3); }
.chat-marke { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; line-height: 20px; text-align: center; }

.chat-verlauf { padding: 8px 10px 12px; display: flex; flex-direction: column; }
.chat-tag { align-self: center; margin: 12px 0 8px; padding: 3px 12px; border-radius: 12px; background: var(--surface2); color: var(--text2); font-size: 11px; font-weight: 700; }
.chat-system { align-self: center; margin: 4px 0; font-size: 12px; color: var(--text3); text-align: center; }
.chat-zeile { display: flex; gap: 8px; align-items: flex-end; margin-top: 2px; max-width: 100%; }
.chat-zeile.kopf { margin-top: 10px; }
.chat-zeile.eigen { flex-direction: row-reverse; }
.chat-zeile-avatar { width: 30px; flex: none; }
.chat-blase { position: relative; max-width: 80%; min-width: 0; padding: 7px 11px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border); font-size: 15px; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; cursor: pointer; }
.chat-zeile.eigen .chat-blase { background: var(--accent); border-color: var(--accent); color: #fff; }
.chat-zeile.eigen .chat-blase a { color: #fff; }
.chat-blase.leise { font-style: italic; color: var(--text3); background: transparent; }
.chat-zeile.eigen .chat-blase.leise { color: var(--text3); border-color: var(--border); background: transparent; }
.chat-blase.hinweis { background: var(--surface2); font-size: 14px; }
.chat-blase.wartet { opacity: .6; }
.chat-blase.fehler { border-color: var(--danger); }
.chat-absender { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
.chat-zitat { margin-bottom: 5px; padding: 3px 8px; border-left: 3px solid currentColor; border-radius: 4px; background: rgba(127,127,127,.18); font-size: 13px; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-fuss { display: block; margin-top: 2px; font-size: 10px; opacity: .7; text-align: right; }
.chat-bild { display: block; max-width: 100%; max-height: 320px; border-radius: 10px; margin-bottom: 2px; background: rgba(127,127,127,.2); }
.chat-bild-platz { width: 220px; max-width: 100%; border-radius: 10px; background: rgba(127,127,127,.2); display: flex; align-items: center; justify-content: center; font-size: 12px; }
.chat-datei { display: flex; align-items: center; gap: 8px; }
.chat-datei small { opacity: .75; }
.chat-reaktionen { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 38px 0; }
.chat-zeile-huelle.eigen .chat-reaktionen { justify-content: flex-end; }
.chat-reaktion { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 12px; padding: 1px 8px; font-size: 13px; cursor: pointer; }
.chat-reaktion.eigen { border-color: var(--accent); background: var(--surface2); }
.chat-aktionen { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 38px 2px; }
.chat-zeile-huelle.eigen .chat-aktionen { justify-content: flex-end; }
.chat-aktionen button { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 14px; padding: 5px 11px; font-size: 13px; cursor: pointer; }
.chat-aeltere { align-self: center; margin: 6px 0; font-size: 12px; color: var(--text3); }

.chat-eingabe { flex: none; border-top: 1px solid var(--border); background: var(--surface); padding: 8px 8px calc(8px + env(safe-area-inset-bottom)); }
.chat-eingabe-antwort { display: flex; align-items: center; gap: 8px; margin: 0 4px 6px; padding: 5px 10px; border-left: 3px solid var(--accent); background: var(--surface2); border-radius: 6px; font-size: 13px; }
.chat-eingabe-antwort span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-eingabe-zeile { display: flex; align-items: flex-end; gap: 6px; }
.chat-eingabe textarea { flex: 1; min-width: 0; resize: none; max-height: 132px; min-height: 42px; border-radius: 21px; padding: 10px 16px; font-size: 16px; line-height: 1.35; }
.chat-rund { width: 42px; height: 42px; border-radius: 21px; border: none; flex: none; font-size: 19px; cursor: pointer; background: var(--surface2); color: var(--text); }
.chat-rund.senden { background: var(--accent); color: #fff; }
.chat-rund:disabled { opacity: .45; }

.chat-vollbild { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,.94); display: flex; align-items: center; justify-content: center; }
.chat-vollbild img { max-width: 100%; max-height: 100%; }
.chat-vollbild-leiste { position: absolute; top: calc(10px + env(safe-area-inset-top)); right: 10px; display: flex; gap: 8px; }
.chat-vollbild-leiste button { height: 42px; min-width: 42px; padding: 0 14px; border-radius: 21px; border: none; background: rgba(255,255,255,.18); color: #fff; font-size: 16px; cursor: pointer; }
.chat-emojis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 6px; margin: 16px 0; text-align: center; }
.chat-emojis span { display: block; font-size: 34px; line-height: 1.15; }
.chat-emojis small { display: block; font-size: 11px; color: var(--text2); }
.chat-menue { position: absolute; top: calc(54px + env(safe-area-inset-top)); right: 10px; z-index: 5; min-width: 220px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.chat-menue button { display: block; width: 100%; text-align: left; padding: 13px 16px; border: none; background: transparent; color: var(--text); font-size: 15px; cursor: pointer; }
.chat-menue button:active { background: var(--surface2); }
`;

// ── Kleinteile ──────────────────────────────────────────────────────────────
const useChatStand = () => useSyncExternalStore(chatAbonnieren, chatStand);

function Avatar({ name, schluessel, klein }) {
  return <div className={`chat-avatar ${klein ? "klein" : ""}`} style={{ background: chatFarbe(schluessel || name) }}>{chatInitialen(name)}</div>;
}

/** Text mit antippbaren Links — alles andere bleibt Text (kein HTML aus Nachrichten). */
function MitLinks({ text }) {
  const teile = String(text || "").split(/(https?:\/\/[^\s<>"']+)/g);
  return teile.map((t, i) => (i % 2 ? <a key={i} href={t} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{t}</a> : t));
}

const blobZuBase64 = (blob) => new Promise((resolve, reject) => {
  const l = new FileReader();
  l.onload = () => resolve(String(l.result).split(",")[1] || "");
  l.onerror = () => reject(l.error);
  l.readAsDataURL(blob);
});

/**
 * Speichern wie überall in der App über /api/datei/ablegen: die APK-Hülle gibt
 * nur http-Adressen an den Download-Manager weiter, blob:-Adressen verpuffen.
 */
async function mediumSpeichern(n, showToast) {
  try {
    const url = await chatMedium(n);
    const blob = await (await fetch(url)).blob();
    try {
      const r = await fetch("/api/datei/ablegen", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inhalt: await blobZuBase64(blob), name: n.name || "datei", typ: n.mime || "application/octet-stream" }) });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      window.location.href = (await r.json()).url;
    } catch {
      const a = document.createElement("a");
      a.href = url; a.download = n.name || "datei";
      document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) { showToast?.(`Laden fehlgeschlagen: ${e.message || e}`, "error"); }
}

function Bild({ n, onOeffnen }) {
  const [url, setUrl] = useState(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let lebt = true;
    chatMedium(n, { vorschau: true }).then((u) => lebt && setUrl(u), () => lebt && setFehler(true));
    return () => { lebt = false; };
  }, [n.mxc]);
  // Platzhalter im späteren Seitenverhältnis — sonst springt der Verlauf, wenn das Bild eintrifft.
  const hoehe = n.breite && n.hoehe ? Math.min(320, Math.round(220 * n.hoehe / n.breite)) : 160;
  if (!url) return <div className="chat-bild-platz" style={{ height: hoehe }}>{fehler ? "Bild nicht ladbar" : "lädt …"}</div>;
  return <img className="chat-bild" src={url} alt={n.name} onClick={(e) => { e.stopPropagation(); onOeffnen(n); }} />;
}

function Wiedergabe({ n, art }) {
  const [url, setUrl] = useState(null);
  if (!url) return <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); chatMedium(n).then(setUrl, () => {}); }}>{art === "audio" ? "🎤 Anhören" : "🎬 Ansehen"}</button>;
  return art === "audio" ? <audio controls autoPlay src={url} style={{ maxWidth: "100%" }} /> : <video controls autoPlay src={url} style={{ maxWidth: "100%", borderRadius: 10 }} />;
}

function Vollbild({ n, onClose, showToast }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let lebt = true; chatMedium(n).then((u) => lebt && setUrl(u), () => {}); return () => { lebt = false; }; }, [n.mxc]);
  return (
    <div className="chat-vollbild" onClick={onClose}>
      {url ? <img src={url} alt={n.name} /> : <div className="spinner" />}
      <div className="chat-vollbild-leiste" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => mediumSpeichern(n, showToast)}>⤓ Speichern</button>
        <button type="button" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

// ── Anmeldung ───────────────────────────────────────────────────────────────
function Anmeldung() {
  return (
    <div className="chat-karte">
      <div style={{ fontSize: 18, fontWeight: 700 }}>Blattwerk Chat</div>
      <div style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.5 }}>
        Einmal mit dem Blattwerk-Konto anmelden — dieselbe Anmeldung wie für die App. Danach bleibt der Chat auf diesem Gerät angemeldet.
      </div>
      <button className="btn btn-primary" onClick={() => window.location.assign(chatSsoUrl(CHAT_HOMESERVER, chatRueckAdresse(window.location.origin)))}>
        Jetzt anmelden
      </button>
    </div>
  );
}

// ── Verschlüsselung: Banner + Schlüssel-Eingabe ─────────────────────────────
function KryptoBanner({ krypto, sitzung, showToast }) {
  const [laeuft, setLaeuft] = useState("");
  const [eingabeOffen, setEingabeOffen] = useState(false);
  const [schluessel, setSchluessel] = useState("");
  const versucht = useRef(false);

  const ausElement = useCallback(async (still) => {
    setLaeuft("Schlüssel werden aus der bisherigen Chat-Sitzung übernommen …");
    try {
      await chatGeheimnisseUebernehmen(await geheimnisseAusElement(sitzung.userId));
      if (!still) showToast?.("Dieses Gerät ist jetzt verifiziert");
    } catch (e) { if (!still) showToast?.(String(e.message || e), "error"); }
    finally { uebernahmeMerken(localStorage, sitzung.deviceId); setLaeuft(""); }
  }, [sitzung]);

  // Einmal je Gerät von selbst: wer bisher im Element-Reiter angemeldet war,
  // soll von der Umstellung nichts merken.
  const offen = !!krypto && !krypto.verifiziert && krypto.kontoHatCrossSigning;
  useEffect(() => {
    if (!offen || versucht.current) return;
    versucht.current = true;
    if (elementSitzungPasst(localStorage, sitzung.userId) && !uebernahmeErledigt(localStorage, sitzung.deviceId)) ausElement(true);
  }, [offen, sitzung, ausElement]);

  // Frisches Konto (neue Mitarbeitende): die App richtet die Verschlüsselung
  // selbst ein, zeigt den Sicherheitsschlüssel EINMAL und hinterlegt ihn für
  // die Firma verschlüsselt (Entscheidung Inhaber 19.09.2026, Variante B).
  const frisch = !!krypto && !krypto.verifiziert && !krypto.kontoHatCrossSigning;
  const [neuerSchluessel, setNeuerSchluessel] = useState(null); // { text, hinterlegt }
  const [einrichtFehler, setEinrichtFehler] = useState("");
  const einrichten = useCallback(async () => {
    setEinrichtFehler(""); setLaeuft("Verschlüsselung wird eingerichtet …");
    try {
      const text = await chatErsteinrichten();
      const chiffre = await hinterlegungVerschluesseln(HINTERLEGUNG_SCHLUESSEL, text);
      setNeuerSchluessel({ text, hinterlegt: await hinterlegungSenden({ userId: sitzung.userId, deviceId: sitzung.deviceId, chiffre }) });
    } catch (e) { setEinrichtFehler(String(e.message || e)); }
    finally { setLaeuft(""); }
  }, [sitzung]);
  const eingerichtet = useRef(false);
  useEffect(() => {
    if (krypto) hinterlegungNachholen();
    if (!frisch || eingerichtet.current) return;
    eingerichtet.current = true;
    einrichten();
  }, [frisch, !!krypto, einrichten]);

  const mitSchluessel = async () => {
    setLaeuft("Schlüssel wird geprüft …");
    try { await chatMitSchluesselVerifizieren(schluessel); setEingabeOffen(false); setSchluessel(""); showToast?.("Dieses Gerät ist jetzt verifiziert"); }
    catch (e) { showToast?.(String(e.message || e), "error"); }
    finally { setLaeuft(""); }
  };

  if (laeuft) return <div className="chat-banner"><span className="spinner" style={{ display: "inline-block", width: 12, height: 12, marginRight: 8 }} />{laeuft}</div>;
  if (neuerSchluessel) return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 style={{ marginTop: 0 }}>Dein Sicherheitsschlüssel</h3>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>✅ Der Chat ist eingerichtet und verschlüsselt. <b>Bewahre diesen Schlüssel auf</b> (Passwort-Manager oder Zettel) — du brauchst ihn, wenn du dich auf einem neuen Gerät anmeldest. Er wird nur dieses eine Mal angezeigt.</p>
        <textarea readOnly value={neuerSchluessel.text} rows={3} onFocus={(e) => e.target.select()} style={{ width: "100%", fontFamily: "monospace", fontSize: 15 }} />
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text2)" }}>{neuerSchluessel.hinterlegt
          ? "Eine Kopie liegt verschlüsselt bei der Firma — nur die Geschäftsleitung kann sie öffnen, falls du den Schlüssel verlierst."
          : "Die Firmen-Kopie konnte gerade nicht abgelegt werden — die App holt das beim nächsten Start nach."}</p>
        <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 8 }} onClick={() => navigator.clipboard?.writeText(neuerSchluessel.text).then(() => showToast?.("Kopiert"), () => {})}>Kopieren</button>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setNeuerSchluessel(null)}>Ich habe ihn gesichert</button>
      </div>
    </div>
  );
  if (frisch && einrichtFehler) return (
    <div className="chat-banner warn">
      <b>Die Verschlüsselung konnte nicht eingerichtet werden.</b> {einrichtFehler}
      <div className="action-row"><button className="btn btn-primary btn-sm" onClick={einrichten}>Erneut versuchen</button></div>
    </div>
  );
  if (!offen) return null;
  return (
    <div className="chat-banner warn">
      <b>Dieses Gerät ist noch nicht verifiziert.</b> Ältere verschlüsselte Nachrichten bleiben so lange unlesbar.
      {eingabeOffen ? (
        <>
          <textarea value={schluessel} onChange={(e) => setSchluessel(e.target.value)} rows={2} autoFocus
            placeholder="Sicherheitsschlüssel (EsT… …) oder Sicherheitsphrase" style={{ width: "100%", marginTop: 8 }} />
          <div className="action-row">
            <button className="btn btn-primary btn-sm" disabled={!schluessel.trim()} onClick={mitSchluessel}>Verifizieren</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEingabeOffen(false)}>Abbrechen</button>
          </div>
        </>
      ) : (
        <div className="action-row">
          {/* Der bequeme Weg zuerst: den Schlüssel hat kaum jemand zur Hand. */}
          <button className="btn btn-primary btn-sm" onClick={() => chatAbgleichStarten().catch((e) => showToast?.(String(e.message || e), "error"))}>Mit anderem Gerät abgleichen</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEingabeOffen(true)}>Sicherheitsschlüssel eingeben</button>
          {elementSitzungPasst(localStorage, sitzung.userId) && <button className="btn btn-secondary btn-sm" onClick={() => ausElement(false)}>Aus bisheriger Sitzung übernehmen</button>}
        </div>
      )}
    </div>
  );
}

/** Emoji-Abgleich mit einem anderen Gerät derselben Person — der Ablauf steht in src/chat/client.js. */
function AbgleichBogen({ abgleich }) {
  if (!abgleich) return null;
  const { phase, emojis, grund } = abgleich;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 style={{ marginTop: 0 }}>Gerät abgleichen</h3>
        {phase === "wartet" && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>Öffne jetzt <b>Element auf einem anderen Gerät</b> (Handy oder PC), auf dem du schon angemeldet bist. Dort erscheint die Anfrage „Neue Anmeldung verifizieren" — annehmen und <b>„Mit Emojis vergleichen"</b> wählen.</p>
            <div className="loading"><div className="spinner" /> wartet auf das andere Gerät …</div>
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => chatAbgleichAbbrechen()}>Abbrechen</button>
          </>
        )}
        {phase === "emoji" && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>Zeigt das andere Gerät <b>dieselben Emojis in derselben Reihenfolge</b>?</p>
            <div className="chat-emojis">{emojis.map((e, i) => <div key={i}><span>{e.zeichen}</span><small>{e.name}</small></div>)}</div>
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={chatAbgleichBestaetigen}>Sie stimmen überein</button>
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => chatAbgleichAbbrechen({ stimmtNicht: true })}>Sie stimmen nicht überein</button>
          </>
        )}
        {phase === "prueft" && <div className="loading"><div className="spinner" /> Bestätige auch auf dem anderen Gerät …</div>}
        {phase === "fertig" && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>✅ <b>Dieses Gerät ist verifiziert.</b> Ältere verschlüsselte Nachrichten werden jetzt nachgeladen — das kann einen Moment dauern.</p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={chatAbgleichSchliessen}>Fertig</button>
          </>
        )}
        {phase === "abgebrochen" && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>Abgleich abgebrochen{grund ? ` — ${grund}` : ""}.</p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={chatAbgleichSchliessen}>Schließen</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Raumliste ───────────────────────────────────────────────────────────────
function RaumListe({ liste, suche, setSuche, onWahl, krypto, sitzung, showToast, verbindet = false, titel = "Chat", onZurueck = null }) {
  const [menue, setMenue] = useState(false);
  const jetzt = Date.now();
  return (
    <>
      <div className="chat-kopf">
        {onZurueck && <button type="button" className="chat-kopf-knopf" aria-label="Zurück" onClick={onZurueck}>←</button>}
        <h2>{titel}</h2>
        <button type="button" className="chat-kopf-knopf" aria-label="Mehr" onClick={() => setMenue((v) => !v)}>⋯</button>
      </div>
      {menue && (
        <div className="chat-menue" onClick={() => setMenue(false)}>
          {/* Notausgang: Videoanrufe, Räume anlegen, Einstellungen — alles, was die App nicht nachbaut. */}
          <button type="button" onClick={() => window.location.assign("/chat/")}>In Element öffnen</button>
          <button type="button" onClick={async () => {
            if (!window.confirm("Vom Chat abmelden? Die Schlüssel dieses Geräts werden gelöscht.")) return;
            await chatAbmelden(); chatSitzungLoeschen(localStorage); try { localStorage.removeItem(LISTE_KEY); } catch (_) {}
          }}>Vom Chat abmelden</button>
        </div>
      )}
      {verbindet && <div className="chat-banner"><span className="spinner" style={{ display: "inline-block", width: 12, height: 12, marginRight: 8 }} />verbindet … <small style={{ color: "var(--text3)" }}>{verbindet === true ? "" : verbindet}</small></div>}
      <KryptoBanner krypto={krypto} sitzung={sitzung} showToast={showToast} />
      {!onZurueck && <div className="chat-suche"><input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Chat suchen …" /></div>}
      <div className="chat-mitte">
        {!liste.length && <div className="chat-leer">{suche ? "Kein Chat mit diesem Namen." : "Noch keine Chats."}</div>}
        {liste.map((r) => (
          <div key={r.id} className={`chat-raum ${r.ungelesen || r.mitgliedschaft === "invite" ? "ungelesen" : ""}`} onClick={() => onWahl(r)}>
            <Avatar name={r.name} schluessel={r.id} />
            <div className="chat-raum-text">
              <div className="chat-raum-name">{r.verschluesselt ? "🔒 " : ""}{r.name}{r.ordner ? ` (${r.raeume.length})` : ""}</div>
              <div className="chat-raum-vorschau">{r.mitgliedschaft === "invite" ? "Einladung — antippen zum Beitreten" : r.vorschau || " "}</div>
            </div>
            <div className="chat-raum-rechts">
              <span className="chat-raum-zeit">{chatListenZeit(r.letzteTs, jetzt)}</span>
              {r.mitgliedschaft === "invite" ? <span className="chat-marke">neu</span> : r.ungelesen > 0 && <span className="chat-marke">{chatMarke(r.ungelesen)}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Eine Nachricht ──────────────────────────────────────────────────────────
// Der Verlauf hebt die Auswahl bei jedem Tipp auf (Tipp daneben = schließen).
// Blase, Aktionen und Reaktionen halten ihren Klick deshalb fest — sonst
// schlösse sich die Aktionsleiste im selben Augenblick (Live-Test 19.09.2026).
function Nachricht({ z, mitName, gewaehlt, onTipp, onAntwort, onReaktion, onLoeschen, onErneut, onBild, showToast }) {
  const wartet = z.status === "sending" || z.status === "queued" || z.status === "encrypting";
  const fehlt = z.status === "not_sent";
  const leise = z.art === "geloescht" || z.art === "unlesbar";
  return (
    <div className={`chat-zeile-huelle ${z.eigen ? "eigen" : ""}`}>
      <div className={`chat-zeile ${z.eigen ? "eigen" : ""} ${z.kopf ? "kopf" : ""}`}>
        {!z.eigen && <div className="chat-zeile-avatar">{z.kopf && mitName && <Avatar klein name={z.senderName} schluessel={z.sender} />}</div>}
        <div className={`chat-blase ${leise ? "leise" : ""} ${z.art === "hinweis" ? "hinweis" : ""} ${wartet ? "wartet" : ""} ${fehlt ? "fehler" : ""}`} onClick={(e) => { e.stopPropagation(); onTipp(z.id); }}>
          {z.kopf && !z.eigen && mitName && <div className="chat-absender" style={{ color: chatFarbe(z.sender) }}>{z.senderName}</div>}
          {z.zitat && <div className="chat-zitat">{z.zitat.name ? <b>{z.zitat.name}: </b> : null}{z.zitat.text}</div>}
          {z.art === "bild" && <Bild n={z} onOeffnen={onBild} />}
          {(z.art === "audio" || z.art === "video") && <Wiedergabe n={z} art={z.art} />}
          {z.art === "datei" && (
            <div className="chat-datei" onClick={(e) => { e.stopPropagation(); mediumSpeichern(z, showToast); }}>
              <span style={{ fontSize: 22 }}>📎</span><span><b>{z.name}</b><br /><small>{chatDateiGroesse(z.groesse)} · antippen zum Laden</small></span>
            </div>
          )}
          {z.text ? <MitLinks text={z.text} /> : null}
          <span className="chat-fuss">{z.bearbeitet ? "bearbeitet · " : ""}{fehlt ? "nicht gesendet" : wartet ? "sendet …" : chatUhrzeit(z.ts)}</span>
        </div>
      </div>
      {z.reaktionen?.length > 0 && (
        <div className="chat-reaktionen" onClick={(e) => e.stopPropagation()}>
          {z.reaktionen.map((r) => <button key={r.zeichen} type="button" className={`chat-reaktion ${r.eigeneId ? "eigen" : ""}`} onClick={() => onReaktion(z, r.zeichen, r.eigeneId)}>{r.zeichen} {r.anzahl}</button>)}
        </div>
      )}
      {gewaehlt && (
        <div className="chat-aktionen" onClick={(e) => e.stopPropagation()}>
          {fehlt ? (
            <>
              <button type="button" onClick={() => onErneut(z, false)}>↻ Erneut senden</button>
              <button type="button" onClick={() => onErneut(z, true)}>Verwerfen</button>
            </>
          ) : !leise && !wartet && (
            <>
              {SCHNELL_REAKTIONEN.map((e) => <button key={e} type="button" onClick={() => onReaktion(z, e, z.reaktionen?.find((r) => r.zeichen === e)?.eigeneId || null)}>{e}</button>)}
              <button type="button" onClick={() => onAntwort(z)}>↩ Antworten</button>
              {z.text && <button type="button" onClick={() => { navigator.clipboard?.writeText(z.text); showToast?.("Kopiert"); }}>Kopieren</button>}
              {z.eigen && <button type="button" onClick={() => onLoeschen(z)}>Löschen</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Verlauf eines Raums ─────────────────────────────────────────────────────
function RaumAnsicht({ raumId, sichtbar, version, onZurueck, showToast }) {
  const info = useMemo(() => chatRaumInfo(raumId), [raumId, version]);
  const zeilen = useMemo(() => chatZeitleiste(chatEreignisse(raumId), { ich: chatIch(), jetzt: Date.now() }), [raumId, version]);
  const [text, setText] = useState("");
  const [antwort, setAntwort] = useState(null);
  const [gewaehlt, setGewaehlt] = useState(null);
  const [vollbild, setVollbild] = useState(null);
  const [sendet, setSendet] = useState(false);
  const [aeltere, setAeltere] = useState("bereit");   // bereit | laedt | ende
  const rolle = useRef(null);
  const amEnde = useRef(true);
  const vorLaden = useRef(null);                       // Höhe vor dem Nachladen älterer Nachrichten
  const dateiWahl = useRef(null);
  const feld = useRef(null);

  // Rollposition: neue Nachrichten halten unten fest — aber nur, wenn man
  // schon unten war; wer oben liest, wird nicht weggerissen. Nach dem
  // Nachladen älterer Nachrichten bleibt die gelesene Stelle stehen.
  useLayoutEffect(() => {
    const el = rolle.current;
    if (!el) return;
    if (vorLaden.current != null) { el.scrollTop = el.scrollHeight - vorLaden.current; vorLaden.current = null; }
    else if (amEnde.current) el.scrollTop = el.scrollHeight;
  }, [zeilen]);

  useEffect(() => { if (sichtbar && amEnde.current) chatGelesen(raumId); }, [sichtbar, raumId, version]);

  const aeltereHolen = useCallback(async () => {
    if (aeltere !== "bereit" || !rolle.current) return;
    setAeltere("laedt");
    vorLaden.current = rolle.current.scrollHeight;
    try { setAeltere((await chatAeltereLaden(raumId)) ? "bereit" : "ende"); }
    catch { vorLaden.current = null; setAeltere("bereit"); }
  }, [aeltere, raumId]);

  // Füllt der erste Schwung den Bildschirm nicht, gäbe es nie ein Rollereignis — dann gleich nachladen.
  useEffect(() => { const el = rolle.current; if (el && el.scrollHeight <= el.clientHeight + 40) aeltereHolen(); }, [raumId]);

  const beimRollen = () => {
    const el = rolle.current;
    amEnde.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120) aeltereHolen();
    if (amEnde.current) chatGelesen(raumId);
  };

  const abschicken = async () => {
    const t = text.trim();
    if (!t || sendet) return;
    setText(""); const an = antwort; setAntwort(null); amEnde.current = true;
    if (feld.current) feld.current.style.height = "auto";
    try { await chatSenden(raumId, t, { antwortAuf: an?.id || null }); }
    catch (e) { showToast?.(`Nicht gesendet: ${e.message || e}`, "error"); }
  };

  const dateiGewaehlt = async (e) => {
    const dateien = [...(e.target.files || [])];
    e.target.value = "";
    if (!dateien.length) return;
    setSendet(true); amEnde.current = true;
    try { for (const d of dateien) await chatDateiSenden(raumId, d); }
    catch (err) { showToast?.(`Datei nicht gesendet: ${err.message || err}`, "error"); }
    finally { setSendet(false); }
  };

  // Am Handy macht Enter einen Zeilenumbruch (gesendet wird mit dem Knopf),
  // an der Tastatur sendet Enter und Umschalt+Enter bricht um.
  const beiTaste = (e) => {
    if (e.key !== "Enter" || e.shiftKey || window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault(); abschicken();
  };

  if (!info) return <><div className="chat-kopf"><button className="chat-kopf-knopf" onClick={onZurueck}>←</button><h2>Chat</h2></div><div className="chat-leer">Raum wird geladen …</div></>;
  const mitName = !info.direkt;
  return (
    <>
      <div className="chat-kopf">
        <button type="button" className="chat-kopf-knopf" aria-label="Zurück" onClick={onZurueck}>←</button>
        <Avatar klein name={info.name} schluessel={info.id} />
        <h2>{info.verschluesselt ? "🔒 " : ""}{info.name}</h2>
      </div>
      <div className="chat-mitte" ref={rolle} onScroll={beimRollen} onClick={() => setGewaehlt(null)}>
        <div className="chat-verlauf">
          <div className="chat-aeltere">{aeltere === "laedt" ? "lädt ältere Nachrichten …" : aeltere === "ende" ? "Anfang des Chats" : ""}</div>
          {zeilen.map((z) => z.typ === "tag" ? <div key={z.id} className="chat-tag">{z.titel}</div>
            : z.typ === "system" ? <div key={z.id} className="chat-system">{z.text}</div>
            : <Nachricht key={z.id} z={z} mitName={mitName} gewaehlt={gewaehlt === z.id} showToast={showToast}
                onTipp={(id) => setGewaehlt((g) => (g === id ? null : id))}
                onAntwort={(n) => { setAntwort(n); setGewaehlt(null); feld.current?.focus(); }}
                onReaktion={(n, zeichen, eigeneId) => { setGewaehlt(null); chatReagieren(raumId, n.id, zeichen, eigeneId).catch((e) => showToast?.(String(e.message || e), "error")); }}
                onLoeschen={(n) => { setGewaehlt(null); if (window.confirm("Nachricht für alle löschen?")) chatLoeschen(raumId, n.id).catch((e) => showToast?.(String(e.message || e), "error")); }}
                onErneut={(n, verwerfen) => { setGewaehlt(null); chatErneutSenden(raumId, n.id, { verwerfen }).catch((e) => showToast?.(String(e.message || e), "error")); }}
                onBild={setVollbild} />)}
        </div>
      </div>
      <div className="chat-eingabe">
        {antwort && (
          <div className="chat-eingabe-antwort">
            <span><b>{antwort.senderName}: </b>{chatKurztext(antwort)}</span>
            <button type="button" className="chat-kopf-knopf" style={{ width: 28, height: 28, fontSize: 15 }} onClick={() => setAntwort(null)}>✕</button>
          </div>
        )}
        <div className="chat-eingabe-zeile">
          <input ref={dateiWahl} type="file" multiple hidden onChange={dateiGewaehlt} />
          <button type="button" className="chat-rund" aria-label="Datei oder Foto anhängen" disabled={sendet} onClick={() => dateiWahl.current?.click()}>{sendet ? "…" : "📎"}</button>
          <textarea ref={feld} rows={1} value={text} placeholder="Nachricht …" onKeyDown={beiTaste}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(132, e.target.scrollHeight)}px`; }} />
          <button type="button" className="chat-rund senden" aria-label="Senden" disabled={!text.trim()} onClick={abschicken}>➤</button>
        </div>
      </div>
      {vollbild && <Vollbild n={vollbild} onClose={() => setVollbild(null)} showToast={showToast} />}
    </>
  );
}

// ── Der Chat-Reiter ─────────────────────────────────────────────────────────
/**
 * Bleibt auch unsichtbar eingehängt: der Client synchronisiert weiter, damit
 * die Marke am Reiter stimmt und das Telefon klingeln kann (der ☎-Raum läuft
 * über denselben Client, siehe TelefonBereich in dolibarr-app.jsx).
 * `nurSpace={false}` zeigt alle beigetretenen Räume — nur für die Probeseite
 * (scripts/chat-smoke.html?alle), damit sich Senden in einem privaten Testraum
 * prüfen lässt, ohne Kollegen mit Testnachrichten zu behelligen.
 */
export default function ChatBereich({ sichtbar, showToast, onUngelesen, nurSpace = true }) {
  const stand = useChatStand();
  const [sitzung, setSitzung] = useState(() => chatSitzungLesen(localStorage));
  const [raumId, setRaumId] = useState(null);
  const [suche, setSuche] = useState("");
  const [ordner, setOrdner] = useState(false);

  // Nach dem Rücksprung von der Anmeldung steht die Sitzung erst jetzt da.
  useEffect(() => { if (sichtbar && !sitzung) setSitzung(chatSitzungLesen(localStorage)); }, [sichtbar]);
  useEffect(() => { if (sitzung) chatStarten(sitzung); }, [sitzung]);
  useEffect(() => { if (stand.phase === "abgemeldet") { chatSitzungLoeschen(localStorage); setSitzung(null); setRaumId(null); } }, [stand.phase]);

  const alle = useMemo(
    () => (stand.phase === "bereit" ? chatRaumListe(chatRaeume(), { kinder: nurSpace ? chatSpaceKinder() : [], mitglieder: chatSpaceMitglieder(), telefonRaum: TELEFON_RAUM, suche }) : []),
    [stand.version, stand.phase, suche]);
  // WhatsApp-Kunden als EIN Eintrag; beim Suchen stehen sie wieder einzeln da.
  const liste = useMemo(() => (suche ? alle : chatOrdnerBilden(alle, chatOrdnerKinder(), { id: WHATSAPP_SPACE, name: "WhatsApp Business" })), [alle, suche]);
  const ordnerListe = liste.find((r) => r.ordner)?.raeume || [];
  const ungelesen = useMemo(
    () => (stand.phase === "bereit" ? chatUngelesenGesamt(chatRaumListe(chatRaeume(), { kinder: nurSpace ? chatSpaceKinder() : [], mitglieder: chatSpaceMitglieder(), telefonRaum: TELEFON_RAUM })) : 0),
    [stand.version, stand.phase]);
  useEffect(() => { onUngelesen?.(ungelesen); }, [ungelesen]);
  useEffect(() => { if (stand.phase === "bereit" && !suche && nurSpace) listeMerken(liste); }, [liste]);
  const gemerkt = useMemo(() => (sitzung ? listeLesen() : []), [sitzung]);

  const waehlen = async (r) => {
    if (r.ordner) { setOrdner(true); return; }
    if (r.mitgliedschaft !== "invite") { setRaumId(r.id); return; }
    const beitreten = window.confirm(`Einladung in „${r.name}" annehmen?\n\nAbbrechen lehnt sie ab.`);
    try { if (beitreten) { await chatBeitreten(r.id); setRaumId(r.id); } else await chatVerlassen(r.id); }
    catch (e) { showToast?.(String(e.message || e), "error"); }
  };

  return (
    <div className="chat-huelle" style={{ display: sichtbar ? "flex" : "none" }}>
      <style>{CSS}</style>
      {!sitzung ? <Anmeldung />
        : stand.phase === "fehler" ? (
          <div className="chat-karte">
            <div style={{ fontWeight: 700 }}>Chat nicht erreichbar</div>
            <div style={{ color: "var(--text2)", fontSize: 14 }}>{stand.fehler}</div>
            <button className="btn btn-primary" onClick={() => chatStarten({ ...sitzung })}>Erneut versuchen</button>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              if (!window.confirm("Chat-Speicher auf diesem Gerät zurücksetzen?\n\nDie Anmeldung bleibt, aber das Gerät muss danach neu abgeglichen werden.")) return;
              await chatSpeicherZuruecksetzen(); chatStarten({ ...sitzung });
            }}>Chat-Speicher zurücksetzen</button>
          </div>
        ) : stand.phase !== "bereit" && gemerkt.length ? (
          // Noch nicht verbunden, aber die Liste vom letzten Mal ist da — antippen geht erst gleich.
          <RaumListe liste={gemerkt} suche="" setSuche={() => {}} onWahl={() => showToast?.("Einen Moment — der Chat verbindet noch")} krypto={null} sitzung={sitzung} showToast={showToast} verbindet={stand.schritt || "verbindet"} />
        ) : stand.phase !== "bereit" ? (
          <div className="chat-karte" style={{ alignItems: "center" }}>
            <div className="spinner" />
            <div style={{ color: "var(--text2)", fontSize: 14 }}>Chat wird geladen …</div>
            {/* Der Schritt steht da, damit ein Hänger nicht wie ein Standbild aussieht — und damit man sieht, WO er hängt. */}
            <div style={{ color: "var(--text3)", fontSize: 12 }}>{stand.schritt}</div>
          </div>
        )
        : raumId ? <RaumAnsicht key={raumId} raumId={raumId} sichtbar={sichtbar} version={stand.version} onZurueck={() => setRaumId(null)} showToast={showToast} />
        : ordner && ordnerListe.length ? <RaumListe liste={ordnerListe} titel="WhatsApp Business" onZurueck={() => setOrdner(false)} suche="" setSuche={() => {}} onWahl={waehlen} krypto={null} sitzung={sitzung} showToast={showToast} />
        : <RaumListe liste={liste} suche={suche} setSuche={setSuche} onWahl={waehlen} krypto={stand.krypto} sitzung={sitzung} showToast={showToast} />}
      <AbgleichBogen abgleich={stand.abgleich} />
    </div>
  );
}
