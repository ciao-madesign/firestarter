/** Fuzzing: righe casuali (frammenti validi e non) non devono mai causare errori interni, blocchi o stati non serializzabili. */
import { createWorkspace, execute } from '../src/engine/index.ts';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { ShellId } from '../src/engine/types.ts';

let s0 = 12345;
const rnd = (): number => ((s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const BASH = ['echo', 'ls', 'cat', 'grep', 'sort', 'uniq', 'cut', 'head', 'tail', 'wc', 'curl', 'jq', 'cd', 'pwd', 'for', 'while', 'if', 'then', 'fi', 'do', 'done', '[[', ']]', '[', ']', '|', '||', '&&', ';', '>', '>>', '<', '2>&1', '$(', ')', '(', '{', '}', '"', "'", '`', '$', '${', '$((', '))', '\\', '*', '?', 'a', 'b', '-n', '-l', '--', '~', '/', '.', '..', '=', 'x=1', 'f()', 'function', 'return', 'exit', '<<', 'EOF', '!', '&', '#', '\n', '$?', '$@', '$1', 'sed', 'awk', 'tr', 'xargs', 'export', 'read', 'case', 'esac', 'in', ';;', '%{http_code}', '-s', '-H', '-X', 'POST', '$TASKFLOW_URL/v1/health', '-d', '{"a":1}'];
const PWSH = ['Get-ChildItem', 'Write-Output', 'ForEach-Object', 'Where-Object', 'Select-Object', '|', '{', '}', '(', ')', '[', ']', '@{', '@(', '$_', '$x', '=', '+=', '"', "'", '`', '$(', '-eq', '-gt', '-and', '-not', '-join', '-split', '-f', 'if', 'else', 'foreach', 'in', 'while', 'for', 'function', 'param', 'try', 'catch', 'finally', 'throw', 'return', 'exit', ';', ',', '..', '::', '.', '[int]', '[string]', '1', '2', '"a"', "'b'", '@"', '"@', '&', '$null', '$true', '-Path', '-Force', '|%', '?', 'Invoke-RestMethod', '$env:TASKFLOW_URL/v1/health', 'ConvertTo-Json', 'ConvertFrom-Json', 'Sort-Object', 'Group-Object', 'Measure-Object', '-Recurse', '#', '<#', '#>', '\n', '-ErrorAction', 'Stop', '$?', '$PSVersionTable'];
const SKIP = new Set(process.env.SKIPFILE && existsSync(process.env.SKIPFILE) ? readFileSync(process.env.SKIPFILE, 'utf8').split('\n@@\n') : []);
const stats = { n: 0, internal: 0, slow: 0, ser: 0 };
const bad: string[] = [];
for (const shell of ['bash', 'pwsh'] as ShellId[]) {
  const ws = createWorkspace('fz');
  const vocab = shell === 'bash' ? BASH : PWSH;
  for (let i = 0; i < 4000; i++) {
    const len = 1 + Math.floor(rnd() * 9);
    const line = Array.from({ length: len }, () => pick(vocab)).join(rnd() < 0.7 ? ' ' : '');
    if (SKIP.has(`${shell}\n${line}`)) continue;
    if (process.env.TRACE) writeFileSync(process.env.TRACE, `${shell}\n${line}`);
    const t0 = Date.now();
    let r;
    try {
      r = execute(ws, shell, line);
    } catch (e) {
      stats.internal++;
      bad.push(`ECCEZIONE [${shell}] ${JSON.stringify(line)}: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    stats.n++;
    const dt = Date.now() - t0;
    if (r.exit === 70) {
      stats.internal++;
      if (bad.length < 25) bad.push(`INTERNO [${shell}] ${JSON.stringify(line)}: ${r.out.map((o) => o.t).join('').split('\n')[0].slice(0, 100)}`);
    }
    if (dt > 1500) {
      stats.slow++;
      bad.push(`LENTO ${dt}ms [${shell}] ${JSON.stringify(line)}`);
    }
    if (i % 500 === 0) {
      try { JSON.stringify(ws); } catch { stats.ser++; bad.push('STATO NON SERIALIZZABILE'); }
    }
  }
}
console.log(bad.join('\n'));
console.log(stats);
