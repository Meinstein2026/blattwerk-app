// SKR03-Buchungskonto-Vorschläge je Firma (Task 8, Mandantenfähigkeit).
//
// KONTO_MASTER ist die wörtliche Fortsetzung des bisherigen, produktions-
// bewährten DEFAULT_KONTO_REGELN aus dolibarr-app.jsx (Stand Commit 70acee1):
// dieselben Konten, dieselben Stichwörter, dieselbe Reihenfolge — Regeln, die
// ausschließlich für Baumpflege/GaLaBau gelten (Sägeketten, Kletterausrüstung,
// Pflanzgut, Dünger, Grüngut-Entsorgung, Maschinen-Betriebsstoffe …), tragen
// zusätzlich `gewerk: "baumpflege"`; gewerksneutrale Regeln (Bürobedarf,
// Kraftstoff, Bankgebühren, Versicherungen, Fuhrpark, Steuerberater …) bleiben
// ungetaggt. EINZELNE Konten mit gemischten Stichwörtern (z. B. 3100
// Fremdleistung+Entsorgung, 4985 PSA/Werkzeug+Kletterausrüstung, 3400
// Baumaterial+Substrat/Dünger, 4800 Reparatur allgemein+Motorsägenservice,
// 4945 Fortbildung allgemein+SKT, 4138 Berufsgenossenschaft+SVLFG, 1800
// privat+LKK) wurden dafür in ZWEI direkt benachbarte Einträge mit demselben
// Konto aufgeteilt — nie umsortiert, nie zusammengelegt, kein Stichwort
// verloren (siehe Vergleichsskript im Task-8-Report).
//
// WICHTIG: regelnFuer(profil) filtert dieses EINE geordnete Array, statt
// KONTO_PROFIL und KONTO_GRUND zu konkatenieren. Nur so bleibt die
// Reihenfolge exakt wie im Original — Reihenfolge ist hier Fachlogik: 4969
// (eigener Betriebsabfall, „altreifen") muss vor dem baumpflege-Teil von 3100
// (auftragsbezogene Entsorgung, „entsorg") stehen, sonst würde
// „Altreifenentsorgung" fälschlich auf 3100 statt 4969 laufen (siehe
// dolibarr-app.jsx-Kommentar bei DEFAULT_KONTO_REGELN und
// test/mandant/konto.test.js). Ein simples
// „[...KONTO_PROFIL[profil], ...KONTO_GRUND]" würde genau das brechen, weil
// dann sämtliche baumpflege-Regeln vor ALLEN Grundregeln stünden.

const KONTO_MASTER = [
  { account: "3000", keywords: ["sonderkraftstoff", "alkylat", "aspen", "gerätebenzin", "geraetebenzin", "2-takt", "2takt", "zweitakt", "2t-gemisch", "mischöl", "mischoel", "sägekettenöl", "saegekettenoel", "sägekettenhaftöl", "kettenöl", "kettenoel", "haftöl", "haftoel", "bio-kettenöl", "motoröl", "motoroel", "hydrauliköl", "hydraulikoel", "getriebeöl", "getriebeoel", "schmieröl", "schmieroel", "schmierfett", "mehrzweckfett", "schmierstoff"], gewerk: "baumpflege" },
  { account: "4969", keywords: ["abfallgebühr", "abfallgebuehr", "müllgeb", "muellgeb", "restmüll", "restmuell", "altreifen"] },
  { account: "3100", keywords: ["subunternehm", "nachunternehm", "fremdleistung", "fremdfirma", "leihpersonal", "freistellungsbescheinigung", "13b ustg", "steuerschuldnerschaft", "bauschutt", "altholz"] },
  { account: "3100", keywords: ["kranarbeit", "autokran", "mietkran", "seilkletterer", "wurzelfräs", "wurzelfraes", "stubbenfräs", "stubbenfraes", "baggerarbeit", "entsorg", "grünschnitt", "gruenschnitt", "grüngut", "gruengut", "grünabfall", "gruenabfall", "häckselgut", "haeckselgut", "astgut", "deponie", "recyclinghof", "wertstoffhof", "kompostwerk", "containerdienst", "abrollcontainer", "absetzcontainer", "muldendienst", "entsorgungsnachweis", "wiegeschein", "annahmegebühr", "annahmegebuehr", "stubbenentsorgung"], gewerk: "baumpflege" },
  { account: "4530", keywords: ["e10", "e5 ", "super 95", "superbenzin", "benzin", "diesel", "kraftstoff", "tanken", "adblue", "tankstelle", "tankbeleg", "tankquittung", "sprit", "aral", "shell", "agip", "avia", "totalenergies", "jet tankstelle", "scheibenfrostschutz", "kühlerfrostschutz", "kuehlerfrostschutz"] },
  { account: "4580", keywords: ["hauptuntersuchung", "abgasunters", "tüv", "tuev", "dekra", "gtü", "gtue", "küs", "kues", "zulassungsstelle", "kfz-zulassung", "kennzeichen", "nummernschild", "feinstaubplakette", "parkgebühr", "parkgebuehr", "parkschein", "waschanlage", "autowäsche", "autowaesche", "maut", "vignette"] },
  { account: "4540", keywords: ["kfz-werkstatt", "kfz-reparatur", "autohaus", "inspektion", "ölwechsel", "oelwechsel", "bremsbeläge", "bremsbelaege", "bremsscheiben", "zahnriemen", "auspuff", "stoßdämpfer", "stossdaempfer", "lichtmaschine", "kupplungssatz", "reifen", "reifenwechsel", "radwechsel", "radlager", "achsvermessung"] },
  { account: "4510", keywords: ["kraftfahrzeugsteuer", "kfz-steuer", "hauptzollamt"] },
  { account: "4520", keywords: ["kfz-versicherung", "kfz-haftpflicht", "kraftfahrtversicherung", "teilkasko", "vollkasko", "kfz-police", "schutzbrief"] },
  { account: "4138", keywords: ["berufsgenossenschaft", "gesetzliche unfallversicherung", "bg-beitrag"] },
  { account: "4138", keywords: ["svlfg"], gewerk: "baumpflege" },
  { account: "4360", keywords: ["betriebshaftpflicht", "inhaltsversicherung", "maschinenbruch", "elektronikversicherung", "betriebsunterbrechung", "geschäftsversicherung", "geschaeftsversicherung", "rechtsschutzversicherung", "versicherungsteuer", "haftpflichtversicherung"] },
  { account: "1800", keywords: ["private krankenversicherung", "privatentnahme", "einkommensteuer-voraus", "kirchensteuer"] },
  { account: "1800", keywords: ["landwirtschaftliche krankenkasse", "alterskasse", "lkk-beitrag"], gewerk: "baumpflege" },
  { account: "4800", keywords: ["maschinenreparatur", "gerätereparatur", "geraetereparatur", "maschinenwartung", "maschinenservice", "instandsetzung", "reparatur", "ersatzteil", "instandhalt", "wartung", "luftfilter", "kraftstofffilter", "anlasser", "membran", "keilriemen", "antriebsriemen"] },
  { account: "4800", keywords: ["vergaser", "zündkerze", "zuendkerze", "kupplungstrommel", "anwerfvorrichtung", "starterseil", "motorsägenservice", "motorsaegenservice"], gewerk: "baumpflege" },
  { account: "4960", keywords: ["mietgerät", "mietgeraet", "leihgerät", "leihgeraet", "geräteverleih", "geraeteverleih", "maschinenverleih", "baumaschinenverm", "mietpark", "leihgebühr", "leihgebuehr", "mietgebühr", "mietgebuehr", "gerätemiete", "geraetemiete", "maschinenmiete", "hubsteiger", "arbeitsbühne", "arbeitsbuehne", "hebebühne", "hebebuehne", "minibagger", "radlader", "rüttelplatte", "ruettelplatte", "vibrationsplatte", "stampfer", "hkl baumaschinen", "zeppelin rental", "boels"] },
  { account: "4210", keywords: ["hallenmiete", "lagermiete", "stellplatzmiete", "gewerbemiete", "pachtzins", "nebenkostenabrechnung"] },
  { account: "4985", keywords: ["schutzhelm", "gehörschutz", "gehoerschutz", "schutzbrille", "arbeitshandschuh", "handschuh", "sicherheitsschuh", "warnweste", "warnkleidung", "psa", "arbeitshose", "regenjacke", "regenhose", "knieschoner", "spaten", "schaufel", "hacke", "rechen", "harke", "grabegabel", "forke", "sense", "sichel", "gartenschere", "gartenmesser", "hippe", "handsäge", "handsaege", "bügelsäge", "buegelsaege", "klappsäge", "klappsaege", "spaltbeil", " axt", "spalthammer", "hammer", "kneifzange", "zange", "bolzenschneider", "bohrmaschine", "akkuschrauber", "winkelschleifer", "trennschleifer", "bohrer", "feile", "wetzstahl", "gießkanne", "giesskanne", "schubkarre", "sackkarre", "trittleiter", "bockleiter", "teleskopleiter", "stehleiter", "anlegeleiter", "schiebeleiter", "klappleiter", "gelenkleiter", "mehrzweckleiter", "vielzweckleiter", "sprossenleiter", "stufenleiter", "podestleiter", "plattformleiter", "obstbaumleiter", "aluleiter", "alu-leiter", "holzleiter", "glasfaserleiter", "leitern", " leiter", "wasserwaage", "zollstock", "gliedermaßstab", "gliedermassstab", "maßband", "massband", "schraubendreher", "schraubenzieher", "ratsche", "steckschlüssel", "steckschluessel", "maulschlüssel", "maulschluessel", "seitenschneider", "wasserpumpenzange", "brechstange", "fäustel", "faeustel", "meißel", "meissel", "richtscheit", "maurerkelle", "glättkelle", "glaettkelle", "trennscheibe", "schleifscheibe", "diamantscheibe", "stichsäge", "stichsaege", "kreissäge", "kreissaege", "schlagbohr", "kehrbesen", "reisigbesen", "straßenbesen", "strassenbesen", "akku", "ladegerät", "ladegeraet", "erste-hilfe", "verbandskasten"] },
  { account: "4985", keywords: ["schnittschutz", "schnittschutzhose", "schnittschutzstiefel", "forsthelm", "kletterhelm", "visier", "gesichtsschutz", "klettergurt", "baumklettergurt", "kernmantelseil", "kletterseil", "karabiner", "seilrolle", "umlenkrolle", "prusik", "wurfbeutel", "wurfsack", "steigeisen", "baumsteiger", "sägekette", "saegekette", "führungsschiene", "fuehrungsschiene", "sägeschwert", "saegeschwert", "kettenrad", "rundfeile", "feilenset", "mähfaden", "maehfaden", "trimmerfaden", "schneidfaden", "sägeblatt", "saegeblatt", "astschere", "heckenschere", "rosenschere", "baumschere", "astsäge", "astsaege", "motorsäge", "motorsaege", "kettensäge", "kettensaege", "freischneider", "motorsense", "rasentrimmer", "laubbläser", "laubblaeser", "laubsauger", "hochentaster", "entaster", "rasenmäher", "rasenmaeher", "vertikutierer", "häcksler", "haecksler", "fällkeil", "faellkeil", "fällheber", "faellheber", "sappie", "wendehaken", "unkrautstecher", "fugenkratzer", "grasschere", "rasenkantenschneider", "pflanzkelle", "pflanzholz"], gewerk: "baumpflege" },
  { account: "4980", keywords: ["reinigungsmittel", "putzmittel", "handreiniger", "markierspray", "absperrband", "flatterband", "pylone", "leitkegel", "warnschild", "betriebsbedarf"] },
  { account: "3300", keywords: ["baumschule", "containerpflanze", "topfpflanze", "ballenware", "solitärgehölz", "solitaergehoelz", "heckenpflanze", "jungpflanze", "staude", "strauch", "sträucher", "straeucher", "gehölz", "gehoelz", "obstbaum", "hochstamm", "koniferen", "thuja", " eibe", "buchsbaum", "rosenstock", "beetrose", "ziergras", "bodendecker", "pflanzware", "blumenzwiebel", "rollrasen", "rasensode", "fertigrasen", "pflanze"], gewerk: "baumpflege" },
  { account: "3400", keywords: ["pflasterstein", "pflaster", "randstein", "kantenstein", "palisade", "mauerstein", "naturstein", "gehwegplatte", "terrassenplatte", "betonstein", "beton", "zement", "mörtel", "moertel", "estrich", "trasszement", "fugensand", "kies", "schotter", "splitt", "frostschutz", "quarzsand", "spielsand", "streugut", "streusalz", "auftausalz", "bauholz", "kantholz", "pfosten", "zaunpfahl", "pfahl", "zaun", "staketenzaun", "doppelstabmatte", "rankgitter", "latte", "bohle", "terrassendiele", "wpc", "holzschutz", "lasur", "imprägnier", "impraegnier", "drainage", "dränrohr", "draenrohr", "kg-rohr", "fitting", "schlauchverbinder", "schraube", "beilagscheibe", "unterlegscheibe", "mutter m", " nagel", "dübel", "duebel", "spanndraht", "bindedraht", "kabelbinder", "draht", "jute"] },
  { account: "3400", keywords: ["rindenmulch", "mulch", "rindenhumus", "humus", "substrat", "pflanzerde", "blumenerde", "gartenerde", "mutterboden", "komposterde", "kompost", "torf", "kokoserde", "dünger", "duenger", "düngemittel", "duengemittel", "volldünger", "rasendünger", "hornspäne", "hornspaene", "hornmehl", "gartenkalk", "kalk", "pflanzenschutz", "unkrautvernichter", "herbizid", "fungizid", "insektizid", "schneckenkorn", "saatgut", "rasensamen", "rasensaat", "blumensamen", "baumpfahl", "kokosstrick", "anbindeband", "baumband", "baumbinder", "verbissschutz", "wuchshülle", "wuchshuelle", "baumwachs", "wundverschluss", "unkrautvlies", "mulchvlies", "pflanzvlies", "gartenvlies", "wurzelsperre", "teichfolie", "geotextil", "drahtgeflecht", "gartenschlauch", "tropfschlauch", "bewässerung", "bewaesserung", "beregnung", "sprinkler"], gewerk: "baumpflege" },
  { account: "4945", keywords: ["fortbildung", "schulung", "lehrgang", "seminar", "rezertifizierung", "prüfungsgebühr", "pruefungsgebuehr", "erste-hilfe-kurs"] },
  { account: "4945", keywords: ["seilklettertechnik", "skt-kurs", "skt a", "skt b", "motorsägenkurs", "motorsaegenkurs", "kettensägenschein", "fachagrarwirt", "baumkontrolleur", "baumfachkunde"], gewerk: "baumpflege" },
  { account: "4955", keywords: ["steuerberater", "steuerberatung", "stbvv", "buchführungsgeb", "buchfuehrungsgeb", "finanzbuchführung", "finanzbuchfuehrung", "jahresabschluss", "datev"] },
  { account: "4950", keywords: ["rechtsanwalt", "anwaltskanzlei", "notar", "beratungshonorar", "unternehmensberatung"] },
  { account: "4970", keywords: ["kontoführungsgeb", "kontofuehrungsgeb", "kontoführung", "kontofuehrung", "bankgeb", "bankgebühr", "bankgebuehr", "buchungsposten", "rücklastschrift", "ruecklastschrift", "kartengebühr", "kartengebuehr", "transaktionsgebühr", "transaktionsgebuehr", "paypal-gebühr", "sumup"] },
  { account: "2120", keywords: ["darlehenszins", "kreditzins", "sollzins", "finanzierungszins", "zinsbelastung"] },
  { account: "4920", keywords: ["mobilfunk", "telefonrechnung", "handyrechnung", "telekom", "vodafone", "congstar", "internetanschluss", "dsl-anschluss", "sim-karte", "datenvolumen"] },
  { account: "4240", keywords: ["stromrechnung", "stromabschlag", "stadtwerke", "wasserwerk", "netzentgelt", "grundversorgung", "zählerstand", "zaehlerstand", "gasabrechnung"] },
  { account: "4930", keywords: ["bürobedarf", "buerobedarf", "büromaterial", "bueromaterial", "kopierpapier", "druckerpapier", "toner", "tintenpatrone", "druckerpatrone", "ordner", "kugelschreiber", "briefumschlag", "briefmarke", "porto", "etiketten", "notizblock", "locher", "tacker"] },
  { account: "4600", keywords: ["werbung", "flyer", "visitenkarte", "anzeige", "werbeschild", "werbebanner", "fahrzeugbeschriftung", "fahrzeugfolier", "folierung", "google ads", "facebook ads", "webseite", "website", "webdesign", "webhosting", "domain", "homepage", "flugblatt", "werbeartikel", "sponsoring"] },
  { account: "4650", keywords: ["bewirtung", "bewirtungsbeleg", "restaurant", "gaststätte", "gaststaette", "gasthaus", "speisen und getränke", "trinkgeld"] },
  { account: "4674", keywords: ["verpflegungsmehraufwand", "reisekostenabrechnung", "spesenabrechnung", "abwesenheitspauschale", "tagespauschale"] },
  { account: "4380", keywords: ["verbandsbeitrag", "innungsbeitrag", "ihk-beitrag", "mitgliedsbeitrag", "kammerbeitrag"] },
  { account: "4900", keywords: ["software-abo", "softwarelizenz", "lizenzgebühr", "lizenzgebuehr", "cloud-abo", "abonnement", "microsoft 365", "adobe", "dropbox", "monatsabo"] },
];

// Abgeleitete Sichten (ohne das interne `gewerk`-Feld) — von der App und von
// Tests konsumiert. Quelle der Wahrheit bleibt KONTO_MASTER oben.
const ohneGewerk = (r) => ({ account: r.account, keywords: r.keywords });
export const KONTO_GRUND = KONTO_MASTER.filter((r) => !r.gewerk).map(ohneGewerk);
export const KONTO_PROFIL = {
  baumpflege: KONTO_MASTER.filter((r) => r.gewerk === "baumpflege").map(ohneGewerk),
};

// Profil zuerst (spezifischer), dann die Grundregeln — aber beide kommen aus
// demselben, in Fachlogik-Reihenfolge stehenden Array, nicht aus zwei
// separat konkatenierten Listen (siehe Kommentar oben).
export const regelnFuer = (profil) =>
  KONTO_PROFIL[profil]
    ? KONTO_MASTER.filter((r) => !r.gewerk || r.gewerk === profil).map(ohneGewerk)
    : KONTO_GRUND;
