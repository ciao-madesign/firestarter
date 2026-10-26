/**
 * Punto d'ingresso del Simulation Engine.
 * Contratto interno: lo stato (WorkspaceState) è l'unico input/output persistente.
 */
import { LIMITS, type EnvName, type ExecResult, type OutChunk, type ShellId, type ShellState, type WorkspaceState } from './types.ts';
import { Vfs, HOME, USER, displayPath, resolvePath, basename, dirname } from './vfs.ts';
import { BASE_URLS } from './api/spec.ts';
import { CLOCK_START, CREDENTIALS, createApiState } from './api/server.ts';
import { BashRuntime, runBashLine, type Io } from './bash/interp.ts';
import './bash/commands.ts';
import { runPwshLine } from './pwsh/interp.ts';
import { CATALOG, psAliases } from './catalog.ts';
import { COMMANDS } from './bash/interp.ts';

export const STATE_VERSION = 1;

export function newShell(shell: ShellId): ShellState {
  return {
    cwd: HOME,
    env: {
      HOME,
      USER,
      LOGNAME: USER,
      SHELL: shell === 'bash' ? '/bin/bash' : '/usr/bin/pwsh',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      LANG: 'it_IT.UTF-8',
      PWD: HOME,
      TERM: 'xterm-256color',
    },
    vars: {},
    functions: {},
    history: [],
    lastExit: 0,
    lastOk: true,
    transcript: [],
  };
}

export function applyEnvToShells(state: WorkspaceState): void {
  const cred = CREDENTIALS[state.activeEnv];
  for (const sh of Object.values(state.shells)) {
    sh.env.TASKFLOW_URL = BASE_URLS[state.activeEnv];
    sh.env.TASKFLOW_CLIENT_ID = cred.id;
    sh.env.TASKFLOW_CLIENT_SECRET = cred.secret;
  }
}

export function createWorkspace(id: string): WorkspaceState {
  const state: WorkspaceState = {
    version: STATE_VERSION,
    id,
    createdAt: Date.now(),
    clock: CLOCK_START,
    fs: {},
    api: createApiState(),
    activeEnv: 'development',
    shells: { bash: newShell('bash'), pwsh: newShell('pwsh') },
    commandLog: [],
    activeExercise: null,
    progress: {},
    docVersions: {},
    notes: '',
    prefs: { fontSize: 15, rightPanelVisible: true, splitPercent: 60, shell: 'bash', tab: 'istruzioni' },
    predictions: [],
    tutorChat: [],
    changeLog: [],
  };
  seedFilesystem(state);
  applyEnvToShells(state);
  return state;
}

function seedFilesystem(state: WorkspaceState): void {
  const v = new Vfs(state.fs, () => state.clock);
  for (const d of ['/home', '/home/learner', '/tmp', '/etc', '/var', '/var/log', '/usr', '/usr/bin']) {
    state.fs[d] = { type: 'dir', content: '', mode: 0o755, mtime: state.clock - 86400 * 30, owner: d.startsWith('/home/learner') ? USER : 'root' };
  }
  state.fs['/tmp'].mode = 0o777;
  state.fs['/home/learner'].owner = USER;
  v.systemWrite('/etc/hosts', '127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost\n127.0.1.1\tlab\n');
  v.systemWrite('/etc/os-release', 'NAME="Learning Lab Linux (simulato)"\nVERSION="1.0"\nID=lab\n');
  v.systemWrite('/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\nlearner:x:1000:1000:Learner:/home/learner:/bin/bash\ntaskflow:x:998:998::/var/lib/taskflow:/usr/sbin/nologin\n');
  v.mkdir('/home/learner/docs', true);
  v.mkdir('/home/learner/lab', true);
  v.mkdir('/home/learner/projects/taskflow', true);
  v.seed('/home/learner/README.txt', 'Benvenuto nel laboratorio.\nQuesto è un ambiente SIMULATO: nessun comando viene eseguito sul tuo dispositivo.\n\n  lab/        gli esercizi creano qui i file di prova\n  docs/       la documentazione che scrivi\n  projects/   configurazioni del servizio TaskFlow (simulato)\n');
  for (const env of ['development', 'testing', 'staging'] as EnvName[]) {
    const c = CREDENTIALS[env];
    v.seed(
      `/home/learner/projects/taskflow/.env.${env}`,
      `# Configurazione ${env} (credenziali SIMULATE, solo per il laboratorio)\nTASKFLOW_URL=${BASE_URLS[env]}\nTASKFLOW_CLIENT_ID=${c.id}\nTASKFLOW_CLIENT_SECRET=${c.secret}\n`,
      0o600,
    );
  }
  v.seed('/home/learner/projects/taskflow/README.md', '# TaskFlow (simulato)\n\nAPI REST per gestire task e progetti.\nBase URL: vedi la variabile TASKFLOW_URL.\nSpecifica: GET /v1/openapi.json\n');
  v.systemWrite('/var/log/taskflow/README', 'I log delle richieste API simulate vengono scritti qui, per ambiente:\n  <env>/access.log   una riga per richiesta\n  <env>/app.log      eventi applicativi (autenticazione, validazione, errori)\n');
}

// ---------------- esecuzione ----------------
export function promptFor(state: WorkspaceState, shell: ShellId): string {
  const sh = state.shells[shell];
  if (shell === 'bash') return `learner@lab:${displayPath(sh.cwd)}$ `;
  return `PS ${sh.cwd}> `;
}

export interface ExecOptions {
  tty?: boolean;
  /** non registrare in cronologia e transcript (es. esecuzioni di setup/test) */
  silent?: boolean;
}

export function execute(state: WorkspaceState, shell: ShellId, line: string, opts: ExecOptions = {}): ExecResult {
  const sh = state.shells[shell];
  const chunks: OutChunk[] = [];
  let bytes = 0;
  let overflow = false;
  const push = (s: 'out' | 'err', t: string): void => {
    if (overflow || !t) return;
    bytes += t.length;
    if (bytes > LIMITS.maxOutput) {
      overflow = true;
      chunks.push({ s: 'err', t: '\n[output troncato: limite del laboratorio superato]\n' });
      return;
    }
    const last = chunks[chunks.length - 1];
    if (last && last.s === s) last.t += t;
    else chunks.push({ s, t });
  };
  const io: Io = { stdin: '', out: (t) => push('out', t), err: (t) => push('err', t), tty: opts.tty ?? true };
  const prompt = promptFor(state, shell);

  if (line.length > LIMITS.maxInput) {
    push('err', `Input troppo lungo (massimo ${LIMITS.maxInput} caratteri)\n`);
    return { out: chunks, exit: 1, cwd: sh.cwd, prompt };
  }
  let exit = 0;
  let clear = false;
  try {
    if (shell === 'bash') {
      const rt = new BashRuntime(state);
      const r = runBashLine(rt, line, io);
      if (r.incomplete) return { out: [], exit: 0, incomplete: true, cwd: sh.cwd, prompt };
      exit = r.code;
      clear = rt.clearRequested;
      sh.lastExit = exit;
    } else {
      const r = runPwshLine(state, line, io);
      if (r.incomplete) return { out: [], exit: 0, incomplete: true, cwd: sh.cwd, prompt };
      exit = r.code;
      clear = r.clear;
    }
  } catch (e) {
    // un difetto del simulatore non deve mai interrompere la sessione dello studente
    console.error('Errore interno del simulatore:', e);
    push('err', `Errore interno del simulatore (${(e as Error).message}). Il comando non è stato eseguito completamente: segnalalo, indicando il comando digitato.\n`);
    exit = 70;
  }
  state.clock += 1;
  if (!opts.silent) {
    const trimmed = line.trim();
    if (trimmed) {
      sh.history.push({ cmd: trimmed, exit, at: state.clock, exerciseId: state.activeExercise ?? undefined });
      if (sh.history.length > 500) sh.history.splice(0, sh.history.length - 500);
      state.commandLog.push({
        shell,
        cmd: trimmed,
        exit,
        at: state.clock,
        exerciseId: state.activeExercise ?? undefined,
        seq: (state.cmdSeq = (state.cmdSeq ?? 0) + 1),
        stdout: chunks.filter((c) => c.s === 'out').map((c) => c.t).join('').slice(0, 4000),
        stderr: chunks.filter((c) => c.s === 'err').map((c) => c.t).join('').slice(0, 2000),
      });
      if (state.commandLog.length > 600) state.commandLog.splice(0, state.commandLog.length - 600);
    }
    sh.transcript.push({ prompt, cmd: line, out: chunks.map((c) => ({ ...c, t: c.t.slice(0, 8000) })), exit });
    if (sh.transcript.length > 150) sh.transcript.splice(0, sh.transcript.length - 150);
    if (clear) sh.transcript = [];
  }
  return { out: chunks, exit, clear, cwd: sh.cwd, prompt: promptFor(state, shell) };
}

// ---------------- completamento ----------------
export function complete(state: WorkspaceState, shell: ShellId, line: string): { start: number; options: string[] } {
  const sh = state.shells[shell];
  const m = /(\S*)$/.exec(line)!;
  const word = m[1];
  const start = line.length - word.length;
  const before = line.slice(0, start).trim();
  const isFirst = before === '' || /[|;&]\s*$/.test(before);
  const vfs = new Vfs(state.fs, () => state.clock);
  const options: string[] = [];
  if (isFirst && !word.includes('/')) {
    const names = new Set<string>();
    if (shell === 'bash') {
      for (const k of COMMANDS.keys()) names.add(k);
      for (const k of Object.keys(sh.functions)) names.add(k);
    } else {
      for (const d of CATALOG) if (d.shells.includes('pwsh')) names.add(d.name);
      for (const k of Object.keys(psAliases())) names.add(k);
    }
    for (const n of [...names].sort()) if (n.toLowerCase().startsWith(word.toLowerCase()) && /^[A-Za-z]/.test(n)) options.push(n);
  }
  if (word.startsWith('$')) {
    const prefix = word.slice(1).replace(/^env:/i, '');
    const isEnv = /^\$env:/i.test(word);
    const keys = Object.keys(isEnv || shell === 'bash' ? sh.env : { ...sh.env, ...sh.vars });
    for (const k of keys.sort()) if (k.toLowerCase().startsWith(prefix.toLowerCase())) options.push((isEnv ? '$env:' : '$') + k);
    return { start, options };
  }
  if (!options.length || word.includes('/') || !isFirst) {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const namePart = slash >= 0 ? word.slice(slash + 1) : word;
    const dirAbs = resolvePath(dirPart || '.', sh.cwd);
    try {
      for (const n of vfs.list(dirAbs)) {
        if (n.startsWith(namePart) && (namePart.startsWith('.') || !n.startsWith('.'))) {
          const full = dirAbs === '/' ? '/' + n : dirAbs + '/' + n;
          options.push(dirPart + n + (vfs.isDir(full) ? '/' : ''));
        }
      }
    } catch {
      /* directory non leggibile */
    }
  }
  return { start, options };
}

export function stateSize(state: WorkspaceState): number {
  return JSON.stringify(state).length;
}

export { Vfs, HOME, USER, resolvePath, basename, dirname, CREDENTIALS, BASE_URLS };
export * from './types.ts';
