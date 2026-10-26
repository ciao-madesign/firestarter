import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';

/** Risultati noti di Windows PowerShell 5.1 (verificati sulla documentazione/esperienza reale) per i casi che prima erano sbagliati in silenzio. */
const run = (line: string): { out: string; exit: number } => {
  const s = createWorkspace('pwc');
  const r = execute(s, 'pwsh', line);
  return { out: r.out.filter((o) => o.s === 'out').map((o) => o.t).join(''), exit: r.exit };
};

const CASES: [string, string][] = [
  ['(1..5 | Measure-Object -Sum).Sum', '15\n'],
  ['(1..5 | Measure-Object).Count', '5\n'],
  ['(1..4 | Measure-Object -Average).Average', '2.5\n'],
  ['(1..4 | Measure-Object -Maximum -Minimum | ForEach-Object { "$($_.Maximum)-$($_.Minimum)" })', '4-1\n'],
  ['"a","b","c" | Measure-Object | Select-Object -ExpandProperty Count', '3\n'],
  ['$i = 0; $i++; $i++; $i', '2\n'],
  ['$i = 0; while ($i -lt 3) { $i++ }; $i', '3\n'],
  ['$i = 5; ($i++)', '5\n'],
  ['$i = 5; ++$i; $i', '6\n'],
  ['$a = 1; $b = $a++; "$a $b"', '2 1\n'],
  ['[char]65', 'A\n'],
  ['[int][char]"A"', '65\n'],
  ['[Convert]::ToString(255,2)', '11111111\n'],
  ['[Convert]::ToString(255,16)', 'ff\n'],
  ['[Convert]::ToInt32("ff",16)', '255\n'],
  ['$PSVersionTable.PSVersion.ToString()', '5.1.19041.1\n'],
  ['$PSVersionTable.PSVersion.Major', '5\n'],
  ['$env:OS', 'Windows_NT\n'],
  ['$env:COMPUTERNAME.Length -gt 0', 'True\n'],
  ['Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -OutFile /tmp/h.json -UseBasicParsing', ''],
  ['Invoke-WebRequest "$env:TASKFLOW_URL/v1/health" -OutFile /tmp/h.json -UseBasicParsing -PassThru | Select-Object -ExpandProperty StatusCode', '200\n'],
];

describe('PowerShell: risultati noti di Windows PowerShell 5.1', () => {
  for (const [line, want] of CASES) {
    it(line.slice(0, 80), () => {
      const s = createWorkspace('pwc');
      execute(s, 'pwsh', '$env:TASKFLOW_URL = "http://localhost:8080"');
      const r = execute(s, 'pwsh', line);
      expect(r.out.filter((o) => o.s === 'out').map((o) => o.t).join('')).toBe(want);
    });
  }
  it('filter non è silenziosamente sbagliato: dà un errore esplicito', () => {
    const r = run('filter dbl { $_ * 2 }; 1..2 | dbl');
    expect(r.exit).not.toBe(0);
    expect(r.out).toBe('');
  });
});
