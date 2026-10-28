/** Spiegazioni semplificate, modulo 4 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M4: Record<string, string[]> = {
  "M4.L1": [
    "Una API è un servizio che altri programmi possono chiamare. Per usarla bene serve un «manuale» preciso: lo standard più diffuso si chiama OpenAPI. È un file (in formato JSON o YAML) che descrive tutto: quali percorsi esistono, quali metodi accettano, quali dati servono, cosa rispondono, come ci si autentica. Leggerlo evita di dover indovinare.",
    "La struttura essenziale: dentro `paths` c'è un elemento per ogni percorso (per esempio `/v1/tasks`); dentro ogni percorso c'è un elemento per ogni metodo (`get`, `post`, `delete`...); dentro ogni metodo ci sono `summary` (la descrizione), `parameters` (i parametri), `requestBody` (il body richiesto) e `responses` (le risposte possibili). La parte `components.securitySchemes` descrive come ci si autentica.",
    "Per «interrogare» un file JSON dalla riga di comando serve uno strumento. In Bash si usa `jq`: `jq '.paths | keys'` entra in `paths` e ne elenca i nomi. In PowerShell `ConvertFrom-Json` trasforma il testo JSON in oggetti, dei quali si leggono le proprietà con il punto: `$spec.paths`.",
    "La specifica del servizio si scarica dall'indirizzo `$TASKFLOW_URL/v1/openapi.json` (in PowerShell `$env:TASKFLOW_URL/v1/openapi.json`). Per salvarla in un file si usa la redirezione `>`.",
  ],
  "M4.L2": [
    "Una risposta JSON è come un albero: oggetti (con campi nome e valore) e array (elenchi). `jq` ti permette di spostarti in questo albero e di scegliere i pezzi che ti servono, scrivendo una catena di filtri collegati dalla barra `|` (la stessa idea della pipe in shell).",
    "I filtri base: `.data` entra nel campo `data`; `.[]` scorre uno per uno gli elementi di un elenco; `select(.status == \"open\")` tiene solo gli elementi che rispettano la condizione; `.title` estrae un campo. Ogni filtro lavora sul risultato del precedente: costruisci la catena un pezzo alla volta, guardando il risultato ogni volta.",
    "Altri filtri utili: `length` conta gli elementi; `sort_by(.priority)` ordina per un campo; `group_by(.status)` raggruppa gli elementi con lo stesso valore; l'opzione `-r` stampa i testi senza virgolette; `\"\\(.id) \\(.title)\"` compone una riga di testo con i valori scelti. Il filtro va sempre tra apici singoli: per jq le virgolette doppie sono testo.",
    "In PowerShell non serve `jq`, perché `Invoke-RestMethod` restituisce già oggetti. Le stesse operazioni: `.data` (proprietà), `Where-Object status -eq open` (tiene solo quelli aperti), `Sort-Object priority` (ordina), `Group-Object status` (raggruppa e conta), `ForEach-Object { $_.title }` (estrae un campo), `.Count` (conta).",
    "Il file `sintesi.md` va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M4.L3": [
    "Quasi tutte le API vogliono sapere chi sei prima di risponderti. Lo fanno con un TOKEN: un «gettone» temporaneo, cioè una lunga stringa di caratteri che prova la tua identità. Lo ottieni scambiando le tue CREDENZIALI (un `client_id`, cioè il tuo identificativo, e un `client_secret`, una password) e poi lo invii in ogni richiesta con l'header `Authorization: Bearer <token>`. Senza token il server risponde 401 («non autenticato»).",
    "I SEGRETI (password, chiavi, token) non vanno MAI scritti dentro i comandi o nei file che condividi. Il motivo: i comandi finiscono nella cronologia della shell (`history`), nei log e nella documentazione, e chiunque li legga può usarli. Per evitarlo, si leggono da VARIABILI D'AMBIENTE: qui sono già pronte `TASKFLOW_CLIENT_ID` e `TASKFLOW_CLIENT_SECRET`. In Bash si scrivono `$TASKFLOW_CLIENT_ID`; in PowerShell `$env:TASKFLOW_CLIENT_ID`.",
    "Le credenziali di questo laboratorio sono simulate. Nella vita reale non condividere mai file di configurazione che non conosci, né il contenuto della cartella `~/.ssh` (le tue chiavi di accesso) o di file che contengono token.",
    "Nel comando che chiede il token, i dati vanno inviati in un body (con `-d` in curl); per inserire il valore di una variabile dentro un testo tra virgolette doppie si scrive `\"$VARIABILE\"`.",
  ],
  "M4.L4": [
    "CRUD sono le quattro operazioni di base su qualunque dato: Create (creare, metodo POST), Read (leggere, GET), Update (aggiornare: PUT sostituisce tutto, PATCH modifica solo una parte), Delete (eliminare, DELETE).",
    "Quando crei qualcosa, il server gli dà un numero identificativo (`id`). La risposta di creazione ha status 201 («creato») e contiene l'id; l'header `Location` dice dove ritrovare la risorsa. Il numero va ricopiato dalla risposta che ricevi davvero, non indovinato.",
    "Due header che si confondono: `Content-Type` descrive il formato di ciò che INVII (di solito `application/json`); `Accept` dice il formato in cui VUOI ricevere la risposta. Se il Content-Type è sbagliato o manca, il server rifiuta con 415.",
    "Buona abitudine: dopo ogni modifica, rileggi la risorsa con un GET. È il modo più semplice per controllare che l'operazione abbia fatto davvero ciò che pensavi.",
  ],
  "M4.L5": [
    "Un'API può rifiutare una richiesta per tre motivi diversi, e ogni motivo ha il suo codice. 400 `invalid_json`: il body non è nemmeno JSON valido (per esempio manca una virgoletta). 415: il `Content-Type` non è `application/json`. 422 `validation_failed`: il JSON è valido ma i dati non rispettano le regole (titolo troppo corto, valore fuori range...); in questo caso la risposta contiene `errors`, un elenco che dice quale campo e quale motivo.",
    "Un buon test NEGATIVO non si limita a verificare «ho ricevuto un errore»: verifica che sia QUELL'errore, con lo status giusto, il campo giusto e il motivo giusto. Inoltre si provano i VALORI AI LIMITI: il valore minimo ammesso (qui: titolo di 3 lettere, priorità 5) deve funzionare; appena sotto o sopra (titolo di 2 lettere, priorità 0 o 9) deve fallire.",
    "Per leggere l'elenco degli errori in Bash: `jq -r '.errors[] | \"\\(.field): \\(.message)\"'`. In PowerShell 5.1 il corpo dell'errore non sta nell'oggetto restituito: con `curl.exe -s` lo vedi direttamente; con `Invoke-RestMethod` serve `try { ... } catch { $_.ErrorDetails.Message }`.",
    "Ricorda il problema delle virgolette in PowerShell 5.1 con `curl.exe` (lezione M3.L5): il JSON va scritto con il backslash davanti alle virgolette interne, per esempio `-d '{\\\"title\\\":\\\"ab\\\"}'`.",
    "Il file `casi.md` contiene una tabella con colonne Input | Atteso | Effettivo, come in M2.L7. Va creato con un comando dal terminale, nella cartella della lezione.",
  ],
  "M4.L6": [
    "Quando un elenco è molto lungo, il server lo consegna a PAGINE. Due parametri nell'URL: `limit` dice quanti elementi per pagina, `offset` dice da quale elemento partire (0 = dall'inizio). La risposta contiene anche `total`, il numero totale di elementi: serve per sapere quante pagine ci sono.",
    "Per chiedere la pagina numero N: `offset = limit × (N − 1)`. Esempio: con `limit=2`, la pagina 1 ha offset 0, la pagina 2 ha offset 2, la pagina 3 ha offset 4. Se chiedi una pagina oltre la fine, NON ottieni un errore: ricevi un elenco vuoto. Solo `total` ti dice che i dati sono finiti.",
    "Un'operazione è IDEMPOTENTE se ripeterla più volte lascia il sistema nello stesso stato finale. `DELETE` lo è nello stato (dopo la prima volta il task non esiste più, e continua a non esistere) ma NON nella risposta: la prima volta il server risponde 204 («fatto, nessun contenuto»), la seconda 404 («non trovato»). Per questo uno script che ripete una cancellazione deve accettare entrambe le risposte.",
  ],
  "M4.L7": [
    "Un servizio si protegge dai troppi accessi limitando le richieste: è il RATE LIMIT. Superata la soglia, risponde 429 («Too Many Requests») e di solito aggiunge l'header `Retry-After`, che dice quanti secondi aspettare. Un client educato aspetta quel tempo e poi riprova, senza insistere.",
    "Il TIMEOUT è una cosa diversa: non è una risposta del server, è il client che rinuncia perché la risposta non arriva in tempo. Con `curl` si imposta con `--max-time 3` (aspetta al massimo 3 secondi); se scatta, curl esce con codice 28. In PowerShell si usa `-TimeoutSec`.",
    "Nel laboratorio: `/v1/search` ammette 5 richieste al minuto (simulato); `/v1/slow` risponde dopo 10 secondi, quindi con un timeout di 3 secondi lo vedi scattare.",
    "Per leggere un singolo header con curl: `curl -si URL` mostra header e corpo; con `| grep -i retry-after` tieni solo la riga che ti serve, e con `| cut -d\" \" -f2` prendi il valore (il numero dopo lo spazio). In PowerShell, quando la risposta è un errore, gli header si leggono dentro il `catch`: `$_.Exception.Response.Headers[\"Retry-After\"]`.",
  ],
  "M4.L8": [
    "Molte procedure di test sono scritte per Bash. Qui impari a ripeterle in Windows PowerShell 5.1 (la versione che trovi al lavoro). Ci sono quattro differenze da conoscere.",
    "Prima: in PowerShell 5.1 `curl` NON è curl. È un nome alternativo (alias) del comando `Invoke-WebRequest`, e per questo `curl -s url` dà errore (`-s` non è un suo parametro). Il vero programma curl si chiama `curl.exe`.",
    "Seconda: `Invoke-RestMethod` restituisce già OGGETTI (la risposta JSON è convertita da sola), quindi non serve `jq`: i campi si leggono con il punto, per esempio `$risposta.name`.",
    "Terza: gli errori HTTP (404, 422...) in PowerShell sono eccezioni. Si catturano con `try { ... } catch { ... }`: dentro il `catch`, `$_.Exception.Response.StatusCode.value__` è lo status e `$_.ErrorDetails.Message` è il corpo dell'errore.",
    "Quarta: le variabili d'ambiente si leggono con `$env:NOME`; gli header si passano come tabella `-Headers @{ Authorization = \"Bearer $token\" }`; un body in forma di testo richiede `-ContentType 'application/json'`.",
    "Uno script PowerShell è un file `.ps1`: si esegue con `./procedura.ps1`. Si crea dal terminale con `Set-Content procedura.ps1 -Value @'` seguito dalle righe e da `'@` da solo su una riga.",
  ],
  "M4.L9": [
    "Questo è uno SCENARIO NUOVO: non c'è una soluzione completa da guardare. Usa quello che hai imparato nel modulo 4: specifica OpenAPI, autenticazione Bearer, CRUD, validazione.",
    "Il lavoro: scarica la specifica del servizio, trova quali campi sono obbligatori per creare un task (`POST /v1/tasks`) e verifica con due richieste vere: una riuscita e una non valida. Poi documenta tutto in `endpoint.md`.",
    "Ogni informazione che scrivi deve essere vera e verificabile: lo status e il `X-Request-Id` devono essere quelli delle richieste che hai realmente fatto. Il laboratorio li controlla nel registro delle richieste.",
  ],
};
