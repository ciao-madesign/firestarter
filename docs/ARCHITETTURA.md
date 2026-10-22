# Architettura

```
UI web (React)  ──HTTP──▶  API FastAPI (app.py)
                               │
                          Orchestrator (core/orchestrator.py)
        ┌───────────┬──────────┼───────────┬───────────────┐
     Planner     Store     Validation   Workspace      AIManager
   (dipendenze) (SQLite)   (controlli)  (cartelle,     (provider,
                                         fonti protette) consenso)
        │
  WorkflowRegistry ─▶ Workflow.build_tasks() ─▶ TaskSpec[]
  ConnectorRegistry ─▶ Connector.execute()   ◀─ operazioni dichiarate
```

## Flusso
1. `create_project` crea la cartella (`00_Project … 08_Logs`, `templates`) e salva brief/configurazione.
2. `generate_plan` unisce i `TaskSpec` dei workflow scelti (chiavi `workflow.task`), verifica grafo e cicli, calcola un hash per
   task. Se esiste un piano precedente, i task completati con hash identico e dipendenze invariate vengono **riusati**
   (ricalcolo selettivo, RF-12); gli altri tornano da fare.
3. L'utente può escludere/riordinare (solo sul piano in bozza, nei limiti delle dipendenze) e poi **approva** (CA-04).
4. `step`/`run_all` eseguono il prossimo task pronto con dipendenze soddisfatte, uno alla volta:
   verifica connettore e capacità → conferma se sensibile → archivia la versione precedente degli output → esegue →
   controlla che gli output esistano → registra gli artefatti (versione, provenienza) → esegue le validazioni.
5. Esiti: `completed`; `failed` (validazione o errore, output parziali conservati); `blocked` (strumento non disponibile o dipendenza
   fallita); `waiting_user` (manuale o conferma). I dipendenti di un task fallito diventano `blocked`.
6. Ripresa: all'avvio i task rimasti `running` tornano `ready` (`recover`).
7. Rigenerazione selettiva: `regenerate(task)` rimette in coda solo quel task e i suoi dipendenti; richiede conferma se sovrascrive artefatti approvati.

## Stati dei task
`planned → ready → running → completed | failed | blocked | waiting_user`, `skipped` (esclusa). Lo stato del progetto è derivato
(`draft, planned, approved, running, needs_attention, completed, delivered`). Il completamento richiede i task obbligatori completati
oppure l'accettazione esplicita delle eccezioni (RF-48).

## Dati (SQLite, `~/.firestarter/firestarter.db`)
`projects, sources, plans, tasks, artifacts, artifact_versions, validations, approvals, events`. Sul disco, per progetto:
`00_Project/{brief,configuration,approved-plan,status}.json`, `08_Logs/run.jsonl`, `.versions/` per le versioni sovrascritte.

## Sicurezza
- Server su loopback. Percorsi sempre risolti da `Workspace.resolve`: niente assoluti, niente `..`, nessuna scrittura in `01_Sources`.
- Sottoprocessi senza shell, con timeout. Il registro redige chiavi tipo token/password/api_key.
- Provider esterni: richiedono `Settings.allow_external_ai` **e** `allow_external_ai` del progetto.
