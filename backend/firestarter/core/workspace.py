"""Cartella di progetto: struttura, protezione delle fonti, risoluzione sicura dei percorsi."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import stat
from pathlib import Path

FOLDERS = {
    "project": "00_Project",
    "sources": "01_Sources",
    "working": "02_Working",
    "assets": "03_Assets",
    "artifacts": "04_Artifacts",
    "exports": "05_Exports",
    "validation": "06_Validation",
    "delivery": "07_Delivery",
    "logs": "08_Logs",
    "templates": "templates",
}

ROLE_BY_FOLDER = {
    "00_Project": "project",
    "01_Sources": "source",
    "02_Working": "working",
    "03_Assets": "asset",
    "04_Artifacts": "artifact",
    "05_Exports": "export",
    "06_Validation": "validation",
    "07_Delivery": "delivery",
    "08_Logs": "log",
    "templates": "template",
}

VERSIONS_DIR = ".versions"
IGNORED_DIRS = {".git", "node_modules", "__pycache__", ".venv", "target"}


def safe_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\- ]+", "", name, flags=re.UNICODE).strip().replace(" ", "_")
    return cleaned or "Progetto"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Workspace:
    def __init__(self, root: Path | str):
        self.root = Path(root).resolve()

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for folder in FOLDERS.values():
            (self.root / folder).mkdir(exist_ok=True)
        gitignore = self.root / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text("08_Logs/\n.versions/\n", encoding="utf-8")

    def resolve(self, rel: str, *, write: bool = False) -> Path:
        """Risolve un percorso relativo restando dentro il progetto.

        In scrittura le fonti originali (01_Sources) sono protette (spec RF-50).
        """
        if os.path.isabs(rel) or re.match(r"^[A-Za-z]:", rel):
            raise PermissionError(f"percorso assoluto non ammesso: {rel}")
        path = (self.root / rel).resolve()
        if not path.is_relative_to(self.root):
            raise PermissionError(f"percorso fuori dal progetto: {rel}")
        if write and path.is_relative_to(self.root / FOLDERS["sources"]):
            raise PermissionError(f"le fonti originali sono protette: {rel}")
        return path

    def rel(self, path: Path) -> str:
        return path.resolve().relative_to(self.root).as_posix()

    def role_of(self, rel: str) -> str:
        top = rel.split("/", 1)[0]
        return ROLE_BY_FOLDER.get(top, "working")

    def archive_existing(self, rel: str, version: int) -> str | None:
        """Copia la versione corrente in .versions prima che venga sovrascritta."""
        path = self.resolve(rel)
        if not path.is_file():
            return None
        target = self.root / VERSIONS_DIR / f"{Path(rel).as_posix()}.v{version}"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        return target.relative_to(self.root).as_posix()

    def import_tree(self, src: Path, *, limit_files: int = 5000) -> list[dict]:
        """Copia (non sposta) i materiali in 01_Sources e li rende sola lettura."""
        src = Path(src).resolve()
        if not src.exists():
            raise FileNotFoundError(str(src))
        dest_root = self.root / FOLDERS["sources"]
        files: list[Path] = []
        if src.is_file():
            files = [src]
            base = src.parent
        else:
            base = src
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
                for fn in filenames:
                    files.append(Path(dirpath) / fn)
                    if len(files) > limit_files:
                        raise ValueError(f"troppi file da importare (> {limit_files})")
        imported = []
        for f in files:
            rel = f.relative_to(base)
            target = dest_root / (src.name if src.is_dir() else "") / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                target.chmod(target.stat().st_mode | stat.S_IWRITE)
            shutil.copy2(f, target)
            target.chmod(stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH)
            imported.append(
                {
                    "rel_path": self.rel(target),
                    "origin": str(f),
                    "sha256": sha256_of(target),
                    "size": target.stat().st_size,
                    "kind": target.suffix.lower().lstrip(".") or "file",
                }
            )
        return imported

    def read_text(self, rel: str, limit: int | None = None) -> str:
        data = self.resolve(rel).read_text(encoding="utf-8", errors="replace")
        return data[:limit] if limit else data
