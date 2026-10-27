/**
 * M11 — lezioni aggiunte il 2026-10-27: dove viene interpretato un comando via ssh, log di client e server,
 * porta filtrata dal firewall, nome che punta all'indirizzo sbagliato, seconda verifica finale.
 */
import type { Lesson, CheckCtx } from '../types.ts';
import type { ApiLogEntry } from '../../engine/types.ts';
import { hostsFileLookup, labScenario, type LabScenario } from '../../engine/lab.ts';
import { parseTables } from '../../docs/lint.ts';
import { ranCmd, pick, setupApi } from './helpers.ts';
import type { SetupCtx } from '../types.ts';

const SERVER_HOSTS = ['server.lab', '192.168.50.10'];
const onServer = (e: ApiLogEntry): boolean => !!e.host && SERVER_HOSTS.includes(e.host);
const AUTH = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const PS_AUTH = '-H "Authorization: Bearer $env:TASKFLOW_TOKEN"';
const missing = (ok: Record<string, boolean>): { pass: boolean; actual: string } => ({ pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' });
const sshCmd = (c: CheckCtx, re: RegExp, okOnly = true): boolean => ranCmd(c, new RegExp('\\bssh\\b.*(?:' + re.source + ')', re.flags), okOnly);

function setupLab(c: SetupCtx, scenario: LabScenario, opts: { token?: boolean } = {}): void {
  setupApi(c, { env: 'testing', token: opts.token === false ? false : 'valid', url: 'http://server.lab:8080' });
  labScenario(c.state, scenario);
}

const QUOTING_MD = `# Dove viene interpretato un comando passato a ssh

Un comando scritto dopo ssh passa DUE volte da una shell: prima quella del client, poi quella del server. I tipi di virgolette decidono cosa viene interpretato dove.

| Comando | Dove viene interpretato | Risultato | Perché |
|---|---|---|---|
| ssh server "echo $(hostname)" | $(hostname) sul client, echo sul server | lab | tra virgolette doppie il client espande $(...) prima di inviare il comando |
| ssh server 'echo $(hostname)' | tutto sul server | server | tra apici singoli il client non tocca nulla |
| ssh server "cat /etc/hostname" > locale.txt | il comando sul server, la redirezione sul client | il file è sul client | > è letto dalla shell del client |
| ssh server "echo ciao > /tmp/nota.txt" | tutto sul server | il file è sul server | la redirezione è dentro le virgolette |

Regola pratica: per mandare il comando esattamente com'è, usare gli apici singoli (in PowerShell 5.1 con attenzione alle virgolette doppie interne, che si perdono); per usare un valore del client, le virgolette doppie.
`;

const TRACCE_NOTE = 'Il log del server riporta per ogni richiesta metodo, percorso, status e req=<identificativo>.';

const FIREWALL_MD = `# Diagnosi: la porta non risponde ma il servizio è attivo

## Sintomo

Dal client la richiesta a server.lab:8080 non riceve risposta e dopo il timeout curl esce con codice 28 (Timeout was reached).

## Perché non è una porta chiusa

Una porta chiusa rifiuta subito la connessione (codice 7). Qui nessuno risponde: i pacchetti vengono scartati. Il ping funziona (il server è acceso), il servizio risulta attivo (systemctl) e in locale sul server curl localhost:8080 risponde.

## Prove

- ping server.lab: risponde.
- nc -zv -w 2 server.lab 8080: timed out.
- ssh: systemctl is-active taskflow: active; curl localhost:8080/v1/health: 200.
- ssh: sudo ufw status: la porta 8080 ha la regola DENY.

## Causa

Una regola del firewall del server scarta i pacchetti verso la porta 8080.

## Correzione

sudo ufw allow 8080/tcp sul server.

## Prova finale

GET /v1/health dal client risponde 200.
`;

const NOME_MD = `# Diagnosi: il nome del server punta all'indirizzo sbagliato

## Sintomo

Dal client curl verso server.lab non si connette (codice 7) e il ping dice Destination Host Unreachable, ma il server è acceso e raggiungibile con il suo indirizzo 192.168.50.10.

## Le prove

- nslookup (che interroga il DNS) risponde 192.168.50.10: il DNS è corretto.
- getent hosts server.lab e ping usano anche il file /etc/hosts e vedono 192.168.50.11.
- Il file /etc/hosts del client contiene una riga errata: 192.168.50.11 server.lab.

## Causa

Una riga sbagliata nel file hosts ha la precedenza sul DNS e manda il nome a un indirizzo inesistente.

## Correzione

Eliminare la riga errata da /etc/hosts (sudo sed -i). In attesa della correzione si può usare l'indirizzo 192.168.50.10 al posto del nome.

## Prova finale

GET /v1/health verso server.lab risponde 200.
`;

const RAPPORTO2_MD = `# Rapporto di diagnosi: seconda verifica

## Sintomi

Dal client il servizio non risponde: il nome server.lab non si raggiunge (ping: Destination Host Unreachable).

## Cause, nell'ordine in cui sono emerse

1. Nome: la riga errata nel file hosts del client manda server.lab a 192.168.50.11 (nslookup dà l'indirizzo giusto, il file hosts ha la precedenza).
2. Firewall: dopo aver corretto il nome la richiesta va in timeout (codice 28); sul server il servizio è attivo e risponde in locale, ma ufw ha una regola DENY sulla porta 8080.
3. Database: con il firewall aperto /v1/health risponde 200 ma /v1/tasks dà 500 database_unavailable; taskflow-db è inactive.

## Correzioni

Rimossa la riga da /etc/hosts, sudo ufw allow 8080/tcp, sudo systemctl start taskflow-db.

## Verifica finale

GET /v1/tasks risponde 200 sulla porta documentata 8080.

## Esempio di richiesta

curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" http://server.lab:8080/v1/tasks
`;

export const m11b: Lesson[] = [
  {
    id: 'M11.L3',
    module: 11,
    n: 3,
    title: 'Dove viene interpretato il comando: client o server?',
    objective: 'Prevedere, dal tipo di virgolette e dalla posizione di pipe e redirezioni, se un comando passato a ssh viene interpretato dal client o dal server.',
    explain: [
      'Un comando scritto dopo `ssh` passa DUE volte da una shell: prima la tua (il client), che lo interpreta, poi quella del server, che riceve il testo risultante. Ciò che la shell del client espande prima di inviare (variabili, `$(...)`, `~`, pipe e redirezioni fuori dalle virgolette) riguarda il CLIENT; ciò che arriva intatto viene eseguito sul SERVER.',
      'Le virgolette decidono: tra virgolette DOPPIE il client espande `$(hostname)` e `$PWD` (otterrai il nome e la cartella del client); tra apici SINGOLI il testo parte così com\'è (otterrai il nome del server). Una redirezione `> file` fuori dalle virgolette scrive sul client; dentro le virgolette sul server. In PowerShell 5.1 valgono le stesse regole per `"…"` e `\'…\'`, ma le virgolette doppie dentro un testo tra apici vengono perse quando PowerShell chiama ssh (programma esterno).',
      'I file creati sul server restano lì: li ritrovi con un altro `ssh server "cat /tmp/nota.txt"` (nel laboratorio persistono tra un ssh e l\'altro, in /tmp e nella home). Per verificare dove è finito un file, chiedi a entrambi i nodi.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setupLab(c, 'ok'),
    guided: [
      { title: 'Chi espande $(hostname)?', cmd: { bash: 'ssh learner@server.lab "echo $(hostname)"', pwsh: 'ssh learner@server.lab "echo $(hostname)"' }, what: 'Il comando tra virgolette doppie contiene una sostituzione.', who: 'La shell del client la esegue prima di inviare il comando.', parts: ['$(hostname): nome del computer che esegue'], expect: 'lab: è il nome del client.', risk: 'Nessuno.', contains: 'lab' },
      { title: 'Con gli apici singoli', cmd: { bash: "ssh learner@server.lab 'echo $(hostname)'", pwsh: "ssh learner@server.lab 'echo $(hostname)'" }, what: 'Stesso comando, apici singoli.', who: 'Il client non espande nulla: la sostituzione avviene sul server.', parts: [], expect: 'server: è il nome del server.', risk: 'Nessuno.', contains: 'server' },
      { title: 'Dove va la redirezione', cmd: { bash: 'cd ~/corso-cli/m11l3 && ssh learner@server.lab "cat /etc/hostname" > locale.txt && cat locale.txt', pwsh: 'cd ~/corso-cli/m11l3; ssh learner@server.lab "cat /etc/hostname" > locale.txt; Get-Content locale.txt' }, what: 'Il > è fuori dalle virgolette.', who: 'La redirezione è della shell del client: il file nasce qui.', parts: [], expect: 'Il file locale.txt contiene server (l\'output del comando remoto, salvato sul client).', risk: 'Nessuno.', contains: 'server' },
      { title: 'Creare un file sul server', cmd: { bash: "ssh learner@server.lab \"echo 'scritto sul server' > /tmp/nota.txt\" && ssh learner@server.lab \"cat /tmp/nota.txt\"", pwsh: "ssh learner@server.lab \"echo 'scritto sul server' > /tmp/nota.txt\"; ssh learner@server.lab \"cat /tmp/nota.txt\"" }, what: 'Questa volta il > è DENTRO le virgolette.', who: 'Lo interpreta la shell del server.', parts: [], expect: 'scritto sul server (letto con un secondo ssh).', risk: 'Nessuno.', contains: 'scritto sul server' },
    ],
    predict: [
      {
        prompt: 'Questo comando stampa la cartella del client o quella del server? ssh learner@server.lab "echo $PWD"',
        cmd: { bash: 'cd ~/corso-cli/m11l3; ssh learner@server.lab "echo $PWD"', pwsh: 'cd ~/corso-cli/m11l3; ssh learner@server.lab "echo $PWD"' },
        expect: 'La cartella del CLIENT (…/corso-cli/m11l3): $PWD è stata espansa localmente tra virgolette doppie.',
        why: 'Per avere la cartella del server serve `pwd` oppure \'echo $PWD\' tra apici singoli.',
      },
    ],
    negative: {
      prompt: 'Cercare sul client un file creato sul server:',
      cmd: { bash: 'cat /tmp/nota.txt', pwsh: 'Get-Content /tmp/nota.txt' },
      explain: 'Il file non esiste sul client: ogni nodo ha il suo filesystem. «Il file non c\'è» va letto come «non è su QUESTO nodo».',
    },
    task: {
      text: 'In ~/corso-cli/m11l3: (1) salva sul CLIENT in locale.txt il nome del server (output di `cat /etc/hostname` eseguito sul server); (2) crea sul SERVER il file /tmp/nota.txt con il testo «scritto sul server»; (3) scrivi in virgolette.txt due righe: `doppie: …` con l\'output di `ssh … "echo $(hostname)"` e `singole: …` con quello di `ssh … \'echo $(hostname)\'`; (4) scrivi quoting.md: una tabella Comando | Dove viene interpretato | Risultato | Perché con almeno 4 righe.',
      criterion: 'locale.txt contiene server; il file /tmp/nota.txt esiste sul server; virgolette.txt ha «doppie: lab» e «singole: server»; quoting.md ha la tabella con client e server citati.',
    },
    checks: [
      {
        id: 'locale',
        description: 'locale.txt (sul client) contiene il nome del server',
        expected: 'server',
        test: (c) => ({ pass: (c.read('locale.txt') ?? '').trim() === 'server', actual: (c.read('locale.txt') ?? '(file mancante)').trim() }),
        onFail: 'La redirezione > deve stare FUORI dalle virgolette del comando remoto, così la esegue il client.',
      },
      {
        id: 'remoto',
        description: '/tmp/nota.txt esiste sul server con il testo giusto',
        expected: 'scritto sul server',
        test: (c) => {
          const f = c.state.lab?.files['/tmp/nota.txt'];
          return { pass: !!f && f.content.trim() === 'scritto sul server', actual: f ? f.content.trim() : 'file assente sul server' };
        },
        onFail: 'La redirezione deve stare DENTRO le virgolette: ssh server "echo \'scritto sul server\' > /tmp/nota.txt".',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'virgolette',
        description: 'virgolette.txt: doppie → lab, singole → server',
        expected: 'doppie: lab / singole: server',
        test: (c) => {
          const l = (c.read('virgolette.txt') ?? '').split('\n').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
          return { pass: l.join('|') === 'doppie: lab|singole: server', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Con le virgolette doppie $(hostname) è espanso dal client (lab); con gli apici singoli dal server.',
      },
      {
        id: 'tabella',
        description: 'quoting.md: tabella con almeno 4 righe e i due nodi',
        expected: '| Comando | Dove viene interpretato | Risultato | Perché |',
        test: (c) => {
          const md = c.read('quoting.md') ?? '';
          const t = parseTables(md).find((x) => x.header.some((h) => /comando/i.test(h)) && x.header.some((h) => /dove/i.test(h)));
          return { pass: !!t && t.rows.length >= 4 && /client/i.test(md) && /server/i.test(md), actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Una riga per caso provato, con la colonna «Dove viene interpretato» (client o server).',
        kind: 'verifiable',
      },
    ],
    example: { text: 'Esempio analogo: la cartella corrente del server.', cmd: { bash: 'ssh learner@server.lab "pwd"', pwsh: 'ssh learner@server.lab "pwd"' } },
    hints: ['Tra virgolette doppie il client espande variabili e $(…); tra apici singoli no.', 'Una redirezione fuori dalle virgolette scrive sul client, dentro sul server.', 'Per catturare l\'output di ssh in una riga di testo: `echo "doppie: $(ssh … "echo $(hostname)")"` (PowerShell: `"doppie: " + (ssh … )`).'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l3',
        'ssh learner@server.lab "cat /etc/hostname" > locale.txt',
        `ssh learner@server.lab "echo 'scritto sul server' > /tmp/nota.txt"`,
        'ssh learner@server.lab "cat /tmp/nota.txt"',
        'echo "doppie: $(ssh learner@server.lab "echo $(hostname)")" > virgolette.txt',
        `echo "singole: $(ssh learner@server.lab 'echo $(hostname)')" >> virgolette.txt`,
        `cat > quoting.md <<'EOF'\n${QUOTING_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l3',
        'ssh learner@server.lab "cat /etc/hostname" > locale.txt',
        `ssh learner@server.lab "echo 'scritto sul server' > /tmp/nota.txt"`,
        'ssh learner@server.lab "cat /tmp/nota.txt"',
        '"doppie: " + (ssh learner@server.lab "echo $(hostname)") > virgolette.txt',
        `"singole: " + (ssh learner@server.lab 'echo $(hostname)') >> virgolette.txt`,
        `Set-Content quoting.md -Value @'\n${QUOTING_MD}'@`,
      ],
    },
    summary: ['il comando passa dalla shell del client e poi da quella del server', 'virgolette doppie: espande il client; apici singoli: il server', 'redirezione fuori dalle virgolette = client, dentro = server', 'ogni nodo ha il suo filesystem'],
    skills: ['comandi', 'output', 'diagnosi'],
    concepts: ['quoting con ssh', 'espansione locale e remota', 'redirezione locale o remota', 'filesystem per nodo'],
  },
  {
    id: 'M11.L7',
    module: 11,
    n: 7,
    title: 'Collegare i log di client e server con l\'identificativo di richiesta',
    objective: 'Associare ogni risposta vista dal client alla riga corrispondente del registro del server, usando X-Request-Id.',
    explain: [
      TRACCE_NOTE + ' Lo stesso identificativo arriva al client nell\'header di risposta `X-Request-Id`: è il filo che collega le due metà della storia.',
      'Il registro del server si legge via ssh: `ssh learner@server.lab "grep req_000003 /var/log/taskflow/service.log"` (oppure `journalctl -u taskflow`). Attenzione al quoting (M11.L3): se l\'identificativo sta in una variabile del client e il comando è tra virgolette doppie, il client lo espande prima di inviarlo, ed è proprio ciò che serve.',
      'Un\'integrazione ben documentata allega, per ogni caso d\'errore, ciò che vede il client E ciò che registra il server. Quando i due racconti non coincidono, il problema sta in mezzo (rete, proxy) o nel modo di leggere le risposte.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setupLab(c, 'ok'),
    guided: [
      { title: 'Una richiesta e il suo identificativo', cmd: { bash: `curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks/999 | grep -i x-request-id`, pwsh: `curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks/999" | Select-String -Pattern x-request-id` }, what: 'Chiede un task che non esiste e legge l\'identificativo.', who: 'grep / Select-String filtrano l\'header.', parts: [], expect: 'X-Request-Id: req_000001.', risk: 'Nessuno.', contains: 'req_000001' },
      { title: 'La stessa richiesta sul server', cmd: { bash: 'ssh learner@server.lab "grep req_000001 /var/log/taskflow/service.log"', pwsh: 'ssh learner@server.lab "grep req_000001 /var/log/taskflow/service.log"' }, what: 'Cerca l\'identificativo nel registro del server.', who: 'grep, eseguito sul server.', parts: [], expect: 'Una riga con GET /v1/tasks/999 -> 404 e lo stesso req_000001.', risk: 'Nessuno.', contains: '404' },
      { title: 'Il registro più recente', cmd: { bash: 'ssh learner@server.lab "tail -n 3 /var/log/taskflow/service.log"', pwsh: 'ssh learner@server.lab "tail -n 3 /var/log/taskflow/service.log"' }, what: 'Mostra le ultime righe del registro.', who: 'tail, sul server.', parts: [], expect: 'La richiesta appena fatta è l\'ultima riga di tipo http.', risk: 'Nessuno.', contains: 'http:' },
    ],
    predict: [
      {
        prompt: 'Se il client mostra 404 e il server registra 404 per lo stesso identificativo, dove cercheresti il problema? E se il server NON avesse nessuna riga per quell\'identificativo?',
        cmd: { bash: 'ssh learner@server.lab "grep -c req_999999 /var/log/taskflow/service.log"', pwsh: 'ssh learner@server.lab "grep -c req_999999 /var/log/taskflow/service.log"' },
        expect: 'Con i due 404 coincidenti il server ha davvero ricevuto la richiesta: il problema è nella richiesta (percorso). Senza riga nel registro la richiesta non è arrivata (rete, nome, firewall) o l\'identificativo è sbagliato.',
        why: 'Il confronto dei due racconti dice dove guardare.',
      },
    ],
    negative: {
      prompt: 'Cercare un identificativo inesistente sul server:',
      cmd: { bash: 'ssh learner@server.lab "grep req_999999 /var/log/taskflow/service.log"; echo "codice: $?"', pwsh: 'ssh learner@server.lab "grep req_999999 /var/log/taskflow/service.log"; "codice: $LASTEXITCODE"' },
      explain: 'Nessuna riga e codice 1 (255 se ssh non si connette): «nessuna corrispondenza» non è un errore del comando ma un\'informazione.',
    },
    task: {
      text: 'In ~/corso-cli/m11l7 fai quattro richieste dal client: GET /v1/health (200), GET /v1/tasks con token (200), GET /v1/tasks/999 con token (404) e GET /v1/tasks senza token (401). Per ciascuna leggi X-Request-Id e cerca l\'identificativo nel registro del SERVER (via ssh). Scrivi tracce.md: una tabella Richiesta | Request-Id | Status (client) | Riga del server con almeno 4 righe; nell\'ultima colonna riporta l\'esito che il server ha registrato.',
      criterion: 'Il registro mostra 200, 404 e 401 verso server.lab; hai letto il registro del server; tracce.md riporta gli identificativi reali e, per ognuno, lo status sia del client sia del server.',
    },
    checks: [
      {
        id: 'richieste',
        description: 'Richieste 200, 404 e 401 verso il server',
        expected: 'almeno uno status 200, 404 e 401',
        test: (c) => {
          const s = (n: number): boolean => c.apiShell.some((e) => onServer(e) && e.status === n);
          return { pass: s(200) && s(404) && s(401), actual: `200:${s(200)} 404:${s(404)} 401:${s(401)}` };
        },
        onFail: 'Servono una richiesta riuscita, una a un task inesistente e una senza token.',
      },
      {
        id: 'registro',
        description: 'Hai cercato gli identificativi nel registro del server',
        expected: 'ssh … grep/tail/journalctl su service.log',
        test: (c) => ({ pass: sshCmd(c, /service\.log|journalctl/), actual: sshCmd(c, /service\.log|journalctl/) ? 'ok' : 'nessuna lettura del registro del server' }),
        onFail: 'Usa ssh learner@server.lab "grep req_… /var/log/taskflow/service.log".',
      },
      {
        id: 'tracce',
        description: 'tracce.md: identificativi reali con lo status anche dal lato server',
        expected: 'un id per 200, 404, 401; lo status compare nel client e nel server',
        test: (c) => {
          const md = c.read('tracce.md') ?? '';
          const lines = md.split('\n');
          const ok = (status: number): boolean =>
            c.apiShell.some((e) => {
              if (!onServer(e) || e.status !== status) return false;
              const row = lines.find((l) => l.includes(e.requestId));
              return !!row && (row.match(new RegExp(`\\b${status}\\b`, 'g')) ?? []).length >= 2;
            });
          return { pass: ok(200) && ok(404) && ok(401), actual: `200:${ok(200)} 404:${ok(404)} 401:${ok(401)}` };
        },
        onFail: 'Per ogni riga riporta l\'identificativo letto davvero e lo status due volte: quello visto dal client e quello trovato nel registro del server.',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'tabella',
        description: 'tracce.md: tabella con almeno 4 righe',
        expected: '| Richiesta | Request-Id | Status (client) | Riga del server |',
        test: (c) => {
          const t = parseTables(c.read('tracce.md') ?? '').find((x) => x.header.some((h) => /request/i.test(h)) && x.header.some((h) => /server/i.test(h)));
          return { pass: !!t && t.rows.length >= 4, actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Colonne: Richiesta, Request-Id, Status (client), Riga del server. Una riga per richiesta.',
        kind: 'verifiable',
      },
    ],
    example: { text: 'Esempio analogo: l\'identificativo di una richiesta di salute.', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/health | grep -i x-request-id', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/health" | Select-String -Pattern x-request-id' } },
    hints: ['L\'identificativo è nell\'header di risposta: usa -i e filtra con grep -i x-request-id.', 'Salva ogni identificativo in una variabile e usala dentro le virgolette doppie del comando ssh: il client la espande prima di inviare.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l7',
        `a=$(curl -s -i $TASKFLOW_URL/v1/health | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        `b=$(curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        `c=$(curl -s -i ${AUTH} $TASKFLOW_URL/v1/tasks/999 | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        `d=$(curl -s -i $TASKFLOW_URL/v1/tasks | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r')`,
        'ssh learner@server.lab "grep -e $a -e $b -e $c -e $d /var/log/taskflow/service.log"',
        `printf '| Richiesta | Request-Id | Status (client) | Riga del server |\\n|---|---|---|---|\\n| GET /v1/health | %s | 200 | GET /v1/health -> 200 |\\n| GET /v1/tasks con token | %s | 200 | GET /v1/tasks -> 200 |\\n| GET /v1/tasks/999 | %s | 404 | GET /v1/tasks/999 -> 404 |\\n| GET /v1/tasks senza token | %s | 401 | GET /v1/tasks -> 401 |\\n' $a $b $c $d > tracce.md`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l7',
        `$a = ((curl.exe -s -i "$env:TASKFLOW_URL/v1/health" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        `$b = ((curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        `$c = ((curl.exe -s -i ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks/999" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        `$d = ((curl.exe -s -i "$env:TASKFLOW_URL/v1/tasks" | Select-String -Pattern x-request-id).Line -split ' ')[1].Trim()`,
        'ssh learner@server.lab "grep -e $a -e $b -e $c -e $d /var/log/taskflow/service.log"',
        `Set-Content tracce.md -Value @("| Richiesta | Request-Id | Status (client) | Riga del server |", "|---|---|---|---|", "| GET /v1/health | $a | 200 | GET /v1/health -> 200 |", "| GET /v1/tasks con token | $b | 200 | GET /v1/tasks -> 200 |", "| GET /v1/tasks/999 | $c | 404 | GET /v1/tasks/999 -> 404 |", "| GET /v1/tasks senza token | $d | 401 | GET /v1/tasks -> 401 |")`,
      ],
    },
    summary: ['X-Request-Id collega la risposta del client al registro del server', 'i due racconti devono coincidere', 'nessuna riga sul server = la richiesta non è arrivata', 'allegare identificativo e riga del server a ogni segnalazione'],
    skills: ['diagnosi', 'docs', 'http'],
    concepts: ['correlazione client-server', 'registro del server via ssh', 'variabili nei comandi ssh'],
  },
  {
    id: 'M11.L8',
    module: 11,
    n: 8,
    title: 'Timeout: la porta è filtrata dal firewall del server',
    objective: 'Riconoscere un timeout come sintomo diverso dalla porta chiusa, dimostrare che il servizio funziona in locale e aprire la porta nel firewall.',
    explain: [
      'Stavolta il servizio è attivo e il server risponde al ping, ma dal client la richiesta non riceve risposta: dopo il timeout curl esce con codice 28 (`Timeout was reached`) e `nc -zv -w 2` dice «timed out». Una porta CHIUSA rifiuterebbe subito la connessione (codice 7); qui i pacchetti vengono SCARTATI da un firewall, quindi il client aspetta invano.',
      'Il metodo è la prova di contrasto: sul server il servizio risponde in LOCALE (`ssh learner@server.lab "curl -s localhost:8080/v1/health"`) ma non dal client. Quindi il problema non è il servizio ma ciò che sta in mezzo. `sudo ufw status` mostra le regole del firewall del server; `sudo ufw allow 8080/tcp` apre la porta (`sudo` = privilegi di amministratore).',
      'Imposta sempre un timeout quando diagnostichi: senza `-m` (curl) o `-w` (nc) l\'attesa supera i due minuti. In PowerShell `Test-NetConnection server.lab -Port 8080` mostra `PingSucceeded True` e `TcpTestSucceeded False`: l\'host c\'è, la porta no.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setupLab(c, 'firewall', { token: false }),
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'curl -sS -m 3 $TASKFLOW_URL/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"; "codice $LASTEXITCODE"' }, what: 'Chiama il servizio con un timeout di 3 secondi.', who: 'Il client non riceve alcuna risposta.', parts: ['-m 3: massimo 3 secondi'], expect: 'Timeout was reached e codice 28.', risk: 'Nessuno.', contains: 'codice 28' },
      { title: 'Il server è acceso?', cmd: { bash: 'ping -c 2 server.lab', pwsh: 'Test-NetConnection server.lab' }, what: 'Verifica che il server risponda.', who: 'ping / Test-NetConnection.', parts: [], expect: 'Risposte da 192.168.50.10 (PingSucceeded True).', risk: 'Nessuno.', contains: '192.168.50.10' },
      { title: 'Chiusa o filtrata?', cmd: { bash: 'nc -zv -w 2 server.lab 8080', pwsh: 'Test-NetConnection server.lab -Port 8080' }, what: 'Controlla solo la porta.', who: 'nc / Test-NetConnection.', parts: ['-w 2: attesa massima di 2 secondi'], expect: 'Bash: «timed out» (non «refused»). PowerShell: TcpTestSucceeded False con PingSucceeded True.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: 'timed out', pwsh: 'PingSucceeded          : True' } },
      { title: 'Il servizio sul server', cmd: { bash: 'ssh learner@server.lab "systemctl is-active taskflow; curl -s localhost:8080/v1/health"', pwsh: 'ssh learner@server.lab "systemctl is-active taskflow; curl -s localhost:8080/v1/health"' }, what: 'Chiede al server se il servizio è attivo e se risponde in locale.', who: 'systemctl e curl, eseguiti sul server.', parts: [], expect: 'active e status ok: in locale tutto funziona.', risk: 'Nessuno.', contains: 'active' },
      { title: 'Il firewall', cmd: { bash: 'ssh learner@server.lab "sudo ufw status"', pwsh: 'ssh learner@server.lab "sudo ufw status"' }, what: 'Mostra le regole del firewall.', who: 'ufw, con sudo.', parts: ['DENY: scarta i pacchetti'], expect: 'La porta 8080/tcp ha la regola DENY.', risk: 'Nessuno: è sola lettura.', contains: 'DENY' },
    ],
    predict: [
      {
        prompt: 'Dopo `sudo ufw allow 8080/tcp` sul server, il client riesce a connettersi senza altre modifiche?',
        cmd: { bash: 'ssh learner@server.lab "sudo ufw allow 8080/tcp"', pwsh: 'ssh learner@server.lab "sudo ufw allow 8080/tcp"' },
        expect: 'Sì: la regola cambia subito, il servizio non va riavviato e il client non va toccato.',
        why: 'Il guasto era nel filtro di rete, non nel servizio né nel client.',
      },
    ],
    negative: {
      prompt: 'Riavviare il servizio avrebbe risolto?',
      cmd: { bash: 'ssh learner@server.lab "sudo systemctl restart taskflow"; curl -sS -m 3 $TASKFLOW_URL/v1/health; echo "codice $?"', pwsh: 'ssh learner@server.lab "sudo systemctl restart taskflow"; curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"; "codice $LASTEXITCODE"' },
      explain: 'No: il servizio era già sano. Riavviare «per sicurezza» fa perdere tempo e può nascondere la causa: prima si dimostra dove sta il guasto.',
    },
    task: {
      text: 'In ~/corso-cli/m11l8: riproduci il sintomo (con timeout), distingui porta chiusa da filtrata (nc o Test-NetConnection), dimostra che sul server il servizio risponde in locale, leggi lo stato del firewall, apri la porta 8080 e verifica dal client (200). Scrivi diagnosi.md: sintomo, perché NON è una porta chiusa, le prove, la causa, la correzione e la prova finale.',
      criterion: 'Il firewall non blocca più la porta; il registro mostra un 200 dal client; hai usato un timeout, la prova in locale sul server e ufw status; diagnosi.md spiega timeout, firewall e la prova in locale.',
    },
    checks: [
      {
        id: 'stato',
        description: 'Porta aperta nel firewall e servizio ancora attivo',
        expected: 'regola 8080 ALLOW, taskflow attivo',
        test: (c) => ({ pass: !!c.state.lab && !c.state.lab.firewall && c.state.lab.running, actual: c.state.lab ? `firewall bloccante:${c.state.lab.firewall} servizio attivo:${c.state.lab.running}` : 'laboratorio assente' }),
        onFail: 'Apri la porta con sudo ufw allow 8080/tcp sul server (via ssh).',
      },
      {
        id: 'prova',
        description: 'GET /v1/health dal client risponde 200',
        expected: '200 su server.lab:8080',
        test: (c) => ({ pass: c.apiShell.some((e) => onServer(e) && /^\/v1\/health/.test(e.path) && e.status === 200), actual: c.apiShell.some((e) => onServer(e) && e.status === 200) ? 'ok' : 'nessun 200' }),
        onFail: 'Dopo la correzione ripeti la richiesta dal client.',
      },
      {
        id: 'metodo',
        description: 'Timeout, prova in locale sul server e lettura del firewall',
        expected: 'curl -m / nc -w, ssh … curl localhost, ssh … ufw status',
        test: (c) => {
          const timeout = ranCmd(c, /(curl(\.exe)?\b.*\s-\w*m\s+\d|nc\b.*\s-\w*w\s+\d|Test-NetConnection)/, false);
          const locale = sshCmd(c, /curl\b.*localhost/);
          const ufw = sshCmd(c, /ufw status/);
          return missing({ timeout, locale, ufw });
        },
        onFail: 'Servono: una richiesta con timeout, ssh "curl -s localhost:8080/v1/health" e ssh "sudo ufw status".',
      },
      {
        id: 'documento',
        description: 'diagnosi.md: timeout (28), non porta chiusa, firewall, prova in locale',
        expected: 'timeout/filtrata, 28, firewall/ufw, localhost',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return missing({ timeout: /timeout|timed out|filtrat/i.test(md), codice: /\b28\b/.test(md), firewall: /firewall|ufw/i.test(md), locale: /localhost|in locale/i.test(md), chiusa: /chius|refused|rifiut/i.test(md) });
        },
        onFail: 'Spiega: timeout (codice 28) e non rifiuto, perché il servizio è sano (prova in locale), la regola del firewall e la correzione.',
      },
    ],
    example: { text: 'Esempio analogo: leggere il firewall del server.', cmd: { bash: 'ssh learner@server.lab "sudo ufw status"', pwsh: 'ssh learner@server.lab "sudo ufw status"' } },
    hints: ['Timeout (28) = nessuna risposta; rifiuto (7) = porta chiusa. Sono guasti diversi.', 'Se il servizio risponde in locale sul server, il problema è tra client e server.', '`sudo ufw status` elenca le regole; `sudo ufw allow 8080/tcp` apre la porta.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l8',
        'curl -sS -m 3 $TASKFLOW_URL/v1/health',
        'ping -c 2 server.lab',
        'nc -zv -w 2 server.lab 8080',
        'ssh learner@server.lab "systemctl is-active taskflow; curl -s localhost:8080/v1/health"',
        'ssh learner@server.lab "sudo ufw status"',
        'ssh learner@server.lab "sudo ufw allow 8080/tcp"',
        'curl -s $TASKFLOW_URL/v1/health',
        `cat > diagnosi.md <<'EOF'\n${FIREWALL_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l8',
        'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"',
        'Test-NetConnection server.lab',
        'Test-NetConnection server.lab -Port 8080',
        'ssh learner@server.lab "systemctl is-active taskflow; curl -s localhost:8080/v1/health"',
        'ssh learner@server.lab "sudo ufw status"',
        'ssh learner@server.lab "sudo ufw allow 8080/tcp"',
        'curl.exe -s "$env:TASKFLOW_URL/v1/health"',
        `Set-Content diagnosi.md -Value @'\n${FIREWALL_MD}'@`,
      ],
    },
    summary: ['timeout (28) ≠ porta chiusa (7)', 'prova di contrasto: funziona in locale, non dal client', 'il firewall scarta i pacchetti: nessuna risposta', 'impostare sempre un timeout'],
    skills: ['diagnosi', 'comandi', 'docs'],
    concepts: ['porta filtrata e firewall', 'prova di contrasto locale/remoto', 'ufw', 'timeout di connessione'],
  },
  {
    id: 'M11.L9',
    module: 11,
    n: 9,
    title: 'Il nome del server punta all\'indirizzo sbagliato',
    objective: 'Scoprire che DNS e file hosts danno risposte diverse, individuare la riga errata e correggerla (o aggirarla con l\'indirizzo).',
    explain: [
      'Il computer traduce un nome in un indirizzo in due modi: il file `/etc/hosts` (righe «indirizzo nome») e il DNS. Programmi come `ping`, `curl` e `ssh` consultano PRIMA il file hosts; strumenti come `nslookup` e `dig` interrogano SOLO il DNS. Una riga errata nel file hosts ha quindi la precedenza e manda il nome a un indirizzo sbagliato, mentre `nslookup` continua a dare la risposta giusta: un classico caso in cui due strumenti si contraddicono.',
      'Per vedere cosa usano i programmi: `getent hosts server.lab` (PowerShell: `Resolve-DnsName server.lab`); solo DNS: `nslookup server.lab` (PowerShell: `Resolve-DnsName server.lab -DnsOnly`). Con un indirizzo che non corrisponde ad alcun computer il ping dà «Destination Host Unreachable» e `nc` «No route to host»: sintomi diversi dal rifiuto e dal timeout.',
      'Correzione: eliminare la riga errata (`sudo sed -i \'/192.168.50.11/d\' /etc/hosts`). In PowerShell 5.1 su Windows il file è `C:\\Windows\\System32\\drivers\\etc\\hosts` e si modifica con una finestra «Esegui come amministratore»: nel laboratorio PowerShell usi l\'indirizzo diretto (192.168.50.10) e documenti la correzione.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setupLab(c, 'dns_wrong', { token: false }),
    guided: [
      { title: 'Il sintomo', cmd: { bash: 'curl -sS -m 5 $TASKFLOW_URL/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 5 "$env:TASKFLOW_URL/v1/health"; "codice $LASTEXITCODE"' }, what: 'Chiama il servizio per nome.', who: 'Il client non riesce a connettersi.', parts: [], expect: 'Failed to connect, codice 7, dopo qualche secondo di attesa.', risk: 'Nessuno.', contains: 'codice 7' },
      { title: 'Il server è raggiungibile?', cmd: { bash: 'ping -c 2 server.lab', pwsh: 'Test-NetConnection server.lab' }, what: 'Prova il ping per nome.', who: 'ping usa il nome come i programmi normali.', parts: [], expect: 'Destination Host Unreachable (PingSucceeded False): quell\'indirizzo non esiste.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: 'Unreachable', pwsh: 'PingSucceeded          : False' } },
      { title: 'Cosa dice il DNS', cmd: { bash: 'nslookup server.lab', pwsh: 'Resolve-DnsName server.lab -DnsOnly' }, what: 'Interroga solo il DNS.', who: 'nslookup / Resolve-DnsName -DnsOnly ignorano il file hosts.', parts: [], expect: '192.168.50.10: il DNS è corretto.', risk: 'Nessuno.', contains: '192.168.50.10' },
      { title: 'Cosa usano i programmi', cmd: { bash: 'getent hosts server.lab', pwsh: 'Resolve-DnsName server.lab' }, what: 'Risolve il nome come fanno ping e curl.', who: 'Prima il file hosts, poi il DNS.', parts: [], expect: '192.168.50.11: risposta diversa dal DNS!', risk: 'Nessuno.', contains: '192.168.50.11' },
      { title: 'La riga colpevole', cmd: { bash: 'cat /etc/hosts', pwsh: 'Get-Content /etc/hosts' }, what: 'Mostra il file hosts del client.', who: 'cat / Get-Content.', parts: [], expect: 'Una riga «192.168.50.11 server.lab».', risk: 'Nessuno.', contains: '192.168.50.11' },
    ],
    predict: [
      {
        prompt: 'Il server è raggiungibile se usi direttamente il suo indirizzo 192.168.50.10 al posto del nome?',
        cmd: { bash: 'curl -s http://192.168.50.10:8080/v1/health', pwsh: 'curl.exe -s http://192.168.50.10:8080/v1/health' },
        expect: 'Sì: 200 con status ok. Il servizio e la rete sono a posto, sbaglia solo la traduzione del nome.',
        why: 'Provare l\'indirizzo diretto separa i problemi di nome da quelli di rete e di servizio.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se correggi il nome nel DNS ma lasci la riga nel file hosts?',
      cmd: { bash: 'getent hosts server.lab; nslookup server.lab | grep Address', pwsh: 'Resolve-DnsName server.lab; Resolve-DnsName server.lab -DnsOnly' },
      explain: 'Non cambia nulla per i programmi: il file hosts ha la precedenza sul DNS. Per questo i problemi di nome si diagnosticano guardando ENTRAMBE le fonti.',
    },
    task: {
      text: 'In ~/corso-cli/m11l9: riproduci il sintomo, mostra che il DNS (nslookup / Resolve-DnsName -DnsOnly) e il file hosts (getent / Resolve-DnsName) danno risposte diverse, individua la riga errata e correggi: in Bash elimina la riga da /etc/hosts con sudo sed -i, poi verifica per nome (200). In PowerShell usa l\'indirizzo 192.168.50.10 in $env:TASKFLOW_URL e verifica (200). Scrivi diagnosi.md: sintomo, differenza tra DNS e hosts, causa, correzione, prova finale.',
      criterion: 'Bash: la riga errata non c\'è più e la richiesta per nome risponde 200. PowerShell: la richiesta verso 192.168.50.10 risponde 200. diagnosi.md spiega DNS, hosts, 192.168.50.11 e 192.168.50.10.',
    },
    checks: [
      {
        id: 'strumenti',
        description: 'Hai confrontato DNS e file hosts',
        expected: pick({ shell: 'bash' } as never, 'nslookup e getent hosts', 'Resolve-DnsName con e senza -DnsOnly') as string,
        test: (c) => {
          const dns = ranCmd(c, pick(c, /\bnslookup\b|\bdig\b/, /Resolve-DnsName\b.*-DnsOnly/i), false);
          const hosts = ranCmd(c, pick(c, /getent\s+hosts|\/etc\/hosts/, /Resolve-DnsName\b(?!.*-DnsOnly)|\/etc\/hosts/i), false);
          return { pass: dns && hosts, actual: `DNS:${dns} hosts:${hosts}` };
        },
        onFail: 'Confronta la risposta del solo DNS con quella che usano i programmi (getent hosts / Resolve-DnsName).',
      },
      {
        id: 'correzione',
        description: pick({ shell: 'bash' } as never, 'La riga errata di /etc/hosts è stata eliminata', 'Il client usa l\'indirizzo diretto del server') as string,
        expected: pick({ shell: 'bash' } as never, 'nessuna riga 192.168.50.11 in /etc/hosts', 'TASKFLOW_URL con 192.168.50.10') as string,
        test: (c) => {
          if (c.shell === 'bash') {
            const ip = hostsFileLookup(c.state, 'server.lab');
            return { pass: ip === null, actual: ip ? `server.lab → ${ip}` : 'ok' };
          }
          const url = c.state.shells.pwsh.env.TASKFLOW_URL ?? '';
          return { pass: url.includes('192.168.50.10'), actual: url };
        },
        onFail: 'Bash: sudo sed -i \'/192.168.50.11/d\' /etc/hosts. PowerShell: $env:TASKFLOW_URL = "http://192.168.50.10:8080".',
      },
      {
        id: 'prova',
        description: 'GET /v1/health risponde 200',
        expected: pick({ shell: 'bash' } as never, '200 verso server.lab', '200 verso 192.168.50.10') as string,
        test: (c) => {
          const host = c.shell === 'bash' ? 'server.lab' : '192.168.50.10';
          const ok = c.apiShell.some((e) => e.host === host && /^\/v1\/health/.test(e.path) && e.status === 200);
          return { pass: ok, actual: ok ? 'ok' : `nessun 200 verso ${host}` };
        },
        onFail: 'Ripeti la richiesta dopo la correzione.',
      },
      {
        id: 'documento',
        description: 'diagnosi.md: DNS contro hosts, i due indirizzi, causa e correzione',
        expected: 'DNS, hosts, 192.168.50.10, 192.168.50.11',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return missing({ dns: /DNS|nslookup/i.test(md), hosts: /hosts/i.test(md), ip10: md.includes('192.168.50.10'), ip11: md.includes('192.168.50.11'), precedenza: /preceden|prima/i.test(md) });
        },
        onFail: 'Spiega che il file hosts ha la precedenza sul DNS e riporta i due indirizzi (giusto e sbagliato).',
      },
    ],
    example: { text: 'Esempio analogo: come si risolve un altro nome del laboratorio.', cmd: { bash: 'getent hosts client.lab', pwsh: 'Resolve-DnsName client.lab' } },
    hints: ['nslookup interroga solo il DNS; ping e curl usano prima il file hosts: se non coincidono, c\'è una riga in /etc/hosts.', 'Prova l\'indirizzo diretto per separare i problemi di nome dagli altri.', 'Bash: `sudo sed -i \'/192.168.50.11/d\' /etc/hosts` toglie la riga.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m11l9',
        'curl -sS -m 5 $TASKFLOW_URL/v1/health',
        'ping -c 2 server.lab',
        'nslookup server.lab',
        'getent hosts server.lab',
        'cat /etc/hosts',
        'curl -s http://192.168.50.10:8080/v1/health',
        `sudo sed -i '/192.168.50.11/d' /etc/hosts`,
        'getent hosts server.lab',
        'curl -s $TASKFLOW_URL/v1/health',
        `cat > diagnosi.md <<'EOF'\n${NOME_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l9',
        'curl.exe -sS -m 5 "$env:TASKFLOW_URL/v1/health"',
        'Test-NetConnection server.lab',
        'Resolve-DnsName server.lab -DnsOnly',
        'Resolve-DnsName server.lab',
        'Get-Content /etc/hosts',
        '$env:TASKFLOW_URL = "http://192.168.50.10:8080"',
        'curl.exe -s "$env:TASKFLOW_URL/v1/health"',
        `Set-Content diagnosi.md -Value @'\n${NOME_MD}'@`,
      ],
    },
    summary: ['il file hosts ha la precedenza sul DNS', 'nslookup ignora il file hosts, ping e curl no', 'Host Unreachable ≠ refused ≠ timeout', 'provare l\'indirizzo diretto isola il problema di nome'],
    skills: ['diagnosi', 'comandi', 'docs'],
    concepts: ['risoluzione dei nomi', 'file hosts e DNS', 'getent e nslookup', 'No route to host'],
  },
  {
    id: 'M11.L11',
    module: 11,
    n: 11,
    title: 'Seconda verifica finale: integrazione documentata',
    objective: 'Diagnosticare e ripristinare un sistema con tre guasti a livelli diversi (nome, rete, applicazione), senza guida, e consegnare il rapporto.',
    explain: [
      'Come nella prima verifica finale, il sistema ha più problemi insieme, ma stavolta su livelli diversi e con sintomi diversi a ogni passo. Procedi per livelli (nome, rete, porta, servizio, applicazione), cambia una cosa alla volta e ripeti la prova del client dopo ciascuna correzione. Usa il metodo imparato: prove di contrasto (funziona in locale, non dal client), confronto tra le fonti (DNS e hosts), registro del server.',
      'Non c\'è una soluzione guidata. In PowerShell non puoi modificare il file hosts: aggira il problema del nome con l\'indirizzo diretto 192.168.50.10 (anche per ssh) e annotalo nel rapporto come correzione da fare. Consegna il rapporto con sintomi, cause nell\'ordine in cui sono emerse, correzioni, verifica finale ed esempio di richiesta.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    autonomous: true,
    setup: (c) => setupLab(c, 'multi2'),
    guided: [
      { title: 'Il punto di partenza', cmd: { bash: 'curl -sS -m 3 $TASKFLOW_URL/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"; "codice $LASTEXITCODE"' }, what: 'Prova la richiesta più semplice.', who: 'Il client non si connette.', parts: [], expect: 'Failed to connect, codice 7.', risk: 'Nessuno.', contains: 'codice 7' },
      { title: 'Chi risponde al ping', cmd: { bash: 'ping -c 1 server.lab', pwsh: 'Test-NetConnection server.lab' }, what: 'Verifica la raggiungibilità del nome.', who: 'ping / Test-NetConnection.', parts: [], expect: 'Destination Host Unreachable / PingSucceeded False.', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: { bash: 'Unreachable', pwsh: 'False' } },
      { title: 'Provare l\'indirizzo diretto', cmd: { bash: 'ping -c 1 192.168.50.10', pwsh: 'Test-NetConnection 192.168.50.10' }, what: 'Il server risponde se si usa il suo indirizzo?', who: 'ping / Test-NetConnection.', parts: [], expect: 'Sì: il server è acceso. Il problema del nome è un livello a parte.', risk: 'Nessuno.', contains: '192.168.50.10' },
    ],
    predict: [],
    negative: {
      prompt: 'Una correzione senza prova finale è completa?',
      cmd: { bash: 'curl -sS -m 3 $TASKFLOW_URL/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"; "codice $LASTEXITCODE"' },
      explain: 'No: ogni correzione va seguita dalla stessa richiesta del client, perché può rivelare il guasto successivo (qui ce ne sono tre in fila).',
    },
    task: {
      text: 'Il client in ~/corso-cli/m11l11 deve ottenere 200 da GET /v1/tasks (con token) sulla porta documentata 8080 del server. Diagnostica e ripristina il sistema senza spegnere ciò che funziona. Poi scrivi rapporto.md con: sintomi, cause nell\'ordine in cui sono emerse, correzioni, verifica finale ed esempio di richiesta (senza token in chiaro). In PowerShell la correzione del nome è l\'indirizzo diretto.',
      criterion: 'GET /v1/tasks risponde 200 dal client; firewall aperto e database attivo; il nome è corretto (Bash) o si usa l\'indirizzo (PowerShell); rapporto.md elenca le tre cause nell\'ordine, le correzioni e un esempio di richiesta.',
    },
    checks: [
      {
        id: 'sistema',
        description: 'Firewall aperto, database attivo, servizio sulla 8080',
        expected: 'ufw ALLOW 8080, taskflow-db attivo, taskflow sulla 8080',
        test: (c) => {
          const l = c.state.lab;
          return { pass: !!l && !l.firewall && l.dbUp && l.running && l.port === 8080, actual: l ? `firewall bloccante:${l.firewall} db:${l.dbUp} porta:${l.running ? l.port : 'ferma'}` : 'laboratorio assente' };
        },
        onFail: 'Controlla in ordine: nome, firewall della porta 8080, database.',
      },
      {
        id: 'nome',
        description: pick({ shell: 'bash' } as never, 'La riga errata di /etc/hosts è stata eliminata', 'Il client usa l\'indirizzo diretto') as string,
        expected: pick({ shell: 'bash' } as never, 'server.lab risolto con l\'indirizzo giusto', 'URL con 192.168.50.10') as string,
        test: (c) => {
          if (c.shell === 'bash') {
            const ip = hostsFileLookup(c.state, 'server.lab');
            return { pass: ip === null, actual: ip ? `server.lab → ${ip}` : 'ok' };
          }
          const url = c.state.shells.pwsh.env.TASKFLOW_URL ?? '';
          return { pass: url.includes('192.168.50.10'), actual: url };
        },
        onFail: 'Il nome punta a un indirizzo sbagliato: confronta DNS e file hosts.',
      },
      {
        id: 'prova',
        description: 'GET /v1/tasks risponde 200 dal client sulla porta documentata',
        expected: '200 su /v1/tasks',
        test: (c) => ({ pass: c.apiShell.some((e) => onServer(e) && /^\/v1\/tasks/.test(e.path) && e.status === 200), actual: c.apiShell.some((e) => onServer(e) && e.status === 200 && /tasks/.test(e.path)) ? 'ok' : 'nessun 200 su /v1/tasks' }),
        onFail: 'Ripeti la richiesta dal client con il token.',
      },
      {
        id: 'metodo',
        description: 'Hai indagato con i comandi di diagnosi',
        expected: 'confronto DNS/hosts, ufw status, registro o stato del database',
        test: (c) => {
          const nomi = ranCmd(c, /\bnslookup\b|getent\s+hosts|\/etc\/hosts|Resolve-DnsName/i, false);
          const fw = sshCmd(c, /ufw status/);
          const db = sshCmd(c, /journalctl|taskflow-db|service\.log/);
          return missing({ nomi, fw, db });
        },
        onFail: 'Per ogni livello usa lo strumento adatto: nome (nslookup/getent), firewall (ufw status), applicazione (registro, stato di taskflow-db).',
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
        description: 'rapporto.md: tre cause in ordine, correzioni, verifica, esempio',
        expected: 'nome/hosts, firewall, database; 200; esempio di richiesta',
        test: (c) => {
          const md = c.read('rapporto.md') ?? '';
          const iNome = md.search(/hosts|nome/i);
          const iFw = md.search(/firewall|ufw/i);
          const iDb = md.search(/database|taskflow-db/i);
          return missing({
            sintomi: /sintom|unreachable|timeout|non risponde/i.test(md),
            ordine: iNome >= 0 && iFw > iNome && iDb > iFw,
            correzioni: /ufw allow|systemctl start|sed|192\.168\.50\.10/i.test(md),
            verifica: /200/.test(md),
            esempio: /curl|Invoke-RestMethod/i.test(md),
          });
        },
        onFail: 'Il rapporto deve elencare le cause nell\'ordine in cui sono emerse (nome, firewall, database), le correzioni, la verifica finale (200) e un esempio di richiesta.',
      },
    ],
    example: { text: 'Esempio analogo: procedura generale, su un altro servizio.', cmd: { bash: 'ssh learner@192.168.50.10 "systemctl is-active taskflow-db"', pwsh: 'ssh learner@192.168.50.10 "systemctl is-active taskflow-db"' } },
    hints: ['Prova dal basso: nome → rete → porta → servizio → applicazione. Ogni livello ha il suo strumento.', 'Se il nome non funziona, usa l\'indirizzo per il resto della diagnosi (anche per ssh).', 'Dopo ogni correzione ripeti la richiesta del client: può emergere il guasto successivo.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m11l11',
        'curl -sS -m 3 $TASKFLOW_URL/v1/health',
        'ping -c 1 server.lab',
        'nslookup server.lab',
        'getent hosts server.lab',
        `sudo sed -i '/192.168.50.11/d' /etc/hosts`,
        'curl -sS -m 3 $TASKFLOW_URL/v1/health',
        'ssh learner@server.lab "systemctl is-active taskflow; curl -s localhost:8080/v1/health; sudo ufw status"',
        'ssh learner@server.lab "sudo ufw allow 8080/tcp"',
        `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks`,
        'ssh learner@server.lab "journalctl -u taskflow -n 5"',
        'ssh learner@server.lab "sudo systemctl start taskflow-db"',
        `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks`,
        `cat > rapporto.md <<'EOF'\n${RAPPORTO2_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m11l11',
        'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"',
        'Test-NetConnection server.lab',
        'Resolve-DnsName server.lab -DnsOnly',
        'Resolve-DnsName server.lab',
        '$env:TASKFLOW_URL = "http://192.168.50.10:8080"',
        'curl.exe -sS -m 3 "$env:TASKFLOW_URL/v1/health"',
        'ssh learner@192.168.50.10 "systemctl is-active taskflow; curl -s localhost:8080/v1/health; sudo ufw status"',
        'ssh learner@192.168.50.10 "sudo ufw allow 8080/tcp"',
        `curl.exe -s ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks"`,
        'ssh learner@192.168.50.10 "journalctl -u taskflow -n 5"',
        'ssh learner@192.168.50.10 "sudo systemctl start taskflow-db"',
        `curl.exe -s ${PS_AUTH} "$env:TASKFLOW_URL/v1/tasks"`,
        `Set-Content rapporto.md -Value @'\n${RAPPORTO2_MD}'@`,
      ],
    },
    summary: ['guasti su livelli diversi si nascondono a vicenda', 'confrontare le fonti (DNS e hosts), le prove di contrasto', 'una correzione alla volta, prova dopo ciascuna', 'il rapporto permette a un altro tecnico di ripetere la diagnosi'],
    skills: ['diagnosi', 'autonomia', 'docs'],
    concepts: ['diagnosi su più livelli', 'nome, firewall e applicazione', 'rapporto di diagnosi'],
  },
];
