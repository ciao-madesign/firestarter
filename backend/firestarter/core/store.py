"""Persistenza dello stato operativo su SQLite (progetti, piani, task, artefatti, log)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'mixed', state TEXT NOT NULL DEFAULT 'draft',
  path TEXT NOT NULL, brief TEXT NOT NULL DEFAULT '{}', config TEXT NOT NULL DEFAULT '{}',
  workflows TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, rel_path TEXT NOT NULL, origin TEXT,
  sha256 TEXT, size INTEGER, kind TEXT, imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL, rationale TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, project_id TEXT NOT NULL, key TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workflow TEXT NOT NULL DEFAULT '',
  connector TEXT NOT NULL, operation TEXT NOT NULL, params TEXT NOT NULL DEFAULT '{}',
  depends_on TEXT NOT NULL DEFAULT '[]', inputs TEXT NOT NULL DEFAULT '[]',
  outputs TEXT NOT NULL DEFAULT '[]', validations TEXT NOT NULL DEFAULT '[]',
  manual_instructions TEXT NOT NULL DEFAULT '', optional INTEGER NOT NULL DEFAULT 0,
  sensitive INTEGER NOT NULL DEFAULT 0, confirmed INTEGER NOT NULL DEFAULT 0,
  spec_hash TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, result TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '', started_at TEXT, finished_at TEXT,
  UNIQUE(plan_id, key)
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, rel_path TEXT NOT NULL, kind TEXT NOT NULL,
  role TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, task_key TEXT, sha256 TEXT,
  review_state TEXT NOT NULL DEFAULT 'pending', depends_on TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, rel_path)
);
CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, version INTEGER NOT NULL,
  rel_path TEXT NOT NULL, sha256 TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validations (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_key TEXT, artifact_path TEXT,
  artifact_version INTEGER, check_name TEXT NOT NULL, criterion TEXT NOT NULL,
  passed INTEGER NOT NULL, severity TEXT NOT NULL, issues TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
  version TEXT, decision TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, ts TEXT NOT NULL, level TEXT NOT NULL,
  type TEXT NOT NULL, task_key TEXT, message TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
"""

JSON_COLS = {
    "brief", "config", "workflows", "params", "depends_on", "inputs", "outputs",
    "validations", "result", "issues", "data",
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _decode(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out = dict(row)
    for col in JSON_COLS & out.keys():
        if isinstance(out[col], str):
            out[col] = json.loads(out[col])
    return out


class Store:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        try:
            yield c
            c.commit()
        finally:
            c.close()

    # -- helpers generici -------------------------------------------------
    @staticmethod
    def _enc(values: dict[str, Any]) -> dict[str, Any]:
        return {k: json.dumps(v, ensure_ascii=False) if k in JSON_COLS else v for k, v in values.items()}

    def insert(self, table: str, values: dict[str, Any]) -> None:
        values = self._enc(values)
        cols = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        with self.conn() as c:
            c.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(values.values()))

    def update(self, table: str, id_: str, values: dict[str, Any]) -> None:
        values = self._enc(values)
        sets = ", ".join(f"{k}=?" for k in values)
        with self.conn() as c:
            c.execute(f"UPDATE {table} SET {sets} WHERE id=?", [*values.values(), id_])

    def one(self, sql: str, args: tuple = ()) -> dict[str, Any] | None:
        with self.conn() as c:
            return _decode(c.execute(sql, args).fetchone())

    def all(self, sql: str, args: tuple = ()) -> list[dict[str, Any]]:
        with self.conn() as c:
            return [_decode(r) for r in c.execute(sql, args).fetchall()]

    def execute(self, sql: str, args: tuple = ()) -> None:
        with self.conn() as c:
            c.execute(sql, args)

    # -- progetti ---------------------------------------------------------
    def create_project(self, **v: Any) -> dict[str, Any]:
        row = {"id": new_id(), "state": "draft", "created_at": now(), "updated_at": now(), **v}
        self.insert("projects", row)
        return self.get_project(row["id"])

    def get_project(self, id_: str) -> dict[str, Any] | None:
        return self.one("SELECT * FROM projects WHERE id=?", (id_,))

    def list_projects(self) -> list[dict[str, Any]]:
        return self.all("SELECT * FROM projects ORDER BY created_at DESC")

    def update_project(self, id_: str, **v: Any) -> None:
        self.update("projects", id_, {**v, "updated_at": now()})

    # -- piani e task -----------------------------------------------------
    def current_plan(self, project_id: str) -> dict[str, Any] | None:
        return self.one(
            "SELECT * FROM plans WHERE project_id=? AND status!='superseded' ORDER BY version DESC LIMIT 1",
            (project_id,),
        )

    def tasks(self, plan_id: str) -> list[dict[str, Any]]:
        return self.all("SELECT * FROM tasks WHERE plan_id=? ORDER BY position", (plan_id,))

    def get_task(self, plan_id: str, key: str) -> dict[str, Any] | None:
        return self.one("SELECT * FROM tasks WHERE plan_id=? AND key=?", (plan_id, key))

    def update_task(self, task_id: str, **v: Any) -> None:
        self.update("tasks", task_id, v)

    # -- eventi / registro operativo ---------------------------------------
    def add_event(
        self, project_id: str | None, type_: str, message: str, *, level: str = "info",
        task_key: str | None = None, data: dict | None = None,
    ) -> None:
        with self.conn() as c:
            c.execute(
                "INSERT INTO events (project_id, ts, level, type, task_key, message, data) VALUES (?,?,?,?,?,?,?)",
                (project_id, now(), level, type_, task_key, message, json.dumps(data or {}, ensure_ascii=False)),
            )

    def events(self, project_id: str, limit: int = 500) -> list[dict[str, Any]]:
        return self.all(
            "SELECT * FROM events WHERE project_id=? ORDER BY id DESC LIMIT ?", (project_id, limit)
        )[::-1]
