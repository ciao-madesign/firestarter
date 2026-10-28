import type { Check, Lesson } from '../types.ts';
import { lintDocument, parseTables, headingSections } from '../../docs/lint.ts';
import { apiHit, setupApi } from './helpers.ts';

const fence = (s: string): string => s.replace(/~~~/g, '```');

const DOCS = '~/docs';

function lintOf(c: Parameters<Check['test']>[0], rel: string) {
  const md = c.read(rel);
  return md === null ? null : lintDocument(c.state, md);
}

const STARTER_GUIDE = fence(`# API TaskFlow — Task

Ambiente: development
Versione dell'API: 1.0

## Autenticazione

Tutte le richieste richiedono un header \`Authorization: Bearer <token>\`.

## PUT /v1/tasks

Crea un nuovo task.

~~~bash
curl -s -X PUT "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nome": "Scrivere la guida"}'
# => 200
~~~

Risposta:

~~~json
{"id": 6, "titolo": "Scrivere la guida", "status": "open",}
~~~

Restituisce 200 quando il task viene creato.
`);

const FIXED_GUIDE = fence(`# API TaskFlow — Task

Ambiente: development
Versione dell'API: 1.0

## Autenticazione

Tutte le richieste richiedono un header \`Authorization: Bearer <token>\`.

## POST /v1/tasks

Crea un nuovo task. Il campo obbligatorio è \`title\` (da 3 a 80 caratteri).

~~~bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "Scrivere la guida"}'
# => 201
~~~

Risposta (201 Created):

~~~json
{"id": 6, "title": "Scrivere la guida", "status": "open"}
~~~

### Errori

Con un titolo troppo corto l'API restituisce 422:

~~~bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "x"}'
# => 422
~~~
`);

const TEST_PLAN = `# Piano di test — POST /v1/tasks

| ID | Input | Atteso | Effettivo | Esito |
|---|---|---|---|---|
| TC1 | titolo valido | 201 | 201 | Passato |
| TC2 | titolo di 1 carattere | 422 | 422 | Passato |
| TC3 | nessun token | 401 | 401 | Passato |
`;

const OLD_GUIDE = `# Guida (vecchia) — Task completati

Per riaprire un task già completato invia PATCH /v1/tasks/{id} con {"status": "open"}.
La risposta è 200 e il task torna aperto.
`;

const TROUBLESHOOTING = `# Troubleshooting — TaskFlow

## Errore 401 token_expired

**Sintomo**: ogni richiesta risponde 401 con codice token_expired.
**Causa**: il token Bearer è scaduto (dura un'ora).
**Soluzione**: richiedere un nuovo token con POST /v1/auth/token e aggiornare la variabile TOKEN.

## Errore 422 validation_failed

**Sintomo**: POST /v1/tasks risponde 422 con un elenco errors.
**Causa**: un campo non rispetta le regole (es. title di meno di 3 caratteri).
**Soluzione**: correggere il body secondo il campo indicato in errors.

## Errore 429 rate_limited

**Sintomo**: /v1/search risponde 429 con Retry-After.
**Causa**: superato il limite di 5 richieste al minuto.
**Soluzione**: attendere il numero di secondi indicato in Retry-After e riprovare.
`;

const VERIFICA_SH = `#!/bin/bash
# Verifica end-to-end da ambiente pulito: token, creazione, eliminazione.
source "$HOME/projects/taskflow/.env.development"
TOKEN=$(curl -s -X POST "$TASKFLOW_URL/v1/auth/token" -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)
ID=$(curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Task di verifica"}' | jq -r .id)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/tasks/$ID")
if [ "$CODE" = "204" ]; then
  echo "VERIFICA OK"
  exit 0
fi
echo "VERIFICA FALLITA (DELETE: $CODE)" >&2
exit 1
`;

const VERIFICA_PS1 = `# Verifica end-to-end da ambiente pulito: token, creazione, eliminazione.
Get-Content "$HOME/projects/taskflow/.env.development" | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
  $p = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($p[0], $p[1])
}
$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json
$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body
$h = @{ Authorization = "Bearer $($r.access_token)" }
$t = Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body '{"title":"Task di verifica"}'
$d = Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks/$($t.id)" -Method Delete -Headers $h -UseBasicParsing
if ($d.StatusCode -eq 204) { Write-Output "VERIFICA OK"; exit 0 }
Write-Output "VERIFICA FALLITA"
exit 1
`;

const FINAL_GUIDE_START = fence(`# Guida API TaskFlow (bozza)

Ambiente: staging
Versione dell'API: 1.0

## GET /v1/tasks

Restituisce l'elenco dei task nella proprietà \`data\`.

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks?limit=2" -H "Authorization: Bearer $TOKEN"
# => 200
~~~
`);

const FINAL_README = `# Progetto finale — TaskFlow su staging

Il team ha pubblicato una nuova versione dell'API su STAGING. Hai una guida in bozza (final-guida-iniziale.md) scritta per la versione 1.0.

Consegna, nella cartella ~/docs/final/:
1. test-plan.md — piano di test con casi positivi e negativi (tabella ID | Input | Atteso | Effettivo | Esito), eseguiti su STAGING.
2. bug-report.md — report dell'anomalia che trovi confrontando staging con la documentazione. Distingui fatto osservato, comportamento documentato e ipotesi; cita un X-Request-Id reale.
3. api-guide.md — guida corretta per staging (lint senza errori né avvisi, esempi verificati).
4. run-tests.sh (Bash) oppure run-tests.ps1 (PowerShell) — procedura ripetibile che funziona da AMBIENTE PULITO (nessuna variabile pre-impostata), stampa "PASS: n FAIL: 0".

Ambiente: usa ~/projects/taskflow/.env.staging (credenziali simulate).
`;


const FINAL_GUIDE_OK = fence(`# Guida API TaskFlow

Ambiente: staging
Versione dell'API: 1.1

## Autenticazione

Tutte le richieste richiedono l'header \`Authorization: Bearer <token>\`.

## GET /v1/tasks

Restituisce l'elenco dei task nella proprietà \`items\` (risposta 200).

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks?limit=2" -H "Authorization: Bearer $TOKEN"
# => 200
~~~

### Errori

Senza token l'API restituisce 401:

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks"
# => 401
~~~
`);

const FINAL_RUN_SH = `#!/bin/bash
source "$HOME/projects/taskflow/.env.staging"
PASS=0
FAIL=0
check() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    echo "FAIL: $1 (atteso $2, ottenuto $3)"
  fi
}
status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
TOKEN=$(curl -s -X POST "$TASKFLOW_URL/v1/auth/token" -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)
check "health" 200 "$(status "$TASKFLOW_URL/v1/health")"
check "elenco" 200 "$(status -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/tasks")"
check "senza token" 401 "$(status "$TASKFLOW_URL/v1/tasks")"
check "validazione" 422 "$(status -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"x"}' "$TASKFLOW_URL/v1/tasks")"
check "inesistente" 404 "$(status -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/tasks/9999")"
check "chiave items" true "$(curl -s -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/tasks" | jq -r 'has("items")')"
ID=$(curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Task di collaudo"}' | jq -r .id)
check "eliminazione" 204 "$(status -X DELETE -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/tasks/$ID")"
echo "PASS: $PASS FAIL: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
`;

const FINAL_RUN_PS1 = `Get-Content "$HOME/projects/taskflow/.env.staging" | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
  $p = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($p[0], $p[1])
}
$script:pass = 0
$script:fail = 0
function Check($nome, $atteso, $ottenuto) {
  if ("$atteso" -eq "$ottenuto") { $script:pass++ } else { $script:fail++; Write-Output "FAIL: $nome (atteso $atteso, ottenuto $ottenuto)" }
}
function Status($uri, $method = 'Get', $headers = @{}, $body = $null) {
  try {
    if ($body) { (Invoke-WebRequest $uri -Method $method -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing).StatusCode }
    else { (Invoke-WebRequest $uri -Method $method -Headers $headers -UseBasicParsing).StatusCode }
  } catch { $_.Exception.Response.StatusCode.value__ }
}
$cred = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json
$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType 'application/json' -Body $cred
$h = @{ Authorization = "Bearer $($r.access_token)" }
$u = "$env:TASKFLOW_URL/v1"
Check 'health' 200 (Status "$u/health")
Check 'elenco' 200 (Status "$u/tasks" 'Get' $h)
Check 'senza token' 401 (Status "$u/tasks")
Check 'validazione' 422 (Status "$u/tasks" 'Post' $h '{"title":"x"}')
Check 'inesistente' 404 (Status "$u/tasks/9999" 'Get' $h)
$list = Invoke-RestMethod "$u/tasks" -Headers $h
Check 'chiave items' 'True' ($null -ne $list.items)
$t = Invoke-RestMethod "$u/tasks" -Method Post -Headers $h -ContentType 'application/json' -Body '{"title":"Task di collaudo"}'
Check 'eliminazione' 204 (Status "$u/tasks/$($t.id)" 'Delete' $h)
Write-Output "PASS: $($script:pass) FAIL: $($script:fail)"
if ($script:fail -gt 0) { exit 1 }
`;

const FINAL_PLAN = `# Piano di test — staging

| ID | Input | Atteso | Effettivo | Esito |
|---|---|---|---|---|
| T1 | GET /v1/health | 200 | 200 | Passato |
| T2 | POST /v1/auth/token credenziali valide | 200 | 200 | Passato |
| T3 | GET /v1/tasks con token | 200 | 200 | Passato |
| T4 | GET /v1/tasks senza token | 401 | 401 | Passato |
| T5 | GET /v1/tasks/9999 | 404 | 404 | Passato |
| T6 | POST /v1/tasks titolo di 1 carattere | 422 | 422 | Passato |
`;

function hasSections(md: string, names: string[]): { missing: string[] } {
  const heads = headingSections(md).map((h) => h.heading.text.toLowerCase());
  const missing = names.filter((n) => !heads.some((h) => h.includes(n.toLowerCase())) && !new RegExp(`^\\s*[*#]*\\s*${n}\\b`, 'im').test(md));
  return { missing };
}

export const m6: Lesson[] = [
  {
    id: 'M6.L1',
    artifacts: ['~/docs/test-plan.md'],
    module: 6,
    n: 1,
    title: 'Test case e test plan',
    objective: 'Scrivere un piano di test con casi positivi e negativi, eseguirlo e riportare atteso ed effettivo.',
    explain: [
      'Un test case ha: identificativo, input, risultato atteso, risultato effettivo ed esito. Il piano di test è l\'insieme dei casi: copre il percorso felice (positivo) e i casi limite o di errore (negativi).',
      'Scrivi l\'atteso PRIMA di eseguire (dalla specifica OpenAPI), esegui, poi compila l\'effettivo. Se atteso ed effettivo differiscono hai trovato o un bug o un\'imprecisione della documentazione.',
      'Un buon piano è ripetibile: chiunque, seguendolo, ottiene gli stessi risultati. Il laboratorio verifica che lo status atteso sia previsto dalla specifica e che tu abbia davvero eseguito le richieste.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: 'valid' });
      c.vfs.mkdir('/home/learner/docs', true);
    },
    guided: [
      { title: 'Un caso positivo', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Caso positivo"}\' $TASKFLOW_URL/v1/tasks', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"title":"Caso positivo"}\' -UseBasicParsing).StatusCode' }, what: 'Esegue un caso e stampa solo lo status.', who: 'Il client.', parts: ['solo lo status: confrontabile con l\'atteso'], expect: '201', risk: 'Modifica i dati simulati.' },
    ],
    predict: [
      {
        prompt: 'Per POST /v1/tasks, quali status prevede la specifica? Scrivili prima di leggerla.',
        cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq -r '.paths[\"/tasks\"].post.responses | keys[]'", pwsh: '(irm "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".post.responses.PSObject.Properties.Name' },
        expect: '201, 400, 401, 415, 422.',
        why: 'L\'atteso deriva dalla specifica, non dall\'intuito.',
      },
    ],
    negative: {
      prompt: 'Un atteso sbagliato: cosa succede se scrivi 200 per la creazione?',
      cmd: { bash: 'echo "Atteso 200, effettivo 201: il test FALLISCE (oppure la documentazione è sbagliata)"', pwsh: 'echo "Atteso 200, effettivo 201: il test FALLISCE (oppure la documentazione è sbagliata)"' },
      explain: 'Quando atteso ed effettivo differiscono bisogna capire chi ha ragione: la specifica, il server o il test. Non si "aggiusta" l\'atteso senza evidenza.',
    },
    task: {
      text: `Scrivi in ${DOCS}/test-plan.md un piano di test per POST /v1/tasks con una tabella \`ID | Input | Atteso | Effettivo | Esito\` di almeno 3 casi: uno positivo (201) e due negativi (per esempio 422 titolo troppo corto e 401 senza token). ESEGUI i casi contro il servizio e riporta gli status effettivi.`,
      criterion: 'La tabella ha ≥3 righe; gli status attesi sono previsti dalla specifica; il server ha registrato 201, 422 e 401 da questa shell; gli effettivi riportati esistono davvero nel log.',
    },
    checks: [
      {
        id: 'tabella',
        description: 'Tabella con colonne Atteso ed Effettivo e almeno 3 righe',
        expected: 'ID | Input | Atteso | Effettivo | Esito',
        test: (c) => {
          const t = parseTables(c.read('~/docs/test-plan.md') ?? '').find((x) => x.header.some((h) => /atteso/i.test(h)) && x.header.some((h) => /effettiv/i.test(h)));
          return { pass: !!t && t.rows.length >= 3, actual: t ? `${t.rows.length} righe` : 'tabella non trovata in ~/docs/test-plan.md' };
        },
        onFail: 'Crea ~/docs/test-plan.md con una tabella Markdown che abbia le colonne Atteso ed Effettivo.',
        kind: 'verifiable',
      },
      {
        id: 'copertura',
        description: 'Casi positivi e negativi con status previsti dalla specifica',
        expected: 'un atteso 2xx e almeno uno 4xx, tutti tra 201/400/401/415/422',
        test: (c) => {
          const t = parseTables(c.read('~/docs/test-plan.md') ?? '').find((x) => x.header.some((h) => /atteso/i.test(h)));
          if (!t) return { pass: false, actual: 'nessuna tabella' };
          const idx = t.header.findIndex((h) => /atteso/i.test(h));
          const codes = t.rows.map((r) => parseInt((r[idx] ?? '').replace(/\D/g, ''), 10));
          const allowed = [201, 400, 401, 415, 422];
          return { pass: codes.some((x) => x === 201) && codes.some((x) => x >= 400) && codes.every((x) => allowed.includes(x)), actual: codes.join(', ') };
        },
        onFail: 'Ogni atteso deve essere uno status previsto da POST /v1/tasks: 201, 400, 401, 415, 422. Serve almeno un positivo e un negativo.',
      },
      {
        id: 'eseguiti',
        description: 'Hai eseguito davvero 201, 422 e 401',
        expected: 'POST → 201, POST → 422, POST senza token → 401',
        test: (c) => {
          const st = new Set(c.apiShell.filter((e) => e.method === 'POST' && e.path === '/v1/tasks').map((e) => e.status));
          return { pass: st.has(201) && st.has(422) && st.has(401), actual: [...st].join(', ') || 'nessun POST' };
        },
        onFail: 'Il piano deve basarsi su richieste vere: esegui i tre casi.',
      },
      {
        id: 'effettivi',
        description: "Gli 'Effettivo' del piano corrispondono al log del server",
        expected: 'ogni effettivo compare tra gli status registrati',
        test: (c) => {
          const t = parseTables(c.read('~/docs/test-plan.md') ?? '').find((x) => x.header.some((h) => /effettiv/i.test(h)));
          if (!t) return { pass: false, actual: 'nessuna tabella' };
          const idx = t.header.findIndex((h) => /effettiv/i.test(h));
          const seen = new Set(c.apiShell.map((e) => e.status));
          const bad = t.rows.map((r) => parseInt((r[idx] ?? '').replace(/\D/g, ''), 10)).filter((x) => !seen.has(x));
          return { pass: !bad.length, actual: bad.length ? `non registrati: ${bad.join(', ')}` : 'ok' };
        },
        onFail: 'Riporta lo status realmente ricevuto, non quello che vorresti vedere.',
      },
    ],
    example: { text: 'Esempio analogo di piano per GET /v1/tasks/{id}.', cmd: { bash: "printf '| ID | Input | Atteso | Effettivo | Esito |\\n|---|---|---|---|---|\\n| TC1 | id esistente | 200 | 200 | Passato |\\n' > ~/docs/prova.md" } },
    hints: ['Tre richieste: titolo valido (201); titolo "x" (422); senza Authorization (401). Annota lo status di ciascuna.', 'Struttura riga: | TC1 | titolo valido | 201 | 201 | Passato |'],
    solutions: {
      bash: [
        'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Titolo valido"}\' $TASKFLOW_URL/v1/tasks',
        'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"x"}\' $TASKFLOW_URL/v1/tasks',
        'curl -s -o /dev/null -w "%{http_code}\\n" -X POST -H "Content-Type: application/json" -d \'{"title":"Titolo valido"}\' $TASKFLOW_URL/v1/tasks',
        `cat > ~/docs/test-plan.md <<'EOF'\n${TEST_PLAN}EOF`,
      ],
      pwsh: [
        '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }',
        '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body \'{"title":"Titolo valido"}\' -UseBasicParsing).StatusCode',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body \'{"title":"x"}\' } catch { $_.Exception.Response.StatusCode.value__ }',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -ContentType "application/json" -Body \'{"title":"Titolo valido"}\' } catch { $_.Exception.Response.StatusCode.value__ }',
        `Set-Content ~/docs/test-plan.md -Value @'\n${TEST_PLAN}'@`,
      ],
    },
    summary: ['test case: ID, input, atteso, effettivo, esito', 'positivi e negativi', "l'atteso viene dalla specifica", 'esegui davvero e riporta i valori reali'],
    skills: ['testing', 'docs', 'http'],
    concepts: ['test case e test plan', 'casi positivi e negativi', 'atteso ed effettivo'],
  },
  {
    id: 'M6.L2',
    artifacts: ['~/docs/bug-report.md'],
    module: 6,
    n: 2,
    title: 'Passi di riproduzione e report di bug',
    objective: 'Scrivere un bug report riproducibile che distingue fatto osservato, comportamento documentato e ipotesi.',
    explain: [
      'Un bug report utile permette a un altro di riprodurre il problema senza chiederti nulla: ambiente, passi numerati, risultato atteso, risultato ottenuto, evidenze (status, corpo, X-Request-Id).',
      'Tre piani da non mescolare: il FATTO OSSERVATO (cosa risponde il sistema), il COMPORTAMENTO DOCUMENTATO (cosa dice la documentazione) e l\'IPOTESI (cosa pensi sia la causa: da dichiarare come tale).',
      "Qui la guida vecchia (guida-vecchia.md) dice che si può riaprire un task completato. Verifica se è vero.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: 'valid' });
      c.file('guida-vecchia.md', OLD_GUIDE);
      c.vfs.mkdir('/home/learner/docs', true);
    },
    guided: [
      { title: 'Leggere la documentazione', cmd: { bash: 'cat ~/corso-cli/m6l2/guida-vecchia.md', pwsh: 'cat ~/corso-cli/m6l2/guida-vecchia.md' }, what: 'Mostra cosa dice la guida.', who: 'cat.', parts: ['documentato: PATCH status=open → 200'], expect: 'La guida (comportamento documentato).', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Il task 1 è completato (done). Cosa risponderà PATCH status=open secondo la guida? E secondo te, nella realtà?',
        cmd: { bash: 'curl -s -i -X PATCH -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"status":"open"}\' $TASKFLOW_URL/v1/tasks/1', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/tasks/1" -Method Patch -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"status":"open"}\' } catch { $_.ErrorDetails.Message }' },
        expect: 'La guida dice 200; il server risponde 409 invalid_transition.',
        why: 'Documentato e osservato non coincidono: è un possibile bug (o un errore nella guida).',
      },
    ],
    negative: {
      prompt: 'Un report vago: "il PATCH non funziona". Cosa manca?',
      cmd: { bash: 'echo "mancano: ambiente, passi, atteso, ottenuto, requestId"', pwsh: 'echo "mancano: ambiente, passi, atteso, ottenuto, requestId"' },
      explain: 'Senza passi e evidenze chi legge deve indovinare. Il laboratorio verifica che il tuo report contenga gli elementi e un X-Request-Id reale.',
    },
    task: {
      text: `Riproduci il problema sul task 1 e scrivi ${DOCS}/bug-report.md con le sezioni: ## Titolo, ## Ambiente, ## Passi per riprodurre, ## Risultato atteso, ## Risultato ottenuto, ## Evidenze (con status, codice applicativo e X-Request-Id reale), ## Fatto osservato, ## Comportamento documentato, ## Ipotesi.`,
      criterion: 'Il server ha registrato PATCH → 409; il report ha tutte le sezioni, cita 409 e invalid_transition e contiene il requestId di quella richiesta.',
    },
    checks: [
      {
        id: 'riproduzione',
        description: 'PATCH sul task completato → 409',
        expected: '409',
        test: (c) => ({ pass: c.apiShell.some((e) => e.method === 'PATCH' && e.status === 409), actual: c.apiShell.filter((e) => e.method === 'PATCH').map((e) => e.status).join(',') || 'nessun PATCH' }),
        onFail: 'Riproduci: PATCH /v1/tasks/1 con {"status":"open"}.',
      },
      {
        id: 'sezioni',
        description: 'Il report ha tutte le sezioni richieste',
        expected: 'Titolo, Ambiente, Passi, Atteso, Ottenuto, Evidenze, Fatto osservato, Documentato, Ipotesi',
        test: (c) => {
          const md = c.read('~/docs/bug-report.md');
          if (md === null) return { pass: false, actual: 'bug-report.md mancante' };
          const { missing } = hasSections(md, ['Titolo', 'Ambiente', 'Passi', 'atteso', 'ottenuto', 'Evidenze', 'Fatto osservato', 'documentato', 'Ipotesi']);
          return { pass: !missing.length, actual: missing.length ? `mancano: ${missing.join(', ')}` : 'ok' };
        },
        onFail: 'Aggiungi i titoli di sezione (## ...) mancanti.',
        kind: 'verifiable',
      },
      {
        id: 'evidenze',
        description: 'Evidenze oggettive: 409, invalid_transition, requestId reale',
        expected: '409 + invalid_transition + X-Request-Id del PATCH',
        test: (c) => {
          const md = c.read('~/docs/bug-report.md') ?? '';
          const ids = c.apiShell.filter((e) => e.method === 'PATCH' && e.status === 409).map((e) => e.requestId);
          const okId = ids.some((i) => md.includes(i));
          return { pass: md.includes('409') && md.includes('invalid_transition') && okId, actual: `409:${md.includes('409')} codice:${md.includes('invalid_transition')} requestId:${okId}` };
        },
        onFail: "Il requestId si legge nell'header X-Request-Id della risposta (curl -i). Copia valori reali, non inventati.",
      },
    ],
    example: { text: 'Esempio analogo di riga di evidenza.', cmd: { bash: 'echo "Evidenza: PATCH /v1/tasks/1 -> 409 invalid_transition (X-Request-Id: req_000010)"' } },
    hints: ['Con curl -i vedi X-Request-Id; in PowerShell il valore è in $_.Exception.Response.Headers["X-Request-Id"] dentro il catch.', 'Compila le tre sezioni "piano": fatto (409), documentato (200 secondo la guida), ipotesi (guida non aggiornata o regola nuova).'],
    solutions: {
      bash: [
        'RID=$(curl -s -i -X PATCH -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"status":"open"}\' $TASKFLOW_URL/v1/tasks/1 | grep -i x-request-id | cut -d" " -f2 | tr -d "\\r")',
        'cat > ~/docs/bug-report.md <<EOF\n# Bug report\n\n## Titolo\nPATCH status=open su task completato risponde 409 invece di 200\n\n## Ambiente\ndevelopment, API 1.0.0\n\n## Passi per riprodurre\n1. Usa il task 1 (status done).\n2. Invia PATCH /v1/tasks/1 con {"status":"open"}.\n\n## Risultato atteso\n200 e task riaperto (come da guida).\n\n## Risultato ottenuto\n409 invalid_transition.\n\n## Evidenze\nStatus 409, error invalid_transition, X-Request-Id: $RID\n\n## Fatto osservato\nIl server rifiuta la riapertura con 409.\n\n## Comportamento documentato\nLa guida vecchia dice che la risposta è 200.\n\n## Ipotesi\nLa regola è cambiata e la guida non è stata aggiornata.\nEOF',
      ],
      pwsh: [
        '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }',
        '$resp = try { Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks/1" -Method Patch -Headers $h -ContentType "application/json" -Body \'{"status":"open"}\' -UseBasicParsing } catch { $_.Exception.Response }',
        '$rid = $resp.Headers["X-Request-Id"]',
        'Set-Content ~/docs/bug-report.md -Value @"\n# Bug report\n\n## Titolo\nPATCH status=open su task completato risponde 409 invece di 200\n\n## Ambiente\ndevelopment, API 1.0.0\n\n## Passi per riprodurre\n1. Usa il task 1 (status done).\n2. Invia PATCH /v1/tasks/1 con status open.\n\n## Risultato atteso\n200 e task riaperto (come da guida).\n\n## Risultato ottenuto\n409 invalid_transition.\n\n## Evidenze\nStatus 409, error invalid_transition, X-Request-Id: $rid\n\n## Fatto osservato\nIl server rifiuta la riapertura con 409.\n\n## Comportamento documentato\nLa guida vecchia dice che la risposta è 200.\n\n## Ipotesi\nLa regola è cambiata e la guida non è stata aggiornata.\n"@',
      ],
    },
    summary: ['report riproducibile: ambiente, passi, atteso, ottenuto, evidenze', 'fatto ≠ documentato ≠ ipotesi', 'X-Request-Id come evidenza'],
    skills: ['testing', 'diagnosi', 'docs'],
    concepts: ['passi di riproduzione', 'bug report', 'fatto osservato, comportamento documentato, ipotesi'],
  },
  {
    id: 'M6.L3',
    artifacts: ['~/docs/m6l3-tasks-api.md'],
    module: 6,
    n: 3,
    title: 'Documentare un endpoint con esempi verificabili',
    objective: 'Correggere una pagina di documentazione finché metodo, campi, status ed esempi corrispondono davvero al comportamento dell\'API.',
    explain: [
      'La documentazione è accurata solo se si può verificare. Il laboratorio esegue gli esempi `curl` dei blocchi di codice in una copia isolata, confronta lo status con il commento `# => 201` e controlla endpoint, campi obbligatori, status previsti, JSON valido e versione.',
      'Il controllo distingue gli ERRORI VERIFICABILI (oggettivi) dalle VALUTAZIONI EDITORIALI (terminologia, completezza): le seconde sono suggerimenti, non fatti.',
      "Convenzioni dei blocchi: usa `$TASKFLOW_URL` e `$TOKEN` (mai segreti), un commento `# => <status>` per lo stato atteso e una sezione ### Errori con almeno un caso negativo.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: false });
      c.vfs.mkdir('/home/learner/docs', true);
      c.vfs.seed('/home/learner/docs/m6l3-tasks-api.md', STARTER_GUIDE);
    },
    guided: [
      { title: 'Leggere la bozza', cmd: { bash: 'cat ~/docs/m6l3-tasks-api.md', pwsh: 'cat ~/docs/m6l3-tasks-api.md' }, what: 'Mostra la bozza con errori deliberati.', who: 'cat.', parts: ['Cerca: metodo, campo, status, JSON'], expect: 'La documentazione da correggere.', risk: 'Nessuno.' },
      { title: 'Verificare con la specifica', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths[\"/tasks\"] | keys'", pwsh: '(irm "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".PSObject.Properties.Name' }, what: 'Elenca i metodi di /tasks.', who: 'jq.', parts: ['get e post, non put'], expect: 'get, post', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Quanti errori verificabili pensi di trovare nella bozza? Elencali prima di usare il controllo (metodo, campo, status, JSON...).',
        cmd: { bash: 'cat ~/docs/m6l3-tasks-api.md | head -30', pwsh: 'cat ~/docs/m6l3-tasks-api.md | Select-Object -First 30' },
        expect: 'Almeno quattro: metodo PUT inesistente su /tasks, campo "nome" invece di title, JSON con virgola finale, status 200 invece di 201.',
        why: 'Ogni affermazione della guida deve essere riscontrabile nella specifica o in una richiesta.',
      },
    ],
    negative: {
      prompt: 'Esegui l\'esempio PUT della bozza nel terminale e confrontalo con il documentato.',
      cmd: { bash: 'curl -s -i -X PUT "$TASKFLOW_URL/v1/tasks" | head -3', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/tasks" -Method Put } catch { $_.Exception.Message }' },
      explain: 'Il server non conosce PUT /v1/tasks (405 o 401 prima: l\'autenticazione precede). La guida documenta un\'operazione inesistente.',
    },
    task: {
      text: 'Correggi `~/docs/m6l3-tasks-api.md` (puoi modificarlo con l\'editor della scheda Documentazione oppure da terminale) finché il controllo dei documenti non mostra né errori né avvisi verificabili e tutti gli esempi eseguiti hanno lo stato atteso corretto.',
      criterion: 'Zero errori e zero avvisi verificabili; almeno 2 esempi eseguiti, tutti con lo status dichiarato.',
    },
    checks: [
      {
        id: 'lint',
        description: 'Il controllo documentale non trova errori né avvisi verificabili',
        expected: '0 errori, 0 avvisi',
        test: (c) => {
          const r = lintOf(c, '~/docs/m6l3-tasks-api.md');
          if (!r) return { pass: false, actual: 'documento mancante' };
          const bad = r.issues.filter((i) => i.kind === 'verifiable' && i.severity !== 'info');
          return { pass: bad.length === 0, actual: bad.length ? bad.slice(0, 3).map((i) => `riga ${i.line}: ${i.message}`).join(' | ') : 'ok' };
        },
        onFail: 'Apri la scheda Documentazione e usa "Controlla": ogni messaggio indica riga e causa.',
      },
      {
        id: 'esempi',
        description: 'Almeno 2 esempi eseguiti con lo status dichiarato',
        expected: 'esempio 201 e esempio 422',
        test: (c) => {
          const r = lintOf(c, '~/docs/m6l3-tasks-api.md');
          if (!r) return { pass: false, actual: 'documento mancante' };
          return { pass: r.stats.examplesRun >= 2 && r.stats.examplesOk === r.stats.examplesRun, actual: `${r.stats.examplesOk}/${r.stats.examplesRun} esempi verificati` };
        },
        onFail: 'Serve un esempio di successo (# => 201) e uno di errore (# => 422), entrambi realmente eseguibili.',
      },
    ],
    example: { text: 'Esempio analogo: come si dichiara un esempio verificabile.', cmd: { bash: 'echo \'curl -s "$TASKFLOW_URL/v1/health"\\n# => 200\'' } },
    hints: ['Quattro cose: il metodo giusto per creare è POST; il campo obbligatorio si chiama title; lo status di creazione è 201; il JSON non ammette virgole finali.', 'Aggiungi una sezione ### Errori con un secondo esempio e il commento # => 422.'],
    solutions: {
      bash: [`cat > ~/docs/m6l3-tasks-api.md <<'EOF'\n${FIXED_GUIDE}EOF`],
      pwsh: [`Set-Content ~/docs/m6l3-tasks-api.md -Value @'\n${FIXED_GUIDE}'@`],
    },
    summary: ['esempi eseguibili con stato atteso', 'campi obbligatori documentati', 'status solo tra quelli previsti', 'JSON valido', 'verificabile ≠ editoriale'],
    skills: ['docs', 'testing', 'http'],
    concepts: ['documentazione di un endpoint', 'esempi verificabili', 'coerenza tra documentazione e comportamento'],
  },
  {
    id: 'M6.L5',
    artifacts: ['~/docs/troubleshooting.md'],
    module: 6,
    n: 5,
    title: 'Troubleshooting e verifica da un ambiente pulito',
    objective: 'Scrivere una guida di troubleshooting e una procedura ripetibile che funziona da un ambiente pulito.',
    explain: [
      'Una guida di troubleshooting è una tabella di cause e rimedi: per ogni problema, Sintomo (cosa vede l\'utente), Causa e Soluzione. Parte dai messaggi reali.',
      "Una procedura è ripetibile solo se funziona da zero: nessuna variabile pre-impostata, nessun file che solo tu hai. Il laboratorio la esegue in un WORKSPACE PULITO (senza TASKFLOW_*) per scoprirlo. Per questo lo script carica la configurazione dal file .env.development.",
      'Il file .env contiene credenziali SIMULATE. Nei progetti reali non si committa e non si condivide.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: false });
      c.vfs.mkdir('/home/learner/docs', true);
    },
    guided: [
      { title: 'Il file di configurazione', cmd: { bash: 'head -n 2 ~/projects/taskflow/.env.development', pwsh: 'Get-Content ~/projects/taskflow/.env.development -TotalCount 2' }, what: 'Mostra le prime righe (senza il segreto).', who: 'head / Get-Content.', parts: ['solo 2 righe: il segreto è oltre'], expect: 'Commento e TASKFLOW_URL.', risk: 'Non mostrare mai file con segreti in una chat.' },
    ],
    predict: [
      {
        prompt: 'Uno script che usa $TASKFLOW_URL ma non lo carica: funzionerà in un ambiente pulito?',
        cmd: { bash: 'env -i bash -c \'echo "URL=[$TASKFLOW_URL]"\'', pwsh: 'echo "URL=[$env:NON_IMPOSTATA]"' },
        expect: 'No: la variabile sarà vuota. Lo script deve caricare la configurazione (source .env / lettura del file).',
        why: 'Quello che funziona sul tuo terminale può dipendere da variabili che solo tu hai.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se la procedura dipende da un file che esiste solo da te?',
      cmd: { bash: 'cat /home/learner/non-esiste.env', pwsh: 'Get-Content /home/learner/non-esiste.env' },
      explain: "Nell'ambiente pulito il file manca e lo script fallisce: la procedura non era ripetibile.",
    },
    task: {
      text: `1) Scrivi ${DOCS}/troubleshooting.md con almeno 3 problemi (401 token scaduto, 422 validazione, 429 rate limit), ognuno con Sintomo, Causa e Soluzione. 2) In ~/corso-cli/m6l5 crea verifica.sh (Bash) o verifica.ps1 (PowerShell): carica la configurazione da ~/projects/taskflow/.env.development, ottiene un token, crea un task, lo elimina (204) e stampa VERIFICA OK. Deve funzionare da un ambiente pulito.`,
      criterion: 'La guida ha 3 sezioni con Sintomo/Causa/Soluzione e cita i codici 401, 422, 429; la verifica da ambiente pulito termina con 0 e stampa VERIFICA OK; nessun segreto nello script.',
    },
    checks: [
      {
        id: 'guida',
        description: 'troubleshooting.md: ≥3 problemi con Sintomo, Causa, Soluzione',
        expected: '3 × (Sintomo, Causa, Soluzione) + 401, 422, 429',
        test: (c) => {
          const md = c.read('~/docs/troubleshooting.md');
          if (md === null) return { pass: false, actual: 'troubleshooting.md mancante' };
          const n = (w: string): number => (md.match(new RegExp(`\\b${w}\\b`, 'gi')) ?? []).length;
          const codes = ['401', '422', '429'].filter((k) => md.includes(k));
          return { pass: n('sintomo') >= 3 && n('causa') >= 3 && n('soluzione') >= 3 && codes.length === 3, actual: `sintomo:${n('sintomo')} causa:${n('causa')} soluzione:${n('soluzione')} codici:${codes.join('/')}` };
        },
        onFail: 'Per ciascun problema: Sintomo, Causa, Soluzione. Copri 401, 422 e 429.',
        kind: 'verifiable',
      },
      {
        id: 'pulito',
        description: 'La procedura funziona da un ambiente pulito',
        expected: 'exit 0 e "VERIFICA OK"',
        test: (c) => {
          const f = c.shell === 'bash' ? 'verifica.sh' : 'verifica.ps1';
          if (c.read(f) === null) return { pass: false, actual: `${f} mancante` };
          const r = c.cleanRun!(f);
          return { pass: r.code === 0 && r.out.includes('VERIFICA OK'), actual: r.code === 0 ? r.out.trim().slice(0, 60) : `exit ${r.code}: ${(r.err || r.out).trim().split('\n')[0]?.slice(0, 90)}` };
        },
        onFail: "Nell'ambiente pulito non esistono TASKFLOW_URL, ID e SECRET: carica il file ~/projects/taskflow/.env.development all'inizio dello script.",
        errorTag: 'segreti-nei-comandi',
      },
      {
        id: 'segreti',
        description: 'Nessun segreto scritto nello script',
        expected: 'nessun valore di client secret',
        test: (c) => {
          const t = c.read(c.shell === 'bash' ? 'verifica.sh' : 'verifica.ps1') ?? '';
          const leak = ['dev-secret-42', 'test-secret-77', 'stg-secret-91'].some((s) => t.includes(s));
          return { pass: !!t && !leak, actual: leak ? 'segreto in chiaro' : t ? 'ok' : 'script mancante' };
        },
        onFail: 'Carica i segreti dal file di configurazione, non scriverli nello script.',
        errorTag: 'segreti-nei-comandi',
      },
    ],
    example: { text: 'Esempio analogo di caricamento di una configurazione.', cmd: { bash: 'source ~/projects/taskflow/.env.development && echo "URL=$TASKFLOW_URL"', pwsh: 'Get-Content ~/projects/taskflow/.env.development | Where-Object { $_ -match "^[A-Z_]+=" } | ForEach-Object { $p = $_ -split "=", 2; [Environment]::SetEnvironmentVariable($p[0], $p[1]) }' } },
    hints: ['Bash: la riga source "$HOME/projects/taskflow/.env.development" all\'inizio dello script. PowerShell: leggi il file e imposta le variabili d\'ambiente.', 'Lo script deve fallire (exit 1) se il DELETE non risponde 204.'],
    solutions: {
      bash: [`cat > ~/docs/troubleshooting.md <<'EOF'\n${TROUBLESHOOTING}EOF`, 'cd ~/corso-cli/m6l5', `cat > verifica.sh <<'EOF'\n${VERIFICA_SH}EOF`, 'chmod +x verifica.sh', './verifica.sh'],
      pwsh: [`Set-Content ~/docs/troubleshooting.md -Value @'\n${TROUBLESHOOTING}'@`, 'cd ~/corso-cli/m6l5', `Set-Content verifica.ps1 -Value @'\n${VERIFICA_PS1}'@`, './verifica.ps1'],
    },
    summary: ['troubleshooting: sintomo, causa, soluzione', 'procedura ripetibile = funziona da ambiente pulito', 'configurazione in file, non nella testa'],
    skills: ['docs', 'testing', 'diagnosi'],
    concepts: ['troubleshooting guide', 'verifica da ambiente pulito', 'configurazione e segreti'],
  },
  {
    id: 'M6.L6',
    artifacts: ['~/docs/final'],
    module: 6,
    n: 6,
    title: 'Progetto finale: testare e documentare staging',
    objective: 'Testare un\'API, individuare un\'anomalia rispetto alla documentazione e consegnare piano di test, bug report, guida corretta e procedura ripetibile.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Hai tutti gli strumenti dei moduli precedenti. Il laboratorio controlla i fatti oggettivi (richieste eseguite, esempi verificati, procedura da ambiente pulito); la qualità editoriale la valuti tu (o il tuo tutor).',
      'Leggi final-README.md nella cartella della lezione: contiene la consegna. L\'ambiente è STAGING (servizio simulato) e una guida in bozza descrive la versione 1.0.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => {
      setupApi(c, { env: 'staging', token: false });
      c.file('final-README.md', FINAL_README);
      c.file('final-guida-iniziale.md', FINAL_GUIDE_START);
      c.vfs.mkdir('/home/learner/docs/final', true);
    },
    guided: [
      { title: 'Cominciare', cmd: { bash: 'cat ~/corso-cli/m6l6/final-README.md', pwsh: 'cat ~/corso-cli/m6l6/final-README.md' }, what: 'Legge la consegna.', who: 'cat.', parts: [], expect: 'Elenco dei 4 file da consegnare.', risk: 'Staging simulato.' },
    ],
    predict: [
      {
        prompt: 'Prima di provare: cosa potrebbe essere cambiato nella versione nuova rispetto alla guida 1.0? Annota 2 ipotesi.',
        cmd: { bash: 'curl -sI $TASKFLOW_URL/v1/health', pwsh: '(iwr "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).Headers' },
        expect: 'Le ipotesi vanno confermate con evidenze: l\'header X-API-Version dice la versione.',
        why: 'Un\'ipotesi non verificata resta un\'ipotesi.',
      },
    ],
    negative: {
      prompt: 'Confronta ambiente di sviluppo e staging con la stessa richiesta: GET /v1/tasks?limit=1 (con token).',
      cmd: { bash: 'echo "usa i token di ciascun ambiente"', pwsh: 'echo "usa i token di ciascun ambiente"' },
      explain: 'I token sono legati all\'ambiente (invalid_token se usi quello sbagliato).',
    },
    task: {
      text: 'Consegna in ~/docs/final/: test-plan.md, bug-report.md, api-guide.md e run-tests.sh (o .ps1). Dettagli nella consegna (final-README.md).',
      criterion: 'Tutti i controlli oggettivi sotto sono superati.',
    },
    checks: [
      {
        id: 'piano',
        description: 'test-plan.md: ≥6 casi (≥2 positivi, ≥3 negativi) eseguiti su staging',
        expected: 'tabella con 6 casi; richieste reali su staging',
        test: (c) => {
          const t = parseTables(c.read('~/docs/final/test-plan.md') ?? '').find((x) => x.header.some((h) => /atteso/i.test(h)) && x.header.some((h) => /effettiv/i.test(h)));
          const staging = c.apiShell.filter((e) => e.env === 'staging');
          const ok2 = new Set(staging.filter((e) => e.status < 300).map((e) => e.path.split('?')[0] + e.method)).size;
          const err = new Set(staging.filter((e) => e.status >= 400).map((e) => e.status)).size;
          return { pass: !!t && t.rows.length >= 6 && ok2 >= 2 && err >= 3, actual: `righe:${t?.rows.length ?? 0} positivi:${ok2} errori distinti:${err}` };
        },
        onFail: 'Servono ≥6 casi nella tabella e richieste vere su staging: almeno 2 successi e 3 tipi di errore diversi.',
      },
      {
        id: 'bug',
        description: 'bug-report.md documenta l\'anomalia (items vs data, versione) con un requestId reale',
        expected: 'cita items, data, 1.1, X-API-Version e un requestId di staging',
        test: (c) => {
          const md = c.read('~/docs/final/bug-report.md') ?? '';
          const ids = c.api.filter((e) => e.env === 'staging').map((e) => e.requestId);
          const okId = ids.some((i) => md.includes(i));
          const heads = hasSections(md, ['Passi', 'atteso', 'ottenuto', 'Ipotesi']);
          return { pass: md.includes('items') && md.includes('data') && /1\.1/.test(md) && /X-API-Version/i.test(md) && okId && !heads.missing.length, actual: `items:${md.includes('items')} data:${md.includes('data')} v1.1:${/1\.1/.test(md)} header:${/X-API-Version/i.test(md)} requestId:${okId} mancano:${heads.missing.join(',')}` };
        },
        onFail: "L'anomalia: su staging l'elenco task usa la proprietà items e la versione è 1.1.0, mentre la guida dice data/1.0. Cita evidenze reali e separa fatto, documentato, ipotesi.",
      },
      {
        id: 'guida',
        description: 'api-guide.md: nessun errore/avviso verificabile, versione 1.1, items',
        expected: 'lint pulito, esempi verificati su staging',
        test: (c) => {
          const md = c.read('~/docs/final/api-guide.md');
          if (md === null) return { pass: false, actual: 'api-guide.md mancante' };
          const r = lintDocument(c.state, md);
          const bad = r.issues.filter((i) => i.kind === 'verifiable' && i.severity !== 'info');
          const okV = /1\.1/.test(md) && /staging/i.test(md) && md.includes('items');
          return { pass: bad.length === 0 && r.stats.examplesRun >= 2 && r.stats.examplesOk === r.stats.examplesRun && okV, actual: bad.length ? bad.slice(0, 2).map((i) => `riga ${i.line}: ${i.message}`).join(' | ') : `${r.stats.examplesOk}/${r.stats.examplesRun} esempi; versione 1.1/items: ${okV}` };
        },
        onFail: 'Aggiorna la guida: Ambiente staging, Versione 1.1, proprietà items, almeno un esempio di successo e uno di errore con # => status.',
      },
      {
        id: 'procedura',
        description: 'run-tests: da ambiente pulito, PASS ≥5 e FAIL: 0',
        expected: 'exit 0, "PASS: n FAIL: 0"',
        test: (c) => {
          const f = c.shell === 'bash' ? '~/docs/final/run-tests.sh' : '~/docs/final/run-tests.ps1';
          const abs = f.replace('~', '/home/learner');
          if (c.read(f) === null) return { pass: false, actual: `${f} mancante` };
          const r = c.cleanRun!(abs);
          const m = /PASS:\s*(\d+)\s+FAIL:\s*(\d+)/.exec(r.out);
          return { pass: r.code === 0 && !!m && parseInt(m[1], 10) >= 5 && m[2] === '0', actual: m ? `PASS ${m[1]} FAIL ${m[2]} (exit ${r.code})` : `exit ${r.code}: ${(r.err || r.out).trim().split('\n')[0]?.slice(0, 80)}` };
        },
        onFail: 'Lo script deve caricare ~/projects/taskflow/.env.staging, eseguire ≥5 verifiche e stampare "PASS: n FAIL: 0".',
      },
    ],
    example: { text: 'Esempio: struttura di una procedura di test con contatori.', cmd: { bash: 'PASS=0; FAIL=0; [ "$code" = "200" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "PASS: $PASS FAIL: $FAIL"' } },
    hints: ["Confronta la risposta di GET /v1/tasks su staging con la guida: guarda le chiavi dell'oggetto e l'header X-API-Version.", 'Per la procedura: carica .env.staging, ottieni il token, esegui le verifiche con un contatore PASS/FAIL ed esci con 1 se FAIL > 0.'],
    reference: {
      bash: [
        'TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)',
        'curl -s $TASKFLOW_URL/v1/health',
        'RID=$(curl -s -i -H "Authorization: Bearer $TOKEN" $TASKFLOW_URL/v1/tasks | grep -i x-request-id | cut -d" " -f2 | tr -d "\\r")',
        'curl -s $TASKFLOW_URL/v1/tasks',
        'curl -s -H "Authorization: Bearer $TOKEN" $TASKFLOW_URL/v1/tasks/9999',
        'curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d \'{"title":"x"}\' $TASKFLOW_URL/v1/tasks',
        `cat > ~/docs/final/test-plan.md <<'EOF'\n${FINAL_PLAN}EOF`,
        'cat > ~/docs/final/bug-report.md <<EOF\n# Bug report\n\n## Titolo\nGET /v1/tasks su staging usa items invece di data\n\n## Passi per riprodurre\n1. Ottieni un token su staging.\n2. GET /v1/tasks.\n\n## Risultato atteso\nLa proprietà data come da guida 1.0.\n\n## Risultato ottenuto\nLa proprietà items; header X-API-Version: 1.1.0. X-Request-Id: $RID\n\n## Ipotesi\nStaging esegue la versione 1.1 e la guida non è aggiornata.\nEOF',
        `cat > ~/docs/final/api-guide.md <<'EOF'\n${FINAL_GUIDE_OK}EOF`,
        `cat > ~/docs/final/run-tests.sh <<'EOF'\n${FINAL_RUN_SH}EOF`,
      ],
      pwsh: [
        '$cred = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json',
        '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $cred',
        '$h = @{ Authorization = "Bearer $($r.access_token)" }',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" | Out-Null',
        '$rid = (Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Headers $h -UseBasicParsing).Headers["X-Request-Id"]',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" } catch { }',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/9999" -Headers $h } catch { }',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body \'{"title":"x"}\' } catch { }',
        `Set-Content ~/docs/final/test-plan.md -Value @'\n${FINAL_PLAN}'@`,
        'Set-Content ~/docs/final/bug-report.md -Value @"\n# Bug report\n\n## Titolo\nGET /v1/tasks su staging usa items invece di data\n\n## Passi per riprodurre\n1. Ottieni un token su staging.\n2. GET /v1/tasks.\n\n## Risultato atteso\nLa proprietà data come da guida 1.0.\n\n## Risultato ottenuto\nLa proprietà items; header X-API-Version: 1.1.0. X-Request-Id: $rid\n\n## Ipotesi\nStaging esegue la versione 1.1 e la guida non è aggiornata.\n"@',
        `Set-Content ~/docs/final/api-guide.md -Value @'\n${FINAL_GUIDE_OK}'@`,
        `Set-Content ~/docs/final/run-tests.ps1 -Value @'\n${FINAL_RUN_PS1}'@`,
      ],
    },
    summary: ['piano di test eseguito', 'bug report con evidenze', 'documentazione verificata', 'procedura ripetibile da ambiente pulito'],
    skills: ['testing', 'diagnosi', 'docs', 'autonomia'],
    concepts: ['progetto finale: test plan, bug report, guida e procedura ripetibile', 'anomalia di versione tra documentazione e comportamento'],
  },
];
