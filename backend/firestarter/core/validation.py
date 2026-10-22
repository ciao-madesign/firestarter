"""Validation Engine: controlli deterministici, registrati per nome.

I workflow scelgono quali controlli applicare (CA-20); il nucleo non conosce le regole specifiche.
"""

from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .workspace import Workspace


@dataclass
class CheckResult:
    passed: bool
    criterion: str
    issues: list[str] = field(default_factory=list)


CheckFn = Callable[[Path, dict, Workspace], CheckResult]
CHECKS: dict[str, CheckFn] = {}


def check(name: str) -> Callable[[CheckFn], CheckFn]:
    def deco(fn: CheckFn) -> CheckFn:
        CHECKS[name] = fn
        return fn

    return deco


def run_check(name: str, path: Path, params: dict, ws: Workspace) -> CheckResult:
    fn = CHECKS.get(name)
    if fn is None:
        return CheckResult(False, f"controllo sconosciuto: {name}", [f"nessun controllo registrato con nome '{name}'"])
    if not path.exists():
        return CheckResult(False, name, [f"file mancante: {ws.rel(path) if path.is_relative_to(ws.root) else path}"])
    try:
        return fn(path, params, ws)
    except Exception as exc:  # un controllo che esplode non e' un successo
        return CheckResult(False, name, [f"errore durante il controllo: {exc}"])


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _headings(text: str) -> list[tuple[int, str, int]]:
    """(livello, titolo, riga) ignorando i blocchi di codice."""
    out, fenced = [], False
    for i, line in enumerate(text.splitlines(), 1):
        if line.strip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if m:
            out.append((len(m.group(1)), m.group(2).strip(), i))
    return out


@check("file_exists")
def file_exists(path: Path, params: dict, ws: Workspace) -> CheckResult:
    return CheckResult(path.is_file(), "il file esiste", [] if path.is_file() else ["file non trovato"])


@check("non_empty")
def non_empty(path: Path, params: dict, ws: Workspace) -> CheckResult:
    ok = path.is_file() and path.stat().st_size > 0
    return CheckResult(ok, "il file non e' vuoto", [] if ok else ["file vuoto"])


@check("min_words")
def min_words(path: Path, params: dict, ws: Workspace) -> CheckResult:
    need = int(params.get("min", 50))
    n = len(re.findall(r"\w+", _text(path)))
    return CheckResult(n >= need, f"almeno {need} parole", [] if n >= need else [f"trovate {n} parole"])


@check("md_sections")
def md_sections(path: Path, params: dict, ws: Workspace) -> CheckResult:
    required = [s.lower() for s in params.get("sections", [])]
    present = [h[1].lower() for h in _headings(_text(path))]
    missing = [s for s in required if not any(s in p for p in present)]
    return CheckResult(not missing, "sezioni richieste presenti", [f"sezione mancante: {m}" for m in missing])


@check("md_links")
def md_links(path: Path, params: dict, ws: Workspace) -> CheckResult:
    issues = []
    for target in re.findall(r"\[[^\]]*\]\(([^)\s]+)[^)]*\)", _text(path)):
        if re.match(r"^(https?:|mailto:|#)", target):
            continue
        if not (path.parent / target.split("#", 1)[0]).exists():
            issues.append(f"riferimento non risolvibile: {target}")
    return CheckResult(not issues, "riferimenti locali funzionanti", issues)


@check("md_heading_hierarchy")
def md_heading_hierarchy(path: Path, params: dict, ws: Workspace) -> CheckResult:
    issues, prev = [], 0
    for level, title, line in _headings(_text(path)):
        if prev and level > prev + 1:
            issues.append(f"riga {line}: salto di livello da H{prev} a H{level} ('{title}')")
        prev = level
    return CheckResult(not issues, "gerarchia dei titoli senza salti", issues)


@check("md_no_empty_sections")
def md_no_empty_sections(path: Path, params: dict, ws: Workspace) -> CheckResult:
    lines = _text(path).splitlines()
    heads = _headings(_text(path))
    issues = []
    for idx, (_, title, line) in enumerate(heads):
        end = heads[idx + 1][2] - 1 if idx + 1 < len(heads) else len(lines)
        body = [l for l in lines[line:end] if l.strip()]
        if not body and (idx + 1 >= len(heads) or heads[idx + 1][0] <= heads[idx][0]):
            issues.append(f"sezione vuota: '{title}' (riga {line})")
    return CheckResult(not issues, "nessuna sezione vuota", issues)


@check("docx_valid")
def docx_valid(path: Path, params: dict, ws: Workspace) -> CheckResult:
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            bad = z.testzip()
        issues = []
        if "word/document.xml" not in names:
            issues.append("manca word/document.xml")
        if bad:
            issues.append(f"archivio danneggiato: {bad}")
    except zipfile.BadZipFile:
        issues = ["non e' un archivio OOXML valido"]
    return CheckResult(not issues, "il file DOCX e' leggibile", issues)


@check("html_valid")
def html_valid(path: Path, params: dict, ws: Workspace) -> CheckResult:
    t = _text(path).lower()
    ok = "<html" in t and "</html>" in t
    return CheckResult(ok, "documento HTML completo", [] if ok else ["tag html di apertura/chiusura mancanti"])
