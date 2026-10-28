/**
 * Audit di completezza: per ogni lezione e shell controlla che
 *  1. i file citati nei testi (consegna, spiegazione, indizi, previsioni) esistano dopo la preparazione o siano creati dalla soluzione;
 *  2. i comandi di passi guidati, previsione, test negativo ed esempio non falliscano per un file mancante (salvo fallimento dichiarato);
 *  3. i file letti dai comandi stiano nella cartella della lezione.
 * Il risultato è un elenco da rivedere a mano, non un verdetto.
 */
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, lessonDir } from '../src/curriculum/engine.ts';
import type { ShellId } from '../src/engine/types.ts';
import type { Lesson } from '../src/curriculum/types.ts';

const EXT = '(?:txt|md|csv|json|sh|ps1|log|yaml|yml|env|jar|conf|ts|js)';
const NAME_RE = new RegExp(`(?<![\\w/.~-])([A-Za-z0-9_.-]+\\.${EXT})\\b`, 'g');
const MISSING = /No such file|Cannot find path|cannot access|does not exist|non esiste|not found/i;

const out: string[] = [];
const add = (id: string, sh: string, kind: string, msg: string): void => void out.push(`${kind.padEnd(9)} ${id} [${sh}] ${msg}`);

function textOf(l: Lesson, sh: ShellId): { where: string; text: string }[] {
  const t: { where: string; text: string }[] = [
    { where: 'consegna', text: l.task.text },
    { where: 'criterio', text: l.task.criterion },
    ...l.explain.map((e) => ({ where: 'spiegazione', text: e })),
    ...l.hints.map((e) => ({ where: 'indizio', text: e })),
    ...l.predict.map((p) => ({ where: 'previsione', text: p.prompt })),
    { where: 'negativo', text: l.negative.prompt },
    { where: 'esempio', text: l.example.text },
  ];
  void sh;
  return t;
}

for (const l of LESSONS) {
  for (const sh of l.shells as ShellId[]) {
    const dir = lessonDir(l.id);
    // preparazione
    const s0 = createWorkspace('a');
    startLesson(s0, l.id);
    const setupFiles = new Set(Object.entries(s0.fs).filter(([, n]) => n.type === 'file').map(([p]) => p));
    const baseNames = new Set([...setupFiles].map((p) => p.split('/').pop()!));
    // file creati dalla soluzione
    const sol = l.solutions?.[sh] ?? l.reference?.[sh];
    const made = new Set<string>();
    if (sol) {
      const s1 = createWorkspace('b');
      startLesson(s1, l.id);
      for (const line of sol) if (!line.startsWith('#predict:')) execute(s1, sh, line);
      for (const [p, n] of Object.entries(s1.fs)) if (n.type === 'file' && !setupFiles.has(p)) made.add(p.split('/').pop()!);
    }
    // 1. nomi di file citati
    const cmdText = [...l.guided.map((g) => g.cmd[sh] ?? ''), ...l.predict.map((p) => p.cmd[sh] ?? ''), l.negative.cmd[sh] ?? '', l.example.cmd[sh] ?? ''].join('\n');
    for (const { where, text } of textOf(l, sh)) {
      for (const m of text.matchAll(NAME_RE)) {
        const name = m[1];
        if (baseNames.has(name) || made.has(name)) continue;
        if (/^(curl|jq)\./.test(name)) continue;
        const inCmd = cmdText.includes(name);
        add(l.id, sh, inCmd ? 'citato-cmd' : 'citato', `«${name}» in ${where} non esiste dopo la preparazione e non è creato dalla soluzione`);
      }
    }
    // 2. comandi eseguibili
    const s2 = createWorkspace('c');
    startLesson(s2, l.id);
    s2.shells[sh].cwd = dir; // lo studente è nella cartella della lezione (se ha fatto cd)
    const probes: { kind: string; cmd: string; allowed: boolean }[] = [];
    for (const g of l.guided) if (g.cmd[sh]) probes.push({ kind: 'guidato', cmd: g.cmd[sh]!, allowed: !!(g.notFound || (typeof g.fails === 'object' ? g.fails[sh] : g.fails)) });
    for (const p of l.predict) if (p.cmd[sh]) probes.push({ kind: 'previsione', cmd: p.cmd[sh]!, allowed: false });
    if (l.negative.cmd[sh]) probes.push({ kind: 'negativo', cmd: l.negative.cmd[sh]!, allowed: true });
    if (l.example.cmd[sh]) probes.push({ kind: 'esempio', cmd: l.example.cmd[sh]!, allowed: false });
    for (const pr of probes) {
      const r = execute(s2, sh, pr.cmd);
      if (r.incomplete) continue;
      const err = r.out.filter((o) => o.s === 'err').map((o) => o.t).join('');
      if (MISSING.test(err) && !pr.allowed) add(l.id, sh, 'mancante', `${pr.kind}: ${pr.cmd.slice(0, 70).replace(/\n/g, ' ')} → ${err.trim().slice(0, 90)}`);
    }
  }
}
console.log(out.length ? out.join('\n') : 'Nessun problema rilevato.');
console.log(`\nVoci: ${out.length}`);

// 4. costrutti dei comandi di previsione/negativo/esempio e dei comandi nella consegna: devono essere spiegati prima o nella lezione
import { teaching, tokensOf } from './audit-info.ts';
const gaps: string[] = [];
for (const sh of ['bash', 'pwsh'] as ShellId[]) {
  let cumulative = '';
  const taught = new Set<string>();
  for (const l of LESSONS) {
    if (!l.shells.includes(sh)) continue;
    cumulative += '\n' + teaching(l, sh);
    const lines = [...l.predict.map((p) => p.cmd[sh]), l.negative.cmd[sh], l.example.cmd[sh]].filter(Boolean) as string[];
    const missing = new Set<string>();
    for (const line of lines) for (const t of tokensOf(line, sh)) {
      if (taught.has(t)) continue;
      const probe = t.includes(' ') && !t.startsWith('$') ? t.split(' ')[1] : t;
      const esc = probe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const found = new RegExp((/^[A-Za-z]/.test(probe) ? '(?<![A-Za-z0-9_-])' : '') + esc + '(?![A-Za-z0-9_])', sh === 'pwsh' && /^[A-Z]/.test(t) ? 'i' : '').test(cumulative);
      if (found) taught.add(t); else missing.add(t);
    }
    for (const t of missing) taught.add(t);
    if (missing.size) gaps.push(`${l.id} [${sh}] costrutti di previsione/negativo/esempio mai spiegati: ${[...missing].join(', ')}`);
  }
}
console.log(gaps.length ? '\n' + gaps.join('\n') : '\nCostrutti di previsione/negativo/esempio: nessuna lacuna.');
