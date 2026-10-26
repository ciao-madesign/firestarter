/**
 * Backend applicativo: espone i motori (simulazione, esercizi, documenti, tutor) via API JSON interne.
 * Nessun comando viene mai eseguito sul server: tutto passa dal Simulation Engine.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { applyEnvToShells, complete, execute, promptFor, stateSize } from '../engine/index.ts';
import { LIMITS, type EnvName, type ShellId, type WorkspaceState } from '../engine/types.ts';
import { BASE_URLS, ENDPOINTS, API_VERSION } from '../engine/api/spec.ts';
import { CREDENTIALS, resetApiEnv } from '../engine/api/server.ts';
import { HOME, Vfs, displayPath, resolvePath, FsError } from '../engine/vfs.ts';
import { CATALOG } from '../engine/catalog.ts';
import { unifiedDiff, splitLines } from '../engine/util.ts';
import {
  curriculumView, evaluateChecks, getLesson, LESSONS, lessonDir, recoverySuggestions, resetLesson, skillScores, startLesson, useHelp, verifyLesson, type HelpKind,
} from '../curriculum/engine.ts';
import { CURRICULUM_VERSION, MODULES } from '../curriculum/lessons/index.ts';
import { applyRegistro, buildRegistro, parseRegistro, RegistroError, renderProgressMd, type CourseProgress, addRecurring } from '../course/progress.ts';
import { generateTest, inTest, recordTestProgress } from '../course/moduletest.ts';
import { lintDocument } from '../docs/lint.ts';
import { tutorRespond, type TutorMode } from '../tutor/tutor.ts';
import { ID_RE, type Store } from './store.ts';
import { toYaml } from './yaml.ts';

export interface AppConfig {
  store: Store;
  singleUser: boolean;
  webRoot: string;
  /** se impostata, l'API richiede il login con questa password */
  password?: string;
  /** fiducia nell'intestazione X-Forwarded-* (dietro tunnel o proxy) */
  trustProxy?: boolean;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const TITLES = (): Record<string, string> => Object.fromEntries(LESSONS.map((l) => [l.id, l.title]));

export function createApp(cfg: AppConfig): Server {
  const cache = new Map<string, { ws: WorkspaceState; course: CourseProgress }>();
  const locks = new Map<string, Promise<unknown>>();
  const hits = new Map<string, number[]>();
  const loginFails = new Map<string, number[]>();
  const key = cfg.password ? createHash('sha256').update('lab-session:' + cfg.password).digest() : null;
  const SESSION_DAYS = 30;

  const clientIp = (req: IncomingMessage): string => {
    const f = req.headers['x-forwarded-for'];
    if (cfg.trustProxy && typeof f === 'string') return f.split(',')[0].trim();
    return req.socket.remoteAddress ?? 'x';
  };
  const sign = (exp: number): string => `${exp}.${createHmac('sha256', key!).update(String(exp)).digest('hex')}`;
  const validToken = (tok: string | undefined): boolean => {
    if (!key || !tok) return false;
    const [exp, mac] = tok.split('.');
    const e = Number(exp);
    if (!e || e < Date.now() || !mac) return false;
    const want = createHmac('sha256', key).update(String(e)).digest('hex');
    return mac.length === want.length && timingSafeEqual(Buffer.from(mac), Buffer.from(want));
  };
  const cookieOf = (req: IncomingMessage): string | undefined => /(?:^|;\s*)lab_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  const authed = (req: IncomingMessage): boolean => !cfg.password || validToken(cookieOf(req));

  function wsId(req: IncomingMessage): string {
    if (cfg.singleUser) return 'student';
    const h = req.headers['x-workspace'];
    const id = Array.isArray(h) ? h[0] : h;
    if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Identificativo workspace mancante o non valido (header X-Workspace).');
    return id;
  }

  function load(id: string): { ws: WorkspaceState; course: CourseProgress } {
    let c = cache.get(id);
    if (!c) {
      c = { ws: cfg.store.loadWorkspace(id), course: cfg.store.loadCourse(id) };
      if (cache.size > 30) cache.delete(cache.keys().next().value as string);
      cache.set(id, c);
    }
    return c;
  }

  function persist(id: string, c: { ws: WorkspaceState; course: CourseProgress }, saveCourse = false): void {
    if (stateSize(c.ws) > LIMITS.maxStateBytes) {
      cache.delete(id);
      throw new HttpError(507, 'Spazio del workspace esaurito: elimina file o resetta le lezioni.');
    }
    cfg.store.saveWorkspace(id, c.ws);
    if (saveCourse) cfg.store.saveCourse(id, c.course, renderProgressMd(c.course, TITLES()));
  }

  // ---------- viste ----------
  function shellView(ws: WorkspaceState, sh: ShellId) {
    const s = ws.shells[sh];
    return { prompt: promptFor(ws, sh), cwd: s.cwd, history: s.history.slice(-200).map((h) => h.cmd), transcript: s.transcript };
  }

  function sessionView(ws: WorkspaceState, course: CourseProgress) {
    return {
      id: ws.id,
      simulated: true,
      prefs: ws.prefs,
      activeExercise: ws.activeExercise,
      activeEnv: ws.activeEnv,
      shells: { bash: shellView(ws, 'bash'), pwsh: shellView(ws, 'pwsh') },
      curriculum: curriculumView(ws, course),
      course: courseView(course),
      skills: skillScores(ws),
      recovery: recoverySuggestions(ws, course),
      moduleTest: ws.moduleTest ?? null,
      chat: ws.tutorChat.slice(-60),
      curriculumVersion: CURRICULUM_VERSION,
    };
  }

  function courseView(course: CourseProgress) {
    return {
      level: course.level,
      levelNote: course.levelNote,
      next: course.next,
      toConsolidate: course.toConsolidate,
      strengths: course.strengths,
      recurringErrors: course.recurringErrors,
      tests: course.tests,
      student: course.student,
      titles: TITLES(),
      modules: MODULES,
    };
  }

  function lessonView(ws: WorkspaceState, id: string, shell: ShellId) {
    const l = getLesson(id);
    if (!l) throw new HttpError(404, `Lezione sconosciuta: ${id}`);
    const p = ws.progress[id];
    return {
      id: l.id,
      module: l.module,
      n: l.n,
      title: l.title,
      objective: l.objective,
      explain: l.explain,
      shells: l.shells,
      guided: l.guided,
      predict: l.predict,
      negative: l.negative,
      task: l.task,
      checks: l.checks.map((c) => ({ id: c.id, description: c.description, expected: c.expected, kind: c.kind ?? 'verifiable' })),
      hasAlt: !!l.alt,
      alt: l.alt ? { task: l.alt.task, criterion: l.alt.criterion } : null,
      autonomous: !!l.autonomous,
      review: !!l.review,
      summary: l.summary,
      dir: lessonDir(l.id),
      started: p?.startClock !== undefined,
      completions: p?.completions ?? {},
      help: p?.help ?? {},
      lastVerify: p?.lastVerify ?? null,
      predictions: ws.predictions.map((x, i) => ({ ...x, index: i })).filter((x) => x.lesson === id),
      live: p?.startClock !== undefined ? evaluateChecks(ws, id, shell).map((c) => ({ id: c.id, pass: c.pass })) : [],
      hintsTotal: l.hints.length,
    };
  }

  function envView(ws: WorkspaceState) {
    const envs = (['development', 'testing', 'staging'] as EnvName[]).map((e) => ({
      name: e,
      baseUrl: BASE_URLS[e],
      version: API_VERSION[e],
      tasks: ws.api.envs[e].tasks.length,
      projects: ws.api.envs[e].projects.length,
      clientId: CREDENTIALS[e].id,
      active: ws.activeEnv === e,
    }));
    return {
      simulated: true,
      envs,
      active: ws.activeEnv,
      variables: { TASKFLOW_URL: BASE_URLS[ws.activeEnv], TASKFLOW_CLIENT_ID: CREDENTIALS[ws.activeEnv].id, TASKFLOW_CLIENT_SECRET: '••••••• (simulato, solo variabile d\'ambiente)' },
      endpoints: ENDPOINTS,
      log: ws.api.log.slice(-60).reverse(),
      data: { tasks: ws.api.envs[ws.activeEnv].tasks, projects: ws.api.envs[ws.activeEnv].projects },
      files: ['/var/log/taskflow/' + ws.activeEnv + '/access.log', '/var/log/taskflow/' + ws.activeEnv + '/app.log', '/home/learner/projects/taskflow/.env.' + ws.activeEnv],
    };
  }

  // ---------- file ----------
  function underHome(path: string): string {
    const abs = resolvePath(path, HOME);
    if (abs !== HOME && !abs.startsWith(HOME + '/') && !abs.startsWith('/var/log/taskflow') && !abs.startsWith('/etc/taskflow')) throw new HttpError(403, 'Percorso fuori dall\'area consentita.');
    return abs;
  }

  function recordVersion(ws: WorkspaceState, path: string, content: string): void {
    const arr = (ws.docVersions[path] ??= []);
    if (arr.length && arr[arr.length - 1].content === content) return;
    arr.push({ at: ws.clock, content });
    if (arr.length > 30) arr.shift();
  }

  // ---------- gestione richieste ----------
  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const ch of req) {
      size += (ch as Buffer).length;
      if (size > 1_000_000) throw new HttpError(413, 'Richiesta troppo grande.');
      chunks.push(ch as Buffer);
    }
    if (!size) return {};
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      throw new HttpError(400, 'Body JSON non valido.');
    }
  }

  const sendJson = (res: ServerResponse, status: number, data: unknown): void => {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  };

  const sendText = (res: ServerResponse, status: number, text: string, type: string, extra: Record<string, string> = {}): void => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(text);
  };

  const asShell = (v: unknown): ShellId => (v === 'pwsh' ? 'pwsh' : 'bash');

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? 'GET';
    const path = url.pathname.replace(/^\/api/, '') || '/';
    if (path === '/health') return sendJson(res, 200, { status: 'ok', simulated: true });
    if (path === '/auth-status') return sendJson(res, 200, { required: !!cfg.password, authenticated: authed(req) });
    if (path === '/login' && method === 'POST') {
      if (!cfg.password) return sendJson(res, 200, { ok: true });
      const ip = clientIp(req);
      const now = Date.now();
      const fails = (loginFails.get(ip) ?? []).filter((t) => now - t < 60_000);
      if (fails.length >= 5) throw new HttpError(429, 'Troppi tentativi: riprova tra un minuto.');
      const body = await readBody(req);
      const a = createHash('sha256').update(String(body.password ?? '')).digest();
      const b = createHash('sha256').update(cfg.password).digest();
      if (!timingSafeEqual(a, b)) {
        fails.push(now);
        loginFails.set(ip, fails);
        throw new HttpError(401, 'Password non corretta.');
      }
      const exp = now + SESSION_DAYS * 86_400_000;
      const secure = cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `lab_session=${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'lab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }
    if (!authed(req)) throw new HttpError(401, 'Accesso richiesto: effettua il login.');
    const id = wsId(req);
    const c = load(id);
    const { ws, course } = c;
    const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);
    const sh = asShell(body.shell ?? url.searchParams.get('shell') ?? ws.prefs.shell);

    // --- sessione
    if (path === '/session' && method === 'GET') return sendJson(res, 200, sessionView(ws, course));

    if (path === '/prefs' && method === 'POST') {
      const p = ws.prefs;
      if (typeof body.fontSize === 'number') p.fontSize = Math.max(11, Math.min(24, body.fontSize));
      if (typeof body.rightPanelVisible === 'boolean') p.rightPanelVisible = body.rightPanelVisible;
      if (typeof body.splitPercent === 'number') p.splitPercent = Math.max(25, Math.min(80, body.splitPercent));
      if (body.shell === 'bash' || body.shell === 'pwsh') p.shell = body.shell;
      if (typeof body.tab === 'string') p.tab = body.tab.slice(0, 24);
      persist(id, c);
      return sendJson(res, 200, { prefs: p });
    }

    // --- terminale
    if (path === '/exec' && method === 'POST') {
      const command = typeof body.command === 'string' ? body.command : '';
      const r = execute(ws, sh, command, { tty: true });
      if (!r.incomplete) {
        ws.prefs.shell = sh;
        persist(id, c);
      }
      const live = ws.activeExercise && !r.incomplete ? evaluateChecks(ws, ws.activeExercise, sh).map((x) => ({ id: x.id, pass: x.pass })) : null;
      return sendJson(res, 200, { ...r, live, shell: sh });
    }
    if (path === '/clear' && method === 'POST') {
      ws.shells[sh].transcript = [];
      persist(id, c);
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/complete' && method === 'POST') {
      return sendJson(res, 200, complete(ws, sh, typeof body.line === 'string' ? body.line : ''));
    }

    // --- curriculum
    if (path === '/lessons' && method === 'GET') return sendJson(res, 200, curriculumView(ws, course));
    const lm = /^\/lessons\/([A-Za-z0-9.]+)(?:\/([a-z]+))?$/.exec(path);
    if (lm) {
      const lid = lm[1];
      const action = lm[2];
      const lesson = getLesson(lid);
      if (!lesson) throw new HttpError(404, `Lezione sconosciuta: ${lid}`);
      if (!action && method === 'GET') return sendJson(res, 200, lessonView(ws, lid, sh));
      if (action === 'start' && method === 'POST') {
        startLesson(ws, lid);
        ws.prefs.tab = 'istruzioni';
        if (!lesson.shells.includes(ws.prefs.shell)) ws.prefs.shell = lesson.shells[0];
        persist(id, c, true);
        return sendJson(res, 200, { lesson: lessonView(ws, lid, ws.prefs.shell), session: sessionView(ws, course) });
      }
      if (action === 'reset' && method === 'POST') {
        if (inTest(ws, lid)) throw new HttpError(409, 'Durante il test intermedio non puoi resettare la lezione.');
        resetLesson(ws, lid);
        applyEnvToShells(ws);
        persist(id, c);
        return sendJson(res, 200, { lesson: lessonView(ws, lid, sh), session: sessionView(ws, course) });
      }
      if (action === 'verify' && method === 'POST') {
        if (!ws.progress[lid]?.startClock) startLesson(ws, lid);
        const wasTest = inTest(ws, lid);
        const helpBefore = ws.progress[lid]?.help[sh];
        const result = verifyLesson(ws, lid, sh, course);
        let testNote: string | undefined;
        if (wasTest) {
          const used = !!helpBefore && (helpBefore.hints > 0 || helpBefore.example > 0 || helpBefore.solution);
          const t = recordTestProgress(ws, course, result, used);
          if (t.finished) testNote = t.summary;
        }
        persist(id, c, true);
        return sendJson(res, 200, { result, testNote, lesson: lessonView(ws, lid, sh), session: sessionView(ws, course) });
      }
      if (action === 'help' && method === 'POST') {
        const kind = (['example', 'hint', 'explanation', 'solution'] as const).includes(body.kind as never) ? (body.kind as HelpKind) : 'hint';
        if (!ws.progress[lid]?.startClock) startLesson(ws, lid);
        const r = useHelp(ws, lid, sh, kind);
        persist(id, c);
        return sendJson(res, 200, r);
      }
      if (action === 'prediction' && method === 'POST') {
        const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
        const why = typeof body.why === 'string' ? body.why.trim().slice(0, 1000) : '';
        if (!text) throw new HttpError(400, 'Scrivi la previsione prima di eseguire.');
        if (!why) throw new HttpError(400, 'Indica anche il perché: la previsione completa dice cosa e perché.');
        ws.predictions.push({ lesson: lid, step: Number(body.step) || 0, shell: sh, text, why, at: ws.clock, accurate: null });
        if (ws.predictions.length > 300) ws.predictions.splice(0, ws.predictions.length - 300);
        persist(id, c);
        return sendJson(res, 200, { index: ws.predictions.length - 1 });
      }
      if (action === 'assess' && method === 'POST') {
        const idx = Number(body.index);
        const p = ws.predictions[idx];
        if (!p || p.lesson !== lid) throw new HttpError(404, 'Previsione non trovata.');
        p.accurate = body.accurate === true;
        if (!p.accurate) addRecurring(course, 'previsioni-incoerenti', 'Previsioni incoerenti o troppo semplificate rispetto al reale', lid);
        persist(id, c, true);
        return sendJson(res, 200, { ok: true });
      }
    }

    // --- tutor
    if (path === '/tutor' && method === 'POST') {
      const mode = (['hint', 'explain', 'example', 'solution', 'analyze', 'chat', 'status'] as const).includes(body.mode as never) ? (body.mode as TutorMode) : 'chat';
      const text = typeof body.text === 'string' ? body.text.slice(0, 2000) : '';
      if (text) ws.tutorChat.push({ role: 'user', text, at: ws.clock });
      if (ws.activeExercise && !ws.progress[ws.activeExercise]?.startClock) startLesson(ws, ws.activeExercise);
      const reply = tutorRespond(ws, mode, sh, text);
      ws.tutorChat.push({ role: 'tutor', text: reply.text, at: ws.clock });
      if (ws.tutorChat.length > 200) ws.tutorChat.splice(0, ws.tutorChat.length - 200);
      persist(id, c);
      return sendJson(res, 200, { reply, chat: ws.tutorChat.slice(-60) });
    }
    if (path === '/tutor/clear' && method === 'POST') {
      ws.tutorChat = [];
      persist(id, c);
      return sendJson(res, 200, { ok: true });
    }

    // --- ambienti / API Lab
    if (path === '/env' && method === 'GET') return sendJson(res, 200, envView(ws));
    if (path === '/env' && method === 'POST') {
      const e = body.active as EnvName;
      if (!['development', 'testing', 'staging'].includes(e)) throw new HttpError(400, 'Ambiente non valido.');
      ws.activeEnv = e;
      applyEnvToShells(ws);
      ws.changeLog.push({ at: ws.clock, what: `Ambiente attivo: ${e}` });
      persist(id, c);
      return sendJson(res, 200, envView(ws));
    }
    if (path === '/env/reset' && method === 'POST') {
      const e = (body.env as EnvName) ?? ws.activeEnv;
      if (!['development', 'testing', 'staging'].includes(e)) throw new HttpError(400, 'Ambiente non valido.');
      resetApiEnv(ws, e);
      ws.changeLog.push({ at: ws.clock, what: `Dati di ${e} ripristinati` });
      persist(id, c);
      return sendJson(res, 200, envView(ws));
    }

    // --- file e documenti
    if (path === '/fs' && method === 'GET') {
      const dir = underHome(url.searchParams.get('dir') ?? '~');
      const v = new Vfs(ws.fs, () => ws.clock);
      if (!v.isDir(dir)) throw new HttpError(404, 'Cartella inesistente.');
      const entries = v.list(dir).map((n) => {
        const full = (dir === '/' ? '' : dir) + '/' + n;
        const node = v.get(full)!;
        return { name: n, path: full, type: node.type, size: node.type === 'file' ? node.content.length : 0 };
      });
      return sendJson(res, 200, { dir, display: displayPath(dir), entries });
    }
    if (path === '/file' && method === 'GET') {
      const p = underHome(url.searchParams.get('path') ?? '');
      const v = new Vfs(ws.fs, () => ws.clock);
      if (!v.isFile(p)) throw new HttpError(404, 'File inesistente.');
      return sendJson(res, 200, { path: p, content: v.readFile(p), versions: (ws.docVersions[p] ?? []).map((x, i) => ({ index: i, at: x.at })) });
    }
    if (path === '/file' && method === 'PUT') {
      const p = underHome(String(body.path ?? ''));
      const content = typeof body.content === 'string' ? body.content : '';
      const v = new Vfs(ws.fs, () => ws.clock);
      try {
        const existed = v.isFile(p);
        if (existed) recordVersion(ws, p, v.readFile(p));
        v.writeFile(p, content);
        recordVersion(ws, p, content);
        ws.changeLog.push({ at: ws.clock, what: `${existed ? 'Modificato' : 'Creato'} ${displayPath(p)}` });
      } catch (e) {
        if (e instanceof FsError) throw new HttpError(e.code === 'EACCES' ? 403 : 400, e.code === 'ENOENT' ? 'La cartella di destinazione non esiste.' : e.code === 'ELIMIT' ? 'Limite del laboratorio superato.' : e.message);
        throw e;
      }
      persist(id, c);
      return sendJson(res, 200, { ok: true, live: ws.activeExercise ? evaluateChecks(ws, ws.activeExercise, sh).map((x) => ({ id: x.id, pass: x.pass })) : null });
    }
    if (path === '/file' && method === 'DELETE') {
      const p = underHome(url.searchParams.get('path') ?? '');
      const v = new Vfs(ws.fs, () => ws.clock);
      try {
        v.remove(p, false);
      } catch (e) {
        if (e instanceof FsError) throw new HttpError(400, e.message);
        throw e;
      }
      persist(id, c);
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/docs/lint' && method === 'POST') {
      let content = typeof body.content === 'string' ? body.content : null;
      if (content === null) {
        const v = new Vfs(ws.fs, () => ws.clock);
        const p = underHome(String(body.path ?? ''));
        if (!v.isFile(p)) throw new HttpError(404, 'File inesistente.');
        content = v.readFile(p);
      }
      return sendJson(res, 200, lintDocument(ws, content));
    }
    if (path === '/docs/diff' && method === 'GET') {
      const p = underHome(url.searchParams.get('path') ?? '');
      const versions = ws.docVersions[p] ?? [];
      const from = Number(url.searchParams.get('from') ?? versions.length - 2);
      const v = new Vfs(ws.fs, () => ws.clock);
      const cur = v.isFile(p) ? v.readFile(p) : '';
      const old = versions[from]?.content ?? '';
      return sendJson(res, 200, { diff: unifiedDiff(splitLines(old), splitLines(cur), `versione ${from}`, 'corrente') || '(nessuna differenza)' });
    }
    if (path === '/notes') {
      if (method === 'GET') return sendJson(res, 200, { notes: ws.notes });
      if (method === 'PUT') {
        ws.notes = typeof body.notes === 'string' ? body.notes.slice(0, 50_000) : '';
        persist(id, c);
        return sendJson(res, 200, { ok: true });
      }
    }

    // --- corso: REGISTRO, progressi, test
    if (path === '/course' && method === 'GET') return sendJson(res, 200, { ...courseView(course), markdown: renderProgressMd(course, TITLES()) });
    if (path === '/course/registro' && method === 'GET') {
      const date = new Date().toISOString().slice(0, 10);
      return sendJson(res, 200, { text: buildRegistro(course, TITLES(), date, `Laboratorio web (simulato), ${sh === 'bash' ? 'Bash' : 'PowerShell 5.1'}`) });
    }
    if (path === '/course/registro' && method === 'POST') {
      try {
        const reg = parseRegistro(String(body.text ?? ''));
        const r = applyRegistro(course, reg);
        c.course = r.progress;
        persist(id, c, true);
        return sendJson(res, 200, { changes: r.changes, course: courseView(c.course) });
      } catch (e) {
        if (e instanceof RegistroError) throw new HttpError(400, e.message);
        throw e;
      }
    }
    if (path === '/course/test' && method === 'POST') {
      const m = Number(body.module);
      if (!MODULES.some((x) => x.n === m)) throw new HttpError(400, 'Modulo non valido.');
      ws.moduleTest = generateTest(course, m, ws.clock);
      persist(id, c);
      return sendJson(res, 200, { moduleTest: ws.moduleTest });
    }
    if (path === '/course/test/cancel' && method === 'POST') {
      ws.moduleTest = undefined;
      persist(id, c);
      return sendJson(res, 200, { ok: true });
    }

    // --- report, esportazione, cancellazione
    if (path === '/report' && method === 'GET') {
      const md = buildReport(ws);
      return sendText(res, 200, md, 'text/markdown; charset=utf-8', { 'Content-Disposition': 'attachment; filename="report-test.md"' });
    }
    if (path === '/export' && method === 'GET') {
      const fmt = url.searchParams.get('format') === 'yaml' ? 'yaml' : 'json';
      const data = exportData(ws, course);
      if (fmt === 'yaml') return sendText(res, 200, toYaml(data) + '\n', 'text/yaml; charset=utf-8', { 'Content-Disposition': 'attachment; filename="workspace.yaml"' });
      return sendText(res, 200, JSON.stringify(data, null, 2), 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="workspace.json"' });
    }
    if (path === '/workspace' && method === 'DELETE') {
      cfg.store.deleteWorkspace(id);
      cache.delete(id);
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/catalog' && method === 'GET') return sendJson(res, 200, { commands: CATALOG });

    throw new HttpError(404, 'Risorsa inesistente.');
  }

  function exportData(ws: WorkspaceState, course: CourseProgress): Record<string, unknown> {
    const docs: Record<string, string> = {};
    for (const [p, n] of Object.entries(ws.fs)) {
      if (n.type === 'file' && n.owner === 'learner' && (p.startsWith(HOME + '/docs/') || p.startsWith(HOME + '/corso-cli/'))) docs[displayPath(p)] = n.content;
    }
    return {
      exportedAt: new Date().toISOString(),
      note: 'Esportazione del workspace del Learning Lab. Tutti i dati sono simulati.',
      course,
      notes: ws.notes,
      files: docs,
      verifications: Object.fromEntries(Object.entries(ws.progress).map(([k, v]) => [k, { completions: v.completions, lastVerify: v.lastVerify ?? null }])),
      predictions: ws.predictions,
      preferences: ws.prefs,
    };
  }

  function buildReport(ws: WorkspaceState): string {
    const lines: string[] = ['# Report di verifica', '', `Ambiente: ${ws.activeEnv} (servizio simulato)`, ''];
    for (const l of LESSONS) {
      const v = ws.progress[l.id]?.lastVerify;
      if (!v) continue;
      lines.push(`## ${l.id} — ${l.title} (${v.shell === 'bash' ? 'Bash' : 'PowerShell'}): ${v.pass ? 'SUPERATA' : 'NON SUPERATA'}`, '');
      lines.push('| Controllo | Atteso | Ottenuto | Esito |', '|---|---|---|---|');
      for (const c of v.checks) lines.push(`| ${c.description} | ${c.expected} | ${c.actual.replace(/\|/g, '/')} | ${c.pass ? 'ok' : 'differenza'} |`);
      lines.push('');
    }
    lines.push('## Ultime richieste al servizio', '', '| Ora simulata | Metodo | Percorso | Status | Request ID |', '|---|---|---|---|---|');
    for (const e of ws.api.log.slice(-25)) lines.push(`| ${e.at} | ${e.method} | ${e.path} | ${e.status} | ${e.requestId} |`);
    return lines.join('\n') + '\n';
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const root = resolve(cfg.webRoot);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !extname(rel)) rel = '/index.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('Vietato');
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Non trovato');
      return;
    }
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': rel === '/sw.js' ? 'no-cache' : 'no-cache', 'Service-Worker-Allowed': '/' });
    createReadStream(file).pipe(res);
  }

  return createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    const ip = clientIp(req);
    const now = Date.now();
    const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > 1200) {
      sendJson(res, 429, { error: 'rate_limited', message: 'Troppe richieste: rallenta.' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      serveStatic(req, res, url);
      return;
    }
    // le richieste dello stesso workspace sono serializzate
    const key = cfg.singleUser ? 'student' : String(req.headers['x-workspace'] ?? 'anon');
    const prev = locks.get(key) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(() => api(req, res, url))
      .catch((e: unknown) => {
        if (e instanceof HttpError) sendJson(res, e.status, { error: 'request_failed', message: e.message });
        else {
          console.error(e);
          sendJson(res, 500, { error: 'internal_error', message: 'Errore interno del laboratorio.' });
        }
      });
    locks.set(key, run);
    void run.finally(() => {
      if (locks.get(key) === run) locks.delete(key);
    });
  });
}
