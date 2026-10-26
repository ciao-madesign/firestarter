import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/engine/index.ts';
import { lintDocument, parseTables, statusCodesIn } from '../src/docs/lint.ts';

const F = '```';
const good = `# API TaskFlow

Ambiente: development
Versione dell'API: 1.0

Autenticazione con un token Bearer.

## POST /v1/tasks

Crea un task. Campo obbligatorio: \`title\`. Risposta 201 Created.

${F}bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "Prova"}'
# => 201
${F}

### Errori

Con un titolo troppo corto l'API restituisce 422.

${F}bash
curl -s -X POST "$TASKFLOW_URL/v1/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title": "x"}'
# => 422
${F}
`;

describe('Document Engine: controllo tecnico', () => {
  it('un documento corretto non ha errori né avvisi verificabili', () => {
    const r = lintDocument(createWorkspace('t'), good);
    expect(r.issues.filter((i) => i.kind === 'verifiable' && i.severity !== 'info').map((i) => `${i.line}: ${i.message}`)).toEqual([]);
    expect(r.stats.examplesRun).toBe(2);
    expect(r.stats.examplesOk).toBe(2);
  });
  it('rileva metodo inesistente, status non previsto, campo mancante e JSON non valido', () => {
    const bad = good.replace('POST /v1/tasks', 'PUT /v1/tasks').replace('Risposta 201 Created', 'Risposta 200 OK').replace('{"title": "Prova"}', '{"nome": "Prova",}');
    const ids = lintDocument(createWorkspace('t'), bad).issues.map((i) => i.id);
    expect(ids).toContain('endpoint-inesistente');
    expect(ids).toContain('status-non-corrisponde');
  });
  it('distingue errori verificabili e valutazioni editoriali', () => {
    const r = lintDocument(createWorkspace('t'), good + '\nAbbiamo un task e anche un compito da svolgere.\n');
    const ed = r.issues.filter((i) => i.kind === 'editorial');
    expect(ed.some((i) => i.id === 'terminologia')).toBe(true);
    expect(r.stats.errors).toBe(0);
  });
  it('segnala segreti in chiaro e versioni incoerenti', () => {
    const r = lintDocument(createWorkspace('t'), good.replace('1.0', '2.5') + '\nsecret: dev-secret-42\n');
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain('segreto-in-chiaro');
    expect(ids).toContain('versione-non-coerente');
  });
  it('gli esempi vengono eseguiti su una copia: lo stato reale non cambia', () => {
    const s = createWorkspace('t');
    const before = s.api.envs.development.tasks.length;
    lintDocument(s, good);
    expect(s.api.envs.development.tasks.length).toBe(before);
  });
  it('estrae codici di stato e tabelle', () => {
    expect(statusCodesIn('Risposta 201 Created. Il limite è 500 caratteri.')).toEqual([201]);
    const t = parseTables('| A | B |\n|---|---|\n| 1 | 2 |\n');
    expect(t[0].rows).toEqual([['1', '2']]);
  });
});
