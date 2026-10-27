/** M5 — lezioni aggiunte il 2026-10-27: tre sintomi di rete, seguire una richiesta nei log con X-Request-Id, scenario autonomo sull'errore intermittente. */
import type { Lesson } from '../types.ts';
import type { ApiLogEntry } from '../../engine/types.ts';
import { parseTables } from '../../docs/lint.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

const AUTH = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const PS_AUTH = '-H "Authorization: Bearer $env:TASKFLOW_TOKEN"';

const SINTOMI_MD = `# Quattro sintomi di rete a confronto

| Sintomo | Codice curl | Significato | Dove guardare |
|---|---|---|---|
| Could not resolve host | 6 | il nome non esiste: errore di DNS o di battitura | come è scritto l'host, nslookup, /etc/hosts |
| Failed to connect (Couldn't connect to server) | 7 | la porta è chiusa: nessun servizio ascolta, risposta immediata | il servizio è avviato? sulla porta giusta? |
| Failed to connect ... Timeout was reached | 28 | la porta è filtrata: i pacchetti vengono scartati, nessuna risposta | firewall, regole di rete |
| Operation timed out ... with 0 bytes received | 28 | la connessione riesce ma il server risponde troppo tardi | il servizio è lento o bloccato |

Con nc -zv si distingue la porta chiusa (Connection refused, subito) dalla porta filtrata (timed out dopo l'attesa). Un timeout non è mai uno status HTTP: non è arrivata alcuna risposta.
`;

const TRACCE_NOTE = 'access.log ha una riga per ogni richiesta; app.log solo gli eventi applicativi (autenticazione, ricerche, validazione).';

const ANALISI_MD = `# Analisi dell'errore intermittente su /v1/flaky

## Cosa ho osservato

Su 12 chiamate consecutive 4 hanno risposto 500 (33%), le altre 200.

## Il pattern

Gli errori compaiono a intervalli regolari: una chiamata su tre (la terza, la sesta, la nona, la dodicesima).

## Causa probabile

Il log applicativo (app.log) riporta «upstream connection reset by peer»: la connessione verso un servizio a monte viene interrotta. Non dipende dal client, dalla rete locale o dal token.

## Policy di retry proposta

- Riprovare solo sugli errori 5xx, mai sui 4xx.
- Massimo 3 tentativi, con attesa crescente (backoff): 1 secondo, poi 2.
- Riprovare solo le operazioni idempotenti (GET, PUT, DELETE): un POST ripetuto potrebbe creare duplicati.
- Se dopo 3 tentativi l'errore persiste, segnalarlo invece di ripetere all'infinito.
`;

const entriesOf = (c: { apiShell: ApiLogEntry[] }, path: RegExp): ApiLogEntry[] => c.apiShell.filter((e) => path.test(e.path));

export const m5b: Lesson[] = [
  {
    id: 'M5.L3',
    module: 5,
    n: 3,
    title: 'Timeout, porta chiusa o nome sbagliato: tre sintomi di rete',
    objective: 'Distinguere dal messaggio e dal codice di uscita di curl un nome inesistente, una porta chiusa, una porta filtrata e un server lento.',
    explain: [
      'Prima di ricevere uno status HTTP, la richiesta deve superare tre ostacoli, e ognuno dà un sintomo diverso. NOME inesistente: `Could not resolve host`, codice 6. PORTA CHIUSA (nessun servizio ascolta): `Failed to connect … Couldn\'t connect to server`, codice 7, risposta IMMEDIATA. PORTA FILTRATA (un firewall scarta i pacchetti): nessuna risposta, la richiesta si blocca e poi scade: `Failed to connect … Timeout was reached`, codice 28.',
      'C\'è un quarto caso: la connessione riesce ma il server risponde troppo tardi. Con `-m 3` (massimo 3 secondi) curl esce con codice 28 e il messaggio `Operation timed out … with 0 bytes received`. Senza `-m` una porta filtrata fa aspettare più di due minuti: imposta SEMPRE un timeout quando diagnostichi.',
      '`nc -zv -w 2 localhost 8081` (Bash) e `Test-NetConnection localhost -Port 8081` (PowerShell) controllano solo la porta: «Connection refused» subito = chiusa; «timed out» = filtrata. In PowerShell `Invoke-RestMethod -TimeoutSec 3` dà lo stesso messaggio («The operation has timed out») sia per la connessione sia per la risposta lenta; `curl.exe` distingue i due casi. Il codice di uscita di curl.exe si legge con `$LASTEXITCODE`. Le opzioni di curl si possono unire: `-sS` = `-s` (niente barre di avanzamento) + `-S` (mostra comunque gli errori).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: false }),
    guided: [
      { title: 'Il nome sbagliato', cmd: { bash: 'curl -sS -m 3 http://localhoost:8080/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhoost:8080/v1/health; "codice $LASTEXITCODE"' }, what: 'Chiama un host scritto male (localhoost).', who: 'Il client non riesce a risolvere il nome.', parts: ['-S: mostra l\'errore', '-m 3: massimo 3 secondi'], expect: 'Could not resolve host e codice 6.', risk: 'Nessuno.', contains: 'codice 6' },
      { title: 'La porta chiusa', cmd: { bash: 'curl -sS -m 3 http://localhost:8081/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8081/v1/health; "codice $LASTEXITCODE"' }, what: 'Chiama una porta su cui non ascolta nessuno.', who: 'Il sistema rifiuta subito la connessione.', parts: [], expect: 'Failed to connect, subito, e codice 7.', risk: 'Nessuno.', contains: 'codice 7' },
      { title: 'La porta filtrata', cmd: { bash: 'curl -sS -m 3 http://localhost:8089/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8089/v1/health; "codice $LASTEXITCODE"' }, what: 'Chiama una porta protetta da un firewall che scarta i pacchetti.', who: 'Nessuno risponde: dopo 3 secondi curl rinuncia.', parts: ['Timeout was reached'], expect: 'Failed to connect … Timeout was reached e codice 28.', risk: 'Nessuno.', contains: 'Timeout was reached' },
      { title: 'Il server lento', cmd: { bash: 'curl -sS -m 3 http://localhost:8080/v1/slow; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8080/v1/slow; "codice $LASTEXITCODE"' }, what: 'Chiama un endpoint che risponde dopo 10 secondi.', who: 'La connessione riesce, ma la risposta non arriva in tempo.', parts: [], expect: 'Operation timed out … 0 bytes received e codice 28.', risk: 'Nessuno.', contains: '0 bytes received' },
      { title: 'Chiusa o filtrata?', cmd: { bash: 'nc -zv -w 2 localhost 8081; nc -zv -w 2 localhost 8089', pwsh: 'Test-NetConnection localhost -Port 8081; Test-NetConnection localhost -Port 8089' }, what: 'Controlla solo le due porte.', who: 'nc / Test-NetConnection.', parts: ['-z: solo test', '-w 2: attesa massima di 2 secondi'], expect: 'Bash: la prima «Connection refused» (subito), la seconda «timed out». PowerShell: TcpTestSucceeded False per entrambe.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: 'timed out', pwsh: 'False' } },
    ],
    predict: [
      {
        prompt: 'Una porta filtrata e una chiusa danno lo stesso codice di uscita di curl?',
        cmd: { bash: 'curl -s -m 3 http://localhost:8081/v1/health; echo "chiusa: $?"; curl -s -m 3 http://localhost:8089/v1/health; echo "filtrata: $?"', pwsh: 'curl.exe -s -m 3 http://localhost:8081/v1/health; "chiusa: $LASTEXITCODE"; curl.exe -s -m 3 http://localhost:8089/v1/health; "filtrata: $LASTEXITCODE"' },
        expect: 'No: la chiusa dà 7 (subito), la filtrata dà 28 (dopo il timeout).',
        why: 'Il codice dice dove guardare: 7 = nessun servizio in ascolto; 28 = qualcosa tra client e server scarta i pacchetti (o il server è lento).',
      },
    ],
    negative: {
      prompt: 'Un timeout è uno status HTTP?',
      cmd: { bash: 'curl -s -m 3 -o /dev/null -w "status: %{http_code}\\n" http://localhost:8089/v1/health', pwsh: 'curl.exe -s -m 3 -o NUL -w "status: %{http_code}" http://localhost:8089/v1/health' },
      explain: 'Stampa 000: non è arrivata nessuna risposta, quindi non esiste uno status. Un timeout non è un 408 né un 504: è l\'assenza di risposta.',
    },
    task: {
      text: 'In ~/corso-cli/m5l3 esegui con timeout di 3 secondi le quattro chiamate (nome localhoost; porta 8081; porta 8089; /v1/slow su 8080). Dopo ognuna aggiungi a codici.txt una riga `nome N`, `rifiutata N`, `filtrata N`, `lenta N` con il codice di uscita di curl (Bash `echo "nome $?" >> codici.txt`; PowerShell `"nome $LASTEXITCODE" >> codici.txt`, con curl.exe). Controlla le porte 8081 e 8089 con nc -zv (PowerShell: Test-NetConnection). Scrivi sintomi.md: tabella Sintomo | Codice | Significato | Dove guardare, con almeno 4 righe.',
      criterion: 'codici.txt = nome 6, rifiutata 7, filtrata 28, lenta 28; hai usato il timeout (-m) e un controllo di porta su 8081 e 8089; sintomi.md ha la tabella.',
    },
    checks: [
      {
        id: 'codici',
        description: 'codici.txt: nome 6, rifiutata 7, filtrata 28, lenta 28',
        expected: 'nome 6 / rifiutata 7 / filtrata 28 / lenta 28',
        test: (c) => {
          const l = (c.read('codici.txt') ?? '').split('\n').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
          return { pass: l.join('|') === 'nome 6|rifiutata 7|filtrata 28|lenta 28', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Leggi il codice subito dopo ogni curl ($? in Bash, $LASTEXITCODE in PowerShell) e aggiungilo con >>.',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'timeout',
        description: 'Hai usato il timeout di curl (-m)',
        expected: 'curl con -m / --max-time',
        test: (c) => {
          const ok = cmdMatches(c, /curl(\.exe)?\b.*(\s-\w*m\s+\d|--max-time)/, false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun curl con timeout' };
        },
        onFail: 'Senza -m una porta filtrata ti fa aspettare più di due minuti.',
      },
      {
        id: 'porte',
        description: 'Hai controllato le porte 8081 e 8089',
        expected: pick({ shell: 'bash' } as never, 'nc -zv su 8081 e 8089', 'Test-NetConnection su 8081 e 8089') as string,
        test: (c) => {
          const re = pick(c, /\bnc\b.*\s%PORT%\b/, /Test-NetConnection.*-Port\s+%PORT%\b/i);
          const a = cmdMatches(c, new RegExp(re.source.replace('%PORT%', '8081')), false);
          const b = cmdMatches(c, new RegExp(re.source.replace('%PORT%', '8089')), false);
          return { pass: a && b, actual: `8081:${a} 8089:${b}` };
        },
        onFail: 'Controlla entrambe le porte con nc -zv (PowerShell: Test-NetConnection -Port).',
      },
      {
        id: 'tabella',
        description: 'sintomi.md: tabella con almeno 4 righe e i codici 6, 7, 28',
        expected: 'tabella Sintomo | Codice | Significato | Dove guardare',
        test: (c) => {
          const md = c.read('sintomi.md') ?? '';
          const t = parseTables(md).find((x) => x.header.some((h) => /sintomo/i.test(h)) && x.header.some((h) => /codice/i.test(h)));
          const codes = ['6', '7', '28'].every((n) => new RegExp(`\\b${n}\\b`).test(md));
          return { pass: !!t && t.rows.length >= 4 && codes, actual: t ? `${t.rows.length} righe, codici:${codes}` : 'tabella non trovata' };
        },
        onFail: 'Colonne: Sintomo, Codice, Significato, Dove guardare. Una riga per sintomo.',
        kind: 'verifiable',
      },
      {
        id: 'distinzione',
        description: 'sintomi.md distingue porta chiusa e filtrata',
        expected: 'chiusa/rifiutata e filtrata/firewall',
        test: (c) => {
          const md = c.read('sintomi.md') ?? '';
          const ok = /chius|rifiut|refused/i.test(md) && /filtrat|firewall|scart/i.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'manca la distinzione' };
        },
        onFail: 'Spiega la differenza tra porta chiusa (risposta immediata) e filtrata (nessuna risposta, timeout).',
      },
    ],
    example: { text: 'Esempio analogo: leggere il codice di una chiamata a una porta chiusa diversa.', cmd: { bash: 'curl -s -m 3 http://localhost:9999/v1/health; echo "codice $?"', pwsh: 'curl.exe -s -m 3 http://localhost:9999/v1/health; "codice $LASTEXITCODE"' } },
    hints: ['6 = nome, 7 = porta chiusa, 28 = nessuna risposta in tempo (connessione filtrata o server lento).', 'Il codice si legge SUBITO dopo il curl: il comando successivo lo sovrascrive.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m5l3',
        'curl -sS -m 3 http://localhoost:8080/v1/health; echo "nome $?" >> codici.txt',
        'curl -sS -m 3 http://localhost:8081/v1/health; echo "rifiutata $?" >> codici.txt',
        'curl -sS -m 3 http://localhost:8089/v1/health; echo "filtrata $?" >> codici.txt',
        'curl -sS -m 3 http://localhost:8080/v1/slow; echo "lenta $?" >> codici.txt',
        'nc -zv -w 2 localhost 8081',
        'nc -zv -w 2 localhost 8089',
        `cat > sintomi.md <<'EOF'\n${SINTOMI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m5l3',
        'curl.exe -sS -m 3 http://localhoost:8080/v1/health; "nome $LASTEXITCODE" >> codici.txt',
        'curl.exe -sS -m 3 http://localhost:8081/v1/health; "rifiutata $LASTEXITCODE" >> codici.txt',
        'curl.exe -sS -m 3 http://localhost:8089/v1/health; "filtrata $LASTEXITCODE" >> codici.txt',
        'curl.exe -sS -m 3 http://localhost:8080/v1/slow; "lenta $LASTEXITCODE" >> codici.txt',
        'Test-NetConnection localhost -Port 8081',
        'Test-NetConnection localhost -Port 8089',
        `Set-Content sintomi.md -Value @'\n${SINTOMI_MD}'@`,
      ],
    },
    summary: ['6 nome, 7 porta chiusa, 28 timeout', 'chiusa = risposta immediata; filtrata = silenzio', 'un timeout non è uno status HTTP', 'impostare sempre un timeout'],
    skills: ['diagnosi', 'http', 'output'],
    concepts: ['porta chiusa e porta filtrata', 'timeout di connessione e di risposta', 'codici di uscita di curl', 'nc -w e Test-NetConnection'],
  },
  {
    id: 'M5.L7',
    module: 5,
    n: 7,
    title: 'Seguire una richiesta tra client e log del server (X-Request-Id)',
    objective: 'Usare l\'identificativo di richiesta per ritrovare nei log del server cosa è successo a una chiamata specifica.',
    explain: [
      'Ogni risposta del servizio contiene l\'header `X-Request-Id` (per esempio `req_000007`): lo stesso identificativo compare nei log del SERVER. È il filo che collega ciò che vede il client a ciò che ha fatto il server: senza, in un log con migliaia di righe si cerca a occhio.',
      TRACCE_NOTE + ' Per questo l\'identificativo si cerca in entrambi: `grep req_000007 /var/log/taskflow/development/*.log` (con `-h` grep non scrive il nome del file davanti a ogni riga; PowerShell: `Select-String -Pattern req_000007 -Path /var/log/taskflow/development/*.log`).',
      'Per leggere l\'header: Bash `curl -s -i URL | grep -i x-request-id`; PowerShell `curl.exe -s -i URL | Select-String -Pattern x-request-id`. Nella segnalazione di un problema, l\'identificativo è la prima cosa da allegare.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'L\'identificativo di una risposta', cmd: { bash: `curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks/999 | grep -i x-request-id`, pwsh: `curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks/999" | Select-String -Pattern x-request-id` }, what: 'Chiede un task che non esiste e mostra l\'header.', who: 'grep / Select-String filtrano le righe degli header.', parts: ['-i: include gli header', '-i di grep: ignora maiuscole'], expect: 'X-Request-Id: req_… (404 sul server).', risk: 'Nessuno.', contains: 'req_' },
      { title: 'Cercarlo nel log degli accessi', cmd: { bash: 'grep req_000001 /var/log/taskflow/development/access.log', pwsh: 'Select-String -Pattern req_000001 -Path /var/log/taskflow/development/access.log | ForEach-Object { $_.Line }' }, what: 'Trova la riga del server per quella richiesta.', who: 'La riga ha metodo, percorso, status e durata.', parts: [], expect: 'GET /v1/tasks/999 -> 404, con l\'utente (bob) e lo stesso identificativo.', risk: 'Nessuno.', contains: '404' },
      { title: 'E nel log applicativo', cmd: { bash: 'grep req_000001 /var/log/taskflow/development/app.log', pwsh: 'Select-String -Pattern req_000001 -Path /var/log/taskflow/development/app.log | ForEach-Object { $_.Line }' }, what: 'Il log applicativo spiega il motivo.', who: 'L\'applicazione ha annotato la ricerca andata a vuoto.', parts: [], expect: 'lookup: task 999 non trovato.', risk: 'Nessuno.', contains: 'non trovato' },
      { title: 'Una richiesta riuscita', cmd: { bash: `curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks | grep -i x-request-id`, pwsh: `curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks" | Select-String -Pattern x-request-id` }, what: 'Un\'altra richiesta, questa volta riuscita.', who: 'Il server assegna un nuovo identificativo.', parts: [], expect: 'X-Request-Id req_000002.', risk: 'Nessuno.', contains: 'req_000002' },
      { title: 'Riuscita: compare nell\'app.log?', cmd: { bash: 'grep req_000002 /var/log/taskflow/development/*.log', pwsh: 'Select-String -Pattern req_000002 -Path /var/log/taskflow/development/*.log | ForEach-Object { $_.Line }' }, what: 'Cerca la richiesta riuscita in tutti e due i file.', who: 'Solo access.log la contiene.', parts: [], expect: 'Una riga in access.log (200); nessuna in app.log: lì finiscono solo gli eventi degni di nota.', risk: 'Nessuno.', contains: '200' },
    ],
    predict: [
      {
        prompt: 'Una richiesta senza token: compare in access.log, in app.log o in entrambi?',
        cmd: { bash: 'curl -s -o /dev/null $TASKFLOW_URL/v1/tasks; grep -c req_000001 /var/log/taskflow/development/access.log /var/log/taskflow/development/app.log', pwsh: 'curl.exe -s -o NUL "$env:TASKFLOW_URL/v1/tasks"; Select-String -Pattern req_000001 -Path /var/log/taskflow/development/*.log | ForEach-Object { $_.Line }' },
        expect: 'In entrambi: access.log registra il 401, app.log aggiunge il motivo («header Authorization assente»).',
        why: 'Gli errori di autenticazione sono eventi applicativi: il motivo è nell\'app.log, lo status nell\'access.log.',
      },
    ],
    negative: {
      prompt: 'Un identificativo che non esiste:',
      cmd: { bash: 'grep req_999999 /var/log/taskflow/development/*.log; echo "codice $?"', pwsh: 'Select-String -Pattern req_999999 -Path /var/log/taskflow/development/*.log; "riuscito: $?"' },
      explain: 'Nessuna riga: grep esce con 1, Select-String no. «Nessun risultato» non è un errore del comando; significa solo che quella richiesta non è mai arrivata al server (o il log è un altro).',
    },
    task: {
      text: 'In ~/corso-cli/m5l7 fai tre richieste: una riuscita (GET /v1/tasks con token), una a un task inesistente (GET /v1/tasks/999) e una senza token (GET /v1/tasks). Per ognuna leggi X-Request-Id e cerca l\'identificativo nei log del server. Scrivi tracce.md: una tabella Richiesta | Request-Id | Status | Cosa dicono i log (access.log e app.log), con una riga per richiesta.',
      criterion: 'Il registro mostra un 200, un 404 e un 401; hai cercato gli identificativi nei log; tracce.md contiene gli identificativi reali delle tre richieste e nomina access.log e app.log.',
    },
    checks: [
      {
        id: 'richieste',
        description: 'Tre richieste: 200, 404 e 401',
        expected: 'status 200, 404, 401 su /v1/tasks',
        test: (c) => {
          const es = entriesOf(c, /^\/v1\/tasks/);
          const s = (n: number): boolean => es.some((e) => e.status === n);
          return { pass: s(200) && s(404) && s(401), actual: `200:${s(200)} 404:${s(404)} 401:${s(401)}` };
        },
        onFail: 'Servono una GET riuscita con token, una GET su /v1/tasks/999 e una GET senza token.',
      },
      {
        id: 'ricerca',
        description: 'Hai cercato gli identificativi nei log del server',
        expected: 'grep/Select-String sui file in /var/log/taskflow',
        test: (c) => {
          const ok = cmdMatches(c, pick(c, /grep\b.*\/var\/log\/taskflow/, /Select-String\b.*\/var\/log\/taskflow/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna ricerca di un identificativo' };
        },
        onFail: 'Cerca l\'identificativo con grep req_000001 /var/log/taskflow/development/*.log.',
      },
      {
        id: 'tracce',
        description: 'tracce.md: gli identificativi veri delle tre richieste',
        expected: 'tre Request-Id reali (200, 404, 401)',
        test: (c) => {
          const md = c.read('tracce.md') ?? '';
          const ids = new Set(md.match(/req_\d{6}/g) ?? []);
          const es = entriesOf(c, /^\/v1\/tasks/);
          const has = (n: number): boolean => es.some((e) => e.status === n && ids.has(e.requestId));
          return { pass: has(200) && has(404) && has(401), actual: `200:${has(200)} 404:${has(404)} 401:${has(401)} (id trovati: ${ids.size})` };
        },
        onFail: 'Riporta gli X-Request-Id che hai letto davvero, uno per richiesta (non inventati).',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'tabella',
        description: 'tracce.md: tabella con 3 righe e riferimento ai due log',
        expected: 'tabella Richiesta | Request-Id | Status | Log; access.log e app.log',
        test: (c) => {
          const md = c.read('tracce.md') ?? '';
          const t = parseTables(md).find((x) => x.header.some((h) => /request/i.test(h)) && x.header.some((h) => /status/i.test(h)));
          const ok = !!t && t.rows.length >= 3 && /access\.log/.test(md) && /app\.log/.test(md);
          return { pass: ok, actual: t ? `${t.rows.length} righe${/app\.log/.test(md) ? '' : ', manca app.log'}${/access\.log/.test(md) ? '' : ', manca access.log'}` : 'tabella non trovata' };
        },
        onFail: 'Una riga per richiesta e, nell\'ultima colonna, cosa dicono access.log e app.log.',
        kind: 'verifiable',
      },
    ],
    example: { text: 'Esempio analogo: l\'identificativo di una richiesta di salute.', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/health | grep -i x-request-id', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/health" | Select-String -Pattern x-request-id' } },
    hints: ['L\'identificativo è nell\'header di risposta: usa -i per vederlo.', '`grep req_00000N /var/log/taskflow/development/*.log` cerca in tutti e due i file.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m5l7',
        `a=$(curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        `b=$(curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks/999 | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        `c=$(curl -s -i $TASKFLOW_URL/v1/tasks | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        'echo "$a $b $c"',
        'grep -h -e $a -e $b -e $c /var/log/taskflow/development/access.log',
        'grep -h -e $a -e $b -e $c /var/log/taskflow/development/app.log',
        `printf '| Richiesta | Request-Id | Status | Cosa dicono i log |\\n|---|---|---|---|\\n| GET /v1/tasks con token | %s | 200 | solo access.log |\\n| GET /v1/tasks/999 | %s | 404 | access.log: 404; app.log: task non trovato |\\n| GET /v1/tasks senza token | %s | 401 | access.log: 401; app.log: header Authorization assente |\\n' $a $b $c > tracce.md`,
      ],
      pwsh: [
        'cd ~/corso-cli/m5l7',
        `$a = ((curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        `$b = ((curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks/999" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        `$c = ((curl.exe -s -i "$env:TASKFLOW_URL/v1/tasks" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        '"$a $b $c"',
        'Select-String -Pattern $a, $b, $c -Path /var/log/taskflow/development/access.log | ForEach-Object { $_.Line }',
        'Select-String -Pattern $a, $b, $c -Path /var/log/taskflow/development/app.log | ForEach-Object { $_.Line }',
        `Set-Content tracce.md -Value @("| Richiesta | Request-Id | Status | Cosa dicono i log |", "|---|---|---|---|", "| GET /v1/tasks con token | $a | 200 | solo access.log |", "| GET /v1/tasks/999 | $b | 404 | access.log: 404; app.log: task non trovato |", "| GET /v1/tasks senza token | $c | 401 | access.log: 401; app.log: header Authorization assente |")`,
      ],
    },
    summary: ['X-Request-Id collega risposta e log del server', 'access.log: tutte le richieste; app.log: gli eventi applicativi', 'allegare l\'identificativo a ogni segnalazione'],
    skills: ['diagnosi', 'http', 'docs'],
    concepts: ['X-Request-Id', 'correlazione tra client e log', 'access.log e app.log'],
  },
  {
    id: 'M5.L11',
    module: 5,
    n: 11,
    title: 'Scenario nuovo: l\'errore intermittente',
    objective: 'Misurare un errore che compare solo ogni tanto, trovarne il pattern nei log e proporre una politica di retry motivata.',
    explain: [
      'Un job notturno chiama il servizio e a volte fallisce: «a volte» non basta per decidere cosa fare. Prima si MISURA: si ripete la chiamata un numero sufficiente di volte, si contano successi e fallimenti e si cerca un pattern (casuale? periodico? legato al momento?). Poi si legge il log del server per capire la causa.',
      'Solo dopo si decide: riprovare ha senso per gli errori temporanei (5xx) e per le operazioni idempotenti; non ha senso per i 4xx (la richiesta è sbagliata e resterà sbagliata) né per operazioni che creano risorse (un POST ripetuto può creare duplicati).',
      'Usa ciò che sai da M2 (cicli, conteggi), M4 (codici di errore), M5 (log, retry). Non c\'è una soluzione guidata: consegna un\'analisi che un collega possa verificare.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => setupApi(c, { token: false }),
    guided: [
      { title: 'Una sola chiamata', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/flaky', pwsh: 'curl.exe -s -o NUL -w "%{http_code}" "$env:TASKFLOW_URL/v1/flaky"' }, what: 'Chiama l\'endpoint instabile una volta.', who: 'Il servizio risponde.', parts: [], expect: '200 (e una sola prova non dice nulla sul tasso di errore).', risk: 'Nessuno.', contains: '200' },
      { title: 'Ripetere e contare', cmd: { bash: 'for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/flaky; done | sort | uniq -c', pwsh: '1..6 | ForEach-Object { try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/flaky" | Out-Null; 200 } catch { 500 } } | Group-Object | ForEach-Object { "$($_.Name) $($_.Count)" }' }, what: 'Sei chiamate in un ciclo e conteggio degli esiti.', who: 'Il ciclo ripete; sort|uniq -c (Group-Object) conta.', parts: ['for/1..6: ripete', 'uniq -c: conta le righe uguali consecutive'], expect: 'Una parte di 200 e alcuni 500.', risk: 'Nessuno.', contains: '500' },
      { title: 'Cosa dice il server', cmd: { bash: 'grep ERROR /var/log/taskflow/development/app.log | tail -2', pwsh: 'Select-String -Pattern ERROR -Path /var/log/taskflow/development/app.log | Select-Object -Last 2 | ForEach-Object { $_.Line }' }, what: 'Legge gli ultimi errori del log applicativo.', who: 'Il server annota la causa di ogni 500.', parts: [], expect: 'flaky: upstream connection reset by peer (errore simulato).', risk: 'Nessuno.', contains: 'upstream' },
    ],
    predict: [],
    negative: {
      prompt: 'Un retry cieco su un errore 4xx:',
      cmd: { bash: 'for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code} " $TASKFLOW_URL/v1/tasks; done; echo', pwsh: '1..3 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code} " "$env:TASKFLOW_URL/v1/tasks" }' },
      explain: '401 tre volte su tre: riprovare non cambia nulla perché la richiesta è sbagliata (manca il token). Il retry serve solo per errori temporanei.',
    },
    task: {
      text: 'Il servizio /v1/flaky fallisce ogni tanto. In ~/corso-cli/m5l11: (1) esegui almeno 12 chiamate e salva gli esiti in risultati.txt; (2) conta successi e fallimenti; (3) leggi nel log applicativo cosa dice il server; (4) scrivi analisi.md con: cosa hai osservato (numeri), il pattern, la causa probabile (con la prova nel log), e una politica di retry (quali errori, quanti tentativi, quanta attesa, quando NON riprovare e perché).',
      criterion: 'Il registro mostra almeno 12 chiamate a /v1/flaky; analisi.md riporta i numeri osservati, il pattern, la causa dal log e una politica di retry con tentativi, attesa e limiti sull\'idempotenza.',
    },
    checks: [
      {
        id: 'misura',
        description: 'Almeno 12 chiamate a /v1/flaky',
        expected: '≥ 12 richieste',
        test: (c) => {
          const n = entriesOf(c, /^\/v1\/flaky/).length;
          return { pass: n >= 12, actual: `${n} chiamate` };
        },
        onFail: 'Un campione piccolo non mostra il pattern: ripeti la chiamata almeno 12 volte (un ciclo).',
      },
      {
        id: 'risultati',
        description: 'risultati.txt contiene gli esiti delle chiamate',
        expected: 'almeno 12 righe con status',
        test: (c) => {
          const l = (c.read('risultati.txt') ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
          return { pass: l.length >= 12 && l.every((x) => /^\d{3}$/.test(x)), actual: `${l.length} righe` };
        },
        onFail: 'Salva uno status per riga (curl -s -o /dev/null -w "%{http_code}\\n" in un ciclo, con > risultati.txt).',
      },
      {
        id: 'numeri',
        description: 'analisi.md: successi e fallimenti coerenti con risultati.txt',
        expected: 'il numero di chiamate e di errori che compaiono in risultati.txt',
        test: (c) => {
          const l = (c.read('risultati.txt') ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
          const f = l.filter((x) => x.startsWith('5')).length;
          const md = c.read('analisi.md') ?? '';
          const has = (n: number): boolean => new RegExp(`(^|\\D)${n}(\\D|$)`).test(md);
          return { pass: l.length > 0 && has(l.length) && has(f), actual: `risultati.txt: ${l.length} chiamate, ${f} errori: ${has(l.length) && has(f) ? 'riportati' : 'non trovati nel documento'}` };
        },
        onFail: 'Riporta nel documento il numero di chiamate e il numero di errori che risultano da risultati.txt.',
      },
      {
        id: 'pattern',
        description: 'analisi.md: il pattern (periodico)',
        expected: 'ogni terza chiamata / una su tre',
        test: (c) => {
          const md = c.read('analisi.md') ?? '';
          const ok = /ogni terz|una su tre|1 su 3|ogni 3|periodic|ciclic|regolar/i.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'pattern non descritto' };
        },
        onFail: 'Guarda la sequenza degli esiti: gli errori sono casuali o a intervalli regolari?',
      },
      {
        id: 'causa',
        description: 'Hai letto il log applicativo e analisi.md riporta la causa',
        expected: 'lettura di app.log e riferimento a upstream/reset',
        test: (c) => {
          const letto = cmdMatches(c, /app\.log|\/var\/log\/taskflow/, false);
          const md = c.read('analisi.md') ?? '';
          const ok = /upstream|reset|connessione/i.test(md);
          return { pass: letto && ok, actual: `log letto:${letto} causa nel documento:${ok}` };
        },
        onFail: 'Leggi /var/log/taskflow/development/app.log e riporta la riga che spiega gli errori.',
      },
      {
        id: 'retry',
        description: 'analisi.md: politica di retry (tentativi, attesa, idempotenza)',
        expected: 'tentativi massimi, attesa/backoff, solo 5xx, attenzione ai POST',
        test: (c) => {
          const md = c.read('analisi.md') ?? '';
          const ok = {
            retry: /retry|riprov/i.test(md),
            tentativi: /massimo|max|tentativi/i.test(md),
            attesa: /attesa|backoff|secondi|pausa|sleep/i.test(md),
            quando: /5xx|500/.test(md) && /4xx|non riprov/i.test(md),
            idempotenza: /idempot|POST|duplic/i.test(md),
          };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'La politica deve dire quali errori si riprovano, quante volte, con quale attesa e quando NON riprovare (4xx, POST).',
      },
    ],
    example: { text: 'Esempio analogo: contare gli esiti di un altro endpoint.', cmd: { bash: 'for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health; done | sort | uniq -c', pwsh: '1..3 | ForEach-Object { try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" | Out-Null; 200 } catch { 500 } } | Group-Object | ForEach-Object { "$($_.Name) $($_.Count)" }' } },
    hints: ['Un ciclo `for i in $(seq 1 12)` (PowerShell `1..12 | ForEach-Object`) ripete la chiamata.', 'Con `sort | uniq -c` (Group-Object) conti gli esiti uguali.', 'Il motivo degli errori è nel log applicativo, non nella risposta al client.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m5l11',
        'for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/flaky; done > risultati.txt',
        'sort risultati.txt | uniq -c',
        'grep ERROR /var/log/taskflow/development/app.log | head -3',
        `cat > analisi.md <<'EOF'\n${ANALISI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m5l11',
        '1..12 | ForEach-Object { try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/flaky" | Out-Null; 200 } catch { 500 } } > risultati.txt',
        'Get-Content risultati.txt | Group-Object | ForEach-Object { "$($_.Name) $($_.Count)" }',
        'Select-String -Pattern ERROR -Path /var/log/taskflow/development/app.log | Select-Object -First 3 | ForEach-Object { $_.Line }',
        `Set-Content analisi.md -Value @'\n${ANALISI_MD}'@`,
      ],
    },
    summary: ['si misura prima di decidere', 'un pattern regolare suggerisce una causa sistematica', 'retry solo su errori temporanei e operazioni idempotenti', 'il motivo sta nel log del server'],
    skills: ['diagnosi', 'autonomia', 'docs'],
    concepts: ['errore intermittente', 'misurare un tasso di errore', 'politica di retry', 'idempotenza'],
  },
];
