/** Parser PowerShell (sottoinsieme di Windows PowerShell 5.1). */

export class PsIncomplete extends Error {}
const AMPERSAND_MSG = 'The ampersand (&) character is not allowed. The & operator is reserved for future use; wrap an ampersand in double quotation marks ("&") to pass it as part of a string.';

export class PsSyntaxError extends Error {
  constructor(
    message: string,
    public pos: number,
    public token = '',
  ) {
    // Windows PowerShell 5.1: una & isolata dentro un indirizzo o un argomento è «riservata»
    super(/^Unexpected token '&'/.test(message) ? AMPERSAND_MSG : message);
  }
}

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'estr'; parts: (string | Expr)[] }
  | { k: 'var'; name: string }
  | { k: 'subexpr'; body: Block }
  | { k: 'arrayexpr'; body: Block }
  | { k: 'hash'; entries: { key: Expr; val: Stmt }[] }
  | { k: 'sb'; block: Block; src: string }
  | { k: 'paren'; stmt: Stmt }
  | { k: 'cast'; type: string; e: Expr }
  | { k: 'static'; type: string; member: string; args: Expr[] | null }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'member'; obj: Expr; name: string | Expr; args: Expr[] | null }
  | { k: 'multi'; list: Expr[] }
  | { k: 'index'; obj: Expr; idx: Expr }
  | { k: 'array'; items: Expr[] }
  | { k: 'postfix'; op: '++' | '--'; target: Expr }
  | { k: 'prefix'; op: '++' | '--'; target: Expr }
  | { k: 'splat'; name: string }
  | { k: 'bare'; v: string };

export interface Redir {
  fd: 1 | 2 | 0;
  append: boolean;
  /** 0 = tutti gli stream */
  target: Expr | '&1';
}

export type Arg = { k: 'param'; name: string; value: Expr | null } | { k: 'pos'; value: Expr } | { k: 'splat'; name: string };

export interface CmdNode {
  k: 'cmd';
  name: Expr;
  args: Arg[];
  amp: boolean;
  dot: boolean;
  start: number;
  end: number;
}

export interface ExprElem {
  k: 'expr';
  e: Expr;
  start: number;
  end: number;
}

export type Param = { name: string; def: Expr | null; type: string | null; isSwitch: boolean };

export type Stmt =
  | { k: 'pipeline'; elems: (CmdNode | ExprElem)[]; redirs: Redir[]; start: number; end: number }
  | { k: 'assign'; target: Expr; op: string; value: Stmt; start: number; end: number }
  | { k: 'if'; branches: { cond: Stmt; body: Block }[]; else?: Block }
  | { k: 'foreach'; name: string; list: Stmt; body: Block }
  | { k: 'for'; init: Stmt | null; cond: Stmt | null; iter: Stmt | null; body: Block }
  | { k: 'while'; cond: Stmt; body: Block; until: boolean; post: boolean }
  | { k: 'func'; name: string; params: Param[]; body: Block; src: string; full: string }
  | { k: 'return'; value: Stmt | null }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'throw'; value: Stmt | null; start: number; end: number }
  | { k: 'exit'; value: Stmt | null }
  | { k: 'try'; body: Block; catches: { types: string[]; body: Block }[]; fin: Block | null }
  | { k: 'param'; params: Param[] }
  | { k: 'switch'; subject: Stmt; mode: 'exact' | 'regex' | 'wildcard'; cs: boolean; clauses: { cond: Expr | null; body: Block }[] }
  | { k: 'named'; name: 'begin' | 'process' | 'end'; body: Block };

export interface Block {
  stmts: Stmt[];
  src: string;
}

const CMP_OPS = [
  'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'like', 'notlike', 'match', 'notmatch', 'contains', 'notcontains', 'in', 'notin',
  'replace', 'split', 'join', 'is', 'isnot', 'ceq', 'cne', 'cgt', 'cge', 'clt', 'cle', 'clike', 'cnotlike', 'cmatch', 'cnotmatch',
  'ieq', 'ine', 'igt', 'ige', 'ilt', 'ile', 'ilike', 'imatch', 'creplace', 'ireplace', 'as',
];
const LOGIC_OPS = ['and', 'or', 'xor'];
const KEYWORDS = new Set(['if', 'foreach', 'for', 'while', 'do', 'function', 'filter', 'return', 'break', 'continue', 'throw', 'try', 'exit', 'param', 'switch']);

export class PsParser {
  pos = 0;
  constructor(public src: string) {}

  private eof(): boolean {
    return this.pos >= this.src.length;
  }
  private ch(o = 0): string {
    return this.src[this.pos + o] ?? '';
  }
  private starts(s: string): boolean {
    return this.src.startsWith(s, this.pos);
  }

  /** salta spazi (e opzionalmente newline) e commenti */
  private ws(newlines = false): void {
    for (;;) {
      const c = this.ch();
      if (c === ' ' || c === '\t' || c === '\r') this.pos++;
      else if (c === '`' && (this.ch(1) === '\n' || (this.ch(1) === '\r' && this.ch(2) === '\n'))) this.pos += this.ch(1) === '\n' ? 2 : 3;
      else if (c === '\n' && newlines) this.pos++;
      else if (c === '#') {
        while (!this.eof() && this.ch() !== '\n') this.pos++;
      } else if (this.starts('<#')) {
        const e = this.src.indexOf('#>', this.pos + 2);
        if (e < 0) throw new PsIncomplete('<#');
        this.pos = e + 2;
      } else break;
    }
  }

  parseProgram(): Block {
    const b = this.parseStatements(null);
    if (!this.eof()) throw new PsSyntaxError(`Unexpected token '${this.ch()}' in expression or statement.`, this.pos, this.ch());
    return b;
  }

  private parseStatements(close: string | null): Block {
    const start = this.pos;
    const stmts: Stmt[] = [];
    for (;;) {
      this.ws(true);
      while (this.ch() === ';') {
        this.pos++;
        this.ws(true);
      }
      if (this.eof()) {
        if (close) throw new PsIncomplete(close);
        break;
      }
      if (close && this.ch() === close) break;
      if (this.ch() === ')' || this.ch() === '}') {
        if (close) throw new PsSyntaxError(`Unexpected token '${this.ch()}' in expression or statement.`, this.pos, this.ch());
        throw new PsSyntaxError(`Unexpected token '${this.ch()}' in expression or statement.`, this.pos, this.ch());
      }
      stmts.push(this.parseStatement());
      this.ws();
      const c = this.ch();
      if (stmts[stmts.length - 1].k === 'param') continue;
      if (c && c !== '\n' && c !== ';' && c !== close) {
        if (this.starts('&&') || this.starts('||')) {
          throw new PsSyntaxError(`The token '${this.src.slice(this.pos, this.pos + 2)}' is not a valid statement separator in this version.`, this.pos, this.src.slice(this.pos, this.pos + 2));
        }
        if (c === '&') {
          // Windows PowerShell 5.1: la & fuori dalle virgolette in un indirizzo è riservata
          throw new PsSyntaxError('The ampersand (&) character is not allowed. The & operator is reserved for future use; wrap an ampersand in double quotation marks ("&") to pass it as part of a string.', this.pos, '&');
        }
        throw new PsSyntaxError(`Unexpected token '${this.readUntilSpace()}' in expression or statement.`, this.pos, this.readUntilSpace());
      }
    }
    return { stmts, src: this.src.slice(start, this.pos) };
  }

  private readUntilSpace(): string {
    const m = /^\S+/.exec(this.src.slice(this.pos));
    return m ? m[0] : '';
  }

  private peekKeyword(): string | null {
    const m = /^[A-Za-z]+/.exec(this.src.slice(this.pos, this.pos + 12));
    if (!m) return null;
    const w = m[0].toLowerCase();
    const next = this.src[this.pos + m[0].length] ?? '';
    if (/[A-Za-z0-9_\-.:]/.test(next)) return null;
    return KEYWORDS.has(w) || w === 'else' || w === 'elseif' ? w : null;
  }

  parseStatement(): Stmt {
    this.ws();
    // attributi della function ([CmdletBinding()], [OutputType(...)]) prima di param: ignorati
    const at = /^\[(CmdletBinding|OutputType)\b/i.exec(this.src.slice(this.pos));
    if (at) {
      this.pos = this.matchBracket(this.pos) + 1;
      this.ws(true);
    }
    const nb = /^(begin|process|end)\s*\{/i.exec(this.src.slice(this.pos));
    if (nb) {
      this.pos += nb[1].length;
      return { k: 'named', name: nb[1].toLowerCase() as 'begin', body: this.block() };
    }
    const kw = this.peekKeyword();
    if (kw) {
      const stmt = this.parseKeyword(kw);
      if (stmt) return stmt;
    }
    return this.parsePipelineOrAssign();
  }

  private block(): Block {
    this.ws(true);
    if (this.ch() !== '{') {
      if (this.eof()) throw new PsIncomplete('{');
      throw new PsSyntaxError(`Missing statement block. Unexpected token '${this.readUntilSpace()}'.`, this.pos);
    }
    this.pos++;
    const b = this.parseStatements('}');
    this.pos++;
    return b;
  }

  private parenStmt(): Stmt {
    this.ws(true);
    if (this.ch() !== '(') {
      if (this.eof()) throw new PsIncomplete('(');
      throw new PsSyntaxError("Missing '(' after keyword.", this.pos);
    }
    this.pos++;
    this.ws(true);
    const s = this.parsePipelineOrAssign();
    this.ws(true);
    if (this.eof()) throw new PsIncomplete(')');
    if (this.ch() !== ')') throw new PsSyntaxError(`Missing ')' : unexpected token '${this.readUntilSpace()}'.`, this.pos);
    this.pos++;
    return s;
  }

  private parseKeyword(kw: string): Stmt | null {
    const startPos = this.pos;
    this.pos += kw.length;
    switch (kw) {
      case 'if': {
        const branches: { cond: Stmt; body: Block }[] = [];
        let cond = this.parenStmt();
        let body = this.block();
        branches.push({ cond, body });
        let elseB: Block | undefined;
        for (;;) {
          const save = this.pos;
          this.ws(true);
          const k = this.peekKeyword();
          if (k === 'elseif') {
            this.pos += 6;
            cond = this.parenStmt();
            body = this.block();
            branches.push({ cond, body });
          } else if (k === 'else') {
            this.pos += 4;
            elseB = this.block();
            break;
          } else {
            this.pos = save;
            break;
          }
        }
        return { k: 'if', branches, else: elseB };
      }
      case 'foreach': {
        this.ws(true);
        if (this.ch() !== '(') {
          // foreach come alias di ForEach-Object nella pipeline
          this.pos = startPos;
          return null;
        }
        this.pos++;
        this.ws();
        if (this.ch() !== '$') throw new PsSyntaxError("Missing variable name after foreach.", this.pos);
        this.pos++;
        const name = this.readName();
        this.ws();
        if (!/^in\b/i.test(this.src.slice(this.pos, this.pos + 3))) throw new PsSyntaxError("Missing 'in' in foreach statement.", this.pos);
        this.pos += 2;
        this.ws(true);
        const list = this.parsePipelineOrAssign();
        this.ws(true);
        if (this.eof()) throw new PsIncomplete(')');
        if (this.ch() !== ')') throw new PsSyntaxError("Missing ')' in foreach statement.", this.pos);
        this.pos++;
        return { k: 'foreach', name, list, body: this.block() };
      }
      case 'for': {
        this.ws(true);
        if (this.ch() !== '(') throw new PsSyntaxError("Missing '(' after 'for'.", this.pos);
        this.pos++;
        const part = (end: string): Stmt | null => {
          this.ws();
          if (this.ch() === end) {
            this.pos++;
            return null;
          }
          const s = this.parsePipelineOrAssign();
          this.ws();
          if (this.ch() !== end) throw new PsSyntaxError(`Missing '${end}' in for statement.`, this.pos);
          this.pos++;
          return s;
        };
        const init = part(';');
        const cond = part(';');
        const iter = part(')');
        return { k: 'for', init, cond, iter, body: this.block() };
      }
      case 'while': {
        const cond = this.parenStmt();
        return { k: 'while', cond, body: this.block(), until: false, post: false };
      }
      case 'do': {
        const body = this.block();
        this.ws(true);
        const k = this.src.slice(this.pos).match(/^(while|until)\b/i);
        if (!k) {
          if (this.eof()) throw new PsIncomplete('while');
          throw new PsSyntaxError("Missing while or until keyword in do loop.", this.pos);
        }
        this.pos += k[0].length;
        const cond = this.parenStmt();
        return { k: 'while', cond, body, until: k[0].toLowerCase() === 'until', post: true };
      }
      case 'filter':
        throw new PsSyntaxError('Il costrutto filter non è supportato nel laboratorio: usa una function con ForEach-Object.', this.pos, 'filter');
      case 'function': {
        this.ws();
        const m = /^[A-Za-z_][A-Za-z0-9_\-.:]*/.exec(this.src.slice(this.pos));
        if (!m) throw new PsSyntaxError('Missing function name after function keyword.', this.pos);
        this.pos += m[0].length;
        this.ws();
        let params: Param[] = [];
        if (this.ch() === '(') {
          this.pos++;
          params = this.parseParamList(')');
        }
        this.ws(true);
        if (this.ch() !== '{') {
          if (this.eof()) throw new PsIncomplete('{');
          throw new PsSyntaxError('Missing function body in function declaration.', this.pos);
        }
        const bodyStart = this.pos;
        this.pos++;
        const body = this.parseStatements('}');
        this.pos++;
        const first = body.stmts[0];
        if (first && first.k === 'param') params = first.params;
        return { k: 'func', name: m[0], params, body, src: this.src.slice(bodyStart, this.pos), full: this.src.slice(startPos, this.pos) };
      }
      case 'switch': {
        this.ws();
        let mode: 'exact' | 'regex' | 'wildcard' = 'exact';
        let cs = false;
        while (this.ch() === '-') {
          const m = /^-(regex|wildcard|exact|casesensitive)\b/i.exec(this.src.slice(this.pos));
          if (!m) throw new PsSyntaxError('Parametro di switch non supportato nel laboratorio (supportati: -Regex, -Wildcard, -Exact, -CaseSensitive).', this.pos);
          const f = m[1].toLowerCase();
          if (f === 'casesensitive') cs = true;
          else mode = f as typeof mode;
          this.pos += m[0].length;
          this.ws();
        }
        const subject = this.parenStmt();
        this.ws(true);
        if (this.ch() !== '{') {
          if (this.eof()) throw new PsIncomplete('{');
          throw new PsSyntaxError("Missing '{' in switch statement.", this.pos);
        }
        this.pos++;
        const clauses: { cond: Expr | null; body: Block }[] = [];
        for (;;) {
          this.ws(true);
          while (this.ch() === ';') {
            this.pos++;
            this.ws(true);
          }
          if (this.eof()) throw new PsIncomplete('}');
          if (this.ch() === '}') {
            this.pos++;
            break;
          }
          let cond: Expr | null;
          const dm = /^default\b/i.exec(this.src.slice(this.pos));
          const bw = /^[A-Za-z_][A-Za-z0-9_\-.]*/.exec(this.src.slice(this.pos));
          if (dm) {
            this.pos += 7;
            cond = null;
          } else if (bw) {
            this.pos += bw[0].length;
            cond = { k: 'str', v: bw[0] };
          } else cond = this.parseOrNoComma();
          clauses.push({ cond, body: this.block() });
        }
        return { k: 'switch', subject, mode, cs, clauses };
      }
      case 'param': {
        this.ws();
        if (this.ch() !== '(') throw new PsSyntaxError("Missing '(' after param.", this.pos);
        this.pos++;
        return { k: 'param', params: this.parseParamList(')') };
      }
      case 'return':
      case 'throw': {
        this.ws();
        const c = this.ch();
        let value: Stmt | null = null;
        if (c && c !== '\n' && c !== ';' && c !== '}' && c !== ')') value = this.parsePipelineOrAssign();
        const end = this.pos;
        return kw === 'return' ? { k: 'return', value } : { k: 'throw', value, start: startPos, end };
      }
      case 'exit': {
        this.ws();
        const c = this.ch();
        let value: Stmt | null = null;
        if (c && c !== '\n' && c !== ';' && c !== '}') value = this.parsePipelineOrAssign();
        return { k: 'exit', value };
      }
      case 'break':
        return { k: 'break' };
      case 'continue':
        return { k: 'continue' };
      case 'try': {
        const body = this.block();
        const catches: { types: string[]; body: Block }[] = [];
        let fin: Block | null = null;
        for (;;) {
          const save = this.pos;
          this.ws(true);
          const m = /^(catch|finally)\b/i.exec(this.src.slice(this.pos));
          if (!m) {
            this.pos = save;
            break;
          }
          this.pos += m[0].length;
          if (m[0].toLowerCase() === 'catch') {
            const types: string[] = [];
            this.ws();
            while (this.ch() === '[') {
              const e = this.src.indexOf(']', this.pos);
              types.push(this.src.slice(this.pos + 1, e));
              this.pos = e + 1;
              this.ws();
              if (this.ch() === ',') {
                this.pos++;
                this.ws();
              }
            }
            catches.push({ types, body: this.block() });
          } else fin = this.block();
        }
        if (!catches.length && !fin) throw new PsSyntaxError("The Try statement is missing its Catch or Finally block.", this.pos);
        return { k: 'try', body, catches, fin };
      }
    }
    this.pos = startPos;
    return null;
  }

  private parseParamList(close: string): Param[] {
    const params: Param[] = [];
    for (;;) {
      this.ws(true);
      if (this.eof()) throw new PsIncomplete(close);
      if (this.ch() === close) {
        this.pos++;
        break;
      }
      if (this.ch() === ',') {
        this.pos++;
        continue;
      }
      let type: string | null = null;
      while (this.ch() === '[') {
        const e = this.matchBracket(this.pos);
        const inner = this.src.slice(this.pos + 1, e);
        if (!/^(Parameter|ValidateSet|ValidateNotNull|Alias|ValidateRange|Validate)/i.test(inner)) type = inner;
        this.pos = e + 1;
        this.ws(true);
      }
      if (this.ch() !== '$') throw new PsSyntaxError('Unexpected token in parameter list.', this.pos);
      this.pos++;
      const name = this.readName();
      this.ws();
      let def: Expr | null = null;
      if (this.ch() === '=') {
        this.pos++;
        this.ws();
        def = this.parseOrNoComma();
      }
      params.push({ name, def, type, isSwitch: type?.toLowerCase() === 'switch' });
    }
    return params;
  }

  private matchBracket(from: number): number {
    let depth = 0;
    for (let i = from; i < this.src.length; i++) {
      if (this.src[i] === '[') depth++;
      else if (this.src[i] === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
    throw new PsIncomplete(']');
  }

  private readName(): string {
    const m = /^(?:[A-Za-z_][A-Za-z0-9_]*)/.exec(this.src.slice(this.pos));
    if (!m) throw new PsSyntaxError('Variable reference is not valid. Missing name.', this.pos);
    this.pos += m[0].length;
    return m[0];
  }

  // ---- pipeline / assegnazione ----
  parsePipelineOrAssign(): Stmt {
    this.ws();
    const start = this.pos;
    // assegnazione?
    if (this.ch() === '$' || this.ch() === '[') {
      const save = this.pos;
      try {
        let castType: string | null = null;
        if (this.ch() === '[') {
          const e = this.matchBracket(this.pos);
          const t = this.src.slice(this.pos + 1, e);
          const after = this.src[e + 1];
          if (after === '$' && /^[A-Za-z.\[\]]+$/.test(t)) {
            castType = t;
            this.pos = e + 1;
          } else throw new Error('no-assign');
        }
        let target = this.parseLValue();
        this.ws();
        if (this.ch() === ',' && !castType) {
          const list: Expr[] = [target];
          while (this.ch() === ',') {
            this.pos++;
            this.ws();
            list.push(this.parseLValue());
            this.ws();
          }
          target = { k: 'multi', list };
        }
        const m = /^(\+=|-=|\*=|\/=|%=|=)(?!=)/.exec(this.src.slice(this.pos, this.pos + 2));
        if (m) {
          this.pos += m[0].length;
          this.ws(true);
          if (this.eof()) throw new PsIncomplete('=');
          const value = this.parseStatementValue();
          const tgt: Expr = castType ? { k: 'cast', type: castType, e: target } : target;
          return { k: 'assign', target: tgt, op: m[1], value, start, end: this.pos };
        }
      } catch (e) {
        if (e instanceof PsIncomplete) throw e;
      }
      this.pos = save;
    }
    return this.parsePipeline();
  }

  /** valore a destra di un'assegnazione: if/foreach non supportati come espressione; pipeline sì */
  private parseStatementValue(): Stmt {
    const kw = this.peekKeyword();
    if (kw === 'if' || kw === 'foreach' || kw === 'try') {
      const s = this.parseKeyword(kw);
      if (s) return s;
    }
    return this.parsePipelineOrAssign();
  }

  private parseLValue(): Expr {
    // variabile con suffissi member/index, senza operatori
    let e = this.parsePrimary();
    for (;;) {
      if (this.ch() === '.' && /[A-Za-z_$]/.test(this.ch(1))) {
        this.pos++;
        if (this.ch() === '$') {
          this.pos++;
          e = { k: 'member', obj: e, name: { k: 'var', name: this.readName() }, args: null };
        } else {
          const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.pos))!;
          this.pos += m[0].length;
          e = { k: 'member', obj: e, name: m[0], args: null };
        }
      } else if (this.ch() === '[') {
        this.pos++;
        this.ws();
        const idx = this.parseExpression();
        this.ws();
        if (this.ch() !== ']') throw new PsSyntaxError("Missing ']'", this.pos);
        this.pos++;
        e = { k: 'index', obj: e, idx };
      } else break;
    }
    if (e.k !== 'var' && e.k !== 'member' && e.k !== 'index') throw new Error('not-lvalue');
    return e;
  }

  parsePipeline(): Stmt {
    this.ws();
    const start = this.pos;
    const elems: (CmdNode | ExprElem)[] = [this.parseElement()];
    const redirs: Redir[] = [];
    for (;;) {
      this.ws();
      this.parseRedirs(redirs);
      if (this.ch() === '|' && this.ch(1) !== '|') {
        this.pos++;
        this.ws(true);
        if (this.eof()) throw new PsIncomplete('|');
        elems.push(this.parseElement());
      } else break;
    }
    return { k: 'pipeline', elems, redirs, start, end: this.pos };
  }

  private parseRedirs(redirs: Redir[]): void {
    for (;;) {
      this.ws();
      const m = /^(\*|\d)?(>>|>)(&1)?/.exec(this.src.slice(this.pos, this.pos + 6));
      if (!m) {
        if (this.ch() === '<') throw new PsSyntaxError("The '<' operator is reserved for future use.", this.pos, '<');
        return;
      }
      this.pos += m[0].length;
      const fdRaw = m[1] ?? '1';
      const fd = (fdRaw === '*' ? 0 : parseInt(fdRaw, 10)) as 0 | 1 | 2;
      if (m[3]) {
        redirs.push({ fd, append: false, target: '&1' });
        continue;
      }
      this.ws();
      if (this.eof()) throw new PsSyntaxError('Missing file specification after redirection operator.', this.pos);
      redirs.push({ fd, append: m[2] === '>>', target: this.parseArgValue() });
    }
  }

  private isExprStart(): boolean {
    const c = this.ch();
    if (c === '$' || /\d/.test(c) || c === '"' || c === "'" || c === '(' || c === '[' || c === '{' || c === '!') return true;
    if (c === '@' && /[({"']/.test(this.ch(1))) return true;
    if (c === '-' || c === '+') return true;
    return false;
  }

  private parseElement(): CmdNode | ExprElem {
    this.ws();
    const start = this.pos;
    if (this.eof()) throw new PsIncomplete('comando');
    if (this.isExprStart() && !(this.ch() === '{' && false)) {
      const e = this.parseExpression();
      return { k: 'expr', e, start, end: this.pos };
    }
    return this.parseCommand();
  }

  private parseCommand(): CmdNode {
    const start = this.pos;
    let amp = false;
    let dot = false;
    let name: Expr;
    if (this.ch() === '&') {
      amp = true;
      this.pos++;
      this.ws();
      name = this.parseArgValue();
    } else if (this.ch() === '.' && /\s/.test(this.ch(1))) {
      dot = true;
      this.pos++;
      this.ws();
      name = this.parseArgValue();
    } else {
      const m = /^[^\s;|(){}`'"$,<>&]+/.exec(this.src.slice(this.pos));
      if (!m) {
        const bad = this.readUntilSpace();
        throw new PsSyntaxError(`Unexpected token '${bad.slice(0, 1) || this.ch()}' in expression or statement.`, this.pos, bad);
      }
      if (/^&&|^\|\|/.test(this.src.slice(this.pos))) throw new PsSyntaxError("The token '&&' is not a valid statement separator in this version.", this.pos);
      this.pos += m[0].length;
      name = { k: 'bare', v: m[0] };
    }
    const args: Arg[] = [];
    for (;;) {
      this.ws();
      const c = this.ch();
      if (!c || c === '\n' || c === ';' || c === '|' || c === ')' || c === '}') break;
      if (this.starts('&&') || this.starts('||')) {
        throw new PsSyntaxError(`The token '${this.src.slice(this.pos, this.pos + 2)}' is not a valid statement separator in this version.`, this.pos, this.src.slice(this.pos, this.pos + 2));
      }
      if (/^(\*|\d)?>/.test(this.src.slice(this.pos, this.pos + 3)) || c === '<') break;
      args.push(this.parseArg());
    }
    return { k: 'cmd', name, args, amp, dot, start, end: this.pos };
  }

  private parseArg(): Arg {
    const c = this.ch();
    if (c === '-' && /[A-Za-z]/.test(this.ch(1))) {
      const m = /^-([A-Za-z][A-Za-z0-9_]*)(:?)/.exec(this.src.slice(this.pos))!;
      // distingue "-Name" da un valore come "-eq"
      this.pos += m[0].length;
      if (m[2]) {
        this.ws();
        const v = this.parseArgValue();
        return { k: 'param', name: m[1], value: v };
      }
      return { k: 'param', name: m[1], value: null };
    }
    if (c === '@' && /[A-Za-z_]/.test(this.ch(1))) {
      this.pos++;
      return { k: 'splat', name: this.readName() };
    }
    let first = this.parseArgValue();
    // lista separata da virgole
    if (this.ch() === ',') {
      const items = [first];
      while (this.ch() === ',') {
        this.pos++;
        this.ws();
        items.push(this.parseArgValue());
      }
      first = { k: 'array', items };
    }
    return { k: 'pos', value: first };
  }

  /** valore di argomento in modalità comando */
  private parseArgValue(): Expr {
    const c = this.ch();
    if (c === '$' || c === '(' || c === '{' || c === '"' || c === "'" || (c === '@' && /[({"']/.test(this.ch(1))) || c === '[') {
      if (c === '[') {
        // cast o indice non ammesso come bareword: tratta come espressione
        return this.parseUnary();
      }
      let e = this.parsePrimary();
      // concatenazione (es. $env:HOME/docs, "$x"suffix) e catena membro
      e = this.parsePostfixChain(e);
      const tail = /^[^\s;|(){},<>&"'`]+/.exec(this.src.slice(this.pos));
      if (tail && e.k !== 'sb') {
        this.pos += tail[0].length;
        return { k: 'estr', parts: [e.k === 'str' ? e.v : e, tail[0]] };
      }
      return e;
    }
    if (c === '-' && /[\d]/.test(this.ch(1))) {
      const m = /^-?\d+(\.\d+)?/.exec(this.src.slice(this.pos))!;
      const after = this.src[this.pos + m[0].length] ?? '';
      if (!after || /[\s;|)},]/.test(after)) {
        this.pos += m[0].length;
        return { k: 'num', v: parseFloat(m[0]) };
      }
    }
    // bareword (con eventuali variabili inline e virgolette)
    const parts: (string | Expr)[] = [];
    let buf = '';
    for (;;) {
      const ch = this.ch();
      if (!ch || /[\s;|(){},<>&]/.test(ch)) {
        if (ch === '(' && buf) {
          // es. nome(...) non supportato come argomento
        }
        break;
      }
      if (ch === '`') {
        buf += this.ch(1);
        this.pos += 2;
        continue;
      }
      if (ch === '$') {
        if (buf) parts.push(buf);
        buf = '';
        parts.push(this.parseVariable());
        continue;
      }
      if (ch === '"' || ch === "'") {
        if (buf) parts.push(buf);
        buf = '';
        parts.push(ch === '"' ? this.parseDoubleString() : this.parseSingleString());
        continue;
      }
      buf += ch;
      this.pos++;
    }
    if (buf) parts.push(buf);
    if (!parts.length) {
      throw new PsSyntaxError(`Unexpected token '${this.ch() || 'newline'}' in expression or statement.`, this.pos, this.ch());
    }
    if (parts.length === 1) {
      const p = parts[0];
      if (typeof p === 'string') {
        if (/^-?\d+(\.\d+)?$/.test(p)) return { k: 'num', v: parseFloat(p) };
        return { k: 'bare', v: p };
      }
      return p;
    }
    return { k: 'estr', parts: parts.map((p) => (typeof p === 'object' && p.k === 'str' ? p.v : p)) };
  }

  // ---- espressioni ----
  parseExpression(): Expr {
    return this.parseOr();
  }

  private peekOp(ops: string[]): string | null {
    this.ws();
    const m = /^-([A-Za-z]+)/.exec(this.src.slice(this.pos, this.pos + 14));
    if (!m) return null;
    const w = m[1].toLowerCase();
    const after = this.src[this.pos + m[0].length] ?? '';
    if (/[A-Za-z0-9_]/.test(after)) return null;
    return ops.includes(w) ? w : null;
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    for (;;) {
      const op = this.peekOp(['or', 'xor']);
      if (!op) break;
      this.pos += op.length + 1;
      this.ws(true);
      l = { k: 'bin', op, l, r: this.parseAnd() };
    }
    return l;
  }

  private parseAnd(): Expr {
    let l = this.parseCompare();
    for (;;) {
      const op = this.peekOp(['and']);
      if (!op) break;
      this.pos += op.length + 1;
      this.ws(true);
      l = { k: 'bin', op, l, r: this.parseCompare() };
    }
    return l;
  }

  private parseCompare(): Expr {
    let l = this.parseAdditive();
    for (;;) {
      const op = this.peekOp(CMP_OPS);
      if (!op) break;
      this.pos += op.length + 1;
      this.ws(true);
      if (op === 'is' || op === 'isnot' || op === 'as') {
        this.ws();
        const m = /^\[([^\]]+)\]/.exec(this.src.slice(this.pos));
        if (!m) throw new PsSyntaxError('Missing type after -is.', this.pos);
        this.pos += m[0].length;
        l = { k: 'bin', op, l, r: { k: 'str', v: m[1] } };
        continue;
      }
      l = { k: 'bin', op, l, r: this.parseAdditive() };
    }
    return l;
  }

  private parseAdditive(): Expr {
    let l = this.parseMul();
    for (;;) {
      this.ws();
      const c = this.ch();
      if ((c === '+' || c === '-') && this.ch(1) !== '=' && !(c === '-' && /[A-Za-z]/.test(this.ch(1)) && this.peekOpAny()) && this.ch(1) !== c) {
        this.pos++;
        this.ws(true);
        l = { k: 'bin', op: c, l, r: this.parseMul() };
      } else break;
    }
    return l;
  }

  private peekOpAny(): boolean {
    return !!this.peekOp([...CMP_OPS, ...LOGIC_OPS, 'f']);
  }

  private parseMul(): Expr {
    let l = this.parseFormat();
    for (;;) {
      this.ws();
      const c = this.ch();
      if ((c === '*' || c === '/' || c === '%') && this.ch(1) !== '=') {
        this.pos++;
        this.ws(true);
        l = { k: 'bin', op: c, l, r: this.parseFormat() };
      } else break;
    }
    return l;
  }

  private parseFormat(): Expr {
    let l = this.parseRange();
    for (;;) {
      const op = this.peekOp(['f']);
      if (!op) break;
      this.pos += 2;
      this.ws(true);
      l = { k: 'bin', op: 'f', l, r: this.parseRange() };
    }
    return l;
  }

  private parseRange(): Expr {
    let l = this.parseComma();
    for (;;) {
      this.ws();
      if (this.starts('..')) {
        this.pos += 2;
        this.ws();
        l = { k: 'bin', op: '..', l, r: this.parseComma() };
      } else break;
    }
    return l;
  }

  private parseComma(): Expr {
    const first = this.parseUnary();
    this.ws();
    if (this.ch() !== ',') return first;
    const items = [first];
    while (this.ch() === ',') {
      this.pos++;
      this.ws(true);
      items.push(this.parseUnary());
      this.ws();
    }
    return { k: 'array', items };
  }

  private parseUnary(): Expr {
    this.ws();
    const c = this.ch();
    if (c === '!') {
      this.pos++;
      return { k: 'un', op: '!', e: this.parseUnary() };
    }
    if (c === '-' && this.ch(1) !== '-' && !/[A-Za-z]/.test(this.ch(1))) {
      this.pos++;
      return { k: 'un', op: '-', e: this.parseUnary() };
    }
    if (c === '+' && this.ch(1) !== '+') {
      this.pos++;
      return { k: 'un', op: '+', e: this.parseUnary() };
    }
    if (c === '-' && /^-not\b/i.test(this.src.slice(this.pos, this.pos + 5))) {
      this.pos += 4;
      return { k: 'un', op: '!', e: this.parseUnary() };
    }
    if ((c === '-' && this.ch(1) === '-') || (c === '+' && this.ch(1) === '+')) {
      this.pos += 2;
      const t = this.parseUnary();
      return { k: 'prefix', op: c === '+' ? '++' : '--', target: t };
    }
    if (c === '-' && /^-split\b|^-join\b/i.test(this.src.slice(this.pos, this.pos + 7))) {
      const op = this.src.slice(this.pos + 1, this.pos + 6).toLowerCase().replace(/\W/g, '');
      this.pos += 1 + op.length;
      return { k: 'un', op: '-' + op, e: this.parseUnary() };
    }
    if (c === '[') {
      const e = this.matchBracket(this.pos);
      const type = this.src.slice(this.pos + 1, e);
      if (/^[A-Za-z][A-Za-z0-9_.\[\]]*$/.test(type)) {
        this.pos = e + 1;
        if (this.starts('::')) {
          this.pos += 2;
          const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.pos));
          if (!m) throw new PsSyntaxError('Missing member after ::', this.pos);
          this.pos += m[0].length;
          let args: Expr[] | null = null;
          if (this.ch() === '(') args = this.parseCallArgs();
          return this.parsePostfixChain({ k: 'static', type, member: m[0], args });
        }
        return { k: 'cast', type, e: this.parseUnary() };
      }
    }
    return this.parsePostfixChain(this.parsePrimary());
  }

  private parseCallArgs(): Expr[] {
    this.pos++; // (
    const args: Expr[] = [];
    this.ws(true);
    if (this.ch() === ')') {
      this.pos++;
      return args;
    }
    for (;;) {
      this.ws(true);
      args.push(this.parseOrNoComma());
      this.ws(true);
      if (this.eof()) throw new PsIncomplete(')');
      if (this.ch() === ',') {
        this.pos++;
        continue;
      }
      if (this.ch() === ')') {
        this.pos++;
        break;
      }
      throw new PsSyntaxError(`Missing ')' in method call.`, this.pos);
    }
    return args;
  }

  private parseOrNoComma(): Expr {
    // espressione senza operatore virgola (usata negli argomenti di metodo)
    let l = this.parseAndNoComma();
    for (;;) {
      const op = this.peekOp(['or', 'xor']);
      if (!op) break;
      this.pos += op.length + 1;
      l = { k: 'bin', op, l, r: this.parseAndNoComma() };
    }
    return l;
  }
  private parseAndNoComma(): Expr {
    let l = this.parseCompareNoComma();
    for (;;) {
      const op = this.peekOp(['and']);
      if (!op) break;
      this.pos += op.length + 1;
      l = { k: 'bin', op, l, r: this.parseCompareNoComma() };
    }
    return l;
  }
  private parseCompareNoComma(): Expr {
    let l = this.parseAddNoComma();
    for (;;) {
      const op = this.peekOp(CMP_OPS);
      if (!op) break;
      this.pos += op.length + 1;
      l = { k: 'bin', op, l, r: this.parseAddNoComma() };
    }
    return l;
  }
  private parseAddNoComma(): Expr {
    let l = this.parseMulNoComma();
    for (;;) {
      this.ws();
      const c = this.ch();
      if ((c === '+' || c === '-') && !(c === '-' && /[A-Za-z]/.test(this.ch(1)))) {
        this.pos++;
        l = { k: 'bin', op: c, l, r: this.parseMulNoComma() };
      } else break;
    }
    return l;
  }
  private parseMulNoComma(): Expr {
    let l = this.parseUnary();
    for (;;) {
      this.ws();
      const c = this.ch();
      if (c === '*' || c === '/' || c === '%') {
        this.pos++;
        l = { k: 'bin', op: c, l, r: this.parseUnary() };
      } else if (this.starts('..')) {
        this.pos += 2;
        l = { k: 'bin', op: '..', l, r: this.parseUnary() };
      } else break;
    }
    return l;
  }

  private bracketRetry = false;

  private parsePostfixChain(e: Expr): Expr {
    for (;;) {
      const c = this.ch();
      if (c === '.' && this.ch(1) !== '.' && /[A-Za-z_$({'"]/.test(this.ch(1))) {
        this.pos++;
        let name: string | Expr;
        if (this.ch() === '$') {
          name = this.parseVariable();
        } else if (this.ch() === '(') {
          this.pos++;
          const s = this.parsePipelineOrAssign();
          this.ws(true);
          this.pos++;
          name = { k: 'paren', stmt: s };
        } else if (this.ch() === "'") {
          name = this.parseSingleString();
        } else if (this.ch() === '"') {
          name = this.parseDoubleString();
        } else if (this.ch() === '{') {
          throw new PsSyntaxError('Unexpected token in member access.', this.pos);
        } else {
          const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.pos))!;
          this.pos += m[0].length;
          name = m[0];
        }
        let args: Expr[] | null = null;
        if (this.ch() === '(') args = this.parseCallArgs();
        e = { k: 'member', obj: e, name, args };
      } else if (c === '[' ) {
        this.pos++;
        this.ws();
        const idx = this.parseExpression();
        this.ws();
        if (this.eof()) throw new PsIncomplete(']');
        if (this.ch() !== ']') throw new PsSyntaxError("Missing ']' after index expression.", this.pos);
        this.pos++;
        e = { k: 'index', obj: e, idx };
      } else if ((c === '+' && this.ch(1) === '+') || (c === '-' && this.ch(1) === '-')) {
        this.pos += 2;
        e = { k: 'postfix', op: c === '+' ? '++' : '--', target: e };
      } else break;
    }
    return e;
  }

  private parsePrimary(): Expr {
    this.ws();
    const c = this.ch();
    if (!c) throw new PsIncomplete('espressione');
    if (c === '$') return this.parseVariable();
    if (c === '"') return this.parseDoubleString();
    if (c === "'") return this.parseSingleString();
    if (c === '(') {
      this.pos++;
      this.ws(true);
      const s = this.parsePipelineOrAssign();
      this.ws(true);
      if (this.eof()) throw new PsIncomplete(')');
      if (this.ch() !== ')') throw new PsSyntaxError(`Unexpected token '${this.readUntilSpace()}' in expression or statement.`, this.pos);
      this.pos++;
      return { k: 'paren', stmt: s };
    }
    if (c === '{') {
      const start = this.pos;
      this.pos++;
      const block = this.parseStatements('}');
      this.pos++;
      return { k: 'sb', block, src: this.src.slice(start + 1, this.pos - 1) };
    }
    if (c === '@') {
      if (this.ch(1) === '(') {
        this.pos += 2;
        const body = this.parseStatements(')');
        this.pos++;
        return { k: 'arrayexpr', body };
      }
      if (this.ch(1) === '{') {
        this.pos += 2;
        return this.parseHash();
      }
      if (this.ch(1) === '"' || this.ch(1) === "'") return this.parseHereString();
      if (/[A-Za-z_]/.test(this.ch(1))) {
        this.pos++;
        return { k: 'splat', name: this.readName() };
      }
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(this.ch(1)))) return this.parseNumber();
    if (c === '[') {
      // `[` che non apre un cast riconosciuto: un solo tentativo, poi errore di sintassi (evita la ricorsione infinita)
      if (this.bracketRetry) throw new PsSyntaxError(`Unexpected token '[' in expression or statement.`, this.pos, '[');
      this.bracketRetry = true;
      try {
        return this.parseUnary();
      } finally {
        this.bracketRetry = false;
      }
    }
    throw new PsSyntaxError(`Unexpected token '${this.readUntilSpace().slice(0, 20)}' in expression or statement.`, this.pos, this.readUntilSpace());
  }

  private parseNumber(): Expr {
    const hex = /^0x[0-9a-fA-F]+/.exec(this.src.slice(this.pos));
    let v: number;
    if (hex) {
      v = parseInt(hex[0], 16);
      this.pos += hex[0].length;
    } else {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(this.src.slice(this.pos))!;
      // "1..3": non consumare il punto dell'intervallo
      let text = m[0];
      if (/^\d+\.\.$/.test(this.src.slice(this.pos, this.pos + text.length + 1)) || (text.endsWith('.') && this.ch(text.length) === '.')) text = text.replace(/\.$/, '');
      v = parseFloat(text);
      this.pos += text.length;
    }
    const suf = /^(kb|mb|gb|tb)\b/i.exec(this.src.slice(this.pos));
    if (suf) {
      v *= { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }[suf[1].toLowerCase() as 'kb'];
      this.pos += 2;
    }
    return { k: 'num', v };
  }

  private parseVariable(): Expr {
    this.pos++; // $
    if (this.ch() === '(') {
      this.pos++;
      const body = this.parseStatements(')');
      this.pos++;
      return { k: 'subexpr', body };
    }
    if (this.ch() === '{') {
      const e = this.src.indexOf('}', this.pos);
      if (e < 0) throw new PsIncomplete('}');
      const name = this.src.slice(this.pos + 1, e);
      this.pos = e + 1;
      return { k: 'var', name };
    }
    const special = /^[?_$^]/.exec(this.src.slice(this.pos));
    if (special && !/^_[A-Za-z0-9]/.test(this.src.slice(this.pos, this.pos + 2))) {
      this.pos++;
      return { k: 'var', name: special[0] };
    }
    const m = /^(?:(?:env|global|script|local|private|using):)?[A-Za-z_][A-Za-z0-9_]*/i.exec(this.src.slice(this.pos));
    if (!m) throw new PsSyntaxError("Variable reference is not valid. '$' was not followed by a valid variable name character. Consider using ${} to delimit the name.", this.pos);
    this.pos += m[0].length;
    return { k: 'var', name: m[0] };
  }

  private parseSingleString(): Expr {
    this.pos++;
    let s = '';
    for (;;) {
      if (this.eof()) throw new PsIncomplete("'");
      const c = this.ch();
      if (c === "'") {
        if (this.ch(1) === "'") {
          s += "'";
          this.pos += 2;
          continue;
        }
        this.pos++;
        break;
      }
      s += c;
      this.pos++;
    }
    return { k: 'str', v: s };
  }

  private parseDoubleString(): Expr {
    this.pos++;
    return this.readInterpolated((c) => c === '"' && this.ch(1) !== '"', true);
  }

  private parseHereString(): Expr {
    const q = this.ch(1);
    const m = new RegExp(`^@${q}[ \\t]*\\r?\\n`).exec(this.src.slice(this.pos));
    if (!m) throw new PsSyntaxError('No characters are allowed after a here-string header but before the end of the line.', this.pos);
    this.pos += m[0].length;
    const endRe = new RegExp(`\\r?\\n${q}@`);
    const rest = this.src.slice(this.pos);
    const em = endRe.exec(rest);
    const emptyEnd = rest.startsWith(`${q}@`);
    if (!em && !emptyEnd) throw new PsIncomplete(`${q}@`);
    const bodyEnd = emptyEnd ? 0 : em!.index;
    const body = rest.slice(0, bodyEnd);
    const consumed = emptyEnd ? 2 : em![0].length + bodyEnd;
    if (q === "'") {
      this.pos += consumed;
      return { k: 'str', v: body };
    }
    const sub = new PsParser(body);
    sub.pos = 0;
    const e = sub.readInterpolated(() => false, false, true);
    this.pos += consumed;
    return e;
  }

  readInterpolated(isEnd: (c: string) => boolean, quoted: boolean, toEof = false): Expr {
    const parts: (string | Expr)[] = [];
    let buf = '';
    for (;;) {
      if (this.eof()) {
        if (toEof) break;
        throw new PsIncomplete('"');
      }
      const c = this.ch();
      if (!toEof && isEnd(c)) {
        this.pos++;
        break;
      }
      if (quoted && c === '"' && this.ch(1) === '"') {
        buf += '"';
        this.pos += 2;
        continue;
      }
      if (c === '`') {
        const n = this.ch(1);
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', '`': '`', '"': '"', $: '$', "'": "'" };
        buf += map[n] ?? n;
        this.pos += 2;
        continue;
      }
      if (c === '$') {
        const n = this.ch(1);
        if (n === '(') {
          if (buf) parts.push(buf);
          buf = '';
          parts.push(this.parseVariable());
          continue;
        }
        if (n === '{') {
          if (buf) parts.push(buf);
          buf = '';
          parts.push(this.parseVariable());
          continue;
        }
        const m = /^\$((?:(?:env|script|global|local|private):)?[A-Za-z_][A-Za-z0-9_]*|[?_$^])/i.exec(this.src.slice(this.pos));
        if (m) {
          if (buf) parts.push(buf);
          buf = '';
          this.pos += m[0].length;
          parts.push({ k: 'var', name: m[1] });
          continue;
        }
      }
      buf += c;
      this.pos++;
    }
    if (buf || !parts.length) parts.push(buf);
    if (parts.length === 1 && typeof parts[0] === 'string') return { k: 'str', v: parts[0] };
    return { k: 'estr', parts };
  }

  private parseHash(): Expr {
    const entries: { key: Expr; val: Stmt }[] = [];
    for (;;) {
      this.ws(true);
      while (this.ch() === ';') {
        this.pos++;
        this.ws(true);
      }
      if (this.eof()) throw new PsIncomplete('}');
      if (this.ch() === '}') {
        this.pos++;
        break;
      }
      let key: Expr;
      if (this.ch() === '"' || this.ch() === "'") key = this.ch() === '"' ? this.parseDoubleString() : this.parseSingleString();
      else if (this.ch() === '$') key = this.parseVariable();
      else {
        const m = /^[A-Za-z0-9_\-.]+/.exec(this.src.slice(this.pos));
        if (!m) throw new PsSyntaxError(`Missing '=' operator after key in hash literal.`, this.pos);
        this.pos += m[0].length;
        key = /^\d+$/.test(m[0]) ? { k: 'num', v: parseInt(m[0], 10) } : { k: 'str', v: m[0] };
      }
      this.ws();
      if (this.ch() !== '=') throw new PsSyntaxError("Missing '=' operator after key in hash literal.", this.pos);
      this.pos++;
      this.ws(true);
      const val = this.parseStatementValue();
      entries.push({ key, val });
    }
    return { k: 'hash', entries };
  }
}

export function parsePs(src: string): Block {
  return new PsParser(src).parseProgram();
}

export function lineCol(src: string, pos: number): { line: number; col: number; lineText: string } {
  const before = src.slice(0, pos);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = src.indexOf('\n', pos);
  return { line, col: pos - lineStart + 1, lineText: src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd) };
}
