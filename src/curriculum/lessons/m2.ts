import type { Lesson } from '../types.ts';
import { cmdMatches, fileLines, pick, ranCmd, stdoutHas } from './helpers.ts';
import { parseTables } from '../../docs/lint.ts';

const SERVER_LOG = [
  '2026-03-02T09:00:01Z INFO  avvio del servizio',
  '2026-03-02T09:00:02Z INFO  connessione al database ok',
  '2026-03-02T09:00:05Z WARN  cache quasi piena (91%)',
  '2026-03-02T09:00:09Z ERROR timeout verso il servizio pagamenti',
  '2026-03-02T09:00:10Z INFO  richiesta GET /v1/tasks 200',
  '2026-03-02T09:00:14Z ERROR token scaduto per utente bob',
  '2026-03-02T09:00:15Z INFO  richiesta POST /v1/tasks 201',
  '2026-03-02T09:00:21Z WARN  risposta lenta (1900ms)',
  '2026-03-02T09:00:25Z ERROR validazione fallita: title obbligatorio',
  '2026-03-02T09:00:26Z INFO  richiesta GET /v1/projects 200',
  '2026-03-02T09:00:31Z WARN  retry numero 2 verso il database',
  '2026-03-02T09:00:33Z ERROR connessione al database interrotta',
  '2026-03-02T09:00:40Z INFO  riconnessione al database ok',
  '2026-03-02T09:00:44Z INFO  richiesta DELETE /v1/tasks/3 204',
  '2026-03-02T09:00:51Z WARN  utilizzo memoria alto',
  '2026-03-02T09:00:58Z ERROR errore interno non gestito',
  '2026-03-02T09:01:02Z INFO  richiesta GET /v1/health 200',
  '2026-03-02T09:01:09Z INFO  backup completato',
  '2026-03-02T09:01:15Z INFO  chiusura sessione di bob',
  '2026-03-02T09:01:20Z INFO  fine log',
].join('\n') + '\n';

const ACCESS = [
  ['10.0.0.1', 'GET /v1/tasks', 200, 512], ['10.0.0.2', 'GET /v1/tasks/1', 200, 240], ['10.0.0.1', 'POST /v1/tasks', 201, 260],
  ['10.0.0.3', 'GET /v1/tasks/99', 404, 90], ['10.0.0.2', 'GET /v1/health', 200, 80], ['10.0.0.4', 'GET /v1/tasks', 401, 70],
  ['10.0.0.1', 'GET /v1/flaky', 500, 60], ['10.0.0.3', 'GET /v1/tasks/77', 404, 90], ['10.0.0.2', 'GET /v1/projects', 200, 150],
  ['10.0.0.1', 'GET /v1/flaky', 500, 60], ['10.0.0.5', 'GET /v1/missing', 404, 90], ['10.0.0.2', 'GET /v1/tasks', 200, 512],
  ['10.0.0.3', 'PATCH /v1/tasks/2', 200, 250], ['10.0.0.1', 'GET /v1/health', 200, 80],
].map(([ip, req, st, n], i) => `${ip} - - [02/Mar/2026:09:00:${String(i + 1).padStart(2, '0')} +0000] "${req} HTTP/1.1" ${st} ${n}`).join('\n') + '\n';

const EXPECTED_STATUS: Record<string, number> = { '200': 7, '201': 1, '401': 1, '404': 3, '500': 2, };

const DIVIDI_SH = `#!/bin/bash
# Divide 100 per il numero indicato.
if [ $# -ne 1 ]; then
  echo "uso: dividi.sh NUMERO" >&2
  exit 1
fi
if ! [[ "$1" =~ ^[0-9]+$ ]]; then
  echo "errore: '$1' non e' un numero intero positivo" >&2
  exit 1
fi
if [ "$1" -eq 0 ]; then
  echo "errore: divisione per zero" >&2
  exit 2
fi
echo $((100 / $1))
`;

const DIVIDI_PS1 = `param([string]$Numero)
# Divide 100 per il numero indicato.
if (-not $Numero) { Write-Host "uso: dividi.ps1 NUMERO"; exit 1 }
if ($Numero -notmatch '^[0-9]+$') { Write-Host "errore: '$Numero' non e' un numero intero positivo"; exit 1 }
if ([int]$Numero -eq 0) { Write-Host "errore: divisione per zero"; exit 2 }
100 / [int]$Numero
`;

export const m2: Lesson[] = [
  {
    id: 'M2.L1',
    module: 2,
    n: 1,
    title: 'Pipe e redirezione dell\'output',
    objective: 'Collegare comandi con | e scrivere l\'output su file con > e >>, conoscendo il rischio di sovrascrittura.',
    explain: [
      'Ogni comando ha un input e un output standard. La pipe `|` manda l\'output di un comando come input del successivo: `cat server.log | head -3`.',
      'La redirezione scrive l\'output su un file: `>` crea il file o lo SVUOTA se esiste già (senza chiedere conferma), `>>` aggiunge in fondo. È il primo caso in cui un comando scrive file: lavora sempre in una cartella di prova e controlla il nome prima di premere Invio.',
      'Il laboratorio ha una copia di lavoro in ~/corso-cli/m2l1: se rovini un file puoi usare "Reset lezione".',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('server.log', SERVER_LOG);
      c.file('importante.txt', 'DATI IMPORTANTI - non sovrascrivere\n');
    },
    guided: [
      { title: 'La pipe', cmd: { bash: 'cat ~/corso-cli/m2l1/server.log | head -3', pwsh: 'Get-Content ~/corso-cli/m2l1/server.log | Select-Object -First 3' }, what: 'Legge il file e ne mostra le prime 3 righe.', who: 'La shell collega i due comandi; ognuno è un processo/cmdlet separato.', parts: ['cat: legge il file', '|: collega output → input', 'head -n 3: tiene le prime righe'], expect: 'Le prime 3 righe del log.', risk: 'Nessuno.' },
      { title: 'Redirezione su file', cmd: { bash: 'cd ~/corso-cli/m2l1 && echo prova > prova.txt && cat prova.txt', pwsh: 'cd ~/corso-cli/m2l1; echo prova > prova.txt; cat prova.txt' }, what: 'Scrive "prova" nel file prova.txt.', who: 'La shell apre il file e ci scrive l\'output di echo.', parts: ['>: crea o svuota prova.txt', 'cat: ne mostra il contenuto'], expect: 'prova', risk: 'Se prova.txt esisteva, il vecchio contenuto è perso senza avviso.' },
      { title: 'Aggiungere in fondo', cmd: { bash: 'echo seconda riga >> prova.txt && cat prova.txt', pwsh: 'echo "seconda riga" >> prova.txt; cat prova.txt' }, what: 'Aggiunge una riga senza cancellare.', who: 'La shell apre il file in modalità append.', parts: ['>>: aggiunge'], expect: 'prova + seconda riga', risk: 'Basso.' },
    ],
    predict: [
      {
        prompt: 'Cosa contiene f.txt dopo questi tre comandi? echo uno > f.txt; echo due > f.txt; cat f.txt',
        cmd: { bash: 'cd ~/corso-cli/m2l1; echo uno > f.txt; echo due > f.txt; cat f.txt', pwsh: 'cd ~/corso-cli/m2l1; echo uno > f.txt; echo due > f.txt; cat f.txt' },
        expect: 'Solo "due": il secondo > ha svuotato il file.',
        why: '> sovrascrive sempre; per accumulare serve >>.',
      },
    ],
    negative: {
      prompt: 'Sovrascrittura accidentale: scrivi su un file che esiste già (sulla COPIA prova.txt, non su importante.txt!).',
      cmd: { bash: 'cd ~/corso-cli/m2l1; echo oops > prova.txt; cat prova.txt', pwsh: 'cd ~/corso-cli/m2l1; echo oops > prova.txt; cat prova.txt' },
      explain: 'Il contenuto precedente di prova.txt è sparito, senza avviso né cestino. Prima di usare > su un file importante, verifica il nome (o fai una copia).',
    },
    task: {
      text: 'In ~/corso-cli/m2l1 salva in `errori.txt` SOLO le righe con ERROR di `server.log`, così come sono nel log (senza nome del file né numero di riga). Non devi toccare `importante.txt`.',
      criterion: 'errori.txt ha esattamente 5 righe, tutte con ERROR; importante.txt è invariato.',
    },
    checks: [
      {
        id: 'strumento',
        description: 'Hai filtrato il log con un comando (grep; PowerShell: Select-String)',
        expected: 'grep/Select-String',
        test: (c) => {
          const ok = ranCmd(c, pick(c, /\b(grep|awk|sed)\b/, /\b(Select-String|Where-Object)\b/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun filtro con redirezione nei comandi' };
        },
        onFail: 'Il file va prodotto dal comando (grep ERROR server.log > errori.txt), non scritto a mano.',
      },
      {
        id: 'errori',
        description: 'errori.txt contiene le 5 righe ERROR (e solo quelle)',
        expected: '5 righe, identiche a quelle del log che contengono ERROR',
        test: (c) => {
          const l = fileLines(c.read('errori.txt'));
          const orig = fileLines(c.read('server.log')).filter((x) => x.includes('ERROR'));
          const same = l.length === orig.length && l.every((x, i) => x === orig[i]);
          // Select-String scrive "file:riga:testo": a video sembra giusto, ma nel file le righe non sono quelle originali
          const prefixed = l.length === 5 && !same && l.every((x, i) => x.replace(/^[^:\s]+:\d+:/, '') === orig[i]);
          const why = l.length && !l.every((x) => x.includes('ERROR')) ? ', alcune senza ERROR' : prefixed ? ', ma ogni riga inizia con il nome del file e il numero di riga (es. server.log:4:). È il formato di Select-String: per salvare solo il testo originale usa ForEach-Object { $_.Line } oppure Select-Object -ExpandProperty Line' : l.length === 5 && !same ? ', diverse dalle righe originali del log (non modificarle: niente numeri di riga né altro testo)' : '';
          return { pass: l.length === 5 && same, actual: `${l.length} righe${why}` };
        },
        onFail: 'Filtra con grep ERROR (PowerShell: Select-String) e redirigi con >. Controlla il file con cat: deve avere 5 righe identiche al log. Attenzione in PowerShell: Select-String aggiunge "file:riga:" davanti a ogni riga; estrai solo il testo con ForEach-Object { $_.Line }.',
      },
      {
        id: 'intatto',
        description: 'importante.txt non è stato modificato',
        expected: 'DATI IMPORTANTI - non sovrascrivere',
        test: (c) => ({ pass: c.read('importante.txt') === 'DATI IMPORTANTI - non sovrascrivere\n', actual: (c.read('importante.txt') ?? '(file mancante)').trim() }),
        onFail: 'Hai sovrascritto importante.txt con >. Usa "Reset lezione" per ripristinarlo e riprova con il nome giusto.',
        errorTag: 'sovrascrittura',
      },
    ],
    example: { text: 'Esempio analogo: salvare le righe WARN in avvisi.txt (stesso schema, filtro diverso).', cmd: { bash: 'grep WARN server.log > avvisi.txt', pwsh: 'Select-String WARN server.log | ForEach-Object { $_.Line } > avvisi.txt' } },
    hints: ['Un filtro per righe si chiama grep (PowerShell: Select-String). La redirezione che crea il file è >. In PowerShell Select-String restituisce oggetti con nome file e numero di riga: per ottenere solo il testo della riga serve la proprietà Line.', 'Controlla di essere in ~/corso-cli/m2l1 leggendo il prompt, poi verifica con cat errori.txt.'],
    solutions: {
      bash: ['cd ~/corso-cli/m2l1', 'grep ERROR server.log > errori.txt'],
      pwsh: ['cd ~/corso-cli/m2l1', 'Select-String ERROR server.log | ForEach-Object { $_.Line } > errori.txt'],
    },
    summary: ['| collega comandi', '> sovrascrive, >> aggiunge', 'si lavora in una cartella di prova', 'verifica il file dopo averlo scritto'],
    skills: ['comandi', 'testing', 'output'],
    concepts: ['pipe |', 'redirezione > e >>', 'rischio di sovrascrittura con >', 'grep come filtro'],
  },
  {
    id: 'M2.L3',
    module: 2,
    n: 3,
    title: 'Filtri: grep, sort, uniq, cut, wc',
    objective: 'Comporre filtri in pipeline per estrarre, ordinare e contare dati da un log.',
    explain: [
      'Piccoli comandi, ognuno con un solo compito, si combinano con la pipe: grep filtra le righe, cut estrae colonne, sort ordina, uniq conta i duplicati (solo se adiacenti: prima sort!), wc conta righe/parole.',
      'In PowerShell la pipeline passa oggetti, non testo: Select-String, Where-Object, Sort-Object, Group-Object, Measure-Object fanno lo stesso lavoro.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => c.file('accessi.log', ACCESS),
    guided: [
      { title: 'Contare le righe', cmd: { bash: 'wc -l ~/corso-cli/m2l3/accessi.log', pwsh: 'Get-Content ~/corso-cli/m2l3/accessi.log | Measure-Object -Line' }, what: 'Conta le righe.', who: 'wc / Measure-Object.', parts: ['-l: righe'], expect: '14', risk: 'Nessuno.' },
      { title: 'Estrarre una colonna', cmd: { bash: "cut -d' ' -f9 ~/corso-cli/m2l3/accessi.log | head -3", pwsh: "Get-Content ~/corso-cli/m2l3/accessi.log | ForEach-Object { ($_ -split ' ')[8] } | Select-Object -First 3" }, what: 'Mostra lo status HTTP (9ª colonna) delle prime righe.', who: 'cut divide la riga nel carattere indicato.', parts: ["-d' ': separatore spazio", '-f9: nono campo'], expect: '200 200 201', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Cosa stampa `... | sort | uniq -c` su una colonna con valori ripetuti: perché serve sort prima di uniq?',
        cmd: { bash: "cut -d' ' -f9 ~/corso-cli/m2l3/accessi.log | sort | uniq -c", pwsh: "Get-Content ~/corso-cli/m2l3/accessi.log | ForEach-Object { ($_ -split ' ')[8] } | Group-Object | ForEach-Object { \"$($_.Count) $($_.Name)\" }" },
        expect: 'Una riga per status con il conteggio davanti: 7 200, 1 201, 1 401, 3 404, 2 500.',
        why: 'uniq conta solo righe ADIACENTI uguali: sort le raggruppa prima.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se dimentichi sort prima di uniq -c?',
      cmd: { bash: "cut -d' ' -f9 ~/corso-cli/m2l3/accessi.log | uniq -c", pwsh: "Get-Content ~/corso-cli/m2l3/accessi.log | ForEach-Object { ($_ -split ' ')[8] } | Group-Object | Select-Object -First 2" },
      explain: 'Bash: i valori uguali non adiacenti vengono contati più volte separatamente (200 compare in più righe). PowerShell: Group-Object raggruppa da solo.',
    },
    task: {
      text: 'In ~/corso-cli/m2l3 crea `conteggio.txt` con il numero di richieste per ciascuno status HTTP (una riga per status, con conteggio e codice).',
      criterion: 'Per ogni status presente nel log c\'è una riga con il codice e il suo conteggio corretto.',
    },
    checks: [
      {
        id: 'pipeline',
        description: 'Hai costruito una pipeline di filtri (sort/uniq/cut oppure Group-Object)',
        expected: pick({ shell: 'bash' } as never, 'comandi collegati con | tra cui sort, uniq, cut, awk o wc', 'pipeline con Group-Object, Sort-Object o Measure-Object') as string,
        test: (c) => {
          const ok = ranCmd(c, pick(c, /\|\s*(sort|uniq|cut|awk|wc)\b/, /\|\s*(Group-Object|Sort-Object|Measure-Object|Select-Object)/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna pipeline di filtri' };
        },
        onFail: 'Il conteggio va ricavato con i filtri della lezione collegati da | (cut, sort, uniq -c; PowerShell: Group-Object).',
      },
      {
        id: 'conteggi',
        description: 'conteggio.txt riporta il numero corretto per ogni status',
        expected: Object.entries(EXPECTED_STATUS).map(([k, v]) => `${v} × ${k}`).join(', '),
        test: (c) => {
          const lines = fileLines(c.read('conteggio.txt'));
          const bad: string[] = [];
          for (const [code, n] of Object.entries(EXPECTED_STATUS)) {
            const ok = lines.some((l) => {
              const t = l.trim().split(/\s+/);
              return t.length === 2 && ((t[0] === code && t[1] === String(n)) || (t[1] === code && t[0] === String(n)));
            });
            if (!ok) bad.push(`${code}→${n}`);
          }
          return { pass: lines.length > 0 && !bad.length, actual: lines.length ? (bad.length ? `mancano o sono errati: ${bad.join(', ')}` : 'ok') : 'file vuoto o mancante' };
        },
        onFail: 'Estrai la colonna dello status (9ª), raggruppa e conta, poi redirigi in conteggio.txt. In Bash ricorda sort prima di uniq -c.',
      },
    ],
    example: { text: 'Esempio analogo: contare quante richieste ha fatto ogni indirizzo IP.', cmd: { bash: "cd ~/corso-cli/m2l3 && cut -d' ' -f1 accessi.log | sort | uniq -c", pwsh: "cd ~/corso-cli/m2l3; Get-Content accessi.log | ForEach-Object { ($_ -split ' ')[0] } | Group-Object | ForEach-Object { \"$($_.Count) $($_.Name)\" }" } },
    hints: ['La colonna dello status è la nona, separata da spazi.', 'Pipeline: estrai → ordina → conta → salva con >.'],
    solutions: {
      bash: ['cd ~/corso-cli/m2l3', "cut -d' ' -f9 accessi.log | sort | uniq -c > conteggio.txt"],
      pwsh: ['cd ~/corso-cli/m2l3', "Get-Content accessi.log | ForEach-Object { ($_ -split ' ')[8] } | Group-Object | ForEach-Object { \"$($_.Count) $($_.Name)\" } > conteggio.txt"],
    },
    summary: ['grep filtra, cut estrae, sort ordina, uniq -c conta', 'uniq vuole input ordinato', 'PowerShell passa oggetti'],
    skills: ['comandi', 'output', 'autonomia'],
    concepts: ['filtri in pipeline', 'cut, sort, uniq -c, wc', 'Group-Object e Measure-Object in PowerShell'],
  },
  {
    id: 'M2.L4',
    module: 2,
    n: 4,
    title: 'Variabili d\'ambiente e codici di uscita',
    objective: 'Impostare una variabile d\'ambiente e leggere l\'esito dell\'ultimo comando ($? in Bash; $? e $LASTEXITCODE in PowerShell).',
    explain: [
      'Una variabile d\'ambiente è ereditata dai programmi che lanci. In Bash la crei con `export NOME=valore`; in PowerShell con `$env:NOME = "valore"`.',
      'Ogni comando termina con un codice di uscita: 0 = successo, altro = errore. Bash lo mette in `$?` (numero). PowerShell ha `$?` (True/False) e `$LASTEXITCODE` (solo per programmi esterni).',
      'grep esce con 1 se non trova nulla (non è un errore "vero"); `ls` su un percorso inesistente esce con 2 (è il valore del `ls` GNU, quello del laboratorio e di Linux; il `ls` del Mac esce con 1: il numero esatto dipende dal sistema, conta che sia diverso da 0).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => c.file('check.txt', 'ok\n'),
    guided: [
      { title: 'Impostare una variabile d\'ambiente', cmd: { bash: 'export DEMO=ciao; echo $DEMO', pwsh: '$env:DEMO = "ciao"; echo $env:DEMO' }, what: 'Crea e legge una variabile.', who: 'La shell.', parts: ['export: la rende visibile ai comandi lanciati'], expect: 'ciao', risk: 'Nessuno.' },
      { title: 'Il codice di uscita', cmd: { bash: 'grep zzz ~/corso-cli/m2l4/check.txt; echo $?', pwsh: 'Select-String zzz ~/corso-cli/m2l4/check.txt; $?' }, what: 'Cerca un testo assente e legge l\'esito.', who: 'La shell salva l\'esito dell\'ultimo comando.', parts: ['$?: esito dell\'ultimo comando'], expect: 'Bash: 1 (nessuna corrispondenza). PowerShell: True (nessun errore).', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Che esito riporta la shell dopo `ls /nonexistent`?',
        cmd: { bash: 'ls /nonexistent; echo $?', pwsh: 'Get-ChildItem /nonexistent; $?' },
        expect: 'Bash: 2. PowerShell: False.',
        why: 'Bash usa un numero (0 successo); PowerShell un booleano per $?.',
      },
    ],
    negative: {
      prompt: 'Cosa vale $? dopo un comando che riesce?',
      cmd: { bash: 'true; echo $?', pwsh: 'Get-Date | Out-Null; $?' },
      explain: '0 in Bash (successo), True in PowerShell.',
    },
    task: {
      text: 'In questa shell: (1) imposta la variabile d\'ambiente STAGE al valore `testing`; (2) in ~/corso-cli/m2l4 esegui un comando su un percorso inesistente e salva in `esito.txt` l\'esito riportato dalla shell per quel comando.',
      criterion: 'STAGE vale testing; esito.txt contiene il numero 2 (Bash; anche con una breve etichetta) oppure False (PowerShell).',
    },
    checks: [
      {
        id: 'stage',
        description: 'STAGE=testing nell\'ambiente della shell',
        expected: 'testing',
        test: (c) => ({ pass: c.state.shells[c.shell].env.STAGE === 'testing', actual: c.state.shells[c.shell].env.STAGE ?? '(non impostata)' }),
        onFail: 'Bash: export STAGE=testing. PowerShell: $env:STAGE = "testing". Senza export/env la variabile non è d\'ambiente.',
      },
      {
        id: 'esito',
        description: 'esito.txt contiene l\'esito dell\'ultimo comando fallito',
        expected: 'Bash: 2; PowerShell: False',
        test: (c) => {
          const t = (c.read('esito.txt') ?? '').trim();
          const ok = c.shell === 'bash' ? /^\D*2\D*$/.test(t) : /^\W*False\W*$/i.test(t);
          return { pass: ok, actual: t || '(vuoto o mancante)' };
        },
        onFail: 'Subito dopo il comando fallito (stessa riga, separata da ;) scrivi l\'esito: echo $? > esito.txt in Bash; $? > esito.txt in PowerShell.',
      },
    ],
    example: { text: 'Esempio analogo: salvare il codice di uscita di grep su un testo assente.', cmd: { bash: 'cd ~/corso-cli/m2l4 && grep zzz check.txt; echo $? > cod.txt', pwsh: 'cd ~/corso-cli/m2l4; Select-String zzz check.txt; $? > cod.txt' } },
    hints: ['Il comando che fallisce e la lettura dell\'esito devono stare sulla stessa riga (separati da ;), altrimenti $? riflette un altro comando.', 'Il percorso inesistente può essere /nonexistent.'],
    solutions: {
      bash: ['export STAGE=testing', 'cd ~/corso-cli/m2l4', 'ls /nonexistent; echo $? > esito.txt'],
      pwsh: ['$env:STAGE = "testing"', 'cd ~/corso-cli/m2l4', 'Get-ChildItem /nonexistent; $? > esito.txt'],
    },
    summary: ['export / $env:', '$? = esito dell\'ultimo comando', '0 = successo in Bash', 'PowerShell: True/False e $LASTEXITCODE'],
    skills: ['comandi', 'output', 'testing'],
    concepts: ['variabili d\'ambiente', 'codici di uscita ($?)', 'differenza Bash/PowerShell sugli esiti'],
  },
  {
    id: 'M2.L7',
    module: 2,
    n: 7,
    title: 'Test positivi e negativi: atteso ed effettivo',
    objective: 'Provare un programma con input validi e non validi e documentare risultato atteso ed effettivo in una tabella.',
    explain: [
      'Testare significa confrontare ciò che ti aspetti con ciò che succede. Un test positivo usa input validi; un test negativo usa input non validi e verifica che il programma fallisca nel modo giusto (messaggio chiaro, codice di uscita ≠ 0).',
      'Annota PRIMA il risultato atteso, poi esegui, poi riporta l\'effettivo: se coincidono il test passa, altrimenti hai trovato un\'informazione utile.',
      'Lo script `dividi` calcola 100 / N. In Bash è un file non eseguibile: per lanciarlo serve il permesso (`chmod +x`) oppure `bash dividi.sh`.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('dividi.sh', DIVIDI_SH, 0o644);
      c.file('dividi.ps1', DIVIDI_PS1, 0o644);
    },
    guided: [
      { title: 'Leggere cosa fa lo script', cmd: { bash: 'cat ~/corso-cli/m2l7/dividi.sh', pwsh: 'cat ~/corso-cli/m2l7/dividi.ps1' }, what: 'Mostra il codice.', who: 'cat.', parts: ['leggi i controlli: argomenti, numero, zero'], expect: 'Il sorgente dello script.', risk: 'Nessuno.' },
      { title: 'Prima esecuzione', cmd: { bash: 'cd ~/corso-cli/m2l7 && bash dividi.sh 5', pwsh: 'cd ~/corso-cli/m2l7; ./dividi.ps1 5' }, what: 'Esegue lo script con un input valido.', who: 'bash esegue il file; in PowerShell lo script si lancia con ./', parts: ['5: argomento'], expect: '20', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Cosa stampa e con che codice esce lo script con input `abc`?',
        cmd: { bash: 'cd ~/corso-cli/m2l7; bash dividi.sh abc; echo $?', pwsh: 'cd ~/corso-cli/m2l7; ./dividi.ps1 abc; $LASTEXITCODE' },
        expect: "Messaggio \"errore: 'abc' non e' un numero intero positivo\" e codice 1.",
        why: 'Il programma valida l\'input e segnala l\'errore con un codice ≠ 0.',
      },
    ],
    negative: {
      prompt: 'Lancia lo script in Bash senza permesso di esecuzione: ./dividi.sh 5',
      cmd: { bash: 'cd ~/corso-cli/m2l7; ./dividi.sh 5', pwsh: 'cd ~/corso-cli/m2l7; dividi.ps1 5' },
      explain: 'Bash: "Permission denied" (codice 126): il file non ha il bit x; si risolve con chmod +x oppure con bash dividi.sh. PowerShell: scrivendo solo il nome non carica script dalla cartella corrente: serve ./',
    },
    task: {
      text: 'Esegui lo script con almeno 2 input VALIDI e 2 input NON validi (nomi diversi dagli esempi guidati sono ammessi). Poi crea `piano-test.md` con una tabella Markdown con colonne Input | Atteso | Effettivo e almeno 4 righe.',
      criterion: 'Lo storico mostra ≥2 esecuzioni riuscite (codice 0) e ≥2 fallite (codice ≠ 0) con argomenti diversi; piano-test.md contiene la tabella.',
    },
    checks: [
      {
        id: 'validi',
        description: 'Almeno 2 esecuzioni valide con argomenti diversi',
        expected: '2 input diversi con codice 0',
        test: (c) => {
          const args = new Set(c.cmds.filter((x) => x.exit === 0 && /dividi\.(sh|ps1)\s+\S+/.test(x.cmd) && !/;/.test(x.cmd.split('dividi')[1] ?? '')).map((x) => x.cmd.split(/dividi\.(?:sh|ps1)\s+/)[1]?.split(/[\s;]/)[0]));
          args.delete(undefined as unknown as string);
          return { pass: args.size >= 2, actual: `${args.size} input validi diversi` };
        },
        onFail: 'Prova numeri interi positivi diversi, per esempio 4 e 10.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'non-validi',
        description: 'Almeno 2 esecuzioni NON valide con argomenti diversi',
        expected: '2 input diversi con codice ≠ 0',
        test: (c) => {
          const args = new Set(c.cmds.filter((x) => x.exit !== 0 && /dividi\.(sh|ps1)(\s+\S+)?/.test(x.cmd) && !/Permission denied|not recognized/.test(x.stderr)).map((x) => x.cmd.split(/dividi\.(?:sh|ps1)\s*/)[1]?.split(/[\s;]/)[0] ?? ''));
          return { pass: args.size >= 2, actual: `${args.size} input non validi diversi` };
        },
        onFail: 'Input non validi: testo, numero negativo, zero, nessun argomento.',
      },
      {
        id: 'tabella',
        description: 'piano-test.md contiene una tabella Input | Atteso | Effettivo con ≥4 righe',
        expected: 'tabella Markdown con 3 colonne e 4 righe',
        test: (c) => {
          const t = parseTables(c.read('piano-test.md') ?? '').find((x) => x.header.map((h) => h.toLowerCase()).join('|').includes('input') && x.header.some((h) => /atteso/i.test(h)) && x.header.some((h) => /effettiv/i.test(h)));
          return { pass: !!t && t.rows.length >= 4, actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Struttura: | Input | Atteso | Effettivo |, riga di separatori |---|---|---|, poi una riga per test.',
        kind: 'verifiable',
      },
    ],
    example: { text: 'Esempio analogo di tabella test per un\'altra funzione (somma).', cmd: { bash: "printf '| Input | Atteso | Effettivo |\\n|---|---|---|\\n| 2+2 | 4 | 4 |\\n' > piano-test.md" } },
    hints: ['Un test negativo atteso: codice ≠ 0 e un messaggio comprensibile. Prova abc, 0, -5, e nessun argomento.', 'Scrivi la tabella a mano con echo/printf o con un editor (scheda Documenti e file del laboratorio).'],
    solutions: {
      bash: ['cd ~/corso-cli/m2l7', 'bash dividi.sh 4', 'bash dividi.sh 10', 'bash dividi.sh abc', 'bash dividi.sh 0', "printf '| Input | Atteso | Effettivo |\\n|---|---|---|\\n| 4 | 25 | 25 |\\n| 10 | 10 | 10 |\\n| abc | errore, codice 1 | errore, codice 1 |\\n| 0 | errore, codice 2 | errore, codice 2 |\\n' > piano-test.md"],
      pwsh: ['cd ~/corso-cli/m2l7', './dividi.ps1 4', './dividi.ps1 10', './dividi.ps1 abc', './dividi.ps1 0', "Set-Content piano-test.md -Value '| Input | Atteso | Effettivo |','|---|---|---|','| 4 | 25 | 25 |','| 10 | 10 | 10 |','| abc | errore, codice 1 | errore, codice 1 |','| 0 | errore, codice 2 | errore, codice 2 |'"],
    },
    summary: ['test positivi e negativi', 'atteso scritto prima, effettivo dopo', 'codice di uscita ≠ 0 = errore', 'permesso di esecuzione (Bash)'],
    skills: ['testing', 'output', 'autonomia'],
    concepts: ['input validi e non validi', 'test negativi', 'risultato atteso ed effettivo', 'permesso di esecuzione e chmod'],
  },
];

void cmdMatches;
void stdoutHas;
