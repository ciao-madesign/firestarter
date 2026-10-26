/** Rigenera tests/bash-compat-expected.json eseguendo la batteria con il Bash reale (richiede bash e jq installati). */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { FILES, SNIPPETS as BASE } from '../tests/bash-compat-snippets.ts';

const P8 = readFileSync('tests/bash-compat-p8.txt', 'utf8').split('\n').filter(Boolean);
const SNIPPETS = [...BASE, ...P8];

const out: Record<string, { out: string; code: number }> = {};
const base = mkdtempSync(join(tmpdir(), 'bashgen-'));
for (const sn of SNIPPETS) {
  const d = mkdtempSync(join(base, 'w-'));
  for (const [n, c] of Object.entries(FILES)) {
    mkdirSync(join(d, n.includes('/') ? n.slice(0, n.lastIndexOf('/')) : '.'), { recursive: true });
    writeFileSync(join(d, n), c);
  }
  const line = sn.includes('<<') ? sn.replace(/\\n/g, '\n') : sn;
  const r = spawnSync('bash', ['-c', line], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/home/learner', USER: 'learner', LC_ALL: 'C' }, timeout: 10000 });
  out[sn] = { out: (r.stdout ?? '').split(d).join('<dir>').replace(/w-[A-Za-z0-9]{6}/g, 'w-X'), code: r.status ?? -1 };
}
writeFileSync('tests/bash-compat-expected.json', JSON.stringify(out, null, 1) + '\n');
console.log(`Scritti ${Object.keys(out).length} risultati`);
