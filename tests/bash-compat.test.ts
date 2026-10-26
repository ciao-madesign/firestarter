import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { Vfs } from '../src/engine/vfs.ts';
import { readFileSync } from 'node:fs';
import { FILES, SNIPPETS } from './bash-compat-snippets.ts';
import expected from './bash-compat-expected.json' with { type: 'json' };

/**
 * Confronto con Bash 5.2 reale (risultati registrati da `tsx scripts/gen-bash-compat.ts`).
 * Regola "mai silenzioso": se il simulato differisce dal reale, deve almeno FALLIRE in modo esplicito
 * (codice di uscita ≠ 0 e nessun output), mai dare un risultato diverso senza avvisare.
 * BENIGN: differenze note e innocue (formato di `ls` senza terminale, percorsi temporanei, ecc.).
 */
const BENIGN = new Set<string>([
  'ls', 'ls sub', 'ls -a sub', 'ls -R sub', 'ls -1',
  'cd sub && cd .. && pwd | sed "s|.*/||"', 'cd sub; cd -  >/dev/null; pwd | sed "s|.*/||"', 'cd sub; pwd | sed "s|.*/||"',
  'cd nonexist 2>&1 | cut -c1-40; echo $?', 'hash 2>/dev/null; echo $?',
  // la batteria esegue ogni riga come `bash -c`: nel terminale interattivo l'EXIT trap scatta solo alla chiusura della shell
  'trap "echo bye" EXIT; echo run',
]);

const exp = expected as Record<string, { out: string; code: number }>;
/** Funzioni di shell più avanzate (slice 4): qui il risultato deve coincidere con Bash reale, non basta un errore esplicito. */
const P8 = readFileSync(new URL('./bash-compat-p8.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);

function simulate(line: string): { out: string; code: number } {
  const ws = createWorkspace('compat');
  const vfs = new Vfs(ws.fs, () => ws.clock);
  vfs.mkdir('/home/learner/t', true);
  for (const [n, c] of Object.entries(FILES)) {
    if (n.includes('/')) vfs.mkdir('/home/learner/t/' + n.slice(0, n.lastIndexOf('/')), true);
    vfs.seed('/home/learner/t/' + n, c);
  }
  execute(ws, 'bash', 'cd /home/learner/t');
  const r = execute(ws, 'bash', line.includes('<<') ? line.replace(/\\n/g, '\n') : line);
  return { out: r.out.filter((o) => o.s === 'out').map((o) => o.t).join(''), code: r.exit };
}

describe('Bash simulato contro Bash reale', () => {
  for (const sn of SNIPPETS) {
    it(sn.slice(0, 90), () => {
      const want = exp[sn];
      expect(want, 'manca il risultato registrato: rigenera con scripts/gen-bash-compat.ts').toBeDefined();
      const got = simulate(sn);
      if (got.out === want.out && got.code === want.code) return;
      if (BENIGN.has(sn)) return;
      // non uguale: almeno deve fallire in modo esplicito
      expect(got.code, `differenza SILENZIOSA. reale=${JSON.stringify(want.out)} [${want.code}] simulato=${JSON.stringify(got.out)} [${got.code}]`).not.toBe(0);
      expect(got.out, 'un comando non supportato non deve produrre output parziale').toBe('');
    });
  }
});

describe('Bash simulato: funzioni avanzate (devono coincidere con Bash reale)', () => {
  for (const sn of P8) {
    it(sn.slice(0, 90), () => {
      const want = exp[sn];
      expect(want, 'manca il risultato registrato: rigenera con scripts/gen-bash-compat.ts').toBeDefined();
      const got = simulate(sn);
      expect({ out: got.out, code: got.code }).toEqual({ out: want.out, code: want.code });
    });
  }
});
