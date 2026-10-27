import type { Lesson } from '../types.ts';
import { apiHit, fileLines, jsonOf, noSecretsInCmds, setupApi } from './helpers.ts';

const AUTH_H = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const JSON_H = '-H "Content-Type: application/json"';

export const m4: Lesson[] = [
  {
    id: 'M4.L1',
    module: 4,
    n: 1,
    title: 'Leggere una specifica OpenAPI',
    objective: 'Scaricare la specifica OpenAPI del servizio e ricavarne informazioni verificabili (quali endpoint accettano POST).',
    explain: [
      'OpenAPI è un file (JSON o YAML) che descrive un\'API: percorsi, metodi, parametri, body, risposte, autenticazione. È la fonte per la documentazione e per i test: leggerla bene evita di indovinare.',
      "Struttura essenziale: `paths` → percorso → metodo (`get`, `post`...) → `summary`, `parameters`, `requestBody`, `responses`; `components.securitySchemes` descrive l'autenticazione.",
      'Per interrogarla da riga di comando serve uno strumento per JSON: `jq` in Bash; ConvertFrom-Json in PowerShell (che trasforma il JSON in oggetti).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c),
    guided: [
      { title: 'Scaricare la specifica', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/openapi.json | head -c 200', pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").info' }, what: 'Scarica la specifica e ne mostra l\'inizio.', who: 'curl / Invoke-RestMethod.', parts: ['/v1/openapi.json: endpoint della specifica'], expect: '{"openapi":"3.0.3","info":{...', risk: 'Nessuno.' },
      { title: 'Elencare i percorsi', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq -r '.paths | keys[]'", pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths.PSObject.Properties.Name' }, what: 'Mostra tutti i percorsi documentati.', who: 'jq estrae i dati dal JSON.', parts: ['.paths: oggetto dei percorsi', 'keys[]: le chiavi, una per riga'], expect: '/admin/users, /auth/token, /flaky, /health...', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Quanti percorsi ha la specifica e quale metodo ha /auth/token?',
        cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths[\"/auth/token\"] | keys'", pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths."/auth/token".PSObject.Properties.Name' },
        expect: 'Solo post: per ottenere un token si invia (POST) credenziali.',
        why: 'Ogni percorso elenca i metodi che accetta.',
      },
    ],
    negative: {
      prompt: 'Un filtro jq sbagliato: cosa dice jq?',
      cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq '.paths | keys[0].foo'", pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths.NonEsiste.Altro' },
      explain: 'jq segnala "Cannot index string with \\"foo\\"" (codice 5). PowerShell tollera i membri inesistenti e restituisce vuoto: un altro fallimento silenzioso.',
    },
    task: {
      text: 'In ~/corso-cli/m4l1: salva la specifica in `openapi.json` e crea `elenco.txt` con i percorsi (uno per riga) che accettano il metodo POST.',
      criterion: 'elenco.txt contiene esattamente i tre percorsi con POST: /auth/token, /projects, /tasks.',
    },
    checks: [
      {
        id: 'spec',
        description: 'openapi.json è una specifica OpenAPI valida',
        expected: 'JSON con campo "openapi"',
        test: (c) => {
          const j = jsonOf(c.read('openapi.json')) as { openapi?: string; paths?: object } | undefined;
          return { pass: !!j?.openapi && !!j.paths, actual: j?.openapi ? `OpenAPI ${j.openapi}` : '(file mancante o non valido)' };
        },
        onFail: 'Scarica /v1/openapi.json nel file (curl -o, oppure ConvertTo-Json -Depth 20 per PowerShell).',
      },
      {
        id: 'elenco',
        description: 'elenco.txt: i percorsi con POST',
        expected: '/auth/token, /projects, /tasks',
        test: (c) => {
          const got = fileLines(c.read('elenco.txt')).map((l) => l.trim()).sort();
          const want = ['/auth/token', '/projects', '/tasks'];
          return { pass: JSON.stringify(got) === JSON.stringify(want), actual: got.join(', ') || '(vuoto)' };
        },
        onFail: 'Filtra i percorsi che hanno la chiave "post": in jq select(.value.post) dopo to_entries; in PowerShell Where-Object { $_.Value.post }.',
      },
    ],
    example: { text: 'Esempio analogo: elencare i percorsi che accettano DELETE.', cmd: { bash: "jq -r '.paths | to_entries[] | select(.value.delete) | .key' openapi.json", pwsh: '$spec.paths.PSObject.Properties | Where-Object { $_.Value.delete } | ForEach-Object { $_.Name }' } },
    hints: ['Con jq: to_entries trasforma l\'oggetto in coppie key/value; select() filtra; -r toglie le virgolette.', 'PowerShell: ConvertFrom-Json produce oggetti; .paths.PSObject.Properties ti dà Name e Value per ogni percorso.'],
    solutions: {
      bash: ['cd ~/corso-cli/m4l1', 'curl -s $TASKFLOW_URL/v1/openapi.json -o openapi.json', "jq -r '.paths | to_entries[] | select(.value.post) | .key' openapi.json > elenco.txt"],
      pwsh: ['cd ~/corso-cli/m4l1', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json" | ConvertTo-Json -Depth 20 > openapi.json', '$spec = Get-Content openapi.json -Raw | ConvertFrom-Json', '$spec.paths.PSObject.Properties | Where-Object { $_.Value.post } | ForEach-Object { $_.Name } > elenco.txt'],
    },
    summary: ['OpenAPI descrive percorsi, metodi, body, risposte', 'jq / ConvertFrom-Json per interrogarla', 'la specifica è la fonte per test e documentazione'],
    skills: ['http', 'testing', 'docs'],
    concepts: ['struttura di una specifica OpenAPI', 'jq di base', 'ConvertFrom-Json'],
  },
  {
    id: 'M4.L3',
    module: 4,
    n: 3,
    title: 'Autenticazione Bearer e segreti',
    objective: 'Ottenere un access token senza scrivere i segreti nei comandi e usarlo in una richiesta autenticata.',
    explain: [
      "Molte API richiedono un token: lo ottieni scambiando credenziali (client_id e client_secret) e lo invii poi nell'header `Authorization: Bearer <token>`. Senza token ricevi 401.",
      "I segreti non vanno MAI scritti nei comandi o nei file condivisi: finiscono nella cronologia della shell (`history`), nei log e nella documentazione. Si leggono da variabili d'ambiente (qui già configurate: `TASKFLOW_CLIENT_ID`, `TASKFLOW_CLIENT_SECRET`).",
      "Le credenziali di questo laboratorio sono simulate. In un progetto reale non condividere mai file di configurazione sconosciuti, né il contenuto di ~/.ssh o di file con token.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: false }),
    guided: [
      { title: 'Senza token', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/me', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" } catch { $_.ErrorDetails.Message }' }, what: 'Mostra cosa succede senza credenziali.', who: 'Il server risponde 401 e l\'header WWW-Authenticate.', parts: ['nessun header Authorization'], expect: '401 unauthorized', risk: 'Nessuno.' },
      { title: 'Cosa c\'è nelle variabili', cmd: { bash: 'echo $TASKFLOW_CLIENT_ID', pwsh: 'echo $env:TASKFLOW_CLIENT_ID' }, what: "Mostra l'ID del client (non il segreto).", who: 'La shell.', parts: ['Mostra solo l\'ID: il segreto non si stampa'], expect: 'tf-dev-client', risk: 'Mai stampare i segreti in uno screenshot o in una chat.' },
    ],
    predict: [
      {
        prompt: 'Che status e codice applicativo ottieni se invii un\'intestazione Authorization con schema sbagliato (Token xyz)?',
        cmd: { bash: 'curl -s -H "Authorization: Token xyz" $TASKFLOW_URL/v1/me', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers @{Authorization="Token xyz"} } catch { $_.ErrorDetails.Message }' },
        expect: '401 invalid_authorization_scheme (atteso Bearer).',
        why: 'L\'header c\'è ma lo schema non è Bearer.',
      },
    ],
    negative: {
      prompt: 'Credenziali sbagliate: cosa risponde l\'endpoint dei token?',
      cmd: { bash: `curl -s -X POST ${JSON_H} -d '{"client_id":"x","client_secret":"y"}' $TASKFLOW_URL/v1/auth/token`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body \'{"client_id":"x","client_secret":"y"}\' } catch { $_.ErrorDetails.Message }' },
      explain: '401 invalid_client. (Questi valori finti non sono segreti; i veri non si scrivono nei comandi.)',
    },
    task: {
      text: "Ottieni un token con POST /v1/auth/token usando le credenziali dalle variabili d'ambiente (senza scrivere il segreto nei comandi), poi chiama GET /v1/me con quel token.",
      criterion: 'Il server registra POST /v1/auth/token → 200 e GET /v1/me → 200; nessun segreto compare nei tuoi comandi.',
    },
    checks: [
      {
        id: 'token',
        description: 'POST /v1/auth/token → 200',
        expected: 'token emesso',
        test: (c) => ({ pass: apiHit(c, 'POST', /^\/v1\/auth\/token/, 200), actual: c.apiShell.filter((e) => e.path.includes('auth')).map((e) => e.status).join(',') || 'nessuna richiesta' }),
        onFail: 'Il body deve contenere client_id e client_secret; se invii JSON ricordati il Content-Type. Usa le variabili d\'ambiente.',
        errorTag: 'content-type',
      },
      {
        id: 'me',
        description: 'GET /v1/me → 200',
        expected: 'chiamata autenticata riuscita',
        test: (c) => ({ pass: apiHit(c, 'GET', /^\/v1\/me/, 200), actual: c.apiShell.filter((e) => e.path.includes('/me')).map((e) => e.status).join(',') || 'nessuna richiesta' }),
        onFail: 'Invia l\'header Authorization: Bearer <token> con il token ricevuto dal passo precedente.',
      },
      noSecretsInCmds(),
    ],
    example: { text: 'Esempio analogo: estrarre un campo dalla risposta con jq e usarlo.', cmd: { bash: `NOME=$(curl -s ${AUTH_H} $TASKFLOW_URL/v1/me | jq -r .name)`, pwsh: '$nome = (Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers $h).name' } },
    hints: ['Token: POST /v1/auth/token con JSON {"client_id":..., "client_secret":...} costruito con le variabili (virgolette doppie in Bash; @{...} | ConvertTo-Json in PowerShell).', 'Salva access_token in una variabile (Bash: TOKEN=$(... | jq -r .access_token)) e usalo in "Authorization: Bearer $TOKEN".'],
    solutions: {
      bash: ['TOKEN=$(curl -s -X POST $TASKFLOW_URL/v1/auth/token ' + JSON_H + ' -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)', 'curl -s -H "Authorization: Bearer $TOKEN" $TASKFLOW_URL/v1/me'],
      pwsh: ['$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json', '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers @{ Authorization = "Bearer $($r.access_token)" }'],
    },
    summary: ['token Bearer', 'segreti in variabili d\'ambiente, mai nei comandi', '401 senza token o con token non valido'],
    skills: ['http', 'testing', 'diagnosi'],
    concepts: ['autenticazione Bearer', 'segreti in variabili d\'ambiente', 'ottenere un token', 'jq -r'],
  },
  {
    id: 'M4.L4',
    module: 4,
    n: 4,
    title: 'CRUD con JSON, Content-Type e Accept',
    objective: 'Creare, leggere e aggiornare una risorsa con richieste HTTP, verificando lo stato dopo ogni passaggio.',
    explain: [
      'CRUD = Create (POST), Read (GET), Update (PUT sostituisce, PATCH modifica una parte), Delete (DELETE). Una risorsa creata riceve un id: la risposta 201 lo contiene e l\'header Location indica dove trovarla.',
      'Content-Type descrive il formato di ciò che INVII; Accept il formato che VUOI ricevere. Un body senza Content-Type corretto viene rifiutato (415).',
      'Dopo ogni modifica rileggi la risorsa: è la verifica più semplice che l\'operazione abbia fatto ciò che pensavi.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Create', cmd: { bash: `curl -s -i -X POST ${AUTH_H} ${JSON_H} -d '{"title":"Task di prova"}' $TASKFLOW_URL/v1/tasks`, pwsh: 'Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks" -Method Post -UseBasicParsing -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"title":"Task di prova"}\'' }, what: 'Crea un task.', who: 'Il server assegna un id.', parts: ['-X POST', '-H Content-Type', '-d: il body JSON'], expect: '201 Created, header Location: /v1/tasks/6, corpo con "id":6', risk: 'Modifica i dati simulati (reset disponibile).' },
    ],
    predict: [
      {
        prompt: 'Cosa succede se riapri (PATCH status=open) un task già completato (id 1)?',
        cmd: { bash: `curl -s -X PATCH ${AUTH_H} ${JSON_H} -d '{"status":"open"}' $TASKFLOW_URL/v1/tasks/1`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/1" -Method Patch -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body \'{"status":"open"}\' } catch { $_.ErrorDetails.Message }' },
        expect: '409 invalid_transition: un task completato non può essere riaperto.',
        why: '409 Conflict = la richiesta è valida ma in conflitto con lo stato attuale.',
      },
    ],
    negative: {
      prompt: 'Dimentica il Content-Type in un POST con curl.',
      cmd: { bash: `curl -s -X POST ${AUTH_H} -d '{"title":"x"}' $TASKFLOW_URL/v1/tasks`, pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -Body \'{"title":"ciao"}\' } catch { $_.ErrorDetails.Message }' },
      explain: '415 unsupported_media_type. curl -d e PowerShell (stringa) dichiarano form-urlencoded: indica sempre il Content-Type JSON.',
    },
    task: {
      text: 'Crea un task con titolo `Scrivere la guida API`, rileggilo con il suo id e poi aggiornane SOLO lo stato a `done` (PATCH).',
      criterion: 'Esiste un task "Scrivere la guida API" con status done; il server ha registrato POST 201, GET 200 su quell\'id e PATCH 200.',
    },
    checks: [
      {
        id: 'stato',
        description: 'Il task "Scrivere la guida API" esiste ed è done',
        expected: 'status done',
        test: (c) => {
          const t = c.state.api.envs.development.tasks.find((x) => x.title === 'Scrivere la guida API');
          return { pass: t?.status === 'done', actual: t ? `status ${t.status}` : 'task non trovato' };
        },
        onFail: 'Crea con POST (titolo esatto), poi PATCH con {"status":"done"} sull\'id restituito.',
      },
      {
        id: 'sequenza',
        description: 'POST 201, GET 200 e PATCH 200 sullo stesso task',
        expected: 'create → read → update',
        test: (c) => {
          const t = c.state.api.envs.development.tasks.find((x) => x.title === 'Scrivere la guida API');
          if (!t) return { pass: false, actual: 'task non trovato' };
          const re = new RegExp(`^/v1/tasks/${t.id}$`);
          const ok = apiHit(c, 'POST', /^\/v1\/tasks$/, 201) && apiHit(c, 'GET', re, 200) && apiHit(c, 'PATCH', re, 200);
          return { pass: ok, actual: `POST:${apiHit(c, 'POST', /^\/v1\/tasks$/, 201)} GET:${apiHit(c, 'GET', re, 200)} PATCH:${apiHit(c, 'PATCH', re, 200)}` };
        },
        onFail: 'Mancano passaggi: dopo la creazione leggi con GET /v1/tasks/<id>, poi PATCH sullo stesso id.',
      },
    ],
    example: { text: 'Esempio analogo: aggiornare la priorità di un task con PATCH.', cmd: { bash: `curl -s -X PATCH ${AUTH_H} ${JSON_H} -d '{"priority":1}' $TASKFLOW_URL/v1/tasks/3`, pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/3" -Method Patch -Headers $h -ContentType "application/json" -Body \'{"priority":1}\'' } },
    hints: ['L\'id del nuovo task è nella risposta del POST (campo `id`): salvalo, per esempio con jq -r .id, e usalo nelle richieste successive; se hai provato il passo guidato, esiste già un task di prova e l\'id sarà diverso.', 'PATCH invia solo i campi da cambiare: {"status":"done"}.'],
    solutions: {
      bash: [`ID=$(curl -s -X POST ${AUTH_H} ${JSON_H} -d '{"title":"Scrivere la guida API"}' $TASKFLOW_URL/v1/tasks | jq -r .id)`, `curl -s ${AUTH_H} $TASKFLOW_URL/v1/tasks/$ID`, `curl -s -X PATCH ${AUTH_H} ${JSON_H} -d '{"status":"done"}' $TASKFLOW_URL/v1/tasks/$ID`],
      pwsh: ['$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }', '$id = (Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers $h -ContentType \'application/json\' -Body \'{"title":"Scrivere la guida API"}\').id', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/$id" -Headers $h', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks/$id" -Method Patch -Headers $h -ContentType \'application/json\' -Body \'{"status":"done"}\''],
    },
    summary: ['POST crea, GET legge, PATCH aggiorna in parte, PUT sostituisce, DELETE elimina', 'Content-Type / Accept', '409 = conflitto di stato', 'verifica sempre con una lettura'],
    skills: ['http', 'testing', 'comandi'],
    concepts: ['CRUD con HTTP', 'Content-Type e Accept', 'PATCH vs PUT', '409 conflitto', 'Location header'],
  },
  {
    id: 'M4.L6',
    module: 4,
    n: 6,
    title: 'Paginazione e idempotenza',
    objective: 'Leggere pagine di risultati, calcolare l\'offset di una pagina e verificare l\'idempotenza di DELETE.',
    explain: [
      'Le liste lunghe sono paginate: `limit` (quanti) e `offset` (da dove). La risposta riporta `total`, utile per sapere quante pagine ci sono.',
      'L\'offset di una pagina si calcola così: `offset = limit × (numero pagina − 1)`. Chiedere una pagina oltre la fine NON è un errore: l\'elenco è vuoto, e solo `total` dice che i dati sono finiti.',
      "Un'operazione è idempotente se ripeterla dà lo stesso stato finale. DELETE lo è nello stato (il task non c'è più) ma NON nella risposta: la prima volta 204, la seconda 404.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Prima pagina', cmd: { bash: `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=2&offset=0"`, pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?limit=2&offset=0" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}).data | Select-Object id,title' }, what: 'Chiede i primi 2 task.', who: 'Il server pagina.', parts: ['limit=2: dimensione', 'offset=0: inizio'], expect: 'id 1 e 2, total 5', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Con limit=2, quale offset serve per la TERZA pagina? E cosa restituisce se i task sono 5?',
        cmd: { bash: `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=2&offset=4"`, pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?limit=2&offset=4" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}).data | Select-Object id,title' },
        expect: 'offset 4 (2 × (3 − 1)): un solo elemento, il task 5, perché ne restano 5 − 4 = 1.',
        why: 'L\'ultima pagina può essere più corta. Per sapere quando fermarsi si confronta offset + limit con total.',
      },
    ],
    negative: {
      prompt: 'Una pagina oltre la fine dei dati:',
      cmd: { bash: `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=2&offset=100" | jq '{total, quanti: (.data | length)}'`, pwsh: '$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?limit=2&offset=100" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}; "total $($r.total), elementi $($r.data.Count)"' },
      explain: '200 con elenco vuoto e total invariato: non è un errore. Un ciclo che scorre le pagine deve fermarsi quando i dati finiscono, non quando arriva un errore.',
    },
    task: {
      text: 'In ~/corso-cli/m4l6: (1) salva in `pagina2.json` la SECONDA pagina di task con 2 elementi per pagina; (2) elimina il task 5 due volte e annota in `idempotenza.txt` i due status ricevuti (nell\'ordine, separati da uno spazio).',
      criterion: 'pagina2.json contiene i task con id 3 e 4; idempotenza.txt contiene "204 404"; il server ha registrato DELETE 204 e poi DELETE 404.',
    },
    checks: [
      {
        id: 'pagina2',
        description: 'pagina2.json contiene i task 3 e 4',
        expected: 'data: id 3, 4',
        test: (c) => {
          const j = jsonOf(c.read('pagina2.json')) as { data?: { id: number }[] } | undefined;
          const ids = j?.data?.map((t) => t.id).join(',');
          return { pass: ids === '3,4', actual: ids ?? '(JSON mancante)' };
        },
        onFail: 'Seconda pagina con limit=2: offset=2 (offset = quanti elementi saltare).',
      },
      {
        id: 'idem',
        description: 'idempotenza.txt = "204 404"',
        expected: '204 404',
        test: (c) => {
          const t = (c.read('idempotenza.txt') ?? '').trim().split(/\s+/).join(' ');
          return { pass: t === '204 404', actual: t || '(vuoto)' };
        },
        onFail: 'Fai due DELETE di fila sullo stesso id e annota gli status nell\'ordine in cui arrivano.',
      },
      {
        id: 'log',
        description: 'DELETE /v1/tasks/5 → 204 e poi 404',
        expected: 'prima 204, poi 404',
        test: (c) => {
          const d = c.apiShell.filter((e) => e.method === 'DELETE' && e.path === '/v1/tasks/5').map((e) => e.status);
          return { pass: d.includes(204) && d.indexOf(404) > d.indexOf(204), actual: d.join(',') || 'nessun DELETE' };
        },
        onFail: 'Il task 5 deve essere eliminato (204) e poi richiesto di nuovo (404).',
      },
    ],
    example: { text: 'Esempio analogo: terza pagina con 1 elemento per pagina.', cmd: { bash: `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=1&offset=2"`, pwsh: 'irm "$env:TASKFLOW_URL/v1/tasks?limit=1&offset=2" -Headers $h' } },
    hints: ['offset = limit × (numero pagina − 1): per la pagina 2 con 2 elementi, offset=2.', 'Con curl: -o /dev/null -w "%{http_code} " per stampare solo lo status; aggiungi in append con >> per il secondo.'],
    solutions: {
      bash: ['cd ~/corso-cli/m4l6', `curl -s ${AUTH_H} "$TASKFLOW_URL/v1/tasks?limit=2&offset=2" -o pagina2.json`, `curl -s -o /dev/null -w "%{http_code} " -X DELETE ${AUTH_H} $TASKFLOW_URL/v1/tasks/5 > idempotenza.txt`, `curl -s -o /dev/null -w "%{http_code}\\n" -X DELETE ${AUTH_H} $TASKFLOW_URL/v1/tasks/5 >> idempotenza.txt`],
      pwsh: ['cd ~/corso-cli/m4l6', '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?limit=2&offset=2" -Headers $h | ConvertTo-Json -Depth 5 > pagina2.json', '$a = (Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks/5" -Method Delete -Headers $h -UseBasicParsing).StatusCode', 'try { Invoke-WebRequest "$env:TASKFLOW_URL/v1/tasks/5" -Method Delete -Headers $h -UseBasicParsing } catch { $b = $_.Exception.Response.StatusCode.value__ }', '"$a $b" > idempotenza.txt'],
    },
    summary: ['limit/offset/total', '422 validazione vs 400 JSON non valido', 'DELETE idempotente nello stato, non nella risposta'],
    skills: ['http', 'testing', 'output'],
    concepts: ['paginazione', 'validazione 422', '400 vs 422', 'idempotenza'],
  },
  {
    id: 'M4.L7',
    module: 4,
    n: 7,
    title: 'Timeout e rate limit',
    objective: 'Riconoscere e documentare un rate limit (429, Retry-After) e un timeout del client.',
    explain: [
      "Un servizio protegge se stesso limitando le richieste: superata la soglia risponde 429 Too Many Requests, di solito con `Retry-After` (secondi da attendere). Il client corretto aspetta e riprova, non insiste.",
      'Un timeout è diverso da un errore HTTP: il client rinuncia perché la risposta non arriva in tempo. Con curl `--max-time 3` termina con codice 28; in PowerShell `-TimeoutSec`.',
      "Nel laboratorio `/v1/search` ammette 5 richieste al minuto simulato; `/v1/slow` risponde dopo 10 secondi.",
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Un timeout', cmd: { bash: 'curl -s --max-time 3 $TASKFLOW_URL/v1/slow; echo "exit=$?"', pwsh: 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/slow" -TimeoutSec 3 } catch { $_.Exception.Message }' }, what: 'Chiede /v1/slow ma rinuncia dopo 3 secondi.', who: 'Il client.', parts: ['--max-time 3 / -TimeoutSec 3'], expect: 'exit=28 / "The operation has timed out."', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Dopo quante richieste a /v1/search ricevi 429 e quale header ti dice quando riprovare?',
        cmd: { bash: `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " ${AUTH_H} "$TASKFLOW_URL/v1/search?q=api"; done`, pwsh: '1..6 | ForEach-Object { try { irm "$env:TASKFLOW_URL/v1/search?q=api" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | Out-Null; "200" } catch { "429" } }' },
        expect: '200 200 200 200 200 429: la sesta supera il limite; l\'header Retry-After indica i secondi di attesa.',
        why: 'Il limite è 5 richieste al minuto.',
      },
    ],
    negative: {
      prompt: 'Un 429 è un errore di sintassi o di esecuzione? Né l\'uno né l\'altro: è la risposta valida di un server che si protegge. Leggi gli header.',
      cmd: { bash: `curl -si ${AUTH_H} "$TASKFLOW_URL/v1/search?q=api" | head -12`, pwsh: 'try { irm "$env:TASKFLOW_URL/v1/search?q=api" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.Exception.Response.Headers["Retry-After"] }' },
      explain: 'Retry-After: i secondi da attendere. Il client dovrebbe aspettare quel tempo (con un limite massimo di tentativi).',
    },
    task: {
      text: 'In ~/corso-cli/m4l7: (1) superare il rate limit di /v1/search fino a ottenere 429; (2) salva in `attesa.txt` il valore (solo il numero) dell\'header Retry-After di una risposta 429; (3) fai scattare un timeout su /v1/slow e salva in `timeout.txt` il suo esito (Bash: il codice di uscita; PowerShell: il messaggio dell\'eccezione).',
      criterion: 'Il server registra un 429 su /v1/search; attesa.txt coincide con il Retry-After di un 429 reale; timeout.txt contiene 28 (Bash) o un messaggio con "timed out" (PowerShell).',
    },
    checks: [
      {
        id: '429',
        description: 'Il server ha risposto 429 su /v1/search',
        expected: '429',
        test: (c) => ({ pass: c.apiShell.some((e) => e.path.startsWith('/v1/search') && e.status === 429), actual: c.apiShell.filter((e) => e.path.startsWith('/v1/search')).map((e) => e.status).join(',') || 'nessuna richiesta a /search' }),
        onFail: 'Invia più di 5 richieste a /v1/search entro un minuto (un ciclo for / 1..6 | ForEach-Object).',
      },
      {
        id: 'attesa',
        description: 'attesa.txt coincide con un Retry-After reale',
        expected: 'numero di secondi del 429',
        test: (c) => {
          const v = (c.read('attesa.txt') ?? '').trim();
          const vals = c.apiShell.filter((e) => e.status === 429).map((e) => String((jsonOf(e.resBody ?? '') as { retryAfter?: number } | undefined)?.retryAfter));
          return { pass: /^\d+$/.test(v) && vals.includes(v), actual: v || '(vuoto)' };
        },
        onFail: "Leggi l'header Retry-After di una risposta 429 (curl -i, oppure l'eccezione in PowerShell) e salva solo il numero.",
      },
      {
        id: 'timeout',
        description: 'timeout.txt registra il timeout',
        expected: 'Bash: 28; PowerShell: messaggio con "timed out"',
        test: (c) => {
          const t = (c.read('timeout.txt') ?? '').trim();
          const ok = c.shell === 'bash' ? t === '28' : /timed out/i.test(t);
          const slow = c.api.some((e) => e.path === '/v1/slow' && e.status === 0);
          return { pass: ok && slow, actual: t || '(vuoto)' };
        },
        onFail: 'Chiama /v1/slow con un timeout inferiore a 10 secondi e registra l\'esito: in Bash echo $? subito dopo curl.',
      },
    ],
    example: { text: 'Esempio analogo: salvare il valore di un altro header.', cmd: { bash: "curl -sI $TASKFLOW_URL/v1/health | grep -i x-api-version | cut -d' ' -f2 | tr -d '\\r' > versione.txt", pwsh: '(iwr "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).Headers["X-API-Version"] > versione.txt' } },
    hints: ['La sesta richiesta riceve già il 429 (ne sono ammesse 5): leggi gli header di una risposta 429 (anche una settima) e salva il valore con grep/cut/tr (Bash) o dal catch (PowerShell).', 'Per il timeout: curl --max-time 3 e poi echo $? > timeout.txt; in PowerShell $_.Exception.Message nel catch.'],
    solutions: {
      bash: ['cd ~/corso-cli/m4l7', `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " ${AUTH_H} "$TASKFLOW_URL/v1/search?q=api"; done`, `curl -si ${AUTH_H} "$TASKFLOW_URL/v1/search?q=api" | grep -i retry-after | cut -d" " -f2 | tr -d "\\r" > attesa.txt`, 'curl -s --max-time 3 $TASKFLOW_URL/v1/slow; echo $? > timeout.txt'],
      pwsh: ['cd ~/corso-cli/m4l7', '$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }', '1..5 | ForEach-Object { Invoke-RestMethod "$env:TASKFLOW_URL/v1/search?q=api" -Headers $h | Out-Null }', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/search?q=api" -Headers $h } catch { $_.Exception.Response.Headers["Retry-After"] > attesa.txt }', 'try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/slow" -TimeoutSec 3 } catch { $_.Exception.Message > timeout.txt }'],
    },
    summary: ['429 + Retry-After', 'timeout ≠ errore HTTP', 'aspetta e riprova con un massimo di tentativi'],
    skills: ['http', 'testing', 'diagnosi'],
    concepts: ['rate limit 429', 'header Retry-After', 'timeout del client (curl 28)'],
  },
  {
    id: 'M4.L8',
    module: 4,
    n: 8,
    title: 'Dallo stesso test a PowerShell',
    objective: 'Trasferire una procedura di test da Bash a PowerShell 5.1: oggetti al posto del testo, errori HTTP come eccezioni, e la trappola dell\'alias curl.',
    explain: [
      "In Windows PowerShell 5.1 `curl` è un ALIAS di Invoke-WebRequest: `curl -s url` fallisce perché -s non è un parametro di Invoke-WebRequest. Il vero curl si chiama `curl.exe`.",
      'Invoke-RestMethod restituisce già oggetti (la risposta JSON è convertita): niente jq, si usa il punto. Per gli errori HTTP si usa try/catch; `$_.Exception.Response.StatusCode.value__` è lo status e `$_.ErrorDetails.Message` il corpo.',
      "Variabili d'ambiente: `$env:NOME`. Il token si passa con -Headers @{ Authorization = \"Bearer $token\" }. Un body stringa va accompagnato da -ContentType 'application/json'.",
    ],
    shells: ['pwsh'],
    setup: (c) => {
      setupApi(c, { token: false });
      c.file(
        'procedura.sh',
        `#!/bin/bash
# Stampa il nome dell'utente autenticato.
TOKEN=$(curl -s -X POST "$TASKFLOW_URL/v1/auth/token" -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" "$TASKFLOW_URL/v1/me" | jq -r .name
`,
        0o755,
      );
      c.state.shells.pwsh.cwd = '/home/learner';
    },
    guided: [
      { title: 'Il vero curl', cmd: { pwsh: 'curl.exe -s $env:TASKFLOW_URL/v1/health' }, what: 'Esegue l\'applicazione esterna curl.', who: 'PowerShell lancia curl.exe come programma esterno.', parts: ['.exe: evita l\'alias'], expect: '{"status":"ok",...}', risk: 'Nessuno.' },
      { title: 'Lo stesso con un cmdlet', cmd: { pwsh: 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/health"' }, what: 'Risposta già convertita in oggetto.', who: 'Il cmdlet.', parts: ['nessun jq'], expect: 'Tabella con status, version, env, time.', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Cosa succede con `curl -s $env:TASKFLOW_URL/v1/health` in Windows PowerShell 5.1?',
        cmd: { pwsh: 'curl -s $env:TASKFLOW_URL/v1/health' },
        expect: 'Errore di PARAMETRO: "A parameter cannot be found that matches parameter name \'s\'" — curl qui è Invoke-WebRequest.',
        why: 'In 5.1 curl è un alias, non il programma curl.',
      },
    ],
    negative: {
      prompt: 'Un body JSON come stringa, senza -ContentType: in PowerShell dove fallisce?',
      cmd: { pwsh: 'try { irm "$env:TASKFLOW_URL/v1/auth/token" -Method Post -Body \'{"client_id":"x"}\' } catch { $_.ErrorDetails.Message }' },
      explain: 'Il body viene inviato come form (non JSON): il server non trova i campi e risponde 422 (campi obbligatori mancanti) invece di leggere il JSON.',
    },
    task: {
      text: 'Nella cartella ~/corso-cli/m4l8 trovi `procedura.sh` (Bash). Traducila in `procedura.ps1`: deve ottenere il token dalle variabili d\'ambiente (senza segreti scritti), chiamare GET /v1/me e stampare solo il nome (`bob`). Poi eseguila con ./procedura.ps1.',
      criterion: 'procedura.ps1 stampa bob, usa Invoke-RestMethod o curl.exe (non l\'alias curl) e non contiene segreti.',
    },
    checks: [
      {
        id: 'esegue',
        description: './procedura.ps1 stampa bob',
        expected: 'bob',
        test: (c) => {
          if (c.read('procedura.ps1') === null) return { pass: false, actual: 'procedura.ps1 non trovato' };
          const r = c.sandbox('./procedura.ps1');
          return { pass: r.out.trim() === 'bob' && r.code === 0, actual: (r.out.trim() || r.err.trim().split('\n')[0] || '(nessun output)').slice(0, 80) };
        },
        onFail: 'Script: 1) $body = @{client_id=...; client_secret=...} | ConvertTo-Json; 2) Invoke-RestMethod ... -Method Post -ContentType "application/json" -Body $body; 3) Invoke-RestMethod su /v1/me con -Headers; 4) stampa .name.',
        errorTag: 'alias-curl-powershell',
      },
      {
        id: 'no-alias',
        description: 'Non usa l\'alias curl (usa Invoke-RestMethod o curl.exe)',
        expected: 'Invoke-RestMethod / Invoke-WebRequest / curl.exe',
        test: (c) => {
          const t = c.read('procedura.ps1') ?? '';
          const ok = /Invoke-(RestMethod|WebRequest)|\birm\b|\biwr\b|curl\.exe/i.test(t) && !/(^|\s)curl\s+-/m.test(t);
          return { pass: ok, actual: ok ? 'ok' : 'nessun cmdlet HTTP o alias curl con opzioni' };
        },
        onFail: 'In PowerShell 5.1 usa Invoke-RestMethod (oppure curl.exe, mai curl con le opzioni di curl).',
        errorTag: 'alias-curl-powershell',
      },
      {
        id: 'segreti',
        description: 'Nessun segreto nello script',
        expected: 'variabili $env:',
        test: (c) => {
          const t = c.read('procedura.ps1') ?? '';
          const leak = ['dev-secret-42', 'test-secret-77', 'stg-secret-91'].some((s) => t.includes(s));
          return { pass: !leak && /\$env:TASKFLOW_CLIENT_SECRET/.test(t), actual: leak ? 'segreto in chiaro' : /\$env:TASKFLOW_CLIENT_SECRET/.test(t) ? 'ok' : 'non usa $env:TASKFLOW_CLIENT_SECRET' };
        },
        onFail: 'Leggi il segreto da $env:TASKFLOW_CLIENT_SECRET.',
        errorTag: 'segreti-nei-comandi',
      },
    ],
    example: { text: 'Esempio analogo: una piccola procedura PowerShell che stampa lo stato del servizio.', cmd: { pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/health").status' } },
    hints: ['Parti da procedura.sh: due richieste (token, poi /me). Ogni riga ha un equivalente: jq .campo diventa .campo sull\'oggetto.', 'Per scrivere il file usa un here-string: Set-Content procedura.ps1 -Value @\'... \'@ (oppure l\'editor della scheda File).'],
    solutions: {
      pwsh: [
        'cd ~/corso-cli/m4l8',
        'Set-Content procedura.ps1 -Value @\'\n$body = @{ client_id = $env:TASKFLOW_CLIENT_ID; client_secret = $env:TASKFLOW_CLIENT_SECRET } | ConvertTo-Json\n$r = Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -ContentType "application/json" -Body $body\n(Invoke-RestMethod "$env:TASKFLOW_URL/v1/me" -Headers @{ Authorization = "Bearer $($r.access_token)" }).name\n\'@',
        './procedura.ps1',
      ],
    },
    summary: ['curl è un alias in 5.1; curl.exe è il vero curl', 'Invoke-RestMethod restituisce oggetti', 'errori HTTP = eccezioni', 'Content-Type va indicato'],
    skills: ['http', 'comandi', 'autonomia'],
    concepts: ['trasferire una procedura da Bash a PowerShell', 'alias curl vs curl.exe', 'Invoke-RestMethod', 'gestione degli errori HTTP in PowerShell'],
  },
];
