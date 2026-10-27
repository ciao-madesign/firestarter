/** Interprete Bash: espansioni, redirezioni, pipeline, strutture di controllo. */
import { findDoc, renderHelp } from '../catalog.ts';
import { caseModify, replacePattern, sliceList, substring, trimPrefix, trimSuffix, patternRegExp } from './param.ts';
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
  locals: Record<string, unknown>;
  fn: string | null;
}

export const COMMANDS = new Map<string, CmdFn>();
export const BUILTINS = new Set<string>();

export function isAssoc(v: unknown): v is { __assoc: Record<string, string> } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && '__assoc' in (v as object);
}

const NO_HELP = new Set(['echo', 'true', 'false', ':', '[', 'test', 'printf', 'man', 'help']);

export class BashRuntime {
  vfs: Vfs;
  ss: ShellState;
  frames: Frame[] = [{ args: [], locals: {}, fn: null }];
  scriptName = 'bash';
  steps = 0;
  outBytes = 0;
  errexit = false;
  pipefail = false;
  nounset = false;
  /** codici di uscita degli stadi dell'ultima pipeline (PIPESTATUS) */
  lastPipe: number[] | undefined;
  xtrace = false;
  traps: Record<string, string> = {};
  /** descrittori ≥ 3 aperti con `exec N>file` */
  fds: Record<number, string> = {};
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
    const raw = this.rawVar(name);
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.length ? (raw[0] ?? '') : undefined;
    if (isAssoc(raw)) return raw.__assoc['0'];
    if (raw === undefined && name === 'IFS') return ' \t\n';
    return undefined;
  }

  // ---------- array e variabili composte ----------
  /** valore grezzo di una variabile: stringa, array indicizzato (null = indice non definito) o associativo ({__assoc}) */
  rawVar(name: string): unknown {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i].locals) return this.frames[i].locals[name];
    }
    if (name in this.ss.vars) return this.ss.vars[name];
    return this.ss.env[name];
  }

  private holderOf(name: string, forceLocal = false): Record<string, unknown> {
    if (forceLocal) return this.frames[this.frames.length - 1].locals;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i].locals) return this.frames[i].locals;
    }
    if (name in this.ss.env) return this.ss.env;
    return this.ss.vars;
  }

  /** dichiara una variabile composta vuota (declare -a / -A) */
  declareArray(name: string, assoc: boolean, local = false): void {
    const h = this.holderOf(name, local);
    const cur = h[name];
    if (assoc ? isAssoc(cur) : Array.isArray(cur)) return;
    h[name] = assoc ? { __assoc: {} } : typeof cur === 'string' ? [cur] : [];
  }

  private keyOf(name: string, index: Word, io: Io): string | number {
    const raw = this.rawVar(name);
    const text = this.expandStr(index, io);
    if (isAssoc(raw)) return text;
    let n = this.arith(text);
    if (n < 0) n += Array.isArray(raw) ? raw.length : typeof raw === 'string' ? 1 : 0;
    return n;
  }

  setElement(name: string, key: string | number, value: string, append = false, local = false): void {
    const h = this.holderOf(name, local);
    let cur = h[name];
    if (isAssoc(cur)) {
      cur.__assoc[String(key)] = (append ? (cur.__assoc[String(key)] ?? '') : '') + value;
      return;
    }
    if (!Array.isArray(cur)) {
      cur = typeof cur === 'string' ? [cur] : [];
      h[name] = cur;
    }
    const arr = cur as (string | null)[];
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0) throw new BashSyntaxError(`${name}[${key}]: bad array subscript`);
    while (arr.length < i) arr.push(null);
    arr[i] = (append ? (arr[i] ?? '') : '') + value;
  }

  /** name=(...) / name+=(...) */
  assignArray(name: string, lit: { key?: Word; value: Word }[], append: boolean, io: Io, local = false, assoc?: boolean): void {
    const h = this.holderOf(name, local);
    const cur = h[name];
    const isA = assoc ?? isAssoc(cur);
    if (isA) {
      const m: Record<string, string> = append && isAssoc(cur) ? cur.__assoc : {};
      let pending: string | null = null;
      for (const el of lit) {
        if (el.key) m[this.expandStr(el.key, io)] = this.expandStr(el.value, io);
        else if (pending === null) pending = this.expandStr(el.value, io);
        else {
          m[pending] = this.expandStr(el.value, io);
          pending = null;
        }
      }
      h[name] = { __assoc: m };
      return;
    }
    const arr: (string | null)[] = append && Array.isArray(cur) ? cur : append && typeof cur === 'string' ? [cur] : [];
    let next = arr.length;
    for (const el of lit) {
      if (el.key) {
        const k = this.arith(this.expandStr(el.key, io));
        while (arr.length < k) arr.push(null);
        arr[k] = this.expandStr(el.value, io);
        next = k + 1;
      } else {
        for (const f of this.expandFields(el.value, io)) {
          while (arr.length < next) arr.push(null);
          arr[next++] = f;
        }
      }
    }
    h[name] = arr;
  }

  set(name: string, value: string): void {
    if (name === 'IFS' && value !== ' \t\n') throw new BashSyntaxError('IFS personalizzato non supportato nel laboratorio');
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (name in this.frames[i].locals) {
        const cur = this.frames[i].locals[name];
        if (Array.isArray(cur)) cur[0] = value;
        else if (isAssoc(cur)) cur.__assoc['0'] = value;
        else this.frames[i].locals[name] = value;
        return;
      }
    }
    const cur = this.ss.vars[name];
    if (Array.isArray(cur)) cur[0] = value;
    else if (isAssoc(cur)) cur.__assoc['0'] = value;
    else if (name in this.ss.env) this.ss.env[name] = value;
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
    const savedTraps = this.traps;
    this.traps = {};
    let code: number;
    try {
      try {
        code = this.runSource(src, io);
      } catch (e) {
        if (e instanceof ExitSignal) code = e.code;
        else if (e instanceof ReturnSignal) code = e.code;
        else throw e;
      }
      // trap ... EXIT: eseguito alla fine dello script, anche dopo `exit`
      const onExit = this.traps.EXIT;
      if (onExit) {
        this.traps = {};
        try {
          this.runSource(onExit, io);
        } catch (e) {
          if (!(e instanceof ExitSignal)) throw e;
        }
      }
    } finally {
      this.traps = savedTraps;
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

  private procN = 0;
  /** esito dell'ultima sostituzione di comando: `x=$(cmd)` termina con quello stato */
  private subStatus: number | null = null;

  capture(src: string, io: Io, keepNl = false): string {
    let buf = '';
    const sub: Io = { stdin: '', out: (t) => (buf += t), err: (t) => io.err(t), tty: false };
    const savedCwd = this.ss.cwd;
    try {
      this.subStatus = this.runSource(src, sub);
    } catch (e) {
      if (!(e instanceof ExitSignal)) throw e;
      this.ss.lastExit = e.code;
      this.subStatus = e.code;
    }
    this.ss.cwd = savedCwd;
    return keepNl ? buf : buf.replace(/\n+$/, '');
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
        if (!n || (n.t === 'text' && (n.v.startsWith('/') || n.v.startsWith(':')) && !n.q)) return { v: this.get('HOME') ?? HOME };
        return { v: '~' };
      }
      case 'cmd': {
        const out = this.capture(seg.src, io);
        return { v: out };
      }
      case 'proc': {
        const text = this.capture(seg.src, io, true);
        const path = `/tmp/.procsub/${this.procN++ % 20}`;
        this.vfs.mkdir('/tmp/.procsub', true);
        this.vfs.writeFile(path, text);
        return { v: path };
      }
      case 'arith':
        return { v: String(this.arith(this.expandStr(this.parseInner(seg.expr), io))) };
      case 'var':
        return this.varValue(seg, io);
    }
  }

  /** Pattern di shell da una parola: le parti tra virgolette diventano letterali. */
  patternOf(word: Word, io: Io): string {
    const esc = (t: string): string => t.replace(/[\\*?[\]]/g, '\\$&');
    let out = '';
    for (let i = 0; i < word.length; i++) {
      const seg = word[i];
      const v = this.segValue(seg, io, word[i + 1]).v;
      out += seg.t !== 'tilde' && seg.q ? esc(v) : v;
    }
    return out;
  }

  private varValue(seg: Extract<Seg, { t: 'var' }>, io: Io): { v: string; multi?: string[] } {
    const name = seg.name;
    const pos = this.frames[this.frames.length - 1].args;
    // elenco di elementi (parametri posizionali o array) quando si usa @ / *
    let all: '@' | '*' | null = null;
    if (name === '@' || name === '*') all = name;
    let list: string[] | null = null;
    let single: string | undefined;
    const raw = this.rawVar(name);
    if (all) list = [...pos];
    else if (seg.index) {
      const idxTxt = seg.index.length === 1 && seg.index[0].t === 'text' ? seg.index[0].v : null;
      if (idxTxt === '@' || idxTxt === '*') {
        all = idxTxt;
        list = isAssoc(raw) ? Object.values(raw.__assoc) : Array.isArray(raw) ? (raw.filter((x) => x !== null) as string[]) : typeof raw === 'string' ? [raw] : [];
      } else {
        const key = this.keyOf(name, seg.index, io);
        single = isAssoc(raw) ? raw.__assoc[String(key)] : Array.isArray(raw) ? (raw[Number(key)] ?? undefined) : typeof raw === 'string' && Number(key) === 0 ? raw : undefined;
      }
    } else single = this.get(name);
    const isList = list !== null;
    const out = (vals: string[]): { v: string; multi?: string[] } => {
      // "$@" / "${a[@]}": un campo per elemento; $@ senza virgolette e "$*": un solo testo (poi diviso dalla shell)
      if (!seg.q || all === '*') return { v: vals.join(' ') };
      return { v: vals.join(' '), multi: vals };
    };
    if (this.nounset && !seg.op && !isList && single === undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new BashSyntaxError(`${name}: unbound variable`);
    const op = seg.op;
    if (op === '#len') return { v: String(isList ? list!.length : (single ?? '').length) };
    if (op === '!') {
      const keys = isAssoc(raw) ? Object.keys(raw.__assoc) : Array.isArray(raw) ? raw.map((x, i) => (x === null ? null : String(i))).filter((x): x is string => x !== null) : [];
      return out(keys);
    }
    const arg = seg.arg ? this.expandStr(seg.arg, io) : '';
    if (op === ':') {
      const off = this.arith(arg || '0');
      const len = seg.arg2 ? this.arith(this.expandStr(seg.arg2, io)) : undefined;
      if (isList) {
        // ${@:n} parte dal parametro n (1 = primo); sugli array l'offset è l'indice
        const base = name === '@' || name === '*' ? (off > 0 ? off - 1 : off) : off;
        return out(sliceList(list!, base, len));
      }
      return { v: substring(single ?? '', off, len) };
    }
    if (op && ['%', '%%', '#', '##', '/', '//', '/#', '/%', '^^', '^', ',,', ','].includes(op)) {
      const apply = (t: string): string => {
        switch (op) {
          case '%': return trimSuffix(t, this.expandStr(seg.arg ?? [], io), false);
          case '%%': return trimSuffix(t, this.expandStr(seg.arg ?? [], io), true);
          case '#': return trimPrefix(t, this.expandStr(seg.arg ?? [], io), false);
          case '##': return trimPrefix(t, this.expandStr(seg.arg ?? [], io), true);
          case '/': case '//': case '/#': case '/%':
            return replacePattern(t, this.expandStr(seg.arg ?? [], io), seg.arg2 ? this.expandStr(seg.arg2, io) : '', op);
          default: return caseModify(t, op);
        }
      };
      if (isList) return out(list!.map(apply));
      return { v: apply(single ?? '') };
    }
    const val = isList ? (list!.length ? list!.join(' ') : undefined) : single;
    if (op) {
      const colon = op.startsWith(':');
      const kind = op.replace(':', '');
      const unset = val === undefined || (colon && val === '');
      if (kind === '-') return { v: unset ? arg : val! };
      if (kind === '=') {
        if (unset) {
          this.set(name, arg);
          return { v: arg };
        }
        return { v: val! };
      }
      if (kind === '+') return { v: unset ? '' : arg };
      if (kind === '?') {
        if (unset) throw new BashSyntaxError(`${name}: ${arg || 'parameter null or not set'}`);
        return { v: val! };
      }
    }
    if (isList) return out(list!);
    return { v: val ?? '' };
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

  /** Aritmetica di shell ($((...)), let): interi, precedenza completa, assegnazioni e ++/-- su variabili. */
  arith(expr: string): number {
    const toks = expr.match(/0[xX][0-9a-fA-F]+|\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*=?|<<=?|>>=?|\+\+|--|&&|\|\||[=!<>]=|[-+*/%&|^]=|[-+*/%()<>!~&|^?:=,]/g) ?? [];
    let p = 0;
    const peek = (): string | undefined => toks[p];
    const num = (name: string): number => {
      const raw = this.get(name);
      const n = parseInt(raw ?? '0', 10);
      return Number.isNaN(n) ? 0 : n;
    };
    const bad = (): never => {
      throw new BashSyntaxError(`syntax error in expression (error token is "${toks[p] ?? ''}")`);
    };
    const isVar = (t: string | undefined): boolean => !!t && /^[A-Za-z_]/.test(t);
    const binPrec: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
    const apply = (op: string, a: number, b: number): number => {
      switch (op) {
        case '||': return Number(!!a || !!b);
        case '&&': return Number(!!a && !!b);
        case '|': return a | b;
        case '^': return a ^ b;
        case '&': return a & b;
        case '==': return Number(a === b);
        case '!=': return Number(a !== b);
        case '<': return Number(a < b);
        case '>': return Number(a > b);
        case '<=': return Number(a <= b);
        case '>=': return Number(a >= b);
        case '<<': return a << b;
        case '>>': return a >> b;
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '**': return b < 0 ? bad() : Math.pow(a, b);
        case '/':
        case '%':
          if (b === 0) throw new BashSyntaxError('division by 0 (error token is "0")');
          return op === '/' ? Math.trunc(a / b) : a % b;
      }
      return bad();
    };
    const unary = (): number => {
      const t = toks[p++];
      if (t === undefined) return bad();
      if (t === '(') {
        const v = comma();
        if (toks[p++] !== ')') bad();
        return power(v);
      }
      if (t === '-') return -unary();
      if (t === '+') return unary();
      if (t === '!') return unary() ? 0 : 1;
      if (t === '~') return ~unary();
      if (t === '++' || t === '--') {
        const name = toks[p++];
        if (!isVar(name)) return bad();
        const v = num(name) + (t === '++' ? 1 : -1);
        this.set(name, String(v));
        return v;
      }
      if (/^0[xX]/.test(t)) return power(parseInt(t, 16));
      if (/^\d+$/.test(t)) return power(/^0\d/.test(t) ? parseInt(t, 8) : parseInt(t, 10));
      if (isVar(t)) {
        if (toks[p] === '++' || toks[p] === '--') {
          const old = num(t);
          this.set(t, String(old + (toks[p++] === '++' ? 1 : -1)));
          return old;
        }
        return power(num(t));
      }
      return bad();
    };
    // `**` associativa a destra e con precedenza maggiore degli operatori unari
    const power = (base: number): number => {
      if (toks[p] === '**') {
        p++;
        return apply('**', base, unary());
      }
      return base;
    };
    const binary = (minPrec: number): number => {
      let left = unary();
      for (;;) {
        const op = peek();
        const prec = op ? binPrec[op] : undefined;
        if (prec === undefined || prec < minPrec) return left;
        p++;
        const right = binary(prec + 1);
        left = apply(op!, left, right);
      }
    };
    const ternary = (): number => {
      const c = binary(1);
      if (peek() === '?') {
        p++;
        const a = assign();
        if (toks[p++] !== ':') bad();
        const b = assign();
        return c ? a : b;
      }
      return c;
    };
    const assign = (): number => {
      // variabile seguita da un operatore di assegnazione
      if (isVar(toks[p]) && /^([-+*/%&|^]|<<|>>|\*\*)?=$/.test(toks[p + 1] ?? '') && toks[p + 1] !== '==') {
        const name = toks[p];
        const op = toks[p + 1].slice(0, -1);
        p += 2;
        const r = assign();
        const v = op ? apply(op, num(name), r) : r;
        this.set(name, String(v));
        return v;
      }
      return ternary();
    };
    const comma = (): number => {
      let v = assign();
      while (peek() === ',') {
        p++;
        v = assign();
      }
      return v;
    };
    if (!toks.length) return 0;
    const v = comma();
    if (p < toks.length) bad();
    return v;
  }

  // ---------- esecuzione dei nodi ----------
  exec(node: Node, io: Io): number {
    this.tick();
    switch (node.type) {
      case 'list': {
        let code = this.ss.lastExit;
        for (const item of node.items) {
          this.lastPipe = undefined;
          code = this.exec(item, io);
          this.ss.vars.PIPESTATUS = (this.lastPipe ?? [code]).map(String);
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
      case 'arith': {
        const v = this.arith(this.expandStr(this.parseInner(node.expr), io));
        return v === 0 ? 1 : 0;
      }
      case 'cfor': {
        const ev = (e: string): number => (e.trim() === '' ? 1 : this.arith(this.expandStr(this.parseInner(e), io)));
        ev(node.init);
        let code = 0;
        while (ev(node.cond) !== 0) {
          this.tick();
          try {
            code = this.exec(node.body, io);
          } catch (e) {
            if (e instanceof LoopSignal) {
              if (e.levels > 1) throw new LoopSignal(e.kind, e.levels - 1);
              if (e.kind === 'break') break;
            } else throw e;
          }
          ev(node.step);
        }
        return code;
      }
      case 'case': {
        const subject = this.expandStr(node.word, io);
        for (const item of node.items) {
          if (item.patterns.some((p) => patternRegExp(this.patternOf(p, io)).test(subject))) return this.exec(item.body, io);
        }
        return 0;
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
    let failed = 0;
    const codes: number[] = [];
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
      if (code !== 0) failed = code;
      codes.push(code);
      input = buf;
    });
    this.lastPipe = codes;
    if (this.pipefail && failed !== 0) code = failed;
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
      if (r.fd > 2 && (r.op === '>' || r.op === '>>')) {
        // N>file con N ≥ 3: il file viene creato, ma nessun comando semplice scrive su quel descrittore
        const p3 = this.expandStr(r.target, io);
        try {
          const abs3 = this.resolve(p3);
          if (r.op === '>' || !this.vfs.exists(abs3)) this.vfs.writeFile(abs3, '');
        } catch (e) {
          io.err(`bash: ${p3}: ${e instanceof FsError ? fsErrorMessage(e, p3) : String(e)}\n`);
          return null;
        }
        continue;
      }
      if (r.fd > 2 && r.op !== '<<' && r.op !== '<<<') {
        io.err(`bash: redirezione sul descrittore ${r.fd} non supportata nel laboratorio (usa solo 0, 1 e 2)\n`);
        return null;
      }
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
        } else if (/^\d+$/.test(t) && this.fds[Number(t)] !== undefined) {
          const target: Target = { kind: 'file', path: this.fds[Number(t)], buf: '' };
          files.push(target);
          if (r.fd === 2) stderr = target;
          else stdout = target;
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
    this.subStatus = null;
    const assigns = node.assigns.filter((a) => !a.index && !a.array).map((a) => ({ name: a.name, value: this.expandStr(a.value, io), append: a.append }));
    // name[i]=v e name=(...): assegnazioni persistenti (non possono essere esportate nell'ambiente del comando)
    for (const a of node.assigns) {
      if (a.post) continue;
      if (a.index) this.setElement(a.name, this.keyOf(a.name, a.index, io), this.expandStr(a.value, io), a.append);
      else if (a.array) this.assignArray(a.name, a.array, a.append, io);
    }
    const isDbl = node.words.length > 0 && node.words[0].length === 1 && node.words[0][0].t === 'text' && (node.words[0][0] as { v: string }).v === '[[';
    // dentro [[ ]] niente espansione di percorso né divisione in parole (a differenza di `[`)
    const words = isDbl ? node.words.map((w) => this.expandStr(w, io)) : node.words.flatMap((w) => this.expandFields(w, io));
    if (this.xtrace && words.length) io.err(`+ ${words.join(' ')}\n`);
    // `exec N>file` / `exec N>&-`: apre o chiude un descrittore persistente (solo N ≥ 3)
    if (words.length === 1 && words[0] === 'exec' && node.redirs.length) {
      for (const r of node.redirs) {
        const t = this.expandStr(r.target, io);
        if (r.fd >= 3 && (r.op === '>' || r.op === '>>')) {
          const abs = this.resolve(t);
          try {
            if (r.op === '>' || !this.vfs.exists(abs)) this.vfs.writeFile(abs, '');
          } catch (e) {
            io.err(`bash: ${t}: ${e instanceof FsError ? fsErrorMessage(e, t) : String(e)}\n`);
            return 1;
          }
          this.fds[r.fd] = abs;
        } else if (r.fd >= 3 && r.op === '>&' && t === '-') delete this.fds[r.fd];
        else {
          io.err('bash: exec con redirezioni dei descrittori 0-2 non è supportato nel laboratorio\n');
          return 1;
        }
      }
      return 0;
    }
    if (!words.length) {
      const r = node.redirs.length ? this.applyRedirs(node.redirs, io) : null;
      if (node.redirs.length && !r) return 1;
      for (const a of assigns) this.set(a.name, a.append ? (this.get(a.name) ?? '') + a.value : a.value);
      r?.finish();
      // come Bash: un'assegnazione con $(comando) termina con lo stato di quel comando
      return this.subStatus ?? 0;
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
      // declare -A m=(...) / local -a l=(...): il builtin ha già valutato le opzioni, ora si assegna
      for (const a of node.assigns) {
        if (!a.post) continue;
        const flags = words.slice(1).filter((w) => /^-[A-Za-z]+$/.test(w)).join('');
        const local = words[0] === 'local' || ((words[0] === 'declare' || words[0] === 'typeset') && this.frames.length > 1 && !flags.includes('g'));
        const assoc = flags.includes('A');
        this.declareArray(a.name, assoc, local);
        this.assignArray(a.name, a.array ?? [], a.append, io, local, assoc || undefined);
      }
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

  /** primo file eseguibile con quel nome nelle cartelle del PATH (comandi simulati esclusi) */
  pathLookup(name: string): string | null {
    for (const dir of (this.ss.env.PATH ?? '').split(':')) {
      if (!dir) continue;
      const cand = (dir.endsWith('/') ? dir : dir + '/') + name;
      const abs = this.resolve(cand);
      if (this.vfs.isFile(abs) && this.vfs.canExec(abs)) return abs;
    }
    return null;
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
    // ricerca nel PATH (solo file nel filesystem della simulazione); come Bash: un file non eseguibile dà "Permission denied"
    for (const dir of (this.ss.env.PATH ?? '').split(':')) {
      if (!dir) continue;
      const cand = (dir.endsWith('/') ? dir : dir + '/') + name;
      if (this.vfs.isFile(this.resolve(cand))) return this.runPath(cand, args, io);
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
