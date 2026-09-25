import { useState, useEffect } from "react";

// ─── Uhrzeit-Eingabe ohne <input type="time"> ──────────────────────────────
// Firefox rendert `type="time"` als natives Spinner-Widget und meldet dem
// Wayland-Textprotokoll kein Textfeld — auf dem Durabook-Tablet (GNOME-OSK,
// keine Tastatur am Geraet) bleibt die Bildschirmtastatur deshalb zu und die
// Uhrzeit ist schlicht nicht eingebbar (16.08.2026). Die Firefox-Prefs
// `dom.forms.datetime*` gibt es in der ausgelieferten Fassung nicht mehr, der
// Umweg musste also in die App. Ein Textfeld mit `inputmode="numeric"` holt
// die Zifferntastatur zuverlaessig hoch — auf Android genauso wie unter GNOME.
//
// Vertrag nach aussen bleibt der von `type="time"`: `value` und der an
// `onChange` gereichte `e.target.value` sind immer "" oder "HH:MM". Halbe
// Eingaben ("8", "08:3") leben nur im lokalen Anzeige-Zustand, sonst landeten
// sie in der Dauer-Berechnung und in den Dolibarr-Nutzdaten.

const ziffern = (s) => String(s ?? "").replace(/\D/g, "");
const istZeit = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s ?? ""));

/** Formt die Roheingabe zu "H:MM"/"HH:MM" um und sagt, ob daraus schon ein
 *  gueltiger Wert faellt. `wert` ist "" solange die Eingabe unfertig ist. */
export function zeitMaske(roh) {
  const s = String(roh ?? "");
  if (s.trim() === "") return { anzeige: "", wert: "" };
  let anzeige;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    anzeige = `${ziffern(h).slice(0, 2)}:${ziffern(m).slice(0, 2)}`;
  } else {
    const d = ziffern(s).slice(0, 4);
    anzeige = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  }
  return { anzeige, wert: istZeit(anzeige) ? anzeige : "" };
}

/** Rundet die Eingabe beim Verlassen des Feldes auf "HH:MM" auf — "8" wird
 *  08:00, "830" wird 08:30, Unsinn wird "". */
export function zeitNormalisieren(roh) {
  const s = String(roh ?? "").trim();
  if (s === "") return "";
  const ausTeilen = (h, m) => {
    if (h === "") return "";
    const fertig = `${String(Number(h)).padStart(2, "0")}:${String(Number(m === "" ? 0 : m)).padStart(2, "0")}`;
    return istZeit(fertig) ? fertig : "";
  };
  const d = ziffern(s);
  if (s.includes(":")) {
    const [a, b] = s.split(":");
    const nachTeilung = ausTeilen(ziffern(a), ziffern(b));
    if (nachTeilung) return nachTeilung;
    // Die Maske setzt den Doppelpunkt stur nach zwei Ziffern — wer "830" fuer
    // halb neun tippt, sieht "83:0" und bekaeme sonst beim Verlassen ein leeres
    // Feld. Steht der Doppelpunkt erkennbar falsch, zaehlt die Ziffernfolge.
  }
  if (d.length <= 2) return ausTeilen(d, "");
  return ausTeilen(d.slice(0, d.length - 2), d.slice(-2));
}

export default function TimeField({ value, onChange, ...rest }) {
  const [anzeige, setAnzeige] = useState(value || "");

  // Setzt der Aufrufer den Wert selbst (Zuruecksetzen des Formulars, geladene
  // Buchung), muss die Anzeige mitziehen — aber nicht waehrend getippt wird,
  // sonst springt der Cursor bei jeder halben Eingabe zurueck.
  useEffect(() => {
    const v = value || "";
    setAnzeige((alt) => (zeitMaske(alt).wert === v ? alt : v));
  }, [value]);

  const melden = (v) => onChange && onChange({ target: { value: v } });

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      value={anzeige}
      onChange={(e) => {
        const { anzeige: a, wert } = zeitMaske(e.target.value);
        setAnzeige(a);
        if (wert !== (value || "")) melden(wert);
      }}
      onBlur={() => {
        const fertig = zeitNormalisieren(anzeige);
        setAnzeige(fertig);
        if (fertig !== (value || "")) melden(fertig);
      }}
      {...rest}
    />
  );
}
