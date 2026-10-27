import { describe, expect, it } from 'vitest';
import { GLOSSARY, LESSON_TOOLS, toolsFor } from '../src/curriculum/glossary.ts';
import { LESSONS } from '../src/curriculum/lessons/index.ts';

describe('glossario degli strumenti', () => {
  it('ogni chiave di LESSON_TOOLS ha una voce nel glossario e ogni lezione esiste', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const [id, v] of Object.entries(LESSON_TOOLS)) {
      expect(ids.has(id), `lezione ${id}`).toBe(true);
      for (const sh of ['bash', 'pwsh'] as const) for (const k of v[sh] ?? []) expect(GLOSSARY[sh][k], `${id} ${sh} ${k}`).toBeTruthy();
    }
  });
  it('ogni lezione con soluzione o riferimento ha strumenti spiegati per le shell che usa (eccetto la scoperta guidata dal man)', () => {
    const senza = LESSONS.filter((l) => !l.review).flatMap((l) => l.shells.filter((s) => !toolsFor(l.id, s).length && (l.solutions?.[s] ?? l.reference?.[s] ?? []).some((x) => /\|/.test(x))).map((s) => `${l.id}:${s}`));
    expect(senza.filter((x) => x !== 'M1.L4:bash')).toEqual([]);
  });
  it('le voci spiegano davvero: nome e testo non vuoti', () => {
    for (const sh of ['bash', 'pwsh'] as const) for (const [k, v] of Object.entries(GLOSSARY[sh])) { expect(v.name, k).toBeTruthy(); expect(v.text.length, k).toBeGreaterThan(20); }
  });
});
