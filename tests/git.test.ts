import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson } from '../src/curriculum/engine.ts';

const out = (s: ReturnType<typeof createWorkspace>, sh: 'bash' | 'pwsh', l: string): { t: string; exit: number } => {
  const r = execute(s, sh, l);
  return { t: r.out.map((o) => o.t).join(''), exit: r.exit };
};

describe('Git in sola lettura', () => {
  const s = createWorkspace('git');
  startLesson(s, 'M9.L4');
  out(s, 'bash', 'cd ~/corso-cli/m9l4/progetto');

  it('log, show, diff e blame', () => {
    expect(out(s, 'bash', 'git log --oneline').t.trim().split('\n')).toHaveLength(5);
    expect(out(s, 'bash', 'git log --oneline -- docs/api.md').t.trim()).toMatch(/^942277e /);
    expect(out(s, 'bash', 'git log --author=carla --oneline').t).toMatch(/webhook Polar/);
    expect(out(s, 'bash', 'git show 053b271').t).toMatch(/\+  return NextResponse.json\({ items: notes/);
    expect(out(s, 'bash', 'git diff HEAD~3 HEAD~2 -- app/api/notes/route.ts').t).toMatch(/-  return NextResponse.json\({ data: notes }\)/);
    const bl = out(s, 'bash', 'git blame -L 10,10 app/api/notes/route.ts').t;
    expect(bl).toMatch(/^053b271 \(Alice Rossi 2026-09-02 10\)/);
  });
  it('status segue la copia di lavoro', () => {
    expect(out(s, 'bash', 'git status').t).toMatch(/working tree clean/);
    out(s, 'bash', 'echo // nota >> README.md');
    expect(out(s, 'bash', 'git status').t).toMatch(/modified:   README\.md/);
    expect(out(s, 'bash', 'git diff').t).toMatch(/\+\/\/ nota/);
  });
  it('i comandi che scrivono danno un errore esplicito e nulla cambia', () => {
    for (const c of ['commit -am x', 'push', 'checkout main', 'add .', 'reset --hard']) {
      const r = out(s, 'bash', `git ${c}`);
      expect(r.exit, c).toBe(1);
      expect(r.t, c).toMatch(/sola lettura/);
    }
    expect(out(s, 'bash', 'git log --graph').exit).toBe(129);
  });
  it('fuori da un repository e revisioni sconosciute', () => {
    expect(out(s, 'bash', 'cd ~ && git log').exit).toBe(128);
    out(s, 'bash', 'cd ~/corso-cli/m9l4/progetto');
    expect(out(s, 'bash', 'git show zzzz').exit).toBe(128);
  });
  it('funziona anche in PowerShell', () => {
    const p = createWorkspace('git2');
    startLesson(p, 'M9.L4');
    expect(out(p, 'pwsh', 'cd ~/corso-cli/m9l4/progetto; git log --oneline -n 2').t.trim().split('\n')).toHaveLength(2);
  });
});

describe('ricerca nel codice', () => {
  it('find con -not -path / ! -name', () => {
    const s = createWorkspace('f');
    out(s, 'bash', 'mkdir -p d/a; echo hello > d/a/x.ts; echo hi > d/y.ts');
    expect(out(s, 'bash', 'find d -type f -not -path "*/a/*"').t.trim()).toBe('d/y.ts');
    expect(out(s, 'bash', 'find d -type f ! -name y.ts').t.trim()).toBe('d/a/x.ts');
  });
  it('Select-String legge i file passati dalla pipeline', () => {
    const s = createWorkspace('f2');
    out(s, 'pwsh', 'mkdir d | Out-Null; Set-Content d/x.ts "hello`nworld"');
    expect(out(s, 'pwsh', 'Get-ChildItem d -Filter *.ts | Select-String -Pattern wor').t).toMatch(/x\.ts:2:world/);
  });
});
