/** M7 — lezioni aggiunte il 2026-10-27: leggere un file riga per riga e script con argomenti e codici di uscita. */
import type { Lesson } from '../types.ts';
import { cmdMatches, pick, setupApi } from './helpers.ts';

const AUTH = '-H "Authorization: Bearer $TASKFLOW_TOKEN"';
const PS_AUTH = '-H "Authorization: Bearer $env:TASKFLOW_TOKEN"';

const ENDPOINT_TXT = '# Endpoint da controllare\n/v1/health\n/v1/projects\n\n/v1/tasks\n/v1/nonesiste\n';
const WINDOWS_TXT = '/v1/health\r\n/v1/projects\r\n/v1/nonesiste\r\n';

const APPUNTI_MD = `# Appunti sul ciclo riga per riga

- Un file di testo si legge una riga alla volta: while read in Bash, Get-Content con ForEach-Object in PowerShell.
- Si usa read -r (Bash) per non far interpretare i backslash della riga.
- Le righe vuote e i commenti (che iniziano con #) vanno saltati, altrimenti il ciclo prova a chiamare un indirizzo inesistente.
- I file creati su Windows terminano le righe con CRLF: in Bash il carattere \\r resta attaccato alla riga e rompe l'indirizzo (tutte le richieste danno 404 senza alcun errore evidente). Si toglie con tr -d '\\r'.
- Get-Content di PowerShell gestisce già CRLF e LF: lo stesso file funziona senza correzioni.
`;

const CONTROLLA_SH = `#!/bin/bash
# Uso: controlla.sh URL [secondi]
# Uscita: 0 risposta 2xx, 1 altro status HTTP, 2 uso errato, 3 errore di rete.
if [ $# -lt 1 ]; then
  echo "uso: controlla.sh URL [secondi]" >&2
  exit 2
fi
url="$1"
attesa="\${2:-3}"
code=$(curl -s -m "$attesa" -o /dev/null -w "%{http_code}" "$url")
rc=$?
if [ $rc -ne 0 ]; then
  echo "ERRORE rete (curl $rc)"
  exit 3
fi
if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  echo "OK $code"
  exit 0
fi
echo "ERRORE $code"
exit 1
`;

const CONTROLLA_PS1 = `param([string]$Url, [int]$Secondi = 3)
# Uso: controlla.ps1 URL [secondi]
# Uscita: 0 risposta 2xx, 1 altro status HTTP, 2 uso errato, 3 errore di rete.
if (-not $Url) { Write-Host "uso: controlla.ps1 URL [secondi]"; exit 2 }
$code = curl.exe -s -m $Secondi -o NUL -w "%{http_code}" $Url
if ($LASTEXITCODE -ne 0) { Write-Output "ERRORE rete (curl $LASTEXITCODE)"; exit 3 }
if ([int]$code -ge 200 -and [int]$code -lt 300) { Write-Output "OK $code"; exit 0 }
Write-Output "ERRORE $code"
exit 1
`;

export const m7b: Lesson[] = [
  {
    id: 'M7.L2',
    module: 7,
    n: 2,
    title: 'Leggere un file riga per riga',
    objective: 'Eseguire un\'operazione per ogni riga di un file, saltando righe vuote e commenti, e gestire i fine riga di Windows.',
    explain: [
      'Spesso l\'elenco di cose da controllare sta in un file, una per riga. In Bash si legge con un ciclo `while IFS= read -r riga; do … done < file`: `read` legge una riga alla volta nella variabile, `-r` impedisce che i backslash vengano interpretati, `IFS=` conserva gli spazi. In PowerShell: `Get-Content file | ForEach-Object { … }`, dove `$_` è la riga corrente.',
      'I file reali contengono commenti e righe vuote: vanno saltati. In Bash con `[ -z "$riga" ]` (vuota) e `case "$riga" in "#"*) continue;; esac` (commento); in PowerShell con `Where-Object { $_ -and $_ -notmatch \'^#\' }`.',
      'Trappola classica: un file creato in Windows termina le righe con CRLF (`\\r\\n`). Bash lascia il `\\r` attaccato alla riga, e un indirizzo come `/v1/health\\r` non esiste: tutte le richieste danno 404 senza un errore evidente. Si risolve togliendo il carattere con `tr -d \'\\r\'`. Get-Content di PowerShell non ha il problema.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      setupApi(c, { token: 'valid' });
      c.file('endpoint.txt', ENDPOINT_TXT);
      c.file('da-windows.txt', WINDOWS_TXT);
    },
    guided: [
      { title: 'Una riga alla volta', cmd: { bash: 'cd ~/corso-cli/m7l2 && while IFS= read -r riga; do echo "letta: $riga"; done < endpoint.txt', pwsh: 'cd ~/corso-cli/m7l2; Get-Content endpoint.txt | ForEach-Object { "letta: $_" }' }, what: 'Legge il file e stampa ogni riga con un prefisso.', who: 'Il ciclo ripete il corpo per ogni riga.', parts: ['read -r riga: legge una riga nella variabile', '< endpoint.txt: da dove legge'], expect: 'Sei righe, comprese quella con il commento e quella vuota.', risk: 'Nessuno.', contains: 'letta: /v1/health' },
      { title: 'Saltare commenti e righe vuote', cmd: { bash: 'cd ~/corso-cli/m7l2 && while IFS= read -r riga; do [ -z "$riga" ] && continue; case "$riga" in "#"*) continue;; esac; echo "da chiamare: $riga"; done < endpoint.txt', pwsh: 'cd ~/corso-cli/m7l2; Get-Content endpoint.txt | Where-Object { $_ -and $_ -notmatch \'^#\' } | ForEach-Object { "da chiamare: $_" }' }, what: 'Filtra le righe inutili.', who: 'continue passa alla riga successiva; Where-Object tiene solo le righe utili.', parts: ['-z: stringa vuota', 'case "#"*): inizia con #'], expect: 'Quattro righe: health, projects, tasks, nonesiste.', risk: 'Nessuno.', contains: 'da chiamare: /v1/tasks' },
      { title: 'Chiamare l\'API per ogni riga', cmd: { bash: `cd ~/corso-cli/m7l2 && while IFS= read -r p; do [ -z "$p" ] && continue; case "$p" in "#"*) continue;; esac; code=$(curl -s -o /dev/null -w "%{http_code}" ${AUTH} "$TASKFLOW_URL$p"); echo "$p $code"; done < endpoint.txt`, pwsh: `cd ~/corso-cli/m7l2; Get-Content endpoint.txt | Where-Object { $_ -and $_ -notmatch '^#' } | ForEach-Object { $code = curl.exe -s -o NUL -w "%{http_code}" ${PS_AUTH} "$env:TASKFLOW_URL$_"; "$_ $code" }` }, what: 'Per ogni percorso stampa lo status.', who: 'Il ciclo costruisce l\'URL con il percorso letto.', parts: ['$TASKFLOW_URL$p: base URL + percorso'], expect: 'health 200, projects 200, tasks 200, nonesiste 404.', risk: 'Nessuno.', contains: '/v1/nonesiste 404' },
      { title: 'Il file di Windows', cmd: { bash: `cd ~/corso-cli/m7l2 && while IFS= read -r p; do code=$(curl -s -o /dev/null -w "%{http_code}" ${AUTH} "$TASKFLOW_URL$p"); echo "$p $code"; done < da-windows.txt`, pwsh: `cd ~/corso-cli/m7l2; Get-Content da-windows.txt | ForEach-Object { $code = curl.exe -s -o NUL -w "%{http_code}" ${PS_AUTH} "$env:TASKFLOW_URL$_"; "$_ $code" }` }, what: 'Lo stesso ciclo su un file con fine riga CRLF.', who: 'Bash lascia il \\r nella riga; PowerShell lo toglie.', parts: [], expect: 'Bash: TUTTI 404 (il \\r rompe i percorsi). PowerShell: health 200, projects 200, nonesiste 404.', risk: 'Nessuno.', contains: { bash: '404', pwsh: '/v1/health 200' } },
    ],
    predict: [
      {
        prompt: 'Cosa stampa questo comando sul file di Windows? Bash: `tr -d \'\\r\' < da-windows.txt | head -1 | od -c | head -1`',
        cmd: { bash: "cd ~/corso-cli/m7l2; head -1 da-windows.txt | od -c | head -2", pwsh: 'cd ~/corso-cli/m7l2; (Get-Content da-windows.txt -Raw).Length' },
        expect: 'Bash: i caratteri della prima riga terminano con \\r \\n (CRLF). PowerShell: la lunghezza comprende i \\r.',
        why: 'I caratteri invisibili si vedono con od -c: sono la causa tipica di errori «senza errore».',
      },
    ],
    negative: {
      prompt: 'Cosa succede senza `-r` in `read` con un backslash nella riga?',
      cmd: { bash: "printf 'a\\\\nb\\n' | { read riga; echo \"[$riga]\"; }; printf 'a\\\\nb\\n' | { read -r riga; echo \"[$riga]\"; }", pwsh: "'a\\nb' | ForEach-Object { \"[$_]\" }" },
      explain: 'Senza -r read interpreta i backslash e altera la riga; con -r la lascia com\'è. Per questo si scrive sempre `read -r`.',
    },
    task: {
      text: 'In ~/corso-cli/m7l2: (1) leggi endpoint.txt riga per riga, salta commenti e righe vuote e scrivi in risultati.txt «percorso status» per ogni endpoint (con token); (2) fai lo stesso con da-windows.txt in risultati-win.txt, ottenendo risultati corretti (in Bash devi togliere i \\r); (3) scrivi appunti.md: i tre accorgimenti (righe da saltare, \\r, -r).',
      criterion: 'risultati.txt: /v1/health 200, /v1/projects 200, /v1/tasks 200, /v1/nonesiste 404; risultati-win.txt: health 200, projects 200, nonesiste 404; hai usato un ciclo; appunti.md cita CRLF o \\r.',
    },
    checks: [
      {
        id: 'risultati',
        description: 'risultati.txt: i quattro endpoint con lo status',
        expected: '/v1/health 200 / /v1/projects 200 / /v1/tasks 200 / /v1/nonesiste 404',
        test: (c) => {
          const l = (c.read('risultati.txt') ?? '').split('\n').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
          return { pass: l.join('|') === '/v1/health 200|/v1/projects 200|/v1/tasks 200|/v1/nonesiste 404', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'Salta commenti e righe vuote, chiama ogni percorso con il token e scrivi «percorso status».',
      },
      {
        id: 'windows',
        description: 'risultati-win.txt: stessi controlli sul file con CRLF',
        expected: '/v1/health 200 / /v1/projects 200 / /v1/nonesiste 404',
        test: (c) => {
          const l = (c.read('risultati-win.txt') ?? '').split('\n').map((x) => x.replace(/\r/g, '').trim().replace(/\s+/g, ' ')).filter(Boolean);
          return { pass: l.join('|') === '/v1/health 200|/v1/projects 200|/v1/nonesiste 404', actual: l.join(' / ') || '(vuoto)' };
        },
        onFail: 'In Bash il \\r resta attaccato al percorso: filtra il file con tr -d \'\\r\' prima del ciclo.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'ciclo',
        description: 'Hai usato un ciclo sulle righe del file',
        expected: pick({ shell: 'bash' } as never, 'while read', 'ForEach-Object') as string,
        test: (c) => {
          const ok = cmdMatches(c, pick(c, /while\s+(IFS=\s*)?read\b/, /ForEach-Object|foreach\s*\(/i), false);
          return { pass: ok, actual: ok ? 'ok' : 'nessun ciclo sulle righe' };
        },
        onFail: 'Bash: while IFS= read -r p; do … done < file. PowerShell: Get-Content file | ForEach-Object { … }.',
      },
      {
        id: 'appunti',
        description: 'appunti.md: righe da saltare, CRLF e read -r',
        expected: 'commenti/righe vuote, CRLF o \\r, -r',
        test: (c) => {
          const md = c.read('appunti.md') ?? '';
          const ok = { saltare: /vuot|commenti|#/i.test(md), crlf: /CRLF|\\r|a capo/i.test(md), r: c.shell === 'bash' ? /read -r|-r\b/.test(md) : true };
          return { pass: Object.values(ok).every(Boolean), actual: Object.entries(ok).filter(([, v]) => !v).map(([k]) => 'manca ' + k).join(', ') || 'ok' };
        },
        onFail: 'Annota i tre accorgimenti con parole tue.',
      },
    ],
    example: { text: 'Esempio analogo: contare le righe utili di un file.', cmd: { bash: 'cd ~/corso-cli/m7l2 && n=0; while IFS= read -r r; do [ -z "$r" ] && continue; n=$((n+1)); done < endpoint.txt; echo "$n"', pwsh: 'cd ~/corso-cli/m7l2; (Get-Content endpoint.txt | Where-Object { $_ }).Count' } },
    hints: ['Dentro il ciclo costruisci l\'URL con `"$TASKFLOW_URL$p"` e salva lo status con `-o /dev/null -w "%{http_code}"`.', 'Per il file di Windows: `tr -d \'\\r\' < da-windows.txt | while IFS= read -r p; do … done`.', 'In PowerShell non serve togliere il \\r.'],
    solutions: {
      bash: [
        'cd ~/corso-cli/m7l2',
        `while IFS= read -r p; do [ -z "$p" ] && continue; case "$p" in "#"*) continue;; esac; code=$(curl -s -o /dev/null -w "%{http_code}" ${AUTH} "$TASKFLOW_URL$p"); echo "$p $code"; done < endpoint.txt > risultati.txt`,
        `tr -d '\\r' < da-windows.txt | while IFS= read -r p; do code=$(curl -s -o /dev/null -w "%{http_code}" ${AUTH} "$TASKFLOW_URL$p"); echo "$p $code"; done > risultati-win.txt`,
        `cat > appunti.md <<'EOF'\n${APPUNTI_MD}EOF`,
      ],
      pwsh: [
        'cd ~/corso-cli/m7l2',
        `Get-Content endpoint.txt | Where-Object { $_ -and $_ -notmatch '^#' } | ForEach-Object { $code = curl.exe -s -o NUL -w "%{http_code}" ${PS_AUTH} "$env:TASKFLOW_URL$_"; "$_ $code" } > risultati.txt`,
        `Get-Content da-windows.txt | ForEach-Object { $code = curl.exe -s -o NUL -w "%{http_code}" ${PS_AUTH} "$env:TASKFLOW_URL$_"; "$_ $code" } > risultati-win.txt`,
        `Set-Content appunti.md -Value @'\n${APPUNTI_MD}'@`,
      ],
    },
    summary: ['while read -r / Get-Content | ForEach-Object', 'saltare commenti e righe vuote', 'CRLF: il \\r invisibile rompe gli indirizzi in Bash', 'costruire l\'URL dal valore letto'],
    skills: ['comandi', 'testing', 'diagnosi'],
    concepts: ['ciclo riga per riga', 'read -r', 'fine riga CRLF', 'tr -d'],
  },
  {
    id: 'M7.L3',
    module: 7,
    n: 3,
    title: 'Argomenti e codici di uscita negli script',
    objective: 'Scrivere uno script che riceve argomenti (con un valore predefinito), segnala l\'uso errato e restituisce codici di uscita diversi per ogni esito.',
    explain: [
      'Uno script diventa uno STRUMENTO quando accetta argomenti e dice com\'è andata con il codice di uscita. In Bash gli argomenti sono `$1`, `$2`, …; `$#` è quanti sono; `${2:-3}` vale `$2` oppure 3 se manca (valore predefinito). In PowerShell si dichiarano in cima: `param([string]$Url, [int]$Secondi = 3)`.',
      'Convenzioni: 0 = tutto bene; un codice diverso per ogni famiglia di problemi (qui: 1 risposta HTTP non riuscita, 2 uso errato, 3 errore di rete). Il messaggio d\'uso va sul canale degli errori in Bash (`echo … >&2`). Chi chiama lo script (un altro script, una pipeline di CI) legge il codice, non il testo: i codici sono parte del contratto e vanno documentati nell\'intestazione.',
      'In Bash lo stato di un comando si legge subito con `$?`: salvalo (`rc=$?`) prima di eseguire altro. In PowerShell il codice di curl.exe è in `$LASTEXITCODE`; `exit 3` termina lo script con quel codice.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: false }),
    guided: [
      { title: 'Gli argomenti di uno script', cmd: { bash: "cd ~/corso-cli/m7l3 && printf '#!/bin/bash\\necho \"primo: $1, secondo: ${2:-predefinito}, quanti: $#\"\\n' > prova.sh && bash prova.sh uno", pwsh: "cd ~/corso-cli/m7l3; Set-Content prova.ps1 -Value 'param($Primo, $Secondo = \"predefinito\"); \"primo: $Primo, secondo: $Secondo\"'; ./prova.ps1 uno" }, what: 'Uno script minimo che stampa i suoi argomenti.', who: 'Bash: $1, ${2:-valore}, $#. PowerShell: param().', parts: ['${2:-predefinito}: valore di riserva'], expect: 'primo: uno, secondo: predefinito (e quanti: 1 in Bash).', risk: 'Nessuno.', contains: 'secondo: predefinito' },
      { title: 'Il codice di uscita', cmd: { bash: "cd ~/corso-cli/m7l3 && printf '#!/bin/bash\\nexit 3\\n' > esce.sh && bash esce.sh; echo \"codice: $?\"", pwsh: "cd ~/corso-cli/m7l3; Set-Content esce.ps1 -Value 'exit 3'; ./esce.ps1; \"codice: $LASTEXITCODE\"" }, what: 'Uno script che esce con 3.', who: 'Chi lo chiama legge il codice.', parts: ['exit N: termina con il codice N'], expect: 'codice: 3.', risk: 'Nessuno.', contains: 'codice: 3' },
      { title: 'Salvare il codice subito', cmd: { bash: 'curl -s -m 3 -o /dev/null http://localhost:8081/v1/health; rc=$?; echo "curl: $rc"; echo "dopo: $?"', pwsh: 'curl.exe -s -m 3 -o NUL http://localhost:8081/v1/health; "curl: $LASTEXITCODE"' }, what: 'Il codice di curl con una porta chiusa.', who: 'Il comando successivo sovrascrive $?: va salvato.', parts: ['rc=$?: copia il codice'], expect: 'curl: 7. In Bash «dopo» vale 0 (è l\'esito dell\'echo).', risk: 'Nessuno.', contains: 'curl: 7' },
    ],
    predict: [
      {
        prompt: 'Cosa stampa `echo "dopo: $?"` se lo scrivi DOPO un altro echo?',
        cmd: { bash: 'false; echo "primo"; echo "codice: $?"', pwsh: 'Get-Content manca.txt 2>$null; "primo"; "riuscito: $?"' },
        expect: 'Il codice è 0: $? descrive l\'ultimo comando eseguito (l\'echo), non il false. In PowerShell $? è True per lo stesso motivo.',
        why: 'Per usare un codice bisogna leggerlo SUBITO o salvarlo in una variabile.',
      },
    ],
    negative: {
      prompt: 'Uno script chiamato senza l\'argomento obbligatorio, senza controllo:',
      cmd: { bash: "cd ~/corso-cli/m7l3; printf '#!/bin/bash\\ncurl -s -o /dev/null -w \"%%{http_code}\\\\n\" \"$1\"\\n' > senza-controllo.sh; bash senza-controllo.sh; echo \"codice: $?\"", pwsh: "cd ~/corso-cli/m7l3; Set-Content senza.ps1 -Value 'param($Url); curl.exe -s -o NUL -w \"%{http_code}\" $Url'; ./senza.ps1; \"codice: $LASTEXITCODE\"" },
      explain: 'Lo script prosegue con un URL vuoto: curl dà un errore poco chiaro. Controllare gli argomenti all\'inizio e uscire con 2 e un messaggio d\'uso evita errori misteriosi.',
    },
    task: {
      text: 'In ~/corso-cli/m7l3 scrivi `controlla.sh` (PowerShell: `controlla.ps1`): riceve un URL e, facoltativamente, un tempo massimo in secondi (predefinito 3). Stampa «OK <status>» ed esce con 0 per una risposta 2xx; «ERRORE <status>» ed esce con 1 per un altro status; «ERRORE rete (curl N)» ed esce con 3 se la richiesta non riceve risposta; senza URL stampa un messaggio «uso: …» ed esce con 2.',
      criterion: 'Lo script rispetta i quattro esiti (prova con /v1/health, /v1/nonesiste, la porta 8081, la porta 8089 con 1 secondo e nessun argomento).',
    },
    checks: [
      {
        id: 'uso',
        description: 'Senza argomenti: messaggio d\'uso ed uscita 2',
        expected: 'uscita 2 e un messaggio con «uso»',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash controlla.sh' : './controlla.ps1');
          return { pass: r.code === 2 && /uso/i.test(r.out + r.err), actual: `codice ${r.code}, messaggio «${(r.out + r.err).trim().slice(0, 40)}»` };
        },
        onFail: 'Controlla all\'inizio che l\'argomento ci sia ($# in Bash, $Url in PowerShell) e termina con exit 2.',
      },
      {
        id: 'ok',
        description: '/v1/health: «OK 200», uscita 0',
        expected: 'OK 200, codice 0',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash controlla.sh http://localhost:8080/v1/health' : './controlla.ps1 http://localhost:8080/v1/health');
          return { pass: r.code === 0 && /OK 200/.test(r.out), actual: `codice ${r.code}, output «${r.out.trim()}»` };
        },
        onFail: 'Per una risposta 2xx stampa «OK <status>» ed esci con 0.',
      },
      {
        id: 'http',
        description: '/v1/nonesiste: «ERRORE 404», uscita 1',
        expected: 'ERRORE 404, codice 1',
        test: (c) => {
          const r = c.sandbox(c.shell === 'bash' ? 'bash controlla.sh http://localhost:8080/v1/nonesiste' : './controlla.ps1 http://localhost:8080/v1/nonesiste');
          return { pass: r.code === 1 && /ERRORE 404/.test(r.out), actual: `codice ${r.code}, output «${r.out.trim()}»` };
        },
        onFail: 'Per uno status non 2xx stampa «ERRORE <status>» ed esci con 1.',
      },
      {
        id: 'rete',
        description: 'Porta chiusa e porta filtrata (con 1 secondo): uscita 3',
        expected: 'codice 3 in entrambi i casi',
        test: (c) => {
          const run = (u: string, extra = ''): number => c.sandbox(c.shell === 'bash' ? `bash controlla.sh ${u}${extra}` : `./controlla.ps1 ${u}${extra}`).code;
          const a = run('http://localhost:8081/v1/health');
          const b = run('http://localhost:8089/v1/health', ' 1');
          return { pass: a === 3 && b === 3, actual: `porta chiusa: ${a}, porta filtrata con 1 s: ${b}` };
        },
        onFail: 'Salva il codice di curl subito (rc=$?) e, se non è 0, stampa «ERRORE rete» ed esci con 3. Il secondo argomento è il tempo massimo (-m).',
        errorTag: 'sintassi-vs-esecuzione',
      },
    ],
    example: { text: 'Esempio analogo: uno script che saluta con un nome predefinito.', cmd: { bash: "cd ~/corso-cli/m7l3 && printf '#!/bin/bash\\necho \"ciao ${1:-mondo}\"\\n' > saluta.sh && bash saluta.sh", pwsh: "cd ~/corso-cli/m7l3; Set-Content saluta.ps1 -Value 'param($Nome = \"mondo\"); \"ciao $Nome\"'; ./saluta.ps1" } },
    hints: ['Struttura: controllo degli argomenti → richiesta → salva il codice → decisioni con if → exit.', 'Il tempo massimo è `${2:-3}` (Bash) o `[int]$Secondi = 3` (PowerShell) e va a curl con -m.', 'Per confrontare lo status come numero: `[ "$code" -ge 200 ]` (Bash), `[int]$code -ge 200` (PowerShell).'],
    solutions: {
      bash: ['cd ~/corso-cli/m7l3', `cat > controlla.sh <<'EOF'\n${CONTROLLA_SH}EOF`, 'bash controlla.sh', 'bash controlla.sh http://localhost:8080/v1/health', 'bash controlla.sh http://localhost:8080/v1/nonesiste', 'bash controlla.sh http://localhost:8081/v1/health', 'bash controlla.sh http://localhost:8089/v1/health 1'],
      pwsh: ['cd ~/corso-cli/m7l3', `Set-Content controlla.ps1 -Value @'\n${CONTROLLA_PS1}'@`, './controlla.ps1', './controlla.ps1 http://localhost:8080/v1/health', './controlla.ps1 http://localhost:8080/v1/nonesiste', './controlla.ps1 http://localhost:8081/v1/health', './controlla.ps1 http://localhost:8089/v1/health 1'],
    },
    summary: ['$1 $2 $# e ${2:-valore} / param()', 'un codice di uscita per ogni esito', 'salvare $? prima di eseguire altro', 'il messaggio d\'uso va su stderr, esce con 2'],
    skills: ['comandi', 'testing', 'autonomia'],
    concepts: ['argomenti degli script', 'valori predefiniti', 'codici di uscita come contratto', '$LASTEXITCODE'],
  },
];
