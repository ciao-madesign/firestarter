import type { Lesson } from '../types.ts';
import { cmdMatches, setupApi } from './helpers.ts';

const SUITE_SH = `#!/bin/bash
PASS=0
FAIL=0
check() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1))
    echo "PASS: $1"
  else
    FAIL=$((FAIL+1))
    echo "FAIL: $1 (atteso $2, ottenuto $3)"
  fi
}
status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
check "health" 200 "$(status "$TASKFLOW_URL/v1/health")"
check "elenco con token" 200 "$(status -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks")"
check "elenco senza token" 401 "$(status "$TASKFLOW_URL/v1/tasks")"
check "task inesistente" 404 "$(status -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks/9999")"
echo "PASS: $PASS FAIL: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
`;

const SUITE_PS1 = `$pass = 0
$fail = 0
function Check($nome, $atteso, $ottenuto) {
  if ("$atteso" -eq "$ottenuto") { $script:pass++; Write-Output "PASS: $nome" }
  else { $script:fail++; Write-Output "FAIL: $nome (atteso $atteso, ottenuto $ottenuto)" }
}
function Status($uri, $headers = @{}) {
  try { (Invoke-WebRequest $uri -Headers $headers -UseBasicParsing).StatusCode }
  catch { $_.Exception.Response.StatusCode.value__ }
}
$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }
Check 'health' 200 (Status "$env:TASKFLOW_URL/v1/health")
Check 'elenco con token' 200 (Status "$env:TASKFLOW_URL/v1/tasks" $h)
Check 'elenco senza token' 401 (Status "$env:TASKFLOW_URL/v1/tasks")
Check 'task inesistente' 404 (Status "$env:TASKFLOW_URL/v1/tasks/9999" $h)
Write-Output "PASS: $script:pass FAIL: $script:fail"
if ($script:fail -gt 0) { exit 1 }
`;

const RICERCHE_SH = `#!/bin/bash
OK=0
GESTITI=0
for i in 1 2 3 4 5 6 7 8; do
  for tent in 1 2 3; do
    RESP=$(curl -si -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/search?q=api")
    CODE=$(echo "$RESP" | head -1 | cut -d' ' -f2)
    if [ "$CODE" = "200" ]; then
      OK=$((OK+1))
      break
    fi
    if [ "$CODE" = "429" ]; then
      GESTITI=$((GESTITI+1))
      ATTESA=$(echo "$RESP" | grep -i retry-after | cut -d' ' -f2 | tr -d '\\r')
      sleep "$ATTESA"
    fi
  done
done
echo "completate $OK ricerche, 429 gestiti: $GESTITI"
[ "$OK" -eq 8 ] || exit 1
`;

const RICERCHE_PS1 = `$ok = 0
$gestiti = 0
$h = @{ Authorization = "Bearer $env:TASKFLOW_TOKEN" }
for ($i = 1; $i -le 8; $i++) {
  for ($t = 1; $t -le 3; $t++) {
    try {
      Invoke-RestMethod "$env:TASKFLOW_URL/v1/search?q=api" -Headers $h | Out-Null
      $ok++
      break
    } catch {
      $gestiti++
      Start-Sleep -Seconds ([int]$_.Exception.Response.Headers['Retry-After'])
    }
  }
}
Write-Output "completate $ok ricerche, 429 gestiti: $gestiti"
if ($ok -ne 8) { exit 1 }
`;

export const m7: Lesson[] = [
  {
    id: 'M7.L1',
    module: 7,
    n: 1,
    title: 'Cicli e funzioni per ripetere le operazioni',
    objective: 'Automatizzare richieste ripetitive con un ciclo e raccogliere un comando riutilizzabile in una funzione.',
    explain: [
      'Quando fai la stessa cosa più volte, scrivi un ciclo. Bash: `for i in 1 2 3; do ...; done`. PowerShell: `1..3 | ForEach-Object { ... $_ ... }` oppure `foreach`.',
      'Una funzione dà un nome a una sequenza di comandi: Bash `nome() { ...; }`, PowerShell `function nome { ... }`. Vive finché la shell è aperta (nel laboratorio, nel tuo workspace).',
      'Automatizzare non significa fidarsi: dopo il ciclo verifica sempre il risultato con una lettura.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Un ciclo con una variabile', cmd: { bash: 'for i in 1 2 3; do echo "giro $i"; done', pwsh: '1..3 | ForEach-Object { echo "giro $_" }' }, what: 'Ripete il comando tre volte.', who: 'La shell.', parts: ['$i / $_: valore corrente'], expect: 'giro 1, giro 2, giro 3', risk: 'Un ciclo infinito è bloccato dai limiti del laboratorio.' },
    ],
    predict: [
      {
        prompt: 'Quanti task ci saranno in tutto dopo aver creato 3 task con il ciclo (ora ce ne sono 5)?',
        cmd: { bash: 'echo "5 + 3 = 8"', pwsh: 'echo "5 + 3 = 8"' },
        expect: '8 (e il totale riportato da GET /v1/tasks lo conferma).',
        why: 'Verifica sempre dopo aver automatizzato.',
      },
    ],
    negative: {
      prompt: 'Un ciclo con la variabile non espansa: cosa crea?',
      cmd: { bash: 'for i in 1 2 3; do echo \'Task automatico $i\'; done', pwsh: "1..3 | ForEach-Object { echo 'Task automatico $_' }" },
      explain: "Con gli apici singoli la variabile NON viene espansa: scriveresti tre volte il testo letterale. Nel JSON serve la doppia virgoletta, con l'escape.",
    },
    task: {
      text: 'Con UN ciclo crea tre task con titoli `Task automatico 1`, `Task automatico 2`, `Task automatico 3`. Poi definisci una funzione `mostra` che stampa i titoli dei task che contengono "automatico" (parametro q) e usala.',
      criterion: 'Esistono i tre task; hai usato un ciclo; la funzione `mostra` è definita e ha stampato i tre titoli.',
    },
    checks: [
      {
        id: 'task',
        description: 'I tre task esistono',
        expected: 'Task automatico 1, 2, 3',
        test: (c) => {
          const t = c.state.api.envs.development.tasks.map((x) => x.title);
          const miss = [1, 2, 3].filter((n) => !t.includes(`Task automatico ${n}`));
          return { pass: !miss.length, actual: miss.length ? `mancano: ${miss.join(', ')}` : 'ok' };
        },
        onFail: 'Titoli esatti, nel JSON tra doppie virgolette; la variabile del ciclo deve stare in un testo con virgolette doppie.',
        errorTag: 'content-type',
      },
      {
        id: 'ciclo',
        description: 'Hai usato un ciclo',
        expected: 'for / foreach / ForEach-Object',
        test: (c) => ({ pass: cmdMatches(c, /\bfor\b|\bwhile\b|ForEach-Object|\bforeach\b|\|\s*%/), actual: cmdMatches(c, /\bfor\b|ForEach-Object|foreach/) ? 'sì' : 'nessun ciclo nello storico' }),
        onFail: 'Un solo comando con ciclo, non tre comandi separati.',
      },
      {
        id: 'funzione',
        description: 'La funzione mostra è definita e stampa i titoli',
        expected: 'output con i tre titoli',
        test: (c) => {
          const sh = c.state.shells[c.shell];
          const def = Object.keys(sh.functions).some((k) => k.toLowerCase() === 'mostra');
          const out = c.cmds.some((x) => x.exit === 0 && /^mostra\b/.test(x.cmd) && [1, 2, 3].every((n) => x.stdout.includes(`Task automatico ${n}`)));
          return { pass: def && out, actual: `definita:${def} output:${out}` };
        },
        onFail: 'Definisci mostra() e poi invocala digitando mostra.',
      },
    ],
    example: { text: 'Esempio analogo: funzione che stampa lo stato del servizio.', cmd: { bash: 'stato() { curl -s $TASKFLOW_URL/v1/health | jq -r .status; }; stato', pwsh: 'function stato { (Invoke-RestMethod "$env:TASKFLOW_URL/v1/health").status }; stato' } },
    hints: ['Il corpo JSON in Bash va tra virgolette doppie con \\" per le virgolette interne, così $i si espande.', 'In PowerShell costruisci il body con (@{ title = "Task automatico $_" } | ConvertTo-Json).'],
    solutions: {
      bash: ['for i in 1 2 3; do curl -s -X POST -H "Authorization: Bearer $TASKFLOW_TOKEN" -H "Content-Type: application/json" -d "{\\"title\\":\\"Task automatico $i\\"}" $TASKFLOW_URL/v1/tasks > /dev/null; done', 'mostra() { curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/tasks?q=automatico" | jq -r ".data[].title"; }', 'mostra'],
      pwsh: ['1..3 | ForEach-Object { Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks" -Method Post -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} -ContentType "application/json" -Body (@{ title = "Task automatico $_" } | ConvertTo-Json) | Out-Null }', 'function mostra { (Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks?q=automatico" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"}).data | ForEach-Object { $_.title } }', 'mostra'],
    },
    summary: ['ciclo for / ForEach-Object', 'funzioni', 'verifica dopo l\'automazione'],
    skills: ['comandi', 'autonomia', 'testing'],
    concepts: ['cicli', 'funzioni', 'chiamate API da script'],
  },
  {
    id: 'M7.L2',
    module: 7,
    n: 2,
    title: 'Una suite di test ripetibile con report',
    objective: 'Raccogliere i controlli in uno script che stampa PASS/FAIL, un riepilogo e restituisce un codice di uscita.',
    explain: [
      'Una suite di test è uno script che esegue più controlli e produce un riepilogo. Per una pipeline automatica il risultato finale è il codice di uscita: 0 se tutto passa, ≠ 0 se almeno un controllo fallisce.',
      'Struttura: contatori PASS/FAIL, una funzione `check nome atteso ottenuto`, una funzione che restituisce lo status, i controlli, il riepilogo `PASS: n FAIL: m` e `exit 1` se FAIL > 0.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Una funzione di confronto', cmd: { bash: 'check() { [ "$2" = "$3" ] && echo "PASS: $1" || echo "FAIL: $1"; }; check prova 200 200', pwsh: 'function Check($n, $a, $o) { if ("$a" -eq "$o") { "PASS: $n" } else { "FAIL: $n" } }; Check prova 200 200' }, what: 'Confronta atteso e ottenuto.', who: 'La shell.', parts: ['$2 e $3: argomenti della funzione'], expect: 'PASS: prova', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Cosa vale il codice di uscita dello script se un solo controllo fallisce?', cmd: { bash: 'false; echo "exit=$?"', pwsh: 'echo "exit=1"' }, expect: 'Diverso da 0 (1): lo script deve terminare con exit 1.', why: 'Una pipeline automatica legge solo il codice di uscita.' },
    ],
    negative: {
      prompt: 'Uno script che stampa FAIL ma termina con 0: perché è pericoloso?',
      cmd: { bash: 'echo "FAIL: x"; exit 0', pwsh: 'echo "FAIL: x"' },
      explain: 'Chi lo chiama (una pipeline) vede "successo": i test falliti passano inosservati. Il codice di uscita deve riflettere l\'esito.',
    },
    task: {
      text: 'In ~/corso-cli/m7l2 crea `suite.sh` (Bash) o `suite.ps1` (PowerShell) con almeno 4 controlli (health 200; elenco con token 200; elenco senza token 401; task 9999 → 404). Deve stampare `PASS: n FAIL: m` e uscire con 1 se m > 0. Eseguila.',
      criterion: 'L\'esecuzione stampa PASS: 4 (o più) FAIL: 0 ed esce con 0.',
    },
    checks: [
      {
        id: 'esegue',
        description: 'La suite passa tutti i controlli',
        expected: 'PASS ≥ 4, FAIL: 0, exit 0',
        test: (c) => {
          const f = c.shell === 'bash' ? 'suite.sh' : 'suite.ps1';
          if (c.read(f) === null) return { pass: false, actual: `${f} mancante` };
          const r = c.sandbox(c.shell === 'bash' ? 'bash suite.sh' : './suite.ps1');
          const m = /PASS:\s*(\d+)\s+FAIL:\s*(\d+)/.exec(r.out);
          return { pass: r.code === 0 && !!m && parseInt(m[1], 10) >= 4 && m[2] === '0', actual: m ? `PASS ${m[1]} FAIL ${m[2]} exit ${r.code}` : `exit ${r.code}: ${(r.err || r.out).trim().split('\n')[0]?.slice(0, 80)}` };
        },
        onFail: 'Controlla che lo script stampi la riga "PASS: n FAIL: m" e che i quattro controlli abbiano gli status attesi.',
      },
      {
        id: 'exit',
        description: 'Lo script segnala il fallimento con exit',
        expected: 'exit 1 se FAIL > 0',
        test: (c) => {
          const t = c.read(c.shell === 'bash' ? 'suite.sh' : 'suite.ps1') ?? '';
          return { pass: /exit\s+1/.test(t), actual: /exit\s+1/.test(t) ? 'ok' : 'nessun exit 1' };
        },
        onFail: 'Aggiungi in fondo: se FAIL > 0 esci con exit 1.',
      },
    ],
    example: { text: 'Esempio analogo: riepilogo con contatori.', cmd: { bash: 'PASS=2; FAIL=0; echo "PASS: $PASS FAIL: $FAIL"' } },
    hints: ['Parti dalla funzione check dell\'esempio guidato e dalla funzione status (curl -s -o /dev/null -w "%{http_code}").', 'Alla fine: echo "PASS: $PASS FAIL: $FAIL" e [ "$FAIL" -eq 0 ] || exit 1.'],
    solutions: {
      bash: ['cd ~/corso-cli/m7l2', `cat > suite.sh <<'EOF'\n${SUITE_SH}EOF`, 'bash suite.sh'],
      pwsh: ['cd ~/corso-cli/m7l2', `Set-Content suite.ps1 -Value @'\n${SUITE_PS1}'@`, './suite.ps1'],
    },
    summary: ['contatori PASS/FAIL', 'riepilogo leggibile', 'exit code come risultato per le pipeline'],
    skills: ['testing', 'autonomia', 'comandi'],
    concepts: ['automazione di verifiche', 'suite di test in uno script', 'exit code'],
  },
  {
    id: 'M7.L3',
    module: 7,
    n: 3,
    title: 'Retry con Retry-After: gestire il rate limit',
    objective: 'Scrivere un client che rispetta il rate limit: su 429 attende il tempo indicato e riprova, con un massimo di tentativi.',
    explain: [
      'Un client educato non insiste: quando riceve 429 legge `Retry-After`, attende quel numero di secondi e riprova, fino a un massimo di tentativi. Se supera il massimo segnala il fallimento.',
      'Nel laboratorio `sleep` fa avanzare l\'orologio simulato: non c\'è attesa reale, ma il rate limit di /v1/search si comporta come se fosse passato il tempo.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => setupApi(c, { token: 'valid' }),
    guided: [
      { title: 'Leggere Retry-After', cmd: { bash: 'for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/search?q=api"; done; echo', pwsh: '1..6 | ForEach-Object { try { irm "$env:TASKFLOW_URL/v1/search?q=api" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} | Out-Null; "200" } catch { "429" } }' }, what: 'Provoca il limite.', who: 'Il server.', parts: ['sei richieste in rapida successione'], expect: '200 ×5 poi 429', risk: 'Nessuno.' },
    ],
    predict: [
      { prompt: 'Dopo un 429 e un sleep del tempo indicato da Retry-After, la richiesta successiva passa?', cmd: { bash: 'echo "si: il tempo simulato avanza"', pwsh: 'echo "si: il tempo simulato avanza"' }, expect: 'Sì: la finestra di 60 secondi ha liberato uno slot.', why: 'Retry-After indica quando riprovare.' },
    ],
    negative: {
      prompt: 'Cosa succede se riprovi subito senza attendere?',
      cmd: { bash: 'curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" "$TASKFLOW_URL/v1/search?q=api"', pwsh: 'try { irm "$env:TASKFLOW_URL/v1/search?q=api" -Headers @{Authorization="Bearer $env:TASKFLOW_TOKEN"} } catch { $_.ErrorDetails.Message }' },
      explain: 'Ancora 429: insistere non aiuta e può peggiorare la situazione.',
    },
    task: {
      text: 'In ~/corso-cli/m7l3 crea `ricerche.sh` (Bash) o `ricerche.ps1` (PowerShell): esegue 8 ricerche su /v1/search; su 429 attende il valore di Retry-After e riprova (massimo 3 tentativi per ricerca). Alla fine stampa `completate 8 ricerche, 429 gestiti: N` ed esce con 0 solo se tutte le ricerche sono riuscite.',
      criterion: 'L\'esecuzione stampa "completate 8 ricerche" con almeno un 429 gestito ed esce con 0.',
    },
    checks: [
      {
        id: 'esegue',
        description: 'Tutte le 8 ricerche completate gestendo i 429',
        expected: 'completate 8 ricerche, 429 gestiti: N≥1; exit 0',
        test: (c) => {
          const f = c.shell === 'bash' ? 'ricerche.sh' : 'ricerche.ps1';
          if (c.read(f) === null) return { pass: false, actual: `${f} mancante` };
          const r = c.sandbox(c.shell === 'bash' ? 'bash ricerche.sh' : './ricerche.ps1');
          const m = /completate (\d+) ricerche, 429 gestiti: (\d+)/.exec(r.out);
          return { pass: r.code === 0 && !!m && m[1] === '8' && parseInt(m[2], 10) >= 1, actual: m ? `completate ${m[1]}, gestiti ${m[2]}, exit ${r.code}` : `exit ${r.code}: ${(r.err || r.out).trim().split('\n')[0]?.slice(0, 80)}` };
        },
        onFail: 'Per ogni ricerca: ciclo di massimo 3 tentativi; su 429 leggi Retry-After, sleep, riprova; conta le ricerche riuscite e i 429 gestiti.',
      },
      {
        id: 'sleep',
        description: 'Lo script rispetta Retry-After (usa sleep / Start-Sleep)',
        expected: 'sleep $ATTESA',
        test: (c) => {
          const t = c.read(c.shell === 'bash' ? 'ricerche.sh' : 'ricerche.ps1') ?? '';
          return { pass: /sleep|Start-Sleep/i.test(t) && /retry-after/i.test(t), actual: /sleep|Start-Sleep/i.test(t) ? 'sleep presente' : 'nessuna attesa' };
        },
        onFail: 'Leggi l\'header Retry-After e attendi quel numero di secondi prima di riprovare.',
      },
    ],
    example: { text: 'Esempio analogo: estrarre il codice di stato dalla prima riga di una risposta completa.', cmd: { bash: 'RESP=$(curl -si $TASKFLOW_URL/v1/health); echo "$RESP" | head -1 | cut -d" " -f2', pwsh: '(Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -UseBasicParsing).StatusCode' } },
    hints: ['Bash: RESP=$(curl -si ...), CODE dalla prima riga, Retry-After con grep/cut/tr -d "\\r".', 'PowerShell: nel catch, [int]$_.Exception.Response.Headers["Retry-After"] e Start-Sleep -Seconds.'],
    solutions: {
      bash: ['cd ~/corso-cli/m7l3', `cat > ricerche.sh <<'EOF'\n${RICERCHE_SH}EOF`, 'bash ricerche.sh'],
      pwsh: ['cd ~/corso-cli/m7l3', `Set-Content ricerche.ps1 -Value @'\n${RICERCHE_PS1}'@`, './ricerche.ps1'],
    },
    summary: ['429 → attendi Retry-After → riprova', 'numero massimo di tentativi', 'conta gli eventi gestiti'],
    skills: ['http', 'autonomia', 'testing'],
    concepts: ['gestione di errori e retry', 'rate limit', 'concatenazione di operazioni'],
  },
];
