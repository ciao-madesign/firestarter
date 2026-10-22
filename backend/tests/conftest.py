import re

import pytest
from fastapi.testclient import TestClient

from firestarter.ai.manager import AIManager, AIProvider
from firestarter.app import create_app
from firestarter.config import Settings

LOREM = " ".join(["testo di prova per il documento"] * 40)


class FakeAI(AIProvider):
    """Provider di test deterministico: non e' parte del prodotto."""

    id = "fake"
    is_local = True

    def __init__(self):
        self.up = True
        self.calls = []
        self.drop_sections = False

    def check(self):
        return (self.up, "fake") if self.up else (False, "spento")

    def models(self):
        return ["fake-1"]

    def generate(self, prompt, system, model):
        self.calls.append(prompt)
        m = re.search(r"con le sezioni: ([^\n.]+)\.", prompt)
        if m:
            secs = [s.strip() for s in m.group(1).split(",")]
            if self.drop_sections:
                secs = secs[:1]
            return "# Specifica\n\n" + "\n\n".join(f"## {s}\n\n{LOREM}" for s in secs)
        return f"# Documento\n\n## Parte uno\n\n{LOREM}\n\n## Parte due\n\n{LOREM}\n\nUn [link](https://example.com)."


class ExternalAI(FakeAI):
    id = "cloud"
    is_local = False


@pytest.fixture
def fake_ai():
    return FakeAI()


@pytest.fixture
def settings(tmp_path):
    return Settings(home=tmp_path / "home", projects_root=tmp_path / "projects")


@pytest.fixture
def app(settings, fake_ai):
    return create_app(settings, ai=AIManager(settings, [fake_ai]))


@pytest.fixture
def core(app):
    return app.state.core


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def project(core):
    return core.create_project(
        name="Demo", goal="Documentare il sistema X", workflows=["tech_docs"],
        brief={"audience": "sviluppatori", "constraints": "max 10 pagine"},
    )


def approved(core, project):
    core.generate_plan(project["id"])
    core.approve_plan(project["id"])
    return project
