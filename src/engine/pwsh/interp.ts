/** Interprete PowerShell (Windows PowerShell 5.1, sottoinsieme). */
import { LIMITS, type ShellState, type WorkspaceState } from '../types.ts';
import { FsError, HOME, Vfs, resolvePath } from '../vfs.ts';
import type { Io } from '../bash/interp.ts';
import { psAliases } from '../catalog.ts';
import { lineCol, PsIncomplete, PsParser, PsSyntaxError, type Arg, type Block, type CmdNode, type Expr, type ExprElem, type Param, type Stmt } from './parser.ts';
import {
  PSError, PSFormatted, PSObject, PSScriptBlock, custom, enumValue, formatItems, fromJsonValue, fmtNumber, hash, isEnum, psCompare, psEqual, psToString,
  toArray, truthy, typeNameOf, fmtDateTime,
} from './values.ts';
import { CMDLETS, parseParamSpec, type CmdCtx } from './cmdlets.ts';
import { callMethod, castValue, getMember, staticMember } from './members.ts';

function excClass(fqid: string): string {
  const f = fqid.split(',')[0];
  const map: Record<string, string> = {
    PathNotFound: 'ItemNotFoundException', NamedParameterNotFound: 'ParameterBindingException', MissingArgument: 'ParameterBindingException',
    WebCmdletWebResponseException: 'WebException', NewItemIOError: 'IOException', DirectoryExist: 'IOException', ParameterArgumentValidationError: 'ParameterBindingValidationException',
    AmbiguousParameter: 'ParameterBindingException', FileOpenFailure: 'RuntimeException',
  };
  return map[f] ?? (f.endsWith('Exception') ? f : 'RuntimeException');
}

/** Aggiunge in testa ai risultati parziali di un'eccezione di controllo le uscite già prodotte. */
function withPartial<T>(e: T, out: unknown[]): T {
  if (out.length && e && typeof e === 'object') {
    const x = e as { partial?: unknown[] };
    x.partial = [...out, ...(x.partial ?? [])];
  }
  return e;
}
function partialOf(e: unknown): unknown[] {
  return ((e as { partial?: unknown[] } | null)?.partial) ?? [];
}

export class ReturnEx {
  constructor(public value: unknown[]) {}
}
export class BreakEx {}
export class ContinueEx {}
export class ExitEx {
  constructor(public code: number) {}
}
export class ThrowEx extends Error {
  constructor(public err: PSError) {
    super(err.message);
  }
}

interface FuncDef {
  name: string;
  params: Param[];
  body: Block;
  full: string;
}

type Scope = Map<string, unknown>;

export class PsRuntime {
  vfs: Vfs;
  ss: ShellState;
  global: Scope = new Map();
  scopes: Scope[] = [];
  funcs = new Map<string, FuncDef>();
  itemStack: unknown[] = [];
  argsStack: unknown[][] = [];
  io!: Io;
  src = '';
  steps = 0;
  tryDepth = 0;
  errors: unknown[] = [];
  lastOk = true;
  /** esito dell'istruzione precedente, letto da `$?` */
  prevOk = true;
  lastNative: number | null = null;
  errorPref = 'Continue';
  depth = 0;
  cmdPos: { start: number; end: number } = { start: 0, end: 0 };

  constructor(public state: WorkspaceState) {
    this.vfs = new Vfs(state.fs, () => state.clock);
    this.ss = state.shells.pwsh;
    this.scopes = [this.global];
    this.load();
  }

  // ---------- persistenza delle variabili ----------
  private enc(v: unknown): unknown {
    if (v instanceof PSObject) return { $ps: v.typeName, p: Object.fromEntries(Object.entries(v.props).map(([k, x]) => [k, this.enc(x)])) };
    if (v instanceof PSScriptBlock) return { $sb: v.src };
    if (Array.isArray(v)) return v.map((x) => this.enc(x));
    return v;
  }
  private dec(v: unknown): unknown {
    if (Array.isArray(v)) return v.map((x) => this.dec(x));
    if (v && typeof v === 'object') {
      const o = v as { $ps?: string; p?: Record<string, unknown>; $sb?: string };
      if (o.$ps) return new PSObject(o.$ps, Object.fromEntries(Object.entries(o.p ?? {}).map(([k, x]) => [k, this.dec(x)])));
      if (o.$sb !== undefined) {
        try {
          return new PSScriptBlock(new PsParser(o.$sb).parseProgram(), o.$sb);
        } catch {
          return null;
        }
      }
    }
    return v;
  }
  private load(): void {
    for (const [k, v] of Object.entries(this.ss.vars)) this.global.set(k.toLowerCase(), this.dec(v));
    for (const [name, f] of Object.entries(this.ss.functions)) {
      try {
        const prog = new PsParser(f.body).parseProgram();
        const st = prog.stmts[0];
        if (st?.k === 'func') this.funcs.set(name.toLowerCase(), { name: st.name, params: st.params, body: st.body, full: st.full });
      } catch {
        /* funzione corrotta: ignorata */
      }
    }
    this.lastOk = this.ss.lastOk;
    this.prevOk = this.lastOk;
  }
  save(): void {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.global) out[k] = this.enc(v);
    this.ss.vars = out;
    this.ss.functions = Object.fromEntries([...this.funcs].map(([k, f]) => [k, { body: f.full }]));
    this.ss.lastOk = this.lastOk;
  }

  // ---------- utilità ----------
  tick(): void {
    if (++this.steps > LIMITS.maxSteps) throw new PSError('Limite di esecuzione superato (troppi passi: possibile ciclo infinito)', 'LimitsExceeded', 'LabLimit');
  }
  get cwd(): string {
    return this.ss.cwd;
  }
  rp(p: string): string {
    return resolvePath(p.replace(/\\/g, '/'), this.ss.cwd);
  }
  env(name: string): string | undefined {
    const key = Object.keys(this.ss.env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : this.ss.env[key];
  }
  setEnv(name: string, v: string | null): void {
    const key = Object.keys(this.ss.env).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
    if (v === null) delete this.ss.env[key];
    else this.ss.env[key] = v;
  }

  getVar(nameRaw: string): unknown {
    const name = nameRaw.toLowerCase();
    if (name.startsWith('env:')) return this.env(nameRaw.slice(4)) ?? null;
    const scoped = /^script:/.test(name) ? this.scriptScope() : /^global:/.test(name) ? this.global : null;
    const n = name.replace(/^(global|script|local|private|using):/, '');
    if (scoped && scoped.has(n)) return scoped.get(n);
    switch (n) {
      case '_':
      case 'psitem':
        return this.itemStack.length ? this.itemStack[this.itemStack.length - 1] : null;
      case '?':
        return this.prevOk;
      case 'true':
        return true;
      case 'false':
        return false;
      case 'null':
        return null;
      case 'args':
        return this.argsStack.length ? this.argsStack[this.argsStack.length - 1] : [];
      case 'pwd':
        return custom({ Path: this.cwd });
      case 'home':
        return HOME;
      case 'pid':
        return 4242;
      case 'pshome':
        return '/usr/lib/powershell';
      case 'lastexitcode':
        return this.lastNative;
      case 'erroractionpreference':
        return this.errorPref;
      case 'error':
        return this.errors;
      case 'psversiontable':
        return custom({ PSVersion: new PSObject('Version', { Major: 5, Minor: 1, Build: 19041, Revision: 1 }), PSEdition: 'Desktop', Platform: 'Win32NT (emulato)' });
      case 'host':
        return custom({ Name: 'ConsoleHost', Version: '5.1.19041.1' });
      case 'pscommandpath':
      case 'psscriptroot':
        return this.scriptDir;
    }
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(n)) return this.scopes[i].get(n);
    }
    return null;
  }
  scriptDir: string | null = null;
  /** indici in `scopes` degli scope di script attivi (per `$script:`) */
  scriptScopes: number[] = [];

  private scriptScope(): Scope {
    const i = this.scriptScopes[this.scriptScopes.length - 1];
    return i === undefined ? this.global : (this.scopes[i] ?? this.global);
  }

  setVar(nameRaw: string, v: unknown): void {
    const name = nameRaw.toLowerCase();
    if (name.startsWith('env:')) {
      this.setEnv(nameRaw.slice(4), v === null ? null : psToString(v));
      return;
    }
    let n = name.replace(/^(local|private):/, '');
    if (n === 'erroractionpreference') this.errorPref = psToString(v);
    if (/^(global|script):/.test(n)) {
      const target = n.startsWith('script:') ? this.scriptScope() : this.global;
      n = n.replace(/^(global|script):/, '');
      target.set(n, v);
      return;
    }
    if (n === '_' || n === 'psitem') return;
    this.scopes[this.scopes.length - 1].set(n, v);
  }

  // ---------- esecuzione di sorgente ----------
  runTop(src: string, io: Io): { code: number; incomplete: boolean; clear: boolean } {
    this.io = io;
    this.src = src;
    let prog: Block;
    try {
      prog = new PsParser(src).parseProgram();
    } catch (e) {
      if (e instanceof PsIncomplete) return { code: 0, incomplete: true, clear: false };
      if (e instanceof PsSyntaxError) {
        this.printParseError(e);
        this.lastOk = false;
        this.save();
        return { code: 1, incomplete: false, clear: false };
      }
      throw e;
    }
    let exitCode: number | null = null;
    let clear = false;
    this.lastOk = true;
    for (const st of prog.stmts) {
      try {
        const out = this.execListStmt(st);
        if (out.length) this.emit(out);
      } catch (e) {
        const part = partialOf(e);
        if (part.length) this.emit(part);
        if (e instanceof ExitEx) {
          exitCode = e.code;
          break;
        }
        if (e instanceof ReturnEx) {
          if (e.value.length) this.emit(e.value);
          break;
        }
        if (e instanceof BreakEx || e instanceof ContinueEx) break;
        if (e instanceof ThrowEx) {
          this.reportError(e.err, st);
          this.lastOk = false;
          break;
        }
        if (e instanceof PSError) {
          this.reportError(e, st);
          this.lastOk = false;
          continue;
        }
        throw e;
      }
      if (this.clearFlag) {
        clear = true;
        this.clearFlag = false;
      }
    }
    this.save();
    const code = exitCode ?? (this.lastOk ? 0 : this.lastNative && this.lastNative !== 0 ? this.lastNative : 1);
    return { code, incomplete: false, clear };
  }
  clearFlag = false;

  emit(items: unknown[]): void {
    if (items.length === 1 && (items[0] === null || items[0] === undefined)) return;
    const text = formatItems(items);
    if (text) this.io.out(text.endsWith('\n') ? text : text + '\n');
  }

  private printParseError(e: PsSyntaxError): void {
    const { line, col, lineText } = lineCol(this.src, e.pos);
    const tok = e.token || this.src.slice(e.pos, e.pos + 1);
    this.io.err(
      `${e.message}\nAt line:${line} char:${col}\n+ ${lineText}\n+ ${' '.repeat(Math.max(0, col - 1))}${'~'.repeat(Math.max(1, tok.length))}\n    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException\n    + FullyQualifiedErrorId : ${e.message.includes('not a valid statement separator') ? 'InvalidEndOfLine' : 'UnexpectedToken'}\n`,
    );
  }

  /** Stampa un errore in stile PowerShell. */
  reportError(err: PSError, st?: Stmt | { start: number; end: number }): void {
    const pos = this.cmdPos.end > this.cmdPos.start ? this.cmdPos : st && 'start' in st ? { start: st.start, end: st.end } : { start: 0, end: this.src.length };
    const { line, col, lineText } = lineCol(this.src, pos.start);
    const text = this.src.slice(pos.start, Math.max(pos.start + 1, pos.end)).split('\n')[0];
    const head = err.cmdName ? `${err.cmdName} : ${err.message}` : err.message;
    this.io.err(
      `${head}\nAt line:${line} char:${col}\n+ ${lineText}\n+ ${' '.repeat(Math.max(0, col - 1))}${'~'.repeat(Math.max(1, text.trimEnd().length))}\n    + CategoryInfo          : ${err.category}: (${err.target || ':'}) [${err.fqid === 'CommandNotFoundException' ? '' : err.cmdName}], ${excClass(err.fqid)}\n    + FullyQualifiedErrorId : ${err.fqid}\n`,
    );
    this.errors.unshift(this.errorRecord(err));
    this.cmdPos = { start: 0, end: 0 };
  }

  errorRecord(err: PSError): PSObject {
    const resp = err.data.status
      ? custom({
          StatusCode: enumValue(String(err.data.statusName), err.data.status as number),
          StatusDescription: String(err.data.statusText ?? ''),
          Headers: hash((err.data.headers as Record<string, unknown>) ?? {}),
        })
      : null;
    return new PSObject('ErrorRecord', {
      Exception: custom({ Message: err.message, Response: resp, GetType: null }),
      ErrorDetails: err.data.body !== undefined ? custom({ Message: String(err.data.body) }) : null,
      FullyQualifiedErrorId: err.fqid,
      CategoryInfo: custom({ Category: err.category, Reason: err.fqid.split(',')[0] }),
      TargetObject: err.target,
    });
  }

  /** errore non terminante: stampa e prosegue, oppure diventa terminante con ErrorAction Stop */
  nonTerminating(err: PSError, mode?: string): void {
    const m = (mode ?? this.errorPref).toLowerCase();
    err.terminating = false;
    this.lastOk = false;
    if (m === 'stop') throw err;
    if (m === 'silentlycontinue' || m === 'ignore') {
      this.errors.unshift(this.errorRecord(err));
      return;
    }
    this.reportError(err, this.cmdPos);
  }

  // ---------- istruzioni ----------
  execBlock(b: Block, scoped = false): unknown[] {
    if (scoped) this.scopes.push(new Map());
    const out: unknown[] = [];
    try {
      for (const s of b.stmts) out.push(...this.execListStmt(s));
      return out;
    } catch (e) {
      throw withPartial(e, out);
    } finally {
      if (scoped) this.scopes.pop();
    }
  }

  /** `$i++` e `++$i` come istruzione a sé non producono output (solo `($i++)` o l'uso in un'espressione lo fanno). */
  private execListStmt(s: Stmt): unknown[] {
    const out = this.execStmt(s);
    if (s.k === 'pipeline' && s.elems.length === 1 && s.elems[0].k === 'expr' && s.elems[0].e && ['postfix', 'prefix'].includes(s.elems[0].e.k)) return [];
    return out;
  }

  private execStmt(s: Stmt): unknown[] {
    this.tick();
    switch (s.k) {
      case 'pipeline':
        return this.execPipeline(s);
      case 'assign':
        this.execAssign(s);
        return [];
      case 'if': {
        for (const br of s.branches) {
          if (truthy(this.stmtValue(br.cond))) return this.execBlock(br.body);
        }
        return s.else ? this.execBlock(s.else) : [];
      }
      case 'foreach': {
        const list = toArray(this.stmtValue(s.list));
        const out: unknown[] = [];
        for (const it of list) {
          this.tick();
          this.setVar(s.name, it);
          try {
            out.push(...this.execBlock(s.body));
          } catch (e) {
            out.push(...partialOf(e));
            (e as { partial?: unknown[] }).partial = undefined;
            if (e instanceof BreakEx) break;
            if (e instanceof ContinueEx) continue;
            throw withPartial(e, out);
          }
        }
        return out;
      }
      case 'for': {
        const out: unknown[] = [];
        if (s.init) this.execStmt(s.init);
        for (;;) {
          this.tick();
          if (s.cond && !truthy(this.stmtValue(s.cond))) break;
          try {
            out.push(...this.execBlock(s.body));
          } catch (e) {
            out.push(...partialOf(e));
            (e as { partial?: unknown[] }).partial = undefined;
            if (e instanceof BreakEx) break;
            if (!(e instanceof ContinueEx)) throw withPartial(e, out);
          }
          if (s.iter) this.execStmt(s.iter);
        }
        return out;
      }
      case 'while': {
        const out: unknown[] = [];
        let first = true;
        for (;;) {
          this.tick();
          if (!(s.post && first)) {
            const c = truthy(this.stmtValue(s.cond));
            if (s.until ? c : !c) break;
          }
          first = false;
          try {
            out.push(...this.execBlock(s.body));
          } catch (e) {
            out.push(...partialOf(e));
            (e as { partial?: unknown[] }).partial = undefined;
            if (e instanceof BreakEx) break;
            if (!(e instanceof ContinueEx)) throw withPartial(e, out);
          }
          if (s.post) {
            const c = truthy(this.stmtValue(s.cond));
            if (s.until ? c : !c) break;
          }
        }
        return out;
      }
      case 'func':
        this.funcs.set(s.name.toLowerCase(), { name: s.name, params: s.params, body: s.body, full: s.full });
        return [];
      case 'return':
        throw new ReturnEx(s.value ? this.stmtOutputs(s.value) : []);
      case 'break':
        throw new BreakEx();
      case 'continue':
        throw new ContinueEx();
      case 'throw': {
        const v = s.value ? this.stmtValue(s.value) : 'ScriptHalted';
        const msg = v instanceof PSObject && v.typeName === 'ErrorRecord' ? psToString(v) : psToString(v);
        this.cmdPos = { start: s.start, end: s.end };
        const e = new PSError(msg, 'OperationStopped', msg, `${msg}:String`, '', { thrown: v });
        throw new ThrowEx(e);
      }
      case 'exit': {
        const v = s.value ? this.stmtValue(s.value) : 0;
        throw new ExitEx(typeof v === 'number' ? v : parseInt(psToString(v), 10) || 0);
      }
      case 'try':
        return this.execTry(s);
      case 'param':
        return [];
      case 'named':
        return this.execBlock(s.body);
      case 'switch':
        return this.execSwitch(s);
    }
  }

  private execSwitch(s: Extract<Stmt, { k: 'switch' }>): unknown[] {
    const out: unknown[] = [];
    for (const it of toArray(this.stmtValue(s.subject))) {
      this.tick();
      this.itemStack.push(it);
      try {
        let matched = false;
        for (const c of s.clauses) {
          if (c.cond === null) continue;
          const cv = this.evalExpr(c.cond);
          let hit: boolean;
          if (cv instanceof PSScriptBlock) {
            const r = this.execBlock(cv.block);
            hit = truthy(r.length === 0 ? null : r.length === 1 ? r[0] : r);
          } else if (s.mode === 'regex') hit = this.compare('match', it, cv, s.cs);
          else if (s.mode === 'wildcard') hit = this.compare('like', it, cv, s.cs);
          else hit = psEqual(it, cv, s.cs);
          if (!hit) continue;
          matched = true;
          try {
            out.push(...this.execBlock(c.body));
          } catch (e) {
            out.push(...partialOf(e));
            (e as { partial?: unknown[] }).partial = undefined;
            if (e instanceof BreakEx) return out;
            if (e instanceof ContinueEx) break;
            throw withPartial(e, out);
          }
        }
        if (!matched) {
          const d = s.clauses.find((c) => c.cond === null);
          if (d) {
            try {
              out.push(...this.execBlock(d.body));
            } catch (e) {
              out.push(...partialOf(e));
              (e as { partial?: unknown[] }).partial = undefined;
              if (e instanceof BreakEx) return out;
              if (!(e instanceof ContinueEx)) throw withPartial(e, out);
            }
          }
        }
      } finally {
        this.itemStack.pop();
      }
    }
    return out;
  }

  private execTry(s: Extract<Stmt, { k: 'try' }>): unknown[] {
    const out: unknown[] = [];
    this.tryDepth++;
    try {
      try {
        out.push(...this.execBlock(s.body));
      } catch (e) {
        const err = e instanceof ThrowEx ? e.err : e instanceof PSError ? e : null;
        if (!err) throw withPartial(e, out);
        out.push(...partialOf(e));
        (e as { partial?: unknown[] }).partial = undefined;
        this.tryDepth--;
        let handled = false;
        try {
          for (const c of s.catches) {
            if (!c.types.length || c.types.some((t) => /exception$/i.test(t) || /^System\.Exception$/i.test(t) || /WebException/i.test(t) || /RuntimeException/i.test(t))) {
              handled = true;
              this.itemStack.push(this.errorRecord(err));
              this.lastOk = true;
              try {
                out.push(...this.execBlock(c.body));
              } finally {
                this.itemStack.pop();
              }
              break;
            }
          }
        } finally {
          this.tryDepth++;
        }
        if (!handled) throw withPartial(e, out);
      }
    } finally {
      this.tryDepth--;
      if (s.fin) out.push(...this.execBlock(s.fin));
    }
    return out;
  }

  /** Esegue un'istruzione e ne ritorna i risultati come valore singolo (null, valore o array). */
  stmtValue(s: Stmt): unknown {
    const out = this.stmtOutputs(s);
    return out.length === 0 ? null : out.length === 1 ? out[0] : out;
  }
  stmtOutputs(s: Stmt): unknown[] {
    return this.execStmt(s);
  }

  private execAssign(s: Extract<Stmt, { k: 'assign' }>): void {
    let value = this.stmtValue(s.value);
    const t = s.target;
    const apply = (cur: unknown): unknown => {
      if (s.op === '=') return value;
      if (s.op === '+=') {
        if (Array.isArray(cur)) return [...cur, ...(Array.isArray(value) ? value : [value])];
        if (cur === null || cur === undefined) return value;
        if (typeof cur === 'string') return cur + psToString(value);
        if (typeof cur === 'number') return cur + Number(typeof value === 'number' ? value : psToString(value));
        if (cur instanceof PSObject && cur.isHash && value instanceof PSObject) {
          for (const k of value.keys()) cur.props[k] = value.props[k];
          return cur;
        }
        return this.binary('+', cur, value);
      }
      const op = s.op[0];
      return this.binary(op, cur, value);
    };
    if (t.k === 'cast') {
      value = castValue(this, t.type, value);
      this.assignTo(t.e, apply(this.evalExpr(t.e)));
      return;
    }
    this.assignTo(t, apply(s.op === '=' ? null : this.evalExpr(t)));
  }

  assignTo(t: Expr, v: unknown): void {
    if (t.k === 'multi') {
      const items = Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
      t.list.forEach((x, i) => this.assignTo(x, i === t.list.length - 1 && items.length > t.list.length ? items.slice(i) : (items[i] ?? null)));
      return;
    }
    if (t.k === 'var') {
      this.setVar(t.name, v);
    } else if (t.k === 'member') {
      const obj = this.evalExpr(t.obj);
      const name = typeof t.name === 'string' ? t.name : psToString(this.evalExpr(t.name));
      if (obj instanceof PSObject) obj.set(name, v);
      else throw new PSError(`The property '${name}' cannot be found on this object. Verify that the property exists and can be set.`, 'InvalidOperation', 'PropertyAssignmentException', name);
    } else if (t.k === 'index') {
      const obj = this.evalExpr(t.obj);
      const idx = this.evalExpr(t.idx);
      if (Array.isArray(obj)) {
        const i = typeof idx === 'number' ? idx : parseInt(psToString(idx), 10);
        if (i < 0 || i >= obj.length) throw new PSError('Index was outside the bounds of the array.', 'OperationStopped', 'RuntimeException');
        obj[i] = v;
      } else if (obj instanceof PSObject) obj.set(psToString(idx), v);
      else throw new PSError('Unable to index into an object of this type.', 'InvalidOperation', 'RuntimeException');
    }
  }

  // ---------- pipeline ----------
  private execPipeline(s: Extract<Stmt, { k: 'pipeline' }>): unknown[] {
    let items: unknown[] = [];
    const prevOk = this.lastOk;
    this.prevOk = prevOk;
    this.lastOk = true;
    let streamErr: string[] | null = null;
    // errori reindirizzati nel flusso di output (2>&1, *>): si uniscono al risultato a fine pipeline
    const merged: unknown[] = [];
    const redirErr = s.redirs.find((r) => r.fd === 2 || r.fd === 0);
    const errCapture = (): void => undefined;
    void errCapture;
    const savedErr = this.io.err;
    if (redirErr) {
      if (redirErr.target === '&1') {
        this.io.err = (t) => {
          merged.push(t.replace(/\n$/, ''));
        };
      } else {
        const tv = this.evalExpr(redirErr.target);
        if (tv === null || psToString(tv).toLowerCase() === '$null' || (redirErr.target.k === 'var' && redirErr.target.name.toLowerCase() === 'null')) this.io.err = () => undefined;
        else if (redirErr.fd === 0) {
          // *> file: tutti i flussi nello stesso file (errori e output nell'ordine in cui arrivano)
          this.io.err = (t) => {
            merged.push(t.replace(/\n$/, ''));
          };
        } else {
          streamErr = [];
          this.io.err = (t) => streamErr!.push(t);
        }
      }
    }
    try {
      s.elems.forEach((el, i) => {
        items = this.execElement(el, items, i === 0);
      });
    } finally {
      this.io.err = savedErr;
    }
    if (merged.length) items = [...merged, ...items];
    if (streamErr && redirErr && redirErr.target !== '&1') {
      const path = this.rp(psToString(this.evalExpr(redirErr.target)));
      this.writeFile(path, streamErr.join(''), redirErr.append);
    }
    for (const r of s.redirs.filter((x) => x.fd === 1 || (x.fd === 0 && x.target !== '&1'))) {
      if (r.target === '&1') continue;
      const tv = this.evalExpr(r.target);
      const isNull = r.target.k === 'var' && r.target.name.toLowerCase() === 'null';
      if (!isNull && tv !== null) {
        const path = this.rp(psToString(tv));
        this.writeFile(path, formatItems(items), r.append);
      }
      items = [];
    }
    if (prevOk === false && this.lastOk === true) {
      /* lo stato è quello dell'ultima pipeline */
    }
    return items;
  }

  writeFile(path: string, text: string, append: boolean): void {
    try {
      if (this.vfs.isDir(path)) throw new FsError('EISDIR', path);
      this.vfs.writeFile(path, text, append);
    } catch (e) {
      if (e instanceof FsError) {
        const msg = e.code === 'ENOENT' ? `Could not find a part of the path '${path}'.` : e.code === 'EACCES' ? `Access to the path '${path}' is denied.` : e.code === 'EISDIR' ? `Access to the path '${path}' is denied.` : e.message;
        this.nonTerminating(new PSError(msg, 'OpenError', 'FileOpenFailure,Microsoft.PowerShell.Commands.OutFileCommand', path, 'Out-File'));
      } else throw e;
    }
  }

  private execElement(el: CmdNode | ExprElem, input: unknown[], first: boolean): unknown[] {
    if (el.k === 'expr') {
      this.cmdPos = { start: el.start, end: el.end };
      const v = this.evalExpr(el.e);
      this.cmdPos = { start: 0, end: 0 };
      if (Array.isArray(v)) return v;
      return v === null && el.e.k !== 'var' && el.e.k !== 'paren' ? [] : first || v !== null ? [v] : [];
    }
    return this.invoke(el, input);
  }

  // ---------- chiamata di comandi ----------
  private evalArgs(args: Arg[]): { params: { name: string; value: unknown; has: boolean }[]; pos: unknown[]; order: ({ t: 'p'; i: number } | { t: 'a'; i: number })[] } {
    const params: { name: string; value: unknown; has: boolean }[] = [];
    const pos: unknown[] = [];
    const order: ({ t: 'p'; i: number } | { t: 'a'; i: number })[] = [];
    for (const a of args) {
      if (a.k === 'param') {
        params.push({ name: a.name, value: a.value ? this.evalExpr(a.value) : null, has: !!a.value });
        order.push({ t: 'p', i: params.length - 1 });
      } else if (a.k === 'splat') {
        const h = this.getVar(a.name);
        if (h instanceof PSObject) {
          for (const k of h.keys()) {
            params.push({ name: k, value: h.props[k], has: true });
            order.push({ t: 'p', i: params.length - 1 });
          }
        }
      } else {
        pos.push(this.evalExpr(a.value));
        order.push({ t: 'a', i: pos.length - 1 });
      }
    }
    return { params, pos, order };
  }

  invoke(cmd: CmdNode, input: unknown[]): unknown[] {
    this.tick();
    let nameVal: unknown = this.evalExpr(cmd.name);
    this.cmdPos = { start: cmd.start, end: cmd.end };
    if (nameVal instanceof PSScriptBlock) {
      const { pos } = this.evalArgs(cmd.args);
      return this.invokeBlock(nameVal, pos, !cmd.dot);
    }
    const name = psToString(nameVal);
    const evald = this.evalArgs(cmd.args);
    const lower = name.toLowerCase();

    // alias -> cmdlet (Windows PowerShell 5.1: curl e wget sono alias di Invoke-WebRequest)
    const aliasTarget = psAliases()[lower];
    const fn = this.funcs.get(lower);
    if (fn) return this.callFunction(fn, evald, input);
    const cmdletName = CMDLETS.has(lower) ? lower : aliasTarget && CMDLETS.has(aliasTarget.toLowerCase()) ? aliasTarget.toLowerCase() : null;
    if (cmdletName) {
      const def = CMDLETS.get(cmdletName)!;
      const ctx = this.bind(def.spec, def.name, evald, input, name);
      return def.run(ctx) ?? [];
    }
    // script o applicazione
    if (/[\\/]/.test(name)) return this.runScript(name, evald, input, cmd.dot);
    // ricerca nel PATH: solo script .ps1 (come PowerShell, che non cerca nella cartella corrente)
    for (const dir of (this.env('PATH') ?? '').split(':')) {
      if (!dir) continue;
      const cand = `${dir.replace(/\/$/, '')}/${/\.ps1$/i.test(name) ? name : name + '.ps1'}`;
      if (this.vfs.isFile(this.rp(cand))) return this.runScript(cand, evald, input, cmd.dot);
    }
    const ext = this.nativeCommand(lower, evald, input);
    if (ext) return ext;
    const sug = this.vfs.isFile(this.rp(name)) && /\.ps1$/i.test(name) ? `\nSuggestion [3,General]: The command ${name} was not found, but does exist in the current location. Windows PowerShell does not load commands from the current location by default. If you trust this command, instead type: ".\\${name}". See "get-help about_Command_Precedence" for more details.` : '';
    throw new PSError(
      `The term '${name}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.${sug}`,
      'ObjectNotFound',
      'CommandNotFoundException',
      `${name}:String`,
      name,
    );
  }

  private bind(spec: ReturnType<typeof parseParamSpec>, cmdName: string, ev: ReturnType<PsRuntime['evalArgs']>, input: unknown[], called: string): CmdCtx {
    const bound = new Map<string, unknown>();
    const extraPos: unknown[] = [];
    const rawParams: { name: string; value: unknown; has: boolean }[] = [];
    const claimed = new Set<number>();
    let errorAction: string | undefined;
    const used = new Set<string>();
    const find = (n: string): (typeof spec)[number] | undefined => {
      const l = n.toLowerCase();
      let hit = spec.find((p) => p.name.toLowerCase() === l || p.aliases.some((a) => a.toLowerCase() === l));
      if (hit) return hit;
      const cands = spec.filter((p) => p.name.toLowerCase().startsWith(l));
      if (cands.length === 1) hit = cands[0];
      else if (cands.length > 1) throw new PSError(`Parameter cannot be processed because the parameter name '${n}' is ambiguous. Possible matches include: ${cands.map((c) => '-' + c.name).join(' ')}.`, 'InvalidArgument', 'AmbiguousParameter', n, cmdName);
      return hit;
    };
    let posIdx = 0;
    const posParams = spec.filter((p) => p.pos !== undefined).sort((a, b) => a.pos! - b.pos!);
    for (let k = 0; k < ev.order.length; k++) {
      const o = ev.order[k];
      if (o.t === 'p') {
        const p = ev.params[o.i];
        const lname = p.name.toLowerCase();
        if (lname === 'erroraction' || lname === 'ea') {
          errorAction = psToString(p.has ? p.value : (ev.order[k + 1]?.t === 'a' ? ev.pos[(ev.order[++k] as { i: number }).i] : ''));
          continue;
        }
        if (['warningaction', 'wa', 'errorvariable', 'ev', 'outvariable', 'ov', 'informationaction'].includes(lname)) {
          if (!p.has && ev.order[k + 1]?.t === 'a') k++;
          continue;
        }
        if (['verbose', 'vb', 'debug', 'db'].includes(lname) && !(lname === 'verbose' && cmdName.toLowerCase() === 'write-verbose')) continue;
        const def = find(p.name);
        if (!def) {
          rawParams.push(p);
          if (!p.has && ev.order[k + 1]?.t === 'a' && CMDLETS.get(cmdName.toLowerCase())?.rawOps) {
            /* es. Where-Object status -eq open: il valore è letto da extraPos */
          }
          if (CMDLETS.get(cmdName.toLowerCase())?.rawOps) continue;
          throw new PSError(`A parameter cannot be found that matches parameter name '${p.name}'.`, 'InvalidArgument', 'NamedParameterNotFound,Microsoft.PowerShell.Commands.' + cmdName.replace(/-/g, '') + 'Command', p.name, cmdName);
        }
        used.add(def.name);
        if (def.sw) {
          bound.set(def.name, p.has ? truthy(p.value) : true);
        } else if (p.has) bound.set(def.name, p.value);
        else {
          const nx = ev.order[k + 1];
          if (nx && nx.t === 'a') {
            bound.set(def.name, ev.pos[nx.i]);
            claimed.add(nx.i);
            k++;
          } else {
            throw new PSError(`Missing an argument for parameter '${def.name}'. Specify a parameter of type 'System.Object' and try again.`, 'InvalidArgument', 'MissingArgument,Microsoft.PowerShell.Commands.' + cmdName.replace(/-/g, '') + 'Command', def.name, cmdName);
          }
        }
      } else if (!claimed.has(o.i)) {
        // posizionale
        while (posIdx < posParams.length && used.has(posParams[posIdx].name)) posIdx++;
        if (posIdx < posParams.length) {
          used.add(posParams[posIdx].name);
          bound.set(posParams[posIdx].name, ev.pos[o.i]);
          posIdx++;
        } else extraPos.push(ev.pos[o.i]);
      }
    }
    void called;
    return { rt: this, name: cmdName, input, bound, extra: extraPos, raw: rawParams, errorAction, get: (n) => bound.get(n), has: (n) => bound.has(n) };
  }

  invokeBlock(sb: PSScriptBlock, args: unknown[] = [], newScope = true): unknown[] {
    if (++this.depth > 60) {
      this.depth--;
      throw new PSError('Il limite di ricorsione del laboratorio è stato superato.', 'LimitsExceeded', 'LabLimit');
    }
    if (newScope) this.scopes.push(new Map());
    this.argsStack.push(args);
    try {
      return this.execBlock(sb.block);
    } catch (e) {
      if (e instanceof ReturnEx) return [...partialOf(e), ...e.value];
      throw e;
    } finally {
      this.argsStack.pop();
      if (newScope) this.scopes.pop();
      this.depth--;
    }
  }

  /** Esegue uno script block con `$_` impostato. */
  invokeWithItem(sb: PSScriptBlock, item: unknown): unknown[] {
    this.itemStack.push(item);
    try {
      return this.invokeBlock(sb, [], true);
    } finally {
      this.itemStack.pop();
    }
  }

  private bindParams(params: Param[], ev: ReturnType<PsRuntime['evalArgs']>, name: string): unknown[] {
    const scope = this.scopes[this.scopes.length - 1];
    const spec = params.map((p) => ({ name: p.name, aliases: [] as string[], pos: undefined as number | undefined, sw: p.isSwitch }));
    const posList: unknown[] = [];
    const used = new Set<string>();
    const claimed = new Set<number>();
    for (let k = 0; k < ev.order.length; k++) {
      const o = ev.order[k];
      if (o.t === 'p') {
        const p = ev.params[o.i];
        const l = p.name.toLowerCase();
        let idx = spec.findIndex((x) => x.name.toLowerCase() === l);
        if (idx < 0) {
          const c = spec.filter((x) => x.name.toLowerCase().startsWith(l));
          if (c.length === 1) idx = spec.indexOf(c[0]);
        }
        if (idx < 0) throw new PSError(`A parameter cannot be found that matches parameter name '${p.name}'.`, 'InvalidArgument', 'NamedParameterNotFound', p.name, name);
        used.add(spec[idx].name);
        if (spec[idx].sw) scope.set(spec[idx].name.toLowerCase(), p.has ? truthy(p.value) : true);
        else if (p.has) scope.set(spec[idx].name.toLowerCase(), this.coerceParam(params[idx], p.value));
        else {
          const nx = ev.order[k + 1];
          if (nx && nx.t === 'a') {
            scope.set(spec[idx].name.toLowerCase(), this.coerceParam(params[idx], ev.pos[nx.i]));
            claimed.add(nx.i);
            k++;
          }
        }
      } else if (!claimed.has(o.i)) posList.push(ev.pos[o.i]);
    }
    const extras: unknown[] = [];
    let pi = 0;
    for (const v of posList) {
      while (pi < params.length && (used.has(params[pi].name) || params[pi].isSwitch)) pi++;
      if (pi < params.length) {
        scope.set(params[pi].name.toLowerCase(), this.coerceParam(params[pi], v));
        used.add(params[pi].name);
        pi++;
      } else extras.push(v);
    }
    for (const p of params) {
      if (!used.has(p.name)) scope.set(p.name.toLowerCase(), p.isSwitch ? false : p.def ? this.evalExpr(p.def) : null);
    }
    return extras;
  }

  private coerceParam(p: Param, v: unknown): unknown {
    return p.type && !p.isSwitch ? castValue(this, p.type, v) : v;
  }

  private callFunction(f: FuncDef, ev: ReturnType<PsRuntime['evalArgs']>, input: unknown[]): unknown[] {
    if (++this.depth > 60) {
      this.depth--;
      throw new PSError('Il limite di ricorsione del laboratorio è stato superato.', 'LimitsExceeded', 'LabLimit');
    }
    this.scopes.push(new Map());
    try {
      const extras = this.bindParams(f.params, ev, f.name);
      this.argsStack.push(extras);
      this.scopes[this.scopes.length - 1].set('input', input);
      try {
        const body = f.body.stmts.filter((s) => s.k !== 'param');
        if (body.some((s) => s.k === 'named')) {
          const out: unknown[] = [];
          for (const s of body) if (s.k === 'named' && s.name === 'begin') out.push(...this.execBlock(s.body));
          for (const it of input) {
            this.itemStack.push(it);
            try {
              for (const s of body) if (s.k === 'named' && s.name === 'process') out.push(...this.execBlock(s.body));
            } finally {
              this.itemStack.pop();
            }
          }
          for (const s of body) if (s.k === 'named' && s.name === 'end') out.push(...this.execBlock(s.body));
          return out;
        }
        return this.execBlock({ ...f.body, stmts: body });
      } catch (e) {
        if (e instanceof ReturnEx) return [...partialOf(e), ...e.value];
        throw e;
      } finally {
        this.argsStack.pop();
      }
    } finally {
      this.scopes.pop();
      this.depth--;
    }
  }

  private runScript(name: string, ev: ReturnType<PsRuntime['evalArgs']>, input: unknown[], dot: boolean): unknown[] {
    const abs = this.rp(name);
    if (!this.vfs.exists(abs)) {
      throw new PSError(`The term '${name}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`, 'ObjectNotFound', 'CommandNotFoundException', `${name}:String`, name);
    }
    if (this.vfs.isDir(abs)) throw new PSError(`Cannot run a directory: '${name}'.`, 'InvalidArgument', 'RuntimeException', name, name);
    if (!/\.ps1$/i.test(abs)) {
      throw new PSError(`The file '${abs}' is not a PowerShell script (.ps1) and cannot be run directly in this lab.`, 'InvalidOperation', 'NotSupported', name, name);
    }
    const src = this.vfs.readFile(abs);
    let prog: Block;
    try {
      prog = new PsParser(src).parseProgram();
    } catch (e) {
      if (e instanceof PsSyntaxError || e instanceof PsIncomplete) {
        throw new PSError(`Errore di sintassi nello script ${name}: ${e instanceof PsSyntaxError ? e.message : 'blocco non chiuso'}`, 'ParserError', 'ParseException', name, name);
      }
      throw e;
    }
    const savedSrc = this.src;
    const savedDir = this.scriptDir;
    this.src = src;
    this.scriptDir = abs.slice(0, abs.lastIndexOf('/')) || '/';
    if (!dot) {
      this.scopes.push(new Map());
      this.scriptScopes.push(this.scopes.length - 1);
    }
    try {
      const first = prog.stmts[0];
      let extras: unknown[] = [];
      if (first && first.k === 'param') extras = this.bindParams(first.params, ev, name);
      else extras = [...ev.pos];
      this.argsStack.push(extras);
      const out: unknown[] = [];
      try {
        for (const s of prog.stmts) {
          try {
            out.push(...this.execListStmt(s));
          } catch (e) {
            if (e instanceof PSError && !(e instanceof ThrowEx) && this.tryDepth === 0) {
              this.reportError(e, s);
              this.lastOk = false;
              continue;
            }
            throw e;
          }
        }
      } catch (e) {
        out.push(...partialOf(e));
        if (e instanceof ReturnEx) out.push(...e.value);
        else if (e instanceof ExitEx) {
          this.lastNative = e.code;
          this.lastOk = e.code === 0;
        } else throw e;
      } finally {
        this.argsStack.pop();
      }
      void input;
      return out;
    } finally {
      if (!dot) {
        this.scopes.pop();
        this.scriptScopes.pop();
      }
      this.src = savedSrc;
      this.scriptDir = savedDir;
    }
  }

  private nativeCommand(lower: string, ev: ReturnType<PsRuntime['evalArgs']>, input: unknown[]): unknown[] | null {
    const strArgs = nativeArgv(ev.order.flatMap((o) => (o.t === 'p' ? [`-${ev.params[o.i].name}`, ...(ev.params[o.i].has ? [psToString(ev.params[o.i].value)] : [])] : [psToString(ev.pos[o.i])])));
    const fsish = { state: this.state, vfs: this.vfs, resolve: (p: string) => this.rp(p), cwd: this.ss.cwd };
    const stdin = input.map(psToString).join('\n');
    return runNative(this, lower, strArgs, stdin, fsish);
  }

  // ---------- espressioni ----------
  evalExpr(e: Expr): unknown {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 'bare':
        return e.v;
      case 'estr':
        return e.parts.map((p) => (typeof p === 'string' ? p : psToString(this.evalExpr(p)))).join('');
      case 'var':
        return this.getVar(e.name);
      case 'splat':
        return this.getVar(e.name);
      case 'subexpr': {
        const out = this.execBlock(e.body);
        return out.length === 0 ? null : out.length === 1 ? out[0] : out;
      }
      case 'arrayexpr':
        return this.execBlock(e.body);
      case 'paren': {
        const out = this.stmtOutputs(e.stmt);
        return out.length === 0 ? null : out.length === 1 ? out[0] : out;
      }
      case 'hash': {
        const h = hash();
        for (const en of e.entries) {
          const k = this.evalExpr(en.key);
          h.props[psToString(k)] = this.stmtValue(en.val);
        }
        return h;
      }
      case 'sb':
        return new PSScriptBlock(e.block, e.src);
      case 'array':
        return e.items.flatMap((i) => {
          const v = this.evalExpr(i);
          return [v];
        });
      case 'cast': {
        // [int][char]"A" → 65: i caratteri sono stringhe di un carattere, il doppio cast restituisce il codice
        if (e.e.k === 'cast' && /^(int|int32|long|int64|byte)$/i.test(e.type) && /^char$/i.test(e.e.type)) {
          const inner = this.evalExpr(e.e.e);
          return typeof inner === 'number' ? inner : (psToString(inner).codePointAt(0) ?? 0);
        }
        return castValue(this, e.type, this.evalExpr(e.e));
      }
      case 'static':
        return staticMember(this, e.type, e.member, e.args ? e.args.map((a) => this.evalExpr(a)) : null);
      case 'un':
        return this.unary(e.op, this.evalExpr(e.e));
      case 'bin':
        return this.evalBin(e);
      case 'member': {
        const obj = this.evalExpr(e.obj);
        const name = typeof e.name === 'string' ? e.name : psToString(this.evalExpr(e.name));
        if (e.args) return callMethod(this, obj, name, e.args.map((a) => this.evalExpr(a)));
        return getMember(this, obj, name);
      }
      case 'index': {
        const obj = this.evalExpr(e.obj);
        const idx = this.evalExpr(e.idx);
        return this.index(obj, idx);
      }
      case 'postfix':
      case 'prefix': {
        const cur = this.evalExpr(e.target);
        const n = (typeof cur === 'number' ? cur : Number(psToString(cur)) || 0) + (e.op === '++' ? 1 : -1);
        this.assignTo(e.target, n);
        return e.k === 'postfix' ? cur : n;
      }
    }
  }

  index(obj: unknown, idx: unknown): unknown {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      if (Array.isArray(idx)) return idx.map((i) => this.index(obj, i));
      const i = typeof idx === 'number' ? idx : parseInt(psToString(idx), 10);
      const j = i < 0 ? obj.length + i : i;
      return obj[j] ?? null;
    }
    if (typeof obj === 'string') {
      const i = typeof idx === 'number' ? idx : parseInt(psToString(idx), 10);
      const j = i < 0 ? obj.length + i : i;
      return j >= 0 && j < obj.length ? obj[j] : null;
    }
    if (obj instanceof PSObject) return obj.get(psToString(idx));
    return null;
  }

  private unary(op: string, v: unknown): unknown {
    switch (op) {
      case '!':
        return !truthy(v);
      case '-':
        return -(typeof v === 'number' ? v : Number(psToString(v)));
      case '+':
        return typeof v === 'number' ? v : Number(psToString(v));
      case '-split':
        return psToString(v).trim().split(/\s+/);
      case '-join':
        return toArray(v).map(psToString).join('');
    }
    return v;
  }

  private evalBin(e: Extract<Expr, { k: 'bin' }>): unknown {
    const op = e.op;
    if (op === 'and') {
      const l = this.evalExpr(e.l);
      return truthy(l) ? truthy(this.evalExpr(e.r)) : false;
    }
    if (op === 'or') {
      const l = this.evalExpr(e.l);
      return truthy(l) ? true : truthy(this.evalExpr(e.r));
    }
    return this.binary(op, this.evalExpr(e.l), this.evalExpr(e.r));
  }

  binary(op: string, l: unknown, r: unknown): unknown {
    const cs = /^c/.test(op) && op.length > 2 ? true : false;
    const base = op.replace(/^[ci](?=(eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|replace))/, '');
    switch (base) {
      case '+': {
        if (typeof l === 'string') return l + psToString(r);
        if (Array.isArray(l)) return [...l, ...(Array.isArray(r) ? r : [r])];
        if (l === null || l === undefined) return Array.isArray(r) ? r : r;
        if (typeof l === 'number') {
          const n = typeof r === 'number' ? r : Number(psToString(r));
          if (Number.isNaN(n)) throw new PSError(`Cannot convert value "${psToString(r)}" to type "System.Int32". Error: "Input string was not in a correct format."`, 'InvalidArgument', 'InvalidCastFromStringToInteger');
          return l + n;
        }
        if (l instanceof PSObject && l.isHash && r instanceof PSObject) {
          const m = hash({ ...l.props });
          for (const k of r.keys()) {
            if (k in m.props) throw new PSError(`Item has already been added. Key in dictionary: '${k}'  Key being added: '${k}'`, 'InvalidOperation', 'RuntimeException');
            m.props[k] = r.props[k];
          }
          return m;
        }
        throw new PSError(`Method invocation failed because [${typeNameOf(l)}] does not contain a method named 'op_Addition'.`, 'InvalidOperation', 'RuntimeException');
      }
      case '-':
        return this.num(l) - this.num(r);
      case '*':
        if (typeof l === 'string') return l.repeat(Math.max(0, this.num(r)));
        if (Array.isArray(l)) return Array.from({ length: this.num(r) }, () => l).flat();
        return this.num(l) * this.num(r);
      case '/': {
        const d = this.num(r);
        if (d === 0) throw new PSError('Attempted to divide by zero.', 'NotSpecified', 'RuntimeException');
        return this.num(l) / d;
      }
      case '%': {
        const d = this.num(r);
        if (d === 0) throw new PSError('Attempted to divide by zero.', 'NotSpecified', 'RuntimeException');
        return this.num(l) % d;
      }
      case '..': {
        const a = Math.trunc(this.num(l));
        const b = Math.trunc(this.num(r));
        if (Math.abs(b - a) > 100_000) throw new PSError('Intervallo troppo ampio per il laboratorio.', 'LimitsExceeded', 'LabLimit');
        const out: number[] = [];
        if (a <= b) for (let i = a; i <= b; i++) out.push(i);
        else for (let i = a; i >= b; i--) out.push(i);
        return out;
      }
      case 'f': {
        const args = toArray(r);
        return psToString(l).replace(/\{(\d+)(?::([^}]*))?\}/g, (_, i: string, fmt?: string) => {
          const v = args[parseInt(i, 10)];
          if (fmt && typeof v === 'number') {
            const m = /^([NFDnfd])(\d*)$/.exec(fmt);
            if (m) {
              const dec = m[2] ? parseInt(m[2], 10) : 2;
              return m[1].toUpperCase() === 'D' ? String(Math.trunc(v)).padStart(dec, '0') : v.toFixed(dec);
            }
          }
          return psToString(v);
        });
      }
      case 'eq':
      case 'ne':
      case 'gt':
      case 'ge':
      case 'lt':
      case 'le':
      case 'like':
      case 'notlike':
      case 'match':
      case 'notmatch':
        if (Array.isArray(l)) return l.filter((x) => truthy(this.compare(base, x, r, cs)));
        return this.compare(base, l, r, cs);
      case 'contains':
        return toArray(l).some((x) => psEqual(x, r));
      case 'notcontains':
        return !toArray(l).some((x) => psEqual(x, r));
      case 'in':
        return toArray(r).some((x) => psEqual(x, l));
      case 'notin':
        return !toArray(r).some((x) => psEqual(x, l));
      case 'replace': {
        const pair = toArray(r);
        const pat = psToString(pair[0]);
        const rep = pair.length > 1 ? psToString(pair[1]).replace(/\$(\d)/g, '$$$1') : '';
        const f = (s: unknown): string => {
          try {
            return psToString(s).replace(new RegExp(pat, cs ? 'g' : 'gi'), rep);
          } catch {
            throw new PSError(`Cannot find the regex '${pat}'.`, 'InvalidOperation', 'RuntimeException');
          }
        };
        return Array.isArray(l) ? l.map(f) : f(l);
      }
      case 'split': {
        const pair = toArray(r);
        const s = psToString(l);
        let parts: string[];
        try {
          parts = s.split(new RegExp(psToString(pair[0])));
        } catch {
          parts = s.split(psToString(pair[0]));
        }
        const max = pair.length > 1 ? Number(pair[1]) : 0;
        if (max > 0 && parts.length > max) {
          const re = new RegExp(psToString(pair[0]));
          const head: string[] = [];
          let rest = s;
          for (let i = 0; i < max - 1; i++) {
            const m = re.exec(rest);
            if (!m) break;
            head.push(rest.slice(0, m.index));
            rest = rest.slice(m.index + m[0].length);
          }
          parts = [...head, rest];
        }
        return parts;
      }
      case 'join':
        return toArray(l).map(psToString).join(psToString(r));
      case 'xor':
        return truthy(l) !== truthy(r);
      case 'is':
      case 'isnot': {
        const t = psToString(r).toLowerCase().replace(/^system\./, '');
        const tn = typeNameOf(l).toLowerCase().replace(/^system\./, '');
        const map: Record<string, string[]> = { string: ['string'], int: ['int32'], int32: ['int32'], double: ['double'], bool: ['boolean'], array: ['object[]'], hashtable: ['collections.hashtable'], pscustomobject: ['management.automation.pscustomobject'] };
        const ok = (map[t] ?? [t]).includes(tn) || (t === 'int' && typeof l === 'number' && Number.isInteger(l));
        return base === 'is' ? ok : !ok;
      }
      case 'as':
        try {
          return castValue(this, psToString(r), l);
        } catch {
          return null;
        }
    }
    throw new PSError(`Operatore non supportato: ${op}`, 'ParserError', 'ParseException');
  }

  private num(v: unknown): number {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isEnum(v)) return (v as PSObject).props.value__ as number;
    const n = Number(psToString(v));
    if (Number.isNaN(n)) throw new PSError(`Cannot convert value "${psToString(v)}" to type "System.Int32". Error: "Input string was not in a correct format."`, 'InvalidArgument', 'InvalidCastFromStringToInteger');
    return n;
  }

  private compare(op: string, a: unknown, b: unknown, cs: boolean): boolean {
    switch (op) {
      case 'eq':
        return psEqual(a, b, cs);
      case 'ne':
        return !psEqual(a, b, cs);
      case 'gt':
        return psCompare(a, b) > 0;
      case 'ge':
        return psCompare(a, b) >= 0;
      case 'lt':
        return psCompare(a, b) < 0;
      case 'le':
        return psCompare(a, b) <= 0;
      case 'like':
      case 'notlike': {
        const re = new RegExp('^' + psToString(b).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', cs ? '' : 'i');
        return (op === 'like') === re.test(psToString(a));
      }
      case 'match':
      case 'notmatch': {
        let re: RegExp;
        try {
          re = new RegExp(psToString(b), cs ? '' : 'i');
        } catch {
          throw new PSError(`Cannot find the regex '${psToString(b)}'.`, 'InvalidOperation', 'RuntimeException');
        }
        const m = re.exec(psToString(a));
        if (op === 'match' && m) {
          const matches = hash();
          m.forEach((g, i) => (matches.props[String(i)] = g));
          if (m.groups) for (const [k, v] of Object.entries(m.groups)) matches.props[k] = v;
          this.setVar('Matches', matches);
        }
        return (op === 'match') === !!m;
      }
    }
    return false;
  }
}

// ---------- comandi nativi ----------
/**
 * Passaggio degli argomenti ai programmi esterni in Windows PowerShell 5.1: gli argomenti con spazi vengono racchiusi tra
 * virgolette SENZA fare l'escape delle virgolette interne; il programma poi ricostruisce gli argomenti con le regole della
 * libreria C. Effetto noto: `-d '{"a":"b c"}'` arriva come `{a:b c}` (virgolette perse); serve `-d '{\"a\":\"b c\"}'`.
 */
export function nativeArgv(args: string[]): string[] {
  const line = args.map((a) => (/\s/.test(a) && !(a.length >= 2 && a.startsWith('"') && a.endsWith('"')) ? `"${a}"` : a === '' ? '""' : a)).join(' ');
  const out: string[] = [];
  let cur = '';
  let has = false;
  let inQ = false;
  for (let i = 0; i < line.length; ) {
    const c = line[i];
    if (c === '\\') {
      let k = 0;
      while (line[i + k] === '\\') k++;
      i += k;
      has = true;
      if (line[i] === '"') {
        cur += '\\'.repeat(k >> 1);
        if (k & 1) cur += '"';
        else inQ = !inQ;
        i++;
      } else cur += '\\'.repeat(k);
    } else if (c === '"') {
      inQ = !inQ;
      has = true;
      i++;
    } else if ((c === ' ' || c === '\t') && !inQ) {
      if (has) out.push(cur);
      cur = '';
      has = false;
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  if (has) out.push(cur);
  return out;
}

import { curl } from '../bash/curl.ts';
import { git } from '../bash/git.ts';
import { runJq, formatJson, parseJsonStream, JqError, takeJqVars } from '../jq.ts';
import { getopt } from '../util.ts';
import { renderHelp } from '../catalog.ts';
import { sshMain } from '../lab-node.ts';

function runNative(rt: PsRuntime, name: string, args: string[], stdin: string, fsish: { state: WorkspaceState; vfs: Vfs; resolve: (p: string) => string; cwd: string }): unknown[] | null {
  let out = '';
  let err = '';
  const io: Io = { stdin, out: (t) => (out += t), err: (t) => (err += t), tty: false };
  let code: number;
  if (name === 'curl.exe') {
    code = curl(args, io, fsish as never, 'pwsh', 'curl.exe');
  } else if (name === 'jq' || name === 'jq.exe') {
    code = 0;
    try {
      args = takeJqVars(args);
    } catch (e) {
      if (e instanceof JqError) {
        err += `jq: error: ${e.message}\n`;
        return finishNative(rt, out, err, e.code);
      }
      throw e;
    }
    const o = getopt(args, { flags: 'rcsenj' });
    const filter = o.rest.shift();
    if (filter === undefined) {
      err += 'Usage:\tjq [OPTIONS] FILTER [FILES...]\n';
      code = 2;
    } else {
      try {
        const texts = o.rest.length ? o.rest.map((f) => fsish.vfs.readFile(fsish.resolve(f))) : [stdin];
        for (const t of texts) {
          let docs = parseJsonStream(t);
          if (o.flags.has('s')) docs = [docs];
          for (const d of docs) for (const r of runJq(filter, d)) out += (o.flags.has('r') && typeof r === 'string' ? r : formatJson(r, o.flags.has('c'))) + '\n';
        }
      } catch (e) {
        if (e instanceof JqError) {
          err += `jq: error: ${e.message}\n`;
          code = e.code;
        } else if (e instanceof FsError) {
          err += `jq: error: Could not open file: No such file or directory\n`;
          code = 2;
        } else throw e;
      }
    }
  } else if (name === 'git' || name === 'git.exe') {
    code = git(args, io, fsish as never);
  } else if (name === 'ssh' || name === 'ssh.exe') {
    code = sshMain(rt.state, args, { out: (t) => (out += t), err: (t) => (err += t) });
  } else if (name === 'hostname') {
    out = 'lab\n';
    code = 0;
  } else if (name === 'whoami') {
    out = 'lab\\learner\n';
    code = 0;
  } else if (name === 'powershell' || name === 'powershell.exe' || name === 'pwsh') {
    // processo figlio: -File / -Command
    const iF = args.findIndex((a) => /^-f(ile)?$/i.test(a));
    const iC = args.findIndex((a) => /^-c(ommand)?$/i.test(a));
    const saved = { cwd: rt.ss.cwd, io: rt.io, src: rt.src };
    let src = '';
    if (iC >= 0) src = args.slice(iC + 1).join(' ');
    else if (iF >= 0) src = `& '${args[iF + 1]}' ${args.slice(iF + 2).join(' ')}`;
    else {
      err += 'powershell: usa -File <script> oppure -Command "<comandi>"\n';
      return finishNative(rt, '', err, 1);
    }
    const child = new PsRuntime(rt.state);
    child.global = new Map();
    child.scopes = [child.global];
    child.global.set('args', []);
    const res = child.runTop(src, { stdin: '', out: (t) => (out += t), err: (t) => (err += t), tty: false });
    rt.ss.cwd = saved.cwd;
    rt.io = saved.io;
    rt.src = saved.src;
    code = res.code;
  } else if (name === 'help') {
    out = renderHelp('', 'pwsh');
    code = 0;
  } else return null;
  return finishNative(rt, out, err, code);
}

function finishNative(rt: PsRuntime, out: string, err: string, code: number): unknown[] {
  rt.lastNative = code;
  if (code !== 0) rt.lastOk = false;
  if (err) rt.io.err(err);
  if (!out) return [];
  const lines = out.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function runPwshLine(state: WorkspaceState, line: string, io: Io): { code: number; incomplete: boolean; clear: boolean } {
  const rt = new PsRuntime(state);
  try {
    return rt.runTop(line, io);
  } catch (e) {
    if (e instanceof PSError) {
      io.err(e.message + '\n');
      return { code: 1, incomplete: false, clear: false };
    }
    throw e;
  }
}

void fromJsonValue;
void fmtNumber;
void fmtDateTime;
void PSFormatted;
