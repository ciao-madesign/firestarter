/** Spiegazioni semplificate, modulo 5 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M5: Record<string, string[]> = {
  "M5.R": [
    "Ripasso di 5 minuti sui tre modi in cui una richiesta può fallire PRIMA ancora di ricevere una risposta del servizio. `curl` ti dice com'è andata con un numero, il CODICE DI USCITA: 6 = il nome dell'indirizzo non esiste; 7 = la porta è chiusa (nessun servizio in ascolto), e l'errore arriva subito; 28 = la porta è «filtrata» (un firewall scarta i pacchetti) o il server è troppo lento, e l'errore arriva solo dopo l'attesa.",
    "Per non aspettare minuti, imposta sempre un tempo massimo con `-m 3` (massimo 3 secondi). Il codice di uscita si legge SUBITO dopo il comando: `echo $?` in Bash; in PowerShell `$LASTEXITCODE`, e solo con `curl.exe` (il vero curl).",
    "Il DNS è il servizio che trasforma un nome (come `localhoost`) in un indirizzo numerico. `nslookup nome` (in PowerShell: `Resolve-DnsName nome`) chiede al DNS se il nome esiste. Per un nome sbagliato risponde NXDOMAIN, che significa «questo nome non esiste».",
  ],
  "M5.L1": [
    "Prima di mandare una richiesta HTTP, il tuo computer deve trasformare il NOME del server (per esempio `localhost`) in un indirizzo numerico. Questo passaggio lo fa il DNS. Se il nome non esiste o è scritto male, la richiesta non parte nemmeno: non c'è nessuno status code (cioè nessun 404 o 500), c'è solo un errore del client. Con `curl` l'errore è «Could not resolve host» e il codice di uscita è 6.",
    "Il metodo per cercare la causa di un problema è sempre lo stesso, in cinque passi: 1) osserva l'errore; 2) formula un'ipotesi; 3) cerca una prova (evidenza) che la confermi; 4) correggi; 5) verifica che ora funzioni.",
    "Qui l'indirizzo del servizio viene dalla variabile `TASKFLOW_URL`: guardane il valore con `echo $TASKFLOW_URL` (PowerShell: `$env:TASKFLOW_URL`). Per correggere una variabile in questa finestra: `export TASKFLOW_URL=http://localhost:8080` (PowerShell: `$env:TASKFLOW_URL = \"http://localhost:8080\"`).",
  ],
  "M5.L2": [
    "A volte il nome si risolve bene, ma la richiesta fallisce comunque con «Connection refused» (curl: codice 7). Significa che il computer c'è, ma su quella PORTA non ascolta nessun programma. Pensa a un palazzo con tanti ingressi numerati: se bussi a un ingresso dove non c'è nessuno, ti rispondono subito «qui non c'è nessuno».",
    "Le cause tipiche: nell'indirizzo hai scritto la porta sbagliata, oppure il servizio è spento.",
    "Per capire su quale porta ascolta davvero il servizio: puoi vedere i programmi in esecuzione (`ps aux`; in PowerShell `Get-Process`) e cercare quello del servizio, oppure leggere il suo file di configurazione. I file si leggono con `cat`; per cercare una parola in un elenco usa `grep` (PowerShell: `Select-String`).",
    "Quando hai trovato la porta giusta, correggi `TASKFLOW_URL` in questa finestra (vedi la lezione precedente) e controlla con `curl $TASKFLOW_URL/v1/health`.",
  ],
  "M5.L3": [
    "Prima di ricevere uno status HTTP, la richiesta deve superare tre ostacoli, e ognuno dà un sintomo diverso. NOME inesistente: «Could not resolve host», codice 6. PORTA CHIUSA (nessun servizio ascolta): «Couldn't connect to server», codice 7, e la risposta è IMMEDIATA. PORTA FILTRATA (un firewall, cioè un filtro di sicurezza, scarta i pacchetti senza rispondere): nessuna risposta, e dopo l'attesa «Timeout was reached», codice 28.",
    "Quarto caso: la connessione riesce, ma il server risponde troppo tardi. Con `-m 3` (massimo 3 secondi) curl rinuncia ed esce con codice 28 e il messaggio «Operation timed out». Senza `-m` una porta filtrata ti fa aspettare oltre due minuti: imposta SEMPRE un tempo massimo.",
    "Per controllare solo la porta, senza fare una richiesta HTTP: `nc -zv -w 2 localhost 8081` in Bash e `Test-NetConnection localhost -Port 8081` in PowerShell. «Refused» subito significa porta chiusa; «timed out» dopo l'attesa significa porta filtrata.",
    "Per leggere il codice di uscita di curl: `echo $?` in Bash; `$LASTEXITCODE` in PowerShell, usando `curl.exe`. `Invoke-RestMethod -TimeoutSec 3` dà lo stesso messaggio sia per la connessione lenta sia per la risposta lenta; `curl.exe` invece le distingue. Le opzioni di curl si possono unire: `-sS` è `-s` (niente barre di avanzamento) più `-S` (mostra comunque gli errori).",
    "Il file `sintomi.md` contiene una tabella con quattro colonne (Sintomo, Codice, Significato, Dove guardare) e va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M5.L4": [
    "Il codice 401 significa «non autenticato». Può avere più cause: l'header `Authorization` manca; è scritto male (schema sbagliato); il token non è valido; oppure il token è SCADUTO. Il corpo della risposta (il campo `error`) ti dice quale. Il log dell'applicazione dà più dettagli, per esempio la data di scadenza e l'utente.",
    "Un LOG è un file in cui un programma scrive, riga per riga, quello che fa. I log del servizio simulato sono in `/var/log/taskflow/<ambiente>/`: `access.log` ha una riga per ogni richiesta ricevuta; `app.log` contiene gli eventi dell'applicazione (autenticazione, validazione, errori). Si leggono con `cat`, `tail` (le ultime righe) e `grep` (le righe con una parola).",
    "Quando scrivi una diagnosi, tieni separate tre cose: il FATTO OSSERVATO (cosa risponde davvero il server), il COMPORTAMENTO DOCUMENTATO (cosa dice la specifica) e l'IPOTESI (cosa pensi sia la causa, finché non hai una prova).",
    "Per ottenere un nuovo token si ripete la richiesta vista nel modulo 4 (`POST /v1/auth/token` con le credenziali dalle variabili d'ambiente) e si salva il risultato nella variabile `TASKFLOW_TOKEN`.",
  ],
  "M5.L5": [
    "Un errore 5xx è un errore del SERVER (non della tua richiesta) e spesso è temporaneo. Un client ben fatto riprova poche volte, con una pausa tra un tentativo e l'altro, e poi rinuncia segnalando l'errore con un codice di uscita diverso da 0.",
    "Uno SCRIPT è un file che contiene comandi, da eseguire tutti insieme. In Bash: la prima riga è `#!/bin/bash` (dice con quale programma eseguirlo), poi servono i comandi e il permesso di esecuzione (`chmod +x retry.sh`). In PowerShell: un file `.ps1`, che si lancia con `./retry.ps1`. Gli script di più righe si creano dal terminale con un heredoc (Bash) o una here-string (PowerShell), come visto in M2.L5.",
    "Per ripetere un'azione si usa un ciclo. In Bash: `for i in 1 2 3 4 5; do ... done`; per uscire dal ciclo prima della fine c'è `break`. In PowerShell: `foreach ($i in 1..5) { ... }`. Per fare una pausa: `sleep 1` (PowerShell: `Start-Sleep 1`).",
    "L'endpoint `/v1/flaky` fallisce con 500 una chiamata su tre, sempre nello stesso ordine (è deterministico), così puoi provare lo script con un risultato prevedibile.",
  ],
  "M5.L6": [
    "Quando qualcosa non funziona, i LOG dicono dove. Una riga tipica: `2026-03-02T09:00:01Z INFO  http: GET /v1/flaky -> 500 (12ms) user=bob req=req_000012`. Si legge così: data e ora, livello (INFO), metodo e percorso richiesto, status ottenuto (500), durata, utente e identificativo della richiesta.",
    "La strategia: 1) filtra le righe che ti interessano (le righe con errore); 2) estrai solo il campo che ti serve (il percorso); 3) conta quante volte compare ogni valore e ordinali. Sono gli stessi strumenti del modulo 2: `grep`, `awk` (o `cut`), `sort`, `uniq -c`. In PowerShell: `Select-String`, `Group-Object`, `Sort-Object`.",
    "Un numero senza prova non basta. Nel report scrivi sempre da quale file e con quale comando lo hai ottenuto: chi legge potrà ripetere lo stesso calcolo e controllare.",
    "Suggerimento: costruisci il comando un pezzo alla volta e guarda il risultato a ogni passaggio. Per sapere la colonna del percorso, guarda prima una riga intera con `head -1 traffic.log`.",
  ],
  "M5.L7": [
    "Ogni risposta del servizio contiene un header chiamato `X-Request-Id`, per esempio `req_000007`. Lo STESSO identificativo compare nei log del SERVER. È il filo che unisce ciò che vede il client a ciò che ha fatto il server: senza di lui, in un log con migliaia di righe dovresti cercare «a occhio».",
    "Il server scrive due log: `access.log` ha una riga per ogni richiesta ricevuta; `app.log` ha solo gli eventi dell'applicazione (autenticazione, ricerche, errori di validazione). Per questo l'identificativo si cerca in entrambi. Esempio: `grep req_000007 /var/log/taskflow/development/*.log` (con l'opzione `-h` grep non scrive il nome del file davanti a ogni riga). In PowerShell: `Select-String -Pattern req_000007 -Path /var/log/taskflow/development/*.log`.",
    "Per leggere l'header di una risposta: in Bash `curl -s -i URL | grep -i x-request-id`; in PowerShell `curl.exe -s -i URL | Select-String -Pattern x-request-id`. Quando segnali un problema, l'identificativo è la prima informazione da allegare.",
    "Il file `tracce.md` contiene una tabella (una riga per richiesta) e va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M5.L8": [
    "Nei problemi reali le cause si sommano: la più «esterna» (per esempio il nome dell'indirizzo sbagliato) nasconde le altre. Per questo, dopo OGNI correzione, devi ripetere la prova e rileggere l'errore, senza dare per scontato che il problema sia risolto.",
    "Il metodo è quello della lezione M5.L1: sintomo, ipotesi, evidenza, correzione, nuova prova. In questo esercizio lo script `crea-task` fallisce per più motivi, uno dopo l'altro. Non c'è una sola correzione: scrivi in `diagnosi.md` ogni causa, nell'ordine in cui emerge, con la prova che l'ha rivelata.",
    "Due cose utili da sapere. Un REDIRECT (status 301) è una risposta 3xx: non è un errore, è un'indicazione («vai a questo altro indirizzo», scritta nell'header `Location`). `curl` non lo segue da solo, a meno che tu non usi `-L`. E con `-L` un POST viene ripetuto come GET, perdendo il contenuto: per questo la soluzione corretta è usare direttamente l'indirizzo giusto (https).",
    "Gli strumenti di controllo: `nslookup nome` (in PowerShell `Resolve-DnsName nome`) verifica se un nome esiste; `curl -i` mostra gli header della risposta, compreso `Location`.",
  ],
  "M5.L9": [
    "Quando una richiesta fallisce prima di ricevere uno status, vanno controllati quattro livelli, nell'ordine: 1) il NOME (DNS): `nslookup`, `dig`, in PowerShell `Resolve-DnsName`; 2) la PORTA: `nc -z`, `ss`, in PowerShell `Test-NetConnection`; 3) il CERTIFICATO: il documento digitale che prova l'identità di un sito https (curl: codice 60; PowerShell 5.1: «Could not establish trust relationship»); 4) la risposta HTTP.",
    "L'opzione `curl -k` ignora l'errore del certificato: serve solo per fare una diagnosi, mai come soluzione, perché rinuncia alla sicurezza. Windows PowerShell 5.1 non ha un equivalente (esiste solo in PowerShell 7, con `-SkipCertificateCheck`).",
    "CORS è un controllo che fa il BROWSER, non il server e non `curl`. Il servizio dichiara quali siti possono usare le sue risposte con l'header `Access-Control-Allow-Origin`. Se l'header manca o non include il sito, il browser blocca la risposta anche se il server ha risposto 200. Con `curl` non vedrai mai un blocco: devi guardare l'header.",
    "Il file `rete.md` raccoglie le tue verifiche e va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M5.L10": [
    "Questo è uno SCENARIO NUOVO: non c'è una soluzione completa da guardare. Sei sull'ambiente STAGING (una copia di prova del servizio, diversa da quella usata finora) e il token che hai nella shell non funziona.",
    "Usa ciò che sai dai moduli 4 e 5: il corpo della risposta, il log dell'applicazione (`/var/log/taskflow/staging/app.log`), la procedura per ottenere un token. Tieni separati i fatti, la documentazione e le ipotesi.",
    "Quando hai risolto, scrivi `diagnosi.md` con tre parti: il sintomo, la causa (con la prova che l'hai trovata) e la correzione.",
  ],
  "M5.L11": [
    "Un'attività notturna chiama il servizio e a volte fallisce. «A volte» non basta per decidere cosa fare. Prima si MISURA: si ripete la chiamata un numero sufficiente di volte, si contano i successi e i fallimenti e si cerca uno schema (è casuale? periodico?). Poi si legge il log del server per capire la causa.",
    "Solo dopo si decide la politica di RETRY (riprovare). Riprovare ha senso per gli errori temporanei (5xx) e per le operazioni idempotenti (ripeterle non cambia il risultato finale). Non ha senso per gli errori 4xx (la richiesta è sbagliata e resterebbe sbagliata) né per le operazioni che creano risorse (un POST ripetuto può creare doppioni).",
    "Questo è uno SCENARIO NUOVO, senza soluzione guidata: consegna un'analisi che un collega possa verificare. Usa gli strumenti dei moduli 2 (cicli, conteggi), 4 (codici di errore) e 5 (log, retry).",
  ],
};
