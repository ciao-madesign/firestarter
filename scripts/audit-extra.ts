/** Audit aggiuntivo: ordine casuale delle lezioni (contaminazione dello stato), test intermedi, varianti di soluzione. */
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import { seedProgress } from '../src/course/progress.ts';
import { generateTest, recordTestProgress } from '../src/course/moduletest.ts';
import type { ShellId } from '../src/engine/types.ts';

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const out: string[] = [];
const log = (m: string): void => void out.push(m);

for (const shell of ['bash', 'pwsh'] as ShellId[]) {
  const usable = LESSONS.filter((l) => l.shells.includes(shell) && !l.review);
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed * 7919);
    const order = [...usable].sort(() => r() - 0.5);
    const s = createWorkspace('rand');
    const course = seedProgress();
    for (const l of order) {
      startLesson(s, l.id);
      const lines = l.solutions?.[shell] ?? l.reference?.[shell] ?? [];
      for (const line of lines) {
        if (line.startsWith('#predict:')) {
          s.predictions.push({ lesson: l.id, step: 0, shell, text: line.slice(9).trim(), why: 'x', at: s.clock, accurate: true });
          continue;
        }
        execute(s, shell, line);
      }
      const v = verifyLesson(s, l.id, shell, course);
      if (!v.pass) log(`[ordine casuale ${shell} seed ${seed}] ${l.id} fallisce dopo [${order.slice(0, order.indexOf(l)).slice(-3).map((x) => x.id).join(', ')}]: ${v.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.actual}`).join(' | ').slice(0, 220)}`);
    }
  }
}

// test intermedi: ogni modulo, con un corso già avanzato
for (let m = 1; m <= 8; m++) {
  const course = seedProgress();
  for (const l of LESSONS) course.lessons[l.id] = { status: 'completed', acquired: [], errors: [] };
  const s = createWorkspace('mt');
  s.moduleTest = generateTest(course, m, s.clock);
  const t = s.moduleTest;
  if (t.items.length !== 4) log(`[test M${m}] il test ha ${t.items.length} esercizi invece di 4`);
  const ids = t.items.map((i) => i.lesson);
  if (new Set(ids).size !== ids.length) log(`[test M${m}] esercizi duplicati: ${ids.join(', ')}`);
  if (m >= 1 && m <= 8 && !ids.some((id) => LESSONS.find((l) => l.id === id)!.module === m)) log(`[test M${m}] nessun esercizio del modulo stesso: ${ids.join(', ')}`);
  for (const it of t.items) {
    const l = LESSONS.find((x) => x.id === it.lesson)!;
    const sh = l.shells.includes('bash') ? 'bash' : 'pwsh';
    startLesson(s, l.id);
    for (const line of l.solutions?.[sh] ?? l.reference?.[sh] ?? []) if (!line.startsWith('#predict:')) execute(s, sh, line);
    const v = verifyLesson(s, l.id, sh, course);
    const res = recordTestProgress(s, course, v, false);
    if (!v.pass) log(`[test M${m}] ${l.id} non superato con la soluzione`);
    if (res.finished) log(`(info) test M${m} concluso: ${res.summary}`);
  }
  if (!s.moduleTest.finished) log(`[test M${m}] non concluso dopo 4 esercizi`);
}
console.log(out.join('\n') || 'nessun problema');
