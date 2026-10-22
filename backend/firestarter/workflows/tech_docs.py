"""Workflow pilota: documentazione tecnica (spec 7.1 e 15.1)."""

from __future__ import annotations

from ..core.types import TaskSpec, ValidationSpec
from .base import Workflow, brief_block

SYSTEM = "Sei un documentatore tecnico. Scrivi in Markdown, con titoli chiari e senza inventare fatti non presenti nelle fonti."


class TechDocsWorkflow(Workflow):
    id = "tech_docs"
    name = "Documentazione tecnica"
    category = "technical_docs"
    description = "Analizza brief e fonti, produce specifica e guida collegate, le esporta e le verifica."
    accepted_inputs = ["brief", "cartelle di fonti", "repository (copia di lavoro)", "md", "txt"]
    expected_outputs = ["specifica.md", "guida.md", "specifica.docx", "guida.docx"]
    connectors = ["ai", "pandoc", "files", "manual"]
    human_approvals = ["piano", "revisione della specifica"]

    def build_tasks(self, project):
        sections = project["brief"].get("extra", {}).get("sections") or [
            "Obiettivo", "Requisiti", "Architettura", "Rischi",
        ]
        sec_list = ", ".join(sections)
        return [
            TaskSpec(
                key="analyze", title="Analisi di brief e fonti",
                description="Estrae requisiti, vincoli, componenti e informazioni mancanti.",
                connector="ai", operation="generate",
                params={
                    "kind": "analysis", "system": SYSTEM,
                    "prompt": brief_block() + "\n\nFonti disponibili:\n{sources}\n\n"
                    "Produci un'analisi: requisiti espliciti, vincoli, componenti, dipendenze, lacune informative.",
                },
                outputs=["02_Working/analisi.md"],
                validations=[ValidationSpec(check="non_empty", target="02_Working/analisi.md")],
            ),
            TaskSpec(
                key="spec", title="Specifica tecnica", depends_on=["analyze"],
                connector="ai", operation="generate",
                params={
                    "kind": "generation", "system": SYSTEM,
                    "prompt": brief_block() + "\n\nAnalisi:\n{file:02_Working/analisi.md}\n\n"
                    f"Scrivi la specifica tecnica con le sezioni: {sec_list}. Usa un titolo H1 e sezioni H2.",
                },
                outputs=["04_Artifacts/specifica.md"],
                validations=[
                    ValidationSpec(check="md_sections", target="04_Artifacts/specifica.md", params={"sections": sections}),
                    ValidationSpec(check="md_heading_hierarchy", target="04_Artifacts/specifica.md"),
                    ValidationSpec(check="md_links", target="04_Artifacts/specifica.md"),
                    ValidationSpec(check="min_words", target="04_Artifacts/specifica.md", params={"min": 80}, severity="warning"),
                ],
            ),
            TaskSpec(
                key="guide", title="Guida operativa", depends_on=["spec"],
                connector="ai", operation="generate",
                params={
                    "kind": "generation", "system": SYSTEM,
                    "prompt": brief_block() + "\n\nSpecifica di riferimento:\n{file:04_Artifacts/specifica.md}\n\n"
                    "Scrivi una guida operativa coerente con la specifica, per i destinatari indicati.",
                },
                outputs=["04_Artifacts/guida.md"],
                validations=[
                    ValidationSpec(check="md_heading_hierarchy", target="04_Artifacts/guida.md"),
                    ValidationSpec(check="md_links", target="04_Artifacts/guida.md"),
                    ValidationSpec(check="non_empty", target="04_Artifacts/guida.md"),
                ],
            ),
            TaskSpec(
                key="export_spec", title="Esporta specifica in DOCX", depends_on=["spec"],
                connector="pandoc", operation="convert",
                params={"input": "04_Artifacts/specifica.md", "output": "05_Exports/specifica.docx"},
                outputs=["05_Exports/specifica.docx"],
                validations=[ValidationSpec(check="docx_valid", target="05_Exports/specifica.docx")],
            ),
            TaskSpec(
                key="export_guide", title="Esporta guida in DOCX", depends_on=["guide"],
                connector="pandoc", operation="convert",
                params={"input": "04_Artifacts/guida.md", "output": "05_Exports/guida.docx"},
                outputs=["05_Exports/guida.docx"],
                validations=[ValidationSpec(check="docx_valid", target="05_Exports/guida.docx")],
            ),
            TaskSpec(
                key="deliver", title="Prepara il pacchetto di consegna",
                depends_on=["export_spec", "export_guide"],
                connector="files", operation="copy",
                params={"items": [
                    {"from": "05_Exports/specifica.docx", "to": "07_Delivery/specifica.docx"},
                    {"from": "05_Exports/guida.docx", "to": "07_Delivery/guida.docx"},
                ]},
                outputs=["07_Delivery/specifica.docx", "07_Delivery/guida.docx"],
            ),
        ]
