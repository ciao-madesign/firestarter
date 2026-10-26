# CLI & API Learning Lab — istruzioni di progetto

Repository di sviluppo del laboratorio web (`src/`) e del tutor CLI (`tutor/`). Per fare lezione nel terminale reale non lavorare da qui: `cd tutor && claude` (regole e permessi del tutor stanno in `tutor/CLAUDE.md`).

## Stile e modalità operativa

- **Lingua**: italiano per risposte, testi dell'interfaccia, documentazione e messaggi rivolti allo studente. I messaggi dei comandi simulati restano nella lingua del comando reale (inglese).
- **Risposte brevi e concise**, non eccessivamente tecniche a meno che sia richiesto. Dire prima cosa si sta facendo, poi procedere.
- **Chiedere in caso di dubbio** su scelte che cambiano il comportamento o la direzione del progetto; per il resto scegliere il default sensato, dichiararlo e andare avanti.
- **Azioni irreversibili o verso l'esterno** (deploy, push su branch diversi, cancellazioni, uso di chiavi): confermare prima.
- **Onestà sui risultati**: se un test fallisce o qualcosa non è stato provato, dirlo. Non dichiarare completo ciò che è solo parziale (vale anche per i comandi simulati: dichiarare le differenze dal comando reale).
- **Nessuna gamification** nell'interfaccia e nel tutor: niente punti, badge, streak, emoji, testi motivazionali. I progressi sono dati.
- **Git**: sviluppare sul branch indicato dalla sessione; commit descrittivi; nessuna PR se non richiesta.
- Non modificare `course/progress.json` durante lo sviluppo (è lo stato reale dello studente), salvo test dedicati.

## Cos'è il progetto

Ambiente interattivo per imparare CLI (Bash, PowerShell), HTTP/API, testing e documentazione tecnica, per un Technical Writer (profilo: circa 6 anni, background UX/UI; usa macOS + Bash, al lavoro Windows PowerShell 5.1). Obiettivo: livello intermedio (livello 3 stabile su tutti i moduli) e un portfolio di artefatti (OpenAPI, guide, script, test, bug report, troubleshooting).

Principi (dalla specifica): pratica prima della teoria; realismo entro limiti dichiarati; Bash e PowerShell confrontabili; apprendimento progressivo; feedback immediato; sicurezza; portabilità (desktop, tablet, smartphone); indipendenza dall'AI (l'app funziona senza).

Specifica funzionale completa: la versione 0.1 fornita dall'utente (non è nel repo); la traccia operativa è in `docs/ARCHITETTURA.md`, `docs/DECISIONI.md`, `docs/ACCETTAZIONE.md`. Brief del tutor CLI: sintetizzato in `tutor/CLAUDE.md`.

## Decisioni prese (sintesi; storico completo sotto)

| Tema | Decisione |
|---|---|
| Fedeltà del terminale | Simulazione controllata ed estendibile; modalità reale isolata solo come evoluzione futura dietro `execute()` |
| Accesso | Uso personale, nessun account; modalità multi-workspace con codice casuale (non è autenticazione) |
| AI | Tutor deterministico oggi; adattatore AI opzionale con **chiave API Anthropic solo lato server** (vedi sotto) |
| Infrastrutture | Interamente simulate (servizio TaskFlow, 3 ambienti) |
| PowerShell | **Windows PowerShell 5.1** (`curl` = alias di `Invoke-WebRequest`, `curl.exe` è il vero curl; niente `&&`; `ConvertTo-Json` profondità 2) |
| Filesystem | Linux, **sensibile alle maiuscole**, dichiarato (errore ricorrente n. 1 dello studente) |
| Curriculum | M1–M6 come da brief (numerazione invariata per compatibilità con il REGISTRO), espansi dove utile; M7 facoltativo; ripasso M1.R prima di M2.L1 |
| Verifica | Deterministica su file, log delle richieste e storico comandi; le verifiche autonome non hanno soluzione; ogni soluzione documentata è testata in entrambe le shell |
| Valutazione | Livello 1–4; 7 competenze separate; soluzione mostrata ≠ autonomia |
| Git e webhook (M5 del brief) | Non simulati: restano nel tutor CLI |
| Hosting (deciso, implementato) | **Server di casa: Dell Wyse 5070** (Celeron J4105, 8 GB, eMMC 16 GB + SSD esterno per i dati), con **Ubuntu** e Node 22 (`/opt/node22/bin/node`), servizio systemd `learning-lab`. **Isolamento obbligatorio da PersonalHub e dagli altri progetti già presenti** (utente, cartelle, dati su SSD, porta 3100 e servizio dedicati; mai modificare altro). Accesso con **Tailscale** su porta HTTPS dedicata 8443 (`serve` per i dispositivi personali, `funnel` per il PC di lavoro) senza sostituire le regole esistenti + **password** (`LAB_PASSWORD`). Nessun servizio cloud (Vercel ecc.). Guida: `docs/INSTALLAZIONE-WYSE.md` |
| AI nel lab (deciso, implementato) | **Nessuna chiave API**: i crediti dell'abbonamento Pro non valgono per l'API, che si paga a parte. Il lab prepara un riepilogo filtrato (`src/tutor/brief.ts`, `POST /api/brief`) con pulsanti "Copia riepilogo per Claude" (chat) e "Copia per Claude" (documenti), da incollare nella chat di Claude o nel tutor in terminale (abbonamento). `TutorAdapter` resta disponibile se un giorno si vorrà l'API (credito prepagato, ricarica automatica spenta) |

## Vincoli da rispettare

- **Adapta e WizTrail (prodotti reali dello studente) sono solo riferimento in sola lettura**: né il laboratorio né il tutor devono mai modificarli, eseguirli o chiamarne i servizi. Il laboratorio web non contiene né legge il loro codice. Documentazione prodotta solo in `course/portfolio-reale/` (vedi `tutor/CLAUDE.md`).
- **Sicurezza**: nessuna esecuzione di comandi arbitrari (solo motori di simulazione); credenziali solo simulate; nessun host esterno raggiungibile dagli esercizi; limiti su input, output, passi, file, dimensione del workspace; badge "AMBIENTE SIMULATO" sempre visibile.
- **Tutor AI (quando verrà aggiunto)**: riceve solo il contesto filtrato (`buildTutorContext`), mai lo stato completo né credenziali; non deve inventare output né dichiarare superati test non eseguiti dal sistema; le soluzioni complete restano registrate come aiuto usato e non sono anticipate nelle verifiche autonome.
- **Determinismo**: orologio simulato; id, token, rate limit e request id dipendono solo dallo stato.
- **Accessibilità**: ruoli ARIA, focus visibile, contrasto, tastiera; layout responsive.

## Struttura e comandi

```
src/engine/      Simulation Engine (vfs, bash, pwsh, api, catalogo): puro, non importa da server/ né web/
src/curriculum/  Exercise Engine e lezioni      src/docs/    Document Engine (lint)
src/tutor/       tutor deterministico + TutorAdapter       src/course/  stato del corso, REGISTRO, test intermedi
src/server/      backend e persistenza          src/web/     frontend       tutor/  tutor CLI      course/  stato e programma condivisi
```

```bash
npm run check          # typecheck + test (obbligatorio prima di ogni commit)
npm run build:web && npm run test:ui   # test dell'interfaccia nel browser (Playwright, Chromium)
npm run build:web && npm start     # http://127.0.0.1:3000
npm run docs           # rigenera docs/COMANDI.md e course/programma.md
npm run course:export | course:import   # REGISTRO da/verso lo stato
```

Regole di sviluppo:
- Ogni comando nuovo: implementazione + scheda in `src/engine/catalog.ts` con **differenze dichiarate** (il test `catalog.test.ts` lo impone) + `npm run docs`.
- Ogni lezione nuova: oggetto `Lesson` con controlli deterministici e soluzioni (o `reference` se autonoma); `lessons.test.ts` le esegue in entrambe le shell.
- Endpoint API nuovi: modificare `src/engine/api/spec.ts` (fonte unica per validazione, OpenAPI e controlli dei documenti) e il gestore.
- Non introdurre dipendenze runtime senza motivo (costo e manutenzione contenuti). Dettagli: `docs/SVILUPPO.md`.

## Lavori aperti (prossimi passi concordati)

1. **Hosting sul Wyse**: pacchetto pronto (script isolati, password); da fare sul dispositivo: raccogliere porte/servizi di PersonalHub via SSH (comandi di sola lettura), installare, configurare Tailscale su 8443; da verificare se il PC di lavoro raggiunge `*.ts.net`.
2. ~~Tutor AI~~ fatto senza API (riepilogo da copiare, vedi decisioni). Eventuale API solo se richiesto.
3. Test dell'interfaccia: base pronta (`tests/ui`, 5 test); da estendere ai flussi completi. Prova su dispositivi mobili reali.

## Registro delle decisioni

Aggiungere in fondo una riga per ogni decisione importante: data (YYYY-MM-DD), decisione, motivo.

- 2026-10-26 — Scelti simulazione controllata, uso personale senza account, tutor deterministico, infrastrutture simulate, progetto open source (sezione 17 della specifica). Motivo: MVP sicuro, a costo zero, senza dati personali.
- 2026-10-26 — Dal brief del tutor CLI: il laboratorio usa lo stesso stato del corso (`course/progress.json`) e il formato REGISTRO; PowerShell simulato in versione 5.1; curriculum allineato a M1–M6 con numerazione invariata.
- 2026-10-26 — Moduli espansi (M4: 6 lezioni; M5, M6: 5) più M7 facoltativo; ripasso M1.R. Motivo: l'utente ha autorizzato l'approfondimento.
- 2026-10-26 — Filesystem Linux sensibile alle maiuscole, dichiarato. Motivo: rende evidente l'errore ricorrente n. 1.
- 2026-10-26 — Git e webhook non simulati. Motivo: richiedono comandi reali; restano nel tutor CLI.
- 2026-10-26 — Hosting: strategia "entrambe" (app statica nel browser + servizio online per sincronizzazione e tutor AI). Motivo: l'utente non può usare il terminale su tutti i dispositivi e non vuole installare nulla.
- 2026-10-26 — Chiave API Anthropic solo lato server, tutor AI opzionale. Motivo: sicurezza della chiave, l'app deve funzionare anche senza AI.
- 2026-10-26 — Hosting: **server di casa Wyse 5070 + Tailscale (serve/funnel) + password**, al posto di app statica e servizi cloud. Motivo: il lab è già un server unico, nessuna riscrittura dei motori, progressi uguali su tutti i dispositivi, nessun costo; Tailscale non installabile sul PC di lavoro quindi Funnel + password. Sostituisce la decisione "entrambe".
- 2026-10-26 — Sul Wyse esiste già PersonalHub: il lab va installato in modo **isolato** (utente `learninglab`, servizio `learning-lab`, porta 3100, dati separati, regola Tailscale su 8443, nessuna installazione globale; script con controlli preliminari e disinstallazione). Docker rimosso dal progetto. Motivo: richiesta esplicita di non interferire in alcun modo con PersonalHub.
- 2026-10-26 — Tutor AI senza chiave API: riepilogo copiabile per la chat/tutor in terminale con l'abbonamento Pro. Motivo: i crediti Pro non coprono l'API e l'utente non vuole pagamenti extra.
- 2026-10-26 — Test dell'interfaccia con Playwright in `tests/ui`, separati da `npm test` (richiedono un browser). Motivo: evitare regressioni senza rallentare i test veloci.
- 2026-10-26 — Aggiunto M8 facoltativo "Portfolio" (4 lezioni: guida rapida, specifica OpenAPI in JSON, bug report + troubleshooting, script di test con report). Corretto il controllo documentale: niente avviso "manca il caso di errore" per endpoint che non hanno errori previsti. Motivo: richiesta di altri artefatti per il portfolio.
- 2026-10-26 — Fase finale del corso: documentare Adapta e WizTrail (repo reali dello studente) con guida del tutor CLI. Vincolo: sola lettura, mai modifiche né chiamate ai servizi reali; output solo in `course/portfolio-reale/`. Motivo: richiesta esplicita dello studente di non toccare mai i due progetti.
