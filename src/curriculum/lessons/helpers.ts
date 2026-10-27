import { applyEnvToShells } from '../../engine/index.ts';
import { CLOCK_START, expiredToken, resetApiEnv } from '../../engine/api/server.ts';
import type { EnvName } from '../../engine/types.ts';
import type { Check, CheckCtx, SetupCtx } from '../types.ts';

export const HOME_DIR = '/home/learner';

/** Imposta ambiente di sviluppo con dati iniziali e variabili d'ambiente di configurazione. */
export function setupApi(c: SetupCtx, opts: { env?: EnvName; token?: 'valid' | 'expired' | false; url?: string; reset?: boolean } = {}): void {
  const env = opts.env ?? 'development';
  if (opts.reset !== false) for (const e of ['development', 'testing', 'staging'] as EnvName[]) resetApiEnv(c.state, e);
  c.state.activeEnv = env;
  applyEnvToShells(c.state);
  const tag = env === 'development' ? 'dev' : env === 'testing' ? 'test' : 'stg';
  if (opts.token === 'valid') c.setEnvBoth('TASKFLOW_TOKEN', `tf_${tag}_bob_${Math.max(c.state.clock, CLOCK_START) + 3600 * 10}`);
  else if (opts.token === 'expired') c.setEnvBoth('TASKFLOW_TOKEN', expiredToken(env));
  else c.setEnvBoth('TASKFLOW_TOKEN', null);
  if (opts.url) c.setEnvBoth('TASKFLOW_URL', opts.url);
}

export function stdoutHas(c: CheckCtx, needle: string | RegExp): boolean {
  return c.cmds.some((x) => x.exit === 0 && (typeof needle === 'string' ? x.stdout.includes(needle) : needle.test(x.stdout)));
}

export function cmdMatches(c: CheckCtx, re: RegExp, okOnly = true): boolean {
  return c.cmds.some((x) => (okOnly ? x.exit === 0 : true) && re.test(x.cmd));
}

/** Il testo di un comando che ESEGUE qualcosa: esclude le righe che scrivono un documento (here-doc, here-string, printf, Set-Content),
 *  il cui testo può contenere per caso le parole cercate. */
function commandPart(cmd: string): string {
  const first = cmd.split('\n')[0];
  // le redirezioni verso il «cestino» o tra canali non scrivono un documento
  const bare = first.replace(/\b[12]?>\s*\/dev\/null|\b2>\s*\$null|\b2>&1|\*>&1/g, '');
  return /<<|@'|@"|^\s*Set-Content\b|\bSet-Content\b[^|]*-Value\b|^\s*printf\b/.test(bare) || /^\s*(cat|echo)\b[^|;&]*>\s*\S+/.test(bare) ? '' : first;
}

/** Come cmdMatches ma solo sui comandi eseguiti davvero (non sul contenuto dei documenti scritti con here-doc o printf). */
export function ranCmd(c: CheckCtx, re: RegExp, okOnly = true): boolean {
  return c.cmds.some((x) => (okOnly ? x.exit === 0 : true) && re.test(commandPart(x.cmd)));
}

export function apiHit(c: CheckCtx, method: string, path: RegExp, status: number, shellOnly = true): boolean {
  const list = shellOnly ? c.apiShell : c.api;
  return list.some((e) => e.method === method && path.test(e.path) && e.status === status);
}

export function fileLines(text: string | null): string[] {
  if (text === null) return [];
  return text.split('\n').filter((l) => l.trim() !== '');
}

export function cwdOf(c: CheckCtx): string {
  return c.state.shells[c.shell].cwd;
}

export function pick<T>(c: CheckCtx, bash: T, pwsh: T): T {
  return c.shell === 'bash' ? bash : pwsh;
}

export function jsonOf(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Nessun segreto in chiaro nei comandi eseguiti dallo studente. */
export function noSecretsInCmds(tag = 'segreti-nei-comandi'): Check {
  return {
    id: 'no-segreti-nei-comandi',
    description: 'Il segreto del client non compare scritto nei comandi',
    expected: 'usa $TASKFLOW_CLIENT_SECRET (Bash) o $env:TASKFLOW_CLIENT_SECRET (PowerShell)',
    test: (c) => {
      const secrets = ['dev-secret-42', 'test-secret-77', 'stg-secret-91'];
      const leak = c.cmds.find((x) => secrets.some((s) => x.cmd.includes(s)));
      return { pass: !leak, actual: leak ? `trovato in: ${leak.cmd.slice(0, 60)}` : 'nessun segreto nei comandi' };
    },
    onFail: 'Hai scritto il segreto direttamente nel comando: finisce nella cronologia e nei log. Usa la variabile d\'ambiente già configurata.',
    errorTag: tag,
  };
}
