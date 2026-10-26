import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import { runSolution } from './helpers.ts';
import type { ShellId } from '../src/engine/types.ts';

describe('le soluzioni documentate superano le verifiche', () => {
  for (const lesson of LESSONS) {
    for (const shell of ['bash', 'pwsh'] as ShellId[]) {
      const sol = lesson.solutions?.[shell] ?? lesson.reference?.[shell];
      if (!sol) continue;
      it(`${lesson.id} (${shell})`, () => {
        const r = runSolution(lesson, shell, sol);
        const failed = r.verify.checks.filter((c) => !c.pass);
        if (failed.length) console.log(r.outputs.join('\n'));
        expect(failed.map((c) => `${c.id}: atteso ${c.expected}; ottenuto ${c.actual}`)).toEqual([]);
      });
    }
  }
  it('senza fare nulla le verifiche non passano', () => {
    for (const lesson of LESSONS) {
      const r = runSolution(lesson, 'bash', []);
      expect(r.verify.pass, lesson.id).toBe(false);
    }
  });
});
