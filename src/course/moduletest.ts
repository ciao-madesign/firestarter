/**
 * Test intermedio di fine modulo: 4 esercizi misti, anche di moduli precedenti,
 * con peso agli errori ricorrenti registrati nello stato del corso.
 */
import type { ModuleTestItem, ModuleTestState, VerifyResult, WorkspaceState } from '../engine/types.ts';
import { LESSONS } from '../curriculum/lessons/index.ts';
import type { CourseProgress, TestItem } from './progress.ts';

export function generateTest(course: CourseProgress, module: number, now: number): ModuleTestState {
  const weight = (l: (typeof LESSONS)[number]): { w: number; why: string[] } => {
    let w = 1;
    const why: string[] = [];
    for (const c of l.checks) {
      const e = c.errorTag ? course.recurringErrors.find((x) => x.id === c.errorTag) : undefined;
      if (e) {
        w += e.count * 2;
        if (!why.includes(e.text)) why.push(e.text);
      }
    }
    if (l.module === module) w += 3;
    if (course.lessons[l.id]?.status !== 'completed' && l.module !== module) w -= 100; // solo materiale già visto
    return { w, why };
  };
  const pool = LESSONS.filter((l) => !l.review && l.module <= module && !l.autonomous).map((l) => ({ l, ...weight(l) })).filter((x) => x.w > 0);
  pool.sort((a, b) => b.w - a.w || a.l.id.localeCompare(b.l.id));
  const picked: typeof pool = [];
  const take = (pred: (x: (typeof pool)[number]) => boolean, n: number): void => {
    for (const x of pool) {
      if (picked.length >= 4 || n <= 0) break;
      if (!picked.includes(x) && pred(x)) {
        picked.push(x);
        n--;
      }
    }
  };
  take((x) => x.l.module === module, 2);
  take((x) => x.l.module < module && x.why.length > 0, 2);
  take(() => true, 4 - picked.length);
  const items: ModuleTestItem[] = picked.slice(0, 4).map((x) => ({
    lesson: x.l.id,
    reason: x.why.length ? `riemerge un errore ricorrente: ${x.why[0]}` : x.l.module === module ? 'contenuto del modulo appena concluso' : 'ripasso di un modulo precedente',
    fails: 0,
    done: false,
  }));
  return { module, startedAt: now, items };
}

export function inTest(state: WorkspaceState, lessonId: string): boolean {
  const t = state.moduleTest;
  return !!t && !t.finished && t.items.some((i) => i.lesson === lessonId && !i.done);
}

/** Registra l'esito di una verifica nel test in corso. Ritorna il risultato complessivo se il test è concluso. */
export function recordTestProgress(state: WorkspaceState, course: CourseProgress, v: VerifyResult, helpUsed: boolean): { finished: boolean; summary?: string } {
  const t = state.moduleTest;
  if (!t || t.finished) return { finished: false };
  const item = t.items.find((i) => i.lesson === v.exerciseId && !i.done);
  if (!item) return { finished: false };
  if (!v.pass) {
    item.fails++;
    if (item.fails >= 2) {
      item.done = true;
      item.outcome = 'failed';
    }
  } else {
    item.done = true;
    item.outcome = helpUsed ? 'passed_partial' : item.fails === 0 ? 'passed' : item.fails === 1 ? 'retry' : 'passed_partial';
  }
  if (!t.items.every((i) => i.done)) return { finished: false };
  t.finished = true;
  const date = new Date().toISOString().slice(0, 10);
  const items: TestItem[] = t.items.map((i, n) => {
    const lesson = LESSONS.find((l) => l.id === i.lesson)!;
    return { n: n + 1, title: `${lesson.id} — ${lesson.title}`, outcome: i.outcome ?? 'failed', issue: i.reason };
  });
  course.tests[`M${t.module}`] = { date, items };
  const clean = t.items.filter((i) => i.outcome === 'passed').length;
  let note = '';
  if (clean === 4 && t.module >= 3 && course.level < 3) {
    course.level = (course.level + 1) as 1 | 2 | 3 | 4;
    course.levelNote = `Livello ${course.level} (test M${t.module}: 4 su 4 in autonomia)`;
    note = ` Livello portato a ${course.level}.`;
  }
  return { finished: true, summary: `Test M${t.module} concluso: ${clean} su 4 superati in autonomia al primo tentativo.${note}` };
}
