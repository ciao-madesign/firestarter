/** Interprete Bash: espansioni, redirezioni, pipeline, strutture di controllo. */
import { findDoc, renderHelp } from '../catalog.ts';
import { LIMITS, type ShellState, type WorkspaceState } from '../types.ts';
import { FsError, HOME, Vfs, basename, fsErrorMessage, glob, hasGlob, resolvePath } from '../vfs.ts';
import { BashSyntaxError, Incomplete, Parser, parseBash, type Node, type Redir, type Seg, type Word } from './parser.ts';

export interface Io {
  stdin: string;
  out(t: string): void;
  err(t: string): void;
  tty: boolean;
}

export type CmdFn = (args: string[], io: Io, rt: BashRuntime) => number;

export class ExitSignal {
  constructor(public code: number) {}
}
export class ReturnSignal {
  constructor(public code: number) {}
}
export class LoopSignal {
  constructor(
    public kind: 'break' | 'continue',
    public levels: number,
  ) {}
}
export class LimitError extends Error {}

interface Frame {
  args: string[];
  locals: Record<string, string>;
  fn: string | null;
}

export const COMMANDS = new Map<string, CmdFn>();
export const BUILTINS = new Set<string>();

const NO_HELP = new Set(['echo', 'true', 'false', ':', '[', 'test', 'printf', 'man', 'help']);

export class BashRuntime {
  vfs: Vfs;
  ss: ShellState;
  frames: Frame[] = [{ args: [], locals: {}, fn: null }];
  scriptName = 'bash';
  steps = 0;
  outBytes = 0;
  errexit = false;
  inCond = 0;
  depth = 0;
  clearRequested = false;
  private fnCache = new Map<string, Node>();
  private random = 1234;

  constructor(public state: WorkspaceState) {
    this.vfs = new Vfs(state.fs, () => state.clock);
    this.ss = state.shells.bash;
  }

  get cwd(): string {
    return this.ss.cwd;
  }
  resolve(p: string): string {
    return resolvePath(p, this.ss.cwd);
  }

  tick(): void {
    if (++this.steps > LIMITS.maxSteps) throw new LimitError('limite di esecuzione superato (troppi passi: possibile ciclo infinito)');
  }

  // ---------- variabili ----------
  get(name: string): string | undefined {
    const top = this.frames[this.frames.length - 1];
    switch (name) {
      case '?':
        return String(this.ss.lastExit);
      case '#':
        return String(top.args.length);
      case '@':
      case '*':
        return top.args.join(' ');
      case '$':
        return '4242';
      case '0':
        return this.scriptName;
      case '!':
        return '';
      case '-':
        return 'hB';
      case 'RANDOM':
        this.random = (this.random * 1103515245 + 12345) & 0x7fffffff;
        return String(this.random % 32768);
      case 'PWD':
        return this.ss.cwd;
      case 'HOSTNAME':
        return 'lab';
      case 'UID':
        return '1000';
    }
    if (/^\d+$/.test(name)) return top.args[parseInt(name, 10) - 1];
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i].locals) return this.frames[i].locals[name];
    }
    const v = this.ss.vars[name];
    if (typeof v === 'string') return v;
    return this.ss.env[name];
  }

  set(name: string, value: string): void {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i].locals) {
        this.frames[i].locals[name] = value;
        return;
      }
    }
    if (name in this.ss.env) this.ss.env[name] = value;
    else this.ss.vars[name] = value;
  }

  // ---------- esecuzione di sorgente ----------
  /** Esegue sorgente nel contesto corrente. Può lanciare ExitSignal. */
  runSource(src: string, io: Io): number {
    let node: Node;
    try {
      node = parseBash(src);
    } catch (e) {
      if (e instanceof BashSyntaxError) {
        io.err(`${this.scriptName}: ${e.message}\n`);
        this.ss.lastExit = 2;
        return 2;
      }
      if (e instanceof Incomplete) {
        io.err(`${this.scriptName}: syntax error: unexpected end of file\n`);
        this.ss.lastExit = 2;
        return 2;
      }
      throw e;
    }
    return this.exec(node, io);
  }

  /** Esegue in un "processo figlio": non influenza cwd e variabili del chiamante. */
  runChild(src: string, args: string[], name: string, io: Io): number {
    const saved = { cwd: this.ss.cwd, vars: this.ss.vars, env: { ...this.ss.env }, fns: this.ss.functions, last: this.ss.lastExit };
    const savedName = this.scriptName;
    const savedErr = this.errexit;
    this.ss.vars = {};
    this.ss.functions = {};
    this.frames.push({ args, locals: {}, fn: null });
    this.scriptName = name;
    this.errexit = false;
    let code: number;
    try {
      code = this.runSource(src, io);
    } catch (e) {
      if (e instanceof ExitSignal) code = e.code;
      else if (e instanceof ReturnSignal) code = e.code;
      else throw e;
    } finally {
      this.frames.pop();
      this.ss.cwd = saved.cwd;
      this.ss.vars = saved.vars;
      this.ss.env = saved.env;
      this.ss.functions = saved.fns;
      this.scriptName = savedName;
      this.errexit = savedErr;
    }
    this.ss.lastExit = saved.last;
    return code;
  }

  capture(src: string, io: Io): string {
    let buf = '';
    const sub: Io = { stdin: '', out: (t) => (buf += t), err: (t) => io.err(t), tty: false };
    const savedCwd = this.ss.cwd;
    try {
      this.runSource(src, sub);
    } catch (e) {
      if (!(e instanceof ExitSignal)) throw e;
      this.ss.lastExit = e.code;
    }
    this.ss.cwd = savedCwd;
    return buf.replace(/\n+$/, '');
  }

  // ---------- espansioni ----------
  private braceExpand(word: Word): Word[] {
    for (let i = 0; i < word.length; i++) {
      const s = word[i];
      if (s.t !== 'text' || s.q) continue;
      const m = this.findBrace(s.v);
      if (!m) continue;
      const alts = m.alts;
      const out: Word[] = [];
      for (const a of alts) {
        const w: Word = [...word.slice(0, i), { t: 'text', v: s.v.slice(0, m.start) + a + s.v.slice(m.end + 1), q: false }, ...word.slice(i + 1)];
        out.push(...this.braceExpand(w));
      }
      return out;
    }
    return [word];
  }

  private findBrace(s: string): { start: number; end: number; alts: string[] } | null {
    const start = s.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) {
          const inner = s.slice(start + 1, i);
          const range = /^(-?\d+)\.\.(-?\d+)$/.exec(inner);
          if (range) {
            const a = parseInt(range[1], 10);
            const b = parseInt(range[2], 10);
            const alts: string[] = [];
            const step = a <= b ? 1 : -1;
            for (let v = a; step > 0 ? v <= b : v >= b; v += step) alts.push(String(v));
            return { start, end: i, alts };
          }
          const cr = /^([a-z])\.\.([a-z])$/.exec(inner);
          if (cr) {
            const alts: string[] = [];
            const a = cr[1].charCodeAt(0);
            const b = cr[2].charCodeAt(0);
            for (let v = a; v <= b; v++) alts.push(String.fromCharCode(v));
            return { start, end: i, alts };
          }
          const alts: string[] = [];
          let d = 0;
          let cur = '';
          for (const c of inner) {
            if (c === '{') d++;
            if (c === '}') d--;
            if (c === ',' && d === 0) {
              alts.push(cur);
              cur = '';
            } else cur += c;
          }
          alts.push(cur);
          if (alts.length > 1) return { start, end: i, alts };
          return null;
        }
      }
    }
    return null;
  }

  private segValue(seg: Seg, io: Io, next?: Seg): { v: string; multi?: string[] } {
    switch (seg.t) {
      case 'text':
        return { v: seg.v };
      case 'tilde': {
        const n = next;
        if (!n || (n.t === 'text' && n.v.startsWith('/') && !n.q)) return { v: this.get('HOME') ?? HOME };
        return { v: '~' };
      }
      case 'cmd': {
        const out = this.capture(seg.src, io);
        return { v: out };
      }
      case 'arith':
        return { v: String(this.arith(this.expandStr(this.parseInner(seg.expr), io))) };
      case 'var': {
        if (seg.q && seg.name === '@') {
          const args = this.frames[this.frames.length - 1].args;
          return { v: args.join(' '), multi: args };
        }
        const val = this.get(seg.name);
        if (seg.op === '#') return { v: String((val ?? '').length) };
        if (seg.op) {
          const colon = seg.op.startsWith(':');
          const kind = seg.op.replace(':', '');
          const unset = val === undefined || (colon && val === '');
          const arg = seg.arg ? this.expandStr(seg.arg, io) : '';
          if (kind === '-') return { v: unset ? arg : val! };
          if (kind === '=') {
            if (unset) {
              this.set(seg.name, arg);
              return { v: arg };
            }
            return { v: val! };
          }
          if (kind === '+') return { v: unset ? '' : arg };
          if (kind === '?') {
            if (unset) throw new BashSyntaxError(`${seg.name}: ${arg || 'parameter null or not set'}`);
            return { v: val! };
          }
        }
        return { v: val ?? '' };
      }
    }
  }

  private parseInner(src: string): Word {
    return new Parser(src).readWordAllowSpaces();
  }

  expandStr(word: Word, io: Io): string {
    let out = '';
    for (let i = 0; i < word.length; i++) {
      out += this.segValue(word[i], io, word[i + 1]).v;
    }
    return out;
  }

  expandFields(word: Word, io: Io): string[] {
    const results: string[] = [];
    for (const w of this.braceExpand(word)) {
      const fields: { text: string; glob: boolean }[] = [];
      let cur = { text: '', glob: false, started: false };
      const boundary = (): void => {
        if (cur.started) fields.push({ text: cur.text, glob: cur.glob });
        cur = { text: '', glob: false, started: false };
      };
      for (let i = 0; i < w.length; i++) {
        const seg = w[i];
        const { v, multi } = this.segValue(seg, io, w[i + 1]);
        if (multi) {
          multi.forEach((m, idx) => {
            if (idx > 0) boundary();
            cur.text += m;
            cur.started = true;
          });
          continue;
        }
        const quoted = seg.t === 'text' ? seg.q : seg.t === 'tilde' ? true : seg.q;
        if (quoted) {
          cur.text += v;
          cur.started = true;
        } else if (seg.t === 'text') {
          cur.text += v;
          cur.started = true;
          if (hasGlob(v)) cur.glob = true;
        } else {
          // espansione non quotata: field splitting
          const parts = v.split(/[ \t\n]+/);
          if (/^[ \t\n]/.test(v)) boundary();
          parts.forEach((p, idx) => {
            if (p === '') return;
            if (idx > 0) boundary();
            cur.text += p;
            cur.started = true;
            if (hasGlob(p)) cur.glob = true;
          });
          if (/[ \t\n]$/.test(v) && v.length) boundary();
        }
      }
      boundary();
      for (const f of fields) {
        if (f.glob) {
          const m = glob(this.vfs, f.text, this.ss.cwd);
          results.push(...(m.length ? m : [f.text]));
        } else results.push(f.text);
      }
    }
    return results;
  }

  arith(expr: string): number {
    const toks = expr.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|&&|\|\||[-+*/%()<>!]/g) ?? [];
    let p = 0;
    const val = (): number => {
      const t = toks[p++];
      if (t === undefined) throw new BashSyntaxError('syntax error in expression');
      if (t === '(') {
        const v = or();
        p++;
        return v;
      }
      if (t === '-') return -val();
      if (t === '+') return val();
      if (t === '!') return val() ? 0 : 1;
      if (/^\d+$/.test(t)) return parseInt(t, 10);
      const raw = this.get(t);
      const n = parseInt(raw ?? '0', 10);
      return Number.isNaN(n) ? 0 : n;
    };
    const mul = (): number => {
      let v = val();
      while (toks[p] === '*' || toks[p] === '/' || toks[p] === '%') {
        const op = toks[p++];
        const r = val();
        if ((op === '/' || op === '%') && r === 0) throw new BashSyntaxError('division by 0');
        v = op === '*' ? v * r : op === '/' ? Math.trunc(v / r) : v % r;
      }
      return v;
    };
    const add = (): number => {
      let v = mul();
      while (toks[p] === '+' || toks[p] === '-') v = toks[p++] === '+' ? v + mul() : v - mul();
      return v;
    };
    const rel = (): number => {
      let v = add();
      while (['<', '>', '<=', '>=', '==', '!='].includes(toks[p])) {
        const op = toks[p++];
        const r = add();
        v = Number(op === '<' ? v < r : op === '>' ? v > r : op === '<=' ? v <= r : op === '>=' ? v >= r : op === '==' ? v === r : v !== r);
      }
      return v;
    };
    const and = (): number => {
      let v = rel();
      while (toks[p] === '&&') {
        p++;
        const r = rel();
        v = Number(!!v && !!r);
      }
      return v;
    };
    const or = (): number => {
      let v = and();
      while (toks[p] === '||') {
        p++;
        const r = and();
        v = Number(!!v || !!r);
      }
      return v;
    };
    return or();
  }

  // ---------- esecuzione dei nodi ----------
  exec(node: Node, io: Io): number {
    this.tick();
    switch (node.type) {
      case 'list': {
        let code = this.ss.lastExit;
        for (const item of node.items) {
          code = this.exec(item, io);
          this.ss.lastExit = code;
          if (this.errexit && code !== 0 && this.inCond === 0) throw new ExitSignal(code);
        }
        return code;
      }
      case 'andor': {
        this.inCond++;
        try {
          let code = this.exec(node.first, io);
          this.ss.lastExit = code;
          for (const { op, node: n } of node.rest) {
            if ((op === '&&' && code === 0) || (op === '||' && code !== 0)) {
              code = this.exec(n, io);
              this.ss.lastExit = code;
            }
          }
          return code;
        } finally {
          this.inCond--;
        }
      }
      case 'pipeline':
        return this.execPipeline(node, io);
      case 'simple':
        return this.execSimple(node, io);
      case 'if': {
        for (const b of node.branches) {
          this.inCond++;
          let c: number;
          try {
            c = this.exec(b.cond, io);
          } finally {
            this.inCond--;
          }
          if (c === 0) return this.exec(b.body, io);
        }
        return node.else ? this.exec(node.else, io) : 0;
      }
      case 'for': {
        const items = node.words ? node.words.flatMap((w) => this.expandFields(w, io)) : this.frames[this.frames.length - 1].args;
        let code = 0;
        for (const it of items) {
          this.tick();
          this.set(node.name, it);
          try {
            code = this.exec(node.body, io);
          } catch (e) {
            if (e instanceof LoopSignal) {
              if (e.levels > 1) throw new LoopSignal(e.kind, e.levels - 1);
              if (e.kind === 'break') break;
              continue;
            }
            throw e;
          }
        }
        return code;
      }
      case 'while': {
        let code = 0;
        for (;;) {
          this.tick();
          this.inCond++;
          let c: number;
          try {
            c = this.exec(node.cond, io);
          } finally {
            this.inCond--;
          }
          if (node.until ? c === 0 : c !== 0) break;
          try {
            code = this.exec(node.body, io);
          } catch (e) {
            if (e instanceof LoopSignal) {
              if (e.levels > 1) throw new LoopSignal(e.kind, e.levels - 1);
              if (e.kind === 'break') break;
              continue;
            }
            throw e;
          }
        }
        return code;
      }
      case 'func':
        this.ss.functions[node.name] = { body: node.src };
        return 0;
      case 'group': {
        const run = (io2: Io): number => {
          if (node.subshell) {
            const saved = { cwd: this.ss.cwd, vars: { ...this.ss.vars }, env: { ...this.ss.env } };
            try {
              return this.exec(node.body, io2);
            } catch (e) {
              if (e instanceof ExitSignal) return e.code;
              throw e;
            } finally {
              this.ss.cwd = saved.cwd;
              this.ss.vars = saved.vars;
              this.ss.env = saved.env;
            }
          }
          return this.exec(node.body, io2);
        };
        if (!node.redirs.length) return run(io);
        const r = this.applyRedirs(node.redirs, io);
        if (!r) return 1;
        try {
          return run(r.io);
        } finally {
          r.finish();
        }
      }
    }
  }

  private execPipeline(node: Extract<Node, { type: 'pipeline' }>, io: Io): number {
    let input = io.stdin;
    let code = 0;
    node.cmds.forEach((cmd, i) => {
      const last = i === node.cmds.length - 1;
      let buf = '';
      const stageIo: Io = last
        ? { ...io, stdin: input }
        : { stdin: input, out: (t) => (buf += t), err: io.err, tty: false };
      this.inCond++;
      try {
        code = this.exec(cmd, stageIo);
      } finally {
        this.inCond--;
      }
      input = buf;
    });
    return node.negate ? (code === 0 ? 1 : 0) : code;
  }

  // ---------- redirezioni ----------
  applyRedirs(redirs: Redir[], io: Io): { io: Io; finish: () => void } | null {
    type Target = { kind: 'out' | 'err' | 'file' | 'null'; path?: string; buf: string };
    let stdout: Target = { kind: 'out', buf: '' };
    let stderr: Target = { kind: 'err', buf: '' };
    let stdin = io.stdin;
    const files: Target[] = [];
    for (const r of redirs) {
      if (r.op === '<<') {
        stdin = r.heredocQuoted ? (r.heredoc ?? '') : this.expandStr(this.parseInner(r.heredoc ?? ''), io);
        continue;
      }
      if (r.op === '<<<') {
        stdin = this.expandStr(r.target, io) + '\n';
        continue;
      }
      if (r.op === '>&') {
        const t = this.expandStr(r.target, io);
        if (t === '1') {
          if (r.fd === 2) stderr = stdout;
        } else if (t === '2') {
          if (r.fd === 1) stdout = stderr;
        } else if (t === '-') {
          /* chiusura */
        } else {
          io.err(`bash: ${t}: ambiguous redirect\n`);
          return null;
        }
        continue;
      }
      const path = this.expandStr(r.target, io);
      if (r.op === '<') {
        if (path === '/dev/null') {
          stdin = '';
          continue;
        }
        try {
          stdin = this.vfs.readFile(this.resolve(path));
        } catch (e) {
          io.err(`bash: ${path}: ${e instanceof FsError ? fsErrorMessage(e, path) : String(e)}\n`);
          return null;
        }
        continue;
      }
      // > o >>
      let target: Target;
      if (path === '/dev/null') target = { kind: 'null', buf: '' };
      else {
        const abs = this.resolve(path);
        try {
          if (this.vfs.isDir(abs)) throw new FsError('EISDIR', abs);
          if (r.op === '>') this.vfs.writeFile(abs, '');
          else if (!this.vfs.exists(abs)) this.vfs.writeFile(abs, '');
          else if (!this.vfs.canWrite(abs)) throw new FsError('EACCES', abs);
        } catch (e) {
          io.err(`bash: ${path}: ${e instanceof FsError ? fsErrorMessage(e, path) : String(e)}\n`);
          return null;
        }
        target = { kind: 'file', path: abs, buf: '' };
        files.push(target);
      }
      if (r.fd === -1) {
        stdout = target;
        stderr = target;
      } else if (r.fd === 2) stderr = target;
      else stdout = target;
    }
    const sink = (t: Target): ((s: string) => void) => {
      if (t.kind === 'out') return (s) => io.out(s);
      if (t.kind === 'err') return (s) => io.err(s);
      if (t.kind === 'null') return () => undefined;
      return (s) => {
        t.buf += s;
      };
    };
    const newIo: Io = { stdin, out: sink(stdout), err: sink(stderr), tty: stdout.kind === 'out' && io.tty };
    return {
      io: newIo,
      finish: () => {
        for (const f of files) {
          if (f.buf) {
            try {
              this.vfs.writeFile(f.path!, f.buf, true);
            } catch (e) {
              io.err(`bash: ${basename(f.path!)}: ${e instanceof FsError ? fsErrorMessage(e, f.path!) : String(e)}\n`);
            }
          }
        }
      },
    };
  }

  // ---------- comando semplice ----------
  private execSimple(node: Extract<Node, { type: 'simple' }>, io: Io): number {
    const assigns = node.assigns.map((a) => ({ name: a.name, value: this.expandStr(a.value, io), append: a.append }));
    const words = node.words.flatMap((w) => this.expandFields(w, io));
    if (!words.length) {
      const r = node.redirs.length ? this.applyRedirs(node.redirs, io) : null;
      if (node.redirs.length && !r) return 1;
      for (const a of assigns) this.set(a.name, a.append ? (this.get(a.name) ?? '') + a.value : a.value);
      r?.finish();
      return 0;
    }
    // assegnazioni temporanee per il comando
    const saved: { name: string; had: boolean; inEnv: boolean; old: string | undefined }[] = [];
    for (const a of assigns) {
      saved.push({ name: a.name, had: a.name in this.ss.env, inEnv: a.name in this.ss.env, old: this.ss.env[a.name] });
      this.ss.env[a.name] = a.value;
    }
    let ioX = io;
    let finish = (): void => undefined;
    if (node.redirs.length) {
      const r = this.applyRedirs(node.redirs, io);
      if (!r) {
        this.restoreEnv(saved);
        return 1;
      }
      ioX = r.io;
      finish = r.finish;
    }
    try {
      const code = this.runCommand(words[0], words.slice(1), ioX);
      return code;
    } finally {
      finish();
      this.restoreEnv(saved);
    }
  }

  private restoreEnv(saved: { name: string; had: boolean; old: string | undefined }[]): void {
    for (const s of saved.reverse()) {
      if (s.had) this.ss.env[s.name] = s.old as string;
      else delete this.ss.env[s.name];
    }
  }

  runCommand(name: string, args: string[], io: Io): number {
    this.tick();
    if (name.includes('/')) return this.runPath(name, args, io);
    const fn = this.ss.functions[name];
    if (fn) return this.callFunction(name, fn.body, args, io);
    const cmd = COMMANDS.get(name);
    // `comando --help`: guida dal catalogo (come i comandi reali; echo, true, false, [ e test non la prevedono)
    if (cmd && args[0] === '--help' && !NO_HELP.has(name) && findDoc(name, 'bash')) {
      io.out(renderHelp(name, 'bash'));
      return 0;
    }
    if (cmd) {
      try {
        return cmd(args, io, this);
      } catch (e) {
        if (e instanceof BashSyntaxError) {
          io.err(`bash: ${e.message}\n`);
          return 1;
        }
        throw e;
      }
    }
    io.err(`bash: ${name}: command not found\n`);
    return 127;
  }

  callFunction(name: string, body: string, args: string[], io: Io): number {
    if (++this.depth > 50) {
      this.depth--;
      throw new LimitError('limite di ricorsione superato');
    }
    let node = this.fnCache.get(body);
    if (!node) {
      node = parseBash(body);
      this.fnCache.set(body, node);
    }
    this.frames.push({ args, locals: {}, fn: name });
    try {
      return this.exec(node, io);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.code;
      throw e;
    } finally {
      this.frames.pop();
      this.depth--;
    }
  }

  runPath(path: string, args: string[], io: Io): number {
    const abs = this.resolve(path);
    if (!this.vfs.exists(abs)) {
      io.err(`bash: ${path}: No such file or directory\n`);
      return 127;
    }
    if (this.vfs.isDir(abs)) {
      io.err(`bash: ${path}: Is a directory\n`);
      return 126;
    }
    if (!this.vfs.canExec(abs)) {
      io.err(`bash: ${path}: Permission denied\n`);
      return 126;
    }
    const src = this.vfs.readFile(abs);
    if (/^#!.*(pwsh|powershell)/.test(src)) {
      io.err(`bash: ${path}: lo script richiede PowerShell, usa la shell PowerShell\n`);
      return 126;
    }
    return this.runChild(src, args, path, io);
  }
}

/** Esegue una riga/script in modalità interattiva. */
export function runBashLine(rt: BashRuntime, line: string, io: Io): { code: number; incomplete: boolean } {
  let node: Node;
  try {
    node = parseBash(line);
  } catch (e) {
    if (e instanceof Incomplete) return { code: 0, incomplete: true };
    if (e instanceof BashSyntaxError) {
      io.err(`bash: ${e.message}\n`);
      return { code: 2, incomplete: false };
    }
    throw e;
  }
  try {
    return { code: rt.exec(node, io), incomplete: false };
  } catch (e) {
    if (e instanceof ExitSignal) return { code: e.code, incomplete: false };
    if (e instanceof ReturnSignal) return { code: e.code, incomplete: false };
    if (e instanceof LoopSignal) return { code: 0, incomplete: false };
    if (e instanceof BashSyntaxError) {
      io.err(`bash: ${e.message}\n`);
      return { code: 1, incomplete: false };
    }
    if (e instanceof LimitError) {
      io.err(`bash: ${e.message}\n`);
      return { code: 130, incomplete: false };
    }
    throw e;
  }
}
