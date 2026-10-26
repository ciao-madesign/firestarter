import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson, resetLesson } from '../src/curriculum/engine.ts';
import { seedProgress } from '../src/course/progress.ts';
import type { Lesson } from '../src/curriculum/types.ts';
import type { ShellId, VerifyResult, WorkspaceState } from '../src/engine/types.ts';

export function runSolution(lesson: Lesson, shell: ShellId, lines: string[], state?: WorkspaceState): { state: WorkspaceState; verify: VerifyResult; outputs: string[] } {
  const s = state ?? createWorkspace('test');
  const course = seedProgress();
  startLesson(s, lesson.id);
  const outputs: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#predict:')) {
      s.predictions.push({ lesson: lesson.id, step: 0, shell, text: line.slice(9).trim(), why: 'test', at: s.clock, accurate: true });
      continue;
    }
    const r = execute(s, shell, line);
    if (r.incomplete) throw new Error(`Comando incompleto: ${line}`);
    outputs.push(`$ ${line}\n` + r.out.map((o) => (o.s === 'err' ? '[E]' : '') + o.t).join(''));
  }
  const verify = verifyLesson(s, lesson.id, shell, course);
  return { state: s, verify, outputs };
}
export { resetLesson };
