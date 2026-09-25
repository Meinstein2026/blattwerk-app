// Probeseite für den nativen Chat — siehe scripts/chat-smoke.html. Mountet nur
// ChatBereich mit dem echten App-Stylesheet (aus dolibarr-app.jsx gelesen) und
// erledigt den Rückweg der Anmeldung selbst, weil die App-Hülle hier fehlt.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import quelle from "../dolibarr-app.jsx?raw";
import ChatBereich from "../src/ui/ChatPage.jsx";
import { CHAT_HOMESERVER, chatLoginTokenAusUrl, chatMitTokenAnmelden, chatSitzungMerken } from "../src/chat/sitzung.js";

const a = quelle.indexOf("const css = `") + 13;
const css = quelle.slice(a, quelle.indexOf("`;", a));

// Rückweg: die Probeseite liegt nicht auf "/", also zeigt die Rücksprungadresse
// der App (origin + "/?chat-anmeldung=1") ins Leere — hier fangen wir sie ab,
// indem vite "/" auf diese Seite nicht umleitet: Token von Hand übernehmen.
const token = chatLoginTokenAusUrl(window.location.href);

function Probe() {
  const [meldung, setMeldung] = useState("");
  const [ungelesen, setUngelesen] = useState(0);
  const [bereit, setBereit] = useState(!token);
  if (token && !bereit) {
    window.history.replaceState(null, "", window.location.pathname);
    chatMitTokenAnmelden(CHAT_HOMESERVER, token, (u, o) => fetch(u, o))
      .then((s) => { chatSitzungMerken(localStorage, s); setBereit(true); }, (e) => { setMeldung(String(e.message || e)); setBereit(true); });
  }
  return (
    <div className="app theme-dark">
      <style>{css}</style>
      {bereit && <ChatBereich sichtbar nurSpace={!new URLSearchParams(window.location.search).has("alle")} showToast={(t) => { setMeldung(t); setTimeout(() => setMeldung(""), 4000); }} onUngelesen={setUngelesen} />}
      {meldung && <div className="toast">{meldung}</div>}
      <nav className="bottom-nav"><div className="nav-item active" style={{ padding: 18 }}>Probeseite · ungelesen: {ungelesen}</div></nav>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Probe />);
