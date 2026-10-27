import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';

const run = (s: ReturnType<typeof createWorkspace>, line: string): string => execute(s, 'bash', line, { silent: true }).out.map((o) => o.t).join('');

describe('opzioni della shell Bash: restano tra un comando e l\'altro', () => {
  it('set -o pipefail vale anche sulle righe successive e set +o pipefail lo toglie', () => {
    const s = createWorkspace('opts');
    run(s, 'set -o pipefail');
    expect(run(s, 'false | true; echo $?')).toBe('1\n');
    run(s, 'set +o pipefail');
    expect(run(s, 'false | true; echo $?')).toBe('0\n');
  });

  it('set -a esporta le variabili assegnate (. file.env)', () => {
    const s = createWorkspace('opts2');
    run(s, "printf 'A=uno\\nB=due\\n' > /tmp/x.env");
    run(s, 'set -a; . /tmp/x.env; set +a');
    expect(run(s, 'env | grep -c "^A=uno"')).toBe('1\n');
    expect(run(s, 'bash -c \'echo "figlio: $B"\'')).toBe('figlio: due\n');
    run(s, 'C=tre');
    expect(run(s, 'bash -c \'echo "[$C]"\'')).toBe('[]\n');
  });

  it('uno script figlio non eredita le opzioni della finestra', () => {
    const s = createWorkspace('opts3');
    run(s, 'set -o pipefail');
    run(s, "printf 'false | true; echo figlio=$?\\n' > /tmp/f.sh");
    expect(run(s, 'bash /tmp/f.sh')).toBe('figlio=0\n');
    expect(run(s, 'false | true; echo finestra=$?')).toBe('finestra=1\n');
  });
});
