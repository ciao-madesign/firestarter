import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { resetLesson, startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { seedProgress } from '../src/course/progress.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import type { ShellId } from '../src/engine/types.ts';

function solve(s: ReturnType<typeof createWorkspace>, id: string, shell: ShellId, lines: string[]): void {
  for (const line of lines) {
    if (line.startsWith('#predict:')) {
      s.predictions.push({ lesson: id, step: 0, shell, text: line.slice(9).trim(), why: 'test', at: s.clock, accurate: true });
      continue;
    }
    execute(s, shell, line);
  }
}

describe('ripristino della lezione', () => {
  for (const lesson of LESSONS) {
    for (const shell of ['bash', 'pwsh'] as ShellId[]) {
      const sol = lesson.solutions?.[shell] ?? lesson.reference?.[shell];
      if (!sol) continue;
      it(`${lesson.id} (${shell}): dopo il ripristino la verifica torna a non superata e si può rifare`, () => {
        const s = createWorkspace('reset');
        startLesson(s, lesson.id);
        solve(s, lesson.id, shell, sol);
        expect(verifyLesson(s, lesson.id, shell).pass).toBe(true);
        resetLesson(s, lesson.id);
        expect(verifyLesson(s, lesson.id, shell).pass, 'dopo il ripristino passa ancora').toBe(false);
        solve(s, lesson.id, shell, sol);
        const v = verifyLesson(s, lesson.id, shell);
        expect(v.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.actual}`)).toEqual([]);
      });
    }
  }
});

describe('esercizio alternativo', () => {
  const withAlt = LESSONS.filter((l) => l.alt);
  it('esiste almeno una lezione con alternativa', () => expect(withAlt.length).toBeGreaterThan(0));
  for (const lesson of withAlt) {
    for (const shell of ['bash', 'pwsh'] as ShellId[]) {
      const alt = lesson.alt!.solutions?.[shell];
      if (!alt) continue;
      it(`${lesson.id} (${shell}): l'alternativa supera la verifica e viene segnalata`, () => {
        const s = createWorkspace('alt');
        startLesson(s, lesson.id);
        solve(s, lesson.id, shell, alt);
        const course = seedProgress();
        const v = verifyLesson(s, lesson.id, shell, course);
        expect(v.pass).toBe(true);
        expect(v.viaAlt).toBe(true);
        expect(s.progress[lesson.id].completions[shell]?.mode).not.toBe('autonomous');
        expect(course.lessons[lesson.id].errors.join(' ')).toContain('alternativo');
      });
      it(`${lesson.id} (${shell}): senza fare nulla l'alternativa non passa`, () => {
        const s = createWorkspace('alt0');
        startLesson(s, lesson.id);
        expect(verifyLesson(s, lesson.id, shell).pass).toBe(false);
      });
      it(`${lesson.id} (${shell}): la soluzione principale non risulta "via alternativa"`, () => {
        const s = createWorkspace('alt1');
        startLesson(s, lesson.id);
        solve(s, lesson.id, shell, lesson.solutions![shell]!);
        const v = verifyLesson(s, lesson.id, shell);
        expect(v.pass).toBe(true);
        expect(v.viaAlt).toBeUndefined();
      });
    }
  }
});
