"""Registro dei connettori (M5). Aggiungere un connettore = registrarlo, senza toccare il nucleo."""

from __future__ import annotations

from ..config import Settings
from .base import Connector


class ConnectorRegistry:
    def __init__(self) -> None:
        self._items: dict[str, Connector] = {}

    def register(self, connector: Connector) -> None:
        self._items[connector.id] = connector

    def get(self, id_: str) -> Connector | None:
        return self._items.get(id_)

    def all(self) -> list[Connector]:
        return list(self._items.values())

    def describe(self) -> list[dict]:
        return [c.describe() for c in self._items.values()]


def default_registry(settings: Settings, ai) -> ConnectorRegistry:
    from .ai import AIConnector
    from .artcraft import ARTCRAFT_APPS, ArtCraftCliConnector
    from .files import FilesConnector
    from .manual import ManualConnector
    from .pandoc import PandocConnector

    reg = ConnectorRegistry()
    reg.register(ManualConnector())
    reg.register(FilesConnector())
    reg.register(AIConnector(ai))
    reg.register(PandocConnector(settings))
    for app in ARTCRAFT_APPS:
        reg.register(ArtCraftCliConnector(app, settings))
    return reg
