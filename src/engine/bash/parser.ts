/** Parser Bash (sottoinsieme): comandi, pipe, liste, if/for/while, funzioni, redirezioni, heredoc. */

export type Seg =
  | { t: 'text'; v: string; q: boolean }
  | { t: 'var'; name: string; q: boolean; op?: string; arg?: Word; arg2?: Word; index?: Word }
  | { t: 'cmd'; src: string; q: boolean }
  | { t: 'arith'; expr: string; q: boolean }
  | { t: 'proc'; src: string; q: boolean }
  | { t: 'tilde' };
export type Word = Seg[];

export interface Redir {
  fd: number;
  op: '>' | '>>' | '<' | '>&' | '<<' | '<<<';
  target: Word;
  heredoc?: string;
  heredocQuoted?: boolean;
}

export type Node =
  | { type: 'simple'; assigns: Assign[]; words: Word[]; redirs: Redir[]; src: string }
  | { type: 'pipeline'; cmds: Node[]; negate: boolean }
  | { type: 'andor'; first: Node; rest: { op: '&&' | '||'; node: Node }[] }
  | { type: 'list'; items: Node[] }
  | { type: 'if'; branches: { cond: Node; body: Node }[]; else?: Node }
  | { type: 'for'; name: string; words: Word[] | null; body: Node }
  | { type: 'while'; cond: Node; body: Node; until: boolean }
  | { type: 'func'; name: string; body: Node; src: string }
  | { type: 'group'; body: Node; subshell: boolean; redirs: Redir[] }
  | { type: 'arith'; expr: string }
  | { type: 'cfor'; init: string; cond: string; step: string; body: Node }
  | { type: 'case'; word: Word; items: { patterns: Word[]; body: Node }[] };

export interface Assign {
  name: string;
  value: Word;
  append: boolean;
  /** name[idx]=valore */
  index?: Word;
  /** name=(a b c) oppure name=([k]=v ...) */
  array?: { key?: Word; value: Word }[];
  /** dopo il builtin (declare -A m=(...)) invece che come variabile temporanea del comando */
  post?: boolean;
}

export class Incomplete extends Error {}
export class BashSyntaxError extends Error {}

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', '{', '}', '!', 'function', 'case', 'esac']);

export class Parser {
  pos = 0;
  constructor(public src: string) {}

  private eof(): boolean {
    return this.pos >= this.src.length;
  }
  private peekc(o = 0): string {
    return this.src[this.pos + o] ?? '';
  }

  private skipBlank(): void {
    for (;;) {
      const c = this.peekc();
      if (c === ' ' || c === '\t' || c === '\r') this.pos++;
      else if (c === '\\' && this.peekc(1) === '\n') this.pos += 2;
      else if (c === '#') {
        while (!this.eof() && this.peekc() !== '\n') this.pos++;
      } else break;
    }
  }

  /** salta spazi, newline e `;` tra comandi */
  private skipSeparators(): void {
    for (;;) {
      this.skipBlank();
      const c = this.peekc();
      if (c === '\n' || c === ';') {
        if (c === ';' && this.peekc(1) === ';') {
          if (this.inCase > 0) break;
          throw new BashSyntaxError("syntax error near unexpected token `;;'");
        }
        this.pos++;
        this.readPendingHeredocs();
      } else break;
    }
  }

  private inCase = 0;
  private pendingHeredocs: { redir: Redir; delim: string; strip: boolean }[] = [];

  private readPendingHeredocs(): void {
    while (this.pendingHeredocs.length) {
      const h = this.pendingHeredocs.shift()!;
      const lines: string[] = [];
      let found = false;
      while (!this.eof()) {
        let end = this.src.indexOf('\n', this.pos);
        if (end < 0) end = this.src.length;
        let line = this.src.slice(this.pos, end);
        this.pos = Math.min(end + 1, this.src.length);
        const cmp = h.strip ? line.replace(/^\t+/, '') : line;
        if (cmp === h.delim) {
          found = true;
          break;
        }
        lines.push(h.strip ? line.replace(/^\t+/, '') : line);
        if (end >= this.src.length) break;
      }
      if (!found) throw new Incomplete('heredoc');
      h.redir.heredoc = lines.length ? lines.join('\n') + '\n' : '';
    }
  }

  parseProgram(): Node {
    const list = this.parseList([]);
    this.skipSeparators();
    if (!this.eof()) {
      throw new BashSyntaxError(`syntax error near unexpected token \`${this.src[this.pos]}'`);
    }
    if (this.pendingHeredocs.length) throw new Incomplete('heredoc');
    return list;
  }

  private peekWord(): string | null {
    this.skipBlank();
    const m = /^[A-Za-z_{}!][A-Za-z0-9_]*|^[{}!]/.exec(this.src.slice(this.pos, this.pos + 20));
    if (!m) return null;
    const after = this.src[this.pos + m[0].length] ?? '';
    if (after && !/[\s;|&()<>]/.test(after)) return null;
    return m[0];
  }

  private parseList(stop: string[]): Node {
    const items: Node[] = [];
    for (;;) {
      this.skipSeparators();
      if (this.eof()) break;
      const w = this.peekWord();
      if (w && stop.includes(w)) break;
      if (this.peekc() === ')' && stop.includes(')')) break;
      if (stop.includes(';;') && this.src.startsWith(';;', this.pos)) break;
      items.push(this.parseAndOr());
    }
    return { type: 'list', items };
  }

  private parseAndOr(): Node {
    const first = this.parsePipeline();
    const rest: { op: '&&' | '||'; node: Node }[] = [];
    for (;;) {
      this.skipBlank();
      const two = this.src.slice(this.pos, this.pos + 2);
      if (two === '&&' || two === '||') {
        this.pos += 2;
        this.skipSeparatorsNewlineOnly();
        if (this.eof()) throw new Incomplete(two);
        rest.push({ op: two, node: this.parsePipeline() });
      } else if (this.peekc() === '&') {
        throw new BashSyntaxError('i processi in background (&) non sono supportati nel laboratorio');
      } else break;
    }
    return rest.length ? { type: 'andor', first, rest } : first;
  }

  private skipSeparatorsNewlineOnly(): void {
    for (;;) {
      this.skipBlank();
      if (this.peekc() === '\n') {
        this.pos++;
        this.readPendingHeredocs();
      } else break;
    }
  }

  private parsePipeline(): Node {
    let negate = false;
    this.skipBlank();
    if (this.peekWord() === '!') {
      this.pos++;
      negate = true;
    }
    const cmds: Node[] = [this.parseCommand()];
    for (;;) {
      this.skipBlank();
      if (this.peekc() === '|' && this.peekc(1) !== '|') {
        this.pos++;
        this.skipSeparatorsNewlineOnly();
        if (this.eof()) throw new Incomplete('|');
        cmds.push(this.parseCommand());
      } else break;
    }
    return cmds.length === 1 && !negate ? cmds[0] : { type: 'pipeline', cmds, negate };
  }

  private expectWord(w: string): void {
    this.skipSeparators();
    if (this.eof()) throw new Incomplete(w);
    if (this.peekWord() !== w) {
      const got = this.src.slice(this.pos).split(/[\s;]/)[0];
      throw new BashSyntaxError(`syntax error near unexpected token \`${got}'`);
    }
    this.pos += w.length;
  }

  private parseCommand(): Node {
    const node = this.parseCommandInner();
    // redirezioni dopo `done` / `fi` (es. `while read l; do ...; done < file`): applicate a tutto il costrutto
    if (node.type === 'while' || node.type === 'for' || node.type === 'if') {
      const redirs = this.parseTrailingRedirs();
      if (redirs.length) return { type: 'group', body: node, subshell: false, redirs };
    }
    return node;
  }

  private parseCommandInner(): Node {
    this.skipBlank();
    if (this.eof()) throw new Incomplete('comando');
    const w = this.peekWord();
    if (w === 'if') return this.parseIf();
    if (w === 'for') return this.parseFor();
    if (w === 'case') return this.parseCase();
    if (this.peekc() === '(' && this.peekc(1) === '(') {
      const end = this.findMatching(this.pos + 2, '(', ')', true);
      if (this.src[end + 1] === ')') {
        const expr = this.src.slice(this.pos + 2, end);
        this.pos = end + 2;
        return { type: 'arith', expr };
      }
    }
    if (w === 'while' || w === 'until') {
      this.pos += w.length;
      const cond = this.parseList(['do']);
      this.requireNonEmpty(cond, 'do');
      this.expectWord('do');
      const body = this.parseList(['done']);
      this.expectWord('done');
      return { type: 'while', cond, body, until: w === 'until' };
    }
    if (w === 'function') {
      this.pos += 8;
      this.skipBlank();
      const name = this.readName();
      this.skipBlank();
      if (this.peekc() === '(' && this.peekc(1) === ')') this.pos += 2;
      return this.parseFuncBody(name);
    }
    if (w === '{') {
      this.pos++;
      const body = this.parseList(['}']);
      this.expectWord('}');
      return { type: 'group', body, subshell: false, redirs: this.parseTrailingRedirs() };
    }
    if (this.peekc() === '(' && this.peekc(1) !== '(') {
      this.pos++;
      const body = this.parseList([')']);
      this.skipSeparators();
      if (this.eof()) throw new Incomplete(')');
      this.pos++;
      return { type: 'group', body, subshell: true, redirs: this.parseTrailingRedirs() };
    }
    // definizione di funzione "nome() {"
    const fm = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\(\s*\)/.exec(this.src.slice(this.pos));
    if (fm) {
      this.pos += fm[0].length;
      return this.parseFuncBody(fm[1]);
    }
    if (w && RESERVED.has(w) && w !== '!') {
      throw new BashSyntaxError(`syntax error near unexpected token \`${w}'`);
    }
    return this.parseSimple();
  }

  private parseTrailingRedirs(): Redir[] {
    const redirs: Redir[] = [];
    for (;;) {
      this.skipBlank();
      const r = this.tryRedir();
      if (!r) break;
      redirs.push(r);
    }
    return redirs;
  }

  private parseFuncBody(name: string): Node {
    this.skipSeparators();
    if (this.eof()) throw new Incomplete('funzione');
    const start = this.pos;
    if (this.peekWord() !== '{') throw new BashSyntaxError("syntax error: atteso '{' nella definizione della funzione");
    const body = this.parseCommand();
    return { type: 'func', name, body, src: this.src.slice(start, this.pos) };
  }

  private readName(): string {
    const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(this.src.slice(this.pos));
    if (!m) throw new BashSyntaxError("syntax error: nome non valido");
    this.pos += m[0].length;
    return m[0];
  }

  private parseIf(): Node {
    this.pos += 2;
    const branches: { cond: Node; body: Node }[] = [];
    let cond = this.parseList(['then']);
    this.requireNonEmpty(cond, 'then');
    this.expectWord('then');
    let body = this.parseList(['elif', 'else', 'fi']);
    branches.push({ cond, body });
    let elseNode: Node | undefined;
    for (;;) {
      this.skipSeparators();
      if (this.eof()) throw new Incomplete('fi');
      const w = this.peekWord();
      if (w === 'elif') {
        this.pos += 4;
        cond = this.parseList(['then']);
        this.requireNonEmpty(cond, 'then');
        this.expectWord('then');
        body = this.parseList(['elif', 'else', 'fi']);
        branches.push({ cond, body });
      } else if (w === 'else') {
        this.pos += 4;
        elseNode = this.parseList(['fi']);
      } else if (w === 'fi') {
        this.pos += 2;
        break;
      } else throw new BashSyntaxError("syntax error: atteso 'fi'");
    }
    return { type: 'if', branches, else: elseNode };
  }

  private requireNonEmpty(list: Node, token: string): void {
    if (list.type === 'list' && !list.items.length) {
      if (this.eof()) throw new Incomplete(token);
      throw new BashSyntaxError(`syntax error near unexpected token \`${token}'`);
    }
  }

  private parseCase(): Node {
    this.pos += 4;
    this.skipBlank();
    const word = this.readWord();
    if (!word.length) throw new BashSyntaxError("syntax error near unexpected token `in'");
    this.skipBlank();
    this.skipSeparatorsNewlineOnly();
    if (this.peekWord() !== 'in') {
      if (this.eof()) throw new Incomplete('esac');
      throw new BashSyntaxError("syntax error: atteso 'in'");
    }
    this.pos += 2;
    const items: { patterns: Word[]; body: Node }[] = [];
    this.inCase++;
    try {
      for (;;) {
        this.skipSeparators();
        if (this.eof()) throw new Incomplete('esac');
        if (this.peekWord() === 'esac') {
          this.pos += 4;
          break;
        }
        if (this.peekc() === '(') this.pos++;
        const patterns: Word[] = [];
        for (;;) {
          this.skipBlank();
          const pw = this.readWord();
          if (!pw.length) throw new BashSyntaxError(`syntax error near unexpected token \`${this.peekc() || 'newline'}'`);
          patterns.push(pw);
          this.skipBlank();
          if (this.peekc() === '|') {
            this.pos++;
            continue;
          }
          break;
        }
        if (this.peekc() !== ')') {
          if (this.eof()) throw new Incomplete(')');
          throw new BashSyntaxError(`syntax error near unexpected token \`${this.peekc()}'`);
        }
        this.pos++;
        const body = this.parseList(['esac', ';;']);
        items.push({ patterns, body });
        this.skipBlank();
        if (this.src.startsWith(';;', this.pos)) this.pos += 2;
      }
    } finally {
      this.inCase--;
    }
    return { type: 'case', word, items };
  }

  private parseFor(): Node {
    this.pos += 3;
    this.skipBlank();
    if (this.peekc() === '(' && this.peekc(1) === '(') {
      // for ((init; cond; step))
      const end = this.findMatching(this.pos + 2, '(', ')', true);
      if (this.src[end + 1] !== ')') throw new BashSyntaxError("syntax error near unexpected token `('");
      const parts = this.src.slice(this.pos + 2, end).split(';');
      if (parts.length !== 3) throw new BashSyntaxError("syntax error: attesi tre elementi in for ((;;))");
      this.pos = end + 2;
      this.skipSeparators();
      this.expectWord('do');
      const body = this.parseList(['done']);
      this.expectWord('done');
      return { type: 'cfor', init: parts[0], cond: parts[1], step: parts[2], body };
    }
    const name = this.readName();
    this.skipBlank();
    let words: Word[] | null = null;
    if (this.peekWord() === 'in') {
      this.pos += 2;
      words = [];
      for (;;) {
        this.skipBlank();
        const c = this.peekc();
        if (c === ';' || c === '\n' || this.eof()) break;
        words.push(this.readWord());
      }
    }
    this.skipSeparators();
    this.expectWord('do');
    const body = this.parseList(['done']);
    this.expectWord('done');
    return { type: 'for', name, words, body };
  }

  private tryRedir(): Redir | null {
    const m = /^(\d*)(>>|>&|&>|>|<<<|<<-?|<)/.exec(this.src.slice(this.pos, this.pos + 8));
    if (!m) return null;
    this.pos += m[0].length;
    let op = m[2];
    let fd = m[1] ? parseInt(m[1], 10) : op.startsWith('<') ? 0 : 1;
    if (op === '&>') {
      op = '>';
      fd = -1; // stdout+stderr
    }
    this.skipBlank();
    if (this.eof()) throw new BashSyntaxError("syntax error near unexpected token `newline'");
    const strip = op === '<<-';
    if (op === '<<' || strip) {
      const dw = this.readWord();
      const quoted = dw.some((s) => s.t === 'text' && s.q);
      const delim = dw.map((s) => (s.t === 'text' ? s.v : '')).join('');
      const redir: Redir = { fd, op: '<<', target: dw, heredocQuoted: quoted };
      this.pendingHeredocs.push({ redir, delim, strip });
      return redir;
    }
    const target = this.readWord();
    if (!target.length) throw new BashSyntaxError(`syntax error near unexpected token \`${this.peekc() || 'newline'}'`);
    return { fd, op: op as Redir['op'], target };
  }

  private wordText(w: Word): string {
    return w.map((s) => (s.t === 'text' ? s.v : '')).join('');
  }

  /** (a b "c d" [k]=v ...) */
  private readArrayLiteral(): { key?: Word; value: Word }[] {
    this.pos++; // (
    const out: { key?: Word; value: Word }[] = [];
    for (;;) {
      for (;;) {
        this.skipBlank();
        if (this.peekc() === '\n') this.pos++;
        else break;
      }
      if (this.eof()) throw new Incomplete(')');
      if (this.peekc() === ')') {
        this.pos++;
        return out;
      }
      const km = /^\[([^\]]*)\]=/.exec(this.src.slice(this.pos));
      if (km) {
        this.pos += km[0].length;
        out.push({ key: new Parser(km[1]).readWordAllowSpaces(), value: this.readWord() });
        continue;
      }
      const before = this.pos;
      const w = this.readWord();
      if (!w.length || this.pos === before) throw new BashSyntaxError(`syntax error near unexpected token \`${this.peekc()}'`);
      out.push({ value: w });
    }
  }

  private parseSimple(): Node {
    const start = this.pos;
    const assigns: Assign[] = [];
    const words: Word[] = [];
    const redirs: Redir[] = [];
    let sawCommand = false;
    for (;;) {
      this.skipBlank();
      if (this.eof()) break;
      const c = this.peekc();
      if (c === '\n' || c === ';') break;
      if (c === '|' || (c === '&' && this.peekc(1) === '&')) break;
      if (c === '&') break;
      if (c === ')' && !sawCommand && !words.length) throw new BashSyntaxError("syntax error near unexpected token `)'");
      if (c === ')') break;
      if (c === '(') throw new BashSyntaxError("syntax error near unexpected token `('");
      const r = this.src.startsWith('<(', this.pos) ? null : this.tryRedir();
      if (r) {
        redirs.push(r);
        continue;
      }
      if (!sawCommand || (words.length > 0 && /^(declare|local|typeset|readonly|export)$/.test(this.wordText(words[0])))) {
        const am = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([^\]]*)\])?(\+?)=/.exec(this.src.slice(this.pos));
        // dopo il comando (declare/local/...) solo name=( ... ) è un'assegnazione; name=valore resta un argomento
        if (am && sawCommand && this.src[this.pos + am[0].length] !== '(') {
          // argomento normale
        } else if (am) {
          const post = sawCommand;
          this.pos += am[0].length;
          const index = am[2] !== undefined ? new Parser(am[2]).readWordAllowSpaces() : undefined;
          if (this.peekc() === '(' && index === undefined) {
            assigns.push({ name: am[1], value: [], append: am[3] === '+', array: this.readArrayLiteral(), post });
          } else {
            const value = this.readWord();
            assigns.push({ name: am[1], value, append: am[3] === '+', ...(index ? { index } : {}), ...(post ? { post } : {}) });
          }
          continue;
        }
      }
      if ((c === '<' || c === '>') && !this.src.startsWith('<(', this.pos)) throw new BashSyntaxError("syntax error near unexpected token `newline'");
      const word = this.readWord(sawCommand ? false : false);
      if (!word.length) {
        throw new BashSyntaxError(`syntax error near unexpected token \`${this.peekc()}'`);
      }
      // [[ ... ]]: legge fino a ]] trattando operatori come parole
      if (!sawCommand && word.length === 1 && word[0].t === 'text' && word[0].v === '[[' && !word[0].q) {
        sawCommand = true;
        words.push(word);
        for (;;) {
          this.skipBlank();
          if (this.eof()) throw new Incomplete(']]');
          const ch = this.peekc();
          let w: Word;
          if (this.src.startsWith('&&', this.pos) || this.src.startsWith('||', this.pos)) {
            w = [{ t: 'text', v: this.src.slice(this.pos, this.pos + 2), q: false }];
            this.pos += 2;
          } else if (ch === '(' || ch === ')') {
            w = [{ t: 'text', v: ch, q: false }];
            this.pos++;
          } else if (ch === '\n') throw new Incomplete(']]');
          else if (ch === '<' || ch === '>') {
            w = [{ t: 'text', v: ch, q: false }];
            this.pos++;
          } else {
            const before = this.pos;
            w = this.readWord();
            // nessun avanzamento (es. `;`, `|`, `&` da soli): errore di sintassi invece di un ciclo infinito
            if (!w.length || this.pos === before) throw new BashSyntaxError(`syntax error in conditional expression near unexpected token \`${ch}'`);
          }
          words.push(w);
          if (w.length === 1 && w[0].t === 'text' && w[0].v === ']]' && !w[0].q) break;
        }
        continue;
      }
      sawCommand = true;
      words.push(word);
    }
    return { type: 'simple', assigns, words, redirs, src: this.src.slice(start, this.pos).trim() };
  }

  private budget = 0;

  /** Legge una parola con quoting ed espansioni. */
  readWord(_cmdStart = false): Word {
    if (++this.budget > 400_000) throw new BashSyntaxError('syntax error: riga troppo complessa');
    const segs: Word = [];
    let buf = '';
    const flush = (): void => {
      if (buf) {
        segs.push({ t: 'text', v: buf, q: false });
        buf = '';
      }
    };
    let first = true;
    while (!this.eof()) {
      const c = this.peekc();
      if (c === '<' && this.peekc(1) === '(') {
        flush();
        const end = this.findMatching(this.pos + 2, '(', ')', false);
        segs.push({ t: 'proc', src: this.src.slice(this.pos + 2, end), q: false });
        this.pos = end + 1;
        first = false;
        continue;
      }
      if (/[\s|&;<>()]/.test(c)) {
        break;
      }
      if (c === '~' && first) {
        flush();
        segs.push({ t: 'tilde' });
        this.pos++;
        first = false;
        continue;
      }
      first = false;
      if (c === '\\') {
        const n = this.peekc(1);
        if (n === '\n') {
          this.pos += 2;
          continue;
        }
        if (this.pos + 1 >= this.src.length) throw new Incomplete('\\');
        flush();
        segs.push({ t: 'text', v: n, q: true });
        this.pos += 2;
        continue;
      }
      if (c === "'") {
        flush();
        const end = this.src.indexOf("'", this.pos + 1);
        if (end < 0) throw new Incomplete("'");
        segs.push({ t: 'text', v: this.src.slice(this.pos + 1, end), q: true });
        this.pos = end + 1;
        continue;
      }
      if (c === '"') {
        flush();
        this.pos++;
        this.readDouble(segs);
        continue;
      }
      if (c === '$') {
        flush();
        const s = this.readDollar(false);
        if (s) segs.push(s);
        else {
          buf += '$';
          this.pos++;
        }
        continue;
      }
      if (c === '`') {
        flush();
        const end = this.findBacktick(this.pos + 1);
        segs.push({ t: 'cmd', src: this.src.slice(this.pos + 1, end), q: false });
        this.pos = end + 1;
        continue;
      }
      buf += c;
      this.pos++;
    }
    flush();
    return segs;
  }

  private findBacktick(from: number): number {
    for (let i = from; i < this.src.length; i++) {
      if (this.src[i] === '\\') i++;
      else if (this.src[i] === '`') return i;
    }
    throw new Incomplete('`');
  }

  private readDouble(segs: Word): void {
    let buf = '';
    const flush = (): void => {
      if (buf) {
        segs.push({ t: 'text', v: buf, q: true });
        buf = '';
      }
    };
    for (;;) {
      if (this.eof()) throw new Incomplete('"');
      const c = this.peekc();
      if (c === '"') {
        this.pos++;
        break;
      }
      if (c === '\\') {
        const n = this.peekc(1);
        if (n === '$' || n === '"' || n === '\\' || n === '`') {
          buf += n;
          this.pos += 2;
        } else if (n === '\n') this.pos += 2;
        else {
          buf += '\\';
          this.pos++;
        }
        continue;
      }
      if (c === '$') {
        const s = this.readDollar(true);
        if (s) {
          flush();
          segs.push(s);
        } else {
          buf += '$';
          this.pos++;
        }
        continue;
      }
      if (c === '`') {
        flush();
        const end = this.findBacktick(this.pos + 1);
        segs.push({ t: 'cmd', src: this.src.slice(this.pos + 1, end), q: true });
        this.pos = end + 1;
        continue;
      }
      buf += c;
      this.pos++;
    }
    flush();
    if (!segs.length || segs[segs.length - 1].t !== 'text') {
      // stringa vuota "" deve produrre un campo vuoto
    }
    const last = segs[segs.length - 1];
    if (!last) segs.push({ t: 'text', v: '', q: true });
  }

  /** gestisce `$` ; ritorna null se il dollaro è letterale */
  private readDollar(q: boolean): Seg | null {
    const n = this.peekc(1);
    if (n === '(') {
      if (this.peekc(2) === '(') {
        const end = this.findMatching(this.pos + 3, '(', ')', true);
        const expr = this.src.slice(this.pos + 3, end);
        this.pos = end + 2;
        return { t: 'arith', expr, q };
      }
      const end = this.findMatching(this.pos + 2, '(', ')', false);
      const src = this.src.slice(this.pos + 2, end);
      this.pos = end + 1;
      return { t: 'cmd', src, q };
    }
    if (n === '{') {
      const end = this.findMatching(this.pos + 2, '{', '}', false);
      const inner = this.src.slice(this.pos + 2, end);
      this.pos = end + 1;
      return this.parseBraced(inner, q);
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(this.src.slice(this.pos + 1, this.pos + 40));
    if (!m) return null;
    this.pos += 1 + m[0].length;
    return { t: 'var', name: m[1], q };
  }

  /** `${...}`: sostituzioni di parametro, sottostringhe, taglio di prefissi/suffissi, sostituzione, maiuscole, array. */
  private parseBraced(inner: string, q: boolean): Seg {
    const bad = (): never => {
      throw new BashSyntaxError(`\${${inner}}: bad substitution`);
    };
    const m = /^([#!]?)([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-]+)(?:\[([^\]]*)\])?(.*)$/s.exec(inner);
    if (!m) return bad();
    const [, prefix, name, subscript, rem] = m;
    const word = (src: string): Word => new Parser(src).readWordAllowSpaces();
    const index = subscript !== undefined ? word(subscript) : undefined;
    const base = { t: 'var' as const, name, q, ...(index ? { index } : {}) };
    if (prefix === '#') return rem === '' ? { ...base, op: '#len' } : bad();
    if (prefix === '!') return rem === '' && subscript !== undefined && (subscript === '@' || subscript === '*') ? { ...base, op: '!' } : bad();
    if (rem === '') return base;
    let r = /^(:?[-=+?])(.*)$/s.exec(rem);
    if (r) return { ...base, op: r[1], arg: word(r[2]) };
    r = /^:(.*)$/s.exec(rem);
    if (r) {
      // ${v:off} oppure ${v:off:len}; un offset negativo richiede lo spazio (${v: -3})
      let depth = 0;
      let cut = -1;
      for (let i = 0; i < r[1].length; i++) {
        const ch = r[1][i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ':' && depth === 0) {
          cut = i;
          break;
        }
      }
      const off = cut < 0 ? r[1] : r[1].slice(0, cut);
      return { ...base, op: ':', arg: word(off), ...(cut >= 0 ? { arg2: word(r[1].slice(cut + 1)) } : {}) };
    }
    r = /^(%%|%|##|#)(.*)$/s.exec(rem);
    if (r) return { ...base, op: r[1], arg: word(r[2]) };
    r = /^(\/\/|\/#|\/%|\/)(.*)$/s.exec(rem);
    if (r) {
      let cut = -1;
      for (let i = 0; i < r[2].length; i++) {
        if (r[2][i] === '\\') i++;
        else if (r[2][i] === '/') {
          cut = i;
          break;
        }
      }
      const pat = cut < 0 ? r[2] : r[2].slice(0, cut);
      const rep = cut < 0 ? '' : r[2].slice(cut + 1);
      return { ...base, op: r[1], arg: word(pat), arg2: word(rep) };
    }
    r = /^(\^\^|\^|,,|,)(.*)$/s.exec(rem);
    if (r) return { ...base, op: r[1] };
    return bad();
  }

  readWordAllowSpaces(): Word {
    const segs: Word = [];
    let buf = '';
    while (!this.eof()) {
      const c = this.peekc();
      if (c === '$') {
        if (buf) segs.push({ t: 'text', v: buf, q: true });
        buf = '';
        const s = this.readDollar(true);
        if (s) segs.push(s);
        else {
          buf += '$';
          this.pos++;
        }
        continue;
      }
      buf += c;
      this.pos++;
    }
    if (buf) segs.push({ t: 'text', v: buf, q: true });
    return segs;
  }

  private findMatching(from: number, open: string, close: string, arith: boolean): number {
    let depth = 1;
    for (let i = from; i < this.src.length; i++) {
      const c = this.src[i];
      if (c === '\\') i++;
      else if (c === "'") {
        const e = this.src.indexOf("'", i + 1);
        if (e < 0) throw new Incomplete("'");
        i = e;
      } else if (c === '"') {
        let j = i + 1;
        while (j < this.src.length && this.src[j] !== '"') {
          if (this.src[j] === '\\') j++;
          j++;
        }
        if (j >= this.src.length) throw new Incomplete('"');
        i = j;
      } else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return i;
      }
    }
    throw new Incomplete(close);
  }
}

export function parseBash(src: string): Node {
  return new Parser(src).parseProgram();
}
