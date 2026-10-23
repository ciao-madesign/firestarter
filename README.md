# 🔥 Firestarter

Piattaforma open source che trasforma un obiettivo in un processo di lavoro coordinato:
**brief → piano approvato → esecuzione con strumenti diversi → verifiche → consegna**.

Non sostituisce gli editor: li coordina (Ollama, Pandoc, app [ArtCraft](https://getartcraft.com/) e altri), gestisce
dipendenze, versioni e controlli, e chiede l'intervento dell'utente dove l'automazione non è affidabile.

> Stato: **scheletro funzionante (v0.1)**. Pilota: documentazione tecnica. Secondo workflow: editoria.
> Le integrazioni ArtCraft sono *non verificate* finché non esistono test ripetibili.

## Avvio rapido

**Windows:** installa Python, Node.js e Pandoc (`winget install Python.Python.3.12 OpenJS.NodeJS.LTS JohnMacFarlane.Pandoc`), clona il repo e fai doppio clic su `avvia.bat`.

Manuale:

Requisiti: Python ≥ 3.11, Node ≥ 18, [Ollama](https://ollama.com) con almeno un modello, [Pandoc](https://pandoc.org) nel PATH.

```bash
cd backend && pip install -e ".[dev]"
cd ../frontend && npm install && npm run build
cd .. && python -m firestarter          # http://127.0.0.1:8000
```

Sviluppo UI con ricarica: `python -m firestarter` + `cd frontend && npm run dev` (http://localhost:5173).
Test: `cd backend && python -m pytest`.

Variabili utili: `FIRESTARTER_HOME`, `OLLAMA_HOST`, `FIRESTARTER_OLLAMA_MODEL`, `FIRESTARTER_PANDOC`.

## Come funziona
1. Crea un progetto (obiettivo, destinatari, vincoli) e, se vuoi, importa una cartella di materiali (copia protetta).
2. Genera il **piano**: attività, dipendenze, strumenti, output attesi. Escludi/riordina, poi **approva**.
3. **Esegui**: una attività impegnativa alla volta, con stati espliciti, registro e ripresa dopo interruzioni.
4. Consulta **artefatti** (versioni, provenienza), **validazioni** e **registro**; approva o rigenera singoli elementi.

Documentazione: [`docs/`](docs/) · Guida per sviluppatori e decisioni: [`CLAUDE.md`](CLAUDE.md)

## Licenza
MIT
