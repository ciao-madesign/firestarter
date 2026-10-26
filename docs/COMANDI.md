# Catalogo dei comandi simulati

Generato da `npm run docs:commands` a partire da `src/engine/catalog.ts`. Per ogni comando: sintassi, opzioni e **differenze dichiarate** rispetto al comportamento reale. Il laboratorio non dichiara di supportare ciò che simula solo in parte senza dirlo.

## Bash

### `echo`

Stampa i suoi argomenti.

Sintassi: `echo [-neE] [testo...]`

- `-n`: non aggiunge il newline finale
- `-e`: interpreta le sequenze \n \t
- `-E`: non interpreta le sequenze

Esempio: `echo "Ciao $USER"`

### `pwd`

Stampa la directory corrente (percorso assoluto).

Sintassi: `pwd`

### `cd`

Cambia directory. Senza argomenti va nella home; `cd -` torna alla precedente.

Sintassi: `cd [directory]`

Differenze rispetto al comando reale:
- Non gestisce CDPATH.

### `export`

Rende una variabile parte dell'ambiente dei comandi lanciati.

Sintassi: `export [NOME[=valore]...]`

- `-p`: elenca le variabili esportate

### `unset`

Elimina variabili o funzioni.

Sintassi: `unset NOME...`

### `local`

Dichiara una variabile locale a una funzione.

Sintassi: `local NOME[=valore]`

### `declare`

Dichiara variabili.

Sintassi: `declare NOME=valore`

Differenze rispetto al comando reale:
- Le opzioni (-a, -A, -i...) sono ignorate.

### `set`

Opzioni della shell e parametri posizionali.

Sintassi: `set [-eux] [-o opzione] [-- argomenti...]`

- `-e`: esce al primo errore
- `-u`: errore sulle variabili non definite
- `-x`: stampa i comandi su stderr
- `-o pipefail`: una pipeline fallisce se fallisce uno stadio
- `-- a b c`: imposta $1 $2 $3

Differenze rispetto al comando reale:
- Opzioni supportate: -e, -u, -x, -o errexit|nounset|xtrace|pipefail. Le altre danno un errore esplicito.

### `let`

Valuta espressioni aritmetiche (come $(( ))). Esce con 1 se l'ultimo risultato è 0.

Sintassi: `let espressione...`

Differenze rispetto al comando reale:
- Numeri interi, operatori con la precedenza di C, assegnazioni, ++/--, ?: e **.

### `trap`

Esegue un comando alla fine dello script.

Sintassi: `trap 'comando' EXIT`

Differenze rispetto al comando reale:
- Solo il segnale EXIT, e solo negli script (bash script.sh, bash -c). Gli altri segnali danno un errore esplicito.

### `exec`

Sostituisce la shell con un comando, oppure apre il descrittore N (da 3 in su) su un file.

Sintassi: `exec [comando] | exec N>file`

Differenze rispetto al comando reale:
- Le redirezioni dei descrittori 0-2 con exec non sono supportate.

### `shift`

Scorre i parametri posizionali.

Sintassi: `shift [n]`

### `exit`

Esce dallo script o dalla funzione con un codice di uscita.

Sintassi: `exit [codice]`

### `return`

Termina una funzione.

Sintassi: `return [codice]`

### `break`

Esce da un ciclo.

Sintassi: `break [n]`

### `continue`

Passa alla prossima iterazione del ciclo.

Sintassi: `continue [n]`

### `true`

Non fa nulla e termina con codice 0.

Sintassi: `true`

### `false`

Non fa nulla e termina con codice 1.

Sintassi: `false`

### `:`

Comando nullo (codice 0).

Sintassi: `:`

### `clear`

Pulisce lo schermo (la cronologia dei comandi resta).

Sintassi: `clear`

### `history`

Mostra la cronologia dei comandi di questa shell.

Sintassi: `history [n] | history -c`

### `read`

Legge una riga dallo standard input e la assegna alle variabili.

Sintassi: `read [-r] [var...]`

- `-r`: non interpreta le barre inverse

Differenze rispetto al comando reale:
- Legge solo da pipe/redirezione/here-string (il terminale non chiede input interattivo). Rispetta IFS vuoto o con delimitatori; le opzioni -n, -d, -u, -a danno un errore esplicito.

### `test`

Valuta una condizione (codice 0 = vero).

Sintassi: `test ESPRESSIONE  |  [ ESPRESSIONE ]  |  [[ ESPRESSIONE ]]`

- `-e -f -d`: esiste, è file, è directory
- `-r -w -x`: leggibile, scrivibile, eseguibile
- `-z -n`: stringa vuota / non vuota
- `-eq -ne -lt -gt -le -ge`: confronti numerici
- `= != =~`: confronti di stringhe e regex

Differenze rispetto al comando reale:
- [[ ]] è trattato come test esteso con glob e regex semplificati.

### `[`

Sinonimo di test.

Sintassi: `[ ESPRESSIONE ]`

### `[[`

Test esteso.

Sintassi: `[[ ESPRESSIONE ]]`

### `source`

Esegue un file nella shell corrente (anche `. file`).

Sintassi: `source file [argomenti]`

### `.`

Sinonimo di source.

Sintassi: `. file [argomenti]`

### `bash`

Esegue uno script in una shell figlia: non modifica cwd e variabili del chiamante.

Sintassi: `bash [-c "comandi"] script [argomenti]`

Differenze rispetto al comando reale:
- Non supporta la modalità interattiva né la lettura da stdin.

### `sh`

Come bash.

Sintassi: `sh script [argomenti]`

### `type`

Dice se un nome è builtin, funzione o comando esterno.

Sintassi: `type nome...`

### `which`

Mostra il percorso di un comando esterno.

Sintassi: `which comando...`

### `command`

Esegue un comando saltando le funzioni, o ne mostra il percorso con -v.

Sintassi: `command [-v] nome`

### `help`

Mostra la guida del laboratorio per un comando, o elenca i comandi.

Sintassi: `help [comando]`

### `man`

Mostra la pagina di manuale semplificata del laboratorio.

Sintassi: `man comando`

Differenze rispetto al comando reale:
- Il testo è una sintesi del laboratorio; non c'è paginazione. Per le opzioni complete usa la documentazione ufficiale.

### `env`

Mostra l'ambiente o esegue un comando con variabili aggiunte.

Sintassi: `env [VAR=valore] [comando]`

### `printenv`

Mostra variabili di ambiente.

Sintassi: `printenv [NOME]`

### `printf`

Stampa testo formattato.

Sintassi: `printf formato [argomenti...]`

- `%s %d %i %u %o %x %X %c %e %f %g %b %q %%`: segnaposto supportati
- `larghezza, precisione e flag - + 0 #`: supportati

Differenze rispetto al comando reale:
- Il formato viene riutilizzato finché ci sono argomenti. Un numero non valido stampa 0 e segnala l'errore con codice 1. Non supportato: * come larghezza.

### `sleep`

Attende: nel laboratorio avanza l'orologio simulato, senza attese reali.

Sintassi: `sleep secondi`

### `date`

Mostra data e ora dell'orologio simulato (UTC).

Sintassi: `date [+formato] [-I]`

- `+%Y %m %d %H %M %S %F %T`: formati supportati

### `whoami`

Mostra l'utente corrente.

Sintassi: `whoami`

### `hostname`

Mostra il nome dell'host simulato.

Sintassi: `hostname`

### `id`

Mostra identità dell'utente.

Sintassi: `id`

### `uname`

Informazioni sul sistema (simulato: Linux).

Sintassi: `uname [-a]`

### `seq`

Stampa una sequenza di numeri.

Sintassi: `seq [inizio [passo]] fine`

### `ls`

Elenca file e directory.

Sintassi: `ls [opzioni] [percorso...]`

- `-l`: formato lungo (permessi, proprietario, dimensione, data)
- `-a`: include i file nascosti (nome che inizia con .)
- `-A`: come -a ma senza . e ..
- `-h`: dimensioni leggibili (con -l)
- `-t`: ordina per data di modifica (più recente prima)
- `-S`: ordina per dimensione
- `-r`: ordine inverso
- `-R`: ricorsivo
- `-d`: mostra la directory stessa
- `-1`: un elemento per riga
- `-F`: aggiunge un indicatore di tipo

Esempio: `ls -la ~/lab`

Differenze rispetto al comando reale:
- Gli utenti macOS troveranno BSD ls: qui le opzioni sono quelle GNU (il Finder e macOS differiscono in alcune opzioni, es. -G, -@).
- La dimensione in "total" è approssimata a blocchi da 4K.

### `cat`

Stampa il contenuto dei file.

Sintassi: `cat [-n] [file...]`

- `-n`: numera le righe

### `head`

Prime N righe (default 10).

Sintassi: `head [-n N] [file...]`

- `-n N`: numero di righe
- `-c N`: numero di byte

### `tail`

Ultime N righe (default 10).

Sintassi: `tail [-n N] [file...]`

- `-n N`: numero di righe
- `-n +N`: dalla riga N in poi

Differenze rispetto al comando reale:
- -f (follow) non è supportato.

### `wc`

Conta righe, parole e byte.

Sintassi: `wc [-lwc] [file...]`

- `-l`: righe
- `-w`: parole
- `-c`: byte

### `mkdir`

Crea directory.

Sintassi: `mkdir [-p] directory...`

- `-p`: crea anche le directory intermedie, nessun errore se esiste

### `rmdir`

Rimuove directory vuote.

Sintassi: `rmdir directory...`

### `touch`

Crea file vuoti o aggiorna la data di modifica.

Sintassi: `touch file...`

### `rm`

Elimina file. NON esiste cestino: è definitivo.

Sintassi: `rm [-rf] file...`

- `-r`: ricorsivo (directory)
- `-f`: ignora i file inesistenti

Differenze rispetto al comando reale:
- -i (conferma interattiva) non è supportata.

### `cp`

Copia file e directory.

Sintassi: `cp [-r] origine... destinazione`

- `-r`: copia le directory

### `mv`

Sposta o rinomina.

Sintassi: `mv origine... destinazione`

### `chmod`

Cambia i permessi: ottale (755) o simbolico (u+x, a-w).

Sintassi: `chmod modo file...`

Differenze rispetto al comando reale:
- Non supporta -R né modi composti come u+x,g-w.

### `basename`

Parte finale di un percorso.

Sintassi: `basename percorso [suffisso]`

### `dirname`

Parte directory di un percorso.

Sintassi: `dirname percorso`

### `tee`

Copia stdin su stdout e su file.

Sintassi: `tee [-a] file...`

- `-a`: aggiunge invece di sovrascrivere

### `stat`

Informazioni su un file.

Sintassi: `stat [-c formato] file...`

- `-c formato`: stampa solo i campi richiesti: %s %n %a %A %F %U %Y

Differenze rispetto al comando reale:
- L'output predefinito è ridotto rispetto al comando reale; formati diversi da quelli elencati danno un errore esplicito.

### `find`

Cerca file.

Sintassi: `find [percorso...] [-name modello] [-type f|d] [-maxdepth N]`

- `-name`: filtra per nome (glob)
- `-iname`: come -name senza maiuscole
- `-type f`: d|file o directory
- `-maxdepth N`: profondità massima

Differenze rispetto al comando reale:
- Non supporta -exec, -mtime, operatori logici.

### `grep`

Cerca righe che corrispondono a un modello. Codice 0 = trovato, 1 = nessuna corrispondenza, 2 = errore.

Sintassi: `grep [opzioni] modello [file...]`

- `-m N`: si ferma dopo N righe
- `-x`: la riga deve coincidere per intero
- `-i`: ignora maiuscole
- `-v`: inverte
- `-n`: numero di riga
- `-c`: conta le righe
- `-l`: solo nomi dei file
- `-r`: ricorsivo
- `-E`: espressioni regolari estese
- `-F`: testo letterale
- `-w`: parola intera
- `-o`: solo la parte che corrisponde
- `-A -B -C N`: righe di contesto
- `-q`: silenzioso

Esempio: `grep -n ERROR app.log`

Differenze rispetto al comando reale:
- Le espressioni regolari sono convertite in JavaScript: i casi limite possono differire.

### `sort`

Ordina le righe.

Sintassi: `sort [-rnuf] [-k N] [-t sep] [file...]`

- `-r`: inverso
- `-n`: numerico
- `-u`: elimina i duplicati
- `-k N`: ordina per campo N
- `-t sep`: separatore dei campi
- `-f`: ignora maiuscole

### `uniq`

Rimuove righe adiacenti duplicate (ordina prima con sort).

Sintassi: `uniq [-cdui] [file]`

- `-c`: premette il conteggio
- `-d`: solo duplicate
- `-u`: solo uniche
- `-i`: ignora maiuscole

### `cut`

Estrae campi o caratteri.

Sintassi: `cut -d sep -f lista | -c lista`

- `-d`: separatore
- `-f`: campi (es. 1,3 o 2-)
- `-c`: caratteri

### `tr`

Traduce o elimina caratteri.

Sintassi: `tr [-ds] insieme1 [insieme2]`

- `-d`: elimina
- `-s`: comprime le ripetizioni

Differenze rispetto al comando reale:
- Supporta intervalli (a-z) e classi [:upper:] [:lower:] [:digit:] [:space:].

### `sed`

Editor di flusso: sostituzioni, cancellazioni, stampa.

Sintassi: `sed [-nE] [-i] 'comando' [file...]`

- `s/a/b/[g]`: sostituzione
- `Nd, N,Md, /re/d`: cancella righe
- `Np`: stampa (con -n)
- `-i`: modifica il file sul posto

Differenze rispetto al comando reale:
- Sottoinsieme: solo i comandi s, d, p.

### `awk`

Elabora campi di testo.

Sintassi: `awk [-F sep] 'condizione {print $1, $2}' [file...]`

- `-F sep`: separatore

Differenze rispetto al comando reale:
- Sottoinsieme: solo print di campi/NR/NF, condizioni /re/, NR==N, $N==x e END{print NR}. Nessuna variabile, ciclo, concatenazione o aritmetica: le espressioni non supportate danno un errore esplicito (mai un risultato sbagliato).

### `diff`

Confronta due file riga per riga (formato unificato). Codice 1 se differiscono.

Sintassi: `diff file1 file2`

Differenze rispetto al comando reale:
- Produce sempre il formato unificato, con un solo blocco @@.

### `less`

Mostra un file.

Sintassi: `less file`

Differenze rispetto al comando reale:
- Nessuna paginazione: equivale a cat.

### `more`

Mostra un file.

Sintassi: `more file`

Differenze rispetto al comando reale:
- Nessuna paginazione: equivale a cat.

### `xargs`

Costruisce un comando con gli argomenti letti da stdin.

Sintassi: `xargs comando [argomenti]`

Differenze rispetto al comando reale:
- Nessuna opzione (-I, -n, -0) supportata.

### `ps`

Elenca i processi (simulati).

Sintassi: `ps [aux]`

### `kill`

Invia un segnale a un processo.

Sintassi: `kill [-l] pid...`

Differenze rispetto al comando reale:
- I processi di servizio non sono terminabili dall'utente: ottieni 'Operation not permitted'.

### `curl`

Client HTTP.

Sintassi: `curl [opzioni] URL`

- `-X METODO`: metodo HTTP
- `-H "Nome: valore"`: header
- `-d dati`: body (implica POST; @file legge da file)
- `--json dati`: body JSON con header JSON
- `-i`: mostra header di risposta
- `-I`: solo header (HEAD)
- `-s`: silenzioso (-S mostra gli errori)
- `-v`: dettagli di richiesta e risposta
- `-o file`: scrive il body su file
- `-w fmt`: stampa info, es. %{http_code}
- `-f`: errore (codice 22) per status >= 400
- `-L`: segue i redirect
- `-u u:p`: autenticazione Basic
- `-m sec`: timeout totale

Esempio: `curl -s $TASKFLOW_URL/v1/health`

Differenze rispetto al comando reale:
- Si collega solo ai servizi simulati TaskFlow; altri host danno "Could not resolve host".
- Il misuratore di avanzamento non è simulato.
- Non supporta -F (multipart), -b/-c (cookie), proxy, certificati.

### `jq`

Elabora JSON.

Sintassi: `jq [-rcsnje] 'filtro' [file...]`

- `-n`: nessun input
- `-j`: senza a capo (con -r)
- `-e`: esce con 1 se l'ultimo valore è false o null
- `-r`: stringhe senza virgolette
- `-c`: output compatto
- `.campo .[] .[0]`: percorsi
- `select(cond) map(f) length keys sort`: funzioni

Differenze rispetto al comando reale:
- Sottoinsieme di jq: percorsi, pipe, select, map, length, keys, sort, sort_by, group_by, unique, unique_by, min, max, reverse, flatten, paths, index, add, join, test, interpolazione di stringhe \(...), @csv @tsv @json @text @sh, costruttori di oggetti/array. Niente variabili, reduce, def, if/then/else: le funzioni mancanti danno un errore esplicito (codice 3).

## PowerShell 5.1

### `Get-Location`

Directory corrente (alias: pwd, gl).

Sintassi: `Get-Location`

### `Set-Location`

Cambia directory (alias: cd, sl).

Sintassi: `Set-Location [-Path] <percorso>`

### `Get-ChildItem`

Elenca file e directory (alias: ls, dir, gci). `Get-ChildItem env:` elenca le variabili d'ambiente.

Sintassi: `Get-ChildItem [-Path] <percorso> [-Recurse] [-Force] [-Filter <glob>] [-Name]`

- `-Recurse`: ricorsivo
- `-Force`: include i file nascosti
- `-Filter`: filtro per nome (glob)
- `-Name`: solo i nomi
- `-File / -Directory`: solo file o cartelle

### `Get-Content`

Legge un file, una riga alla volta (alias: cat, type, gc).

Sintassi: `Get-Content [-Path] <file> [-TotalCount n] [-Tail n] [-Raw]`

- `-TotalCount`: prime n righe
- `-Tail`: ultime n righe
- `-Raw`: tutto il testo in una stringa

### `Set-Content`

Scrive un file sovrascrivendolo (alias: sc).

Sintassi: `Set-Content [-Path] <file> -Value <testo>`

### `Add-Content`

Aggiunge testo a un file (alias: ac).

Sintassi: `Add-Content [-Path] <file> -Value <testo>`

### `Out-File`

Scrive la pipeline su file (anche `>` e `>>`).

Sintassi: `Out-File [-FilePath] <file> [-Append]`

### `New-Item`

Crea file o directory (alias: ni).

Sintassi: `New-Item -Path <percorso> -ItemType File|Directory [-Value <testo>] [-Force]`

### `Remove-Item`

Elimina file o directory (alias: rm, del, ri). Definitivo.

Sintassi: `Remove-Item <percorso> [-Recurse] [-Force]`

### `Copy-Item`

Copia (alias: cp, copy).

Sintassi: `Copy-Item <origine> <destinazione> [-Recurse]`

### `Move-Item`

Sposta o rinomina (alias: mv, move).

Sintassi: `Move-Item <origine> <destinazione>`

### `Test-Path`

Restituisce True se il percorso esiste.

Sintassi: `Test-Path <percorso>`

### `Write-Output`

Scrive nella pipeline (alias: echo, write).

Sintassi: `Write-Output <oggetto>`

### `Write-Host`

Scrive sullo schermo, non nella pipeline.

Sintassi: `Write-Host <testo>`

### `Write-Error`

Scrive un errore non terminante.

Sintassi: `Write-Error <messaggio>`

### `Select-String`

Cerca testo (simile a grep, ma restituisce oggetti MatchInfo).

Sintassi: `Select-String -Pattern <regex> [-Path <file>] [-SimpleMatch] [-CaseSensitive]`

- `-Pattern`: espressione regolare
- `-SimpleMatch`: testo letterale
- `-CaseSensitive`: distingue le maiuscole

Differenze rispetto al comando reale:
- Di default NON distingue le maiuscole (grep sì).

### `Where-Object`

Filtra gli oggetti della pipeline (alias: where, ?).

Sintassi: `Where-Object { $_.Proprieta -eq valore }  |  Where-Object Proprieta -eq valore`

### `ForEach-Object`

Esegue un blocco per ogni oggetto (alias: foreach, %).

Sintassi: `ForEach-Object { ... $_ ... }`

### `Select-Object`

Seleziona proprietà o elementi (alias: select).

Sintassi: `Select-Object [-Property] <nomi> [-First n] [-Last n] [-ExpandProperty nome]`

### `Sort-Object`

Ordina (alias: sort).

Sintassi: `Sort-Object [-Property] <nome> [-Descending] [-Unique]`

### `Measure-Object`

Conta e somma (alias: measure).

Sintassi: `Measure-Object [-Line] [-Word] [-Character] [-Sum <prop>]`

### `Group-Object`

Raggruppa per valore (alias: group).

Sintassi: `Group-Object <proprieta>`

### `Format-Table`

Mostra come tabella (alias: ft).

Sintassi: `Format-Table [-Property <nomi>] [-AutoSize]`

### `Format-List`

Mostra come elenco proprietà (alias: fl).

Sintassi: `Format-List [-Property <nomi>]`

### `Out-String`

Converte la pipeline in una stringa.

Sintassi: `Out-String`

### `ConvertFrom-Json`

Trasforma un testo JSON in oggetti.

Sintassi: `ConvertFrom-Json`

### `ConvertTo-Json`

Trasforma oggetti in testo JSON.

Sintassi: `ConvertTo-Json [-Depth n] [-Compress]`

Differenze rispetto al comando reale:
- La profondità predefinita è 2 come in PowerShell: oggetti annidati più profondi vengono troncati.

### `Invoke-RestMethod`

Chiama un'API e converte automaticamente la risposta JSON in oggetti (alias: irm).

Sintassi: `Invoke-RestMethod -Uri <url> [-Method <m>] [-Headers <hashtable>] [-Body <testo|hashtable>] [-ContentType <tipo>]`

- `-Uri`: URL
- `-Method`: Get, Post, Put, Patch, Delete
- `-Headers`: hashtable di header
- `-Body`: corpo; una stringa è inviata così com'è
- `-ContentType`: es. application/json
- `-TimeoutSec`: timeout

Esempio: `Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"`

Differenze rispetto al comando reale:
- Un body stringa senza -ContentType viene inviato come application/x-www-form-urlencoded: indica -ContentType application/json.
- Con status >= 400 genera un errore terminante.

### `Invoke-WebRequest`

Chiama un URL e restituisce la risposta completa (StatusCode, Headers, Content) (alias: iwr; in Windows PowerShell 5.1 anche `curl`).

Sintassi: `Invoke-WebRequest -Uri <url> [-Method <m>] [-Headers <hashtable>] [-Body <testo>] [-UseBasicParsing]`

- `-Uri`: URL
- `-Method`: metodo
- `-Headers`: header
- `-Body`: corpo
- `-ContentType`: tipo del corpo

Differenze rispetto al comando reale:
- Con status >= 400 genera un errore terminante: per leggere lo status usa try/catch.
- In Windows PowerShell 5.1 `curl` è un alias di Invoke-WebRequest; il vero curl è `curl.exe`.

### `Get-Item`

Restituisce un file o una cartella come oggetto (proprietà Name, FullName, Length, LastWriteTime).

Sintassi: `Get-Item <percorso> [-Force]`

### `Rename-Item`

Rinomina un file o una cartella (alias: ren, rni).

Sintassi: `Rename-Item <percorso> <nuovoNome>`

### `Write-Warning`

Scrive un avviso (prefisso WARNING:).

Sintassi: `Write-Warning <messaggio>`

### `Out-Host`

Invia la pipeline direttamente allo schermo.

Sintassi: `Out-Host`

### `New-Object`

Crea un oggetto (nel laboratorio solo PSObject e Hashtable).

Sintassi: `New-Object -TypeName PSObject -Property <hashtable>`

Differenze rispetto al comando reale:
- Gli altri tipi .NET non sono disponibili.

### `Invoke-Expression`

Esegue il testo come comando PowerShell (alias: iex). Usalo con cautela: esegue ciò che gli passi.

Sintassi: `Invoke-Expression <comando>`

Differenze rispetto al comando reale:
- Nel laboratorio esegue sempre dentro il motore simulato.

### `Get-Variable`

Elenca le variabili.

Sintassi: `Get-Variable [nome]`

### `Get-Command`

Dice se un nome è cmdlet, alias, funzione o applicazione (alias: gcm).

Sintassi: `Get-Command <nome>`

### `Get-Help`

Mostra la guida del laboratorio (alias: help, man).

Sintassi: `Get-Help <cmdlet>`

### `Get-History`

Cronologia dei comandi (alias: h, history).

Sintassi: `Get-History`

### `Get-Date`

Data e ora dell'orologio simulato.

Sintassi: `Get-Date [-Format <fmt>]`

### `Get-Process`

Elenca i processi (simulati) (alias: ps, gps).

Sintassi: `Get-Process [nome]`

### `Start-Sleep`

Attende (orologio simulato).

Sintassi: `Start-Sleep -Seconds <n>`

### `Clear-Host`

Pulisce lo schermo (alias: clear, cls).

Sintassi: `Clear-Host`

### `Set-Item`

Imposta una variabile d'ambiente (alternativa a `$env:NOME = valore`).

Sintassi: `Set-Item env:<NOME> <valore>`

Differenze rispetto al comando reale:
- Nel laboratorio funziona solo per l'unità Env:; sugli altri percorsi segnala che non è supportato.

### `Set-Variable`

Imposta una variabile.

Sintassi: `Set-Variable <nome> <valore>`

### `Get-Alias`

Mostra gli alias (alias: gal).

Sintassi: `Get-Alias [nome]`

Differenze rispetto al comando reale:
- L'oggetto restituito ha solo CommandType e Name ("alias -> comando"): non ha la proprietà Definition.

### `Compare-Object`

Confronta due insiemi di oggetti (alias: diff, compare).

Sintassi: `Compare-Object <riferimento> <differenza>`

### `Split-Path`

Divide un percorso.

Sintassi: `Split-Path <percorso> [-Leaf] [-Parent]`

### `Join-Path`

Unisce percorsi.

Sintassi: `Join-Path <percorso> <figlio>`

### `Resolve-Path`

Risolve un percorso relativo.

Sintassi: `Resolve-Path <percorso>`

### `Out-Null`

Scarta lo output.

Sintassi: `Out-Null`

### `curl.exe`

Il vero curl richiamato da PowerShell come applicazione esterna. Stesse opzioni di curl in Bash.

Sintassi: `curl.exe [opzioni] URL`

Differenze rispetto al comando reale:
- In Windows PowerShell 5.1 `curl` (senza .exe) è invece un alias di Invoke-WebRequest.

### `jq.exe`

jq come applicazione esterna.

Sintassi: `jq [opzioni] filtro`

Differenze rispetto al comando reale:
- Sottoinsieme di jq (vedi Bash).
