/** M4 — lezioni aggiunte il 2026-10-27: jq a più livelli e validazione (la parte di validazione era dentro «Validazione, paginazione e idempotenza»). */
import type { Lesson } from '../types.ts';
import type { ApiLogEntry } from '../../engine/types.ts';
import { parseTables } from '../../docs/lint.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

const AUTH = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const JSON_H = '-H "Content-Type: application/json"';
const PS_H = '-H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json"';
const PS_HEAD = '@{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }';

const SINTESI_MD = `# Come leggo la risposta dell'elenco con jq e con PowerShell

- Il punto di partenza è l'oggetto con data (l'elenco), total, limit e offset.
- jq: .data[] scorre gli elementi; select(.status == "open") ne tiene solo alcuni; sort_by(.priority) li ordina; group_by(.status) li raggruppa; .titolo estrae un campo.
- PowerShell: Invoke-RestMethod restituisce già oggetti; Where-Object filtra, Sort-Object ordina, Group-Object raggruppa, ForEach-Object estrae un campo.
- Ogni passo della pipeline riceve il risultato del precedente: si costruisce un pezzo alla volta e si controlla l'output a ogni passo.
`;

const CASI_MD = `# Casi di validazione di POST /v1/tasks

| Input | Atteso | Effettivo |
|---|---|---|
| JSON malformato | 400 invalid_json | 400 |
| Content-Type text/plain | 415 | 415 |
| body vuoto {} | 422, title obbligatorio | 422 |
| title di 2 lettere | 422, title troppo corto | 422 |
| priority 9 | 422, priority oltre il massimo | 422 |
| status closed | 422, valore non ammesso | 422 |
| projectId 99 | 422, progetto inesistente | 422 |
| title di 3 lettere e priority 5 | 201, valori al limite accettati | 201 |
| priority 0 | 422, sotto il minimo | 422 |

## Come leggere gli errori

400 significa che il body non è nemmeno JSON; 415 che il Content-Type è sbagliato; 422 che il JSON è valido ma i dati no, e il campo errors dice quali campi e perché.
`;

const hit = (c: { apiShell: ApiLogEntry[] }, method: string, status: number, test: (e: ApiLogEntry) => boolean = () => true): boolean =>
  c.apiShell.some((e) => e.method === method && e.status === status && test(e));
const errorFields = (e: ApiLogEntry): string[] => {
  try {
    return ((JSON.parse(e.resBody ?? '{}') as { errors?: { field: string }[] }).errors ?? []).map((x) => x.field);
  } catch {
    return [];
  }
};

export const m4b: Lesson[] = [
  {
    id: 'M4.L2',
    module: 4,
    n: 2,
    title: 'jq a più livelli: filtrare, ordinare, raggruppare',
    objective: 'Estrarre, filtrare, ordinare e contare i dati di una risposta JSON con una pipeline di filtri (jq in Bash, oggetti in PowerShell).',
    explain: [
      'Una risposta JSON è un albero di oggetti e array. Con `jq` si costruisce una PIPELINE di filtri: `.data` entra nell\'elenco, `.[]` ne scorre gli elementi, `select(.status == "open")` tiene solo quelli che soddisfano una condizione, `.title` estrae un campo. Ogni filtro riceve il risultato del precedente: si scrive un pezzo alla volta controllando l\'output.',
      'Altri filtri utili: `length` conta, `sort_by(.priority)` ordina per un campo, `group_by(.status)` raggruppa, `-r` stampa le stringhe senza virgolette, `"\\(.id) \\(.title)"` compone una riga di testo con i valori (interpolazione). I filtri sono tra apici singoli: per jq le virgolette doppie sono testo.',
      'In PowerShell non serve jq: `Invoke-RestMethod` restituisce già oggetti. Gli stessi passi: `.data` (proprietà), `Where-Object status -eq open` (select), `Sort-Object priority` (sort_by), `Group-Object status` (group_by), `ForEach-Object { $_.title }` (estrai un campo), `.Count` (length).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Quanti task', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq '.data | length'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data.Count` }, what: 'Conta gli elementi dell\'elenco.', who: 'jq: .data entra nell\'elenco, length lo conta. PowerShell: .Count.', parts: ['.data: il campo con l\'elenco', 'length: quanti elementi'], expect: '5', risk: 'Nessuno.', contains: '5' },
      { title: 'Un campo per ogni elemento', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -r '.data[].title'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | ForEach-Object { $_.title }` }, what: 'Stampa il titolo di ogni task, uno per riga.', who: 'jq: .[] scorre gli elementi, -r toglie le virgolette. PowerShell: ForEach-Object.', parts: ['.[]: tutti gli elementi', '-r: stringhe senza virgolette'], expect: 'I cinque titoli.', risk: 'Nessuno.', contains: 'Rivedere le API' },
      { title: 'Filtrare', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -r '.data[] | select(.status == "open") | .title'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Where-Object status -eq open | ForEach-Object { $_.title }` }, what: 'Tiene solo i task aperti.', who: 'jq: select(condizione). PowerShell: Where-Object.', parts: ['|: ogni filtro lavora sul risultato del precedente', 'select(...): tiene gli elementi per cui la condizione è vera'], expect: 'Tre titoli: Rivedere le API, Correggere il bug di login, Preparare le release notes.', risk: 'Nessuno.', contains: 'Correggere il bug di login' },
      { title: 'Ordinare e comporre una riga', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -r '.data | sort_by(.priority)[] | "\\(.priority) \\(.title)"'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Sort-Object priority | ForEach-Object { "$($_.priority) $($_.title)" }` }, what: 'Ordina per priorità (1 = più alta) e stampa «priorità titolo».', who: 'jq: sort_by e interpolazione \\( ). PowerShell: Sort-Object e stringa con $( ).', parts: ['sort_by(.priority): ordina per quel campo', '"\\(.priority) …": inserisce il valore nel testo'], expect: 'Si parte da «1 Correggere il bug di login».', risk: 'Nessuno.', contains: '1 Correggere il bug di login' },
      { title: 'Raggruppare e contare', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -c '.data | group_by(.status) | map({stato: .[0].status, n: length})'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Group-Object status | ForEach-Object { "$($_.Name) $($_.Count)" }` }, what: 'Conta i task per stato.', who: 'jq: group_by crea un array di gruppi, map li riassume. PowerShell: Group-Object.', parts: ['group_by(.status): un gruppo per valore', 'map(...): trasforma ogni gruppo'], expect: 'done 1, in_progress 1, open 3.', risk: 'Nessuno.', contains: 'open' },
    ],
    predict: [
      {
        prompt: 'Quali id restituisce il filtro: .data[] | select(.priority < 3) | .id ?',
        cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq '.data[] | select(.priority < 3) | .id'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Where-Object { $_.priority -lt 3 } | ForEach-Object { $_.id }` },
        expect: '1, 3 e 4: sono i task con priorità 2, 2 e 1 (1 è la più alta).',
        why: '«Priorità minore di 3» significa più urgente: il confronto è numerico, non alfabetico.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se dimentichi di scorrere l\'elenco: .data.title ?',
      cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq '.data.title'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data.title` },
      explain: 'Bash: jq segnala «Cannot index array with "title"»: .data è un array, serve .data[].title. PowerShell: l\'enumerazione automatica restituisce comunque i titoli. È una differenza vera tra i due strumenti.',
    },
    task: {
      text: 'In ~/corso-cli/m4l2 ricava dall\'elenco dei task due file: `aperti.txt` con i titoli dei task APERTI ordinati per priorità (dalla più alta), uno per riga; `per-stato.txt` con una riga «stato numero» per ogni stato, in ordine alfabetico dello stato. Poi scrivi sintesi.md: spiega, passo per passo, i filtri che hai usato.',
      criterion: 'aperti.txt ha i tre titoli nell\'ordine Correggere il bug di login, Rivedere le API, Preparare le release notes; per-stato.txt ha done 1, in_progress 1, open 3; sintesi.md nomina i filtri usati; il token non è scritto nei comandi.',
    },
    checks: [
      {
        id: 'aperti',
        description: 'aperti.txt: titoli dei task aperti per priorità',
        expected: 'Correggere il bug di login / Rivedere le API / Preparare le release notes',
        test: (c) => {
          const l = (c.read('aperti.txt') ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
          const want = ['Correggere il bug di login', 'Rivedere le API', 'Preparare le release notes'];
          return { pass: l.length === 3 && l.every((x, i) => x === want[i]), actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Filtra gli aperti (select / Where-Object), ordina per priority (la più alta è 1) ed estrai solo il titolo: niente virgolette, niente altri campi.',
      },
      {
        id: 'per-stato',
        description: 'per-stato.txt: stato e numero, ordinati',
        expected: 'done 1 / in_progress 1 / open 3',
        test: (c) => {
          const l = (c.read('per-stato.txt') ?? '').split('\n').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
          return { pass: l.join('|') === 'done 1|in_progress 1|open 3', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Raggruppa per status (group_by / Group-Object) e stampa «stato numero». group_by e Group-Object ordinano già per nome.',
      },
      {
        id: 'strumenti',
        description: 'Hai usato un filtro (select / Where-Object) e un raggruppamento',
        expected: pick({ shell: 'bash' } as never, 'jq con select e group_by', 'Where-Object e Group-Object') as string,
        test: (c) => {
          const sel = cmdMatches(c, pick(c, /jq\b.*select\(/, /Where-Object/i), false);
          const grp = cmdMatches(c, pick(c, /jq\b.*group_by\(/, /Group-Object/i), false);
          return { pass: sel && grp, actual: `filtro:${sel} raggruppamento:${grp}` };
        },
        onFail: 'Costruisci la pipeline con i filtri visti nella lezione, invece di scrivere i file a mano.',
      },
      {
        id: 'segreti',
        description: 'Il token non è scritto nei comandi',
        expected: 'solo $TASKFLOW_TOKEN',
        test: (c) => ({ pass: !c.cmds.some((x) => /tf_dev_/.test(x.cmd)), actual: c.cmds.some((x) => /tf_dev_/.test(x.cmd)) ? 'token in chiaro' : 'ok' }),
        onFail: 'Usa la variabile d\'ambiente per il token.',
        errorTag: 'segreti-nei-comandi',
      },
      {
        id: 'sintesi',
        description: 'sintesi.md: i filtri spiegati',
        expected: pick({ shell: 'bash' } as never, 'select, sort_by, group_by', 'Where-Object, Sort-Object, Group-Object') as string,
        test: (c) => {
          const md = c.read('sintesi.md') ?? '';
          const ok = c.shell === 'bash' ? { select: /select/.test(md), ordina: /sort_by/.test(md), gruppo: /group_by/.test(md) } : { select: /Where-Object/i.test(md), ordina: /Sort-Object/i.test(md), gruppo: /Group-Object/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Spiega con parole tue cosa fa ogni filtro della pipeline.',
      },
    ],
    example: { text: 'Esempio analogo: gli id dei task in corso.', cmd: { bash: `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq '.data[] | select(.status == "in_progress") | .id'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Where-Object status -eq in_progress | ForEach-Object { $_.id }` } },
    hints: ['Costruisci la pipeline un passo alla volta: prima `.data[]`, poi aggiungi `| select(...)`, poi `| sort_by(...)`.', 'Per «stato numero» in jq: `group_by(.status)[] | "\\(.[0].status) \\(length)"` con l\'opzione -r.', 'Per salvare il risultato in un file usa `> aperti.txt`.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m4l2',
        `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -r '.data | map(select(.status == "open")) | sort_by(.priority)[] | .title' > aperti.txt`,
        `curl -s ${AUTH} $TASKFLOW_URL/v1/tasks | jq -r '.data | group_by(.status)[] | "\\(.[0].status) \\(length)"' > per-stato.txt`,
        `cat > sintesi.md <<'EOF'\n${SINTESI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m4l2',
        `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Where-Object status -eq open | Sort-Object priority | ForEach-Object { $_.title } > aperti.txt`,
        `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Headers ${PS_HEAD}).data | Group-Object status | ForEach-Object { "$($_.Name) $($_.Count)" } > per-stato.txt`,
        `Set-Content sintesi.md -Value @'\n${SINTESI_MD}'@`,
      ],
    },
    summary: ['pipeline di filtri: ogni passo lavora sul precedente', 'select, sort_by, group_by, length, -r', 'in PowerShell gli stessi passi con oggetti', 'si costruisce un filtro alla volta'],
    skills: ['comandi', 'output', 'http'],
    concepts: ['jq select e sort_by', 'group_by', 'interpolazione di stringhe', 'Where-Object, Sort-Object, Group-Object'],
  },
  {
    id: 'M4.L5',
    module: 4,
    n: 5,
    title: 'Validazione: 400, 415 e 422 e il motivo dell\'errore',
    objective: 'Distinguere gli errori di formato (400, 415) da quelli di validazione (422), leggere l\'elenco errors e provare i valori ai limiti.',
    explain: [
      'Una richiesta può essere rifiutata per tre motivi diversi. 400 `invalid_json`: il body non è nemmeno JSON valido. 415: il Content-Type non è `application/json`. 422 `validation_failed`: il JSON è valido ma i dati non rispettano le regole; la risposta contiene `errors`, un elenco di coppie campo/motivo.',
      'Un buon test negativo non verifica solo «ottengo un errore»: verifica che sia QUELL\'errore (status giusto, campo giusto, motivo giusto). Si provano anche i VALORI AI LIMITI: il minimo accettato (title di 3 lettere, priority 5) deve passare, appena sotto o sopra (2 lettere, priority 0 o 9) deve fallire.',
      'Per leggere gli errori: Bash `jq -r \'.errors[] | "\\(.field): \\(.message)"\'`. In PowerShell 5.1 il corpo dell\'errore non è nell\'oggetto restituito: con `curl.exe -s` lo si vede direttamente, con Invoke-RestMethod serve `try { … } catch { $_.ErrorDetails.Message }`. Con curl.exe ricorda il backslash per le virgolette del JSON (`-d \'{\\"title\\":\\"ab\\"}\'`).',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Titolo mancante', cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{}' $TASKFLOW_URL/v1/tasks | jq -r '.errors[] | "\\(.field): \\(.message)"'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{}' "$env:TASKFLOW_URL/v1/tasks"` }, what: 'Invia un body vuoto a POST /v1/tasks.', who: 'Il server controlla i campi obbligatori.', parts: ['.errors[]: elenco campo/motivo'], expect: 'title: campo obbligatorio.', risk: 'Nessuno: nulla viene creato.', contains: 'obbligatorio' },
      { title: 'Più errori insieme', cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"ab","priority":9}' $TASKFLOW_URL/v1/tasks | jq -c '.errors | map(.field)'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"ab\\",\\"priority\\":9}' "$env:TASKFLOW_URL/v1/tasks"` }, what: 'Due campi non validi nella stessa richiesta.', who: 'Il server riporta TUTTI i problemi, non solo il primo.', parts: [], expect: 'title e priority nell\'elenco degli errori.', risk: 'Nessuno.', contains: 'priority' },
      { title: 'JSON non valido', cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title": }' $TASKFLOW_URL/v1/tasks | jq -r '.error'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{\\"title\\": }' "$env:TASKFLOW_URL/v1/tasks"` }, what: 'Il body non è JSON.', who: 'Il server non riesce nemmeno a leggerlo.', parts: [], expect: 'invalid_json (400), non 422.', risk: 'Nessuno.', contains: 'invalid_json' },
      { title: 'Content-Type sbagliato', cmd: { bash: `curl -s -i -X POST ${AUTH} -H "Content-Type: text/plain" -d 'ciao' $TASKFLOW_URL/v1/tasks | head -1`, pwsh: 'curl.exe -s -i -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: text/plain" -d "ciao" "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Il body è testo semplice, non JSON.', who: 'Il server controlla l\'header prima del body.', parts: [], expect: 'Status 415 Unsupported Media Type.', risk: 'Nessuno.', contains: '415' },
      { title: 'Il valore al limite', cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","priority":5}' $TASKFLOW_URL/v1/tasks | jq -r '.title'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"priority\\":5}' "$env:TASKFLOW_URL/v1/tasks"` }, what: 'Tre lettere e priorità 5 sono i valori minimi/massimi ammessi.', who: 'Il server li accetta.', parts: [], expect: 'Il task viene creato (201).', risk: 'Crea un task di prova.', contains: 'abc' },
    ],
    predict: [
      {
        prompt: 'Un titolo di ESATTAMENTE 3 lettere e uno di 2: quale viene accettato? E con priority 0?',
        cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","priority":0}' $TASKFLOW_URL/v1/tasks | jq -c '.errors'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"priority\\":0}' "$env:TASKFLOW_URL/v1/tasks"` },
        expect: 'Il titolo di 3 lettere è valido, quello di 2 no; priority 0 è sotto il minimo (1): errore sul solo campo priority.',
        why: 'I limiti sono inclusivi: il valore al confine passa, appena oltre fallisce. Per questo si provano i due lati del confine.',
      },
    ],
    negative: {
      prompt: 'Uno status che non esiste:',
      cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","status":"closed"}' $TASKFLOW_URL/v1/tasks | jq -r '.errors[0].message'`, pwsh: `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"status\\":\\"closed\\"}' "$env:TASKFLOW_URL/v1/tasks"` },
      explain: '422 con l\'elenco dei valori ammessi (open, in_progress, done): un buon messaggio d\'errore dice anche come correggere. Nella documentazione va riportato.',
    },
    task: {
      text: 'In ~/corso-cli/m4l5 esegui almeno questi test su POST /v1/tasks: JSON malformato (400), Content-Type text/plain (415), body vuoto, title di 2 lettere, priority 9, status "closed" e projectId 99 (tutti 422, ognuno con il SUO campo nell\'elenco errors), poi due valori al limite: title di 3 lettere con priority 5 (201) e priority 0 (422). Scrivi casi.md: una tabella Input | Atteso | Effettivo con almeno 6 righe e una frase su come leggere 400, 415 e 422.',
      criterion: 'Il registro mostra 400, 415, 201 e 422 con i campi title, priority, status e projectId; casi.md ha la tabella con almeno 6 righe.',
    },
    checks: [
      {
        id: 'formato',
        description: 'Hai provato gli errori di formato: 400 e 415',
        expected: '400 invalid_json e 415',
        test: (c) => {
          const e400 = hit(c, 'POST', 400, (e) => /invalid_json/.test(e.resBody ?? ''));
          const e415 = hit(c, 'POST', 415);
          return { pass: e400 && e415, actual: `400:${e400} 415:${e415}` };
        },
        onFail: 'Servono un body non JSON (400) e un Content-Type diverso da application/json (415).',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'campi',
        description: 'Quattro errori 422 con campi diversi: title, priority, status, projectId',
        expected: 'title, priority, status, projectId',
        test: (c) => {
          const fields = new Set(c.apiShell.filter((e) => e.method === 'POST' && e.status === 422).flatMap(errorFields));
          const miss = ['title', 'priority', 'status', 'projectId'].filter((f) => !fields.has(f));
          return { pass: miss.length === 0, actual: miss.length ? 'mancano: ' + miss.join(', ') : 'ok' };
        },
        onFail: 'Per ogni campo prova un valore non valido: title troppo corto, priority 9, status "closed", projectId 99.',
      },
      {
        id: 'limiti',
        description: 'Valori ai limiti: 201 con title di 3 lettere e priority 5, 422 con priority 0',
        expected: '201 e 422 ai due lati del confine',
        test: (c) => {
          const ok = c.apiShell.some((e) => e.method === 'POST' && e.status === 201 && /"title":"abc"/.test(e.reqBody ?? '') && /"priority":5/.test(e.reqBody ?? ''));
          const bad = c.apiShell.some((e) => e.method === 'POST' && e.status === 422 && /"priority":0/.test(e.reqBody ?? ''));
          return { pass: ok && bad, actual: `3 lettere + priority 5:${ok} priority 0:${bad}` };
        },
        onFail: 'Prova {"title":"abc","priority":5} (deve passare) e {"title":"abc","priority":0} (deve fallire).',
      },
      {
        id: 'tabella',
        description: 'casi.md: tabella Input | Atteso | Effettivo con almeno 6 righe',
        expected: 'tabella a 3 colonne, 6 righe',
        test: (c) => {
          const t = parseTables(c.read('casi.md') ?? '').find((x) => x.header.some((h) => /input/i.test(h)) && x.header.some((h) => /atteso/i.test(h)) && x.header.some((h) => /effettiv/i.test(h)));
          return { pass: !!t && t.rows.length >= 6, actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Struttura: | Input | Atteso | Effettivo |, riga di separatori |---|---|---|, poi una riga per caso.',
        kind: 'verifiable',
      },
      {
        id: 'lettura',
        description: 'casi.md spiega 400, 415 e 422',
        expected: '400, 415, 422',
        test: (c) => {
          const md = c.read('casi.md') ?? '';
          const ok = ['400', '415', '422'].every((n) => md.includes(n)) && /errors|campo/i.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'mancano gli status o il riferimento a errors' };
        },
        onFail: 'Aggiungi la frase su come leggere i tre status e l\'elenco errors.',
      },
    ],
    example: { text: 'Esempio analogo: un titolo troppo lungo (81 caratteri) deve fallire.', cmd: { bash: `curl -s -X POST ${AUTH} ${JSON_H} -d "{\\"title\\":\\"$(printf 'a%.0s' $(seq 1 81))\\"}" $TASKFLOW_URL/v1/tasks | jq -c '.errors'`, pwsh: `$t = "a" * 81; curl.exe -s -X POST ${PS_H} -d "{\\\\"title\\\\":\\\\"$t\\\\"}" "$env:TASKFLOW_URL/v1/tasks"` } },
    hints: ['Ogni caso negativo deve avere UN solo problema, così capisci a cosa si riferisce ogni errore.', 'In PowerShell con curl.exe scrivi le virgolette del JSON con il backslash: -d \'{\\"title\\":\\"ab\\"}\'.', 'Il minimo di title è 3 lettere, il massimo 80; priority va da 1 a 5.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m4l5',
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title": }' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} -H "Content-Type: text/plain" -d 'ciao' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"ab"}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","priority":9}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","status":"closed"}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","projectId":99}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","priority":5}' $TASKFLOW_URL/v1/tasks`,
        `curl -s -X POST ${AUTH} ${JSON_H} -d '{"title":"abc","priority":0}' $TASKFLOW_URL/v1/tasks`,
        `cat > casi.md <<'EOF'\n${CASI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m4l5',
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\": }' "$env:TASKFLOW_URL/v1/tasks"`,
        'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: text/plain" -d "ciao" "$env:TASKFLOW_URL/v1/tasks"',
        `curl.exe -s -X POST ${PS_H} -d '{}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"ab\\"}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"priority\\":9}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"status\\":\\"closed\\"}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"projectId\\":99}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"priority\\":5}' "$env:TASKFLOW_URL/v1/tasks"`,
        `curl.exe -s -X POST ${PS_H} -d '{\\"title\\":\\"abc\\",\\"priority\\":0}' "$env:TASKFLOW_URL/v1/tasks"`,
        `Set-Content casi.md -Value @'\n${CASI_MD}'@`,
      ],
    },
    summary: ['400 formato, 415 Content-Type, 422 dati non validi', 'errors dice campo e motivo', 'si provano i due lati di ogni limite', 'un caso negativo = un solo problema'],
    skills: ['testing', 'http', 'output'],
    concepts: ['validazione 422', '400 contro 422 contro 415', 'valori ai limiti', 'test negativi mirati'],
  },
];
