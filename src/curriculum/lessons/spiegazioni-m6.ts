/** Spiegazioni semplificate, modulo 6 (vedi spiegazioni.ts). */
export const SPIEGAZIONI_M6: Record<string, string[]> = {
  "M6.L1": [
    "Un TEST CASE (caso di prova) è una prova scritta in modo che chiunque possa ripeterla. Contiene: un identificativo (ID), i dati che dai in ingresso (Input), il risultato che ti aspetti (Atteso), il risultato che ottieni davvero (Effettivo) e l'esito (superato o no). Un PIANO DI TEST è l'insieme dei casi. Un buon piano ha casi POSITIVI (tutto va come previsto) e casi NEGATIVI (dati sbagliati o mancanti, che devono fallire nel modo giusto).",
    "Il metodo: scrivi il risultato atteso PRIMA di eseguire, ricavandolo dalla specifica OpenAPI (il «manuale» dell'API, visto in M4.L1). Poi esegui la prova e scrivi quello che è successo davvero. Se i due risultati sono diversi hai trovato un bug oppure un errore nella documentazione: in entrambi i casi hai scoperto qualcosa di utile.",
    "Un piano è ripetibile se, seguendolo, chiunque ottiene gli stessi risultati. Il laboratorio controlla due cose: che lo status atteso sia davvero uno di quelli previsti dalla specifica e che tu abbia eseguito le richieste.",
    "Il piano è un documento in formato Markdown con una tabella: la prima riga elenca le colonne (`| ID | Input | Atteso | Effettivo | Esito |`), la seconda è una riga di trattini (`|---|---|---|---|---|`), poi una riga per ogni caso. Lo scrivi nell'editor dei documenti (scheda «Documentazione»): il file finisce in `~/docs`, che è proprio dove questa lezione lo cerca.",
  ],
  "M6.L2": [
    "Un BUG REPORT è la segnalazione di un difetto. È utile solo se un'altra persona può riprodurre il problema senza chiederti nulla. Per questo contiene: l'ambiente in cui hai provato, i passi numerati per riprodurlo, il risultato atteso, il risultato ottenuto e le prove (evidenze): lo status, il corpo della risposta e il `X-Request-Id`.",
    "Tieni sempre separati tre livelli: il FATTO OSSERVATO (cosa risponde davvero il sistema), il COMPORTAMENTO DOCUMENTATO (cosa dice la documentazione) e l'IPOTESI (quello che pensi sia la causa: scrivila come ipotesi, non come certezza). Mescolarli rende il report poco affidabile.",
    "In questo esercizio la vecchia guida (`guida-vecchia.md`) dice che si può riaprire un task già completato. Prima di scrivere il report devi verificare se è vero, provando la richiesta sul servizio e leggendo la risposta.",
    "Il report è un documento Markdown con titoli di sezione (una riga che inizia con `##`). Lo scrivi nell'editor dei documenti, e finisce in `~/docs`.",
  ],
  "M6.L3": [
    "Una documentazione è accurata solo se si può verificare. Il laboratorio ha un CONTROLLO TECNICO che esegue gli esempi `curl` scritti nei blocchi di codice, in una copia isolata del servizio, e confronta lo status ottenuto con quello che hai scritto in un commento `# => 201`. Controlla anche che i percorsi esistano, che i campi obbligatori siano citati, che gli status siano previsti, che il JSON sia valido e che la versione sia giusta.",
    "Il controllo separa due tipi di segnalazione. Gli ERRORI VERIFICABILI sono fatti oggettivi (un percorso che non esiste, uno status sbagliato). Le VALUTAZIONI EDITORIALI riguardano lo stile e la completezza (terminologia, spiegazioni mancanti): sono suggerimenti, non fatti, e puoi decidere tu se seguirli.",
    "Come scrivere gli esempi: usa `$TASKFLOW_URL` e `$TOKEN` al posto dei valori veri (mai scrivere segreti in un documento), aggiungi un commento `# => <status>` con lo status atteso, e prevedi una sezione `### Errori` con almeno un caso negativo.",
    "Per aprire il documento da correggere usa la scheda «Documentazione» del laboratorio; premi «Controlla» per far girare il controllo tecnico e leggi i risultati. Puoi anche correggere il file da terminale con un comando.",
  ],
  "M6.L4": [
    "Il controllo tecnico (lezione M6.L3) verifica gli esempi di codice, ma NON vede le affermazioni scritte a parole: il nome di un parametro, la porta del servizio, il tipo di autenticazione, un intervallo di valori consentiti. Sono proprio gli errori che portano fuori strada chi legge la guida.",
    "Il metodo, in quattro passi: 1) elenca ogni affermazione verificabile della guida; 2) per ognuna scegli la PROVA (una richiesta al servizio, la specifica OpenAPI, un messaggio d'errore); 3) eseguila e annota l'esito; 4) correggi il testo. Una correzione senza prova è solo un'altra opinione. La fonte più rapida è la specifica (`/v1/openapi.json`), ma quando l'affermazione riguarda un comportamento va confermata con una richiesta vera.",
    "Consegni due documenti: la guida corretta e una tabella delle verifiche (Affermazione | Prova | Esito | Correzione). La tabella è ciò che usa un revisore per fidarsi della guida.",
    "I file di questa lezione stanno nella cartella `~/docs` (la bozza è `m6l4-guida-bozza.md`): puoi aprirli e scriverli con l'editor dei documenti.",
  ],
  "M6.L5": [
    "Una guida di TROUBLESHOOTING (risoluzione dei problemi) è una tabella con tre colonne: Sintomo (cosa vede l'utente: il messaggio o lo status reale), Causa (perché succede) e Soluzione (cosa fare). Si parte sempre dai messaggi veri, copiati da prove reali.",
    "Una procedura è RIPETIBILE solo se funziona da zero: nessuna variabile già impostata, nessun file che esiste solo sul tuo computer. Il laboratorio la esegue in un WORKSPACE PULITO (cioè uno spazio di lavoro senza le variabili `TASKFLOW_*`) proprio per scoprirlo. Per questo lo script deve leggere la configurazione da un file (`.env.development`), non dalle variabili della tua finestra.",
    "Un file `.env` raccoglie le variabili di configurazione (indirizzo, credenziali). Qui contiene credenziali SIMULATE. Nei progetti reali un file `.env` non si condivide e non si pubblica, perché contiene segreti.",
    "In Bash, per caricare le variabili da un file si usa `source file` (o `. file`); con `set -a` prima, tutte le variabili lette vengono rese disponibili ai programmi lanciati dopo. In PowerShell non c'è un equivalente diretto: si legge il file riga per riga e si imposta `$env:NOME`.",
    "Il documento `troubleshooting.md` si scrive nell'editor dei documenti (finisce in `~/docs`); lo script `verifica.sh` o `verifica.ps1` si crea dal terminale, nella cartella `~/corso-cli/m6l5`.",
  ],
  "M6.L6": [
    "Questo è il PROGETTO FINALE ed è una verifica AUTONOMA: non c'è una soluzione da guardare. Hai a disposizione tutto ciò che hai imparato nei moduli precedenti. Il laboratorio controlla i fatti oggettivi (le richieste che hai eseguito, gli esempi verificati, la procedura che funziona da un ambiente pulito); la qualità della scrittura la valuti tu, oppure il tuo tutor.",
    "Il file `final-README.md` nella cartella della lezione contiene la consegna completa. L'ambiente è STAGING (un servizio simulato) e una guida in bozza descrive la versione 1.0 dell'API: devi scoprire se la descrive correttamente.",
    "Consegni quattro documenti nella cartella `~/docs/final/`: un piano di test, un bug report, una guida corretta e uno script di verifica ripetibile.",
  ],
};
