# Estendere Firestarter

## Aggiungere un connettore
```python
class MioConnettore(Connector):
    id, name = "mio", "Mio strumento"
    def status(self): return ConnectorStatus(available=shutil.which("mio") is not None)
    def capabilities(self): return [Capability(operation="fai", support=Support.UNVERIFIED, limitations=["..."])]
    def execute(self, operation, params, ctx): ...   # scrivere solo con ctx.workspace.resolve(rel, write=True)
registry.register(MioConnettore())
```
Il nucleo non cambia (esempio in `tests/test_core.py::test_new_connector_and_workflow_without_touching_core`).

## Aggiungere un workflow
```python
class MioWorkflow(Workflow):
    id, name, category = "mio_wf", "Il mio workflow", "graphics"
    def build_tasks(self, project): return [TaskSpec(key="a", title="...", connector="mio", operation="fai",
                                                    outputs=["04_Artifacts/x.png"],
                                                    validations=[ValidationSpec(check="non_empty", target="04_Artifacts/x.png")])]
workflows.register(MioWorkflow())
```
- Le dipendenze locali (`depends_on=["a"]`) vengono prefissate col workflow; `"altro_wf.task"` collega workflow diversi (progetti misti).
- I parametri stringa accettano `{goal}`, `{audience}`, `{constraints}`, `{style}`, `{quality}`, `{acceptance_criteria}`, `{language}`,
  `{sources}` e `{file:percorso/relativo}`.
- Output sempre in cartelle di progetto diverse da `01_Sources`.

## Aggiungere un controllo di validazione
```python
@check("mio_controllo")
def mio(path, params, ws) -> CheckResult: ...
```
Controlli disponibili: `file_exists, non_empty, min_words, md_sections, md_links, md_heading_hierarchy, md_no_empty_sections, docx_valid, html_valid`.
Severità `error` (blocca il task) o `warning`.

## Aggiungere un provider AI
Implementare `AIProvider` (`check`, `models`, `generate`, `is_local`) e passarlo a `AIManager`. I provider non locali non
vengono mai usati senza consenso esplicito.
