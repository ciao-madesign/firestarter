import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import type { ShellId } from '../src/engine/types.ts';

/** I passi guidati devono funzionare davvero: niente comandi inesistenti, esito e testo atteso veritieri. */
describe('passi guidati', () => {
  for (const lesson of LESSONS) {
    for (const shell of ['bash', 'pwsh'] as ShellId[]) {
      const steps = lesson.guided.filter((g) => g.cmd[shell]);
      if (!steps.length) continue;
      it(`${lesson.id} (${shell})`, () => {
        const s = createWorkspace('guided');
        startLesson(s, lesson.id);
        for (const g of steps) {
          const r = execute(s, shell, g.cmd[shell]!);
          const out = r.out.map((o) => o.t).join('');
          const label = `${g.title}: ${g.cmd[shell]}`;
          expect(r.exit, `${label} (errore interno)`).not.toBe(70);
          expect(out, `${label} (comando non riconosciuto)`).not.toMatch(/command not found|is not recognized|The term '/);
          const fails = typeof g.fails === 'object' ? !!g.fails[shell] : !!g.fails;
          if (!fails) expect(r.exit, `${label}\n${out}`).toBe(0);
          if (fails) expect(r.exit, `${label} doveva fallire`).not.toBe(0);
          const want = typeof g.contains === 'string' ? g.contains : g.contains?.[shell];
          if (want) expect(out, label).toContain(want);
        }
      });
    }
  }
  it('ogni lezione ha almeno 3 passi guidati', () => {
    const poche = LESSONS.filter((l) => l.guided.length < 3).map((l) => `${l.id}:${l.guided.length}`);
    expect(poche).toEqual([]);
  });
});

describe('la soluzione resta valida dopo passi guidati, previsioni, test negativo ed esempio', () => {
  for (const lesson of LESSONS) {
    for (const shell of ['bash', 'pwsh'] as ShellId[]) {
      const sol = lesson.solutions?.[shell] ?? lesson.reference?.[shell];
      if (!sol) continue;
      it(`${lesson.id} (${shell})`, () => {
        const s = createWorkspace('g2');
        startLesson(s, lesson.id);
        for (const g of lesson.guided) if (g.cmd[shell]) execute(s, shell, g.cmd[shell]!);
        for (const p of lesson.predict) if (p.cmd[shell]) execute(s, shell, p.cmd[shell]!);
        if (lesson.negative.cmd[shell]) execute(s, shell, lesson.negative.cmd[shell]!);
        if (lesson.example.cmd[shell]) execute(s, shell, lesson.example.cmd[shell]!);
        for (const line of sol) {
          if (line.startsWith('#predict:')) {
            s.predictions.push({ lesson: lesson.id, step: 0, shell, text: line.slice(9).trim(), why: 'test', at: s.clock, accurate: true });
            continue;
          }
          execute(s, shell, line);
        }
        const v = verifyLesson(s, lesson.id, shell);
        expect(v.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.actual}`)).toEqual([]);
      });
    }
  }
});
