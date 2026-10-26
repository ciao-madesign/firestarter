# Programma del corso

Versione del curriculum: 0.1.0. File generato da `npm run course:programma`: non modificarlo a mano.

Ambiente del corso: macOS, Bash. PowerShell 5.1 come confronto dal Modulo 4. Livelli: 1 non autonomo; 2 esegue con istruzioni dettagliate; 3 esegue da solo le attività tipiche; 4 adatta la procedura a problemi nuovi e motiva le scelte.

## M1 — Fondamenti

Terminale e shell, variabili, prompt, percorsi, quoting, opzioni, man, lettura file.

### Ripasso M1 — Ripasso rapido dei 4 errori ricorrenti

Obiettivo: In circa 5 minuti: percorsi assoluti con le maiuscole giuste, errore di sintassi vs errore di esecuzione, lettura del prompt, previsioni coerenti.

Concetti: ripasso: percorsi assoluti case-sensitive; ripasso: errore di sintassi vs errore di esecuzione; ripasso: lettura del prompt.

Verifica (criterio): Il prompt mostra la cartella Rapporti; hai un errore di sintassi e uno di esecuzione nello storico; hai stampato il percorso; hai una previsione valutata.

### M1.L1 — Terminale, shell, variabili

Obiettivo: Distinguere terminale e shell, leggere il prompt, usare echo e le variabili ($SHELL, $HOME) e riconoscere il fallimento silenzioso.

Concetti: terminale e shell; echo; variabili con $; lettura del prompt; fallimento silenzioso delle variabili inesistenti.

Verifica (criterio): L'output è esattamente la riga richiesta e il comando contiene il carattere $.

### M1.L2 — Percorsi e navigazione

Obiettivo: Usare pwd, ls e cd con percorsi assoluti e relativi, rispettando le maiuscole, e leggere un messaggio di errore.

Concetti: pwd, ls, cd; percorso assoluto e relativo; le maiuscole contano; lettura di un messaggio di errore.

Verifica (criterio): Il prompt mostra la cartella Alpha e hai eseguito ls (o Get-ChildItem) su ../Beta.

### M1.L3 — Spazi, virgolette e quoting

Obiettivo: Capire che la shell divide la riga negli spazi, usare le virgolette per un unico argomento e distinguere errore di sintassi ed errore di esecuzione.

Concetti: la shell divide la riga negli spazi; le virgolette creano un unico argomento; caratteri speciali; errore di sintassi ed errore di esecuzione.

Verifica (criterio): Nell'output compaiono le due frasi dei file.

### M1.L4 — Opzioni, help e lettura dei file

Obiettivo: Riconoscere comando, opzioni e argomenti; consultare man; leggere file con cat/head; capire i file nascosti.

Concetti: comando, opzioni e argomenti; ls -l; man; -a e file nascosti; opzioni combinabili; cat; commenti con # nei file di configurazione.

Verifica (criterio): Un output contiene .nascosto e i file ordinati recente → medio → vecchio; un altro contiene esattamente "riga 1", "riga 2", "riga 3".

## M2 — Comporre e testare

Pipe, redirezione, filtri, variabili d'ambiente, codici di uscita, test positivi e negativi.

### M2.L1 — Pipe e redirezione dell'output

Obiettivo: Collegare comandi con | e scrivere l'output su file con > e >>, conoscendo il rischio di sovrascrittura.

Concetti: pipe |; redirezione > e >>; rischio di sovrascrittura con >; grep come filtro.

Verifica (criterio): errori.txt ha esattamente 5 righe, tutte con ERROR; importante.txt è invariato.

### M2.L2 — Filtri: grep, sort, uniq, cut, wc

Obiettivo: Comporre filtri in pipeline per estrarre, ordinare e contare dati da un log.

Concetti: filtri in pipeline; cut, sort, uniq -c, wc; Group-Object e Measure-Object in PowerShell.

Verifica (criterio): Per ogni status presente nel log c'è una riga con il codice e il suo conteggio corretto.

### M2.L3 — Variabili d'ambiente e codici di uscita

Obiettivo: Impostare una variabile d'ambiente e leggere l'esito dell'ultimo comando ($? in Bash; $? e $LASTEXITCODE in PowerShell).

Concetti: variabili d'ambiente; codici di uscita ($?); differenza Bash/PowerShell sugli esiti.

Verifica (criterio): STAGE vale testing; esito.txt contiene il numero 2 (Bash; anche con una breve etichetta) oppure False (PowerShell).

### M2.L4 — Test positivi e negativi: atteso ed effettivo

Obiettivo: Provare un programma con input validi e non validi e documentare risultato atteso ed effettivo in una tabella.

Concetti: input validi e non validi; test negativi; risultato atteso ed effettivo; permesso di esecuzione e chmod.

Verifica (criterio): Lo storico mostra ≥2 esecuzioni riuscite (codice 0) e ≥2 fallite (codice ≠ 0) con argomenti diversi; piano-test.md contiene la tabella.

### M2.L5 — Scenario nuovo: analizzare un log

Obiettivo: Applicare pipe, filtri e redirezione a un problema che non hai visto: riassumere un file di log.

Concetti: pipeline su un problema nuovo; sort + uniq -c; trasferimento.

Verifica (criterio): report.txt ha i conteggi corretti in ordine decrescente; errori.txt contiene il percorso corretto; hai usato una pipeline.

## M3 — HTTP e API

Client e server, URL, metodi, status code, header, body, JSON, parametri, errore HTTP ed errore applicativo.

### M3.L1 — Client e server, URL e metodi

Obiettivo: Capire chi fa cosa in una richiesta HTTP, leggere un URL e inviare una prima richiesta GET con curl (o Invoke-RestMethod).

Concetti: client e server; URL ed endpoint; metodi HTTP; GET con curl; connessione rifiutata (curl 7).

Verifica (criterio): health.json contiene il JSON di risposta con status "ok" e il log del server mostra la richiesta GET /v1/health.

### M3.L2 — Status code e header

Obiettivo: Leggere lo status code e gli header di una risposta, e salvarli con gli strumenti della shell.

Concetti: status code; header; curl -i, -I, -w; X-Request-Id; differenza 404/405.

Verifica (criterio): status.txt contiene 404; request-id.txt contiene un identificativo del tipo req_000123 che il server ha realmente assegnato a una richiesta a /v1/health.

### M3.L3 — Body JSON, parametri e Content-Type

Obiettivo: Usare query parameter e inviare un body JSON dichiarando il Content-Type, con l'URL correttamente quotato.

Concetti: query parameter; body JSON; Content-Type; quoting degli URL; header Authorization.

Verifica (criterio): aperti.json ha 2 task, tutti open; il server ha ricevuto un POST /v1/tasks con titolo "Imparare curl" e ha risposto 201.

### M3.L4 — Errore HTTP ed errore applicativo a confronto

Obiettivo: Distinguere lo status HTTP dal codice di errore del corpo (applicativo) e usarli entrambi per descrivere un problema.

Concetti: errore HTTP vs errore applicativo; 404 route_not_found vs not_found; 422 validation_failed; 401 unauthorized.

Verifica (criterio): Il server ha registrato 404, 422 e 401; errori.md contiene i tre codici applicativi (not_found, validation_failed, unauthorized).

### M3.L5 — Scenario nuovo: leggere due risposte sconosciute

Obiettivo: Confrontare una risposta di successo e una di errore di un endpoint mai usato e documentarne gli elementi essenziali con evidenze reali.

Concetti: lettura di una risposta HTTP; status vs codice applicativo; trasferimento.

Verifica (criterio): Le richieste reali esistono nel registro del server e il file cita i loro X-Request-Id reali, gli status e il codice di errore.

## M4 — Testing API REST + OpenAPI

Specifica OpenAPI, autenticazione e segreti, CRUD, validazione, paginazione, idempotenza, timeout, rate limit, confronto con PowerShell.

### M4.L1 — Leggere una specifica OpenAPI

Obiettivo: Scaricare la specifica OpenAPI del servizio e ricavarne informazioni verificabili (quali endpoint accettano POST).

Concetti: struttura di una specifica OpenAPI; jq di base; ConvertFrom-Json.

Verifica (criterio): elenco.txt contiene esattamente i tre percorsi con POST: /auth/token, /projects, /tasks.

### M4.L2 — Autenticazione Bearer e segreti

Obiettivo: Ottenere un access token senza scrivere i segreti nei comandi e usarlo in una richiesta autenticata.

Concetti: autenticazione Bearer; segreti in variabili d'ambiente; ottenere un token; jq -r.

Verifica (criterio): Il server registra POST /v1/auth/token → 200 e GET /v1/me → 200; nessun segreto compare nei tuoi comandi.

### M4.L3 — CRUD con JSON, Content-Type e Accept

Obiettivo: Creare, leggere e aggiornare una risorsa con richieste HTTP, verificando lo stato dopo ogni passaggio.

Concetti: CRUD con HTTP; Content-Type e Accept; PATCH vs PUT; 409 conflitto; Location header.

Verifica (criterio): Esiste un task "Scrivere la guida API" con status done; il server ha registrato POST 201, GET 200 su quell'id e PATCH 200.

### M4.L4 — Validazione, paginazione e idempotenza

Obiettivo: Leggere pagine di risultati, riconoscere gli errori di validazione e verificare l'idempotenza di DELETE.

Concetti: paginazione; validazione 422; 400 vs 422; idempotenza.

Verifica (criterio): pagina2.json contiene i task con id 3 e 4; idempotenza.txt contiene "204 404"; il server ha registrato DELETE 204 e poi DELETE 404.

### M4.L5 — Timeout e rate limit

Obiettivo: Riconoscere e documentare un rate limit (429, Retry-After) e un timeout del client.

Concetti: rate limit 429; header Retry-After; timeout del client (curl 28).

Verifica (criterio): Il server registra un 429 su /v1/search; attesa.txt coincide con il Retry-After di un 429 reale; timeout.txt contiene 28 (Bash) o un messaggio con "timed out" (PowerShell).

### M4.L6 — Dallo stesso test a PowerShell

Obiettivo: Trasferire una procedura di test da Bash a PowerShell 5.1: oggetti al posto del testo, errori HTTP come eccezioni, e la trappola dell'alias curl.

Concetti: trasferire una procedura da Bash a PowerShell; alias curl vs curl.exe; Invoke-RestMethod; gestione degli errori HTTP in PowerShell.

Verifica (criterio): procedura.ps1 stampa bob, usa Invoke-RestMethod o curl.exe (non l'alias curl) e non contiene segreti.

### M4.L7 — Scenario nuovo: documentare la creazione di un task

Obiettivo: Partendo dalla sola specifica OpenAPI, ricavare le regole di un endpoint e provarle con una richiesta riuscita e una non valida.

Concetti: lettura della specifica; validazione 422; trasferimento.

Verifica (criterio): Il registro del server mostra POST /v1/tasks con 201 e 422; endpoint.md cita i due X-Request-Id e il campo obbligatorio; hai consultato la specifica; nessun token nei comandi.

## M5 — Integrazioni e diagnosi

DNS, connessioni rifiutate, 4xx e 5xx, log, individuare il punto di rottura, retry e script elementari.

### M5.L1 — DNS e raggiungibilità: il nome non si risolve

Obiettivo: Riconoscere un errore di risoluzione del nome (DNS), trovarne la causa in una configurazione e correggerla.

Concetti: DNS (introduttivo); curl exit 6; metodo diagnostico; variabili di configurazione errate.

Verifica (criterio): GET /v1/health risponde 200; TASKFLOW_URL è http://localhost:8080; causa.txt cita il nome errato "localhst".

### M5.L2 — Connessione rifiutata, processi e configurazione

Obiettivo: Distinguere nome non risolto e porta chiusa, e verificare su quale porta ascolta il servizio.

Concetti: connessione rifiutata (curl 7); ps e processi; configurazione del servizio; permessi sui processi.

Verifica (criterio): porta.txt contiene 8080; TASKFLOW_URL usa quella porta; GET /v1/health → 200.

### M5.L3 — Un 401 inatteso: leggere risposta e log

Obiettivo: Diagnosticare un 401 usando il corpo della risposta e il log applicativo, e ripristinare il funzionamento.

Concetti: 4xx: autenticazione; log applicativi; token scaduto; fatto osservato vs ipotesi.

Verifica (criterio): Il server ha registrato prima un 401 e poi un 200 su /v1/tasks; hai consultato app.log; diagnosi.txt dice che il token era scaduto.

### M5.L4 — Errori 5xx e retry: uno script elementare

Obiettivo: Scrivere ed eseguire uno script che riprova un'operazione instabile con un numero massimo di tentativi.

Concetti: errori 5xx; retry con numero massimo di tentativi; script elementari; exit code di uno script.

Verifica (criterio): Lo script esiste, è stato eseguito con codice 0 stampando "OK dopo 2 tentativi" e il server ha registrato 500 e poi 200 su /v1/flaky.

### M5.L5 — Trovare il punto di rottura nei log

Obiettivo: Analizzare un log di accessi con filtri e conteggi per individuare l'endpoint con più errori 5xx.

Concetti: analisi di log; pipeline di conteggio; separatore --.

Verifica (criterio): top-errori.txt contiene il percorso corretto; totale-5xx.txt contiene il numero corretto.

### M5.L6 — Scenario nuovo: il 401 su staging

Obiettivo: Diagnosticare da soli un 401 in un ambiente diverso da quello usato finora e documentare causa e correzione.

Concetti: 401 invalid_token; ambienti diversi; trasferimento.

Verifica (criterio): Il server ha registrato su staging un 401 e poi un 200 su /v1/tasks; hai letto app.log; diagnosi.md nomina la causa (token di un altro ambiente) e l'ambiente.

### M5.L7 — Più cause insieme: correggerne una ne rivela un'altra

Obiettivo: Diagnosticare uno script che fallisce per quattro cause successive (nome host, redirect, token scaduto, Content-Type) e documentarle nell'ordine in cui emergono.

Concetti: diagnosi con più cause; redirect 301 e Location; ordine delle correzioni.

Verifica (criterio): Il registro mostra POST /v1/tasks con 401, poi 415, poi 201; lo script contiene il Content-Type; diagnosi.md nomina le quattro cause.

### M5.L8 — Strumenti di rete: DNS, porte, certificati e CORS

Obiettivo: Usare gli strumenti di rete per distinguere DNS, porta chiusa e certificato, e leggere gli header CORS.

Concetti: nslookup/dig; nc e Test-NetConnection; certificato scaduto; CORS.

Verifica (criterio): Hai usato uno strumento DNS e uno di porta; rete.md contiene IP, 443 aperta, 8443 chiusa e un'origine.

## M6 — Documentazione professionale + progetto finale

Test case e test plan, bug report riproducibili, documentazione con esempi verificabili, troubleshooting, procedura da ambiente pulito, progetto finale.

### M6.L1 — Test case e test plan

Obiettivo: Scrivere un piano di test con casi positivi e negativi, eseguirlo e riportare atteso ed effettivo.

Concetti: test case e test plan; casi positivi e negativi; atteso ed effettivo.

Verifica (criterio): La tabella ha ≥3 righe; gli status attesi sono previsti dalla specifica; il server ha registrato 201, 422 e 401 da questa shell; gli effettivi riportati esistono davvero nel log.

### M6.L2 — Passi di riproduzione e report di bug

Obiettivo: Scrivere un bug report riproducibile che distingue fatto osservato, comportamento documentato e ipotesi.

Concetti: passi di riproduzione; bug report; fatto osservato, comportamento documentato, ipotesi.

Verifica (criterio): Il server ha registrato PATCH → 409; il report ha tutte le sezioni, cita 409 e invalid_transition e contiene il requestId di quella richiesta.

### M6.L3 — Documentare un endpoint con esempi verificabili

Obiettivo: Correggere una pagina di documentazione finché metodo, campi, status ed esempi corrispondono davvero al comportamento dell'API.

Concetti: documentazione di un endpoint; esempi verificabili; coerenza tra documentazione e comportamento.

Verifica (criterio): Zero errori e zero avvisi verificabili; almeno 2 esempi eseguiti, tutti con lo status dichiarato.

### M6.L4 — Troubleshooting e verifica da un ambiente pulito

Obiettivo: Scrivere una guida di troubleshooting e una procedura ripetibile che funziona da un ambiente pulito.

Concetti: troubleshooting guide; verifica da ambiente pulito; configurazione e segreti.

Verifica (criterio): La guida ha 3 sezioni con Sintomo/Causa/Soluzione e cita i codici 401, 422, 429; la verifica da ambiente pulito termina con 0 e stampa VERIFICA OK; nessun segreto nello script.

### M6.L5 — Progetto finale: testare e documentare staging

Obiettivo: Testare un'API, individuare un'anomalia rispetto alla documentazione e consegnare piano di test, bug report, guida corretta e procedura ripetibile.

Concetti: progetto finale: test plan, bug report, guida e procedura ripetibile; anomalia di versione tra documentazione e comportamento.

Verifica (criterio): Tutti i controlli oggettivi sotto sono superati.

## M7 — Automazione (estensione facoltativa) (estensione facoltativa)

Cicli e funzioni, suite di test ripetibili con report, retry e rate limit.

### M7.L1 — Cicli e funzioni per ripetere le operazioni

Obiettivo: Automatizzare richieste ripetitive con un ciclo e raccogliere un comando riutilizzabile in una funzione.

Concetti: cicli; funzioni; chiamate API da script.

Verifica (criterio): Esistono i tre task; hai usato un ciclo; la funzione `mostra` è definita e ha stampato i tre titoli.

### M7.L2 — Una suite di test ripetibile con report

Obiettivo: Raccogliere i controlli in uno script che stampa PASS/FAIL, un riepilogo e restituisce un codice di uscita.

Concetti: automazione di verifiche; suite di test in uno script; exit code.

Verifica (criterio): L'esecuzione stampa PASS: 4 (o più) FAIL: 0 ed esce con 0.

### M7.L3 — Retry con Retry-After: gestire il rate limit

Obiettivo: Scrivere un client che rispetta il rate limit: su 429 attende il tempo indicato e riprova, con un massimo di tentativi.

Concetti: gestione di errori e retry; rate limit; concatenazione di operazioni.

Verifica (criterio): L'esecuzione stampa "completate 8 ricerche" con almeno un 429 gestito ed esce con 0.

## M8 — Portfolio (estensione facoltativa)

Quattro artefatti da portfolio verificati dal laboratorio: guida rapida, specifica OpenAPI, bug report con troubleshooting, script di test con report.

### M8.L1 — Portfolio 1: guida rapida all'API

Obiettivo: Scrivere da zero una guida "primi passi" i cui esempi curl sono tutti verificati dal controllo tecnico.

Concetti: guida rapida; esempi verificabili; portfolio.

Verifica (criterio): Zero errori/avvisi verificabili; almeno 3 endpoint; almeno 3 esempi eseguiti tutti corretti, di cui uno con status 4xx.

### M8.L2 — Portfolio 2: specifica OpenAPI

Obiettivo: Scrivere una specifica OpenAPI per tre risorse e confrontarla con quella pubblicata dal servizio.

Concetti: OpenAPI; specifica come contratto; portfolio.

Verifica (criterio): JSON valido; tre percorsi con i metodi richiesti; per ogni operazione tutti gli status della specifica del servizio; POST /tasks con `title` obbligatorio; nessun percorso inventato.

### M8.L3 — Portfolio 3: bug report e troubleshooting

Obiettivo: Scrivere un bug report riproducibile su un difetto reale e una tabella di risoluzione dei problemi per gli errori più comuni.

Concetti: bug report; troubleshooting; differenze tra ambienti.

Verifica (criterio): Bug report senza errori verificabili e con esempio eseguito; tutte le sezioni presenti; tabella con le quattro righe complete.

### M8.L4 — Portfolio 4: script di test con report

Obiettivo: Scrivere uno script di test dell'API che stampa PASS/FAIL, scrive un report ed esce con un codice che riflette l'esito.

Concetti: script di test; report; exit code.

Verifica (criterio): Esecuzione con PASS ≥ 6 e FAIL: 0, exit 0; con token sbagliato exit 1 e righe FAIL; `report.txt` creato.

