"""Utility per i file del progetto (copie interne, consegna)."""

from __future__ import annotations

import shutil

from ..core.types import ConnectorResult, Support
from .base import Capability, Connector, ConnectorStatus, ExecutionContext


class FilesConnector(Connector):
    id = "files"
    name = "File di progetto"
    category = "utility"

    def status(self) -> ConnectorStatus:
        return ConnectorStatus(available=True, detail="integrato")

    def capabilities(self) -> list[Capability]:
        return [
            Capability(
                operation="copy",
                support=Support.VERIFIED,
                description="Copia file all'interno del progetto (mai nelle fonti originali).",
                permissions=["legge e scrive nel progetto"],
            )
        ]

    def execute(self, operation: str, params: dict, ctx: ExecutionContext) -> ConnectorResult:
        if operation != "copy":
            return ConnectorResult(ok=False, message=f"operazione non supportata: {operation}")
        ws = ctx.workspace
        outputs = []
        for item in params.get("items", []):
            src = ws.resolve(item["from"])
            dst = ws.resolve(item["to"], write=True)
            if not src.is_file():
                return ConnectorResult(ok=False, message=f"sorgente mancante: {item['from']}")
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            outputs.append(ws.rel(dst))
        return ConnectorResult(ok=True, message=f"{len(outputs)} file copiati", outputs=outputs)
