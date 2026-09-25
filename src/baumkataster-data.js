// Baumkataster (Teilprojekt C, 16.09.2026) — Kataloge. Reine Daten, kein
// React, kein Netz. WICHTIG: dieses Modul importiert NICHTS aus gbu-data.js —
// gbu-data.js bezieht seine drei Befund-Listen von HIER (eine Quelle).
//
// Fachliche Grundlage: FLL-Baumkontrollrichtlinie 2020 (Befundbereiche,
// Intervalle), ZTV-Baumpflege 2017 (Maßnahmenkatalog), Vitalität nach Roloff.

export const BK_STORE_LEER = { version: 1, kunde: { id: null, name: "" }, objekte: {}, baeume: {} };
export const BK_INDEX_LEER = { version: 1, kunden: {} };

/** ~60 häufige Arten in Mitteleuropa; Freitext bleibt in der Maske erlaubt. */
export const BK_BAUMARTEN = [
  { lat: "Abies alba", de: "Weißtanne" }, { lat: "Abies nordmanniana", de: "Nordmanntanne" },
  { lat: "Acer campestre", de: "Feldahorn" }, { lat: "Acer platanoides", de: "Spitzahorn" },
  { lat: "Acer pseudoplatanus", de: "Bergahorn" }, { lat: "Aesculus hippocastanum", de: "Rosskastanie" },
  { lat: "Ailanthus altissima", de: "Götterbaum" }, { lat: "Alnus glutinosa", de: "Schwarzerle" },
  { lat: "Betula pendula", de: "Hängebirke" }, { lat: "Carpinus betulus", de: "Hainbuche" },
  { lat: "Castanea sativa", de: "Esskastanie" }, { lat: "Catalpa bignonioides", de: "Trompetenbaum" },
  { lat: "Cedrus atlantica", de: "Atlaszeder" }, { lat: "Chamaecyparis lawsoniana", de: "Scheinzypresse" },
  { lat: "Cornus mas", de: "Kornelkirsche" }, { lat: "Corylus colurna", de: "Baumhasel" },
  { lat: "Crataegus monogyna", de: "Eingriffeliger Weißdorn" }, { lat: "Fagus sylvatica", de: "Rotbuche" },
  { lat: "Fraxinus excelsior", de: "Gemeine Esche" }, { lat: "Ginkgo biloba", de: "Ginkgo" },
  { lat: "Gleditsia triacanthos", de: "Lederhülsenbaum" }, { lat: "Ilex aquifolium", de: "Stechpalme" },
  { lat: "Juglans regia", de: "Walnuss" }, { lat: "Larix decidua", de: "Europäische Lärche" },
  { lat: "Liquidambar styraciflua", de: "Amberbaum" }, { lat: "Liriodendron tulipifera", de: "Tulpenbaum" },
  { lat: "Magnolia × soulangeana", de: "Tulpen-Magnolie" }, { lat: "Malus domestica", de: "Apfel" },
  { lat: "Malus sylvestris", de: "Wildapfel" }, { lat: "Metasequoia glyptostroboides", de: "Urweltmammutbaum" },
  { lat: "Morus alba", de: "Weißer Maulbeerbaum" }, { lat: "Paulownia tomentosa", de: "Blauglockenbaum" },
  { lat: "Picea abies", de: "Gemeine Fichte" }, { lat: "Picea omorika", de: "Serbische Fichte" },
  { lat: "Pinus nigra", de: "Schwarzkiefer" }, { lat: "Pinus sylvestris", de: "Waldkiefer" },
  { lat: "Platanus × hispanica", de: "Platane" }, { lat: "Populus nigra", de: "Schwarzpappel" },
  { lat: "Populus × canadensis", de: "Hybridpappel" }, { lat: "Populus tremula", de: "Zitterpappel" },
  { lat: "Prunus avium", de: "Vogelkirsche" }, { lat: "Prunus domestica", de: "Zwetschge" },
  { lat: "Prunus serrulata", de: "Japanische Zierkirsche" }, { lat: "Pseudotsuga menziesii", de: "Douglasie" },
  { lat: "Pyrus communis", de: "Birne" }, { lat: "Quercus petraea", de: "Traubeneiche" },
  { lat: "Quercus robur", de: "Stieleiche" }, { lat: "Quercus rubra", de: "Roteiche" },
  { lat: "Robinia pseudoacacia", de: "Robinie" }, { lat: "Salix alba", de: "Silberweide" },
  { lat: "Salix babylonica", de: "Trauerweide" }, { lat: "Salix caprea", de: "Salweide" },
  { lat: "Sequoiadendron giganteum", de: "Mammutbaum" }, { lat: "Sorbus aria", de: "Mehlbeere" },
  { lat: "Sorbus aucuparia", de: "Eberesche" }, { lat: "Taxus baccata", de: "Eibe" },
  { lat: "Thuja occidentalis", de: "Abendländischer Lebensbaum" }, { lat: "Tilia cordata", de: "Winterlinde" },
  { lat: "Tilia platyphyllos", de: "Sommerlinde" }, { lat: "Tilia × europaea", de: "Holländische Linde" },
  { lat: "Ulmus glabra", de: "Bergulme" }, { lat: "Ulmus minor", de: "Feldulme" },
];

export const BK_ALTERSPHASEN = ["Jugendphase", "Reifephase", "Alterungsphase"];

/** Vitalität nach Roloff (Kronenstruktur), 0 = vital … 3 = absterbend. */
export const BK_VITALITAET = [
  { stufe: 0, text: "vital (Roloff 0 — Exploration)" },
  { stufe: 1, text: "leicht geschwächt (Roloff 1 — Degeneration)" },
  { stufe: 2, text: "deutlich geschwächt (Roloff 2 — Stagnation)" },
  { stufe: 3, text: "absterbend (Roloff 3 — Resignation)" },
];

export const BK_VERKEHRSSICHER = [
  { id: "ja", label: "verkehrssicher" },
  { id: "eingeschraenkt", label: "eingeschränkt — Maßnahme nötig" },
  { id: "nein", label: "nicht verkehrssicher" },
];

export const BK_KONTROLLARTEN = ["Regelkontrolle", "Zusatzkontrolle", "eingehende Untersuchung"];

// Befund je Bereich (FLL-Baumkontrollrichtlinie). umfeld/stamm/krone sind
// WÖRTLICH die Listen des SVLFG-GBU-Formulars (bis 16.09.2026 in gbu-data.js)
// — gbu-data.js exportiert sie von hier weiter; test/baumkataster/daten.test.js
// vergleicht gegen den alten Stand. Neue Bereiche: wurzel, stammfuss.
export const BK_BEFUND = {
  umfeld: [
    "Bodenrisse", "Absturzkanten", "Nachbarbäume", "Gewässer", "Wurzelverletzung",
    "Gebäude", "Pilzfruchtkörper", "Fallbereich frei",
  ],
  wurzel: [
    "Wurzelanläufe geschädigt", "Wurzelverletzung/Abgrabung", "Pilzfruchtkörper an Wurzeln",
    "Bodenverdichtung/Versiegelung", "Wurzelfäule", "Wurzelanhebung/Bodenrisse",
    "Wurzelfreilegung", "Fehlende Wurzelanläufe",
  ],
  stammfuss: [
    "Höhlung am Stammfuß", "Pilzfruchtkörper am Stammfuß", "Rindenschäden am Stammfuß",
    "Faulstellen am Stammfuß", "Anfahrschäden", "Einwachsungen/Fremdkörper",
    "Stammfußverdickung", "Bodenanschüttung",
  ],
  stamm: [
    "Defektsymptome (Risse/Wülste/Beulen/Rippen)", "Baumchirurgische Maßnahmen",
    "Eingehende Kontrolle (Diagnosegerät)", "Pilzfruchtkörper", "Wunden",
    "Eingehende Kontrolle (Stechschnitt)", "Faulstellen", "Abgestorbene Rinde",
  ],
  krone: [
    "Vitalität", "Totholz", "Defektsymptome", "Zwieselbildung", "Ausbrüche",
    "Sturmschäden", "Insektennester", "alte Kronensicherung", "Kappung", "Faulstellen",
    "Pilzfruchtkörper", "Gefährliche Äste", "Abgebrochene Krone",
  ],
};
export const BK_BEFUND_LABEL = { umfeld: "Umfeld", wurzel: "Wurzel", stammfuss: "Stammfuß", stamm: "Stamm", krone: "Krone" };

/** ZTV-Baumpflege-Katalog. „Sonstige Maßnahme" verlangt eine Bemerkung. */
export const BK_MASSNAHMEN = [
  "Totholzentfernung", "Kronenpflege", "Kroneneinkürzung", "Kronensicherung",
  "Kronensicherungsschnitt", "Fällung", "eingehende Untersuchung",
  "Wurzelbereich freistellen", "Lichtraumprofil herstellen", "Baumumfeld verbessern",
  "Kontrollintervall verkürzen", "Sonstige Maßnahme",
];

/** Standardfristen ab Kontrolldatum. */
export const BK_DRINGLICHKEIT = [
  { id: "sofort", label: "sofort", tage: 0 },
  { id: "kurzfristig", label: "kurzfristig (4 Wochen)", tage: 28 },
  { id: "mittelfristig", label: "mittelfristig (6 Monate)", monate: 6 },
  { id: "langfristig", label: "langfristig (12 Monate)", monate: 12 },
];

/** Regelkontroll-Intervall in Monaten je Altersphase und Schadstufe (FLL Tab. 1). */
export const BK_INTERVALL = {
  Jugendphase: { gesund: 36, geschwaecht: 24, geschaedigt: 12 },
  Reifephase: { gesund: 24, geschwaecht: 18, geschaedigt: 12 },
  Alterungsphase: { gesund: 12, geschwaecht: 12, geschaedigt: 12 },
};

export const BK_STATUS = ["aktiv", "gefaellt", "entfernt"];
export const BK_SCHUTZ = ["keiner", "Naturdenkmal", "Baumschutzsatzung", "Landschaftsschutz"];
export const BK_VORWARNUNG_TAGE = 60;
export const BK_FARBEN = { gruen: "#2f9e44", gelb: "#f59f00", rot: "#c92a2a", grau: "#868e96" };

// Wortwahl des SKT-Formulars (Teilprojekt B): Gesundheitszustand und
// Bruch-/Standsicherheit als Text, abgeleitet aus Vitalität/Verkehrssicherheit.
export const BK_GBU_GESUNDHEIT = { 0: "vital", 1: "leicht eingeschränkt", 2: "deutlich eingeschränkt", 3: "absterbend" };
export const BK_GBU_STANDSICHERHEIT = { ja: "gegeben", eingeschraenkt: "eingeschränkt", nein: "eingehende Untersuchung erforderlich" };
