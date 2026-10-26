/**
 * Catalogo dei comandi supportati: per ciascuno sintassi, opzioni, e differenze dichiarate
 * rispetto al comportamento reale (requisito 3.4). Un test verifica che ogni comando
 * registrato nei motori compaia qui.
 */
import type { ShellId } from './types.ts';

export interface CommandDoc {
  name: string;
  shells: ShellId[];
  kind: 'builtin' | 'command' | 'cmdlet' | 'alias';
  synopsis: string;
  summary: string;
  options: { flag: string; desc: string }[];
  differences: string[];
  /** esempio sintetico */
  example?: string;
}

function c(
  name: string,
  shells: ShellId[],
  kind: CommandDoc['kind'],
  synopsis: string,
  summary: string,
  opts: string[] = [],
  differences: string[] = [],
  example?: string,
): CommandDoc {
  return {
    name,
    shells,
    kind,
    synopsis,
    summary,
    options: opts.map((o) => {
      const i = o.indexOf('|');
      return { flag: o.slice(0, i), desc: o.slice(i + 1) };
    }),
    differences,
    example,
  };
}

const B: ShellId[] = ['bash'];
const P: ShellId[] = ['pwsh'];

export const CATALOG: CommandDoc[] = [
  // ---- Bash: builtin
  c('echo', B, 'builtin', 'echo [-neE] [testo...]', 'Stampa i suoi argomenti.', ['-n|non aggiunge il newline finale', '-e|interpreta le sequenze \\n \\t', '-E|non interpreta le sequenze'], [], 'echo "Ciao $USER"'),
  c('pwd', B, 'builtin', 'pwd', 'Stampa la directory corrente (percorso assoluto).'),
  c('cd', B, 'builtin', 'cd [directory]', 'Cambia directory. Senza argomenti va nella home; `cd -` torna alla precedente.', [], ['Non gestisce CDPATH.']),
  c('export', B, 'builtin', 'export [NOME[=valore]...]', "Rende una variabile parte dell'ambiente dei comandi lanciati.", ['-p|elenca le variabili esportate']),
  c('unset', B, 'builtin', 'unset NOME...', 'Elimina variabili o funzioni.'),
  c('local', B, 'builtin', 'local NOME[=valore]', 'Dichiara una variabile locale a una funzione.'),
  c('declare', B, 'builtin', 'declare NOME=valore', 'Dichiara variabili.', [], ['Le opzioni (-a, -A, -i...) sono ignorate.']),
  c('set', B, 'builtin', 'set [-e|+e]', 'Opzioni della shell. Supportato: -e (esce al primo errore).', [], ['Le altre opzioni (-u, -x, -o pipefail) sono accettate ma non hanno effetto.']),
  c('shift', B, 'builtin', 'shift [n]', 'Scorre i parametri posizionali.'),
  c('exit', B, 'builtin', 'exit [codice]', 'Esce dallo script o dalla funzione con un codice di uscita.'),
  c('return', B, 'builtin', 'return [codice]', 'Termina una funzione.'),
  c('break', B, 'builtin', 'break [n]', 'Esce da un ciclo.'),
  c('continue', B, 'builtin', 'continue [n]', 'Passa alla prossima iterazione del ciclo.'),
  c('true', B, 'builtin', 'true', 'Non fa nulla e termina con codice 0.'),
  c('false', B, 'builtin', 'false', 'Non fa nulla e termina con codice 1.'),
  c(':', B, 'builtin', ':', 'Comando nullo (codice 0).'),
  c('clear', B, 'command', 'clear', 'Pulisce lo schermo (la cronologia dei comandi resta).'),
  c('history', B, 'builtin', 'history [n] | history -c', 'Mostra la cronologia dei comandi di questa shell.'),
  c('read', B, 'builtin', 'read [-r] [var...]', 'Legge una riga dallo standard input.', [], ['Legge solo da pipe/redirezione: il terminale non chiede input interattivo.']),
  c('test', B, 'builtin', 'test ESPRESSIONE  |  [ ESPRESSIONE ]  |  [[ ESPRESSIONE ]]', 'Valuta una condizione (codice 0 = vero).', ['-e -f -d|esiste, è file, è directory', '-r -w -x|leggibile, scrivibile, eseguibile', '-z -n|stringa vuota / non vuota', '-eq -ne -lt -gt -le -ge|confronti numerici', '= != =~|confronti di stringhe e regex'], ['[[ ]] è trattato come test esteso con glob e regex semplificati.']),
  c('[', B, 'builtin', '[ ESPRESSIONE ]', 'Sinonimo di test.'),
  c('[[', B, 'builtin', '[[ ESPRESSIONE ]]', 'Test esteso.'),
  c('source', B, 'builtin', 'source file [argomenti]', 'Esegue un file nella shell corrente (anche `. file`).'),
  c('.', B, 'builtin', '. file [argomenti]', 'Sinonimo di source.'),
  c('bash', B, 'command', 'bash [-c "comandi"] script [argomenti]', 'Esegue uno script in una shell figlia: non modifica cwd e variabili del chiamante.', [], ['Non supporta la modalità interattiva né la lettura da stdin.']),
  c('sh', B, 'command', 'sh script [argomenti]', 'Come bash.'),
  c('type', B, 'builtin', 'type nome...', 'Dice se un nome è builtin, funzione o comando esterno.'),
  c('which', B, 'command', 'which comando...', 'Mostra il percorso di un comando esterno.'),
  c('command', B, 'builtin', 'command [-v] nome', 'Esegue un comando saltando le funzioni, o ne mostra il percorso con -v.'),
  c('help', B, 'builtin', 'help [comando]', 'Mostra la guida del laboratorio per un comando, o elenca i comandi.'),
  c('man', B, 'command', 'man comando', 'Mostra la pagina di manuale semplificata del laboratorio.', [], ['Il testo è una sintesi del laboratorio; non c\'è paginazione. Per le opzioni complete usa la documentazione ufficiale.']),
  c('env', B, 'command', 'env [VAR=valore] [comando]', "Mostra l'ambiente o esegue un comando con variabili aggiunte."),
  c('printenv', B, 'command', 'printenv [NOME]', 'Mostra variabili di ambiente.'),
  c('printf', B, 'builtin', 'printf formato [argomenti...]', 'Stampa testo formattato.', ['%s %d %f %x|segnaposto supportati'], ['Supporta %s, %d, %i, %f, %x, %X, %b e %%.']),
  c('sleep', B, 'command', 'sleep secondi', "Attende: nel laboratorio avanza l'orologio simulato, senza attese reali."),
  c('date', B, 'command', 'date [+formato] [-I]', "Mostra data e ora dell'orologio simulato (UTC).", ['+%Y %m %d %H %M %S %F %T|formati supportati']),
  c('whoami', B, 'command', 'whoami', "Mostra l'utente corrente."),
  c('hostname', B, 'command', 'hostname', "Mostra il nome dell'host simulato."),
  c('id', B, 'command', 'id', "Mostra identità dell'utente."),
  c('uname', B, 'command', 'uname [-a]', 'Informazioni sul sistema (simulato: Linux).'),
  c('seq', B, 'command', 'seq [inizio [passo]] fine', 'Stampa una sequenza di numeri.'),
  // ---- Bash: file
  c('ls', B, 'command', 'ls [opzioni] [percorso...]', 'Elenca file e directory.', ['-l|formato lungo (permessi, proprietario, dimensione, data)', '-a|include i file nascosti (nome che inizia con .)', '-A|come -a ma senza . e ..', '-h|dimensioni leggibili (con -l)', '-t|ordina per data di modifica (più recente prima)', '-S|ordina per dimensione', '-r|ordine inverso', '-R|ricorsivo', '-d|mostra la directory stessa', '-1|un elemento per riga', '-F|aggiunge un indicatore di tipo'], ['Gli utenti macOS troveranno BSD ls: qui le opzioni sono quelle GNU (il Finder e macOS differiscono in alcune opzioni, es. -G, -@).', 'La dimensione in "total" è approssimata a blocchi da 4K.'], 'ls -la ~/lab'),
  c('cat', B, 'command', 'cat [-n] [file...]', 'Stampa il contenuto dei file.', ['-n|numera le righe']),
  c('head', B, 'command', 'head [-n N] [file...]', 'Prime N righe (default 10).', ['-n N|numero di righe', '-c N|numero di byte']),
  c('tail', B, 'command', 'tail [-n N] [file...]', 'Ultime N righe (default 10).', ['-n N|numero di righe', '-n +N|dalla riga N in poi'], ['-f (follow) non è supportato.']),
  c('wc', B, 'command', 'wc [-lwc] [file...]', 'Conta righe, parole e byte.', ['-l|righe', '-w|parole', '-c|byte']),
  c('mkdir', B, 'command', 'mkdir [-p] directory...', 'Crea directory.', ['-p|crea anche le directory intermedie, nessun errore se esiste']),
  c('rmdir', B, 'command', 'rmdir directory...', 'Rimuove directory vuote.'),
  c('touch', B, 'command', 'touch file...', 'Crea file vuoti o aggiorna la data di modifica.'),
  c('rm', B, 'command', 'rm [-rf] file...', 'Elimina file. NON esiste cestino: è definitivo.', ['-r|ricorsivo (directory)', '-f|ignora i file inesistenti'], ['-i (conferma interattiva) non è supportata.']),
  c('cp', B, 'command', 'cp [-r] origine... destinazione', 'Copia file e directory.', ['-r|copia le directory']),
  c('mv', B, 'command', 'mv origine... destinazione', 'Sposta o rinomina.'),
  c('chmod', B, 'command', 'chmod modo file...', 'Cambia i permessi: ottale (755) o simbolico (u+x, a-w).', [], ['Non supporta -R né modi composti come u+x,g-w.']),
  c('basename', B, 'command', 'basename percorso [suffisso]', "Parte finale di un percorso."),
  c('dirname', B, 'command', 'dirname percorso', 'Parte directory di un percorso.'),
  c('tee', B, 'command', 'tee [-a] file...', 'Copia stdin su stdout e su file.', ['-a|aggiunge invece di sovrascrivere']),
  c('stat', B, 'command', 'stat file...', 'Informazioni su un file.', [], ['Output ridotto rispetto al comando reale.']),
  c('find', B, 'command', 'find [percorso...] [-name modello] [-type f|d] [-maxdepth N]', 'Cerca file.', ['-name|filtra per nome (glob)', '-iname|come -name senza maiuscole', '-type f|d|file o directory', '-maxdepth N|profondità massima'], ['Non supporta -exec, -mtime, operatori logici.']),
  // ---- testo
  c('grep', B, 'command', 'grep [opzioni] modello [file...]', 'Cerca righe che corrispondono a un modello. Codice 0 = trovato, 1 = nessuna corrispondenza, 2 = errore.', ['-i|ignora maiuscole', '-v|inverte', '-n|numero di riga', '-c|conta le righe', '-l|solo nomi dei file', '-r|ricorsivo', '-E|espressioni regolari estese', '-F|testo letterale', '-w|parola intera', '-o|solo la parte che corrisponde', '-A -B -C N|righe di contesto', '-q|silenzioso'], ['Le espressioni regolari sono convertite in JavaScript: i casi limite possono differire.'], 'grep -n ERROR app.log'),
  c('sort', B, 'command', 'sort [-rnuf] [-k N] [-t sep] [file...]', 'Ordina le righe.', ['-r|inverso', '-n|numerico', '-u|elimina i duplicati', '-k N|ordina per campo N', '-t sep|separatore dei campi', '-f|ignora maiuscole']),
  c('uniq', B, 'command', 'uniq [-cdui] [file]', 'Rimuove righe adiacenti duplicate (ordina prima con sort).', ['-c|premette il conteggio', '-d|solo duplicate', '-u|solo uniche', '-i|ignora maiuscole']),
  c('cut', B, 'command', 'cut -d sep -f lista | -c lista', 'Estrae campi o caratteri.', ['-d|separatore', '-f|campi (es. 1,3 o 2-)', '-c|caratteri']),
  c('tr', B, 'command', 'tr [-ds] insieme1 [insieme2]', 'Traduce o elimina caratteri.', ['-d|elimina', '-s|comprime le ripetizioni'], ['Supporta intervalli (a-z) e classi [:upper:] [:lower:] [:digit:] [:space:].']),
  c('sed', B, 'command', "sed [-nE] [-i] 'comando' [file...]", 'Editor di flusso: sostituzioni, cancellazioni, stampa.', ['s/a/b/[g]|sostituzione', 'Nd, N,Md, /re/d|cancella righe', 'Np|stampa (con -n)', '-i|modifica il file sul posto'], ['Sottoinsieme: solo i comandi s, d, p.']),
  c('awk', B, 'command', "awk [-F sep] 'condizione {print $1, $2}' [file...]", 'Elabora campi di testo.', ['-F sep|separatore'], ['Sottoinsieme: solo print di campi/NR/NF, condizioni /re/, NR==N, $N==x e END{print NR}. Nessuna variabile o ciclo.']),
  c('diff', B, 'command', 'diff file1 file2', 'Confronta due file riga per riga (formato unificato). Codice 1 se differiscono.', [], ['Produce sempre il formato unificato, con un solo blocco @@.']),
  c('less', B, 'command', 'less file', 'Mostra un file.', [], ['Nessuna paginazione: equivale a cat.']),
  c('more', B, 'command', 'more file', 'Mostra un file.', [], ['Nessuna paginazione: equivale a cat.']),
  c('xargs', B, 'command', 'xargs comando [argomenti]', 'Costruisce un comando con gli argomenti letti da stdin.', [], ['Nessuna opzione (-I, -n, -0) supportata.']),
  c('ps', B, 'command', 'ps [aux]', 'Elenca i processi (simulati).'),
  c('kill', B, 'builtin', 'kill [-l] pid...', 'Invia un segnale a un processo.', [], ["I processi di servizio non sono terminabili dall'utente: ottieni 'Operation not permitted'."]),
  c('curl', B, 'command', 'curl [opzioni] URL', 'Client HTTP.', ['-X METODO|metodo HTTP', '-H "Nome: valore"|header', '-d dati|body (implica POST; @file legge da file)', '--json dati|body JSON con header JSON', '-i|mostra header di risposta', '-I|solo header (HEAD)', '-s|silenzioso (-S mostra gli errori)', '-v|dettagli di richiesta e risposta', '-o file|scrive il body su file', '-w fmt|stampa info, es. %{http_code}', '-f|errore (codice 22) per status >= 400', '-L|segue i redirect', '-u u:p|autenticazione Basic', '-m sec|timeout totale'], ['Si collega solo ai servizi simulati TaskFlow; altri host danno "Could not resolve host".', 'Il misuratore di avanzamento non è simulato.', 'Non supporta -F (multipart), -b/-c (cookie), proxy, certificati.'], 'curl -s $TASKFLOW_URL/v1/health'),
  c('jq', B, 'command', "jq [-rcs] 'filtro' [file...]", 'Elabora JSON.', ['-r|stringhe senza virgolette', '-c|output compatto', '.campo .[] .[0]|percorsi', 'select(cond) map(f) length keys sort|funzioni'], ['Sottoinsieme di jq: percorsi, pipe, select, map, length, keys, sort, unique, add, join, test, costruttori di oggetti/array. Niente variabili, reduce, def.']),
  // ---- PowerShell
  c('Get-Location', P, 'cmdlet', 'Get-Location', 'Directory corrente (alias: pwd, gl).'),
  c('Set-Location', P, 'cmdlet', 'Set-Location [-Path] <percorso>', 'Cambia directory (alias: cd, sl).'),
  c('Get-ChildItem', P, 'cmdlet', 'Get-ChildItem [-Path] <percorso> [-Recurse] [-Force] [-Filter <glob>] [-Name]', 'Elenca file e directory (alias: ls, dir, gci).', ['-Recurse|ricorsivo', '-Force|include i file nascosti', '-Filter|filtro per nome (glob)', '-Name|solo i nomi', '-File / -Directory|solo file o cartelle']),
  c('Get-Content', P, 'cmdlet', 'Get-Content [-Path] <file> [-TotalCount n] [-Tail n] [-Raw]', 'Legge un file, una riga alla volta (alias: cat, type, gc).', ['-TotalCount|prime n righe', '-Tail|ultime n righe', '-Raw|tutto il testo in una stringa']),
  c('Set-Content', P, 'cmdlet', 'Set-Content [-Path] <file> -Value <testo>', 'Scrive un file sovrascrivendolo (alias: sc).'),
  c('Add-Content', P, 'cmdlet', 'Add-Content [-Path] <file> -Value <testo>', 'Aggiunge testo a un file (alias: ac).'),
  c('Out-File', P, 'cmdlet', 'Out-File [-FilePath] <file> [-Append]', 'Scrive la pipeline su file (anche `>` e `>>`).'),
  c('New-Item', P, 'cmdlet', 'New-Item -Path <percorso> -ItemType File|Directory [-Value <testo>] [-Force]', 'Crea file o directory (alias: ni).'),
  c('Remove-Item', P, 'cmdlet', 'Remove-Item <percorso> [-Recurse] [-Force]', 'Elimina file o directory (alias: rm, del, ri). Definitivo.'),
  c('Copy-Item', P, 'cmdlet', 'Copy-Item <origine> <destinazione> [-Recurse]', 'Copia (alias: cp, copy).'),
  c('Move-Item', P, 'cmdlet', 'Move-Item <origine> <destinazione>', 'Sposta o rinomina (alias: mv, move).'),
  c('Test-Path', P, 'cmdlet', 'Test-Path <percorso>', 'Restituisce True se il percorso esiste.'),
  c('Write-Output', P, 'cmdlet', 'Write-Output <oggetto>', 'Scrive nella pipeline (alias: echo, write).'),
  c('Write-Host', P, 'cmdlet', 'Write-Host <testo>', 'Scrive sullo schermo, non nella pipeline.'),
  c('Write-Error', P, 'cmdlet', 'Write-Error <messaggio>', 'Scrive un errore non terminante.'),
  c('Select-String', P, 'cmdlet', 'Select-String -Pattern <regex> [-Path <file>] [-SimpleMatch] [-CaseSensitive]', 'Cerca testo (simile a grep, ma restituisce oggetti MatchInfo).', ['-Pattern|espressione regolare', '-SimpleMatch|testo letterale', '-CaseSensitive|distingue le maiuscole'], ['Di default NON distingue le maiuscole (grep sì).']),
  c('Where-Object', P, 'cmdlet', 'Where-Object { $_.Proprieta -eq valore }  |  Where-Object Proprieta -eq valore', 'Filtra gli oggetti della pipeline (alias: where, ?).'),
  c('ForEach-Object', P, 'cmdlet', 'ForEach-Object { ... $_ ... }', 'Esegue un blocco per ogni oggetto (alias: foreach, %).'),
  c('Select-Object', P, 'cmdlet', 'Select-Object [-Property] <nomi> [-First n] [-Last n] [-ExpandProperty nome]', 'Seleziona proprietà o elementi (alias: select).'),
  c('Sort-Object', P, 'cmdlet', 'Sort-Object [-Property] <nome> [-Descending] [-Unique]', 'Ordina (alias: sort).'),
  c('Measure-Object', P, 'cmdlet', 'Measure-Object [-Line] [-Word] [-Character] [-Sum <prop>]', 'Conta e somma (alias: measure).'),
  c('Group-Object', P, 'cmdlet', 'Group-Object <proprieta>', 'Raggruppa per valore (alias: group).'),
  c('Format-Table', P, 'cmdlet', 'Format-Table [-Property <nomi>] [-AutoSize]', 'Mostra come tabella (alias: ft).'),
  c('Format-List', P, 'cmdlet', 'Format-List [-Property <nomi>]', 'Mostra come elenco proprietà (alias: fl).'),
  c('Out-String', P, 'cmdlet', 'Out-String', 'Converte la pipeline in una stringa.'),
  c('ConvertFrom-Json', P, 'cmdlet', 'ConvertFrom-Json', 'Trasforma un testo JSON in oggetti.'),
  c('ConvertTo-Json', P, 'cmdlet', 'ConvertTo-Json [-Depth n] [-Compress]', 'Trasforma oggetti in testo JSON.', [], ['La profondità predefinita è 2 come in PowerShell: oggetti annidati più profondi vengono troncati.']),
  c('Invoke-RestMethod', P, 'cmdlet', 'Invoke-RestMethod -Uri <url> [-Method <m>] [-Headers <hashtable>] [-Body <testo|hashtable>] [-ContentType <tipo>]', 'Chiama un\'API e converte automaticamente la risposta JSON in oggetti (alias: irm).', ['-Uri|URL', '-Method|Get, Post, Put, Patch, Delete', '-Headers|hashtable di header', '-Body|corpo; una stringa è inviata così com\'è', '-ContentType|es. application/json', '-TimeoutSec|timeout'], ['Un body stringa senza -ContentType viene inviato come application/x-www-form-urlencoded: indica -ContentType application/json.', 'Con status >= 400 genera un errore terminante.'], 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"'),
  c('Invoke-WebRequest', P, 'cmdlet', 'Invoke-WebRequest -Uri <url> [-Method <m>] [-Headers <hashtable>] [-Body <testo>] [-UseBasicParsing]', 'Chiama un URL e restituisce la risposta completa (StatusCode, Headers, Content) (alias: iwr; in Windows PowerShell 5.1 anche `curl`).', ['-Uri|URL', '-Method|metodo', '-Headers|header', '-Body|corpo', '-ContentType|tipo del corpo'], ['Con status >= 400 genera un errore terminante: per leggere lo status usa try/catch.', 'In Windows PowerShell 5.1 `curl` è un alias di Invoke-WebRequest; il vero curl è `curl.exe`.']),
  c('Get-Item', P, 'cmdlet', 'Get-Item <percorso> [-Force]', 'Restituisce un file o una cartella come oggetto (proprietà Name, FullName, Length, LastWriteTime).'),
  c('Rename-Item', P, 'cmdlet', 'Rename-Item <percorso> <nuovoNome>', 'Rinomina un file o una cartella (alias: ren, rni).'),
  c('Write-Warning', P, 'cmdlet', 'Write-Warning <messaggio>', 'Scrive un avviso (prefisso WARNING:).'),
  c('Out-Host', P, 'cmdlet', 'Out-Host', 'Invia la pipeline direttamente allo schermo.'),
  c('New-Object', P, 'cmdlet', 'New-Object -TypeName PSObject -Property <hashtable>', 'Crea un oggetto (nel laboratorio solo PSObject e Hashtable).', [], ['Gli altri tipi .NET non sono disponibili.']),
  c('Invoke-Expression', P, 'cmdlet', 'Invoke-Expression <comando>', "Esegue il testo come comando PowerShell (alias: iex). Usalo con cautela: esegue ciò che gli passi.", [], ['Nel laboratorio esegue sempre dentro il motore simulato.']),
  c('Get-Variable', P, 'cmdlet', 'Get-Variable [nome]', 'Elenca le variabili.'),
  c('Get-Command', P, 'cmdlet', 'Get-Command <nome>', 'Dice se un nome è cmdlet, alias, funzione o applicazione (alias: gcm).'),
  c('Get-Help', P, 'cmdlet', 'Get-Help <cmdlet>', 'Mostra la guida del laboratorio (alias: help, man).'),
  c('Get-History', P, 'cmdlet', 'Get-History', 'Cronologia dei comandi (alias: h, history).'),
  c('Get-Date', P, 'cmdlet', 'Get-Date [-Format <fmt>]', "Data e ora dell'orologio simulato."),
  c('Get-Process', P, 'cmdlet', 'Get-Process [nome]', 'Elenca i processi (simulati) (alias: ps, gps).'),
  c('Start-Sleep', P, 'cmdlet', 'Start-Sleep -Seconds <n>', "Attende (orologio simulato)."),
  c('Clear-Host', P, 'cmdlet', 'Clear-Host', 'Pulisce lo schermo (alias: clear, cls).'),
  c('Set-Variable', P, 'cmdlet', 'Set-Variable <nome> <valore>', 'Imposta una variabile.'),
  c('Get-Alias', P, 'cmdlet', 'Get-Alias [nome]', 'Mostra gli alias (alias: gal).'),
  c('Compare-Object', P, 'cmdlet', 'Compare-Object <riferimento> <differenza>', 'Confronta due insiemi di oggetti (alias: diff, compare).'),
  c('Split-Path', P, 'cmdlet', 'Split-Path <percorso> [-Leaf] [-Parent]', 'Divide un percorso.'),
  c('Join-Path', P, 'cmdlet', 'Join-Path <percorso> <figlio>', 'Unisce percorsi.'),
  c('Resolve-Path', P, 'cmdlet', 'Resolve-Path <percorso>', 'Risolve un percorso relativo.'),
  c('Out-Null', P, 'cmdlet', 'Out-Null', 'Scarta lo output.'),
  c('curl.exe', P, 'command', 'curl.exe [opzioni] URL', "Il vero curl richiamato da PowerShell come applicazione esterna. Stesse opzioni di curl in Bash.", [], ['In Windows PowerShell 5.1 `curl` (senza .exe) è invece un alias di Invoke-WebRequest.']),
  c('jq.exe', P, 'command', 'jq [opzioni] filtro', 'jq come applicazione esterna.', [], ['Sottoinsieme di jq (vedi Bash).']),
];

const ALIASES: Record<string, string> = {
  pwd: 'Get-Location', gl: 'Get-Location', cd: 'Set-Location', sl: 'Set-Location', ls: 'Get-ChildItem', dir: 'Get-ChildItem', gci: 'Get-ChildItem',
  cat: 'Get-Content', type: 'Get-Content', gc: 'Get-Content', sc: 'Set-Content', ac: 'Add-Content', ni: 'New-Item', rm: 'Remove-Item', del: 'Remove-Item',
  ri: 'Remove-Item', cp: 'Copy-Item', copy: 'Copy-Item', mv: 'Move-Item', move: 'Move-Item', echo: 'Write-Output', write: 'Write-Output',
  where: 'Where-Object', '?': 'Where-Object', foreach: 'ForEach-Object', '%': 'ForEach-Object', select: 'Select-Object', sort: 'Sort-Object',
  measure: 'Measure-Object', group: 'Group-Object', ft: 'Format-Table', fl: 'Format-List', irm: 'Invoke-RestMethod', iwr: 'Invoke-WebRequest',
  curl: 'Invoke-WebRequest', wget: 'Invoke-WebRequest', gcm: 'Get-Command', help: 'Get-Help', man: 'Get-Help', h: 'Get-History', history: 'Get-History',
  ps: 'Get-Process', gps: 'Get-Process', clear: 'Clear-Host', cls: 'Clear-Host', gal: 'Get-Alias', diff: 'Compare-Object', compare: 'Compare-Object',
  sleep: 'Start-Sleep', gv: 'Get-Variable', mkdir: 'New-Item', ren: 'Rename-Item', rni: 'Rename-Item', iex: 'Invoke-Expression', sls: 'Select-String',
};

/** Alias PowerShell (Windows PowerShell 5.1: `curl` e `wget` puntano a Invoke-WebRequest). */
export function psAliases(): Record<string, string> {
  return ALIASES;
}

export function findDoc(name: string, shell: ShellId): CommandDoc | undefined {
  const lower = name.toLowerCase();
  if (shell === 'pwsh') {
    const target = ALIASES[lower] ?? name;
    return CATALOG.find((d) => d.shells.includes('pwsh') && d.name.toLowerCase() === target.toLowerCase());
  }
  return CATALOG.find((d) => d.shells.includes('bash') && d.name === name);
}

export function commandsFor(shell: ShellId): CommandDoc[] {
  return CATALOG.filter((d) => d.shells.includes(shell));
}

export function renderHelp(name: string, shell: ShellId, man = false): string {
  if (!name) {
    const list = commandsFor(shell);
    const lines = list.map((d) => `  ${d.name.padEnd(20)} ${d.summary}`);
    return `Comandi supportati dal laboratorio (${shell === 'bash' ? 'Bash' : 'PowerShell'}):\n\n${lines.join('\n')}\n\nUsa ${shell === 'bash' ? 'man <comando>' : 'Get-Help <cmdlet>'} per i dettagli.\n`;
  }
  const d = findDoc(name, shell);
  if (!d) return man ? '' : `${shell === 'bash' ? 'help' : 'Get-Help'}: nessuna guida disponibile per '${name}' nel laboratorio.\n`;
  let out = `NOME\n    ${d.name} - ${d.summary}\n\nSINTASSI\n    ${d.synopsis}\n`;
  if (d.options.length) out += `\nOPZIONI\n${d.options.map((o) => `    ${o.flag.padEnd(26)} ${o.desc}`).join('\n')}\n`;
  if (d.example) out += `\nESEMPIO\n    ${d.example}\n`;
  if (d.differences.length) out += `\nDIFFERENZE RISPETTO AL COMANDO REALE (simulazione)\n${d.differences.map((x) => `    - ${x}`).join('\n')}\n`;
  return out;
}
