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
| Laboratorio a due nodi (2026-10-27) | **M11 facoltativo** nel simulatore (server e client su rete simulata, `ssh` a comando singolo, scenari ripristinabili) + **kit reale opzionale** `course/lab-vm/` (VirtualBox/Vagrant, solo PC di casa, non provato su VirtualBox). Le VM non sono un requisito; il tutor non le esegue |
| Hosting (installato 2026-10-26) | **Server di casa Dell Wyse 5070** (hostname `homehub`, Ubuntu 24.04, Node 22 di sistema in `/usr/bin/node`), **solo rete di casa, senza Tailscale** (non installato sul Wyse). Codice in `/opt/learning-lab` (fuori da `/home` per `ProtectHome=true`), dati in `/mnt/data/learning-lab` (cartella dedicata, proprietario `learninglab`, permessi 700, sullo stesso disco dell'hub), servizio systemd `learning-lab` su `192.168.1.8:3100` in http con password (`LAB_PASSWORD`, `/etc/learning-lab.env`), `LAB_TRUST_PROXY=0`. **Isolamento da PersonalHub/home-hub e dagli altri servizi** (utente, cartelle, porta e servizio dedicati; non toccare altro). Tailscale scartato per decisione dell'utente. Backup settimanale (`deploy/install-backup-wyse.sh`). Nessun servizio cloud |
| AI nel lab (2026-10-28) | **Aiuto con AI facoltativo con Gemini** (piano gratuito), chiave solo lato server (`LAB_GEMINI_KEY`), disattivato finché l'allievo non lo attiva: spiega con parole semplici e adatta gli indizi, non decide mai gli esiti, non vede le soluzioni, non disponibile nei test; vedi `docs/AI-GEMINI.md`. Il riepilogo da copiare per Claude (sotto) resta |
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
- Ogni costrutto che la soluzione di una lezione usa deve essere spiegato nella lezione stessa: voce nel glossario `src/curriculum/glossary.ts` (per Bash e PowerShell) e `npx tsx scripts/gen-lesson-tools.ts` per elencarla nella scheda («Strumenti per questo esercizio»); controllo: `npx tsx scripts/audit-info.ts [--strict]` e `tests/glossary.test.ts`.
- Endpoint API nuovi: modificare `src/engine/api/spec.ts` (fonte unica per validazione, OpenAPI e controlli dei documenti) e il gestore.
- Non introdurre dipendenze runtime senza motivo (costo e manutenzione contenuti). Dettagli: `docs/SVILUPPO.md`.

## Lavori aperti (prossimi passi concordati)

1. ~~Hosting sul Wyse~~ installato e verificato dal telefono (2026-10-26). IP `192.168.1.8` riservato nel router; Tailscale scartato (decisione dell'utente); backup settimanale configurato (vedi registro).
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
- 2026-10-26 — Passi guidati approfonditi in tutti i moduli (da 1–3 a 3–7 per lezione; `src/curriculum/lessons/guided-*.ts`). `tests/guided.test.ts` esegue ogni passo in entrambe le shell e verifica esito e testo atteso (`contains`, `fails`): le spiegazioni devono essere veritiere. Il lavoro ha rivelato e fatto correggere lacune del simulatore PowerShell/Bash: accesso a membro con nome tra virgolette (`.paths."/tasks"`), `Where-Object Nome -like valore`, assegnazione multipla `$a, $b = ...`, `Get-ChildItem env:`, `Set-Item env:`, `tr -s` con un solo insieme. Motivo: richiesta di approfondire le lezioni guidate.
- 2026-10-26 — Slice 1 del piano post-audit (P1, P2, P4, P7): `[[` malformato non va più in ciclo infinito (errore di sintassi), glob non validi trattati come testo, `[` PowerShell non ricorsivo, tetto alle iterazioni del parser Bash; il controllo documentale ignora variabili e funzioni di shell dello studente; M4.L3 usa l'id restituito dal POST; `--help` funziona su tutti i comandi Bash del catalogo. Nuovi test in `tests/robustness.test.ts` e in `tests/guided.test.ts` (soluzione valida dopo i passi guidati). Fuzzing 8.000 righe: 0 errori interni. Resta aperto il resto del piano (slice 2–8, vedi `docs/AUDIT-2026-10-26.md`).
- 2026-10-26 — Slice 2 del piano post-audit (P3, P5, P12): il ripristino taglia lo storico dei comandi per numero progressivo (`CommandLogEntry.seq`, `ExerciseProgress.startCmdSeq`) e rimuove i file consegnati fuori dalla cartella della lezione (`Lesson.artifacts`, M6 e M8); l'esercizio alternativo (`Lesson.alt`) è verificabile e supera la lezione come aiuto (`VerifyResult.viaAlt`, nota nel REGISTRO); chiarite le 8 ambiguità (M1.L2 un solo cd assoluto e `../Beta`, M2.L1 righe identiche al log, M2.L3 differenza Mac/Linux e risposta con etichetta, M5.L4 pausa obbligatoria, M4.L5 indizio). Le varianti di soluzione sono ora test (`tests/variants-data.ts`). Correzione al report di audit: l'unica lezione con `alt` è M1.L3.
- 2026-10-26 — Slice 3 del piano post-audit (P6, "mai silenzioso"): `tests/bash-compat.test.ts` confronta 339 comandi con Bash 5.2 reale (risultati registrati da `scripts/gen-bash-compat.ts`) e impone che ogni differenza sia un errore esplicito senza output parziale (eccezioni in `BENIGN`). Implementati: aritmetica completa (`**`, shift, bit, ternario, assegnazioni, ++/--), `let`, `set --` e `-u -x -o pipefail`, `printf` completo, `[[` senza espansione di percorso, `grep -m -x`, `stat -c`, `read` con IFS, redirezioni su `while/for/if` (prima ignorate), `exec N>file` e `>&N`, `trap EXIT` negli script, jq (interpolazione, `-e -n -j`, `@csv` ecc., `paths`, `group_by`...), awk e PowerShell `filter` con errore esplicito; PowerShell: `Measure-Object` oggetto, `$i++` istruzione senza output, `[char]`, `[Convert]` con base, `-OutFile` senza output, `PSVersion`, `$env:OS/USERNAME/COMPUTERNAME`, `Select-Object -ExpandProperty` con errore se manca la proprietà. `tests/pwsh-compat.test.ts` registra i risultati noti di PowerShell 5.1.

- 2026-10-26 — Slice 4 del piano post-audit (P8, P9, P11): interprete awk completo (`src/engine/bash/awk.ts`), `<(cmd)` (file temporanei in `/tmp/.procsub`, diversi da `/dev/fd` reale), `diff` normale/unificato (`-u`), `switch`, blocchi `process`, `param` con attributi, cmdlet CSV/oggetti, `[regex]` case-sensitive; fuzz in `npm test` e job CI `compat` con Bash reale. Motivo: chiudere le lacune che davano errore esplicito ma impedivano esercizi realistici. Resta aperto il resto del piano (slice 5–8).
- 2026-10-26 — Slice 5 del piano post-audit (P17): il tutor deterministico riconosce status HTTP e codici applicativi, richiama il concetto della lezione (token scaduto, ambiente, spazi non quotati), etichetta correttamente il comando analizzato e risponde a "posso passare?" con controlli superati e mancanti (`tests/tutor.test.ts`). Motivo: analisi più utile senza AI e senza dichiarare superato ciò che il sistema non ha verificato.
- 2026-10-26 — Slice 6 del piano post-audit (P10, P13, P14): scenari nuovi autonomi di fine modulo (`src/curriculum/lessons/scenarios.ts`), livelli con evidenze per modulo, livello 3 provvisorio/stabile, livello 4 con prove di trasferimento, abbassamento e ripasso a distanza (`src/course/levels.ts`; `LessonRecord.mode`), note sulle differenze macOS/Windows nel tutor. Motivo: livello 3/4 basato su evidenze e fedeltà all'ambiente reale dello studente. Il profilo ambiente è solo informativo, non una modalità del simulatore.
- 2026-10-26 — Slice 7 del piano post-audit (P15, P16): rete simulata (ping, nslookup, dig, nc -z, ss, Test-NetConnection, Resolve-DnsName), certificato scaduto, CORS, redirect con POST→GET; lezioni M5.L7 (più cause) e M5.L8 (strumenti di rete); griglia redazionale con esempio di riferimento nel riepilogo per Claude e riga facoltativa nel REGISTRO. Cookie e sessioni non simulati (errore esplicito). Motivo: diagnosi realistica e valutazione redazionale oltre i controlli automatici.
- 2026-10-26 — Slice 8 del piano post-audit (P18–P21): moduli facoltativi M9 (codice → documentazione, Git in sola lettura su repository d'esempio `src/engine/git-fixture.ts`, OpenAPI YAML con parser minimo) e M10 (cookie di sessione, webhook firmati HMAC, mappa dei flussi di autenticazione; Bash). Aggiunti `git` (solo lettura), `openssl dgst`, `curl -b/-c`, area `/v1/login|session|logout|webhooks/receive` fuori dalla specifica. Motivo: preparare la fase finale su Adapta e WizTrail senza toccarli. Piano post-audit concluso (slice 1–8).
- 2026-10-26 — Lab installato sul Wyse (`homehub`) in modalità solo rete di casa: http su `192.168.1.8:3100`, password, codice in `/opt/learning-lab` (branch `claude/wonderful-mayer-1nhrp7`), dati in `/mnt/data/learning-lab`. Tailscale non installato: scelta dell'utente (nessun software globale in più per ora). Motivo: accesso dai dispositivi di casa senza toccare PersonalHub/home-hub; lo script ora rifiuta cartelle in `/home` e usa il Node di sistema.
- 2026-10-26 — Backup del lab: timer systemd `learning-lab-backup` ogni domenica 03:30, archivio `.tar.gz` di `/mnt/data/learning-lab` in `/mnt/data/backup-learning-lab`, ultime 8 copie (`deploy/backup-learning-lab.sh`, `deploy/install-backup-wyse.sh`). Tailscale scartato (decisione dell'utente). Limite dichiarato: backup sullo stesso disco, nessuna protezione da guasto del disco. Motivo: i progressi dello studente stanno solo sul Wyse.
- 2026-10-27 — Segnalazione dello studente (M2.L1 in PowerShell: `ForEach-Object { $_.Line }` mai spiegato): audit "informazioni sufficienti" su tutte le lezioni, Bash e PowerShell (`scripts/audit-info.ts`). Aggiunto il glossario degli strumenti (`src/curriculum/glossary.ts`, ~100 voci con esempio) e la sezione «Strumenti per questo esercizio» in ogni lezione, per la shell in uso (`LESSON_TOOLS`, generato da `scripts/gen-lesson-tools.ts` dalle soluzioni e dagli script consegnati). Terminale: ogni shell ha la propria finestra con titolo e colori distinti (Bash grigio, PowerShell blu). Nessuna modifica al formato dello stato: i progressi esistenti restano validi. Motivo: ogni esercizio deve poter essere risolto con ciò che la lezione spiega.
- 2026-10-27 — Modulo M11 «Laboratorio a due nodi» (facoltativo, 6 lezioni, Bash e PowerShell) e kit con VM reali `course/lab-vm/`. Il simulatore ha ora due nodi: client = terminale dello studente, server = `server.lab` (192.168.50.10), raggiungibile con `ssh` a comando singolo; stato in `WorkspaceState.lab` (facoltativo, azzerato fuori da M11: i progressi esistenti restano validi). Nuovi comandi `ssh`, `systemctl`, `journalctl`, `sudo` (questi tre solo sul server), `ss`/`ping`/`nc`/`Test-NetConnection` che conoscono i due nodi; corretto `sed -i` che non restituiva errore su permesso negato. Guasti: servizio fermo, porta sbagliata, database fermo, tutti insieme (verifica autonoma). Motivo: richiesta di un laboratorio client/server; le VM reali restano facoltative perché il corso deve funzionare anche su dispositivi senza virtualizzazione.
- 2026-10-27 — Rinumerazione M2–M11 (mappa in `docs/NUMERAZIONE-2026-10-27.md`; progressi invariati), 21 lezioni nuove, passi guidati ampliati, fedeltà del simulatore (stato di `$?`, opzioni di shell persistenti, `set -a`, virgolette PowerShell 5.1, errore `&`), controlli di processo più severi. Audit studente/insegnante/architect in `docs/AUDIT-2026-10-27.md` con miglioramenti proposti. Motivo: approfondire M11 e i moduli non ancora affrontati.
- 2026-10-27 — Seguito dell'audit: lezioni più brevi (M2.L2/L5/L6, M3.L5, M5.L3), ripassi `M2.R` e `M5.R` (id `Mx.R`, ordinati prima delle lezioni del modulo), scenari autonomi `M7.L6` e `M9.L7`, M10.L1 anche in PowerShell, ripristino delle variabili `TASKFLOW_*` alla riapertura di una lezione (`ExerciseProgress.envSnapshot`, campo facoltativo), `Measure-Object` che somma stringhe numeriche, `git log <commit>`. Kit VM: script e servizi controllati in locale, non provato su VirtualBox. Motivo: miglioramenti proposti dall'audit e approvati dall'utente.
- 2026-10-27 — Verifica finale: corretto il ripristino delle lezioni (non riscrive più URL e credenziali impostati dalla lezione: rompeva M11 e M5.L8), campo `n` allineato agli id, README aggiornato a M1–M11. Aggiornamento del Wyse: il server segue il branch della sessione, non più `claude/wonderful-mayer-1nhrp7`. Motivo: ultima verifica completa richiesta dall'utente.
- 2026-10-27 — Riaprendo una lezione già iniziata si ripristinano i file di preparazione mancanti (`restoreSetupFiles`), senza toccare i file dello studente né i tentativi. Motivo: dopo la rinumerazione una lezione risultava «iniziata» con la vecchia numerazione e la sua preparazione non veniva rieseguita (M2.L2 senza `dati.txt`).
- 2026-10-27 — Se un file richiesto da una verifica è stato salvato con l'editor dei documenti (`~/docs`), la verifica lo segnala e spiega che va creato dal terminale nella cartella della lezione; testo di M2.L2 reso esplicito. Motivo: segnalazione dello studente (canali.md salvato in ~/docs, verifica non superata senza spiegazione).
- 2026-10-28 — Audit di completezza e spiegazioni: `scripts/audit-completezza.ts` (file citati, comandi eseguibili, costrutti di previsione/esempio spiegati), `env -i` e `od -c` nel simulatore, esempi autosufficienti, spiegazioni di tutte le lezioni riscritte in `src/curriculum/lessons/spiegazioni*.ts` (sostituiscono `explain`), M2.R dopo M2.L3 (esercizio extra) e M5.R dopo M5.L9, scheda dell'editor chiamata «Documentazione». Motivo: segnalazioni dello studente (file mancante, `>` mai spiegato, dati non mostrati prima di una previsione). AI (Gemini): solo valutazione, nessuna integrazione decisa.
- 2026-10-28 — Aiuto con AI (Gemini, piano gratuito) implementato in `src/tutor/ai.ts`: chiave solo sul server, interruttore per allievo (default spento) con avviso sui dati, segreti oscurati, filtro anti-soluzione, conteggio come spiegazione/indizio, vietato nei test intermedi, limiti di richieste, ricaduta sul tutor standard. Provato solo con un servizio Gemini simulato. Sostituisce in parte la decisione «nessuna chiave API» (che restava motivata dai crediti Pro: Gemini gratuito non ha costi). Motivo: richiesta dell'utente di spiegazioni più semplici e indizi.
