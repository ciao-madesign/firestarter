import type { Lesson } from '../types.ts';
import { apiHit, cmdMatches, pick, ranCmd, setupApi } from './helpers.ts';

const TRAFFIC: [string, string, number][] = [
  ...Array.from({ length: 8 }, () => ['GET', '/v1/tasks', 200] as [string, string, number]),
  ...Array.from({ length: 4 }, () => ['GET', '/v1/flaky', 500] as [string, string, number]),
  ...Array.from({ length: 6 }, () => ['GET', '/v1/flaky', 200] as [string, string, number]),
  ['POST', '/v1/tasks', 500],
  ['GET', '/v1/search', 429],
  ['GET', '/v1/search', 429],
  ['GET', '/v1/me', 401],
  ['GET', '/v1/me', 401],
];
const TRAFFIC_LOG =
  TRAFFIC.map(([m, p, s], i) => `2026-03-02T09:${String(Math.floor(i / 6)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}Z INFO  http: ${m} ${p} -> ${s} (${10 + i}ms) user=bob req=req_${String(i + 1).padStart(6, '0')}`).join('\n') + '\n';
const TOTAL_5XX = TRAFFIC.filter(([, , s]) => s >= 500).length;

const RETRY_SH = `#!/bin/bash
# Chiama /v1/flaky fino a 5 volte finché risponde 200.
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TASKFLOW_URL/v1/flaky")
  if [ "$code" = "200" ]; then
    echo "OK dopo $i tentativi"
    exit 0
  fi
  echo "tentativo $i: status $code, riprovo"
  sleep 1
done
echo "FALLITO dopo 5 tentativi" >&2
exit 1
`;

const RETRY_PS1 = `for ($i = 1; $i -le 5; $i++) {
  try {
    Invoke-RestMethod "$env:TASKFLOW_URL/v1/flaky" | Out-Null
    Write-Output "OK dopo $i tentativi"
    exit 0
  } catch {
    Write-Output "tentativo \${i}: errore, riprovo"
    Start-Sleep -Seconds 1
  }
}
Write-Output "FALLITO dopo 5 tentativi"
exit 1
`;

export const m5: Lesson[] = [
  {
    id: 'M5.L1',
    module: 5,
    n: 1,
    title: 'DNS e raggiungibilità: il nome non si risolve',
    objective: 'Riconoscere un errore di risoluzione del nome (DNS), trovarne la causa in una configurazione e correggerla.',
    explain: [
      "Prima di una richiesta HTTP il client deve trasformare il NOME dell'host in un indirizzo (DNS). Se il nome non esiste non parte nessuna richiesta HTTP: non c'è status code, c'è un errore del client (curl: codice 6).",
      "Il metodo diagnostico è sempre lo stesso: 1) osserva l'errore, 2) formula un'ipotesi, 3) cerca un'evidenza, 4) correggi, 5) verifica. Qui l'URL viene dalla variabile TASKFLOW_URL: guardala.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { url: 'http://localhst:8080' }),
    guided: [
      { title: 'Osservare il fallimento', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health; echo "exit=$?"', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" } catch { $_.Exception.Message }' }, what: 'Prova la richiesta con la configurazione attuale.', who: 'Il client.', parts: ['exit=6 (Bash): Could not resolve host'], expect: 'Nessuna risposta HTTP: errore di risoluzione del nome.', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Un errore di risoluzione del nome produce uno status HTTP? Quale codice di uscita ha curl?',
        cmd: { bash: 'curl -s http://nonesiste.test/; echo "exit=$?"', pwsh: 'try { irm http://nonesiste.test/ } catch { $_.Exception.Message }' },
        expect: 'Nessuno status (la richiesta non arriva a nessun server). curl esce con 6.',
        why: 'Lo status è prodotto dal server; qui non c\'è un server da interrogare.',
      },
    ],
    negative: {
      prompt: 'Differenza con un host che esiste ma una porta chiusa: cosa cambia?',
      cmd: { bash: 'curl -s http://localhost:9999/; echo "exit=$?"', pwsh: 'try { irm http://localhost:9999/ } catch { $_.Exception.Message }' },
      explain: 'Il nome si risolve (localhost) ma nessuno ascolta sulla porta: connessione rifiutata (curl 7). Codici diversi = cause diverse.',
    },
    task: {
      text: "Il comando `curl $TASKFLOW_URL/v1/health` non funziona. Trova la causa, correggi la configurazione di QUESTA shell e ripeti la richiesta con successo. Scrivi la causa in una riga in `~/corso-cli/m5l1/causa.txt` (nomina il valore errato).",
      criterion: 'GET /v1/health risponde 200; TASKFLOW_URL è http://localhost:8080; causa.txt cita il nome errato "localhst".',
    },
    checks: [
      {
        id: 'ok',
        description: 'GET /v1/health → 200',
        expected: '200',
        test: (c) => ({ pass: apiHit(c, 'GET', /^\/v1\/health/, 200), actual: c.apiShell.length ? 'richieste: ' + c.apiShell.map((e) => e.status).join(',') : 'nessuna richiesta è arrivata al server' }),
        onFail: "Finché l'host non si risolve nessuna richiesta arriva al server. Controlla il valore di TASKFLOW_URL.",
      },
      {
        id: 'env',
        description: 'TASKFLOW_URL corretto in questa shell',
        expected: 'http://localhost:8080',
        test: (c) => ({ pass: c.state.shells[c.shell].env.TASKFLOW_URL === 'http://localhost:8080', actual: c.state.shells[c.shell].env.TASKFLOW_URL ?? '(non impostata)' }),
        onFail: 'Correggi la variabile (export in Bash, $env: in PowerShell).',
      },
      {
        id: 'causa',
        description: 'causa.txt indica il nome errato',
        expected: 'cita "localhst"',
        test: (c) => ({ pass: /localhst/i.test(c.read('causa.txt') ?? ''), actual: (c.read('causa.txt') ?? '(mancante)').trim().slice(0, 80) }),
        onFail: 'Scrivi in una riga qual era il problema, citando il valore sbagliato che hai trovato (echo $TASKFLOW_URL).',
      },
    ],
    example: { text: 'Esempio analogo: mostrare il valore sospetto di una variabile prima di correggerla.', cmd: { bash: 'echo "URL=[$TASKFLOW_URL]"', pwsh: 'echo "URL=[$env:TASKFLOW_URL]"' } },
    hints: ['Stampa la variabile e leggi il nome dell\'host con attenzione, lettera per lettera.', 'La correzione vale per la shell corrente: export TASKFLOW_URL=... (Bash) o $env:TASKFLOW_URL = "..." (PowerShell).'],
    solutions: {
      bash: ['cd ~/corso-cli/m5l1', 'curl -s $TASKFLOW_URL/v1/health; echo "exit=$?"', 'echo $TASKFLOW_URL', 'export TASKFLOW_URL=http://localhost:8080', 'curl -s $TASKFLOW_URL/v1/health', 'echo "host scritto male: localhst invece di localhost" > causa.txt'],
      pwsh: ['cd ~/corso-cli/m5l1', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" } catch { $_.Exception.Message }', 'echo $env:TASKFLOW_URL', '$env:TASKFLOW_URL = "http://localhost:8080"', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"', 'Set-Content causa.txt "host scritto male: localhst invece di localhost"'],
    },
    summary: ['DNS risolve i nomi', 'nessuna risposta HTTP = problema prima del server', 'osserva, ipotizza, cerca evidenze, correggi, verifica'],
    skills: ['diagnosi', 'http', 'output'],
    concepts: ['DNS (introduttivo)', 'curl exit 6', 'metodo diagnostico', 'variabili di configurazione errate'],
  },
  {
    id: 'M5.L2',
    module: 5,
    n: 2,
    title: 'Connessione rifiutata, processi e configurazione',
    objective: 'Distinguere nome non risolto e porta chiusa, e verificare su quale porta ascolta il servizio.',
    explain: [
      "Connessione rifiutata (curl 7) = il nome si risolve ma su quella porta non ascolta nessun processo. Cause tipiche: porta sbagliata nella configurazione, servizio spento.",
      "Per verificare: elenca i processi (`ps aux`; in PowerShell `Get-Process`) e cerca il servizio; leggi il file di configurazione del servizio.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { url: 'http://localhost:8000' });
      c.vfs.systemWrite('/etc/taskflow/api.conf', '# Configurazione del servizio TaskFlow (simulato)\nhost = 0.0.0.0\nport = 8080\nenv = development\n');
    },
    guided: [
      { title: 'Osservare', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health; echo "exit=$?"', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" } catch { $_.Exception.Message }' }, what: 'Prova la richiesta.', who: 'Il client.', parts: ['exit=7: connessione rifiutata'], expect: 'Failed to connect to localhost port 8000.', risk: 'Nessuno.' },
      { title: 'Cercare il processo', cmd: { bash: 'ps aux | grep taskflow', pwsh: 'Get-Process taskflow-api' }, what: 'Mostra il processo del servizio.', who: 'ps / Get-Process.', parts: ['grep filtra le righe con "taskflow"'], expect: 'taskflow-api --port 8080 ...', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Il servizio è acceso ma TASKFLOW_URL punta alla porta 8000: errore di DNS o di connessione? Che codice ha curl?',
        cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health; echo "exit=$?"', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/health" } catch { $_.Exception.Message }' },
        expect: 'Connessione rifiutata: curl esce con 7 (il nome localhost si risolve, la porta no).',
        why: 'Il DNS è andato bene, manca il processo in ascolto su quella porta.',
      },
    ],
    negative: {
      prompt: 'Puoi terminare il processo del servizio? (Non devi: osserva il permesso.)',
      cmd: { bash: 'kill 412', pwsh: 'Get-Process taskflow-api | Select-Object Id' },
      explain: 'Bash: "Operation not permitted": il processo appartiene a un altro utente (taskflow). I permessi proteggono i servizi.',
    },
    task: {
      text: 'Scopri su quale porta ascolta il servizio (processo o configurazione), scrivi il numero in `~/corso-cli/m5l2/porta.txt`, correggi TASKFLOW_URL in questa shell e verifica con /v1/health.',
      criterion: 'porta.txt contiene 8080; TASKFLOW_URL usa quella porta; GET /v1/health → 200.',
    },
    checks: [
      {
        id: 'porta',
        description: 'porta.txt contiene 8080',
        expected: '8080',
        test: (c) => ({ pass: (c.read('porta.txt') ?? '').trim() === '8080', actual: (c.read('porta.txt') ?? '(mancante)').trim() }),
        onFail: 'Cerca l\'evidenza: l\'argomento --port del processo (ps aux) o la riga "port" in /etc/taskflow/api.conf.',
      },
      {
        id: 'ok',
        description: 'GET /v1/health → 200',
        expected: '200',
        test: (c) => ({ pass: apiHit(c, 'GET', /^\/v1\/health/, 200), actual: c.apiShell.length ? c.apiShell.map((e) => e.status).join(',') : 'nessuna richiesta arrivata' }),
        onFail: 'Correggi la porta nella variabile e riprova.',
      },
    ],
    example: { text: 'Esempio analogo: leggere una riga di configurazione.', cmd: { bash: 'grep env /etc/taskflow/api.conf', pwsh: 'Select-String env /etc/taskflow/api.conf' } },
    hints: ['Due fonti di evidenza: il processo (ps aux) e /etc/taskflow/api.conf.', 'Dopo aver trovato la porta aggiorna TASKFLOW_URL (export / $env:).'],
    solutions: {
      bash: ['cd ~/corso-cli/m5l2', 'curl -s $TASKFLOW_URL/v1/health; echo "exit=$?"', 'ps aux | grep taskflow', 'echo 8080 > porta.txt', 'export TASKFLOW_URL=http://localhost:8080', 'curl -s $TASKFLOW_URL/v1/health'],
      pwsh: ['cd ~/corso-cli/m5l2', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" } catch { $_.Exception.Message }', 'Select-String port /etc/taskflow/api.conf', 'Set-Content porta.txt 8080', '$env:TASKFLOW_URL = "http://localhost:8080"', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"'],
    },
    summary: ['curl 6 = nome; curl 7 = porta/processo', 'ps e file di configurazione come evidenze', 'i servizi non si terminano senza permessi'],
    skills: ['diagnosi', 'http', 'comandi'],
    concepts: ['connessione rifiutata (curl 7)', 'ps e processi', 'configurazione del servizio', 'permessi sui processi'],
  },
  {
    id: 'M5.L4',
    module: 5,
    n: 4,
    title: 'Un 401 inatteso: leggere risposta e log',
    objective: 'Diagnosticare un 401 usando il corpo della risposta e il log applicativo, e ripristinare il funzionamento.',
    explain: [
      'Un 401 può significare: header assente, schema errato, token non valido o token SCADUTO. Il corpo (`error`) lo distingue; il log applicativo del server aggiunge i dettagli (data di scadenza, utente).',
      'I log del servizio simulato sono in /var/log/taskflow/<ambiente>/: `access.log` (una riga per richiesta) e `app.log` (eventi: autenticazione, validazione, errori).',
      'Distingui sempre: FATTO OSSERVATO (cosa risponde il server), COMPORTAMENTO DOCUMENTATO (cosa dice la specifica) e IPOTESI (cosa pensi sia la causa) finché non hai un\'evidenza.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'expired' }),
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }' }, what: 'Prova la richiesta con il token disponibile.', who: 'Il server risponde 401.', parts: ['TASKFLOW_TOKEN: token già presente nella shell'], expect: '401 con un codice che spiega la causa.', risk: 'Nessuno.' },
      { title: "L'evidenza nei log", cmd: { bash: 'grep -i token /var/log/taskflow/development/app.log', pwsh: 'Select-String -Pattern token -Path /var/log/taskflow/development/app.log' }, what: 'Cerca gli eventi di autenticazione.', who: 'grep / Select-String.', parts: ['-i: ignora maiuscole'], expect: 'WARN auth: token scaduto (exp=... now=...)', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Il corpo dell\'errore dice token_expired: quale azione risolve il problema?',
        cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/me', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/me" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }' },
        expect: 'Richiedere un nuovo token con POST /v1/auth/token (non cambiare password o URL).',
        why: 'Il messaggio nomina la causa: scaduto, non "sbagliato".',
      },
    ],
    negative: {
      prompt: 'Token di un altro ambiente: stesso 401, causa diversa?',
      cmd: { bash: 'curl -s -H "Authorization: Bearer tf_test_bob_9999999999" $TASKFLOW_URL/v1/me', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/me" -Headers @{Authorization="Bearer tf_test_bob_9999999999"} } catch { $_.ErrorDetails.Message }' },
      explain: '401 invalid_token: "emesso per un altro ambiente". Stesso status, causa applicativa diversa: ecco perché leggi il corpo.',
    },
    task: {
      text: "Il token nella shell non funziona. Trova la causa con gli strumenti (risposta e log), ottieni un nuovo token, aggiorna TASKFLOW_TOKEN, fai riuscire GET /v1/tasks e scrivi in `~/corso-cli/m5l4/diagnosi.txt` la causa del 401.",
      criterion: 'Il server ha registrato prima un 401 e poi un 200 su /v1/tasks; hai consultato app.log; diagnosi.txt dice che il token era scaduto.',
    },
    checks: [
      {
        id: 'sequenza',
        description: 'GET /v1/tasks: 401 e poi 200',
        expected: '401 → 200',
        test: (c) => {
          const s = c.apiShell.filter((e) => e.path.startsWith('/v1/tasks') && e.method === 'GET').map((e) => e.status);
          return { pass: s.includes(401) && s.lastIndexOf(200) > s.indexOf(401), actual: s.join(',') || 'nessuna richiesta' };
        },
        onFail: 'Riproduci prima il 401, poi rinnova il token e ripeti la stessa richiesta fino al 200.',
      },
      {
        id: 'log',
        description: 'Hai consultato il log applicativo',
        expected: 'comando che legge app.log',
        test: (c) => ({ pass: cmdMatches(c, /app\.log/), actual: cmdMatches(c, /app\.log/) ? 'sì' : 'nessun comando ha letto app.log' }),
        onFail: "Cerca l'evidenza nel log: /var/log/taskflow/development/app.log (grep o Select-String).",
      },
      {
        id: 'diagnosi',
        description: 'diagnosi.txt: la causa era un token scaduto',
        expected: 'cita "scaduto" o "expired"',
        test: (c) => ({ pass: /scadut|expired/i.test(c.read('diagnosi.txt') ?? ''), actual: (c.read('diagnosi.txt') ?? '(mancante)').trim().slice(0, 80) }),
        onFail: 'Scrivi la causa in una riga, basandoti sull\'evidenza (corpo della risposta e log).',
      },
    ],
    example: { text: 'Esempio analogo: ricavare un token da una risposta e salvarlo.', cmd: { bash: `export TASKFLOW_TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)`, pwsh: '$env:TASKFLOW_TOKEN = $r.access_token' } },
    hints: ['Il corpo del 401 contiene "error": leggilo; il log conferma con la data di scadenza.', 'Per rinnovare il token riusa la procedura di M4.L3; poi aggiorna la variabile che usi nelle richieste.'],
    solutions: {
      bash: ['curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks', 'grep -i token /var/log/taskflow/development/app.log', 'export TASKFLOW_TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)', 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks | jq .total', 'cd ~/corso-cli/m5l4', 'echo "token scaduto (token_expired): rinnovato con POST /v1/auth/token" > diagnosi.txt'],
      pwsh: ['try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }', 'Select-String -Pattern token -Path /var/log/taskflow/development/app.log', '$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json', '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body', '$env:TASKFLOW_TOKEN = $r.access_token', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | Out-Null', 'cd ~/corso-cli/m5l4', 'Set-Content diagnosi.txt "token scaduto (token_expired): rinnovato con POST /v1/auth/token"'],
    },
    summary: ['401: header, schema, token non valido, token scaduto', 'corpo + log = evidenze', 'fatto, documentato, ipotesi'],
    skills: ['diagnosi', 'http', 'output'],
    concepts: ['4xx: autenticazione', 'log applicativi', 'token scaduto', 'fatto osservato vs ipotesi'],
  },
  {
    id: 'M5.L5',
    module: 5,
    n: 5,
    title: 'Errori 5xx e retry: uno script elementare',
    objective: 'Scrivere ed eseguire uno script che riprova un\'operazione instabile con un numero massimo di tentativi.',
    explain: [
      'Un 5xx è un errore del server: spesso transitorio. Un client robusto riprova poche volte (con una pausa) e poi rinuncia segnalando l\'errore con un codice di uscita ≠ 0.',
      'Uno script è un file di comandi. In Bash: prima riga `#!/bin/bash`, poi il permesso di esecuzione (`chmod +x`). In PowerShell: file `.ps1`, lanciato con `./nome.ps1`.',
      'L\'endpoint /v1/flaky fallisce con 500 ogni terza chiamata (in modo deterministico).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c);
      c.state.api.envs.development.flakyCounter = 2;
    },
    guided: [
      { title: 'Un ciclo', cmd: { bash: 'for i in 1 2 3; do echo "tentativo $i"; done', pwsh: 'for ($i = 1; $i -le 3; $i++) { echo "tentativo $i" }' }, what: 'Ripete un blocco.', who: 'La shell.', parts: ['for ... do ... done'], expect: 'tentativo 1, 2, 3', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Con 5 tentativi massimi, quanti ne servono perché /v1/flaky risponda 200 (il primo fallisce)?',
        cmd: { bash: 'curl -s -o /dev/null -w "%{http_code} " $TASKFLOW_URL/v1/flaky; curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/flaky', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/flaky" | Out-Null; "200" } catch { "500" }; try { irm "$env:TASKFLOW_URL/v1/flaky" | Out-Null; "200" } catch { "500" }' },
        expect: '2: prima 500, poi 200.',
        why: 'Il servizio fallisce ogni terza chiamata e il contatore parte da un valore tale che la prima sia un fallimento.',
      },
    ],
    negative: {
      prompt: 'Lanciare uno script senza il permesso di esecuzione (Bash).',
      cmd: { bash: 'cd ~/corso-cli/m5l5; echo \'echo ciao\' > prova.sh; ./prova.sh', pwsh: 'cd ~/corso-cli/m5l5; Set-Content prova.ps1 "echo ciao"; prova.ps1' },
      explain: 'Bash: Permission denied (chmod +x). PowerShell: il nome da solo non carica script dalla cartella corrente: serve ./prova.ps1',
    },
    task: {
      text: 'In ~/corso-cli/m5l5 crea uno script `retry.sh` (Bash) o `retry.ps1` (PowerShell) che chiama GET /v1/flaky fino a 5 volte, con 1 secondo di pausa tra i tentativi, e appena ottiene 200 stampa `OK dopo N tentativi` ed esce con 0 (altrimenti `FALLITO dopo 5 tentativi` ed esce con 1). Eseguilo.',
      criterion: 'Lo script esiste, è stato eseguito con codice 0 stampando "OK dopo 2 tentativi" e il server ha registrato 500 e poi 200 su /v1/flaky.',
    },
    checks: [
      {
        id: 'script',
        description: 'Lo script esiste',
        expected: 'retry.sh / retry.ps1, con la pausa di 1 secondo tra i tentativi',
        test: (c) => {
          const f = c.shell === 'bash' ? 'retry.sh' : 'retry.ps1';
          const t = c.read(f);
          if (t === null) return { pass: false, actual: `${f} mancante` };
          return { pass: /sleep|Start-Sleep/i.test(t), actual: /sleep|Start-Sleep/i.test(t) ? f : `${f} senza pausa tra i tentativi (sleep 1 / Start-Sleep -Seconds 1)` };
        },
        onFail: 'Crea il file nella cartella della lezione (heredoc con cat > file <<EOF in Bash; Set-Content in PowerShell).',
      },
      {
        id: 'eseguito',
        description: 'Lo script è stato eseguito: OK dopo 2 tentativi',
        expected: 'OK dopo 2 tentativi, codice 0',
        test: (c) => {
          const hit = c.cmds.find((x) => x.exit === 0 && /retry\.(sh|ps1)/.test(x.cmd) && /OK dopo \d+ tentativi/.test(x.stdout));
          return { pass: !!hit, actual: hit ? hit.stdout.trim().split('\n').pop()! : 'nessuna esecuzione riuscita dello script' };
        },
        onFail: 'Esegui lo script (Bash: chmod +x retry.sh && ./retry.sh; PowerShell: ./retry.ps1).',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'log',
        description: 'Il server ha visto 500 e poi 200 su /v1/flaky',
        expected: '500, 200',
        test: (c) => {
          const s = c.apiShell.filter((e) => e.path === '/v1/flaky').map((e) => e.status);
          return { pass: s.includes(500) && s.lastIndexOf(200) > s.indexOf(500), actual: s.join(',') || 'nessuna richiesta' };
        },
        onFail: 'Lo script deve chiamare davvero /v1/flaky e riprovare dopo il 500.',
      },
    ],
    example: { text: 'Esempio analogo di ciclo con condizione di uscita.', cmd: { bash: 'for i in 1 2 3; do if [ $i -eq 2 ]; then echo trovato; break; fi; done', pwsh: 'for ($i = 1; $i -le 3; $i++) { if ($i -eq 2) { echo trovato; break } }' } },
    hints: ['Scheletro: ciclo da 1 a 5; ad ogni giro chiama l\'endpoint e controlla lo status; se 200 stampa e esci con exit 0; altrimenti sleep 1.', 'Bash: code=$(curl -s -o /dev/null -w "%{http_code}" URL). PowerShell: try { Invoke-RestMethod ... } catch { ... }.'],
    solutions: {
      bash: ['cd ~/corso-cli/m5l5', `cat > retry.sh <<'EOF'\n${RETRY_SH}EOF`, 'chmod +x retry.sh', './retry.sh'],
      pwsh: ['cd ~/corso-cli/m5l5', `Set-Content retry.ps1 -Value @'\n${RETRY_PS1}'@`, './retry.ps1'],
    },
    summary: ['5xx spesso transitori: retry limitato con pausa', 'script = file di comandi', 'exit code per segnalare l\'esito'],
    skills: ['diagnosi', 'comandi', 'testing', 'autonomia'],
    concepts: ['errori 5xx', 'retry con numero massimo di tentativi', 'script elementari', 'exit code di uno script'],
  },
  {
    id: 'M5.L6',
    module: 5,
    n: 6,
    title: 'Trovare il punto di rottura nei log',
    objective: 'Analizzare un log di accessi con filtri e conteggi per individuare l\'endpoint con più errori 5xx.',
    explain: [
      'Quando un sistema "va male" i log dicono dove. Riga tipo: `2026-03-02T09:00:01Z INFO  http: GET /v1/flaky -> 500 (12ms) user=bob req=req_000012`.',
      'Strategia: filtra le righe d\'errore, estrai il campo che ti serve (il percorso), conta e ordina. Gli stessi strumenti di M2 (grep, awk/cut, sort, uniq -c) o in PowerShell Select-String, Group-Object, Sort-Object.',
      'Una cifra senza evidenza non basta: nel report indica sempre da quale file e con quale comando l\'hai ricavata.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => c.file('traffic.log', TRAFFIC_LOG),
    guided: [
      { title: 'Righe con errore 5xx', cmd: { bash: "grep -- '-> 5' ~/corso-cli/m5l6/traffic.log | head -3", pwsh: "Select-String -Pattern '-> 5' -Path ~/corso-cli/m5l6/traffic.log | Select-Object -First 3" }, what: 'Mostra le prime righe con status 5xx.', who: 'grep / Select-String.', parts: ["'-> 5': il testo che precede lo status", '--: finisce le opzioni (il pattern inizia con -)'], expect: 'Righe con -> 500.', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Cosa ti aspetti da `grep -c -- \'-> 5\' traffic.log` (quante righe con errore 5xx)?',
        cmd: { bash: "grep -c -- '-> 5' ~/corso-cli/m5l6/traffic.log", pwsh: "(Select-String -Pattern '-> 5' -Path ~/corso-cli/m5l6/traffic.log).Count" },
        expect: `${TOTAL_5XX}`,
        why: 'Conta le righe che corrispondono, non le occorrenze del carattere.',
      },
    ],
    negative: {
      prompt: 'Cosa succede con grep senza -- su un pattern che inizia con "-"?',
      cmd: { bash: "grep '-> 5' ~/corso-cli/m5l6/traffic.log", pwsh: "Select-String '-> 5' ~/corso-cli/m5l6/traffic.log" },
      explain: 'Bash: grep prova a leggere "-> 5" come opzioni e dà errore. Il separatore -- (o -e) risolve. In PowerShell il pattern posizionale funziona.',
    },
    task: {
      text: 'In ~/corso-cli/m5l6 analizza `traffic.log`: scrivi in `top-errori.txt` il percorso (solo quello, es. /v1/xyz) con più errori 5xx, e in `totale-5xx.txt` il numero totale di righe con errore 5xx.',
      criterion: 'top-errori.txt contiene il percorso corretto; totale-5xx.txt contiene il numero corretto.',
    },
    checks: [
      {
        id: 'analisi',
        description: 'Hai analizzato traffic.log con gli strumenti della lezione',
        expected: pick({ shell: 'bash' } as never, 'awk, grep, sort o uniq su traffic.log', 'Select-String, Group-Object o Where-Object su traffic.log') as string,
        test: (c) => {
          const ok = ranCmd(c, pick(c, /\b(awk|grep|sort|uniq|cut)\b.*traffic\.log|traffic\.log.*\|/, /(Select-String|Get-Content)\b.*traffic\.log|traffic\.log.*\|/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna analisi del log nei comandi' };
        },
        onFail: 'I numeri vanno ricavati dal log con filtri e conteggi, non contati a occhio.',
      },
      {
        id: 'top',
        description: 'top-errori.txt: endpoint con più 5xx',
        expected: '/v1/flaky',
        test: (c) => ({ pass: (c.read('top-errori.txt') ?? '').trim() === '/v1/flaky', actual: (c.read('top-errori.txt') ?? '(mancante)').trim() }),
        onFail: 'Filtra le righe 5xx, estrai il percorso (5° campo), raggruppa, ordina per conteggio e prendi il primo.',
      },
      {
        id: 'totale',
        description: 'totale-5xx.txt: numero di errori 5xx',
        expected: String(TOTAL_5XX),
        test: (c) => ({ pass: (c.read('totale-5xx.txt') ?? '').trim() === String(TOTAL_5XX), actual: (c.read('totale-5xx.txt') ?? '(mancante)').trim() }),
        onFail: 'Conta le righe che contengono "-> 5": grep -c (PowerShell: .Count).',
      },
    ],
    example: { text: 'Esempio analogo: l\'utente con più richieste.', cmd: { bash: "cd ~/corso-cli/m5l6 && awk '{print $(NF-1)}' traffic.log | sort | uniq -c | sort -rn | head -1", pwsh: 'cd ~/corso-cli/m5l6; Get-Content traffic.log | Group-Object { ($_ -split " ")[8] } | Sort-Object Count -Descending | Select-Object -First 1' } },
    hints: ["Il campo del percorso è il 5° quando dividi per spazi: `2026... INFO http: GET /v1/flaky`.", 'grep -- \'-> 5\' | awk \'{print $5}\' | sort | uniq -c | sort -rn | head -1 | awk \'{print $2}\''],
    solutions: {
      bash: ['cd ~/corso-cli/m5l6', "grep -- '-> 5' traffic.log | awk '{print $5}' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}' > top-errori.txt", "grep -c -- '-> 5' traffic.log > totale-5xx.txt"],
      pwsh: ['cd ~/corso-cli/m5l6', "Select-String -Pattern '-> 5' -Path traffic.log | ForEach-Object { ($_.Line -split '\\s+')[4] } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1 -ExpandProperty Name > top-errori.txt", "(Select-String -Pattern '-> 5' -Path traffic.log).Count > totale-5xx.txt"],
    },
    summary: ['filtra → estrai → conta → ordina', 'grep -- per pattern che iniziano con -', 'cita sempre il comando che produce una cifra'],
    skills: ['diagnosi', 'comandi', 'output', 'autonomia'],
    concepts: ['analisi di log', 'pipeline di conteggio', 'separatore --'],
  },
];

void cmdMatches;
