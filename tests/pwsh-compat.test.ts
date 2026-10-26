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
  ['switch (2) { 1 {"uno"} 2 {"due"} default {"altro"} }', 'due\n'],
  ['switch (9) { 1 {"uno"} default {"altro"} }', 'altro\n'],
  ['switch -Regex ("abc") { "^a" {"A"} "c$" {"C"} }', 'A\nC\n'],
  ['switch (1,2,3) { {$_ -gt 1} {"grande $_"} }', 'grande 2\ngrande 3\n'],
  ['switch ("a") { "a" {"x"; break} "a" {"y"} }', 'x\n'],
  ['function f { param([string]$n, [int]$k = 2) "$n$k" }; f -n x', 'x2\n'],
  ['function g { [CmdletBinding()] param([string]$x) $x }; g -x ciao', 'ciao\n'],
  ['function h { process { $_ * 2 } }; 1,2 | h', '2\n4\n'],
  ['$o = [pscustomobject]@{a=1}; Add-Member -InputObject $o -NotePropertyName B -NotePropertyValue 2; $o.B', '2\n'],
  ['1,2,3 | Tee-Object -Variable t | Out-Null; $t.Count', '3\n'],
  ['[pscustomobject]@{a=1} | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name', 'a\n'],
  ['(New-Guid).ToString().Length', '36\n'],
  ['$r = Get-Random -Minimum 5 -Maximum 8; $r -ge 5 -and $r -lt 8', 'True\n'],
  ['"a,b`n1,2" | ConvertFrom-Csv | ForEach-Object { $_.b }', '2\n'],
  ['[pscustomobject]@{a=1;b="x y"} | ConvertTo-Csv -NoTypeInformation', '"a","b"\n"1","x y"\n'],
  ['[regex]::Match("ab12","\\d+").Value', '12\n'],
  ['([regex]::Matches("a1b22","\\d+")).Count', '2\n'],
  ['[regex]::IsMatch("ABC","abc")', 'False\n'],
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
