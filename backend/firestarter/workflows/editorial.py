"""Secondo workflow (CA-21): editoriale. Criteri di validazione diversi dal tecnico (CA-20)."""

from __future__ import annotations

from ..core.types import TaskSpec, ValidationSpec
from .base import Workflow, brief_block

SYSTEM = "Sei un editor. Scrivi in Markdown con struttura chiara, tono coerente con lo stile richiesto, senza sezioni vuote."


class EditorialWorkflow(Workflow):
    id = "editorial"
    name = "Editoria"
    category = "editorial"
    description = "Struttura un breve documento editoriale, lo redige, lo esporta e lo impagina (manuale) con DesignCraft."
    accepted_inputs = ["brief", "manoscritto md/txt", "immagini"]
    expected_outputs = ["scaletta.md", "manoscritto.md", "manoscritto.docx"]
    connectors = ["ai", "pandoc", "files", "artcraft.designcraft", "manual"]
    human_approvals = ["piano", "revisione del manoscritto", "impaginazione"]

    def build_tasks(self, project):
        return [
            TaskSpec(
                key="outline", title="Scaletta", connector="ai", operation="generate",
                params={
                    "kind": "planning", "system": SYSTEM,
                    "prompt": brief_block() + "\n\nFonti:\n{sources}\n\nProponi la struttura (capitoli e sezioni) in Markdown.",
                },
                outputs=["02_Working/scaletta.md"],
                validations=[ValidationSpec(check="md_heading_hierarchy", target="02_Working/scaletta.md")],
            ),
            TaskSpec(
                key="draft", title="Stesura del manoscritto", depends_on=["outline"],
                connector="ai", operation="generate",
                params={
                    "kind": "generation", "system": SYSTEM,
                    "prompt": brief_block() + "\n\nScaletta approvata:\n{file:02_Working/scaletta.md}\n\n"
                    "Scrivi il testo completo seguendo la scaletta.",
                },
                outputs=["04_Artifacts/manoscritto.md"],
                validations=[
                    ValidationSpec(check="md_heading_hierarchy", target="04_Artifacts/manoscritto.md"),
                    ValidationSpec(check="md_no_empty_sections", target="04_Artifacts/manoscritto.md"),
                    ValidationSpec(check="md_links", target="04_Artifacts/manoscritto.md"),
                    ValidationSpec(check="min_words", target="04_Artifacts/manoscritto.md", params={"min": 150}, severity="warning"),
                ],
            ),
            TaskSpec(
                key="export", title="Esporta in DOCX", depends_on=["draft"],
                connector="pandoc", operation="convert",
                params={"input": "04_Artifacts/manoscritto.md", "output": "05_Exports/manoscritto.docx"},
                outputs=["05_Exports/manoscritto.docx"],
                validations=[ValidationSpec(check="docx_valid", target="05_Exports/manoscritto.docx")],
            ),
            TaskSpec(
                key="layout", title="Impaginazione in DesignCraft", depends_on=["export"],
                connector="manual", operation="instruct", optional=True,
                params={"instructions": "Apri 05_Exports/manoscritto.docx in DesignCraft, applica il modello grafico, "
                        "esporta in 05_Exports/impaginato e conferma."},
                manual_instructions="Impaginazione non ancora automatizzata (DesignCraft e' in alpha): "
                "importa il manoscritto, applica il modello e salva l'esportazione in 05_Exports/.",
                outputs=[],
            ),
            TaskSpec(
                key="deliver", title="Consegna", depends_on=["export"],
                connector="files", operation="copy",
                params={"items": [{"from": "05_Exports/manoscritto.docx", "to": "07_Delivery/manoscritto.docx"}]},
                outputs=["07_Delivery/manoscritto.docx"],
            ),
        ]
