# Paperless-Rechte je Bereich (Spec 2026-09-23). Laeuft per
#   docker exec -i -u paperless paperless python3 manage.py shell
# rechte-anwenden.sh (Betriebs-Repo) stellt rechte_regeln.py und die Zeile
# AUSFUEHREN = ... davor. Ohne AUSFUEHREN = True wird NICHTS geschrieben (Probelauf).
# Der Admin-Nutzername kommt aus PAPERLESS_ADMIN_USER (Umgebung), nie aus dem
# Quelltext — Platzhalter-Default, damit der Fehlerfall laut ist statt falsch.
import os

from django.contrib.auth.models import Group, Permission, User
from guardian.shortcuts import get_groups_with_perms, get_users_with_perms, remove_perm

from documents.models import (Correspondent, Document, DocumentType, StoragePath, Tag,
                              Workflow, WorkflowAction, WorkflowTrigger)
from documents.permissions import get_objects_for_user_owner_aware, set_permissions_for_object

ADMIN_USER = os.environ.get("PAPERLESS_ADMIN_USER", "max")

print("MODUS", "AUSFUEHREN" if AUSFUEHREN else "PROBELAUF")  # noqa: F821

bereich_tags = {t.name: t for t in Tag.objects.filter(name__in=list(BEREICH_REGEL))}
fehlend = [n for n in BEREICH_REGEL if n not in bereich_tags]
if fehlend:
    raise SystemExit("FEHLT Tag: " + ", ".join(fehlend))
nutzer = {u.username: u for u in User.objects.filter(username__in=[ADMIN_USER, "blattwerk-app"])}
if set(nutzer) != {ADMIN_USER, "blattwerk-app"}:
    raise SystemExit(f"FEHLT Nutzer {ADMIN_USER} oder blattwerk-app")

# 1. Dokumente den Bereichen zuordnen
plan = {n: [] for n in BEREICH_REGEL}
kaputt = []
for d in Document.objects.all().prefetch_related("tags"):
    ziel = bereich_von([t.name for t in d.tags.all()])
    if ziel is None:
        kaputt.append(d.id)
    else:
        plan[ziel].append(d)
for n, docs in plan.items():
    print("BEREICH", n, len(docs))
print("OHNE_GENAU_EINEN_BEREICH", len(kaputt), kaputt[:20])

# Altlast 08.08.2026: blattwerk-app hat Einzelrechte (als Nutzer, nicht Gruppe) auf
# 143 Dokumenten. Liegen welche davon heute NICHT in Bereich/Blattwerk, saehe die
# App sie trotz Gruppenmodell weiter. Nur DIESE Nutzerrechte fallen weg, andere
# Einzelfreigaben bleiben.
app = nutzer["blattwerk-app"]
app_fremd = [
    d for n, docs in plan.items() if n != "Bereich/Blattwerk" for d in docs
    if app in get_users_with_perms(d, with_group_users=False, only_with_perms_in=["view_document", "change_document"])
]
print("APP_EINZELRECHT_AUSSERHALB_BLATTWERK", len(app_fremd), [d.id for d in app_fremd][:20])

if AUSFUEHREN:  # noqa: F821
    for d in app_fremd:
        remove_perm("view_document", app, d)
        remove_perm("change_document", app, d)
    print("APP_EINZELRECHT_ENTFERNT", len(app_fremd))

    # 2. Gruppen, Modellrechte, Mitglieder
    gruppen = {}
    rechte = list(Permission.objects.filter(codename__in=GRUPPEN_RECHTE))
    for g in GRUPPEN:
        grp, neu = Group.objects.get_or_create(name=g)
        grp.permissions.add(*rechte)
        gruppen[g] = grp
        print("GRUPPE", g, "neu" if neu else "vorhanden", grp.id)
    nutzer[ADMIN_USER].groups.add(*gruppen.values())
    nutzer["blattwerk-app"].groups.add(gruppen["Büro Blattwerk"])

    # 3. Neue Schlagworte (Eigentuemer blattwerk-app, Gruppe Blattwerk)
    for name in NEUE_TAGS:
        t, neu = Tag.objects.get_or_create(
            name=name, defaults={"owner": nutzer["blattwerk-app"], "matching_algorithm": 0})
        bw = [gruppen["Büro Blattwerk"].id]
        set_permissions_for_object({"view": {"groups": bw}, "change": {"groups": bw}}, t, merge=True)
        print("TAG", name, "neu" if neu else "vorhanden", t.id)

    # 4. Dokumente: Gruppen exakt setzen (Nutzerfreigaben bleiben), Eigentuemer nur bei Blattwerk
    for n, docs in plan.items():
        regel = BEREICH_REGEL[n]
        gid = [gruppen[regel["gruppe"]].id] if regel["gruppe"] else []
        ids = [d.id for d in docs]
        if regel["owner"]:
            Document.objects.filter(id__in=ids).update(owner=nutzer[regel["owner"]])
        for d in docs:
            set_permissions_for_object({"view": {"groups": gid}, "change": {"groups": gid}}, d, merge=False)
        print("GESETZT", n, len(ids))

    # 5. Stammdaten: jede Gruppe sieht nur, was an IHREN Dokumenten haengt
    for n, docs in plan.items():
        g = BEREICH_REGEL[n]["gruppe"]
        if not g:
            continue
        ids = [d.id for d in docs]
        for Modell in (Tag, Correspondent, DocumentType, StoragePath):
            objs = Modell.objects.filter(documents__id__in=ids).distinct()
            for o in objs:
                set_permissions_for_object({"view": {"groups": [gruppen[g].id]}}, o, merge=True)
            print("STAMMDATEN", g, Modell.__name__, objs.count())

    # 6. Workflows (nur anlegen, wenn es sie noch nicht gibt)
    for n, regel in BEREICH_REGEL.items():
        name = "Rechte: " + n.split("/", 1)[1]
        if Workflow.objects.filter(name=name).exists():
            print("WORKFLOW", name, "vorhanden - unveraendert")
            continue
        wf = Workflow.objects.create(name=name, order=100, enabled=True)
        for typ in (WorkflowTrigger.WorkflowTriggerType.DOCUMENT_ADDED,
                    WorkflowTrigger.WorkflowTriggerType.DOCUMENT_UPDATED):
            tr = WorkflowTrigger.objects.create(type=typ)
            tr.filter_has_tags.set([bereich_tags[n]])
            wf.triggers.add(tr)
        andere = [gruppen[x] for x in andere_gruppen(regel["gruppe"])]
        ra = WorkflowAction.objects.create(type=WorkflowAction.WorkflowActionType.REMOVAL, order=0)
        ra.remove_view_groups.set(andere)
        ra.remove_change_groups.set(andere)
        wf.actions.add(ra)
        if regel["gruppe"]:
            aa = WorkflowAction.objects.create(
                type=WorkflowAction.WorkflowActionType.ASSIGNMENT, order=1,
                assign_owner=nutzer[regel["owner"]] if regel["owner"] else None)
            aa.assign_view_groups.set([gruppen[regel["gruppe"]]])
            aa.assign_change_groups.set([gruppen[regel["gruppe"]]])
            wf.actions.add(aa)
        print("WORKFLOW", name, "angelegt", wf.id)

    # 7. Selbstkontrolle
    fehler = 0
    for n, docs in plan.items():
        soll = {BEREICH_REGEL[n]["gruppe"]} - {None}
        for d in docs:
            if {g.name for g in get_groups_with_perms(d)} != soll:
                fehler += 1
    print("PRUEFUNG_GRUPPEN_FEHLER", fehler)
    for u in ("blattwerk-app", ADMIN_USER):
        sieht = get_objects_for_user_owner_aware(nutzer[u], "documents.view_document", Document).count()
        print("SIEHT", u, sieht)
