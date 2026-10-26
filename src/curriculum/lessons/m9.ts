/** M9 — Dal codice alla documentazione (sola lettura, su un progetto d'esempio): rotte, handler, confronto con la documentazione, Git, OpenAPI in YAML. */
import type { Lesson, SetupCtx } from '../types.ts';
import { DEMO_HEAD } from '../../engine/git-fixture.ts';
import { parseYaml, YamlError } from '../../docs/yaml.ts';
import { cmdMatches, pick } from './helpers.ts';

/** Copia di lavoro del progetto d'esempio (e marcatore .git) nella cartella della lezione. */
function setupProject(c: SetupCtx): void {
  for (const [p, content] of Object.entries(DEMO_HEAD)) c.file(`progetto/${p}`, content);
  c.dirMk('progetto/.git');
}

const normPath = (s: string): string => s.replace(/\[(\w+)\]/g, '{$1}').replace(/:(\w+)/g, '{$1}');

const ROUTES: [string, string][] = [
  ['GET', '/api/notes'],
  ['POST', '/api/notes'],
  ['GET', '/api/notes/{id}'],
  ['DELETE', '/api/notes/{id}'],
  ['GET', '/api/health'],
  ['POST', '/api/webhook-polar'],
];

const ROTTE_MD = `# Rotte di demo-note

| Metodo | Percorso | File |
|---|---|---|
| GET | /api/notes | app/api/notes/route.ts |
| POST | /api/notes | app/api/notes/route.ts |
| GET | /api/notes/{id} | app/api/notes/[id]/route.ts |
| DELETE | /api/notes/{id} | app/api/notes/[id]/route.ts |
| GET | /api/health | app/api/health/route.ts |
| POST | /api/webhook-polar | api/webhook-polar.js |
`;

const CONTRATTO_MD = `# Contratto: note

## POST /api/notes

- Autenticazione: header \`Authorization: Bearer <token>\` (oppure cookie di sessione).
- Body JSON: \`title\` obbligatorio, stringa di almeno 3 caratteri.
- Risposte: 201 con la nota creata; 401 \`unauthorized\` senza utente; 422 \`validation_failed\` (campo \`title\`) se il titolo manca o è troppo corto.

## GET /api/notes

- Autenticazione: Bearer. Parametro \`limit\`: predefinito 20, massimo 100.
- Risposta 200: \`{ "items": [...], "total": n }\`. 401 senza utente.
`;

const DISCREPANZE_MD = `# Discrepanze tra documentazione e codice

| # | La documentazione dice | Il codice fa | Dove |
|---|---|---|---|
| 1 | GET /api/notes risponde { data: [...] } | risponde { items, total } | app/api/notes/route.ts |
| 2 | limit massimo 50 | massimo 100 | app/api/notes/route.ts |
| 3 | POST risponde 200 | risponde 201 | app/api/notes/route.ts |
| 4 | /api/health richiede il token | è pubblico, nessuna autenticazione | app/api/health/route.ts |
| 5 | DELETE risponde 200 con la nota | risponde 204 senza body (e 403 se non è il proprietario) | app/api/notes/[id]/route.ts |
`;

const STORIA_MD = `# Storia della risposta di GET /api/notes

La risposta è passata da { data } a { items, total } nel commit 053b271 (Alice Rossi, 2026-09-02).
Nello stesso commit sono cambiati il limite massimo (100) e lo status della creazione (201).

La documentazione docs/api.md non è più stata modificata dopo il commit 942277e (la prima versione): è rimasta indietro.
`;

const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: API note
  version: "1.0"
paths:
  /api/notes:
    get:
      summary: Elenco delle note
      security:
        - bearerAuth: []
      parameters:
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200':
          description: Elenco
          content:
            application/json:
              schema:
                type: object
                properties:
                  items: { type: array, items: { type: object } }
                  total: { type: integer }
        '401':
          description: Non autenticato
    post:
      summary: Crea una nota
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title]
              properties:
                title: { type: string, minLength: 3 }
      responses:
        '201':
          description: Nota creata
        '401':
          description: Non autenticato
        '422':
          description: Titolo non valido
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`;

const here = (name: string, body: string): string => `cat > ${name} <<'EOF'\n${body}EOF`;
const hereP = (name: string, body: string): string => `Set-Content ${name} -Value @'\n${body}'@`;

const common = {
  shells: ['bash', 'pwsh'] as Lesson['shells'],
  setup: setupProject,
};

export const m9: Lesson[] = [
  {
    id: 'M9.L1',
    module: 9,
    n: 1,
    title: 'Trovare le rotte nel codice',
    objective: 'Ricavare dal codice di un progetto Next.js d\'esempio l\'elenco degli endpoint (metodo, percorso, file) usando find e grep, in sola lettura.',
    explain: [
      'Per documentare un\'API che non conosci parti dal codice. In Next.js (App Router) ogni cartella `app/api/<nome>/route.ts` è un percorso, e le funzioni esportate `GET`, `POST`, `DELETE`... sono i metodi. Le cartelle tra parentesi quadre (`[id]`) sono parametri di percorso: nella documentazione diventano `{id}`.',
      'Le funzioni serverless (cartella `api/`, file `.js`) hanno invece il percorso uguale al nome del file e controllano il metodo dentro la funzione.',
      'Lavori in SOLA LETTURA su un progetto d\'esempio ("demo-note", non è un tuo progetto): leggi, cerca, non modifichi.',
    ],
    ...common,
    guided: [
      { title: 'Struttura del progetto', cmd: { bash: 'find ~/corso-cli/m9l1/progetto -type f -not -path "*/.git/*"', pwsh: 'Get-ChildItem ~/corso-cli/m9l1/progetto -Recurse -File | ForEach-Object { $_.FullName }' }, what: 'Elenca i file del progetto.', who: 'find / Get-ChildItem.', parts: ['-type f: solo file'], expect: 'Elenco con app/api/..., api/webhook-polar.js, docs/api.md.', risk: 'Nessuno.', contains: 'webhook-polar.js' },
      { title: 'Solo i file delle rotte', cmd: { bash: 'find ~/corso-cli/m9l1/progetto/app -name route.ts', pwsh: 'Get-ChildItem ~/corso-cli/m9l1/progetto/app -Recurse -Filter route.ts | ForEach-Object { $_.FullName }' }, what: 'Trova i file che definiscono le rotte.', who: 'find -name / -Filter.', parts: ['-name route.ts: nome del file'], expect: 'Tre file route.ts.', risk: 'Nessuno.', contains: 'route.ts' },
      { title: 'I metodi esportati', cmd: { bash: 'grep -rn "export async function" ~/corso-cli/m9l1/progetto/app', pwsh: 'Get-ChildItem ~/corso-cli/m9l1/progetto/app -Recurse -Filter route.ts | Select-String -Pattern "export async function"' }, what: 'Elenca le funzioni esportate: ognuna è un metodo HTTP.', who: 'grep -rn / Select-String.', parts: ['-r: ricorsivo', '-n: numero di riga'], expect: 'Righe come "export async function GET".', risk: 'Nessuno.', contains: 'export async function GET' },
    ],
    predict: [
      {
        prompt: 'Quanti metodi diversi vedrai in app/api/notes/[id]/route.ts? Annota una stima.',
        cmd: { bash: 'grep -c "export async function" "$HOME/corso-cli/m9l1/progetto/app/api/notes/[id]/route.ts"', pwsh: '(Select-String -Pattern "export async function" -Path "$HOME/corso-cli/m9l1/progetto/app/api/notes/[id]/route.ts" -SimpleMatch).Count' },
        expect: '2 (GET e DELETE).',
        why: 'Ogni funzione esportata è un metodo supportato su quel percorso.',
      },
    ],
    negative: {
      prompt: 'Una funzione serverless non ha `export async function`: la stessa ricerca la trova?',
      cmd: { bash: 'grep -c "export async function" ~/corso-cli/m9l1/progetto/api/webhook-polar.js', pwsh: '(Select-String -Pattern "export async function" -Path ~/corso-cli/m9l1/progetto/api/webhook-polar.js -SimpleMatch | Measure-Object).Count' },
      explain: '0: usa `module.exports` e controlla `req.method` dentro. Strutture diverse richiedono ricerche diverse.',
    },
    task: {
      text: 'In ~/corso-cli/m9l1/rotte.md scrivi una tabella (Metodo, Percorso, File) con TUTTE le rotte del progetto: usa {id} per i parametri di percorso.',
      criterion: 'Le 6 rotte ci sono con il file giusto; hai cercato nel codice con find o grep (o Get-ChildItem/Select-String).',
    },
    checks: [
      {
        id: 'rotte',
        description: 'rotte.md elenca le 6 rotte del progetto',
        expected: 'GET/POST /api/notes, GET/DELETE /api/notes/{id}, GET /api/health, POST /api/webhook-polar',
        test: (c) => {
          const md = normPath(c.read('rotte.md') ?? '');
          const missing = ROUTES.filter(([m, p]) => !md.split('\n').some((l) => l.includes(m) && l.includes(p + ' ') || (l.includes(m) && l.trim().endsWith(p)) || (l.includes(m) && new RegExp(p.replace(/[{}]/g, '\\$&') + '(\\s|\\||$)').test(l)))).map(([m, p]) => `${m} ${p}`);
          return { pass: missing.length === 0, actual: missing.length ? 'mancano: ' + missing.join(', ') : 'ok' };
        },
        onFail: 'Cerca tutte le route.ts e la funzione serverless: una riga per metodo e percorso, con {id} per i parametri.',
      },
      {
        id: 'file',
        description: 'Ogni rotta indica il file che la implementa',
        expected: 'route.ts e webhook-polar.js',
        test: (c) => {
          const md = c.read('rotte.md') ?? '';
          const ok = /notes\/route\.ts/.test(md) && /\[id\]\/route\.ts/.test(md) && /health\/route\.ts/.test(md) && /webhook-polar\.js/.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'file mancanti o imprecisi' };
        },
        onFail: 'Aggiungi la colonna File con il percorso relativo (per esempio app/api/notes/route.ts).',
      },
      {
        id: 'ricerca',
        description: 'Hai cercato nel codice (find/grep o Get-ChildItem/Select-String)',
        expected: 'almeno una ricerca',
        test: (c) => {
          const ok = cmdMatches(c, pick(c, /\b(find|grep)\b/, /Get-ChildItem|Select-String/i));
          return { pass: ok, actual: ok ? 'sì' : 'nessuna ricerca' };
        },
        onFail: 'Non indovinare le rotte: cercale nel codice.',
      },
    ],
    example: { text: 'Esempio analogo: cercare i file di un tipo.', cmd: { bash: 'find ~/corso-cli/m9l1/progetto -name "*.md"', pwsh: 'Get-ChildItem ~/corso-cli/m9l1/progetto -Recurse -Filter *.md | ForEach-Object { $_.FullName }' } },
    hints: ['Le rotte Next.js sono i file route.ts sotto app/api; i metodi sono le funzioni esportate. Non dimenticare la cartella api/ con la funzione serverless.', 'Le cartelle tra parentesi quadre sono parametri: [id] → {id}.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l1', 'find progetto/app progetto/api -type f', 'grep -rn "export async function" progetto/app', 'grep -n "req.method" progetto/api/webhook-polar.js', here('rotte.md', ROTTE_MD)],
      pwsh: ['cd ~/corso-cli/m9l1', 'Get-ChildItem progetto/app, progetto/api -Recurse -File | ForEach-Object { $_.FullName }', 'Get-ChildItem progetto/app -Recurse -Filter route.ts | Select-String -Pattern "export async function"', 'Select-String -Pattern "req.method" -Path progetto/api/webhook-polar.js', hereP('rotte.md', ROTTE_MD)],
    },
    summary: ['rotte = file nel progetto', 'metodi = funzioni esportate', '[id] diventa {id}', 'lettura senza modifiche'],
    skills: ['comandi', 'docs', 'http'],
    concepts: ['rotte Next.js', 'funzioni serverless', 'find e grep su un progetto'],
  },
  {
    id: 'M9.L2',
    module: 9,
    n: 2,
    title: 'Leggere un handler e ricavarne il contratto',
    objective: 'Leggere il codice di due handler e ricavarne autenticazione, parametri, validazioni e risposte, senza eseguire nulla.',
    explain: [
      'Il contratto di un endpoint si legge nel codice in quest\'ordine: 1) chi può chiamarlo (controllo dell\'utente), 2) cosa riceve (parametri di query, body e validazioni), 3) cosa risponde (status e forma del body), 4) quali errori restituisce. Ogni `return NextResponse.json(..., { status })` è una risposta possibile.',
      'Distingui sempre ciò che il codice FA da ciò che pensi voglia fare: se un comportamento non è nel codice, non va nella documentazione.',
    ],
    ...common,
    guided: [
      { title: 'Leggere l\'handler', cmd: { bash: 'cat ~/corso-cli/m9l2/progetto/app/api/notes/route.ts', pwsh: 'Get-Content ~/corso-cli/m9l2/progetto/app/api/notes/route.ts' }, what: 'Mostra GET e POST di /api/notes.', who: 'cat / Get-Content.', parts: [], expect: 'Due funzioni, ognuna con controllo dell\'utente.', risk: 'Nessuno.', contains: 'validation_failed' },
      { title: 'Tutte le risposte possibili', cmd: { bash: 'grep -n "status" ~/corso-cli/m9l2/progetto/app/api/notes/route.ts', pwsh: 'Select-String -Pattern "status" -Path ~/corso-cli/m9l2/progetto/app/api/notes/route.ts' }, what: 'Elenca le righe che impostano uno status.', who: 'grep / Select-String.', parts: [], expect: '401, 422 e 201 (POST), 401 (GET).', risk: 'Nessuno.', contains: '422' },
      { title: 'Come si autentica', cmd: { bash: 'cat ~/corso-cli/m9l2/progetto/lib/auth.ts', pwsh: 'Get-Content ~/corso-cli/m9l2/progetto/lib/auth.ts' }, what: 'Legge la funzione che ricava l\'utente.', who: 'cat / Get-Content.', parts: [], expect: 'Header Authorization: Bearer oppure cookie session.', risk: 'Nessuno.', contains: 'Bearer' },
    ],
    predict: [
      {
        prompt: 'Se invii {"title":"ab"} a POST /api/notes con un token valido, che status ti aspetti? Cerca nel codice la condizione.',
        cmd: { bash: 'grep -n "length" ~/corso-cli/m9l2/progetto/app/api/notes/route.ts', pwsh: 'Select-String -Pattern "length" -Path ~/corso-cli/m9l2/progetto/app/api/notes/route.ts' },
        expect: '422: il titolo ha meno di 3 caratteri.',
        why: 'La condizione è nel codice: title.length < 3.',
      },
    ],
    negative: {
      prompt: 'Cosa dice il codice sul limite massimo di `limit`? Cerca "Math.min".',
      cmd: { bash: 'grep -n "Math.min" ~/corso-cli/m9l2/progetto/app/api/notes/route.ts', pwsh: 'Select-String -Pattern "Math.min" -Path ~/corso-cli/m9l2/progetto/app/api/notes/route.ts' },
      explain: 'Un valore oltre il massimo NON dà errore: viene ridotto a 100. È un comportamento da documentare ("massimo 100, valori maggiori sono limitati").',
    },
    task: {
      text: 'In ~/corso-cli/m9l2/contratto.md descrivi POST /api/notes (autenticazione, body e validazione, risposte) e GET /api/notes (parametro limit, forma della risposta).',
      criterion: 'Il documento contiene Bearer/Authorization, title obbligatorio di almeno 3 caratteri, gli status 201/401/422, limit (default 20, massimo 100) e la proprietà items.',
    },
    checks: [
      {
        id: 'auth',
        description: 'Autenticazione descritta',
        expected: 'Authorization: Bearer',
        test: (c) => {
          const md = c.read('contratto.md') ?? '';
          return { pass: /authorization/i.test(md) && /bearer/i.test(md), actual: /bearer/i.test(md) ? 'Bearer presente' : 'manca Bearer/Authorization' };
        },
        onFail: 'Leggi lib/auth.ts: come arriva il token?',
      },
      {
        id: 'post',
        description: 'POST: title obbligatorio (≥3 caratteri) e risposte 201/401/422',
        expected: 'title, 3 caratteri, 201, 401, 422',
        test: (c) => {
          const md = c.read('contratto.md') ?? '';
          const ok = { title: /title/.test(md), min: /(almeno 3|minimo 3|min\.? ?3|≥ ?3|3 caratteri|minLength)/i.test(md), codes: ['201', '401', '422'].every((s) => md.includes(s)) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Nel codice di POST: quale campo serve, con quale vincolo, e quali status restituisce?',
      },
      {
        id: 'get',
        description: 'GET: limit (20, massimo 100) e risposta con items',
        expected: 'limit, 20, 100, items',
        test: (c) => {
          const md = c.read('contratto.md') ?? '';
          const ok = { limit: /limit/.test(md), d20: /20/.test(md), max: /100/.test(md), items: /items/.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Nel codice di GET: valore predefinito e massimo di limit, e forma del body (non della documentazione esistente!).',
      },
    ],
    example: { text: 'Esempio analogo: elencare gli status di un altro handler.', cmd: { bash: 'grep -n "status" ~/corso-cli/m9l2/progetto/app/api/notes/[id]/route.ts', pwsh: 'Select-String -Pattern "status" -Path "$HOME/corso-cli/m9l2/progetto/app/api/notes/[id]/route.ts" -SimpleMatch' } },
    hints: ['Parti da lib/auth.ts per l\'autenticazione, poi leggi POST e GET riga per riga.', 'Non copiare dalla documentazione esistente (docs/api.md): serve il comportamento del codice.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l2', 'cat progetto/lib/auth.ts', 'cat progetto/app/api/notes/route.ts', here('contratto.md', CONTRATTO_MD)],
      pwsh: ['cd ~/corso-cli/m9l2', 'Get-Content progetto/lib/auth.ts', 'Get-Content progetto/app/api/notes/route.ts', hereP('contratto.md', CONTRATTO_MD)],
    },
    summary: ['contratto = chi, cosa riceve, cosa risponde, errori', 'ogni return con status è una risposta possibile', 'il codice prevale sulla documentazione vecchia'],
    skills: ['docs', 'http', 'output'],
    concepts: ['lettura di un handler', 'validazione e status', 'limit e massimo'],
  },
  {
    id: 'M9.L3',
    module: 9,
    n: 3,
    title: 'Confrontare codice e documentazione esistente',
    objective: 'Trovare le discrepanze tra la documentazione esistente (docs/api.md) e il comportamento del codice, citando l\'evidenza.',
    explain: [
      'La documentazione invecchia: il codice cambia e il testo resta. Il controllo è un confronto, affermazione per affermazione: "la documentazione dice X; il codice fa Y (file e riga)".',
      'Non basta trovare la differenza: serve l\'evidenza (file) e la correzione proposta. In questo progetto ci sono cinque punti non allineati; ne devi trovare almeno quattro.',
    ],
    ...common,
    guided: [
      { title: 'La documentazione esistente', cmd: { bash: 'cat ~/corso-cli/m9l3/progetto/docs/api.md', pwsh: 'Get-Content ~/corso-cli/m9l3/progetto/docs/api.md' }, what: 'Legge ciò che afferma la documentazione.', who: 'cat / Get-Content.', parts: [], expect: 'Cinque sezioni di endpoint.', risk: 'Nessuno.', contains: 'GET /api/notes' },
      { title: 'Un\'affermazione alla volta', cmd: { bash: 'grep -n "NextResponse.json" ~/corso-cli/m9l3/progetto/app/api/notes/route.ts', pwsh: 'Select-String -Pattern "NextResponse.json" -Path ~/corso-cli/m9l3/progetto/app/api/notes/route.ts' }, what: 'Confronta la forma delle risposte con quanto dice la documentazione.', who: 'grep / Select-String.', parts: [], expect: 'Risposte con items e total.', risk: 'Nessuno.', contains: 'items' },
      { title: 'Chi ha il file in lettura', cmd: { bash: 'cat ~/corso-cli/m9l3/progetto/app/api/health/route.ts', pwsh: 'Get-Content ~/corso-cli/m9l3/progetto/app/api/health/route.ts' }, what: 'Verifica se /api/health richiede il token.', who: 'cat / Get-Content.', parts: [], expect: 'Nessun controllo dell\'utente.', risk: 'Nessuno.', contains: 'pubblico' },
    ],
    predict: [
      {
        prompt: 'La documentazione dice che DELETE risponde 200 con la nota eliminata. Cosa trovi nel codice?',
        cmd: { bash: 'grep -n "status: 204\\|status: 200\\|status: 403" "$HOME/corso-cli/m9l3/progetto/app/api/notes/[id]/route.ts"', pwsh: 'Select-String -Pattern "status: 204|status: 200|status: 403" -Path "$HOME/corso-cli/m9l3/progetto/app/api/notes/[id]/route.ts"' },
        expect: '204 (nessun body) e 403 se la nota non è dell\'utente.',
        why: 'La documentazione descrive la prima versione: il codice è cambiato.',
      },
    ],
    negative: {
      prompt: 'Una discrepanza è sempre un errore della documentazione? Cosa fai se il CODICE è sbagliato?',
      cmd: { bash: 'echo "Segnala la discrepanza: decide il responsabile del prodotto se correggere il codice o la documentazione"', pwsh: 'echo "Segnala la discrepanza: decide il responsabile del prodotto se correggere il codice o la documentazione"' },
      explain: 'Documenti il comportamento reale, ma una differenza può anche essere un bug: segnalala invece di correggerla in silenzio.',
    },
    task: {
      text: 'In ~/corso-cli/m9l3/discrepanze.md elenca almeno quattro discrepanze: cosa dice la documentazione, cosa fa il codice, in quale file.',
      criterion: 'Almeno 4 delle 5 discrepanze (forma della risposta, limite massimo, status della creazione, autenticazione di health, risposta di DELETE) con il file di evidenza.',
    },
    checks: [
      {
        id: 'discrepanze',
        description: 'Almeno 4 discrepanze corrette su 5',
        expected: 'items/data, 100/50, 201/200, health pubblico, DELETE 204',
        test: (c) => {
          const md = c.read('discrepanze.md') ?? '';
          const found: Record<string, boolean> = {
            items: /items/.test(md) && /data/.test(md),
            limite: /100/.test(md) && /50/.test(md),
            creazione: /201/.test(md) && /200/.test(md),
            health: /health/i.test(md) && /(pubblic|senza (token|auth)|non richiede|nessuna autentic)/i.test(md),
            delete: /204/.test(md) && /delete/i.test(md),
          };
          const n = Object.values(found).filter(Boolean).length;
          return { pass: n >= 4, actual: `${n}/5 (${Object.entries(found).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'tutte'})` };
        },
        onFail: 'Confronta ogni sezione di docs/api.md con il codice: forma della risposta, limite, status di POST, autenticazione di health, risposta di DELETE.',
      },
      {
        id: 'evidenza',
        description: 'Ogni discrepanza cita il file che la prova',
        expected: 'route.ts citato',
        test: (c) => {
          const md = c.read('discrepanze.md') ?? '';
          const n = (md.match(/route\.ts/g) ?? []).length;
          return { pass: n >= 4, actual: `${n} riferimenti a route.ts` };
        },
        onFail: 'Indica per ciascuna discrepanza il file del codice (per esempio app/api/notes/route.ts).',
      },
    ],
    example: { text: 'Esempio analogo: una riga di confronto.', cmd: { bash: 'echo "| 1 | la documentazione dice X | il codice fa Y | file |"', pwsh: 'echo "| 1 | la documentazione dice X | il codice fa Y | file |"' } },
    hints: ['Procedi a coppie: sezione della documentazione → riga del codice che la smentisce.', 'Cinque punti: forma della risposta, limite massimo, status di POST, health, DELETE.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l3', 'cat progetto/docs/api.md', 'grep -n "status\\|NextResponse.json" progetto/app/api/notes/route.ts', 'cat progetto/app/api/health/route.ts', here('discrepanze.md', DISCREPANZE_MD)],
      pwsh: ['cd ~/corso-cli/m9l3', 'Get-Content progetto/docs/api.md', 'Select-String -Pattern "status|NextResponse.json" -Path progetto/app/api/notes/route.ts', 'Get-Content progetto/app/api/health/route.ts', hereP('discrepanze.md', DISCREPANZE_MD)],
    },
    summary: ['confronto affermazione per affermazione', 'evidenza = file e riga', 'una discrepanza può essere un bug del codice'],
    skills: ['docs', 'diagnosi', 'output'],
    concepts: ['audit della documentazione', 'evidenza dal codice', 'discrepanze'],
  },
  {
    id: 'M9.L4',
    module: 9,
    n: 4,
    title: 'Git in sola lettura: quando e perché è cambiato',
    objective: 'Usare git log, show e blame per scoprire quando e da chi è stato cambiato un comportamento, senza modificare il repository.',
    explain: [
      'La cronologia di Git spiega il PERCHÉ di un cambiamento: `git log` elenca i commit, `git show <commit>` mostra cosa è cambiato, `git blame <file>` dice chi ha scritto ogni riga e in quale commit. Per un technical writer serve a capire da quando una documentazione è in ritardo.',
      'Nel laboratorio il repository è d\'esempio e Git è SOLO in lettura (status, log, show, diff, blame, branch). I comandi che scrivono (add, commit, push, checkout...) restano nel tutor in terminale, su repository veri.',
    ],
    ...common,
    guided: [
      { title: 'La cronologia', cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git log --oneline', pwsh: 'cd ~/corso-cli/m9l4/progetto; git log --oneline' }, what: 'Elenca i commit, uno per riga.', who: 'git log.', parts: ['--oneline: hash abbreviato e messaggio'], expect: 'Cinque commit, il più recente in alto.', risk: 'Nessuno.', contains: 'Aggiunge il webhook Polar' },
      { title: 'La storia di un solo file', cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git log --oneline -- app/api/notes/route.ts', pwsh: 'cd ~/corso-cli/m9l4/progetto; git log --oneline -- app/api/notes/route.ts' }, what: 'Mostra solo i commit che hanno toccato quel file.', who: 'git log -- percorso.', parts: ['--: separa le opzioni dal percorso'], expect: 'Tre commit.', risk: 'Nessuno.', contains: 'Valida il titolo' },
      { title: 'Cosa è cambiato', cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git show 43b3490', pwsh: 'cd ~/corso-cli/m9l4/progetto; git show 43b3490' }, what: 'Mostra autore, data e modifiche di un commit.', who: 'git show.', parts: ['righe con - rimosse, con + aggiunte'], expect: 'Aggiunta della validazione del titolo.', risk: 'Nessuno.', contains: 'validation_failed' },
      { title: 'Chi ha scritto una riga', cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git blame -L 8,10 app/api/notes/route.ts', pwsh: 'cd ~/corso-cli/m9l4/progetto; git blame -L 8,10 app/api/notes/route.ts' }, what: 'Attribuisce le righe 8–10 al commit e all\'autore.', who: 'git blame.', parts: ['-L 8,10: intervallo di righe'], expect: 'Hash, autore e data per ogni riga.', risk: 'Nessuno.', contains: 'Alice Rossi' },
    ],
    predict: [
      {
        prompt: 'Qualcuno prova a salvare una modifica con git commit. Cosa succede nel laboratorio?',
        cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git commit -m prova', pwsh: 'cd ~/corso-cli/m9l4/progetto; git commit -m prova' },
        expect: 'Errore esplicito: il laboratorio ha Git in sola lettura.',
        why: 'Un comando che modifica il repository non deve partire per sbaglio.',
      },
    ],
    negative: {
      prompt: 'Fuori da un repository Git, cosa risponde git?',
      cmd: { bash: 'cd ~ && git log', pwsh: 'cd ~; git log' },
      explain: 'fatal: not a git repository: controlla in quale cartella ti trovi (prompt!).',
    },
    task: {
      text: 'Scopri in quale commit la risposta di GET /api/notes è passata da { data } a { items, total }: scrivi in ~/corso-cli/m9l4/storia.md hash, autore e data di quel commit, e l\'hash dell\'ultimo commit che ha modificato docs/api.md.',
      criterion: 'storia.md contiene 053b271, Alice Rossi, 2026-09-02 e 942277e; hai usato git log/show/blame; il repository non è stato modificato.',
    },
    checks: [
      {
        id: 'commit',
        description: 'storia.md: commit, autore e data del cambiamento',
        expected: '053b271, Alice Rossi, 2026-09-02',
        test: (c) => {
          const md = c.read('storia.md') ?? '';
          const ok = { hash: /053b271/.test(md), autore: /Alice/.test(md), data: /2026-09-02|2 settembre 2026|Sep 2 2026|02\/09\/2026/.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Ricostruisci la storia di app/api/notes/route.ts con git log e git show: quale commit introduce "items"?',
      },
      {
        id: 'docs',
        description: 'storia.md: ultimo commit che ha toccato docs/api.md',
        expected: '942277e',
        test: (c) => ({ pass: /942277e/.test(c.read('storia.md') ?? ''), actual: /942277e/.test(c.read('storia.md') ?? '') ? 'ok' : 'hash non trovato' }),
        onFail: 'git log --oneline -- docs/api.md mostra l\'ultimo commit che ha modificato il file.',
      },
      {
        id: 'git',
        description: 'Hai interrogato la cronologia con git',
        expected: 'git log/show/blame',
        test: (c) => ({ pass: cmdMatches(c, /\bgit\s+(log|show|blame)\b/), actual: cmdMatches(c, /\bgit\s+(log|show|blame)\b/) ? 'sì' : 'nessun comando git' }),
        onFail: 'Usa git log, git show o git blame.',
      },
      {
        id: 'lettura',
        description: 'Il repository non è stato modificato',
        expected: 'git status pulito',
        test: (c) => {
          const f = c.read('progetto/app/api/notes/route.ts');
          const ok = f === DEMO_HEAD['app/api/notes/route.ts'] && c.read('progetto/docs/api.md') === DEMO_HEAD['docs/api.md'];
          return { pass: ok, actual: ok ? 'file invariati' : 'file del progetto modificati' };
        },
        onFail: 'Il progetto è in sola lettura: se hai modificato file, ripristina la lezione (Ricomincia).',
      },
    ],
    example: { text: 'Esempio analogo: la storia di un altro file.', cmd: { bash: 'cd ~/corso-cli/m9l4/progetto && git log --oneline -- app/api/health/route.ts', pwsh: 'cd ~/corso-cli/m9l4/progetto; git log --oneline -- app/api/health/route.ts' } },
    hints: ['git log --oneline -- percorso mostra i commit del file; git show <hash> mostra le modifiche.', 'git blame sulla riga con "items" indica direttamente il commit.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l4/progetto', 'git log --oneline -- app/api/notes/route.ts', 'git show 053b271', 'git blame app/api/notes/route.ts', 'git log --oneline -- docs/api.md', 'cd ~/corso-cli/m9l4', here('storia.md', STORIA_MD)],
      pwsh: ['cd ~/corso-cli/m9l4/progetto', 'git log --oneline -- app/api/notes/route.ts', 'git show 053b271', 'git blame app/api/notes/route.ts', 'git log --oneline -- docs/api.md', 'cd ~/corso-cli/m9l4', hereP('storia.md', STORIA_MD)],
    },
    summary: ['log: quando; show: cosa; blame: chi', 'la storia dice da quando la documentazione è in ritardo', 'in lettura non si rompe nulla'],
    skills: ['comandi', 'diagnosi', 'docs'],
    concepts: ['git log, show, blame', 'cronologia di un file', 'Git in sola lettura'],
  },
  {
    id: 'M9.L5',
    module: 9,
    n: 5,
    title: 'OpenAPI in YAML scritto a mano e JSON Schema di base',
    objective: 'Scrivere in YAML una specifica OpenAPI per due endpoint del progetto, con schema JSON del body, risposte e autenticazione, e farla validare.',
    explain: [
      'YAML descrive la stessa struttura del JSON con l\'INDENTAZIONE (solo spazi, mai tabulazioni): una chiave con i due punti, un elemento di lista con un trattino. Un errore di rientro cambia il significato, quindi leggi sempre il messaggio con il numero di riga.',
      'JSON Schema descrive la forma di un body: `type: object`, `required: [campi]`, `properties:` con `type` e vincoli (`minLength`, `maximum`...). In OpenAPI sta sotto `requestBody → content → application/json → schema`.',
      'Il laboratorio legge un sottoinsieme di YAML (mappe, liste, testo, numeri, `[a, b]` e `{k: v}` su una riga); ancore, blocchi multilinea (`|`, `>`) e documenti multipli danno un errore esplicito.',
    ],
    ...common,
    guided: [
      { title: 'Un frammento di esempio', cmd: { bash: 'printf "openapi: 3.0.3\\ninfo:\\n  title: Esempio\\n  version: \\"1.0\\"\\n" | head -4', pwsh: '"openapi: 3.0.3", "info:", "  title: Esempio", "  version: ""1.0""" | Select-Object -First 4' }, what: 'Mostra l\'intestazione minima di un documento OpenAPI.', who: 'printf / array di stringhe.', parts: ['due spazi per livello'], expect: 'Quattro righe: openapi, info, title, version.', risk: 'Nessuno.', contains: 'openapi: 3.0.3' },
      { title: 'Cosa deve descrivere', cmd: { bash: 'cat ~/corso-cli/m9l5/progetto/app/api/notes/route.ts', pwsh: 'Get-Content ~/corso-cli/m9l5/progetto/app/api/notes/route.ts' }, what: 'Rilegge l\'handler da documentare.', who: 'cat / Get-Content.', parts: [], expect: 'GET con limit e POST con title.', risk: 'Nessuno.', contains: 'limit' },
      { title: 'Il verificatore', cmd: { bash: 'echo "Controlla il file con la verifica della lezione (pulsante Verifica)"', pwsh: 'echo "Controlla il file con la verifica della lezione (pulsante Verifica)"' }, what: 'Ricorda che il YAML viene letto e controllato dal laboratorio.', who: 'echo.', parts: [], expect: 'Un promemoria.', risk: 'Nessuno.', contains: 'Verifica' },
    ],
    predict: [
      {
        prompt: 'Se scrivi `title:` con un TAB davanti, cosa succede? Il verificatore ti darà il numero di riga.',
        cmd: { bash: 'echo "gli spazi contano, le tabulazioni non sono ammesse"', pwsh: 'echo "gli spazi contano, le tabulazioni non sono ammesse"' },
        expect: 'Errore: le tabulazioni non sono ammesse.',
        why: 'In YAML la struttura è l\'indentazione: un carattere sbagliato cambia il documento.',
      },
    ],
    negative: {
      prompt: 'Un rientro incoerente (3 spazi dove ne servono 2) è un errore? Pensa a cosa direbbe il verificatore.',
      cmd: { bash: 'echo "sì: indentazione incoerente, con il numero di riga"', pwsh: 'echo "sì: indentazione incoerente, con il numero di riga"' },
      explain: 'Un parser non indovina: segnala la riga dove la struttura diventa ambigua.',
    },
    task: {
      text: 'In ~/corso-cli/m9l5/openapi.yaml scrivi una specifica OpenAPI 3 di GET e POST /api/notes: info, parametro limit (massimo 100), schema JSON del body di POST (title obbligatorio, string, minLength 3), risposte (200 con items e total; 201; 401; 422) e autenticazione Bearer.',
      criterion: 'Il YAML è valido e contiene tutti gli elementi richiesti.',
    },
    checks: [
      {
        id: 'yaml',
        description: 'Il file è YAML valido con openapi 3, info e i due metodi',
        expected: 'openapi: 3.x, info.title/version, GET e POST /api/notes',
        test: (c) => {
          const t = c.read('openapi.yaml');
          if (t === null) return { pass: false, actual: 'openapi.yaml mancante' };
          try {
            const d = parseYaml(t) as any;
            const p = d?.paths?.['/api/notes'];
            const ok = /^3\./.test(String(d?.openapi)) && !!d?.info?.title && d?.info?.version !== undefined && !!p?.get && !!p?.post;
            return { pass: ok, actual: ok ? 'ok' : 'manca openapi 3.x, info o i metodi get/post di /api/notes' };
          } catch (e) {
            return { pass: false, actual: e instanceof YamlError ? e.message : String(e) };
          }
        },
        onFail: 'Controlla l\'indentazione (solo spazi) e che il percorso /api/notes abbia get e post.',
      },
      {
        id: 'schema',
        description: 'Schema JSON del body di POST: title obbligatorio, stringa, minLength 3',
        expected: 'required: [title]; title: {type: string, minLength: 3}',
        test: (c) => {
          try {
            const d = parseYaml(c.read('openapi.yaml') ?? '') as any;
            const s = d?.paths?.['/api/notes']?.post?.requestBody?.content?.['application/json']?.schema;
            const ok = s?.type === 'object' && Array.isArray(s?.required) && s.required.includes('title') && s?.properties?.title?.type === 'string' && s?.properties?.title?.minLength === 3;
            return { pass: !!ok, actual: ok ? 'ok' : 'schema incompleto (type, required, properties.title.type/minLength)' };
          } catch (e) {
            return { pass: false, actual: e instanceof YamlError ? e.message : 'YAML non leggibile' };
          }
        },
        onFail: 'requestBody → content → application/json → schema con type: object, required: [title] e properties.title.',
      },
      {
        id: 'risposte',
        description: 'Risposte, parametro limit e autenticazione Bearer',
        expected: 'GET 200/401, POST 201/401/422, limit max 100, bearerAuth',
        test: (c) => {
          try {
            const d = parseYaml(c.read('openapi.yaml') ?? '') as any;
            const p = d?.paths?.['/api/notes'];
            const gr = p?.get?.responses ?? {};
            const pr = p?.post?.responses ?? {};
            const items = gr['200']?.content?.['application/json']?.schema?.properties;
            const lim = (p?.get?.parameters ?? []).find((x: any) => x?.name === 'limit');
            const sec = d?.components?.securitySchemes?.bearerAuth;
            const uses = JSON.stringify([p?.get?.security, p?.post?.security, d?.security]).includes('bearerAuth');
            const ok = {
              get: '200' in gr && '401' in gr,
              post: '201' in pr && '401' in pr && '422' in pr,
              items: !!items?.items && !!items?.total,
              limit: lim?.in === 'query' && lim?.schema?.maximum === 100,
              bearer: sec?.type === 'http' && sec?.scheme === 'bearer' && uses,
            };
            return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
          } catch (e) {
            return { pass: false, actual: e instanceof YamlError ? e.message : 'YAML non leggibile' };
          }
        },
        onFail: 'Servono: responses 200/401 (GET) e 201/401/422 (POST), limit con maximum 100, items e total nella risposta, securitySchemes.bearerAuth e il suo uso.',
      },
    ],
    example: { text: 'Esempio analogo: un frammento YAML con un parametro.', cmd: { bash: 'printf "parameters:\\n  - name: limit\\n    in: query\\n    schema: { type: integer, maximum: 100 }\\n"', pwsh: '"parameters:", "  - name: limit", "    in: query", "    schema: { type: integer, maximum: 100 }"' } },
    hints: ['Parti dallo scheletro: openapi, info, paths, components. Poi riempi un metodo alla volta e usa "Verifica" spesso: il messaggio indica la riga.', 'Le chiavi degli status vanno tra apici (\'201\') perché siano testo.'],
    solutions: {
      bash: ['cd ~/corso-cli/m9l5', here('openapi.yaml', OPENAPI_YAML)],
      pwsh: ['cd ~/corso-cli/m9l5', hereP('openapi.yaml', OPENAPI_YAML)],
    },
    summary: ['YAML = indentazione con spazi', 'JSON Schema: type, required, properties, minLength', 'OpenAPI: paths → metodo → responses', 'la specifica si valida, non si "spera"'],
    skills: ['docs', 'http', 'testing'],
    concepts: ['OpenAPI in YAML', 'JSON Schema di base', 'validazione di un documento'],
  },
];
