/** M6 — lezione aggiunta il 2026-10-27: verificare a mano le affermazioni di una guida (quelle che il controllo automatico non vede). */
import type { Lesson } from '../types.ts';
import { parseTables } from '../../docs/lint.ts';
import { cmdMatches, setupApi } from './helpers.ts';

const BOZZA = `# Guida rapida a TaskFlow (bozza)

## Per cominciare

- Base URL: http://localhost:8000/v1
- Autenticazione: ogni richiesta porta l'header \`X-API-Key: <chiave>\`.

## Elenco dei task

\`GET /v1/tasks\` restituisce i task a gruppi: si sceglie la pagina con \`page\` e la dimensione con \`per_page\` (per esempio \`?page=2&per_page=10\`).

## Creare un task

\`POST /v1/tasks\` con un body JSON. Campi obbligatori: \`title\` e \`description\`. Il campo \`priority\` è un intero da 1 a 10. Risposta: 200 OK con il task creato.

## Eliminare un task

\`DELETE /v1/tasks/{id}\`. Risposta: 200 OK con il task eliminato.
`;

const GUIDA_CORRETTA = `# Guida rapida a TaskFlow

## Per cominciare

- Base URL: http://localhost:8080/v1
- Autenticazione: ogni richiesta porta l'header \`Authorization: Bearer <token>\`.

## Elenco dei task

\`GET /v1/tasks\` restituisce i task a gruppi: la dimensione si sceglie con \`limit\` e la posizione di partenza con \`offset\` (per esempio \`?limit=10&offset=10\`).

## Creare un task

\`POST /v1/tasks\` con un body JSON. Unico campo obbligatorio: \`title\` (da 3 a 80 caratteri); \`description\` è facoltativa. Il campo \`priority\` è un intero da 1 a 5. Risposta: 201 Created con il task creato.

## Eliminare un task

\`DELETE /v1/tasks/{id}\`. Risposta: 204 No Content, senza body.
`;

const VERIFICHE_MD = `# Verifiche della guida

| Affermazione della bozza | Come l'ho verificata | Esito | Correzione |
|---|---|---|---|
| Base URL con porta 8000 | curl su localhost:8000 | connessione rifiutata (codice 7) | porta 8080 |
| Header X-API-Key | richiesta con X-API-Key | 401 invalid_authorization_scheme | Authorization: Bearer |
| Paginazione con page e per_page | richiesta con limit e offset | limit e offset funzionano | limit e offset |
| Campi obbligatori title e description | POST con solo title | 201, la description non serve | solo title obbligatorio |
| priority da 1 a 10 | POST con priority 6 | 422, il massimo è 5 | da 1 a 5 |
| Creazione con 200 OK | POST valida | 201 Created | 201 |
| Eliminazione con 200 OK | DELETE su un task esistente | 204 senza body | 204 |
`;

export const m6b: Lesson[] = [
  {
    id: 'M6.L4',
    module: 6,
    n: 4,
    title: 'Verificare una guida a mano: ciò che il controllo automatico non vede',
    objective: 'Controllare una per una le affermazioni di una guida (porta, autenticazione, paginazione, campi, status) provandole sul servizio e documentare le prove.',
    explain: [
      'Il controllo automatico dei documenti (M6.L3) verifica endpoint, campi e status negli esempi di codice. Non vede le affermazioni scritte in prosa: il nome di un parametro, la porta del servizio, lo schema di autenticazione, un intervallo di valori. Sono proprio gli errori che mandano fuori strada i lettori.',
      'Il metodo: elenca ogni affermazione verificabile della guida, per ognuna decidi la PROVA (una richiesta, la specifica, un messaggio d\'errore), eseguila, annota l\'esito e correggi il testo. Una correzione senza prova è un\'altra opinione. La fonte più rapida è la specifica (`/v1/openapi.json`), ma va confermata con una richiesta reale quando l\'affermazione riguarda il comportamento.',
      'Consegni due file: la guida corretta e una tabella delle verifiche (affermazione, prova, esito, correzione). La seconda è ciò che un revisore usa per fidarsi della prima.',
    ],
    shells: ['bash', 'pwsh'],
    artifacts: ['~/docs/m6l4-guida-bozza.md'],
    setup: (c) => {
      setupApi(c, { token: 'valid' });
      c.vfs.mkdir('/home/learner/docs', true);
      c.vfs.seed('/home/learner/docs/m6l4-guida-bozza.md', BOZZA);
    },
    guided: [
      { title: 'Leggere la bozza', cmd: { bash: 'cat ~/docs/m6l4-guida-bozza.md', pwsh: 'Get-Content ~/docs/m6l4-guida-bozza.md' }, what: 'Mostra la guida da verificare.', who: 'cat / Get-Content.', parts: ['cerca ogni affermazione che si può provare'], expect: 'Sette affermazioni verificabili: porta, header, paginazione, campi obbligatori, intervallo di priority, due status.', risk: 'Nessuno.', contains: 'Base URL' },
      { title: 'La porta dichiarata', cmd: { bash: 'curl -sS -m 3 http://localhost:8000/v1/health; echo "codice $?"', pwsh: 'curl.exe -sS -m 3 http://localhost:8000/v1/health; "codice $LASTEXITCODE"' }, what: 'Prova la prima affermazione: il servizio risponde sulla porta 8000?', who: 'Il client non si connette.', parts: [], expect: 'Connessione rifiutata, codice 7: la porta è sbagliata.', risk: 'Nessuno.', contains: 'codice 7' },
      { title: 'Lo schema di autenticazione', cmd: { bash: 'curl -s -H "X-API-Key: abc" $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -H "X-API-Key: abc" "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Prova l\'header che la guida dichiara.', who: 'Il server lo ignora e chiede un token.', parts: [], expect: 'Un errore 401: l\'header giusto è Authorization: Bearer.', risk: 'Nessuno.', contains: 'error' },
      { title: 'La specifica come fonte', cmd: { bash: "curl -s $TASKFLOW_URL/v1/openapi.json | jq -r '.paths[\"/tasks\"].get.parameters[].name'", pwsh: '(Invoke-RestMethod "$env:TASKFLOW_URL/v1/openapi.json").paths."/tasks".get.parameters | ForEach-Object { $_.name }' }, what: 'Elenca i parametri della lista nella specifica.', who: 'jq / PowerShell.', parts: [], expect: 'status, q, limit, offset: non esistono page e per_page.', risk: 'Nessuno.', contains: 'offset' },
      { title: 'Provare il comportamento', cmd: { bash: 'curl -s -i -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Prova guida"}\' $TASKFLOW_URL/v1/tasks | head -1', pwsh: 'curl.exe -s -i -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{\\"title\\":\\"Prova guida\\"}\' "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Crea un task con il solo titolo.', who: 'Il server accetta.', parts: [], expect: '201 Created: description non è obbligatoria e lo status non è 200.', risk: 'Crea un task di prova.', contains: '201' },
    ],
    predict: [
      {
        prompt: 'Cosa risponde il server a una richiesta DELETE su un task esistente: 200 con il task, o altro?',
        cmd: { bash: 'curl -s -i -X DELETE -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks/5 | head -1', pwsh: 'curl.exe -s -i -X DELETE -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks/5"' },
        expect: '204 No Content, senza body: non c\'è nessun task da restituire.',
        why: 'Una guida che promette un body che non arriva fa scrivere codice client che si rompe: la prova evita la figuraccia.',
      },
    ],
    negative: {
      prompt: 'Una priorità fuori intervallo:',
      cmd: { bash: 'curl -s -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Prova","priority":6}\' $TASKFLOW_URL/v1/tasks', pwsh: 'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{\\"title\\":\\"Prova\\",\\"priority\\":6}\' "$env:TASKFLOW_URL/v1/tasks"' },
      explain: '422: il massimo è 5, non 10. La bozza prometteva un intervallo più largo: la prova più economica è un valore appena oltre il limite dichiarato.',
    },
    task: {
      text: 'La bozza ~/docs/m6l4-guida-bozza.md contiene sette affermazioni sbagliate. Verificale una per una sul servizio (prova la porta, l\'header, i parametri di paginazione, un POST con il solo title, un valore di priority oltre il limite, lo status della creazione e quello della cancellazione). Scrivi la guida corretta in ~/docs/m6l4-guida.md e una tabella delle verifiche in ~/docs/m6l4-verifiche.md con le colonne Affermazione | Prova | Esito | Correzione e una riga per ogni errore.',
      criterion: 'La guida corretta contiene i fatti giusti (porta 8080, Bearer, limit e offset, solo title obbligatorio, priority 1-5, 201, 204) e nessun errore della bozza; le verifiche hanno 7 righe e le prove sono state davvero eseguite.',
    },
    checks: [
      {
        id: 'guida',
        description: 'La guida corretta contiene i sette fatti giusti',
        expected: '8080, Bearer, limit e offset, title unico obbligatorio, priority 1-5, 201, 204',
        test: (c) => {
          const md = c.read('~/docs/m6l4-guida.md') ?? '';
          const ok = {
            porta: /localhost:8080/.test(md),
            auth: /Authorization:\s*Bearer/i.test(md),
            paginazione: /\blimit\b/.test(md) && /\boffset\b/.test(md),
            campi: /(unico campo obbligatorio|solo\s+`?title`?|description`?\s+(è|e')\s+(facoltativ|opzional))/i.test(md),
            priority: /(1\s*(a|-|–)\s*5)/.test(md),
            creazione: /201/.test(md),
            eliminazione: /204/.test(md),
          };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Per ogni affermazione sbagliata scrivi il valore verificato: porta, schema di autenticazione, parametri di paginazione, campi obbligatori, intervallo di priority, status di creazione e cancellazione.',
      },
      {
        id: 'errori',
        description: 'Nessun errore della bozza è rimasto nella guida',
        expected: 'niente 8000, X-API-Key, per_page, priority 1-10, 200 OK',
        test: (c) => {
          const md = c.read('~/docs/m6l4-guida.md') ?? '';
          const left = [
            [/8000/, 'porta 8000'],
            [/X-API-Key/i, 'X-API-Key'],
            [/per_page|`page`/, 'page/per_page'],
            [/1\s*a\s*10/, 'priority 1 a 10'],
            [/200 OK/, '200 OK'],
            [/title`?\s+e\s+`?description/i, 'title e description obbligatori'],
          ].filter(([re]) => (re as RegExp).test(md)).map(([, n]) => n as string);
          return { pass: md.length > 0 && left.length === 0, actual: md ? (left.length ? 'ancora presenti: ' + left.join(', ') : 'ok') : 'guida mancante' };
        },
        onFail: 'Rileggi la guida: ci sono ancora affermazioni della bozza che non hai verificato o sostituito.',
        errorTag: 'previsioni-incoerenti',
      },
      {
        id: 'prove',
        description: 'Hai provato davvero i comportamenti sul servizio',
        expected: 'porta 8000 rifiutata, 401 con X-API-Key, POST 201, 422 sulla priority, DELETE 204',
        test: (c) => {
          const porta = cmdMatches(c, /:8000\b/, false);
          const header = cmdMatches(c, /X-API-Key/i, false);
          const created = c.apiShell.some((e) => e.method === 'POST' && e.status === 201);
          const prio = c.apiShell.some((e) => e.method === 'POST' && e.status === 422 && /priority/.test(e.resBody ?? ''));
          const del = c.apiShell.some((e) => e.method === 'DELETE' && e.status === 204);
          const ok = { porta, header, created, prio, del };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Ogni correzione deve poggiare su una prova: esegui davvero le richieste, non correggere a memoria.',
      },
      {
        id: 'tabella',
        description: 'Tabella delle verifiche con almeno 7 righe',
        expected: '| Affermazione | Prova | Esito | Correzione |',
        test: (c) => {
          const t = parseTables(c.read('~/docs/m6l4-verifiche.md') ?? '').find((x) => x.header.some((h) => /affermazione/i.test(h)) && x.header.some((h) => /prova|verific/i.test(h)) && x.header.some((h) => /correzione/i.test(h)));
          return { pass: !!t && t.rows.length >= 7 && t.rows.every((r) => r.every((cell) => cell.trim().length > 0)), actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Una riga per errore, con tutte le colonne compilate: Affermazione | Prova | Esito | Correzione.',
        kind: 'verifiable',
      },
    ],
    example: { text: 'Esempio analogo: verificare l\'affermazione «GET /v1/health richiede il token».', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" $TASKFLOW_URL/v1/health', pwsh: 'curl.exe -s -o NUL -w "%{http_code}" "$env:TASKFLOW_URL/v1/health"' } },
    hints: ['La specifica (`/v1/openapi.json`) elenca parametri, campi obbligatori e status: poi conferma con una richiesta.', 'Per la priority prova 6: il messaggio d\'errore dice il massimo.', 'Per la porta basta una richiesta con timeout (-m 3) a localhost:8000.'],
    solutions: {
      bash: [
        'curl -sS -m 3 http://localhost:8000/v1/health',
        'curl -s -H "X-API-Key: abc" $TASKFLOW_URL/v1/tasks',
        'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks?limit=2&offset=2"',
        'curl -s -i -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Solo titolo"}\' $TASKFLOW_URL/v1/tasks',
        'curl -s -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Priorita","priority":6}\' $TASKFLOW_URL/v1/tasks',
        'curl -s -i -X DELETE -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks/5',
        `cat > ~/docs/m6l4-guida.md <<'EOF'\n${GUIDA_CORRETTA}EOF`,
        `cat > ~/docs/m6l4-verifiche.md <<'EOF'\n${VERIFICHE_MD}EOF`,
      ],
      pwsh: [
        'curl.exe -sS -m 3 http://localhost:8000/v1/health',
        'curl.exe -s -H "X-API-Key: abc" "$env:TASKFLOW_URL/v1/tasks"',
        'curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks?limit=2&offset=2"',
        'curl.exe -s -i -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{\\"title\\":\\"Solo titolo\\"}\' "$env:TASKFLOW_URL/v1/tasks"',
        'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{\\"title\\":\\"Priorita\\",\\"priority\\":6}\' "$env:TASKFLOW_URL/v1/tasks"',
        'curl.exe -s -i -X DELETE -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks/5"',
        `Set-Content ~/docs/m6l4-guida.md -Value @'\n${GUIDA_CORRETTA}'@`,
        `Set-Content ~/docs/m6l4-verifiche.md -Value @'\n${VERIFICHE_MD}'@`,
      ],
    },
    summary: ['le affermazioni in prosa vanno verificate una per una', 'ogni correzione ha una prova', 'la tabella delle verifiche è la garanzia per il revisore'],
    skills: ['docs', 'testing', 'http'],
    concepts: ['verifica manuale della documentazione', 'prova per ogni affermazione', 'tabella delle verifiche'],
  },
];
