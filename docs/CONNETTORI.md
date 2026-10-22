# Connettori

Un connettore implementa `Connector`: `status()`, `capabilities()`, `execute(operation, params, ctx)`.
Livelli di supporto: `verified` (test ripetibile), `limited`, `unverified`, `unsupported`, `manual`.

| Id | Operazioni | Supporto dichiarato | Note |
|---|---|---|---|
| `ai` | `generate` | limited | Ollama locale; solo testo. Esterni solo con consenso |
| `pandoc` | `convert` | limited | Testato: Markdown→DOCX/HTML. PDF non supportato (serve LaTeX) |
| `files` | `copy` | verified | Copie interne al progetto (consegna) |
| `manual` | `instruct` | manual | Istruzioni + conferma; verifica gli output dichiarati |
| `artcraft.<app>` | `commands.list` (limited), `cli.run` (unverified) | unverified | `photocraft, lightcraft, vectorcraft, filmcraft, designcraft, deckcraft, cadcraft` |

## ArtCraft
Ricerca del CLI: percorso in `Settings.artcraft_paths`, poi PATH (`<app>-cli`), poi cartelle standard di Windows
(`C:\Program Files\<App>\<app>-cli.exe`). `cli.run` accetta `args` con segnaposto `{in0}`, `{out0}`… sostituiti con percorsi
**confinati nel progetto**; l'esito richiede che gli output dichiarati esistano.
Per promuovere un'operazione a `verified` serve un test ripetibile che la esegua con l'app reale.
Non ancora implementati: client MCP e canale `--control` (restano alternative documentate dalle app).
