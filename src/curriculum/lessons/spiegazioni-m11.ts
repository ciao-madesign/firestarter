/** Spiegazioni semplificate, modulo 11 (vedi spiegazioni.ts). */
const INTRO = "In questo modulo ci sono DUE computer simulati. Il CLIENT è il terminale che stai usando (indirizzo 192.168.50.20). Il SERVER (indirizzo 192.168.50.10, nome `server.lab`) ospita il servizio TaskFlow sulla porta 8080. Per eseguire un comando sul server si scrive `ssh learner@server.lab \"comando\"`: `ssh` collega i due computer. Nel laboratorio ogni `ssh` esegue UN solo comando (anche più comandi uniti con `&&` o `|`, se tra virgolette); non si apre una sessione interattiva.";

export const SPIEGAZIONI_M11: Record<string, string[]> = {
  "M11.L1": [
    INTRO,
    "Quando un servizio «non funziona», conviene controllare quattro livelli, nell'ordine: 1) la RETE: il server è raggiungibile? (`ping server.lab`; PowerShell: `Test-NetConnection server.lab`); 2) la PORTA: c'è qualcosa in ascolto sulla porta del servizio? (`nc -zv server.lab 8080`; PowerShell: `Test-NetConnection server.lab -Port 8080`); 3) il SERVIZIO sul server: è attivo? (`systemctl status taskflow` dice se è `active`; `ss -tlnp` elenca le porte in ascolto e quale programma le usa); 4) l'APPLICAZIONE: risponde bene alle richieste HTTP? (per esempio `GET /v1/health`).",
    "`ssh learner@server.lab \"comando\"` esegue il comando sul server e ne mostra l'output sul tuo terminale: è come lavorare sul server senza spostarti. Fuori dal laboratorio il server può essere un'altra macchina virtuale o un computer vero.",
    "In Windows 10 e successivi, PowerShell 5.1 usa il programma `ssh.exe` di OpenSSH: i comandi `ssh` sono gli stessi della versione Bash.",
    "Il file `mappa.md` si scrive con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L2": [
    INTRO,
    "Il client chiama il servizio con `curl` (Bash) o `Invoke-RestMethod` (PowerShell), con il token preso da una variabile d'ambiente. Ogni richiesta lascia una riga nel REGISTRO (log) del SERVER, che puoi leggere con `ssh learner@server.lab \"tail -n 5 /var/log/taskflow/service.log\"` (`tail -n 5` mostra le ultime 5 righe di un file).",
    "Un errore può avere tre origini: il CLIENT (URL, header o token sbagliati), la RETE (nome o porta) oppure il SERVER (errore 500, servizio fermo). Lo status HTTP e il registro del server ti dicono quale.",
    "Il documento `esempio-api.md` descrive la richiesta `GET /v1/tasks`: come si fa, quali header servono, cosa risponde, quali errori può dare. Non scrivere mai il token nei comandi né nel documento.",
  ],
  "M11.L3": [
    "Un comando scritto dopo `ssh` passa DUE volte da una shell: prima dalla tua (quella del client), che lo interpreta; poi da quella del server, che riceve il testo che ne risulta. Tutto ciò che la shell del client «espande» prima di inviare (variabili come `$PWD`, sostituzioni `$(...)`, la tilde `~`, pipe e redirezioni scritte fuori dalle virgolette) viene calcolato sul CLIENT. Quello che arriva intatto viene eseguito sul SERVER.",
    "Le virgolette decidono. Tra virgolette DOPPIE il client espande `$(hostname)` e `$PWD`: ottieni il nome e la cartella del client. Tra apici SINGOLI il testo parte così com'è: ottieni il nome del server. Una redirezione `> file` scritta fuori dalle virgolette crea il file sul client; scritta dentro le virgolette lo crea sul server. In PowerShell 5.1 valgono le stesse regole per `\"...\"` e `'...'`, ma le virgolette doppie dentro un testo tra apici vengono perse quando PowerShell chiama `ssh` (che è un programma esterno).",
    "I file creati sul server restano sul server: li ritrovi con un altro `ssh learner@server.lab \"cat /tmp/nota.txt\"` (nel laboratorio i file in /tmp e nella home persistono tra un ssh e l'altro). Per sapere dove è finito un file, chiedilo a entrambi i computer.",
    "Il file `quoting.md` contiene una tabella (Comando | Dove viene interpretato | Risultato | Perché) e si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L4": [
    INTRO,
    "Il sintomo: la richiesta non riceve alcuna risposta HTTP. Con `curl -sS` (`-s` toglie le barre di avanzamento, `-S` mostra comunque gli errori) vedi «Failed to connect» e curl esce con codice 7 («connection refused», connessione rifiutata). In PowerShell: «Unable to connect to the remote server». Significa che sulla porta non ascolta nessuno: il nome si risolve, il server è acceso, ma il SERVIZIO non c'è.",
    "Sul server: `systemctl status taskflow` dice se il servizio è `active` (attivo) o `inactive` (fermo); `sudo systemctl start taskflow` lo avvia (`start`, `stop` e `restart` richiedono `sudo`, cioè i privilegi di amministratore); `journalctl -u taskflow -n 10` mostra le ultime 10 righe del suo registro.",
    "Il documento `diagnosi.md` racconta il problema: sintomo, livello (rete, porta, servizio o applicazione), come lo hai verificato, correzione e prova finale. Si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L5": [
    INTRO,
    "Qui il servizio è ATTIVO (`systemctl status` dice `active`), ma il client riceve comunque «connection refused» sulla porta 8080. Vuol dire che il servizio ascolta su un'altra porta. Sul server, `ss -tlnp` mostra la porta su cui `taskflow` ascolta davvero; il file di configurazione `/etc/taskflow/taskflow.env` (riga `PORT=`) mostra la porta che gli hai chiesto di usare.",
    "Si può correggere il CLIENT (usare la porta giusta) o il SERVER (farlo ascoltare sulla porta documentata). Se la documentazione dice 8080, e altri client si aspettano 8080, si corregge il server. Per cambiare una riga di un file con un solo comando: `sed -i \"s/vecchio/nuovo/\" file` (`sed` sostituisce il testo; `-i` modifica il file direttamente). Il servizio rilegge la configurazione solo quando lo riavvii: `sudo systemctl restart taskflow`.",
    "Il documento `diagnosi.md` riporta sintomo, prove (porta in ascolto e riga `PORT`), causa, correzione e prova finale. Si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L6": [
    INTRO,
    "Qui la rete e il servizio sono a posto: `/v1/health` risponde 200. Ma `/v1/tasks` risponde 500 `database_unavailable`. Un 5xx è un errore del SERVER: la richiesta del client era valida. La causa si cerca nel registro del server: `journalctl -u taskflow`, oppure `grep ERROR` sul file `service.log` per vedere solo le righe di errore.",
    "TaskFlow dipende da un altro servizio, il database (`taskflow-db`). Se il database è fermo, l'applicazione parte ma non può leggere i dati. Si avvia con `sudo systemctl start taskflow-db`: il servizio principale non va toccato, perché non è lui il guasto.",
    "Il documento `diagnosi.md` spiega: il sintomo, perché non è un errore del client, la prova nel registro, la correzione e la verifica. Si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L7": [
    "Il registro del server riporta per ogni richiesta il metodo, il percorso, lo status e un identificativo, `req=<identificativo>`. Lo STESSO identificativo arriva al client nell'header di risposta `X-Request-Id`. È il filo che unisce le due metà della storia: quella vista dal client e quella vista dal server.",
    "Il registro del server si legge con ssh: `ssh learner@server.lab \"grep req_000003 /var/log/taskflow/service.log\"` (oppure `journalctl -u taskflow`). Attenzione alle virgolette (vedi M11.L3): se l'identificativo è in una variabile del client e il comando sta tra virgolette doppie, è il client a sostituirla prima di inviare, ed è esattamente quello che ti serve.",
    "Un'integrazione ben documentata allega, per ogni caso di errore, sia ciò che vede il client sia ciò che registra il server. Se i due racconti non coincidono, il problema sta nel mezzo (rete, intermediari) oppure nel modo di leggere le risposte.",
    "Il documento `tracce.md` contiene una tabella (Richiesta | Request-Id | Status (client) | Riga del server) e si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L8": [
    "Questa volta il servizio è attivo e il server risponde al `ping`, ma dal client la richiesta non riceve risposta. Dopo l'attesa, `curl` esce con codice 28 («Timeout was reached») e `nc -zv -w 2 server.lab 8080` dice «timed out». Una porta CHIUSA rifiuterebbe subito (codice 7). Qui invece i pacchetti vengono SCARTATI da un FIREWALL (un filtro di sicurezza del server), quindi il client aspetta senza ricevere nulla.",
    "Il metodo è la PROVA DI CONTRASTO: sul server il servizio risponde in locale (`ssh learner@server.lab \"curl -s localhost:8080/v1/health\"`) ma dal client no. Quindi il guasto non è il servizio, è qualcosa che sta in mezzo. `sudo ufw status` mostra le regole del firewall del server; `sudo ufw allow 8080/tcp` apre la porta 8080 (`sudo` = privilegi di amministratore).",
    "Quando diagnostichi, imposta sempre un tempo massimo: senza `-m` (curl) o `-w` (nc) l'attesa supera i due minuti. In PowerShell `Test-NetConnection server.lab -Port 8080` mostra `PingSucceeded True` e `TcpTestSucceeded False`: il computer c'è, la porta no.",
    "Il documento `diagnosi.md` riporta il sintomo, perché NON è una porta chiusa, le prove, la causa, la correzione e la verifica. Si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L9": [
    "Il computer traduce un nome in un indirizzo in due modi: con il file `/etc/hosts` (un elenco di righe «indirizzo nome») e con il DNS (un servizio di rete). Programmi come `ping`, `curl` e `ssh` consultano PRIMA il file hosts. Strumenti come `nslookup` e `dig` interrogano SOLO il DNS. Una riga sbagliata nel file hosts ha quindi la precedenza e manda il nome a un indirizzo errato, mentre `nslookup` continua a dare la risposta giusta: due strumenti che si contraddicono.",
    "Per vedere cosa usano i programmi: `getent hosts server.lab` (PowerShell: `Resolve-DnsName server.lab`). Per vedere solo il DNS: `nslookup server.lab` (PowerShell: `Resolve-DnsName server.lab -DnsOnly`). Con un indirizzo che non corrisponde a nessun computer, `ping` dice «Destination Host Unreachable» e `nc` «No route to host»: sintomi diversi dal rifiuto e dal timeout.",
    "La correzione: eliminare la riga errata. Con `sudo sed -i '/192.168.50.11/d' /etc/hosts` si cancella la riga che contiene quell'indirizzo. In PowerShell 5.1 su Windows il file è `C:\\Windows\\System32\\drivers\\etc\\hosts` e si modifica con una finestra «Esegui come amministratore»; nel laboratorio, in PowerShell, usi l'indirizzo diretto (192.168.50.10) e annoti nel documento la correzione da fare.",
    "Il documento `diagnosi.md` spiega il sintomo, la differenza tra DNS e file hosts, la causa, la correzione e la prova finale. Si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M11.L10": [
    INTRO,
    "Questa è una VERIFICA FINALE senza soluzione guidata. Il sistema ha PIÙ problemi insieme e non sai in che ordine: ogni correzione può rivelare il successivo. Procedi per livelli (rete, porta, servizio, applicazione), cambia UNA cosa alla volta e ripeti la prova del client dopo ogni correzione.",
    "Consegna un rapporto con: i sintomi, le cause nell'ordine in cui sono emerse, le correzioni, la verifica finale e un esempio di richiesta. Un altro tecnico, leggendolo, deve poter ripetere la diagnosi. Non scrivere il token in chiaro.",
  ],
  "M11.L11": [
    INTRO,
    "Come nella prima verifica finale, il sistema ha più problemi insieme, ma stavolta su livelli diversi e con sintomi diversi a ogni passo. Procedi per livelli (nome, rete, porta, servizio, applicazione), cambia una cosa alla volta e ripeti la prova del client dopo ogni correzione. Usa i metodi imparati: la prova di contrasto (funziona in locale sul server, non dal client), il confronto tra fonti (DNS e file hosts), il registro del server.",
    "Non c'è una soluzione guidata. In PowerShell non puoi modificare il file hosts: aggira il problema del nome usando l'indirizzo diretto 192.168.50.10 (anche per `ssh`) e annotalo nel rapporto come correzione da eseguire. Consegna un rapporto con sintomi, cause nell'ordine in cui sono emerse, correzioni, verifica finale ed esempio di richiesta.",
  ],
};
