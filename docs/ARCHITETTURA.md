# Architettura

Stato: implementata (MVP, Fasi 1–6 della roadmap). La proposta iniziale è nella cronologia git.

## Principio

I motori di simulazione sono **puri e indipendenti dall'interfaccia**: ricevono e restituiscono lo stato del workspace (`WorkspaceState`, JSON-serializzabile) e non importano nulla da server o frontend. Frontend, simulatore, curriculum e integrazioni evolvono separatamente.

```
 browser (src/web)  ──HTTP JSON──▶  backend (src/server)  ──▶  motori (puri)
   terminale, schede                autorizzazioni di workspace     engine/       Simulation Engine + API Simulation Engine
   didattiche, editor               serializzazione per workspace   curriculum/   Exercise Engine
                                    limiti, intestazioni            docs/         Document Engine
                                    Persistence Layer (store.ts)    tutor/        AI Tutor Adapter (deterministico)
                                                                    course/       stato del corso, REGISTRO, test intermedi
```

| Componente della specifica | Dove | Note |
|---|---|---|
| Frontend web | `src/web/` | TypeScript senza framework, bundle esbuild; layout a due pannelli, responsive, accessibile |
| Backend applicativo | `src/server/app.ts` | `node:http`, nessuna dipendenza runtime |
| Simulation Engine | `src/engine/` (vfs, bash, pwsh) | Non esegue mai comandi sul server |
| API Simulation Engine | `src/engine/api/` | Servizio TaskFlow: specifica unica → validazione, OpenAPI, controlli dei documenti |
| Exercise Engine | `src/curriculum/engine.ts` | Avvio, reset, verifica deterministica, aiuti, valutazione |
| Document Engine | `src/docs/lint.ts` | Distingue errori verificabili e valutazioni editoriali; esegue gli esempi su una copia isolata |
| AI Tutor Adapter | `src/tutor/tutor.ts` | Interfaccia `TutorAdapter` + tutor deterministico; l'app funziona senza AI |
| Persistence Layer | `src/server/store.ts` | `FileStore` (JSON atomico con backup) e `MemoryStore`; il frontend non vi accede |
| Stato del corso | `src/course/`, `course/` | Condiviso con il tutor CLI (`tutor/`) e importabile/esportabile come REGISTRO |

## Simulation Engine

- **Filesystem virtuale** (`vfs.ts`): mappa percorso → nodo, permessi con proprietario/modo (un file non eseguibile dà `Permission denied`), limiti su numero e dimensione dei file. Condiviso tra le due shell.
- **Bash** (`engine/bash/`): parser (quoting, espansioni, `$(…)`, `$((…))`, brace expansion, glob, pipe, `&&`/`||`, redirezioni, heredoc, `if`/`for`/`while`, funzioni, `[[ ]]`) e interprete con codici di uscita, errori di sintassi riconosciuti prima dell'esecuzione, processi figli per gli script (non alterano cwd e variabili del chiamante).
- **PowerShell 5.1** (`engine/pwsh/`): parser a due modalità (comando/espressione), pipeline di **oggetti**, formattazione a tabella/lista, errori nel formato `CategoryInfo`/`FullyQualifiedErrorId`, errori non terminanti vs terminanti, `try/catch/finally`, funzioni, script `.ps1` (serve `./`), scope `script:`/`global:`, `$?` e `$LASTEXITCODE`, e le peculiarità di 5.1 (`curl` è alias di `Invoke-WebRequest`, niente `&&`, `ConvertTo-Json` a profondità 2, body stringa come form).
- Sessioni **distinte per shell** (cwd, variabili, funzioni, cronologia, trascrizione) sugli stessi file e servizi simulati.
- **Limiti**: input, output, passi di esecuzione (cicli infiniti fermati), dimensione del workspace, richieste per minuto.
- **Determinismo**: orologio simulato che avanza solo con le azioni; id, token, rate limit e `X-Request-Id` dipendono solo dallo stato. Le stesse azioni producono gli stessi risultati.
- **Catalogo** (`catalog.ts`): per ogni comando sintassi, opzioni, differenze dichiarate. Un test verifica che ogni comando registrato abbia una scheda e viceversa. Vedi `docs/COMANDI.md`.

## API Simulation Engine

Servizio **TaskFlow** con tre ambienti (development `http://localhost:8080`, testing e staging su `*.api.taskflow.test`). Stato condiviso con il filesystem: ogni richiesta scrive `access.log` e `app.log` in `/var/log/taskflow/<ambiente>/`. Staging è alla versione 1.1.0 (elenchi in `items` invece di `data`) per l'esercizio di incompatibilità tra documentazione e comportamento. Nessun host diverso da quelli simulati è raggiungibile (`Could not resolve host`).

Anomalie riproducibili: percorso o risorsa inesistente, JSON non valido, Content-Type errato (415), validazione (422), token assente/scaduto/di altro ambiente, 403, 405, conflitto di stato (409), rate limit (429 + `Retry-After`), timeout (`/slow`), 500 deterministico ogni terza chiamata (`/flaky`), configurazioni errate (host o porta sbagliati).

## Esecuzione reale isolata (evoluzione futura)

Il confine è `execute(state, shell, line)` in `src/engine/index.ts`: una modalità con container sostituirebbe questa funzione dietro la stessa interfaccia, senza toccare curriculum, verifiche e frontend. Le verifiche leggono solo `WorkspaceState` (file, log delle richieste, storico dei comandi): per una modalità reale servirebbe un adattatore che li popoli. Non implementata nell'MVP.

## Persistenza e modello dati

`WorkspaceState` distingue: filesystem, API (dati e log per ambiente), shell (due contesti), storico dei comandi, avanzamento degli esercizi (completamenti per shell, aiuti usati, ultima verifica), previsioni, versioni dei documenti, note, preferenze, test intermedio. Lo stato del corso (`CourseProgress`: livello, lezioni, errori ricorrenti, test, prossima lezione) è separato e condiviso. Versionamento: `STATE_VERSION` per lo stato, `CURRICULUM_VERSION` per il curriculum.
