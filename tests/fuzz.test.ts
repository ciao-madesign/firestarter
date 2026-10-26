import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import type { ShellId } from '../src/engine/types.ts';

/** Fuzzing riproducibile: righe casuali (valide e non) non devono mai causare errori interni (exit 70), eccezioni o blocchi. */
const BASH = ['echo', 'ls', 'cat', 'grep', 'sort', 'uniq', 'cut', 'head', 'tail', 'wc', 'jq', 'cd', 'for', 'while', 'if', 'then', 'fi', 'do', 'done', '[[', ']]', '[', ']', '|', '||', '&&', ';', '>', '>>', '<', '<(', '2>&1', '$(', ')', '(', '{', '}', '"', "'", '`', '$', '${', '$((', '))', '\\', '*', '?', 'a', 'b', '-n', '--', '~', '/', '=', 'x=1', 'f()', 'return', 'exit', '<<', 'EOF', '!', '&', '#', '\n', '$?', '$@', '$1', 'sed', 'awk', "'{print $1}'", "'BEGIN{x=1}'", 'tr', 'xargs', 'export', 'read', 'case', 'esac', 'in', ';;', 'declare', '-A', 'arr=(', 'diff', 'tac', 'paste', 'expr', 'trap', 'set', '-e'];
const PWSH = ['Get-ChildItem', 'Write-Output', 'ForEach-Object', 'Where-Object', 'Select-Object', '|', '{', '}', '(', ')', '[', ']', '@{', '@(', '$_', '$x', '=', '+=', '"', "'", '`', '$(', '-eq', '-gt', '-and', '-join', '-split', 'if', 'else', 'foreach', 'in', 'while', 'for', 'function', 'param', 'try', 'catch', 'throw', 'return', ';', ',', '..', '::', '.', '[int]', '1', '"a"', '@"', '"@', '$null', 'switch', 'default', '-Regex', 'process', 'begin', 'end', '[regex]', 'Add-Member', 'Get-Member', 'Tee-Object', 'ConvertTo-Csv', 'ConvertFrom-Csv', 'Get-Random', 'New-Guid', '[CmdletBinding()]', '#', '<#', '#>', '\n'];

describe('Fuzzing: nessun errore interno', () => {
  for (const shell of ['bash', 'pwsh'] as ShellId[]) {
    it(`${shell}: 1500 righe casuali`, () => {
      let seed = shell === 'bash' ? 4242 : 2424;
      const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const vocab = shell === 'bash' ? BASH : PWSH;
      const ws = createWorkspace('fz');
      const bad: string[] = [];
      for (let i = 0; i < 1500; i++) {
        const len = 1 + Math.floor(rnd() * 9);
        const line = Array.from({ length: len }, () => vocab[Math.floor(rnd() * vocab.length)]).join(rnd() < 0.7 ? ' ' : '');
        const t0 = Date.now();
        try {
          const r = execute(ws, shell, line);
          if (r.exit === 70) bad.push(`INTERNO ${JSON.stringify(line)}: ${r.out.map((o) => o.t).join('').split('\n')[0].slice(0, 100)}`);
        } catch (e) {
          bad.push(`ECCEZIONE ${JSON.stringify(line)}: ${(e as Error).message.slice(0, 80)}`);
        }
        if (Date.now() - t0 > 1500) bad.push(`LENTO ${JSON.stringify(line)}`);
      }
      expect(bad).toEqual([]);
      expect(() => JSON.stringify(ws)).not.toThrow();
    }, 60000);
  }
});
