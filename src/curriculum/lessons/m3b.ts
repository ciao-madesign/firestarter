/** M3 — lezioni aggiunte il 2026-10-27: URL e codifica dei parametri, JSON e virgolette tra Bash e PowerShell 5.1. */
import type { Lesson, SetupCtx } from '../types.ts';
import type { ApiTask } from '../../engine/types.ts';
import { ranCmd, pick, setupApi } from './helpers.ts';

const AUTH = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const PS_AUTH = '-Headers @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }';

/** Titolo con virgolette doppie e apostrofo: obbliga a gestire il quoting. */
const TITOLO = 'Revisione "API v2" - l\'ultima versione';

function mkRd(id: number): ApiTask {
  return { id, title: 'R&D: revisione API', description: 'Task con una e commerciale nel titolo.', status: 'open', priority: 3, projectId: null, createdAt: '2026-02-26T09:00:00Z', updatedAt: '2026-02-26T09:00:00Z' };
}

function setupUrl(c: SetupCtx): void {
  setupApi(c, { token: 'valid' });
  const e = c.state.api.envs.development;
  e.tasks.push(mkRd(e.nextTaskId++));
}

const URL_MD = `# URL, query string e codifica

Un URL ha queste parti: schema (https), host (api.example.test), porta, percorso (/v1/tasks) e query string (?status=open&limit=2).

## Caratteri speciali nei valori

| Carattere | Perché è speciale | Forma codificata |
|---|---|---|
| spazio | separa le parole nella riga di comando | %20 |
| & | nella query separa i parametri | %26 |
| ' (apostrofo) | per la shell apre un testo tra apici | %27 |

Se la & non è codificata, il server la legge come separatore: q=R&D diventa q=R più un parametro D. Il risultato non è un errore ma un elenco sbagliato (tutti i task con la lettera r).

## Come si fa

- Bash: curl -G --data-urlencode "q=R&D" URL (codifica e aggiunge la query string).
- PowerShell: [uri]::EscapeDataString("R&D") e poi si inserisce il risultato nell'URL.
- Sempre l'URL tra virgolette: in Bash una & fuori dalle virgolette avvia il comando in background.
`;

const APPROCCI_MD = `# JSON e virgolette: quale approccio usare

| Approccio | Quando | Rischio |
|---|---|---|
| Testo JSON tra apici nel comando | solo testi senza virgolette né apostrofi | basta una virgoletta nel testo per rompere il JSON (errore 400 invalid_json) |
| File con il JSON e -d @file | corpo fisso o molto lungo; la scelta più sicura nelle due shell | il file va tenuto aggiornato |
| Costruire il JSON con jq -n --arg (Bash) o ConvertTo-Json (PowerShell) | testo che arriva da una variabile | ConvertTo-Json ha profondità 2 di default |

In Windows PowerShell 5.1 un argomento passato a curl.exe perde le virgolette doppie interne: serve scriverle con \\" oppure usare un file. jq e ConvertTo-Json aggiungono da soli le sequenze di escape (\\" per le virgolette).
`;

export const m3b: Lesson[] = [
  {
    id: 'M3.L3',
    module: 3,
    n: 3,
    title: 'URL, query string e caratteri da codificare',
    objective: 'Leggere le parti di un URL, costruire query string corrette e codificare i caratteri speciali (spazio, &, apostrofo).',
    explain: [
      'Un URL ha parti precise: schema, host, porta, percorso e, dopo il `?`, la QUERY STRING: coppie `nome=valore` separate da `&` (`/v1/tasks?status=open&limit=2`). I caratteri che hanno un significato nell\'URL (spazio, `&`, `=`, `?`, `#`) o nella shell (apice) devono essere CODIFICATI nei valori: spazio → `%20`, `&` → `%26`, apostrofo → `%27`.',
      'Se non codifichi, il server interpreta il testo a modo suo: `q=R&D` viene letto come `q=R` più un secondo parametro `D`. Non è un errore: ricevi un elenco SBAGLIATO senza alcun avviso. Per questo ogni URL va tra virgolette: in Bash una `&` fuori dalle virgolette manda il comando in background, in PowerShell è un errore di sintassi.',
      'Bash: `curl -G --data-urlencode "q=R&D" URL` codifica il valore e lo aggiunge alla query string (`-G` = usa GET). PowerShell 5.1: `[uri]::EscapeDataString("R&D")` restituisce il testo codificato, da inserire nell\'URL.',
    ],
    shells: ['bash', 'pwsh'],
    setup: setupUrl,
    guided: [
      { title: 'Una query string semplice', cmd: { bash: `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?status=open&limit=2" | jq '.data | length'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?status=open&limit=2" ${PS_AUTH}).data.Count` }, what: 'Chiede al massimo 2 task aperti.', who: 'Il server legge i parametri status e limit dalla query string.', parts: ['?: inizio della query string', '&: separa i parametri', 'l\'URL è tra virgolette'], expect: '2: la risposta rispetta limit=2.', risk: 'Nessuno.', contains: '2' },
      { title: 'La & senza virgolette', cmd: { bash: 'curl -s $TASKFLOW_URL/v1/tasks?status=open&limit=2', pwsh: 'Invoke-RestMethod $env:TASKFLOW_URL/v1/tasks?status=open&limit=2' }, what: 'Dimentica le virgolette attorno all\'URL.', who: 'La shell vede la & prima del server.', parts: [], expect: 'Bash: nel laboratorio un errore sul background (nel Bash vero il comando partirebbe in background, troncato a status=open). PowerShell: Unexpected token \'&\'.', risk: 'Nessuno.', fails: true, contains: { bash: 'background', pwsh: "Unexpected token '&'" } },
      { title: 'Spazio e apostrofo', cmd: { bash: 'curl -s -G --data-urlencode "q=Configurare l\'ambiente" -w "\\n%{url_effective}\\n" -o /dev/null "$TASKFLOW_URL/v1/tasks"', pwsh: '[uri]::EscapeDataString("Configurare l\'ambiente")' }, what: 'Mostra come diventa il valore dopo la codifica.', who: 'curl -G --data-urlencode / EscapeDataString.', parts: ['--data-urlencode: codifica il valore', '-G: i dati diventano query string'], expect: 'Configurare%20l%27ambiente', risk: 'Nessuno.', contains: '%20l%27ambiente' },
      { title: 'Il caso della &: valore NON codificato', cmd: { bash: `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=R&D" | jq '.total'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=R&D" ${PS_AUTH}).total` }, what: 'Cerca "R&D" scrivendo la & nell\'URL.', who: 'Il server legge q=R e un parametro D sconosciuto.', parts: [], expect: '6: TUTTI i task contengono la lettera r. Nessun errore, risultato sbagliato.', risk: 'Nessuno.', contains: '6' },
      { title: 'Lo stesso valore codificato', cmd: { bash: `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=R%26D" | jq '.total'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=R%26D" ${PS_AUTH}).total` }, what: 'Stessa ricerca con la & scritta come %26.', who: 'Il server decodifica %26 in & e lo tratta come parte del valore.', parts: ['%26: la & codificata'], expect: '1: solo il task "R&D: revisione API".', risk: 'Nessuno.', contains: '1' },
    ],
    predict: [
      {
        prompt: 'Quanti task restituisce la ricerca q=R&D se la & non è codificata? (Pensa a quali titoli contengono la lettera r.)',
        cmd: { bash: `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=R&D" | jq '.total'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=R&D" ${PS_AUTH}).total` },
        expect: '6, cioè tutti: il server cerca solo "R".',
        why: 'Una & non codificata spezza il valore: l\'errore non viene segnalato, il risultato è solo sbagliato.',
      },
    ],
    negative: {
      prompt: 'Un valore con lo spazio dentro l\'URL, tra virgolette ma non codificato:',
      cmd: { bash: `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=guida di avvio" | jq '.total'`, pwsh: `(Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=guida di avvio" ${PS_AUTH}).total` },
      explain: 'Qui funziona perché curl/PowerShell codificano lo spazio al posto tuo, ma la & e il # no: non contare su correzioni automatiche, codifica sempre i valori.',
    },
    task: {
      text: 'In ~/corso-cli/m3l3: (1) salva in `esatto.json` la risposta della ricerca di "R&D" scritta CORRETTAMENTE (un solo task); (2) salva in `sbagliato.json` la risposta quando la & NON è codificata (URL tra virgolette, ma q=R&D); (3) scrivi url.md: le parti di un URL, e una tabella con spazio, & e apostrofo con la forma codificata.',
      criterion: 'esatto.json ha total 1 e il titolo R&D; sbagliato.json ha total 6; url.md contiene %20, %26, %27 e spiega perché il secondo risultato è sbagliato; il token non è scritto nei comandi.',
    },
    checks: [
      {
        id: 'esatto',
        description: 'esatto.json: ricerca corretta (1 risultato, R&D)',
        expected: 'total 1 e titolo "R&D: revisione API"',
        test: (c) => {
          try {
            const j = JSON.parse(c.read('esatto.json') ?? '') as { total?: number; data?: { title: string }[] };
            return { pass: j.total === 1 && /^R&D/.test(j.data?.[0]?.title ?? ''), actual: `total ${j.total}` };
          } catch {
            return { pass: false, actual: 'file mancante o JSON non valido' };
          }
        },
        onFail: 'Codifica la &: ?q=R%26D (oppure curl -G --data-urlencode "q=R&D"). Salva il corpo della risposta con > esatto.json.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'sbagliato',
        description: 'sbagliato.json: risposta con la & non codificata (6 risultati)',
        expected: 'total 6',
        test: (c) => {
          try {
            const j = JSON.parse(c.read('sbagliato.json') ?? '') as { total?: number };
            return { pass: j.total === 6, actual: `total ${j.total}` };
          } catch {
            return { pass: false, actual: 'file mancante o JSON non valido' };
          }
        },
        onFail: 'Riproduci l\'errore: URL tra virgolette con ?q=R&D (non codificato) e salva la risposta.',
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
        id: 'documento',
        description: 'url.md: parti dell\'URL e caratteri codificati',
        expected: '%20, %26, %27, query string',
        test: (c) => {
          const md = c.read('url.md') ?? '';
          const ok = { e20: md.includes('%20'), e26: md.includes('%26'), e27: md.includes('%27'), query: /query/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Inserisci la tabella con spazio %20, & %26 e apostrofo %27 e nomina la query string.',
      },
    ],
    example: { text: 'Esempio analogo: cercare un testo con uno spazio.', cmd: { bash: `curl -s -G --data-urlencode "q=guida di avvio" ${AUTH} "$TASKFLOW_URL/v1/tasks" | jq '.total'`, pwsh: `$q = [uri]::EscapeDataString("guida di avvio"); (Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=$q" ${PS_AUTH}).total` } },
    hints: ['La & si scrive %26. Il valore codificato va nell\'URL: ?q=R%26D.', 'Per salvare il corpo della risposta: Bash `curl -s … > file`; PowerShell `curl.exe -s … > file` (oppure `Invoke-RestMethod … | ConvertTo-Json -Depth 5 > file`).'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m3l3',
        `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=R%26D" > esatto.json`,
        `curl -s ${AUTH} "$TASKFLOW_URL/v1/tasks?q=R&D" > sbagliato.json`,
        `cat > url.md <<'EOF'\n${URL_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m3l3',
        `curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks?q=R%26D" > esatto.json`,
        `curl.exe -s -H "Authorization: Bearer $env:TASKFLOW_TOKEN" "$env:TASKFLOW_URL/v1/tasks?q=R&D" > sbagliato.json`,
        `Set-Content url.md -Value @'\n${URL_MD}'@`,
      ],
    },
    summary: ['URL: schema, host, porta, percorso, query string', 'spazio %20, & %26, apostrofo %27', 'una & non codificata dà un risultato sbagliato senza errori', 'sempre l\'URL tra virgolette'],
    skills: ['http', 'output', 'comandi'],
    concepts: ['query string', 'codifica percentuale', 'curl -G --data-urlencode', '[uri]::EscapeDataString'],
  },
  {
    id: 'M3.L5',
    module: 3,
    n: 5,
    title: 'Il JSON tra virgolette: Bash e Windows PowerShell 5.1',
    objective: 'Inviare un body JSON che contiene virgolette e apostrofi nelle due shell, scegliendo tra testo nel comando, file e costruzione automatica.',
    explain: [
      'Il JSON usa SEMPRE virgolette doppie, e le shell le trattano in modo speciale. In Bash il JSON si scrive tra apici singoli (`-d \'{"title":"x"}\'`), ma un apice o una virgoletta DENTRO il testo rompono il quoting o il JSON. Le soluzioni robuste sono due: scrivere il JSON in un FILE (`-d @body.json`) oppure farlo costruire a uno strumento che gestisce gli escape (`jq -n --arg t "$TITOLO" \'{title:$t}\'`).',
      'In Windows PowerShell 5.1 c\'è una trappola in più: quando passa un argomento a un programma esterno come curl.exe, PowerShell NON protegge le virgolette doppie interne, e curl.exe le perde: `-d \'{"title":"x"}\'` arriva come `{title:x}` (errore 400 invalid_json). Si risolve scrivendo le virgolette con il backslash (`-d \'{\\"title\\":\\"x\\"}\'`), oppure — meglio — con un file, oppure con i cmdlet: `@{ title = $t } | ConvertTo-Json` e `Invoke-RestMethod -Uri URL -Body $corpo` (con `-Uri` si indica l\'indirizzo).',
      'In PowerShell un apice dentro un testo tra apici singoli si raddoppia (`\'l\'\'ultima\'`); in Bash si usa un testo tra virgolette doppie con `\\"` per le virgolette interne. `ConvertTo-Json` scrive l\'apostrofo come `\\u0027`: è JSON valido, e il server lo decodifica.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Il caso semplice', cmd: { bash: `curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d '{"title":"Prova semplice"}' $TASKFLOW_URL/v1/tasks | jq -r '.title'`, pwsh: 'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{\\"title\\":\\"Prova semplice\\"}\' "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Crea un task con un titolo senza caratteri speciali.', who: 'Bash: il JSON è tra apici singoli. PowerShell: le virgolette interne portano il backslash per curl.exe.', parts: ['-d: il body', 'PowerShell: \\" per passare una virgoletta a curl.exe'], expect: 'Il titolo del task creato.', risk: 'Crea un task di prova.', contains: 'Prova semplice' },
      { title: 'Virgolette interne: il JSON si rompe', cmd: { bash: `curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d '{"title":"Revisione "API v2""}' $TASKFLOW_URL/v1/tasks | jq -r '.error'`, pwsh: 'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"Prova semplice"}\' "$env:TASKFLOW_URL/v1/tasks"' }, what: 'Bash: virgolette non protette DENTRO il testo. PowerShell 5.1: virgolette perse nel passaggio a curl.exe.', who: 'Il server riceve un JSON non valido.', parts: [], expect: 'invalid_json (errore 400): il server non riesce a leggere il body.', risk: 'Nessuno: non crea nulla.', contains: 'invalid_json' },
      { title: 'Il JSON in un file', cmd: { bash: `cd ~/corso-cli/m3l5 && cat > prova.json <<'EOF'\n{"title":"Titolo da file: l'ultima \\"bozza\\""}\nEOF\ncurl -s -X POST ${AUTH} -H "Content-Type: application/json" -d @prova.json $TASKFLOW_URL/v1/tasks | jq -r '.title'`, pwsh: `cd ~/corso-cli/m3l5; Set-Content prova.json -Value @'\n{"title":"Titolo da file: l'ultima \\"bozza\\""}\n'@\ncurl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d "@prova.json" "$env:TASKFLOW_URL/v1/tasks"` }, what: 'Scrive il JSON in un file (testo letterale) e lo invia con -d @file.', who: 'Nel file non serve alcun quoting della shell; l\'unico escape è quello del JSON stesso.', parts: ['<<\'EOF\' / @\'…\'@: testo letterale', '-d @prova.json: il body viene letto dal file'], expect: 'Il titolo con virgolette e apostrofo, creato correttamente.', risk: 'Crea un task di prova.', contains: 'bozza' },
      { title: 'Costruire il JSON da una variabile', cmd: { bash: `TITOLO="Dalla variabile: l'ultima \\"bozza\\""; body=$(jq -n --arg t "$TITOLO" '{title:$t}'); curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d "$body" $TASKFLOW_URL/v1/tasks | jq -r '.title'`, pwsh: '$titolo = \'Dalla variabile: l\'\'ultima "bozza"\'; $body = @{ title = $titolo } | ConvertTo-Json; (Invoke-RestMethod -Method Post -Uri "$env:TASKFLOW_URL/v1/tasks" -ContentType "application/json" -Body $body -Headers @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }).title' }, what: 'Lo strumento (jq / ConvertTo-Json) aggiunge da solo gli escape necessari.', who: 'jq -n --arg e ConvertTo-Json producono JSON valido da qualsiasi testo.', parts: ['--arg t "$TITOLO": passa il testo come variabile $t', 'ConvertTo-Json: da hashtable a JSON'], expect: 'Il titolo originale, intatto.', risk: 'Crea un task di prova.', contains: 'bozza' },
    ],
    predict: [
      {
        prompt: 'In Windows PowerShell 5.1 cosa riceve curl.exe se scrivi -d \'{"title":"x"}\' (virgolette doppie dentro apici singoli)?',
        cmd: { bash: 'echo \'{"title":"x"}\'', pwsh: 'curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d \'{"title":"x"}\' "$env:TASKFLOW_URL/v1/tasks"' },
        expect: 'PowerShell: il body arriva come {title:x}, senza virgolette → 400 invalid_json. Bash: il testo resta intatto.',
        why: 'PowerShell 5.1 non protegge le virgolette doppie quando chiama un programma esterno: va usato \\" oppure un file.',
      },
    ],
    negative: {
      prompt: 'Un apostrofo dentro un testo tra apici singoli in Bash:',
      cmd: { bash: "echo 'l'ultima'", pwsh: "'l'ultima'" },
      explain: 'La shell vede un testo chiuso a metà e chiede di continuare (prompt >) oppure errore di sintassi: in Bash l\'apostrofo non si può scrivere tra apici singoli; PowerShell lo raddoppia (\'\'). Per testi con entrambi i tipi di virgolette conviene il file.',
    },
    task: {
      text: `In ~/corso-cli/m3l5 crea DUE task con titolo esattamente: ${TITOLO}\n(1) con un FILE JSON inviato con -d @file; (2) costruendo il JSON da una variabile (Bash: jq -n --arg; PowerShell: ConvertTo-Json). Prima prova almeno una volta a metterlo direttamente nel comando e osserva l'errore. Scrivi approcci.md: i tre approcci (testo nel comando, file, costruzione automatica) con quando conviene ciascuno e il rischio.`,
      criterion: 'Nel servizio ci sono almeno due task con quel titolo esatto; hai visto un errore invalid_json; hai usato un file e una costruzione automatica; approcci.md confronta i tre approcci.',
    },
    checks: [
      {
        id: 'task',
        description: 'Almeno due task con il titolo esatto',
        expected: `2 task con titolo «${TITOLO}»`,
        test: (c) => {
          const n = c.state.api.envs.development.tasks.filter((t) => t.title === TITOLO).length;
          return { pass: n >= 2, actual: `${n} task` };
        },
        onFail: 'Il titolo deve arrivare identico al servizio (virgolette e apostrofo compresi): controlla l\'elenco con GET /v1/tasks.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'errore',
        description: 'Hai provato il testo nel comando e hai visto invalid_json',
        expected: 'almeno una risposta 400 invalid_json',
        test: (c) => {
          const ok = c.apiShell.some((e) => e.status === 400 && /invalid_json/.test(e.resBody ?? ''));
          return { pass: ok, actual: ok ? 'ok' : 'nessun errore invalid_json osservato' };
        },
        onFail: 'Prova prima il JSON direttamente nel comando: l\'errore è parte dell\'esercizio.',
      },
      {
        id: 'file',
        description: 'Hai inviato il body da un file (-d @file)',
        expected: '-d @nomefile',
        test: (c) => {
          const ok = ranCmd(c, /(-d|--data-binary|--data|--json)\s+"?@[\w./-]+/);
          return { pass: ok, actual: ok ? 'ok' : 'nessun uso di -d @file' };
        },
        onFail: 'Scrivi il JSON in un file e usa curl -d @body.json (in PowerShell: curl.exe -d "@body.json").',
      },
      {
        id: 'costruzione',
        description: 'Hai costruito il JSON con jq --arg / ConvertTo-Json',
        expected: pick({ shell: 'bash' } as never, 'jq -n --arg', 'ConvertTo-Json') as string,
        test: (c) => {
          const ok = ranCmd(c, pick(c, /jq\s+(-\w+\s+)*--arg\s/, /ConvertTo-Json/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'strumento di costruzione non usato' };
        },
        onFail: 'Bash: jq -n --arg t "$TITOLO" \'{title:$t}\'. PowerShell: @{ title = $titolo } | ConvertTo-Json.',
      },
      {
        id: 'documento',
        description: 'approcci.md: confronto dei tre approcci',
        expected: 'file, jq/ConvertTo-Json, virgolette',
        test: (c) => {
          const md = c.read('approcci.md') ?? '';
          const ok = { file: /file/i.test(md), builder: /jq|ConvertTo-Json/i.test(md), virgolette: /virgolett|quot/i.test(md), rischio: /rischio|errore|400|invalid_json/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Per ogni approccio: quando conviene e quale rischio ha.',
      },
    ],
    example: { text: 'Esempio analogo: JSON da un file con un titolo semplice.', cmd: { bash: `cd ~/corso-cli/m3l5 && printf '{"title":"Esempio"}' > ex.json && curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d @ex.json $TASKFLOW_URL/v1/tasks | jq -r '.title'`, pwsh: `cd ~/corso-cli/m3l5; Set-Content ex.json -Value '{"title":"Esempio"}'; curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d "@ex.json" "$env:TASKFLOW_URL/v1/tasks"` } },
    hints: ['Bash: nel file il JSON ha `\\"` per le virgolette interne e l\'apostrofo non ha problemi; l\'heredoc con \'EOF\' non interpreta nulla.', 'PowerShell: usa `Set-Content file -Value @\'…\'@` (here-string con apici singoli) e curl.exe con `-d "@file"`.', 'Il titolo in una variabile: Bash `TITOLO="Revisione \\"API v2\\" - l\'ultima versione"`; PowerShell `$titolo = \'Revisione "API v2" - l\'\'ultima versione\'`.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m3l5',
        `curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d '{"title":"Revisione "API v2""}' $TASKFLOW_URL/v1/tasks`,
        `cat > body.json <<'EOF'\n{"title":"Revisione \\"API v2\\" - l'ultima versione"}\nEOF`,
        `curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d @body.json $TASKFLOW_URL/v1/tasks`,
        `TITOLO="Revisione \\"API v2\\" - l'ultima versione"`,
        `body=$(jq -n --arg t "$TITOLO" '{title:$t}')`,
        `curl -s -X POST ${AUTH} -H "Content-Type: application/json" -d "$body" $TASKFLOW_URL/v1/tasks`,
        `cat > approcci.md <<'EOF'\n${APPROCCI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m3l5',
        `curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d '{"title":"Revisione "API v2" - l''ultima versione"}' "$env:TASKFLOW_URL/v1/tasks"`,
        `Set-Content body.json -Value @'\n{"title":"Revisione \\"API v2\\" - l'ultima versione"}\n'@`,
        `curl.exe -s -X POST -H "Authorization: Bearer $env:TASKFLOW_TOKEN" -H "Content-Type: application/json" -d "@body.json" "$env:TASKFLOW_URL/v1/tasks"`,
        `$titolo = 'Revisione "API v2" - l''ultima versione'`,
        `$body = @{ title = $titolo } | ConvertTo-Json`,
        `Invoke-RestMethod -Method Post -Uri "$env:TASKFLOW_URL/v1/tasks" -ContentType "application/json" -Body $body ${PS_AUTH}`,
        `Set-Content approcci.md -Value @'\n${APPROCCI_MD}'@`,
      ],
    },
    summary: ['il JSON usa virgolette doppie, la shell le tratta in modo speciale', 'file con -d @file: l\'approccio più sicuro', 'jq --arg / ConvertTo-Json aggiungono gli escape', 'PowerShell 5.1 perde le virgolette doppie verso i programmi esterni'],
    skills: ['http', 'comandi', 'output'],
    concepts: ['quoting del JSON', 'curl -d @file', 'jq --arg', 'ConvertTo-Json', 'argomenti verso programmi esterni in PowerShell 5.1'],
  },
];
