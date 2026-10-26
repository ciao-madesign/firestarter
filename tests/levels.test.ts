import { describe, expect, it } from 'vitest';
import { seedProgress, type ModuleTest, type TestItem } from '../src/course/progress.ts';
import { applyTestToLevel, describeLevel, moduleLevel, promoteToLevel4, reviewDue, TRANSFER_LESSONS } from '../src/course/levels.ts';

const test = (outcomes: TestItem['outcome'][], date = '2026-10-01'): ModuleTest => ({ date, items: outcomes.map((o, i) => ({ n: i + 1, title: 't', outcome: o, issue: '' })) });
const clean = test(['passed', 'passed', 'passed', 'passed']);

describe('livelli con evidenze per modulo', () => {
  it('livello di modulo dal test', () => {
    expect(moduleLevel(clean)).toBe(3);
    expect(moduleLevel(test(['passed', 'passed', 'passed_partial', 'retry']))).toBe(2);
    expect(moduleLevel(test(['passed', 'failed', 'failed', 'passed']))).toBe(1);
  });

  it('il livello 3 è provvisorio finché mancano prove, poi stabile', () => {
    const c = seedProgress();
    c.level = 1;
    c.tests = { M1: test(['passed', 'passed', 'passed_partial', 'retry']), M3: clean };
    expect(applyTestToLevel(c, 3, undefined)).toMatch(/Livello portato a 3/);
    expect(describeLevel(c)).toMatch(/provvisorio.*M1.*M2/);
    for (const m of [1, 2, 4, 5, 6]) c.tests[`M${m}`] = clean;
    expect(describeLevel(c)).toMatch(/stabile/);
  });

  it('il livello 4 richiede livello 3 stabile e prove di trasferimento in autonomia', () => {
    const c = seedProgress();
    c.level = 3;
    for (const m of [1, 2, 3, 4, 5, 6]) c.tests[`M${m}`] = clean;
    expect(promoteToLevel4(c)).toBe('');
    for (const id of TRANSFER_LESSONS) c.lessons[id] = { status: 'completed', acquired: [], errors: [], mode: 'hinted' };
    expect(promoteToLevel4(c)).toBe('');
    for (const id of TRANSFER_LESSONS) c.lessons[id].mode = 'autonomous';
    expect(promoteToLevel4(c)).toMatch(/Livello portato a 4/);
    expect(c.level).toBe(4);
  });

  it('un ripasso peggiore abbassa il livello', () => {
    const c = seedProgress();
    c.level = 3;
    const prev = clean;
    c.tests = { M3: test(['passed', 'failed', 'failed', 'retry']) };
    expect(applyTestToLevel(c, 3, prev)).toMatch(/abbassato a 2/);
    expect(c.level).toBe(2);
  });

  it('segnala i ripassi a distanza', () => {
    const c = seedProgress();
    c.tests = { M1: test(['passed', 'passed', 'passed', 'passed'], '2026-09-01'), M2: test(['passed', 'passed', 'passed', 'passed'], '2026-10-20') };
    expect(reviewDue(c, '2026-10-26')).toEqual([1]);
  });
});
