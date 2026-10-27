/** M10 — Sessioni, webhook e flussi di autenticazione (Bash). In PowerShell 5.1 servirebbero WebSession e classi .NET per HMAC, non simulati. */
import type { Lesson, SetupCtx } from '../types.ts';
import { demoPassword, webhookSecret } from '../../engine/api/server.ts';
import { parseTables } from '../../docs/lint.ts';
import { cmdMatches, setupApi } from './helpers.ts';

const PW_NOTE = "Lezione in Bash: in Windows PowerShell 5.1 i cookie si gestiscono con -SessionVariable/-WebSession e la firma HMAC con classi .NET (System.Security.Cryptography.HMACSHA256); il laboratorio non li simula.";

function setupSession(c: SetupCtx): void {
  setupApi(c, { token: false });
  c.setEnvBoth('TASKFLOW_LOGIN_USER', 'bob');
  c.setEnvBoth('TASKFLOW_LOGIN_PASSWORD', demoPassword('development'));
}
function setupWebhook(c: SetupCtx): void {
  setupApi(c, { token: false });
  c.setEnvBoth('TASKFLOW_WEBHOOK_SECRET', webhookSecret('development'));
}

const SESSIONE_MD = `# Sessione con cookie

- Il login (POST /v1/login) risponde con l'header \`Set-Cookie: session=...\`.
- Attributi: \`HttpOnly\` (il JavaScript della pagina non può leggerlo), \`Path=/v1\` (il cookie viene inviato solo alle richieste sotto /v1), \`Max-Age=1800\` (scade dopo 30 minuti), \`SameSite=Lax\`.
- Il client lo rimanda a ogni richiesta con l'header \`Cookie\` (curl: -c salva, -b invia).
- Differenza con Bearer: il cookie lo gestisce il browser da solo; il token Bearer va aggiunto a mano a ogni richiesta.
- Dopo POST /v1/logout il cookie viene cancellato (Max-Age=0) e GET /v1/session risponde 401 no_session.
`;

const WEBHOOK_MD = `# Ricevere un webhook firmato

Il mittente firma ogni notifica; chi la riceve deve verificarla prima di fidarsi.

1. Intestazioni: \`X-Webhook-Timestamp\` (secondi) e \`X-Signature: sha256=<firma>\`.
2. Firma: HMAC con SHA-256 del testo \`<timestamp>.<body>\` (body esattamente come ricevuto), con il segreto condiviso.
3. Si confronta la firma ricevuta con quella calcolata (confronto a tempo costante).
4. Si rifiuta se il timestamp si discosta di oltre 300 secondi (protezione dai replay).
5. Il segreto sta in una variabile d'ambiente, mai nel codice né nella documentazione.

Risposte: 200 se valido; 401 missing_signature, missing_timestamp, stale_timestamp o invalid_signature.
`;

const AUTENTICAZIONE_MD = `# Flussi di autenticazione del servizio

| Meccanismo | Chi lo usa | Dove viaggia | Scadenza | Rischio principale |
|---|---|---|---|---|
| Token Bearer (client credentials) | programmi e script | header Authorization | 1 ora | token copiato nei log o nei comandi |
| Cookie di sessione | browser dopo il login | header Cookie | 30 minuti | furto del cookie, CSRF |
| Firma del webhook (HMAC) | servizi esterni che chiamano il servizio | header X-Signature con timestamp | 5 minuti di tolleranza | segreto condiviso esposto; replay |
| Token personale | utente che automatizza il proprio account | header Authorization | scelta dall'utente | token senza scadenza dimenticato |
`;

const flow = {
  shells: ['bash'] as Lesson['shells'],
};

export const m10: Lesson[] = [
  {
    id: 'M10.L1',
    module: 10,
    n: 1,
    title: 'Sessioni con cookie',
    objective: 'Eseguire un login che restituisce un cookie di sessione, riusarlo, chiudere la sessione e documentare gli attributi del cookie.',
    explain: [
      'Oltre al token Bearer, molte applicazioni web usano una SESSIONE: dopo il login il server risponde con `Set-Cookie: session=...` e il client rimanda quel cookie a ogni richiesta (header `Cookie`). Il browser lo fa da solo; con curl si usano `-c file` (salva i cookie ricevuti) e `-b file` (li invia).',
      'Attributi da conoscere: `HttpOnly` (non leggibile da JavaScript), `Path` (a quali percorsi viene inviato), `Max-Age`/`Expires` (scadenza), `Secure` (solo HTTPS), `SameSite` (limita l\'invio da siti terzi).',
      PW_NOTE,
    ],
    ...flow,
    setup: setupSession,
    guided: [
      { title: 'Senza sessione', cmd: { bash: 'curl -s -i $TASKFLOW_URL/v1/session' }, what: 'Chiede la sessione corrente senza cookie.', who: 'Il server risponde 401 no_session.', parts: [], expect: '401 con codice no_session.', risk: 'Nessuno.', contains: { bash: 'no_session' } },
      { title: 'Il login', cmd: { bash: 'curl -s -i -c /tmp/prova.jar -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}"' }, what: 'Fa il login e salva il cookie ricevuto in un file.', who: 'curl -c salva il cookie; la password viene da una variabile.', parts: ['-c file: salva i cookie', 'la password non è scritta nel comando'], expect: '200 con l\'header Set-Cookie: session=... HttpOnly.', risk: 'Nessuno.', contains: { bash: 'Set-Cookie' } },
      { title: 'Il file dei cookie', cmd: { bash: 'cat /tmp/prova.jar' }, what: 'Mostra il cookie salvato.', who: 'cat.', parts: ['formato Netscape: dominio, percorso, nome, valore'], expect: 'Una riga con il nome session.', risk: 'Il file contiene un segreto: non condividerlo.', contains: { bash: 'session' } },
      { title: 'Usare il cookie', cmd: { bash: 'curl -s -b /tmp/prova.jar $TASKFLOW_URL/v1/session' }, what: 'Chiede la sessione inviando il cookie.', who: 'curl -b invia i cookie del file.', parts: [], expect: '200 con l\'utente.', risk: 'Nessuno.', contains: { bash: 'bob' } },
    ],
    predict: [
      {
        prompt: 'Cosa risponde GET /v1/session se invii un cookie inventato (session=abc)?',
        cmd: { bash: 'curl -s -b "session=abc" $TASKFLOW_URL/v1/session' },
        expect: '401 invalid_session: il cookie è presente ma non valido.',
        why: 'no_session = cookie assente; invalid_session = cookie presente ma errato. Due cause, due messaggi.',
      },
    ],
    negative: {
      prompt: 'Login con password sbagliata:',
      cmd: { bash: 'curl -s -i -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d \'{"username":"bob","password":"sbagliata"}\'' },
      explain: '401 invalid_credentials e nessun Set-Cookie: senza login riuscito non esiste sessione.',
    },
    task: {
      text: 'In ~/corso-cli/m10l1: fai il login salvando il cookie in jar.txt (password dalla variabile!), verifica la sessione (200), esci con POST /v1/logout, verifica di nuovo (401). Poi scrivi sessione.md: nome del cookie, significato degli attributi HttpOnly, Path e Max-Age, e la differenza rispetto al token Bearer.',
      criterion: 'Il registro mostra login 200, session 200, logout 204, session 401 in quest\'ordine; sessione.md spiega gli attributi; nessuna password nei comandi.',
    },
    checks: [
      {
        id: 'sequenza',
        description: 'login 200 → session 200 → logout 204 → session 401',
        expected: 'quattro richieste in ordine',
        test: (c) => {
          const seq = c.apiShell.map((e) => `${e.method} ${e.path} ${e.status}`);
          const want = ['POST /v1/login 200', 'GET /v1/session 200', 'POST /v1/logout 204', 'GET /v1/session 401'];
          let i = 0;
          for (const s of seq) if (s === want[i]) i++;
          return { pass: i === want.length, actual: seq.join('; ') || 'nessuna richiesta' };
        },
        onFail: 'Ordine: login (con -c jar.txt), session con -b jar.txt, logout con -b e -c, session di nuovo.',
      },
      {
        id: 'documento',
        description: 'sessione.md: cookie, HttpOnly, Path, Max-Age e confronto con Bearer',
        expected: 'session, HttpOnly, Path, Max-Age, Bearer',
        test: (c) => {
          const md = c.read('sessione.md') ?? '';
          const ok = { nome: /session/.test(md), httponly: /httponly/i.test(md), path: /path/i.test(md), maxage: /max-age|scadenza|scade/i.test(md), bearer: /bearer/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Leggi l\'header Set-Cookie del login (curl -i) e spiega ogni attributo con parole tue.',
      },
      {
        id: 'segreti',
        description: 'Nessuna password scritta nei comandi',
        expected: 'password solo da $TASKFLOW_LOGIN_PASSWORD',
        test: (c) => {
          const leak = c.cmds.find((x) => x.cmd.includes(demoPassword('development')));
          return { pass: !leak, actual: leak ? 'password in chiaro' : 'ok' };
        },
        onFail: 'Usa $TASKFLOW_LOGIN_PASSWORD nel comando di login.',
      },
    ],
    example: { text: 'Esempio analogo: salvare e riusare i cookie con un altro file.', cmd: { bash: 'curl -s -c /tmp/altro.jar -o /dev/null $TASKFLOW_URL/v1/health && cat /tmp/altro.jar' } },
    hints: ['-c salva i cookie ricevuti, -b invia quelli salvati. Con -i vedi gli header, compreso Set-Cookie.', 'Dopo il logout il cookie viene cancellato dal file: la richiesta successiva non ha sessione.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m10l1',
        'curl -s -i -c jar.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}"',
        'cat jar.txt',
        'curl -s -b jar.txt $TASKFLOW_URL/v1/session',
        'curl -s -b jar.txt -c jar.txt -X POST $TASKFLOW_URL/v1/logout',
        'curl -s -b jar.txt $TASKFLOW_URL/v1/session',
        `cat > sessione.md <<'EOF'\n${SESSIONE_MD}EOF`,
      ],
    },
    summary: ['sessione = cookie rimandato a ogni richiesta', 'HttpOnly, Path, Max-Age, Secure, SameSite', 'no_session vs invalid_session', 'i cookie sono segreti'],
    skills: ['http', 'docs', 'diagnosi'],
    concepts: ['cookie di sessione', 'curl -c e -b', 'attributi dei cookie'],
  },
  {
    id: 'M10.L4',
    module: 10,
    n: 4,
    title: 'Webhook firmati: la callback di un servizio esterno',
    objective: 'Inviare una notifica a un endpoint che richiede una firma HMAC, capire perché viene rifiutata e documentare la procedura di verifica.',
    explain: [
      'Un WEBHOOK è una chiamata che un servizio esterno (per esempio un fornitore di dati) fa al TUO servizio quando succede un evento. Poiché chiunque potrebbe chiamare quell\'indirizzo, la notifica è FIRMATA: il mittente calcola un HMAC (SHA-256) del contenuto con un segreto condiviso e lo manda in un header. Chi riceve ricalcola la firma e la confronta.',
      'Qui la firma copre `<timestamp>.<body>`: includere il tempo impedisce di riutilizzare una notifica intercettata (replay). Il body va firmato esattamente com\'è inviato, byte per byte (con `printf \'%s\'` non si aggiunge un a capo finale).',
      'Il segreto sta in una variabile d\'ambiente (`$TASKFLOW_WEBHOOK_SECRET`): non scriverlo nei comandi, nei log, né nella documentazione.',
      PW_NOTE,
    ],
    ...flow,
    setup: setupWebhook,
    guided: [
      { title: 'Senza firma', cmd: { bash: 'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -d \'{"type":"prova"}\'' }, what: 'Invia una notifica non firmata.', who: 'Il server la rifiuta.', parts: [], expect: '401 missing_signature.', risk: 'Nessuno.', contains: { bash: 'missing_signature' } },
      { title: 'Il tempo corrente', cmd: { bash: 'date +%s' }, what: 'Mostra il tempo in secondi (UNIX) usato nella firma.', who: 'date.', parts: ['+%s: secondi dall\'epoca'], expect: 'Un numero di 10 cifre.', risk: 'Nessuno.' },
      { title: 'Calcolare una firma', cmd: { bash: "printf '%s' abc | openssl dgst -sha256 -hmac \"$TASKFLOW_WEBHOOK_SECRET\"" }, what: 'Calcola l\'HMAC-SHA256 di un testo con il segreto.', who: 'openssl dgst.', parts: ['-hmac chiave: firma con segreto', 'printf \'%s\': nessun a capo finale'], expect: 'Una riga con la firma esadecimale.', risk: 'Il segreto non compare nel comando (variabile).', contains: { bash: 'HMAC' } },
    ],
    predict: [
      {
        prompt: 'Se cambi UNA lettera nel body dopo aver calcolato la firma, la notifica sarà accettata?',
        cmd: { bash: 'TS=$(date +%s); curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: $TS" -H "X-Signature: sha256=00" -d \'{"type":"prova"}\'' },
        expect: '401 invalid_signature.',
        why: 'La firma dipende da ogni byte del contenuto: è proprio il suo scopo.',
      },
    ],
    negative: {
      prompt: 'E con un timestamp vecchio di un\'ora (firma anche corretta)?',
      cmd: { bash: 'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: 1000" -H "X-Signature: sha256=00" -d \'{"type":"prova"}\'' },
      explain: '401 stale_timestamp: oltre la tolleranza (300 s) la notifica è sospetta, anche se la firma fosse giusta.',
    },
    task: {
      text: 'In ~/corso-cli/m10l4 invia tre notifiche a POST /v1/webhooks/receive con body {"type":"nota.creata","id":42}: (1) senza firma → 401; (2) con firma sbagliata → 401; (3) con la firma corretta (HMAC-SHA256 di "<timestamp>.<body>" con il segreto della variabile) → 200. Poi scrivi webhook.md: come si verifica un webhook (header, cosa si firma, algoritmo, tolleranza, dove sta il segreto).',
      criterion: 'Il registro mostra due 401 diversi (missing_signature e invalid_signature) e un 200; webhook.md descrive la procedura senza rivelare il segreto; il segreto non è nei comandi.',
    },
    checks: [
      {
        id: 'richieste',
        description: 'missing_signature, invalid_signature e poi 200',
        expected: '401 + 401 + 200 (in quest\'ordine)',
        test: (c) => {
          const w = c.apiShell.filter((e) => e.path === '/v1/webhooks/receive');
          const kinds = w.map((e) => (e.status === 200 ? 'ok' : /missing_signature/.test(e.resBody ?? '') ? 'missing' : /invalid_signature/.test(e.resBody ?? '') ? 'invalid' : String(e.status)));
          const iM = kinds.indexOf('missing');
          const iI = kinds.indexOf('invalid');
          const iO = kinds.lastIndexOf('ok');
          return { pass: iM >= 0 && iI >= 0 && iO > iM && iO > iI, actual: kinds.join(', ') || 'nessuna richiesta' };
        },
        onFail: 'Serve una notifica senza X-Signature, una con firma sbagliata (ma con timestamp), una valida.',
      },
      {
        id: 'documento',
        description: 'webhook.md: header, firma di timestamp+body, HMAC SHA-256, tolleranza',
        expected: 'X-Signature, X-Webhook-Timestamp, HMAC, SHA-256, 300',
        test: (c) => {
          const md = c.read('webhook.md') ?? '';
          const ok = { sig: /x-signature/i.test(md), ts: /x-webhook-timestamp|timestamp/i.test(md), hmac: /hmac/i.test(md), sha: /sha-?256/i.test(md), tol: /300|5 minuti|cinque minuti/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Descrivi: gli header, cosa viene firmato (timestamp + "." + body), l\'algoritmo, la tolleranza sul tempo.',
      },
      {
        id: 'segreto',
        description: 'Il segreto non compare né nei comandi né nel documento',
        expected: 'solo $TASKFLOW_WEBHOOK_SECRET',
        test: (c) => {
          const sec = webhookSecret('development');
          const leakCmd = c.cmds.some((x) => x.cmd.includes(sec));
          const leakDoc = (c.read('webhook.md') ?? '').includes(sec);
          return { pass: !leakCmd && !leakDoc, actual: leakCmd ? 'segreto in un comando' : leakDoc ? 'segreto nel documento' : 'ok' };
        },
        onFail: 'Usa la variabile d\'ambiente e non scrivere mai il valore del segreto.',
      },
      {
        id: 'strumento',
        description: 'Hai calcolato la firma con openssl',
        expected: 'openssl dgst -sha256 -hmac',
        test: (c) => ({ pass: cmdMatches(c, /openssl\s+dgst.*-hmac/), actual: cmdMatches(c, /openssl\s+dgst.*-hmac/) ? 'sì' : 'nessun calcolo HMAC' }),
        onFail: 'Calcola la firma con openssl dgst -sha256 -hmac "$TASKFLOW_WEBHOOK_SECRET".',
      },
    ],
    example: { text: 'Esempio analogo: la firma di un altro testo, solo l\'esadecimale.', cmd: { bash: "printf '%s' prova | openssl dgst -sha256 -hmac \"$TASKFLOW_WEBHOOK_SECRET\" | awk '{print $NF}'" } },
    hints: ['Calcola la firma su "$TS.$BODY": timestamp, punto, body. Poi invia con -H "X-Webhook-Timestamp: $TS" -H "X-Signature: sha256=$SIG".', 'printf \'%s\' evita l\'a capo finale, che altererebbe la firma.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m10l4',
        "BODY='{\"type\":\"nota.creata\",\"id\":42}'",
        'TS=$(date +%s)',
        'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -d "$BODY"',
        'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: $TS" -H "X-Signature: sha256=00" -d "$BODY"',
        "SIG=$(printf '%s' \"$TS.$BODY\" | openssl dgst -sha256 -hmac \"$TASKFLOW_WEBHOOK_SECRET\" | awk '{print $NF}')",
        'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: $TS" -H "X-Signature: sha256=$SIG" -d "$BODY"',
        `cat > webhook.md <<'EOF'\n${WEBHOOK_MD}EOF`,
      ],
    },
    summary: ['webhook = chiamata in ingresso da un servizio esterno', 'firma HMAC del contenuto con un segreto condiviso', 'timestamp contro i replay', 'il segreto resta in una variabile'],
    skills: ['http', 'diagnosi', 'docs'],
    concepts: ['webhook', 'firma HMAC SHA-256', 'replay e tolleranza', 'gestione dei segreti'],
  },
  {
    id: 'M10.L5',
    module: 10,
    n: 5,
    title: 'Mappa dei flussi di autenticazione',
    objective: 'Confrontare in un documento i meccanismi di autenticazione provati nel corso (token Bearer, cookie di sessione, firma dei webhook, token personale) dopo averli usati.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Per documentare un prodotto reale devi saper dire QUALE meccanismo protegge ciascun accesso, chi lo usa, dove viaggia la credenziale, quanto dura e quale rischio comporta.',
      'Prima usa i tre meccanismi disponibili (una richiesta riuscita ciascuno), poi scrivi la tabella comparativa in autenticazione.md. Il «token personale» (un token a lunga durata creato dall\'utente per automatizzare il proprio account) non ha un endpoint qui: descrivilo in base a ciò che sai.',
    ],
    ...flow,
    autonomous: true,
    setup: (c) => {
      setupSession(c);
      c.setEnvBoth('TASKFLOW_WEBHOOK_SECRET', webhookSecret('development'));
    },
    guided: [
      { title: 'Le variabili disponibili', cmd: { bash: 'env | grep TASKFLOW | cut -d= -f1' }, what: 'Elenca i NOMI delle variabili di configurazione (non i valori).', who: 'env, grep, cut.', parts: ['cut -d= -f1: solo il nome'], expect: 'TASKFLOW_URL, TASKFLOW_CLIENT_ID, TASKFLOW_LOGIN_USER...', risk: 'I valori restano nascosti.', contains: { bash: 'TASKFLOW_WEBHOOK_SECRET' } },
      { title: 'Il token Bearer', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}"' }, what: 'Verifica che il flusso con client credentials funzioni.', who: 'curl.', parts: [], expect: '200', risk: 'Nessuno.', contains: { bash: '200' } },
      { title: 'Il login con sessione', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" -c /tmp/mappa.jar -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}"' }, what: 'Verifica il flusso con cookie.', who: 'curl.', parts: [], expect: '200', risk: 'Nessuno.', contains: { bash: '200' } },
    ],
    predict: [
      {
        prompt: 'Quale dei tre meccanismi scade prima? Controlla le risposte e annota la risposta prima di scrivere la tabella.',
        cmd: { bash: 'curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq .expires_in' },
        expect: '3600 secondi per il token; 1800 per il cookie; 300 di tolleranza per la firma del webhook.',
        why: 'Durata e rischio vanno scritti nella documentazione, non dati per scontati.',
      },
    ],
    negative: {
      prompt: 'Può un cookie di sessione autenticare una chiamata che richiede il Bearer?',
      cmd: { bash: 'curl -s -b /tmp/mappa.jar $TASKFLOW_URL/v1/me' },
      explain: '401: /v1/me si aspetta Authorization: Bearer. Due meccanismi diversi per aree diverse: la documentazione deve dire quale vale dove.',
    },
    task: {
      text: 'In ~/corso-cli/m10l5: esegui una richiesta riuscita per ciascun meccanismo (token Bearer → 200 su /v1/auth/token; login con cookie → 200; webhook firmato → 200). Poi scrivi autenticazione.md con una tabella (Meccanismo, Chi lo usa, Dove viaggia, Scadenza, Rischio principale) con almeno quattro righe: Bearer, cookie di sessione, firma del webhook, token personale.',
      criterion: 'Il registro mostra i tre 200; la tabella ha le colonne richieste e le quattro righe; nessun segreto nei comandi o nel documento.',
    },
    checks: [
      {
        id: 'provati',
        description: 'Tre meccanismi provati: token, login, webhook firmato',
        expected: 'auth/token 200, login 200, webhooks/receive 200',
        test: (c) => {
          const ok = {
            token: c.apiShell.some((e) => e.path === '/v1/auth/token' && e.status === 200),
            login: c.apiShell.some((e) => e.path === '/v1/login' && e.status === 200),
            webhook: c.apiShell.some((e) => e.path === '/v1/webhooks/receive' && e.status === 200),
          };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Ottieni un token, fai il login con cookie e invia un webhook con firma valida (vedi M4.L3, M10.L1, M10.L4).',
      },
      {
        id: 'tabella',
        description: 'Tabella comparativa con colonne e quattro righe',
        expected: 'Meccanismo, Chi lo usa, Dove viaggia, Scadenza, Rischio; Bearer, cookie, webhook, token personale',
        test: (c) => {
          const md = c.read('autenticazione.md') ?? '';
          const t = parseTables(md).find((x) => ['meccanismo', 'chi', 'dove', 'scadenza', 'rischio'].every((k) => x.header.some((h) => h.toLowerCase().includes(k))));
          const text = (t?.rows ?? []).map((r) => r.join(' ')).join(' ').toLowerCase();
          const ok = { tabella: !!t, righe: (t?.rows.length ?? 0) >= 4, bearer: /bearer/.test(text), cookie: /cookie|sessione/.test(text), webhook: /webhook|hmac|firma/.test(text), personale: /personale/.test(text) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Serve una tabella Markdown con le cinque colonne e almeno quattro righe: Bearer, cookie di sessione, firma del webhook, token personale.',
      },
      {
        id: 'segreti',
        description: 'Nessun segreto nei comandi o nel documento',
        expected: 'solo variabili',
        test: (c) => {
          const secrets = [webhookSecret('development'), demoPassword('development')];
          const leak = secrets.some((s) => c.cmds.some((x) => x.cmd.includes(s)) || (c.read('autenticazione.md') ?? '').includes(s));
          return { pass: !leak, actual: leak ? 'segreto in chiaro' : 'ok' };
        },
        onFail: 'Usa le variabili d\'ambiente e non riportare i valori nel documento.',
      },
    ],
    example: { text: 'Esempio analogo: una riga di tabella.', cmd: { bash: 'echo "| Bearer | script | header Authorization | 1 ora | token nei log |"' } },
    hints: ['Per ogni meccanismo rispondi a quattro domande: chi lo usa, dove viaggia, quanto dura, cosa può andare storto.', 'Le durate le trovi nelle risposte (expires_in, Max-Age) e nelle lezioni M4.L3, M10.L1, M10.L4.'],
    reference: {
      bash: [
        'cd ~/corso-cli/m10l5',
        'curl -s -X POST $TASKFLOW_URL/v1/auth/token -H "Content-Type: application/json" -d "{\\"client_id\\":\\"$TASKFLOW_CLIENT_ID\\",\\"client_secret\\":\\"$TASKFLOW_CLIENT_SECRET\\"}" | jq .expires_in',
        'curl -s -c jar.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}"',
        "BODY='{\"type\":\"prova\"}'",
        'TS=$(date +%s)',
        "SIG=$(printf '%s' \"$TS.$BODY\" | openssl dgst -sha256 -hmac \"$TASKFLOW_WEBHOOK_SECRET\" | awk '{print $NF}')",
        'curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: $TS" -H "X-Signature: sha256=$SIG" -d "$BODY"',
        `cat > autenticazione.md <<'EOF'\n${AUTENTICAZIONE_MD}EOF`,
      ],
    },
    summary: ['ogni accesso ha il suo meccanismo', 'chi, dove, quanto dura, quale rischio', 'i segreti non vanno nei documenti'],
    skills: ['docs', 'http', 'autonomia'],
    concepts: ['flussi di autenticazione', 'confronto di meccanismi', 'documentare la sicurezza'],
  },
];
