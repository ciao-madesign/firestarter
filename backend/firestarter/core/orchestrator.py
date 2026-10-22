"""Nucleo di orchestrazione: progetti, piano, approvazione, esecuzione, artefatti, rigenerazione.

Non contiene regole di nessuna categoria di progetto: conosce solo le interfacce
`Workflow` e `Connector`.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Any

from ..ai.manager import AIManager, AIUnavailable
from ..config import Settings
from ..connectors.base import ExecutionContext
from ..connectors.registry import ConnectorRegistry
from ..workflows.registry import WorkflowRegistry
from . import planner
from .store import Store, new_id, now
from .types import Brief, NeedsUser, ProjectConfig, Support, TaskSpec, TaskState
from .validation import run_check
from .workspace import FOLDERS, Workspace, safe_name, sha256_of

TEXT_EXT = {"md", "txt", "rst", "json", "yaml", "yml", "toml", "py", "js", "ts", "cs", "rs", "go", "java", "csv", "html"}
SECRET_KEYS = re.compile(r"(token|secret|password|api[_-]?key|authorization)", re.I)
DONE = {TaskState.COMPLETED.value, TaskState.SKIPPED.value}


class OrchestratorError(ValueError):
    pass


class ProtectedArtifacts(OrchestratorError):
    def __init__(self, paths: list[str]):
        super().__init__("artefatti approvati che verrebbero sovrascritti: " + ", ".join(paths))
        self.paths = paths


def _redact(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: "***" if SECRET_KEYS.search(k) else _redact(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_redact(v) for v in data]
    return data


class Orchestrator:
    def __init__(
        self, settings: Settings, store: Store, connectors: ConnectorRegistry,
        workflows: WorkflowRegistry, ai: AIManager,
    ) -> None:
        self.settings, self.store = settings, store
        self.connectors, self.workflows, self.ai = connectors, workflows, ai
        self._exec_lock = threading.Lock()  # una sola operazione impegnativa alla volta (RF-17)

    # ------------------------------------------------------------------ log
    def log(self, project: dict | None, type_: str, message: str, *, level: str = "info",
            task_key: str | None = None, data: dict | None = None) -> None:
        data = _redact(data or {})
        pid = project["id"] if project else None
        self.store.add_event(pid, type_, message, level=level, task_key=task_key, data=data)
        if project:
            try:
                logs = Path(project["path"]) / FOLDERS["logs"]
                logs.mkdir(parents=True, exist_ok=True)
                with open(logs / "run.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"ts": now(), "level": level, "type": type_, "task": task_key,
                                        "message": message, "data": data}, ensure_ascii=False) + "\n")
            except OSError:
                pass

    # ------------------------------------------------------------- progetti
    def _project(self, project_id: str) -> dict:
        p = self.store.get_project(project_id)
        if not p:
            raise OrchestratorError(f"progetto inesistente: {project_id}")
        return p

    def workspace(self, project: dict) -> Workspace:
        return Workspace(project["path"])

    def create_project(
        self, *, name: str, goal: str, workflows: list[str], brief: dict | None = None,
        config: dict | None = None, location: str | None = None,
    ) -> dict:
        if not name.strip() or not goal.strip():
            raise OrchestratorError("nome e obiettivo sono obbligatori")
        unknown = [w for w in workflows if not self.workflows.get(w)]
        if unknown:
            raise OrchestratorError(f"workflow sconosciuti: {', '.join(unknown)}")
        if not workflows:
            workflows = self.workflows.suggest(f"{name} {goal}")
        path = Path(location) if location else self.settings.projects_root / safe_name(name)
        if path.exists() and any(path.iterdir()):
            raise OrchestratorError(f"la cartella esiste gia' e non e' vuota: {path}")
        brief_model = Brief(**{**(brief or {}), "goal": (brief or {}).get("goal") or goal})
        cfg = ProjectConfig(**(config or {}))
        cats = {self.workflows.get(w).category for w in workflows}
        project = self.store.create_project(
            name=name.strip(), goal=goal.strip(), category=cats.pop() if len(cats) == 1 else "mixed",
            path=str(path.resolve()), brief=brief_model.model_dump(), config=cfg.model_dump(), workflows=workflows,
        )
        ws = self.workspace(project)
        ws.ensure()
        self._snapshot(project)
        self.log(project, "project.created", f"progetto creato: {project['name']}", data={"workflows": workflows})
        return project

    def update_brief(self, project_id: str, brief: dict) -> dict:
        project = self._project(project_id)
        merged = Brief(**{**project["brief"], **brief})
        self.store.update_project(project_id, brief=merged.model_dump(), goal=merged.goal or project["goal"])
        project = self._project(project_id)
        self._snapshot(project)
        self.log(project, "brief.updated", "brief aggiornato: rigenera il piano per vedere le attivita' interessate")
        return project

    def import_sources(self, project_id: str, path: str) -> list[dict]:
        project = self._project(project_id)
        ws = self.workspace(project)
        src = Path(path)
        if src.resolve().is_relative_to(ws.root):
            raise OrchestratorError("la sorgente e' gia' dentro il progetto")
        imported = ws.import_tree(src)
        for item in imported:
            self.store.execute("DELETE FROM sources WHERE project_id=? AND rel_path=?", (project_id, item["rel_path"]))
            self.store.insert("sources", {"id": new_id(), "project_id": project_id, "imported_at": now(), **item})
        has_git = src.is_dir() and (src / ".git").exists()
        self.log(project, "sources.imported", f"{len(imported)} file importati (copia protetta)",
                 data={"from": str(src), "git_repository": has_git})
        return self.store.all("SELECT * FROM sources WHERE project_id=? ORDER BY rel_path", (project_id,))

    def sources(self, project_id: str) -> list[dict]:
        return self.store.all("SELECT * FROM sources WHERE project_id=? ORDER BY rel_path", (project_id,))

    def _snapshot(self, project: dict) -> None:
        """Copia leggibile dello stato in 00_Project (brief, configurazione, stato)."""
        ws = self.workspace(project)
        proj = ws.root / FOLDERS["project"]
        proj.mkdir(parents=True, exist_ok=True)
        (proj / "brief.json").write_text(json.dumps(project["brief"], indent=2, ensure_ascii=False), encoding="utf-8")
        (proj / "configuration.json").write_text(
            json.dumps({"config": project["config"], "workflows": project["workflows"]}, indent=2), encoding="utf-8")
        (proj / "status.json").write_text(json.dumps(self.status(project["id"]), indent=2, ensure_ascii=False), encoding="utf-8")

    # --------------------------------------------------------------- template
    def _sources_text(self, project: dict, limit: int = 12000) -> str:
        ws, parts, used = self.workspace(project), [], 0
        rows = self.sources(project["id"])
        if not rows:
            return "(nessuna fonte importata)"
        for r in rows:
            line = f"- {r['rel_path']} ({r['size']} byte)"
            if (r["kind"] or "") in TEXT_EXT and used < limit:
                snippet = ws.read_text(r["rel_path"], 2000)
                used += len(snippet)
                line += "\n```\n" + snippet + "\n```"
            parts.append(line)
        return "\n".join(parts)

    def _render(self, value: Any, project: dict, ws: Workspace) -> Any:
        if isinstance(value, dict):
            return {k: self._render(v, project, ws) for k, v in value.items()}
        if isinstance(value, list):
            return [self._render(v, project, ws) for v in value]
        if not isinstance(value, str):
            return value
        brief = project["brief"]

        def sub(m: re.Match) -> str:
            name = m.group(1)
            if name.startswith("file:"):
                return ws.read_text(name[5:])
            if name == "sources":
                return self._sources_text(project)
            if name in Brief.model_fields and name != "extra":
                val = brief.get(name, "")
                return ", ".join(val) if isinstance(val, list) else str(val or "(non specificato)")
            return m.group(0)

        return re.sub(r"\{(file:[^}]+|\w+)\}", sub, value)

    def _render_for_hash(self, value: Any, project: dict) -> Any:
        """Come _render ma senza leggere file: il contenuto dei file e' tracciato dalle dipendenze."""
        if isinstance(value, dict):
            return {k: self._render_for_hash(v, project) for k, v in value.items()}
        if isinstance(value, list):
            return [self._render_for_hash(v, project) for v in value]
        if not isinstance(value, str):
            return value
        brief = project["brief"]

        def sub(m: re.Match) -> str:
            name = m.group(1)
            if name.startswith("file:") or name == "sources":
                return m.group(0)
            if name in Brief.model_fields and name != "extra":
                val = brief.get(name, "")
                return ", ".join(val) if isinstance(val, list) else str(val or "")
            return m.group(0)

        return re.sub(r"\{(file:[^}]+|\w+)\}", sub, value)

    # ----------------------------------------------------------------- piano
    def build_specs(self, project: dict) -> list[TaskSpec]:
        specs: list[TaskSpec] = []
        for wid in project["workflows"]:
            wf = self.workflows.get(wid)
            if wf is None:
                raise OrchestratorError(f"workflow non installato: {wid}")
            specs += planner.qualify(wid, wf.build_tasks(project))
        return planner.topological_order(specs)

    def generate_plan(self, project_id: str) -> dict:
        project = self._project(project_id)
        try:
            specs = self.build_specs(project)
        except planner.PlanError as exc:
            raise OrchestratorError(f"piano non valido: {exc}") from exc
        old = self.store.current_plan(project_id)
        old_tasks = {t["key"]: t for t in self.store.tasks(old["id"])} if old else {}
        if old and any(t["state"] == TaskState.RUNNING.value for t in old_tasks.values()):
            raise OrchestratorError("c'e' un'attivita' in esecuzione: attendi prima di ricalcolare il piano")
        version = (old["version"] + 1) if old else 1
        plan_id = new_id()
        hashes = {s.key: planner.spec_hash(s, self._render_for_hash(s.params, project)) for s in specs}
        changed: list[str] = []
        carried: dict[str, dict] = {}
        for s in specs:  # in ordine topologico: un task cambiato invalida i dipendenti
            prev = old_tasks.get(s.key)
            same = (prev and prev["spec_hash"] == hashes[s.key] and prev["state"] in DONE
                    and all(d in carried for d in s.depends_on))
            if same:
                carried[s.key] = prev
            elif not prev or prev["state"] in DONE:
                changed.append(s.key)  # nuovo, o gia' completato ma con input/parametri diversi
        if old:
            self.store.update("plans", old["id"], {"status": "superseded"})
        self.store.insert("plans", {
            "id": plan_id, "project_id": project_id, "version": version, "status": "draft", "created_at": now(),
            "rationale": "Workflow selezionati: " + ", ".join(project["workflows"])
            + ". Le attivita' AI usano i provider configurati; le conversioni usano strumenti deterministici.",
        })
        for pos, s in enumerate(specs):
            prev = carried.get(s.key)
            self.store.insert("tasks", {
                "id": new_id(), "plan_id": plan_id, "project_id": project_id, "key": s.key, "title": s.title,
                "description": s.description, "workflow": s.key.split(".", 1)[0], "connector": s.connector,
                "operation": s.operation, "params": s.params, "depends_on": s.depends_on, "inputs": s.inputs,
                "outputs": s.outputs, "validations": [v.model_dump() for v in s.validations],
                "manual_instructions": s.manual_instructions, "optional": int(s.optional),
                "sensitive": int(s.sensitive), "confirmed": 0, "spec_hash": hashes[s.key], "position": pos,
                "state": prev["state"] if prev else TaskState.PLANNED.value,
                "attempts": prev["attempts"] if prev else 0, "result": prev["result"] if prev else {},
                "error": "",
            })
        self.store.update_project(project_id, state="planned")
        self.log(project, "plan.generated", f"piano v{version}: {len(specs)} attivita'",
                 data={"changed": changed, "reused": sorted(carried)})
        return self.plan_view(project_id) | {"changed": changed, "reused": sorted(carried)}

    def plan_view(self, project_id: str) -> dict | None:
        plan = self.store.current_plan(project_id)
        if not plan:
            return None
        tasks = self.store.tasks(plan["id"])
        specs = [TaskSpec(key=t["key"], title=t["title"], connector=t["connector"], operation=t["operation"],
                          depends_on=t["depends_on"]) for t in tasks]
        return {"plan": plan, "tasks": tasks, "levels": planner.parallel_levels(specs)}

    def _draft_plan(self, project_id: str) -> tuple[dict, list[dict]]:
        plan = self.store.current_plan(project_id)
        if not plan:
            raise OrchestratorError("genera prima un piano")
        if plan["status"] != "draft":
            raise OrchestratorError("il piano e' gia' approvato: ricalcolalo per modificarlo")
        return plan, self.store.tasks(plan["id"])

    def set_excluded(self, project_id: str, key: str, excluded: bool) -> dict:
        plan, tasks = self._draft_plan(project_id)
        task = next((t for t in tasks if t["key"] == key), None)
        if not task:
            raise OrchestratorError(f"attivita' inesistente: {key}")
        if excluded:
            blockers = [t["key"] for t in tasks if key in t["depends_on"] and t["state"] != TaskState.SKIPPED.value]
            if blockers:
                raise OrchestratorError(f"non escludibile: ne dipendono {', '.join(blockers)} (escludi prima quelle)")
        else:
            gone = [d for d in task["depends_on"]
                    if next(t for t in tasks if t["key"] == d)["state"] == TaskState.SKIPPED.value]
            if gone:
                raise OrchestratorError(f"reinclusione impossibile: dipende da attivita' escluse ({', '.join(gone)})")
        new_state = TaskState.SKIPPED.value if excluded else TaskState.PLANNED.value
        self.store.update_task(task["id"], state=new_state)
        self.log(self._project(project_id), "plan.edited", f"{key}: {'esclusa' if excluded else 'reinclusa'}", task_key=key)
        return self.plan_view(project_id)

    def reorder(self, project_id: str, keys: list[str]) -> dict:
        plan, tasks = self._draft_plan(project_id)
        if sorted(keys) != sorted(t["key"] for t in tasks):
            raise OrchestratorError("l'ordine deve contenere tutte le attivita' una sola volta")
        pos = {k: i for i, k in enumerate(keys)}
        for t in tasks:
            for d in t["depends_on"]:
                if pos[d] > pos[t["key"]]:
                    raise OrchestratorError(f"{t['key']} non puo' precedere {d} da cui dipende")
        for t in tasks:
            self.store.update_task(t["id"], position=pos[t["key"]])
        self.log(self._project(project_id), "plan.edited", "ordine delle attivita' modificato")
        return self.plan_view(project_id)

    def approve_plan(self, project_id: str, note: str = "") -> dict:
        project = self._project(project_id)
        plan, tasks = self._draft_plan(project_id)
        for t in tasks:
            if t["state"] in DONE:
                continue  # eredita' da un piano precedente o esclusa
            self.store.update_task(t["id"], state=TaskState.READY.value)
        self.store.update("plans", plan["id"], {"status": "approved", "approved_at": now()})
        self.store.insert("approvals", {"id": new_id(), "project_id": project_id, "object_type": "plan",
                                        "object_id": plan["id"], "version": str(plan["version"]),
                                        "decision": "approved", "note": note, "created_at": now()})
        self.store.update_project(project_id, state="approved")
        view = self.plan_view(project_id)
        ws = self.workspace(project)
        (ws.root / FOLDERS["project"] / "approved-plan.json").write_text(
            json.dumps(view, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        self.log(project, "plan.approved", f"piano v{plan['version']} approvato")
        return view

    # ------------------------------------------------------------ esecuzione
    def recover(self) -> int:
        """Ripresa dopo chiusura/interruzione (RNF-05): i task rimasti 'running' tornano pronti."""
        rows = self.store.all("SELECT * FROM tasks WHERE state=?", (TaskState.RUNNING.value,))
        for t in rows:
            self.store.update_task(t["id"], state=TaskState.READY.value, error="interrotta: ripresa automatica")
            self.log(self.store.get_project(t["project_id"]), "task.recovered",
                     f"{t['key']} interrotta, rimessa in coda", level="warning", task_key=t["key"])
        return len(rows)

    def _next_task(self, tasks: list[dict]) -> dict | None:
        state = {t["key"]: t["state"] for t in tasks}
        for t in tasks:
            if t["state"] == TaskState.READY.value and all(state[d] in DONE for d in t["depends_on"]):
                return t
        return None

    def _block_dependents(self, plan_id: str, key: str, reason: str) -> None:
        tasks = self.store.tasks(plan_id)
        for k in planner.dependents_of([key], tasks):
            t = next(x for x in tasks if x["key"] == k)
            if t["state"] in (TaskState.READY.value, TaskState.PLANNED.value, TaskState.BLOCKED.value):
                self.store.update_task(t["id"], state=TaskState.BLOCKED.value, error=f"dipende da {key}: {reason}")

    def step(self, project_id: str) -> dict | None:
        """Esegue la prossima attivita' pronta. Ritorna il task aggiornato o None se non c'e' nulla da fare."""
        project = self._project(project_id)
        plan = self.store.current_plan(project_id)
        if not plan or plan["status"] != "approved":
            raise OrchestratorError("nessun piano approvato: l'esecuzione non puo' iniziare (CA-04)")
        with self._exec_lock:
            task = self._next_task(self.store.tasks(plan["id"]))
            if task is None:
                self._refresh_state(project_id)
                return None
            self._run_task(project, plan, task)
            self._refresh_state(project_id)
            return self.store.get_task(plan["id"], task["key"])

    def run_all(self, project_id: str, stop: threading.Event | None = None) -> list[str]:
        ran = []
        while not (stop and stop.is_set()):
            t = self.step(project_id)
            if t is None:
                break
            ran.append(t["key"])
        return ran

    def _fail(self, project: dict, plan: dict, task: dict, message: str, *, state: TaskState = TaskState.FAILED,
              details: dict | None = None) -> None:
        self.store.update_task(task["id"], state=state.value, error=message, finished_at=now(),
                               result=details or {})
        self.log(project, f"task.{state.value}", f"{task['key']}: {message}", level="error", task_key=task["key"],
                 data=details)
        self._block_dependents(plan["id"], task["key"], message)

    def _run_task(self, project: dict, plan: dict, task: dict) -> None:
        key, ws = task["key"], self.workspace(project)
        self.store.update_task(task["id"], state=TaskState.RUNNING.value, attempts=task["attempts"] + 1,
                               started_at=now(), finished_at=None, error="")
        self.log(project, "task.started", f"{key}: avvio ({task['connector']}.{task['operation']})", task_key=key)

        if task["connector"] == "manual":
            instr = task["params"].get("instructions") or task["manual_instructions"]
            self.store.update_task(task["id"], state=TaskState.WAITING_USER.value, error=instr)
            self.log(project, "task.waiting_user", f"{key}: serve un intervento manuale", task_key=key,
                     data={"instructions": instr})
            return

        conn = self.connectors.get(task["connector"])
        if conn is None:
            return self._fail(project, plan, task, f"connettore sconosciuto: {task['connector']}", state=TaskState.BLOCKED)
        st = conn.status()
        if not st.available:
            alt = task["manual_instructions"] or "Installa/avvia lo strumento e riprova, oppure produci l'output a mano e conferma."
            return self._fail(project, plan, task, f"{conn.name} non disponibile: {st.detail}. {alt}", state=TaskState.BLOCKED)
        cap = conn.capability(task["operation"])
        if cap is None or cap.support == Support.UNSUPPORTED:
            return self._fail(project, plan, task, f"operazione non supportata da {conn.name}: {task['operation']}",
                              state=TaskState.BLOCKED)
        if (task["sensitive"] or cap.sensitive) and not task["confirmed"]:
            self.store.update_task(task["id"], state=TaskState.WAITING_USER.value,
                                   error="operazione sensibile: conferma esplicita richiesta")
            self.log(project, "task.waiting_user", f"{key}: attesa conferma (operazione sensibile)", task_key=key)
            return

        # i percorsi di output devono restare nel progetto e fuori dalle fonti originali
        try:
            for o in task["outputs"]:
                ws.resolve(o, write=True)
            params = self._render(task["params"], project, ws)
        except (PermissionError, FileNotFoundError, OSError) as exc:
            return self._fail(project, plan, task, str(exc))

        prior = self._archive_outputs(project, ws, task)
        ctx = ExecutionContext(workspace=ws, project=project, ai=self.ai, outputs=list(task["outputs"]))
        try:
            result = conn.execute(task["operation"], params, ctx)
        except NeedsUser as exc:
            self.store.update_task(task["id"], state=TaskState.WAITING_USER.value, error=exc.instructions)
            self.log(project, "task.waiting_user", f"{key}: serve un intervento manuale", task_key=key)
            return
        except AIUnavailable as exc:
            return self._fail(project, plan, task, str(exc), state=TaskState.BLOCKED)
        except PermissionError as exc:
            return self._fail(project, plan, task, f"permesso negato: {exc}")
        except Exception as exc:  # noqa: BLE001 - qualsiasi errore va registrato, mai presentato come successo
            return self._fail(project, plan, task, f"errore imprevisto: {exc}", details={"type": type(exc).__name__})
        if not result.ok:
            return self._fail(project, plan, task, result.message or "operazione fallita", details=result.details)

        declared = task["outputs"] or result.outputs
        missing = [o for o in declared if not (ws.resolve(o).is_file() and ws.resolve(o).stat().st_size > 0)]
        if missing:  # non si dichiara completato un task solo perche' lo strumento e' partito
            return self._fail(project, plan, task, "output attesi mancanti o vuoti: " + ", ".join(missing),
                              details=result.details)
        self._register_artifacts(project, ws, plan, task, declared, prior)
        failed = self._validate(project, ws, task)
        if failed:
            return self._fail(project, plan, task, "validazione fallita: " + "; ".join(failed),
                              details=result.details)
        self.store.update_task(task["id"], state=TaskState.COMPLETED.value, finished_at=now(),
                               result={"message": result.message, "outputs": declared, **result.details}, error="")
        self.log(project, "task.completed", f"{key}: completata - {result.message}", task_key=key)

    # -------------------------------------------------------------- artefatti
    def _archive_outputs(self, project: dict, ws: Workspace, task: dict) -> dict[str, dict]:
        prior = {}
        for rel in task["outputs"]:
            art = self.store.one("SELECT * FROM artifacts WHERE project_id=? AND rel_path=?", (project["id"], rel))
            if art and ws.resolve(rel).is_file():
                saved = ws.archive_existing(rel, art["version"])
                self.store.execute("DELETE FROM artifact_versions WHERE artifact_id=? AND version=?",
                                   (art["id"], art["version"]))
                self.store.insert("artifact_versions", {"id": new_id(), "artifact_id": art["id"],
                                                        "version": art["version"], "rel_path": saved,
                                                        "sha256": art["sha256"], "created_at": now()})
                prior[rel] = art
        return prior

    def _register_artifacts(self, project, ws, plan, task, declared, prior) -> None:
        tasks = {t["key"]: t for t in self.store.tasks(plan["id"])}
        sources = sorted({o for d in task["depends_on"] for o in tasks[d]["outputs"]})
        for rel in declared:
            digest = sha256_of(ws.resolve(rel))
            old = prior.get(rel) or self.store.one(
                "SELECT * FROM artifacts WHERE project_id=? AND rel_path=?", (project["id"], rel))
            if old:
                self.store.update("artifacts", old["id"], {
                    "version": old["version"] + 1, "sha256": digest, "review_state": "pending",
                    "task_key": task["key"], "depends_on": sources, "updated_at": now()})
            else:
                self.store.insert("artifacts", {
                    "id": new_id(), "project_id": project["id"], "rel_path": rel,
                    "kind": Path(rel).suffix.lower().lstrip(".") or "file", "role": ws.role_of(rel),
                    "version": 1, "task_key": task["key"], "sha256": digest, "review_state": "pending",
                    "depends_on": sources, "created_at": now(), "updated_at": now()})

    def _validate(self, project: dict, ws: Workspace, task: dict) -> list[str]:
        errors = []
        for v in task["validations"]:
            path = ws.resolve(v["target"])
            res = run_check(v["check"], path, v.get("params", {}), ws)
            art = self.store.one("SELECT * FROM artifacts WHERE project_id=? AND rel_path=?", (project["id"], v["target"]))
            self.store.insert("validations", {
                "id": new_id(), "project_id": project["id"], "task_key": task["key"], "artifact_path": v["target"],
                "artifact_version": art["version"] if art else None, "check_name": v["check"],
                "criterion": res.criterion, "passed": int(res.passed), "severity": v.get("severity", "error"),
                "issues": res.issues, "created_at": now()})
            if not res.passed:
                self.log(project, "validation.failed", f"{v['check']} su {v['target']}: {'; '.join(res.issues)}",
                         level="error" if v.get("severity", "error") == "error" else "warning", task_key=task["key"])
                if v.get("severity", "error") == "error":
                    errors.append(f"{v['check']}({v['target']}): {'; '.join(res.issues)}")
        return errors

    def artifacts(self, project_id: str) -> list[dict]:
        rows = self.store.all("SELECT * FROM artifacts WHERE project_id=? ORDER BY rel_path", (project_id,))
        for r in rows:
            r["versions"] = self.store.all(
                "SELECT version, rel_path, sha256, created_at FROM artifact_versions WHERE artifact_id=? ORDER BY version",
                (r["id"],))
        return rows

    def validations(self, project_id: str) -> list[dict]:
        return self.store.all("SELECT * FROM validations WHERE project_id=? ORDER BY created_at DESC, rowid DESC",
                              (project_id,))

    def review_artifact(self, project_id: str, rel_path: str, decision: str, note: str = "") -> dict:
        if decision not in ("approved", "changes_requested", "rejected"):
            raise OrchestratorError("decisione non valida")
        art = self.store.one("SELECT * FROM artifacts WHERE project_id=? AND rel_path=?", (project_id, rel_path))
        if not art:
            raise OrchestratorError(f"artefatto sconosciuto: {rel_path}")
        self.store.update("artifacts", art["id"], {"review_state": decision, "updated_at": now()})
        self.store.insert("approvals", {"id": new_id(), "project_id": project_id, "object_type": "artifact",
                                        "object_id": rel_path, "version": str(art["version"]),
                                        "decision": decision, "note": note, "created_at": now()})
        self.log(self._project(project_id), "artifact.reviewed", f"{rel_path} v{art['version']}: {decision}", data={"note": note})
        return self.store.one("SELECT * FROM artifacts WHERE id=?", (art["id"],))

    # ---------------------------------------------------- interventi / ripresa
    def _task(self, project_id: str, key: str) -> tuple[dict, dict, dict]:
        project = self._project(project_id)
        plan = self.store.current_plan(project_id)
        task = self.store.get_task(plan["id"], key) if plan else None
        if not task:
            raise OrchestratorError(f"attivita' inesistente: {key}")
        return project, plan, task

    def confirm_task(self, project_id: str, key: str) -> dict:
        project, plan, task = self._task(project_id, key)
        if task["state"] != TaskState.WAITING_USER.value:
            raise OrchestratorError("l'attivita' non attende conferme")
        self.store.update_task(task["id"], confirmed=1, state=TaskState.READY.value, error="")
        self.store.insert("approvals", {"id": new_id(), "project_id": project_id, "object_type": "task",
                                        "object_id": key, "version": str(plan["version"]), "decision": "confirmed",
                                        "note": "", "created_at": now()})
        self.log(project, "task.confirmed", f"{key}: confermata dall'utente", task_key=key)
        return self.store.get_task(plan["id"], key)

    def complete_manual(self, project_id: str, key: str, note: str = "") -> dict:
        project, plan, task = self._task(project_id, key)
        if task["state"] != TaskState.WAITING_USER.value:
            raise OrchestratorError("l'attivita' non attende un intervento manuale")
        ws = self.workspace(project)
        missing = [o for o in task["outputs"] if not ws.resolve(o).is_file()]
        if missing:
            raise OrchestratorError("output ancora mancanti: " + ", ".join(missing))
        self._register_artifacts(project, ws, plan, task, task["outputs"], {})
        failed = self._validate(project, ws, task)
        if failed:
            self._fail(project, plan, task, "validazione fallita: " + "; ".join(failed))
            return self.store.get_task(plan["id"], key)
        self.store.update_task(task["id"], state=TaskState.COMPLETED.value, finished_at=now(), error="",
                               result={"manual": True, "note": note})
        self.log(project, "task.completed", f"{key}: completata manualmente", task_key=key, data={"note": note})
        self._refresh_state(project_id)
        return self.store.get_task(plan["id"], key)

    def retry_task(self, project_id: str, key: str) -> dict:
        project, plan, task = self._task(project_id, key)
        if task["state"] not in (TaskState.FAILED.value, TaskState.BLOCKED.value):
            raise OrchestratorError("solo attivita' fallite o bloccate possono essere ritentate")
        tasks = self.store.tasks(plan["id"])
        self.store.update_task(task["id"], state=TaskState.READY.value, error="")
        for k in planner.dependents_of([key], tasks):
            t = next(x for x in tasks if x["key"] == k)
            if t["state"] == TaskState.BLOCKED.value:
                self.store.update_task(t["id"], state=TaskState.READY.value, error="")
        self.log(project, "task.retry", f"{key}: nuovo tentativo", task_key=key)
        return self.store.get_task(plan["id"], key)

    def regenerate(self, project_id: str, key: str, *, confirm: bool = False) -> dict:
        """Rigenerazione selettiva (RF-36): solo il task e i suoi dipendenti, non l'intero progetto."""
        project, plan, task = self._task(project_id, key)
        if plan["status"] != "approved":
            raise OrchestratorError("approva il piano prima di rigenerare")
        tasks = self.store.tasks(plan["id"])
        affected = {key} | planner.dependents_of([key], tasks)
        outputs = [o for t in tasks if t["key"] in affected for o in t["outputs"]]
        protected = [a["rel_path"] for a in self.store.all(
            "SELECT * FROM artifacts WHERE project_id=? AND review_state='approved'", (project_id,))
            if a["rel_path"] in outputs]
        if protected and not confirm:
            raise ProtectedArtifacts(protected)
        for t in tasks:
            if t["key"] in affected and t["state"] != TaskState.SKIPPED.value:
                self.store.update_task(t["id"], state=TaskState.READY.value, error="", confirmed=0)
        self.log(project, "task.regenerate", f"{key}: rigenerazione di {len(affected)} attivita' collegate",
                 task_key=key, data={"affected": sorted(affected), "overwrites_approved": protected})
        return {"affected": sorted(affected), "protected": protected}

    # ----------------------------------------------------------------- stato
    def _refresh_state(self, project_id: str) -> None:
        st = self.status(project_id)["state"]
        self.store.update_project(project_id, state=st)

    def status(self, project_id: str) -> dict:
        project = self._project(project_id)
        plan = self.store.current_plan(project_id)
        counts = {s.value: 0 for s in TaskState}
        attention: list[dict] = []
        tasks: list[dict] = []
        if plan:
            tasks = self.store.tasks(plan["id"])
            for t in tasks:
                counts[t["state"]] += 1
                if t["state"] in (TaskState.FAILED.value, TaskState.BLOCKED.value, TaskState.WAITING_USER.value):
                    attention.append({"key": t["key"], "title": t["title"], "state": t["state"], "message": t["error"]})
        required = [t for t in tasks if not t["optional"] and t["state"] != TaskState.SKIPPED.value]
        done = [t for t in required if t["state"] == TaskState.COMPLETED.value]
        if not plan:
            state = "draft"
        elif plan["status"] == "draft":
            state = "planned"
        elif required and len(done) == len(required):
            state = "completed"
        elif any(t["state"] in (TaskState.FAILED.value, TaskState.BLOCKED.value, TaskState.WAITING_USER.value)
                 for t in tasks):
            state = "needs_attention"
        elif any(t["state"] == TaskState.RUNNING.value for t in tasks):
            state = "running"
        else:
            state = "approved"
        return {
            "project_id": project_id, "state": state, "counts": counts, "attention": attention,
            "progress": {"done": len(done), "total": len(required)},
            "plan_version": plan["version"] if plan else None, "plan_status": plan["status"] if plan else None,
            "name": project["name"],
        }

    def declare_complete(self, project_id: str, accept_exceptions: bool = False, note: str = "") -> dict:
        """RF-48: consegna solo a criteri soddisfatti, o con eccezioni accettate esplicitamente."""
        st = self.status(project_id)
        if st["state"] != "completed" and not accept_exceptions:
            raise OrchestratorError("criteri di accettazione non soddisfatti: accetta esplicitamente le eccezioni per procedere")
        self.store.insert("approvals", {"id": new_id(), "project_id": project_id, "object_type": "project",
                                        "object_id": project_id, "version": str(st["plan_version"]),
                                        "decision": "delivered" if st["state"] == "completed" else "delivered_with_exceptions",
                                        "note": note, "created_at": now()})
        self.store.update_project(project_id, state="delivered")
        self.log(self._project(project_id), "project.delivered", "progetto dichiarato completato",
                 data={"exceptions": st["state"] != "completed", "note": note})
        return {**st, "state": "delivered"}

    def events(self, project_id: str) -> list[dict]:
        self._project(project_id)
        return self.store.events(project_id)

    def report(self, project_id: str) -> dict:
        """Rapporto diagnostico (CA-16): attivita' eseguite, errori e interventi manuali."""
        plan = self.store.current_plan(project_id)
        tasks = self.store.tasks(plan["id"]) if plan else []
        ev = self.events(project_id)
        return {
            "status": self.status(project_id),
            "tasks": [{k: t[k] for k in ("key", "title", "state", "attempts", "error", "started_at", "finished_at")}
                      for t in tasks],
            "errors": [e for e in ev if e["level"] == "error"],
            "manual": [e for e in ev if e["type"] in ("task.waiting_user", "task.confirmed")]
            + [e for e in ev if e["type"] == "task.completed" and "manualmente" in e["message"]],
            "validation_failures": [v for v in self.validations(project_id) if not v["passed"]],
        }
