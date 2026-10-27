/**
 * M11 — Laboratorio a due nodi (facoltativo): un SERVER che ospita il servizio TaskFlow e un CLIENT che lo usa, su una rete simulata.
 * Equivale al laboratorio con due macchine virtuali (kit reale in course/lab-vm/), ma funziona ovunque e si ripristina con "Ripristina".
 * Il client è il terminale dello studente; il server si raggiunge con `ssh` (un comando alla volta).
 */
import type { Lesson, SetupCtx, CheckCtx } from '../types.ts';
import type { ApiLogEntry } from '../../engine/types.ts';
import { labScenario, type LabScenario } from '../../engine/lab.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

const SERVER_HOSTS = ['server.lab', '192.168.50.10'];

function setupLab(c: SetupCtx, scenario: LabScenario, opts: { token?: boolean } = {}): void {
  setupApi(c, { env: 'testing', token: opts.token === false ? false : 'valid', url: 'http://server.lab:8080' });
  labScenario(c.state, scenario);
}

const onServer = (e: ApiLogEntry): boolean => !!e.host && SERVER_HOSTS.includes(e.host);
function hit(c: CheckCtx, method: string, path: RegExp, status: number): boolean {
  return c.apiShell.some((e) => onServer(e) && e.method === method && path.test(e.path) && e.status === status);
}
const sshCmd = (c: CheckCtx, re: RegExp, okOnly = true): boolean => cmdMatches(c, new RegExp('\\bssh\\b.*(?:' + re.source + ')', re.flags), okOnly);
const missing = (ok: Record<string, boolean>): { pass: boolean; actual: string } => ({ pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' });

const PW_SSH = "In Windows 10 e successivi PowerShell 5.1 usa l'ssh.exe di OpenSSH: gli stessi comandi ssh della versione Bash.";
const NODES_NOTE = 'Nel laboratorio il CLIENT è il terminale che stai usando (192.168.50.20); il SERVER (192.168.50.10, nome server.lab) ospita il servizio TaskFlow sulla porta 8080 e si raggiunge con `ssh learner@server.lab "comando"`. La sessione interattiva non è disponibile: ogni ssh esegue un solo comando (anche concatenato con && o |).';

const MAPPA_MD = `# Mappa del laboratorio

| Nodo | Ruolo | Indirizzo | Cosa fa |
|---|---|---|---|
| server | fornisce il servizio | 192.168.50.10 (server.lab) | esegue TaskFlow, porta 8080 |
| client | usa il servizio | 192.168.50.20 | invia le richieste HTTP |

## Come verificare che il servizio sia raggiungibile

1. Rete: ping verso server.lab.
2. Porta: la porta 8080 del server accetta connessioni (nc -zv).
3. Servizio: systemctl status taskflow sul server (via ssh) e ss -tlnp.
4. Applicazione: GET /v1/health risponde 200.
`;

const ESEMPIO_MD = `# Elenco dei task (GET /v1/tasks)

## Richiesta

\`GET http://server.lab:8080/v1/tasks\`

Header obbligatorio: \`Authorization: Bearer <token>\` (il token sta nella variabile TASKFLOW_TOKEN, mai nel comando).

Parametri: nessuno obbligatorio.

## Risposta attesa

200 con un oggetto JSON che contiene l'elenco dei task.

## Errori possibili

- 401: token mancante o scaduto.
- 404 route_not_found: percorso inesistente.
- 500 database_unavailable: il database del server non risponde.
- Nessuno status (connessione rifiutata): servizio fermo o porta sbagliata.
`;

const SERVIZIO_FERMO_MD = `# Diagnosi: servizio fermo

- Sintomo: dal client la richiesta a server.lab:8080 non riceve nessuna risposta HTTP (connection refused, curl codice 7).
- Livello: non è un errore HTTP né di DNS; la porta non accetta connessioni, quindi il problema è sul server.
- Verifica sul server: systemctl status taskflow dice inactive (dead); ss -tlnp non mostra la porta 8080.
- Correzione: sudo systemctl start taskflow (via ssh).
- Prova finale: GET /v1/health risponde 200.
`;

const PORTA_MD = `# Diagnosi: porta sbagliata

- Sintomo: connessione rifiutata sulla porta 8080 documentata, ma il servizio risulta attivo (systemctl status taskflow: active).
- Verifica sul server: ss -tlnp mostra taskflow in ascolto su 9090; /etc/taskflow/taskflow.env ha PORT=9090.
- Causa: la configurazione del server non rispetta la porta documentata (8080).
- Correzione: PORT=8080 nel file di configurazione e systemctl restart taskflow.
- Prova finale: GET /v1/health sulla porta 8080 risponde 200.
`;

const DATABASE_MD = `# Diagnosi: errore 500 per database

- Sintomo: /v1/health risponde 200, ma GET /v1/tasks risponde 500 database_unavailable.
- Livello: il client e la rete sono a posto (c'è una risposta HTTP); l'errore è lato server.
- Verifica sul server: journalctl -u taskflow mostra "connessione a 127.0.0.1:5432 persa"; systemctl status taskflow-db dice inactive.
- Correzione: sudo systemctl start taskflow-db.
- Prova finale: GET /v1/tasks risponde 200.
`;

const RAPPORTO_MD = `# Rapporto di diagnosi

## Sintomi

Dal client, GET /v1/tasks su server.lab:8080 non riceve risposta (connection refused).

## Cause, nell'ordine in cui sono emerse

1. Servizio fermo: systemctl status taskflow dice inactive.
2. Porta sbagliata: dopo l'avvio taskflow ascolta su 9090 invece di 8080; PORT=9090 in /etc/taskflow/taskflow.env.
3. Database fermo: /v1/health risponde 200 ma /v1/tasks risponde 500 database_unavailable; taskflow-db è inactive.

## Correzioni

PORT=8080 nella configurazione, sudo systemctl start taskflow-db, sudo systemctl start taskflow.

## Verifica finale

GET /v1/tasks risponde 200 sulla porta 8080 documentata.

## Esempio di richiesta

curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" http://server.lab:8080/v1/tasks
`;

const flow = { shells: ['bash', 'pwsh'] as Lesson['shells'] };

export const m11: Lesson[] = [
  {
    id: 'M11.L1',
    module: 11,
    n: 1,
    title: 'Due nodi: chi serve e chi usa',
    objective: 'Distinguere il client dal server, verificare rete, porta e servizio e documentare la mappa del laboratorio.',
    explain: [
      NODES_NOTE,
      'Quando un servizio "non funziona" i livelli da controllare sono: 1) la RETE (`ping` verso il nodo), 2) la PORTA (`nc -zv server.lab 8080`; in PowerShell `Test-NetConnection server.lab -Port 8080`), 3) il SERVIZIO sul server (`systemctl status taskflow` e `ss -tlnp`, cioè quali porte sono in ascolto), 4) l\'APPLICAZIONE (la richiesta HTTP, per esempio /v1/health).',
      '`ssh learner@server.lab "comando"` esegue un comando sul server e ne mostra l\'output sul tuo terminale: è come lavorare sul server senza spostarti. Fuori dal laboratorio il server può essere un\'altra macchina virtuale o un computer vero.',
      PW_SSH,
    ],
    ...flow,
    pwshOptional: true,
    setup: (c) => setupLab(c, 'ok'),
    guided: [
      { title: 'La rete', cmd: { bash: 'ping -c 2 server.lab', pwsh: 'Test-NetConnection server.lab' }, what: 'Verifica che il server risponda e mostra il suo indirizzo.', who: 'ping (Bash) / Test-NetConnection (PowerShell).', parts: ['server.lab: nome del server', '-c 2: due pacchetti'], expect: 'Risposte da 192.168.50.10.', risk: 'Nessuno.', contains: '192.168.50.10' },
      { title: 'La porta', cmd: { bash: 'nc -zv server.lab 8080', pwsh: 'Test-NetConnection server.lab -Port 8080' }, what: 'Controlla che la porta 8080 del server accetti connessioni.', who: 'nc / Test-NetConnection.', parts: ['-z: solo test', '-v: messaggio di esito'], expect: 'Connessione riuscita (TcpTestSucceeded True).', risk: 'Nessuno.', contains: { bash: '', pwsh: 'True' } },
      { title: 'Il servizio sul server', cmd: { bash: 'ssh learner@server.lab "systemctl status taskflow"', pwsh: 'ssh learner@server.lab "systemctl status taskflow"' }, what: 'Chiede al server lo stato del servizio TaskFlow.', who: 'ssh porta il comando sul server; lo esegue systemctl.', parts: ['learner@server.lab: utente e server', 'tra apici: il comando da eseguire sul server'], expect: 'active (running) e le ultime righe del registro.', risk: 'Nessuno: status è solo lettura.', contains: 'active (running)' },
      { title: 'Le porte in ascolto', cmd: { bash: 'ssh learner@server.lab "ss -tlnp"', pwsh: 'ssh learner@server.lab "ss -tlnp"' }, what: 'Elenca le porte TCP in ascolto sul server e quale processo le usa.', who: 'ss, eseguito sul server.', parts: ['-t: TCP', '-l: in ascolto', '-n: numeri', '-p: processo'], expect: 'sshd sulla 22, taskflow sulla 8080.', risk: 'Nessuno.', contains: '8080' },
      { title: 'L\'applicazione', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Chiama dal client l\'endpoint di salute del servizio.', who: 'curl / Invoke-RestMethod.', parts: ['$TASKFLOW_URL: http://server.lab:8080'], expect: 'status ok.', risk: 'Nessuno.', contains: 'ok' },
    ],
    predict: [
      {
        prompt: 'Se lanci `systemctl status taskflow` direttamente sul client (senza ssh), cosa succede?',
        cmd: { bash: 'systemctl status taskflow', pwsh: 'ssh learner@server.lab "hostname"' },
        expect: 'Bash: "command not found" (il client non ha il servizio). PowerShell: il comando ssh stampa il nome del server.',
        why: 'I servizi vivono sul server: un comando eseguito sul client non li vede.',
      },
    ],
    negative: {
      prompt: 'Un nome di server sbagliato:',
      cmd: { bash: 'ssh learner@servr.lab "hostname"', pwsh: 'ssh learner@servr.lab "hostname"' },
      explain: 'Could not resolve hostname: è un errore di NOME (DNS), non del servizio. Prima di cercare altrove controlla come hai scritto l\'host.',
    },
    task: {
      text: 'In ~/corso-cli/m11l1: verifica nell\'ordine rete (ping o Test-NetConnection), porta 8080, stato del servizio sul server e porte in ascolto (via ssh), poi GET /v1/health dal client. Scrivi mappa.md con i due nodi (ruolo e indirizzo), la porta del servizio e i quattro passi di verifica.',
      criterion: 'Il registro mostra i comandi dei quattro livelli; mappa.md contiene gli indirizzi 192.168.50.10 e 192.168.50.20, le parole client e server, la porta 8080 e health.',
    },
    checks: [
      {
        id: 'rete-porta',
        description: 'Hai controllato rete e porta dal client',
        expected: 'ping/Test-NetConnection e nc/Test-NetConnection -Port',
        test: (c) => {
          const rete = cmdMatches(c, pick(c, /\bping\b.*(server\.lab|192\.168\.50\.10)/, /Test-NetConnection\s+(server\.lab|192\.168\.50\.10)\s*$/i));
          const porta = cmdMatches(c, pick(c, /\bnc\b.*(server\.lab|192\.168\.50\.10).*8080/, /Test-NetConnection.*-Port\s+8080/i), false);
          return missing({ rete, porta });
        },
        onFail: 'Serve un comando per la rete (ping server.lab) e uno per la porta (nc -zv server.lab 8080 / Test-NetConnection server.lab -Port 8080).',
      },
      {
        id: 'server',
        description: 'Hai interrogato il server via ssh (stato del servizio e porte in ascolto)',
        expected: 'ssh ... systemctl status taskflow e ssh ... ss',
        test: (c) => missing({ status: sshCmd(c, /systemctl status taskflow/), ss: sshCmd(c, /\bss\b/) }),
        onFail: 'Usa ssh learner@server.lab "systemctl status taskflow" e ssh learner@server.lab "ss -tlnp".',
      },
      {
        id: 'health',
        description: 'GET /v1/health dal client risponde 200',
        expected: '200 su server.lab',
        test: (c) => ({ pass: hit(c, 'GET', /^\/v1\/health/, 200), actual: hit(c, 'GET', /^\/v1\/health/, 200) ? 'ok' : 'nessuna richiesta riuscita a /v1/health' }),
        onFail: 'Chiama $TASKFLOW_URL/v1/health: l\'URL punta già al server.',
      },
      {
        id: 'documento',
        description: 'mappa.md: nodi, indirizzi, porta e passi',
        expected: '192.168.50.10, 192.168.50.20, client, server, 8080, health',
        test: (c) => {
          const md = c.read('mappa.md') ?? '';
          return missing({ server: /192\.168\.50\.10/.test(md), client: /192\.168\.50\.20/.test(md), ruoli: /client/i.test(md) && /server/i.test(md), porta: /8080/.test(md), health: /health/i.test(md) });
        },
        onFail: 'Descrivi i due nodi (ruolo e indirizzo), la porta 8080 e come verifichi il servizio, compresa la chiamata a health.',
      },
    ],
    example: { text: 'Esempio analogo: chiedere al server il suo nome e la sua versione.', cmd: { bash: 'ssh learner@server.lab "hostname"', pwsh: 'ssh learner@server.lab "hostname"' } },
    hints: ['Ordine dei livelli: rete → porta → servizio → applicazione.', 'Il comando da eseguire sul server va tra apici dopo learner@server.lab.', 'In mappa.md una tabella con nodo, ruolo e indirizzo basta.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l1',
        'ping -c 2 server.lab',
        'nc -zv server.lab 8080',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "ss -tlnp"',
        'curl -s $TASKFLOW_URL/v1/health',
        `cat > mappa.md <<'EOF'\n${MAPPA_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l1',
        'Test-NetConnection server.lab',
        'Test-NetConnection server.lab -Port 8080',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "ss -tlnp"',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        `Set-Content mappa.md -Value @'\n${MAPPA_MD}'@`,
      ],
    },
    summary: ['client usa, server fornisce', 'rete → porta → servizio → applicazione', 'ssh esegue un comando sul server', 'ss -tlnp: chi ascolta su quale porta'],
    skills: ['diagnosi', 'comandi', 'docs'],
    concepts: ['client e server', 'ssh', 'porte in ascolto', 'livelli di verifica'],
  },
  {
    id: 'M11.L2',
    module: 11,
    n: 2,
    title: 'Prima integrazione: chiamare il servizio dal client',
    objective: 'Recuperare l\'elenco dei task dal client, provare richieste non valide, distinguere gli errori e scrivere un esempio di documentazione.',
    explain: [
      NODES_NOTE,
      'Il client chiama il servizio con `curl` (Bash) o `Invoke-RestMethod` (PowerShell), con il token in una variabile d\'ambiente. Ogni richiesta lascia una riga nel registro del SERVER, che puoi leggere con `ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log"` (`tail` mostra le ultime righe di un file).',
      'Un errore ha tre possibili origini: il CLIENT (URL, header, token sbagliati), la RETE (nome, porta) o il SERVER (500, servizio fermo). Lo status HTTP e il registro del server dicono quale.',
    ],
    ...flow,
    pwshOptional: true,
    setup: (c) => setupLab(c, 'ok'),
    guided: [
      { title: 'Elenco dei task', cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks | jq ".data | length"', pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }).data.Count' }, what: 'Chiede l\'elenco dei task e ne conta gli elementi.', who: 'curl + jq / Invoke-RestMethod.', parts: ['-H: header Authorization con il token', '.data | length: quanti elementi'], expect: 'Un numero (i task di prova).', risk: 'Nessuno: il token è nella variabile.' },
      { title: 'Senza token', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Stessa richiesta senza header Authorization.', who: 'Il server rifiuta.', parts: [], expect: '401 Unauthorized.', risk: 'Nessuno.', contains: '401' },
      { title: 'Un percorso inesistente', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/taskz', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/taskz"' }, what: 'Chiama un endpoint che non esiste.', who: 'Il server risponde 404.', parts: [], expect: '404 con route_not_found.', risk: 'Nessuno.', contains: '404' },
      { title: 'Il registro del server', cmd: { bash: 'ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log"', pwsh: 'ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log"' }, what: 'Legge sul server le ultime righe del registro.', who: 'tail, eseguito sul server.', parts: ['-n 5: cinque righe'], expect: 'Le richieste appena fatte, con status e req.', risk: 'Nessuno.', contains: '/v1/tasks' },
    ],
    predict: [
      {
        prompt: 'Una richiesta a un nome di host sbagliato (server.lap) darà uno status HTTP?',
        cmd: { bash: 'curl -sS http://server.lap:8080/v1/health', pwsh: 'curl.exe -sS http://server.lap:8080/v1/health' },
        expect: 'No: curl esce con codice 6 (Could not resolve host). Non arriva alcuna risposta HTTP.',
        why: 'Il nome non esiste: l\'errore è del client (URL), non del server.',
      },
    ],
    negative: {
      prompt: 'Cosa vede il server quando il client sbaglia il percorso?',
      cmd: { bash: 'curl -s $TASKFLOW_URL/v1/taskz; ssh learner@server.lab "tail -n 1 /var/log/taskflow/service.log"', pwsh: 'curl.exe -s "$env:TASKFLOW_URL/v1/taskz"; ssh learner@server.lab "tail -n 1 /var/log/taskflow/service.log"' },
      explain: 'Il registro del server mostra GET /v1/taskz -> 404: stessa informazione dello status lato client, vista dall\'altra parte.',
    },
    task: {
      text: 'In ~/corso-cli/m11l2: (1) ottieni l\'elenco dei task (200); (2) prova la stessa richiesta senza token (401); (3) prova un percorso inesistente (404); (4) leggi sul server il registro delle richieste. Scrivi esempio-api.md come documentazione di GET /v1/tasks: richiesta, header, risposta attesa ed errori possibili. Il token non va scritto nei comandi.',
      criterion: 'Il registro API mostra 200, 401 e 404 verso server.lab; hai letto il registro del server; esempio-api.md contiene richiesta, Authorization, risposta e almeno 401 e 404.',
    },
    checks: [
      {
        id: 'richieste',
        description: 'Tre risposte diverse dal server: 200, 401, 404',
        expected: 'GET /v1/tasks 200 e 401, un percorso inesistente 404',
        test: (c) => missing({ ok200: hit(c, 'GET', /^\/v1\/tasks$/, 200), no401: hit(c, 'GET', /^\/v1\/tasks$/, 401), no404: c.apiShell.some((e) => onServer(e) && e.status === 404) }),
        onFail: 'Servono: l\'elenco con token (200), lo stesso senza token (401) e un percorso che non esiste (404).',
      },
      {
        id: 'registro',
        description: 'Hai letto il registro sul server',
        expected: 'ssh ... tail o cat di service.log, oppure journalctl',
        test: (c) => ({ pass: sshCmd(c, /service\.log|journalctl/), actual: sshCmd(c, /service\.log|journalctl/) ? 'ok' : 'nessuna lettura del registro del server' }),
        onFail: 'Leggi il registro con ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log".',
      },
      {
        id: 'segreti',
        description: 'Il token non è scritto nei comandi',
        expected: 'solo $TASKFLOW_TOKEN / $env:TASKFLOW_TOKEN',
        test: (c) => {
          const leak = c.cmds.find((x) => /tf_test_/.test(x.cmd));
          return { pass: !leak, actual: leak ? 'token in chiaro' : 'ok' };
        },
        onFail: 'Usa la variabile d\'ambiente: un token scritto nel comando resta nella cronologia.',
        errorTag: 'segreti-nei-comandi',
      },
      {
        id: 'documento',
        description: 'esempio-api.md: richiesta, Authorization, risposta, errori',
        expected: 'GET /v1/tasks, Bearer, 200, 401, 404',
        test: (c) => {
          const md = c.read('esempio-api.md') ?? '';
          return missing({ richiesta: /GET\s+\S*\/v1\/tasks/.test(md), auth: /authorization|bearer/i.test(md), risposta: /200/.test(md), e401: /401/.test(md), e404: /404/.test(md) });
        },
        onFail: 'Descrivi richiesta, header Authorization, risposta attesa (200) ed errori (401, 404).',
      },
    ],
    example: { text: 'Esempio analogo: chiamare un altro endpoint dal client.', cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/me', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }' } },
    hints: ['Il token è già in $TASKFLOW_TOKEN; l\'header è Authorization: Bearer <token>.', 'Per vedere lo status usa curl -i (o curl.exe -i in PowerShell).'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l2',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        'curl -s -i $TASKFLOW_URL/v1/tasks',
        'curl -s -i $TASKFLOW_URL/v1/taskz',
        'ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log"',
        `cat > esempio-api.md <<'EOF'\n${ESEMPIO_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l2',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }',
        'curl.exe -s -i "$env:TASKFLOW_URL/v1/tasks"',
        'curl.exe -s -i "$env:TASKFLOW_URL/v1/taskz"',
        'ssh learner@server.lab "tail -n 5 /var/log/taskflow/service.log"',
        `Set-Content esempio-api.md -Value @'\n${ESEMPIO_MD}'@`,
      ],
    },
    summary: ['200, 401, 404 dal punto di vista del client e del server', 'il registro del server conferma ciò che il client vede', 'errore di nome ≠ errore HTTP', 'la documentazione elenca gli errori possibili'],
    skills: ['http', 'diagnosi', 'docs'],
    concepts: ['client e server nelle integrazioni', 'registro del server', 'esempio di documentazione API'],
  },
  {
    id: 'M11.L4',
    module: 11,
    n: 4,
    title: 'Servizio fermo: dal sintomo alla correzione',
    objective: 'Riconoscere una connessione rifiutata, trovare sul server il servizio fermo, riavviarlo e verificarlo.',
    explain: [
      NODES_NOTE,
      'Sintomo: la richiesta non riceve alcuna risposta HTTP (con `curl -sS` — `-s` silenzioso, `-S` mostra comunque gli errori — vedi l\'errore) e curl esce con codice 7 (`Failed to connect`, "connection refused"); in PowerShell "Unable to connect to the remote server". Significa che sulla porta non ascolta nessuno: il nome si risolve, il server è acceso, ma il SERVIZIO non c\'è.',
      'Sul server: `systemctl status taskflow` dice se il servizio è active o inactive; `sudo systemctl start taskflow` lo avvia (start, stop e restart richiedono `sudo`, cioè i privilegi di amministratore); `journalctl -u taskflow -n 10` mostra le ultime righe del suo registro.',
    ],
    ...flow,
    pwshOptional: true,
    setup: (c) => setupLab(c, 'stopped'),
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'curl -sS $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Chiama il servizio mentre è fermo.', who: 'Il client non riesce a connettersi.', parts: ['-S: mostra l\'errore anche con -s'], expect: 'Failed to connect / Unable to connect to the remote server.', risk: 'Nessuno.', fails: true },
      { title: 'La porta', cmd: { bash: 'nc -zv server.lab 8080', pwsh: 'Test-NetConnection server.lab -Port 8080' }, what: 'Conferma che la porta non accetta connessioni.', who: 'nc / Test-NetConnection.', parts: [], expect: 'Connection refused / TcpTestSucceeded False.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: 'refused', pwsh: 'False' } },
      { title: 'Il servizio sul server', cmd: { bash: 'ssh learner@server.lab "systemctl status taskflow"', pwsh: 'ssh learner@server.lab "systemctl status taskflow"' }, what: 'Chiede al server perché non risponde.', who: 'systemctl, eseguito sul server.', parts: [], expect: 'inactive (dead): il servizio è fermo.', risk: 'Nessuno.', fails: true, contains: 'inactive' },
      { title: 'Il registro', cmd: { bash: 'ssh learner@server.lab "journalctl -u taskflow -n 5"', pwsh: 'ssh learner@server.lab "journalctl -u taskflow -n 5"' }, what: 'Legge le ultime righe del registro del servizio.', who: 'journalctl, eseguito sul server.', parts: ['-u taskflow: solo questo servizio', '-n 5: cinque righe'], expect: 'Un arresto ricevuto (SIGTERM).', risk: 'Nessuno.', contains: 'SIGTERM' },
      { title: 'Senza privilegi', cmd: { bash: 'ssh learner@server.lab "systemctl start taskflow"', pwsh: 'ssh learner@server.lab "systemctl start taskflow"' }, what: 'Prova ad avviare il servizio senza sudo.', who: 'systemctl rifiuta: serve l\'amministratore.', parts: [], expect: 'Interactive authentication required.', risk: 'Nessuno: non viene cambiato nulla.', fails: true, contains: 'authentication required' },
    ],
    predict: [
      {
        prompt: 'Dopo `sudo systemctl start taskflow` sul server, la stessa richiesta del client funzionerà senza altre modifiche?',
        cmd: { bash: 'ssh learner@server.lab "sudo systemctl start taskflow"', pwsh: 'ssh learner@server.lab "sudo systemctl start taskflow"' },
        expect: 'Sì: la porta 8080 torna in ascolto e la richiesta del client riceve 200.',
        why: 'Il client non era sbagliato: mancava il servizio.',
      },
    ],
    negative: {
      prompt: 'E se riavvii un servizio già attivo?',
      cmd: { bash: 'ssh learner@server.lab "sudo systemctl start taskflow; systemctl is-active taskflow"', pwsh: 'ssh learner@server.lab "sudo systemctl start taskflow; systemctl is-active taskflow"' },
      explain: 'start su un servizio già attivo non cambia nulla; is-active risponde "active". Per forzare un riavvio si usa restart.',
    },
    task: {
      text: 'In ~/corso-cli/m11l4: riproduci il sintomo dal client (richiesta a /v1/health senza risposta), cerca la causa sul server con systemctl status e journalctl, avvia il servizio con sudo systemctl start taskflow, verifica con GET /v1/health (200). Scrivi diagnosi.md: sintomo, livello del problema (rete, porta, servizio o applicazione), come l\'hai verificato, correzione e prova finale.',
      criterion: 'Il registro mostra una richiesta fallita prima della correzione, systemctl status e journalctl sul server, l\'avvio con sudo e un 200 finale; il servizio è attivo; diagnosi.md spiega sintomo, causa e correzione.',
    },
    checks: [
      {
        id: 'sintomo',
        description: 'Hai provato la richiesta prima della correzione (fallita)',
        expected: 'una richiesta al server terminata con errore di connessione',
        test: (c) => ({ pass: c.cmds.some((x) => x.exit !== 0 && /TASKFLOW_URL|server\.lab/.test(x.cmd) && !/\bssh\b/.test(x.cmd)), actual: 'controllo sui comandi' }),
        onFail: 'Riproduci prima il sintomo: una richiesta a $TASKFLOW_URL/v1/health che fallisce per connessione rifiutata.',
      },
      {
        id: 'analisi',
        description: 'Hai cercato la causa sul server (status e journal)',
        expected: 'ssh ... systemctl status taskflow e ssh ... journalctl',
        test: (c) => missing({ status: sshCmd(c, /systemctl status taskflow/, false), journal: sshCmd(c, /journalctl/) }),
        onFail: 'Sul server: systemctl status taskflow e journalctl -u taskflow.',
      },
      {
        id: 'correzione',
        description: 'Servizio avviato con sudo e 200 finale',
        expected: 'sudo systemctl start taskflow, servizio attivo, GET /v1/health 200',
        test: (c) => missing({ start: sshCmd(c, /sudo systemctl (start|restart) taskflow/), attivo: !!c.state.lab?.running, health: hit(c, 'GET', /^\/v1\/health/, 200) }),
        onFail: 'Avvia il servizio sul server con sudo systemctl start taskflow e poi ripeti la richiesta dal client.',
      },
      {
        id: 'documento',
        description: 'diagnosi.md: sintomo, causa, correzione, prova',
        expected: 'rifiutata/refused, inactive/fermo, systemctl, 200',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return missing({ sintomo: /rifiut|refused|codice 7/i.test(md), causa: /inactive|ferm|non attivo/i.test(md), correzione: /systemctl/i.test(md), prova: /200/.test(md) });
        },
        onFail: 'Scrivi sintomo (connessione rifiutata), causa (servizio fermo), correzione (systemctl start) e prova (200).',
      },
    ],
    example: { text: 'Esempio analogo: verificare se un servizio è attivo.', cmd: { bash: 'ssh learner@server.lab "systemctl is-active taskflow-db"', pwsh: 'ssh learner@server.lab "systemctl is-active taskflow-db"' } },
    hints: ['Un rifiuto di connessione con nome risolto = la porta non ascolta.', 'systemctl status e journalctl non richiedono sudo; start sì.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l4',
        'curl -sS $TASKFLOW_URL/v1/health',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "journalctl -u taskflow -n 5"',
        'ssh learner@server.lab "sudo systemctl start taskflow"',
        'curl -s $TASKFLOW_URL/v1/health',
        `cat > diagnosi.md <<'EOF'\n${SERVIZIO_FERMO_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l4',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "journalctl -u taskflow -n 5"',
        'ssh learner@server.lab "sudo systemctl start taskflow"',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        `Set-Content diagnosi.md -Value @'\n${SERVIZIO_FERMO_MD}'@`,
      ],
    },
    summary: ['connessione rifiutata = nessuno ascolta sulla porta', 'status e journal per capire, sudo systemctl start per correggere', 'ripetere la richiesta del client è la prova finale'],
    skills: ['diagnosi', 'comandi', 'docs'],
    concepts: ['connessione rifiutata', 'systemctl', 'journalctl', 'sudo'],
  },
  {
    id: 'M11.L5',
    module: 11,
    n: 5,
    title: 'Porta sbagliata: il servizio è attivo ma non dove ti aspetti',
    objective: 'Scoprire che il servizio ascolta su una porta diversa da quella documentata e correggere la configurazione del server.',
    explain: [
      NODES_NOTE,
      'Qui il servizio è ATTIVO (systemctl status dice active) ma il client riceve comunque "connection refused" sulla 8080. `ss -tlnp` sul server mostra la porta su cui taskflow ascolta davvero, e il file `/etc/taskflow/taskflow.env` (riga `PORT=`) mostra quella configurata.',
      'Si può correggere il CLIENT (usare la porta giusta) o il SERVER (rispettare la porta documentata). La documentazione dice 8080: se è il contratto con altri client, si corregge il server. Per modificare una riga di un file con un solo comando si usa `sed -i "s/vecchio/nuovo/" file` (`-i` modifica il file in place); il servizio rilegge la configurazione solo con `sudo systemctl restart taskflow`.',
    ],
    ...flow,
    pwshOptional: true,
    setup: (c) => setupLab(c, 'wrong_port'),
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'curl -sS $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Chiama la porta documentata.', who: 'Il client non si connette.', parts: [], expect: 'Connessione rifiutata.', risk: 'Nessuno.', fails: true },
      { title: 'Il servizio è attivo?', cmd: { bash: 'ssh learner@server.lab "systemctl is-active taskflow"', pwsh: 'ssh learner@server.lab "systemctl is-active taskflow"' }, what: 'Verifica se il processo esiste.', who: 'systemctl is-active.', parts: [], expect: 'active.', risk: 'Nessuno.', contains: 'active' },
      { title: 'Su quale porta ascolta?', cmd: { bash: 'ssh learner@server.lab "ss -tlnp"', pwsh: 'ssh learner@server.lab "ss -tlnp"' }, what: 'Elenca le porte in ascolto.', who: 'ss, sul server.', parts: [], expect: 'taskflow sulla 9090, non sulla 8080.', risk: 'Nessuno.', contains: '9090' },
      { title: 'La configurazione', cmd: { bash: 'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"', pwsh: 'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"' }, what: 'Legge il file di configurazione del servizio.', who: 'cat, sul server.', parts: [], expect: 'PORT=9090.', risk: 'Nessuno.', contains: 'PORT=9090' },
    ],
    predict: [
      {
        prompt: 'Se cambi solo il file di configurazione, senza riavviare, il client riesce a connettersi sulla 8080?',
        cmd: { bash: 'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env; ss -tlnp"', pwsh: 'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env; ss -tlnp"' },
        expect: 'No: il processo in esecuzione ascolta ancora sulla 9090 finché non viene riavviato.',
        why: 'Il file è letto all\'avvio: modificarlo non cambia un processo già partito.',
      },
    ],
    negative: {
      prompt: 'Correggere il client invece del server: la porta 9090 funziona?',
      cmd: { bash: 'curl -s http://server.lab:9090/v1/health', pwsh: 'Invoke-RestMethod http://server.lab:9090/v1/health' },
      explain: 'Funziona (200): il servizio è sano. Ma ora il client usa una porta diversa da quella documentata: è una scelta da dichiarare, perché gli altri client continuano a puntare alla 8080.',
    },
    task: {
      text: 'In ~/corso-cli/m11l5: riproduci il sintomo, trova sul server la porta reale (ss) e la configurazione, correggi PORT=8080 con sed, riavvia il servizio e verifica dal client con GET /v1/health sulla porta documentata. Scrivi diagnosi.md: sintomo, evidenze (porta in ascolto e riga PORT), causa, correzione e prova finale.',
      criterion: 'Il file di configurazione contiene PORT=8080, il servizio ascolta sulla 8080, il registro mostra un 200 dal client; diagnosi.md cita 9090, 8080, sed o la riga PORT e il riavvio.',
    },
    checks: [
      {
        id: 'evidenze',
        description: 'Hai guardato porte in ascolto e configurazione sul server',
        expected: 'ssh ... ss e ssh ... taskflow.env',
        test: (c) => missing({ ss: sshCmd(c, /\bss\b/), config: sshCmd(c, /taskflow\.env/) }),
        onFail: 'Controlla con ss -tlnp la porta reale e con cat /etc/taskflow/taskflow.env la porta configurata.',
      },
      {
        id: 'stato',
        description: 'Configurazione e servizio sulla porta documentata',
        expected: 'PORT=8080 e servizio in ascolto sulla 8080',
        test: (c) => ({ pass: c.state.lab?.configPort === 8080 && !!c.state.lab?.running && c.state.lab.port === 8080, actual: `config=${c.state.lab?.configPort} in ascolto=${c.state.lab?.running ? c.state.lab.port : 'no'}` }),
        onFail: 'Modifica PORT=8080 (sed -i con sudo) e riavvia: sudo systemctl restart taskflow.',
      },
      {
        id: 'prova',
        description: 'GET /v1/health dal client risponde 200 sulla 8080',
        expected: '200 su server.lab:8080',
        test: (c) => {
          const ok = c.apiShell.some((e) => onServer(e) && /^\/v1\/health/.test(e.path) && e.status === 200 && c.cmds.some((x) => /8080|TASKFLOW_URL/.test(x.cmd)));
          return { pass: ok, actual: ok ? 'ok' : 'nessun 200 dopo la correzione' };
        },
        onFail: 'Ripeti la richiesta con $TASKFLOW_URL (porta 8080) dopo il riavvio.',
      },
      {
        id: 'documento',
        description: 'diagnosi.md: 9090, 8080, PORT/sed, riavvio',
        expected: 'porta reale, porta documentata, correzione, riavvio',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return missing({ p9090: /9090/.test(md), p8080: /8080/.test(md), correzione: /PORT|sed/i.test(md), riavvio: /restart|riavvi/i.test(md) });
        },
        onFail: 'Scrivi quale porta è in ascolto (9090), quale è documentata (8080), cosa hai cambiato e che hai riavviato il servizio.',
      },
    ],
    example: { text: 'Esempio analogo: leggere la porta configurata.', cmd: { bash: 'ssh learner@server.lab "grep PORT /etc/taskflow/taskflow.env"', pwsh: 'ssh learner@server.lab "grep PORT /etc/taskflow/taskflow.env"' } },
    hints: ['ss -tlnp dice dove ascolta davvero; il file .env dice dove DOVREBBE ascoltare.', 'sed -i "s/9090/8080/" modifica il file; poi serve il riavvio.', 'Tutto in un comando: sudo sed -i ... && sudo systemctl restart taskflow.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l5',
        'curl -sS $TASKFLOW_URL/v1/health',
        'ssh learner@server.lab "ss -tlnp"',
        'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"',
        'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env && sudo systemctl restart taskflow"',
        'curl -s $TASKFLOW_URL/v1/health',
        `cat > diagnosi.md <<'EOF'\n${PORTA_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l5',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        'ssh learner@server.lab "ss -tlnp"',
        'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"',
        'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env && sudo systemctl restart taskflow"',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        `Set-Content diagnosi.md -Value @'\n${PORTA_MD}'@`,
      ],
    },
    summary: ['servizio attivo ≠ servizio sulla porta giusta', 'ss mostra la porta reale, il .env quella configurata', 'la configurazione si rilegge solo al riavvio', 'correggere client o server è una scelta da documentare'],
    skills: ['diagnosi', 'comandi', 'docs'],
    concepts: ['porta in ascolto', 'file di configurazione', 'riavvio del servizio', 'sed -i'],
  },
  {
    id: 'M11.L6',
    module: 11,
    n: 6,
    title: 'Errore 500: la causa è su un altro servizio',
    objective: 'Distinguere un errore del server da uno del client, trovare nel registro la dipendenza che manca e ripristinarla.',
    explain: [
      NODES_NOTE,
      'Qui la rete e il servizio sono a posto: /v1/health risponde 200. Ma /v1/tasks risponde 500 `database_unavailable`. Un 5xx è un errore del SERVER: il client ha fatto una richiesta valida. La causa va cercata nel registro del server (`journalctl -u taskflow`, oppure `grep` sul file service.log per filtrare le righe ERROR).',
      'TaskFlow dipende da un altro servizio, il database (`taskflow-db`). Se è fermo, l\'applicazione parte ma non può leggere i dati. `sudo systemctl start taskflow-db` lo riavvia; il servizio principale non va toccato.',
    ],
    ...flow,
    pwshOptional: true,
    setup: (c) => setupLab(c, 'db_down'),
    guided: [
      { title: 'La salute', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Chiama l\'endpoint di salute.', who: 'Il servizio risponde.', parts: [], expect: 'status ok: il servizio è raggiungibile.', risk: 'Nessuno.', contains: 'ok' },
      { title: 'L\'errore', cmd: { bash: 'curl -s -i -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -i -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Chiede l\'elenco dei task.', who: 'Il server risponde 500.', parts: [], expect: '500 con database_unavailable.', risk: 'Nessuno.', contains: 'database_unavailable' },
      { title: 'Le righe di errore', cmd: { bash: 'ssh learner@server.lab "grep ERROR /var/log/taskflow/service.log"', pwsh: 'ssh learner@server.lab "grep ERROR /var/log/taskflow/service.log"' }, what: 'Filtra sul server le righe ERROR del registro.', who: 'grep, sul server.', parts: [], expect: 'La connessione al database persa e il 500.', risk: 'Nessuno.', contains: 'ERROR' },
      { title: 'Il database', cmd: { bash: 'ssh learner@server.lab "systemctl status taskflow-db"', pwsh: 'ssh learner@server.lab "systemctl status taskflow-db"' }, what: 'Controlla il servizio da cui dipende TaskFlow.', who: 'systemctl.', parts: [], expect: 'inactive (dead).', risk: 'Nessuno.', fails: true, contains: 'inactive' },
    ],
    predict: [
      {
        prompt: 'Se riavvii taskflow (e non il database), l\'errore 500 sparisce?',
        cmd: { bash: 'ssh learner@server.lab "sudo systemctl restart taskflow"', pwsh: 'ssh learner@server.lab "sudo systemctl restart taskflow"' },
        expect: 'No: il servizio riparte ma il database è ancora fermo.',
        why: 'Si ripara la causa, non il sintomo. Il registro dice che manca il database.',
      },
    ],
    negative: {
      prompt: 'Lo stesso errore con una richiesta non valida (senza token):',
      cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/tasks"' },
      explain: 'Risponde 401 e non 500: l\'autenticazione viene controllata prima di toccare il database. Uno status 4xx indica un problema della richiesta, 5xx del server.',
    },
    task: {
      text: 'In ~/corso-cli/m11l6: dal client ottieni il 500 su GET /v1/tasks (con token), dal server trova la causa nel registro e nello stato dei servizi, avvia il servizio mancante con sudo systemctl start taskflow-db e verifica che GET /v1/tasks risponda 200. Scrivi diagnosi.md: sintomo, perché non è un errore del client, evidenza nel registro, correzione e prova.',
      criterion: 'Il registro API mostra 500 poi 200 su GET /v1/tasks; il database è attivo; hai letto il registro del server; diagnosi.md cita 500, database, journalctl o service.log e systemctl.',
    },
    checks: [
      {
        id: 'sintomo',
        description: 'Hai ottenuto il 500 e poi il 200 su GET /v1/tasks',
        expected: '500 prima, 200 dopo',
        test: (c) => {
          const seq = c.apiShell.filter((e) => onServer(e) && e.method === 'GET' && e.path === '/v1/tasks').map((e) => e.status);
          const i5 = seq.indexOf(500);
          return { pass: i5 >= 0 && seq.slice(i5).includes(200), actual: seq.join(', ') || 'nessuna richiesta' };
        },
        onFail: 'Chiama /v1/tasks con il token: prima della correzione 500, dopo 200.',
      },
      {
        id: 'causa',
        description: 'Hai cercato la causa nel registro del server',
        expected: 'ssh ... journalctl o service.log',
        test: (c) => ({ pass: sshCmd(c, /journalctl|service\.log/), actual: sshCmd(c, /journalctl|service\.log/) ? 'ok' : 'nessuna lettura del registro' }),
        onFail: 'Leggi il registro: ssh learner@server.lab "journalctl -u taskflow -n 10".',
      },
      {
        id: 'correzione',
        description: 'Database avviato con sudo systemctl',
        expected: 'sudo systemctl start taskflow-db',
        test: (c) => missing({ db: !!c.state.lab?.dbUp, comando: sshCmd(c, /sudo systemctl (start|restart) taskflow-db/) }),
        onFail: 'Avvia solo il database: sudo systemctl start taskflow-db.',
      },
      {
        id: 'documento',
        description: 'diagnosi.md: 500, database, registro, systemctl',
        expected: '500, database, journalctl/service.log, systemctl',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return missing({ s500: /500/.test(md), db: /database|taskflow-db/i.test(md), registro: /journalctl|service\.log|registro/i.test(md), systemctl: /systemctl/i.test(md) });
        },
        onFail: 'Scrivi sintomo (500), causa (database fermo), dove l\'hai visto (registro) e come l\'hai corretto (systemctl).',
      },
    ],
    example: { text: 'Esempio analogo: leggere solo le ultime righe del registro del servizio.', cmd: { bash: 'ssh learner@server.lab "journalctl -u taskflow -n 3"', pwsh: 'ssh learner@server.lab "journalctl -u taskflow -n 3"' } },
    hints: ['5xx = problema del server; il client ha fatto una richiesta valida.', 'Nel registro cerca ERROR: indica quale dipendenza manca.', 'Non serve riavviare taskflow: riavvia ciò che manca.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l6',
        'curl -s -i -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        'ssh learner@server.lab "journalctl -u taskflow -n 10"',
        'ssh learner@server.lab "systemctl status taskflow-db"',
        'ssh learner@server.lab "sudo systemctl start taskflow-db"',
        'curl -s -i -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        `cat > diagnosi.md <<'EOF'\n${DATABASE_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l6',
        'curl.exe -s -i -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"',
        'ssh learner@server.lab "journalctl -u taskflow -n 10"',
        'ssh learner@server.lab "systemctl status taskflow-db"',
        'ssh learner@server.lab "sudo systemctl start taskflow-db"',
        'curl.exe -s -i -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"',
        `Set-Content diagnosi.md -Value @'\n${DATABASE_MD}'@`,
      ],
    },
    summary: ['5xx = server, 4xx = richiesta', 'health 200 non garantisce che tutto funzioni', 'il registro indica la dipendenza che manca', 'si ripara la causa, non il sintomo'],
    skills: ['diagnosi', 'http', 'docs'],
    concepts: ['errore 500', 'dipendenze tra servizi', 'registro del server'],
  },
  {
    id: 'M11.L10',
    module: 11,
    n: 10,
    title: 'Verifica finale: integrazione documentata',
    objective: 'Partire da un sistema che non funziona, individuare più cause in sequenza, ripristinarlo e consegnare un rapporto utilizzabile da un altro tecnico.',
    explain: [
      NODES_NOTE,
      'Il sistema ha PIÙ problemi insieme e non conosci l\'ordine: ogni correzione può rivelare il successivo. Procedi per livelli (rete, porta, servizio, applicazione), cambia UNA cosa alla volta e ripeti la prova del client dopo ciascuna correzione.',
      'Non c\'è una soluzione guidata. Consegna un rapporto con sintomi, cause nell\'ordine in cui sono emerse, correzioni, verifica finale ed esempio di richiesta: un altro tecnico deve poter ripetere la diagnosi leggendolo.',
    ],
    ...flow,
    pwshOptional: true,
    autonomous: true,
    setup: (c) => setupLab(c, 'multi'),
    guided: [
      { title: 'Il punto di partenza', cmd: { bash: 'curl -sS $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Prova la richiesta più semplice.', who: 'Il client non riceve risposta.', parts: [], expect: 'Connessione rifiutata.', risk: 'Nessuno.', fails: true },
      { title: 'Cosa ascolta sul server', cmd: { bash: 'ssh learner@server.lab "ss -tlnp"', pwsh: 'ssh learner@server.lab "ss -tlnp"' }, what: 'Elenca le porte in ascolto.', who: 'ss, sul server.', parts: [], expect: 'Solo sshd: taskflow non ascolta.', risk: 'Nessuno.', contains: 'sshd' },
      { title: 'Lo stato dei servizi', cmd: { bash: 'ssh learner@server.lab "systemctl status taskflow"', pwsh: 'ssh learner@server.lab "systemctl status taskflow"' }, what: 'Controlla il servizio principale.', who: 'systemctl, sul server.', parts: [], expect: 'inactive (dead).', risk: 'Nessuno.', fails: true, contains: 'inactive' },
    ],
    predict: [],
    negative: {
      prompt: 'Una richiesta valida a un servizio fermo dà uno status HTTP?',
      cmd: { bash: 'curl -sS -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health', pwsh: 'curl.exe -sS -o NUL -w "%{http_code}" "$env:TASKFLOW_URL/v1/health"' },
      explain: 'Stampa 000 (curl): nessuna risposta HTTP. Lo status esiste solo se qualcuno ascolta.',
    },
    task: {
      text: 'Il client in ~/corso-cli/m11l10 deve ottenere 200 da GET /v1/tasks (con token) sulla porta DOCUMENTATA 8080 di server.lab. Diagnostica e ripristina il sistema senza spegnere nulla di ciò che funziona; poi scrivi rapporto.md con: sintomi, cause nell\'ordine in cui sono emerse, correzioni, verifica finale ed esempio di richiesta (senza token in chiaro).',
      criterion: 'GET /v1/tasks risponde 200 dal client sulla 8080; configurazione, servizio e database sono a posto; rapporto.md elenca le tre cause (servizio fermo, porta, database), le correzioni e un esempio di richiesta.',
    },
    checks: [
      {
        id: 'sistema',
        description: 'Servizio, porta documentata e database ripristinati',
        expected: 'taskflow attivo sulla 8080, PORT=8080, taskflow-db attivo',
        test: (c) => {
          const l = c.state.lab;
          return { pass: !!l && l.running && l.port === 8080 && l.configPort === 8080 && l.dbUp, actual: l ? `attivo=${l.running} porta=${l.port} config=${l.configPort} db=${l.dbUp}` : 'laboratorio assente' };
        },
        onFail: 'Controlla in ordine: servizio (systemctl status), porta (ss e taskflow.env), database (taskflow-db).',
      },
      {
        id: 'prova',
        description: 'GET /v1/tasks risponde 200 dal client sulla porta documentata',
        expected: '200 su server.lab:8080',
        test: (c) => ({ pass: hit(c, 'GET', /^\/v1\/tasks/, 200), actual: hit(c, 'GET', /^\/v1\/tasks/, 200) ? 'ok' : 'nessun 200 su /v1/tasks' }),
        onFail: 'Ripeti la richiesta dal client con $TASKFLOW_URL e il token.',
      },
      {
        id: 'metodo',
        description: 'Hai indagato sul server con i comandi di diagnosi',
        expected: 'systemctl status, ss e registro (journalctl o service.log)',
        test: (c) => missing({ status: sshCmd(c, /systemctl status/, false), ss: sshCmd(c, /\bss\b/), registro: sshCmd(c, /journalctl|service\.log/) }),
        onFail: 'Usa status, ss e il registro per capire prima di correggere.',
      },
      {
        id: 'segreti',
        description: 'Il token non è scritto nei comandi',
        expected: 'solo variabile d\'ambiente',
        test: (c) => ({ pass: !c.cmds.some((x) => /tf_test_/.test(x.cmd)), actual: c.cmds.some((x) => /tf_test_/.test(x.cmd)) ? 'token in chiaro' : 'ok' }),
        onFail: 'Usa $TASKFLOW_TOKEN.',
        errorTag: 'segreti-nei-comandi',
      },
      {
        id: 'rapporto',
        description: 'rapporto.md: sintomi, tre cause, correzioni, verifica, esempio',
        expected: 'rifiutata, fermo/inactive, 9090/8080, database, systemctl, 200, curl o Invoke-RestMethod',
        test: (c) => {
          const md = c.read('rapporto.md') ?? '';
          return missing({
            sintomi: /rifiut|refused|sintom/i.test(md),
            fermo: /inactive|ferm|non attivo/i.test(md),
            porta: /9090/.test(md) && /8080/.test(md),
            database: /database|taskflow-db/i.test(md),
            correzioni: /systemctl/i.test(md),
            verifica: /200/.test(md),
            esempio: /curl|Invoke-RestMethod/i.test(md),
          });
        },
        onFail: 'Il rapporto deve permettere a un altro tecnico di ripetere la diagnosi: sintomi, tre cause nell\'ordine, correzioni, verifica finale (200) ed esempio di richiesta.',
      },
    ],
    example: { text: 'Esempio analogo: procedura generale, su un altro servizio.', cmd: { bash: 'ssh learner@server.lab "systemctl is-active taskflow-db"', pwsh: 'ssh learner@server.lab "systemctl is-active taskflow-db"' } },
    hints: ['Prova dal basso: rete → porta → servizio → applicazione.', 'Dopo ogni correzione ripeti la richiesta del client: può emergere un altro problema.', 'La porta documentata è 8080: non adattare il client alla configurazione sbagliata.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m11l10',
        'curl -sS $TASKFLOW_URL/v1/health',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"',
        'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env && sudo systemctl start taskflow"',
        'ssh learner@server.lab "ss -tlnp"',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        'ssh learner@server.lab "journalctl -u taskflow -n 10"',
        'ssh learner@server.lab "sudo systemctl start taskflow-db"',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        `cat > rapporto.md <<'EOF'\n${RAPPORTO_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l10',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"',
        'ssh learner@server.lab "systemctl status taskflow"',
        'ssh learner@server.lab "cat /etc/taskflow/taskflow.env"',
        'ssh learner@server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env && sudo systemctl start taskflow"',
        'ssh learner@server.lab "ss -tlnp"',
        'curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"',
        'ssh learner@server.lab "journalctl -u taskflow -n 10"',
        'ssh learner@server.lab "sudo systemctl start taskflow-db"',
        'curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"',
        `Set-Content rapporto.md -Value @'\n${RAPPORTO_MD}'@`,
      ],
    },
    summary: ['più cause si nascondono a vicenda', 'una correzione alla volta, prova dopo ciascuna', 'il rapporto permette a un altro tecnico di ripetere la diagnosi'],
    skills: ['diagnosi', 'autonomia', 'docs'],
    concepts: ['diagnosi con più cause su due nodi', 'rapporto di diagnosi'],
  },
];
