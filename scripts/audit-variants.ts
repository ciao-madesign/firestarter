/** Varianti legittime di soluzione: devono superare la verifica (altrimenti il controllo è troppo rigido o ambiguo). Varianti scorrette: non devono passare. */
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { seedProgress } from '../src/course/progress.ts';

import { VARIANTS as V } from '../tests/variants-data.ts';

let bad = 0;
for (const v of V) {
  const shell = v.shell ?? 'bash';
  const s = createWorkspace('v');
  startLesson(s, v.id);
  for (const l of v.lines) {
    const line = l.startsWith('/home') || l.startsWith('~') ? `cd ${l}` : l;
    execute(s, shell, line.startsWith('cd ~/corso-cli') || line.startsWith('cd /') ? line : line);
  }
  const r = verifyLesson(s, v.id, shell, seedProgress());
  const ok = r.pass === v.expect;
  if (!ok) {
    bad++;
    console.log(`✗ ${v.id} [${shell}] ${v.name}: atteso ${v.expect ? 'PASSA' : 'NON passa'}, invece ${r.pass ? 'passa' : 'non passa'}${r.pass ? '' : ' — ' + r.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.actual}`).join(' | ').slice(0, 200)}`);
  }
}
console.log(`\nVarianti: ${V.length}, incoerenti con l'atteso: ${bad}`);
