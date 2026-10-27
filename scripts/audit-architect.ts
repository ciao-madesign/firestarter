/**
 * Audit "learning architect": struttura, carico cognitivo, tempi, progressione, ripetizione e allineamento agli obiettivi.
 * Stime di tempo: lettura 200 parole/minuto; 1,5 min per passo guidato; 2 per previsione; 1,5 per il test negativo; esercizio
 * 5 min + 2 per controllo + 0,5 per comando della soluzione. Sono stime di progetto, da confrontare con i tempi reali dello studente.
 * Uso: npx tsx scripts/audit-architect.ts [--json file]
 */
import { writeFileSync } from 'node:fs';
import { LESSONS, MODULES } from '../src/curriculum/lessons/index.ts';
import { tokensOf } from './audit-info.ts';
import type { ShellId } from '../src/engine/types.ts';
import type { Lesson } from '../src/curriculum/types.ts';

const BASIC = new Set(['cd', 'ls', 'pwd', 'echo', 'cat', 'Get-Content', 'Set-Location', 'mkdir', 'cp', 'mv', 'rm', 'touch', 'if', 'for', 'while', 'then', 'fi', 'else', 'do', 'done', 'heredoc', 'here-string', 'Set-Content', '-Value', 'Write-Output', 'foreach', 'content-type', '>>', 'abc', 'mostra', 'exit']);
const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;
const lessonText = (l: Lesson, sh: ShellId): string => [...l.explain, l.objective, ...l.guided.filter((g) => g.cmd[sh]).flatMap((g) => [g.title, g.what, g.who, ...g.parts, g.expect]), ...l.predict.flatMap((p) => [p.prompt, p.expect, p.why]), l.negative.prompt, l.negative.explain, l.task.text, l.task.criterion].join(' ');

interface Row {
  id: string;
  module: number;
  title: string;
  shell: ShellId;
  words: number;
  guided: number;
  checks: number;
  solLines: number;
  newTools: string[];
  minutes: number;
  autonomous: boolean;
  docs: boolean;
  deliverables: number;
}
const rows: Row[] = [];
const seen: Record<ShellId, Set<string>> = { bash: new Set(), pwsh: new Set() };
const useIndex: Record<ShellId, Map<string, number[]>> = { bash: new Map(), pwsh: new Map() };
let idx = 0;
for (const l of LESSONS) {
  idx++;
  for (const sh of ['bash', 'pwsh'] as ShellId[]) {
    if (!l.shells.includes(sh)) continue;
    const sol = l.solutions?.[sh] ?? l.reference?.[sh] ?? [];
    const toks = new Set<string>();
    for (const line of sol) for (const t of tokensOf(line, sh)) if (!BASIC.has(t) && !/^export -/.test(t)) toks.add(t);
    const fresh = [...toks].filter((t) => !seen[sh].has(t));
    for (const t of toks) {
      seen[sh].add(t);
      useIndex[sh].set(t, [...(useIndex[sh].get(t) ?? []), idx]);
    }
    const w = words(lessonText(l, sh));
    const minutes = w / 200 + l.guided.filter((g) => g.cmd[sh]).length * 1.5 + l.predict.filter((p) => p.cmd[sh]).length * 2 + 1.5 + 5 + l.checks.length * 2 + sol.length * 0.5;
    rows.push({
      id: l.id,
      module: l.module,
      title: l.title,
      shell: sh,
      words: w,
      guided: l.guided.filter((g) => g.cmd[sh]).length,
      checks: l.checks.length,
      solLines: sol.length,
      newTools: fresh,
      minutes: Math.round(minutes),
      autonomous: !!l.autonomous,
      docs: l.skills.includes('docs'),
      deliverables: (l.task.text.match(/[\w.-]+\.(md|json|ya?ml|sh|ps1|txt)\b/g) ?? []).length,
    });
  }
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]): number => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const bash = rows.filter((r) => r.shell === 'bash');
const pwsh = rows.filter((r) => r.shell === 'pwsh');

console.log('1. CARICO E TEMPI (stime)');
console.log(`   lezioni: ${LESSONS.length} (Bash ${bash.length}, PowerShell ${pwsh.length})`);
for (const [name, set] of [['Bash', bash], ['PowerShell', pwsh]] as const) {
  const mins = set.map((r) => r.minutes);
  console.log(`   ${name}: totale ${Math.round(mins.reduce((a, b) => a + b, 0) / 60)} ore, media ${Math.round(mean(mins))} min/lezione (dev. std ${Math.round(sd(mins))}), massimo ${Math.max(...mins)} min`);
}
console.log('   per modulo (Bash):');
for (const m of MODULES) {
  const set = bash.filter((r) => r.module === m.n);
  if (!set.length) continue;
  const tot = set.reduce((a, r) => a + r.minutes, 0);
  console.log(`     M${String(m.n).padEnd(2)} ${String(set.length).padStart(2)} lezioni, ${String(tot).padStart(3)} min (${(tot / 30).toFixed(1)} giorni a 30 min), media ${Math.round(tot / set.length)} min, nuovi strumenti ${set.reduce((a, r) => a + r.newTools.length, 0)}${m.optional ? ' [facoltativo]' : ''}`);
}
const core = bash.filter((r) => r.module <= 6);
console.log(`   percorso base M1–M6 (Bash): ${Math.round(core.reduce((a, r) => a + r.minutes, 0) / 60)} ore = ${(core.reduce((a, r) => a + r.minutes, 0) / 30).toFixed(0)} giorni a 30 min`);
const all = bash.reduce((a, r) => a + r.minutes, 0);
console.log(`   tutto il corso (Bash): ${Math.round(all / 60)} ore = ${(all / 30).toFixed(0)} giorni a 30 min`);

console.log('\n2. LEZIONI OLTRE I 40 MINUTI O CON PIÙ DI 6 STRUMENTI NUOVI (Bash)');
for (const r of bash.filter((x) => x.minutes > 40 || x.newTools.length > 6)) console.log(`   ${r.id.padEnd(7)} ${String(r.minutes).padStart(3)} min, ${r.newTools.length} strumenti nuovi (${r.newTools.slice(0, 8).join(', ')}) — ${r.title}`);

console.log('\n3. STRUMENTI USATI UNA SOLA VOLTA (carico senza ripasso)');
for (const sh of ['bash', 'pwsh'] as ShellId[]) {
  const once = [...useIndex[sh].entries()].filter(([, v]) => v.length === 1).map(([k]) => k);
  console.log(`   ${sh}: ${once.length} su ${useIndex[sh].size}: ${once.slice(0, 40).join(', ')}${once.length > 40 ? ', …' : ''}`);
}

console.log('\n4. DISTANZA MASSIMA TRA USI DELLO STESSO STRUMENTO (Bash, strumenti usati ≥3 volte)');
const gaps = [...useIndex.bash.entries()].filter(([, v]) => v.length >= 3).map(([k, v]) => ({ k, gap: Math.max(...v.slice(1).map((x, i) => x - v[i])), n: v.length })).sort((a, b) => b.gap - a.gap).slice(0, 8);
for (const g of gaps) console.log(`   ${g.k}: ${g.n} usi, intervallo massimo ${g.gap} lezioni`);

console.log('\n5. PARITÀ BASH / POWERSHELL');
const bashOnly = LESSONS.filter((l) => l.shells.length === 1 && l.shells[0] === 'bash').map((l) => l.id);
const pwshOnly = LESSONS.filter((l) => l.shells.length === 1 && l.shells[0] === 'pwsh').map((l) => l.id);
console.log(`   solo Bash: ${bashOnly.join(', ') || 'nessuna'}; solo PowerShell: ${pwshOnly.join(', ') || 'nessuna'}`);

console.log('\n6. ALLINEAMENTO AGLI OBIETTIVI (Technical Writer)');
const nDocs = LESSONS.filter((l) => l.skills.includes('docs')).length;
const nDel = rows.filter((r) => r.shell === 'bash').reduce((a, r) => a + r.deliverables, 0);
console.log(`   lezioni con la competenza «documentazione»: ${nDocs} su ${LESSONS.length}; file consegnati citati negli esercizi: ${nDel}`);
for (const m of MODULES) {
  const ls = LESSONS.filter((l) => l.module === m.n);
  console.log(`     M${String(m.n).padEnd(2)} docs ${ls.filter((l) => l.skills.includes('docs')).length}/${ls.length}; prove autonome ${ls.filter((l) => l.autonomous).length}`);
}

console.log('\n7. RAMPA DI DIFFICOLTÀ (strumenti nuovi per lezione, media mobile su 5 lezioni Bash)');
const ramp = bash.map((r) => r.newTools.length);
const smooth = ramp.map((_, i) => mean(ramp.slice(Math.max(0, i - 2), i + 3)));
console.log('   ' + bash.map((r, i) => `${r.id}:${smooth[i].toFixed(1)}`).filter((_, i) => i % 3 === 0).join('  '));

const jf = process.argv.indexOf('--json');
if (jf >= 0) writeFileSync(process.argv[jf + 1], JSON.stringify(rows, null, 2));
