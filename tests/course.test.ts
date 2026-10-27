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
