/** Diagnosi avanzata (M5): più cause insieme e strumenti di rete. */
import type { Lesson } from '../types.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

const CREA_SH = `#!/bin/bash
# Crea un task di prova.
curl -s -i -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TASKFLOW_TOKEN" -d '{"title":"Preparare la demo"}'
`;
const CREA_SH_OK = `#!/bin/bash
# Crea un task di prova.
curl -s -i -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d '{"title":"Preparare la demo"}'
`;
const CREA_PS1 = `try {
  $r = Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -Body '{"title":"Preparare la demo"}' -UseBasicParsing
  "Status: $($r.StatusCode)"
} catch {
  "Errore: $($_.Exception.Message) $($_.ErrorDetails.Message)"
}
`;
const CREA_PS1_OK = `try {
  $r = Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body '{"title":"Preparare la demo"}' -UseBasicParsing
  "Status: $($r.StatusCode)"
} catch {
  "Errore: $($_.Exception.Message) $($_.ErrorDetails.Message)"
}
`;
const DIAGNOSI = `# Diagnosi: lo script non crea il task

1. Nome dell'host sbagliato (DNS): TASKFLOW_URL conteneva "tests" al posto di "test"; nslookup dava NXDOMAIN.
2. Redirect 301: con http il server rimanda a https (header Location).
3. Token scaduto: 401 token_expired; rinnovato con POST /v1/auth/token.
4. Content-Type mancante: 415; aggiunto Content-Type: application/json allo script.

Ordine: ogni correzione ha fatto emergere la causa successiva, nascosta dalla precedente.
`;
const DIAGNOSI_PS = DIAGNOSI;

export const diagnosi: Lesson[] = [
  {
    id: 'M5.L7',
    artifacts: [],
    module: 5,
    n: 7,
    title: 'Più cause insieme: correggerne una ne rivela un\'altra',
    objective: 'Diagnosticare uno script che fallisce per quattro cause successive (nome host, redirect, token scaduto, Content-Type) e documentarle nell\'ordine in cui emergono.',
    explain: [
      'Nei problemi reali le cause si sommano: la più "esterna" (DNS) nasconde le altre. Dopo ogni correzione devi RIPETERE la prova e leggere di nuovo l\'errore, senza dare per scontato che il problema sia risolto.',
      'Metodo: sintomo → ipotesi → evidenza → correzione → nuova prova. Qui lo script crea-task fallisce per più motivi. Non c\'è un\'unica correzione: scrivi in diagnosi.md ogni causa, con l\'evidenza che l\'ha rivelata.',
      'Un redirect 301 è uno status 3xx: non è un errore ma curl non lo segue senza -L; e con -L un POST diventa GET (per questo il corretto è usare direttamente https).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { env: 'testing', token: 'expired', url: 'http://tests.api.taskflow.test' });
      c.file('crea-task.sh', CREA_SH, 0o755);
      c.file('crea-task.ps1', CREA_PS1, 0o755);
    },
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'cd ~/corso-cli/m5l7 && ./crea-task.sh', pwsh: 'cd ~/corso-cli/m5l7; ./crea-task.ps1' }, what: 'Esegue lo script che non funziona.', who: 'Lo script chiama POST /v1/tasks.', parts: ['TASKFLOW_URL e TASKFLOW_TOKEN vengono dalle variabili'], expect: 'Errore di risoluzione del nome (nessuna risposta HTTP). In PowerShell lo script lo cattura e stampa "Errore: ..." con codice 0.', risk: 'Nessuno.', fails: { bash: true, pwsh: false } },
      { title: "Che host stiamo usando?", cmd: { bash: 'echo $TASKFLOW_URL', pwsh: 'echo $env:TASKFLOW_URL' }, what: 'Mostra l\'URL configurato.', who: 'echo.', parts: [], expect: 'http://tests.api.taskflow.test', risk: 'Nessuno.', contains: 'tests.api' },
      { title: 'Il DNS conferma?', cmd: { bash: 'nslookup tests.api.taskflow.test', pwsh: 'Resolve-DnsName tests.api.taskflow.test' }, what: 'Chiede al DNS il nome sbagliato.', who: 'nslookup / Resolve-DnsName.', parts: [], expect: 'NXDOMAIN / DNS name does not exist: il nome non esiste.', risk: 'Nessuno.', fails: true },
    ],
    predict: [
      {
        prompt: 'Dopo aver corretto SOLO l\'errore di battitura (restando su http), cosa risponderà il server? Annota status e header importante.',
        cmd: { bash: 'curl -s -i http://test.api.taskflow.test/v1/health', pwsh: 'curl.exe -s -i http://test.api.taskflow.test/v1/health' },
        expect: '301 con Location: https://... : il server vuole https.',
        why: 'Un 3xx non è un errore: è un\'indicazione. Leggi l\'header Location.',
      },
    ],
    negative: {
      prompt: 'Seguire il redirect con -L su un POST: cosa cambia? Prova POST su /v1/health via http con -L.',
      cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -L http://test.api.taskflow.test/v1/health', pwsh: 'curl.exe -s -o NUL -w "%{http_code}\\n" -X POST -L http://test.api.taskflow.test/v1/health' },
      explain: 'Risponde 200: dopo un 301 il client ha ripetuto la richiesta come GET e il POST originale non è mai arrivato. Per questo è meglio correggere l\'URL (https) che affidarsi al redirect.',
    },
    task: {
      text: 'Fai funzionare ~/corso-cli/m5l7/crea-task.sh (o .ps1): il task deve essere creato (201). Poi scrivi diagnosi.md con le cause nell\'ordine in cui le hai incontrate, ciascuna con l\'evidenza.',
      criterion: 'Il registro mostra POST /v1/tasks con 401, poi 415, poi 201; lo script contiene il Content-Type; diagnosi.md nomina le quattro cause.',
    },
    checks: [
      {
        id: 'sequenza',
        description: 'POST /v1/tasks: 401, poi 415, poi 201',
        expected: '401 → 415 → 201',
        test: (c) => {
          const s = c.apiShell.filter((e) => e.method === 'POST' && e.path === '/v1/tasks').map((e) => e.status);
          const i401 = s.indexOf(401);
          const i415 = s.indexOf(415);
          const last = s.lastIndexOf(201);
          return { pass: i401 >= 0 && i415 > i401 && last > i415, actual: s.join(',') || 'nessuna richiesta' };
        },
        onFail: 'Esegui lo script dopo ogni correzione e leggi l\'errore: devi incontrare il 401 (token), poi il 415 (Content-Type), infine ottenere 201.',
      },
      {
        id: 'script',
        description: 'Lo script contiene il Content-Type JSON',
        expected: 'Content-Type: application/json',
        test: (c) => {
          const f = pick(c, 'crea-task.sh', 'crea-task.ps1');
          const t = c.read(f) ?? '';
          return { pass: /content-?type/i.test(t) && /application\/json/i.test(t), actual: /content-?type/i.test(t) ? 'presente' : 'assente' };
        },
        onFail: 'Correggi lo script: il body è JSON, quindi dichiaralo con Content-Type: application/json.',
      },
      {
        id: 'diagnosi',
        description: 'diagnosi.md: nome host, redirect, token, Content-Type',
        expected: 'le quattro cause',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          const has = {
            host: /dns|host|nome|nxdomain|tests/i.test(md),
            redirect: /301|redirect|https|location/i.test(md),
            token: /scadut|expired|token/i.test(md),
            ct: /content-?type/i.test(md),
          };
          return { pass: Object.values(has).every(Boolean), actual: Object.entries(has).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Elenca le quattro cause nell\'ordine in cui sono emerse: nome host, redirect 301, token scaduto, Content-Type mancante.',
      },
      {
        id: 'segreti',
        description: 'Nessun segreto nei comandi',
        expected: 'client_secret solo da variabile',
        test: (c) => {
          const leak = c.cmds.find((x) => /tf_(dev|test|stg)_[a-z]+_\d{6,}/.test(x.cmd));
          return { pass: !leak, actual: leak ? 'token in chiaro' : 'ok' };
        },
        onFail: 'Usa le variabili d\'ambiente per token e credenziali.',
      },
    ],
    example: { text: 'Esempio analogo: verificare un host prima di usarlo.', cmd: { bash: 'nslookup staging.api.taskflow.test', pwsh: 'Resolve-DnsName staging.api.taskflow.test' } },
    hints: ['Ripeti lo script dopo OGNI correzione: la causa successiva compare solo allora.', 'Ordine tipico: nome host (DNS) → redirect http→https → token scaduto (rinnovalo come in M4.L2) → Content-Type.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m5l7',
        './crea-task.sh',
        'nslookup tests.api.taskflow.test',
        'export TASKFLOW_URL=http://test.api.taskflow.test',
        './crea-task.sh',
        'export TASKFLOW_URL=https://test.api.taskflow.test',
        './crea-task.sh',
        'grep -i token /var/log/taskflow/testing/app.log',
        'export TASKFLOW_TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)',
        './crea-task.sh',
        `cat > crea-task.sh <<'EOF'\n${CREA_SH_OK}EOF`,
        './crea-task.sh',
        `cat > diagnosi.md <<'EOF'\n${DIAGNOSI}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m5l7',
        './crea-task.ps1',
        'Resolve-DnsName tests.api.taskflow.test',
        '$env:TASKFLOW_URL = "http://test.api.taskflow.test"',
        './crea-task.ps1',
        '$env:TASKFLOW_URL = "https://test.api.taskflow.test"',
        './crea-task.ps1',
        'Select-String -Pattern token -Path /var/log/taskflow/testing/app.log',
        '$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json',
        '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body',
        '$env:TASKFLOW_TOKEN = $r.access_token',
        './crea-task.ps1',
        `Set-Content crea-task.ps1 -Value @'\n${CREA_PS1_OK}'@`,
        './crea-task.ps1',
        `Set-Content diagnosi.md -Value @'\n${DIAGNOSI_PS}'@`,
      ],
    },
    summary: ['le cause si nascondono a vicenda', 'ripetere la prova dopo ogni correzione', 'un 3xx è un\'indicazione, non un errore', 'documentare l\'ordine delle cause'],
    skills: ['diagnosi', 'http', 'docs'],
    concepts: ['diagnosi con più cause', 'redirect 301 e Location', 'ordine delle correzioni'],
  },
  {
    id: 'M5.L8',
    module: 5,
    n: 8,
    title: 'Strumenti di rete: DNS, porte, certificati e CORS',
    objective: 'Usare gli strumenti di rete per distinguere DNS, porta chiusa e certificato, e leggere gli header CORS.',
    explain: [
      'Quando una richiesta fallisce prima di ricevere uno status, i livelli da controllare sono: 1) il NOME (DNS: nslookup, dig, Resolve-DnsName), 2) la PORTA (nc -z, ss, Test-NetConnection), 3) il CERTIFICATO (curl codice 60; in PowerShell 5.1 "Could not establish trust relationship"), 4) la risposta HTTP.',
      '`curl -k` ignora il certificato: serve solo per diagnosi, mai come soluzione. Windows PowerShell 5.1 non ha un equivalente di -k (arriva in PowerShell 7 con -SkipCertificateCheck).',
      'CORS è un controllo del BROWSER: curl non lo applica. Il servizio dichiara le origini consentite con l\'header Access-Control-Allow-Origin; se manca, il browser blocca la risposta anche se il server ha risposto 200.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { env: 'development', token: false });
    },
    guided: [
      { title: 'Il nome', cmd: { bash: 'nslookup staging.api.taskflow.test', pwsh: 'Resolve-DnsName staging.api.taskflow.test' }, what: 'Risolve il nome dello staging.', who: 'nslookup / Resolve-DnsName.', parts: [], expect: 'L\'indirizzo 203.0.113.30.', risk: 'Nessuno.', contains: '203.0.113.30' },
      { title: 'La porta', cmd: { bash: 'nc -zv staging.api.taskflow.test 443', pwsh: 'Test-NetConnection staging.api.taskflow.test -Port 443' }, what: 'Controlla che la porta HTTPS accetti connessioni.', who: 'nc / Test-NetConnection.', parts: ['-z: solo test', '-v: messaggio'], expect: 'Connessione riuscita.', risk: 'Nessuno.', contains: { bash: '', pwsh: 'True' } },
      { title: 'Una porta chiusa', cmd: { bash: 'nc -zv staging.api.taskflow.test 8443', pwsh: 'Test-NetConnection staging.api.taskflow.test -Port 8443' }, what: 'Prova una porta su cui non ascolta nessuno.', who: 'nc / Test-NetConnection.', parts: [], expect: 'Connection refused / TcpTestSucceeded False.', risk: 'Nessuno.', fails: { bash: true, pwsh: false } },
      { title: 'Il certificato scaduto', cmd: { bash: 'curl -sS https://expired.api.taskflow.test/v1/health', pwsh: 'Invoke-RestMethod https://expired.api.taskflow.test/v1/health' }, what: 'Chiama un host con certificato scaduto.', who: 'Il client rifiuta la connessione: non arriva nessuna risposta HTTP.', parts: ['-S: mostra gli errori anche con -s'], expect: 'curl 60 / "Could not establish trust relationship".', risk: 'Nessuno.', fails: true },
      { title: 'Gli header CORS', cmd: { bash: 'curl -s -i -H "Origin: https://docs.taskflow.test" localhost:8080/v1/health', pwsh: 'curl.exe -s -i -H "Origin: https://docs.taskflow.test" localhost:8080/v1/health' }, what: 'Simula una richiesta da una pagina web con un\'origine nota.', who: 'Il server risponde con Access-Control-Allow-Origin.', parts: ['Origin: da dove arriva la pagina'], expect: 'Access-Control-Allow-Origin: https://docs.taskflow.test', risk: 'Nessuno.', contains: 'Access-Control-Allow-Origin' },
    ],
    predict: [
      {
        prompt: 'Con un\'origine NON consentita (https://evil.test) l\'header Access-Control-Allow-Origin ci sarà? E lo status?',
        cmd: { bash: 'curl -s -i -H "Origin: https://evil.test" localhost:8080/v1/health', pwsh: 'curl.exe -s -i -H "Origin: https://evil.test" localhost:8080/v1/health' },
        expect: '200 ma senza Access-Control-Allow-Origin: il browser nasconderebbe la risposta.',
        why: 'Il server risponde comunque: è il browser a bloccare. Con curl non vedresti mai l\'errore CORS.',
      },
    ],
    negative: {
      prompt: 'Una richiesta di preflight (OPTIONS) da un\'origine non consentita:',
      cmd: { bash: 'curl -s -i -X OPTIONS -H "Origin: https://evil.test" -H "Access-Control-Request-Method: GET" localhost:8080/v1/tasks', pwsh: 'curl.exe -s -i -X OPTIONS -H "Origin: https://evil.test" -H "Access-Control-Request-Method: GET" localhost:8080/v1/tasks' },
      explain: '403 cors_origin_not_allowed: il preflight fallisce e il browser non invia nemmeno la richiesta vera.',
    },
    task: {
      text: 'In ~/corso-cli/m5l8/rete.md annota: l\'indirizzo IP dello staging (ricavato con gli strumenti), se la porta 443 è aperta, se la porta 8443 è chiusa, e quale origine consentita hai verificato per CORS.',
      criterion: 'Hai usato uno strumento DNS e uno di porta; rete.md contiene IP, 443 aperta, 8443 chiusa e un\'origine.',
    },
    checks: [
      {
        id: 'strumenti',
        description: 'Hai usato uno strumento DNS e uno di porta',
        expected: 'nslookup/dig/Resolve-DnsName e nc/ss/Test-NetConnection',
        test: (c) => {
          const dns = cmdMatches(c, pick(c, /(nslookup|dig)\b/, /Resolve-DnsName/i));
          const port = cmdMatches(c, pick(c, /\b(nc|ss)\b/, /Test-NetConnection/i), false);
          return { pass: dns && port, actual: `dns:${dns} porta:${port}` };
        },
        onFail: 'Servono almeno un comando per il nome (nslookup, dig, Resolve-DnsName) e uno per la porta (nc, ss, Test-NetConnection).',
      },
      {
        id: 'note',
        description: 'rete.md: IP, 443 aperta, 8443 chiusa, origine',
        expected: '203.0.113.30, 443, 8443 chiusa, https://docs.taskflow.test',
        test: (c) => {
          const md = c.read('rete.md') ?? '';
          const ok = { ip: md.includes('203.0.113.30'), p443: /443/.test(md), p8443: /8443/.test(md) && /chius|rifiut|closed|refused|false/i.test(md), origin: /docs\.taskflow\.test|localhost:3000/.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Annota IP (203.0.113.30), porta 443 aperta, porta 8443 chiusa/rifiutata e un\'origine consentita (https://docs.taskflow.test).',
      },
      {
        id: 'cors',
        description: 'Hai verificato CORS con un\'origine reale',
        expected: 'richiesta con header Origin',
        test: (c) => ({ pass: cmdMatches(c, /Origin:/i), actual: cmdMatches(c, /Origin:/i) ? 'sì' : 'nessuna richiesta con Origin' }),
        onFail: 'Invia una richiesta con -H "Origin: ..." e leggi Access-Control-Allow-Origin.',
      },
    ],
    example: { text: 'Esempio analogo: controllare la porta del servizio locale.', cmd: { bash: 'nc -zv localhost 8080', pwsh: 'Test-NetConnection localhost -Port 8080' } },
    hints: ['Il nome → nslookup/Resolve-DnsName; la porta → nc -zv / Test-NetConnection.', 'Per CORS invia una richiesta con -H "Origin: https://docs.taskflow.test" e cerca Access-Control-Allow-Origin.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m5l8',
        'nslookup staging.api.taskflow.test',
        'nc -zv staging.api.taskflow.test 443',
        'nc -zv staging.api.taskflow.test 8443',
        'curl -s -i -H "Origin: https://docs.taskflow.test" localhost:8080/v1/health | grep -i access-control',
        'printf "IP staging: 203.0.113.30\\nPorta 443: aperta\\nPorta 8443: chiusa (connection refused)\\nOrigine CORS consentita: https://docs.taskflow.test\\n" > rete.md',
      ],
      pwsh: [
        'cd ~/corso-cli/m5l8',
        'Resolve-DnsName staging.api.taskflow.test',
        'Test-NetConnection staging.api.taskflow.test -Port 443',
        'Test-NetConnection staging.api.taskflow.test -Port 8443',
        'curl.exe -s -i -H "Origin: https://docs.taskflow.test" localhost:8080/v1/health | Select-String -Pattern access-control',
        'Set-Content rete.md -Value @("IP staging: 203.0.113.30", "Porta 443: aperta", "Porta 8443: chiusa (TcpTestSucceeded False)", "Origine CORS consentita: https://docs.taskflow.test")',
      ],
    },
    summary: ['DNS, porta, certificato, HTTP: quattro livelli', '-k solo per diagnosi', 'CORS lo applica il browser, non curl'],
    skills: ['diagnosi', 'http', 'comandi'],
    concepts: ['nslookup/dig', 'nc e Test-NetConnection', 'certificato scaduto', 'CORS'],
  },
];
