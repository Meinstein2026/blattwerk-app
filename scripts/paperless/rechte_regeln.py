# Reine Regeln fuer rechte.py -- ohne Django, damit sie lokal testbar sind.
# rechte-anwenden.sh setzt diese Datei VOR rechte.py zusammen.
# Spec: docs/superpowers/specs/2026-09-23-paperless-rechte-upload-design.md

# Namen seit 23.09.2026 abends: „Büro Blattwerk" / „Büro Politik" (Mitglieder ordnet der Inhaber in Paperless zu).
GRUPPEN = ["Büro Blattwerk", "Büro Politik"]

# Bereich-Tag -> Zielgruppe (None = nur Eigentuemer) und neuer Eigentuemer
# (None = Eigentuemer bleibt unveraendert).
BEREICH_REGEL = {
    "Bereich/Blattwerk": {"gruppe": "Büro Blattwerk", "owner": "blattwerk-app"},
    "Bereich/Politik": {"gruppe": "Büro Politik", "owner": None},
    "Bereich/Privat": {"gruppe": None, "owner": None},
}

# Neue Schlagworte fuer App-Upload und Pipeline-Bruecke (Eigentuemer blattwerk-app).
NEUE_TAGS = ["Quelle/App", "Beleg/zur Buchhaltung", "Pipeline/übergeben"]

# Modellrechte fuer beide Gruppen (sonst sieht ein Gruppenmitglied gar nichts).
GRUPPEN_RECHTE = [
    "view_document", "add_document", "change_document",
    "view_tag", "view_correspondent", "view_documenttype", "view_storagepath",
    "view_customfield", "view_note", "add_note",
    "view_savedview", "add_savedview", "change_savedview", "delete_savedview",
    "view_uisettings", "add_uisettings", "change_uisettings", "view_paperlesstask",
]


def bereich_von(tag_namen):
    """Genau ein bekannter Bereich -> sein Name, sonst None."""
    treffer = [n for n in tag_namen if n in BEREICH_REGEL]
    alle_bereiche = [n for n in tag_namen if n.startswith("Bereich/")]
    if len(treffer) != 1 or len(alle_bereiche) != 1:
        return None
    return treffer[0]


def andere_gruppen(gruppe):
    """Alle Gruppen ausser der eigenen (Privat: gruppe=None -> beide)."""
    return [g for g in GRUPPEN if g != gruppe]
