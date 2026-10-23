"""AI Manager (M2): provider, selezione del modello, controllo sull'invio di dati all'esterno."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

from ..config import Settings

# Compiti distinti (RF-41): non tutti i modelli devono svolgerli tutti.
KINDS = ("planning", "generation", "analysis", "transformation", "review", "recovery")


class AIUnavailable(RuntimeError):
    pass


class AIProvider(ABC):
    id: str
    is_local: bool = True

    @abstractmethod
    def check(self) -> tuple[bool, str]:
        """(disponibile, dettaglio)"""

    @abstractmethod
    def models(self) -> list[str]: ...

    @abstractmethod
    def generate(self, prompt: str, system: str, model: str) -> str: ...


class OllamaProvider(AIProvider):
    id = "ollama"
    is_local = True

    def __init__(self, base_url: str, timeout: int = 900) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _request(self, path: str, payload: dict | None = None, timeout: int | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base_url + path, data=data, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
            return json.loads(resp.read().decode())

    def check(self) -> tuple[bool, str]:
        try:
            n = len(self.models())
            return True, f"{self.base_url} ({n} modelli installati)"
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return False, f"Ollama non raggiungibile su {self.base_url}: {exc}"

    def models(self) -> list[str]:
        data = self._request("/api/tags", timeout=5)
        return [m["name"] for m in data.get("models", [])]

    def generate(self, prompt: str, system: str, model: str) -> str:
        payload = {"model": model, "prompt": prompt, "stream": False}
        if system:
            payload["system"] = system
        return self._request("/api/generate", payload)["response"]


class AIManager:
    def __init__(self, settings: Settings, providers: list[AIProvider] | None = None) -> None:
        self.settings = settings
        self.providers: list[AIProvider] = providers if providers is not None else [OllamaProvider(settings.ollama_url)]

    def add_provider(self, provider: AIProvider) -> None:
        self.providers.append(provider)

    def status(self) -> dict:
        out = []
        for p in self.providers:
            ok, detail = p.check()
            models = []
            if ok:
                try:
                    models = p.models()
                except Exception:  # noqa: BLE001 - lo stato non deve mai sollevare
                    pass
            out.append({"id": p.id, "local": p.is_local, "available": ok, "detail": detail, "models": models})
        return {"providers": out, "models_by_kind": self.settings.models_by_kind}

    def select(self, kind: str, allow_external: bool, model: str | None = None) -> tuple[AIProvider, str]:
        """Sceglie provider e modello. I provider esterni richiedono consenso (RF-43, CA-15)."""
        skipped_external = False
        for p in self.providers:
            if not p.is_local and not (allow_external and self.settings.allow_external_ai):
                skipped_external = True
                continue
            ok, _ = p.check()
            if not ok:
                continue
            installed = p.models()
            chosen = model or self.settings.models_by_kind.get(kind) or self.settings.ollama_model
            if chosen and installed and chosen not in installed:
                # Ollama considera "nome" equivalente a "nome:latest"
                chosen = next((m for m in installed if m == f"{chosen}:latest" or m.removesuffix(":latest") == chosen), chosen)
            if chosen and installed and chosen not in installed:
                raise AIUnavailable(f"modello '{chosen}' non installato su {p.id} (disponibili: {', '.join(installed)})")
            chosen = chosen or (installed[0] if installed else None)
            if not chosen:
                raise AIUnavailable(f"nessun modello installato su {p.id}")
            return p, chosen
        hint = " (provider esterni disattivati: nessun consenso)" if skipped_external else ""
        raise AIUnavailable("nessun provider AI disponibile" + hint)

    def generate(
        self, *, kind: str, prompt: str, system: str = "", model: str | None = None, allow_external: bool = False
    ) -> tuple[str, dict]:
        provider, chosen = self.select(kind, allow_external, model)
        text = provider.generate(prompt, system, chosen)
        return text, {"provider": provider.id, "model": chosen, "local": provider.is_local, "kind": kind}
