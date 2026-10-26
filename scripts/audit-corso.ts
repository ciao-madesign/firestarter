/**
 * Audit del corso: simula uno studente che percorre TUTTO il curriculum attraverso l'API del server
 * (stessa strada dell'interfaccia) e segnala anomalie. Non modifica lo stato reale del corso (usa MemoryStore).
 * Uso: tsx scripts/audit-corso.ts [bash|pwsh]
 */
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/store.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import type { ShellId } from '../src/engine/types.ts';

type J = any;
let seq = 0;
const findings: { sev: 'ERRORE' | 'AVVISO' | 'NOTA'; lesson: string; shell: string; msg: string }[] = [];
const add = (sev: 'ERRORE' | 'AVVISO' | 'NOTA', lesson: string, shell: string, msg: string): void => void findings.push({ sev, lesson, shell, msg });

async function main(): Promise<void> {
  const shells: ShellId[] = process.argv[2] ? [process.argv[2] as ShellId] : ['bash', 'pwsh'];
  const srv = createApp({ store: new MemoryStore(), singleUser: false, webRoot: 'dist/web', trustProxy: true });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api`;
  const times: Record<string, number> = {};

  for (const shell of shells) {
    const ws = `audit-${shell}-${Math.random().toString(36).slice(2, 8)}`;
    const call = async (method: string, path: string, body?: unknown): Promise<J> => {
      const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-workspace': ws, 'x-forwarded-for': `10.0.${Math.floor(++seq / 250)}.${seq % 250}` }, body: body === undefined ? undefined : JSON.stringify({ shell, ...(body as object) }) });
      const t = await r.text();
      let j: J = null;
      try { j = JSON.parse(t); } catch { /* testo */ }
      if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 200)}`);
      return j;
    };
    const exec = async (line: string): Promise<J> => call('POST', '/exec', { command: line });
    const text = (r: J): string => (r.out as J[]).map((o) => o.t).join('');

    const view = await call('GET', '/lessons');
    const order: string[] = view.modules.flatMap((m: J) => m.lessons.map((l: J) => l.id));
    for (const id of order) {
      const lesson = LESSONS.find((l) => l.id === id)!;
      if (!lesson.shells.includes(shell)) continue;
      const t0 = Date.now();
      const tag = (m: string): string => m;
      try {
        await call('POST', `/lessons/${id}/start`, {});
        const lv: J = await call('GET', `/lessons/${id}`);
        if (lv.checks?.length === 0) add('ERRORE', id, shell, 'nessun controllo di verifica');
        // 1. verifica a vuoto: non deve passare
        const v0 = await call('POST', `/lessons/${id}/verify`, {});
        if (v0.result.pass) add('ERRORE', id, shell, 'la verifica passa senza aver fatto nulla');
        // 2. passi guidati, previsioni, test negativo: eseguire come farebbe lo studente
        const probes: string[] = [];
        for (const g of lesson.guided) if (g.cmd[shell]) probes.push(g.cmd[shell]!);
        for (const p of lesson.predict) {
          if (!p.cmd[shell]) continue;
          const pr = await call('POST', `/lessons/${id}/prediction`, { step: 0, text: 'previsione di prova', why: 'perché di prova' });
          probes.push(p.cmd[shell]!);
          await call('POST', `/lessons/${id}/assess`, { index: pr.index, accurate: true });
        }
        if (lesson.negative.cmd[shell]) probes.push(lesson.negative.cmd[shell]!);
        if (lesson.example.cmd[shell]) probes.push(lesson.example.cmd[shell]!);
        for (const line of probes) {
          const r = await exec(line);
          if (r.exit === 70) add('ERRORE', id, shell, `errore interno del simulatore: ${line.slice(0, 80)}`);
          if (r.incomplete) add('ERRORE', id, shell, `comando di esempio incompleto: ${line.slice(0, 80)}`);
        }
        // 3. dopo aver eseguito gli esempi (senza soluzione) la verifica non deve passare
        const v1 = await call('POST', `/lessons/${id}/verify`, {});
        if (v1.result.pass) add('AVVISO', id, shell, 'gli esempi guidati/negativo/analogo, eseguiti da soli, bastano a superare la verifica (la lezione si può passare copiando gli esempi)');
        // 4. aiuti graduati
        const h1: J = await call('POST', `/lessons/${id}/help`, { kind: 'solution' });
        if (!h1.denied && !lesson.autonomous) add('AVVISO', id, shell, 'la soluzione completa è disponibile senza aver usato alcun indizio');
        for (let i = 0; i < lesson.hints.length + 1; i++) await call('POST', `/lessons/${id}/help`, { kind: 'hint' });
        // 5. soluzione
        const lines = lesson.solutions?.[shell] ?? lesson.reference?.[shell];
        if (!lines) {
          add('NOTA', id, shell, 'nessuna soluzione per questa shell');
          continue;
        }
        await call('POST', `/lessons/${id}/reset`, {});
        for (const line of lines) {
          if (line.startsWith('#predict:')) {
            const pr = await call('POST', `/lessons/${id}/prediction`, { step: 0, text: line.slice(9).trim(), why: 'audit' });
            await call('POST', `/lessons/${id}/assess`, { index: pr.index, accurate: true });
            continue;
          }
          const r = await exec(line);
          if (r.exit === 70) add('ERRORE', id, shell, `errore interno: ${line.slice(0, 80)}`);
          if (r.incomplete) add('ERRORE', id, shell, `soluzione incompleta dal terminale: ${line.slice(0, 80)}`);
        }
        const v2 = await call('POST', `/lessons/${id}/verify`, {});
        if (!v2.result.pass) add('ERRORE', id, shell, `la soluzione documentata non supera la verifica: ${v2.result.checks.filter((c: J) => !c.pass).map((c: J) => `${c.id}: ${c.actual}`).join(' | ')}`);
        // 6. ripetibilità: seconda verifica identica
        const v3 = await call('POST', `/lessons/${id}/verify`, {});
        if (v3.result.pass !== v2.result.pass) add('ERRORE', id, shell, 'la verifica non è stabile (due esecuzioni consecutive danno esiti diversi)');
        // 7. reset deve riportare la verifica a "non superata"
        await call('POST', `/lessons/${id}/reset`, {});
        const v4 = await call('POST', `/lessons/${id}/verify`, {});
        if (v4.result.pass) add('ERRORE', id, shell, 'dopo il ripristino la verifica passa ancora');
        // il reset non deve togliere il completamento già registrato (progresso)
      } catch (e) {
        add('ERRORE', id, shell, `eccezione durante la simulazione: ${(e as Error).message.slice(0, 220)}`);
      }
      times[`${shell}:${id}`] = Date.now() - t0;
      void tag;
    }

    // stato finale del corso
    const course: J = await call('GET', '/course');
    const lv2: J = await call('GET', '/lessons');
    const all = lv2.modules.flatMap((m: J) => m.lessons).filter((l: J) => l.shells.includes(shell));
    const done = all.filter((l: J) => l.status === 'completed').length;
    if (done !== all.length) add('ERRORE', 'CORSO', shell, `dopo aver superato ogni verifica risultano completate ${done} lezioni su ${all.length}: ${all.filter((l: J) => l.status !== 'completed').map((l: J) => l.id).join(', ')}`);
    console.log(`[${shell}] lezioni completate nello stato del corso: ${done}; prossima: ${course.next?.lesson}; livello: ${course.level}`);
    // REGISTRO: esporta e reimporta senza perdere progressi
    const regRaw = await (await fetch(`${base}/course/registro`, { headers: { 'x-workspace': ws, 'x-forwarded-for': '10.9.9.9' } })).text();
    const reg: string = JSON.parse(regRaw).text;
    const imp = await fetch(`${base}/course/registro`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace': ws, 'x-forwarded-for': '10.9.9.8' }, body: JSON.stringify({ text: reg }) });
    if (!imp.ok) add('ERRORE', 'REGISTRO', shell, `reimportazione del registro esportato non riuscita: ${(await imp.text()).slice(0, 160)}`);
    const course2: J = await call('GET', '/course');
    if (course2.level < course.level) add('ERRORE', 'REGISTRO', shell, 'il livello scende dopo la reimportazione');
  }

  srv.close();
  const slow = Object.entries(times).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('Più lente:', slow.map(([k, v]) => `${k} ${v}ms`).join(', '));
  const order = { ERRORE: 0, AVVISO: 1, NOTA: 2 } as const;
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  for (const f of findings) console.log(`${f.sev} ${f.lesson} [${f.shell}] ${f.msg}`);
  console.log(`\nTotale: ${findings.filter((f) => f.sev === 'ERRORE').length} errori, ${findings.filter((f) => f.sev === 'AVVISO').length} avvisi, ${findings.filter((f) => f.sev === 'NOTA').length} note`);
}
void main();
