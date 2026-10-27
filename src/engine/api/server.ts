/**
 * API Simulation Engine: server HTTP simulato "TaskFlow".
 * Deterministico: tempi, id, token e rate limit dipendono solo dallo stato (clock simulato).
 */
import { labGate, labLog } from '../lab.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiEnvState, ApiLogEntry, ApiState, ApiTask, EnvName, ShellId, WorkspaceState } from '../types.ts';
import { Vfs } from '../vfs.ts';
import { API_VERSION, BASE_URLS, ENDPOINTS, TASK_FIELDS, buildOpenApi, findEndpoint, type FieldSpec } from './spec.ts';

export const CLOCK_START = Date.UTC(2026, 2, 2, 9, 0, 0) / 1000;

export const CREDENTIALS: Record<EnvName, { id: string; secret: string; user: string; role: 'admin' | 'member' }> = {
  development: { id: 'tf-dev-client', secret: 'dev-secret-42', user: 'bob', role: 'member' },
  testing: { id: 'tf-test-client', secret: 'test-secret-77', user: 'bob', role: 'member' },
  staging: { id: 'tf-stg-client', secret: 'stg-secret-91', user: 'bob', role: 'member' },
};

/** Password dell'utente di prova per il login con sessione (area dimostrativa, credenziali simulate). */
export const demoPassword = (env: EnvName): string => `pw_${ENV_TAG[env]}_demo`;
/** Segreto condiviso per la firma dei webhook ricevuti (credenziale simulata). */
export const webhookSecret = (env: EnvName): string => `whsec_${ENV_TAG[env]}_demo`;
export const WEBHOOK_TOLERANCE_S = 300;
/** Firma di un webhook: HMAC-SHA256 esadecimale di "<timestamp>.<body>". */
export function signWebhook(secret: string, ts: number | string, body: string): string {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

const ENV_TAG: Record<EnvName, string> = { development: 'dev', testing: 'test', staging: 'stg' };

export function iso(sec: number): string {
  return new Date(sec * 1000).toISOString().replace('.000Z', 'Z');
}

/** Token scaduto distribuito negli esercizi di diagnosi. */
export function expiredToken(env: EnvName): string {
  return `tf_${ENV_TAG[env]}_bob_${CLOCK_START - 3600}`;
}

function mkTask(id: number, title: string, status: ApiTask['status'], priority: number, projectId: number | null, desc = ''): ApiTask {
  return {
    id,
    title,
    description: desc,
    status,
    priority,
    projectId,
    createdAt: iso(CLOCK_START - 86400 * (10 - id)),
    updatedAt: iso(CLOCK_START - 86400 * (10 - id)),
  };
}

export function seedEnv(env: EnvName): ApiEnvState {
  const base: ApiTask[] = [
    mkTask(1, "Configurare l'ambiente", 'done', 2, 2, 'Installare le dipendenze e avviare il servizio.'),
    mkTask(2, 'Scrivere la guida di avvio', 'in_progress', 3, 1, 'Bozza della guida Quick Start.'),
    mkTask(3, 'Rivedere le API', 'open', 2, 2),
    mkTask(4, 'Correggere il bug di login', 'open', 1, 2, 'Il login fallisce con password lunghe.'),
    mkTask(5, 'Preparare le release notes', 'open', 4, 1),
  ];
  const tasks = env === 'testing' ? base.slice(0, 3) : base;
  return {
    tasks,
    projects: [
      { id: 1, name: 'Documentazione' },
      { id: 2, name: 'Backend' },
    ],
    nextTaskId: tasks.length + 1,
    nextProjectId: 3,
    flakyCounter: 0,
    searchHits: [],
  };
}

export function createApiState(): ApiState {
  return {
    envs: { development: seedEnv('development'), testing: seedEnv('testing'), staging: seedEnv('staging') },
    log: [],
    seq: 0,
  };
}

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  client: string;
  shell: ShellId | null;
  timeoutMs?: number;
  /** ignora gli errori di certificato (curl -k); Windows PowerShell 5.1 non ha un equivalente */
  insecure?: boolean;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  ms: number;
  httpVersion: string;
}

export type NetResult =
  | { ok: true; res: HttpResponse; env: EnvName | null }
  | { ok: false; kind: 'dns' | 'refused' | 'timeout' | 'tls' | 'cert' | 'badurl'; host: string; port: number; ms: number };

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 400: 'Bad Request', 401: 'Unauthorized',
  403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error',
};

export function statusText(code: number): string {
  return STATUS_TEXT[code] ?? '';
}

interface ParsedUrl {
  scheme: string;
  host: string;
  port: number;
  path: string;
  query: Record<string, string>;
  rawQuery: string;
}

export function parseUrl(url: string): ParsedUrl | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#:]+)(?::(\d+))?([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const port = m[3] ? parseInt(m[3], 10) : scheme === 'https' ? 443 : 80;
  const query: Record<string, string> = {};
  for (const part of (m[5] ?? '').split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return { scheme, host: m[2].toLowerCase(), port, path: m[4] || '/', query, rawQuery: m[5] ?? '' };
}

/** host con certificato scaduto (stessi dati dello staging): serve per esercitarsi sugli errori TLS */
export const EXPIRED_CERT_HOST = 'expired.api.taskflow.test';
/** origini consentite dal CORS del servizio simulato */
export const CORS_ALLOWED_ORIGINS = ['https://docs.taskflow.test', 'http://localhost:3000'];

function envForHost(u: ParsedUrl): EnvName | null {
  if (u.host === EXPIRED_CERT_HOST) return 'staging';
  for (const env of Object.keys(BASE_URLS) as EnvName[]) {
    const b = parseUrl(BASE_URLS[env])!;
    if (b.host === u.host || (env === 'development' && u.host === '127.0.0.1')) return env;
  }
  return null;
}

function json(status: number, data: unknown, headers: Record<string, string> = {}): Raw {
  return { status, body: data === undefined ? '' : JSON.stringify(data), headers: { 'Content-Type': 'application/json', ...headers } };
}

interface Raw {
  status: number;
  body: string;
  headers: Record<string, string>;
  ms?: number;
  note?: string;
}

function err(status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Raw {
  return json(status, { error, message, ...extra }, headers);
}

interface Ctx {
  state: WorkspaceState;
  env: EnvName;
  e: ApiEnvState;
  req: HttpRequest;
  u: ParsedUrl;
  user: { name: string; role: string } | null;
  vfs: Vfs;
  requestId: string;
  /** host del laboratorio a due nodi (M11), se la richiesta è diretta al server */
  labHost?: string;
}

function validateFields(data: Record<string, unknown>, fields: FieldSpec[], partial: boolean): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  for (const f of fields) {
    const v = data[f.name];
    if (v === undefined || v === null) {
      if (f.required && !partial) errors.push({ field: f.name, message: 'campo obbligatorio' });
      continue;
    }
    if (f.type === 'string') {
      if (typeof v !== 'string') {
        errors.push({ field: f.name, message: 'deve essere una stringa' });
        continue;
      }
      if (f.min !== undefined && v.length < f.min) errors.push({ field: f.name, message: `lunghezza minima ${f.min} caratteri` });
      if (f.max !== undefined && v.length > f.max) errors.push({ field: f.name, message: `lunghezza massima ${f.max} caratteri` });
      if (f.enum && !f.enum.includes(v)) errors.push({ field: f.name, message: `valore non valido, ammessi: ${f.enum.join(', ')}` });
    } else {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        errors.push({ field: f.name, message: 'deve essere un numero intero' });
        continue;
      }
      if (f.min !== undefined && v < f.min) errors.push({ field: f.name, message: `valore minimo ${f.min}` });
      if (f.max !== undefined && v > f.max) errors.push({ field: f.name, message: `valore massimo ${f.max}` });
    }
  }
  return errors;
}

function parseBody(ctx: Ctx, allowForm: boolean): { data: Record<string, unknown> } | { fail: Raw } {
  const raw = ctx.req.body ?? '';
  if (!raw.trim()) return { data: {} };
  const ct = (ctx.req.headers['content-type'] ?? '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded') && allowForm) {
    const data: Record<string, unknown> = {};
    for (const part of raw.split('&')) {
      const [k, v = ''] = part.split('=');
      if (k) data[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
    return { data };
  }
  if (!ct.includes('application/json')) {
    return {
      fail: err(415, 'unsupported_media_type', 'Content-Type deve essere application/json.', {
        received: ctx.req.headers['content-type'] ?? null,
      }),
    };
  }
  try {
    const v = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return { fail: err(400, 'invalid_json', 'Il body deve essere un oggetto JSON.') };
    }
    return { data: v as Record<string, unknown> };
  } catch (e) {
    return { fail: err(400, 'invalid_json', 'Il body non è JSON valido.', { detail: (e as Error).message }) };
  }
}

function appLog(ctx: Ctx, level: 'INFO ' | 'WARN ' | 'ERROR', msg: string): void {
  ctx.vfs.systemWrite(`/var/log/taskflow/${ctx.env}/app.log`, `${iso(ctx.state.clock)} ${level} ${msg} req=${ctx.requestId}\n`, true);
}

function authenticate(ctx: Ctx, need: 'none' | 'user' | 'admin'): Raw | null {
  if (need === 'none') return null;
  const h = ctx.req.headers['authorization'];
  const bearer = { 'WWW-Authenticate': 'Bearer realm="taskflow"' };
  if (!h) {
    appLog(ctx, 'WARN ', 'auth: header Authorization assente');
    return err(401, 'unauthorized', 'Header Authorization assente. Usa: Authorization: Bearer <token>', {}, bearer);
  }
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  if (!m) {
    appLog(ctx, 'WARN ', 'auth: schema di autenticazione non supportato (atteso Bearer)');
    return err(401, 'invalid_authorization_scheme', 'Schema non supportato: usa "Bearer <token>".', {}, bearer);
  }
  const t = /^tf_(dev|test|stg)_([a-z]+)_(\d+)$/.exec(m[1]);
  if (!t || t[1] !== ENV_TAG[ctx.env]) {
    appLog(ctx, 'WARN ', t ? `auth: token emesso per un altro ambiente (${t[1]}), atteso ${ENV_TAG[ctx.env]}` : 'auth: token non riconosciuto');
    return err(401, 'invalid_token', t ? "Il token è stato emesso per un altro ambiente." : 'Token non valido.', {}, bearer);
  }
  const exp = parseInt(t[3], 10);
  if (exp <= ctx.state.clock) {
    appLog(ctx, 'WARN ', `auth: token scaduto (exp=${iso(exp)} now=${iso(ctx.state.clock)}) user=${t[2]}`);
    return err(401, 'token_expired', `Access token scaduto il ${iso(exp)}. Richiedine uno nuovo con POST /v1/auth/token.`, {}, bearer);
  }
  ctx.user = { name: t[2], role: t[2] === 'alice' ? 'admin' : 'member' };
  if (need === 'admin' && ctx.user.role !== 'admin') {
    appLog(ctx, 'WARN ', `authz: l'utente ${ctx.user.name} (ruolo member) ha richiesto una risorsa admin`);
    return err(403, 'forbidden', 'Permessi insufficienti: serve il ruolo admin.', { requiredRole: 'admin', yourRole: ctx.user.role });
  }
  return null;
}

function taskView(ctx: Ctx, t: ApiTask): ApiTask {
  return t;
}

function listResponse(ctx: Ctx, items: unknown[], total: number, limit: number, offset: number): Raw {
  const key = ctx.env === 'staging' ? 'items' : 'data';
  return json(200, { [key]: items, total, limit, offset });
}

function handleTasks(ctx: Ctx, rest: string[]): Raw {
  const { e, req } = ctx;
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  if (rest.length === 0) {
    if (method === 'GET') {
      let list = [...e.tasks];
      const { status, q } = ctx.u.query;
      if (status) list = list.filter((t) => t.status === status);
      if (q) list = list.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()));
      const limit = Math.min(parseInt(ctx.u.query.limit ?? '20', 10) || 20, 100);
      const offset = parseInt(ctx.u.query.offset ?? '0', 10) || 0;
      return listResponse(ctx, list.slice(offset, offset + limit), list.length, limit, offset);
    }
    if (method === 'POST') {
      const p = parseBody(ctx, false);
      if ('fail' in p) return p.fail;
      const errors = validateFields(p.data, TASK_FIELDS, false);
      if (typeof p.data.projectId === 'number' && !e.projects.some((x) => x.id === p.data.projectId)) {
        errors.push({ field: 'projectId', message: 'progetto inesistente' });
      }
      if (errors.length) {
        appLog(ctx, 'INFO ', `validation: ${errors.map((x) => `${x.field}: ${x.message}`).join('; ')}`);
        return err(422, 'validation_failed', 'La richiesta non supera la validazione.', { errors });
      }
      const now = iso(ctx.state.clock);
      const t: ApiTask = {
        id: e.nextTaskId++,
        title: p.data.title as string,
        description: (p.data.description as string) ?? '',
        status: (p.data.status as ApiTask['status']) ?? 'open',
        priority: (p.data.priority as number) ?? 3,
        projectId: (p.data.projectId as number) ?? null,
        createdAt: now,
        updatedAt: now,
      };
      e.tasks.push(t);
      return json(201, taskView(ctx, t), { Location: `/v1/tasks/${t.id}` });
    }
    return methodNotAllowed(['GET', 'POST']);
  }
  const id = parseInt(rest[0], 10);
  if (rest.length > 1 || !/^\d+$/.test(rest[0])) return err(404, 'route_not_found', `Percorso inesistente: ${ctx.u.path}`);
  const t = e.tasks.find((x) => x.id === id);
  if (method === 'GET') {
    return t ? json(200, taskView(ctx, t)) : taskNotFound(ctx, id);
  }
  if (method === 'DELETE') {
    if (!t) return taskNotFound(ctx, id);
    e.tasks = e.tasks.filter((x) => x.id !== id);
    return { status: 204, body: '', headers: {} };
  }
  if (method === 'PUT' || method === 'PATCH') {
    if (!t) return taskNotFound(ctx, id);
    const p = parseBody(ctx, false);
    if ('fail' in p) return p.fail;
    const partial = method === 'PATCH';
    const errors = validateFields(p.data, TASK_FIELDS, partial);
    if (errors.length) {
      appLog(ctx, 'INFO ', `validation: ${errors.map((x) => `${x.field}: ${x.message}`).join('; ')}`);
      return err(422, 'validation_failed', 'La richiesta non supera la validazione.', { errors });
    }
    const newStatus = p.data.status as ApiTask['status'] | undefined;
    if (t.status === 'done' && newStatus && newStatus !== 'done') {
      appLog(ctx, 'INFO ', `state: transizione ${t.status} -> ${newStatus} rifiutata per il task ${t.id}`);
      return err(409, 'invalid_transition', 'Un task completato non può essere riaperto.', { current: t.status, requested: newStatus });
    }
    if (partial) {
      for (const k of ['title', 'description', 'status', 'priority', 'projectId'] as const) {
        if (p.data[k] !== undefined) (t as unknown as Record<string, unknown>)[k] = p.data[k];
      }
    } else {
      t.title = p.data.title as string;
      t.description = (p.data.description as string) ?? '';
      t.status = (newStatus as ApiTask['status']) ?? 'open';
      t.priority = (p.data.priority as number) ?? 3;
      t.projectId = (p.data.projectId as number) ?? null;
    }
    t.updatedAt = iso(ctx.state.clock);
    return json(200, taskView(ctx, t));
  }
  return methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']);
}

function taskNotFound(ctx: Ctx, id: number): Raw {
  appLog(ctx, 'INFO ', `lookup: task ${id} non trovato`);
  return err(404, 'not_found', `Task ${id} non trovato.`);
}

function methodNotAllowed(allow: string[]): Raw {
  return err(405, 'method_not_allowed', `Metodo non consentito. Metodi ammessi: ${allow.join(', ')}.`, {}, { Allow: allow.join(', ') });
}

/** Area dimostrativa (non nella specifica OpenAPI): login con cookie di sessione e ricezione di webhook firmati. */
function demoRoute(ctx: Ctx, head: string, rest: string[], method: string): Raw {
  const { req, u } = ctx;
  const tag = ENV_TAG[ctx.env];
  const secureAttr = u.scheme === 'https' ? '; Secure' : '';
  if (head === 'login' && rest.length === 1) {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    const p = parseBody(ctx, true);
    if ('fail' in p) return p.fail;
    if (p.data.username !== 'bob' || p.data.password !== demoPassword(ctx.env)) {
      appLog(ctx, 'WARN ', `session: login rifiutato per username=${String(p.data.username)}`);
      return err(401, 'invalid_credentials', 'Utente o password non corretti.');
    }
    const exp = ctx.state.clock + 1800;
    appLog(ctx, 'INFO ', `session: sessione creata per bob (scade ${iso(exp)})`);
    return json(200, { user: 'bob', expires_at: iso(exp) }, { 'Set-Cookie': `session=sess_${tag}_bob_${exp}; Path=/v1; HttpOnly; SameSite=Lax; Max-Age=1800${secureAttr}` });
  }
  if (head === 'session' && rest.length === 1) {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    const cookie = req.headers['cookie'] ?? '';
    const m = /(?:^|;\s*)session=([^;]*)/.exec(cookie);
    if (!m || !m[1]) {
      appLog(ctx, 'WARN ', 'session: cookie di sessione assente');
      return err(401, 'no_session', 'Nessuna sessione: esegui prima POST /v1/login e invia il cookie.');
    }
    const t = /^sess_(dev|test|stg)_([a-z]+)_(\d+)$/.exec(m[1]);
    if (!t || t[1] !== tag) {
      appLog(ctx, 'WARN ', 'session: cookie non valido per questo ambiente');
      return err(401, 'invalid_session', 'Cookie di sessione non valido per questo ambiente.');
    }
    const exp = parseInt(t[3], 10);
    if (exp <= ctx.state.clock) {
      appLog(ctx, 'WARN ', `session: sessione scaduta (exp=${iso(exp)})`);
      return err(401, 'session_expired', 'Sessione scaduta: esegui di nuovo il login.');
    }
    return json(200, { user: t[2], expires_at: iso(exp) });
  }
  if (head === 'logout' && rest.length === 1) {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    return { status: 204, body: '', headers: { 'Set-Cookie': `session=; Path=/v1; HttpOnly; Max-Age=0${secureAttr}` } };
  }
  if (head === 'webhooks' && rest[1] === 'receive' && rest.length === 2) {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    const sig = req.headers['x-signature'];
    const ts = req.headers['x-webhook-timestamp'];
    if (!sig) {
      appLog(ctx, 'WARN ', 'webhook: header X-Signature assente');
      return err(401, 'missing_signature', 'Header X-Signature assente.');
    }
    if (!ts || !/^\d+$/.test(ts)) {
      appLog(ctx, 'WARN ', 'webhook: header X-Webhook-Timestamp assente o non numerico');
      return err(401, 'missing_timestamp', 'Header X-Webhook-Timestamp assente: serve il tempo in secondi.');
    }
    if (Math.abs(ctx.state.clock - parseInt(ts, 10)) > WEBHOOK_TOLERANCE_S) {
      appLog(ctx, 'WARN ', `webhook: timestamp fuori tolleranza (${ts} contro ${ctx.state.clock})`);
      return err(401, 'stale_timestamp', `Timestamp fuori tolleranza (${WEBHOOK_TOLERANCE_S} s): possibile replay.`);
    }
    const body = req.body ?? '';
    const expected = `sha256=${signWebhook(webhookSecret(ctx.env), ts, body)}`;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      appLog(ctx, 'WARN ', 'webhook: firma non valida');
      return err(401, 'invalid_signature', 'Firma non valida: il segreto o il contenuto firmato non coincidono.');
    }
    let event = 'sconosciuto';
    try {
      const d = JSON.parse(body) as { type?: unknown };
      if (typeof d.type === 'string') event = d.type;
    } catch {
      return err(400, 'invalid_json', 'Il body non è JSON valido.');
    }
    appLog(ctx, 'INFO ', `webhook: evento ${event} accettato`);
    return json(200, { received: true, event });
  }
  return err(404, 'route_not_found', `Endpoint inesistente: ${req.method} ${u.path}`);
}

function route(ctx: Ctx): Raw {
  const { req, u, e } = ctx;
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const parts = u.path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] !== 'v1') return err(404, 'route_not_found', `Percorso inesistente: ${u.path}. Le API sono sotto /v1.`);
  const rest = parts.slice(1);
  const head = rest[0] ?? '';
  if (['login', 'logout', 'session', 'webhooks'].includes(head)) return demoRoute(ctx, head, rest, method);
  const spec = findEndpoint(method, '/' + rest.join('/'));
  const authNeed = spec?.auth ?? (['tasks', 'projects', 'me', 'search', 'admin'].includes(head) ? 'user' : 'none');

  // Un percorso noto con metodo errato: 405 (dopo l'autenticazione solo per le risorse protette)
  const known = ENDPOINTS.filter((x) => new RegExp('^' + x.path.replace(/\{[^}]+\}/g, '[^/]+') + '$').test('/' + rest.join('/')));
  if (!spec && known.length) {
    const authFail = authenticate(ctx, known[0].auth === 'none' ? 'none' : 'user');
    if (authFail) return authFail;
    return methodNotAllowed([...new Set(known.map((k) => k.method))]);
  }
  if (!spec && !['tasks'].includes(head)) return err(404, 'route_not_found', `Endpoint inesistente: ${req.method} ${u.path}`);

  const authFail = authenticate(ctx, authNeed);
  if (authFail) return authFail;

  switch (head) {
    case 'health':
      return json(200, { status: 'ok', version: API_VERSION[ctx.env], env: ctx.env, time: iso(ctx.state.clock) }, { 'X-API-Version': API_VERSION[ctx.env] });
    case 'openapi.json':
      return json(200, buildOpenApi(ctx.env));
    case 'auth': {
      if (rest[1] !== 'token' || method !== 'POST') return err(404, 'route_not_found', `Endpoint inesistente: ${req.method} ${u.path}`);
      const p = parseBody(ctx, true);
      if ('fail' in p) return p.fail;
      const errors = validateFields(p.data, ENDPOINTS.find((x) => x.path === '/auth/token')!.body!, false);
      if (errors.length) return err(422, 'validation_failed', 'Mancano campi obbligatori.', { errors });
      const c = CREDENTIALS[ctx.env];
      if (p.data.client_id !== c.id || p.data.client_secret !== c.secret) {
        appLog(ctx, 'WARN ', `auth: credenziali non valide per client_id=${String(p.data.client_id)}`);
        return err(401, 'invalid_client', 'Credenziali non valide.');
      }
      const exp = ctx.state.clock + 3600;
      appLog(ctx, 'INFO ', `auth: token emesso a ${c.user} (scade ${iso(exp)})`);
      return json(200, { access_token: `tf_${ENV_TAG[ctx.env]}_${c.user}_${exp}`, token_type: 'Bearer', expires_in: 3600 });
    }
    case 'me':
      return json(200, { name: ctx.user!.name, role: ctx.user!.role, env: ctx.env });
    case 'tasks':
      return handleTasks(ctx, rest.slice(1));
    case 'projects': {
      if (method === 'GET') return json(200, { data: e.projects, total: e.projects.length });
      const p = parseBody(ctx, false);
      if ('fail' in p) return p.fail;
      const errors = validateFields(p.data, ENDPOINTS.find((x) => x.path === '/projects' && x.method === 'POST')!.body!, false);
      if (errors.length) return err(422, 'validation_failed', 'La richiesta non supera la validazione.', { errors });
      if (e.projects.some((x) => x.name.toLowerCase() === String(p.data.name).toLowerCase())) {
        return err(409, 'duplicate', `Esiste già un progetto chiamato "${String(p.data.name)}".`);
      }
      const proj = { id: e.nextProjectId++, name: String(p.data.name) };
      e.projects.push(proj);
      return json(201, proj, { Location: `/v1/projects/${proj.id}` });
    }
    case 'search': {
      const win = ctx.state.clock - 60;
      e.searchHits = e.searchHits.filter((t) => t > win);
      if (e.searchHits.length >= 5) {
        const retry = Math.max(1, Math.ceil(e.searchHits[0] + 60 - ctx.state.clock));
        appLog(ctx, 'WARN ', `ratelimit: superato il limite di 5 richieste/minuto per ${ctx.user!.name}`);
        return err(429, 'rate_limited', 'Troppe richieste. Riprova più tardi.', { retryAfter: retry }, { 'Retry-After': String(retry), 'X-RateLimit-Remaining': '0' });
      }
      e.searchHits.push(ctx.state.clock);
      const q = (ctx.u.query.q ?? '').toLowerCase();
      const hits = e.tasks.filter((t) => t.title.toLowerCase().includes(q));
      return json(200, { results: hits, total: hits.length }, { 'X-RateLimit-Remaining': String(5 - e.searchHits.length) });
    }
    case 'admin':
      return json(200, { data: [{ name: 'alice', role: 'admin' }, { name: 'bob', role: 'member' }] });
    case 'slow':
      return { ...json(200, { status: 'ok', note: 'risposta lenta' }), ms: 10_000 };
    case 'flaky': {
      e.flakyCounter++;
      if (e.flakyCounter % 3 === 0) {
        appLog(ctx, 'ERROR', 'flaky: upstream connection reset by peer (errore simulato)');
        return err(500, 'internal_error', 'Errore interno del server.');
      }
      return json(200, { status: 'ok', attempt: e.flakyCounter });
    }
  }
  return err(404, 'route_not_found', `Endpoint inesistente: ${req.method} ${u.path}`);
}

export function sendRequest(state: WorkspaceState, req: HttpRequest): NetResult {
  const vfs = new Vfs(state.fs, () => state.clock);
  const u = parseUrl(req.url);
  if (!u || !['http', 'https'].includes(u.scheme)) {
    return { ok: false, kind: 'badurl', host: req.url, port: 0, ms: 0 };
  }
  state.clock += 1;
  // laboratorio a due nodi (M11): il servizio gira sul nodo "server" e usa i dati dell'ambiente testing
  const gate = labGate(state, u.host, u.port, u.scheme);
  const env = gate.lab ? 'testing' : envForHost(u);
  if (!env) {
    return { ok: false, kind: 'dns', host: u.host, port: u.port, ms: 0 };
  }
  if (gate.lab && gate.fail) return { ok: false, kind: gate.fail, host: u.host, port: u.port, ms: gate.fail === 'tls' ? 3 : 0 };
  const baseUrl = parseUrl(gate.lab ? 'http://lab.invalid' : BASE_URLS[env])!;
  const reachable =
    gate.lab ||
    (baseUrl.scheme === 'https'
      ? (u.scheme === 'https' && u.port === 443) || (u.scheme === 'http' && u.port === 80)
      : u.port === baseUrl.port);
  if (!reachable) return { ok: false, kind: 'refused', host: u.host, port: u.port, ms: 0 };
  if (!gate.lab && baseUrl.scheme === 'http' && u.scheme === 'https') return { ok: false, kind: 'tls', host: u.host, port: u.port, ms: 3 };
  if (u.host === EXPIRED_CERT_HOST && u.scheme === 'https' && !req.insecure) return { ok: false, kind: 'cert', host: u.host, port: u.port, ms: 4 };
  const api = state.api;
  api.seq++;
  const requestId = `req_${String(api.seq).padStart(6, '0')}`;
  const ctx: Ctx = { state, env, e: api.envs[env], req: { ...req, method: req.method.toUpperCase() }, u, user: null, vfs, requestId, labHost: gate.lab ? u.host : undefined };

  let raw: Raw;
  if (u.scheme === 'http' && baseUrl.scheme === 'https') {
    raw = { status: 301, body: '', headers: { Location: BASE_URLS[env] + u.path + (u.rawQuery ? '?' + u.rawQuery : '') } };
  } else {
    const pre = ctx.req.method === 'OPTIONS' && ctx.req.headers['access-control-request-method'] && ctx.req.headers['origin'];
    raw = gate.lab && state.lab && !state.lab.dbUp && u.path !== '/v1/health'
      ? err(500, 'database_unavailable', 'Impossibile raggiungere il database (taskflow-db non risponde)', { requestId })
      : applyCors(ctx, pre ? { status: 204, body: '', headers: {} } : route(ctx));
  }
  const ms = raw.ms ?? 6 + ((api.seq * 7) % 34);
  if (req.timeoutMs !== undefined && ms > req.timeoutMs) {
    state.clock += Math.ceil(req.timeoutMs / 1000);
    logRequest(ctx, { ...raw, status: 0, ms: req.timeoutMs }, 'timeout del client');
    return { ok: false, kind: 'timeout', host: u.host, port: u.port, ms: req.timeoutMs };
  }
  state.clock += Math.floor(ms / 1000);
  const headers: Record<string, string> = {
    Date: new Date(state.clock * 1000).toUTCString(),
    Server: 'taskflow-sim/' + API_VERSION[env],
    'X-Request-Id': requestId,
    'X-API-Version': API_VERSION[env],
    ...raw.headers,
    'Content-Length': String(new TextEncoder().encode(raw.body).length),
  };
  const res: HttpResponse = { status: raw.status, statusText: statusText(raw.status), headers, body: ctx.req.method === 'HEAD' ? '' : raw.body, ms, httpVersion: 'HTTP/1.1' };
  logRequest(ctx, raw, raw.note);
  return { ok: true, res, env };
}

/** CORS: il servizio risponde solo alle origini consentite. curl non applica CORS (lo fa il browser): qui si osservano gli header. */
function applyCors(ctx: Ctx, raw: Raw): Raw {
  const origin = ctx.req.headers['origin'];
  if (!origin) return raw;
  const allowed = CORS_ALLOWED_ORIGINS.includes(origin);
  if (ctx.req.method === 'OPTIONS' && ctx.req.headers['access-control-request-method']) {
    if (!allowed) return { status: 403, body: JSON.stringify({ error: 'cors_origin_not_allowed', message: `Origine non consentita: ${origin}` }), headers: { 'Content-Type': 'application/json', Vary: 'Origin' } };
    return {
      status: 204,
      body: '',
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    };
  }
  return { ...raw, headers: { ...raw.headers, Vary: 'Origin', ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}) } };
}

function logRequest(ctx: Ctx, raw: Raw, note?: string): void {
  const { state, req, u } = ctx;
  const entry: ApiLogEntry = {
    seq: state.api.seq,
    at: iso(state.clock),
    env: ctx.env,
    method: ctx.req.method,
    path: u.path + (u.rawQuery ? '?' + u.rawQuery : ''),
    status: raw.status,
    ms: raw.ms ?? 6 + ((state.api.seq * 7) % 34),
    requestId: ctx.requestId,
    user: ctx.user?.name ?? null,
    client: req.client,
    shell: req.shell,
    note,
    host: ctx.labHost,
    reqBody: req.body ? req.body.slice(0, 2000) : undefined,
    resBody: raw.body.slice(0, 2000),
  };
  state.api.log.push(entry);
  if (state.api.log.length > 400) state.api.log.splice(0, state.api.log.length - 400);
  if (ctx.labHost) {
    // nel laboratorio a due nodi il registro sta sul server (journalctl), non nel filesystem del client
    labLog(state, `${raw.status >= 500 ? 'ERROR' : raw.status >= 400 ? 'WARN ' : 'INFO '} http: ${ctx.req.method} ${entry.path} -> ${raw.status} (${entry.ms}ms) user=${entry.user ?? '-'} req=${ctx.requestId}`);
    return;
  }
  const level = raw.status >= 500 ? 'ERROR' : raw.status >= 400 ? 'WARN ' : 'INFO ';
  ctx.vfs.systemWrite(
    `/var/log/taskflow/${ctx.env}/access.log`,
    `${iso(state.clock)} ${level} http: ${ctx.req.method} ${entry.path} -> ${raw.status} (${entry.ms}ms) user=${entry.user ?? '-'} req=${ctx.requestId}\n`,
    true,
  );
}

export function resetApiEnv(state: WorkspaceState, env: EnvName): void {
  state.api.envs[env] = seedEnv(env);
}
