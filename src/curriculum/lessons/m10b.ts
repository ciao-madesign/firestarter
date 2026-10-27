/** M10 — lezioni aggiunte il 2026-10-27: CSRF e SameSite, lettura di un JWT. Le due lezioni usano curl (curl.exe in PowerShell 5.1). */
import type { Lesson, SetupCtx } from '../types.ts';
import { demoPassword, makeJwt } from '../../engine/api/server.ts';
import { parseTables } from '../../docs/lint.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

function setupSession(c: SetupCtx): void {
  setupApi(c, { token: false });
  c.setEnvBoth('TASKFLOW_LOGIN_USER', 'bob');
  c.setEnvBoth('TASKFLOW_LOGIN_PASSWORD', demoPassword('development'));
}

const LOGIN_B = 'curl -s -c jar.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}"';
const LOGIN_P = '@{ username = $env:TASKFLOW_LOGIN_USER; password = $env:TASKFLOW_LOGIN_PASSWORD } | ConvertTo-Json -Compress | curl.exe -s -c jar.txt -X POST "$env:TASKFLOW_URL/v1/login" -H "Content-Type: application/json" -d "@-"';

const CSRF_MD = `# CSRF e cookie di sessione

## Il problema

Il browser invia automaticamente il cookie di sessione a ogni richiesta verso il sito che lo ha emesso, anche quando la richiesta è provocata da un'altra pagina (per esempio un modulo nascosto su un sito malevolo). Il server vede un cookie valido e non distingue la richiesta voluta da quella provocata: è il CSRF (cross-site request forgery).

## Le difese provate

| Caso | Richiesta | Risposta | Perché |
|---|---|---|---|
| Senza token | POST /v1/session/profile con cookie, senza X-CSRF-Token | 403 csrf_token_missing | il cookie viaggia da solo, il token no: un altro sito non può leggerlo |
| Origine estranea | stesso POST con token ma Origin: https://sito-cattivo.test | 403 csrf_origin_mismatch | il server controlla da quale sito parte la richiesta |
| Richiesta legittima | POST con cookie e token letto da GET /v1/session | 200 | l'app legittima conosce il token |

## SameSite

Il cookie di login ha SameSite=Lax: il browser non lo invia nelle richieste POST provenienti da un altro sito. È una difesa del browser, che si aggiunge a quelle del server.

## E il token Bearer?

Il token nell'header Authorization non viene aggiunto dal browser in automatico: il codice dell'app lo inserisce a ogni richiesta, quindi un altro sito non può sfruttarlo con questo meccanismo.
`;

const JWT_MD = `# Leggere un JWT

Un JWT ha tre parti separate da un punto: header, payload e firma, tutte codificate in base64url.

| Token | Header | Claim principali | Esito sul server | Perché |
|---|---|---|---|---|
| valido.jwt | alg HS256 | sub bob, iss taskflow, exp nel futuro | 200 | firma corretta e non scaduto |
| scaduto.jwt | alg HS256 | sub bob, exp nel passato | 401 token_expired | l'exp è già passato |
| manomesso.jwt | alg HS256 | sub alice, role admin | 401 invalid_signature | il payload è stato cambiato ma la firma è rimasta quella del token originale |

## Cosa si può e non si può concludere

- Il payload NON è cifrato: chiunque abbia il token lo legge con un decodificatore base64. Non va mai messo nel payload nulla di riservato.
- Leggere il payload non dice se il token è valido: solo il server, che conosce il segreto, può verificare la firma.
- Il ruolo dichiarato nel payload non conta: i permessi li decide il server. Cambiare il contenuto invalida la firma.
- Il campo exp è la scadenza in secondi UNIX (data in formato numerico).
`;

export const m10b: Lesson[] = [
  {
    id: 'M10.L2',
    module: 10,
    n: 2,
    title: 'CSRF e SameSite: perché il cookie da solo non basta',
    objective: 'Vedere come una richiesta con cookie valido può essere rifiutata e spiegare le difese: token anti-CSRF, controllo dell\'origine e SameSite.',
    explain: [
      'Il browser invia il cookie di sessione A OGNI richiesta verso il sito che lo ha emesso, anche se a provocarla è un\'altra pagina. Un sito malevolo può quindi far partire dal tuo browser una richiesta che modifica i tuoi dati, e il server la vede come tua: è il CSRF (cross-site request forgery). Con un token Bearer nell\'header non succede, perché il browser non lo aggiunge da solo.',
      'Le difese: 1) l\'attributo `SameSite` del cookie (con `Lax` il browser non lo manda nelle richieste POST che arrivano da un altro sito); 2) un TOKEN ANTI-CSRF che l\'app legittima conosce e invia in un header (`X-CSRF-Token`), mentre un altro sito non può leggerlo; 3) il controllo dell\'header `Origin`. Qui il server le applica a `POST /v1/session/profile`: il token si legge con `GET /v1/session` (campo `csrfToken`).',
      'In PowerShell 5.1 usi curl.exe con `-c` (salva il cookie) e `-b` (invia il cookie), come in Bash; il corpo del login si costruisce con `ConvertTo-Json -Compress` (JSON su una riga) e si passa a curl.exe dallo standard input (`-d "@-"`), così le virgolette non creano problemi e la password resta in una variabile: non scriverla nei comandi.',
    ],
    shells: ['bash', 'pwsh'],
    setup: setupSession,
    guided: [
      { title: 'Il login e gli attributi del cookie', cmd: { bash: 'curl -s -i -c jar.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}" | grep -i set-cookie', pwsh: '@{ username = $env:TASKFLOW_LOGIN_USER; password = $env:TASKFLOW_LOGIN_PASSWORD } | ConvertTo-Json -Compress | curl.exe -s -i -c jar.txt -X POST "$env:TASKFLOW_URL/v1/login" -H "Content-Type: application/json" -d "@-" | Select-String -Pattern set-cookie' }, what: 'Fa il login e mostra l\'header Set-Cookie.', who: 'Il server imposta il cookie con i suoi attributi.', parts: ['SameSite=Lax', 'HttpOnly', 'Path=/v1'], expect: 'session=…; HttpOnly; SameSite=Lax.', risk: 'Nessuno.', contains: 'SameSite=Lax' },
      { title: 'Il token anti-CSRF', cmd: { bash: 'curl -s -b jar.txt $TASKFLOW_URL/v1/session | jq -r .csrfToken', pwsh: '(curl.exe -s -b jar.txt "$env:TASKFLOW_URL/v1/session" | ConvertFrom-Json).csrfToken' }, what: 'L\'app legittima legge il token dalla sessione.', who: 'Il server lo calcola a partire dal cookie.', parts: [], expect: 'csrf_ seguito da un codice.', risk: 'Nessuno.', contains: 'csrf_' },
      { title: 'Senza token', cmd: { bash: 'curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -d \'{"displayName":"Roberto"}\'', pwsh: 'curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -d \'{\\"displayName\\":\\"Roberto\\"}\'' }, what: 'Cambia il nome visualizzato con il solo cookie.', who: 'Il server rifiuta: manca il token.', parts: [], expect: '403 csrf_token_missing.', risk: 'Nessuno: non cambia nulla.', contains: 'csrf_token_missing' },
      { title: 'Da un altro sito', cmd: { bash: 'T=$(curl -s -b jar.txt $TASKFLOW_URL/v1/session | jq -r .csrfToken); curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -H "Origin: https://sito-cattivo.test" -d \'{"displayName":"Roberto"}\'', pwsh: '$T = (curl.exe -s -b jar.txt "$env:TASKFLOW_URL/v1/session" | ConvertFrom-Json).csrfToken; curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -H "Origin: https://sito-cattivo.test" -d \'{\\"displayName\\":\\"Roberto\\"}\'' }, what: 'Simula una richiesta che arriva da un sito estraneo (header Origin).', who: 'Il server controlla l\'origine.', parts: ['Origin: il sito da cui parte la richiesta'], expect: '403 csrf_origin_mismatch anche con il token giusto.', risk: 'Nessuno.', contains: 'csrf_origin_mismatch' },
    ],
    predict: [
      {
        prompt: 'La stessa richiesta con cookie e token giusti, senza header Origin (come farebbe uno script o l\'app stessa): viene accettata?',
        cmd: { bash: 'T=$(curl -s -b jar.txt $TASKFLOW_URL/v1/session | jq -r .csrfToken); curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -d \'{"displayName":"Roberto"}\'', pwsh: '$T = (curl.exe -s -b jar.txt "$env:TASKFLOW_URL/v1/session" | ConvertFrom-Json).csrfToken; curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -d \'{\\"displayName\\":\\"Roberto\\"}\'' },
        expect: 'Sì: 200 con il nuovo nome. Il controllo dell\'origine si applica solo quando l\'header Origin è presente (lo mettono i browser).',
        why: 'Gli strumenti da riga di comando non inviano Origin da soli: curl non è il browser. Il test del lab simula il browser aggiungendo l\'header a mano.',
      },
    ],
    negative: {
      prompt: 'Un token CSRF sbagliato:',
      cmd: { bash: 'curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -H "X-CSRF-Token: csrf_inventato" -d \'{"displayName":"Roberto"}\'', pwsh: 'curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -H "X-CSRF-Token: csrf_inventato" -d \'{\\"displayName\\":\\"Roberto\\"}\'' },
      explain: '403 csrf_token_invalid: il token è legato al cookie della sessione e non si può indovinare.',
    },
    task: {
      text: 'In ~/corso-cli/m10l2: fai il login (cookie in jar.txt, password dalla variabile); leggi il csrfToken; esegui tre POST a /v1/session/profile con {"displayName":"Roberto"}: (1) senza X-CSRF-Token → 403; (2) con il token ma con Origin: https://sito-cattivo.test → 403; (3) con il token, senza Origin → 200. Scrivi csrf.md: il problema, una tabella Caso | Richiesta | Risposta | Perché con i tre casi, cosa fa SameSite=Lax e perché un token Bearer in un header non ha lo stesso problema.',
      criterion: 'Il registro mostra csrf_token_missing, csrf_origin_mismatch e un 200; csrf.md ha la tabella a tre righe e nomina SameSite, X-CSRF-Token, Origin e Bearer; nessuna password nei comandi.',
    },
    checks: [
      {
        id: 'richieste',
        description: 'Tre POST su /v1/session/profile: token mancante, origine estranea, riuscita',
        expected: '403 csrf_token_missing, 403 csrf_origin_mismatch, 200',
        test: (c) => {
          const p = c.apiShell.filter((e) => e.method === 'POST' && e.path === '/v1/session/profile');
          const ok = { mancante: p.some((e) => e.status === 403 && /csrf_token_missing/.test(e.resBody ?? '')), origine: p.some((e) => e.status === 403 && /csrf_origin_mismatch/.test(e.resBody ?? '')), riuscita: p.some((e) => e.status === 200) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Servono i tre casi: senza X-CSRF-Token, con Origin estraneo (e token giusto), e la richiesta legittima.',
      },
      {
        id: 'segreti',
        description: 'Nessuna password nei comandi',
        expected: 'password solo da $TASKFLOW_LOGIN_PASSWORD',
        test: (c) => {
          const leak = c.cmds.find((x) => x.cmd.includes(demoPassword('development')));
          return { pass: !leak, actual: leak ? 'password in chiaro' : 'ok' };
        },
        onFail: 'Usa la variabile $TASKFLOW_LOGIN_PASSWORD ($env: in PowerShell).',
        errorTag: 'segreti-nei-comandi',
      },
      {
        id: 'tabella',
        description: 'csrf.md: tabella con almeno 3 casi',
        expected: '| Caso | Richiesta | Risposta | Perché |',
        test: (c) => {
          const t = parseTables(c.read('csrf.md') ?? '').find((x) => x.header.some((h) => /caso/i.test(h)) && x.header.some((h) => /risposta/i.test(h)));
          return { pass: !!t && t.rows.length >= 3, actual: t ? `${t.rows.length} righe` : 'tabella non trovata' };
        },
        onFail: 'Colonne Caso, Richiesta, Risposta, Perché; una riga per caso.',
        kind: 'verifiable',
      },
      {
        id: 'spiegazione',
        description: 'csrf.md: SameSite, X-CSRF-Token, Origin e confronto con Bearer',
        expected: 'SameSite, X-CSRF-Token, Origin, Bearer',
        test: (c) => {
          const md = c.read('csrf.md') ?? '';
          const ok = { samesite: /SameSite/i.test(md), token: /X-CSRF-Token/i.test(md), origin: /Origin/.test(md), bearer: /Bearer/i.test(md), auto: /automatic|da solo|in automatico|automaticamente/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Spiega che il browser invia il cookie in automatico, cosa fa ciascuna difesa e perché il Bearer in un header è diverso.',
      },
    ],
    example: { text: 'Esempio analogo: leggere i dati della sessione con il cookie.', cmd: { bash: 'curl -s -c jar.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d "{\\"username\\":\\"$TASKFLOW_LOGIN_USER\\",\\"password\\":\\"$TASKFLOW_LOGIN_PASSWORD\\"}" > /dev/null; curl -s -b jar.txt $TASKFLOW_URL/v1/session', pwsh: `${LOGIN_P} | Out-Null; curl.exe -s -b jar.txt "$env:TASKFLOW_URL/v1/session"` } },
    hints: ['Il token anti-CSRF si legge con GET /v1/session (campo csrfToken) usando il cookie salvato.', 'Per simulare un sito estraneo aggiungi -H "Origin: https://sito-cattivo.test".'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m10l2',
        `${LOGIN_B} > /dev/null`,
        'T=$(curl -s -b jar.txt $TASKFLOW_URL/v1/session | jq -r .csrfToken)',
        `curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -d '{"displayName":"Roberto"}'`,
        `curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -H "Origin: https://sito-cattivo.test" -d '{"displayName":"Roberto"}'`,
        `curl -s -b jar.txt -X POST $TASKFLOW_URL/v1/session/profile -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -d '{"displayName":"Roberto"}'`,
        `cat > csrf.md <<'EOF'\n${CSRF_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m10l2',
        `${LOGIN_P} | Out-Null`,
        '$T = (curl.exe -s -b jar.txt "$env:TASKFLOW_URL/v1/session" | ConvertFrom-Json).csrfToken',
        `curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -d '{\\"displayName\\":\\"Roberto\\"}'`,
        `curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -H "Origin: https://sito-cattivo.test" -d '{\\"displayName\\":\\"Roberto\\"}'`,
        `curl.exe -s -b jar.txt -X POST "$env:TASKFLOW_URL/v1/session/profile" -H "Content-Type: application/json" -H "X-CSRF-Token: $T" -d '{\\"displayName\\":\\"Roberto\\"}'`,
        `Set-Content csrf.md -Value @'\n${CSRF_MD}'@`,
      ],
    },
    summary: ['il browser invia il cookie in automatico: CSRF', 'difese: SameSite, token anti-CSRF, controllo di Origin', 'il Bearer in un header non viene aggiunto dal browser', 'curl non è il browser: Origin si simula a mano'],
    skills: ['http', 'diagnosi', 'docs'],
    concepts: ['CSRF', 'SameSite', 'token anti-CSRF', 'header Origin'],
  },
  {
    id: 'M10.L3',
    module: 10,
    n: 3,
    title: 'Leggere un JWT: cosa si vede e cosa no',
    objective: 'Decodificare header e payload di un JWT, interpretare scadenza e firma e spiegare perché leggere un token non equivale a verificarlo.',
    explain: [
      'Un JWT (JSON Web Token) è una stringa con tre parti separate da punti: `header.payload.firma`. Header e payload sono JSON codificati in base64url (come base64 ma con `-` e `_` al posto di `+` e `/`, e senza il padding `=`); non sono CIFRATI: chiunque abbia il token li legge. La firma è un HMAC calcolato con un segreto che conosce solo il server.',
      'In Bash si estrae la parte con `cut -d. -f2`, si converte l\'alfabeto con `tr \'_-\' \'/+\'` e si decodifica con `base64 -d`. Se manca il padding `base64 -d` stampa il testo ma si lamenta con «invalid input» e codice 1: si può ignorare con `2>/dev/null`. In PowerShell: `.Split(".")[1]`, `.Replace("-","+").Replace("_","/")`, `.PadRight(..., "=")` per il padding e `[Convert]::FromBase64String`; per non ripetere i passi si può raccoglierli in una funzione, qui chiamata `Read-Jwt`. Il campo `exp` è la scadenza in secondi UNIX.',
      'Leggere il payload dice cosa AFFERMA il token, non se è valido: lo verifica solo il server controllando la firma e la scadenza. Per questo i permessi non vanno mai ricavati dal payload senza verificare la firma.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: false });
      const now = c.state.clock;
      const valid = makeJwt('development', { sub: 'bob', iss: 'taskflow', role: 'member', iat: now - 60, exp: now + 3600 });
      const expired = makeJwt('development', { sub: 'bob', iss: 'taskflow', role: 'member', iat: now - 7200, exp: now - 3600 });
      const [h, , sig] = valid.split('.');
      const forgedBody = Buffer.from(JSON.stringify({ sub: 'alice', iss: 'taskflow', role: 'admin', iat: now - 60, exp: now + 3600 })).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
      c.file('valido.jwt', valid + '\n');
      c.file('scaduto.jwt', expired + '\n');
      c.file('manomesso.jwt', `${h}.${forgedBody}.${sig}\n`);
    },
    guided: [
      { title: 'Le tre parti', cmd: { bash: 'cd ~/corso-cli/m10l3 && cut -d. -f1 valido.jwt && cut -d. -f2 valido.jwt', pwsh: 'cd ~/corso-cli/m10l3; (Get-Content valido.jwt).Split(".")[0]; (Get-Content valido.jwt).Split(".")[1]' }, what: 'Mostra header e payload ancora codificati.', who: 'cut -d. -f2 prende il secondo campo separato da punti.', parts: ['-d.: il separatore è il punto', '-f2: il secondo campo'], expect: 'Due stringhe che iniziano per eyJ (il JSON codificato).', risk: 'Nessuno.', contains: 'eyJ' },
      { title: 'Decodificare l\'header', cmd: { bash: "cd ~/corso-cli/m10l3 && cut -d. -f1 valido.jwt | tr '_-' '/+' | base64 -d 2>/dev/null; echo", pwsh: 'cd ~/corso-cli/m10l3; $p = (Get-Content valido.jwt).Split(".")[0].Replace("-","+").Replace("_","/"); $p = $p.PadRight($p.Length + (4 - $p.Length % 4) % 4, "="); [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))' }, what: 'Converte l\'alfabeto base64url e decodifica.', who: 'tr cambia i caratteri; base64 -d decodifica.', parts: ["tr '_-' '/+': da base64url a base64", '2>/dev/null: ignora la lamentela sul padding'], expect: '{"alg":"HS256","typ":"JWT"}', risk: 'Nessuno.', contains: 'HS256' },
      { title: 'Decodificare il payload', cmd: { bash: "cd ~/corso-cli/m10l3 && cut -d. -f2 valido.jwt | tr '_-' '/+' | base64 -d 2>/dev/null | jq .", pwsh: 'cd ~/corso-cli/m10l3; $p = (Get-Content valido.jwt).Split(".")[1].Replace("-","+").Replace("_","/"); $p = $p.PadRight($p.Length + (4 - $p.Length % 4) % 4, "="); [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json' }, what: 'Mostra i claim: soggetto, emittente, ruolo, scadenza.', who: 'jq / ConvertFrom-Json rendono leggibile il JSON.', parts: ['sub: chi', 'iss: chi ha emesso il token', 'exp: scadenza in secondi UNIX'], expect: 'sub bob, iss taskflow, role member, exp.', risk: 'Nessuno.', contains: 'bob' },
      { title: 'Il server verifica', cmd: { bash: 'cd ~/corso-cli/m10l3 && curl -s -H "Authorization: Bearer $(cat valido.jwt)" $TASKFLOW_URL/v1/me', pwsh: 'cd ~/corso-cli/m10l3; curl.exe -s -H "Authorization: Bearer $(Get-Content valido.jwt)" "$env:TASKFLOW_URL/v1/me"' }, what: 'Usa il token come Bearer.', who: 'Il server controlla firma, scadenza ed emittente.', parts: [], expect: 'Il profilo di bob (200).', risk: 'Nessuno.', contains: 'bob' },
    ],
    predict: [
      {
        prompt: 'Il token manomesso dichiara sub alice e role admin. Il server lo accetta, visto che il payload lo dice?',
        cmd: { bash: 'cd ~/corso-cli/m10l3; curl -s -H "Authorization: Bearer $(cat manomesso.jwt)" $TASKFLOW_URL/v1/admin/users', pwsh: 'cd ~/corso-cli/m10l3; curl.exe -s -H "Authorization: Bearer $(Get-Content manomesso.jwt)" "$env:TASKFLOW_URL/v1/admin/users"' },
        expect: 'No: 401 invalid_signature. Il payload è stato cambiato ma la firma è rimasta quella del token originale, quindi non coincide più.',
        why: 'Il payload si può riscrivere a piacere; la firma no, senza il segreto. Per questo conta la verifica del server, non ciò che il token dichiara.',
      },
    ],
    negative: {
      prompt: 'Un token scaduto ma con la firma perfetta:',
      cmd: { bash: 'cd ~/corso-cli/m10l3; curl -s -H "Authorization: Bearer $(cat scaduto.jwt)" $TASKFLOW_URL/v1/me', pwsh: 'cd ~/corso-cli/m10l3; curl.exe -s -H "Authorization: Bearer $(Get-Content scaduto.jwt)" "$env:TASKFLOW_URL/v1/me"' },
      explain: '401 token_expired: la firma è valida, ma exp è nel passato. Il server controlla entrambe le cose, in questo ordine: prima la firma, poi la scadenza.',
    },
    task: {
      text: 'In ~/corso-cli/m10l3 ci sono tre token: valido.jwt, scaduto.jwt, manomesso.jwt. Per ciascuno decodifica header e payload e chiamane GET /v1/me come Bearer. Scrivi jwt.md: una tabella Token | Header | Claim principali | Esito sul server | Perché con le tre righe, più un elenco di cosa si può e non si può concludere leggendo un JWT (payload non cifrato, firma verificabile solo dal server, il ruolo nel payload non conta).',
      criterion: 'Il registro mostra 200 per il valido, token_expired per lo scaduto e invalid_signature per il manomesso; hai decodificato il payload; jwt.md ha la tabella e le conclusioni.',
    },
    checks: [
      {
        id: 'esiti',
        description: 'Tre risposte del server: 200, token_expired, invalid_signature',
        expected: '200 / 401 token_expired / 401 invalid_signature su /v1/me o simili',
        test: (c) => {
          const e = c.apiShell;
          const ok = { valido: e.some((x) => x.status === 200 && x.path === '/v1/me'), scaduto: e.some((x) => x.status === 401 && /token_expired/.test(x.resBody ?? '')), manomesso: e.some((x) => x.status === 401 && /invalid_signature/.test(x.resBody ?? '')) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Chiama /v1/me con ciascuno dei tre token: Authorization: Bearer seguito dal contenuto del file.',
      },
      {
        id: 'decodifica',
        description: 'Hai decodificato il payload del token',
        expected: pick({ shell: 'bash' } as never, 'base64 -d', 'FromBase64String') as string,
        test: (c) => {
          const ok = cmdMatches(c, pick(c, /base64\s+(-d|--decode)/, /FromBase64String/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna decodifica' };
        },
        onFail: 'Decodifica il secondo campo del token: cut -d. -f2 | tr \'_-\' \'/+\' | base64 -d (PowerShell: [Convert]::FromBase64String).',
      },
      {
        id: 'tabella',
        description: 'jwt.md: tabella con tre righe e le conclusioni',
        expected: 'tabella Token | Header | Claim | Esito | Perché',
        test: (c) => {
          const md = c.read('jwt.md') ?? '';
          const t = parseTables(md).find((x) => x.header.some((h) => /token/i.test(h)) && x.header.some((h) => /esito/i.test(h)));
          const txt = t ? t.rows.map((r) => r.join(' ')).join(' ') : '';
          const ok = { righe: !!t && t.rows.length >= 3, scaduto: /token_expired|scadut/i.test(txt), firma: /invalid_signature|firma/i.test(txt), alg: /HS256/.test(md), exp: /\bexp\b/.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Una riga per token con header (HS256), claim (sub, iss, exp), esito del server e motivo.',
        kind: 'verifiable',
      },
      {
        id: 'conclusioni',
        description: 'jwt.md: cosa si può e non si può concludere',
        expected: 'payload non cifrato, firma verificata dal server, ruolo non affidabile',
        test: (c) => {
          const md = c.read('jwt.md') ?? '';
          const ok = { cifrato: /non (è )?cifrat|leggibil|chiunque/i.test(md), server: /solo il server|il server (verifica|controlla)|segreto/i.test(md), ruolo: /ruolo|permessi/i.test(md) };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Scrivi tre conclusioni: il payload non è cifrato, solo il server verifica la firma, il ruolo nel payload non va creduto.',
      },
    ],
    example: { text: 'Esempio analogo: la scadenza di un token (campo exp).', cmd: { bash: "cd ~/corso-cli/m10l3 && cut -d. -f2 scaduto.jwt | tr '_-' '/+' | base64 -d 2>/dev/null | jq .exp", pwsh: 'cd ~/corso-cli/m10l3; $p = (Get-Content scaduto.jwt).Split(".")[1].Replace("-","+").Replace("_","/"); $p = $p.PadRight($p.Length + (4 - $p.Length % 4) % 4, "="); ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json).exp' } },
    hints: ['Il payload è il secondo campo: `cut -d. -f2`. Converti con `tr \'_-\' \'/+\'` e decodifica con `base64 -d`.', 'Se base64 si lamenta del padding, aggiungi `2>/dev/null`: il testo è comunque completo.', 'Le tre risposte del server sono diverse: guarda il campo `error` del corpo.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m10l3',
        "for f in valido scaduto manomesso; do echo \"$f: $(cut -d. -f1 $f.jwt | tr '_-' '/+' | base64 -d 2>/dev/null) $(cut -d. -f2 $f.jwt | tr '_-' '/+' | base64 -d 2>/dev/null)\"; done",
        'curl -s -H "Authorization: Bearer $(cat valido.jwt)" $TASKFLOW_URL/v1/me',
        'curl -s -H "Authorization: Bearer $(cat scaduto.jwt)" $TASKFLOW_URL/v1/me',
        'curl -s -H "Authorization: Bearer $(cat manomesso.jwt)" $TASKFLOW_URL/v1/me',
        `cat > jwt.md <<'EOF'\n${JWT_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m10l3',
        'function Read-Jwt($f, $n) { $p = (Get-Content $f).Split(".")[$n].Replace("-","+").Replace("_","/"); $p = $p.PadRight($p.Length + (4 - $p.Length % 4) % 4, "="); [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) }',
        '"valido: " + (Read-Jwt valido.jwt 0) + (Read-Jwt valido.jwt 1)',
        '"scaduto: " + (Read-Jwt scaduto.jwt 0) + (Read-Jwt scaduto.jwt 1)',
        '"manomesso: " + (Read-Jwt manomesso.jwt 0) + (Read-Jwt manomesso.jwt 1)',
        'curl.exe -s -H "Authorization: Bearer $(Get-Content valido.jwt)" "$env:TASKFLOW_URL/v1/me"',
        'curl.exe -s -H "Authorization: Bearer $(Get-Content scaduto.jwt)" "$env:TASKFLOW_URL/v1/me"',
        'curl.exe -s -H "Authorization: Bearer $(Get-Content manomesso.jwt)" "$env:TASKFLOW_URL/v1/me"',
        `Set-Content jwt.md -Value @'\n${JWT_MD}'@`,
      ],
    },
    summary: ['JWT = header.payload.firma in base64url', 'il payload non è cifrato: leggibile da chiunque', 'solo il server verifica la firma e la scadenza', 'il ruolo dichiarato nel payload non è una prova'],
    skills: ['http', 'diagnosi', 'output'],
    concepts: ['JWT', 'base64url', 'firma e scadenza', 'leggere non è verificare'],
  },
];
