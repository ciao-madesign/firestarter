# CLI & API Learning Lab

Laboratorio interattivo, accessibile da browser, per imparare **Bash e PowerShell, HTTP/API, testing e documentazione tecnica** in un ambiente **simulato**: nessun comando viene eseguito sul server o sul tuo dispositivo e nessuna richiesta esce dal laboratorio.

Pensato per chi lavora come Technical Writer su software, API e servizi web. Comprende anche un **tutor per il terminale reale** (`tutor/`) che usa lo stesso stato del corso.

## Avvio rapido

Serve Node.js 22 o successivo.

```bash
npm install
npm run build:web
npm start            # http://127.0.0.1:3000
```

Poi apri l'indirizzo nel browser. Lo stato (file, progressi, documenti) si salva in `data/` e in `course/progress.json`; riaprendo l'app la sessione riprende da dove l'avevi lasciata.

## Cosa trovi

- **Terminale** (pannello sinistro): Bash e PowerShell 5.1 con prompt, cronologia, completamento con Tab, copia di comandi e output, codici di uscita, tasti rapidi per tastiera virtuale. Le due shell condividono file e servizi ma hanno cwd, variabili e cronologia separate.
- **Pannello guida** (destra), cinque schede:
  - **Istruzioni**: percorso a moduli, lezione con obiettivo, spiegazione, esempio guidato, **previsione obbligatoria prima dell'esecuzione**, test negativo e verifica automatica con elenco dei controlli in tempo reale.
  - **Chat**: tutor deterministico (senza AI): indizi graduati, spiegazione dei comandi, analisi dell'ultimo errore reale, soluzione registrata come aiuto usato. "Copia riepilogo per Claude" prepara il contesto da incollare nella chat di Claude (abbonamento), senza chiavi API.
  - **Ambiente**: ambienti development/testing/staging di un'API REST simulata (TaskFlow), endpoint con comandi pronti, dati e ultime richieste, ripristino dei dati.
  - **Documentazione**: editor Markdown con anteprima, versioni e confronto, e **controllo tecnico** che esegue gli esempi `curl` e li confronta con lo stato dichiarato; distingue errori verificabili e valutazioni editoriali.
  - **Risultati**: livello (1–4), competenze misurate separatamente, errori ricorrenti, test intermedi, REGISTRO importabile/esportabile, report di test, esportazione JSON/YAML/Markdown, cancellazione dei dati.
- **Curriculum**: M1–M6 come da programma del corso (circa 30 minuti a lezione), con M4–M6 espansi, più i moduli facoltativi M7 (automazione) e M8 (portfolio: guida, OpenAPI, bug report, script di test). Vedi `course/programma.md`.

## Il corso e il tutor in terminale

Lo stato del corso è in `course/progress.json` (vista leggibile `progress.md`); il laboratorio web e il tutor CLI lo condividono, e il formato **REGISTRO** consente di tenere allineati anche la chat e altri dispositivi.

```bash
cd tutor && claude          # tutor nel terminale reale: /lezione, /test, /registro, /importa-registro
npm run course:export       # stampa un REGISTRO dallo stato attuale
npm run course:import -- registro.txt
```

Il tutor non esegue mai comandi: li esegue lo studente e incolla l'output (imposto da istruzioni e permessi in `tutor/.claude/settings.json`). Niente punti, badge o testi motivazionali: i progressi sono dati.

## Sicurezza e privacy

- Nessuna esecuzione di comandi arbitrari: tutto passa dal motore di simulazione. Limiti su input, output, passi di esecuzione, file e dimensione del workspace.
- Credenziali **solo simulate**; nessun servizio esterno raggiungibile durante gli esercizi (`Could not resolve host`). L'interfaccia mostra sempre il badge "AMBIENTE SIMULATO".
- Il server ascolta solo su `127.0.0.1` per impostazione predefinita. La modalità multi-workspace (`LAB_SINGLE_USER=0`) non ha autenticazione: ogni workspace è protetto solo da un codice casuale; usala solo in contesti fidati.
- Esportazione ed eliminazione dei dati personali dalla scheda Risultati. Intestazioni CSP e `nosniff`; il contenuto dei documenti è sempre mostrato con escape.

## Struttura

```
src/engine/       Simulation Engine: filesystem, Bash, PowerShell, API simulata, catalogo comandi
src/curriculum/   Exercise Engine e lezioni (verifiche deterministiche)
src/docs/         Document Engine (controllo dei documenti)
src/tutor/        Tutor deterministico e interfaccia per adapter AI
src/course/       Stato del corso, REGISTRO, test intermedi
src/server/       Backend, persistenza
src/web/          Frontend
tutor/            Tutor CLI per il terminale reale (CLAUDE.md, comandi slash)
course/           Stato e programma del corso (condivisi)
docs/             Architettura, decisioni, accettazione, guida allo sviluppo, catalogo comandi
```

## Documentazione

- [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md) · [`docs/DECISIONI.md`](docs/DECISIONI.md) · [`docs/ACCETTAZIONE.md`](docs/ACCETTAZIONE.md) (stato dei criteri, limiti noti)
- [`docs/COMANDI.md`](docs/COMANDI.md): comandi supportati e differenze dichiarate
- [`docs/SVILUPPO.md`](docs/SVILUPPO.md): comandi npm, come aggiungere comandi e lezioni

## Test

```bash
npm run check        # typecheck + test
```

I test eseguono la soluzione documentata di **ogni lezione** in entrambe le shell e verificano che superi i controlli (e che i controlli non passino a vuoto).

## Licenza

MIT.
