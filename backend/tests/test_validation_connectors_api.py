from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from firestarter.config import Settings
from firestarter.connectors.artcraft import ArtCraftCliConnector
from firestarter.connectors.base import ExecutionContext
from firestarter.connectors.pandoc import PandocConnector
from firestarter.core.validation import run_check
from firestarter.core.workspace import Workspace

from .conftest import LOREM


def test_markdown_checks(tmp_path):
    ws = Workspace(tmp_path)
    ws.ensure()
    f = tmp_path / "a.md"
    f.write_text("# T\n\n### salto\n\ntesto [x](manca.md) e [y](https://e.com)\n\n## Vuota\n", encoding="utf-8")
    assert not run_check("md_heading_hierarchy", f, {}, ws).passed
    assert not run_check("md_links", f, {}, ws).passed
    assert not run_check("md_no_empty_sections", f, {}, ws).passed
    assert not run_check("md_sections", f, {"sections": ["Requisiti"]}, ws).passed
    assert not run_check("check_che_non_esiste", f, {}, ws).passed
    assert not run_check("non_empty", tmp_path / "manca.md", {}, ws).passed


def test_docx_check_rejects_garbage(tmp_path):
    ws = Workspace(tmp_path)
    f = tmp_path / "x.docx"
    f.write_bytes(b"non un docx")
    assert not run_check("docx_valid", f, {}, ws).passed


@pytest.mark.skipif(not PandocConnector(Settings()).status().available, reason="pandoc assente")
def test_pandoc_converts_markdown_to_docx(tmp_path):
    ws = Workspace(tmp_path)
    ws.ensure()
    (tmp_path / "04_Artifacts" / "a.md").write_text("# Ciao\n\nTesto.\n", encoding="utf-8")
    ctx = ExecutionContext(workspace=ws, project={})
    res = PandocConnector(Settings()).execute(
        "convert", {"input": "04_Artifacts/a.md", "output": "05_Exports/a.docx"}, ctx)
    assert res.ok and run_check("docx_valid", ws.resolve("05_Exports/a.docx"), {}, ws).passed
    res = PandocConnector(Settings()).execute(
        "convert", {"input": "04_Artifacts/a.md", "output": "05_Exports/a.pdf"}, ctx)
    assert not res.ok  # PDF dichiarato non supportato


def test_artcraft_connector_reports_unavailable_honestly(tmp_path):
    c = ArtCraftCliConnector("designcraft", Settings(home=tmp_path, artcraft_paths={}))
    if c._exe() is None:
        st = c.status()
        assert not st.available and "designcraft-cli" in st.detail
    caps = {x.operation: x.support.value for x in c.capabilities()}
    assert caps["cli.run"] == "unverified"  # nessuna operazione dichiarata verificata senza test


def test_artcraft_connector_runs_cli_confined_to_project(tmp_path):
    fake = tmp_path / "fake-cli.py"
    fake.write_text("import sys\nopen(sys.argv[-1],'w').write('ok')\n", encoding="utf-8")
    wrapper = tmp_path / "designcraft-cli"
    wrapper.write_text(f"#!/bin/sh\nexec python3 {fake} \"$@\"\n", encoding="utf-8")
    wrapper.chmod(0o755)
    c = ArtCraftCliConnector("designcraft", Settings(home=tmp_path, artcraft_paths={"designcraft": str(wrapper)}))
    ws = Workspace(tmp_path / "p")
    ws.ensure()
    ctx = ExecutionContext(workspace=ws, project={}, outputs=["05_Exports/out.txt"])
    res = c.execute("cli.run", {"args": ["export", "{out0}"]}, ctx)
    assert res.ok and res.outputs == ["05_Exports/out.txt"]
    with pytest.raises(PermissionError):
        c.execute("cli.run", {"args": ["{out0}"], "outputs": ["../fuori.txt"]}, ctx)


def test_api_end_to_end(client: TestClient):
    assert client.get("/api/health").json()["ok"]
    assert {c["id"] for c in client.get("/api/connectors").json()} >= {"ai", "pandoc", "artcraft.designcraft"}
    assert {w["id"] for w in client.get("/api/workflows").json()} == {"tech_docs", "editorial"}
    r = client.post("/api/projects", json={"name": "Api", "goal": "Test", "workflows": ["tech_docs"]})
    assert r.status_code == 201
    pid = r.json()["id"]
    assert client.post(f"/api/projects/{pid}/run/step").status_code == 409  # senza piano approvato
    assert client.post(f"/api/projects/{pid}/plan").status_code == 200
    assert client.post(f"/api/projects/{pid}/plan/approve").status_code == 200
    for _ in range(10):
        if client.post(f"/api/projects/{pid}/run/step").json()["task"] is None:
            break
    st = client.get(f"/api/projects/{pid}/status").json()
    assert st["state"] == "completed", st
    arts = client.get(f"/api/projects/{pid}/artifacts").json()
    assert any(a["rel_path"] == "07_Delivery/specifica.docx" for a in arts)
    assert client.get(f"/api/projects/{pid}/files", params={"path": "07_Delivery/guida.docx"}).status_code == 200
    assert client.get(f"/api/projects/{pid}/files", params={"path": "../../etc/passwd"}).status_code == 403
    assert client.get(f"/api/projects/{pid}/report").json()["status"]["state"] == "completed"
    r = client.post(f"/api/projects/{pid}/artifacts/review",
                    json={"path": "04_Artifacts/specifica.md", "decision": "approved"})
    assert r.json()["review_state"] == "approved"
    r = client.post(f"/api/projects/{pid}/tasks/tech_docs.spec/regenerate", json={})
    assert r.status_code == 409 and r.json()["protected"] == ["04_Artifacts/specifica.md"]
    assert client.post(f"/api/projects/{pid}/tasks/tech_docs.spec/regenerate", json={"confirm": True}).status_code == 200


def test_md_sections_tolerates_plural_and_singular(tmp_path):
    ws = Workspace(tmp_path)
    f = tmp_path / "s.md"
    f.write_text("# S\n\n## Obiettivi\n\nx\n\n## Requisito\n\nx\n\n## Rischio\n\nx\n", encoding="utf-8")
    ok = run_check("md_sections", f, {"sections": ["Obiettivo", "Requisiti", "Rischi"]}, ws)
    assert ok.passed, ok.issues
    assert not run_check("md_sections", f, {"sections": ["Architettura"]}, ws).passed
