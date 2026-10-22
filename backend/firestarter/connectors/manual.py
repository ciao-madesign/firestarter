"""Intervento manuale guidato: quando non esiste un'integrazione affidabile (spec 6.4)."""

from __future__ import annotations

from ..core.types import ConnectorResult, NeedsUser, Support
from .base import Capability, Connector, ConnectorStatus, ExecutionContext


class ManualConnector(Connector):
    id = "manual"
    name = "Intervento manuale"
    category = "manual"

    def status(self) -> ConnectorStatus:
        return ConnectorStatus(available=True, detail="sempre disponibile")

    def capabilities(self) -> list[Capability]:
        return [
            Capability(
                operation="instruct",
                support=Support.MANUAL,
                description="Mostra istruzioni all'utente e attende la conferma; verifica gli output dichiarati.",
            )
        ]

    def execute(self, operation: str, params: dict, ctx: ExecutionContext) -> ConnectorResult:
        raise NeedsUser(params.get("instructions", "Completa l'attivita' manualmente e conferma."))
