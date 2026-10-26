/**
 * Specifica dell'API simulata "TaskFlow". È la fonte unica per:
 *  - la validazione delle richieste nel server simulato;
 *  - la generazione di /v1/openapi.json;
 *  - il controllo di coerenza della documentazione scritta dall'utente.
 */
import type { EnvName } from '../types.ts';

export interface FieldSpec {
  name: string;
  type: 'string' | 'integer';
  required: boolean;
  description: string;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** percorso relativo a /v1, con parametri `{id}` */
  path: string;
  summary: string;
  auth: 'none' | 'user' | 'admin';
  body?: FieldSpec[];
  query?: { name: string; description: string }[];
  responses: { status: number; description: string }[];
}

export const API_VERSION: Record<EnvName, string> = {
  development: '1.0.0',
  testing: '1.0.0',
  staging: '1.1.0',
};

export const BASE_URLS: Record<EnvName, string> = {
  development: 'http://localhost:8080',
  testing: 'https://test.api.taskflow.test',
  staging: 'https://staging.api.taskflow.test',
};

export const TASK_FIELDS: FieldSpec[] = [
  { name: 'title', type: 'string', required: true, description: 'Titolo del task (3-80 caratteri).', min: 3, max: 80 },
  { name: 'description', type: 'string', required: false, description: 'Descrizione (max 500 caratteri).', max: 500 },
  {
    name: 'status',
    type: 'string',
    required: false,
    description: 'Stato del task. Default: open.',
    enum: ['open', 'in_progress', 'done'],
  },
  { name: 'priority', type: 'integer', required: false, description: 'Priorità da 1 (alta) a 5 (bassa). Default: 3.', min: 1, max: 5 },
  { name: 'projectId', type: 'integer', required: false, description: 'Identificativo del progetto di appartenenza.' },
];

export const ENDPOINTS: EndpointSpec[] = [
  {
    method: 'GET',
    path: '/health',
    summary: 'Stato del servizio',
    auth: 'none',
    responses: [{ status: 200, description: 'Il servizio è attivo.' }],
  },
  {
    method: 'POST',
    path: '/auth/token',
    summary: 'Ottiene un access token',
    auth: 'none',
    body: [
      { name: 'client_id', type: 'string', required: true, description: 'Identificativo del client.' },
      { name: 'client_secret', type: 'string', required: true, description: 'Segreto del client.' },
    ],
    responses: [
      { status: 200, description: 'Token emesso.' },
      { status: 400, description: 'Richiesta malformata.' },
      { status: 401, description: 'Credenziali non valide.' },
      { status: 422, description: 'Campi obbligatori mancanti.' },
    ],
  },
  {
    method: 'GET',
    path: '/me',
    summary: "Profilo dell'utente autenticato",
    auth: 'user',
    responses: [
      { status: 200, description: 'Profilo utente.' },
      { status: 401, description: 'Token assente, non valido o scaduto.' },
    ],
  },
  {
    method: 'GET',
    path: '/tasks',
    summary: 'Elenco dei task',
    auth: 'user',
    query: [
      { name: 'status', description: 'Filtra per stato (open, in_progress, done).' },
      { name: 'q', description: 'Cerca nel titolo.' },
      { name: 'limit', description: 'Numero massimo di risultati (default 20).' },
      { name: 'offset', description: 'Posizione di partenza (default 0).' },
    ],
    responses: [
      { status: 200, description: 'Elenco paginato.' },
      { status: 401, description: 'Token assente, non valido o scaduto.' },
    ],
  },
  {
    method: 'POST',
    path: '/tasks',
    summary: 'Crea un task',
    auth: 'user',
    body: TASK_FIELDS,
    responses: [
      { status: 201, description: 'Task creato (header Location).' },
      { status: 400, description: 'JSON non valido.' },
      { status: 401, description: 'Token assente, non valido o scaduto.' },
      { status: 415, description: 'Content-Type diverso da application/json.' },
      { status: 422, description: 'Validazione fallita.' },
    ],
  },
  {
    method: 'GET',
    path: '/tasks/{id}',
    summary: 'Dettaglio di un task',
    auth: 'user',
    responses: [
      { status: 200, description: 'Task trovato.' },
      { status: 401, description: 'Token assente, non valido o scaduto.' },
      { status: 404, description: 'Task inesistente.' },
    ],
  },
  {
    method: 'PUT',
    path: '/tasks/{id}',
    summary: 'Sostituisce un task',
    auth: 'user',
    body: TASK_FIELDS,
    responses: [
      { status: 200, description: 'Task sostituito.' },
      { status: 404, description: 'Task inesistente.' },
      { status: 409, description: 'Transizione di stato non consentita.' },
      { status: 422, description: 'Validazione fallita.' },
    ],
  },
  {
    method: 'PATCH',
    path: '/tasks/{id}',
    summary: 'Aggiorna parzialmente un task',
    auth: 'user',
    body: TASK_FIELDS.map((f) => ({ ...f, required: false })),
    responses: [
      { status: 200, description: 'Task aggiornato.' },
      { status: 404, description: 'Task inesistente.' },
      { status: 409, description: 'Un task completato non può essere riaperto.' },
      { status: 422, description: 'Validazione fallita.' },
    ],
  },
  {
    method: 'DELETE',
    path: '/tasks/{id}',
    summary: 'Elimina un task',
    auth: 'user',
    responses: [
      { status: 204, description: 'Task eliminato (nessun contenuto).' },
      { status: 404, description: 'Task inesistente.' },
    ],
  },
  {
    method: 'GET',
    path: '/projects',
    summary: 'Elenco dei progetti',
    auth: 'user',
    responses: [{ status: 200, description: 'Elenco progetti.' }],
  },
  {
    method: 'POST',
    path: '/projects',
    summary: 'Crea un progetto',
    auth: 'user',
    body: [{ name: 'name', type: 'string', required: true, description: 'Nome univoco del progetto.', min: 2, max: 60 }],
    responses: [
      { status: 201, description: 'Progetto creato.' },
      { status: 409, description: 'Nome già esistente.' },
      { status: 422, description: 'Validazione fallita.' },
    ],
  },
  {
    method: 'GET',
    path: '/search',
    summary: 'Ricerca (soggetta a rate limit: 5 richieste al minuto)',
    auth: 'user',
    query: [{ name: 'q', description: 'Testo da cercare.' }],
    responses: [
      { status: 200, description: 'Risultati.' },
      { status: 429, description: 'Troppe richieste (header Retry-After).' },
    ],
  },
  {
    method: 'GET',
    path: '/admin/users',
    summary: 'Elenco utenti (solo amministratori)',
    auth: 'admin',
    responses: [
      { status: 200, description: 'Elenco utenti.' },
      { status: 403, description: 'Permessi insufficienti.' },
    ],
  },
  {
    method: 'GET',
    path: '/slow',
    summary: 'Endpoint lento (risponde dopo 10 secondi) per provare i timeout',
    auth: 'none',
    responses: [{ status: 200, description: 'Risposta tardiva.' }],
  },
  {
    method: 'GET',
    path: '/flaky',
    summary: 'Endpoint instabile: ogni terza chiamata fallisce con 500',
    auth: 'none',
    responses: [
      { status: 200, description: 'OK.' },
      { status: 500, description: 'Errore interno simulato.' },
    ],
  },
  {
    method: 'GET',
    path: '/openapi.json',
    summary: 'Specifica OpenAPI del servizio',
    auth: 'none',
    responses: [{ status: 200, description: 'Documento OpenAPI 3.' }],
  },
];

export function findEndpoint(method: string, path: string): EndpointSpec | undefined {
  const norm = path.replace(/^\/v1/, '').replace(/\/+$/, '') || '/';
  return ENDPOINTS.find((e) => {
    if (e.method !== method.toUpperCase()) return false;
    const re = new RegExp('^' + e.path.replace(/\{[^}]+\}/g, '[^/]+') + '$');
    return re.test(norm);
  });
}

/** Normalizza un percorso documentato (`/v1/tasks/42`, `/tasks/:id`) nella forma della specifica. */
export function matchSpecPath(method: string, rawPath: string): EndpointSpec | undefined {
  let p = rawPath.split('?')[0].replace(/^\/v1/, '').replace(/\/+$/, '') || '/';
  p = p.replace(/:[A-Za-z_]+/g, '{id}');
  return ENDPOINTS.find((e) => {
    if (e.method !== method.toUpperCase()) return false;
    const norm = e.path.replace(/\{[^}]+\}/g, '{id}');
    if (norm === p.replace(/\{[^}]+\}/g, '{id}')) return true;
    const re = new RegExp('^' + norm.replace(/\{id\}/g, '[^/]+') + '$');
    return re.test(p);
  });
}

export function buildOpenApi(env: EnvName): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const op: Record<string, unknown> = {
      summary: e.summary,
      responses: Object.fromEntries(e.responses.map((r) => [String(r.status), { description: r.description }])),
    };
    if (e.auth !== 'none') op.security = [{ bearerAuth: [] }];
    if (e.query) op.parameters = e.query.map((q) => ({ name: q.name, in: 'query', required: false, description: q.description, schema: { type: 'string' } }));
    if (e.body) {
      op.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: e.body.filter((f) => f.required).map((f) => f.name),
              properties: Object.fromEntries(
                e.body.map((f) => [f.name, { type: f.type, description: f.description, ...(f.enum ? { enum: f.enum } : {}) }]),
              ),
            },
          },
        },
      };
    }
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'TaskFlow API (simulata)', version: API_VERSION[env] },
    servers: [{ url: BASE_URLS[env] + '/v1' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    paths,
  };
}
