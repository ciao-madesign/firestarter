from __future__ import annotations

from .base import Workflow


class WorkflowRegistry:
    def __init__(self) -> None:
        self._items: dict[str, Workflow] = {}

    def register(self, workflow: Workflow) -> None:
        self._items[workflow.id] = workflow

    def get(self, id_: str) -> Workflow | None:
        return self._items.get(id_)

    def all(self) -> list[Workflow]:
        return list(self._items.values())

    def suggest(self, brief_text: str) -> list[str]:
        """Suggerimento euristico (RF-26): l'utente conferma o modifica sempre."""
        t = brief_text.lower()
        rules = {
            "tech_docs": ("specifica", "architettura", "documentazione", "repository", "api", "manuale tecnico"),
            "editorial": ("libro", "articolo", "ebook", "rivista", "manoscritto", "impagin", "editoriale"),
        }
        hits = [wid for wid, words in rules.items() if any(w in t for w in words) and self.get(wid)]
        return hits or [w.id for w in self.all()[:1]]


def default_registry() -> WorkflowRegistry:
    from .editorial import EditorialWorkflow
    from .tech_docs import TechDocsWorkflow

    reg = WorkflowRegistry()
    reg.register(TechDocsWorkflow())
    reg.register(EditorialWorkflow())
    return reg
