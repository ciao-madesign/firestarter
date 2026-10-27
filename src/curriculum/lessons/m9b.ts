/** M9 — lezione aggiunta il 2026-10-27: documentare un endpoint che non ha documentazione, ricavandolo dal codice (sola lettura). */
import type { Lesson, SetupCtx } from '../types.ts';
import { DEMO_HEAD } from '../../engine/git-fixture.ts';
import { parseTables } from '../../docs/lint.ts';
import { ranCmd, pick } from './helpers.ts';

function setupProject(c: SetupCtx): void {
  for (const [p, content] of Object.entries(DEMO_HEAD)) c.file(`progetto/${p}`, content);
  c.dirMk('progetto/.git');
}

const WEBHOOK_MD = `# POST /api/webhook-polar

Riceve le notifiche del servizio esterno Polar.

## Metodo e percorso

POST /api/webhook-polar (funzione serverless in api/webhook-polar.js).

## Autenticazione

Non usa un token Bearer: la richiesta è autenticata da una firma. Il mittente invia l'header \`x-polar-signature\` con l'HMAC SHA-256 del body GREZZO (i byte esattamente come ricevuti, non il JSON riletto) calcolato con il segreto condiviso, in esadecimale.

## Risposte

| Status | Corpo | Quando |
|---|---|---|
| 200 | { "received": true } | la firma è valida e la notifica è stata messa in coda |
| 401 | { "error": "invalid_signature" } | la firma non coincide con quella calcolata |
| 405 | { "error": "method_not_allowed" } | il metodo non è POST |

## Configurazione

Richiede la variabile d'ambiente POLAR_WEBHOOK_SECRET (il valore non si documenta).

## Domande aperte per lo sviluppatore

- Qual è il formato (payload) delle notifiche? Il codice non lo descrive.
- Cosa fa la coda (queue) dopo l'inserimento e cosa succede se l'elaborazione fallisce? Il codice risponde 200 prima.
- Il mittente riprova se riceve un 401 o un errore di rete? Non è specificato.
`;

export const m9b: Lesson[] = [
  {
    id: 'M9.L6',
    module: 9,
    n: 6,
    title: 'Documentare un endpoint che non ha documentazione',
    objective: 'Ricavare dal solo codice il contratto di un endpoint non documentato, separando ciò che il codice dice da ciò che non dice, e scrivere la pagina con le domande aperte.',
    explain: [
      'Fino a qui hai confrontato codice e documentazione esistente. Il caso più difficile è l\'endpoint che la documentazione NON nomina affatto: `POST /api/webhook-polar` compare nel codice (`api/webhook-polar.js`) ma non in `docs/api.md`. Lo verifichi con `grep -c webhook docs/api.md` (zero corrispondenze). Il contratto va ricavato leggendo.',
      'Cosa si ricava dal codice: il metodo ammesso, come si autentica la richiesta (qui non con un token, ma con una FIRMA HMAC nell\'header), il tipo di dato firmato (body grezzo), le risposte possibili con i loro status, le variabili d\'ambiente richieste. Cosa NON si ricava: il formato delle notifiche, cosa fa la coda dopo, se il mittente riprova. Queste cose NON si inventano: vanno in una sezione «Domande aperte» da girare a chi conosce il sistema.',
      'Lavori in sola lettura sul progetto d\'esempio demo-note. Non documentare mai il valore di un segreto: solo il nome della variabile.',
    ],
    shells: ['bash', 'pwsh'],
    setup: setupProject,
    guided: [
      { title: 'Non è nella documentazione', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && grep -c webhook docs/api.md', pwsh: 'cd ~/corso-cli/m9l6/progetto; (Select-String -Pattern webhook -Path docs/api.md).Count' }, what: 'Conta quante volte la documentazione nomina il webhook.', who: 'grep -c / Select-String: contano le righe che corrispondono.', parts: ['-c: stampa solo il numero'], expect: 'Bash: 0. PowerShell: 0 (nessuna corrispondenza).', risk: 'Nessuno.', fails: { bash: true, pwsh: false }, contains: '0' },
      { title: 'Dov\'è nel codice', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && grep -rn "webhook" --include=*.js --include=*.ts .', pwsh: 'cd ~/corso-cli/m9l6/progetto; Get-ChildItem -Recurse -File -Filter *.js | Select-String -Pattern webhook | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line)" }' }, what: 'Trova il file che contiene l\'endpoint.', who: 'grep -rn cerca in tutti i file con numero di riga.', parts: [], expect: 'Righe di api/webhook-polar.js.', risk: 'Nessuno.', contains: 'webhook-polar' },
      { title: 'Leggere l\'handler', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && cat api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; Get-Content api/webhook-polar.js' }, what: 'Mostra tutto il codice dell\'endpoint (poche righe).', who: 'cat / Get-Content.', parts: ['cerca: metodo, header, status, variabili'], expect: 'Controllo del metodo, calcolo HMAC, due risposte di errore e una di successo.', risk: 'Nessuno.', contains: 'x-polar-signature' },
      { title: 'Tutte le risposte', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && grep -n "status(" api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; Select-String -Pattern "status\\(" -Path api/webhook-polar.js | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }' }, what: 'Elenca le righe che impostano uno status.', who: 'grep -n con numero di riga.', parts: [], expect: 'Tre status: 405, 401, 200.', risk: 'Nessuno.', contains: '401' },
      { title: 'Cosa serve per funzionare', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && grep -n "process.env" api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; Select-String -Pattern "process.env" -Path api/webhook-polar.js | ForEach-Object { $_.Line.Trim() }' }, what: 'Trova le variabili d\'ambiente richieste.', who: 'Il codice legge POLAR_WEBHOOK_SECRET.', parts: [], expect: 'POLAR_WEBHOOK_SECRET: si documenta il nome, mai il valore.', risk: 'Nessuno.', contains: 'POLAR_WEBHOOK_SECRET' },
    ],
    predict: [
      {
        prompt: 'Il codice dice cosa succede alla notifica dopo la risposta 200? E quale formato ha il body?',
        cmd: { bash: 'cd ~/corso-cli/m9l6/progetto; grep -n "queue\\|body" api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; Select-String -Pattern "queue|body" -Path api/webhook-polar.js | ForEach-Object { $_.Line.Trim() }' },
        expect: 'No: il codice mette la notifica in una coda (queue.add) senza dire cosa ne sarà, e non descrive i campi del body. Sono domande aperte, non fatti.',
        why: 'Documentare solo ciò che il codice dimostra: ciò che manca va chiesto, non dedotto.',
      },
    ],
    negative: {
      prompt: 'Scrivere nella documentazione «la notifica contiene i campi evento e id» perché sembra ovvio:',
      cmd: { bash: 'cd ~/corso-cli/m9l6/progetto; grep -c "evento" api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; (Select-String -Pattern evento -Path api/webhook-polar.js).Count' },
      explain: 'Nessuna corrispondenza: il campo non compare da nessuna parte nel codice. Un\'ipotesi scritta come fatto diventa un errore di documentazione che un lettore proverà a usare.',
    },
    task: {
      text: 'In ~/corso-cli/m9l6 scrivi webhook-polar.md per l\'endpoint non documentato. Deve contenere: metodo e percorso; come si autentica (header, algoritmo, cosa viene firmato); una tabella delle risposte Status | Corpo | Quando (tutte e tre); la variabile d\'ambiente richiesta (solo il nome); e una sezione «Domande aperte» con almeno due cose che il codice NON dice (formato del payload e cosa fa la coda).',
      criterion: 'Il documento riporta POST, /api/webhook-polar, x-polar-signature, HMAC SHA-256 del body grezzo, i tre status con i corpi, POLAR_WEBHOOK_SECRET e almeno due domande aperte; hai letto il file del codice.',
    },
    checks: [
      {
        id: 'lettura',
        description: 'Hai letto il codice dell\'endpoint',
        expected: 'cat/Get-Content/grep su api/webhook-polar.js',
        test: (c) => {
          const ok = ranCmd(c, /webhook-polar\.js|\bwebhook\b/, false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna lettura del file' };
        },
        onFail: 'Leggi api/webhook-polar.js prima di scrivere: la documentazione deve nascere dal codice.',
      },
      {
        id: 'contratto',
        description: 'Metodo, percorso, firma (header, HMAC SHA-256, body grezzo)',
        expected: 'POST, /api/webhook-polar, x-polar-signature, HMAC, SHA-256, grezzo',
        test: (c) => {
          const md = c.read('webhook-polar.md') ?? '';
          const ok = { metodo: /\bPOST\b/.test(md), percorso: /\/api\/webhook-polar/.test(md), header: /x-polar-signature/i.test(md), hmac: /HMAC/i.test(md) && /SHA-?256/i.test(md), grezzo: /grezz|raw|byte|così come ricevut/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Descrivi come si autentica la richiesta: header, algoritmo e COSA viene firmato (il body grezzo, non il JSON riletto).',
      },
      {
        id: 'risposte',
        description: 'Tabella delle risposte: 200, 401, 405 con i corpi',
        expected: 'tre righe con 200 received, 401 invalid_signature, 405 method_not_allowed',
        test: (c) => {
          const md = c.read('webhook-polar.md') ?? '';
          const t = parseTables(md).find((x) => x.header.some((h) => /status/i.test(h)));
          const text = t ? t.rows.map((r) => r.join(' ')).join(' ') : '';
          const ok = { righe: !!t && t.rows.length >= 3, s200: /200/.test(text) && /received/.test(text), s401: /401/.test(text) && /invalid_signature/.test(text), s405: /405/.test(text) && /method_not_allowed/.test(text) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Tabella Status | Corpo | Quando con una riga per ognuna delle tre risposte del codice.',
        kind: 'verifiable',
      },
      {
        id: 'segreto',
        description: 'La variabile d\'ambiente è nominata (e nessun valore)',
        expected: 'POLAR_WEBHOOK_SECRET',
        test: (c) => {
          const md = c.read('webhook-polar.md') ?? '';
          return { pass: /POLAR_WEBHOOK_SECRET/.test(md) && !/POLAR_WEBHOOK_SECRET\s*=\s*\S+/.test(md), actual: /POLAR_WEBHOOK_SECRET/.test(md) ? 'ok' : 'variabile non nominata' };
        },
        onFail: 'Scrivi il nome della variabile richiesta, mai un valore.',
      },
      {
        id: 'domande',
        description: 'Domande aperte: payload e coda',
        expected: 'sezione con almeno due domande su ciò che il codice non dice',
        test: (c) => {
          const md = c.read('webhook-polar.md') ?? '';
          const i = md.search(/domande aperte|da verificare|non so/i);
          const tail = i >= 0 ? md.slice(i) : '';
          const items = tail.split('\n').filter((l) => /^\s*[-*\d]/.test(l)).length;
          const ok = { sezione: i >= 0, voci: items >= 2, payload: /payload|formato|campi|struttura/i.test(tail), coda: /coda|queue/i.test(tail) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Aggiungi «Domande aperte» con almeno due punti che il codice non chiarisce: il formato del payload e il destino della notifica in coda.',
        errorTag: 'previsioni-incoerenti',
      },
    ],
    example: { text: 'Esempio analogo: individuare il metodo ammesso da un altro handler.', cmd: { bash: 'cd ~/corso-cli/m9l6/progetto && grep -n "method" api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l6/progetto; Select-String -Pattern method -Path api/webhook-polar.js | ForEach-Object { $_.Line.Trim() }' } },
    hints: ['Nel codice cerca: il controllo del metodo (`req.method`), l\'header letto (`req.headers`), cosa viene firmato (`req.rawBody`) e ogni `res.status(...)`.', 'Se una cosa non si può dedurre dal codice, va in «Domande aperte», non nella parte descrittiva.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l6', 'grep -c webhook progetto/docs/api.md', 'cat progetto/api/webhook-polar.js', 'grep -n "status(" progetto/api/webhook-polar.js', 'grep -n "process.env" progetto/api/webhook-polar.js', `cat > webhook-polar.md <<'EOF'\n${WEBHOOK_MD}EOF`],
      pwsh: ['cd ~/corso-cli/m9l6', '(Select-String -Pattern webhook -Path progetto/docs/api.md).Count', 'Get-Content progetto/api/webhook-polar.js', 'Select-String -Pattern "status\\(" -Path progetto/api/webhook-polar.js', 'Select-String -Pattern "process.env" -Path progetto/api/webhook-polar.js', `Set-Content webhook-polar.md -Value @'\n${WEBHOOK_MD}'@`],
    },
    summary: ['il contratto si ricava dal codice: metodo, autenticazione, risposte, configurazione', 'ciò che il codice non dice va chiesto, non dedotto', 'si documenta il nome dei segreti, mai il valore'],
    skills: ['docs', 'diagnosi', 'autonomia'],
    concepts: ['documentare da codice', 'autenticazione con firma HMAC', 'domande aperte', 'fatto e ipotesi'],
  },
];

void pick;
