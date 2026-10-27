/**
 * Audit "studente": una esecuzione completa del corso attraverso il backend reale (HTTP), lezione dopo lezione, nello STESSO workspace
 * (nessun ripristino tra una lezione e l'altra), una volta in Bash e una volta in PowerShell.
 * Per ogni lezione: avvio, passi guidati, previsioni, test negativo, soluzione (o riferimento), verifica. Segnala problemi di continuità,
 * limiti del simulatore incontrati e lezioni che non passano. Uso: npx tsx scripts/audit-student.ts [--json file]
 */
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/store.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import type { ShellId } from '../src/engine/types.ts';

const FLAGS = /Errore interno del simulatore|non supportat|non è supportat|opzione non riconosciuta|not supported|nel laboratorio è supportato solo|non è disponibile nel laboratorio/;

interface Row {
  id: string;
  title: string;
  shell: ShellId;
  pass: boolean;
  commands: number;
  failedChecks: string[];
  simLimits: string[];
  mode?: string;
}

async function main(): Promise<void> {
  const srv = createApp({ store: new MemoryStore(), singleUser: false, webRoot: 'dist/web', trustProxy: true });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  let n = 0;
  const call = async (ws: string, method: string, path: string, body?: unknown): Promise<any> => {
    // il backend limita le richieste per IP (1200/minuto): l'audit ruota l'indirizzo come farebbero molti studenti diversi
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-workspace': ws, 'x-forwarded-for': `10.1.${Math.floor(n++ / 500) % 250}.7` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, json: text ? JSON.parse(text) : null };
  };
  const rows: Row[] = [];
  for (const shell of ['bash', 'pwsh'] as ShellId[]) {
    const ws = `audit-${shell}`;
    for (const lesson of LESSONS) {
      if (!lesson.shells.includes(shell)) continue;
      const row: Row = { id: lesson.id, title: lesson.title, shell, pass: false, commands: 0, failedChecks: [], simLimits: [] };
      const run = async (cmd: string): Promise<void> => {
        const r = await call(ws, 'POST', '/api/exec', { command: cmd, shell });
        row.commands++;
        const out = (r.json?.out ?? []).map((o: { t: string }) => o.t).join('');
        for (const line of out.split('\n')) if (FLAGS.test(line)) row.simLimits.push(`${cmd.slice(0, 50)} → ${line.slice(0, 90)}`);
      };
      await call(ws, 'POST', `/api/lessons/${lesson.id}/start`, { shell });
      for (const g of lesson.guided) if (g.cmd[shell]) await run(g.cmd[shell]!);
      for (const [i, p] of lesson.predict.entries()) {
        if (!p.cmd[shell]) continue;
        const pr = await call(ws, 'POST', `/api/lessons/${lesson.id}/prediction`, { text: 'previsione dello studente', why: 'ragionamento dello studente', step: i, shell });
        await run(p.cmd[shell]!);
        if (pr.json?.index !== undefined) await call(ws, 'POST', `/api/lessons/${lesson.id}/assess`, { index: pr.json.index, accurate: true, shell });
      }
      if (lesson.negative.cmd[shell]) await run(lesson.negative.cmd[shell]!);
      const sol = lesson.solutions?.[shell] ?? lesson.reference?.[shell] ?? [];
      for (const line of sol) {
        if (line.startsWith('#predict:')) {
          const pr = await call(ws, 'POST', `/api/lessons/${lesson.id}/prediction`, { text: line.slice(9).trim(), why: 'ragionamento dello studente', step: 0, shell });
          if (pr.json?.index !== undefined) await call(ws, 'POST', `/api/lessons/${lesson.id}/assess`, { index: pr.json.index, accurate: true, shell });
        } else await run(line);
      }
      const v = await call(ws, 'POST', `/api/lessons/${lesson.id}/verify`, { shell });
      const res = v.json?.result;
      row.pass = !!res?.pass;
      row.failedChecks = (res?.checks ?? []).filter((c: { pass: boolean }) => !c.pass).map((c: { id: string; actual: string }) => `${c.id}: ${c.actual}`);
      row.mode = v.json?.lesson?.completions?.[shell]?.mode;
      if (!res) row.failedChecks.push(`verifica non eseguita: HTTP ${v.status} ${JSON.stringify(v.json).slice(0, 200)}`);
      rows.push(row);
    }
    const course = (await call(ws, 'GET', '/api/course')).json;
    console.log(`\n== ${shell}: livello ${course.course?.level ?? course.level} — ${course.course?.levelNote ?? course.levelNote}`);
  }
  srv.close();
  const bad = rows.filter((r) => !r.pass);
  const lim = rows.filter((r) => r.simLimits.length);
  console.log(`\nLezioni eseguite: ${rows.length} (bash ${rows.filter((r) => r.shell === 'bash').length}, pwsh ${rows.filter((r) => r.shell === 'pwsh').length})`);
  console.log(`Superate: ${rows.length - bad.length}; non superate: ${bad.length}`);
  for (const r of bad) console.log(`  NO ${r.id} [${r.shell}] ${r.failedChecks.join(' | ')}`);
  console.log(`Lezioni in cui si incontrano limiti dichiarati del simulatore: ${lim.length}`);
  for (const r of lim) for (const s of r.simLimits.slice(0, 2)) console.log(`  ${r.id} [${r.shell}] ${s}`);
  const jf = process.argv.indexOf('--json');
  if (jf >= 0) writeFileSync(process.argv[jf + 1], JSON.stringify(rows, null, 2));
  process.exit(0);
}

void main();
