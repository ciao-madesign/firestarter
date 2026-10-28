/** Spiegazioni semplificate, modulo 3 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M3: Record<string, string[]> = {
  "M3.L1": [
    "Quando usi un'app o un sito, il tuo dispositivo e un altro computer si scambiano messaggi. Questo scambio si chiama HTTP. Chi fa la domanda è il CLIENT (il browser, oppure il comando `curl`); chi risponde è il SERVER. In questo corso il server è un servizio SIMULATO: nessuna richiesta esce dal tuo dispositivo.",
    "Per dire al client dove andare si usa un URL, cioè un indirizzo fatto di parti. Esempio: `http://localhost:8080/v1/health?q=prova`. `http` è lo schema (il «linguaggio» usato), `localhost` è l'host (il computer: qui «questo computer»), `8080` è la porta (la «porta d'ingresso» del servizio sul computer), `/v1/health` è il percorso (cosa vuoi), `?q=prova` è la query (dati extra, facoltativi).",
    "Il METODO dice cosa vuoi fare: GET = leggere, POST = creare, PUT e PATCH = modificare, DELETE = eliminare. Un ENDPOINT è l'unione di metodo e percorso, per esempio `GET /v1/health` (sta per «controlla se il servizio è vivo»).",
    "L'indirizzo base del servizio è già scritto in una variabile, `TASKFLOW_URL` (in Bash la leggi con `$TASKFLOW_URL`, in PowerShell con `$env:TASKFLOW_URL`). Per fare una richiesta: Bash `curl $TASKFLOW_URL/v1/health`; PowerShell `Invoke-RestMethod \"$env:TASKFLOW_URL/v1/health\"`.",
    "La risposta del servizio è scritta in JSON: un formato di testo per i dati, con coppie nome e valore tra graffe, come `{\"status\":\"ok\"}`. Per salvarla in un file si usa la redirezione `>`: `comando > health.json`.",
  ],
  "M3.L2": [
    "Una risposta HTTP ha tre parti. La RIGA DI STATO (per esempio `HTTP/1.1 404 Not Found`) contiene un numero, lo STATUS CODE, e il suo significato. Gli HEADER sono informazioni sulla risposta, scritte come `Nome: valore`. Il CORPO (in inglese body) è il contenuto vero e proprio, di solito JSON.",
    "Lo status code ti dice com'è andata, e si legge dalla prima cifra: 2xx = riuscito (200 = ok, 201 = creato), 3xx = devi andare altrove (redirect), 4xx = errore di chi ha fatto la richiesta (404 = non trovato, 401 = non autenticato), 5xx = errore del server.",
    "Gli header portano informazioni utili: `Content-Type` dice in che formato è il corpo; `X-Request-Id` è il numero di identificazione di quella richiesta, e serve moltissimo nei bug report perché permette di ritrovarla nei log.",
    "Opzioni di `curl` da conoscere: `-i` mostra gli header insieme al corpo; `-I` mostra solo gli header; `-s` toglie le barre di avanzamento; `-o /dev/null` butta via il corpo; `-w '%{http_code}'` stampa solo lo status code. In PowerShell gli errori HTTP (4xx e 5xx) di `Invoke-RestMethod` sono eccezioni: lo status si legge dentro un blocco `catch` con `$_.Exception.Response.StatusCode.value__`.",
  ],
  "M3.L3": [
    "Un URL può avere in fondo una QUERY STRING: inizia con `?` e contiene coppie `nome=valore` separate da `&`. Esempio: `/v1/tasks?status=open&limit=2` chiede i task con stato «open», al massimo 2.",
    "Alcuni caratteri hanno un significato speciale nell'URL: lo spazio, `&`, `=`, `?`, `#`. Se li vuoi dentro un valore, vanno CODIFICATI: lo spazio diventa `%20`, `&` diventa `%26`, l'apostrofo diventa `%27`. Esempio: per cercare «R&D» si scrive `q=R%26D`.",
    "Se non codifichi, il server capisce male, ma NON ti avvisa: `q=R&D` viene letto come `q=R` più un secondo parametro `D`, e ricevi un elenco sbagliato come se niente fosse. È un errore silenzioso.",
    "Metti sempre l'URL tra virgolette. In Bash una `&` senza virgolette dice alla shell di eseguire il comando «in background» e taglia l'URL; in PowerShell la `&` fuori dalle virgolette è proprio un errore di sintassi.",
    "Per farti codificare i valori dal programma: in Bash `curl -G --data-urlencode \"q=R&D\" URL` (`-G` dice di mettere i dati nell'URL, con GET); in PowerShell 5.1 `[uri]::EscapeDataString(\"R&D\")` restituisce il testo già codificato, da inserire nell'URL.",
    "Il file `url.md` va creato con un comando nel terminale, nella cartella della lezione (come in M2.L2).",
  ],
  "M3.L4": [
    "In una richiesta puoi mandare dati al server in due modi. I QUERY PARAMETER stanno nell'URL dopo il `?` (per leggere o filtrare). Il BODY (corpo) viaggia dentro la richiesta e serve per creare o modificare qualcosa, di solito in formato JSON.",
    "Ricorda: l'URL va sempre tra virgolette, perché la `&` tra i parametri è un carattere speciale sia in Bash sia in PowerShell.",
    "Il body JSON si manda con `-d` in `curl` (in PowerShell `-Body`). Poi devi DIRE al server che è JSON, con l'header `Content-Type: application/json` (in `curl` si aggiunge con `-H`, in PowerShell con `-ContentType`). Se lo dimentichi, il server non capisce il formato e risponde 415 («formato non supportato»). Per fare una richiesta diversa da GET con curl serve anche `-X POST`.",
    "Molte richieste richiedono di essere riconosciuti: l'header `Authorization: Bearer <token>` contiene un «gettone» (il token) che prova chi sei. In questa lezione il token è già pronto nella variabile `TASKFLOW_TOKEN` (in Bash `$TASKFLOW_TOKEN`, in PowerShell `$env:TASKFLOW_TOKEN`); come si ottiene lo vedrai nel modulo M4.",
  ],
  "M3.L5": [
    "Il JSON si scrive SEMPRE con le virgolette doppie, per esempio `{\"title\":\"x\"}`. Ma anche le shell usano le virgolette, e questo crea confusione. In Bash il JSON si mette di solito tra apici singoli: `-d '{\"title\":\"x\"}'`. Il problema nasce quando dentro il testo c'è un apice (come in «l'ultima»): chiude il blocco prima del tempo e il comando si rompe.",
    "Due soluzioni sicure. Primo: scrivere il JSON in un FILE e dire a curl di leggerlo con `-d @body.json`. Secondo: farlo costruire a uno strumento che gestisce da solo le virgolette: in Bash `jq -n --arg t \"$TITOLO\" '{title:$t}'` crea il JSON a partire dal contenuto di una variabile.",
    "In Windows PowerShell 5.1 c'è una trappola in più. Quando passa un testo a un programma esterno come `curl.exe`, PowerShell perde le virgolette doppie interne: `-d '{\"title\":\"x\"}'` arriva a curl come `{title:x}` e il server risponde 400 `invalid_json`. Soluzioni: mettere un backslash davanti a ogni virgoletta (`-d '{\\\"title\\\":\\\"x\\\"}'`), oppure (meglio) usare un file, oppure usare i comandi di PowerShell: `@{ title = $t } | ConvertTo-Json` costruisce il JSON e `Invoke-RestMethod -Uri URL -Body $corpo` lo invia (`-Uri` indica l'indirizzo).",
    "In PowerShell un apice dentro un testo tra apici singoli si scrive raddoppiandolo: `'l''ultima'`. `ConvertTo-Json` scrive l'apostrofo come `\\u0027`: è JSON valido e il server lo decodifica correttamente.",
    "Per creare un file di più righe dal terminale: in Bash `cat > body.json <<'EOF'`, il contenuto, `EOF` da solo su una riga; in PowerShell `Set-Content body.json -Value @'`, il contenuto, `'@` da solo su una riga.",
  ],
  "M3.L6": [
    "Quando una richiesta fallisce ci sono due livelli di informazione. Il primo è lo STATUS HTTP (404, 422, 401...): dice la categoria dell'esito. Il secondo è nel corpo della risposta: questa API aggiunge un CODICE APPLICATIVO (il campo `error`) e un messaggio leggibile (`message`). Esempio: `{\"error\":\"not_found\",\"message\":\"Task 9999 non trovato.\"}`.",
    "Lo stesso status può nascondere cause diverse. Un 404, per esempio, può significare che il percorso non esiste (`route_not_found`) oppure che esiste ma l'elemento cercato no (`not_found`). Per capire quale, devi leggere il corpo.",
    "Un buon report di un problema riporta sempre tutto: status HTTP, codice applicativo, messaggio e il `requestId` (l'identificativo della richiesta). Chi legge il report potrà così ritrovare la richiesta esatta.",
    "Per leggere un campo del JSON in Bash si usa `jq`, per esempio `curl ... | jq -r .error`; in PowerShell `Invoke-RestMethod` ti dà un oggetto e basta scrivere `.error`. In caso di errore HTTP PowerShell lancia un'eccezione: il corpo si legge dentro un `catch`.",
  ],
  "M3.L7": [
    "Questo è uno SCENARIO NUOVO: non c'è una soluzione completa da guardare. Devi usare quello che hai imparato nel modulo 3: metodo, URL, status, header, body.",
    "Il lavoro: invia due richieste. La prima a `/v1/health`, che risponde con successo. La seconda a un percorso che NON esiste, che risponde con un errore. Poi scrivi un breve documento, `risposte.md`, che per ogni risposta riporta lo status, il `Content-Type`, il `X-Request-Id` e, per quella di errore, anche il codice applicativo.",
    "Ogni informazione che scrivi deve essere vera: copia i valori dalle risposte che hai davvero ricevuto, non inventarli. Il laboratorio controlla che coincidano con le richieste che hai fatto.",
  ],
};
