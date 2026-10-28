/** Ripassi a distanza (2026-10-27): riprendono strumenti usati una sola volta molte lezioni prima. Non spostano la «prossima lezione». */
import type { Lesson } from '../types.ts';
import { pick, ranCmd } from './helpers.ts';

const lines = (t: string | null): string[] => (t ?? '').split('\n').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);

export const ripassi: Lesson[] = [
  {
    id: 'M2.R',
    module: 2,
    n: 0,
    review: true,
    title: 'Esercizio extra: leggere una tabella CSV e scrivere un report',
    objective: 'Leggere un file CSV (una tabella scritta come testo), stampare righe formattate, sommare una colonna e salvare il risultato in un file.',
    explain: [
      'Un file CSV ha un valore per colonna, separati da virgola. In Bash `awk -F, \'{ ... }\'` legge le righe dividendole alla virgola: `$1` è la prima colonna, `$2` la seconda, `NR` il numero di riga. `printf` stampa con un formato (`%s` testo, `%d` numero, `\\n` a capo). `END { ... }` viene eseguito dopo l\'ultima riga: è il posto per i totali. Per CREARE un file con il risultato di un comando: `comando > nome.txt` (se esiste lo sovrascrive); per AGGIUNGERE una riga in fondo: `comando >> nome.txt`. In PowerShell `| Set-Content nome.txt` crea il file e `Add-Content nome.txt \'testo\'` aggiunge una riga.',
      'In PowerShell `Import-Csv` legge il file e dà un oggetto per riga con una proprietà per colonna (`$_.nome`); `Measure-Object punti -Sum` somma una colonna; `Add-Content` aggiunge una riga a un file.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('voti.csv', 'nome,punti\nAnna,7\nBruno,5\nCarla,9\n');
    },
    guided: [
      {
        title: 'Il file',
        cmd: { bash: 'cat ~/corso-cli/m2r/voti.csv', pwsh: 'Get-Content ~/corso-cli/m2r/voti.csv' },
        what: 'Mostra il file voti.csv: una riga di intestazione (nome,punti) e una riga per persona.',
        who: 'cat / Get-Content.',
        parts: ['nome,punti: i nomi delle due colonne', 'ogni riga: un nome e i punti ottenuti, separati da virgola'],
        expect: 'Intestazione e tre righe: Anna,7 / Bruno,5 / Carla,9.',
        risk: 'Nessuno: sola lettura.',
        contains: 'Bruno,5',
      },
      {
        title: 'Una colonna',
        cmd: { bash: "awk -F, 'NR>1 {print $1}' ~/corso-cli/m2r/voti.csv", pwsh: 'Import-Csv ~/corso-cli/m2r/voti.csv | ForEach-Object { $_.nome }' },
        what: 'Stampa la prima colonna senza l\'intestazione.',
        who: 'awk (Bash) / Import-Csv e ForEach-Object (PowerShell).',
        parts: ['-F,: separatore virgola', 'NR>1: salta la riga 1', '$1: prima colonna'],
        expect: 'Anna, Bruno, Carla',
        risk: 'Nessuno: sola lettura.',
        contains: 'Carla',
      },
      {
        title: 'Stampa formattata',
        cmd: { bash: "printf '%s: %d\\n' Anna 7", pwsh: '"{0}: {1}" -f \'Anna\', 7' },
        what: 'Compone una riga «nome: punti» con un formato.',
        who: 'printf (Bash) / operatore -f (PowerShell).',
        parts: ['%s: un testo', '%d: un numero intero', '\\n: a capo (in PowerShell {0} e {1} sono i segnaposto)'],
        expect: 'Anna: 7',
        risk: 'Nessuno.',
        contains: 'Anna: 7',
      },
      {
        title: 'Un totale',
        cmd: { bash: "awk -F, 'NR>1 {s+=$2} END {print \"totale\", s}' ~/corso-cli/m2r/voti.csv", pwsh: '"totale $((Import-Csv ~/corso-cli/m2r/voti.csv | Measure-Object punti -Sum).Sum)"' },
        what: 'Somma la colonna dei punti.',
        who: 'awk con END / Measure-Object.',
        parts: ['s+=$2: accumula la seconda colonna', 'END: eseguito dopo l\'ultima riga'],
        expect: 'totale 21',
        risk: 'Nessuno: sola lettura.',
        contains: 'totale 21',
      },
      {
        title: 'Salvare il risultato in un file',
        cmd: { bash: "cd ~/corso-cli/m2r && awk -F, 'NR>1 {print $1}' voti.csv > nomi.txt && echo Fine >> nomi.txt && cat nomi.txt", pwsh: "cd ~/corso-cli/m2r; Import-Csv voti.csv | ForEach-Object { $_.nome } | Set-Content nomi.txt; Add-Content nomi.txt 'Fine'; Get-Content nomi.txt" },
        what: 'Crea il file nomi.txt con il risultato del comando, poi ci aggiunge una riga in fondo e lo mostra.',
        who: 'La shell (`>` e `>>`) in Bash; Set-Content e Add-Content in PowerShell.',
        parts: ['`> file`: crea il file (se esiste lo SOVRASCRIVE) con l\'output del comando', '`>> file`: aggiunge in fondo senza cancellare', 'PowerShell: `| Set-Content file` crea o sovrascrive, `Add-Content file \'testo\'` aggiunge una riga'],
        expect: 'Anna, Bruno, Carla e poi Fine, ora salvati in nomi.txt.',
        risk: 'Il file nomi.txt viene creato (o sovrascritto): nella cartella di prova non è un problema.',
        contains: 'Fine',
      },
    ],
    predict: [
      {
        prompt: 'Guarda il file con il primo passo guidato (cat / Get-Content ~/corso-cli/m2r/voti.csv): la colonna «punti» contiene i punti di ciascuno. Quanto vale la loro somma?',
        cmd: { bash: "awk -F, 'NR>1 {s+=$2} END {print s}' ~/corso-cli/m2r/voti.csv", pwsh: '(Import-Csv ~/corso-cli/m2r/voti.csv | Measure-Object punti -Sum).Sum' },
        expect: '21 (7 + 5 + 9).',
        why: 'La somma si accumula riga per riga; END (o il risultato di Measure-Object) arriva dopo l\'ultima.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se NON salti l\'intestazione e sommi la colonna dei punti?',
      cmd: { bash: "awk -F, '{s+=$2} END {print s}' ~/corso-cli/m2r/voti.csv", pwsh: '(Get-Content ~/corso-cli/m2r/voti.csv | Measure-Object -Line).Lines' },
      explain: 'In awk il testo «punti» vale 0 nella somma, quindi il totale non cambia: l\'errore è silenzioso. Per questo si controlla sempre il risultato su un caso che conosci. In PowerShell il conteggio righe mostra 4 (comprese l\'intestazione).',
    },
    task: {
      text: 'In ~/corso-cli/m2r crea report.txt con una riga «nome: punti» per ogni persona (senza intestazione) e, come ultima riga, «totale N».',
      criterion: 'report.txt = Anna: 7, Bruno: 5, Carla: 9, totale 21; hai usato awk (Bash) oppure Import-Csv (PowerShell).',
    },
    checks: [
      {
        id: 'report',
        description: 'report.txt: tre righe «nome: punti» e «totale 21»',
        expected: 'Anna: 7 / Bruno: 5 / Carla: 9 / totale 21',
        test: (c) => {
          const l = lines(c.read('report.txt'));
          return { pass: l.join('|') === 'Anna: 7|Bruno: 5|Carla: 9|totale 21', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Una riga per persona nel formato «nome: punti», poi «totale 21». Controlla spazi e due punti.',
      },
      {
        id: 'strumento',
        description: 'Hai letto il CSV con lo strumento (awk / Import-Csv)',
        expected: pick({ shell: 'bash' } as never, 'awk -F,', 'Import-Csv') as string,
        test: (c) => {
          const ok = ranCmd(c, pick(c, /\bawk\b.*-F/, /\bImport-Csv\b/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun comando con lo strumento' };
        },
        onFail: 'Non scrivere il file a mano: ricavalo dal CSV con awk (PowerShell: Import-Csv).',
      },
    ],
    example: { text: 'Esempio analogo: stampare la seconda colonna di un altro file.', cmd: { bash: "awk -F, 'NR>1 {print $2}' ~/corso-cli/m2r/voti.csv", pwsh: 'Import-Csv ~/corso-cli/m2r/voti.csv | ForEach-Object { $_.punti }' } },
    hints: ['Salta l\'intestazione (NR>1) e stampa con printf "%s: %d\\n", $1, $2.', 'Il totale: accumula in una variabile e stampala in END (PowerShell: Measure-Object punti -Sum).'],
    solutions: {
      bash: ['cd ~/corso-cli/m2r', "awk -F, 'NR>1 {printf \"%s: %d\\n\", $1, $2}' voti.csv > report.txt", "awk -F, 'NR>1 {s+=$2} END {print \"totale\", s}' voti.csv >> report.txt"],
      pwsh: ['cd ~/corso-cli/m2r', 'Import-Csv voti.csv | ForEach-Object { "$($_.nome): $($_.punti)" } | Set-Content report.txt', '"totale $((Import-Csv voti.csv | Measure-Object punti -Sum).Sum)" | Add-Content report.txt'],
    },
    summary: ['awk -F, divide alla virgola', 'NR>1 salta l\'intestazione', 'END per i totali', 'Import-Csv e Measure-Object in PowerShell'],
    skills: ['comandi', 'output'],
    concepts: ['ripasso: awk e printf', 'ripasso: totale di una colonna'],
  },
  {
    id: 'M5.R',
    module: 5,
    n: 0,
    review: true,
    title: 'Ripasso: nome, porta chiusa e timeout',
    objective: 'Riprendere in 5 minuti i codici di curl per nome inesistente, porta chiusa e porta filtrata, e controllare il nome con nslookup.',
    explain: [
      'Tre sintomi, tre codici di curl: nome inesistente = 6, porta chiusa = 7 (risposta immediata), porta filtrata = 28 (silenzio fino al timeout). Imposta sempre il timeout con `-m 3`. Il codice si legge subito dopo il comando: `$?` in Bash, `$LASTEXITCODE` in PowerShell con `curl.exe`.',
      '`nslookup nome` (PowerShell: `Resolve-DnsName nome`) chiede al DNS se il nome esiste; per un nome sbagliato risponde NXDOMAIN («il nome non esiste»).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.state.activeEnv = 'development';
    },
    guided: [
      {
        title: 'Il nome esiste?',
        cmd: { bash: 'nslookup tests.api.taskflow.test', pwsh: 'Resolve-DnsName tests.api.taskflow.test' },
        what: 'Chiede al DNS di risolvere un nome sbagliato.',
        who: 'nslookup / Resolve-DnsName.',
        parts: ['tests.api.taskflow.test: il nome da verificare'],
        expect: 'NXDOMAIN / DNS name does not exist: il nome non esiste.',
        risk: 'Nessuno.',
        fails: true,
      },
      {
        title: 'La porta chiusa',
        cmd: { bash: 'curl -sS -m 3 http://localhost:8081/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8081/v1/health; "codice $LASTEXITCODE"' },
        what: 'Chiama una porta su cui non ascolta nessuno.',
        who: 'curl con timeout di 3 secondi.',
        parts: ['-m 3: massimo 3 secondi', '-sS: niente avanzamento, errori visibili'],
        expect: 'Couldn\'t connect to server, codice 7, subito.',
        risk: 'Nessuno.',
        contains: 'codice 7',
      },
      {
        title: 'La porta filtrata',
        cmd: { bash: 'curl -sS -m 3 http://localhost:8089/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8089/v1/health; "codice $LASTEXITCODE"' },
        what: 'Chiama una porta protetta da un firewall che scarta i pacchetti.',
        who: 'curl con timeout.',
        parts: ['dopo 3 secondi curl rinuncia'],
        expect: 'Timeout was reached, codice 28.',
        risk: 'Nessuno.',
        contains: 'codice 28',
      },
    ],
    predict: [
      {
        prompt: 'Che codice dà curl su una porta chiusa, e dopo quanto?',
        cmd: { bash: 'curl -s -m 3 http://localhost:8081/v1/health; echo "codice $?"', pwsh: 'curl.exe -s -m 3 http://localhost:8081/v1/health; "codice $LASTEXITCODE"' },
        expect: '7, subito.',
        why: 'Nessun servizio ascolta: il sistema rifiuta la connessione senza attendere.',
      },
    ],
    negative: {
      prompt: 'Provoca il caso «nome inesistente» con curl e leggi il codice.',
      cmd: { bash: 'curl -sS -m 3 http://localhoost:8080/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhoost:8080/v1/health; "codice $LASTEXITCODE"' },
      explain: 'Could not resolve host, codice 6: la richiesta non è nemmeno partita verso un server.',
    },
    task: {
      text: 'In ~/corso-cli/m5r crea ripasso.txt con tre righe `nome N`, `chiusa N`, `filtrata N` (N = codice di curl con timeout di 3 secondi): nome = host localhoost sulla 8080; chiusa = porta 8081; filtrata = porta 8089. Controlla anche il nome sbagliato con nslookup (PowerShell: Resolve-DnsName).',
      criterion: 'ripasso.txt = nome 6, chiusa 7, filtrata 28; hai usato -m e il controllo del nome.',
    },
    checks: [
      {
        id: 'codici',
        description: 'ripasso.txt: nome 6, chiusa 7, filtrata 28',
        expected: 'nome 6 / chiusa 7 / filtrata 28',
        test: (c) => {
          const l = lines(c.read('ripasso.txt'));
          return { pass: l.join('|') === 'nome 6|chiusa 7|filtrata 28', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Leggi il codice subito dopo ogni curl ($? / $LASTEXITCODE) e aggiungilo con >>.',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'timeout',
        description: 'Hai usato il timeout di curl (-m)',
        expected: 'curl con -m',
        test: (c) => {
          const ok = ranCmd(c, /curl(\.exe)?\b.*(\s-\w*m\s+\d|--max-time)/, false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun curl con timeout' };
        },
        onFail: 'Senza -m una porta filtrata ti fa aspettare più di due minuti.',
      },
      {
        id: 'dns',
        description: 'Hai controllato il nome con nslookup / Resolve-DnsName',
        expected: pick({ shell: 'bash' } as never, 'nslookup', 'Resolve-DnsName') as string,
        test: (c) => {
          const ok = ranCmd(c, pick(c, /\bnslookup\b/, /\bResolve-DnsName\b/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun controllo del nome' };
        },
        onFail: 'Chiedi al DNS se localhoost esiste: nslookup localhoost (PowerShell: Resolve-DnsName localhoost).',
      },
    ],
    example: { text: 'Esempio analogo: codice di una porta chiusa diversa.', cmd: { bash: 'curl -s -m 3 http://localhost:9999/v1/health; echo "codice $?"', pwsh: 'curl.exe -s -m 3 http://localhost:9999/v1/health; "codice $LASTEXITCODE"' } },
    hints: ['6 = nome, 7 = porta chiusa, 28 = nessuna risposta in tempo.', 'Il codice va letto SUBITO dopo il curl: il comando successivo lo sovrascrive.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m5r',
        'nslookup localhoost',
        'curl -sS -m 3 http://localhoost:8080/v1/health; echo "nome $?" >> ripasso.txt',
        'curl -sS -m 3 http://localhost:8081/v1/health; echo "chiusa $?" >> ripasso.txt',
        'curl -sS -m 3 http://localhost:8089/v1/health; echo "filtrata $?" >> ripasso.txt',
      ],
      pwsh: [
        'cd ~/corso-cli/m5r',
        'Resolve-DnsName localhoost',
        'curl.exe -sS -m 3 http://localhoost:8080/v1/health; "nome $LASTEXITCODE" >> ripasso.txt',
        'curl.exe -sS -m 3 http://localhost:8081/v1/health; "chiusa $LASTEXITCODE" >> ripasso.txt',
        'curl.exe -sS -m 3 http://localhost:8089/v1/health; "filtrata $LASTEXITCODE" >> ripasso.txt',
      ],
    },
    summary: ['6 nome, 7 porta chiusa, 28 timeout', 'nslookup per il nome', 'sempre -m', 'il codice si legge subito'],
    skills: ['diagnosi', 'http'],
    concepts: ['ripasso: codici di curl', 'ripasso: nslookup'],
  },
];
