import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/engine/index.ts';
import { CREDENTIALS, expiredToken, sendRequest, type HttpRequest } from '../src/engine/api/server.ts';
import type { WorkspaceState } from '../src/engine/types.ts';

const URL = 'http://localhost:8080';
function call(s: WorkspaceState, method: string, path: string, opts: { body?: unknown; token?: string; ct?: string; base?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const body = opts.body === undefined ? null : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  if (body !== null) headers['content-type'] = opts.ct ?? 'application/json';
  const req: HttpRequest = { method, url: (opts.base ?? URL) + path, headers, body, client: 'test', shell: null };
  const r = sendRequest(s, req);
  if (!r.ok) throw new Error('rete: ' + r.kind);
  return { status: r.res.status, json: r.res.body ? JSON.parse(r.res.body) : null, headers: r.res.headers };
}
function token(s: WorkspaceState): string {
  const c = CREDENTIALS.development;
  return call(s, 'POST', '/v1/auth/token', { body: { client_id: c.id, client_secret: c.secret } }).json.access_token;
}

describe('API simulata TaskFlow', () => {
  it('autenticazione: assente, schema errato, scaduto, valido', () => {
    const s = createWorkspace('t');
    expect(call(s, 'GET', '/v1/tasks').json.error).toBe('unauthorized');
    expect(call(s, 'GET', '/v1/tasks', { token: 'x' }).status).toBe(401);
    expect(call(s, 'GET', '/v1/tasks', { token: expiredToken('development') }).json.error).toBe('token_expired');
    expect(call(s, 'GET', '/v1/tasks', { token: token(s) }).status).toBe(200);
  });
  it('credenziali sbagliate e campi mancanti', () => {
    const s = createWorkspace('t');
    expect(call(s, 'POST', '/v1/auth/token', { body: { client_id: 'a', client_secret: 'b' } }).json.error).toBe('invalid_client');
    expect(call(s, 'POST', '/v1/auth/token', { body: {} }).status).toBe(422);
  });
  it('CRUD completo con persistenza dello stato', () => {
    const s = createWorkspace('t');
    const t = token(s);
    const c = call(s, 'POST', '/v1/tasks', { token: t, body: { title: 'Nuovo task' } });
    expect(c.status).toBe(201);
    expect(c.headers.Location).toBe('/v1/tasks/6');
    expect(call(s, 'GET', '/v1/tasks/6', { token: t }).json.title).toBe('Nuovo task');
    expect(call(s, 'PATCH', '/v1/tasks/6', { token: t, body: { status: 'done' } }).json.status).toBe('done');
    expect(call(s, 'PATCH', '/v1/tasks/6', { token: t, body: { status: 'open' } }).json.error).toBe('invalid_transition');
    expect(call(s, 'DELETE', '/v1/tasks/6', { token: t }).status).toBe(204);
    expect(call(s, 'DELETE', '/v1/tasks/6', { token: t }).status).toBe(404);
  });
  it('validazione, JSON non valido, Content-Type errato', () => {
    const s = createWorkspace('t');
    const t = token(s);
    const v = call(s, 'POST', '/v1/tasks', { token: t, body: { title: 'ab', priority: 9 } });
    expect(v.status).toBe(422);
    expect(v.json.errors.map((e: { field: string }) => e.field).sort()).toEqual(['priority', 'title']);
    expect(call(s, 'POST', '/v1/tasks', { token: t, body: '{"title": }' }).json.error).toBe('invalid_json');
    expect(call(s, 'POST', '/v1/tasks', { token: t, body: { title: 'ok ok' }, ct: 'application/x-www-form-urlencoded' }).status).toBe(415);
  });
  it('paginazione e filtri', () => {
    const s = createWorkspace('t');
    const t = token(s);
    const r = call(s, 'GET', '/v1/tasks?limit=2&offset=2', { token: t }).json;
    expect(r.data.map((x: { id: number }) => x.id)).toEqual([3, 4]);
    expect(r.total).toBe(5);
    expect(call(s, 'GET', '/v1/tasks?status=done', { token: t }).json.total).toBe(1);
  });
  it('403, 404, 405 e rate limit', () => {
    const s = createWorkspace('t');
    const t = token(s);
    expect(call(s, 'GET', '/v1/admin/users', { token: t }).status).toBe(403);
    expect(call(s, 'GET', '/v1/nope').json.error).toBe('route_not_found');
    const m = call(s, 'POST', '/v1/health');
    expect(m.status).toBe(405);
    expect(m.headers.Allow).toBe('GET');
    for (let i = 0; i < 5; i++) expect(call(s, 'GET', '/v1/search?q=a', { token: t }).status).toBe(200);
    const limited = call(s, 'GET', '/v1/search?q=a', { token: t });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['Retry-After'])).toBeGreaterThan(0);
  });
  it('flaky: ogni terza chiamata fallisce con 500, in modo deterministico', () => {
    const s = createWorkspace('t');
    const st = [1, 2, 3, 4, 5, 6].map(() => call(s, 'GET', '/v1/flaky').status);
    expect(st).toEqual([200, 200, 500, 200, 200, 500]);
  });
  it('staging usa la versione 1.1 con la chiave items', () => {
    const s = createWorkspace('t');
    const c = CREDENTIALS.staging;
    const base = 'https://staging.api.taskflow.test';
    const tk = call(s, 'POST', '/v1/auth/token', { base, body: { client_id: c.id, client_secret: c.secret } }).json.access_token;
    const r = call(s, 'GET', '/v1/tasks', { base, token: tk });
    expect(r.json.items).toBeTruthy();
    expect(r.json.data).toBeUndefined();
    expect(r.headers['X-API-Version']).toBe('1.1.0');
    // un token di sviluppo non vale in staging
    expect(call(s, 'GET', '/v1/tasks', { base, token: token(s) }).json.error).toBe('invalid_token');
  });
  it('i log applicativi sono scritti nel filesystem simulato', () => {
    const s = createWorkspace('t');
    call(s, 'GET', '/v1/tasks', { token: expiredToken('development') });
    expect(s.fs['/var/log/taskflow/development/app.log'].content).toContain('token scaduto');
    expect(s.fs['/var/log/taskflow/development/access.log'].content).toContain('-> 401');
  });
  it('è deterministico: stesse richieste, stessi risultati', () => {
    const run = () => {
      const s = createWorkspace('x');
      const t = token(s);
      return JSON.stringify([call(s, 'GET', '/v1/tasks', { token: t }).headers['X-Request-Id'], s.clock]);
    };
    expect(run()).toBe(run());
  });
  it('host non autorizzati: nessun traffico esterno', () => {
    const s = createWorkspace('t');
    const r = sendRequest(s, { method: 'GET', url: 'https://example.com/', headers: {}, body: null, client: 't', shell: null });
    expect(r.ok).toBe(false);
  });
});
