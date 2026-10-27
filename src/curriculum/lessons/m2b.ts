/** M2 — lezioni aggiunte il 2026-10-27: i due canali di uscita, i codici di uscita nelle pipeline, PATH e permessi di esecuzione. */
import type { Lesson } from '../types.ts';
import { ranCmd, pick } from './helpers.ts';

const DATI = 'ordine 101 consegnato\nordine 102 in corso\nordine 103 annullato\n';
const LOG_ERR = '2026-03-02T09:00:01Z INFO  avvio\n2026-03-02T09:00:09Z ERROR timeout verso il database\n2026-03-02T09:00:14Z ERROR token scaduto\n2026-03-02T09:00:25Z WARN  risposta lenta\n2026-03-02T09:00:33Z ERROR connessione interrotta\n2026-03-02T09:01:20Z INFO  fine\n';
const LOG_OK = '2026-03-02T10:00:01Z INFO  avvio\n2026-03-02T10:00:05Z INFO  tutto regolare\n2026-03-02T10:01:20Z INFO  fine\n';

const CANALI_LINES = [
  '# I due canali di uscita',
  '',
  '- Ogni comando ha due canali di uscita: stdout (canale 1, il risultato) e stderr (canale 2, gli errori). Sullo schermo si mescolano, ma sono separati.',
  '- > redirige solo stdout; 2> redirige solo stderr.',
  '- 2>&1 manda stderr nello stesso posto di stdout: comando > tutto.txt 2>&1 mette tutto in un file.',
  '- 2>/dev/null (PowerShell: 2>$null) scarta gli errori: utile solo quando sono davvero irrilevanti, altrimenti nasconde i problemi.',
];
const CANALI_MD = CANALI_LINES.join('\n') + '\n';

const CONTA_SH = `#!/bin/bash
# Stampa quante righe ERROR contiene il file indicato.
# Uscita: 0 se il file è leggibile (anche con 0 errori), 2 se il file non esiste.
if [ ! -f "$1" ]; then
  echo "file non trovato: $1" >&2
  exit 2
fi
n=$(grep -c ERROR "$1")
echo "$n"
exit 0
`;

const CONTA_PS1 = `param([string]$Path)
# Stampa quante righe ERROR contiene il file indicato.
# Uscita: 0 se il file è leggibile (anche con 0 errori), 2 se il file non esiste.
if (-not (Test-Path $Path)) { Write-Host "file non trovato: $Path"; exit 2 }
$n = @(Select-String -Pattern ERROR -Path $Path).Count
Write-Output $n
exit 0
`;

const PERCORSO_MD = `# Come la shell trova i comandi

- Scrivendo solo \`riepilogo\` la shell cerca il file nelle cartelle elencate in PATH. Se non c'è: "command not found" (PowerShell: "is not recognized").
- Scrivendo \`./riepilogo\` (con il percorso) la shell non cerca nel PATH. Se il file non ha il permesso di esecuzione: "Permission denied"; si risolve con chmod +x.
- Per eseguirlo per nome da qualsiasi cartella: copiarlo in una cartella (bin) e aggiungerla al PATH.
- Il PATH modificato con export vale solo per questa finestra: alla chiusura si perde. Per renderlo permanente si scrive nel file di avvio della shell.
`;

export const m2b: Lesson[] = [
  {
    id: 'M2.L2',
    module: 2,
    n: 2,
    title: 'Due canali: output ed errori',
    objective: 'Separare, unire e scartare i due canali di uscita di un comando (stdout e stderr) e prevedere dove finisce ogni messaggio.',
    explain: [
      'Ogni comando ha DUE canali di uscita: il risultato (stdout, canale 1) e gli errori (stderr, canale 2). A schermo si vedono insieme, ma `>` salva nel file solo il risultato.',
      '`2> file` salva solo gli errori; `> file 2>&1` salva tutto (`2>&1` = «manda il canale 2 dove va il canale 1»); `2>/dev/null` (PowerShell: `2>$null`) butta via gli errori; in PowerShell `*> file` redirige tutti i flussi. In Bash l\'ORDINE conta: `2>&1 > file` manda gli errori a schermo.',
      'In PowerShell più file si separano con la virgola: `Get-Content dati.txt, manca.txt`. Differenza dichiarata: in Windows PowerShell 5.1 `>` scrive in UTF-16, il laboratorio no.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => c.file('dati.txt', DATI),
    guided: [
      { title: 'Output ed errore insieme', cmd: { bash: 'cd ~/corso-cli/m2l2 && cat dati.txt manca.txt', pwsh: 'cd ~/corso-cli/m2l2; Get-Content dati.txt, manca.txt' }, what: 'Legge due file, di cui uno non esiste.', who: 'cat / Get-Content: il risultato esce su un canale, l\'errore sull\'altro.', parts: ['dati.txt esiste: il suo contenuto è stdout', 'manca.txt non esiste: il messaggio è stderr'], expect: 'Le tre righe di dati.txt e un messaggio di errore su manca.txt.', risk: 'Nessuno.', fails: true, contains: 'ordine 101' },
      { title: 'Solo gli errori su file', cmd: { bash: 'cd ~/corso-cli/m2l2 && cat dati.txt manca.txt 2> prova-err.txt; cat prova-err.txt', pwsh: 'cd ~/corso-cli/m2l2; Get-Content dati.txt, manca.txt 2> prova-err.txt; Get-Content prova-err.txt' }, what: 'Redirige solo il canale 2 in un file.', who: 'La shell: `2>` riguarda solo gli errori.', parts: ['2>: redirezione del canale degli errori'], expect: 'A schermo il contenuto di dati.txt; poi il file mostra il messaggio di errore.', risk: 'Basso: 2> sovrascrive prova-err.txt.', contains: { bash: 'manca.txt', pwsh: 'manca.txt' } },
      { title: 'Solo il risultato su file', cmd: { bash: 'cd ~/corso-cli/m2l2 && cat dati.txt manca.txt > prova-ok.txt; cat prova-ok.txt', pwsh: 'cd ~/corso-cli/m2l2; Get-Content dati.txt, manca.txt > prova-ok.txt; Get-Content prova-ok.txt' }, what: 'Redirige solo il canale 1: l\'errore resta a schermo.', who: 'La shell: `>` riguarda solo stdout.', parts: ['>: redirezione del risultato'], expect: 'L\'errore a schermo e le tre righe nel file.', risk: 'Basso.', contains: 'ordine 102' },
      { title: 'Tutto nello stesso file', cmd: { bash: 'cd ~/corso-cli/m2l2 && cat dati.txt manca.txt > prova-tutto.txt 2>&1; cat prova-tutto.txt', pwsh: 'cd ~/corso-cli/m2l2; Get-Content dati.txt, manca.txt *> prova-tutto.txt; Get-Content prova-tutto.txt' }, what: 'Unisce i due canali nel file.', who: 'Bash: `2>&1` dopo `>`; PowerShell: `*>` (tutti i flussi).', parts: ['2>&1: il canale 2 va dove va il canale 1'], expect: 'Nel file ci sono sia le righe dei dati sia il messaggio di errore.', risk: 'Basso.', contains: 'manca.txt' },
      { title: 'Scartare gli errori', cmd: { bash: 'cd ~/corso-cli/m2l2 && cat dati.txt manca.txt 2>/dev/null; echo "codice: $?"', pwsh: 'cd ~/corso-cli/m2l2; Get-Content dati.txt, manca.txt 2>$null; "errore presente: " + (-not $?)' }, what: 'Nasconde gli errori ma il comando fallisce lo stesso.', who: 'La shell scarta il canale 2; il codice di uscita non cambia.', parts: ['/dev/null: il «cestino» di sistema', '$?: esito del comando'], expect: 'Solo i dati; il codice resta diverso da 0.', risk: 'Scartare gli errori nasconde i problemi veri.', contains: 'ordine 103' },
    ],
    predict: [
      {
        prompt: 'Questo comando mette l\'errore nel file o lo mostra a schermo? Bash: `cat manca.txt 2>&1 > out.txt`',
        cmd: { bash: 'cd ~/corso-cli/m2l2; cat manca.txt 2>&1 > out.txt; echo "--- file:"; cat out.txt', pwsh: 'cd ~/corso-cli/m2l2; Get-Content manca.txt 2>&1 > out.txt; "--- file:"; Get-Content out.txt' },
        expect: 'Bash: l\'errore resta a schermo e out.txt è vuoto (2>&1 è letto prima di >: il canale 2 va dove va il canale 1 ORA, cioè lo schermo). PowerShell: nel file finisce anche l\'errore.',
        why: 'Le redirezioni si leggono da sinistra a destra: in Bash conta l\'ordine; per salvare tutto scrivi `> out.txt 2>&1`.',
      },
    ],
    negative: {
      prompt: 'Scartare gli errori nasconde anche i problemi veri: cosa vedi se il file non esiste?',
      cmd: { bash: 'cd ~/corso-cli/m2l2; cat manca.txt 2>/dev/null; echo "codice: $?"', pwsh: 'cd ~/corso-cli/m2l2; Get-Content manca.txt 2>$null; "riuscito: $?"' },
      explain: 'Nessun messaggio, ma il codice di uscita è diverso da 0 (Bash) / $? è False (PowerShell): il comando è fallito in silenzio. Scarta gli errori solo quando sai che sono irrilevanti.',
    },
    task: {
      text: 'In ~/corso-cli/m2l2 esegui il comando che legge dati.txt e manca.txt (Bash: `cat dati.txt manca.txt`; PowerShell: `Get-Content dati.txt, manca.txt`) quattro volte: (1) solo il risultato in `ok.txt`; (2) solo gli errori in `errori.txt`; (3) tutto insieme in `tutto.txt`; (4) senza errori a schermo. Poi crea dal terminale, nella stessa cartella, il file canali.md (non con l\'editor dei documenti): cosa sono stdout e stderr, cosa fanno `2>` e `2>&1`.',
      criterion: 'ok.txt ha solo le righe dei dati; errori.txt solo il messaggio di errore; tutto.txt entrambi; hai usato 2>/dev/null (PowerShell: 2>$null); canali.md cita stdout, stderr e 2>&1.',
    },
    checks: [
      {
        id: 'ok',
        description: 'ok.txt contiene solo il risultato (3 righe di dati, nessun errore)',
        expected: 'ordine 101, 102, 103 e nessun messaggio di errore',
        test: (c) => {
          const t = c.read('ok.txt') ?? '';
          return { pass: t.includes('ordine 103') && !/manca/.test(t), actual: t ? (/manca/.test(t) ? 'contiene anche l\'errore' : 'dati mancanti') : 'file mancante o vuoto' };
        },
        onFail: '> redirige solo il risultato: l\'errore compare a schermo e non nel file.',
      },
      {
        id: 'errori',
        description: 'errori.txt contiene solo il messaggio di errore',
        expected: 'messaggio su manca.txt, nessuna riga di dati',
        test: (c) => {
          const t = c.read('errori.txt') ?? '';
          return { pass: /manca\.txt/.test(t) && !t.includes('ordine 101'), actual: t ? (t.includes('ordine') ? 'contiene anche i dati' : 'senza messaggio su manca.txt') : 'file mancante o vuoto' };
        },
        onFail: '2> redirige solo il canale degli errori.',
      },
      {
        id: 'tutto',
        description: 'tutto.txt contiene dati ed errore',
        expected: 'righe dei dati e messaggio su manca.txt',
        test: (c) => {
          const t = c.read('tutto.txt') ?? '';
          return { pass: t.includes('ordine 102') && /manca\.txt/.test(t), actual: t ? (t.includes('ordine 102') ? 'manca l\'errore' : 'mancano i dati') : 'file mancante o vuoto' };
        },
        onFail: 'Bash: `comando > tutto.txt 2>&1` (l\'ordine conta). PowerShell: `comando *> tutto.txt`.',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'silenzio',
        description: 'Hai eseguito il comando scartando gli errori',
        expected: '2>/dev/null (Bash) o 2>$null (PowerShell)',
        test: (c) => {
          const ok = ranCmd(c, pick(c, /2>\s*\/dev\/null/, /2>\s*\$null/), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun comando con errori scartati' };
        },
        onFail: 'Aggiungi `2>/dev/null` (PowerShell `2>$null`) in fondo al comando.',
      },
      {
        id: 'documento',
        description: 'canali.md: stdout, stderr, 2> e 2>&1',
        expected: 'stdout, stderr, 2>&1',
        test: (c) => {
          const md = c.read('canali.md') ?? '';
          const ok = { stdout: /stdout|output standard|canale 1/i.test(md), stderr: /stderr|errori standard|canale 2/i.test(md), redir: /2>&1/.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Spiega con parole tue cosa sono stdout e stderr e cosa significa 2>&1.',
      },
    ],
    example: { text: 'Esempio analogo: salvare solo gli errori di un altro comando.', cmd: { bash: 'ls /nessuna-cartella 2> errori-ls.txt', pwsh: 'Get-ChildItem /nessuna-cartella 2> errori-ls.txt' } },
    hints: ['`>` salva il risultato, `2>` salva gli errori: sono due redirezioni diverse.', 'Per salvare tutto insieme in Bash l\'ordine è `> file 2>&1`.', 'Per «senza errori a schermo» usa `2>/dev/null` (PowerShell `2>$null`).'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m2l2',
        'cat dati.txt manca.txt > ok.txt',
        'cat dati.txt manca.txt 2> errori.txt',
        'cat dati.txt manca.txt > tutto.txt 2>&1',
        'cat dati.txt manca.txt 2>/dev/null',
        `printf '%s\\n' ${CANALI_LINES.map((l) => "'" + l + "'").join(' ')} > canali.md`,
      ],
      pwsh: [
        'cd ~/corso-cli/m2l2',
        'Get-Content dati.txt, manca.txt > ok.txt',
        'Get-Content dati.txt, manca.txt 2> errori.txt',
        'Get-Content dati.txt, manca.txt *> tutto.txt',
        'Get-Content dati.txt, manca.txt 2>$null',
        `Set-Content canali.md -Value @'\n${CANALI_MD}'@`,
      ],
    },
    summary: ['stdout e stderr sono canali separati', '> risultato, 2> errori, 2>&1 unisce', 'in Bash l\'ordine delle redirezioni conta', 'scartare gli errori nasconde i problemi'],
    skills: ['comandi', 'output', 'testing'],
    concepts: ['stdout e stderr', 'redirezione 2> e 2>&1', 'ordine delle redirezioni', '/dev/null'],
  },
  {
    id: 'M2.L5',
    module: 2,
    n: 5,
    title: 'Codici di uscita nelle pipeline e negli script',
    objective: 'Prevedere il codice di uscita di una pipeline, sapere che «nessuna corrispondenza» non è sempre un errore e scrivere uno script con codici di uscita corretti.',
    explain: [
      'Ogni comando termina con un codice: 0 = riuscito, diverso da 0 = problema. In Bash si legge con `$?`. In una pipeline conta l\'ULTIMO comando: `false | true` termina con 0. Con `set -o pipefail` la pipeline fallisce se fallisce uno qualsiasi degli stadi; `${PIPESTATUS[*]}` (da leggere nello stesso comando di `$?`) li elenca tutti.',
      '`grep` esce con 1 quando NON trova nulla: non è un errore, è «zero corrispondenze» (anche `grep -c`, che stampa 0). Per dire «tutto regolare» si chiude lo script con `exit 0`.',
      'In PowerShell `$?` dice se l\'ultimo comando è riuscito (True/False) e `$LASTEXITCODE` è il codice dell\'ultimo programma esterno (curl.exe, oppure `powershell -Command "exit 3"`, che avvia un PowerShell figlio). `Select-String` senza risultati NON è un errore. Negli script `exit 2` imposta il codice di uscita.',
      'Script su più righe dal terminale: in Bash (heredoc) `cat > conta.sh <<\'EOF\'`, le righe e `EOF` da solo (gli apici impediscono alla shell di interpretare `$`); in PowerShell `Set-Content conta.ps1 -Value @\'` seguito dalle righe e da `\'@`.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('log.txt', LOG_ERR);
      c.file('pulito.txt', LOG_OK);
    },
    guided: [
      { title: 'Cercare senza trovare', cmd: { bash: 'cd ~/corso-cli/m2l5 && grep NESSUNO log.txt; echo "codice: $?"', pwsh: 'cd ~/corso-cli/m2l5; Select-String NESSUNO log.txt; "riuscito: $?"' }, what: 'Cerca un testo che non c\'è.', who: 'grep esce con 1; Select-String non segnala errori.', parts: ['$?: codice dell\'ultimo comando'], expect: 'Bash: codice 1. PowerShell: riuscito True.', risk: 'Nessuno.', contains: { bash: 'codice: 1', pwsh: 'riuscito: True' } },
      { title: 'Contare e uscire con 1', cmd: { bash: 'cd ~/corso-cli/m2l5 && grep -c ERROR pulito.txt; echo "codice: $?"', pwsh: 'cd ~/corso-cli/m2l5; @(Select-String ERROR pulito.txt).Count' }, what: 'Conta le righe ERROR di un file senza errori.', who: 'grep -c stampa 0 ed esce con 1.', parts: ['-c: stampa solo il numero di righe'], expect: 'Bash: 0 e poi codice 1. PowerShell: 0.', risk: 'Nessuno.', contains: { bash: 'codice: 1', pwsh: '0' } },
      { title: 'Una pipeline con un errore dentro', cmd: { bash: 'false | true; echo "codice: $? stadi: ${PIPESTATUS[*]}"', pwsh: 'powershell -Command "exit 3"; "LASTEXITCODE: $LASTEXITCODE"; "riuscito: $?"' }, what: 'Bash: pipeline il cui primo stadio fallisce. PowerShell: programma esterno che esce con 3.', who: 'Bash dà il codice dell\'ultimo stadio; PowerShell separa $LASTEXITCODE e $?.', parts: ['PIPESTATUS: codici di tutti gli stadi'], expect: 'Bash: codice 0 ma stadi 1 0. PowerShell: LASTEXITCODE 3 e riuscito False.', risk: 'Nessuno.', contains: { bash: 'codice: 0 stadi: 1 0', pwsh: 'LASTEXITCODE: 3' } },
      { title: 'pipefail', cmd: { bash: 'set -o pipefail; false | true; echo "codice: $?"', pwsh: 'Get-Content manca.txt; "riuscito: $?"' }, what: 'Bash: stessa pipeline con pipefail. PowerShell: un cmdlet fallito.', who: 'Con pipefail il fallimento di uno stadio emerge nel codice finale.', parts: ['set -o pipefail: la pipeline fallisce se fallisce uno stadio'], expect: 'Bash: codice 1. PowerShell: messaggio di errore e riuscito False.', risk: 'pipefail resta attivo finché non chiudi la finestra.', contains: { bash: 'codice: 1', pwsh: 'riuscito: False' } },
    ],
    predict: [
      {
        prompt: 'Cosa stampa `echo $?` dopo `grep -c ERROR pulito.txt` (il file non contiene ERROR)? Bash.',
        cmd: { bash: 'cd ~/corso-cli/m2l5; grep -c ERROR pulito.txt; echo $?', pwsh: 'cd ~/corso-cli/m2l5; @(Select-String ERROR pulito.txt).Count; $?' },
        expect: 'Bash: 0 (il conteggio) e 1 (il codice). PowerShell: 0 e True.',
        why: 'Il conteggio è zero e il codice è 1: sono due informazioni diverse. In PowerShell non esiste questo caso.',
      },
    ],
    negative: {
      prompt: 'Uno script che termina con grep -c: il chiamante lo vede riuscito o fallito se non ci sono errori?',
      cmd: { bash: 'cd ~/corso-cli/m2l5; printf \'#!/bin/bash\\ngrep -c ERROR "$1"\\n\' > prova.sh; bash prova.sh pulito.txt; echo "codice: $?"', pwsh: 'cd ~/corso-cli/m2l5; Set-Content prova.ps1 -Value \'param($p); @(Select-String ERROR $p).Count\'; ./prova.ps1 pulito.txt; "riuscito: $?"' },
      explain: 'Bash: 0 con codice 1 → il chiamante crede a un fallimento. Serve un exit 0 esplicito. PowerShell: nessun problema, ma conviene comunque dichiarare il codice con exit.',
    },
    task: {
      text: 'In ~/corso-cli/m2l5 scrivi `conta.sh` (PowerShell: `conta.ps1`): riceve un file come argomento, stampa quante righe ERROR contiene ed esce con 0 se il file è leggibile (anche con 0 errori) e con 2 se il file non esiste. Poi crea codici.md con tre righe `Q1: …`, `Q2: …`, `Q3: …` con i codici che hai osservato (Bash: Q1 `grep NESSUNO log.txt`, Q2 `false | true`, Q3 lo stesso con pipefail. PowerShell: Q1 `Select-String NESSUNO log.txt` ($?), Q2 `powershell -Command "exit 3"` ($LASTEXITCODE), Q3 `Get-Content manca.txt` ($?)).',
      criterion: 'Lo script stampa 3 per log.txt (uscita 0), 0 per pulito.txt (uscita 0) ed esce con 2 per un file inesistente; codici.md contiene i tre valori corretti per la tua shell.',
    },
    checks: [
      {
        id: 'script-errori',
        description: 'conta con log.txt: stampa 3 ed esce con 0',
        expected: 'output 3, codice 0',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash conta.sh log.txt' : './conta.ps1 log.txt');
          return { pass: r.code === 0 && r.out.trim() === '3', actual: `codice ${r.code}, output «${r.out.trim()}»${r.err ? ', errore: ' + r.err.split('\n')[0] : ''}` };
        },
        onFail: 'Lo script deve stampare solo il numero e uscire con 0. Controlla di aver creato conta.sh (PowerShell: conta.ps1) nella cartella della lezione.',
      },
      {
        id: 'script-pulito',
        description: 'conta con pulito.txt: stampa 0 ed esce con 0',
        expected: 'output 0, codice 0 (nessun errore trovato non è un fallimento)',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash conta.sh pulito.txt' : './conta.ps1 pulito.txt');
          return { pass: r.code === 0 && r.out.trim() === '0', actual: `codice ${r.code}, output «${r.out.trim()}»` };
        },
        onFail: 'grep -c esce con 1 quando conta 0: chiudi lo script con exit 0 per dire che l\'esecuzione è riuscita.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'script-mancante',
        description: 'conta con un file inesistente: esce con 2',
        expected: 'codice 2 e un messaggio',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash conta.sh non-esiste.txt' : './conta.ps1 non-esiste.txt');
          return { pass: r.code === 2, actual: `codice ${r.code}` };
        },
        onFail: 'Controlla l\'esistenza del file prima di contare e termina con exit 2 se manca.',
      },
      {
        id: 'codici',
        description: 'codici.md: Q1, Q2, Q3 corretti',
        expected: pick({ shell: 'bash' } as never, 'Q1: 1, Q2: 0, Q3: 1', 'Q1: True, Q2: 3, Q3: False') as string,
        test: (c) => {
          const md = c.read('codici.md') ?? '';
          const want = c.shell === 'bash' ? ['1', '0', '1'] : ['true', '3', 'false'];
          const got = [1, 2, 3].map((n) => new RegExp(`Q${n}\\s*[:=]\\s*(\\S+)`, 'i').exec(md)?.[1]?.toLowerCase() ?? '?');
          return { pass: got.every((g, i) => g === want[i]), actual: `Q1: ${got[0]}, Q2: ${got[1]}, Q3: ${got[2]}` };
        },
        onFail: 'Esegui i tre comandi e leggi `$?` (Bash) oppure `$?`/`$LASTEXITCODE` (PowerShell) subito dopo ciascuno.',
        errorTag: 'previsioni-incoerenti',
      },
    ],
    example: { text: 'Esempio analogo: leggere il codice di uscita di un altro comando.', cmd: { bash: 'ls /nessuna-cartella; echo $?', pwsh: 'Get-ChildItem /nessuna-cartella; $?' } },
    hints: ['Un file che esiste si controlla con `[ -f "$1" ]` (PowerShell: `Test-Path`).', '`grep -c` esce con 1 se conta 0: serve un `exit 0` finale.', 'Per Q3 in Bash attiva `set -o pipefail` prima della pipeline.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m2l5',
        `cat > conta.sh <<'EOF'\n${CONTA_SH}EOF`,
        'bash conta.sh log.txt',
        'bash conta.sh pulito.txt',
        'bash conta.sh non-esiste.txt',
        'grep NESSUNO log.txt; echo $?',
        'false | true; echo $?',
        'set -o pipefail; false | true; echo $?',
        'printf "Q1: 1\\nQ2: 0\\nQ3: 1\\n" > codici.md',
      ],
      pwsh: [
        'cd ~/corso-cli/m2l5',
        `Set-Content conta.ps1 -Value @'\n${CONTA_PS1}'@`,
        './conta.ps1 log.txt',
        './conta.ps1 pulito.txt',
        './conta.ps1 non-esiste.txt',
        'Select-String NESSUNO log.txt; $?',
        'powershell -Command "exit 3"; $LASTEXITCODE',
        'Get-Content manca.txt; $?',
        'Set-Content codici.md -Value @("Q1: True", "Q2: 3", "Q3: False")',
      ],
    },
    summary: ['0 = riuscito; nelle pipeline conta l\'ultimo stadio', 'pipefail e PIPESTATUS', 'grep con 0 corrispondenze esce con 1', '$? e $LASTEXITCODE in PowerShell'],
    skills: ['comandi', 'output', 'testing'],
    concepts: ['codici di uscita nelle pipeline', 'pipefail', 'grep -c e codice 1', '$LASTEXITCODE'],
  },
  {
    id: 'M2.L6',
    module: 2,
    n: 6,
    title: 'PATH, permessi di esecuzione e «command not found»',
    objective: 'Capire come la shell trova i comandi, distinguere i tre errori più comuni e rendere eseguibile uno script richiamabile per nome.',
    explain: [
      'Scrivendo `riepilogo` la shell scorre le cartelle del PATH (`echo $PATH`; PowerShell: `$env:PATH`) e prende il primo file con quel nome. `which riepilogo` (o `type`, `command -v`; PowerShell: `Get-Command`) dice quale. Tre errori diversi: «command not found» (non è nel PATH), «Permission denied» (manca il permesso: `chmod +x file`), «No such file or directory» (percorso inesistente).',
      '`./riepilogo` salta la ricerca nel PATH. Per usarlo per nome si copia in una cartella (per esempio `bin`) e si aggiunge al PATH: `export PATH=$PATH:/percorso/bin`. Vale solo per la finestra aperta (il file di avvio della shell non è simulato).',
      'In PowerShell non c\'è chmod: gli script `.ps1` si eseguono con `./nome.ps1`, o per nome se la cartella è nel PATH. Differenza dichiarata: su Windows il separatore del PATH è `;`; nel laboratorio il filesystem è Linux e il separatore è `:`.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('riepilogo', '#!/bin/bash\necho "Riepilogo: tutto a posto"\n');
      c.file('riepilogo.ps1', 'Write-Output "Riepilogo: tutto a posto"\n');
    },
    guided: [
      { title: 'Dove cerca la shell', cmd: { bash: 'echo $PATH', pwsh: '$env:PATH' }, what: 'Mostra le cartelle in cui la shell cerca i comandi.', who: 'La shell le legge in ordine, da sinistra a destra.', parts: ['cartelle separate da :'], expect: '/usr/local/bin:/usr/bin:/bin (il PATH iniziale).', risk: 'Nessuno.', contains: '/usr/bin' },
      { title: 'Quale file verrebbe eseguito', cmd: { bash: 'which ls; type cd', pwsh: 'Get-Command ls | Select-Object -ExpandProperty Name' }, what: 'Chiede alla shell cosa significa un nome.', who: 'which: il file nel PATH; type: anche builtin e funzioni.', parts: [], expect: 'ls è un file in /usr/bin; cd è un comando interno della shell.', risk: 'Nessuno.', contains: { bash: '/usr/bin/ls', pwsh: 'ls' } },
      { title: 'Per nome: non si trova', cmd: { bash: 'cd ~/corso-cli/m2l6 && riepilogo', pwsh: 'cd ~/corso-cli/m2l6; riepilogo' }, what: 'Prova a eseguire il file della cartella corrente per nome.', who: 'La shell cerca solo nel PATH, non nella cartella corrente.', parts: [], expect: 'command not found (PowerShell: is not recognized).', risk: 'Nessuno.', fails: true, notFound: true },
      { title: 'Con il percorso: manca il permesso', cmd: { bash: 'cd ~/corso-cli/m2l6 && ./riepilogo', pwsh: 'cd ~/corso-cli/m2l6; ./riepilogo.ps1' }, what: 'Esegue il file indicando il percorso.', who: 'Bash controlla il permesso di esecuzione; PowerShell esegue lo script .ps1.', parts: ['./: cartella corrente'], expect: 'Bash: Permission denied. PowerShell: Riepilogo: tutto a posto.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: '', pwsh: 'tutto a posto' } },
      { title: 'Il permesso di esecuzione', cmd: { bash: 'cd ~/corso-cli/m2l6 && chmod +x riepilogo && ls -l riepilogo && ./riepilogo', pwsh: 'cd ~/corso-cli/m2l6; Get-ChildItem riepilogo.ps1' }, what: 'Bash: aggiunge il permesso x ed esegue. PowerShell: mostra il file.', who: 'chmod cambia i permessi del file.', parts: ['+x: aggiunge il permesso di esecuzione'], expect: 'Bash: -rwxr-xr-x ... e «Riepilogo: tutto a posto».', risk: 'Basso: chmod cambia solo questo file.', contains: { bash: 'tutto a posto', pwsh: 'riepilogo.ps1' } },
    ],
    predict: [
      {
        prompt: 'Dopo aver aggiunto una cartella al PATH con export, il nuovo PATH esiste ancora aprendo una nuova finestra?',
        cmd: { bash: 'export PATH=$PATH:/tmp/prova; echo $PATH', pwsh: '$env:PATH += ":/tmp/prova"; $env:PATH' },
        expect: 'No: la modifica vale solo per questa finestra; una nuova finestra riparte dal PATH di avvio.',
        why: 'Le variabili esportate vivono nel processo della shell: per averle sempre, vanno scritte nel file di avvio.',
      },
    ],
    negative: {
      prompt: 'Un percorso scritto male:',
      cmd: { bash: 'cd ~/corso-cli/m2l6; ./bin/riepilogo', pwsh: 'cd ~/corso-cli/m2l6; ./bin/riepilogo.ps1' },
      explain: '«No such file or directory»: il percorso non esiste (la cartella bin non c\'è ancora). È diverso da «command not found» e da «Permission denied»: il messaggio dice qual è il livello del problema.',
    },
    task: {
      text: 'In ~/corso-cli/m2l6: (1) osserva i tre errori (per nome, ./ senza permesso, percorso inesistente); (2) rendi eseguibile lo script (Bash: chmod +x); (3) crea la cartella `bin` qui dentro, copiaci lo script, aggiungi la cartella al PATH della sessione, vai in /tmp ed esegui lo script per NOME (senza ./). Scrivi percorso.md: i tre messaggi di errore e cosa significano, e cosa serve per renderlo permanente.',
      criterion: 'bin/ contiene lo script (eseguibile in Bash); il PATH della sessione contiene la cartella bin; hai eseguito lo script per nome con successo; percorso.md spiega i messaggi e la persistenza.',
    },
    checks: [
      {
        id: 'bin',
        description: 'bin/ contiene lo script (in Bash con permesso di esecuzione)',
        expected: pick({ shell: 'bash' } as never, 'bin/riepilogo eseguibile', 'bin/riepilogo.ps1') as string,
        test: (c) => {
          const f = c.shell === 'bash' ? 'bin/riepilogo' : 'bin/riepilogo.ps1';
          const abs = `${c.dir}/${f}`;
          const exists = c.vfs.isFile(abs);
          const exec = c.shell === 'bash' ? exists && c.vfs.canExec(abs) : exists;
          return { pass: exec, actual: !exists ? `${f} non trovato` : exec ? 'ok' : 'manca il permesso di esecuzione (chmod +x)' };
        },
        onFail: 'Crea bin, copia lo script (cp) e in Bash rendilo eseguibile con chmod +x.',
        errorTag: 'percorsi-maiuscole',
      },
      {
        id: 'path',
        description: 'Il PATH della sessione contiene la cartella bin',
        expected: '…/corso-cli/m2l6/bin nel PATH',
        test: (c) => {
          const p = c.state.shells[c.shell].env.PATH ?? '';
          return { pass: p.split(':').includes(`${c.dir}/bin`), actual: p.length > 80 ? '…' + p.slice(-60) : p };
        },
        onFail: 'Bash: `export PATH=$PATH:~/corso-cli/m2l6/bin`. PowerShell: `$env:PATH += ":/home/learner/corso-cli/m2l6/bin"`.',
      },
      {
        id: 'per-nome',
        description: 'Hai eseguito lo script per nome, senza ./',
        expected: 'comando «riepilogo» riuscito',
        test: (c) => {
          const ok = c.cmds.some((x) => x.exit === 0 && /^riepilogo(\.ps1)?\s*$/.test(x.cmd.trim()) && /tutto a posto/.test(x.stdout));
          return { pass: ok, actual: ok ? 'ok' : 'nessuna esecuzione per nome riuscita' };
        },
        onFail: 'Dopo aver aggiornato il PATH, scrivi solo `riepilogo` (da una cartella qualsiasi).',
      },
      {
        id: 'errori',
        description: 'Hai incontrato l\'errore «non trovato» (e in Bash anche «Permission denied»)',
        expected: 'command not found / is not recognized; Bash: anche Permission denied',
        test: (c) => {
          const nf = c.cmds.some((x) => /command not found|is not recognized/.test(x.stderr));
          const pd = c.cmds.some((x) => /Permission denied/.test(x.stderr));
          const ok = c.shell === 'bash' ? nf && pd : nf;
          return { pass: ok, actual: `non trovato:${nf}${c.shell === 'bash' ? ` permesso:${pd}` : ''}` };
        },
        onFail: 'Prova a eseguire lo script per nome (prima del PATH) e, in Bash, con ./ prima del chmod: devi vedere gli errori con i tuoi occhi.',
      },
      {
        id: 'documento',
        description: 'percorso.md: PATH, messaggi di errore e persistenza',
        expected: 'PATH, command not found / is not recognized, Permission denied o ./, sessione/permanente',
        test: (c) => {
          const md = c.read('percorso.md') ?? '';
          const ok = { path: /PATH/.test(md), nf: /command not found|is not recognized/i.test(md), perm: c.shell === 'bash' ? /permission denied/i.test(md) : /\.\//.test(md), persist: /finestra|sessione|permanent|avvio|riavvi/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Spiega i messaggi con parole tue e cosa succede al PATH quando chiudi la finestra.',
      },
    ],
    example: { text: 'Esempio analogo: scoprire dove si trova un comando.', cmd: { bash: 'which grep', pwsh: 'Get-Command Select-String | Select-Object -ExpandProperty Name' } },
    hints: ['Il PATH si legge da sinistra a destra: la shell non guarda la cartella corrente.', '`chmod +x file` dà il permesso di esecuzione; senza, ./file dà «Permission denied».', 'Usa `cp riepilogo bin/` dopo aver creato la cartella con `mkdir bin`.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m2l6',
        'riepilogo',
        './riepilogo',
        './bin/riepilogo',
        'chmod +x riepilogo',
        'mkdir bin',
        'cp riepilogo bin/',
        'export PATH=$PATH:$HOME/corso-cli/m2l6/bin',
        'cd /tmp',
        'riepilogo',
        'cd ~/corso-cli/m2l6',
        `cat > percorso.md <<'EOF'\n${PERCORSO_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m2l6',
        'riepilogo',
        './bin/riepilogo.ps1',
        'mkdir bin',
        'cp riepilogo.ps1 bin/',
        '$env:PATH += ":/home/learner/corso-cli/m2l6/bin"',
        'cd /tmp',
        'riepilogo',
        'cd ~/corso-cli/m2l6',
        `Set-Content percorso.md -Value @'\n${PERCORSO_MD}'@`,
      ],
    },
    summary: ['la shell cerca nel PATH, non nella cartella corrente', 'command not found ≠ Permission denied ≠ No such file', 'chmod +x e ./ ', 'export PATH vale per la finestra'],
    skills: ['comandi', 'output', 'diagnosi'],
    concepts: ['PATH', 'permesso di esecuzione', 'tre errori di avvio dei comandi', 'which e type'],
  },
];
