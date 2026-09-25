#!/usr/bin/env python3
# Gemeinsame Bausteine der Beleg-Pipeline: Config (.env), Nextcloud-WebDAV,
# Dolibarr-REST, Buchungskonto-Regeln. Nur Python-Stdlib (läuft so auf dem Pipeline-Host).
import base64
import json
import os
import re
import sys
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from xml.etree import ElementTree

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_DIR = os.path.join(BASE_DIR, "state")

GERMAN_MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
                 "August", "September", "Oktober", "November", "Dezember"]

BELEG_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}

# Schlagwort → SKR03-Konto (Vorschlag; in der App-Freigabe änderbar).
# fk_code_ventilation = "10050" + Konto (= Dolibarr-rowid des SKR03-Kontos).
#
# ⚠️ MUSS synchron zu DEFAULT_KONTO_REGELN/DEFAULT_KONTEN in dolibarr-app.jsx
# bleiben — sonst schlägt die Pipeline ein anderes Konto vor als die App.
# Fachlich geprüft 2026-08-04 (Buchhalter-Review + Abgleich gegen den in
# Dolibarr importierten SKR03). Reihenfolge = Priorität und ist Fachlogik:
# Maschinen-Betriebsstoffe vor Fahrzeug-Kraftstoff (sonst landet Aspen/
# Gerätebenzin auf 4530 und verfälscht die Kfz-Gesamtkosten), Fremdleistung
# vor Material (sonst wird „Baumfällung" als Pflanzeneinkauf gebucht).
#
# Entsorgung steht seit 17.08.2026 auf 3100 statt 4969: Blattwerk entsorgt
# ausschließlich auftragsbezogen (Grünschnitt vom Kundengrundstück), das ist
# bezogene Leistung und gehört in den Auftrags-Rohertrag — auch dann, wenn sie
# dem Kunden nicht 1:1 weiterberechnet wird; nicht weiterberechnete
# Auftragskosten sind trotzdem Auftragskosten. 4969 bleibt für den *eigenen*
# Betriebsabfall (Restmülltonne am Hof, Altreifen der Fahrzeuge) und steht
# deshalb VOR 3100: „Altreifenentsorgung" enthält „entsorg" und würde sonst
# als Fremdleistung durchgehen.
KONTO_RULES = [
    ("3000", ["sonderkraftstoff", "alkylat", "aspen", "gerätebenzin", "geraetebenzin", "2-takt", "2takt", "zweitakt", "2t-gemisch", "mischöl", "mischoel", "sägekettenöl", "saegekettenoel", "sägekettenhaftöl", "kettenöl", "kettenoel", "haftöl", "haftoel", "bio-kettenöl", "motoröl", "motoroel", "hydrauliköl", "hydraulikoel", "getriebeöl", "getriebeoel", "schmieröl", "schmieroel", "schmierfett", "mehrzweckfett", "schmierstoff"]),
    ("4969", ["abfallgebühr", "abfallgebuehr", "müllgeb", "muellgeb", "restmüll", "restmuell", "altreifen"]),
    ("3100", ["subunternehm", "nachunternehm", "fremdleistung", "fremdfirma", "leihpersonal", "freistellungsbescheinigung", "13b ustg", "steuerschuldnerschaft", "kranarbeit", "autokran", "mietkran", "seilkletterer", "wurzelfräs", "wurzelfraes", "stubbenfräs", "stubbenfraes", "baggerarbeit", "entsorg", "grünschnitt", "gruenschnitt", "grüngut", "gruengut", "grünabfall", "gruenabfall", "häckselgut", "haeckselgut", "astgut", "deponie", "recyclinghof", "wertstoffhof", "kompostwerk", "containerdienst", "abrollcontainer", "absetzcontainer", "muldendienst", "entsorgungsnachweis", "wiegeschein", "annahmegebühr", "annahmegebuehr", "stubbenentsorgung", "bauschutt", "altholz"]),
    ("4530", ["e10", "e5 ", "super 95", "superbenzin", "benzin", "diesel", "kraftstoff", "tanken", "adblue", "tankstelle", "tankbeleg", "tankquittung", "sprit", "aral", "shell", "agip", "avia", "totalenergies", "jet tankstelle", "scheibenfrostschutz", "kühlerfrostschutz", "kuehlerfrostschutz"]),
    ("4580", ["hauptuntersuchung", "abgasunters", "tüv", "tuev", "dekra", "gtü", "gtue", "küs", "kues", "zulassungsstelle", "kfz-zulassung", "kennzeichen", "nummernschild", "feinstaubplakette", "parkgebühr", "parkgebuehr", "parkschein", "waschanlage", "autowäsche", "autowaesche", "maut", "vignette"]),
    ("4540", ["kfz-werkstatt", "kfz-reparatur", "autohaus", "inspektion", "ölwechsel", "oelwechsel", "bremsbeläge", "bremsbelaege", "bremsscheiben", "zahnriemen", "auspuff", "stoßdämpfer", "stossdaempfer", "lichtmaschine", "kupplungssatz", "reifen", "reifenwechsel", "radwechsel", "radlager", "achsvermessung"]),
    ("4510", ["kraftfahrzeugsteuer", "kfz-steuer", "hauptzollamt"]),
    ("4520", ["kfz-versicherung", "kfz-haftpflicht", "kraftfahrtversicherung", "teilkasko", "vollkasko", "kfz-police", "schutzbrief"]),
    ("4138", ["svlfg", "berufsgenossenschaft", "gesetzliche unfallversicherung", "bg-beitrag"]),
    ("4360", ["betriebshaftpflicht", "inhaltsversicherung", "maschinenbruch", "elektronikversicherung", "betriebsunterbrechung", "geschäftsversicherung", "geschaeftsversicherung", "rechtsschutzversicherung", "versicherungsteuer", "haftpflichtversicherung"]),
    ("1800", ["landwirtschaftliche krankenkasse", "alterskasse", "lkk-beitrag", "private krankenversicherung", "privatentnahme", "einkommensteuer-voraus", "kirchensteuer"]),
    ("4800", ["vergaser", "zündkerze", "zuendkerze", "kupplungstrommel", "anwerfvorrichtung", "starterseil", "maschinenreparatur", "gerätereparatur", "geraetereparatur", "motorsägenservice", "motorsaegenservice", "maschinenwartung", "maschinenservice", "instandsetzung", "reparatur", "ersatzteil", "instandhalt", "wartung", "luftfilter", "kraftstofffilter", "anlasser", "membran", "keilriemen", "antriebsriemen"]),
    ("4960", ["mietgerät", "mietgeraet", "leihgerät", "leihgeraet", "geräteverleih", "geraeteverleih", "maschinenverleih", "baumaschinenverm", "mietpark", "leihgebühr", "leihgebuehr", "mietgebühr", "mietgebuehr", "gerätemiete", "geraetemiete", "maschinenmiete", "hubsteiger", "arbeitsbühne", "arbeitsbuehne", "hebebühne", "hebebuehne", "minibagger", "radlader", "rüttelplatte", "ruettelplatte", "vibrationsplatte", "stampfer", "hkl baumaschinen", "zeppelin rental", "boels"]),
    ("4210", ["hallenmiete", "lagermiete", "stellplatzmiete", "gewerbemiete", "pachtzins", "nebenkostenabrechnung"]),
    ("4985", ["schnittschutz", "schnittschutzhose", "schnittschutzstiefel", "forsthelm", "kletterhelm", "schutzhelm", "visier", "gesichtsschutz", "gehörschutz", "gehoerschutz", "schutzbrille", "arbeitshandschuh", "handschuh", "sicherheitsschuh", "warnweste", "warnkleidung", "psa", "arbeitshose", "regenjacke", "regenhose", "knieschoner", "klettergurt", "baumklettergurt", "kernmantelseil", "kletterseil", "karabiner", "seilrolle", "umlenkrolle", "prusik", "wurfbeutel", "wurfsack", "steigeisen", "baumsteiger", "sägekette", "saegekette", "führungsschiene", "fuehrungsschiene", "sägeschwert", "saegeschwert", "kettenrad", "rundfeile", "feilenset", "mähfaden", "maehfaden", "trimmerfaden", "schneidfaden", "sägeblatt", "saegeblatt", "spaten", "schaufel", "hacke", "rechen", "harke", "grabegabel", "forke", "sense", "sichel", "gartenschere", "astschere", "heckenschere", "rosenschere", "baumschere", "gartenmesser", "hippe", "astsäge", "astsaege", "handsäge", "handsaege", "bügelsäge", "buegelsaege", "klappsäge", "klappsaege", "spaltbeil", " axt", "spalthammer", "hammer", "kneifzange", "zange", "bolzenschneider", "motorsäge", "motorsaege", "kettensäge", "kettensaege", "freischneider", "motorsense", "rasentrimmer", "laubbläser", "laubblaeser", "laubsauger", "hochentaster", "entaster", "rasenmäher", "rasenmaeher", "vertikutierer", "häcksler", "haecksler", "bohrmaschine", "akkuschrauber", "winkelschleifer", "trennschleifer", "bohrer", "feile", "wetzstahl", "gießkanne", "giesskanne", "schubkarre", "sackkarre", "trittleiter", "bockleiter", "teleskopleiter", "stehleiter", "anlegeleiter", "schiebeleiter", "klappleiter", "gelenkleiter", "mehrzweckleiter", "vielzweckleiter", "sprossenleiter", "stufenleiter", "podestleiter", "plattformleiter", "obstbaumleiter", "aluleiter", "alu-leiter", "holzleiter", "glasfaserleiter", "leitern", " leiter", "wasserwaage", "zollstock", "gliedermaßstab", "gliedermassstab", "maßband", "massband", "schraubendreher", "schraubenzieher", "ratsche", "steckschlüssel", "steckschluessel", "maulschlüssel", "maulschluessel", "seitenschneider", "wasserpumpenzange", "brechstange", "fäustel", "faeustel", "meißel", "meissel", "richtscheit", "maurerkelle", "glättkelle", "glaettkelle", "trennscheibe", "schleifscheibe", "diamantscheibe", "stichsäge", "stichsaege", "kreissäge", "kreissaege", "schlagbohr", "fällkeil", "faellkeil", "fällheber", "faellheber", "sappie", "wendehaken", "unkrautstecher", "fugenkratzer", "kehrbesen", "reisigbesen", "straßenbesen", "strassenbesen", "grasschere", "rasenkantenschneider", "pflanzkelle", "pflanzholz", "akku", "ladegerät", "ladegeraet", "erste-hilfe", "verbandskasten"]),
    ("4980", ["reinigungsmittel", "putzmittel", "handreiniger", "markierspray", "absperrband", "flatterband", "pylone", "leitkegel", "warnschild", "betriebsbedarf"]),
    ("3300", ["baumschule", "containerpflanze", "topfpflanze", "ballenware", "solitärgehölz", "solitaergehoelz", "heckenpflanze", "jungpflanze", "staude", "strauch", "sträucher", "straeucher", "gehölz", "gehoelz", "obstbaum", "hochstamm", "koniferen", "thuja", " eibe", "buchsbaum", "rosenstock", "beetrose", "ziergras", "bodendecker", "pflanzware", "blumenzwiebel", "rollrasen", "rasensode", "fertigrasen", "pflanze"]),
    ("3400", ["rindenmulch", "mulch", "rindenhumus", "humus", "substrat", "pflanzerde", "blumenerde", "gartenerde", "mutterboden", "komposterde", "kompost", "torf", "kokoserde", "dünger", "duenger", "düngemittel", "duengemittel", "volldünger", "rasendünger", "hornspäne", "hornspaene", "hornmehl", "gartenkalk", "kalk", "pflanzenschutz", "unkrautvernichter", "herbizid", "fungizid", "insektizid", "schneckenkorn", "saatgut", "rasensamen", "rasensaat", "blumensamen", "baumpfahl", "kokosstrick", "anbindeband", "baumband", "baumbinder", "verbissschutz", "wuchshülle", "wuchshuelle", "baumwachs", "wundverschluss", "unkrautvlies", "mulchvlies", "pflanzvlies", "gartenvlies", "wurzelsperre", "teichfolie", "geotextil", "drahtgeflecht", "pflasterstein", "pflaster", "randstein", "kantenstein", "palisade", "mauerstein", "naturstein", "gehwegplatte", "terrassenplatte", "betonstein", "beton", "zement", "mörtel", "moertel", "estrich", "trasszement", "fugensand", "kies", "schotter", "splitt", "frostschutz", "quarzsand", "spielsand", "streugut", "streusalz", "auftausalz", "bauholz", "kantholz", "pfosten", "zaunpfahl", "pfahl", "zaun", "staketenzaun", "doppelstabmatte", "rankgitter", "latte", "bohle", "terrassendiele", "wpc", "holzschutz", "lasur", "imprägnier", "impraegnier", "drainage", "dränrohr", "draenrohr", "kg-rohr", "gartenschlauch", "tropfschlauch", "bewässerung", "bewaesserung", "beregnung", "sprinkler", "fitting", "schlauchverbinder", "schraube", "beilagscheibe", "unterlegscheibe", "mutter m", " nagel", "dübel", "duebel", "spanndraht", "bindedraht", "kabelbinder", "draht", "jute"]),
    ("4945", ["seilklettertechnik", "skt-kurs", "skt a", "skt b", "motorsägenkurs", "motorsaegenkurs", "kettensägenschein", "fachagrarwirt", "baumkontrolleur", "fortbildung", "schulung", "lehrgang", "seminar", "rezertifizierung", "prüfungsgebühr", "pruefungsgebuehr", "baumfachkunde", "erste-hilfe-kurs"]),
    ("4955", ["steuerberater", "steuerberatung", "stbvv", "buchführungsgeb", "buchfuehrungsgeb", "finanzbuchführung", "finanzbuchfuehrung", "jahresabschluss", "datev"]),
    ("4950", ["rechtsanwalt", "anwaltskanzlei", "notar", "beratungshonorar", "unternehmensberatung"]),
    ("4970", ["kontoführungsgeb", "kontofuehrungsgeb", "kontoführung", "kontofuehrung", "bankgeb", "bankgebühr", "bankgebuehr", "buchungsposten", "rücklastschrift", "ruecklastschrift", "kartengebühr", "kartengebuehr", "transaktionsgebühr", "transaktionsgebuehr", "paypal-gebühr", "sumup"]),
    ("2120", ["darlehenszins", "kreditzins", "sollzins", "finanzierungszins", "zinsbelastung"]),
    ("4920", ["mobilfunk", "telefonrechnung", "handyrechnung", "telekom", "vodafone", "congstar", "internetanschluss", "dsl-anschluss", "sim-karte", "datenvolumen"]),
    ("4240", ["stromrechnung", "stromabschlag", "stadtwerke", "wasserwerk", "netzentgelt", "grundversorgung", "zählerstand", "zaehlerstand", "gasabrechnung"]),
    ("4930", ["bürobedarf", "buerobedarf", "büromaterial", "bueromaterial", "kopierpapier", "druckerpapier", "toner", "tintenpatrone", "druckerpatrone", "ordner", "kugelschreiber", "briefumschlag", "briefmarke", "porto", "etiketten", "notizblock", "locher", "tacker"]),
    ("4600", ["werbung", "flyer", "visitenkarte", "anzeige", "werbeschild", "werbebanner", "fahrzeugbeschriftung", "fahrzeugfolier", "folierung", "google ads", "facebook ads", "webseite", "website", "webdesign", "webhosting", "domain", "homepage", "flugblatt", "werbeartikel", "sponsoring"]),
    ("4650", ["bewirtung", "bewirtungsbeleg", "restaurant", "gaststätte", "gaststaette", "gasthaus", "speisen und getränke", "trinkgeld"]),
    ("4674", ["verpflegungsmehraufwand", "reisekostenabrechnung", "spesenabrechnung", "abwesenheitspauschale", "tagespauschale"]),
    ("4380", ["verbandsbeitrag", "innungsbeitrag", "ihk-beitrag", "mitgliedsbeitrag", "kammerbeitrag"]),
    ("4900", ["software-abo", "softwarelizenz", "lizenzgebühr", "lizenzgebuehr", "cloud-abo", "abonnement", "microsoft 365", "adobe", "dropbox", "monatsabo"]),
]
# Fallback bewusst „Sonstige betriebliche Aufwendungen": was keine Regel trifft,
# ist ungeklärt und soll nicht in den Werkzeugen (4985) verschwinden.
KONTO_DEFAULT = "4900"

# Klartextnamen für die Freigabe-Mail (Bezeichnungen aus dem SKR03, gekürzt)
KONTO_NAMES = {
    "0210": "Maschinen (aktiviert)",
    "0350": "Lkw / Transporter (aktiviert)",
    "0380": "Sonstige Transportmittel (Anhänger)",
    "0440": "Werkzeuge (aktiviert)",
    "0480": "Geringwertige Wirtschaftsgüter",
    "0485": "Sammelposten Wirtschaftsgüter",
    "1800": "Privatentnahme",
    "2120": "Zinsen langfr. Verbindlichkeiten",
    "3000": "Betriebsstoffe Maschinen",
    "3100": "Fremdleistungen",
    "3300": "Wareneingang 7 % (Pflanzen)",
    "3400": "Wareneingang 19 % (Material)",
    "4138": "Beiträge Berufsgenossenschaft",
    "4210": "Miete unbewegliche WG",
    "4240": "Gas, Strom, Wasser",
    "4360": "Versicherungen",
    "4380": "Beiträge",
    "4510": "Kfz-Steuer",
    "4520": "Fahrzeug-Versicherungen",
    "4530": "Laufende Fahrzeug-Betriebskosten",
    "4540": "Fahrzeug-Reparaturen",
    "4580": "Sonstige Fahrzeugkosten",
    "4600": "Werbekosten",
    "4650": "Bewirtungskosten",
    "4674": "Verpflegungsmehraufwand",
    "4800": "Reparatur technische Anlagen",
    "4805": "Reparatur andere Anlagen",
    "4900": "Sonstige betriebliche Aufwendungen",
    "4920": "Telefon / Internet",
    "4930": "Bürobedarf und Porto",
    "4945": "Fortbildungskosten",
    "4950": "Rechts- und Beratungskosten",
    "4955": "Buchführungskosten",
    "4960": "Miete Einrichtungen (Geräte)",
    "4969": "Abraum- und Abfallbeseitigung",
    "4970": "Nebenkosten des Geldverkehrs",
    "4980": "Sonstiger Betriebsbedarf",
    "4985": "Werkzeuge u. Kleingeräte",
}


def konto_von_ventilation(vent):
    """fk_code_ventilation ("10050"+Konto) zurück zum SKR03-Konto."""
    s = str(vent or "")
    return s[5:] if s.startswith("10050") and len(s) > 5 else None

ZAHLART_MAP = {  # zahlart → (payment_mode_id, bank_account_id)
    "karte": (6, 1), "ec": (6, 1), "girocard": (6, 1), "kreditkarte": (6, 1),
    "bar": (4, 5), "cash": (4, 5),
    "lastschrift": (3, 1), "überweisung": (2, 1), "ueberweisung": (2, 1),
}


def load_env(path=None):
    """Liest .env (KEY=VALUE) und mergt mit os.environ (env gewinnt)."""
    path = path or os.path.join(BASE_DIR, ".env")
    cfg = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip()
    cfg.update({k: v for k, v in os.environ.items() if k in cfg or k.startswith(("NC_", "DOLI_", "SMTP_", "MAIL_", "APPROVE_", "OLLAMA_"))})
    return cfg


def http(method, url, headers=None, data=None, timeout=60):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


class WebDav:
    """Minimaler WebDAV-Client für Nextcloud."""

    def __init__(self, base, user, password, root):
        # base: https://host/nextcloud   root: Blattwerk/Belege
        self.dav = base.rstrip("/") + "/remote.php/dav/files/" + urllib.parse.quote(user)
        self.root = "/" + root.strip("/")
        auth = base64.b64encode(f"{user}:{password}".encode()).decode()
        self.headers = {"Authorization": "Basic " + auth}

    def _url(self, rel):
        rel = "/" + rel.strip("/") if rel else ""
        return self.dav + urllib.parse.quote(self.root + rel, safe="/")

    def list(self, rel=""):
        """Depth-1-Listing: [{name, is_dir, size, modified}] (ohne den Ordner selbst)."""
        st, body, _ = http("PROPFIND", self._url(rel),
                           {**self.headers, "Depth": "1", "Content-Type": "application/xml"},
                           b'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop>'
                           b'<d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>')
        if st == 404:
            return None
        if st not in (200, 207):
            raise RuntimeError(f"PROPFIND {rel}: HTTP {st} {body[:200]!r}")
        # XXE/Entity-Guard: WebDAV-Antworten enthalten nie DTDs — falls doch, ablehnen.
        if b"<!DOCTYPE" in body or b"<!ENTITY" in body:
            raise RuntimeError("PROPFIND: unerwartete DTD/Entity in XML-Antwort")
        ns = {"d": "DAV:"}
        out = []
        tree = ElementTree.fromstring(body)
        entries = tree.findall("d:response", ns)
        for resp in entries[1:]:  # erster Eintrag = der Ordner selbst
            href = urllib.parse.unquote(resp.find("d:href", ns).text)
            name = href.rstrip("/").rsplit("/", 1)[-1]
            prop = resp.find(".//d:prop", ns)
            is_dir = prop.find("d:resourcetype/d:collection", ns) is not None
            size = prop.findtext("d:getcontentlength", "0", ns)
            modified = prop.findtext("d:getlastmodified", "", ns)
            out.append({"name": name, "is_dir": is_dir, "size": int(size or 0), "modified": modified})
        return out

    def get(self, rel):
        st, body, _ = http("GET", self._url(rel), self.headers, timeout=300)
        if st != 200:
            raise RuntimeError(f"GET {rel}: HTTP {st}")
        return body

    def put(self, rel, data):
        st, body, _ = http("PUT", self._url(rel), self.headers, data, timeout=300)
        if st not in (200, 201, 204):
            raise RuntimeError(f"PUT {rel}: HTTP {st} {body[:200]!r}")

    def mkcol(self, rel):
        st, _, _ = http("MKCOL", self._url(rel), self.headers)
        if st not in (201, 405):  # 405 = existiert schon
            raise RuntimeError(f"MKCOL {rel}: HTTP {st}")

    def mkdirs(self, rel):
        parts = rel.strip("/").split("/")
        for i in range(1, len(parts) + 1):
            self.mkcol("/".join(parts[:i]))

    def move(self, src, dst):
        st, body, _ = http("MOVE", self._url(src),
                           {**self.headers, "Destination": self._url(dst), "Overwrite": "F"})
        if st not in (201, 204):
            raise RuntimeError(f"MOVE {src} -> {dst}: HTTP {st} {body[:200]!r}")

    def delete(self, rel):
        st, _, _ = http("DELETE", self._url(rel), self.headers)
        if st not in (204, 404):
            raise RuntimeError(f"DELETE {rel}: HTTP {st}")

    def exists(self, rel):
        st, _, _ = http("PROPFIND", self._url(rel), {**self.headers, "Depth": "0"})
        return st in (200, 207)


class Dolibarr:
    def __init__(self, base, key):
        self.base = base.rstrip("/") + "/api/index.php"
        self.headers = {"DOLAPIKEY": key, "Content-Type": "application/json"}

    def call(self, method, path, payload=None, ok=(200, 201)):
        data = json.dumps(payload).encode() if payload is not None else None
        st, body, _ = http(method, self.base + path, self.headers, data)
        if st not in ok:
            raise RuntimeError(f"Dolibarr {method} {path}: HTTP {st} {body[:300]!r}")
        try:
            return json.loads(body)
        except (ValueError, json.JSONDecodeError):
            return body.decode(errors="replace")

    def get(self, path):
        return self.call("GET", path)

    def post(self, path, payload):
        return self.call("POST", path, payload)

    def put(self, path, payload):
        return self.call("PUT", path, payload)


def _match_konto(t):
    for konto, keywords in KONTO_RULES:
        if any(k in t for k in keywords):
            return konto
    return None


def suggest_konto(text, kontext=""):
    """Erste Regel mit Stichwort-Treffer gewinnt (gleiche Logik wie in der App).
    `kontext` (Lieferantenname) wird NUR als zweiter Versuch herangezogen —
    sonst reißt ein Lieferantenname mit Stichwort-Teilstring alle Positionen
    des Belegs mit, und App und Pipeline schlagen Verschiedenes vor."""
    treffer = _match_konto((text or "").lower())
    if treffer:
        return treffer
    if kontext:
        return _match_konto(f"{text or ''} {kontext}".lower()) or KONTO_DEFAULT
    return KONTO_DEFAULT


def fk_ventilation(konto):
    return int("10050" + konto)


def state_path(name):
    os.makedirs(STATE_DIR, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return os.path.join(STATE_DIR, safe + ".state.json")


def load_state(name):
    p = state_path(name)
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return None


def save_state(name, data):
    # atomar (tmp + rename): eine halb geschriebene State-Datei würde sonst vom
    # Dedup übersehen und der Beleg beim nächsten Lauf erneut gemailt
    p = state_path(name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def known_invoice_ids():
    """invoice_ids aller State-Dateien — egal ob Pipeline- oder App-Entwurf."""
    ids = set()
    if os.path.isdir(STATE_DIR):
        for fn in os.listdir(STATE_DIR):
            if not fn.endswith(".state.json"):
                continue
            try:
                st = json.load(open(os.path.join(STATE_DIR, fn), encoding="utf-8"))
                iid = int(st.get("invoice_id") or 0)
            except (ValueError, TypeError, OSError):
                continue
            if iid:
                ids.add(iid)
    return ids


def _dublette_key(supplier, brutto):
    """Vergleichsschlüssel für die Dublettensuche: Lieferant + Bruttobetrag."""
    s = re.sub(r"[^a-z0-9]+", " ", str(supplier or "").lower()).strip()
    try:
        b = round(float(brutto or 0), 2)
    except (TypeError, ValueError):
        b = 0.0
    return s, b


def moegliche_dubletten(supplier, brutto, datum, invoice_id=None, tage=3):
    """Schon bekannte Belege mit gleichem Lieferant + Betrag im Datumsfenster.

    Am 17.08.2026 legte ein zweiter Scan desselben Belegs (Kilb Vetter, 22,05 €)
    einen zweiten Dolibarr-Entwurf an; beide standen in derselben Freigabe-Mail.
    `known_invoice_ids()` konnte das strukturell nicht sehen — es dedupliziert
    über die invoice_id, und die ist pro Entwurf verschieden.

    Bewusst nur ein **Hinweis**, keine Unterdrückung: zwei gleiche Beträge beim
    selben Lieferanten am selben Tag können echt sein (zwei Fuhren Grünschnitt).
    Was hier verschwände, fiele niemandem auf.
    """
    key = _dublette_key(supplier, brutto)
    if not key[0] or not key[1]:
        return []
    try:
        d0 = datetime.strptime(str(datum)[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        d0 = None
    treffer = []
    if not os.path.isdir(STATE_DIR):
        return treffer
    for fn in sorted(os.listdir(STATE_DIR)):
        if not fn.endswith(".state.json"):
            continue
        try:
            st = json.load(open(os.path.join(STATE_DIR, fn), encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if invoice_id and int(st.get("invoice_id") or 0) == int(invoice_id):
            continue
        res = st.get("res") or {}
        if _dublette_key(st.get("supplier") or res.get("lieferant"),
                         res.get("gesamt_brutto")) != key:
            continue
        if d0:
            try:
                d1 = datetime.strptime(str(res.get("datum"))[:10], "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            if abs((d1 - d0).days) > tage:
                continue
        treffer.append({"ref": st.get("ref") or st.get("name"),
                        "invoice_id": st.get("invoice_id"),
                        "status": st.get("status"),
                        "datum": res.get("datum")})
    return treffer


def log(*args):
    print(*args, file=sys.stderr)
