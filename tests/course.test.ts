import { describe, expect, it } from 'vitest';
import { applyRegistro, buildRegistro, lessonIndex, parseRegistro, RegistroError, seedProgress } from '../src/course/progress.ts';
import { generateTest, recordTestProgress } from '../src/course/moduletest.ts';
import { createWorkspace } from '../src/engine/index.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import { skillScores, startLesson, useHelp, verifyLesson } from '../src/curriculum/engine.ts';

const REG = `REGISTRO — 26/10/2026
Ambiente: macOS, Bash
Lezione completata: M2.L1 — Pipe e redirezione dell'output
Livello attuale: 2
Acquisito: pipe |; redirezione > e >>; rischio di sovrascrittura
Da consolidare: maiuscole nei percorsi; previsioni coerenti
Prossima lezione: M2.L3 — Filtri: grep, sort, uniq`;

describe('REGISTRO', () => {
  it('analizza il formato del brief', () => {
    const r = parseRegistro(REG);
    expect(r.date).toBe('2026-10-26');
    expect(r.completed?.id).toBe('M2.L1');
    expect(r.level).toBe(2);
    expect(r.acquired).toHaveLength(3);
    expect(r.next?.id).toBe('M2.L3');
  });
  it('lo applica allo stato senza abbassare livello o avanzamento', () => {
    const p = seedProgress();
    const { progress, changes } = applyRegistro(p, parseRegistro(REG));
    expect(progress.lessons['M2.L1'].status).toBe('completed');
    expect(progress.next.lesson).toBe('M2.L3');
    expect(changes.join(' ')).toContain('M2.L1');
    // un REGISTRO più vecchio non fa tornare indietro
    const old = parseRegistro(REG.replace('M2.L1', 'M1.L4').replace('M2.L3', 'M2.L1').replace('Livello attuale: 2', 'Livello attuale: 1'));
    const again = applyRegistro(progress, old).progress;
    expect(again.next.lesson).toBe('M2.L3');
    expect(again.level).toBe(2);
  });
  it('rifiuta testo senza REGISTRO', () => {
    expect(() => parseRegistro('ciao')).toThrow(RegistroError);
  });
  it('genera un REGISTRO rileggibile (round trip)', () => {
    const { progress } = applyRegistro(seedProgress(), parseRegistro(REG));
    const titles = Object.fromEntries(LESSONS.map((l) => [l.id, l.title]));
    const text = buildRegistro(progress, titles, '2026-10-26', 'macOS, Bash');
    const r = parseRegistro(text);
    expect(r.completed?.id).toBe('M2.L1');
    expect(r.next?.id).toBe('M2.L3');
  });
  it('lo stato iniziale riflette il brief', () => {
    const p = seedProgress();
    expect(p.level).toBe(2);
    expect(p.next.lesson).toBe('M2.L1');
    expect(p.recurringErrors).toHaveLength(4);
    expect(Object.keys(p.lessons)).toEqual(['M1.L1', 'M1.L2', 'M1.L3', 'M1.L4']);
    expect(lessonIndex('M3.L2')).toBe(302);
  });
});

describe('Curriculum', () => {
  it('copre M1-M6 del brief più l\'estensione M7, con id univoci', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of [1, 2, 3, 4, 5, 6, 7]) expect(LESSONS.some((l) => l.module === m)).toBe(true);
  });
  it('ogni lezione non autonoma ha soluzioni per le shell supportate', () => {
    for (const l of LESSONS) {
      if (l.autonomous) {
        expect(l.solutions).toBeUndefined();
        expect(l.reference).toBeDefined();
      } else for (const sh of l.shells) expect(l.solutions?.[sh]?.length, `${l.id} ${sh}`).toBeGreaterThan(0);
    }
  });
});

describe('Valutazione e aiuti', () => {
  it('una soluzione mostrata pesa meno di un esercizio svolto in autonomia', () => {
    const s = createWorkspace('t');
    const l = LESSONS.find((x) => x.id === 'M2.L1')!;
    startLesson(s, l.id);
    useHelp(s, l.id, 'bash', 'hint');
    useHelp(s, l.id, 'bash', 'hint');
    useHelp(s, l.id, 'bash', 'hint');
    expect(useHelp(s, l.id, 'bash', 'solution').text).toContain('grep ERROR');
    for (const c of l.solutions!.bash!) { void c; }
    s.progress[l.id].completions.bash = { at: 1, mode: 'solution', hints: 3 };
    const scores = skillScores(s).find((x) => x.skill === 'comandi')!;
    expect(scores.score).toBe(20);
    expect(scores.solution).toBe(1);
  });
  it('le verifiche autonome non mostrano la soluzione', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M6.L6');
    expect(useHelp(s, 'M6.L6', 'bash', 'solution').denied).toContain('autonoma');
  });
  it('la soluzione non è disponibile prima dei suggerimenti', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M2.L1');
    expect(useHelp(s, 'M2.L1', 'bash', 'solution').denied).toBeTruthy();
  });
  it('gli aiuti seguono l\'ordine: esempio, suggerimento, soluzione', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M2.L1');
    expect(useHelp(s, 'M2.L1', 'bash', 'hint').kind).toBe('example');
    expect(useHelp(s, 'M2.L1', 'bash', 'hint').kind).toBe('hint');
  });
  it('la verifica fallita incrementa gli errori ricorrenti', () => {
    const s = createWorkspace('t');
    const course = seedProgress();
    startLesson(s, 'M1.L2');
    const before = course.recurringErrors.find((e) => e.id === 'percorsi-maiuscole')!.count;
    verifyLesson(s, 'M1.L2', 'bash', course);
    expect(course.recurringErrors.find((e) => e.id === 'percorsi-maiuscole')!.count).toBeGreaterThan(before);
  });
});

describe('Test intermedio', () => {
  it('sceglie 4 esercizi dando peso agli errori ricorrenti', () => {
    const course = seedProgress();
    const t = generateTest(course, 2, 0);
    expect(t.items).toHaveLength(4);
    expect(t.items.some((i) => i.lesson.startsWith('M2'))).toBe(true);
    expect(t.items.some((i) => i.reason.includes('errore ricorrente'))).toBe(true);
  });
  it('registra gli esiti e conclude il test', () => {
    const s = createWorkspace('t');
    const course = seedProgress();
    s.moduleTest = generateTest(course, 2, 0);
    const ids = s.moduleTest.items.map((i) => i.lesson);
    let fin = { finished: false } as { finished: boolean; summary?: string };
    for (const id of ids) fin = recordTestProgress(s, course, { exerciseId: id, shell: 'bash', at: 1, pass: true, checks: [] }, false);
    expect(fin.finished).toBe(true);
    expect(course.tests.M2.items).toHaveLength(4);
  });
});

describe('test intermedio: le lezioni riproposte ripartono da zero', () => {
  it('la prima apertura di un esercizio del test ripristina ambiente e cartella; le successive no', async () => {
    const { createWorkspace, execute } = await import('../src/engine/index.ts');
    const { startLesson } = await import('../src/curriculum/engine.ts');
    const s = createWorkspace('test-fresh');
    startLesson(s, 'M2.L1');
    execute(s, 'bash', 'echo residuo > ~/corso-cli/m2l1/residuo.txt');
    expect(s.fs['/home/learner/corso-cli/m2l1/residuo.txt']).toBeDefined();
    s.moduleTest = { module: 2, startedAt: s.clock, items: [{ lesson: 'M2.L1', reason: 'prova', fails: 0, done: false }] };
    startLesson(s, 'M2.L1');
    expect(s.fs['/home/learner/corso-cli/m2l1/residuo.txt']).toBeUndefined();
    execute(s, 'bash', 'echo nuovo > ~/corso-cli/m2l1/nuovo.txt');
    startLesson(s, 'M2.L1');
    expect(s.fs['/home/learner/corso-cli/m2l1/nuovo.txt']).toBeDefined();
  });
});

describe('file creato nella cartella sbagliata', () => {
  it('la verifica lo segnala e registra l\'errore ricorrente «prompt non letto»', async () => {
    const { createWorkspace, execute } = await import('../src/engine/index.ts');
    const { startLesson, verifyLesson } = await import('../src/curriculum/engine.ts');
    const s = createWorkspace('misplaced');
    const course = seedProgress();
    startLesson(s, 'M2.L1');
    // scrive nella home invece che nella cartella della lezione
    execute(s, 'bash', 'cd ~; grep ERROR corso-cli/m2l1/server.log > errori.txt');
    const v = verifyLesson(s, 'M2.L1', 'bash', course);
    expect(v.pass).toBe(false);
    const c = v.checks.find((x) => x.id === 'errori')!;
    expect(c.misplaced).toBe(true);
    expect(c.explanation).toContain('~/errori.txt');
    expect(c.explanation).toContain('corso-cli/m2l1');
    expect(course.recurringErrors.some((e) => e.id === 'prompt-non-letto')).toBe(true);
  });
});

describe('Riapertura di una lezione già iniziata', () => {
  it('ritrova le variabili TASKFLOW_* e l\'ambiente lasciati, non quelli dell\'ultima lezione aperta', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M4.L2');
    s.shells.bash.env.TASKFLOW_TOKEN = 'token-della-lezione';
    const envPrima = s.activeEnv;
    const urlPrima = s.shells.bash.env.TASKFLOW_URL;
    startLesson(s, 'M5.L7'); // imposta l'ambiente testing e altre variabili
    expect(s.shells.bash.env.TASKFLOW_TOKEN).not.toBe('token-della-lezione');
    startLesson(s, 'M4.L2');
    expect(s.shells.bash.env.TASKFLOW_TOKEN).toBe('token-della-lezione');
    expect(s.shells.bash.env.TASKFLOW_URL).toBe(urlPrima);
    expect(s.activeEnv).toBe(envPrima);
  });
});

describe('Lezione già iniziata con file di preparazione mancanti', () => {
  it('riaprendola ritrova i file mancanti senza toccare quelli dello studente', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M2.L2');
    const dir = '/home/learner/corso-cli/m2l2';
    expect(s.fs[`${dir}/dati.txt`]).toBeTruthy();
    delete s.fs[`${dir}/dati.txt`]; // come una lezione iniziata con la numerazione precedente
    s.fs[`${dir}/mio.txt`] = { ...s.fs[`${dir}/.`] } as never;
    const attempts = s.progress['M2.L2'].attempts;
    startLesson(s, 'M2.L2');
    expect(s.fs[`${dir}/dati.txt`]).toBeTruthy();
    expect(s.fs[`${dir}/mio.txt`]).toBeTruthy();
    expect(s.progress['M2.L2'].attempts).toBe(attempts);
  });
});

describe('File creato con l\'editor dei documenti', () => {
  it('la verifica segnala che sta in ~/docs e come rimediare', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M2.L2');
    s.fs['/home/learner/docs/canali.md'] = { ...(s.fs['/home/learner/corso-cli/m2l2/dati.txt'] as object) } as never;
    const r = verifyLesson(s, 'M2.L2', 'bash');
    const c = r.checks.find((x) => x.id === 'documento')!;
    expect(c.pass).toBe(false);
    expect(c.explanation).toContain('~/docs');
    expect(c.explanation).toContain('dal terminale');
  });
});
