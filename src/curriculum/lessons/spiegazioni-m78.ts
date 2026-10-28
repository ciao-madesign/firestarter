/** Spiegazioni semplificate, moduli 7 e 8 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M78: Record<string, string[]> = {
  "M7.L1": [
    "Quando devi fare la stessa operazione più volte, non la scrivi più volte: usi un CICLO. In Bash: `for i in 1 2 3; do comando; done` esegue il comando tre volte, e a ogni giro la variabile `i` vale 1, poi 2, poi 3 (la leggi con `$i`). In PowerShell: `1..3 | ForEach-Object { comando }`, dove `1..3` significa «i numeri da 1 a 3» e `$_` è il valore del giro corrente; oppure `foreach ($i in 1..3) { comando }`.",
    "Una FUNZIONE dà un nome a un gruppo di comandi, così puoi richiamarlo quando vuoi. In Bash: `nome() { comandi; }`; i valori che le passi si leggono con `$1`, `$2`. In PowerShell: `function nome { param($q) comandi }`. La funzione esiste finché la finestra è aperta (nel laboratorio, finché usi il tuo workspace).",
    "Automatizzare non significa fidarsi: dopo un ciclo che crea o modifica dati, controlla sempre il risultato con una lettura (per esempio un GET dell'elenco).",
    "Per creare un task con un titolo diverso a ogni giro, il titolo si costruisce con la variabile del ciclo: in Bash `\"Task automatico $i\"`, in PowerShell `\"Task automatico $_\"`.",
  ],
  "M7.L2": [
    "Spesso l'elenco delle cose da controllare è in un file, una per riga. In Bash si legge con un ciclo: `while IFS= read -r riga; do ... done < file`. `read` legge una riga alla volta e la mette nella variabile `riga`. L'opzione `-r` evita che i backslash vengano interpretati; `IFS=` evita che gli spazi all'inizio e alla fine vengano tolti. In PowerShell: `Get-Content file | ForEach-Object { ... }`, dove `$_` è la riga corrente.",
    "I file reali hanno righe vuote e commenti (righe che iniziano con `#`), che vanno saltati. In Bash: `[ -z \"$riga\" ]` è vero se la riga è vuota; `case \"$riga\" in \"#\"*) continue;; esac` salta le righe che iniziano con `#` (`continue` passa subito al giro successivo). In PowerShell: `Where-Object { $_ -and $_ -notmatch '^#' }` tiene le righe non vuote che non iniziano con `#`.",
    "Una trappola classica: un file creato in Windows termina ogni riga con due caratteri invisibili, `\\r\\n` (ritorno a capo + a capo, detto CRLF). Bash lascia il `\\r` attaccato alla riga: un indirizzo come `/v1/health\\r` non esiste, quindi tutte le richieste danno 404 senza alcun errore evidente. Si risolve togliendo il carattere con `tr -d '\\r'`. Per vedere i caratteri invisibili si usa `od -c`. `Get-Content` di PowerShell non ha questo problema.",
    "Il file `appunti.md` va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M7.L3": [
    "Uno script diventa uno STRUMENTO quando accetta ARGOMENTI (i dati che gli passi quando lo lanci) e comunica com'è andata con il CODICE DI USCITA. In Bash gli argomenti sono `$1` (il primo), `$2` (il secondo), e `$#` è quanti sono; `${2:-3}` vale `$2` se c'è, altrimenti 3 (un valore predefinito). In PowerShell gli argomenti si dichiarano all'inizio del file: `param([string]$Url, [int]$Secondi = 3)`.",
    "Convenzione dei codici di uscita: 0 = tutto bene; un numero diverso per ogni tipo di problema. In questa lezione: 1 = risposta HTTP non riuscita, 2 = script usato male, 3 = errore di rete. Chi chiama lo script (un altro script, o un sistema automatico) legge il codice, non il testo: perciò i codici fanno parte del «contratto» dello script e si scrivono in un commento all'inizio.",
    "Il messaggio che spiega come si usa lo script va scritto sul canale degli errori (in Bash `echo \"uso: ...\" >&2`, vedi M2.L2) e lo script termina con `exit 2`.",
    "Il codice di uscita di un comando si perde appena ne esegui un altro: in Bash salvalo subito con `rc=$?`; in PowerShell il codice di `curl.exe` è in `$LASTEXITCODE`, e `exit 3` termina lo script con quel codice.",
  ],
  "M7.L4": [
    "Una SUITE di test è uno script che esegue più controlli uno dopo l'altro e stampa un riepilogo. Per un sistema automatico quello che conta è il codice di uscita finale: 0 se tutti i controlli passano, un numero diverso da 0 se almeno uno fallisce.",
    "La struttura tipica: due contatori (PASS e FAIL, entrambi a zero all'inizio); una funzione `check` che riceve il nome del controllo, il valore atteso e quello ottenuto, li confronta, stampa `PASS` o `FAIL` e aumenta il contatore giusto; una funzione che chiede il solo status di un indirizzo; i controlli; la riga di riepilogo `PASS: n FAIL: m`; infine `exit 1` se FAIL è maggiore di 0.",
    "Per aumentare un contatore in Bash: `pass=$((pass + 1))`. Per ottenere solo lo status con curl: `curl -s -o /dev/null -w \"%{http_code}\" URL`. In PowerShell il contatore si aumenta con `$pass++`.",
    "Uno script di test che passa sempre non serve a nulla: prova a farlo fallire apposta (per esempio con un token sbagliato) per essere sicuro che il codice di uscita cambi.",
  ],
  "M7.L5": [
    "Quando un servizio dice 429 («troppe richieste»), un client educato non insiste: legge l'header `Retry-After` (i secondi da aspettare), attende quel tempo e riprova, fino a un numero massimo di tentativi. Se supera il massimo, rinuncia e segnala il fallimento con un codice di uscita diverso da 0.",
    "Nel laboratorio il comando `sleep` non fa aspettare davvero: fa avanzare l'orologio simulato. Il limite di richieste di `/v1/search` si comporta come se il tempo fosse trascorso.",
    "Struttura dello script: un ciclo esterno sulle ricerche (da 1 a 8); un ciclo interno sui tentativi (al massimo 3); a ogni tentativo si legge lo status e, se è 429, si legge `Retry-After` dagli header, si fa `sleep` per quel numero di secondi e si riprova. Se lo status è 200 si passa alla ricerca successiva.",
    "Per leggere gli header in Bash: `curl -si URL`; poi `grep -i retry-after` e `cut -d\" \" -f2` per prendere il numero. In PowerShell: dentro un `catch`, `$_.Exception.Response.Headers[\"Retry-After\"]`.",
  ],
  "M7.L6": [
    "Questo è uno SCENARIO NUOVO: non c'è una soluzione completa da guardare. Usa gli strumenti del modulo 7: un ciclo che legge un file riga per riga, argomenti con valore predefinito, codici di uscita e `curl -w \"%{http_code}\"` per ottenere lo status.",
    "Il file `endpoint.txt` ha una riga per ogni endpoint, con il percorso e lo status che ti aspetti, separati da uno spazio. Le righe vuote e quelle che iniziano con `#` vanno saltate. Lo script chiama ogni percorso su `http://localhost:8080` (senza token) e confronta lo status ottenuto con quello atteso.",
    "Prova lo script prima su `endpoint.txt` (tutto deve passare), poi su un file in cui sbagli apposta uno status atteso (deve segnalare FAIL e uscire con 1), poi su un file che non esiste (deve uscire con 2).",
  ],
  "M8.L1": [
    "Una buona guida rapida risponde a tre domande: come mi autentico? Come faccio la prima richiesta? Cosa succede quando sbaglio? Ogni risposta ha un esempio che chi legge può copiare ed eseguire.",
    "Il laboratorio esegue davvero gli esempi `curl` scritti nei blocchi di codice e confronta lo status ottenuto con quello che hai scritto nel commento `# => 200`. Un esempio che non corrisponde al comportamento reale è un errore verificabile (come visto in M6.L3).",
    "Il documento finito è un pezzo del tuo PORTFOLIO (la raccolta dei lavori da mostrare). Resta in `~/portfolio/guida-rapida.md` e puoi scaricarlo dalla scheda «Documentazione».",
    "Struttura consigliata: ambiente e versione dell'API; una sezione «Autenticazione» (come si ottiene e si usa il token Bearer, senza mai scrivere segreti veri); una sezione per ogni endpoint, con titolo `## METODO /v1/percorso`; un esempio di errore (401 o 422).",
  ],
  "M8.L2": [
    "Una specifica OpenAPI descrive un'API in modo che anche un programma possa leggerla: percorsi, metodi, parametri, dati richiesti e risposte possibili (vedi M4.L1). OpenAPI può essere scritta in YAML o in JSON; qui usi il JSON, che il laboratorio sa controllare.",
    "Il servizio pubblica già la propria specifica (all'indirizzo `/v1/openapi.json`): è il tuo riferimento. La tua deve descrivere SOLO ciò che esiste davvero, con gli stessi status e gli stessi campi obbligatori.",
    "La struttura minima: `openapi` (la versione dello standard), `info` (con `title` e `version`), `paths`; dentro `paths` il percorso, dentro il percorso il metodo, dentro il metodo le `responses` (e `requestBody` per i metodi che inviano dati, come POST).",
    "Il file JSON si scrive nell'editor della scheda «Documentazione» oppure dal terminale; per controllare che sia JSON valido in Bash puoi usare `jq . file.json`.",
  ],
  "M8.L3": [
    "Un BUG REPORT (segnalazione di difetto) è utile solo se chi lo legge può riprodurre il problema senza farti domande. Contiene: ambiente e versione, passi numerati, risultato atteso, risultato ottenuto, impatto (che danno fa). Gli esempi si possono eseguire.",
    "In questo ambiente c'è un difetto vero: lo staging (versione 1.1.0) restituisce l'elenco dei task nel campo `items`, mentre development (versione 1.0) lo restituisce nel campo `data`. Chi scrive un programma pensato per `data` smette di funzionare. Confronta le due risposte e documentalo.",
    "La tabella di TROUBLESHOOTING (risoluzione dei problemi) collega, per ogni errore che chi usa l'API incontra davvero, quattro cose: il sintomo, la causa probabile, come verificarla e la soluzione.",
    "I due documenti vanno in `~/portfolio`; si scrivono nell'editor della scheda «Documentazione» oppure dal terminale.",
  ],
  "M8.L4": [
    "Uno script di test da portfolio deve essere ripetibile, leggibile e onesto: se un controllo fallisce deve dirlo e terminare con un codice diverso da 0.",
    "Questo script controlla sei casi (tre che devono riuscire e tre che devono fallire nel modo giusto), stampa l'esito di ciascuno, scrive un file `report.txt` accanto allo script e termina con la riga `PASS: n FAIL: m`. La struttura è quella della suite vista in M7.L4.",
    "Il laboratorio prova anche il caso peggiore: con un token sbagliato lo script DEVE fallire. Uno script che passa sempre non è un test.",
    "Per aggiungere una riga a `report.txt` si usa `>>` (Bash: `echo \"PASS health\" >> report.txt`) o `Add-Content` (PowerShell).",
  ],
};
