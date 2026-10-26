/**
 * Repository d'esempio per il Git in sola lettura: un piccolo progetto "demo-note" (Next.js) con cinque commit.
 * Non è un progetto reale dello studente. La cronologia è fissa e serve a esercitarsi con log, show, diff e blame.
 */
export interface DemoCommit {
  hash: string;
  author: string;
  email: string;
  /** secondi dall'epoca UNIX (UTC) */
  at: number;
  message: string;
  /** percorsi modificati in questo commit, con il contenuto completo (null = eliminato) */
  files: Record<string, string | null>;
}

const AUTH_TS = `import { cookies } from 'next/headers';

// Ricava l'utente dalla richiesta: header Authorization: Bearer <token> oppure cookie "session".
export async function requireUser(req: Request) {
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookies().get('session')?.value;
  if (!token) return null;
  return await db.session.findUser(token);
}
`;

const NOTES_V1 = `import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// GET /api/notes?limit=20 -> elenco delle note dell'utente
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 20), 50);
  const notes = await db.note.findMany({ where: { userId: user.id }, take: limit });
  return NextResponse.json({ data: notes });
}

// POST /api/notes -> crea una nota
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const note = await db.note.create({ data: { title: body.title, userId: user.id } });
  return NextResponse.json(note, { status: 200 });
}
`;

const NOTES_V2 = NOTES_V1.replace(
  "  const body = await req.json();\n",
  "  const body = await req.json().catch(() => null);\n  if (!body || typeof body.title !== 'string' || body.title.length < 3) {\n    return NextResponse.json({ error: 'validation_failed', field: 'title' }, { status: 422 });\n  }\n",
);

const NOTES_V3 = NOTES_V2.replace('), 50);', '), 100);')
  .replace('return NextResponse.json({ data: notes });', 'return NextResponse.json({ items: notes, total: notes.length });')
  .replace('return NextResponse.json(note, { status: 200 });', 'return NextResponse.json(note, { status: 201 });');

const NOTE_ID_V1 = `import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// GET /api/notes/{id} -> una nota
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const note = await db.note.findUnique({ where: { id: params.id } });
  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(note);
}

// DELETE /api/notes/{id} -> elimina una nota
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const note = await db.note.delete({ where: { id: params.id } });
  return NextResponse.json(note, { status: 200 });
}
`;

const NOTE_ID_V3 = NOTE_ID_V1.replace(
  "  const note = await db.note.delete({ where: { id: params.id } });\n  return NextResponse.json(note, { status: 200 });\n",
  "  const note = await db.note.findUnique({ where: { id: params.id } });\n  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });\n  if (note.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });\n  await db.note.delete({ where: { id: params.id } });\n  return new Response(null, { status: 204 });\n",
);

const HEALTH_V1 = `import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// GET /api/health -> stato del servizio
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ status: 'ok' });
}
`;

const HEALTH_V2 = `import { NextResponse } from 'next/server';

// GET /api/health -> stato del servizio (pubblico, nessuna autenticazione)
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
`;

const WEBHOOK_JS = `// Funzione serverless: riceve le notifiche del servizio esterno Polar.
// POST /api/webhook-polar con l'header x-polar-signature (HMAC SHA-256 del body).
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const expected = crypto.createHmac('sha256', process.env.POLAR_WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  if (req.headers['x-polar-signature'] !== expected) return res.status(401).json({ error: 'invalid_signature' });
  await queue.add(req.body);
  return res.status(200).json({ received: true });
};
`;

const DOCS_API = `# API note (documentazione esistente)

Tutte le chiamate richiedono l'header \`Authorization: Bearer <token>\`.

## GET /api/notes

Elenco delle note dell'utente. Parametro \`limit\` (massimo 50, predefinito 20).
Risposta: \`{ "data": [ ...note ] }\`.

## POST /api/notes

Crea una nota. Body: \`{ "title": "..." }\`. Risponde 200 con la nota creata.

## GET /api/notes/{id}

Una nota. 404 se non esiste.

## DELETE /api/notes/{id}

Elimina la nota. Risponde 200 con la nota eliminata.

## GET /api/health

Stato del servizio. Richiede il token.
`;

const README = `# demo-note

Piccola applicazione di note (progetto d'esempio del corso). Le API sono in \`app/api/\`, le funzioni serverless in \`api/\`.
Documentazione delle API: \`docs/api.md\`.
`;

const sec = (y: number, mo: number, d: number, h: number, mi: number): number => Date.UTC(y, mo - 1, d, h, mi) / 1000;

export const DEMO_COMMITS: DemoCommit[] = [
  {
    hash: '942277ed277e889adb869ece178325d6f7452f21',
    author: 'Alice Rossi',
    email: 'alice@demo-note.test',
    at: sec(2026, 8, 3, 9, 30),
    message: "Prima versione dell'API note",
    files: {
      'README.md': README,
      'docs/api.md': DOCS_API,
      'lib/auth.ts': AUTH_TS,
      'app/api/notes/route.ts': NOTES_V1,
      'app/api/notes/[id]/route.ts': NOTE_ID_V1,
      'app/api/health/route.ts': HEALTH_V1,
    },
  },
  {
    hash: '43b3490aef3cb72a810d7c5b0b7856aa09bbd3e7',
    author: 'Bruno Verdi',
    email: 'bruno@demo-note.test',
    at: sec(2026, 8, 17, 14, 5),
    message: 'Valida il titolo delle note',
    files: { 'app/api/notes/route.ts': NOTES_V2 },
  },
  {
    hash: '053b271baab3b29634c36b01da737ab1daf2b142',
    author: 'Alice Rossi',
    email: 'alice@demo-note.test',
    at: sec(2026, 9, 2, 11, 12),
    message: 'Risposta con items e total, limite 100, 201 sulla creazione',
    files: { 'app/api/notes/route.ts': NOTES_V3, 'app/api/notes/[id]/route.ts': NOTE_ID_V3 },
  },
  {
    hash: '09c6cb18bd47a7b679dd1b31f79c542fc1512f8d',
    author: 'Bruno Verdi',
    email: 'bruno@demo-note.test',
    at: sec(2026, 9, 15, 16, 40),
    message: 'Rende pubblico /api/health',
    files: { 'app/api/health/route.ts': HEALTH_V2 },
  },
  {
    hash: '639d462f138c38288f90dceda5c991d7a106bfa1',
    author: 'Carla Neri',
    email: 'carla@demo-note.test',
    at: sec(2026, 9, 29, 10, 0),
    message: 'Aggiunge il webhook Polar',
    files: { 'api/webhook-polar.js': WEBHOOK_JS },
  },
];

/** Contenuto dei file al commit `upto` (indice incluso). */
export function snapshotAt(upto: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i <= upto && i < DEMO_COMMITS.length; i++) {
    for (const [p, c] of Object.entries(DEMO_COMMITS[i].files)) {
      if (c === null) delete out[p];
      else out[p] = c;
    }
  }
  return out;
}

export const DEMO_HEAD = snapshotAt(DEMO_COMMITS.length - 1);
