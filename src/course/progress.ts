/**
 * Stato del corso (condiviso tra tutor CLI e laboratorio web) e formato REGISTRO.
 * Il file di riferimento è course/progress.json; course/progress.md è la vista leggibile.
 */

export type LessonStatus = 'todo' | 'in_progress' | 'completed';

export interface LessonRecord {
  status: LessonStatus;
  date?: string;
  acquired: string[];
  errors: string[];
  /** 'lab' | 'cli' | 'chat' */
  source?: string;
}

export interface RecurringError {
  id: string;
  text: string;
  count: number;
  /** moduli o lezioni in cui è emerso */
  lastSeen?: string;
}

export interface TestItem {
  n: number;
  title: string;
  outcome: 'passed' | 'passed_partial' | 'retry' | 'failed';
  issue: string;
}

export interface ModuleTest {
  date: string;
  items: TestItem[];
}

export interface CourseProgress {
  version: number;
  student: { env: string; workEnv: string };
  level: 1 | 2 | 3 | 4;
  levelNote: string;
  lessons: Record<string, LessonRecord>;
  recurringErrors: RecurringError[];
  tests: Record<string, ModuleTest>;
  toConsolidate: string[];
  strengths: string[];
  next: { lesson: string; note: string };
  sessions: { date: string; lesson: string; level: number; env?: string }[];
}

export interface LessonRef {
  id: string;
  title: string;
}

export function lessonIndex(id: string): number {
  const m = /^M(\d+)\.L(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : -1;
}

export function seedProgress(): CourseProgress {
  const done = (acquired: string[], errors: string[]): LessonRecord => ({ status: 'completed', date: '2026-10-26', acquired, errors, source: 'chat' });
  return {
    version: 1,
    student: { env: 'macOS, Bash (/bin/bash)', workEnv: 'Windows PowerShell 5.1' },
    level: 2,
    levelNote: 'Livello 2, tendente al 3',
    lessons: {
      'M1.L1': done(
        [
          'differenza tra terminale e shell',
          'echo',
          'variabili con $ ($SHELL, $HOME)',
          'lettura del prompt (host:cartella utente$, ~ = home)',
          'differenza tra comando e argomenti',
          'fallimento silenzioso: una variabile inesistente diventa vuota, senza errore',
          'non eseguire comandi solo perché un messaggio li suggerisce (chsh)',
        ],
        ['aveva previsto un errore per `echo SHELL`, che invece stampa il testo'],
      ),
      'M1.L2': done(
        [
          'pwd, ls, cd',
          'percorso assoluto (inizia con /) e relativo (dipende dalla posizione)',
          'nomi reali nel terminale e nomi tradotti nel Finder',
          'le maiuscole contano',
          'lettura di un messaggio di errore (shell: comando: argomento: causa)',
        ],
        ['pensava che `cd Documents` ripetuto non facesse nulla, invece dà errore', 'ha omesso la / iniziale', 'ha scritto `users` in minuscolo'],
      ),
      'M1.L3': done(
        [
          'la shell divide la riga negli spazi',
          'le virgolette creano un unico argomento e vengono rimosse dalla shell',
          'caratteri speciali ( ) $ & | ; * ?',
          'errore di sintassi (la shell rifiuta la riga, il comando non parte) ed errore di esecuzione (il comando parte e fallisce)',
          'virgolette su tutto il percorso o su una parte',
        ],
        [
          'aveva previsto "No such file" invece del syntax error causato dalle parentesi',
          'al primo tentativo di verifica ha trovato solo uno dei due errori',
          'confonde il prompt con l\'output di pwd',
        ],
      ),
      'M1.L4': done(
        [
          'comando, opzioni e argomenti',
          'ls -l (colonne; la dimensione di una cartella non è il peso del contenuto)',
          'man (navigazione, / per cercare, q per uscire)',
          '-a trovata da solo; file nascosti (nome che inizia con il punto)',
          '. e ..',
          'opzioni combinabili (-la)',
          'cat',
          'commenti con # nei file di configurazione',
          'localhost / 127.0.0.1',
        ],
        ['pensava che i file nascosti fossero solo di sistema', 'ha previsto per /etc/hosts meno righe e nessun simbolo'],
      ),
    },
    recurringErrors: [
      { id: 'percorsi-maiuscole', text: 'Maiuscole e barra iniziale nei percorsi', count: 2, lastSeen: 'M1 test intermedio' },
      { id: 'sintassi-vs-esecuzione', text: 'Errore di sintassi ed errore di esecuzione: chi segnala l\'errore', count: 2, lastSeen: 'M1 test intermedio' },
      { id: 'prompt-non-letto', text: 'Non legge il prompt prima di eseguire', count: 2, lastSeen: 'M1 test intermedio' },
      { id: 'previsioni-incoerenti', text: 'Previsioni incoerenti o troppo semplificate rispetto al reale', count: 3, lastSeen: 'M1 test intermedio' },
    ],
    tests: {
      M1: {
        date: '2026-10-26',
        items: [
          { n: 1, title: 'cd assoluto in Library/Application Support', outcome: 'passed_partial', issue: 'Ha usato /users minuscolo: funziona su macOS, fallirebbe su Linux. È la seconda volta.' },
          { n: 2, title: 'Analisi di ls -l .../Application Support senza virgolette', outcome: 'passed_partial', issue: 'Ha previsto un errore di sintassi invece che di esecuzione, e 1 messaggio invece di 2.' },
          { n: 3, title: 'Trovare in man l\'opzione di ordinamento per data', outcome: 'retry', issue: 'Prima ha scelto -c; ha eseguito fuori dalla home senza leggere il prompt; poi ha trovato -t.' },
          { n: 4, title: 'echo "Utente: $USR - Home: $HOME"', outcome: 'passed_partial', issue: 'Diagnosi corretta, ma previsione incoerente con la diagnosi; non ricordava $HOME.' },
        ],
      },
    },
    toConsolidate: [
      'maiuscole e barra iniziale nei percorsi',
      'errore di sintassi vs errore di esecuzione',
      'lettura del prompt prima di eseguire',
      'previsioni coerenti con la diagnosi',
    ],
    strengths: ['consulta la documentazione e verifica sull\'output invece di fidarsi della previsione', 'sa diagnosticare un fallimento silenzioso'],
    next: { lesson: 'M2.L1', note: 'Ripasso breve (circa 5 minuti): un mini-esercizio per ciascuno dei 4 errori ricorrenti. Poi M2.L1: primo caso in cui un comando scrive file; rischio di sovrascrittura con > e cartella di prova ~/corso-cli.' },
    sessions: [{ date: '2026-10-26', lesson: 'M1.L4', level: 2, env: 'macOS, Bash' }],
  };
}

export function renderProgressMd(p: CourseProgress, titles: Record<string, string> = {}): string {
  const lines: string[] = ['# Progresso del corso', '', `Livello attuale: ${p.level} (${p.levelNote})`, `Ambiente: ${p.student.env}; lavoro: ${p.student.workEnv}`, ''];
  lines.push('## Lezioni', '');
  const ids = Object.keys(p.lessons).sort((a, b) => lessonIndex(a) - lessonIndex(b));
  for (const id of ids) {
    const l = p.lessons[id];
    lines.push(`### ${id}${titles[id] ? ' — ' + titles[id] : ''}`, `Stato: ${l.status}${l.date ? ' (' + l.date + ')' : ''}`);
    if (l.acquired.length) lines.push('Acquisito:', ...l.acquired.map((x) => `- ${x}`));
    if (l.errors.length) lines.push('Errori:', ...l.errors.map((x) => `- ${x}`));
    lines.push('');
  }
  lines.push('## Test intermedi', '');
  for (const [mod, t] of Object.entries(p.tests)) {
    lines.push(`### ${mod} (${t.date})`, '', '| Es. | Esercizio | Esito | Problema |', '|---|---|---|---|');
    for (const it of t.items) lines.push(`| ${it.n} | ${it.title} | ${it.outcome} | ${it.issue} |`);
    lines.push('');
  }
  lines.push('## Errori ricorrenti (da far riemergere nei test)', '', ...p.recurringErrors.map((e, i) => `${i + 1}. ${e.text} (occorrenze: ${e.count})`), '');
  lines.push('## Da consolidare', '', ...p.toConsolidate.map((x) => `- ${x}`), '');
  lines.push('## Punti di forza', '', ...p.strengths.map((x) => `- ${x}`), '');
  lines.push('## Prossima lezione', '', `${p.next.lesson}${titles[p.next.lesson] ? ' — ' + titles[p.next.lesson] : ''}`, '', p.next.note, '');
  return lines.join('\n');
}

// ---------------- REGISTRO ----------------
export interface Registro {
  date: string;
  env: string;
  completed: LessonRef | null;
  level: number | null;
  acquired: string[];
  toConsolidate: string[];
  next: LessonRef | null;
}

export class RegistroError extends Error {}

function normDate(s: string): string {
  const t = s.trim().replace(/^\[|\]$/g, '');
  const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return t;
}

function lessonRef(s: string): LessonRef | null {
  const m = /M(\d+)\.L(\d+)\s*(?:[—–-]\s*(.*))?$/.exec(s.trim().replace(/^\[|\]$/g, ''));
  return m ? { id: `M${m[1]}.L${m[2]}`, title: (m[3] ?? '').trim().replace(/\]$/, '') } : null;
}

function list(s: string): string[] {
  const t = s.trim().replace(/^\[|\]$/g, '');
  if (!t || /^(nessuno|-|—)$/i.test(t)) return [];
  return t.split(/;|\n/).map((x) => x.trim().replace(/^[-*]\s*/, '')).filter(Boolean);
}

export function parseRegistro(text: string): Registro {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*REGISTRO\s*[—–-]/i.test(l));
  if (start < 0) throw new RegistroError('Blocco REGISTRO non trovato: la prima riga deve essere "REGISTRO — [data]".');
  const reg: Registro = { date: normDate(lines[start].replace(/^\s*REGISTRO\s*[—–-]\s*/i, '')), env: '', completed: null, level: null, acquired: [], toConsolidate: [], next: null };
  let current: 'acq' | 'cons' | null = null;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.replace(/^\s*>\s?/, '');
    const kv = /^\s*(Ambiente|Lezione completata|Livello attuale|Acquisito|Da consolidare|Prossima lezione)\s*:\s*(.*)$/i.exec(line);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2];
      current = null;
      if (key === 'ambiente') reg.env = val.replace(/^\[|\]$/g, '').trim();
      else if (key === 'lezione completata') reg.completed = lessonRef(val);
      else if (key === 'livello attuale') {
        const n = parseInt(val.replace(/\D/g, ''), 10);
        reg.level = n >= 1 && n <= 4 ? n : null;
      } else if (key === 'acquisito') {
        reg.acquired.push(...list(val));
        current = 'acq';
      } else if (key === 'da consolidare') {
        reg.toConsolidate.push(...list(val));
        current = 'cons';
      } else if (key === 'prossima lezione') reg.next = lessonRef(val);
    } else if (current && /^\s*[-*]\s+/.test(line)) {
      (current === 'acq' ? reg.acquired : reg.toConsolidate).push(line.replace(/^\s*[-*]\s+/, '').trim());
    } else if (line.trim() === '') {
      current = null;
    }
  }
  if (!reg.completed && !reg.next) throw new RegistroError('Il REGISTRO non contiene né "Lezione completata" né "Prossima lezione".');
  return reg;
}

export function applyRegistro(p: CourseProgress, reg: Registro): { progress: CourseProgress; changes: string[] } {
  const out: CourseProgress = JSON.parse(JSON.stringify(p));
  const changes: string[] = [];
  if (reg.completed) {
    const id = reg.completed.id;
    const cur = out.lessons[id];
    if (cur?.status === 'completed' && (cur.date ?? '') >= reg.date) {
      changes.push(`${id}: già completata il ${cur.date}, nessuna modifica alla data.`);
    } else {
      out.lessons[id] = { status: 'completed', date: reg.date, acquired: [], errors: cur?.errors ?? [], source: 'chat' };
      changes.push(`${id}: segnata come completata (${reg.date}).`);
    }
    const rec = out.lessons[id];
    for (const a of reg.acquired) if (!rec.acquired.includes(a)) rec.acquired.push(a);
    if (reg.acquired.length) changes.push(`${id}: ${reg.acquired.length} concetti acquisiti registrati.`);
  } else if (reg.acquired.length) changes.push('Concetti acquisiti ignorati: il REGISTRO non indica la lezione completata.');
  for (const c of reg.toConsolidate) if (!out.toConsolidate.includes(c)) out.toConsolidate.push(c);
  if (reg.toConsolidate.length) changes.push(`Da consolidare: aggiornato (${out.toConsolidate.length} voci).`);
  if (reg.level !== null) {
    if (reg.level > out.level) {
      out.level = reg.level as 1 | 2 | 3 | 4;
      out.levelNote = `Livello ${reg.level} (da REGISTRO del ${reg.date})`;
      changes.push(`Livello portato a ${reg.level}.`);
    } else if (reg.level < out.level) changes.push(`Livello ${reg.level} nel REGISTRO ignorato: lo stato attuale è ${out.level} (il livello non si abbassa con l'importazione).`);
  }
  if (reg.next && lessonIndex(reg.next.id) >= lessonIndex(out.next.lesson)) {
    out.next = { lesson: reg.next.id, note: '' };
    changes.push(`Prossima lezione: ${reg.next.id}.`);
  } else if (reg.next) changes.push(`Prossima lezione ${reg.next.id} ignorata: lo stato è già più avanti (${out.next.lesson}).`);
  out.sessions.push({ date: reg.date, lesson: reg.completed?.id ?? '', level: out.level, env: reg.env });
  return { progress: out, changes };
}

export function buildRegistro(p: CourseProgress, titles: Record<string, string>, date: string, env: string): string {
  const completed = Object.entries(p.lessons)
    .filter(([, l]) => l.status === 'completed')
    .sort(([a], [b]) => lessonIndex(b) - lessonIndex(a))[0];
  const id = completed?.[0] ?? '';
  const rec = completed?.[1];
  const t = (x: string): string => (titles[x] ? `${x} — ${titles[x]}` : x);
  return [
    `REGISTRO — ${date}`,
    `Ambiente: ${env}`,
    `Lezione completata: ${id ? t(id) : 'nessuna'}`,
    `Livello attuale: ${p.level}`,
    `Acquisito: ${rec?.acquired.join('; ') || 'nessuno'}`,
    `Da consolidare: ${p.toConsolidate.join('; ') || 'nessuno'}`,
    `Prossima lezione: ${t(p.next.lesson)}`,
  ].join('\n');
}

export function addRecurring(p: CourseProgress, id: string, text: string, where: string): void {
  const e = p.recurringErrors.find((x) => x.id === id);
  if (e) {
    e.count++;
    e.lastSeen = where;
  } else p.recurringErrors.push({ id, text, count: 1, lastSeen: where });
}
