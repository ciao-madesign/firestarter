"""Connettore generico per le app ArtCraft tramite i loro CLI (`<app>-cli`).

Le app espongono CLI, MCP e canale di controllo JSON, ma sono in alpha: nessuna operazione
viene dichiarata 'verified' finche' non esiste un test ripetibile (spec 6.5, RNF-14).
Il CLI e' usato senza shell, con percorsi confinati nella cartella di progetto.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from ..config import Settings
from ..core.types import ConnectorResult, Support
from .base import Capability, Connector, ConnectorStatus, ExecutionContext

ARTCRAFT_APPS = {
    "photocraft": "Editing di immagini raster",
    "lightcraft": "Sviluppo fotografico non distruttivo",
    "vectorcraft": "Grafica vettoriale",
    "filmcraft": "Montaggio video",
    "designcraft": "Impaginazione (DTP)",
    "deckcraft": "Presentazioni (.pptx)",
    "cadcraft": "CAD 2D (DXF)",
}

_WINDOWS_DIRS = ("C:\\Program Files\\{Name}", "C:\\Program Files (x86)\\{Name}")


class ArtCraftCliConnector(Connector):
    category = "artcraft"

    def __init__(self, app: str, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self.id = f"artcraft.{app}"
        self.name = f"{app.capitalize()} (ArtCraft)"
        self.description = ARTCRAFT_APPS[app]

    def _exe(self) -> str | None:
        configured = self.settings.artcraft_paths.get(self.app)
        if configured and Path(configured).exists():
            return configured
        cli = f"{self.app}-cli"
        found = shutil.which(cli)
        if found:
            return found
        if os.name == "nt":
            for tpl in _WINDOWS_DIRS:
                cand = Path(tpl.format(Name=self.app.capitalize())) / f"{cli}.exe"
                if cand.exists():
                    return str(cand)
        return None

    def status(self) -> ConnectorStatus:
        exe = self._exe()
        if not exe:
            return ConnectorStatus(
                available=False,
                detail=f"{self.app}-cli non trovato: installa l'app o indica il percorso nelle impostazioni",
            )
        return ConnectorStatus(available=True, detail=exe)

    def capabilities(self) -> list[Capability]:
        base = ["interfaccia alpha: comandi e formati possono cambiare", "nessun test di compatibilita' ripetibile ancora disponibile"]
        return [
            Capability(
                operation="commands.list",
                support=Support.LIMITED,
                description=f"Elenca i comandi esposti da {self.app}-cli.",
                limitations=base,
                permissions=["esegue processi"],
            ),
            Capability(
                operation="cli.run",
                support=Support.UNVERIFIED,
                description=f"Esegue {self.app}-cli con argomenti espliciti; segnaposto {{in0}}, {{out0}}... per i percorsi.",
                limitations=base,
                permissions=["legge e scrive nel progetto", "esegue processi"],
            ),
        ]

    def execute(self, operation: str, params: dict, ctx: ExecutionContext) -> ConnectorResult:
        exe = self._exe()
        if not exe:
            return ConnectorResult(ok=False, message=f"{self.app}-cli non disponibile")
        ws = ctx.workspace
        if operation == "commands.list":
            args = ["commands"]
        elif operation == "cli.run":
            ins = [str(ws.resolve(p)) for p in params.get("inputs", [])]
            outs_rel = list(params.get("outputs", ctx.outputs))
            outs = [str(ws.resolve(p, write=True)) for p in outs_rel]
            mapping = {f"in{i}": v for i, v in enumerate(ins)} | {f"out{i}": v for i, v in enumerate(outs)}
            args = [a.format(**mapping) for a in map(str, params["args"])]
        else:
            return ConnectorResult(ok=False, message=f"operazione non supportata: {operation}")
        try:
            proc = subprocess.run(
                [exe, *args], capture_output=True, text=True, cwd=ws.root, timeout=self.settings.subprocess_timeout
            )
        except subprocess.TimeoutExpired:
            return ConnectorResult(ok=False, message=f"{self.app}-cli: timeout")
        except OSError as exc:
            return ConnectorResult(ok=False, message=f"{self.app}-cli non avviabile: {exc}")
        details = {"returncode": proc.returncode, "stdout": proc.stdout[-4000:], "stderr": proc.stderr[-2000:]}
        if proc.returncode != 0:
            return ConnectorResult(ok=False, message=f"{self.app}-cli ha fallito (exit {proc.returncode})", details=details)
        outputs = [ws.rel(Path(o)) for o in (outs if operation == "cli.run" else [])]
        return ConnectorResult(ok=True, message=f"{self.app}-cli completato", outputs=outputs, details=details)
