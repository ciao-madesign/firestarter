"""Interfaccia dei workflow (M8). Un workflow traduce un obiettivo in attivita' e controlli."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..core.types import TaskSpec


class Workflow(ABC):
    id: str
    name: str
    category: str  # technical_docs | graphics | multimedia | editorial
    version: str = "1"
    description: str = ""
    accepted_inputs: list[str] = []
    expected_outputs: list[str] = []
    connectors: list[str] = []  # connettori usabili (informativo)
    human_approvals: list[str] = []

    @abstractmethod
    def build_tasks(self, project: dict[str, Any]) -> list[TaskSpec]:
        """Attivita' con chiavi e dipendenze locali (il nucleo aggiunge il prefisso del workflow)."""

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "version": self.version,
            "description": self.description,
            "accepted_inputs": self.accepted_inputs,
            "expected_outputs": self.expected_outputs,
            "connectors": self.connectors,
            "human_approvals": self.human_approvals,
        }


def brief_block() -> str:
    return (
        "Obiettivo: {goal}\nDestinatari: {audience}\nVincoli: {constraints}\nStile: {style}\n"
        "Qualita' attesa: {quality}\nCriteri di completamento: {acceptance_criteria}\n"
        "Lingua di output: {language}"
    )
