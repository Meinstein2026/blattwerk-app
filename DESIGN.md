# DESIGN.md — Oberfläche der Blattwerk-App

Verbindlich für jede neue oder geänderte Oberfläche. Ergänzt `../docs/corporate-design.md`
(Logo, Icons, Signaturblatt) um das, was dort fehlt: Farben, Schrift und Bauteile **in der App**.
Stand 20.09.2026, Entscheidungen Inhaber: Aufbau bleibt, Farbgebung neu („kein Neon"), Schrift Barlow,
vier wählbare Darstellungen, Standard „Hell".

Einsatz: draußen am Handy, Sonne, Handschuhe → Kontrast **WCAG AA** (Text ≥ 4,5:1, Icons/Flächen ≥ 3:1),
Tippflächen **≥ 48 px**, Schrift nie unter 12 px, Fließtext ≥ 14 px.

## 1. Grundsatz

* **Keine Farbe im JSX, keine Farbe im CSS außerhalb der Token-Blöcke.** Erlaubt ist nur `var(--…)`.
  Ausnahmen: Unterschriften-/Scan-Canvas (`#fff` — Papier ist weiß, in jeder Darstellung), PDF-Module
  (`src/*-pdf.js`), Leaflet-Marker-Umriss.
* Jede Farbe gibt es viermal (je Darstellung). Wer eine neue braucht, legt ein Token in **allen vier**
  Blöcken an und rechnet den Kontrast nach.
* Flächig: **keine Verläufe, kein Glow, keine farbigen Schatten.** Ein Schatten (`--shadow`) nur für
  Schwebendes (Modal, Menü, Toast, Update-Banner) — nie für Karten, Kacheln, Knöpfe.

## 2. Darstellungen

`localStorage.dolibarr_theme` → Klasse `theme-<wert>` auf `.app`. Standard ohne gespeicherten Wert: `light`.

| Wert | Name in den Einstellungen | Charakter |
|---|---|---|
| `light` | Hell (Waldgrün) | grüngrauer Grund, Kopf und Hauptknopf CD-Waldgrün — beste Wahl in der Sonne |
| `beige` | Beige (Holz) | warmer Beige-Braun-Grund, Schrift dunkelbraun, Waldgrün bleibt Kopf/Hauptknopf |
| `dark` | Dunkelgrün | dunkel, aus `#123527` abgeleitet; Blattgrün `#8ACF4E` ist der Akzent |
| `anthrazit` | Anthrazit | neutral-dunkel ohne Blaustich, gedecktes Grün |

## 3. Farb-Tokens

| Token | Zweck | light | beige | dark | anthrazit |
|---|---|---|---|---|---|
| `--bg` | Seitengrund | `#eef0ea` | `#efe7da` | `#0b1d15` | `#151715` |
| `--surface` | Karte, Kachel, Leisten | `#ffffff` | `#fbf7f0` | `#12291e` | `#1e211e` |
| `--surface2` | Sekundärknopf, Chip, gedrückt | `#e3e7de` | `#e4d9c6` | `#1a3627` | `#282c28` |
| `--field` | Eingabefeld | `#f6f8f3` | `#fffdf8` | `#0f241a` | `#191c19` |
| `--border` | Ränder, Trennlinien | `#c3cabd` | `#cbbba0` | `#2f4b3b` | `#3a3f3a` |
| `--text` | Text | `#14211a` | `#2a2118` | `#f2f5ee` | `#eceeea` |
| `--text2` | Nebentext | `#3f4d44` | `#57493a` | `#b3c2b6` | `#a7ada6` |
| `--text3` | Beschriftung, inaktiv | `#5d6a61` | `#6b5b47` | `#8a9c8e` | `#8b918a` |
| `--accent` | Akzent **als Text/Icon/Rand** (aktiver Reiter, Link, Fokus) | `#276b2c` | `#276b2c` | `#8acf4e` | `#5cb860` |
| `--primary` / `--on-primary` | Akzent **als Fläche** (Hauptknopf, aktiver Chip, Zähler) | `#123527` / `#fff` | `#123527` / `#fff` | `#8acf4e` / `#0b1d15` | `#2e7d32` / `#fff` |
| `--accent-soft` / `--on-accent-soft` | getönte Fläche (Badge „offen", Hinweis) | `#dbe8d3` / `#123527` | `#dbe3cc` / `#123527` | `#1f4a2f` / `#c9eeaa` | `#23402a` / `#b5e0b8` |
| `--accent2` / `--on-accent2` | „erledigt/bezahlt/positiv" (früher Neon-Mint) | `#2e6b34` / `#fff` | `#2e6b34` / `#fff` | `#8fcb83` / `#0b1d15` | `#8fcb83` / `#151715` |
| `--danger` | Gefahr als Text/Rand | `#a3231a` | `#a3231a` | `#ee938c` | `#f08a80` |
| `--danger-bg` / `--on-danger` | Gefahr als Fläche (Löschen) | `#a3231a` / `#fff` | `#a3231a` / `#fff` | `#a8402f` / `#fff` | `#a8402f` / `#fff` |
| `--danger-soft` | getönt | `#f3d9d6` | `#f3d9d6` | `#3e1f1d` | `#3e1f1d` |
| `--warn` | Warnung als Text/Rand | `#6e4700` | `#6e4700` | `#e2b657` | `#e2b657` |
| `--warn-soft` / `--warn-border` | getönte Warnfläche (Hinweis, „Per Mail senden") | `#f2e6c8` / `#dcc78f` | `#f2e6c8` / `#d6bf85` | `#3a2f12` / `#5a4a1e` | `#3a2f12` / `#5a4a1e` |
| `--info` / `--info-soft` | neutrale Auszeichnung (blau) | `#36507a` / `#dae2f0` | wie light | `#9db6e0` / `#1e2a40` | wie dark |
| `--topbar` / `--on-topbar` | Kopfleiste | `#123527` / `#fff` | `#123527` / `#fff` | `#123527` / `#fff` | `#1e211e` / `#eceeea` |
| `--overlay` | Schleier hinter Modal | `rgba(20,33,26,.45)` | `rgba(42,33,24,.45)` | `rgba(0,0,0,.7)` | `rgba(0,0,0,.7)` |
| `--shadow` | nur Schwebendes | `0 6px 18px rgba(20,33,26,.12)` | `0 6px 18px rgba(42,33,24,.14)` | `0 6px 18px rgba(0,0,0,.4)` | wie dark |

**Abweichung vom CD:** `corporate-design.md` nennt `#2E7D32` als hellen Akzent. Als *Text* auf den getönten
Gründen fällt er unter 4,5:1 (4,2 auf Beige, 4,1 auf `--surface2`) → Text-Akzent ist `#276b2c`. Als Fläche
trägt das CD-Waldgrün `#123527` (Weiß darauf 13,4:1).

### Kachelfarben (Schnellzugriff, „Geschäft", Menü-Icons)

Kacheln bleiben verschiedenfarbig (Wiedererkennen per Farbe, Wunsch Inhaber) — aber gedeckt, aus einer Familie.
Immer als Paar: Icon `--k-<name>`, Fläche `--k-<name>-bg`. Alle Paare ≥ 4,8:1.

| Name | hell (light, beige) Icon / Fläche | dunkel (dark, anthrazit) Icon / Fläche |
|---|---|---|
| `moos` | `#2e6b34` / `#ddebd9` | `#8fcb83` / `#203a22` |
| `petrol` | `#1f5f66` / `#d6e8ea` | `#7cc3c9` / `#173538` |
| `schiefer` | `#36507a` / `#dae2f0` | `#9db6e0` / `#1e2a40` |
| `erde` | `#6a4b2e` / `#eadfd2` | `#cdb091` / `#33281c` |
| `ocker` | `#8a5a00` / `#f2e6c8` | `#e2b657` / `#3a2f12` |
| `pflaume` | `#6b3a6e` / `#ebddec` | `#cfa0d3` / `#33213a` |
| `rost` | `#9a4a1c` / `#f3dfd2` | `#e89b6c` / `#3d2618` |
| `ziegel` | `#9c2f2a` / `#f3d9d6` | `#ee938c` / `#3e1f1d` |

Feste Zuordnung: Angebot = moos · Bestellung = petrol · Zeiterfassung = schiefer · Fahrtenbuch = erde ·
Arbeitsschutz = ocker · Betriebsmittel = pflaume · Lieferantenrechnung = rost · Spesen = ziegel.
Dieselbe Sache hat überall dieselbe Farbe.

## 4. Schrift

* **Barlow** (OFL), lokal unter `public/fonts/` (400, 500, 600, 700; latin + latin-ext), eingebunden über
  `public/fonts/schriften.css`, im Vorab-Cache → offline. **Kein Font-CDN.**
* Eine Familie für alles. Beträge, Nummern, Uhrzeiten: Barlow mit `font-variant-numeric: tabular-nums`
  — **keine Monospace-Schrift** mehr (DM Mono entfällt).
* Skala (px): 12 Beschriftung · 14 Nebentext · 16 Fließtext/Eingabe (nie kleiner: iOS zoomt sonst) ·
  18 · 22 Seitentitel · 28–36 Betrag. Gewichte: 400 Text, 600 Knöpfe/Beschriftung, 700 Titel/Beträge.
* Versalien nur für kurze Status-Badges und Bereichs-Beschriftungen, nie für Knöpfe oder Sätze.
* Betrag groß = `--text`, nicht farbig. Farbe trägt Status, nicht Zahlen.

## 5. Abstände und Radien (unverändert, nur festgeschrieben)

* Raster 4 px: 4 · 8 · 12 · 16 · 24. Seitenrand 16, Kartenpolster 16, Lücke im Kachelraster 10.
* Radien: `--radius` 16 (Karte, Kachel, Modal) · `--radius-sm` 10 (Knopf, Feld, Icon-Fläche) · 999 (Pille, Zähler).
  Keine weiteren Werte erfinden.

## 6. Bauteile

* **Knöpfe** (`.btn`): Höhe ≥ 48 px. Je Ansicht **ein** `btn-primary` (`--primary`). Alles andere `btn-secondary`.
  `btn-danger` gefüllt (`--danger-bg`) nur für Unwiderrufliches. `btn-warn` = getönt (`--warn-soft`) für
  „geht nach außen" (Mail). In einem zweispaltigen Knopfraster geht ein **einzelner letzter Knopf über die
  volle Breite** — nie halb und linksbündig.
* **Karten/Kacheln**: `--surface` + 1–1,5 px `--border`, kein Schatten.
* **Listen** (`.list-item`): links Icon-Fläche in der Kachelfarbe der Sache, rechts Betrag (`--text`) + Badge.
* **Badges**: Entwurf = `--surface2`/`--text2` · offen = `--accent-soft` · bezahlt/angenommen/fakturiert =
  `--accent-soft` mit `--accent2`-Text · storniert/abgelehnt = `--danger-soft`/`--danger`.
* **Formulare**: Feld `--field`, Rand 1,5 px `--border`, Fokus `--accent`. Beschriftung 12 px/600 `--text2`.
* **Kopfleiste** `--topbar`, Logo `logo.png` unverändert. **Fußleiste** `--surface`, aktiv `--accent`.
* **Status-Punkt** (verbunden/offline): einfarbig `--accent2`/`--danger`, ohne Leuchten.
* **Blatt** aus dem CD nur im Leerzustand (CD § 5), nicht als Deko.

## 7. Icons

* Ein Satz: gefüllte Material-Icons als Pfad im `Icon`-Bauteil (`dolibarr-app.jsx`). Neue Icons dort eintragen.
* **Jede Kachel ein eigenes Icon** — nie zweimal dasselbe Symbol auf einem Schirm
  (Angebot = Blatt mit Plus, Bestellung = Einkaufswagen, Betriebsmittel = Schraubenschlüssel, Spesen = Kassenbon,
  Fahrtenbuch = Auto, Zeiterfassung = Uhr).
* **Keine Emoji** als Icon oder Schmuck (👋 📎 ⏱ …). Status sagt ein Icon aus dem Satz oder ein Badge.

## 8. Verbotsliste (das machte den „KI-Look")

1. Blau-Schwarz (`#0f1117`, `#1a1d27`) und Tailwind-Slate (`#f1f5f9`, `#cbd5e1`, `#0f172a`) — Neutrale kommen aus Grün bzw. Braun.
2. Neon: Mint `#38d9a9`, `#20c997`, Lila `#7950f2`/`#cc5de8`, Orange `#ff922b`, Lachs `#ff6b6b`, Gelb `#ffd43b`.
3. Verläufe (`linear-gradient`) auf Logo, Avatar, Fortschritt, Kacheln.
4. Glow: `box-shadow: 0 0 6px <farbe>`, farbige Schatten unter Knöpfen, Schatten unter jeder Karte.
5. Farbige Beträge in Monospace.
6. Hex-Farben mit Alpha-Anhang als Tönung (`#43a04722`) — dafür gibt es `-soft`/`-bg`-Tokens.
7. Knopf-Mosaik: mehrere gleich laute, verschiedenfarbig gefüllte Knöpfe nebeneinander.
8. Emoji als Icons; dasselbe Icon für zwei verschiedene Dinge.
9. `!important`-Overrides je Darstellung — Unterschiede laufen über Tokens.
10. `transition: all`.
