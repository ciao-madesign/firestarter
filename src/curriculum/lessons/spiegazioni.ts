/**
 * Spiegazioni delle lezioni in linguaggio semplice (2026-10-28): nessuna conoscenza data per scontata,
 * ogni termine tecnico è spiegato al primo uso, frasi brevi, esempi concreti.
 * Sostituiscono il campo `explain` della lezione con lo stesso id (vedi index.ts).
 */
import { SPIEGAZIONI_M2 } from './spiegazioni-m2.ts';
import { SPIEGAZIONI_M3 } from './spiegazioni-m3.ts';
import { SPIEGAZIONI_M4 } from './spiegazioni-m4.ts';
import { SPIEGAZIONI_M5 } from './spiegazioni-m5.ts';
import { SPIEGAZIONI_M6 } from './spiegazioni-m6.ts';
import { SPIEGAZIONI_M78 } from './spiegazioni-m78.ts';
import { SPIEGAZIONI_M910 } from './spiegazioni-m910.ts';
import { SPIEGAZIONI_M11 } from './spiegazioni-m11.ts';

export const SPIEGAZIONI: Record<string, string[]> = {
  ...SPIEGAZIONI_M2,
  ...SPIEGAZIONI_M3,
  ...SPIEGAZIONI_M4,
  ...SPIEGAZIONI_M5,
  ...SPIEGAZIONI_M6,
  ...SPIEGAZIONI_M78,
  ...SPIEGAZIONI_M910,
  ...SPIEGAZIONI_M11,
  // ---------------------------------------------------------------- M1
  'M1.R': [
    'Questo è un ripasso breve (circa 5 minuti) dei quattro errori che capitano più spesso all\'inizio: 1) scrivere male un percorso (cioè l\'indirizzo di una cartella o di un file); 2) non distinguere un errore di sintassi da un errore di esecuzione; 3) non leggere il prompt prima di dare un comando; 4) prevedere il risultato in modo troppo vago.',
    'Il PROMPT è la scritta che trovi all\'inizio della riga nel terminale, per esempio `learner@lab:~$`. Ti dice chi sei, in quale cartella ti trovi (qui `~` significa «la tua cartella personale») e che il terminale è pronto a ricevere un comando.',
    'Un PERCORSO ASSOLUTO è l\'indirizzo completo di una cartella e inizia sempre con una barra `/`, per esempio `/home/learner/corso-cli`. Vale da qualsiasi punto tu parta. Le MAIUSCOLE contano: `/home/Learner` e `/home/learner` sono due indirizzi diversi, e solo il secondo esiste.',
    'ERRORE DI SINTASSI: la riga è scritta in un modo che il terminale non sa nemmeno leggere (per esempio una parentesi lasciata aperta). Il comando non parte. ERRORE DI ESECUZIONE: la riga è scritta bene e il comando parte, ma non riesce a fare quello che gli chiedi (per esempio la cartella non esiste).',
  ],
  'M1.L1': [
    'Quando lavori «nel terminale» ci sono due cose diverse. Il TERMINALE è la finestra in cui scrivi e leggi. La SHELL è il programma che sta dentro la finestra: legge quello che scrivi, lo interpreta e lo esegue. Qui usi Bash; PowerShell è un\'altra shell, che ti fa vedere come lo stesso lavoro si fa in modo diverso.',
    'Il PROMPT è la scritta all\'inizio della riga, per esempio `learner@lab:~$`. Si legge così: `learner` è l\'utente (tu), `lab` è il nome del computer, `~` è la cartella in cui ti trovi (la tua «home», cioè la tua cartella personale). Il simbolo `$` significa «sono pronto, scrivi pure».',
    '`echo` è il comando più semplice: scrive sullo schermo quello che gli dai. Per esempio `echo Ciao` scrive `Ciao`.',
    'Una VARIABILE è un nome a cui è collegato un valore, come un\'etichetta su una scatola. Per leggere il valore in Bash si scrive il nome con un `$` davanti: `$HOME` è la tua cartella personale, `$SHELL` è la shell che stai usando. In PowerShell si scrive `$env:HOME`. Attenzione: se scrivi male il nome di una variabile, la shell NON segnala errore, la sostituisce con il vuoto. Questo si chiama «fallimento silenzioso» ed è facile da non vedere.',
  ],
  'M1.L2': [
    'Nel computer i file stanno dentro cartelle, e le cartelle dentro altre cartelle, come scatole una dentro l\'altra. Per indicare dove si trova una cartella si usa un PERCORSO, cioè un elenco di nomi separati da barre: `/home/learner/corso-cli`.',
    'Un percorso ASSOLUTO parte dall\'inizio di tutto (la barra `/`) e funziona da qualsiasi punto tu ti trovi. Un percorso RELATIVO parte da dove sei adesso. Ci sono tre abbreviazioni da conoscere: `.` significa «questa cartella», `..` significa «la cartella che contiene questa» (un livello più in alto), `~` significa «la mia cartella personale».',
    'I tre comandi di questa lezione: `pwd` scrive in quale cartella ti trovi; `ls` elenca cosa c\'è nella cartella; `cd nome` (cambia cartella) ti sposta in un\'altra cartella.',
    'Le MAIUSCOLE contano: `Progetti` e `progetti` sono due nomi diversi. Sul Mac il Finder mostra nomi tradotti (per esempio «Documenti»), ma il terminale usa i nomi veri (`Documents`). Nel laboratorio i nomi che vedi con `ls` sono sempre quelli veri, anche quando sono in italiano.',
    'Come si legge un messaggio di errore: parte da sinistra con chi parla (la shell o il comando), poi dice su cosa, poi la causa. Esempio: `bash: cd: Alpha: No such file or directory` significa «la shell, durante cd, non ha trovato la cartella Alpha».',
  ],
  'M1.L3': [
    'La shell divide la riga che scrivi in PAROLE, separate dagli spazi. La prima parola è il comando, le altre sono gli ARGOMENTI (le cose su cui il comando deve lavorare). Perciò `ls Mio Progetto` dà due argomenti, `Mio` e `Progetto`, e non una cartella chiamata «Mio Progetto».',
    'Per tenere insieme una frase con gli spazi si usano le VIRGOLETTE: `ls "Mio Progetto"` dà un solo argomento. Le virgolette le toglie la shell: il comando non le vede mai. In alternativa si può mettere una barra rovesciata davanti allo spazio: `Mio\\ Progetto`.',
    'Alcuni simboli hanno un significato speciale per la shell: `( ) $ & | ; * ?`. Se li scrivi senza virgolette la shell prova a interpretarli. Se non riesce a capire la riga la rifiuta: è un ERRORE DI SINTASSI e il comando non parte nemmeno. Se invece la riga è valida e il comando parte ma non riesce a fare il suo lavoro (per esempio il file non esiste), è un ERRORE DI ESECUZIONE.',
    'Una regola pratica: se un nome ha spazi o parentesi, mettilo tra virgolette. Esempio: se un file si chiama `dati 2026.txt`, per leggerlo scrivi `cat "dati 2026.txt"`. Il comando `cat` (dall\'inglese «concatenare») mostra il contenuto di un file. Se la cartella in cui ti trovi contiene altre cartelle, ricordati di scrivere anche il percorso per arrivarci.',
  ],
  'M1.L4': [
    'Un comando si scrive in questa forma: `comando [opzioni] [argomenti]`. Il COMANDO dice cosa fare (`ls` = elenca). Le OPZIONI cambiano il modo in cui lo fa e iniziano con un trattino: `ls -l` elenca con più dettagli (formato lungo). Gli ARGOMENTI dicono su cosa agire: `ls -l Documenti`.',
    'Le opzioni si possono unire: `-l` (formato lungo), `-a` (mostra anche i file nascosti), `-t` (ordina dal più recente). Scritte insieme diventano `ls -lat`: lungo, con i nascosti, dal più recente.',
    'Non devi imparare le opzioni a memoria. Il comando `man` (dall\'inglese «manuale») mostra la guida di un comando: `man ls`. Anche `ls --help` stampa un riepilogo. Nel laboratorio `man` stampa una pagina breve; sul tuo terminale vero ti muovi con le frecce, premi `/` per cercare una parola e `q` per uscire.',
    'I file il cui nome inizia con un punto, come `.nascosto`, sono NASCOSTI: `ls` li mostra solo con l\'opzione `-a`. Non sono segreti: sono spesso file di configurazione.',
    'Per leggere un file: `cat file` lo mostra tutto; `head -n 3 file` mostra solo le prime 3 righe (utile con file lunghi).',
  ],
};
