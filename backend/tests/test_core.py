import pytest

from firestarter.ai.manager import AIManager
from firestarter.connectors.base import Capability, Connector, ConnectorStatus
from firestarter.core.orchestrator import OrchestratorError, ProtectedArtifacts
from firestarter.core.types import ConnectorResult, Support, TaskSpec
from firestarter.core.workspace import FOLDERS, Workspace
from firestarter.workflows.base import Workflow

from .conftest import ExternalAI, FakeAI, approved


def states(core, pid):
    plan = core.store.current_plan(pid)
    return {t["key"]: t["state"] for t in core.store.tasks(plan["id"])}


def test_project_structure_and_snapshot(core, project):
    root = Workspace(project["path"]).root
    for folder in FOLDERS.values():
        assert (root / folder).is_dir()
    assert (root / "00_Project" / "brief.json").exists()
    assert (root / ".gitignore").exists()


def test_project_requires_name_and_goal(core):
    with pytest.raises(OrchestratorError):
        core.create_project(name="", goal="x", workflows=["tech_docs"])


def test_no_execution_before_approval(core, project):
    core.generate_plan(project["id"])
    with pytest.raises(OrchestratorError, match="CA-04"):
        core.step(project["id"])
    assert all(s == "planned" for s in states(core, project["id"]).values())


def test_plan_has_dependencies_and_levels(core, project):
    view = core.generate_plan(project["id"])
    keys = [t["key"] for t in view["tasks"]]
    assert keys.index("tech_docs.analyze") < keys.index("tech_docs.spec")
    flat = [k for lv in view["levels"] for k in lv]
    assert sorted(flat) == sorted(keys)
    assert ["tech_docs.export_spec", "tech_docs.guide"] != view["levels"][0]
    assert set(view["levels"][-1]) == {"tech_docs.deliver"}


def test_full_pilot_workflow(core, project):
    approved(core, project)
    ran = core.run_all(project["id"])
    assert ran[0] == "tech_docs.analyze" and ran[-1] == "tech_docs.deliver"
    st = core.status(project["id"])
    assert st["state"] == "completed", st
    arts = {a["rel_path"]: a for a in core.artifacts(project["id"])}
    assert arts["05_Exports/specifica.docx"]["role"] == "export"
    assert arts["07_Delivery/guida.docx"]["role"] == "delivery"
    assert arts["04_Artifacts/guida.md"]["depends_on"] == ["04_Artifacts/specifica.md"]  # tracciabilita'
    assert all(v["passed"] for v in core.validations(project["id"]) if v["severity"] == "error")
    assert any(v["check_name"] == "docx_valid" for v in core.validations(project["id"]))


def test_sources_are_copied_and_protected(core, project, tmp_path):
    src = tmp_path / "originale"
    src.mkdir()
    (src / "note.md").write_text("# note\ncontenuto", encoding="utf-8")
    core.import_sources(project["id"], str(src))
    ws = Workspace(project["path"])
    copied = ws.root / "01_Sources" / "originale" / "note.md"
    assert copied.read_text(encoding="utf-8").startswith("# note")
    with pytest.raises(PermissionError):
        ws.resolve("01_Sources/originale/note.md", write=True)
    with pytest.raises(PermissionError):
        ws.resolve("../fuori.txt")
    assert (src / "note.md").read_text(encoding="utf-8").startswith("# note")  # originale intatto


def test_failed_validation_is_not_success(core, project, fake_ai):
    fake_ai.drop_sections = True
    approved(core, project)
    core.run_all(project["id"])
    s = states(core, project["id"])
    assert s["tech_docs.spec"] == "failed"
    assert s["tech_docs.guide"] == "blocked" and s["tech_docs.deliver"] == "blocked"
    assert core.status(project["id"])["state"] == "needs_attention"
    spec = next(t for t in core.store.tasks(core.store.current_plan(project["id"])["id"]) if t["key"] == "tech_docs.spec")
    assert "sezione mancante" in spec["error"]
    # l'output parziale e' conservato
    assert (Workspace(project["path"]).root / "04_Artifacts/specifica.md").exists()
    assert core.report(project["id"])["errors"]


def test_retry_after_fix(core, project, fake_ai):
    fake_ai.drop_sections = True
    approved(core, project)
    core.run_all(project["id"])
    fake_ai.drop_sections = False
    core.retry_task(project["id"], "tech_docs.spec")
    core.run_all(project["id"])
    assert core.status(project["id"])["state"] == "completed"
    spec = next(a for a in core.artifacts(project["id"]) if a["rel_path"] == "04_Artifacts/specifica.md")
    assert spec["version"] == 2 and spec["versions"][0]["version"] == 1  # versione precedente conservata


def test_unavailable_ai_blocks_with_message(core, project, fake_ai):
    fake_ai.up = False
    approved(core, project)
    core.run_all(project["id"])
    t = core.store.get_task(core.store.current_plan(project["id"])["id"], "tech_docs.analyze")
    assert t["state"] == "blocked" and "non disponibile" in t["error"]
    fake_ai.up = True
    core.retry_task(project["id"], "tech_docs.analyze")
    core.run_all(project["id"])
    assert core.status(project["id"])["state"] == "completed"


def test_resume_after_interruption(core, project):
    approved(core, project)
    core.step(project["id"])
    plan = core.store.current_plan(project["id"])
    core.store.update_task(core.store.get_task(plan["id"], "tech_docs.spec")["id"], state="running")
    assert core.recover() == 1
    core.run_all(project["id"])
    assert core.status(project["id"])["state"] == "completed"


def test_selective_regeneration_and_protection(core, project, fake_ai):
    approved(core, project)
    core.run_all(project["id"])
    n_before = len(fake_ai.calls)
    core.review_artifact(project["id"], "04_Artifacts/specifica.md", "approved")
    with pytest.raises(ProtectedArtifacts):
        core.regenerate(project["id"], "tech_docs.spec")
    res = core.regenerate(project["id"], "tech_docs.spec", confirm=True)
    assert "tech_docs.analyze" not in res["affected"]  # niente rifacimento dell'intero progetto
    core.run_all(project["id"])
    assert len(fake_ai.calls) - n_before == 2  # spec + guida, non l'analisi
    spec = next(a for a in core.artifacts(project["id"]) if a["rel_path"] == "04_Artifacts/specifica.md")
    assert spec["version"] == 2 and spec["review_state"] == "pending"


def test_plan_edit_respects_dependencies(core, project):
    core.generate_plan(project["id"])
    with pytest.raises(OrchestratorError, match="non escludibile"):
        core.set_excluded(project["id"], "tech_docs.spec", True)
    core.set_excluded(project["id"], "tech_docs.deliver", True)
    core.set_excluded(project["id"], "tech_docs.export_guide", True)
    core.set_excluded(project["id"], "tech_docs.guide", True)
    plan = core.plan_view(project["id"])
    keys = [t["key"] for t in plan["tasks"]]
    bad = list(reversed(keys))
    with pytest.raises(OrchestratorError):
        core.reorder(project["id"], bad)
    core.approve_plan(project["id"])
    core.run_all(project["id"])
    assert states(core, project["id"])["tech_docs.guide"] == "skipped"
    assert core.status(project["id"])["state"] == "completed"


def test_replan_after_brief_change_reuses_unchanged_tasks(core, project):
    approved(core, project)
    core.run_all(project["id"])
    core.update_brief(project["id"], {"audience": "management"})
    view = core.generate_plan(project["id"])
    assert "tech_docs.analyze" in view["changed"] and "tech_docs.export_spec" in view["changed"]
    assert view["plan"]["status"] == "draft" and view["plan"]["version"] == 2
    unchanged = core.generate_plan(project["id"])  # nessuna ulteriore modifica: tutto cambiato resta da rifare
    assert unchanged["plan"]["version"] == 3


def test_replan_without_changes_keeps_completed(core, project):
    approved(core, project)
    core.run_all(project["id"])
    view = core.generate_plan(project["id"])
    assert view["changed"] == [] and len(view["reused"]) == 6
    core.approve_plan(project["id"])
    assert core.step(project["id"]) is None  # nulla da rifare


def test_mixed_project_single_plan(core):
    p = core.create_project(name="Misto", goal="Manuale illustrato", workflows=["tech_docs", "editorial"])
    assert p["category"] == "mixed"
    view = core.generate_plan(p["id"])
    keys = {t["key"] for t in view["tasks"]}
    assert "tech_docs.deliver" in keys and "editorial.deliver" in keys


def test_editorial_has_different_validation_and_manual_step(core, fake_ai):
    p = core.create_project(name="Libro", goal="Breve libro", workflows=["editorial"])
    approved(core, p)
    core.run_all(p["id"])
    s = states(core, p["id"])
    assert s["editorial.layout"] == "waiting_user"  # nessuna finta integrazione
    checks = {v["check_name"] for v in core.validations(p["id"])}
    assert "md_no_empty_sections" in checks and "md_sections" not in checks
    st = core.status(p["id"])
    assert st["state"] == "completed"  # l'impaginazione e' opzionale
    ws = Workspace(p["path"])
    (ws.root / "05_Exports").mkdir(exist_ok=True)
    core.complete_manual(p["id"], "editorial.layout")
    assert states(core, p["id"])["editorial.layout"] == "completed"


def test_sensitive_task_needs_confirmation(core):
    class Wf(Workflow):
        id, name, category = "sens", "Sens", "technical_docs"

        def build_tasks(self, project):
            return [TaskSpec(key="pub", title="Pubblica", connector="files", operation="copy", sensitive=True,
                             params={"items": []})]

    core.workflows.register(Wf())
    p = core.create_project(name="S", goal="g", workflows=["sens"])
    approved(core, p)
    core.run_all(p["id"])
    assert states(core, p["id"])["sens.pub"] == "waiting_user"
    core.confirm_task(p["id"], "sens.pub")
    core.run_all(p["id"])
    assert states(core, p["id"])["sens.pub"] == "completed"


def test_new_connector_and_workflow_without_touching_core(core):
    class Echo(Connector):
        id, name = "echo", "Echo"

        def status(self):
            return ConnectorStatus(available=True)

        def capabilities(self):
            return [Capability(operation="write", support=Support.VERIFIED)]

        def execute(self, operation, params, ctx):
            out = ctx.workspace.resolve("04_Artifacts/echo.txt", write=True)
            out.write_text(params["text"], encoding="utf-8")
            return ConnectorResult(ok=True, message="ok", outputs=["04_Artifacts/echo.txt"])

    class Wf(Workflow):
        id, name, category = "echo_wf", "Echo", "graphics"

        def build_tasks(self, project):
            return [TaskSpec(key="t", title="t", connector="echo", operation="write", params={"text": "ciao"},
                             outputs=["04_Artifacts/echo.txt"])]

    core.connectors.register(Echo())
    core.workflows.register(Wf())
    p = core.create_project(name="E", goal="g", workflows=["echo_wf"])
    approved(core, p)
    core.run_all(p["id"])
    assert core.status(p["id"])["state"] == "completed"


def test_output_in_sources_is_refused(core):
    class Wf(Workflow):
        id, name, category = "bad", "Bad", "technical_docs"

        def build_tasks(self, project):
            return [TaskSpec(key="t", title="t", connector="ai", operation="generate",
                             params={"prompt": "x"}, outputs=["01_Sources/x.md"])]

    core.workflows.register(Wf())
    p = core.create_project(name="B", goal="g", workflows=["bad"])
    approved(core, p)
    core.run_all(p["id"])
    t = core.store.get_task(core.store.current_plan(p["id"])["id"], "bad.t")
    assert t["state"] == "failed" and "protette" in t["error"]


def test_external_provider_needs_consent(settings):
    ext = ExternalAI()
    mgr = AIManager(settings, [ext])
    with pytest.raises(Exception, match="consenso"):
        mgr.generate(kind="generation", prompt="x", allow_external=False)
    settings.allow_external_ai = True
    with pytest.raises(Exception, match="consenso"):
        mgr.generate(kind="generation", prompt="x", allow_external=False)  # manca il consenso di progetto
    text, meta = mgr.generate(kind="generation", prompt="x", allow_external=True)
    assert meta["local"] is False and text


def test_local_provider_preferred_over_external(settings):
    settings.allow_external_ai = True
    mgr = AIManager(settings, [FakeAI(), ExternalAI()])
    _, meta = mgr.generate(kind="analysis", prompt="x", allow_external=True)
    assert meta["provider"] == "fake"


def test_log_redacts_secrets(core, project):
    core.log(project, "x", "m", data={"api_key": "SEGRETO", "ok": 1})
    ev = core.events(project["id"])[-1]
    assert ev["data"]["api_key"] == "***" and ev["data"]["ok"] == 1
    assert "SEGRETO" not in (Workspace(project["path"]).root / "08_Logs/run.jsonl").read_text()


def test_declare_complete_requires_criteria(core, project):
    approved(core, project)
    with pytest.raises(OrchestratorError):
        core.declare_complete(project["id"])
    core.declare_complete(project["id"], accept_exceptions=True, note="demo")
    assert core.store.get_project(project["id"])["state"] == "delivered"


def test_model_name_matches_latest_tag(settings):
    class Tagged(FakeAI):
        def models(self):
            return ["llama3.2:latest"]

    settings.ollama_model = "llama3.2"
    _, meta = AIManager(settings, [Tagged()]).generate(kind="generation", prompt="x")
    assert meta["model"] == "llama3.2:latest"
