"""Interfaccia dei connettori. Il nucleo conosce solo questa, mai i dettagli delle applicazioni."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from ..core.types import ConnectorResult, Support

if TYPE_CHECKING:
    from ..ai.manager import AIManager
    from ..core.workspace import Workspace


class Capability(BaseModel):
    operation: str
    support: Support
    description: str = ""
    limitations: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)  # es. "legge il progetto", "esegue processi"
    sensitive: bool = False


class ConnectorStatus(BaseModel):
    available: bool
    version: str = ""
    detail: str = ""


@dataclass
class ExecutionContext:
    workspace: "Workspace"
    project: dict[str, Any]
    ai: "AIManager | None" = None
    outputs: list[str] = field(default_factory=list)  # output dichiarati dal task


class Connector(ABC):
    id: str
    name: str
    category: str = "utility"

    @abstractmethod
    def status(self) -> ConnectorStatus: ...

    @abstractmethod
    def capabilities(self) -> list[Capability]: ...

    @abstractmethod
    def execute(self, operation: str, params: dict[str, Any], ctx: ExecutionContext) -> ConnectorResult: ...

    def capability(self, operation: str) -> Capability | None:
        return next((c for c in self.capabilities() if c.operation == operation), None)

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "status": self.status().model_dump(),
            "capabilities": [c.model_dump() for c in self.capabilities()],
        }
