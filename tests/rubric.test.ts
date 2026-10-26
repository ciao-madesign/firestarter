import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/engine/index.ts';
import { lintDocument } from '../src/docs/lint.ts';
import { REFERENCE_EXAMPLE, parseEditorial, rubricText } from '../src/docs/rubric.ts';
import { applyRegistro, buildRegistro, parseRegistro, seedProgress } from '../src/course/progress.ts';
import { buildBrief } from '../src/tutor/brief.ts';

describe('valutazione redazionale', () => {
  it('legge la riga della griglia e rifiuta punteggi fuori scala o incompleti', () => {
    expect(parseEditorial('chiarezza 3/4; struttura 2/4; pubblico 3/4; completezza 4/4')).toEqual({ chiarezza: 3, struttura: 2, pubblico: 3, completezza: 4 });
    expect(parseEditorial('chiarezza: 3; struttura: 2; pubblico: 1; completezza: 4')).not.toBeNull();
    expect(parseEditorial('chiarezza 5/4; struttura 2/4; pubblico 3/4; completezza 4/4')).toBeNull();
    expect(parseEditorial('chiarezza 3/4; struttura 2/4')).toBeNull();
  });

  it('il documento di riferimento supera il controllo automatico', () => {
    const s = createWorkspace('rb');
    const r = lintDocument(s, REFERENCE_EXAMPLE);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.stats.examplesRun).toBeGreaterThan(0);
    expect(r.stats.examplesOk).toBe(r.stats.examplesRun);
  });

  it('il riepilogo per i documenti contiene griglia ed esempio di riferimento', () => {
    const s = createWorkspace('rb');
    const t = buildBrief(s, 'bash', 'doc', { doc: '# Prova', docPath: 'prova.md' });
    expect(t).toContain(rubricText().split('\n')[0]);
    expect(t).toMatch(/Valutazione redazionale: chiarezza N\/4/);
    expect(t).toContain('Esempio di riferimento');
  });

  it('il REGISTRO registra la valutazione e la riscrive', () => {
    const p = seedProgress();
    const reg = parseRegistro('REGISTRO — 2026-10-26\nLezione completata: M1.L4\nValutazione redazionale: chiarezza 3/4; struttura 2/4; pubblico 3/4; completezza 4/4\nProssima lezione: M2.L1');
    expect(reg.editorial?.struttura).toBe(2);
    const { progress, changes } = applyRegistro(p, reg);
    expect(changes.join(' ')).toMatch(/Valutazione redazionale registrata/);
    expect(progress.editorial?.[0].scores.completezza).toBe(4);
    expect(buildRegistro(progress, {}, '2026-10-26', 'lab')).toMatch(/Valutazione redazionale: chiarezza 3\/4; struttura 2\/4/);
  });
});
