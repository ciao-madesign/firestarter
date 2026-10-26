import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { seedProgress } from '../src/course/progress.ts';
import { VARIANTS } from './variants-data.ts';

/** Varianti legittime accettate, varianti scorrette rifiutate: i controlli non sono né troppo rigidi né troppo larghi. */
describe('varianti di soluzione', () => {
  for (const v of VARIANTS) {
    it(`${v.id} [${v.shell ?? 'bash'}] ${v.name}`, () => {
      const shell = v.shell ?? 'bash';
      const s = createWorkspace('v');
      startLesson(s, v.id);
      for (const l of v.lines) execute(s, shell, l);
      const r = verifyLesson(s, v.id, shell, seedProgress());
      expect(r.pass, r.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.actual}`).join(' | ')).toBe(v.expect);
    });
  }
});
