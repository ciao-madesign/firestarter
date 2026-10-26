/**
 * Tutor contestuale (AI Tutor Adapter).
 *
 * Il tutor deterministico funziona senza AI: spiega i comandi dal catalogo, analizza gli errori REALI
 * presenti nell'ultimo output e dà indizi graduati. Non inventa output né dichiara superati test che
 * il sistema non ha eseguito: riporta solo l'esito dell'ultima verifica registrata.
 *
 * Un adapter AI opzionale può implementare TutorAdapter e ricevere il contesto filtrato da buildTutorContext().
 */
import { findDoc, renderHelp } from '../engine/catalog.ts';
import type { CommandLogEntry, ShellId, WorkspaceState } from '../engine/types.ts';
import { getLesson, useHelp, type HelpKind } from '../curriculum/engine.ts';

export interface TutorContext {
  lessonId: string | null;
  objective: string | null;
  shell: ShellId;
  lastCommands: { cmd: string; exit: number; stdout: string; stderr: string }[];
  lastVerify: { pass: boolean; checks: { id: string; pass: boolean; actual: string }[] } | null;
  environment: string;
  helpUsed: { hints: number; example: number; solution: boolean } | null;
}

export interface TutorReply {
  text: string;
  /** comandi suggeriti, mostrabili come esempi copiabili */
  commands?: { bash?: string; pwsh?: string };
  /** modalità di aiuto registrata (per la valutazione) */
  help?: HelpKind;
}

export interface TutorAdapter {
  name: string;
  /** Un adapter AI riceve solo il contesto filtrato, mai lo stato completo né le credenziali. */
  respond(question: string, ctx: TutorContext): Promise<string>;
}

export function buildTutorContext(state: WorkspaceState, shell: ShellId): TutorContext {
  const id = state.activeExercise;
  const lesson = id ? getLesson(id) : undefined;
  const p = id ? state.progress[id] : undefined;
  const cmds = state.commandLog.filter((c) => c.shell === shell).slice(-5);
  return {
    lessonId: id,
    objective: lesson?.objective ?? null,
    shell,
    lastCommands: cmds.map((c) => ({ cmd: c.cmd, exit: c.exit, stdout: c.stdout.slice(0, 800), stderr: c.stderr.slice(0, 800) })),
    lastVerify: p?.lastVerify ? { pass: p.lastVerify.pass, checks: p.lastVerify.checks.map((c) => ({ id: c.id, pass: c.pass, actual: c.actual })) } : null,
    environment: state.activeEnv,
    helpUsed: p?.help[shell] ? { hints: p.help[shell]!.hints, example: p.help[shell]!.example, solution: p.help[shell]!.solution } : null,
  };
}

// ---------------- spiegazione di un comando ----------------
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let has = false;
  for (const c of line) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

const SHELL_SYMBOLS: [RegExp, string][] = [
  [/\|/, '`|` (pipe): l\'output del comando a sinistra diventa l\'input di quello a destra.'],
  [/>>/, '`>>` aggiunge l\'output in fondo a un file (senza cancellarlo).'],
  [/(^|[^>2&])>(?!>)/, '`>` scrive l\'output su un file e SVUOTA il file se esiste già.'],
  [/\$\(/, '`$(...)` esegue il comando interno e ne inserisce l\'output.'],
  [/&&/, '`&&` esegue il secondo comando solo se il primo riesce (Bash).'],
  [/;/, '`;` separa comandi sulla stessa riga: vengono eseguiti uno dopo l\'altro.'],
  [/\$[A-Za-z_]/, '`$NOME` è una variabile: la shell la sostituisce con il suo valore prima di eseguire il comando.'],
  [/\$env:/i, '`$env:NOME` è una variabile d\'ambiente in PowerShell.'],
  [/~/, '`~` è la tua cartella home.'],
];

export function explainCommand(line: string, shell: ShellId): string {
  // più comandi collegati da pipe: spiega ciascun segmento
  const segs = splitSegments(line);
  if (segs.length > 1) {
    const parts = segs.map((seg, i) => `**Parte ${i + 1}** — \`${seg.trim()}\`\n${explainSingle(seg, shell, false)}`);
    return `${parts.join('\n\n')}\n\n${symbolNotes(line)}`.trim();
  }
  return explainSingle(line, shell, true);
}

function splitSegments(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if ((c === '|' && line[i + 1] !== '|') || (c === '&' && line[i + 1] === '&') || c === ';') {
      out.push(cur);
      cur = '';
      if (c === '&') i++;
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((x) => x.trim());
}

function symbolNotes(line: string): string {
  const symbols = SHELL_SYMBOLS.filter(([re]) => re.test(line)).map(([, t]) => `- ${t}`);
  return symbols.length ? ['Simboli interpretati dalla shell:', ...symbols].join('\n') : '';
}

function explainSingle(line: string, shell: ShellId, withSymbols: boolean): string {
  const toks = tokenize(line.trim().replace(/^\$\s+/, '').replace(/^PS [^>]*>\s*/, ''));
  if (!toks.length) return 'Scrivi un comando da spiegare, per esempio: spiega curl -s -i $TASKFLOW_URL/v1/health';
  // salta le assegnazioni iniziali
  let i = 0;
  while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
  const cmd = toks[i] ?? toks[0];
  const doc = findDoc(cmd, shell);
  const lines: string[] = [];
  if (!doc) {
    lines.push(`Non ho una scheda per "${cmd}" nel catalogo del laboratorio. ${shell === 'bash' ? 'Prova `help` o `man`.' : 'Prova Get-Help.'}`);
  } else {
    lines.push(`**${doc.name}** — ${doc.summary}`, `Sintassi: \`${doc.synopsis}\``);
    const used = toks.slice(i + 1).filter((t) => t.startsWith('-') && t.length > 1);
    const seen = new Set<string>();
    for (const t of used) {
      const key = t.replace(/^(-[A-Za-z]+):.*/, '$1');
      if (seen.has(key)) continue;
      seen.add(key);
      const direct = doc.options.find((o) => o.flag.split(/[\s,]+/).some((f) => f.toLowerCase() === key.toLowerCase()));
      if (direct) lines.push(`- \`${t}\`: ${direct.desc}`);
      else if (/^-[A-Za-z]{2,}$/.test(key) && shell === 'bash') {
        const parts = [...key.slice(1)].map((ch) => {
          const o = doc.options.find((x) => x.flag.split(/[\s,]+/).includes('-' + ch));
          return o ? `-${ch} (${o.desc})` : `-${ch}`;
        });
        lines.push(`- \`${t}\`: opzioni combinate: ${parts.join('; ')}`);
      } else lines.push(`- \`${t}\`: opzione non presente nella scheda del laboratorio; consulta ${shell === 'bash' ? 'man ' + doc.name : 'Get-Help ' + doc.name}.`);
    }
    const args = toks.slice(i + 1).filter((t) => !t.startsWith('-'));
    if (args.length) lines.push(`Argomenti: ${args.map((a) => '`' + a + '`').join(', ')}`);
    if (doc.differences.length) lines.push(`Attenzione, nel laboratorio: ${doc.differences[0]}`);
  }
  if (withSymbols) {
    const n = symbolNotes(line);
    if (n) lines.push(n);
  }
  return lines.join('\n');
}

// ---------------- analisi degli errori ----------------
const APP_ERRORS: Record<string, string> = {
  unauthorized: 'Manca il token (header Authorization assente). Ottieni un token con POST /v1/auth/token.',
  invalid_authorization_scheme: 'L\'header Authorization non usa lo schema Bearer. Formato: `Authorization: Bearer <token>`.',
  invalid_token: 'Il token non è valido per questo ambiente (o è malformato). Controlla di aver usato quello dell\'ambiente corrente.',
  token_expired: 'Il token è scaduto. Richiedine uno nuovo con POST /v1/auth/token e aggiorna la variabile.',
  invalid_client: 'Le credenziali (client_id / client_secret) non sono corrette.',
  forbidden: 'Sei autenticato ma non hai il ruolo richiesto (403): il problema non è il token.',
  not_found: 'La risorsa richiesta non esiste (ID errato o già eliminata).',
  route_not_found: 'Il percorso non esiste nell\'API: controlla l\'URL (le API sono sotto /v1).',
  method_not_allowed: 'Il percorso esiste ma non accetta quel metodo HTTP: guarda l\'header Allow.',
  unsupported_media_type: 'Il server si aspetta Content-Type: application/json. Aggiungilo (curl -H, PowerShell -ContentType).',
  invalid_json: 'Il body non è JSON valido: controlla virgole, virgolette e parentesi.',
  validation_failed: 'Il JSON è valido ma i dati non rispettano le regole: leggi l\'elenco `errors` (campo e motivo).',
  invalid_transition: 'Conflitto di stato (409): un task completato non può essere riaperto.',
  duplicate: 'Esiste già una risorsa con quel nome (409).',
  rate_limited: 'Troppe richieste (429): attendi il tempo indicato da Retry-After.',
  internal_error: 'Errore interno del server (5xx): spesso transitorio; riprova poche volte con una pausa e conserva l\'X-Request-Id.',
};

export function analyzeCommand(entry: CommandLogEntry | undefined, shell: ShellId): string {
  if (!entry) return 'Non ci sono ancora comandi eseguiti in questa shell da analizzare.';
  const err = entry.stderr;
  const out = entry.stdout;
  const lines: string[] = [`Ultimo comando: \`${entry.cmd}\` (codice di uscita ${entry.exit}).`];
  const add = (t: string): void => void lines.push(t);
  let found = false;
  const text = `${err}\n${out}`;
  const rules: [RegExp, string][] = [
    [/syntax error|ParserError|Unexpected token|Missing statement|is not a valid statement separator/i, 'È un errore di SINTASSI: lo segnala la shell, prima di far partire il comando. Cerca caratteri speciali non quotati — ( ) & | ; — o una struttura incompleta. In PowerShell 5.1 `&&` non esiste.'],
    [/command not found|is not recognized as the name/i, 'Comando non trovato: controlla l\'ortografia. In PowerShell 5.1 `curl` è un alias di Invoke-WebRequest: per il vero curl usa `curl.exe`.'],
    [/A parameter cannot be found that matches parameter name/i, 'In PowerShell hai usato un\'opzione di un altro programma. Se hai scritto `curl -s ...`, ricorda che `curl` qui è Invoke-WebRequest: usa `curl.exe` oppure `Invoke-RestMethod`.'],
    [/No such file or directory|Cannot find path/i, 'È un errore di ESECUZIONE: il comando è partito ma il percorso non esiste. Controlla il prompt (dove sei?), le maiuscole (contano!) e la barra iniziale dei percorsi assoluti.'],
    [/Permission denied/i, 'Permesso negato. Se è uno script, forse manca il permesso di esecuzione: `chmod +x file` oppure `bash file`.'],
    [/Could not resolve host|name could not be resolved/i, 'Errore di DNS: il nome dell\'host non esiste. Non è una risposta HTTP. Controlla come è scritto l\'host (variabile di configurazione?).'],
    [/Failed to connect|Unable to connect to the remote server|Couldn't connect/i, 'Connessione rifiutata: il nome si risolve ma su quella porta non c\'è nessun servizio in ascolto. Verifica la porta (ps, configurazione).'],
    [/timed out|\(28\)/i, 'Timeout: il client ha rinunciato perché la risposta non arrivava in tempo. Non è uno status HTTP.'],
    [/unexpected end of file|Incomplete/i, 'Il comando è incompleto (virgolette o blocco non chiuso).'],
  ];
  for (const [re, msg] of rules) {
    if (re.test(text)) {
      add(msg);
      found = true;
      break;
    }
  }
  // errori HTTP applicativi nel corpo
  const mAll = [...text.matchAll(/"error"\s*:\s*"([a-z_]+)"/g)];
  for (const m of mAll.slice(0, 2)) {
    const hint = APP_ERRORS[m[1]];
    if (hint) {
      add(`Il server risponde con il codice applicativo \`${m[1]}\`: ${hint}`);
      found = true;
    }
  }
  const status = /HTTP\/1\.1 (\d{3})/.exec(text)?.[1];
  if (status) {
    add(`Status HTTP: ${status}. ${status.startsWith('4') ? 'Errore del client: la richiesta va corretta.' : status.startsWith('5') ? 'Errore del server.' : ''}`.trim());
  }
  if (/"errors"\s*:\s*\[/.test(text)) {
    const fields = [...text.matchAll(/"field"\s*:\s*"([^"]+)","message"\s*:\s*"([^"]+)"/g)].map((m) => `${m[1]}: ${m[2]}`);
    if (fields.length) add(`Errori di validazione: ${fields.join('; ')}.`);
  }
  if (!found && entry.exit === 0) add('Il comando è terminato con successo (codice 0). Controlla comunque che l\'output corrisponda alla previsione: una variabile sbagliata o inesistente non dà errore.');
  else if (!found) add('Non riconosco questo errore. Leggi il messaggio da sinistra: shell, comando, argomento, causa. Poi chiedi un indizio.');
  add(`(Analisi basata sull'output reale registrato; shell: ${shell === 'bash' ? 'Bash' : 'PowerShell 5.1'}.)`);
  return lines.join('\n');
}

// ---------------- punto d'ingresso ----------------
export type TutorMode = 'hint' | 'explain' | 'example' | 'solution' | 'analyze' | 'chat' | 'status';

export function tutorRespond(state: WorkspaceState, mode: TutorMode, shell: ShellId, text = ''): TutorReply {
  const id = state.activeExercise;
  const lesson = id ? getLesson(id) : undefined;
  const t = text.trim();

  // instradamento da linguaggio naturale
  if (mode === 'chat') {
    const low = t.toLowerCase();
    if (/^(spiega|cosa fa|che fa|che cosa fa)\b/.test(low)) return tutorRespond(state, 'explain', shell, t.replace(/^(spiega|cosa fa|che fa|che cosa fa)\s*/i, ''));
    if (/(errore|perch[eé]|non funziona|fallit|sbagli)/.test(low)) return tutorRespond(state, 'analyze', shell);
    if (/^(indizio|aiuto|suggerimento|non so)/.test(low)) return tutorRespond(state, 'hint', shell);
    if (/^esempio/.test(low)) return tutorRespond(state, 'example', shell);
    if (/soluzione/.test(low)) return tutorRespond(state, 'solution', shell);
    if (/(verific|risultat|superat|passat)/.test(low)) return tutorRespond(state, 'status', shell);
    if (/^(help|\?|comandi)/.test(low)) return { text: renderHelp('', shell) };
    return {
      text: lesson
        ? `Obiettivo della lezione ${lesson.id}: ${lesson.objective}\n\nPuoi chiedere: **indizio**, **spiegazione** di un comando ("spiega <comando>"), **esempio**, **analisi dell'ultimo errore**, o la **soluzione** (registrata come aiuto usato).`
        : 'Scegli una lezione dalla scheda Istruzioni. Puoi anche scrivere "spiega <comando>" per capire un comando.',
    };
  }

  if (mode === 'status') {
    const p = id ? state.progress[id] : undefined;
    if (!p?.lastVerify) return { text: 'Non ho ancora risultati: la verifica non è stata eseguita. Premi "Verifica" quando pensi di aver finito. Non posso dire che un test è superato se non è stato eseguito dal sistema.' };
    const v = p.lastVerify;
    return { text: `${v.pass ? 'Ultima verifica superata' : 'Ultima verifica NON superata'} (${v.checks.filter((c) => c.pass).length}/${v.checks.length} controlli). ${v.checks.filter((c) => !c.pass).map((c) => `- ${c.description}: ${c.actual}`).join('\n')}` };
  }

  if (mode === 'explain') {
    if (t) return { text: explainCommand(t, shell), help: undefined };
    if (!id) {
      const last = state.commandLog.filter((c) => c.shell === shell).slice(-1)[0];
      return { text: last ? explainCommand(last.cmd, shell) : 'Scrivi: spiega <comando>.' };
    }
    const r = useHelp(state, id, shell, 'explanation');
    const last = state.commandLog.filter((c) => c.shell === shell).slice(-1)[0];
    return { text: `${r.text}${last ? `\n\nL'ultimo comando che hai eseguito:\n${explainCommand(last.cmd, shell)}` : ''}`, help: 'explanation' };
  }

  if (mode === 'analyze') {
    const recent = state.commandLog.filter((c) => c.shell === shell).slice(-6);
    // si analizza l'ultimo comando FALLITO, se c'è tra quelli recenti
    const failed = [...recent].reverse().find((c) => c.exit !== 0);
    return { text: analyzeCommand(failed ?? recent[recent.length - 1], shell) };
  }

  if (!id || !lesson) return { text: 'Seleziona prima una lezione.' };

  if (mode === 'hint' || mode === 'example') {
    const r = useHelp(state, id, shell, mode);
    return { text: r.text + (r.remaining > 0 && r.kind === 'hint' ? `\n\n(Altri ${r.remaining} suggerimenti disponibili.)` : ''), commands: r.cmd, help: r.kind };
  }
  if (mode === 'solution') {
    const r = useHelp(state, id, shell, 'solution');
    if (r.denied) return { text: r.denied };
    return { text: `Soluzione completa (registrata come aiuto usato: questa lezione NON conterà come svolta in autonomia):\n\n${r.text}`, help: 'solution' };
  }
  return { text: '' };
}

export function describeCommand(name: string, shell: ShellId): string {
  return renderHelp(name, shell);
}
