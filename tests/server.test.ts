import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/store.ts';
import { toYaml } from '../src/server/yaml.ts';

let srv: Server;
let base = '';
const store = new MemoryStore();

beforeAll(async () => {
  srv = createApp({ store, singleUser: false, webRoot: 'dist/web' });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());

async function call(method: string, path: string, body?: unknown, ws = 'utente-1'): Promise<{ status: number; json: any; text: string }> {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-workspace': ws }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* testo */
  }
  return { status: r.status, json, text };
}

describe('Backend applicativo', () => {
  it('richiede un identificativo di workspace valido (multi-utente)', async () => {
    const r = await fetch(base + '/api/session');
    expect(r.status).toBe(400);
    const bad = await fetch(base + '/api/session', { headers: { 'x-workspace': '../etc' } });
    expect(bad.status).toBe(400);
  });
  it('sessione iniziale: livello, prossima lezione e ambiente simulato', async () => {
    const r = await call('GET', '/api/session');
    expect(r.json.simulated).toBe(true);
    expect(r.json.course.level).toBe(2);
    expect(r.json.course.next.lesson).toBe('M2.L1');
    expect(r.json.curriculum.modules.length).toBe(11);
  });
  it('flusso completo di una lezione: avvio, comandi, verifica, progressi', async () => {
    await call('POST', '/api/lessons/M2.L1/start', {});
    const e = await call('POST', '/api/exec', { shell: 'bash', command: 'cd ~/corso-cli/m2l1 && grep ERROR server.log > errori.txt' });
    expect(e.json.exit).toBe(0);
    expect(e.json.live.every((c: any) => c.pass)).toBe(true);
    const v = await call('POST', '/api/lessons/M2.L1/verify', { shell: 'bash' });
    expect(v.json.result.pass).toBe(true);
    expect(v.json.session.course.next.lesson).toBe('M2.L3');
    expect(v.json.lesson.completions.bash.mode).toBe('autonomous');
  });
  it('la soluzione è registrata come aiuto e declassa il completamento', async () => {
    await call('POST', '/api/lessons/M2.L3/start', {}, 'utente-2');
    for (let i = 0; i < 4; i++) await call('POST', '/api/lessons/M2.L3/help', { kind: 'hint', shell: 'bash' }, 'utente-2');
    const s = await call('POST', '/api/lessons/M2.L3/help', { kind: 'solution', shell: 'bash' }, 'utente-2');
    expect(s.json.text).toContain('uniq -c');
    await call('POST', '/api/exec', { shell: 'bash', command: 'cd ~/corso-cli/m2l3' }, 'utente-2');
    await call('POST', '/api/exec', { shell: 'bash', command: "cut -d' ' -f9 accessi.log | sort | uniq -c > conteggio.txt" }, 'utente-2');
    const v = await call('POST', '/api/lessons/M2.L3/verify', { shell: 'bash' }, 'utente-2');
    expect(v.json.lesson.completions.bash.mode).toBe('solution');
  });
  it('la previsione richiede testo e perché', async () => {
    const a = await call('POST', '/api/lessons/M1.L1/prediction', { step: 0, shell: 'bash', text: 'SHELL' });
    expect(a.status).toBe(400);
    const b = await call('POST', '/api/lessons/M1.L1/prediction', { step: 0, shell: 'bash', text: 'SHELL', why: 'senza dollaro' });
    expect(b.status).toBe(200);
  });
  it('cronologia separata per shell, directory distinte', async () => {
    await call('POST', '/api/exec', { shell: 'bash', command: 'cd /tmp' }, 'utente-3');
    const r = await call('GET', '/api/session', undefined, 'utente-3');
    expect(r.json.shells.bash.cwd).toBe('/tmp');
    expect(r.json.shells.pwsh.cwd).toBe('/home/learner');
  });
  it('workspace isolati tra utenti', async () => {
    await call('PUT', '/api/file', { path: '~/docs/privato.md', content: '# solo mio' }, 'utente-4');
    const altro = await call('GET', '/api/file?path=~/docs/privato.md', undefined, 'utente-5');
    expect(altro.status).toBe(404);
  });
  it('editor: salva, versioni, differenze e controllo del documento', async () => {
    await call('PUT', '/api/file', { path: '~/docs/g.md', content: '# Titolo\n\nUno\n' }, 'utente-6');
    await call('PUT', '/api/file', { path: '~/docs/g.md', content: '# Titolo\n\nDue\n' }, 'utente-6');
    const d = await call('GET', '/api/docs/diff?path=~/docs/g.md&from=0', undefined, 'utente-6');
    expect(d.json.diff).toContain('-Uno');
    expect(d.json.diff).toContain('+Due');
    const l = await call('POST', '/api/docs/lint', { path: '~/docs/g.md' }, 'utente-6');
    expect(l.json.stats).toBeDefined();
  });
  it('limita i percorsi accessibili dall\'editor', async () => {
    const r = await call('GET', '/api/file?path=/etc/passwd');
    expect(r.status).toBe(403);
  });
  it('importa ed esporta il REGISTRO', async () => {
    const imp = await call('POST', '/api/course/registro', { text: 'REGISTRO — 27/10/2026\nAmbiente: macOS, Bash\nLezione completata: M2.L4 — Variabili\nLivello attuale: 3\nAcquisito: export; $?\nDa consolidare: codici di uscita\nProssima lezione: M2.L7 — Test' }, 'utente-7');
    expect(imp.json.changes.join(' ')).toContain('Livello portato a 3');
    const out = await call('GET', '/api/course/registro', undefined, 'utente-7');
    expect(out.json.text).toContain('Livello attuale: 3');
    const bad = await call('POST', '/api/course/registro', { text: 'niente' }, 'utente-7');
    expect(bad.status).toBe(400);
  });
  it('esporta in JSON e YAML ed elimina i dati', async () => {
    const j = await call('GET', '/api/export?format=json', undefined, 'utente-8');
    expect(JSON.parse(j.text).course.level).toBe(2);
    const y = await call('GET', '/api/export?format=yaml', undefined, 'utente-8');
    expect(y.text).toContain('course:');
    await call('DELETE', '/api/workspace', undefined, 'utente-8');
  });
  it('ambienti: cambio di ambiente aggiorna le variabili di entrambe le shell', async () => {
    await call('POST', '/api/env', { active: 'staging' }, 'utente-9');
    const r = await call('POST', '/api/exec', { shell: 'pwsh', command: '$env:TASKFLOW_URL' }, 'utente-9');
    expect(r.json.out[0].t).toContain('staging.api.taskflow.test');
  });
  it('tutor: spiega un comando e analizza l\'errore reale', async () => {
    await call('POST', '/api/exec', { shell: 'bash', command: 'ls /nonexistent' }, 'utente-10');
    const a = await call('POST', '/api/tutor', { mode: 'analyze', shell: 'bash' }, 'utente-10');
    expect(a.json.reply.text).toContain('ESECUZIONE');
    const e = await call('POST', '/api/tutor', { mode: 'explain', text: 'curl -s -i URL | jq .', shell: 'bash' }, 'utente-10');
    expect(e.json.reply.text).toContain('Parte 2');
  });
  it('YAML minimo ben formato', () => {
    expect(toYaml({ a: 1, b: ['x', 'y'], c: { d: 'ciao mondo' } })).toBe('a: 1\nb:\n  - x\n  - y\nc:\n  d: ciao mondo');
  });
  it('intestazioni di sicurezza', async () => {
    const r = await fetch(base + '/api/health');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('Protezione con password', () => {
  let s2: Server;
  let b2 = '';
  beforeAll(async () => {
    s2 = createApp({ store: new MemoryStore(), singleUser: true, webRoot: 'dist/web', password: 'segreta-di-prova' });
    await new Promise<void>((r) => s2.listen(0, '127.0.0.1', r));
    b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
  });
  afterAll(() => s2.close());

  it('senza login l\'API è negata, lo stato di autenticazione no', async () => {
    expect((await fetch(b2 + '/api/session')).status).toBe(401);
    const st = await (await fetch(b2 + '/api/auth-status')).json();
    expect(st).toEqual({ required: true, authenticated: false });
  });
  it('password errata rifiutata, corretta accettata con cookie HttpOnly', async () => {
    const bad = await fetch(b2 + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'no' }) });
    expect(bad.status).toBe(401);
    const ok = await fetch(b2 + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segreta-di-prova' }) });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    const r = await fetch(b2 + '/api/session', { headers: { cookie: cookie.split(';')[0] } });
    expect(r.status).toBe(200);
  });
  it('un cookie falsificato non vale e i tentativi ripetuti sono limitati', async () => {
    expect((await fetch(b2 + '/api/session', { headers: { cookie: 'lab_session=9999999999999.abc' } })).status).toBe(401);
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await fetch(b2 + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'x' + i }) })).status;
    expect(last).toBe(429);
  });
});

describe('riepilogo per Claude (senza API)', () => {
  it('lezione: contiene regole, comandi ed esito; nessuna chiamata esterna', async () => {
    await call('POST', '/api/lessons/M1.L1/start', { shell: 'bash' }, 'brief-1');
    await call('POST', '/api/exec', { shell: 'bash', command: 'ls /nonexistent' }, 'brief-1');
    const r = await call('POST', '/api/brief', { kind: 'lesson', shell: 'bash', question: 'Perché fallisce?' }, 'brief-1');
    expect(r.status).toBe(200);
    expect(r.json.text).toContain('Non inventare output');
    expect(r.json.text).toContain('Perché fallisce?');
    expect(r.json.text).toContain('ls /nonexistent');
  });
  it('documento: include il testo e l\'esito del controllo', async () => {
    const r = await call('POST', '/api/brief', { kind: 'doc', shell: 'bash', content: '# Titolo\n\nTesto.\n', path: 'a.md' }, 'brief-2');
    expect(r.status).toBe(200);
    expect(r.json.text).toContain('# Titolo');
    expect(r.json.text).toContain('Esito del controllo automatico');
  });
});
