import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/store.ts';
import { AI_FOOTER, aiAssist, buildAiContext, buildUserPrompt, forbiddenSolutionLines, leaksSolution, redact, SYSTEM_PROMPT, type AiConfig } from '../src/tutor/ai.ts';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson } from '../src/curriculum/engine.ts';
import { getLesson } from '../src/curriculum/lessons/index.ts';

// finto servizio Gemini
let fake: Server;
let fakeUrl = '';
let received: { headers: Record<string, unknown>; body: any }[] = [];
let nextReply: { status?: number; body: unknown } = { body: { candidates: [{ content: { parts: [{ text: 'Risposta di prova semplice.' }] } }] } };

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      received.push({ headers: req.headers, body: JSON.parse(raw || '{}') });
      res.writeHead(nextReply.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(nextReply.body));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => fake.close());

const cfg = (): AiConfig => ({ key: 'CHIAVE-DI-PROVA-123456', model: 'modello-test', baseUrl: fakeUrl, timeoutMs: 2000 });
const reply = (text: string): void => void (nextReply = { body: { candidates: [{ content: { parts: [{ text }] } }] } });

describe('redact', () => {
  it('oscura token, password, JWT e valori delle variabili segrete', () => {
    const s = createWorkspace('t');
    s.shells.bash.env.TASKFLOW_TOKEN = 'valore-segreto-lungo';
    const t = redact('Authorization: Bearer abcdef123456 e valore-segreto-lungo {"client_secret":"xyz789abc"} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib2IifQ.firma tf_lab_bob password=hunter22', s);
    expect(t).not.toMatch(/abcdef123456|valore-segreto-lungo|xyz789abc|eyJhbGci|tf_lab_bob|hunter22/);
    expect(t).toContain('[nascosto]');
  });
});

describe('contenuto inviato e filtro della soluzione', () => {
  it('il prompt non contiene righe di soluzione che lo studente non ha già visto', () => {
    const s = createWorkspace('t');
    startLesson(s, 'M2.L1');
    const l = getLesson('M2.L1')!;
    const forbidden = forbiddenSolutionLines(l, 'bash');
    const ctx = buildAiContext(s, 'bash');
    const prompt = SYSTEM_PROMPT + buildUserPrompt('hint', 'lesson', ctx, 'indizio', '');
    for (const line of forbidden) expect(prompt).not.toContain(line);
  });
  it('riconosce una risposta che ripete una riga di soluzione', () => {
    const l = getLesson('M2.L2')!;
    const f = forbiddenSolutionLines(l, 'bash');
    expect(f.length).toBeGreaterThan(0);
    expect(leaksSolution(`Prova così: ${f[0]}`, l, 'bash')).toBe(true);
    expect(leaksSolution('Pensa a quale canale porta gli errori.', l, 'bash')).toBe(false);
  });
});

describe('aiAssist', () => {
  it('indizio con AI: invia la chiave solo nell\'intestazione, conta come indizio e aggiunge l\'avviso', async () => {
    received = [];
    reply('Guarda quale comando legge un file e come si manda il risultato in un altro file.');
    const s = createWorkspace('t');
    startLesson(s, 'M2.L1');
    execute(s, 'bash', 'echo $TASKFLOW_TOKEN');
    const r = await aiAssist(s, 'bash', 'hint', 'lesson', '', cfg());
    expect(r.ai).toBe(true);
    expect(r.text).toContain(AI_FOOTER);
    expect(received).toHaveLength(1);
    expect(received[0].headers['x-goog-api-key']).toBe('CHIAVE-DI-PROVA-123456');
    expect(JSON.stringify(received[0].body)).not.toContain('CHIAVE-DI-PROVA');
    const h = s.progress['M2.L1'].help.bash!;
    expect(h.hints + h.example).toBeGreaterThan(0);
  });
  it('spiegazione semplificata della lezione: conta come spiegazione', async () => {
    reply('Un terminale è una finestra dove scrivi comandi.');
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    const r = await aiAssist(s, 'bash', 'simplify', 'lesson', '', cfg());
    expect(r.ai).toBe(true);
    expect(s.progress['M1.L1'].help.bash!.explanation).toBe(1);
  });
  it('scarta una risposta che contiene la soluzione e ricade sull\'aiuto standard', async () => {
    const l = getLesson('M2.L2')!;
    reply(`Ecco: ${forbiddenSolutionLines(l, 'bash')[0]}`);
    const s = createWorkspace('t');
    startLesson(s, 'M2.L2');
    const r = await aiAssist(s, 'bash', 'hint', 'lesson', '', cfg());
    expect(r.ai).toBe(false);
    expect(r.note).toContain('soluzione');
    expect(r.text.length).toBeGreaterThan(0);
  });
  it('se il servizio non risponde ricade sul tutor standard senza errori', async () => {
    nextReply = { status: 500, body: { error: 'x' } };
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    const r = await aiAssist(s, 'bash', 'simplify', 'lesson', '', cfg());
    expect(r.ai).toBe(false);
    expect(r.note).toContain('non disponibile');
    expect(r.text).toContain('terminale');
  });
  it('gestisce richiesta bloccata e risposta vuota', async () => {
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    nextReply = { body: { promptFeedback: { blockReason: 'SAFETY' } } };
    expect((await aiAssist(s, 'bash', 'simplify', 'lesson', '', cfg())).ai).toBe(false);
    nextReply = { body: { candidates: [] } };
    expect((await aiAssist(s, 'bash', 'simplify', 'lesson', '', cfg())).ai).toBe(false);
  });
  it('spiega l\'ultimo errore e un testo libero senza contare come aiuto', async () => {
    reply('Il file non esiste: controlla il nome.');
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    execute(s, 'bash', 'cat manca.txt');
    const e = await aiAssist(s, 'bash', 'simplify', 'error', '', cfg());
    expect(e.ai).toBe(true);
    const t = await aiAssist(s, 'bash', 'simplify', 'text', 'grep -c ERROR log', cfg());
    expect(t.ai).toBe(true);
    expect(s.progress['M1.L1'].help.bash?.explanation ?? 0).toBe(0);
  });
  it('è vietato durante un test intermedio', async () => {
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    s.moduleTest = { module: 1, items: [{ lesson: 'M1.L1', done: false }], finished: false } as never;
    const r = await aiAssist(s, 'bash', 'hint', 'lesson', '', cfg());
    expect(r.denied).toContain('test');
    expect(r.ai).toBe(false);
  });
});

describe('server', () => {
  let srv: Server;
  let base = '';
  const call = async (method: string, path: string, body?: unknown, ws = 'ai-1'): Promise<{ status: number; json: any }> => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-workspace': ws }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  beforeAll(async () => {
    srv = createApp({ store: new MemoryStore(), singleUser: false, webRoot: 'dist/web', ai: cfg() });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(() => srv.close());

  it('è disattivata finché l\'allievo non la attiva', async () => {
    const st = await call('GET', '/api/ai/status');
    expect(st.json).toMatchObject({ available: true, enabled: false });
    expect(JSON.stringify(st.json)).not.toContain('CHIAVE-DI-PROVA');
    expect((await call('POST', '/api/ai', { mode: 'hint' })).status).toBe(403);
    await call('POST', '/api/prefs', { aiEnabled: true });
    expect((await call('GET', '/api/ai/status')).json.enabled).toBe(true);
  });
  it('risponde, registra la conversazione e limita le richieste', async () => {
    reply('Spiegazione semplice.');
    await call('POST', '/api/lessons/M1.L1/start', {});
    const r = await call('POST', '/api/ai', { mode: 'simplify', target: 'lesson' });
    expect(r.status).toBe(200);
    expect(r.json.reply.ai).toBe(true);
    expect(r.json.chat.at(-1).text).toContain('Spiegazione semplice.');
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/ai', { mode: 'simplify', target: 'lesson' })).status;
    expect(last).toBe(429);
  });
  it('senza chiave sul server l\'AI non è disponibile', async () => {
    const s2 = createApp({ store: new MemoryStore(), singleUser: false, webRoot: 'dist/web' });
    await new Promise<void>((r) => s2.listen(0, '127.0.0.1', r));
    const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
    const st = await (await fetch(b2 + '/api/ai/status', { headers: { 'x-workspace': 'x1' } })).json();
    expect(st.available).toBe(false);
    const p = await fetch(b2 + '/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace': 'x1' }, body: '{}' });
    expect(p.status).toBe(503);
    s2.close();
  });
});

describe('errori di Gemini', () => {
  it('la nota riporta lo status, il messaggio di Google e il suggerimento sul modello, senza la chiave', async () => {
    nextReply = { status: 404, body: { error: { message: 'models/gemini-vecchio is not found for API version v1beta' } } };
    const s = createWorkspace('t');
    startLesson(s, 'M1.L1');
    const r = await aiAssist(s, 'bash', 'simplify', 'lesson', '', { ...cfg(), model: 'gemini-vecchio' });
    expect(r.ai).toBe(false);
    expect(r.note).toContain('404');
    expect(r.note).toContain('is not found');
    expect(r.note).toContain('LAB_GEMINI_MODEL');
    expect(r.note).not.toContain('CHIAVE-DI-PROVA');
  });
});
