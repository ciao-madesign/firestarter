"""Tipi condivisi dal nucleo. Non dipendono da workflow o connettori concreti."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskState(str, Enum):
    PLANNED = "planned"  # da pianificare: piano non ancora approvato
    READY = "ready"  # pronta (piano approvato)
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"  # dipendenza fallita o strumento non disponibile
    WAITING_USER = "waiting_user"  # intervento manuale o conferma
    SKIPPED = "skipped"  # esclusa dall'utente


class Support(str, Enum):
    """Livello di supporto dichiarato da un connettore per una operazione (spec 6.5)."""

    VERIFIED = "verified"
    LIMITED = "limited"
    UNVERIFIED = "unverified"
    UNSUPPORTED = "unsupported"
    MANUAL = "manual"


class ValidationSpec(BaseModel):
    check: str
    target: str  # percorso relativo nel progetto
    params: dict[str, Any] = Field(default_factory=dict)
    severity: str = "error"  # "error" blocca il task, "warning" no


class TaskSpec(BaseModel):
    """Attivita' proposta da un workflow. Il nucleo la persiste come Task."""

    key: str
    title: str
    description: str = ""
    connector: str
    operation: str
    params: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    validations: list[ValidationSpec] = Field(default_factory=list)
    manual_instructions: str = ""
    optional: bool = False
    sensitive: bool = False  # richiede conferma esplicita prima dell'esecuzione


class Brief(BaseModel):
    goal: str = ""
    audience: str = ""
    constraints: str = ""
    formats: list[str] = Field(default_factory=list)
    style: str = ""
    quality: str = ""
    deadline: str = ""
    acceptance_criteria: str = ""
    language: str = "it"
    extra: dict[str, Any] = Field(default_factory=dict)  # campi specifici del workflow


class ProjectConfig(BaseModel):
    allow_external_ai: bool = False
    git: str = "off"  # off | copy | independent (spec 13.3, non ancora implementato)


class ConnectorResult(BaseModel):
    ok: bool
    message: str = ""
    outputs: list[str] = Field(default_factory=list)  # percorsi relativi al progetto
    details: dict[str, Any] = Field(default_factory=dict)


class NeedsUser(Exception):
    """Sollevata da un connettore quando serve un intervento manuale."""

    def __init__(self, instructions: str):
        super().__init__(instructions)
        self.instructions = instructions
