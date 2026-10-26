# Progresso del corso

Livello attuale: 2 (Livello 2, tendente al 3)
Ambiente: macOS, Bash (/bin/bash); lavoro: Windows PowerShell 5.1

## Lezioni

### M1.L1 — Terminale, shell, variabili
Stato: completed (2026-10-26)
Acquisito:
- differenza tra terminale e shell
- echo
- variabili con $ ($SHELL, $HOME)
- lettura del prompt (host:cartella utente$, ~ = home)
- differenza tra comando e argomenti
- fallimento silenzioso: una variabile inesistente diventa vuota, senza errore
- non eseguire comandi solo perché un messaggio li suggerisce (chsh)
Errori:
- aveva previsto un errore per `echo SHELL`, che invece stampa il testo

### M1.L2 — Percorsi e navigazione
Stato: completed (2026-10-26)
Acquisito:
- pwd, ls, cd
- percorso assoluto (inizia con /) e relativo (dipende dalla posizione)
- nomi reali nel terminale e nomi tradotti nel Finder
- le maiuscole contano
- lettura di un messaggio di errore (shell: comando: argomento: causa)
Errori:
- pensava che `cd Documents` ripetuto non facesse nulla, invece dà errore
- ha omesso la / iniziale
- ha scritto `users` in minuscolo

### M1.L3 — Spazi, virgolette e quoting
Stato: completed (2026-10-26)
Acquisito:
- la shell divide la riga negli spazi
- le virgolette creano un unico argomento e vengono rimosse dalla shell
- caratteri speciali ( ) $ & | ; * ?
- errore di sintassi (la shell rifiuta la riga, il comando non parte) ed errore di esecuzione (il comando parte e fallisce)
- virgolette su tutto il percorso o su una parte
Errori:
- aveva previsto "No such file" invece del syntax error causato dalle parentesi
- al primo tentativo di verifica ha trovato solo uno dei due errori
- confonde il prompt con l'output di pwd

### M1.L4 — Opzioni, help e lettura dei file
Stato: completed (2026-10-26)
Acquisito:
- comando, opzioni e argomenti
- ls -l (colonne; la dimensione di una cartella non è il peso del contenuto)
- man (navigazione, / per cercare, q per uscire)
- -a trovata da solo; file nascosti (nome che inizia con il punto)
- . e ..
- opzioni combinabili (-la)
- cat
- commenti con # nei file di configurazione
- localhost / 127.0.0.1
Errori:
- pensava che i file nascosti fossero solo di sistema
- ha previsto per /etc/hosts meno righe e nessun simbolo

## Test intermedi

### M1 (2026-10-26)

| Es. | Esercizio | Esito | Problema |
|---|---|---|---|
| 1 | cd assoluto in Library/Application Support | passed_partial | Ha usato /users minuscolo: funziona su macOS, fallirebbe su Linux. È la seconda volta. |
| 2 | Analisi di ls -l .../Application Support senza virgolette | passed_partial | Ha previsto un errore di sintassi invece che di esecuzione, e 1 messaggio invece di 2. |
| 3 | Trovare in man l'opzione di ordinamento per data | retry | Prima ha scelto -c; ha eseguito fuori dalla home senza leggere il prompt; poi ha trovato -t. |
| 4 | echo "Utente: $USR - Home: $HOME" | passed_partial | Diagnosi corretta, ma previsione incoerente con la diagnosi; non ricordava $HOME. |

## Errori ricorrenti (da far riemergere nei test)

1. Maiuscole e barra iniziale nei percorsi (occorrenze: 2)
2. Errore di sintassi ed errore di esecuzione: chi segnala l'errore (occorrenze: 2)
3. Non legge il prompt prima di eseguire (occorrenze: 2)
4. Previsioni incoerenti o troppo semplificate rispetto al reale (occorrenze: 3)

## Da consolidare

- maiuscole e barra iniziale nei percorsi
- errore di sintassi vs errore di esecuzione
- lettura del prompt prima di eseguire
- previsioni coerenti con la diagnosi

## Punti di forza

- consulta la documentazione e verifica sull'output invece di fidarsi della previsione
- sa diagnosticare un fallimento silenzioso

## Prossima lezione

M2.L1 — Pipe e redirezione dell'output

Ripasso breve (circa 5 minuti): un mini-esercizio per ciascuno dei 4 errori ricorrenti. Poi M2.L1: primo caso in cui un comando scrive file; rischio di sovrascrittura con > e cartella di prova ~/corso-cli.
