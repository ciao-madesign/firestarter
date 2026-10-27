/**
 * Exercise Engine: avvio, reset, verifica deterministica, aiuti e valutazione.
 * Non dipende dall'interfaccia: opera solo su WorkspaceState e CourseProgress.
 */
import { resetClientHosts } from '../engine/lab.ts';
import { createWorkspace, execute } from '../engine/index.ts';
import { resetApiEnv } from '../engine/api/server.ts';
import { Vfs, HOME } from '../engine/vfs.ts';
import type { CheckResult, Completion, EnvName, ExerciseProgress, ShellId, VerifyResult, WorkspaceState } from '../engine/types.ts';
import { addRecurring, lessonIndex, type CourseProgress } from '../course/progress.ts';
import { inTest } from '../course/moduletest.ts';
import { promoteToLevel4 } from '../course/levels.ts';
import { LESSONS, MODULES, getLesson } from './lessons/index.ts';
import { SKILL_LABELS, type Check, type CheckCtx, type Lesson, type SetupCtx, type SkillTag } from './types.ts';

export const LAB_ROOT = `${HOME}/corso-cli`;

export function lessonDir(id: string): string {
  return `${LAB_ROOT}/${id.toLowerCase().replace(/\./g, '')}`;
}

export const ERROR_TAGS: Record<string, string> = {
  'percorsi-maiuscole': 'Maiuscole e barra iniziale nei percorsi',
  'sintassi-vs-esecuzione': "Errore di sintassi ed errore di esecuzione: chi segnala l'errore",
  'prompt-non-letto': 'Non legge il prompt prima di eseguire',
  'previsioni-incoerenti': 'Previsioni incoerenti o troppo semplificate rispetto al reale',
  'segreti-nei-comandi': 'Segreti scritti direttamente nei comandi',
  'content-type': 'Content-Type mancante o errato nelle richieste con body',
  'sovrascrittura': 'Sovrascrittura involontaria di file con >',
  'http-vs-applicativo': 'Confusione tra errore HTTP ed errore applicativo',
  'alias-curl-powershell': 'Alias curl di PowerShell 5.1 usato come il vero curl',
};

function makeSetupCtx(state: WorkspaceState, dir: string): SetupCtx {
  const vfs = new Vfs(state.fs, () => state.clock);
  return {
    state,
    vfs,
    dir,
    file: (rel, content, mode = 0o644) => vfs.seed(`${dir}/${rel}`, content, mode),
    dirMk: (rel) => vfs.mkdir(`${dir}/${rel}`, true),
    setEnvBoth: (name, value) => {
      for (const sh of Object.values(state.shells)) {
        if (value === null) delete sh.env[name];
        else sh.env[name] = value;
      }
    },
    cwd: (shell, abs) => {
      if (shell === 'both') for (const sh of Object.values(state.shells)) sh.cwd = abs;
      else state.shells[shell].cwd = abs;
    },
    age: (rel, secondsAgo) => {
      const n = state.fs[`${dir}/${rel}`];
      if (n) n.mtime = state.clock - secondsAgo;
    },
  };
}

function ensureProgress(state: WorkspaceState, id: string): ExerciseProgress {
  return (state.progress[id] ??= { startedAt: state.clock, completions: {}, help: {}, attempts: 0 });
}

export function startLesson(state: WorkspaceState, id: string, forceSetup = false): Lesson {
  const lesson = getLesson(id);
  if (!lesson) throw new Error(`Lezione sconosciuta: ${id}`);
  const p = ensureProgress(state, id);
  const dir = lessonDir(id);
  // test intermedio: l'esercizio ripropone una lezione già svolta. La prima volta si riparte da zero (ambiente, dati, cartella),
  // altrimenti resterebbero le variabili e i file dell'ultima lezione aperta e il risultato dipenderebbe da cosa si è fatto prima.
  const testItem = state.moduleTest && !state.moduleTest.finished ? state.moduleTest.items.find((i) => i.lesson === id && !i.done) : undefined;
  if (testItem && !testItem.fresh) {
    testItem.fresh = true;
    for (const env of ['development', 'testing', 'staging'] as EnvName[]) resetApiEnv(state, env);
    p.help = {};
    p.lastVerify = undefined;
    p.startClock = undefined;
    state.predictions = state.predictions.filter((x) => x.lesson !== id);
  }
  const fresh = p.startClock === undefined;
  state.activeExercise = id;
  if (fresh || forceSetup) {
    const vfs = new Vfs(state.fs, () => state.clock);
    if (vfs.exists(dir)) vfs.remove(dir, true);
    vfs.mkdir(dir, true);
    for (const a of lesson.artifacts ?? []) {
      const abs = a.startsWith('~') ? HOME + a.slice(1) : a;
      if (vfs.exists(abs)) vfs.remove(abs, true);
    }
    if (lesson.module !== 11 && state.lab) {
      state.lab = undefined;
      resetClientHosts(state);
    }
    // ambiente base dei laboratori: sviluppo, dati iniziali, credenziali nelle variabili d'ambiente
    lesson.setup(makeSetupCtx(state, dir));
    p.startClock = state.clock;
    p.startSeq = state.api.seq;
    p.startCmdSeq = state.cmdSeq ?? 0;
    p.attempts++;
  }
  return lesson;
}

export function resetLesson(state: WorkspaceState, id: string): void {
  const p = ensureProgress(state, id);
  const lesson = getLesson(id);
  if (!lesson) throw new Error(`Lezione sconosciuta: ${id}`);
  for (const env of ['development', 'testing', 'staging'] as EnvName[]) resetApiEnv(state, env);
  p.help = {};
  p.lastVerify = undefined;
  state.predictions = state.predictions.filter((x) => x.lesson !== id);
  p.startClock = undefined;
  startLesson(state, id, true);
  state.changeLog.push({ at: state.clock, what: `Reset della lezione ${id}` });
}

export function buildCheckCtx(state: WorkspaceState, lesson: Lesson, shell: ShellId): CheckCtx {
  const p = ensureProgress(state, lesson.id);
  const dir = lessonDir(lesson.id);
  const vfs = new Vfs(state.fs, () => state.clock);
  const startClock = p.startClock ?? 0;
  const startSeq = p.startSeq ?? 0;
  const startCmdSeq = p.startCmdSeq;
  const cmds = state.commandLog.filter((c) => c.shell === shell && (startCmdSeq !== undefined ? (c.seq ?? 0) > startCmdSeq : c.at >= startClock));
  const api = state.api.log.filter((e) => e.seq > startSeq);
  return {
    state,
    shell,
    vfs,
    dir,
    cmds,
    api,
    apiShell: api.filter((e) => e.shell === shell),
    read: (rel) => {
      const path = rel.startsWith('/') ? rel : rel.startsWith('~') ? HOME + rel.slice(1) : `${dir}/${rel}`;
      return vfs.isFile(path) ? vfs.readFile(path) : null;
    },
    cleanRun: (scriptRel) => cleanRun(state, shell, scriptRel.startsWith('/') ? scriptRel : `${dir}/${scriptRel}`),
    sandbox: (cmd, cwdRel) => {
      const copy = JSON.parse(JSON.stringify(state)) as WorkspaceState;
      copy.shells[shell].cwd = cwdRel ? (cwdRel.startsWith('/') ? cwdRel : `${dir}/${cwdRel}`) : dir;
      const r = execute(copy, shell, cmd, { silent: true, tty: false });
      return { code: r.exit, out: r.out.filter((o) => o.s === 'out').map((o) => o.t).join(''), err: r.out.filter((o) => o.s === 'err').map((o) => o.t).join('') };
    },
  };
}

/** Esegue uno script in un workspace pulito (nessuna variabile TASKFLOW_*, API ai dati iniziali). */
export function cleanRun(state: WorkspaceState, shell: ShellId, scriptAbs: string): { code: number; out: string; err: string } {
  const clean = createWorkspace('clean');
  clean.clock = state.clock;
  const src = state.fs[scriptAbs];
  if (!src || src.type !== 'file') return { code: 127, out: '', err: `script non trovato: ${scriptAbs}` };
  const v = new Vfs(clean.fs, () => clean.clock);
  v.seed(scriptAbs, src.content, 0o755);
  // nell'ambiente pulito servono anche i file di configurazione già presenti nel progetto
  for (const [path, node] of Object.entries(state.fs)) {
    if (path.startsWith(`${HOME}/projects/`) && node.type === 'file') v.seed(path, node.content, node.mode);
  }
  for (const sh of Object.values(clean.shells)) {
    for (const k of Object.keys(sh.env)) if (k.startsWith('TASKFLOW_')) delete sh.env[k];
    sh.cwd = scriptAbs.slice(0, scriptAbs.lastIndexOf('/'));
  }
  const cmd = shell === 'bash' ? `bash ${scriptAbs}` : `& '${scriptAbs}'`;
  const r = execute(clean, shell, cmd, { silent: true, tty: false });
  return { code: r.exit, out: r.out.filter((o) => o.s === 'out').map((o) => o.t).join(''), err: r.out.filter((o) => o.s === 'err').map((o) => o.t).join('') };
}

function modeFor(prog: ExerciseProgress, shell: ShellId): Completion['mode'] {
  const h = prog.help[shell];
  if (h?.solution) return 'solution';
  if (h && (h.hints > 0 || h.example > 0 || h.explanation > 0)) return 'hinted';
  return 'autonomous';
}

/** Valuta i controlli senza registrare nulla (feedback in tempo reale). */
/** Nomi dei file letti da un controllo (solo quelli scritti per esteso, relativi alla cartella della lezione). */
function filesRead(test: Check['test']): string[] {
  return [...test.toString().matchAll(/read\(\s*['"`]([^'"`/~$][^'"`]*)['"`]\s*\)/g)].map((m) => m[1]);
}

export function evaluateChecks(state: WorkspaceState, id: string, shell: ShellId, useAlt = false): CheckResult[] {
  const lesson = getLesson(id);
  if (!lesson) return [];
  const ctx = buildCheckCtx(state, lesson, shell);
  const dir = lessonDir(id);
  return (useAlt && lesson.alt ? lesson.alt.checks : lesson.checks).map((c) => {
    let r: { pass: boolean; actual: string };
    try {
      r = c.test(ctx);
    } catch (e) {
      r = { pass: false, actual: `errore nel controllo: ${(e as Error).message}` };
    }
    let explanation = r.pass ? undefined : c.onFail;
    let misplaced = false;
    if (!r.pass) {
      // il file c'è, ma in un'altra cartella: tipico di chi non legge il prompt prima di scrivere
      for (const name of filesRead(c.test)) {
        if (ctx.vfs.exists(`${dir}/${name}`)) continue;
        const elsewhere = [state.shells[shell].cwd, HOME].map((d) => `${d}/${name}`).find((p) => state.fs[p]?.type === 'file');
        if (elsewhere) {
          misplaced = true;
          explanation = `${explanation ?? ''} Il file «${name}» esiste in ${elsewhere.replace(HOME, '~')}, ma l'esercizio lo cerca in ${dir.replace(HOME, '~')}: leggi il prompt per sapere dove ti trovi (cd ${dir.replace(HOME, '~')}).`.trim();
          break;
        }
      }
    }
    return { id: c.id, description: c.description, pass: r.pass, expected: c.expected, actual: r.actual, explanation, ...(misplaced ? { misplaced } : {}) };
  });
}

export function verifyLesson(state: WorkspaceState, id: string, shell: ShellId, course?: CourseProgress): VerifyResult {
  const lesson = getLesson(id);
  if (!lesson) throw new Error(`Lezione sconosciuta: ${id}`);
  const p = ensureProgress(state, id);
  let checks: CheckResult[] = evaluateChecks(state, id, shell);
  let pass = checks.every((c) => c.pass);
  let viaAlt = false;
  // esercizio alternativo sullo stesso concetto: se la prova principale non è superata ma lo è l'alternativa, la lezione è superata (come aiuto)
  if (!pass && lesson.alt) {
    const altChecks = evaluateChecks(state, id, shell, true);
    if (altChecks.length && altChecks.every((c) => c.pass)) {
      checks = altChecks;
      pass = true;
      viaAlt = true;
    }
  }
  const result: VerifyResult = { exerciseId: id, shell, at: state.clock, pass, checks, ...(viaAlt ? { viaAlt: true } : {}) };
  p.lastVerify = result;
  if (pass) {
    const prev = p.completions[shell];
    const mode = viaAlt && modeFor(p, shell) === 'autonomous' ? 'hinted' : modeFor(p, shell);
    const h = p.help[shell];
    const rank = { solution: 0, hinted: 1, autonomous: 2 } as const;
    if (!prev || rank[mode] >= rank[prev.mode]) {
      p.completions[shell] = { at: state.clock, mode, hints: (h?.hints ?? 0) + (h?.example ?? 0) };
    }
    if (course) {
      markLessonCompleted(course, lesson, mode, state);
      if (viaAlt) {
        const rec = course.lessons[lesson.id];
        const note = 'completata con l\'esercizio alternativo: da riprovare con la prova principale';
        if (rec && !rec.errors.includes(note)) rec.errors.push(note);
      }
    }
  } else if (course) {
    for (const c of lesson.checks) {
      const r = checks.find((x) => x.id === c.id);
      if (r && !r.pass && c.errorTag) addRecurring(course, c.errorTag, ERROR_TAGS[c.errorTag] ?? c.errorTag, id);
      if (r && !r.pass && r.misplaced) addRecurring(course, 'prompt-non-letto', ERROR_TAGS['prompt-non-letto'], id);
    }
  }
  return result;
}

export function markLessonCompleted(course: CourseProgress, lesson: Lesson, mode: Completion['mode'], state: WorkspaceState): void {
  const date = new Date().toISOString().slice(0, 10);
  const rec = (course.lessons[lesson.id] ??= { status: 'todo', acquired: [], errors: [] });
  rec.status = 'completed';
  rec.date = date;
  rec.source = 'lab';
  const rank = { solution: 0, hinted: 1, autonomous: 2 } as const;
  if (!rec.mode || rank[mode] > rank[rec.mode]) rec.mode = mode;
  for (const c of lesson.concepts) if (!rec.acquired.includes(c)) rec.acquired.push(c);
  if (mode === 'solution') {
    const note = 'completata con la soluzione mostrata: da riprovare in autonomia';
    if (!rec.errors.includes(note)) rec.errors.push(note);
    if (!course.toConsolidate.includes(`${lesson.id}: ${lesson.title} (rifare senza soluzione)`)) course.toConsolidate.push(`${lesson.id}: ${lesson.title} (rifare senza soluzione)`);
  }
  if (!lesson.review) {
    const next = LESSONS.filter((l) => !l.review && course.lessons[l.id]?.status !== 'completed').sort((a, b) => lessonIndex(a.id) - lessonIndex(b.id))[0];
    if (next) course.next = { lesson: next.id, note: '' };
  }
  course.sessions.push({ date, lesson: lesson.id, level: course.level, env: 'Laboratorio web' });
  promoteToLevel4(course);
}

export type HelpKind = 'example' | 'hint' | 'explanation' | 'solution';

export interface HelpResult {
  kind: HelpKind;
  text: string;
  cmd?: { bash?: string; pwsh?: string };
  /** quanti suggerimenti restano */
  remaining: number;
  denied?: string;
}

export function useHelp(state: WorkspaceState, id: string, shell: ShellId, kind: HelpKind): HelpResult {
  const lesson = getLesson(id);
  if (!lesson) throw new Error(`Lezione sconosciuta: ${id}`);
  const p = ensureProgress(state, id);
  if (inTest(state, id)) {
    return { kind, text: '', remaining: 0, denied: 'Durante il test intermedio non sono disponibili aiuti: lavora in autonomia e usa la documentazione (man, --help, specifica OpenAPI).' };
  }
  const h = (p.help[shell] ??= { hints: 0, explanation: 0, example: 0, solution: false });
  switch (kind) {
    case 'example':
      h.example++;
      return { kind, text: lesson.example.text, cmd: lesson.example.cmd, remaining: lesson.hints.length - h.hints };
    case 'hint': {
      if (h.example === 0 && lesson.hints.length) {
        // aiuti decrescenti: prima un esempio completo, poi i suggerimenti
        h.example++;
        return { kind: 'example', text: `Prima un esempio analogo.\n\n${lesson.example.text}`, cmd: lesson.example.cmd, remaining: lesson.hints.length - h.hints };
      }
      const text = lesson.hints[Math.min(h.hints, lesson.hints.length - 1)] ?? 'Rileggi l\'obiettivo e il criterio di verifica.';
      if (h.hints < lesson.hints.length) h.hints++;
      return { kind, text, remaining: Math.max(0, lesson.hints.length - h.hints) };
    }
    case 'explanation':
      h.explanation++;
      return { kind, text: `${lesson.explain.join('\n\n')}\n\nRiepilogo: ${lesson.summary.join('; ')}`, remaining: lesson.hints.length - h.hints };
    case 'solution': {
      if (lesson.autonomous || !lesson.solutions) {
        return { kind, text: '', remaining: lesson.hints.length - h.hints, denied: 'Questa è una verifica autonoma: la soluzione completa non è disponibile. Usa un indizio o chiedi una spiegazione del concetto.' };
      }
      if (h.hints < Math.min(2, lesson.hints.length)) {
        return { kind, text: '', remaining: lesson.hints.length - h.hints, denied: `Prima prova con i suggerimenti (ne hai usati ${h.hints} su ${lesson.hints.length}). La soluzione completa viene registrata come aiuto usato.` };
      }
      h.solution = true;
      const sol = lesson.solutions[shell] ?? [];
      return { kind, text: sol.join('\n'), remaining: 0 };
    }
  }
}

// ---------------- valutazione ----------------
export interface SkillScore {
  skill: SkillTag;
  label: string;
  /** 0..100: media pesata degli esercizi completati rispetto a quelli tentati */
  score: number | null;
  autonomous: number;
  hinted: number;
  solution: number;
  total: number;
}

const WEIGHT: Record<Completion['mode'], number> = { autonomous: 1, hinted: 0.6, solution: 0.2 };

export function skillScores(state: WorkspaceState): SkillScore[] {
  const out = new Map<SkillTag, SkillScore>();
  for (const k of Object.keys(SKILL_LABELS) as SkillTag[]) out.set(k, { skill: k, label: SKILL_LABELS[k], score: null, autonomous: 0, hinted: 0, solution: 0, total: 0 });
  const sums = new Map<SkillTag, number>();
  for (const lesson of LESSONS) {
    const prog = state.progress[lesson.id];
    if (!prog) continue;
    const comps = Object.values(prog.completions);
    if (!comps.length) continue;
    // si valuta la migliore esecuzione tra le shell
    const best = comps.reduce((a, b) => (WEIGHT[b.mode] > WEIGHT[a.mode] ? b : a));
    for (const s of lesson.skills) {
      const rec = out.get(s)!;
      rec.total++;
      rec[best.mode]++;
      sums.set(s, (sums.get(s) ?? 0) + WEIGHT[best.mode]);
    }
  }
  for (const [s, rec] of out) rec.score = rec.total ? Math.round(((sums.get(s) ?? 0) / rec.total) * 100) : null;
  return [...out.values()];
}

/** Proposte di recupero: lezioni con competenze deboli o completate con la soluzione. */
export function recoverySuggestions(state: WorkspaceState, course: CourseProgress): { lesson: string; title: string; reason: string }[] {
  const out: { lesson: string; title: string; reason: string }[] = [];
  for (const l of LESSONS) {
    const p = state.progress[l.id];
    if (!p) continue;
    const comps = Object.values(p.completions);
    if (comps.length && comps.every((c) => c.mode === 'solution')) out.push({ lesson: l.id, title: l.title, reason: 'completata con la soluzione mostrata' });
    else if (!comps.length && p.lastVerify && !p.lastVerify.pass) out.push({ lesson: l.id, title: l.title, reason: 'ultima verifica non superata' });
  }
  for (const e of course.recurringErrors.filter((x) => x.count >= 2)) {
    const lesson = LESSONS.find((l) => l.checks.some((c) => c.errorTag === e.id) && course.lessons[l.id]?.status !== 'todo');
    if (lesson && !out.some((o) => o.lesson === lesson.id)) out.push({ lesson: lesson.id, title: lesson.title, reason: `errore ricorrente: ${e.text}` });
  }
  return out;
}

export interface LessonSummary {
  id: string;
  module: number;
  n: number;
  title: string;
  objective: string;
  shells: ShellId[];
  review: boolean;
  status: 'todo' | 'in_progress' | 'completed';
  completions: Partial<Record<ShellId, Completion>>;
  autonomous: boolean;
}

export function curriculumView(state: WorkspaceState, course: CourseProgress): { modules: { n: number; title: string; summary: string; optional: boolean; lessons: LessonSummary[] }[] } {
  return {
    modules: MODULES.map((m) => ({
      n: m.n,
      title: m.title,
      summary: m.summary,
      optional: !!m.optional,
      lessons: LESSONS.filter((l) => l.module === m.n).map((l) => {
        const p = state.progress[l.id];
        const courseStatus = course.lessons[l.id]?.status ?? 'todo';
        const status = courseStatus === 'completed' || (p && Object.keys(p.completions).length) ? 'completed' : p?.startClock !== undefined ? 'in_progress' : 'todo';
        return {
          id: l.id,
          module: l.module,
          n: l.n,
          title: l.title,
          objective: l.objective,
          shells: l.shells,
          review: !!l.review,
          status,
          completions: p?.completions ?? {},
          autonomous: !!l.autonomous,
        };
      }),
    })),
  };
}

export { getLesson, LESSONS, MODULES };
