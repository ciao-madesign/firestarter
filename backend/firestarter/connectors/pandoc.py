"""Pandoc: conversione di documenti da riga di comando (Markdown -> DOCX/HTML/ODT...)."""

from __future__ import annotations

import shutil
import subprocess

from ..config import Settings
from ..core.types import ConnectorResult, Support
from .base import Capability, Connector, ConnectorStatus, ExecutionContext

TARGETS = {"docx", "html", "odt", "epub"}


class PandocConnector(Connector):
    id = "pandoc"
    name = "Pandoc"
    category = "document"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _exe(self) -> str | None:
        return self.settings.pandoc_path or shutil.which("pandoc")

    def status(self) -> ConnectorStatus:
        exe = self._exe()
        if not exe:
            return ConnectorStatus(available=False, detail="pandoc non trovato nel PATH (FIRESTARTER_PANDOC per indicarlo)")
        try:
            out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=15).stdout
            return ConnectorStatus(available=True, version=out.splitlines()[0] if out else "", detail=exe)
        except (OSError, subprocess.SubprocessError) as exc:
            return ConnectorStatus(available=False, detail=str(exc))

    def capabilities(self) -> list[Capability]:
        return [
            Capability(
                operation="convert",
                support=Support.LIMITED,
                description="Converte un documento (tipicamente Markdown) in un altro formato.",
                limitations=[
                    "verificato con test automatici solo per Markdown -> DOCX e HTML",
                    "PDF richiede un motore esterno (LaTeX): non supportato da questo connettore",
                ],
                permissions=["legge un file del progetto", "scrive un file del progetto", "esegue processi"],
            )
        ]

    def execute(self, operation: str, params: dict, ctx: ExecutionContext) -> ConnectorResult:
        if operation != "convert":
            return ConnectorResult(ok=False, message=f"operazione non supportata: {operation}")
        exe = self._exe()
        if not exe:
            return ConnectorResult(ok=False, message="pandoc non disponibile")
        ws = ctx.workspace
        src = ws.resolve(params["input"])
        dst = ws.resolve(params["output"], write=True)
        fmt = dst.suffix.lower().lstrip(".")
        if fmt not in TARGETS:
            return ConnectorResult(ok=False, message=f"formato di destinazione non supportato: {fmt}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        cmd = [exe, str(src), "-o", str(dst)]
        if params.get("standalone", fmt == "html"):
            cmd.append("--standalone")
        if params.get("reference_doc"):
            cmd += ["--reference-doc", str(ws.resolve(params["reference_doc"]))]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=self.settings.subprocess_timeout)
        except subprocess.TimeoutExpired:
            return ConnectorResult(ok=False, message="pandoc: timeout")
        if proc.returncode != 0:
            return ConnectorResult(ok=False, message=f"pandoc ha fallito: {proc.stderr.strip()[:500]}")
        return ConnectorResult(ok=True, message=f"convertito in {fmt}", outputs=[ws.rel(dst)])
