/**
 * Audit "insegnante": validità delle verifiche e del sistema di valutazione.
 * 1. Evidenza richiesta: ogni controllo guarda il PROCESSO (comandi, richieste API, stato) o solo il DOCUMENTO consegnato?
 * 2. Scorciatoia: se si eseguono solo i comandi che scrivono i file della soluzione, la lezione passa lo stesso?
 * 3. Specifica: i file letti dai controlli sono nominati nel testo dell'esercizio (lo studente non deve indovinarli)?
 * 4. Copertura delle competenze per modulo, prove in autonomia e rinforzo degli errori ricorrenti dello studente.
 * 5. Simulazione del sistema di livelli: studente autonomo contro studente che usa la soluzione.
 * Uso: npx tsx scripts/audit-teacher.ts [--json file]
 */
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/store.ts';
import { LESSONS, MODULES } from '../src/curriculum/lessons/index.ts';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { buildCheckCtx, startLesson } from '../src/curriculum/engine.ts';
import type { ShellId } from '../src/engine/types.ts';
import type { Lesson } from '../src/curriculum/types.ts';

const EVIDENCE = ['cmds', 'api', 'apiShell', 'sandbox', 'cleanRun', 'state'];
const WRITE_LINE = /<<-?\s*'?EOF|\bprintf\b.*>|Set-Content|Out-File|(^|[^>])>>?\s*[\w./~-]+\s*$|\btee\b/;
const OTHER = (s: ShellId): ShellId => (s === 'bash' ? 'pwsh' : 'bash');
void OTHER;

function solutionOf(l: Lesson, sh: ShellId): string[] {
  return l.solutions?.[sh] ?? l.reference?.[sh] ?? [];
}

function runLines(l: Lesson, sh: ShellId, lines: string[]): { pass: boolean; failed: string[]; usedEvidence: Record<string, string[]> } {
  const s = createWorkspace('teacher');
  startLesson(s, l.id);
  for (const line of lines) {
    if (line.startsWith('#predict:')) continue;
    execute(s, sh, line);
  }
  const base = buildCheckCtx(s, l, sh);
  const used: Record<string, string[]> = {};
  const failed: string[] = [];
  for (const c of l.checks) {
    const touched = new Set<string>();
    const proxy = new Proxy(base, {
      get(t, p, r) {
        if (typeof p === 'string') touched.add(p);
        return Reflect.get(t, p, r);
      },
    });
    let ok = false;
    try {
      ok = c.test(proxy).pass;
    } catch {
      ok = false;
    }
    used[c.id] = [...touched].filter((x) => EVIDENCE.includes(x));
    if (!ok) failed.push(c.id);
  }
  return { pass: failed.length === 0, failed, usedEvidence: used };
}

const out: Record<string, unknown> = {};

// 1 + 2 + 3: per lezione
const evidenceRows: { id: string; checks: number; processChecks: number; docOnly: boolean }[] = [];
const shortcut: string[] = [];
const hidden: string[] = [];
for (const l of LESSONS) {
  const sh: ShellId = l.shells.includes('bash') ? 'bash' : 'pwsh';
  const sol = solutionOf(l, sh);
  if (!sol.length) continue;
  const full = runLines(l, sh, sol);
  const proc = l.checks.filter((c) => full.usedEvidence[c.id]?.length).length;
  evidenceRows.push({ id: l.id, checks: l.checks.length, processChecks: proc, docOnly: proc === 0 });
  // scorciatoia: solo cd e righe che scrivono file
  const cheat = sol.filter((x, i) => i === 0 || /^(cd|Set-Location)\b/.test(x) || WRITE_LINE.test(x));
  if (cheat.length < sol.length) {
    const r = runLines(l, sh, cheat);
    if (r.pass) shortcut.push(`${l.id} (${sol.length - cheat.length} comandi saltati)`);
  }
  // file letti dai controlli ma non nominati nell'esercizio
  const text = (l.task.text + ' ' + l.task.criterion).toLowerCase();
  const names = new Set<string>();
  for (const c of [...l.checks, ...(l.alt?.checks ?? [])]) for (const m of c.test.toString().matchAll(/read\(\s*['"`]([^'"`]+)['"`]/g)) names.add(m[1]);
  const miss = [...names].filter((n) => !text.includes(n.toLowerCase().replace(/^~\/docs\//, '').replace(/^.*\//, '')));
  if (miss.length) hidden.push(`${l.id}: ${miss.join(', ')}`);
}
out.evidence = evidenceRows;
console.log('1. EVIDENZA RICHIESTA DAI CONTROLLI');
const docOnly = evidenceRows.filter((r) => r.docOnly);
console.log(`   lezioni con soluzione: ${evidenceRows.length}; con almeno un controllo sul processo: ${evidenceRows.length - docOnly.length}; solo documento: ${docOnly.length}`);
for (const r of docOnly) console.log(`   solo documento: ${r.id} (${r.checks} controlli)`);
console.log('\n2. SCORCIATOIA (basta scrivere i file senza eseguire gli altri comandi)');
console.log(`   ${shortcut.length} lezioni:`, shortcut.join('; ') || 'nessuna');
console.log('\n3. FILE LETTI DAI CONTROLLI MA NON NOMINATI NELL\'ESERCIZIO');
console.log(hidden.length ? hidden.map((x) => '   ' + x).join('\n') : '   nessuno');
out.shortcut = shortcut;
out.hidden = hidden;

// 4: competenze per modulo, autonomia, errori ricorrenti
console.log('\n4. COMPETENZE, PROVE IN AUTONOMIA, ERRORI RICORRENTI PER MODULO');
const TAGS = ['comandi', 'autonomia', 'output', 'http', 'testing', 'diagnosi', 'docs'] as const;
const ERR = ['percorsi-maiuscole', 'sintassi-vs-esecuzione', 'prompt-non-letto', 'previsioni-incoerenti'];
const matrix: Record<string, unknown>[] = [];
for (const m of MODULES) {
  const ls = LESSONS.filter((l) => l.module === m.n);
  const sk = Object.fromEntries(TAGS.map((t) => [t, ls.filter((l) => l.skills.includes(t)).length]));
  const auto = ls.filter((l) => l.autonomous).length;
  const err = Object.fromEntries(ERR.map((e) => [e, ls.filter((l) => l.checks.some((c) => c.errorTag === e)).length]));
  matrix.push({ modulo: 'M' + m.n, lezioni: ls.length, autonome: auto, ...sk, errori: err });
  console.log(`   M${String(m.n).padEnd(2)} lezioni ${String(ls.length).padStart(2)} autonome ${auto}  competenze ${TAGS.map((t) => `${t}:${sk[t]}`).join(' ')}  errori ${ERR.map((e) => `${e.split('-')[0]}:${err[e]}`).join(' ')}`);
}
out.matrix = matrix;

// 5: sistema di livelli, tramite il backend reale
async function levels(): Promise<void> {
  const srv = createApp({ store: new MemoryStore(), singleUser: false, webRoot: 'dist/web', trustProxy: true });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  let n = 0;
  const call = async (ws: string, method: string, path: string, body?: unknown): Promise<any> => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-workspace': ws, 'x-forwarded-for': `10.2.${Math.floor(n++ / 500) % 250}.9` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  const solve = async (ws: string, l: Lesson, useHelp: boolean): Promise<void> => {
    const sh: ShellId = l.shells.includes('bash') ? 'bash' : 'pwsh';
    await call(ws, 'POST', `/api/lessons/${l.id}/start`, { shell: sh });
    if (useHelp && !l.autonomous) {
      // la soluzione si ottiene solo dopo almeno due suggerimenti (il primo «hint» dà un esempio)
      for (const kind of ['hint', 'hint', 'hint', 'solution']) await call(ws, 'POST', `/api/lessons/${l.id}/help`, { kind, shell: sh });
    }
    for (const line of solutionOf(l, sh)) if (!line.startsWith('#predict:')) await call(ws, 'POST', '/api/exec', { command: line, shell: sh });
    const v = await call(ws, 'POST', `/api/lessons/${l.id}/verify`, { shell: sh });
    if (v?.result && !v.result.pass) console.log(`     ! ${l.id} non superata${useHelp ? ' (con aiuti)' : ''}: ${v.result.checks.filter((c: { pass: boolean }) => !c.pass).map((c: { id: string; actual: string }) => `${c.id}: ${c.actual}`).join(' | ')}`);
  };
  const persona = async (ws: string, useHelp: boolean): Promise<string[]> => {
    const log: string[] = [];
    for (const mod of [1, 2, 3, 4, 5, 6]) {
      for (const l of LESSONS.filter((x) => x.module === mod)) await solve(ws, l, useHelp);
      const t = await call(ws, 'POST', '/api/course/test', { module: mod });
      for (const it of t.moduleTest.items) {
        const l = LESSONS.find((x) => x.id === it.lesson)!;
        await solve(ws, l, useHelp);
      }
      const c = await call(ws, 'GET', '/api/course');
      log.push(`M${mod}: livello ${c.course?.level ?? c.level}; test ${JSON.stringify((c.course?.tests ?? c.tests ?? {})[`M${mod}`]?.items?.map((i: { outcome: string }) => i.outcome))}`);
    }
    const c = await call(ws, 'GET', '/api/course');
    log.push(`finale: livello ${c.course?.level ?? c.level} — ${c.course?.levelDetail ?? c.levelDetail}`);
    return log;
  };
  console.log('\n5. SISTEMA DI LIVELLI');
  console.log('   studente autonomo (nessun aiuto):');
  const a = await persona('autonomo', false);
  for (const x of a) console.log('     ' + x);
  console.log('   studente che mostra sempre la soluzione:');
  const b = await persona('soluzione', true);
  for (const x of b) console.log('     ' + x);
  out.levels = { autonomo: a, soluzione: b };
  srv.close();
}

await levels();
const jf = process.argv.indexOf('--json');
if (jf >= 0) writeFileSync(process.argv[jf + 1], JSON.stringify(out, null, 2));
process.exit(0);
