# CLAUDE.md — Firestarter

Guida per chi (persona o AI) lavora sul repository. Tienila aggiornata: ogni decisione di progetto
va registrata qui nella sezione "Registro delle decisioni".

## Cos'è
Firestarter è una piattaforma open source che trasforma un obiettivo (brief + materiali) in un piano
di attività approvato dall'utente, lo esegue coordinando strumenti (Ollama, Pandoc, app ArtCraft, ...),
verifica gli output e gestisce ciò che richiede intervento umano. Specifica funzionale v1.1:
vedi `docs/SPECIFICA.md` (sintesi) — i codici RF/RNF/CA citati nel codice vengono da lì.

## Preferenze di lavoro
- Lingua: **italiano** per UI, documentazione, messaggi di log/errore e commit. Identificatori del codice in inglese.
- Risposte concise, poco tecniche salvo richiesta.
- **Push sempre su `main`** (indicazione esplicita del proprietario). Nessuna PR salvo richiesta.
- Non dichiarare mai "supportata/verificata" una capacità senza un test ripetibile (spec 6.5, RNF-14).

## Stack e struttura
- Backend: Python ≥3.11, FastAPI, SQLite (stdlib `sqlite3`), pydantic. `backend/firestarter/`
- Frontend: React + TypeScript + Vite, UI web locale servita dal backend. `frontend/`
- Piattaforma prima: Windows (sviluppo anche su Linux). Server solo su `127.0.0.1`.

```
backend/firestarter/
  core/        nucleo: orchestrator, planner, store (SQLite), validation, workspace, types
  connectors/  interfaccia Connector + ai, pandoc, artcraft (generico), files, manual
  workflows/   interfaccia Workflow + tech_docs (pilota), editorial (secondo workflow)
  ai/          AIManager e provider (Ollama)
  app.py       API FastAPI
backend/tests/ pytest (usa un provider AI finto; Pandoc reale se presente)
frontend/src/  UI
docs/          architettura, connettori, decisioni, estendere il sistema
```

## Comandi
```
cd backend && pip install -e ".[dev]" && python -m pytest        # test
python -m firestarter                                              # server su http://127.0.0.1:8000
cd frontend && npm install && npm run build                        # build UI (servita dal backend)
cd frontend && npm run dev                                         # UI in sviluppo (proxy /api -> 8000)
```
Variabili: `FIRESTARTER_HOME` (db e progetti), `OLLAMA_HOST`, `FIRESTARTER_OLLAMA_MODEL`, `FIRESTARTER_PANDOC`.

## Regole di architettura (non violarle)
1. Il **nucleo** (`core/`) non importa workflow o connettori concreti e non contiene regole di
   categoria (impaginazione, video...). Parla solo con `Connector` e `Workflow`.
2. Un **workflow** produce `TaskSpec` (connettore + operazione + parametri + dipendenze + output + validazioni).
   Non conosce i dettagli delle app. Aggiungerne uno non tocca il nucleo (CA-17, test lo verificano).
3. Un **connettore** dichiara capacità con livello di supporto (`verified/limited/unverified/unsupported/manual`)
   e limiti. Preferenza di integrazione: API/CLI → MCP → GUI → manuale (RF-21).
4. **Nessuna esecuzione prima dell'approvazione del piano** (CA-04). Una sola attività impegnativa alla volta (RF-17).
5. **Fonti protette**: i file importati vanno in `01_Sources` (copia, sola lettura); `Workspace.resolve(write=True)` rifiuta
   scritture lì e fuori dal progetto. Nessun commit/push Git verso repo originali.
6. Un task è `completed` solo se gli output dichiarati esistono e le validazioni di severità `error` passano.
   Output parziali si conservano; le versioni sovrascritte vanno in `.versions/`.
7. Dati verso provider esterni solo con consenso (impostazione globale **e** di progetto). I segreti non vanno nei log (redazione in `Orchestrator.log`).
8. Il contenuto AI non è prova di correttezza: preferire validazioni deterministiche (`core/validation.py`).

## Cartelle di progetto (generate)
`00_Project 01_Sources 02_Working 03_Assets 04_Artifacts 05_Exports 06_Validation 07_Delivery 08_Logs templates`
(spec §8). Sorgenti modificabili/intermedi/finali sono distinguibili dal ruolo registrato per ogni artefatto.

## Registro delle decisioni
| Data | Decisione | Motivo |
|---|---|---|
| 2026-10-22 | Interfaccia: **web locale** (backend + UI browser) | Veloce da costruire/testare, portabile; impacchettabile in desktop dopo |
| 2026-10-22 | Stack: **Python + FastAPI + React/TypeScript** | Ottimo per AI/Ollama, CLI e file; UI in TS |
| 2026-10-22 | Persistenza: **SQLite**; file di progetto nelle cartelle | Relazioni, transazioni e ripresa affidabili; Git non è il DB operativo |
| 2026-10-22 | Licenza: **MIT** | Scelta del proprietario |
| 2026-10-22 | AI locale: **Ollama** (già installato dal proprietario); esterni opzionali, off di default | RF-38/39/43 |
| 2026-10-22 | Pilota: documentazione tecnica; output in **Markdown + DOCX (Pandoc)**, non necessariamente PDF | Il PDF via Pandoc richiede LaTeX; vanno bene anche i formati delle app ArtCraft |
| 2026-10-22 | Secondo workflow: **editoriale** (CA-21), impaginazione DesignCraft come passo manuale opzionale | Riusa gli stessi strumenti; DesignCraft è alpha |
| 2026-10-22 | Connettori iniziali: Ollama, Pandoc, ArtCraft generico via CLI (`<app>-cli`), file, manuale | Verificato sui repo storytold: ogni app ha CLI + MCP + canale `--control` |
| 2026-10-22 | Nessuna capacità ArtCraft è `verified` finché non c'è un test ripetibile | App in alpha (RNF-14) |
| 2026-10-22 | Integrazione Git: **rimandata**; vincolo invariato (nessun commit/push verso repo originali) | Spec 13.3, fuori dal primo scheletro |
| 2026-10-22 | Push diretto su `main` | Indicazione del proprietario |

## Ecosistema ArtCraft (verificato leggendo i repo `storytold/*`, 2026-10-22)
Tutte alpha. PhotoCraft, LightCraft, VectorCraft, FilmCraft, DesignCraft, CADCraft, DeckCraft espongono `<app>-cli`
(`commands`, `run`, `mcp`, ...), server MCP su stdio e canale JSON `--control <porta>`. Ogni azione è un comando con ID stabile.
Gli MCP **non** separano tool sicuri/ad alto impatto: le conferme le gestisce Firestarter. Restrizione cartelle con
`--automation-read-root/--automation-write-root`. DeckCraft: `.pptx` e PDF; VectorCraft: export PDF headless; DesignCraft: render PNG delle pagine;
CADCraft: DXF/PLOT PDF; FilmCraft: FCPXML/AAF. WordCraft e GridCraft: repo non ancora verificati. `craft-libs` è solo libreria Rust.

## Da fare / aperto
- Verificare con test ripetibili le operazioni ArtCraft (prima DeckCraft/DesignCraft) e promuoverle a `verified`.
- Connettore MCP (client) oltre al CLI; automazione GUI solo come ripiego.
- Integrazione Git opzionale (copia di lavoro/repo indipendente), workflow grafico, progetti misti con dipendenze tra categorie.
- Modifica ordine/dipendenze dalla UI, editor del brief, selezione modello per compito dalla UI.
- Packaging per Windows (installer/avvio), distribuzione, documentazione utente.
