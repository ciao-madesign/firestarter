/** Spiegazioni semplificate, moduli 9 e 10 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M910: Record<string, string[]> = {
  "M9.L1": [
    "Per documentare un'API che non conosci, parti dal suo CODICE. In questa lezione lavori su un progetto d'esempio chiamato «demo-note» (non è un tuo progetto) e lo leggi soltanto: cerchi e leggi, non modifichi nulla.",
    "Il progetto usa Next.js, un sistema per costruire siti e servizi web. Qui basta sapere la regola: ogni cartella `app/api/<nome>/route.ts` è un percorso del servizio, e le funzioni che il file esporta, chiamate `GET`, `POST`, `DELETE`..., sono i metodi che quel percorso accetta. Una cartella con il nome tra parentesi quadre, come `[id]`, rappresenta una parte variabile del percorso (un numero o un identificativo): nella documentazione si scrive `{id}`.",
    "Ci sono anche le «funzioni serverless», cioè piccoli programmi in file `.js` nella cartella `api/`: il loro percorso è uguale al nome del file e controllano il metodo dentro il codice.",
    "Gli strumenti: `find cartella -name route.ts` elenca i file con quel nome; `grep -rn \"export async function\" cartella` cerca in tutti i file della cartella (`-r` = anche nelle sottocartelle) le righe che contengono quel testo, e mostra il numero di riga (`-n`). In PowerShell: `Get-ChildItem -Recurse -File` elenca i file e `Select-String -Pattern ... -Path ...` cerca il testo.",
  ],
  "M9.L2": [
    "Il CONTRATTO di un endpoint è l'insieme delle regole su come si usa: chi può chiamarlo, cosa deve inviare, cosa risponde, quali errori può dare. Quando manca la documentazione, lo si ricava leggendo il codice, in quest'ordine: 1) chi può chiamarlo (c'è un controllo dell'utente?); 2) cosa riceve (parametri nell'URL, body, controlli sui dati); 3) cosa risponde (status e forma del corpo); 4) quali errori restituisce.",
    "Nel codice ogni riga come `return NextResponse.json(..., { status: 201 })` è una risposta possibile: `NextResponse.json` crea la risposta in formato JSON e `status` ne indica lo status. Cerca tutte queste righe per elencare le risposte.",
    "Distingui sempre ciò che il codice FA da ciò che pensi voglia fare: se un comportamento non è scritto nel codice, non va nella documentazione.",
    "Non devi eseguire nulla: per leggere un file usa `cat`, per cercare una parola `grep -n` (PowerShell: `Get-Content`, `Select-String`).",
  ],
  "M9.L3": [
    "La documentazione invecchia: il codice cambia e il testo resta com'era. Il modo per scoprirlo è un CONFRONTO, affermazione per affermazione: «la documentazione dice X; il codice fa Y, nel file Z».",
    "Non basta notare la differenza: serve la PROVA (il file e il punto del codice che la mostra) e la correzione che proponi. In questo progetto ci sono cinque punti non allineati; ne devi trovare almeno quattro.",
    "Metodo: leggi `docs/api.md` e per ogni affermazione (un nome di campo, un limite, uno status, se serve il token) cerca nel codice il punto corrispondente. Se non coincidono, annotalo.",
  ],
  "M9.L4": [
    "Git è il programma che tiene la cronologia di un progetto: ogni modifica salvata si chiama COMMIT, ha un codice identificativo (l'«hash», una lunga sequenza di lettere e numeri), un autore, una data e un messaggio. La cronologia spiega il PERCHÉ di un cambiamento. Per chi scrive documentazione serve a capire da quando un testo è rimasto indietro rispetto al codice.",
    "I comandi: `git log` elenca i commit dal più recente (con `--oneline` una riga ciascuno); `git log -- file` limita l'elenco ai commit che hanno toccato quel file; `git show <commit>` mostra cosa è cambiato in un commit (righe con `-` tolte, righe con `+` aggiunte); `git blame file` dice, riga per riga, chi l'ha scritta e in quale commit.",
    "Nel laboratorio il repository è d'esempio e Git è SOLO in lettura (`status`, `log`, `show`, `diff`, `blame`, `branch`). I comandi che modificano (`add`, `commit`, `push`, `checkout`...) si usano nel tutor in terminale, su repository veri.",
  ],
  "M9.L5": [
    "YAML è un modo di scrivere dati strutturati, come JSON, ma con l'INDENTAZIONE (rientri fatti solo con spazi, mai con tabulazioni) al posto delle graffe. Una riga `nome: valore` è una coppia chiave e valore; una riga che inizia con un trattino `- ` è un elemento di un elenco. Un errore nei rientri cambia il significato (o rompe il file), quindi leggi sempre il messaggio d'errore con il numero di riga.",
    "JSON Schema descrive la FORMA dei dati che si accettano in un body: `type: object` (è un oggetto), `required: [title]` (campi obbligatori), `properties:` (i campi, ciascuno con il suo `type` e i vincoli come `minLength: 3`, `maximum: 100`). In OpenAPI si scrive sotto `requestBody → content → application/json → schema`.",
    "Il laboratorio legge un sottoinsieme di YAML: mappe, elenchi, testi, numeri, `[a, b]` e `{k: v}` su una riga. Funzioni avanzate (ancore, blocchi su più righe con `|` o `>`, documenti multipli) danno un errore esplicito.",
    "Il file `openapi.yaml` va creato con un comando dal terminale (heredoc in Bash, here-string in PowerShell) nella cartella della lezione; il controllo lo legge e ti dice cosa non va.",
  ],
  "M9.L6": [
    "Fino ad ora hai confrontato codice e documentazione esistente. Il caso più difficile è un endpoint che la documentazione NON nomina affatto: `POST /api/webhook-polar` esiste nel codice (`api/webhook-polar.js`) ma non compare in `docs/api.md`. Lo verifichi con `grep -c webhook docs/api.md`, che conta le righe con quella parola (qui zero). Il suo contratto va ricavato leggendo il codice.",
    "Dal codice si ricava: il metodo ammesso; come si autentica la richiesta (qui non con un token ma con una FIRMA, un codice calcolato sul contenuto con un segreto condiviso, chiamata HMAC, scritta in un header); quale dato viene firmato (il body grezzo); le risposte possibili con i loro status; le variabili d'ambiente richieste.",
    "Dal codice NON si ricava: il formato delle notifiche, cosa fa la coda dopo averle ricevute, se il mittente riprova in caso di errore. Queste cose NON si inventano: vanno in una sezione «Domande aperte», da girare a chi conosce il sistema.",
    "Lavori in sola lettura sul progetto d'esempio. Non scrivere mai il valore di un segreto nella documentazione: solo il nome della variabile.",
  ],
  "M9.L7": [
    "Questo è uno SCENARIO NUOVO: non c'è una soluzione completa da guardare. Usa gli strumenti di M9: `git log`, `git show`, `git blame`, anche limitati a un solo file scrivendo `--` seguito dal nome del file. Lavori in sola lettura sul progetto d'esempio.",
    "La domanda: l'endpoint `/api/health` non richiede più il token. Chi ha cambiato questo comportamento, in quale commit e quando? E la documentazione (`docs/api.md`) è stata aggiornata dopo quella modifica?",
    "Scrivi la risposta in `ricostruzione.md`, con la prova (l'hash del commit) e la tua conclusione sulla documentazione. Ogni informazione deve venire da un comando che hai eseguito.",
  ],
  "M10.L1": [
    "Oltre al token Bearer, molte applicazioni web usano una SESSIONE. Dopo il login (nome utente e password) il server risponde con un'intestazione `Set-Cookie: session=...`: un COOKIE è un piccolo dato che il server ti dà e che il client deve rimandargli, nell'header `Cookie`, a ogni richiesta successiva. Così il server ti riconosce. Il browser lo fa da solo; con `curl` si usa `-c file` (salva i cookie ricevuti nel file) e `-b file` (invia i cookie del file).",
    "Gli attributi di un cookie: `HttpOnly` (il JavaScript della pagina non può leggerlo); `Path` (a quali percorsi viene inviato); `Max-Age` o `Expires` (quando scade); `Secure` (solo su connessioni https); `SameSite` (limita l'invio quando la richiesta parte da un altro sito).",
    "Il server risponde con due errori diversi: `no_session` se manca il cookie, `invalid_session` se il cookie c'è ma non è valido.",
    "In Windows PowerShell 5.1 si usa `curl.exe` (non l'alias `curl`) e le opzioni `-c` e `-b` sono le stesse. Il JSON passato a `curl.exe` richiede le virgolette con il backslash (vedi M3.L5). I comandi di PowerShell per i cookie (`-SessionVariable`, `-WebSession`) nel laboratorio non sono simulati.",
    "La password si legge dalla variabile (`$TASKFLOW_LOGIN_PASSWORD`, in PowerShell `$env:TASKFLOW_LOGIN_PASSWORD`): non scriverla mai nel comando.",
  ],
  "M10.L2": [
    "Il browser invia il cookie di sessione a OGNI richiesta verso il sito che lo ha emesso, anche quando a provocarla è un'altra pagina. Un sito malevolo può quindi far partire, dal tuo browser, una richiesta che modifica i tuoi dati, e il server la considera tua. Questo attacco si chiama CSRF (cross-site request forgery). Con un token Bearer in un header non succede, perché il browser non lo aggiunge da solo.",
    "Le difese: 1) l'attributo `SameSite` del cookie (con il valore `Lax` il browser non lo invia nelle richieste POST che arrivano da un altro sito); 2) un TOKEN ANTI-CSRF, un valore che solo l'app legittima conosce e invia in un header (`X-CSRF-Token`); un altro sito non può leggerlo; 3) il controllo dell'header `Origin`, che indica da quale sito parte la richiesta.",
    "Qui il server applica queste difese a `POST /v1/session/profile`. Il token anti-CSRF si legge con `GET /v1/session` (campo `csrfToken`).",
    "In PowerShell 5.1 si usa `curl.exe` con `-c` e `-b`, come in Bash. Il corpo del login si costruisce con `ConvertTo-Json -Compress` (JSON su una sola riga) e si passa a curl.exe dallo standard input con `-d \"@-\"`: così le virgolette non creano problemi e la password resta in una variabile, mai scritta nei comandi.",
    "Il file `csrf.md` si crea con un comando dal terminale, nella cartella della lezione.",
  ],
  "M10.L3": [
    "Un JWT (JSON Web Token) è una stringa di tre parti separate da punti: `header.payload.firma`. Header e payload sono JSON scritti in un alfabeto chiamato base64url (simile a base64, ma con `-` e `_` al posto di `+` e `/`, e senza i `=` finali, detti padding). NON sono cifrati: chiunque abbia il token può leggerli. La firma è un codice (HMAC) calcolato con un segreto che conosce solo il server.",
    "In Bash: `cut -d. -f2` prende la seconda parte; `tr '_-' '/+'` riporta l'alfabeto a base64 normale; `base64 -d` decodifica. Se mancano i `=` finali, `base64 -d` stampa lo stesso il testo ma si lamenta (`invalid input`, codice 1): puoi nascondere il messaggio con `2>/dev/null`. In PowerShell: `.Split(\".\")[1]` prende la seconda parte; `.Replace(\"-\",\"+\").Replace(\"_\",\"/\")` riporta l'alfabeto; `.PadRight(..., \"=\")` aggiunge i `=` mancanti; `[Convert]::FromBase64String` decodifica. Per non ripetere i passaggi puoi raccoglierli in una funzione, qui chiamata `Read-Jwt`. Il campo `exp` del payload è la scadenza, in secondi dal 1970 (tempo UNIX).",
    "Leggere il payload ti dice cosa AFFERMA il token, non se è valido: solo il server può verificarlo, controllando la firma e la scadenza. Per questo i permessi non vanno mai ricavati dal payload senza aver verificato la firma.",
    "Nella cartella della lezione ci sono tre file, uno per token: `valido.jwt`, `scaduto.jwt` e `manomesso.jwt` (puoi vederli con `ls`).",
  ],
  "M10.L4": [
    "Un WEBHOOK è una chiamata che un servizio esterno fa al TUO servizio quando succede un evento (per esempio «è stata creata una nota»). Poiché chiunque potrebbe chiamare quell'indirizzo, la notifica è FIRMATA: chi la invia calcola un codice di controllo del contenuto (HMAC con SHA-256) usando un segreto condiviso, e lo manda in un header. Chi riceve ricalcola il codice e lo confronta: se coincide, la notifica è autentica.",
    "Qui la firma copre il testo `<timestamp>.<body>`, cioè l'istante di invio, un punto e il contenuto. Includere il tempo serve a impedire che qualcuno riutilizzi una notifica intercettata (attacco «replay»): il server rifiuta le notifiche troppo vecchie. Il contenuto va firmato ESATTAMENTE com'è inviato, byte per byte: con `printf '%s'` non si aggiunge un a capo finale (con `echo` sì).",
    "Il segreto sta in una variabile d'ambiente (`$TASKFLOW_WEBHOOK_SECRET`): non scriverlo mai nei comandi, nei log o nella documentazione.",
    "Questa lezione è solo in Bash: in Windows PowerShell 5.1 la firma HMAC richiede classi .NET (come `System.Security.Cryptography.HMACSHA256`), che il laboratorio non simula.",
  ],
  "M10.L5": [
    "Questa è una verifica AUTONOMA: non c'è una soluzione completa da guardare. Per documentare un prodotto reale devi saper dire, per ogni accesso, QUALE meccanismo lo protegge, chi lo usa, dove viaggia la credenziale, quanto dura e quale rischio comporta.",
    "Prima usi davvero i tre meccanismi che il laboratorio offre, facendo una richiesta riuscita per ciascuno (token Bearer, login con cookie, webhook firmato). Poi scrivi la tabella di confronto in `autenticazione.md`.",
    "Il «token personale» è un token a lunga durata che un utente crea per automatizzare il proprio account. Qui non esiste un endpoint per provarlo: descrivilo in base a ciò che hai imparato (chi lo usa, dove viaggia, per quanto dura, quale rischio comporta se viene copiato).",
  ],
};
