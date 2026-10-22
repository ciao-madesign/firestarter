"""Connettore che espone i provider AI come operazione 'generate' (testo su file)."""

from __future__ import annotations

from ..core.types import ConnectorResult, Support
from .base import Capability, Connector, ConnectorStatus, ExecutionContext


class AIConnector(Connector):
    id = "ai"
    name = "Modelli AI"
    category = "ai"

    def __init__(self, manager) -> None:
        self.manager = manager

    def status(self) -> ConnectorStatus:
        st = self.manager.status()
        ok = any(p["available"] for p in st["providers"])
        names = ", ".join(p["id"] for p in st["providers"] if p["available"]) or "nessun provider raggiungibile"
        return ConnectorStatus(available=ok, detail=names)

    def capabilities(self) -> list[Capability]:
        return [
            Capability(
                operation="generate",
                support=Support.LIMITED,
                description="Genera testo con il modello selezionato e lo salva in un file del progetto.",
                limitations=[
                    "solo testo: nessuna analisi di immagini o video presupposta",
                    "la correttezza del contenuto non e' garantita; servono validazioni e revisione umana",
                ],
                permissions=["legge i materiali citati nel prompt", "invia dati a provider esterni solo con consenso"],
            )
        ]

    def execute(self, operation: str, params: dict, ctx: ExecutionContext) -> ConnectorResult:
        if operation != "generate":
            return ConnectorResult(ok=False, message=f"operazione non supportata: {operation}")
        if not ctx.outputs:
            return ConnectorResult(ok=False, message="nessun output dichiarato per la generazione")
        text, meta = self.manager.generate(
            kind=params.get("kind", "generation"),
            prompt=params["prompt"],
            system=params.get("system", ""),
            model=params.get("model"),
            allow_external=bool(ctx.project["config"].get("allow_external_ai")),
        )
        out = ctx.workspace.resolve(ctx.outputs[0], write=True)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text.strip() + "\n", encoding="utf-8")
        return ConnectorResult(ok=True, message=f"generato con {meta['provider']}/{meta['model']}",
                               outputs=[ctx.workspace.rel(out)], details=meta)
