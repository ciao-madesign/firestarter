/** Scenari nuovi autonomi dei moduli facoltativi M7 e M9 (2026-10-27): nessuna soluzione completa, contesto diverso dalle lezioni. */
import type { Lesson, SetupCtx } from '../types.ts';
import { DEMO_HEAD } from '../../engine/git-fixture.ts';
import { pick, ranCmd, setupApi } from './helpers.ts';

const ENDPOINT_TXT = `# percorso status_atteso
/v1/health 200

/v1/nonesiste 404
/v1/tasks 401
`;

const VERIFICA_SH = `#!/bin/bash
f="\${1:-endpoint.txt}"
if [ ! -f "$f" ]; then
  echo "uso: verifica.sh [file]" >&2
  exit 2
fi
pass=0
fail=0
while read -r path atteso; do
  case "$path" in
    ''|'#'*) continue ;;
  esac
  got=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://localhost:8080$path")
  if [ "$got" = "$atteso" ]; then
    echo "PASS $path"
    pass=$((pass + 1))
  else
    echo "FAIL $path atteso $atteso ottenuto $got"
    fail=$((fail + 1))
  fi
done < "$f"
echo "Riepilogo: $pass passati, $fail falliti"
if [ "$fail" -eq 0 ]; then exit 0; fi
exit 1
`;

const VERIFICA_PS1 = `param([string]$File = 'endpoint.txt')
if (-not (Test-Path $File)) {
  Write-Error "uso: verifica.ps1 [file]"
  exit 2
}
$pass = 0
$fail = 0
foreach ($riga in Get-Content $File) {
  if ($riga.Trim() -eq '' -or $riga.StartsWith('#')) { continue }
  $p = $riga -split '\\s+'
  $got = curl.exe -s -o NUL -w "%{http_code}" -m 3 "http://localhost:8080$($p[0])"
  if ($got -eq $p[1]) { "PASS $($p[0])"; $pass++ } else { "FAIL $($p[0]) atteso $($p[1]) ottenuto $got"; $fail++ }
}
"Riepilogo: $pass passati, $fail falliti"
if ($fail -eq 0) { exit 0 } else { exit 1 }
`;

const RICOSTRUZIONE_MD = `# Perché /api/health è diventato pubblico

- Commit: 09c6cb1 (Rende pubblico /api/health)
- Autore: Bruno Verdi
- Data: 2026-09-15
- Prima del commit l'endpoint richiedeva il token; dopo è pubblico.
- docs/api.md non è stato aggiornato dal primo commit: la documentazione è rimasta non aggiornata.
`;

function setupProject(c: SetupCtx): void {
  for (const [p, content] of Object.entries(DEMO_HEAD)) c.file(`progetto/${p}`, content);
  c.dirMk('progetto/.git');
}

export const scenarios2: Lesson[] = [
  {
    id: 'M7.L6',
    module: 7,
    n: 6,
    title: 'Scenario nuovo: controllare un elenco di endpoint',
    objective: 'Applicare ciclo, lettura riga per riga, argomenti e codici di uscita a un problema nuovo: uno script che verifica una lista di endpoint con lo status atteso.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Hai tutti gli strumenti di M7 (ciclo sulle righe di un file, argomenti con valore predefinito, codici di uscita, `curl -w "%{http_code}"`).',
      'Il file endpoint.txt ha una riga per endpoint: percorso e status atteso; le righe vuote e quelle che iniziano con # vanno saltate. Lo script chiama ogni percorso su http://localhost:8080 (senza token) e confronta lo status ottenuto con quello atteso.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: (c) => {
      setupApi(c, { token: false });
      c.file('endpoint.txt', ENDPOINT_TXT);
    },
    guided: [
      { title: 'Il file da leggere', cmd: { bash: 'cat ~/corso-cli/m7l6/endpoint.txt', pwsh: 'Get-Content ~/corso-cli/m7l6/endpoint.txt' }, what: 'Mostra gli endpoint da controllare.', who: 'cat / Get-Content.', parts: ['una riga per endpoint: percorso e status atteso', 'righe vuote e commenti (#) da saltare'], expect: 'Tre endpoint con una riga di commento e una vuota.', risk: 'Nessuno: sola lettura.', contains: '/v1/health' },
      { title: 'Solo lo status', cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080/v1/health', pwsh: 'curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/v1/health' }, what: 'Stampa soltanto lo status della risposta.', who: 'curl.', parts: ['-o /dev/null (PowerShell: -o NUL): scarta il body', '-w "%{http_code}": stampa lo status'], expect: '200', risk: 'Nessuno.', contains: '200' },
      { title: 'Due campi per riga', cmd: { bash: 'while read -r a b; do echo "percorso=$a atteso=$b"; done < ~/corso-cli/m7l6/endpoint.txt', pwsh: 'Get-Content ~/corso-cli/m7l6/endpoint.txt | ForEach-Object { $p = $_ -split \'\\s+\'; "percorso=$($p[0]) atteso=$($p[1])" }' }, what: 'Divide ogni riga in percorso e status atteso.', who: 'while read (Bash) / -split (PowerShell).', parts: ['read -r a b: due campi per riga', '-split \'\\s+\': divide agli spazi'], expect: 'Una riga per ogni riga del file, comprese quelle da saltare (le vedrai vuote).', risk: 'Nessuno.', contains: 'percorso=/v1/health atteso=200' },
    ],
    predict: [
      {
        prompt: 'Che status ottiene una GET su /v1/tasks senza token?',
        cmd: { bash: 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8080/v1/tasks', pwsh: 'curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/v1/tasks' },
        expect: '401: manca l\'autenticazione.',
        why: 'Senza intestazione Authorization l\'API rifiuta la richiesta: è proprio lo status che endpoint.txt si aspetta.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se confronti lo status con il valore atteso quando il file ha righe vuote?',
      cmd: { bash: 'while read -r a b; do echo "[$a] [$b]"; done < ~/corso-cli/m7l6/endpoint.txt', pwsh: 'Get-Content ~/corso-cli/m7l6/endpoint.txt | ForEach-Object { $p = $_ -split \'\\s+\'; "[$($p[0])] [$($p[1])]" }' },
      explain: 'Le righe vuote e il commento producono campi vuoti o senza senso: se non le salti, lo script chiama percorsi inesistenti e segnala falsi FAIL.',
    },
    task: {
      text: 'In ~/corso-cli/m7l6 scrivi `verifica.sh` (PowerShell: `verifica.ps1`). Legge endpoint.txt (o il file indicato come primo argomento), salta righe vuote e commenti, e per ogni endpoint stampa `PASS <percorso>` se lo status coincide con quello atteso oppure `FAIL <percorso> atteso N ottenuto M`. Alla fine stampa `Riepilogo: P passati, F falliti`. Codice di uscita: 0 se tutto passa, 1 se almeno un controllo fallisce, 2 se il file non esiste (con un messaggio d\'uso sul canale degli errori).',
      criterion: 'Con endpoint.txt: 3 PASS, riepilogo 3 passati / 0 falliti, uscita 0; con un file che si aspetta lo status sbagliato: FAIL e uscita 1; con un file inesistente: uscita 2.',
    },
    checks: [
      {
        id: 'tutto-ok',
        description: 'Con endpoint.txt: 3 PASS, «Riepilogo: 3 passati, 0 falliti», uscita 0',
        expected: '3 PASS, riepilogo 3/0, codice 0',
        test: (c) => {
          const r = c.sandbox(pick(c, 'bash verifica.sh', './verifica.ps1'));
          const passes = (r.out.match(/^PASS \//gm) ?? []).length;
          return { pass: r.code === 0 && passes === 3 && /Riepilogo: 3 passati, 0 falliti/.test(r.out), actual: `codice ${r.code}, ${passes} PASS, «${r.out.trim().split('\n').pop() ?? ''}»` };
        },
        onFail: 'Salta righe vuote e commenti; confronta lo status con il secondo campo; conta passati e falliti e stampa il riepilogo.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'fallimento',
        description: 'Con un file dove lo status atteso è sbagliato: FAIL con i due valori, uscita 1',
        expected: 'FAIL /v1/health atteso 404 ottenuto 200, codice 1',
        test: (c) => {
          const setupCmd = pick(c, "printf '/v1/health 404\\n' > alt.txt; bash verifica.sh alt.txt", "Set-Content alt.txt -Value '/v1/health 404'; ./verifica.ps1 alt.txt");
          const r = c.sandbox(setupCmd);
          return { pass: r.code === 1 && /FAIL \/v1\/health atteso 404 ottenuto 200/.test(r.out) && /Riepilogo: 0 passati, 1 falliti/.test(r.out), actual: `codice ${r.code}, «${r.out.trim().replace(/\n/g, ' | ').slice(0, 80)}»` };
        },
        onFail: 'Se lo status non coincide stampa «FAIL <percorso> atteso N ottenuto M», conta il fallimento ed esci con 1 alla fine. Lo script deve leggere il file indicato, non uno fisso.',
      },
      {
        id: 'file-mancante',
        description: 'Con un file inesistente: messaggio d\'uso ed uscita 2',
        expected: 'codice 2 e un messaggio con «uso»',
        test: (c) => {
          const r = c.sandbox(pick(c, 'bash verifica.sh manca.txt', './verifica.ps1 manca.txt'));
          return { pass: r.code === 2 && /uso/i.test(r.out + r.err), actual: `codice ${r.code}, messaggio «${(r.out + r.err).trim().slice(0, 40)}»` };
        },
        onFail: 'Controlla che il file esista prima del ciclo; se manca scrivi un messaggio d\'uso (su stderr in Bash) ed esci con 2.',
      },
      {
        id: 'eseguito',
        description: 'Hai eseguito lo script almeno una volta',
        expected: 'verifica.sh / verifica.ps1 nello storico dei comandi',
        test: (c) => {
          const ok = ranCmd(c, /verifica\.(sh|ps1)/, false);
          return { pass: ok, actual: ok ? 'ok' : 'nessuna esecuzione' };
        },
        onFail: 'Prima di consegnare, esegui lo script e leggi l\'output.',
        errorTag: 'previsioni-incoerenti',
      },
    ],
    example: { text: 'Esempio analogo: contare quante righe di un file non sono commenti né vuote.', cmd: { bash: 'grep -v -e \'^#\' -e \'^$\' ~/corso-cli/m7l6/endpoint.txt | wc -l', pwsh: '(Get-Content ~/corso-cli/m7l6/endpoint.txt | Where-Object { $_ -and -not $_.StartsWith(\'#\') }).Count' } },
    hints: ['Struttura: controlla il file → ciclo sulle righe (salta vuote e #) → richiesta → confronto → contatori → riepilogo → exit.', 'Lo status si ottiene con curl -s -o /dev/null -w "%{http_code}" (PowerShell: curl.exe ... -o NUL).'],
    reference: {
      bash: ['cd ~/corso-cli/m7l6', `cat > verifica.sh <<'EOF'\n${VERIFICA_SH}EOF`, 'bash verifica.sh', 'echo "codice: $?"'],
      pwsh: ['cd ~/corso-cli/m7l6', `Set-Content verifica.ps1 -Value @'\n${VERIFICA_PS1}'@`, './verifica.ps1', '"codice: $LASTEXITCODE"'],
    },
    summary: ['ciclo sulle righe, saltando vuote e commenti', 'status con curl -w "%{http_code}"', 'un contatore per esito e un riepilogo', 'un codice di uscita per ogni esito'],
    skills: ['comandi', 'testing', 'autonomia'],
    concepts: ['trasferimento: ciclo + argomenti + codici di uscita', 'curl -w http_code'],
  },
  {
    id: 'M9.L7',
    module: 9,
    n: 7,
    title: 'Scenario nuovo: ricostruire una modifica dalla cronologia',
    objective: 'Usare Git in sola lettura per ricostruire chi, quando e perché ha cambiato un comportamento, e verificare se la documentazione è stata aggiornata.',
    explain: [
      'Verifica autonoma: non c\'è soluzione completa. Hai gli strumenti di M9 (`git log`, `git show`, `git blame`, anche limitati a un file con `--`). Lavori in sola lettura sul progetto d\'esempio.',
      'Domanda: l\'endpoint /api/health non richiede più il token. Chi ha cambiato questo comportamento, in quale commit e quando? La documentazione (docs/api.md) è stata aggiornata dopo la modifica? Scrivi la risposta in ricostruzione.md, con l\'evidenza (hash del commit) e la conclusione sulla documentazione.',
    ],
    shells: ['bash', 'pwsh'],
    autonomous: true,
    setup: setupProject,
    guided: [
      { title: 'La storia di un file', cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git log --oneline -- app/api/notes/route.ts', pwsh: 'cd ~/corso-cli/m9l7/progetto; git log --oneline -- app/api/notes/route.ts' }, what: 'Elenca i commit che hanno toccato un solo file.', who: 'git log.', parts: ['--oneline: hash abbreviato e messaggio', '-- file: limita la storia al file'], expect: 'Tre commit per il file delle note.', risk: 'Nessuno: sola lettura.', contains: 'Valida il titolo' },
      { title: 'Autore e data di un commit', cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git log -1 43b3490', pwsh: 'cd ~/corso-cli/m9l7/progetto; git log -1 43b3490' }, what: 'Mostra autore, data e messaggio di un solo commit.', who: 'git log.', parts: ['-1: un solo commit', '43b3490: il commit da mostrare'], expect: 'Autore Bruno Verdi, data 17 agosto 2026.', risk: 'Nessuno.', contains: 'Bruno Verdi' },
      { title: 'La documentazione', cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git log --oneline -- docs/api.md', pwsh: 'cd ~/corso-cli/m9l7/progetto; git log --oneline -- docs/api.md' }, what: 'Mostra quando è stata modificata la documentazione.', who: 'git log.', parts: ['docs/api.md: il file della documentazione'], expect: 'Un solo commit, il primo.', risk: 'Nessuno.', contains: 'Prima versione' },
    ],
    predict: [
      {
        prompt: 'Quanti commit hanno modificato docs/api.md? Annota una stima.',
        cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git log --oneline -- docs/api.md | wc -l', pwsh: 'cd ~/corso-cli/m9l7/progetto; (git log --oneline -- docs/api.md | Measure-Object -Line).Lines' },
        expect: '1: solo il commit iniziale.',
        why: 'Se la documentazione non compare nei commit successivi, il codice è cambiato senza aggiornarla.',
      },
    ],
    negative: {
      prompt: 'Prova a correggere la documentazione con un commit: cosa risponde il laboratorio?',
      cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git commit -m prova', pwsh: 'cd ~/corso-cli/m9l7/progetto; git commit -m prova' },
      explain: 'Git è in sola lettura nel laboratorio: la ricostruzione si fa leggendo la cronologia, mai modificandola.',
    },
    task: {
      text: 'In ~/corso-cli/m9l7 crea ricostruzione.md: il commit (hash) che ha reso pubblico /api/health, il suo autore e la data, e una conclusione sulla documentazione (docs/api.md è stata aggiornata dopo quel commit?). Usa solo comandi in sola lettura.',
      criterion: 'ricostruzione.md contiene l\'hash 09c6cb1, l\'autore Bruno Verdi, la data 15 settembre 2026 e la conclusione che la documentazione non è stata aggiornata; hai usato git log o git show.',
    },
    checks: [
      {
        id: 'commit',
        description: 'ricostruzione.md indica il commit 09c6cb1',
        expected: 'hash 09c6cb1',
        test: (c) => {
          const md = c.read('ricostruzione.md') ?? '';
          return { pass: /09c6cb1/.test(md), actual: /09c6cb1/.test(md) ? 'presente' : 'hash non trovato' };
        },
        onFail: 'Cerca la storia di app/api/health/route.ts: il commit che l\'ha reso pubblico è il più recente.',
      },
      {
        id: 'autore-data',
        description: 'ricostruzione.md indica l\'autore (Bruno Verdi) e la data (15 settembre 2026)',
        expected: 'Bruno Verdi e 2026-09-15',
        test: (c) => {
          const md = c.read('ricostruzione.md') ?? '';
          const a = /Bruno\s+Verdi/i.test(md);
          const d = /2026-09-15|15\s+(set|sep)\w*\s+2026|(sep|set)\w*\s+15,?\s+2026|15\/09\/2026/i.test(md);
          return { pass: a && d, actual: `autore:${a} data:${d}` };
        },
        onFail: 'Autore e data si leggono con git log (o git show) sul commit.',
      },
      {
        id: 'docs',
        description: 'ricostruzione.md conclude che docs/api.md non è stata aggiornata',
        expected: 'docs/api.md + «non aggiornata»',
        test: (c) => {
          const md = c.read('ricostruzione.md') ?? '';
          const ok = /docs\/api\.md/.test(md) && /non\s+(è\s+stat\w+\s+)?aggiornat|mai\s+aggiornat|rimast\w+\s+(invariat|non aggiornat)|obsolet|disallineat/i.test(md);
          return { pass: ok, actual: ok ? 'ok' : 'manca la conclusione sulla documentazione' };
        },
        onFail: 'Controlla la storia di docs/api.md: se non compare dopo il commit del 15 settembre, la documentazione è rimasta indietro. Scrivilo.',
      },
      {
        id: 'evidenza',
        description: 'Hai letto la cronologia con git log o git show',
        expected: 'git log / git show nello storico',
        test: (c) => {
          const ok = ranCmd(c, /\bgit\s+(log|show)\b/, true);
          return { pass: ok, actual: ok ? 'ok' : 'nessun git log/show riuscito' };
        },
        onFail: 'La conclusione deve poggiare su evidenza: usa git log -- file oppure git show.',
        errorTag: 'previsioni-incoerenti',
      },
    ],
    example: { text: 'Esempio analogo: chi ha aggiunto il webhook?', cmd: { bash: 'cd ~/corso-cli/m9l7/progetto && git log -- api/webhook-polar.js', pwsh: 'cd ~/corso-cli/m9l7/progetto; git log -- api/webhook-polar.js' } },
    hints: ['git log -- app/api/health/route.ts elenca i commit del file; il più recente è la modifica cercata.', 'Per la documentazione: git log --oneline -- docs/api.md. Cosa vedi dopo il 15 settembre?'],
    reference: {
      bash: ['cd ~/corso-cli/m9l7/progetto', 'git log -- app/api/health/route.ts', 'git log --oneline -- docs/api.md', 'cd ~/corso-cli/m9l7', `cat > ricostruzione.md <<'EOF'\n${RICOSTRUZIONE_MD}EOF`],
      pwsh: ['cd ~/corso-cli/m9l7/progetto', 'git log -- app/api/health/route.ts', 'git log --oneline -- docs/api.md', 'cd ~/corso-cli/m9l7', `Set-Content ricostruzione.md -Value @'\n${RICOSTRUZIONE_MD}'@`],
    },
    summary: ['git log -- file per la storia di un file', 'autore, data e hash sono evidenza', 'una conclusione si basa sulla cronologia', 'la documentazione può restare indietro rispetto al codice'],
    skills: ['docs', 'autonomia'],
    concepts: ['trasferimento: cronologia Git in sola lettura', 'documentazione disallineata'],
  },
];
