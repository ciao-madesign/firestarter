/**
 * Test differenziale: confronta l'output del Bash simulato con quello del Bash reale (5.x) su una batteria di comandi.
 * Segnala le differenze di stdout e di codice di uscita. Uso: tsx scripts/audit-bash-diff.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { Vfs } from '../src/engine/vfs.ts';

import { FILES, SNIPPETS } from '../tests/bash-compat-snippets.ts';

function realRun(dir: string, cmd: string): { out: string; code: number } {
  const r = spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/home/learner', USER: 'learner', LC_ALL: 'C' }, timeout: 10000 });
  return { out: r.stdout ?? '', code: r.status ?? -1 };
}

const real = mkdtempSync(join(tmpdir(), 'bashdiff-'));
const mk = (): string => {
  const d = mkdtempSync(join(real, 'w-'));
  for (const [n, c] of Object.entries(FILES)) {
    mkdirSync(join(d, n.includes('/') ? n.slice(0, n.lastIndexOf('/')) : '.'), { recursive: true });
    writeFileSync(join(d, n), c);
  }
  return d;
};

let diffs = 0;
let same = 0;
const report: string[] = [];
for (const sn of SNIPPETS) {
  const cmd = sn.replace(/\\n/g, '\n').replace(/^cat <<(\\?'?EOF'?)\n/, (m) => m);
  const dir = mk();
  const r = realRun(dir, sn.includes('<<') ? sn.replace(/\\n/g, '\n') : sn);
  const ws = createWorkspace('d');
  const vfs = new Vfs(ws.fs, () => ws.clock);
  vfs.mkdir('/home/learner/t', true);
  for (const [n, c] of Object.entries(FILES)) {
    if (n.includes('/')) vfs.mkdir('/home/learner/t/' + n.slice(0, n.lastIndexOf('/')), true);
    vfs.seed('/home/learner/t/' + n, c);
  }
  execute(ws, 'bash', 'cd /home/learner/t');
  const line = sn.includes('<<') ? sn.replace(/\\n/g, '\n') : sn;
  void cmd;
  const s = execute(ws, 'bash', line);
  const simOut = s.out.filter((o) => o.s === 'out').map((o) => o.t).join('');
  if (s.exit === 70) {
    report.push(`ERRORE INTERNO  ${sn}`);
    diffs++;
    continue;
  }
  const norm = (x: string): string => x.replace(/\/tmp\/[^\s]*bashdiff-[^\s]*/g, '<dir>');
  if (norm(r.out) !== simOut || r.code !== s.exit) {
    diffs++;
    report.push(`DIFF  ${sn}\n   reale   [exit ${r.code}]: ${JSON.stringify(norm(r.out)).slice(0, 220)}\n   simulato[exit ${s.exit}]: ${JSON.stringify(simOut).slice(0, 220)}`);
  } else same++;
}
console.log(report.join('\n'));
console.log(`\nSnippet: ${SNIPPETS.length}, identici: ${same}, differenti: ${diffs}`);
