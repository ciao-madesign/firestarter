import type { Lesson } from '../types.ts';
import { cmdMatches, cwdOf, stdoutHas } from './helpers.ts';

const R = '/home/learner/corso-cli';

export const m1: Lesson[] = [
  {
    id: 'M1.R',
    module: 1,
    n: 0,
    review: true,
    title: 'Ripasso rapido dei 4 errori ricorrenti',
    objective: 'In circa 5 minuti: percorsi assoluti con le maiuscole giuste, errore di sintassi vs errore di esecuzione, lettura del prompt, previsioni coerenti.',
    explain: [
      'Quattro errori sono emersi nel test intermedio di M1: maiuscole e barra iniziale nei percorsi, confusione tra errore di sintassi ed errore di esecuzione, prompt non letto prima di eseguire, previsioni troppo semplificate.',
      'Questo ripasso è un mini-esercizio per ciascuno. Su Linux (e nel laboratorio) le maiuscole contano sempre: `/home/Learner` non è `/home/learner`.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('Documenti/Rapporti/rapporto.txt', 'Rapporto trimestrale\n');
      c.cwd('both', '/tmp');
    },
    guided: [
      {
        title: 'Leggi il prompt',
        cmd: { bash: 'pwd', pwsh: 'pwd' },
        what: 'Stampa la cartella corrente.',
        who: 'È un comando interno della shell.',
        parts: ['pwd: il comando, senza argomenti'],
        expect: 'Il percorso assoluto, che coincide con quello mostrato nel prompt (con ~ al posto della home).',
        risk: 'Nessuno: sola lettura.',
      },
    ],
    predict: [
      {
        prompt: 'Sei in /tmp. Cosa stampa `ls -l /home/Learner`? (nota la L maiuscola)',
        cmd: { bash: 'ls -l /home/Learner', pwsh: 'Get-ChildItem /home/Learner' },
        expect: 'Errore di esecuzione: il comando parte, ma la cartella non esiste ("No such file or directory" / "Cannot find path").',
        why: 'Le maiuscole contano: Learner e learner sono nomi diversi.',
      },
    ],
    negative: {
      prompt: 'Provoca un errore di SINTASSI: la shell deve rifiutare la riga prima di far partire il comando.',
      cmd: { bash: 'ls -l Mio Progetto (v2)', pwsh: 'Get-ChildItem )' },
      explain: 'Un errore di sintassi lo segnala la shell: il comando non parte. Un errore di esecuzione lo segnala il comando, dopo essere partito.',
    },
    task: {
      text: "1) Con un unico `cd` e un percorso ASSOLUTO, entra in ~/corso-cli/m1r/Documenti/Rapporti.\n2) Provoca un errore di sintassi e poi un errore di esecuzione (due comandi diversi).\n3) Stampa il percorso completo della cartella in cui ti trovi, leggendolo dal prompt.\n4) Compila una previsione (scheda Istruzioni) per il comando di previsione e valutala dopo il confronto.",
      criterion: 'Il prompt mostra la cartella Rapporti; hai un errore di sintassi e uno di esecuzione nello storico; hai stampato il percorso; hai una previsione valutata.',
    },
    checks: [
      {
        id: 'cwd',
        description: 'Ti trovi in ~/corso-cli/m1r/Documenti/Rapporti',
        expected: `${R}/m1r/Documenti/Rapporti`,
        test: (c) => ({ pass: cwdOf(c) === `${R}/m1r/Documenti/Rapporti`, actual: cwdOf(c) }),
        onFail: 'Ricorda: percorso assoluto (inizia con /), maiuscole esatte (Documenti, Rapporti). Leggi il prompt: dice dove sei.',
        errorTag: 'percorsi-maiuscole',
      },
      {
        id: 'syntax',
        description: 'Hai provocato un errore di sintassi',
        expected: 'un comando rifiutato dalla shell (syntax error / ParserError)',
        test: (c) => {
          const e = c.cmds.find((x) => x.exit !== 0 && /syntax error|ParserError|Unexpected token|Missing/i.test(x.stderr));
          return { pass: !!e, actual: e ? e.cmd : 'nessuno' };
        },
        onFail: "Un errore di sintassi è un messaggio della shell tipo 'syntax error near unexpected token'. Prova con parentesi non quotate.",
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'exec',
        description: 'Hai provocato un errore di esecuzione',
        expected: 'un comando partito che fallisce (No such file / Cannot find path)',
        test: (c) => {
          const e = c.cmds.find((x) => x.exit !== 0 && /No such file|Cannot find path|not found|cannot access/i.test(x.stderr) && !/syntax error|ParserError|Unexpected token/i.test(x.stderr));
          return { pass: !!e, actual: e ? e.cmd : 'nessuno' };
        },
        onFail: 'Un errore di esecuzione arriva dal comando, non dalla shell: es. `ls` su una cartella che non esiste.',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'pwd',
        description: 'Hai stampato il percorso della cartella corrente',
        expected: `un comando con output ${R}/m1r/Documenti/Rapporti`,
        test: (c) => ({ pass: stdoutHas(c, `${R}/m1r/Documenti/Rapporti`), actual: stdoutHas(c, `${R}/m1r/Documenti/Rapporti`) ? 'trovato' : 'nessun output con il percorso' }),
        onFail: 'Dopo il cd, esegui `pwd` e confronta con il prompt prima di fare altro.',
        errorTag: 'prompt-non-letto',
      },
      {
        id: 'prediction',
        description: 'Hai scritto e valutato una previsione',
        expected: 'almeno una previsione con autovalutazione',
        test: (c) => {
          const p = c.state.predictions.filter((x) => x.lesson === 'M1.R' && x.accurate !== null);
          return { pass: p.length > 0, actual: `${p.length} previsioni valutate` };
        },
        onFail: 'Scrivi la previsione PRIMA di eseguire, poi confrontala con l\'output e segna se coincideva punto per punto.',
        errorTag: 'previsioni-incoerenti',
      },
    ],
    example: { text: 'Esempio analogo: per andare in /usr/share/doc con un percorso assoluto.', cmd: { bash: 'cd /usr/share/doc', pwsh: 'cd /usr/share/doc' } },
    hints: ['Il percorso assoluto inizia con / e rispetta le maiuscole: /home/learner/corso-cli/m1r/Documenti/Rapporti.', 'L\'errore di sintassi lo ottieni con parentesi non quotate; quello di esecuzione con una cartella che non esiste.'],
    solutions: {
      bash: ['#predict: ls -l /home/Learner stampa No such file or directory', 'cd /home/learner/corso-cli/m1r/Documenti/Rapporti', 'ls -l Mio Progetto (v2)', 'ls /home/Learner', 'pwd'],
      pwsh: ['#predict: Get-ChildItem /home/Learner dà Cannot find path', 'cd /home/learner/corso-cli/m1r/Documenti/Rapporti', 'Get-ChildItem )', 'Get-ChildItem /home/Learner', 'pwd'],
    },
    summary: ['maiuscole e barra iniziale contano', 'la shell segnala la sintassi, il comando segnala l\'esecuzione', 'leggi il prompt prima di eseguire', 'una previsione si confronta punto per punto'],
    skills: ['comandi', 'output', 'autonomia'],
    concepts: ['ripasso: percorsi assoluti case-sensitive', 'ripasso: errore di sintassi vs errore di esecuzione', 'ripasso: lettura del prompt'],
  },
  {
    id: 'M1.L1',
    module: 1,
    n: 1,
    title: 'Terminale, shell, variabili',
    objective: 'Distinguere terminale e shell, leggere il prompt, usare echo e le variabili ($SHELL, $HOME) e riconoscere il fallimento silenzioso.',
    explain: [
      'Il terminale è la finestra; la shell è il programma che interpreta ciò che scrivi. Qui lavori in Bash (o in PowerShell, per confronto).',
      'Il prompt ti dice chi sei, dove sei e che la shell è pronta: `learner@lab:~$` significa utente learner, host lab, cartella ~ (la tua home).',
      'Una variabile è un nome a cui è associato un valore. In Bash la leggi con il `$`: `$HOME`. Se la variabile non esiste, la shell non dà errore: la sostituisce con il vuoto (fallimento silenzioso).',
    ],
    shells: ['bash', 'pwsh'],
    setup: () => undefined,
    guided: [
      {
        title: 'Un comando e i suoi argomenti',
        cmd: { bash: 'echo Ciao mondo', pwsh: 'echo Ciao mondo' },
        what: 'Stampa i suoi argomenti.',
        who: 'echo è un comando interno della shell: la shell lo interpreta.',
        parts: ['echo: il comando', 'Ciao e mondo: due argomenti separati da spazio'],
        expect: 'Ciao mondo',
        risk: 'Nessuno.',
      },
      {
        title: 'Leggere una variabile',
        cmd: { bash: 'echo $SHELL', pwsh: 'echo $env:SHELL' },
        what: 'Stampa il valore della variabile che contiene la shell in uso.',
        who: 'La shell sostituisce $SHELL con il suo valore PRIMA di far partire echo.',
        parts: ['$SHELL: variabile (in PowerShell le variabili d\'ambiente sono $env:NOME)'],
        expect: 'Il percorso della shell (/bin/bash in Bash).',
        risk: 'Nessuno.',
      },
    ],
    predict: [
      {
        prompt: 'Cosa stampa `echo SHELL` (senza il $)?',
        cmd: { bash: 'echo SHELL', pwsh: 'echo SHELL' },
        expect: 'SHELL (il testo letterale: senza $ è un semplice argomento).',
        why: 'Senza il $ la shell non cerca nessuna variabile.',
      },
      {
        prompt: 'Cosa stampa `echo $VARIABILE_CHE_NON_ESISTE`?',
        cmd: { bash: 'echo $VARIABILE_CHE_NON_ESISTE', pwsh: 'echo $env:VARIABILE_CHE_NON_ESISTE' },
        expect: 'Una riga vuota, nessun errore.',
        why: 'Una variabile inesistente diventa vuota: fallimento silenzioso.',
      },
    ],
    negative: {
      prompt: 'Una variabile con un nome sbagliato non dà errore. Che cosa stampa questo comando?',
      cmd: { bash: 'echo "Utente: $USR - Home: $HOME"', pwsh: 'echo "Utente: $env:USR - Home: $HOME"' },
      explain: 'USR non esiste (la variabile giusta è USER): al suo posto resta il vuoto e il comando "riesce" comunque. Controlla sempre l\'output.',
    },
    task: {
      text: 'Con UN comando stampa una riga nella forma `Shell: <shell> - Home: <home>` usando le variabili (non scrivere i valori a mano).',
      criterion: 'L\'output è esattamente la riga richiesta e il comando contiene il carattere $.',
    },
    checks: [
      {
        id: 'riga',
        description: 'Una riga "Shell: ... - Home: /home/learner" prodotta da variabili',
        expected: 'Shell: <valore di SHELL> - Home: /home/learner, con $ nel comando',
        test: (c) => {
          const want = `Shell: ${c.state.shells[c.shell].env.SHELL} - Home: /home/learner`;
          const hit = c.cmds.find((x) => x.exit === 0 && x.stdout.trim() === want && x.cmd.includes('$'));
          return { pass: !!hit, actual: hit ? hit.stdout.trim() : 'nessun comando con quell\'output' };
        },
        onFail: 'Le variabili si usano con il $; il testo con spazi va tra virgolette doppie così le variabili vengono espanse.',
      },
    ],
    example: { text: 'Esempio analogo con altre variabili.', cmd: { bash: 'echo "Utente: $USER - Directory: $PWD"', pwsh: 'echo "Utente: $env:USER - Directory: $PWD"' } },
    hints: ['In Bash la shell è in $SHELL, la home in $HOME. In PowerShell: $env:SHELL e $HOME.', 'Le virgolette doppie permettono di mettere variabili dentro una frase.'],
    solutions: {
      bash: ['echo "Shell: $SHELL - Home: $HOME"'],
      pwsh: ['echo "Shell: $env:SHELL - Home: $HOME"'],
    },
    summary: ['terminale ≠ shell', 'il prompt si legge', 'echo stampa gli argomenti', '$NOME espande una variabile', 'variabile inesistente = vuoto, nessun errore'],
    skills: ['comandi', 'output'],
    concepts: ['terminale e shell', 'echo', 'variabili con $', 'lettura del prompt', 'fallimento silenzioso delle variabili inesistenti'],
  },
  {
    id: 'M1.L2',
    module: 1,
    n: 2,
    title: 'Percorsi e navigazione',
    objective: 'Usare pwd, ls e cd con percorsi assoluti e relativi, rispettando le maiuscole, e leggere un messaggio di errore.',
    explain: [
      'Un percorso assoluto inizia con `/` e vale ovunque ti trovi. Uno relativo dipende dalla cartella corrente. `.` è la cartella corrente, `..` quella superiore, `~` la home.',
      'Nel terminale i nomi sono quelli reali: le maiuscole contano (`Progetti` ≠ `progetti`). Sul Mac il Finder mostra nomi tradotti (Documenti), ma il terminale vede `Documents`; nel laboratorio i nomi che vedi con `ls` sono sempre quelli reali, anche quando sono in italiano.',
      'Un errore si legge da sinistra: `shell: comando: argomento: causa`.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('Progetti/Alpha/note.txt', 'Note del progetto Alpha\n');
      c.dirMk('Progetti/Beta');
      c.file('Progetti/Beta/todo.txt', 'cose da fare\n');
    },
    guided: [
      { title: 'Dove sono?', cmd: { bash: 'pwd', pwsh: 'pwd' }, what: 'Mostra la cartella corrente.', who: 'Comando interno della shell.', parts: ['pwd: nessun argomento'], expect: '/home/learner (o dove ti trovi).', risk: 'Nessuno.' },
      { title: 'Cosa c\'è qui?', cmd: { bash: 'ls ~/corso-cli/m1l2', pwsh: 'ls ~/corso-cli/m1l2' }, what: 'Elenca una cartella indicata con percorso che parte dalla home.', who: 'ls è un programma esterno; ~ lo espande la shell.', parts: ['ls: comando', '~/corso-cli/m1l2: argomento'], expect: 'Progetti', risk: 'Nessuno.' },
      { title: 'Spostarsi con un percorso assoluto', cmd: { bash: 'cd /home/learner/corso-cli/m1l2/Progetti', pwsh: 'cd /home/learner/corso-cli/m1l2/Progetti' }, what: 'Cambia la cartella corrente.', who: 'cd è un comando interno: deve essere interno, perché un programma esterno non potrebbe cambiare la cartella della shell.', parts: ['cd: comando', 'argomento che inizia con / = assoluto'], expect: 'Nessun output: cambia il prompt.', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Partendo da ~/corso-cli/m1l2, cosa succede con `cd Progetti` ripetuto due volte di seguito?',
        cmd: { bash: 'cd ~/corso-cli/m1l2 && cd Progetti; cd Progetti', pwsh: 'cd ~/corso-cli/m1l2; cd Progetti; cd Progetti' },
        expect: 'La prima volta entra in Progetti; la seconda dà errore: dentro Progetti non c\'è un\'altra cartella Progetti.',
        why: 'Un percorso relativo dipende dalla cartella in cui ti trovi ORA.',
      },
    ],
    negative: {
      prompt: 'Cosa succede se scrivi il nome in minuscolo?',
      cmd: { bash: 'cd /home/learner/corso-cli/m1l2/progetti', pwsh: 'cd /home/learner/corso-cli/m1l2/progetti' },
      explain: 'Errore di esecuzione: "No such file or directory". Le maiuscole contano; su macOS alcuni dischi non le distinguono, ma non devi fidarti: su Linux falliscono.',
    },
    task: {
      text: 'Portati in `Progetti/Alpha` con UN solo `cd` e un percorso ASSOLUTO. Poi, SENZA spostarti, elenca il contenuto di `../Beta` scrivendo proprio quel percorso relativo.',
      criterion: 'Il prompt mostra la cartella Alpha e hai eseguito ls (o Get-ChildItem) su ../Beta.',
    },
    checks: [
      {
        id: 'cwd',
        description: 'Sei in .../Progetti/Alpha',
        expected: `${R}/m1l2/Progetti/Alpha`,
        test: (c) => ({ pass: cwdOf(c) === `${R}/m1l2/Progetti/Alpha`, actual: cwdOf(c) }),
        onFail: 'Percorso assoluto: /home/learner/corso-cli/m1l2/Progetti/Alpha, con le maiuscole esatte.',
        errorTag: 'percorsi-maiuscole',
      },
      {
        id: 'assoluto',
        description: 'Hai usato un cd con percorso assoluto',
        expected: 'cd /... oppure cd ~/...',
        test: (c) => {
          // conta l'ULTIMO spostamento riuscito: deve essere un unico cd con percorso assoluto, non una catena di cd relativi
          const last = [...c.cmds].reverse().find((x) => x.exit === 0 && /(^|[;&]\s*)(cd|Set-Location|sl)\s/.test(x.cmd));
          const ok = !!last && /(^|[;&]\s*)(cd|Set-Location|sl)\s+["']?(\/|~|\$HOME|\$\{HOME\}|\$env:HOME)/.test(last.cmd);
          return { pass: ok, actual: ok ? 'sì' : last ? `ultimo cd: ${last.cmd.slice(0, 50)}` : 'nessun cd riuscito' };
        },
        onFail: 'Serve UN solo cd con percorso assoluto, che inizia con / (o con ~ per la home): niente catena di cd relativi.',
        errorTag: 'percorsi-maiuscole',
      },
      {
        id: 'beta',
        description: 'Hai elencato ../Beta senza spostarti',
        expected: 'ls ../Beta con output todo.txt',
        test: (c) => ({ pass: c.cmds.some((x) => x.exit === 0 && /\.\.[/\\]Beta/.test(x.cmd) && x.stdout.includes('todo.txt')), actual: 'verifica sullo storico dei comandi' }),
        onFail: '.. significa "la cartella sopra": da Alpha, ../Beta è la cartella sorella.',
      },
    ],
    example: { text: 'Esempio analogo in un\'altra posizione: da /usr/share elenca ../lib senza spostarti.', cmd: { bash: 'cd /usr/share && ls ../bin', pwsh: 'cd /usr/share; ls ../bin' } },
    hints: ['Il percorso assoluto inizia con / e include tutte le cartelle: /home/learner/corso-cli/m1l2/Progetti/Alpha.', '.. torna su di un livello: da Alpha, ../Beta è accanto.'],
    solutions: {
      bash: ['cd /home/learner/corso-cli/m1l2/Progetti/Alpha', 'ls ../Beta'],
      pwsh: ['cd /home/learner/corso-cli/m1l2/Progetti/Alpha', 'ls ../Beta'],
    },
    summary: ['assoluto vs relativo', 'le maiuscole contano', '. e .. e ~', 'leggi shell: comando: argomento: causa'],
    skills: ['comandi', 'output', 'autonomia'],
    concepts: ['pwd, ls, cd', 'percorso assoluto e relativo', 'le maiuscole contano', 'lettura di un messaggio di errore'],
  },
  {
    id: 'M1.L3',
    module: 1,
    n: 3,
    title: 'Spazi, virgolette e quoting',
    objective: 'Capire che la shell divide la riga negli spazi, usare le virgolette per un unico argomento e distinguere errore di sintassi ed errore di esecuzione.',
    explain: [
      'La shell divide la riga in parole, separate da spazi. `ls Mio Progetto` ha DUE argomenti, non uno. Le virgolette creano un unico argomento; le toglie la shell, il comando non le vede.',
      'Alcuni caratteri sono speciali per la shell: `( ) $ & | ; * ?`. Se compaiono non quotati la shell può rifiutare la riga: è un errore di SINTASSI (il comando non parte). Se invece il comando parte e fallisce, è un errore di ESECUZIONE.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('Mio Progetto (v2)/leggimi.txt', 'Contenuto segreto m1l3: ok\n');
      c.file('Mio Progetto (v2)/dati 2026.txt', 'Dati del 2026 m1l3\n');
    },
    guided: [
      { title: 'Elencare una cartella con spazi', cmd: { bash: 'ls ~/corso-cli/m1l3', pwsh: 'ls ~/corso-cli/m1l3' }, what: 'Elenca la cartella.', who: 'ls.', parts: ['un solo argomento senza spazi'], expect: 'Mio Progetto (v2)', risk: 'Nessuno.' },
      { title: 'Quoting del nome', cmd: { bash: 'ls "$HOME/corso-cli/m1l3/Mio Progetto (v2)"', pwsh: 'ls "$HOME/corso-cli/m1l3/Mio Progetto (v2)"' }, what: 'Elenca il contenuto della cartella con spazi e parentesi.', who: 'La shell toglie le virgolette; ls riceve UN argomento.', parts: ['le virgolette doppie racchiudono tutto il percorso', '$HOME viene espansa anche dentro le virgolette doppie'], expect: 'dati 2026.txt  leggimi.txt', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Quanti messaggi di errore dà `ls Mio Progetto` e di che tipo (sintassi o esecuzione)? Partendo da una cartella dove non esistono né "Mio" né "Progetto".',
        cmd: { bash: 'cd ~/corso-cli/m1l3; ls Mio Progetto', pwsh: 'cd ~/corso-cli/m1l3; ls Mio Progetto' },
        expect: 'Bash: DUE messaggi di errore di esecuzione, uno per argomento (Mio e Progetto). PowerShell: un errore (il secondo argomento è un filtro).',
        why: 'La shell ha spezzato il nome nello spazio: ls riceve due argomenti e si lamenta di ciascuno.',
      },
      {
        prompt: 'E `ls Mio Progetto (v2)`? Errore di sintassi o di esecuzione? Quanti messaggi?',
        cmd: { bash: 'ls Mio Progetto (v2)', pwsh: 'ls Mio Progetto (v2)' },
        expect: 'Bash: UN solo messaggio, errore di SINTASSI segnalato dalla shell; ls non parte. PowerShell: le parentesi sono un\'espressione: errore diverso.',
        why: 'Le parentesi non quotate sono caratteri speciali per la shell.',
      },
    ],
    negative: {
      prompt: 'Quoting parziale: metti le virgolette solo su una parte. Funziona?',
      cmd: { bash: 'ls ~/corso-cli/m1l3/"Mio Progetto (v2)"', pwsh: 'ls ~/corso-cli/m1l3/"Mio Progetto (v2)"' },
      explain: 'Sì: le virgolette possono coprire anche solo una parte della parola; la shell unisce i pezzi in un unico argomento.',
    },
    task: {
      text: 'Stampa il contenuto di ENTRAMBI i file nella cartella `Mio Progetto (v2)` (`leggimi.txt` e `dati 2026.txt`), usando il quoting corretto.',
      criterion: 'Nell\'output compaiono le due frasi dei file.',
    },
    checks: [
      {
        id: 'leggimi',
        description: 'Hai stampato leggimi.txt',
        expected: 'Contenuto segreto m1l3: ok',
        test: (c) => ({ pass: stdoutHas(c, 'Contenuto segreto m1l3: ok'), actual: stdoutHas(c, 'Contenuto segreto m1l3: ok') ? 'trovato' : 'non trovato' }),
        onFail: 'Il percorso contiene spazi e parentesi: va tra virgolette (sul percorso intero o su una parte).',
        errorTag: 'sintassi-vs-esecuzione',
      },
      {
        id: 'dati',
        description: 'Hai stampato dati 2026.txt',
        expected: 'Dati del 2026 m1l3',
        test: (c) => ({ pass: stdoutHas(c, 'Dati del 2026 m1l3'), actual: stdoutHas(c, 'Dati del 2026 m1l3') ? 'trovato' : 'non trovato' }),
        onFail: 'Anche il nome del file "dati 2026.txt" contiene uno spazio: serve il quoting.',
        errorTag: 'sintassi-vs-esecuzione',
      },
    ],
    example: { text: 'Esempio analogo: leggere un file con spazi in /tmp.', cmd: { bash: 'cat "/tmp/mio file (1).txt"', pwsh: 'Get-Content "/tmp/mio file (1).txt"' } },
    hints: ['Le virgolette creano un solo argomento: "cartella con spazi/file.txt".', 'Puoi usare cat per il primo file e di nuovo cat per il secondo, ciascuno con il suo percorso tra virgolette.'],
    solutions: {
      bash: ['cat "$HOME/corso-cli/m1l3/Mio Progetto (v2)/leggimi.txt"', 'cat "$HOME/corso-cli/m1l3/Mio Progetto (v2)/dati 2026.txt"'],
      pwsh: ['cat "$HOME/corso-cli/m1l3/Mio Progetto (v2)/leggimi.txt"', 'cat "$HOME/corso-cli/m1l3/Mio Progetto (v2)/dati 2026.txt"'],
    },
    summary: ['la shell divide negli spazi', 'virgolette = un solo argomento', 'caratteri speciali ( ) $ & | ; * ?', 'sintassi: errore della shell; esecuzione: errore del comando'],
    skills: ['comandi', 'output', 'diagnosi'],
    concepts: ['la shell divide la riga negli spazi', 'le virgolette creano un unico argomento', 'caratteri speciali', 'errore di sintassi ed errore di esecuzione'],
    alt: {
      task: 'Alternativa: entra nella cartella `Mio Progetto (v2)` con un solo `cd` e stampa `leggimi.txt` con un percorso relativo.',
      criterion: 'Sei nella cartella e hai stampato leggimi.txt.',
      checks: [
        {
          id: 'alt-cwd',
          description: 'Sei in "Mio Progetto (v2)"',
          expected: `${R}/m1l3/Mio Progetto (v2)`,
          test: (c) => ({ pass: cwdOf(c) === `${R}/m1l3/Mio Progetto (v2)`, actual: cwdOf(c) }),
          onFail: 'Metti il nome della cartella tra virgolette.',
        },
        {
          id: 'alt-leggimi',
          description: 'Hai stampato leggimi.txt dalla cartella',
          expected: 'Contenuto segreto m1l3: ok',
          test: (c) => ({ pass: stdoutHas(c, 'Contenuto segreto m1l3'), actual: stdoutHas(c, 'Contenuto segreto m1l3') ? 'ok' : 'frase non trovata nell\'output' }),
          onFail: 'Dopo il cd, stampa il file con il solo nome (percorso relativo): cat leggimi.txt.',
        },
      ],
      solutions: { bash: ['cd "$HOME/corso-cli/m1l3/Mio Progetto (v2)"', 'cat leggimi.txt'], pwsh: ['cd "$HOME/corso-cli/m1l3/Mio Progetto (v2)"', 'cat leggimi.txt'] },
    },
  },
  {
    id: 'M1.L4',
    module: 1,
    n: 4,
    title: 'Opzioni, help e lettura dei file',
    objective: 'Riconoscere comando, opzioni e argomenti; consultare man; leggere file con cat/head; capire i file nascosti.',
    explain: [
      'Un comando ha la forma `comando [opzioni] [argomenti]`. Le opzioni (`-l`, `-a`, `-t`) cambiano il comportamento e si possono combinare (`-la`).',
      'Non devi ricordarle tutte: `man ls` (o `ls --help`) le elenca. Nel laboratorio `man` stampa una pagina sintetica; sul tuo terminale si naviga con le frecce, `/` cerca, `q` esce.',
      'I file il cui nome inizia con il punto sono "nascosti": `ls` li mostra solo con `-a`. Non sono solo file di sistema: anche i tuoi file di configurazione.',
    ],
    shells: ['bash', 'pwsh'],
    setup: (c) => {
      c.file('vecchio.txt', 'file molto vecchio\n');
      c.file('medio.txt', 'file di dieci giorni fa\n');
      c.file('recente.txt', 'file di un\'ora fa\n');
      c.file('.nascosto', 'configurazione nascosta\n');
      c.file('lungo.txt', Array.from({ length: 30 }, (_, i) => `riga ${i + 1}`).join('\n') + '\n');
      c.age('vecchio.txt', 86400 * 30);
      c.age('medio.txt', 86400 * 10);
      c.age('.nascosto', 86400 * 5);
      c.age('recente.txt', 3600);
      c.age('lungo.txt', 7200);
    },
    guided: [
      { title: 'Elenco lungo', cmd: { bash: 'ls -l ~/corso-cli/m1l4', pwsh: 'ls ~/corso-cli/m1l4' }, what: 'Elenca con dettagli (permessi, dimensione, data).', who: 'ls; -l è un\'opzione.', parts: ['-l: formato lungo'], expect: 'Una riga per file con permessi, proprietario, dimensione, data e nome.', risk: 'Nessuno.' },
      { title: 'Cercare un\'opzione', cmd: { bash: 'man ls', pwsh: 'Get-Help ls' }, what: 'Mostra la pagina di manuale.', who: 'man è un programma che formatta la documentazione.', parts: ['ls: il comando di cui vuoi il manuale'], expect: 'NOME, SINTASSI, OPZIONI (cerca -t, -a).', risk: 'Nessuno.' },
    ],
    predict: [
      {
        prompt: 'Quante righe stampa `cat /etc/hosts` e ci aspettiamo simboli (come #) o solo indirizzi?',
        cmd: { bash: 'cat /etc/hosts', pwsh: 'cat /etc/hosts' },
        expect: 'Poche righe: indirizzi (127.0.0.1, ::1) e nomi; nei file di configurazione reali sono comuni i commenti con #.',
        why: 'I file di configurazione sono testo con convenzioni: # inizia un commento.',
      },
    ],
    negative: {
      prompt: 'Una opzione che non esiste: cosa risponde il comando?',
      cmd: { bash: 'ls -z ~/corso-cli/m1l4', pwsh: 'ls -z ~/corso-cli/m1l4' },
      explain: 'Errore di esecuzione: ls parte e dice che l\'opzione non è valida (e come chiedere aiuto).',
    },
    task: {
      text: 'In ~/corso-cli/m1l4: (1) elenca TUTTI i file, nascosti compresi, in formato lungo, dal più RECENTE al più vecchio (cerca l\'opzione in man ls); (2) stampa solo le prime 3 righe di `lungo.txt`.',
      criterion: 'Un output contiene .nascosto e i file ordinati recente → medio → vecchio; un altro contiene esattamente "riga 1", "riga 2", "riga 3".',
    },
    checks: [
      {
        id: 'ordinati',
        description: 'Elenco con file nascosti, dal più recente al più vecchio',
        expected: '.nascosto presente; recente.txt prima di medio.txt prima di vecchio.txt',
        test: (c) => {
          const hit = c.cmds.find((x) => {
            if (x.exit !== 0 || !x.stdout.includes('.nascosto')) return false;
            const a = x.stdout.indexOf('recente.txt');
            const b = x.stdout.indexOf('medio.txt');
            const d = x.stdout.indexOf('vecchio.txt');
            return a >= 0 && b > a && d > b;
          });
          return { pass: !!hit, actual: hit ? hit.cmd : 'nessun elenco con quell\'ordine' };
        },
        onFail: 'Servono due cose: mostrare i file nascosti (-a) e ordinare per data di modifica (-t, più recente prima). Leggi il prompt: sei nella cartella giusta?',
        errorTag: 'prompt-non-letto',
      },
      {
        id: 'head',
        description: 'Prime 3 righe di lungo.txt',
        expected: 'riga 1, riga 2, riga 3 (e non riga 4)',
        test: (c) => {
          const hit = c.cmds.find((x) => x.exit === 0 && x.stdout.trim() === 'riga 1\nriga 2\nriga 3');
          return { pass: !!hit, actual: hit ? hit.cmd : 'nessun comando con quell\'output' };
        },
        onFail: 'Cerca un comando che mostri solo l\'inizio di un file: head -n 3 (PowerShell: Get-Content -TotalCount 3).',
      },
    ],
    example: { text: 'Esempio analogo su /etc: elenco ordinato per dimensione, nascosti inclusi.', cmd: { bash: 'ls -laS /etc', pwsh: 'Get-ChildItem -Force /etc | Sort-Object Length -Descending' } },
    hints: ['Le opzioni si possono combinare: -l (lungo), -a (tutti), -t (per data).', 'In PowerShell: Get-ChildItem -Force mostra i nascosti; ordina con Sort-Object LastWriteTime -Descending.'],
    solutions: {
      bash: ['cd ~/corso-cli/m1l4', 'ls -lat', 'head -n 3 lungo.txt'],
      pwsh: ['cd ~/corso-cli/m1l4', 'Get-ChildItem -Force | Sort-Object LastWriteTime -Descending', 'Get-Content lungo.txt -TotalCount 3'],
    },
    summary: ['comando [opzioni] [argomenti]', 'man e --help', 'ls -la, -t', 'file nascosti = nome con il punto', '# = commento'],
    skills: ['comandi', 'output', 'autonomia'],
    concepts: ['comando, opzioni e argomenti', 'ls -l', 'man', '-a e file nascosti', 'opzioni combinabili', 'cat', 'commenti con # nei file di configurazione'],
  },
];
