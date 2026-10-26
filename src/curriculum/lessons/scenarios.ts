/**
 * Scenari "nuovi" di fine modulo (M2–M5): verifica autonoma, nessuna soluzione completa.
 * Servono a provare il trasferimento: stesso concetto del modulo, contesto diverso da quello delle lezioni.
 */
import type { Lesson } from '../types.ts';
import { apiHit, cmdMatches, setupApi } from './helpers.ts';

const ACCESS_LOG = [
  '2026-10-01T10:00:01 GET /v1/tasks 200',
  '2026-10-01T10:00:04 GET /v1/tasks 200',
  '2026-10-01T10:00:09 POST /v1/tasks 500',
  '2026-10-01T10:00:15 GET /v1/reports 500',
  '2026-10-01T10:00:21 GET /v1/tasks/99 404',
  '2026-10-01T10:00:30 GET /v1/tasks 200',
  '2026-10-01T10:00:41 GET /v1/me 401',
  '2026-10-01T10:00:48 GET /v1/tasks 500',
  '2026-10-01T10:00:55 GET /v1/tasks/7 200',
  '2026-10-01T10:01:02 GET /v1/tasks/100 404',
  '2026-10-01T10:01:10 GET /v1/tasks 200',
  '2026-10-01T10:01:17 GET /v1/health 200',
  '',
].join('\n');

const tokens = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export const scenarios: Lesson[] = [
  {
    id: 'M2.L5',
    module: 2,
    n: 5,
    title: 'Scenario nuovo: analizzare un log',
    objective: 'Applicare pipe, filtri e redirezione a un problema che non hai visto: riassumere un file di log.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Hai tutti gli strumenti di M2 (pipe, grep, sort, uniq, cut, redirezione).',
      'Il file access.log ha una riga per richiesta: data, metodo, percorso, status. Devi ricavarne due fatti e scriverli in due file.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => c.file('access.log', ACCESS_LOG),
    guided: [
      { title: 'Guardare il file', cmd: { bash: 'cat ~/corso-cli/m2l5/access.log', pwsh: 'Get-Content ~/corso-cli/m2l5/access.log' }, what: 'Mostra il log da analizzare.', who: 'cat / Get-Content.', parts: ['una riga per richiesta'], expect: '12 righe con data, metodo, percorso e status.', risk: 'Nessuno.', contains: '/v1/reports' },
      { title: 'Contare le righe', cmd: { bash: 'wc -l ~/corso-cli/m2l5/access.log', pwsh: '(Get-Content ~/corso-cli/m2l5/access.log).Count' }, what: 'Conta le richieste registrate.', who: 'wc -l / Count.', parts: ['-l: righe'], expect: '12', risk: 'Nessuno.', contains: '12' },
      { title: 'Estrarre una colonna', cmd: { bash: "cut -d' ' -f4 ~/corso-cli/m2l5/access.log | head -3", pwsh: "Get-Content ~/corso-cli/m2l5/access.log | ForEach-Object { ($_ -split ' ')[3] } | Select-Object -First 3" }, what: 'Isola lo status delle prime righe.', who: 'cut / -split.', parts: ['-d: separatore', '-f4: quarto campo'], expect: 'Tre status, uno per riga.', risk: 'Nessuno.', contains: '200' },
    ],
    predict: [
      {
        prompt: 'Quante volte compare 200 nell\'ultima colonna? Annota una stima prima di contare.',
        cmd: { bash: "cut -d' ' -f4 ~/corso-cli/m2l5/access.log | grep -c 200", pwsh: "(Get-Content ~/corso-cli/m2l5/access.log | ForEach-Object { ($_ -split ' ')[3] } | Where-Object { $_ -eq '200' }).Count" },
        expect: '6',
        why: 'Contare con un filtro è più affidabile che contare a occhio.',
      },
    ],
    negative: {
      prompt: 'Cosa succede contando senza ordinare prima? `uniq -c` unisce solo righe ADIACENTI.',
      cmd: { bash: "cut -d' ' -f4 ~/corso-cli/m2l5/access.log | uniq -c | head -4", pwsh: "Get-Content ~/corso-cli/m2l5/access.log | ForEach-Object { ($_ -split ' ')[3] } | Group-Object | Select-Object -First 4 | ForEach-Object { \"$($_.Count) $($_.Name)\" }" },
      explain: 'Senza sort, uniq conta solo ripetizioni consecutive (in PowerShell Group-Object raggruppa già tutto).',
    },
    task: {
      text: 'In ~/corso-cli/m2l5 crea (1) report.txt: per ogni status quante volte compare, dal più frequente al meno frequente (una riga per status, conteggio e status); (2) errori.txt: il percorso con più risposte 5xx (solo il percorso).',
      criterion: 'report.txt ha i conteggi corretti in ordine decrescente; errori.txt contiene il percorso corretto; hai usato una pipeline.',
    },
    checks: [
      {
        id: 'report',
        description: 'report.txt: conteggi per status, dal più frequente',
        expected: '6 200, 3 500, 2 404, 1 401 (in quest\'ordine)',
        test: (c) => {
          const rows = (c.read('report.txt') ?? '').split('\n').map((l) => tokens(l)).filter((t) => t.length === 2);
          const parsed = rows.map((t) => {
            const [a, b] = t.map(Number);
            return a >= 100 ? { status: a, n: b } : { status: b, n: a };
          });
          const want = [{ status: 200, n: 6 }, { status: 500, n: 3 }, { status: 404, n: 2 }, { status: 401, n: 1 }];
          return { pass: JSON.stringify(parsed) === JSON.stringify(want), actual: parsed.map((p) => `${p.n} ${p.status}`).join(', ') || '(mancante o formato non riconosciuto)' };
        },
        onFail: 'Conta le occorrenze di ogni status (sort + uniq -c, oppure Group-Object) e ordina per conteggio decrescente. Una riga per status.',
      },
      {
        id: 'errori',
        description: 'errori.txt: percorso con più risposte 5xx',
        expected: '/v1/tasks',
        test: (c) => {
          const t = (c.read('errori.txt') ?? '').trim();
          return { pass: t === '/v1/tasks', actual: t || '(mancante)' };
        },
        onFail: 'Filtra le righe con status 5xx, estrai il percorso e conta: serve il percorso più frequente, solo quello.',
      },
      {
        id: 'pipeline',
        description: 'Hai usato una pipeline',
        expected: 'almeno un comando con |',
        test: (c) => ({ pass: cmdMatches(c, /\|/), actual: cmdMatches(c, /\|/) ? 'sì' : 'nessuna pipe' }),
        onFail: 'Il corso chiede di comporre comandi: collega i passaggi con la pipe.',
      },
    ],
    example: { text: 'Esempio analogo: contare i valori di una colonna di un altro file.', cmd: { bash: "cut -d' ' -f2 ~/corso-cli/m2l5/access.log | sort | uniq -c", pwsh: "Get-Content ~/corso-cli/m2l5/access.log | ForEach-Object { ($_ -split ' ')[1] } | Group-Object | ForEach-Object { \"$($_.Count) $($_.Name)\" }" } },
    hints: ['Ricava prima la colonna che ti serve (cut -d\' \' -f4 oppure -split). Poi ordina, conta e riordina per conteggio.', 'Per il secondo file filtra PRIMA le righe con status >= 500, poi estrai il percorso.'],
    reference: {
      bash: ['cd ~/corso-cli/m2l5', "awk '{print $4}' access.log | sort | uniq -c | sort -rn > report.txt", "awk '$4 >= 500 {print $3}' access.log | sort | uniq -c | sort -rn | head -1 | awk '{print $2}' > errori.txt"],
      pwsh: [
        'cd ~/corso-cli/m2l5',
        'Get-Content access.log | ForEach-Object { ($_ -split " ")[3] } | Group-Object | Sort-Object Count -Descending | ForEach-Object { "$($_.Count) $($_.Name)" } | Set-Content report.txt',
        'Get-Content access.log | Where-Object { [int](($_ -split " ")[3]) -ge 500 } | ForEach-Object { ($_ -split " ")[2] } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1 -ExpandProperty Name | Set-Content errori.txt',
      ],
    },
    summary: ['estrarre, ordinare, contare', 'scegliere i passaggi di una pipeline per un problema nuovo', 'verificare il risultato sui dati'],
    skills: ['comandi', 'autonomia', 'output'],
    concepts: ['pipeline su un problema nuovo', 'sort + uniq -c', 'trasferimento'],
  },
  {
    id: 'M3.L5',
    module: 3,
    n: 5,
    title: 'Scenario nuovo: leggere due risposte sconosciute',
    objective: 'Confrontare una risposta di successo e una di errore di un endpoint mai usato e documentarne gli elementi essenziali con evidenze reali.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Usa ciò che hai imparato in M3: metodo, URL, status, header, body.',
      'Devi inviare due richieste: una a /v1/health (successo) e una a un percorso che NON esiste (errore). Poi riassumere, in risposte.md, per ciascuna: status, Content-Type, X-Request-Id e il codice di errore dove c\'è.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => setupApi(c, { token: false }),
    guided: [
      { title: 'Una richiesta con gli header', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/health', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/health"' }, what: 'Mostra status, header e body della risposta.', who: 'curl (in PowerShell curl.exe, il vero curl).', parts: ['-s: silenzioso', '-i: include gli header'], expect: 'HTTP/1.1 200 OK, header, body JSON.', risk: 'Nessuno.', contains: '200 OK' },
      { title: 'Solo lo status', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health', pwsh: 'curl.exe -s -o NUL -w "%{http_code}\\n" "$env:TASKFLOW_URL/v1/health"' }, what: 'Stampa soltanto il codice di stato.', who: 'curl.', parts: ['-o: scarta il body', '-w: formato di uscita'], expect: '200', risk: 'Nessuno.', contains: '200' },
      { title: 'Un percorso che non esiste', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/prova', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/prova"' }, what: 'Provoca un errore per osservarlo.', who: 'Il server risponde 404.', parts: ['percorso non definito'], expect: '404 con un corpo che nomina l\'errore.', risk: 'Nessuno.', contains: '404' },
    ],
    predict: [
      {
        prompt: 'Per un percorso inesistente: quale status e quale codice applicativo ti aspetti?',
        cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/altro', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/altro"' },
        expect: '404 e route_not_found.',
        why: 'Lo status dice la categoria; il campo error nel body dice la causa.',
      },
    ],
    negative: {
      prompt: 'Stesso percorso, metodo diverso: cosa cambia se usi POST su /v1/health?',
      cmd: { bash: 'curl -s -i -X POST $TASKFLOW_URL/v1/health', pwsh: 'curl.exe -s -i -X POST "$env:TASKFLOW_URL/v1/health"' },
      explain: 'Il percorso esiste ma il metodo no: 405 method_not_allowed e header Allow.',
    },
    task: {
      text: 'In ~/corso-cli/m3l5/risposte.md riassumi le due risposte (successo di /v1/health e errore di un percorso inesistente): per ciascuna status, Content-Type, X-Request-Id; per l\'errore anche il codice applicativo.',
      criterion: 'Le richieste reali esistono nel registro del server e il file cita i loro X-Request-Id reali, gli status e il codice di errore.',
    },
    checks: [
      {
        id: 'ok',
        description: 'risposte.md documenta una richiesta riuscita a /v1/health',
        expected: 'requestId reale + 200 + Content-Type',
        test: (c) => {
          const md = c.read('risposte.md') ?? '';
          const e = c.apiShell.find((x) => x.path === '/v1/health' && x.status === 200 && md.includes(x.requestId));
          return { pass: !!e && /200/.test(md) && /application\/json/i.test(md), actual: e ? 'requestId trovato' : 'nessun requestId di /v1/health nel file' };
        },
        onFail: 'Esegui GET /v1/health con gli header visibili (-i) e copia in risposte.md lo status, il Content-Type e l\'X-Request-Id reali.',
      },
      {
        id: 'errore',
        description: 'risposte.md documenta un 404 con codice applicativo',
        expected: 'requestId reale di un 404 + route_not_found',
        test: (c) => {
          const md = c.read('risposte.md') ?? '';
          const e = c.apiShell.find((x) => x.status === 404 && md.includes(x.requestId));
          return { pass: !!e && /404/.test(md) && md.includes('route_not_found'), actual: e ? `requestId ${e.requestId}${md.includes('route_not_found') ? '' : ', manca il codice applicativo'}` : 'nessun requestId di un 404 nel file' };
        },
        onFail: 'Provoca un 404 (percorso inesistente), copia status, X-Request-Id e il codice error del body.',
      },
      {
        id: 'distinzione',
        description: 'Le due richieste sono distinte',
        expected: 'un successo e un errore nel registro',
        test: (c) => ({ pass: apiHit(c, 'GET', /^\/v1\/health$/, 200) && c.apiShell.some((e) => e.status === 404), actual: c.apiShell.map((e) => `${e.method} ${e.path} ${e.status}`).join('; ') || 'nessuna richiesta' }),
        onFail: 'Servono una richiesta riuscita a /v1/health e una che dà 404.',
      },
    ],
    example: { text: 'Esempio analogo: salvare gli header di una risposta in un file.', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/health | head -5 > /tmp/esempio.txt', pwsh: 'curl.exe -s -i "$env:TASKFLOW_URL/v1/health" | Select-Object -First 5 | Set-Content /tmp/esempio.txt' } },
    hints: ['Con -i vedi gli header: cerca X-Request-Id e Content-Type. Il codice applicativo è nel body (campo error).', 'Puoi riassumere con grep sulle righe che ti servono e redirezionare in risposte.md.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m3l5',
        'H=$(curl -s -i $TASKFLOW_URL/v1/health)',
        'N=$(curl -s -i $TASKFLOW_URL/v1/inesistente)',
        '{ echo "# Risposte"; echo "## health"; echo "$H" | grep -i -E "^(HTTP|content-type|x-request-id)"; echo "## inesistente"; echo "$N" | grep -i -E "^(HTTP|content-type|x-request-id)"; echo "$N" | tail -1; } > risposte.md',
      ],
      pwsh: [
        'cd ~/corso-cli/m3l5',
        '$H = curl.exe -s -i "$env:TASKFLOW_URL/v1/health"',
        '$N = curl.exe -s -i "$env:TASKFLOW_URL/v1/inesistente"',
        '$out = @("# Risposte", "## health") + ($H | Select-String -Pattern "^(HTTP|content-type|x-request-id)" | ForEach-Object { $_.Line }) + @("## inesistente") + ($N | Select-String -Pattern "^(HTTP|content-type|x-request-id)" | ForEach-Object { $_.Line }) + @($N[-1])',
        '$out | Set-Content risposte.md',
      ],
    },
    summary: ['status, header e body di una risposta', 'successo ed errore a confronto', 'citare evidenze (X-Request-Id)'],
    skills: ['http', 'autonomia', 'docs'],
    concepts: ['lettura di una risposta HTTP', 'status vs codice applicativo', 'trasferimento'],
  },
  {
    id: 'M4.L7',
    module: 4,
    n: 7,
    title: 'Scenario nuovo: documentare la creazione di un task',
    objective: 'Partendo dalla sola specifica OpenAPI, ricavare le regole di un endpoint e provarle con una richiesta riuscita e una non valida.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Usa M4: specifica OpenAPI, autenticazione Bearer, CRUD, validazione.',
      'Scarica la specifica, individua i campi obbligatori di POST /v1/tasks e verificali con due richieste reali. Documenta il risultato in endpoint.md.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Scaricare la specifica', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/openapi.json | jq -r \'.paths | keys[]\'', pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths.PSObject.Properties.Name' }, what: 'Elenca i percorsi descritti dalla specifica.', who: 'curl + jq / Invoke-RestMethod.', parts: ['.paths: elenco dei percorsi'], expect: 'Elenco di percorsi (senza il prefisso /v1, che è nel server).', risk: 'Nessuno.', contains: '/tasks' },
      { title: 'Metodi di /v1/tasks', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/openapi.json | jq -r \'.paths["/tasks"] | keys[]\'', pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".PSObject.Properties.Name' }, what: 'Mostra i metodi disponibili su /tasks.', who: 'jq / PowerShell.', parts: ['chiave del percorso tra virgolette'], expect: 'get e post.', risk: 'Nessuno.', contains: 'post' },
      { title: 'Il token è già pronto', cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/me', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | ConvertTo-Json' }, what: 'Conferma che l\'autenticazione funziona.', who: 'Il server risponde 200.', parts: ['Authorization: Bearer <token>'], expect: 'I dati dell\'utente.', risk: 'Nessuno.', contains: 'bob' },
    ],
    predict: [
      {
        prompt: 'Cosa risponde il server se invii il body {} a POST /v1/tasks? Status e codice applicativo.',
        cmd: { bash: 'curl -s -i -X POST $TASKFLOW_URL/v1/tasks -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{}\'', pwsh: 'curl.exe -s -i -X POST "$env:TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d "{}"' },
        expect: '422 validation_failed con l\'elenco dei campi non validi.',
        why: 'JSON valido ma dati non validi: 422, non 400.',
      },
    ],
    negative: {
      prompt: 'E senza Content-Type? Provalo.',
      cmd: { bash: 'curl -s -i -X POST $TASKFLOW_URL/v1/tasks -H "Authorization: Bearer $TASKFLOW_TOKEN" -d \'{"title":"x"}\'', pwsh: 'curl.exe -s -i -X POST "$env:TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -d "{\\"title\\":\\"x\\"}"' },
      explain: 'Senza Content-Type: application/json il server rifiuta il body (415).',
    },
    task: {
      text: 'In ~/corso-cli/m4l7/endpoint.md documenta POST /v1/tasks: il campo obbligatorio (ricavato dalla specifica), una richiesta riuscita e una non valida, con status e X-Request-Id reali.',
      criterion: 'Il registro del server mostra POST /v1/tasks con 201 e 422; endpoint.md cita i due X-Request-Id e il campo obbligatorio; hai consultato la specifica; nessun token nei comandi.',
    },
    checks: [
      {
        id: 'spec',
        description: 'Hai consultato la specifica OpenAPI',
        expected: 'GET /v1/openapi.json',
        test: (c) => ({ pass: apiHit(c, 'GET', /openapi/, 200), actual: apiHit(c, 'GET', /openapi/, 200) ? 'sì' : 'specifica non scaricata' }),
        onFail: 'Scarica /v1/openapi.json e leggi requestBody e required di POST /v1/tasks.',
      },
      {
        id: 'richieste',
        description: 'POST /v1/tasks: un 201 e un 422',
        expected: '201 e 422',
        test: (c) => {
          const s = c.apiShell.filter((e) => e.method === 'POST' && e.path === '/v1/tasks').map((e) => e.status);
          return { pass: s.includes(201) && s.includes(422), actual: s.join(',') || 'nessun POST' };
        },
        onFail: 'Servono una creazione riuscita (201) e una con dati non validi (422, per esempio senza title).',
      },
      {
        id: 'doc',
        description: 'endpoint.md cita campo obbligatorio e i due requestId',
        expected: 'title, requestId del 201 e del 422',
        test: (c) => {
          const md = c.read('endpoint.md') ?? '';
          const post = c.apiShell.filter((e) => e.method === 'POST' && e.path === '/v1/tasks');
          const ok201 = post.some((e) => e.status === 201 && md.includes(e.requestId));
          const ok422 = post.some((e) => e.status === 422 && md.includes(e.requestId));
          return { pass: /title/.test(md) && ok201 && ok422, actual: `title:${/title/.test(md)} 201:${ok201} 422:${ok422}` };
        },
        onFail: 'Scrivi in endpoint.md il campo obbligatorio (title) e copia gli X-Request-Id reali delle due richieste.',
      },
      {
        id: 'segreti',
        description: 'Nessun token scritto nei comandi',
        expected: 'solo $TASKFLOW_TOKEN',
        test: (c) => {
          const leak = c.cmds.find((x) => /tf_(dev|test|stg)_[a-z]+_\d{6,}/.test(x.cmd));
          return { pass: !leak, actual: leak ? 'token in chiaro in un comando' : 'ok' };
        },
        onFail: 'Usa la variabile $TASKFLOW_TOKEN / $env:TASKFLOW_TOKEN, mai il valore.',
      },
    ],
    example: { text: 'Esempio analogo: una creazione riuscita con la variabile del token.', cmd: { bash: 'curl -s -X POST $TASKFLOW_URL/v1/tasks -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"esempio"}\' | jq .id', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"title":"esempio"}\' | Select-Object -ExpandProperty id' } },
    hints: ['Nella specifica (i percorsi sono senza /v1) cerca paths["/tasks"].post.requestBody e il campo required.', 'Per vedere gli header (X-Request-Id) usa curl -i / curl.exe -i.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m4l7',
        'curl -s $TASKFLOW_URL/v1/openapi.json | jq \'.paths["/tasks"].post\'',
        'A=$(curl -s -i -X POST $TASKFLOW_URL/v1/tasks -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"prova"}\' | grep -i "^x-request-id" | tr -d "\\r")',
        'B=$(curl -s -i -X POST $TASKFLOW_URL/v1/tasks -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{}\' | grep -i "^x-request-id" | tr -d "\\r")',
        'printf "# POST /v1/tasks\\n\\nCampo obbligatorio: title\\n\\n201: %s\\n422: %s\\n" "$A" "$B" > endpoint.md',
      ],
      pwsh: [
        'cd ~/corso-cli/m4l7',
        '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".post | ConvertTo-Json -Depth 5 | Out-Null',
        '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }',
        '$A = (Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body \'{"title":"prova"}\' -UseBasicParsing).Headers["X-Request-Id"]',
        'try { Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType "application/json" -Body "{}" -UseBasicParsing | Out-Null } catch { $B = $_.Exception.Response.Headers["X-Request-Id"] }',
        'Set-Content endpoint.md -Value @("# POST /v1/tasks", "", "Campo obbligatorio: title", "", "201: $A", "422: $B")',
      ],
    },
    summary: ['dalla specifica ai fatti', 'successo e fallimento di validazione', 'evidenze con X-Request-Id'],
    skills: ['http', 'testing', 'docs'],
    concepts: ['lettura della specifica', 'validazione 422', 'trasferimento'],
  },
  {
    id: 'M5.L6',
    module: 5,
    n: 6,
    title: 'Scenario nuovo: il 401 su staging',
    objective: 'Diagnosticare da soli un 401 in un ambiente diverso da quello usato finora e documentare causa e correzione.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Sei su STAGING e il token nella shell non funziona.',
      'Usa ciò che sai da M4 e M5: corpo della risposta, log applicativo (/var/log/taskflow/staging/app.log), procedura per ottenere un token. Separa fatti, documentazione e ipotesi.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => {
      setupApi(c, { env: 'staging', token: false });
      c.setEnvBoth('TASKFLOW_TOKEN', 'tf_dev_bob_9999999999');
    },
    guided: [
      { title: 'In che ambiente sono?', cmd: { bash: 'echo $TASKFLOW_URL', pwsh: 'echo $env:TASKFLOW_URL' }, what: 'Mostra l\'URL di base in uso.', who: 'echo.', parts: ['variabile TASKFLOW_URL'], expect: 'L\'URL dell\'ambiente corrente.', risk: 'Nessuno.', contains: 'http' },
      { title: 'Il sintomo', cmd: { bash: 'curl -s -i -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -i -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Riproduce il problema.', who: 'Il server risponde 401.', parts: ['token dalla variabile'], expect: '401 con un codice che spiega la causa.', risk: 'Nessuno.', contains: '401' },
      { title: 'I log dell\'ambiente', cmd: { bash: 'ls /var/log/taskflow/staging', pwsh: 'Get-ChildItem /var/log/taskflow/staging' }, what: 'Elenca i log del servizio.', who: 'ls / Get-ChildItem.', parts: ['un file per tipo di log'], expect: 'access.log e app.log.', risk: 'Nessuno.', contains: 'app.log' },
    ],
    predict: [
      {
        prompt: 'Il corpo del 401 dirà "scaduto" o "non valido"? Annota una previsione e motivala.',
        cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/me', pwsh: 'curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/me"' },
        expect: 'invalid_token: il token è stato emesso per un altro ambiente.',
        why: 'Il nome del token (tf_dev_...) indica l\'ambiente che lo ha emesso.',
      },
    ],
    negative: {
      prompt: 'Cosa succede con un token inventato?',
      cmd: { bash: 'curl -s -H "Authorization: Bearer abc" $TASKFLOW_URL/v1/me', pwsh: 'curl.exe -s -H "Authorization: Bearer abc" "$env:TASKFLOW_URL/v1/me"' },
      explain: 'Stesso 401: ma la causa registrata nei log può essere diversa. Leggi sempre il corpo e il log.',
    },
    task: {
      text: 'Fai riuscire GET /v1/tasks su staging e scrivi in ~/corso-cli/m5l6/diagnosi.md: sintomo, causa (con l\'evidenza che l\'hai trovata) e correzione.',
      criterion: 'Il server ha registrato su staging un 401 e poi un 200 su /v1/tasks; hai letto app.log; diagnosi.md nomina la causa (token di un altro ambiente) e l\'ambiente.',
    },
    checks: [
      {
        id: 'sequenza',
        description: 'GET /v1/tasks su staging: 401 e poi 200',
        expected: '401 → 200',
        test: (c) => {
          const s = c.apiShell.filter((e) => e.env === 'staging' && e.path.startsWith('/v1/tasks') && e.method === 'GET').map((e) => e.status);
          return { pass: s.includes(401) && s.lastIndexOf(200) > s.indexOf(401), actual: s.join(',') || 'nessuna richiesta' };
        },
        onFail: 'Riproduci il 401 con il token attuale, poi ottieni un token valido per STAGING e ripeti la richiesta.',
      },
      {
        id: 'log',
        description: 'Hai consultato il log applicativo',
        expected: 'comando che legge app.log',
        test: (c) => ({ pass: cmdMatches(c, /app\.log/), actual: cmdMatches(c, /app\.log/) ? 'sì' : 'nessun comando ha letto app.log' }),
        onFail: "Cerca l'evidenza nel log: /var/log/taskflow/staging/app.log.",
      },
      {
        id: 'diagnosi',
        description: 'diagnosi.md: causa (altro ambiente) e ambiente',
        expected: 'cita invalid_token o "altro ambiente", e staging',
        test: (c) => {
          const md = c.read('diagnosi.md') ?? '';
          return { pass: /invalid_token|altro ambiente|ambiente diverso|ambiente sbagliato/i.test(md) && /staging/i.test(md), actual: md.trim().slice(0, 80) || '(mancante)' };
        },
        onFail: 'Scrivi: sintomo (401), causa (token emesso per un altro ambiente: development, non staging), evidenza (corpo/log) e correzione.',
      },
      {
        id: 'segreti',
        description: 'Nessun segreto scritto nei comandi',
        expected: 'client_secret solo da variabile',
        test: (c) => {
          const leak = c.cmds.find((x) => /client_secret"?\s*[:=]\s*"?[A-Za-z0-9_-]{8,}/.test(x.cmd) && !/\$/.test(x.cmd));
          return { pass: !leak, actual: leak ? 'segreto in chiaro' : 'ok' };
        },
        onFail: 'Usa le variabili d\'ambiente per le credenziali.',
      },
    ],
    example: { text: 'Esempio analogo: ricavare un token e metterlo in una variabile.', cmd: { bash: 'echo "vedi M4.L2: POST /v1/auth/token con client_id e client_secret dalle variabili"', pwsh: 'echo "vedi M4.L2: POST /v1/auth/token con client_id e client_secret dalle variabili"' } },
    hints: ['Il prefisso del token indica l\'ambiente che lo ha emesso. Il corpo del 401 e app.log lo confermano.', 'Le credenziali dello staging sono già nelle variabili d\'ambiente: usa la procedura di M4.L2.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m5l6',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks',
        'grep -i token /var/log/taskflow/staging/app.log',
        'export TASKFLOW_TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks | jq .total',
        'echo "Sintomo: 401 su staging. Causa: invalid_token, token emesso per un altro ambiente (development). Correzione: nuovo token da staging." > diagnosi.md',
      ],
      pwsh: [
        'cd ~/corso-cli/m5l6',
        'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }',
        'Select-String -Pattern token -Path /var/log/taskflow/staging/app.log',
        '$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json',
        '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body',
        '$env:TASKFLOW_TOKEN = $r.access_token',
        'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | Out-Null',
        'Set-Content diagnosi.md "Sintomo: 401 su staging. Causa: invalid_token, token emesso per un altro ambiente (development). Correzione: nuovo token da staging."',
      ],
    },
    summary: ['il token appartiene a un ambiente', 'corpo + log = evidenze', 'diagnosi documentata con causa e correzione'],
    skills: ['diagnosi', 'http', 'autonomia'],
    concepts: ['401 invalid_token', 'ambienti diversi', 'trasferimento'],
  },
];
