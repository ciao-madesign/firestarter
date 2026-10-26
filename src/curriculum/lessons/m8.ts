import type { Check, Lesson } from '../types.ts';
import { lintDocument, parseTables } from '../../docs/lint.ts';
import { buildOpenApi, ENDPOINTS, API_VERSION } from '../../engine/api/spec.ts';
import { setupApi } from './helpers.ts';

const fence = (s: string): string => s.replace(/~~~/g, '```');

function lintOf(c: Parameters<Check['test']>[0], rel: string) {
  const md = c.read(rel);
  return md === null ? null : lintDocument(c.state, md);
}

function setup(c: Parameters<Lesson['setup']>[0], env: 'development' | 'staging' = 'development'): void {
  setupApi(c, { env, token: 'valid' });
  c.vfs.mkdir('/home/learner/portfolio', true);
}

const GUIDA = fence(`# Guida rapida — API TaskFlow

Ambiente: development
Versione dell'API: 1.0

## Autenticazione

Tutte le richieste, tranne \`/v1/health\`, richiedono l'header \`Authorization: Bearer <token>\`.

## GET /v1/health

Verifica che il servizio sia attivo. Restituisce 200.

~~~bash
curl -s "$TASKFLOW_URL/v1/health"
# => 200
~~~

## GET /v1/tasks

Elenca i task. Restituisce 200 con l'elenco paginato.

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN"
# => 200
~~~

### Errori

Senza token l'API restituisce 401:

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks"
# => 401
~~~

## POST /v1/tasks

Crea un task. Il campo obbligatorio è \`title\` (da 3 a 80 caratteri). Restituisce 201.

~~~bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "Scrivere la guida"}'
# => 201
~~~

### Errori

Con un titolo troppo corto l'API restituisce 422:

~~~bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "x"}'
# => 422
~~~
`);

const OPENAPI_PATHS = ['/health', '/tasks', '/tasks/{id}'];
function openapiSubset(): string {
  const full = buildOpenApi('development') as { paths: Record<string, unknown> };
  const paths = Object.fromEntries(Object.entries(full.paths).filter(([p]) => OPENAPI_PATHS.includes(p)));
  return JSON.stringify({ ...full, paths }, null, 2) + '\n';
}

const BUG = fence(`# Bug: l'elenco dei task in staging usa il campo \`items\` invece di \`data\`

Ambiente: staging
Versione dell'API: 1.1.0

## Riepilogo

Nell'ambiente di staging la risposta dell'elenco dei task contiene il campo \`items\`; in development lo stesso elenco è nel campo \`data\`. Chi legge \`.data\` ottiene un risultato vuoto.

## Passi per riprodurre

1. Seleziona l'ambiente di staging.
2. Esegui la richiesta di elenco con un token valido.

~~~bash
curl -s "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN"
# => 200
~~~

3. Osserva i nomi dei campi della risposta.

## Risultato atteso

L'elenco è nel campo \`data\`, come nella versione 1.0 di development.

## Risultato ottenuto

L'elenco è nel campo \`items\`; il campo \`data\` non esiste.

## Impatto

Gli script e le guide che leggono \`.data\` non funzionano su staging.
`);

const TROUBLE = `# Risoluzione dei problemi — API TaskFlow

| Sintomo | Causa probabile | Come verificare | Soluzione |
|---|---|---|---|
| 401 Unauthorized | Token assente, scaduto o non valido | Controlla l'header Authorization e la scadenza del token | Richiedi un nuovo token con POST /v1/auth/token |
| 404 Not Found | Percorso o identificativo inesistente | Confronta l'URL con la specifica OpenAPI | Correggi il percorso o l'id del task |
| 422 Unprocessable Entity | Campo obbligatorio mancante o valore non valido | Leggi il corpo dell'errore: indica il campo | Invia un title di 3-80 caratteri |
| 429 Too Many Requests | Troppe richieste in poco tempo | Leggi l'header Retry-After | Attendi i secondi indicati e riprova |
`;

const TEST_SH = `#!/bin/bash
# Test di fumo dell'API TaskFlow. Uso: bash test-api.sh
REPORT="report.txt"
PASS=0
FAIL=0
rm -f "$REPORT"
check() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1))
    R="PASS: $1"
  else
    FAIL=$((FAIL+1))
    R="FAIL: $1 (atteso $2, ottenuto $3)"
  fi
  echo "$R"
  echo "$R" >> "$REPORT"
}
status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
AUTH="Authorization: Bearer $TASKFLOW_TOKEN"
check "health" 200 "$(status "$TASKFLOW_URL/v1/health")"
check "profilo con token" 200 "$(status -H "$AUTH" "$TASKFLOW_URL/v1/me")"
check "elenco con token" 200 "$(status -H "$AUTH" "$TASKFLOW_URL/v1/tasks")"
check "elenco senza token" 401 "$(status "$TASKFLOW_URL/v1/tasks")"
check "task inesistente" 404 "$(status -H "$AUTH" "$TASKFLOW_URL/v1/tasks/9999")"
check "titolo troppo corto" 422 "$(status -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"title":"x"}' "$TASKFLOW_URL/v1/tasks")"
echo "PASS: $PASS FAIL: $FAIL"
echo "PASS: $PASS FAIL: $FAIL" >> "$REPORT"
[ "$FAIL" -eq 0 ] || exit 1
`;

const TEST_PS1 = `$report = 'report.txt'
$pass = 0
$fail = 0
Remove-Item $report -ErrorAction SilentlyContinue
function Check($nome, $atteso, $ottenuto) {
  if ("$atteso" -eq "$ottenuto") { $script:pass++; $r = "PASS: $nome" }
  else { $script:fail++; $r = "FAIL: $nome (atteso $atteso, ottenuto $ottenuto)" }
  Write-Output $r
  Add-Content $report $r
}
function Status($uri, $headers = @{}, $method = 'GET', $body = $null) {
  try {
    if ($body) { (Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -Body $body -ContentType 'application/json' -UseBasicParsing).StatusCode }
    else { (Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -UseBasicParsing).StatusCode }
  } catch { $_.Exception.Response.StatusCode.value__ }
}
$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }
Check 'health' 200 (Status "$env:TASKFLOW_URL/v1/health")
Check 'profilo con token' 200 (Status "$env:TASKFLOW_URL/v1/me" $h)
Check 'elenco con token' 200 (Status "$env:TASKFLOW_URL/v1/tasks" $h)
Check 'elenco senza token' 401 (Status "$env:TASKFLOW_URL/v1/tasks")
Check 'task inesistente' 404 (Status "$env:TASKFLOW_URL/v1/tasks/9999" $h)
Check 'titolo troppo corto' 422 (Status "$env:TASKFLOW_URL/v1/tasks" $h 'POST' '{"title":"x"}')
Write-Output "PASS: $script:pass FAIL: $script:fail"
Add-Content $report "PASS: $script:pass FAIL: $script:fail"
if ($script:fail -gt 0) { exit 1 }
`;

export const m8: Lesson[] = [
  {
    id: 'M8.L1',
    artifacts: ['~/portfolio/guida-rapida.md'],
    module: 8,
    n: 1,
    title: 'Portfolio 1: guida rapida all\'API',
    objective: 'Scrivere da zero una guida "primi passi" i cui esempi curl sono tutti verificati dal controllo tecnico.',
    explain: [
      'Una buona guida rapida risponde a tre domande: come mi autentico, come faccio la prima richiesta, che cosa succede quando sbaglio. Ogni risposta ha un esempio che si può eseguire.',
      'Il laboratorio esegue gli esempi `curl` e confronta lo status con il commento `# => 200`. Un esempio che non corrisponde al comportamento reale è un errore verificabile.',
      'Il file prodotto è un artefatto da portfolio: resta in `~/portfolio/guida-rapida.md` e puoi scaricarlo dalla scheda Documentazione.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setup(c),
    guided: [
      { title: 'Prendere la forma di un documento verificato', cmd: { bash: 'cat ~/docs/m6l3-tasks-api.md 2>/dev/null | head -20 || echo "apri la scheda Documentazione"', pwsh: 'echo "apri la scheda Documentazione"' }, what: 'Richiama la struttura di una pagina già corretta (modulo 6).', who: 'cat.', parts: ['titolo, ambiente, versione, sezioni per endpoint'], expect: 'La struttura da imitare, se hai svolto M6.L3.', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Quanti esempi servono almeno per coprire tre endpoint, compresi i casi di errore?', cmd: { bash: 'echo "almeno 5: health, elenco, elenco senza token, creazione, creazione non valida"', pwsh: 'echo "almeno 5"' }, expect: 'Almeno tre di successo e due di errore (401 e 422).', why: 'Una guida che mostra solo i casi felici non aiuta quando qualcosa va storto.' },
    ],
    negative: {
      prompt: 'Controlla un documento con un esempio sbagliato: che cosa segnala il controllo?',
      cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -X PUT "$TASKFLOW_URL/v1/tasks"', pwsh: 'try { Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Put -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }' },
      explain: 'Lo status reale non è quello che una guida ingenua dichiarerebbe: per questo gli esempi vanno eseguiti, non solo scritti.',
    },
    task: {
      text: 'Crea `~/portfolio/guida-rapida.md` (con l\'editor della scheda Documentazione o da terminale): ambiente e versione, una sezione Autenticazione (Bearer), almeno tre endpoint con titolo `## METODO /v1/percorso`, e almeno tre esempi eseguibili con `# => status`, di cui uno di errore (401 o 422). Il controllo non deve mostrare errori né avvisi verificabili.',
      criterion: 'Zero errori/avvisi verificabili; almeno 3 endpoint; almeno 3 esempi eseguiti tutti corretti, di cui uno con status 4xx.',
    },
    checks: [
      {
        id: 'lint',
        description: 'Il controllo documentale non trova errori né avvisi verificabili',
        expected: '0 errori, 0 avvisi',
        test: (c) => {
          const r = lintOf(c, '~/portfolio/guida-rapida.md');
          if (!r) return { pass: false, actual: 'documento mancante' };
          const bad = r.issues.filter((i) => i.kind === 'verifiable' && i.severity !== 'info');
          return { pass: bad.length === 0, actual: bad.length ? bad.slice(0, 3).map((i) => `riga ${i.line}: ${i.message}`).join(' | ') : 'ok' };
        },
        onFail: 'Apri la scheda Documentazione e usa "Controlla": ogni messaggio indica riga e causa.',
      },
      {
        id: 'endpoint',
        description: 'Almeno tre endpoint documentati con titolo',
        expected: '3 titoli "## METODO /v1/..."',
        test: (c) => {
          const md = c.read('~/portfolio/guida-rapida.md') ?? '';
          const found = new Set([...md.matchAll(/^#{2,3}\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/v1\/\S*)/gm)].map((m) => `${m[1]} ${m[2]}`));
          return { pass: found.size >= 3, actual: `${found.size} endpoint` };
        },
        onFail: 'Un titolo per endpoint, ad esempio `## GET /v1/health`.',
      },
      {
        id: 'esempi',
        description: 'Almeno 3 esempi eseguiti e corretti, di cui uno di errore',
        expected: '3 esempi ok, uno con status ≥ 400',
        test: (c) => {
          const r = lintOf(c, '~/portfolio/guida-rapida.md');
          if (!r) return { pass: false, actual: 'documento mancante' };
          const neg = r.examples.some((e) => e.ok && (e.expected ?? 0) >= 400);
          return { pass: r.stats.examplesRun >= 3 && r.stats.examplesOk === r.stats.examplesRun && neg, actual: `${r.stats.examplesOk}/${r.stats.examplesRun} ok${neg ? ', con caso di errore' : ', nessun caso di errore'}` };
        },
        onFail: 'Aggiungi esempi con il commento `# => 200` e almeno uno con `# => 401` o `# => 422`.',
      },
      {
        id: 'auth',
        description: 'È spiegata l\'autenticazione Bearer',
        expected: 'sezione Autenticazione con Bearer',
        test: (c) => {
          const md = c.read('~/portfolio/guida-rapida.md') ?? '';
          const ok = /^#{1,3}\s+Autenticazione/im.test(md) && /bearer/i.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'manca la sezione Autenticazione con Bearer' };
        },
        onFail: 'Chi legge deve sapere subito come inviare il token.',
        kind: 'editorial',
      },
    ],
    example: { text: 'Esempio analogo: come si dichiara un esempio verificabile.', cmd: { bash: 'echo \'curl -s "$TASKFLOW_URL/v1/health"\\n# => 200\'' } },
    hints: ['Parti dalla struttura della pagina corretta in M6.L3: titolo, Ambiente, Versione dell\'API, sezioni per endpoint.', 'Per ogni endpoint: una frase, lo status di successo, un blocco bash con `# => status`; per l\'errore una sezione `### Errori`.'],
    solutions: {
      bash: [`cat > ~/portfolio/guida-rapida.md <<'EOF'\n${GUIDA}EOF`],
      pwsh: [`Set-Content ~/portfolio/guida-rapida.md -Value @'\n${GUIDA}'@`],
    },
    summary: ['guida con esempi eseguibili', 'casi di errore documentati', 'autenticazione spiegata subito'],
    skills: ['docs', 'http', 'autonomia'],
    concepts: ['guida rapida', 'esempi verificabili', 'portfolio'],
  },
  {
    id: 'M8.L2',
    artifacts: ['~/portfolio/openapi.json'],
    module: 8,
    n: 2,
    title: 'Portfolio 2: specifica OpenAPI',
    objective: 'Scrivere una specifica OpenAPI per tre risorse e confrontarla con quella pubblicata dal servizio.',
    explain: [
      'Una specifica OpenAPI descrive endpoint, parametri, corpi richiesti e risposte in modo leggibile dalle macchine. OpenAPI accetta sia YAML sia JSON: qui usi il JSON, che il laboratorio sa controllare.',
      'Il servizio pubblica la propria specifica (`/v1/openapi.json`): è il riferimento. La tua deve descrivere SOLO ciò che esiste, con gli stessi status e gli stessi campi obbligatori.',
      'Struttura minima: `openapi`, `info` (titolo e versione), `paths` → percorso → metodo → `responses` (e `requestBody` per POST).',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setup(c),
    guided: [
      { title: 'Leggere la specifica del servizio', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths | keys'", pwsh: '(irm "$env:TASKFLOW_URL/v1/openapi.json").paths.PSObject.Properties.Name' }, what: 'Elenca i percorsi documentati.', who: 'jq / PowerShell.', parts: ['paths: i percorsi'], expect: 'Elenco dei percorsi, tra cui /health, /tasks, /tasks/{id}.', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Quali campi sono obbligatori per creare un task secondo la specifica?', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths[\"/tasks\"].post.requestBody.content[\"application/json\"].schema.required'", pwsh: '(irm "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".post.requestBody.content."application/json".schema.required' }, expect: '["title"]', why: 'La specifica è la fonte: non si indovina.' },
    ],
    negative: {
      prompt: 'Che cosa succede se documenti un endpoint che non esiste?',
      cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/utenti"', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/utenti" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.Exception.Response.StatusCode.value__ }' },
      explain: 'Il servizio risponde 404: una specifica che descrive percorsi inesistenti è peggio di nessuna specifica.',
    },
    task: {
      text: 'Crea `~/portfolio/openapi.json` con la specifica (OpenAPI 3.x) di tre percorsi: `/health` (GET), `/tasks` (GET e POST) e `/tasks/{id}` (GET). Indica `info.title`, `info.version` uguale a quella del servizio, tutte le risposte previste e, per POST /tasks, il corpo richiesto con il campo obbligatorio.',
      criterion: 'JSON valido; tre percorsi con i metodi richiesti; per ogni operazione tutti gli status della specifica del servizio; POST /tasks con `title` obbligatorio; nessun percorso inventato.',
    },
    checks: [
      {
        id: 'json',
        description: 'Il file è un JSON OpenAPI 3.x con titolo e versione',
        expected: 'openapi 3.x, info.title, info.version',
        test: (c) => {
          const t = c.read('~/portfolio/openapi.json');
          if (t === null) return { pass: false, actual: 'file mancante' };
          try {
            const d = JSON.parse(t);
            const ok = /^3\./.test(String(d.openapi)) && !!d.info?.title && String(d.info?.version) === API_VERSION.development;
            return { pass: ok, actual: ok ? 'ok' : `openapi ${d.openapi}, versione ${d.info?.version} (attesa ${API_VERSION.development})` };
          } catch (e) {
            return { pass: false, actual: `JSON non valido: ${(e as Error).message}` };
          }
        },
        onFail: 'Controlla virgole e parentesi; la versione deve coincidere con quella restituita dal servizio.',
      },
      {
        id: 'percorsi',
        description: 'Percorsi, metodi e status coincidono con il servizio',
        expected: '/health GET; /tasks GET+POST; /tasks/{id} GET; tutte le risposte previste; niente di inventato',
        test: (c) => {
          const t = c.read('~/portfolio/openapi.json');
          if (t === null) return { pass: false, actual: 'file mancante' };
          let d: { paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>> };
          try {
            d = JSON.parse(t);
          } catch {
            return { pass: false, actual: 'JSON non valido' };
          }
          const want: [string, string][] = [['/health', 'get'], ['/tasks', 'get'], ['/tasks', 'post'], ['/tasks/{id}', 'get']];
          const problems: string[] = [];
          for (const [p, m] of want) {
            const op = d.paths?.[p]?.[m];
            const spec = ENDPOINTS.find((e) => e.path === p && e.method.toLowerCase() === m);
            if (!op || !spec) {
              problems.push(`manca ${m.toUpperCase()} ${p}`);
              continue;
            }
            const miss = spec.responses.map((r) => String(r.status)).filter((s) => !(op.responses && s in op.responses));
            if (miss.length) problems.push(`${m.toUpperCase()} ${p}: mancano le risposte ${miss.join(', ')}`);
          }
          for (const [p, ops] of Object.entries(d.paths ?? {})) {
            for (const m of Object.keys(ops)) if (!ENDPOINTS.some((e) => e.path === p && e.method.toLowerCase() === m)) problems.push(`inventato: ${m.toUpperCase()} ${p}`);
          }
          return { pass: problems.length === 0, actual: problems.length ? problems.slice(0, 3).join(' | ') : 'ok' };
        },
        onFail: 'Confronta con `curl $TASKFLOW_URL/v1/openapi.json`: stessi percorsi, stessi metodi, stesse risposte.',
      },
      {
        id: 'corpo',
        description: 'POST /tasks richiede il campo title',
        expected: 'requestBody.content["application/json"].schema.required contiene title',
        test: (c) => {
          const t = c.read('~/portfolio/openapi.json');
          try {
            const req = JSON.parse(t ?? '{}').paths?.['/tasks']?.post?.requestBody?.content?.['application/json']?.schema?.required;
            const ok = Array.isArray(req) && req.includes('title');
            return { pass: ok, actual: ok ? 'ok' : 'campo obbligatorio non dichiarato' };
          } catch {
            return { pass: false, actual: 'JSON non valido' };
          }
        },
        onFail: 'Descrivi il corpo della richiesta con `schema.required: ["title"]`.',
      },
    ],
    example: { text: 'Esempio analogo: estrarre un frammento della specifica del servizio.', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths[\"/health\"]'", pwsh: '(irm "$env:TASKFLOW_URL/v1/openapi.json").paths."/health" | ConvertTo-Json -Depth 8' } },
    hints: ['Parti da `curl -s $TASKFLOW_URL/v1/openapi.json`: guarda come sono scritti /health e /tasks.', 'Per ogni operazione servono `summary` e `responses` con TUTTI gli status previsti; per POST aggiungi `requestBody`.'],
    solutions: {
      bash: [`cat > ~/portfolio/openapi.json <<'EOF'\n${openapiSubset()}EOF`],
      pwsh: [`Set-Content ~/portfolio/openapi.json -Value @'\n${openapiSubset()}'@`],
    },
    summary: ['struttura di una specifica OpenAPI', 'risposte e corpo richiesto', 'la specifica del servizio è la fonte'],
    skills: ['docs', 'http', 'autonomia'],
    concepts: ['OpenAPI', 'specifica come contratto', 'portfolio'],
  },
  {
    id: 'M8.L3',
    artifacts: ['~/portfolio/bug-staging.md', '~/portfolio/troubleshooting.md'],
    module: 8,
    n: 3,
    title: 'Portfolio 3: bug report e troubleshooting',
    objective: 'Scrivere un bug report riproducibile su un difetto reale e una tabella di risoluzione dei problemi per gli errori più comuni.',
    explain: [
      'Un bug report utile permette a un altro di riprodurre il problema senza fare domande: ambiente e versione, passi numerati, risultato atteso, risultato ottenuto, impatto. Gli esempi si possono eseguire.',
      'In questo ambiente c\'è un difetto vero: lo staging (versione 1.1.0) restituisce l\'elenco dei task nel campo `items`, mentre development (1.0) usa `data`. Confronta le due risposte, poi documentalo.',
      'La tabella di troubleshooting collega sintomo, causa, verifica e soluzione per gli errori che chi usa l\'API incontra davvero.',
    ],
    shells: ['bash', 'pwsh'],
    pwshOptional: true,
    setup: (c) => setup(c, 'staging'),
    guided: [
      { title: 'Confrontare le due risposte', cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks" | jq \'keys\'', pwsh: '(irm "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}).PSObject.Properties.Name' }, what: 'Mostra i campi di primo livello della risposta di staging.', who: 'jq / PowerShell.', parts: ['items invece di data'], expect: 'Un elenco di campi che contiene `items`.', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Lo status della richiesta di elenco in staging è un errore?', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks"', pwsh: 'try { (Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }' }, expect: '200: lo status è corretto, sbagliata è la forma del corpo.', why: 'Un difetto può non comparire nello status: serve confrontare il contenuto.' },
    ],
    negative: {
      prompt: 'Che cosa estrae uno script che legge `.data` dalla risposta di staging?',
      cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks" | jq \'.data\'', pwsh: '(irm "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}).data' },
      explain: 'Niente (null / vuoto): è esattamente l\'impatto da descrivere nel bug report.',
    },
    task: {
      text: 'Crea due file in `~/portfolio`. 1) `bug-staging.md`: titolo, `Ambiente: staging`, `Versione dell\'API: 1.1.0`, sezioni Riepilogo, Passi per riprodurre (con un esempio `curl` eseguibile e `# => 200`), Risultato atteso, Risultato ottenuto, Impatto; deve citare `items` e `data`. 2) `troubleshooting.md`: una tabella con colonne Sintomo, Causa probabile, Come verificare, Soluzione e righe per 401, 404, 422 e 429.',
      criterion: 'Bug report senza errori verificabili e con esempio eseguito; tutte le sezioni presenti; tabella con le quattro righe complete.',
    },
    checks: [
      {
        id: 'bug-lint',
        description: 'Il bug report è coerente con l\'ambiente e l\'esempio è eseguibile',
        expected: '0 errori verificabili, 1+ esempio ok',
        test: (c) => {
          const r = lintOf(c, '~/portfolio/bug-staging.md');
          if (!r) return { pass: false, actual: 'bug-staging.md mancante' };
          const bad = r.issues.filter((i) => i.kind === 'verifiable' && i.severity !== 'info');
          const okEx = r.stats.examplesRun >= 1 && r.stats.examplesOk === r.stats.examplesRun;
          return { pass: bad.length === 0 && okEx, actual: bad.length ? bad.slice(0, 2).map((i) => `riga ${i.line}: ${i.message}`).join(' | ') : `${r.stats.examplesOk}/${r.stats.examplesRun} esempi ok` };
        },
        onFail: 'Usa la scheda Documentazione per controllare: ambiente e versione devono essere quelli di staging.',
      },
      {
        id: 'bug-sezioni',
        description: 'Il bug report ha tutte le sezioni e cita items e data',
        expected: 'Riepilogo, Passi per riprodurre, Risultato atteso, Risultato ottenuto, Impatto; items e data',
        test: (c) => {
          const md = c.read('~/portfolio/bug-staging.md') ?? '';
          const need = ['riepilogo', 'passi per riprodurre', 'risultato atteso', 'risultato ottenuto', 'impatto'];
          const heads = [...md.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase());
          const miss = need.filter((n) => !heads.some((h) => h.startsWith(n)));
          if (!/`?items`?/.test(md) || !/`?data`?/.test(md)) miss.push('citazione di items e data');
          return { pass: miss.length === 0, actual: miss.length ? `mancano: ${miss.join(', ')}` : 'ok' };
        },
        onFail: 'Un lettore deve poter riprodurre il problema e capirne l\'impatto senza chiederti nulla.',
      },
      {
        id: 'trouble',
        description: 'La tabella di troubleshooting copre 401, 404, 422 e 429',
        expected: '4 righe con sintomo, causa, verifica e soluzione compilati',
        test: (c) => {
          const md = c.read('~/portfolio/troubleshooting.md');
          if (md === null) return { pass: false, actual: 'troubleshooting.md mancante' };
          const tab = parseTables(md).find((t) => t.header.length >= 4 && /sintomo/i.test(t.header[0]) && /causa/i.test(t.header[1]) && /verific/i.test(t.header[2]) && /soluzione/i.test(t.header[3]));
          if (!tab) return { pass: false, actual: 'tabella con le colonne richieste non trovata' };
          const missing = [401, 404, 422, 429].filter((s) => !tab.rows.some((r) => r[0].includes(String(s)) && r.slice(1, 4).every((x) => x.trim().length > 3)));
          return { pass: missing.length === 0, actual: missing.length ? `righe mancanti o incomplete: ${missing.join(', ')}` : 'ok' };
        },
        onFail: 'Una riga per codice; ogni cella compilata, anche "Come verificare".',
      },
      {
        id: 'no-segreti',
        description: 'Nessun segreto nei documenti',
        expected: 'nessuna credenziale in chiaro',
        test: (c) => {
          const leaks = ['bug-staging.md', 'troubleshooting.md'].flatMap((f) => {
            const r = lintOf(c, `~/portfolio/${f}`);
            return r ? r.issues.filter((i) => i.id === 'segreto-in-chiaro').map(() => f) : [];
          });
          return { pass: leaks.length === 0, actual: leaks.length ? `credenziali in ${leaks.join(', ')}` : 'ok' };
        },
        onFail: 'Usa variabili ($TOKEN) negli esempi, mai valori reali.',
        errorTag: 'segreti-nei-comandi',
      },
    ],
    example: { text: 'Esempio analogo: confrontare la forma di due risposte.', cmd: { bash: 'echo \'{"data":[]}\' | jq \'keys\'', pwsh: "'{\"data\":[]}' | ConvertFrom-Json | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name" } },
    hints: ['Il titolo del bug non deve contenere il testo "GET /v1/tasks" fuori da un blocco di codice: il controllo lo leggerebbe come documentazione di endpoint.', 'La tabella: intestazione `| Sintomo | Causa probabile | Come verificare | Soluzione |`, poi `|---|---|---|---|` e una riga per codice.'],
    solutions: {
      bash: [`cat > ~/portfolio/bug-staging.md <<'EOF'\n${BUG}EOF`, `cat > ~/portfolio/troubleshooting.md <<'EOF'\n${TROUBLE}EOF`],
      pwsh: [`Set-Content ~/portfolio/bug-staging.md -Value @'\n${BUG}'@`, `Set-Content ~/portfolio/troubleshooting.md -Value @'\n${TROUBLE}'@`],
    },
    summary: ['bug report riproducibile', 'atteso contro ottenuto', 'troubleshooting come tabella'],
    skills: ['docs', 'diagnosi', 'output'],
    concepts: ['bug report', 'troubleshooting', 'differenze tra ambienti'],
  },
  {
    id: 'M8.L4',
    artifacts: ['~/portfolio/test-api.sh', '~/portfolio/test-api.ps1', '~/portfolio/report.txt'],
    module: 8,
    n: 4,
    title: 'Portfolio 4: script di test con report',
    objective: 'Scrivere uno script di test dell\'API che stampa PASS/FAIL, scrive un report ed esce con un codice che riflette l\'esito.',
    explain: [
      'Uno script di test per un portfolio deve essere ripetibile, leggibile e onesto: se un controllo fallisce deve dirlo e uscire con codice diverso da 0.',
      'Questo script controlla sei casi (tre di successo, tre negativi), stampa ogni esito, scrive `report.txt` accanto allo script e termina con `PASS: n FAIL: m`.',
      'La verifica prova anche il caso peggiore: con un token sbagliato lo script DEVE fallire. Uno script che passa sempre non è un test.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setup(c),
    guided: [
      { title: 'Il codice di stato come numero', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).StatusCode' }, what: 'Stampa solo lo status.', who: 'curl / PowerShell.', parts: ['-o /dev/null scarta il corpo', '-w stampa lo status'], expect: '200', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Con un token sbagliato, quali controlli dello script falliranno?', cmd: { bash: 'echo "profilo, elenco con token, task inesistente, titolo corto: 401 invece di 200/404/422"', pwsh: 'echo "4 controlli"' }, expect: 'Quelli che richiedono autenticazione: restano passati health e "senza token".', why: 'Capire quali test dipendono dal token aiuta a diagnosticare.' },
    ],
    negative: {
      prompt: 'Uno script che stampa FAIL ma esce con 0: come lo vede una pipeline?',
      cmd: { bash: 'echo "FAIL: x"; exit 0', pwsh: 'echo "FAIL: x"' },
      explain: 'Come un successo. Il codice di uscita è l\'unica cosa che una pipeline legge.',
    },
    task: {
      text: 'In `~/portfolio` crea `test-api.sh` (Bash) o `test-api.ps1` (PowerShell) con almeno 6 controlli: health 200, profilo con token 200, elenco con token 200, elenco senza token 401, task 9999 → 404, creazione con titolo troppo corto → 422. Ogni esito va stampato e aggiunto a `report.txt`; alla fine stampa `PASS: n FAIL: m` ed esci con 1 se m > 0. Eseguilo.',
      criterion: 'Esecuzione con PASS ≥ 6 e FAIL: 0, exit 0; con token sbagliato exit 1 e righe FAIL; `report.txt` creato.',
    },
    checks: [
      {
        id: 'esegue',
        description: 'Lo script passa tutti i controlli',
        expected: 'PASS ≥ 6, FAIL: 0, exit 0',
        test: (c) => {
          const f = c.shell === 'bash' ? 'test-api.sh' : 'test-api.ps1';
          if (c.read(`~/portfolio/${f}`) === null) return { pass: false, actual: `${f} mancante in ~/portfolio` };
          const r = c.sandbox(c.shell === 'bash' ? `bash ${f}` : `./${f}`, '/home/learner/portfolio');
          const m = /PASS:\s*(\d+)\s+FAIL:\s*(\d+)/.exec(r.out);
          return { pass: r.code === 0 && !!m && parseInt(m[1], 10) >= 6 && m[2] === '0', actual: m ? `PASS ${m[1]} FAIL ${m[2]} exit ${r.code}` : `exit ${r.code}: ${(r.err || r.out).trim().split('\n')[0]?.slice(0, 80)}` };
        },
        onFail: 'Esegui lo script e leggi le righe FAIL: indicano atteso e ottenuto.',
      },
      {
        id: 'fallisce',
        description: 'Con un token sbagliato lo script fallisce',
        expected: 'exit 1 e almeno una riga FAIL',
        test: (c) => {
          const f = c.shell === 'bash' ? 'test-api.sh' : 'test-api.ps1';
          if (c.read(`~/portfolio/${f}`) === null) return { pass: false, actual: `${f} mancante` };
          const cmd = c.shell === 'bash' ? `TASKFLOW_TOKEN=sbagliato bash ${f}` : `$env:TASKFLOW_TOKEN='sbagliato'; ./${f}`;
          const r = c.sandbox(cmd, '/home/learner/portfolio');
          return { pass: r.code === 1 && /FAIL:/.test(r.out), actual: `exit ${r.code}${/FAIL:/.test(r.out) ? ', con righe FAIL' : ', nessuna riga FAIL'}` };
        },
        onFail: 'Aggiungi in fondo: se FAIL è maggiore di 0, esci con codice 1.',
      },
      {
        id: 'report',
        description: 'Il report è stato scritto',
        expected: '~/portfolio/report.txt con righe PASS',
        test: (c) => {
          const t = c.read('~/portfolio/report.txt');
          return { pass: t !== null && /PASS:/.test(t), actual: t === null ? 'report.txt mancante: esegui lo script' : /PASS:/.test(t) ? 'ok' : 'report vuoto' };
        },
        onFail: 'Esegui lo script almeno una volta: ogni esito va aggiunto a report.txt.',
      },
    ],
    example: { text: 'Esempio analogo: contatori e riepilogo.', cmd: { bash: 'PASS=2; FAIL=0; echo "PASS: $PASS FAIL: $FAIL"', pwsh: '$pass = 2; $fail = 0; Write-Output "PASS: $pass FAIL: $fail"' } },
    hints: ['Riparti dalla suite del modulo 7: funzione `check`, funzione `status`, contatori e `exit 1`.', 'Per il report: `echo "$R" >> report.txt` (Bash) o `Add-Content report.txt $r` (PowerShell). Per il 422 serve il Content-Type JSON.'],
    solutions: {
      bash: ['cd ~/portfolio', `cat > test-api.sh <<'EOF'\n${TEST_SH}EOF`, 'bash test-api.sh'],
      pwsh: ['cd ~/portfolio', `Set-Content test-api.ps1 -Value @'\n${TEST_PS1}'@`, './test-api.ps1'],
    },
    summary: ['test ripetibile con report', 'il codice di uscita riflette l\'esito', 'prova del caso negativo'],
    skills: ['testing', 'autonomia', 'comandi'],
    concepts: ['script di test', 'report', 'exit code'],
  },
];
