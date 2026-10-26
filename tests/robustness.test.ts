import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { CATALOG } from '../src/engine/catalog.ts';
import { lintDocument } from '../src/docs/lint.ts';
import { startLesson } from '../src/curriculum/engine.ts';

const run = (shell: 'bash' | 'pwsh', line: string) => {
  const s = createWorkspace('r');
  const r = execute(s, shell, line);
  return { exit: r.exit, out: r.out.map((o) => o.t).join('') };
};

describe('input malformato: nessun ciclo infinito né errore interno', () => {
  for (const line of ['[[&', '[[ done 2>&1', '[[ ; ]]', '[[ a | b ]]', 'echo in$[[echo---s]]x', 'echo [z-a]', 'ls [[]', 'case', 'for', 'f() {', '$(((', '"${']) {
    it(`bash: ${line}`, () => {
      const r = run('bash', line);
      expect(r.exit).not.toBe(70);
    });
  }
  for (const line of ['@( [ ] -split for Write-Output', '[', '[[', '@{', '{', '(', '"$(', "@'", 'function f {']) {
    it(`pwsh: ${line}`, () => {
      const r = run('pwsh', line);
      expect(r.exit).not.toBe(70);
    });
  }
  it('[[ con operatori < e > resta valido', () => {
    expect(run('bash', '[[ a < b ]] && echo lt').out).toBe('lt\n');
  });
});

describe('--help', () => {
  const skip = new Set(['[[', 'false', '[', 'man', 'echo', 'true', 'test', 'printf', ':', 'help']);
  for (const d of CATALOG.filter((x) => x.shells.includes('bash') && !skip.has(x.name))) {
    it(`bash: ${d.name} --help`, () => {
      const r = run('bash', `${d.name} --help`);
      expect(r.exit, r.out).toBe(0);
      expect(r.out).toContain('SINTASSI');
    });
  }
});

describe('controllo documentale indipendente dalle variabili dello studente', () => {
  it('una variabile TOKEN o una funzione dello studente non oscurano le credenziali del controllo', () => {
    const s = createWorkspace('l');
    startLesson(s, 'M6.L3');
    execute(s, 'bash', 'TOKEN=sbagliato');
    execute(s, 'bash', 'curl() { echo falso; }');
    const md = '# Guida\n\nAmbiente: development\n\n## GET /v1/tasks\n\nElenco. Restituisce 200.\n\n```bash\ncurl -s "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN"\n# => 200\n```\n\n### Errori\n\n```bash\ncurl -s "$TASKFLOW_URL/v1/tasks"\n# => 401\n```\n';
    const r = lintDocument(s, md);
    expect(r.examples.map((e) => e.status)).toEqual([200, 401]);
  });

  it('awk con programma malformato dà un errore esplicito, mai un errore interno', () => {
    for (const prog of ['function if while . {', '{', '{ print $', 'BEGIN { x = }', '/abc', '{ print "a }', 'BEGIN { for (;;', '{ a[ }']) {
      const r = execute(createWorkspace('aw'), 'bash', `awk '${prog}' /dev/null`);
      expect(r.exit, prog).toBe(2);
      expect(r.out.map((o) => o.t).join(''), prog).toMatch(/^awk: /);
    }
  });
});
