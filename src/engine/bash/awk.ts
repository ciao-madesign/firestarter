/**
 * Interprete awk (sottoinsieme POSIX): BEGIN/END, pattern e intervalli, variabili e campi, array associativi,
 * if/while/do/for/for-in, funzioni utente, printf/sprintf e le funzioni di stringa e numeriche più comuni.
 * Non supportati (errore esplicito): getline, system(), pipe e redirezioni di print, RS diverso da newline.
 */

export class AwkError extends Error {}

type Val = number | string | { s: string }; // { s } = stringa numerica (campi, input): confronto numerico se sembra un numero

// ---------------- lessico ----------------
interface Tok {
  t: 'num' | 'str' | 'ere' | 'name' | 'func' | 'op' | 'nl' | 'eof';
  v: string;
}

const KEYWORDS = new Set(['BEGIN', 'END', 'if', 'else', 'while', 'for', 'do', 'break', 'continue', 'next', 'exit', 'return', 'delete', 'in', 'print', 'printf', 'function', 'func', 'getline']);
const BUILTINS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'toupper', 'tolower', 'sprintf', 'int', 'sqrt', 'exp', 'log', 'sin', 'cos', 'atan2', 'rand', 'srand', 'system']);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const valueEnd = (): boolean => {
    const p = toks[toks.length - 1];
    if (!p) return false;
    if (p.t === 'name') return !KEYWORDS.has(p.v);
    return p.t === 'num' || p.t === 'str' || p.t === 'func' || (p.t === 'op' && [')', ']', '$', '++', '--'].includes(p.v));
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\\' && src[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (c === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\n') {
      toks.push({ t: 'nl', v: '\n' });
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^(?:0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][-+]?\d+)?|\d+\.)/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') {
          j++;
          const n = src[j];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === '\\' ? '\\' : n === '"' ? '"' : n === '/' ? '/' : '\\' + n;
        } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new AwkError('stringa non chiusa');
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '/' && !valueEnd()) {
      let j = i + 1;
      let s = '';
      let inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j] + src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        if (src[j] === '\n') throw new AwkError('espressione regolare non chiusa');
        s += src[j++];
      }
      if (j >= src.length) throw new AwkError('espressione regolare non chiusa');
      toks.push({ t: 'ere', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      i += m[0].length;
      if (src[i] === '(' && !KEYWORDS.has(m[0]) && !BUILTINS.has(m[0])) toks.push({ t: 'func', v: m[0] });
      else toks.push({ t: 'name', v: m[0] });
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (['**='].includes(three)) {
      toks.push({ t: 'op', v: '^=' });
      i += 3;
      continue;
    }
    if (['&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '^=', '!~', '>>', '**'].includes(two)) {
      toks.push({ t: 'op', v: two === '**' ? '^' : two });
      i += 2;
      continue;
    }
    if ('{}()[];,+-*/%^!<>~?:=$|&'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new AwkError(`carattere inatteso '${c}'`);
  }
  toks.push({ t: 'eof', v: '' });
  return toks;
}

// ---------------- AST ----------------
type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ere'; v: string }
  | { k: 'var'; name: string }
  | { k: 'field'; e: Expr }
  | { k: 'index'; name: string; sub: Expr[] }
  | { k: 'assign'; op: string; target: Expr; e: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'incdec'; op: '++' | '--'; prefix: boolean; target: Expr }
  | { k: 'in'; sub: Expr[]; name: string }
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'group'; e: Expr };

type Stmt =
  | { k: 'expr'; e: Expr }
  | { k: 'print'; args: Expr[]; printf: boolean }
  | { k: 'block'; body: Stmt[] }
  | { k: 'if'; c: Expr; a: Stmt; b?: Stmt }
  | { k: 'while'; c: Expr; body: Stmt }
  | { k: 'do'; body: Stmt; c: Expr }
  | { k: 'for'; init?: Stmt; c?: Expr; step?: Stmt; body: Stmt }
  | { k: 'forin'; v: string; arr: string; body: Stmt }
  | { k: 'delete'; name: string; sub?: Expr[] }
  | { k: 'simple'; what: 'break' | 'continue' | 'next' | 'exit' | 'return'; e?: Expr };

interface Rule {
  kind: 'begin' | 'end' | 'pattern';
  pat?: Expr;
  pat2?: Expr;
  body: Stmt[] | null; // null = print $0
}

interface Func {
  params: string[];
  body: Stmt[];
}

// ---------------- parser ----------------
class AwkParser {
  p = 0;
  rules: Rule[] = [];
  funcs = new Map<string, Func>();
  constructor(private toks: Tok[]) {
    for (let i = 0; i < 8; i++) this.toks.push({ t: 'eof', v: '' });
  }
  private peek(): Tok {
    return this.toks[this.p];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }
  private isName(v: string): boolean {
    const t = this.peek();
    return t.t === 'name' && t.v === v;
  }
  private eatOp(v: string): void {
    if (!this.isOp(v)) throw new AwkError(`atteso '${v}' ma trovato '${this.peek().v || 'fine'}'`);
    this.p++;
  }
  private nl(): void {
    while (this.peek().t === 'nl') this.p++;
  }
  private terms(): void {
    while (this.peek().t === 'nl' || this.isOp(';')) this.p++;
  }

  parse(): void {
    this.terms();
    while (this.peek().t !== 'eof') {
      this.item();
      this.terms();
    }
  }

  private item(): void {
    const t = this.peek();
    if (t.t === 'name' && (t.v === 'function' || t.v === 'func')) {
      this.p++;
      const name = this.toks[this.p++].v;
      this.eatOp('(');
      const params: string[] = [];
      while (!this.isOp(')')) {
        params.push(this.toks[this.p++].v);
        if (this.isOp(',')) this.p++;
        this.nl();
      }
      this.eatOp(')');
      this.nl();
      this.funcs.set(name, { params, body: this.block() });
      return;
    }
    if (t.t === 'name' && (t.v === 'BEGIN' || t.v === 'END')) {
      this.p++;
      this.nl();
      this.rules.push({ kind: t.v === 'BEGIN' ? 'begin' : 'end', body: this.block() });
      return;
    }
    if (this.isOp('{')) {
      this.rules.push({ kind: 'pattern', body: this.block() });
      return;
    }
    const pat = this.expr();
    let pat2: Expr | undefined;
    if (this.isOp(',')) {
      this.p++;
      this.nl();
      pat2 = this.expr();
    }
    this.rules.push({ kind: 'pattern', pat, pat2, body: this.isOp('{') ? this.block() : null });
  }

  private block(): Stmt[] {
    this.eatOp('{');
    const body: Stmt[] = [];
    this.terms();
    while (!this.isOp('}')) {
      if (this.peek().t === 'eof') throw new AwkError("manca '}'");
      body.push(this.stmt());
      this.terms();
    }
    this.p++;
    return body;
  }

  private simpleStmt(): Stmt {
    const t = this.peek();
    if (t.t === 'name') {
      if (t.v === 'print' || t.v === 'printf') {
        this.p++;
        const args: Expr[] = [];
        if (!this.endOfSimple()) {
          args.push(this.exprNoIn(true));
          while (this.isOp(',')) {
            this.p++;
            this.nl();
            args.push(this.exprNoIn(true));
          }
        }
        if (this.isOp('>') || this.isOp('>>') || this.isOp('|')) throw new AwkError('redirezioni e pipe di print non supportate nel laboratorio');
        return { k: 'print', args, printf: t.v === 'printf' };
      }
      if (t.v === 'delete') {
        this.p++;
        const name = this.toks[this.p++].v;
        if (this.isOp('[')) {
          this.p++;
          const sub = this.exprList(']');
          this.eatOp(']');
          return { k: 'delete', name, sub };
        }
        return { k: 'delete', name };
      }
      if (['break', 'continue', 'next'].includes(t.v)) {
        this.p++;
        return { k: 'simple', what: t.v as 'break' };
      }
      if (t.v === 'exit' || t.v === 'return') {
        this.p++;
        return { k: 'simple', what: t.v as 'exit', e: this.endOfSimple() ? undefined : this.expr() };
      }
      if (t.v === 'getline') throw new AwkError('getline non è supportato nel laboratorio');
    }
    return { k: 'expr', e: this.expr() };
  }

  private endOfSimple(): boolean {
    const t = this.peek();
    return t.t === 'nl' || t.t === 'eof' || (t.t === 'op' && [';', '}', '>', '>>', '|'].includes(t.v));
  }

  private stmt(): Stmt {
    const t = this.peek();
    if (this.isOp('{')) return { k: 'block', body: this.block() };
    if (t.t === 'name') {
      if (t.v === 'if') {
        this.p++;
        this.eatOp('(');
        const c = this.expr();
        this.eatOp(')');
        this.nl();
        const a = this.stmt();
        const save = this.p;
        this.terms();
        if (this.isName('else')) {
          this.p++;
          this.nl();
          return { k: 'if', c, a, b: this.stmt() };
        }
        this.p = save;
        return { k: 'if', c, a };
      }
      if (t.v === 'while') {
        this.p++;
        this.eatOp('(');
        const c = this.expr();
        this.eatOp(')');
        this.nl();
        return { k: 'while', c, body: this.stmt() };
      }
      if (t.v === 'do') {
        this.p++;
        this.nl();
        const body = this.stmt();
        this.terms();
        if (!this.isName('while')) throw new AwkError("atteso 'while' dopo do");
        this.p++;
        this.eatOp('(');
        const c = this.expr();
        this.eatOp(')');
        return { k: 'do', body, c };
      }
      if (t.v === 'for') {
        this.p++;
        this.eatOp('(');
        if (this.toks[this.p].t === 'name' && this.toks[this.p + 1]?.v === 'in' && this.toks[this.p + 3]?.v === ')') {
          const v = this.toks[this.p].v;
          const arr = this.toks[this.p + 2].v;
          this.p += 4;
          this.nl();
          return { k: 'forin', v, arr, body: this.stmt() };
        }
        const init = this.isOp(';') ? undefined : this.simpleStmt();
        this.eatOp(';');
        this.nl();
        const c = this.isOp(';') ? undefined : this.expr();
        this.eatOp(';');
        this.nl();
        const step = this.isOp(')') ? undefined : this.simpleStmt();
        this.eatOp(')');
        this.nl();
        return { k: 'for', init, c, step, body: this.stmt() };
      }
    }
    if (this.isOp(';')) {
      this.p++;
      return { k: 'block', body: [] };
    }
    return this.simpleStmt();
  }

  private exprList(close: string): Expr[] {
    const out: Expr[] = [];
    this.nl();
    while (!this.isOp(close)) {
      out.push(this.expr());
      this.nl();
      if (this.isOp(',')) {
        this.p++;
        this.nl();
      } else break;
    }
    return out;
  }

  // ---- espressioni ----
  private noIn = false;
  private noGt = false;
  private exprNoIn(inPrint: boolean): Expr {
    const saved = this.noGt;
    this.noGt = inPrint;
    try {
      return this.expr();
    } finally {
      this.noGt = saved;
    }
  }
  expr(): Expr {
    return this.assignment();
  }
  private assignment(): Expr {
    const left = this.ternary();
    const t = this.peek();
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(t.v) && (left.k === 'var' || left.k === 'field' || left.k === 'index')) {
      this.p++;
      this.nl();
      return { k: 'assign', op: t.v, target: left, e: this.assignment() };
    }
    return left;
  }
  private ternary(): Expr {
    const c = this.orExpr();
    if (this.isOp('?')) {
      this.p++;
      this.nl();
      const a = this.assignment();
      this.nl();
      this.eatOp(':');
      this.nl();
      const b = this.assignment();
      return { k: 'cond', c, a, b };
    }
    return c;
  }
  private orExpr(): Expr {
    let l = this.andExpr();
    while (this.isOp('||')) {
      this.p++;
      this.nl();
      l = { k: 'bin', op: '||', l, r: this.andExpr() };
    }
    return l;
  }
  private andExpr(): Expr {
    let l = this.inExpr();
    while (this.isOp('&&')) {
      this.p++;
      this.nl();
      l = { k: 'bin', op: '&&', l, r: this.inExpr() };
    }
    return l;
  }
  private inExpr(): Expr {
    let l = this.matchExpr();
    while (this.isName('in') && !this.noIn) {
      this.p++;
      const name = this.toks[this.p++].v;
      l = { k: 'in', sub: [l], name };
    }
    return l;
  }
  private matchExpr(): Expr {
    let l = this.cmpExpr();
    while (this.isOp('~') || this.isOp('!~')) {
      const op = this.toks[this.p++].v;
      l = { k: 'bin', op, l, r: this.cmpExpr() };
    }
    return l;
  }
  private cmpExpr(): Expr {
    const l = this.concat();
    const t = this.peek();
    if (t.t === 'op' && ['<', '<=', '==', '!=', '>=', '>'].includes(t.v) && !(this.noGt && t.v === '>')) {
      this.p++;
      return { k: 'bin', op: t.v, l, r: this.concat() };
    }
    return l;
  }
  private startsOperand(): boolean {
    const t = this.peek();
    if (t.t === 'num' || t.t === 'str' || t.t === 'ere' || t.t === 'func') return true;
    if (t.t === 'name') return !['in', 'else'].includes(t.v) && !(KEYWORDS.has(t.v) && !BUILTINS.has(t.v));
    return t.t === 'op' && ['$', '(', '!', '-', '+', '++', '--'].includes(t.v);
  }
  private concat(): Expr {
    let l = this.additive();
    while (this.startsOperand() && !(this.isOp('-') || this.isOp('+'))) {
      l = { k: 'bin', op: 'concat', l, r: this.additive() };
    }
    return l;
  }
  private additive(): Expr {
    let l = this.mul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.toks[this.p++].v;
      l = { k: 'bin', op, l, r: this.mul() };
    }
    return l;
  }
  private mul(): Expr {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = this.toks[this.p++].v;
      l = { k: 'bin', op, l, r: this.unary() };
    }
    return l;
  }
  private unary(): Expr {
    if (this.isOp('!') || this.isOp('-') || this.isOp('+')) {
      const op = this.toks[this.p++].v;
      return { k: 'un', op, e: this.unary() };
    }
    return this.power();
  }
  private power(): Expr {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.p++;
      return { k: 'bin', op: '^', l: base, r: this.unaryForPower() };
    }
    return base;
  }
  private unaryForPower(): Expr {
    if (this.isOp('-') || this.isOp('+') || this.isOp('!')) {
      const op = this.toks[this.p++].v;
      return { k: 'un', op, e: this.unaryForPower() };
    }
    return this.power();
  }
  private postfix(): Expr {
    if (this.isOp('++') || this.isOp('--')) {
      const op = this.toks[this.p++].v as '++' | '--';
      const target = this.primary();
      return { k: 'incdec', op, prefix: true, target };
    }
    const e = this.primary();
    if ((this.isOp('++') || this.isOp('--')) && (e.k === 'var' || e.k === 'field' || e.k === 'index')) {
      const op = this.toks[this.p++].v as '++' | '--';
      return { k: 'incdec', op, prefix: false, target: e };
    }
    return e;
  }
  private primary(): Expr {
    const t = this.toks[this.p++];
    if (!t || t.t === 'eof') throw new AwkError('espressione incompleta');
    if (t.t === 'num') return { k: 'num', v: t.v.startsWith('0x') || t.v.startsWith('0X') ? parseInt(t.v, 16) : parseFloat(t.v) };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'ere') return { k: 'ere', v: t.v };
    if (t.t === 'func') {
      this.eatOp('(');
      const args = this.exprList(')');
      this.eatOp(')');
      return { k: 'call', name: t.v, args };
    }
    if (t.t === 'op') {
      if (t.v === '$') {
        const inner = this.isOp('++') || this.isOp('--') || this.isOp('-') ? this.unary() : this.primary();
        return { k: 'field', e: inner };
      }
      if (t.v === '(') {
        const saved = this.noGt;
        this.noGt = false;
        const e = this.expr();
        // (a, b) in arr
        if (this.isOp(',')) {
          const subs = [e];
          while (this.isOp(',')) {
            this.p++;
            subs.push(this.expr());
          }
          this.eatOp(')');
          this.noGt = saved;
          if (!this.isName('in')) throw new AwkError("atteso 'in' dopo un elenco di indici");
          this.p++;
          return { k: 'in', sub: subs, name: this.toks[this.p++].v };
        }
        this.eatOp(')');
        this.noGt = saved;
        return { k: 'group', e };
      }
    }
    if (t.t === 'name') {
      if (BUILTINS.has(t.v)) {
        let args: Expr[] = [];
        if (this.isOp('(')) {
          this.p++;
          args = this.exprList(')');
          this.eatOp(')');
        } else if (t.v !== 'length') throw new AwkError(`${t.v} richiede le parentesi`);
        return { k: 'call', name: t.v, args };
      }
      if (KEYWORDS.has(t.v)) throw new AwkError(`parola chiave inattesa '${t.v}'`);
      if (this.isOp('[')) {
        this.p++;
        const sub = this.exprList(']');
        this.eatOp(']');
        return { k: 'index', name: t.v, sub };
      }
      return { k: 'var', name: t.v };
    }
    throw new AwkError(`token inatteso '${t.v}'`);
  }
}

// ---------------- esecuzione ----------------
class NextSignal {}
class ExitSignal {
  constructor(public code: number) {}
}
class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public v: Val) {}
}

function looksNumeric(s: string): boolean {
  return /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|0[xX][0-9a-fA-F]+)\s*$/.test(s) && !/^\s*[-+]?0[xX]/.test(s);
}

export interface AwkOptions {
  fs?: string;
  vars?: Record<string, string>;
}

export function runAwk(program: string, files: { name: string; text: string }[], opts: AwkOptions, out: (s: string) => void): number {
  const parser = new AwkParser(lex(program));
  try {
    parser.parse();
  } catch (e) {
    if (e instanceof TypeError) throw new AwkError('syntax error');
    throw e;
  }
  const rules = parser.rules;
  const funcs = parser.funcs;

  const globals = new Map<string, Val | Map<string, Val>>();
  const special: Record<string, Val> = { NR: 0, NF: 0, FNR: 0, FS: opts.fs ?? ' ', OFS: ' ', ORS: '\n', RS: '\n', FILENAME: '', SUBSEP: '\x1c', RSTART: 0, RLENGTH: -1, CONVFMT: '%.6g', OFMT: '%.6g' };
  for (const [k, v] of Object.entries(opts.vars ?? {})) {
    if (k in special) special[k] = { s: v };
    else globals.set(k, { s: v });
  }
  if (special.RS !== '\n') throw new AwkError('RS diverso da newline non supportato nel laboratorio');

  let record = '';
  let fields: string[] = [];
  const frames: Map<string, Val | Map<string, Val>>[] = [];
  let rng = 12345;

  const num = (v: Val): number => {
    if (typeof v === 'number') return v;
    const s = typeof v === 'string' ? v : v.s;
    const m = /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)/.exec(s);
    return m ? parseFloat(m[0]) : 0;
  };
  const fmtNum = (n: number, fmt = '%.6g'): string => {
    if (Number.isInteger(n) && Math.abs(n) < 1e16) return String(n);
    if (Number.isNaN(n)) return 'nan';
    if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
    return sprintf(fmt, [n]);
  };
  const str = (v: Val): string => (typeof v === 'number' ? fmtNum(v, String(strOf(special.CONVFMT))) : typeof v === 'string' ? v : v.s);
  const strOf = (v: Val): string => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : v.s);
  const truthy = (v: Val): boolean => (typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v !== '' : looksNumeric(v.s) ? parseFloat(v.s) !== 0 : v.s !== '');
  const isNumeric = (v: Val): boolean => typeof v === 'number' || (typeof v === 'object' && looksNumeric(v.s));

  const regexOf = (src: string): RegExp => {
    const js = src
      .replace(/\[:alpha:\]/g, 'A-Za-z')
      .replace(/\[:digit:\]/g, '0-9')
      .replace(/\[:alnum:\]/g, 'A-Za-z0-9')
      .replace(/\[:upper:\]/g, 'A-Z')
      .replace(/\[:lower:\]/g, 'a-z')
      .replace(/\[:space:\]/g, '\\s')
      .replace(/\[:punct:\]/g, '!-\\/:-@\\[-`{-~');
    try {
      return new RegExp(js);
    } catch {
      throw new AwkError(`espressione regolare non valida: /${src}/`);
    }
  };
  const reCache = new Map<string, RegExp>();
  const re = (src: string, flags = ''): RegExp => {
    const key = flags + '/' + src;
    let r = reCache.get(key);
    if (!r) {
      const base = regexOf(src);
      r = flags ? new RegExp(base.source, flags) : base;
      reCache.set(key, r);
    }
    return r;
  };

  // ---- record e campi ----
  const splitRecord = (line: string, fsv: string): string[] => {
    if (fsv === ' ') return line.trim() === '' ? [] : line.trim().split(/[ \t\n]+/);
    if (fsv.length === 1 && fsv !== '\\') return line === '' ? [] : line.split(fsv);
    if (fsv === '\t') return line === '' ? [] : line.split('\t');
    return line === '' ? [] : line.split(re(fsv));
  };
  const setRecord = (line: string): void => {
    record = line;
    fields = splitRecord(line, str(special.FS));
    special.NF = fields.length;
  };
  const rebuild = (): void => {
    record = fields.join(str(special.OFS));
    special.NF = fields.length;
  };
  const getField = (i: number): Val => {
    if (i < 0) throw new AwkError(`indice di campo negativo: $${i}`);
    return { s: i === 0 ? record : (fields[i - 1] ?? '') };
  };
  const setField = (i: number, v: string): void => {
    if (i === 0) {
      setRecord(v);
      return;
    }
    while (fields.length < i) fields.push('');
    fields[i - 1] = v;
    rebuild();
  };

  // ---- variabili ----
  const isLocal = (name: string): Map<string, Val | Map<string, Val>> | null => {
    const f = frames[frames.length - 1];
    return f && f.has(name) ? f : null;
  };
  const getVar = (name: string): Val => {
    const l = isLocal(name);
    if (l) {
      const v = l.get(name)!;
      if (v instanceof Map) throw new AwkError(`${name} è un array`);
      return v;
    }
    if (name === 'NF') return special.NF;
    if (name in special) return special[name];
    const g = globals.get(name);
    if (g instanceof Map) throw new AwkError(`${name} è un array`);
    return g ?? '';
  };
  const setVar = (name: string, v: Val): void => {
    const l = isLocal(name);
    if (l) {
      l.set(name, v);
      return;
    }
    if (name === 'NF') {
      const n = Math.max(0, Math.floor(num(v)));
      while (fields.length < n) fields.push('');
      fields.length = n;
      rebuild();
      return;
    }
    if (name in special) {
      special[name] = v;
      return;
    }
    globals.set(name, v);
  };
  const getArr = (name: string): Map<string, Val> => {
    const l = isLocal(name);
    const holder = l ?? globals;
    let a = holder.get(name);
    if (a === undefined || (!(a instanceof Map) && (a === '' || a === 0))) {
      a = new Map<string, Val>();
      holder.set(name, a);
    }
    if (!(a instanceof Map)) throw new AwkError(`${name} non è un array`);
    return a;
  };

  // ---- sprintf ----
  function sprintf(fmt: string, args: Val[]): string {
    let ai = 0;
    const next = (): Val => args[ai++] ?? '';
    return fmt.replace(/%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([a-zA-Z%])/g, (_m, flags: string, width: string | undefined, prec: string | undefined, conv: string) => {
      if (conv === '%') return '%';
      const w = width === '*' ? num(next()) : parseInt(width ?? '0', 10);
      const p = prec === '*' ? num(next()) : prec !== undefined ? parseInt(prec, 10) : undefined;
      const a = next();
      let s2: string;
      switch (conv) {
        case 'd': case 'i': {
          const n = Math.trunc(num(a));
          s2 = String(n);
          if (flags.includes('+') && n >= 0) s2 = '+' + s2;
          else if (flags.includes(' ') && n >= 0) s2 = ' ' + s2;
          break;
        }
        case 'u': s2 = String(Math.trunc(num(a)) >>> 0); break;
        case 'o': s2 = (Math.trunc(num(a)) >>> 0).toString(8); break;
        case 'x': s2 = (Math.trunc(num(a)) >>> 0).toString(16); break;
        case 'X': s2 = (Math.trunc(num(a)) >>> 0).toString(16).toUpperCase(); break;
        case 'c': s2 = typeof a === 'number' ? String.fromCodePoint(a) : strOf(a).slice(0, 1); break;
        case 's': s2 = p !== undefined ? str(a).slice(0, p) : str(a); break;
        case 'f': case 'F': s2 = num(a).toFixed(p ?? 6); if (flags.includes('+') && num(a) >= 0) s2 = '+' + s2; break;
        case 'e': case 'E': {
          s2 = num(a).toExponential(p ?? 6).replace(/e([+-])(\d)$/, 'e$10$2');
          if (conv === 'E') s2 = s2.toUpperCase();
          break;
        }
        case 'g': case 'G': {
          const prec = p === undefined ? 6 : Math.max(1, p);
          const n = num(a);
          if (n === 0) s2 = '0';
          else {
            const exp = Math.floor(Math.log10(Math.abs(n)));
            if (exp < -4 || exp >= prec) s2 = n.toExponential(prec - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
            else s2 = String(parseFloat(n.toPrecision(prec)));
          }
          break;
        }
        default: throw new AwkError(`formato printf non supportato: %${conv}`);
      }
      if (w > s2.length) {
        if (flags.includes('-')) s2 = s2.padEnd(w);
        else if (flags.includes('0') && !'sc'.includes(conv)) s2 = /^[-+]/.test(s2) ? s2[0] + s2.slice(1).padStart(w - 1, '0') : s2.padStart(w, '0');
        else s2 = s2.padStart(w);
      }
      return s2;
    });
  }

  // ---- valutazione ----
  const compare = (l: Val, r: Val): number => {
    if (isNumeric(l) && isNumeric(r)) {
      const a = num(l);
      const b = num(r);
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const a = str(l);
    const b = str(r);
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const subscriptOf = (sub: Expr[]): string => sub.map((e) => str(ev(e))).join(str(special.SUBSEP));
  const assignTo = (target: Expr, v: Val): void => {
    if (target.k === 'var') setVar(target.name, v);
    else if (target.k === 'field') setField(Math.trunc(num(ev(target.e))), str(v));
    else if (target.k === 'index') getArr(target.name).set(subscriptOf(target.sub), v);
    else throw new AwkError('assegnazione non valida');
  };
  const callBuiltin = (name: string, args: Expr[]): Val => {
    const a = (i: number): Val => ev(args[i]);
    switch (name) {
      case 'length':
        if (!args.length) return fields.length >= 0 ? record.length : 0;
        if (args[0].k === 'var' && (globals.get(args[0].name) instanceof Map || (isLocal(args[0].name)?.get(args[0].name) instanceof Map))) return getArr(args[0].name).size;
        return str(a(0)).length;
      case 'substr': {
        const s = str(a(0));
        let m = Math.round(num(a(1)));
        let n = args.length > 2 ? Math.round(num(a(2))) : s.length - m + 1;
        if (m < 1) {
          n += m - 1;
          m = 1;
        }
        return n <= 0 ? '' : s.substr(m - 1, n);
      }
      case 'index': return str(a(0)).indexOf(str(a(1))) + 1;
      case 'split': {
        const s = str(a(0));
        const arrName = (args[1] as { name: string }).name;
        const sep = args.length > 2 ? (args[2].k === 'ere' ? args[2].v : str(a(2))) : str(special.FS);
        const parts = splitRecord(s, sep);
        const arr = getArr(arrName);
        arr.clear();
        parts.forEach((p, i) => arr.set(String(i + 1), { s: p }));
        return parts.length;
      }
      case 'sub':
      case 'gsub': {
        const pat = args[0].k === 'ere' ? args[0].v : str(a(0));
        const repl = str(a(1));
        const target: Expr = args[2] ?? { k: 'field', e: { k: 'num', v: 0 } };
        const text = str(ev(target));
        let count = 0;
        const rx = re(pat, name === 'gsub' ? 'g' : '');
        rx.lastIndex = 0;
        const res = text.replace(rx, (m0: string) => {
          count++;
          return repl.replace(/\\&|&|\\\\/g, (x) => (x === '&' ? m0 : x === '\\&' ? '&' : '\\'));
        });
        if (count) assignTo(target, res);
        return count;
      }
      case 'match': {
        const s = str(a(0));
        const m = re(args[1].k === 'ere' ? args[1].v : str(a(1))).exec(s);
        special.RSTART = m ? m.index + 1 : 0;
        special.RLENGTH = m ? m[0].length : -1;
        return special.RSTART as number;
      }
      case 'toupper': return str(a(0)).toUpperCase();
      case 'tolower': return str(a(0)).toLowerCase();
      case 'sprintf': return sprintf(str(a(0)), args.slice(1).map((e) => ev(e)));
      case 'int': return Math.trunc(num(a(0)));
      case 'sqrt': return Math.sqrt(num(a(0)));
      case 'exp': return Math.exp(num(a(0)));
      case 'log': return Math.log(num(a(0)));
      case 'sin': return Math.sin(num(a(0)));
      case 'cos': return Math.cos(num(a(0)));
      case 'atan2': return Math.atan2(num(a(0)), num(a(1)));
      case 'rand': {
        rng = (rng * 1103515245 + 12345) % 2147483648;
        return rng / 2147483648;
      }
      case 'srand': {
        rng = Math.abs(Math.trunc(num(args.length ? a(0) : 0))) % 2147483648;
        return 0;
      }
      case 'system': throw new AwkError('system() non è supportato nel laboratorio');
    }
    throw new AwkError(`funzione sconosciuta: ${name}`);
  };
  function ev(e: Expr): Val {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'ere': return re(e.v).test(record) ? 1 : 0;
      case 'group': return ev(e.e);
      case 'var': return getVar(e.name);
      case 'field': return getField(Math.trunc(num(ev(e.e))));
      case 'index': {
        const arr = getArr(e.name);
        const k = subscriptOf(e.sub);
        if (!arr.has(k)) arr.set(k, '');
        return arr.get(k)!;
      }
      case 'in': return getArr(e.name).has(subscriptOf(e.sub)) ? 1 : 0;
      case 'cond': return truthy(ev(e.c)) ? ev(e.a) : ev(e.b);
      case 'assign': {
        let v = ev(e.e);
        if (e.op !== '=') {
          const cur = num(ev(e.target));
          const r = num(v);
          const op = e.op[0];
          if ((op === '/' || op === '%') && r === 0) throw new AwkError('divisione per zero');
          v = op === '+' ? cur + r : op === '-' ? cur - r : op === '*' ? cur * r : op === '/' ? cur / r : op === '%' ? cur % r : Math.pow(cur, r);
        } else if (typeof v === 'object') v = { s: v.s };
        assignTo(e.target, v);
        return v;
      }
      case 'incdec': {
        const old = num(ev(e.target));
        const nv = e.op === '++' ? old + 1 : old - 1;
        assignTo(e.target, nv);
        return e.prefix ? nv : old;
      }
      case 'un': {
        const v = ev(e.e);
        return e.op === '!' ? (truthy(v) ? 0 : 1) : e.op === '-' ? -num(v) : num(v);
      }
      case 'bin': {
        switch (e.op) {
          case '&&': return truthy(ev(e.l)) && truthy(ev(e.r)) ? 1 : 0;
          case '||': return truthy(ev(e.l)) || truthy(ev(e.r)) ? 1 : 0;
          case 'concat': return str(ev(e.l)) + str(ev(e.r));
          case '~': case '!~': {
            const s = str(ev(e.l));
            const hit = re(e.r.k === 'ere' ? e.r.v : str(ev(e.r))).test(s);
            return (e.op === '~') === hit ? 1 : 0;
          }
          case '<': return compare(ev(e.l), ev(e.r)) < 0 ? 1 : 0;
          case '<=': return compare(ev(e.l), ev(e.r)) <= 0 ? 1 : 0;
          case '>': return compare(ev(e.l), ev(e.r)) > 0 ? 1 : 0;
          case '>=': return compare(ev(e.l), ev(e.r)) >= 0 ? 1 : 0;
          case '==': return compare(ev(e.l), ev(e.r)) === 0 ? 1 : 0;
          case '!=': return compare(ev(e.l), ev(e.r)) !== 0 ? 1 : 0;
        }
        const l = num(ev(e.l));
        const r = num(ev(e.r));
        switch (e.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': if (r === 0) throw new AwkError('divisione per zero'); return l / r;
          case '%': if (r === 0) throw new AwkError('divisione per zero'); return l % r;
          case '^': return Math.pow(l, r);
        }
        throw new AwkError(`operatore sconosciuto ${e.op}`);
      }
      case 'call': {
        const f = funcs.get(e.name);
        if (!f) {
          if (BUILTINS.has(e.name)) return callBuiltin(e.name, e.args);
          throw new AwkError(`funzione non definita: ${e.name}`);
        }
        const frame = new Map<string, Val | Map<string, Val>>();
        f.params.forEach((p, i) => {
          const arg = e.args[i];
          if (arg && arg.k === 'var' && (globals.get(arg.name) instanceof Map || isLocal(arg.name)?.get(arg.name) instanceof Map)) frame.set(p, getArr(arg.name));
          else frame.set(p, arg ? ev(arg) : '');
        });
        frames.push(frame);
        if (frames.length > 200) throw new AwkError('ricorsione troppo profonda');
        try {
          for (const s of f.body) run(s);
        } catch (x) {
          if (x instanceof ReturnSignal) return x.v;
          throw x;
        } finally {
          frames.pop();
        }
        return '';
      }
    }
  }
  let steps = 0;
  const outStr = (v: Val): string => (typeof v === 'number' ? fmtNum(v, str(special.OFMT)) : str(v));
  function run(s: Stmt): void {
    if (++steps > 2_000_000) throw new AwkError('limite di esecuzione superato');
    switch (s.k) {
      case 'expr': ev(s.e); return;
      case 'print': {
        if (s.printf) {
          if (!s.args.length) throw new AwkError('printf richiede un formato');
          out(sprintf(str(ev(s.args[0])), s.args.slice(1).map((x) => ev(x))));
        } else out((s.args.length ? s.args.map((x) => outStr(ev(x))).join(str(special.OFS)) : record) + str(special.ORS));
        return;
      }
      case 'block': for (const x of s.body) run(x); return;
      case 'if': if (truthy(ev(s.c))) run(s.a); else if (s.b) run(s.b); return;
      case 'while':
        while (truthy(ev(s.c))) {
          try { run(s.body); } catch (x) { if (x instanceof BreakSignal) break; if (!(x instanceof ContinueSignal)) throw x; }
        }
        return;
      case 'do':
        do {
          try { run(s.body); } catch (x) { if (x instanceof BreakSignal) break; if (!(x instanceof ContinueSignal)) throw x; }
        } while (truthy(ev(s.c)));
        return;
      case 'for':
        if (s.init) run(s.init);
        while (!s.c || truthy(ev(s.c))) {
          try { run(s.body); } catch (x) { if (x instanceof BreakSignal) break; if (!(x instanceof ContinueSignal)) throw x; }
          if (s.step) run(s.step);
        }
        return;
      case 'forin': {
        const arr = getArr(s.arr);
        for (const k of [...arr.keys()]) {
          setVar(s.v, { s: k });
          try { run(s.body); } catch (x) { if (x instanceof BreakSignal) break; if (!(x instanceof ContinueSignal)) throw x; }
        }
        return;
      }
      case 'delete': {
        const arr = getArr(s.name);
        if (s.sub) arr.delete(subscriptOf(s.sub));
        else arr.clear();
        return;
      }
      case 'simple':
        if (s.what === 'break') throw new BreakSignal();
        if (s.what === 'continue') throw new ContinueSignal();
        if (s.what === 'next') throw new NextSignal();
        if (s.what === 'exit') throw new ExitSignal(s.e ? Math.trunc(num(ev(s.e))) : 0);
        throw new ReturnSignal(s.e ? ev(s.e) : '');
    }
  }
  const runBody = (body: Stmt[] | null): void => {
    if (body === null) {
      out(record + str(special.ORS));
      return;
    }
    for (const st of body) run(st);
  };

  let exitCode = 0;
  try {
    for (const r of rules) if (r.kind === 'begin') runBody(r.body);
    const hasMain = rules.some((r) => r.kind === 'pattern');
    const hasEnd = rules.some((r) => r.kind === 'end');
    if (hasMain || hasEnd) {
      const active = new Map<Rule, boolean>();
      outer: for (const f of files) {
        special.FILENAME = f.name === '-' ? '' : f.name;
        special.FNR = 0;
        const lines = f.text === '' ? [] : f.text.split('\n');
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        for (const line of lines) {
          special.NR = num(special.NR) + 1;
          special.FNR = num(special.FNR) + 1;
          setRecord(line);
          try {
            for (const r of rules) {
              if (r.kind !== 'pattern') continue;
              let hit: boolean;
              if (!r.pat) hit = true;
              else if (r.pat2) {
                if (!active.get(r)) {
                  if (truthy(ev(r.pat))) {
                    active.set(r, true);
                    hit = true;
                    if (truthy(ev(r.pat2))) active.set(r, false);
                  } else hit = false;
                } else {
                  hit = true;
                  if (truthy(ev(r.pat2))) active.set(r, false);
                }
              } else hit = truthy(ev(r.pat));
              if (hit) runBody(r.body);
            }
          } catch (x) {
            if (x instanceof NextSignal) continue;
            throw x;
          }
          if (false as boolean) break outer;
        }
      }
    }
  } catch (x) {
    if (!(x instanceof ExitSignal)) throw x;
    exitCode = x.code;
    for (const r of rules) if (r.kind === 'end') runBody(r.body);
    return exitCode;
  }
  try {
    for (const r of rules) if (r.kind === 'end') runBody(r.body);
  } catch (x) {
    if (!(x instanceof ExitSignal)) throw x;
    exitCode = x.code;
  }
  return exitCode;
}
