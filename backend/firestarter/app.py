"""API locale (FastAPI). La UI web e' un client di questa API."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .ai.manager import AIManager
from .config import Settings
from .connectors.registry import ConnectorRegistry, default_registry as default_connectors
from .core.orchestrator import Orchestrator, OrchestratorError, ProtectedArtifacts
from .core.store import Store
from .workflows.registry import WorkflowRegistry, default_registry as default_workflows


class ProjectIn(BaseModel):
    name: str
    goal: str
    workflows: list[str] = Field(default_factory=list)
    brief: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    location: str | None = None


class ImportIn(BaseModel):
    path: str


class ExcludeIn(BaseModel):
    excluded: bool = True


class ReorderIn(BaseModel):
    keys: list[str]


class NoteIn(BaseModel):
    note: str = ""


class ReviewIn(BaseModel):
    path: str
    decision: str
    note: str = ""


class RegenerateIn(BaseModel):
    confirm: bool = False


class CompleteIn(BaseModel):
    accept_exceptions: bool = False
    note: str = ""


def create_app(
    settings: Settings | None = None,
    *,
    ai: AIManager | None = None,
    connectors: ConnectorRegistry | None = None,
    workflows: WorkflowRegistry | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    settings = settings or Settings()
    settings.ensure_dirs()
    store = Store(settings.db_path)
    ai = ai or AIManager(settings)
    connectors = connectors or default_connectors(settings, ai)
    workflows = workflows or default_workflows()
    core = Orchestrator(settings, store, connectors, workflows, ai)
    core.recover()

    app = FastAPI(title="Firestarter", version=__version__)
    app.state.core = core
    runs: dict[str, tuple[threading.Thread, threading.Event]] = {}

    @app.exception_handler(OrchestratorError)
    async def _orch_error(_, exc: OrchestratorError):
        body: dict[str, Any] = {"detail": str(exc)}
        if isinstance(exc, ProtectedArtifacts):
            body["protected"] = exc.paths
        return JSONResponse(status_code=409, content=body)

    @app.exception_handler(PermissionError)
    async def _perm_error(_, exc: PermissionError):
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(FileNotFoundError)
    async def _nf_error(_, exc: FileNotFoundError):
        return JSONResponse(status_code=404, content={"detail": f"non trovato: {exc}"})

    def project_or_404(pid: str) -> dict:
        p = store.get_project(pid)
        if not p:
            raise HTTPException(404, "progetto inesistente")
        return p

    # -- sistema ---------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__}

    @app.get("/api/connectors")
    def list_connectors():
        return connectors.describe()

    @app.get("/api/workflows")
    def list_workflows():
        return [w.describe() for w in workflows.all()]

    @app.get("/api/workflows/suggest")
    def suggest(text: str):
        return {"workflows": workflows.suggest(text)}

    @app.get("/api/ai")
    def ai_status():
        return ai.status()

    # -- progetti ----------------------------------------------------------
    @app.get("/api/projects")
    def list_projects():
        return [{**p, "status": core.status(p["id"])} for p in store.list_projects()]

    @app.post("/api/projects", status_code=201)
    def create_project(body: ProjectIn):
        return core.create_project(**body.model_dump())

    @app.get("/api/projects/{pid}")
    def get_project(pid: str):
        project_or_404(pid)
        return {**store.get_project(pid), "status": core.status(pid)}

    @app.put("/api/projects/{pid}/brief")
    def update_brief(pid: str, brief: dict[str, Any]):
        project_or_404(pid)
        return core.update_brief(pid, brief)

    @app.post("/api/projects/{pid}/sources")
    def import_sources(pid: str, body: ImportIn):
        project_or_404(pid)
        return core.import_sources(pid, body.path)

    @app.get("/api/projects/{pid}/sources")
    def get_sources(pid: str):
        project_or_404(pid)
        return core.sources(pid)

    # -- piano ---------------------------------------------------------------
    @app.post("/api/projects/{pid}/plan")
    def make_plan(pid: str):
        project_or_404(pid)
        return core.generate_plan(pid)

    @app.get("/api/projects/{pid}/plan")
    def get_plan(pid: str):
        project_or_404(pid)
        return core.plan_view(pid)

    @app.put("/api/projects/{pid}/plan/tasks/{key}/excluded")
    def exclude(pid: str, key: str, body: ExcludeIn):
        project_or_404(pid)
        return core.set_excluded(pid, key, body.excluded)

    @app.put("/api/projects/{pid}/plan/order")
    def reorder(pid: str, body: ReorderIn):
        project_or_404(pid)
        return core.reorder(pid, body.keys)

    @app.post("/api/projects/{pid}/plan/approve")
    def approve(pid: str, body: NoteIn | None = None):
        project_or_404(pid)
        return core.approve_plan(pid, body.note if body else "")

    # -- esecuzione ------------------------------------------------------------
    @app.post("/api/projects/{pid}/run/step")
    def run_step(pid: str):
        project_or_404(pid)
        t = core.step(pid)
        return {"task": t, "status": core.status(pid)}

    @app.post("/api/projects/{pid}/run", status_code=202)
    def run(pid: str):
        project_or_404(pid)
        cur = runs.get(pid)
        if cur and cur[0].is_alive():
            return {"running": True}
        if not (plan := store.current_plan(pid)) or plan["status"] != "approved":
            raise OrchestratorError("nessun piano approvato: l'esecuzione non puo' iniziare")
        stop = threading.Event()

        def work():
            try:
                core.run_all(pid, stop)
            except Exception as exc:  # noqa: BLE001
                core.log(store.get_project(pid), "run.error", f"esecuzione interrotta: {exc}", level="error")

        th = threading.Thread(target=work, daemon=True, name=f"run-{pid}")
        runs[pid] = (th, stop)
        th.start()
        return {"running": True}

    @app.post("/api/projects/{pid}/stop")
    def stop_run(pid: str):
        project_or_404(pid)
        cur = runs.get(pid)
        if cur:
            cur[1].set()  # si ferma dopo l'attivita' corrente: nessuna interruzione a meta'
        return {"stopping": bool(cur and cur[0].is_alive())}

    @app.get("/api/projects/{pid}/status")
    def status(pid: str):
        project_or_404(pid)
        cur = runs.get(pid)
        return {**core.status(pid), "running": bool(cur and cur[0].is_alive())}

    @app.post("/api/projects/{pid}/tasks/{key}/confirm")
    def confirm(pid: str, key: str):
        project_or_404(pid)
        return core.confirm_task(pid, key)

    @app.post("/api/projects/{pid}/tasks/{key}/complete-manual")
    def complete_manual(pid: str, key: str, body: NoteIn | None = None):
        project_or_404(pid)
        return core.complete_manual(pid, key, body.note if body else "")

    @app.post("/api/projects/{pid}/tasks/{key}/retry")
    def retry(pid: str, key: str):
        project_or_404(pid)
        return core.retry_task(pid, key)

    @app.post("/api/projects/{pid}/tasks/{key}/regenerate")
    def regenerate(pid: str, key: str, body: RegenerateIn | None = None):
        project_or_404(pid)
        return core.regenerate(pid, key, confirm=bool(body and body.confirm))

    # -- artefatti, validazioni, registro ------------------------------------------
    @app.get("/api/projects/{pid}/artifacts")
    def artifacts(pid: str):
        project_or_404(pid)
        return core.artifacts(pid)

    @app.get("/api/projects/{pid}/files")
    def read_file(pid: str, path: str):
        project = project_or_404(pid)
        p = core.workspace(project).resolve(path)
        if not p.is_file():
            raise HTTPException(404, "file inesistente")
        return FileResponse(p, filename=p.name)

    @app.post("/api/projects/{pid}/artifacts/review")
    def review(pid: str, body: ReviewIn):
        project_or_404(pid)
        return core.review_artifact(pid, body.path, body.decision, body.note)

    @app.get("/api/projects/{pid}/validations")
    def validations(pid: str):
        project_or_404(pid)
        return core.validations(pid)

    @app.get("/api/projects/{pid}/events")
    def events(pid: str):
        project_or_404(pid)
        return core.events(pid)

    @app.get("/api/projects/{pid}/report")
    def report(pid: str):
        project_or_404(pid)
        return core.report(pid)

    @app.post("/api/projects/{pid}/complete")
    def complete(pid: str, body: CompleteIn):
        project_or_404(pid)
        return core.declare_complete(pid, body.accept_exceptions, body.note)

    # -- UI statica (build del frontend), se presente ------------------------------------
    if static_dir and static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="ui")

    return app
