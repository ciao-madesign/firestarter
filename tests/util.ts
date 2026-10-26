import { createWorkspace, execute } from '../src/engine/index.ts';
import type { ShellId, WorkspaceState } from '../src/engine/types.ts';

export interface Run {
  out: string;
  err: string;
  all: string;
  exit: number;
}

export function lab(): { s: WorkspaceState; run: (cmd: string, shell?: ShellId) => Run; bash: (c: string) => Run; ps: (c: string) => Run } {
  const s = createWorkspace('t');
  const run = (cmd: string, shell: ShellId = 'bash'): Run => {
    const r = execute(s, shell, cmd, { tty: false });
    const out = r.out.filter((o) => o.s === 'out').map((o) => o.t).join('');
    const err = r.out.filter((o) => o.s === 'err').map((o) => o.t).join('');
    return { out, err, all: r.out.map((o) => o.t).join(''), exit: r.exit };
  };
  return { s, run, bash: (c) => run(c, 'bash'), ps: (c) => run(c, 'pwsh') };
}
