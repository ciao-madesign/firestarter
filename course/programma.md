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

Pipe, redirezione, i due canali di uscita (stdout e stderr), filtri, variabili d'ambiente, codici di uscita anche nelle pipeline, PATH e permessi di esecuzione, test positivi e negativi.

### Ripasso M1 — Ripasso: formattare e sommare colonne (printf, awk)

Obiettivo: Riprendere in 5 minuti la lettura di un CSV, la stampa formattata e il totale di una colonna.

Concetti: ripasso: awk e printf; ripasso: totale di una colonna.

Verifica (criterio): report.txt = Anna: 7, Bruno: 5, Carla: 9, totale 21; hai usato awk (Bash) oppure Import-Csv (PowerShell).

### M2.L1 — Pipe e redirezione dell'output

Obiettivo: Collegare comandi con | e scrivere l'output su file con > e >>, conoscendo il rischio di sovrascrittura.

Concetti: pipe |; redirezione > e >>; rischio di sovrascrittura con >; grep come filtro.

Verifica (criterio): errori.txt ha esattamente 5 righe, tutte con ERROR; importante.txt è invariato.

### M2.L2 — Due canali: output ed errori

Obiettivo: Separare, unire e scartare i due canali di uscita di un comando (stdout e stderr) e prevedere dove finisce ogni messaggio.

Concetti: stdout e stderr; redirezione 2> e 2>&1; ordine delle redirezioni; /dev/null.

Verifica (criterio): ok.txt ha solo le righe dei dati; errori.txt solo il messaggio di errore; tutto.txt entrambi; hai usato 2>/dev/null (PowerShell: 2>$null); canali.md cita stdout, stderr e 2>&1.

### M2.L3 — Filtri: grep, sort, uniq, cut, wc

Obiettivo: Comporre filtri in pipeline per estrarre, ordinare e contare dati da un log.

Concetti: filtri in pipeline; cut, sort, uniq -c, wc; Group-Object e Measure-Object in PowerShell.

Verifica (criterio): Per ogni status presente nel log c'è una riga con il codice e il suo conteggio corretto.

### M2.L4 — Variabili d'ambiente e codici di uscita

Obiettivo: Impostare una variabile d'ambiente e leggere l'esito dell'ultimo comando ($? in Bash; $? e $LASTEXITCODE in PowerShell).

Concetti: variabili d'ambiente; codici di uscita ($?); differenza Bash/PowerShell sugli esiti.

Verifica (criterio): STAGE vale testing; esito.txt contiene il numero 2 (Bash; anche con una breve etichetta) oppure False (PowerShell).

### M2.L5 — Codici di uscita nelle pipeline e negli script

Obiettivo: Prevedere il codice di uscita di una pipeline, sapere che «nessuna corrispondenza» non è sempre un errore e scrivere uno script con codici di uscita corretti.

Concetti: codici di uscita nelle pipeline; pipefail; grep -c e codice 1; $LASTEXITCODE.

Verifica (criterio): Lo script stampa 3 per log.txt (uscita 0), 0 per pulito.txt (uscita 0) ed esce con 2 per un file inesistente; codici.md contiene i tre valori corretti per la tua shell.

### M2.L6 — PATH, permessi di esecuzione e «command not found»

Obiettivo: Capire come la shell trova i comandi, distinguere i tre errori più comuni e rendere eseguibile uno script richiamabile per nome.

Concetti: PATH; permesso di esecuzione; tre errori di avvio dei comandi; which e type.

Verifica (criterio): bin/ contiene lo script (eseguibile in Bash); il PATH della sessione contiene la cartella bin; hai eseguito lo script per nome con successo; percorso.md spiega i messaggi e la persistenza.

### M2.L7 — Test positivi e negativi: atteso ed effettivo

Obiettivo: Provare un programma con input validi e non validi e documentare risultato atteso ed effettivo in una tabella.

Concetti: input validi e non validi; test negativi; risultato atteso ed effettivo; permesso di esecuzione e chmod.

Verifica (criterio): Lo storico mostra ≥2 esecuzioni riuscite (codice 0) e ≥2 fallite (codice ≠ 0) con argomenti diversi; piano-test.md contiene la tabella.

### M2.L8 — Scenario nuovo: analizzare un log

Obiettivo: Applicare pipe, filtri e redirezione a un problema che non hai visto: riassumere un file di log.

Concetti: pipeline su un problema nuovo; sort + uniq -c; trasferimento.

Verifica (criterio): report.txt ha i conteggi corretti in ordine decrescente; errori.txt contiene il percorso corretto; hai usato una pipeline.

## M3 — HTTP e API

Client e server, URL e codifica dei parametri, metodi, status code, header, body JSON e virgolette tra Bash e PowerShell 5.1, errore HTTP ed errore applicativo.

### M3.L1 — Client e server, URL e metodi

Obiettivo: Capire chi fa cosa in una richiesta HTTP, leggere un URL e inviare una prima richiesta GET con curl (o Invoke-RestMethod).

Concetti: client e server; URL ed endpoint; metodi HTTP; GET con curl; connessione rifiutata (curl 7).

Verifica (criterio): health.json contiene il JSON di risposta con status "ok" e il log del server mostra la richiesta GET /v1/health.

### M3.L2 — Status code e header

Obiettivo: Leggere lo status code e gli header di una risposta, e salvarli con gli strumenti della shell.

Concetti: status code; header; curl -i, -I, -w; X-Request-Id; differenza 404/405.

Verifica (criterio): status.txt contiene 404; request-id.txt contiene un identificativo del tipo req_000123 che il server ha realmente assegnato a una richiesta a /v1/health.

### M3.L3 — URL, query string e caratteri da codificare

Obiettivo: Leggere le parti di un URL, costruire query string corrette e codificare i caratteri speciali (spazio, &, apostrofo).

Concetti: query string; codifica percentuale; curl -G --data-urlencode; [uri]::EscapeDataString.

Verifica (criterio): esatto.json ha total 1 e il titolo R&D; sbagliato.json ha total 6; url.md contiene %20, %26, %27 e spiega perché il secondo risultato è sbagliato; il token non è scritto nei comandi.

### M3.L4 — Body JSON, parametri e Content-Type

Obiettivo: Usare query parameter e inviare un body JSON dichiarando il Content-Type, con l'URL correttamente quotato.

Concetti: query parameter; body JSON; Content-Type; quoting degli URL; header Authorization.

Verifica (criterio): aperti.json ha 2 task, tutti open; il server ha ricevuto un POST /v1/tasks con titolo "Imparare curl" e ha risposto 201.

### M3.L5 — Il JSON tra virgolette: Bash e Windows PowerShell 5.1

Obiettivo: Inviare un body JSON che contiene virgolette e apostrofi nelle due shell, scegliendo tra testo nel comando, file e costruzione automatica.

Concetti: quoting del JSON; curl -d @file; jq --arg; ConvertTo-Json; argomenti verso programmi esterni in PowerShell 5.1.

Verifica (criterio): Nel servizio ci sono almeno due task con quel titolo esatto; hai visto un errore invalid_json; hai usato un file e una costruzione automatica; approcci.md confronta i tre approcci.

### M3.L6 — Errore HTTP ed errore applicativo a confronto

Obiettivo: Distinguere lo status HTTP dal codice di errore del corpo (applicativo) e usarli entrambi per descrivere un problema.

Concetti: errore HTTP vs errore applicativo; 404 route_not_found vs not_found; 422 validation_failed; 401 unauthorized.

Verifica (criterio): Il server ha registrato 404, 422 e 401; errori.md contiene i tre codici applicativi (not_found, validation_failed, unauthorized).

### M3.L7 — Scenario nuovo: leggere due risposte sconosciute

Obiettivo: Confrontare una risposta di successo e una di errore di un endpoint mai usato e documentarne gli elementi essenziali con evidenze reali.

Concetti: lettura di una risposta HTTP; status vs codice applicativo; trasferimento.

Verifica (criterio): Le richieste reali esistono nel registro del server e il file cita i loro X-Request-Id reali, gli status e il codice di errore.

## M4 — Testing API REST + OpenAPI

Specifica OpenAPI, jq a più livelli, autenticazione e segreti, CRUD, validazione (400, 415, 422), paginazione e idempotenza, timeout e rate limit, confronto con PowerShell.

### M4.L1 — Leggere una specifica OpenAPI

Obiettivo: Scaricare la specifica OpenAPI del servizio e ricavarne informazioni verificabili (quali endpoint accettano POST).

Concetti: struttura di una specifica OpenAPI; jq di base; ConvertFrom-Json.

Verifica (criterio): elenco.txt contiene esattamente i tre percorsi con POST: /auth/token, /projects, /tasks.

### M4.L2 — jq a più livelli: filtrare, ordinare, raggruppare

Obiettivo: Estrarre, filtrare, ordinare e contare i dati di una risposta JSON con una pipeline di filtri (jq in Bash, oggetti in PowerShell).

Concetti: jq select e sort_by; group_by; interpolazione di stringhe; Where-Object, Sort-Object, Group-Object.

Verifica (criterio): aperti.txt ha i tre titoli nell'ordine Correggere il bug di login, Rivedere le API, Preparare le release notes; per-stato.txt ha done 1, in_progress 1, open 3; sintesi.md nomina i filtri usati; il token non è scritto nei comandi.

### M4.L3 — Autenticazione Bearer e segreti

Obiettivo: Ottenere un access token senza scrivere i segreti nei comandi e usarlo in una richiesta autenticata.

Concetti: autenticazione Bearer; segreti in variabili d'ambiente; ottenere un token; jq -r.

Verifica (criterio): Il server registra POST /v1/auth/token → 200 e GET /v1/me → 200; nessun segreto compare nei tuoi comandi.

### M4.L4 — CRUD con JSON, Content-Type e Accept

Obiettivo: Creare, leggere e aggiornare una risorsa con richieste HTTP, verificando lo stato dopo ogni passaggio.

Concetti: CRUD con HTTP; Content-Type e Accept; PATCH vs PUT; 409 conflitto; Location header.

Verifica (criterio): Esiste un task "Scrivere la guida API" con status done; il server ha registrato POST 201, GET 200 su quell'id e PATCH 200.

### M4.L5 — Validazione: 400, 415 e 422 e il motivo dell'errore

Obiettivo: Distinguere gli errori di formato (400, 415) da quelli di validazione (422), leggere l'elenco errors e provare i valori ai limiti.

Concetti: validazione 422; 400 contro 422 contro 415; valori ai limiti; test negativi mirati.

Verifica (criterio): Il registro mostra 400, 415, 201 e 422 con i campi title, priority, status e projectId; casi.md ha la tabella con almeno 6 righe.

### M4.L6 — Paginazione e idempotenza

Obiettivo: Leggere pagine di risultati, calcolare l'offset di una pagina e verificare l'idempotenza di DELETE.

Concetti: paginazione; validazione 422; 400 vs 422; idempotenza.

Verifica (criterio): pagina2.json contiene i task con id 3 e 4; idempotenza.txt contiene "204 404"; il server ha registrato DELETE 204 e poi DELETE 404.

### M4.L7 — Timeout e rate limit

Obiettivo: Riconoscere e documentare un rate limit (429, Retry-After) e un timeout del client.

Concetti: rate limit 429; header Retry-After; timeout del client (curl 28).

Verifica (criterio): Il server registra un 429 su /v1/search; attesa.txt coincide con il Retry-After di un 429 reale; timeout.txt contiene 28 (Bash) o un messaggio con "timed out" (PowerShell).

### M4.L8 — Dallo stesso test a PowerShell

Obiettivo: Trasferire una procedura di test da Bash a PowerShell 5.1: oggetti al posto del testo, errori HTTP come eccezioni, e la trappola dell'alias curl.

Concetti: trasferire una procedura da Bash a PowerShell; alias curl vs curl.exe; Invoke-RestMethod; gestione degli errori HTTP in PowerShell.

Verifica (criterio): procedura.ps1 stampa bob, usa Invoke-RestMethod o curl.exe (non l'alias curl) e non contiene segreti.

### M4.L9 — Scenario nuovo: documentare la creazione di un task

Obiettivo: Partendo dalla sola specifica OpenAPI, ricavare le regole di un endpoint e provarle con una richiesta riuscita e una non valida.

Concetti: lettura della specifica; validazione 422; trasferimento.

Verifica (criterio): Il registro del server mostra POST /v1/tasks con 201 e 422; endpoint.md cita i due X-Request-Id e il campo obbligatorio; hai consultato la specifica; nessun token nei comandi.

## M5 — Integrazioni e diagnosi

DNS, porta chiusa o filtrata e timeout, 4xx e 5xx, log e X-Request-Id, individuare il punto di rottura, retry e script elementari, errori intermittenti.

### Ripasso M1 — Ripasso: nome, porta chiusa e timeout

Obiettivo: Riprendere in 5 minuti i codici di curl per nome inesistente, porta chiusa e porta filtrata, e controllare il nome con nslookup.

Concetti: ripasso: codici di curl; ripasso: nslookup.

Verifica (criterio): ripasso.txt = nome 6, chiusa 7, filtrata 28; hai usato -m e il controllo del nome.

### M5.L1 — DNS e raggiungibilità: il nome non si risolve

Obiettivo: Riconoscere un errore di risoluzione del nome (DNS), trovarne la causa in una configurazione e correggerla.

Concetti: DNS (introduttivo); curl exit 6; metodo diagnostico; variabili di configurazione errate.

Verifica (criterio): GET /v1/health risponde 200; TASKFLOW_URL è http://localhost:8080; causa.txt cita il nome errato "localhst".

### M5.L2 — Connessione rifiutata, processi e configurazione

Obiettivo: Distinguere nome non risolto e porta chiusa, e verificare su quale porta ascolta il servizio.

Concetti: connessione rifiutata (curl 7); ps e processi; configurazione del servizio; permessi sui processi.

Verifica (criterio): porta.txt contiene 8080; TASKFLOW_URL usa quella porta; GET /v1/health → 200.

### M5.L3 — Timeout, porta chiusa o nome sbagliato: tre sintomi di rete

Obiettivo: Distinguere dal messaggio e dal codice di uscita di curl un nome inesistente, una porta chiusa, una porta filtrata e un server lento.

Concetti: porta chiusa e porta filtrata; timeout di connessione e di risposta; codici di uscita di curl; nc -w e Test-NetConnection.

Verifica (criterio): codici.txt = nome 6, rifiutata 7, filtrata 28, lenta 28; hai usato il timeout (-m) e un controllo di porta su 8081 e 8089; sintomi.md ha la tabella.

### M5.L4 — Un 401 inatteso: leggere risposta e log

Obiettivo: Diagnosticare un 401 usando il corpo della risposta e il log applicativo, e ripristinare il funzionamento.

Concetti: 4xx: autenticazione; log applicativi; token scaduto; fatto osservato vs ipotesi.

Verifica (criterio): Il server ha registrato prima un 401 e poi un 200 su /v1/tasks; hai consultato app.log; diagnosi.txt dice che il token era scaduto.

### M5.L5 — Errori 5xx e retry: uno script elementare

Obiettivo: Scrivere ed eseguire uno script che riprova un'operazione instabile con un numero massimo di tentativi.

Concetti: errori 5xx; retry con numero massimo di tentativi; script elementari; exit code di uno script.

Verifica (criterio): Lo script esiste, è stato eseguito con codice 0 stampando "OK dopo 2 tentativi" e il server ha registrato 500 e poi 200 su /v1/flaky.

### M5.L6 — Trovare il punto di rottura nei log

Obiettivo: Analizzare un log di accessi con filtri e conteggi per individuare l'endpoint con più errori 5xx.

Concetti: analisi di log; pipeline di conteggio; separatore --.

Verifica (criterio): top-errori.txt contiene il percorso corretto; totale-5xx.txt contiene il numero corretto.

### M5.L7 — Seguire una richiesta tra client e log del server (X-Request-Id)

Obiettivo: Usare l'identificativo di richiesta per ritrovare nei log del server cosa è successo a una chiamata specifica.

Concetti: X-Request-Id; correlazione tra client e log; access.log e app.log.

Verifica (criterio): Il registro mostra un 200, un 404 e un 401; hai cercato gli identificativi nei log; tracce.md contiene gli identificativi reali delle tre richieste e nomina access.log e app.log.

### M5.L8 — Più cause insieme: correggerne una ne rivela un'altra

Obiettivo: Diagnosticare uno script che fallisce per quattro cause successive (nome host, redirect, token scaduto, Content-Type) e documentarle nell'ordine in cui emergono.

Concetti: diagnosi con più cause; redirect 301 e Location; ordine delle correzioni.

Verifica (criterio): Il registro mostra POST /v1/tasks con 401, poi 415, poi 201; lo script contiene il Content-Type; diagnosi.md nomina le quattro cause.

### M5.L9 — Strumenti di rete: DNS, porte, certificati e CORS

Obiettivo: Usare gli strumenti di rete per distinguere DNS, porta chiusa e certificato, e leggere gli header CORS.

Concetti: nslookup/dig; nc e Test-NetConnection; certificato scaduto; CORS.

Verifica (criterio): Hai usato uno strumento DNS e uno di porta; rete.md contiene IP, 443 aperta, 8443 chiusa e un'origine.

### M5.L10 — Scenario nuovo: il 401 su staging

Obiettivo: Diagnosticare da soli un 401 in un ambiente diverso da quello usato finora e documentare causa e correzione.

Concetti: 401 invalid_token; ambienti diversi; trasferimento.

Verifica (criterio): Il server ha registrato su staging un 401 e poi un 200 su /v1/tasks; hai letto app.log; diagnosi.md nomina la causa (token di un altro ambiente) e l'ambiente.

### M5.L11 — Scenario nuovo: l'errore intermittente

Obiettivo: Misurare un errore che compare solo ogni tanto, trovarne il pattern nei log e proporre una politica di retry motivata.

Concetti: errore intermittente; misurare un tasso di errore; politica di retry; idempotenza.

Verifica (criterio): Il registro mostra almeno 12 chiamate a /v1/flaky; analisi.md riporta i numeri osservati, il pattern, la causa dal log e una politica di retry con tentativi, attesa e limiti sull'idempotenza.

## M6 — Documentazione professionale + progetto finale

Test case e test plan, bug report riproducibili, documentazione con esempi verificabili, verifica manuale di una guida, troubleshooting, procedura da ambiente pulito, progetto finale.

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

### M6.L4 — Verificare una guida a mano: ciò che il controllo automatico non vede

Obiettivo: Controllare una per una le affermazioni di una guida (porta, autenticazione, paginazione, campi, status) provandole sul servizio e documentare le prove.

Concetti: verifica manuale della documentazione; prova per ogni affermazione; tabella delle verifiche.

Verifica (criterio): La guida corretta contiene i fatti giusti (porta 8080, Bearer, limit e offset, solo title obbligatorio, priority 1-5, 201, 204) e nessun errore della bozza; le verifiche hanno 7 righe e le prove sono state davvero eseguite.

### M6.L5 — Troubleshooting e verifica da un ambiente pulito

Obiettivo: Scrivere una guida di troubleshooting e una procedura ripetibile che funziona da un ambiente pulito.

Concetti: troubleshooting guide; verifica da ambiente pulito; configurazione e segreti.

Verifica (criterio): La guida ha 3 sezioni con Sintomo/Causa/Soluzione e cita i codici 401, 422, 429; la verifica da ambiente pulito termina con 0 e stampa VERIFICA OK; nessun segreto nello script.

### M6.L6 — Progetto finale: testare e documentare staging

Obiettivo: Testare un'API, individuare un'anomalia rispetto alla documentazione e consegnare piano di test, bug report, guida corretta e procedura ripetibile.

Concetti: progetto finale: test plan, bug report, guida e procedura ripetibile; anomalia di versione tra documentazione e comportamento.

Verifica (criterio): Tutti i controlli oggettivi sotto sono superati.

## M7 — Automazione (estensione facoltativa) (estensione facoltativa)

Cicli e funzioni, lettura di file riga per riga, argomenti e codici di uscita negli script, suite di test ripetibili con report, retry e rate limit.

### M7.L1 — Cicli e funzioni per ripetere le operazioni

Obiettivo: Automatizzare richieste ripetitive con un ciclo e raccogliere un comando riutilizzabile in una funzione.

Concetti: cicli; funzioni; chiamate API da script.

Verifica (criterio): Esistono i tre task; hai usato un ciclo; la funzione `mostra` è definita e ha stampato i tre titoli.

### M7.L2 — Leggere un file riga per riga

Obiettivo: Eseguire un'operazione per ogni riga di un file, saltando righe vuote e commenti, e gestire i fine riga di Windows.

Concetti: ciclo riga per riga; read -r; fine riga CRLF; tr -d.

Verifica (criterio): risultati.txt: /v1/health 200, /v1/projects 200, /v1/tasks 200, /v1/nonesiste 404; risultati-win.txt: health 200, projects 200, nonesiste 404; hai usato un ciclo; appunti.md cita CRLF o \r.

### M7.L3 — Argomenti e codici di uscita negli script

Obiettivo: Scrivere uno script che riceve argomenti (con un valore predefinito), segnala l'uso errato e restituisce codici di uscita diversi per ogni esito.

Concetti: argomenti degli script; valori predefiniti; codici di uscita come contratto; $LASTEXITCODE.

Verifica (criterio): Lo script rispetta i quattro esiti (prova con /v1/health, /v1/nonesiste, la porta 8081, la porta 8089 con 1 secondo e nessun argomento).

### M7.L4 — Una suite di test ripetibile con report

Obiettivo: Raccogliere i controlli in uno script che stampa PASS/FAIL, un riepilogo e restituisce un codice di uscita.

Concetti: automazione di verifiche; suite di test in uno script; exit code.

Verifica (criterio): L'esecuzione stampa PASS: 4 (o più) FAIL: 0 ed esce con 0.

### M7.L5 — Retry con Retry-After: gestire il rate limit

Obiettivo: Scrivere un client che rispetta il rate limit: su 429 attende il tempo indicato e riprova, con un massimo di tentativi.

Concetti: gestione di errori e retry; rate limit; concatenazione di operazioni.

Verifica (criterio): L'esecuzione stampa "completate 8 ricerche" con almeno un 429 gestito ed esce con 0.

### M7.L6 — Scenario nuovo: controllare un elenco di endpoint

Obiettivo: Applicare ciclo, lettura riga per riga, argomenti e codici di uscita a un problema nuovo: uno script che verifica una lista di endpoint con lo status atteso.

Concetti: trasferimento: ciclo + argomenti + codici di uscita; curl -w http_code.

Verifica (criterio): Con endpoint.txt: 3 PASS, riepilogo 3 passati / 0 falliti, uscita 0; con un file che si aspetta lo status sbagliato: FAIL e uscita 1; con un file inesistente: uscita 2.

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

## M9 — Dal codice alla documentazione (estensione facoltativa)

Sola lettura su un progetto d'esempio: trovare le rotte, ricavare il contratto da un handler, confrontare codice e documentazione, documentare un endpoint che non ha documentazione, cronologia Git, OpenAPI in YAML e JSON Schema di base.

### M9.L1 — Trovare le rotte nel codice

Obiettivo: Ricavare dal codice di un progetto Next.js d'esempio l'elenco degli endpoint (metodo, percorso, file) usando find e grep, in sola lettura.

Concetti: rotte Next.js; funzioni serverless; find e grep su un progetto.

Verifica (criterio): Le 6 rotte ci sono con il file giusto; hai cercato nel codice con find o grep (o Get-ChildItem/Select-String).

### M9.L2 — Leggere un handler e ricavarne il contratto

Obiettivo: Leggere il codice di due handler e ricavarne autenticazione, parametri, validazioni e risposte, senza eseguire nulla.

Concetti: lettura di un handler; validazione e status; limit e massimo.

Verifica (criterio): Il documento contiene Bearer/Authorization, title obbligatorio di almeno 3 caratteri, gli status 201/401/422, limit (default 20, massimo 100) e la proprietà items.

### M9.L3 — Confrontare codice e documentazione esistente

Obiettivo: Trovare le discrepanze tra la documentazione esistente (docs/api.md) e il comportamento del codice, citando l'evidenza.

Concetti: audit della documentazione; evidenza dal codice; discrepanze.

Verifica (criterio): Almeno 4 delle 5 discrepanze (forma della risposta, limite massimo, status della creazione, autenticazione di health, risposta di DELETE) con il file di evidenza.

### M9.L4 — Git in sola lettura: quando e perché è cambiato

Obiettivo: Usare git log, show e blame per scoprire quando e da chi è stato cambiato un comportamento, senza modificare il repository.

Concetti: git log, show, blame; cronologia di un file; Git in sola lettura.

Verifica (criterio): storia.md contiene 053b271, Alice Rossi, 2026-09-02 e 942277e; hai usato git log/show/blame; il repository non è stato modificato.

### M9.L5 — OpenAPI in YAML scritto a mano e JSON Schema di base

Obiettivo: Scrivere in YAML una specifica OpenAPI per due endpoint del progetto, con schema JSON del body, risposte e autenticazione, e farla validare.

Concetti: OpenAPI in YAML; JSON Schema di base; validazione di un documento.

Verifica (criterio): Il YAML è valido e contiene tutti gli elementi richiesti.

### M9.L6 — Documentare un endpoint che non ha documentazione

Obiettivo: Ricavare dal solo codice il contratto di un endpoint non documentato, separando ciò che il codice dice da ciò che non dice, e scrivere la pagina con le domande aperte.

Concetti: documentare da codice; autenticazione con firma HMAC; domande aperte; fatto e ipotesi.

Verifica (criterio): Il documento riporta POST, /api/webhook-polar, x-polar-signature, HMAC SHA-256 del body grezzo, i tre status con i corpi, POLAR_WEBHOOK_SECRET e almeno due domande aperte; hai letto il file del codice.

### M9.L7 — Scenario nuovo: ricostruire una modifica dalla cronologia

Obiettivo: Usare Git in sola lettura per ricostruire chi, quando e perché ha cambiato un comportamento, e verificare se la documentazione è stata aggiornata.

Concetti: trasferimento: cronologia Git in sola lettura; documentazione disallineata.

Verifica (criterio): ricostruzione.md contiene l'hash 09c6cb1, l'autore Bruno Verdi, la data 15 settembre 2026 e la conclusione che la documentazione non è stata aggiornata; hai usato git log o git show.

## M10 — Sessioni, webhook e autenticazione (estensione facoltativa)

Cookie di sessione, CSRF e SameSite, lettura di un JWT, webhook firmati con HMAC e mappa dei flussi di autenticazione (queste ultime due solo in Bash).

### M10.L1 — Sessioni con cookie

Obiettivo: Eseguire un login che restituisce un cookie di sessione, riusarlo, chiudere la sessione e documentare gli attributi del cookie.

Concetti: cookie di sessione; curl -c e -b; attributi dei cookie.

Verifica (criterio): Il registro mostra login 200, session 200, logout 204, session 401 in quest'ordine; sessione.md spiega gli attributi; nessuna password nei comandi.

### M10.L2 — CSRF e SameSite: perché il cookie da solo non basta

Obiettivo: Vedere come una richiesta con cookie valido può essere rifiutata e spiegare le difese: token anti-CSRF, controllo dell'origine e SameSite.

Concetti: CSRF; SameSite; token anti-CSRF; header Origin.

Verifica (criterio): Il registro mostra csrf_token_missing, csrf_origin_mismatch e un 200; csrf.md ha la tabella a tre righe e nomina SameSite, X-CSRF-Token, Origin e Bearer; nessuna password nei comandi.

### M10.L3 — Leggere un JWT: cosa si vede e cosa no

Obiettivo: Decodificare header e payload di un JWT, interpretare scadenza e firma e spiegare perché leggere un token non equivale a verificarlo.

Concetti: JWT; base64url; firma e scadenza; leggere non è verificare.

Verifica (criterio): Il registro mostra 200 per il valido, token_expired per lo scaduto e invalid_signature per il manomesso; hai decodificato il payload; jwt.md ha la tabella e le conclusioni.

### M10.L4 — Webhook firmati: la callback di un servizio esterno

Obiettivo: Inviare una notifica a un endpoint che richiede una firma HMAC, capire perché viene rifiutata e documentare la procedura di verifica.

Concetti: webhook; firma HMAC SHA-256; replay e tolleranza; gestione dei segreti.

Verifica (criterio): Il registro mostra due 401 diversi (missing_signature e invalid_signature) e un 200; webhook.md descrive la procedura senza rivelare il segreto; il segreto non è nei comandi.

### M10.L5 — Mappa dei flussi di autenticazione

Obiettivo: Confrontare in un documento i meccanismi di autenticazione provati nel corso (token Bearer, cookie di sessione, firma dei webhook, token personale) dopo averli usati.

Concetti: flussi di autenticazione; confronto di meccanismi; documentare la sicurezza.

Verifica (criterio): Il registro mostra i tre 200; la tabella ha le colonne richieste e le quattro righe; nessun segreto nei comandi o nel documento.

## M11 — Laboratorio a due nodi (estensione facoltativa)

Un server che ospita il servizio e un client che lo usa, su una rete simulata: ssh, interpretazione dei comandi (client o server), servizi, porte, firewall, nome (DNS e file hosts), registro del server; guasti controllati e due verifiche finali con rapporto di diagnosi. Equivale al laboratorio con due macchine virtuali (kit reale in course/lab-vm/).

### M11.L1 — Due nodi: chi serve e chi usa

Obiettivo: Distinguere il client dal server, verificare rete, porta e servizio e documentare la mappa del laboratorio.

Concetti: client e server; ssh; porte in ascolto; livelli di verifica.

Verifica (criterio): Il registro mostra i comandi dei quattro livelli; mappa.md contiene gli indirizzi 192.168.50.10 e 192.168.50.20, le parole client e server, la porta 8080 e health.

### M11.L2 — Prima integrazione: chiamare il servizio dal client

Obiettivo: Recuperare l'elenco dei task dal client, provare richieste non valide, distinguere gli errori e scrivere un esempio di documentazione.

Concetti: client e server nelle integrazioni; registro del server; esempio di documentazione API.

Verifica (criterio): Il registro API mostra 200, 401 e 404 verso server.lab; hai letto il registro del server; esempio-api.md contiene richiesta, Authorization, risposta e almeno 401 e 404.

### M11.L3 — Dove viene interpretato il comando: client o server?

Obiettivo: Prevedere, dal tipo di virgolette e dalla posizione di pipe e redirezioni, se un comando passato a ssh viene interpretato dal client o dal server.

Concetti: quoting con ssh; espansione locale e remota; redirezione locale o remota; filesystem per nodo.

Verifica (criterio): locale.txt contiene server; il file /tmp/nota.txt esiste sul server; virgolette.txt ha «doppie: lab» e «singole: server»; quoting.md ha la tabella con client e server citati.

### M11.L4 — Servizio fermo: dal sintomo alla correzione

Obiettivo: Riconoscere una connessione rifiutata, trovare sul server il servizio fermo, riavviarlo e verificarlo.

Concetti: connessione rifiutata; systemctl; journalctl; sudo.

Verifica (criterio): Il registro mostra una richiesta fallita prima della correzione, systemctl status e journalctl sul server, l'avvio con sudo e un 200 finale; il servizio è attivo; diagnosi.md spiega sintomo, causa e correzione.

### M11.L5 — Porta sbagliata: il servizio è attivo ma non dove ti aspetti

Obiettivo: Scoprire che il servizio ascolta su una porta diversa da quella documentata e correggere la configurazione del server.

Concetti: porta in ascolto; file di configurazione; riavvio del servizio; sed -i.

Verifica (criterio): Il file di configurazione contiene PORT=8080, il servizio ascolta sulla 8080, il registro mostra un 200 dal client; diagnosi.md cita 9090, 8080, sed o la riga PORT e il riavvio.

### M11.L6 — Errore 500: la causa è su un altro servizio

Obiettivo: Distinguere un errore del server da uno del client, trovare nel registro la dipendenza che manca e ripristinarla.

Concetti: errore 500; dipendenze tra servizi; registro del server.

Verifica (criterio): Il registro API mostra 500 poi 200 su GET /v1/tasks; il database è attivo; hai letto il registro del server; diagnosi.md cita 500, database, journalctl o service.log e systemctl.

### M11.L7 — Collegare i log di client e server con l'identificativo di richiesta

Obiettivo: Associare ogni risposta vista dal client alla riga corrispondente del registro del server, usando X-Request-Id.

Concetti: correlazione client-server; registro del server via ssh; variabili nei comandi ssh.

Verifica (criterio): Il registro mostra 200, 404 e 401 verso server.lab; hai letto il registro del server; tracce.md riporta gli identificativi reali e, per ognuno, lo status sia del client sia del server.

### M11.L8 — Timeout: la porta è filtrata dal firewall del server

Obiettivo: Riconoscere un timeout come sintomo diverso dalla porta chiusa, dimostrare che il servizio funziona in locale e aprire la porta nel firewall.

Concetti: porta filtrata e firewall; prova di contrasto locale/remoto; ufw; timeout di connessione.

Verifica (criterio): Il firewall non blocca più la porta; il registro mostra un 200 dal client; hai usato un timeout, la prova in locale sul server e ufw status; diagnosi.md spiega timeout, firewall e la prova in locale.

### M11.L9 — Il nome del server punta all'indirizzo sbagliato

Obiettivo: Scoprire che DNS e file hosts danno risposte diverse, individuare la riga errata e correggerla (o aggirarla con l'indirizzo).

Concetti: risoluzione dei nomi; file hosts e DNS; getent e nslookup; No route to host.

Verifica (criterio): Bash: la riga errata non c'è più e la richiesta per nome risponde 200. PowerShell: la richiesta verso 192.168.50.10 risponde 200. diagnosi.md spiega DNS, hosts, 192.168.50.11 e 192.168.50.10.

### M11.L10 — Verifica finale: integrazione documentata

Obiettivo: Partire da un sistema che non funziona, individuare più cause in sequenza, ripristinarlo e consegnare un rapporto utilizzabile da un altro tecnico.

Concetti: diagnosi con più cause su due nodi; rapporto di diagnosi.

Verifica (criterio): GET /v1/tasks risponde 200 dal client sulla 8080; configurazione, servizio e database sono a posto; rapporto.md elenca le tre cause (servizio fermo, porta, database), le correzioni e un esempio di richiesta.

### M11.L11 — Seconda verifica finale: integrazione documentata

Obiettivo: Diagnosticare e ripristinare un sistema con tre guasti a livelli diversi (nome, rete, applicazione), senza guida, e consegnare il rapporto.

Concetti: diagnosi su più livelli; nome, firewall e applicazione; rapporto di diagnosi.

Verifica (criterio): GET /v1/tasks risponde 200 dal client; firewall aperto e database attivo; il nome è corretto (Bash) o si usa l'indirizzo (PowerShell); rapporto.md elenca le tre cause nell'ordine, le correzioni e un esempio di richiesta.

