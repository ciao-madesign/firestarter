"""Impostazioni dell'applicazione, lette da variabili d'ambiente."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _default_home() -> Path:
    return Path(os.environ.get("FIRESTARTER_HOME") or Path.home() / ".firestarter")


@dataclass
class Settings:
    home: Path = field(default_factory=_default_home)
    projects_root: Path | None = None
    ollama_url: str = field(default_factory=lambda: os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"))
    ollama_model: str | None = field(default_factory=lambda: os.environ.get("FIRESTARTER_OLLAMA_MODEL"))
    # modello preferito per tipo di compito (pianificazione, generazione, ...)
    models_by_kind: dict[str, str] = field(default_factory=dict)
    # nessun dato lascia la macchina salvo consenso esplicito per progetto
    allow_external_ai: bool = False
    # percorsi espliciti dei CLI ArtCraft: {"designcraft": "C:\\...\\designcraft-cli.exe"}
    artcraft_paths: dict[str, str] = field(default_factory=dict)
    # opzioni passate a Ollama; FIRESTARTER_OLLAMA_NUM_GPU=0 forza la sola CPU (utile con GPU instabili)
    ollama_options: dict = field(default_factory=lambda: (
        {"num_gpu": int(os.environ["FIRESTARTER_OLLAMA_NUM_GPU"])} if os.environ.get("FIRESTARTER_OLLAMA_NUM_GPU") else {}
    ))
    pandoc_path: str | None = field(default_factory=lambda: os.environ.get("FIRESTARTER_PANDOC"))
    subprocess_timeout: int = 600

    def __post_init__(self) -> None:
        self.home = Path(self.home)
        if self.projects_root is None:
            self.projects_root = self.home / "projects"
        self.projects_root = Path(self.projects_root)

    @property
    def db_path(self) -> Path:
        return self.home / "firestarter.db"

    def ensure_dirs(self) -> None:
        self.home.mkdir(parents=True, exist_ok=True)
        self.projects_root.mkdir(parents=True, exist_ok=True)
