import type { Lesson } from '../types.ts';
import { apiHit, jsonOf, setupApi } from './helpers.ts';

const AUTH_H = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';

export const m3: Lesson[] = [
  {
    id: 'M3.L1',
    module: 3,
    n: 1,
    title: 'Client e server, URL e metodi',
    objective: 'Capire chi fa cosa in una richiesta HTTP, leggere un URL e inviare una prima richiesta GET con curl (o Invoke-RestMethod).',
    explain: [
      'HTTP è un dialogo: il CLIENT (curl, il browser) invia una richiesta, il SERVER risponde. Tutto avviene su un servizio SIMULATO: nel laboratorio nessuna richiesta esce dal tuo dispositivo.',
      "Un URL ha parti: schema (`http`), host (`localhost`), porta (`8080`), percorso (`/v1/health`), query (`?q=...`). L'endpoint è la combinazione metodo + percorso: `GET /v1/health`.",
      "Il metodo dice cosa vuoi fare: GET legge, POST crea, PUT/PATCH modificano, DELETE elimina. L'indirizzo del servizio è nella variabile `TASKFLOW_URL` (sviluppo = servizio simulato su localhost:8080).",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c),
    guided: [
      { title: 'Dove punta il servizio?', cmd: { bash: 'echo $TASKFLOW_URL', pwsh: 'echo $env:TASKFLOW_URL' }, what: "Mostra l'indirizzo base dell'ambiente simulato.", who: 'La shell.', parts: ['TASKFLOW_URL: variabile di configurazione'], expect: 'http://localhost:8080', risk: 'Ambiente di PROVA simulato, nessun servizio reale.' },
      { title: 'La prima richiesta', cmd: { bash: 'curl $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Invia GET /v1/health al servizio simulato.', who: 'curl / Invoke-RestMethod è il client; il server simulato risponde.', parts: ['URL con percorso /v1/health', 'metodo GET implicito'], expect: 'Un JSON con "status":"ok".', risk: 'Nessuno: sola lettura su servizio simulato.' },
    ],
    predict: [
      {
        prompt: 'Che formato ha la risposta di GET /v1/health e cosa contiene "status"?',
        cmd: { bash: 'curl -s $TASKFLOW_URL/v1/health', pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" | ConvertTo-Json' },
        expect: 'JSON: {"status":"ok","version":"1.0.0","env":"development","time":...}',
        why: 'Le API REST rispondono tipicamente in JSON.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se il server non esiste o la porta è sbagliata? Prova la porta 9999.',
      cmd: { bash: 'curl -s http://localhost:9999/v1/health; echo "exit=$?"', pwsh: 'try { Invoke-RestMethod http://localhost:9999/v1/health } catch { $_.Exception.Message }' },
      explain: 'Nessun server in ascolto su quella porta: curl esce con codice 7 (connessione rifiutata). Non è una risposta HTTP: la richiesta non è arrivata a nessun server.',
    },
    task: {
      text: 'In ~/corso-cli/m3l1 invia GET /v1/health al servizio e salva il corpo della risposta (il JSON) nel file `health.json`.',
      criterion: 'health.json contiene il JSON di risposta con status "ok" e il log del server mostra la richiesta GET /v1/health.',
    },
    checks: [
      {
        id: 'file',
        description: 'health.json contiene la risposta con status ok',
        expected: '{"status":"ok", ...}',
        test: (c) => {
          const j = jsonOf(c.read('health.json')) as { status?: string } | undefined;
          return { pass: j?.status === 'ok', actual: c.read('health.json')?.slice(0, 60) ?? '(file mancante)' };
        },
        onFail: 'Salva solo il corpo della risposta (curl -o file oppure | Set-Content). Controlla con cat health.json.',
      },
      {
        id: 'log',
        description: 'Il server ha ricevuto GET /v1/health (200) da questa shell',
        expected: 'GET /v1/health → 200',
        test: (c) => ({ pass: apiHit(c, 'GET', /^\/v1\/health/, 200), actual: `${c.apiShell.length} richieste dalla shell` }),
        onFail: "Il server non ha registrato la richiesta: l'URL è corretto? (usa $TASKFLOW_URL)",
      },
    ],
    example: { text: 'Esempio analogo: salvare un\'altra risposta su file.', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/openapi.json -o spec.json', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/openapi.json" -UseBasicParsing).Content | Set-Content spec.json' } },
    hints: ['curl ha un\'opzione per scrivere il corpo su file (-o). In PowerShell la proprietà Content di Invoke-WebRequest contiene il corpo.', "Spostati prima in ~/corso-cli/m3l1 e controlla il prompt: il file deve nascere lì."],
    solutions: {
      bash: ['cd ~/corso-cli/m3l1', 'curl -s $TASKFLOW_URL/v1/health -o health.json'],
      pwsh: ['cd ~/corso-cli/m3l1', '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).Content | Set-Content health.json'],
    },
    summary: ['client e server', 'URL: schema, host, porta, percorso, query', 'metodo + percorso = endpoint', 'connessione rifiutata ≠ risposta HTTP di errore'],
    skills: ['http', 'comandi', 'output'],
    concepts: ['client e server', 'URL ed endpoint', 'metodi HTTP', 'GET con curl', 'connessione rifiutata (curl 7)'],
  },
  {
    id: 'M3.L2',
    module: 3,
    n: 2,
    title: 'Status code e header',
    objective: 'Leggere lo status code e gli header di una risposta, e salvarli con gli strumenti della shell.',
    explain: [
      'Una risposta HTTP ha: riga di stato (`HTTP/1.1 404 Not Found`), header (coppie nome: valore) e corpo. Lo status code ha una famiglia: 2xx successo, 3xx redirect, 4xx errore del client, 5xx errore del server.',
      "Gli header portano metadati: `Content-Type`, `X-Request-Id` (identificativo della richiesta, utilissimo per i bug report). Con curl: `-i` mostra gli header insieme al corpo, `-I` solo gli header, `-w '%{http_code}'` stampa lo status.",
      "In PowerShell gli errori HTTP (4xx/5xx) di Invoke-RestMethod sono eccezioni: lo status si legge in un `catch` con `$_.Exception.Response.StatusCode.value__`.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c),
    guided: [
      { title: 'Vedere gli header', cmd: { bash: 'curl -i $TASKFLOW_URL/v1/health', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).Headers' }, what: 'Mostra stato, header e corpo.', who: 'curl -i / Invoke-WebRequest.', parts: ['-i: include gli header nell\'output'], expect: 'HTTP/1.1 200 OK, Content-Type, X-Request-Id, poi il JSON.', risk: 'Nessuno.' },
      { title: 'Solo lo status', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).StatusCode' }, what: 'Stampa soltanto 200.', who: 'curl: -o /dev/null scarta il corpo, -w stampa un modello.', parts: ['-s silenzioso', '-o /dev/null scarta il corpo', '-w modello di output'], expect: '200', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Che status ottieni da GET /v1/non-esiste?',
        cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/non-esiste', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/non-esiste" } catch { $_.Exception.Response.StatusCode.value__ }' },
        expect: '404 (route_not_found): il percorso non esiste nell\'API.',
        why: '4xx = errore del client (hai chiesto qualcosa che non c\'è).',
      },
    ],
    negative: {
      prompt: 'Metodo sbagliato su un endpoint che esiste: POST su /v1/health.',
      cmd: { bash: 'curl -s -i -X POST $TASKFLOW_URL/v1/health', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/health" -Method Post } catch { $_.Exception.Response.StatusCode.value__ }' },
      explain: '405 Method Not Allowed: il percorso esiste ma non accetta POST. L\'header Allow elenca i metodi consentiti. Non confonderlo con 404.',
    },
    task: {
      text: 'In ~/corso-cli/m3l2: (1) salva in `status.txt` lo status code di GET /v1/non-esiste (solo il numero); (2) salva in `request-id.txt` il valore dell\'header X-Request-Id di una richiesta a /v1/health.',
      criterion: 'status.txt contiene 404; request-id.txt contiene un identificativo del tipo req_000123 che il server ha realmente assegnato a una richiesta a /v1/health.',
    },
    checks: [
      {
        id: 'status',
        description: 'status.txt contiene 404',
        expected: '404',
        test: (c) => ({ pass: (c.read('status.txt') ?? '').trim() === '404', actual: (c.read('status.txt') ?? '(file mancante)').trim() }),
        onFail: 'Serve solo il numero. Bash: -o /dev/null -w "%{http_code}" e redirezione. PowerShell: leggi value__ nel catch.',
        errorTag: 'http-vs-applicativo',
      },
      {
        id: 'reqid',
        description: 'request-id.txt contiene un X-Request-Id reale di /v1/health',
        expected: 'req_NNNNNN presente nel log del server per /v1/health',
        test: (c) => {
          const id = (c.read('request-id.txt') ?? '').trim();
          const ok = /^req_\d{6}$/.test(id) && c.api.some((e) => e.requestId === id && e.path.startsWith('/v1/health'));
          return { pass: ok, actual: id || '(vuoto o mancante)' };
        },
        onFail: "L'identificativo deve essere quello restituito dal server nell'header X-Request-Id (senza spazi né ritorni a capo). curl -I mostra solo gli header.",
      },
    ],
    example: { text: 'Esempio analogo: salvare lo status di un\'altra richiesta.', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}" $TASKFLOW_URL/v1/health > ok.txt', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).StatusCode > ok.txt' } },
    hints: ['Bash: combina -s, -o /dev/null e -w "%{http_code}", poi > status.txt. Per l\'header: curl -sI, grep, cut e tr -d "\\r".', 'PowerShell: nel catch, $_.Exception.Response.StatusCode.value__ è il numero; l\'header si legge da (Invoke-WebRequest ...).Headers["X-Request-Id"].'],
    solutions: {
      bash: ['cd ~/corso-cli/m3l2', 'curl -s -o /dev/null -w "%{http_code}" $TASKFLOW_URL/v1/non-esiste > status.txt', "curl -sI $TASKFLOW_URL/v1/health | grep -i x-request-id | cut -d' ' -f2 | tr -d '\\r' > request-id.txt"],
      pwsh: ['cd ~/corso-cli/m3l2', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/non-esiste" } catch { $code = $_.Exception.Response.StatusCode.value__ }', '$code > status.txt', "(Invoke-WebRequest \"$env:TASKFLOW_URL/v1/health\" -UseBasicParsing).Headers['X-Request-Id'] > request-id.txt"],
    },
    summary: ['famiglie di status 2xx/3xx/4xx/5xx', 'header come metadati', '404 ≠ 405', 'PowerShell: errori HTTP = eccezioni'],
    skills: ['http', 'output', 'comandi'],
    concepts: ['status code', 'header', 'curl -i, -I, -w', 'X-Request-Id', 'differenza 404/405'],
  },
  {
    id: 'M3.L3',
    module: 3,
    n: 3,
    title: 'Body JSON, parametri e Content-Type',
    objective: 'Usare query parameter e inviare un body JSON dichiarando il Content-Type, con l\'URL correttamente quotato.',
    explain: [
      'I query parameter stanno dopo `?` e sono separati da `&`: `/v1/tasks?status=open&limit=2`. In Bash la `&` è un carattere speciale: l\'URL va SEMPRE tra virgolette. In PowerShell la `&` è riservata: stessa regola.',
      "Un body JSON si invia con `-d` (curl) o `-Body` (PowerShell). Il server deve sapere che è JSON: header `Content-Type: application/json` (curl: `-H`; PowerShell: `-ContentType`). Senza, curl dichiara form e il server risponde 415.",
      "Per le richieste autenticate serve `Authorization: Bearer <token>`. In questa lezione il token è già nella variabile `TASKFLOW_TOKEN`: come ottenerlo lo vedrai nel modulo M4.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Query parameter (URL quotato)', cmd: { bash: `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=1"`, pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?limit=1" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | ConvertTo-Json -Depth 5' }, what: 'Chiede al massimo 1 task.', who: 'La shell lascia intatto l\'URL tra virgolette.', parts: ['?limit=1: parametro di query', 'Authorization: Bearer ...: credenziale'], expect: 'Un JSON con data (1 task), total, limit, offset.', risk: 'Sola lettura.' },
    ],
    predict: [
      {
        prompt: 'Cosa risponde il server se invii un body JSON senza il Content-Type JSON (curl -d usa form di default)?',
        cmd: { bash: `curl -s -X POST ${AUTH_H} -d '{"title":"Prova"}' $TASKFLOW_URL/v1/tasks`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -Body \'{"title":"Prova"}\' } catch { $_.ErrorDetails.Message }' },
        expect: '415 unsupported_media_type: "Content-Type deve essere application/json".',
        why: 'curl -d e PowerShell (stringa) inviano application/x-www-form-urlencoded se non indichi altro.',
      },
    ],
    negative: {
      prompt: 'Dimentica le virgolette sull\'URL con &.',
      cmd: { bash: `curl -s ${AUTH_H} $TASKFLOW_URL/v1/tasks?status=open&limit=2`, pwsh: 'Invoke-RestMethod $env:TASKFLOW_URL/v1/tasks?status=open&limit=2' },
      explain: 'La shell interpreta la & (in Bash manderebbe il comando in background e perderesti il secondo parametro; PowerShell la rifiuta). Metti sempre l\'URL tra virgolette.',
    },
    task: {
      text: 'In ~/corso-cli/m3l3: (1) salva in `aperti.json` la lista dei task con status `open`, al massimo 2; (2) crea un nuovo task con titolo `Imparare curl` inviando un body JSON.',
      criterion: 'aperti.json ha 2 task, tutti open; il server ha ricevuto un POST /v1/tasks con titolo "Imparare curl" e ha risposto 201.',
    },
    checks: [
      {
        id: 'aperti',
        description: 'aperti.json: 2 task, tutti open',
        expected: 'data con 2 elementi, status open',
        test: (c) => {
          const j = jsonOf(c.read('aperti.json')) as { data?: { status: string }[] } | undefined;
          const ok = !!j?.data && j.data.length === 2 && j.data.every((t) => t.status === 'open');
          return { pass: ok, actual: j?.data ? `${j.data.length} task` : '(JSON mancante o non valido)' };
        },
        onFail: 'Parametri: status=open e limit=2, nello stesso URL separati da & (URL tra virgolette). In PowerShell ConvertTo-Json ha bisogno di -Depth 5 per non troncare i task.',
      },
      {
        id: 'post',
        description: 'POST /v1/tasks con "Imparare curl" → 201',
        expected: 'POST → 201 con quel titolo nel body',
        test: (c) => ({ pass: c.apiShell.some((e) => e.method === 'POST' && e.path === '/v1/tasks' && e.status === 201 && (e.reqBody ?? '').includes('Imparare curl')), actual: c.apiShell.filter((e) => e.method === 'POST').map((e) => e.status).join(',') || 'nessun POST' }),
        onFail: 'Serve il metodo POST, un body JSON {"title":"Imparare curl"} e il Content-Type application/json (altrimenti 415).',
        errorTag: 'content-type',
      },
    ],
    example: { text: 'Esempio analogo: creare un progetto.', cmd: { bash: `curl -s -X POST ${AUTH_H} -H "Content-Type: application/json" -d '{"name":"Demo"}' $TASKFLOW_URL/v1/projects`, pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/projects" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"name":"Demo"}\'' } },
    hints: ['Per la lista: URL tra virgolette con ?status=open&limit=2 e l\'header Authorization. Salva con -o (Bash) o | ConvertTo-Json -Depth 5 > file (PowerShell).', 'Per il POST: -X POST, -H "Content-Type: application/json" e -d con il JSON tra apici singoli (PowerShell: -Method Post -ContentType ... -Body).'],
    solutions: {
      bash: ['cd ~/corso-cli/m3l3', `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?status=open&limit=2" -o aperti.json`, `curl -s -X POST ${AUTH_H} -H "Content-Type: application/json" -d '{"title":"Imparare curl"}' $TASKFLOW_URL/v1/tasks`],
      pwsh: ['cd ~/corso-cli/m3l3', '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?status=open&limit=2" -Headers $h | ConvertTo-Json -Depth 5 > aperti.json', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType \'application/json\' -Body \'{"title":"Imparare curl"}\''],
    },
    summary: ['?chiave=valore&altra=valore', 'quoting dell\'URL', 'Content-Type: application/json', '415 = formato del body non accettato'],
    skills: ['http', 'comandi', 'testing'],
    concepts: ['query parameter', 'body JSON', 'Content-Type', 'quoting degli URL', 'header Authorization'],
  },
  {
    id: 'M3.L4',
    module: 3,
    n: 4,
    title: 'Errore HTTP ed errore applicativo a confronto',
    objective: 'Distinguere lo status HTTP dal codice di errore del corpo (applicativo) e usarli entrambi per descrivere un problema.',
    explain: [
      "Lo status HTTP dice la categoria dell'esito (404, 422, 401). Il corpo dell'errore di questa API aggiunge un codice applicativo (`error`) e un messaggio leggibile (`message`): `{\"error\":\"not_found\",\"message\":\"Task 9999 non trovato.\"}`.",
      "Con lo stesso status possono nascondersi cause diverse: un 404 può essere un percorso inesistente (`route_not_found`) oppure una risorsa mancante (`not_found`). Per capire davvero devi leggere il corpo.",
      "Un buon report di bug riporta sempre entrambi: status HTTP, codice applicativo, messaggio e `requestId`.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Risorsa inesistente', cmd: { bash: `curl -s -i ${AUTH_H} $TASKFLOW_URL/v1/tasks/9999`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/9999" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }' }, what: 'Chiede un task che non esiste.', who: 'Il server risponde 404.', parts: ['id 9999 inesistente'], expect: '404 e {"error":"not_found",...}', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Percorso inesistente (/v1/non-esiste) e risorsa inesistente (/v1/tasks/9999): stesso status, stesso codice applicativo?',
        cmd: { bash: `curl -s $TASKFLOW_URL/v1/non-esiste; echo; curl -s ${AUTH_H} $TASKFLOW_URL/v1/tasks/9999`, pwsh: 'try { irm "$env:TASKFLOW_URL/v1/non-esiste" } catch { $_.ErrorDetails.Message }' },
        expect: 'Stesso status 404, ma codici diversi: route_not_found (percorso) e not_found (risorsa).',
        why: 'Lo status è la categoria; il codice applicativo è la causa.',
      },
    ],
    negative: {
      prompt: 'Un 422 non è un errore "del server": cosa dice il corpo quando il titolo è troppo corto?',
      cmd: { bash: `curl -s -X POST ${AUTH_H} -H "Content-Type: application/json" -d '{"title":"x"}' $TASKFLOW_URL/v1/tasks`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"title":"x"}\' } catch { $_.ErrorDetails.Message }' },
      explain: '422 validation_failed con l\'elenco errors: field "title", message "lunghezza minima 3 caratteri". La richiesta è sintatticamente valida ma i dati no.',
    },
    task: {
      text: 'In ~/corso-cli/m3l4 provoca questi tre errori e poi scrivi in `errori.md` una riga per ciascuno con status e codice applicativo: (a) task inesistente (id 9999) con token valido; (b) POST /v1/tasks con titolo "x"; (c) GET /v1/tasks SENZA token.',
      criterion: 'Il server ha registrato 404, 422 e 401; errori.md contiene i tre codici applicativi (not_found, validation_failed, unauthorized).',
    },
    checks: [
      {
        id: 'log',
        description: 'Il server ha registrato 404 (task), 422 (validazione) e 401 (senza token)',
        expected: 'GET /v1/tasks/N → 404; POST /v1/tasks → 422; GET /v1/tasks → 401',
        test: (c) => {
          const a = c.apiShell.some((e) => /^\/v1\/tasks\/\d+/.test(e.path) && e.status === 404);
          const b = c.apiShell.some((e) => e.method === 'POST' && e.path === '/v1/tasks' && e.status === 422);
          const d = c.apiShell.some((e) => e.method === 'GET' && e.path.startsWith('/v1/tasks') && e.status === 401);
          return { pass: a && b && d, actual: `404 task: ${a}, 422: ${b}, 401: ${d}` };
        },
        onFail: 'Ti manca uno dei tre errori: per il 401 non inviare l\'header Authorization; per il 422 usa un titolo di 1 carattere.',
      },
      {
        id: 'file',
        description: 'errori.md riporta i codici applicativi',
        expected: 'not_found, validation_failed, unauthorized',
        test: (c) => {
          const t = c.read('errori.md') ?? '';
          const miss = ['not_found', 'validation_failed', 'unauthorized'].filter((k) => !t.includes(k));
          return { pass: !miss.length, actual: miss.length ? `mancano: ${miss.join(', ')}` : 'ok' };
        },
        onFail: 'Leggi il corpo di ciascuna risposta: il codice applicativo è il campo "error". Scrivi per esempio: 404 not_found — task inesistente.',
        errorTag: 'http-vs-applicativo',
      },
    ],
    example: { text: 'Esempio analogo di riga: 405 method_not_allowed — POST su /v1/health.', cmd: { bash: 'echo "405 method_not_allowed - POST su /v1/health" >> note.md', pwsh: 'Add-Content note.md "405 method_not_allowed - POST su /v1/health"' } },
    hints: ['Esegui le tre richieste e leggi "error" nel corpo di ciascuna. PowerShell: nel catch usa $_.ErrorDetails.Message.', 'Una riga per errore: status, codice, causa. Puoi usare echo con >> per aggiungere righe.'],
    solutions: {
      bash: ['cd ~/corso-cli/m3l4', `curl -s ${AUTH_H} $TASKFLOW_URL/v1/tasks/9999`, `curl -s -X POST ${AUTH_H} -H "Content-Type: application/json" -d '{"title":"x"}' $TASKFLOW_URL/v1/tasks`, 'curl -s $TASKFLOW_URL/v1/tasks', 'echo "404 not_found - task inesistente" > errori.md', 'echo "422 validation_failed - titolo troppo corto" >> errori.md', 'echo "401 unauthorized - manca il token" >> errori.md'],
      pwsh: ['cd ~/corso-cli/m3l4', '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/9999" -Headers $h } catch { $_.ErrorDetails.Message }', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType \'application/json\' -Body \'{"title":"x"}\' } catch { $_.ErrorDetails.Message }', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" } catch { $_.ErrorDetails.Message }', 'Set-Content errori.md -Value "404 not_found - task inesistente","422 validation_failed - titolo troppo corto","401 unauthorized - manca il token"'],
    },
    summary: ['status HTTP = categoria', 'campo error = causa applicativa', 'stesso status, cause diverse', 'report: status + codice + messaggio + requestId'],
    skills: ['http', 'diagnosi', 'output'],
    concepts: ['errore HTTP vs errore applicativo', '404 route_not_found vs not_found', '422 validation_failed', '401 unauthorized'],
  },
];
