/** Sottoinsieme di jq: percorsi, pipe, select, map, length, keys, costruttori, confronti. */

type J = unknown;
type Expr = (input: J) => J[];

export class JqError extends Error {
  constructor(
    message: string,
    public code = 5,
  ) {
    super(message);
  }
}

interface Tok {
  t: 'punct' | 'str' | 'istr' | 'num' | 'id' | 'field';
  v: string;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      const parts: (string | { e: string })[] = [];
      let interp = false;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') {
          j++;
          const n = src[j];
          if (n === '(') {
            // interpolazione \( espressione )
            let depth = 1;
            let k = j + 1;
            let inStr = false;
            while (k < src.length && depth > 0) {
              const ch = src[k];
              if (inStr) {
                if (ch === '\\') k++;
                else if (ch === '"') inStr = false;
              } else if (ch === '"') inStr = true;
              else if (ch === '(') depth++;
              else if (ch === ')') depth--;
              k++;
            }
            if (depth > 0) throw new JqError('syntax error: interpolazione non chiusa', 3);
            parts.push(s);
            s = '';
            parts.push({ e: src.slice(j + 1, k - 1) });
            interp = true;
            j = k;
            continue;
          }
          if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 1, j + 5))) {
            s += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16));
            j += 5;
            continue;
          }
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
        } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new JqError('syntax error: stringa non chiusa', 3);
      if (interp) {
        parts.push(s);
        toks.push({ t: 'istr', v: JSON.stringify(parts) });
      } else toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '@' && /[a-z]/.test(src[i + 1] ?? '')) {
      const m = /^@[a-z0-9]+/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '.' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      const m = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i))!;
      toks.push({ t: 'field', v: m[1] });
      i += m[0].length;
      continue;
    }
    if (c === '$' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '//', '..'].includes(two)) {
      toks.push({ t: 'punct', v: two });
      i += 2;
      continue;
    }
    if ('.|,()[]{}:<>+-*/%'.includes(c)) {
      toks.push({ t: 'punct', v: c });
      i++;
      continue;
    }
    throw new JqError(`syntax error: carattere inatteso '${c}'`, 3);
  }
  return toks;
}

function typeName(v: J): string {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

function cmp(a: J, b: J): number {
  const order = ['null', 'boolean', 'number', 'string', 'array', 'object'];
  const ta = typeName(a);
  const tb = typeName(b);
  if (ta !== tb) return order.indexOf(ta) - order.indexOf(tb);
  if (ta === 'number' || ta === 'string') return a! < b! ? -1 : a! > b! ? 1 : 0;
  if (ta === 'boolean') return Number(a) - Number(b);
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
}

function truthy(v: J): boolean {
  return v !== null && v !== false;
}

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined {
    return this.toks[this.p];
  }
  private isP(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'punct' && t.v === v;
  }
  private isId(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'id' && t.v === v;
  }
  private eat(v: string): void {
    if (!this.isP(v)) throw new JqError(`syntax error: atteso '${v}'`, 3);
    this.p++;
  }
  parse(): Expr {
    const e = this.pipe();
    if (this.p < this.toks.length) throw new JqError(`syntax error: token inatteso '${this.toks[this.p].v}'`, 3);
    return e;
  }
  private pipe(): Expr {
    let left = this.comma();
    while (this.isP('|')) {
      this.p++;
      const l = left;
      const r = this.comma();
      left = (x) => l(x).flatMap((y) => r(y));
    }
    return left;
  }
  private comma(): Expr {
    let left = this.alt();
    while (this.isP(',')) {
      this.p++;
      const l = left;
      const r = this.alt();
      left = (x) => [...l(x), ...r(x)];
    }
    return left;
  }
  private alt(): Expr {
    let left = this.or();
    while (this.isP('//')) {
      this.p++;
      const l = left;
      const r = this.or();
      left = (x) => {
        const v = l(x).filter(truthy);
        return v.length ? v : r(x);
      };
    }
    return left;
  }
  private or(): Expr {
    let left = this.and();
    while (this.isId('or')) {
      this.p++;
      const l = left;
      const r = this.and();
      left = (x) => l(x).flatMap((a) => (truthy(a) ? [true] : r(x).map(truthy)));
    }
    return left;
  }
  private and(): Expr {
    let left = this.compare();
    while (this.isId('and')) {
      this.p++;
      const l = left;
      const r = this.compare();
      left = (x) => l(x).flatMap((a) => (!truthy(a) ? [false] : r(x).map(truthy)));
    }
    return left;
  }
  private compare(): Expr {
    const left = this.add();
    const t = this.peek();
    if (t && t.t === 'punct' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      this.p++;
      const op = t.v;
      const right = this.add();
      return (x) =>
        left(x).flatMap((a) =>
          right(x).map((b) => {
            const c = cmp(a, b);
            return op === '==' ? c === 0 : op === '!=' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
          }),
        );
    }
    return left;
  }
  private add(): Expr {
    let left = this.mul();
    while (this.isP('+') || this.isP('-')) {
      const op = this.peek()!.v;
      this.p++;
      const l = left;
      const r = this.mul();
      left = (x) =>
        l(x).flatMap((a) =>
          r(x).map((b) => {
            if (op === '+') {
              if (a === null) return b;
              if (b === null) return a;
              if (typeof a === 'number' && typeof b === 'number') return a + b;
              if (typeof a === 'string' && typeof b === 'string') return a + b;
              if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
              if (typeof a === 'object' && typeof b === 'object') return { ...(a as object), ...(b as object) };
              throw new JqError(`${typeName(a)} and ${typeName(b)} cannot be added`);
            }
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            throw new JqError(`${typeName(a)} and ${typeName(b)} cannot be subtracted`);
          }),
        );
    }
    return left;
  }
  private mul(): Expr {
    let left = this.postfix();
    while (this.isP('*') || this.isP('/') || this.isP('%')) {
      const op = this.peek()!.v;
      this.p++;
      const l = left;
      const r = this.postfix();
      left = (x) =>
        l(x).flatMap((a) =>
          r(x).map((b) => {
            if (typeof a !== 'number' || typeof b !== 'number') throw new JqError(`${typeName(a)} and ${typeName(b)} cannot be multiplied/divided`);
            return op === '*' ? a * b : op === '/' ? a / b : a % b;
          }),
        );
    }
    return left;
  }
  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'field') {
        this.p++;
        e = this.chain(e, field(t.v));
      } else if (this.isP('[')) {
        this.p++;
        let idx: Expr;
        if (this.isP(']')) {
          this.p++;
          idx = iterate;
        } else {
          const inner = this.pipe();
          this.eat(']');
          idx = (x) => inner(x).map((k) => index(x, k)).filter(() => true);
          const innerIdx = inner;
          idx = (x) => innerIdx(x).map((k) => index(x, k));
        }
        e = this.chain(e, idx);
      } else if (this.isP('.') && this.toks[this.p + 1]?.t === 'str') {
        this.p++;
        const k = this.toks[this.p++].v;
        e = this.chain(e, field(k));
      } else break;
    }
    return e;
  }
  private chain(a: Expr, b: Expr): Expr {
    return (x) => a(x).flatMap((y) => b(y));
  }
  private primary(): Expr {
    const t = this.peek();
    if (!t) throw new JqError('syntax error: espressione incompleta', 3);
    if (t.t === 'field') {
      this.p++;
      return field(t.v);
    }
    if (t.t === 'str') {
      this.p++;
      return () => [t.v];
    }
    if (t.t === 'istr') {
      this.p++;
      const parts = (JSON.parse(t.v) as (string | { e: string })[]).map((p) => (typeof p === 'string' ? p : compileJq(p.e)));
      return (x) => {
        // prodotto cartesiano delle uscite delle espressioni interpolate
        let acc: string[] = [''];
        for (const p of parts) {
          if (typeof p === 'string') acc = acc.map((a) => a + p);
          else acc = acc.flatMap((a) => p(x).map((v) => a + (typeof v === 'string' ? v : JSON.stringify(v))));
        }
        return acc;
      };
    }
    if (t.t === 'num') {
      this.p++;
      return () => [parseFloat(t.v)];
    }
    if (t.t === 'punct') {
      if (t.v === '.') {
        this.p++;
        if (this.isP('[')) return (x) => [x];
        const n = this.peek();
        if (n?.t === 'str') {
          this.p++;
          return field(n.v);
        }
        return (x) => [x];
      }
      if (t.v === '..') {
        this.p++;
        return (x) => {
          const out: J[] = [];
          const walk = (v: J): void => {
            out.push(v);
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') Object.values(v).forEach(walk);
          };
          walk(x);
          return out;
        };
      }
      if (t.v === '(') {
        this.p++;
        const e = this.pipe();
        this.eat(')');
        return e;
      }
      if (t.v === '-') {
        this.p++;
        const e = this.postfix();
        return (x) => e(x).map((v) => -(v as number));
      }
      if (t.v === '[') {
        this.p++;
        if (this.isP(']')) {
          this.p++;
          return () => [[]];
        }
        const e = this.pipe();
        this.eat(']');
        return (x) => [e(x)];
      }
      if (t.v === '{') return this.object();
    }
    if (t.t === 'id') {
      this.p++;
      return this.func(t.v);
    }
    throw new JqError(`syntax error: token inatteso '${t.v}'`, 3);
  }
  private object(): Expr {
    this.eat('{');
    const entries: { key: Expr; val: Expr }[] = [];
    while (!this.isP('}')) {
      const t = this.peek();
      if (!t) throw new JqError('syntax error: oggetto non chiuso', 3);
      let key: Expr;
      let val: Expr | null = null;
      let keyName: string | null = null;
      if (t.t === 'id' && t.v.startsWith('$') && !(this.toks[this.p + 1]?.t === 'punct' && this.toks[this.p + 1].v === ':')) {
        // {$nome} equivale a {"nome": $nome}
        this.p++;
        const nm = t.v.slice(1);
        key = () => [nm];
        val = this.func(t.v);
        keyName = nm;
      } else if (t.t === 'id' || t.t === 'str') {
        this.p++;
        keyName = t.v;
        key = () => [t.v];
      } else if (t.t === 'field') {
        this.p++;
        keyName = t.v;
        key = () => [t.v];
        val = field(t.v);
      } else throw new JqError('syntax error: chiave di oggetto non valida', 3);
      if (this.isP(':')) {
        this.p++;
        val = this.alt();
      } else if (!val) val = field(keyName!);
      entries.push({ key, val });
      if (this.isP(',')) this.p++;
    }
    this.eat('}');
    return (x) => {
      let results: Record<string, J>[] = [{}];
      for (const { key, val } of entries) {
        const k = key(x)[0] as string;
        const vs = val(x);
        results = results.flatMap((r) => vs.map((v) => ({ ...r, [k]: v })));
      }
      return results;
    };
  }
  private arg(): Expr {
    this.eat('(');
    const e = this.pipe();
    this.eat(')');
    return e;
  }
  private func(name: string): Expr {
    if (name.startsWith('$')) {
      // variabile passata con --arg / --argjson
      const n = name.slice(1);
      return () => {
        if (!(n in JQ_VARS)) throw new JqError(`$${n} is not defined`, 3);
        return [JQ_VARS[n]];
      };
    }
    switch (name) {
      case 'null':
        return () => [null];
      case 'true':
        return () => [true];
      case 'false':
        return () => [false];
      case 'empty':
        return () => [];
      case 'not':
        return (x) => [!truthy(x)];
      case 'length':
        return (x) => {
          if (x === null) return [0];
          if (typeof x === 'string' || Array.isArray(x)) return [x.length];
          if (typeof x === 'object') return [Object.keys(x as object).length];
          if (typeof x === 'number') return [Math.abs(x)];
          throw new JqError(`${typeName(x)} has no length`);
        };
      case 'keys':
        return (x) => {
          if (Array.isArray(x)) return [x.map((_, i) => i)];
          if (x && typeof x === 'object') return [Object.keys(x).sort()];
          throw new JqError(`${typeName(x)} has no keys`);
        };
      case 'values':
        return (x) => (x === null ? [] : [x]);
      case 'first':
        return (x) => [Array.isArray(x) ? (x[0] ?? null) : null];
      case 'last':
        return (x) => [Array.isArray(x) ? (x[x.length - 1] ?? null) : null];
      case 'sort':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`${typeName(x)} cannot be sorted, as it is not an array`);
          return [[...x].sort(cmp)];
        };
      case 'unique':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`${typeName(x)} cannot be sorted, as it is not an array`);
          const s = [...x].sort(cmp);
          return [s.filter((v, i) => i === 0 || cmp(v, s[i - 1]) !== 0)];
        };
      case 'add':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`Cannot iterate over ${typeName(x)}`);
          if (!x.length) return [null];
          if (x.every((v) => typeof v === 'number')) return [(x as number[]).reduce((a, b) => a + b, 0)];
          if (x.every((v) => typeof v === 'string')) return [x.join('')];
          if (x.every(Array.isArray)) return [x.flat()];
          return [x.reduce((a, b) => ({ ...(a as object), ...(b as object) }), {})];
        };
      case 'tostring':
        return (x) => [typeof x === 'string' ? x : JSON.stringify(x)];
      case 'tojson':
        return (x) => [JSON.stringify(x)];
      case 'fromjson':
        return (x) => {
          try {
            return [JSON.parse(String(x))];
          } catch (e) {
            throw new JqError(`${String(x)} (while parsing '${String(x)}')`);
          }
        };
      case 'reverse':
        return (x) => {
          if (typeof x === 'string') return [[...x].reverse().join('')];
          if (x === null) return [[]];
          if (!Array.isArray(x)) throw new JqError(`Cannot reverse ${typeName(x)}`);
          return [[...x].reverse()];
        };
      case 'min':
      case 'max':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`Cannot iterate over ${typeName(x)}`);
          if (!x.length) return [null];
          const s = [...x].sort(cmp);
          return [name === 'min' ? s[0] : s[s.length - 1]];
        };
      case 'flatten':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`Cannot iterate over ${typeName(x)}`);
          return [x.flat(Infinity)];
        };
      case 'floor':
        return (x) => [Math.floor(Number(x))];
      case 'any':
        return (x) => [Array.isArray(x) ? x.some(truthy) : false];
      case 'all':
        return (x) => [Array.isArray(x) ? x.every(truthy) : true];
      case 'paths':
        return (x) => {
          const out: J[] = [];
          const walk = (v: J, path: J[]): void => {
            if (Array.isArray(v)) v.forEach((e, i) => { out.push([...path, i]); walk(e, [...path, i]); });
            else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.push([...path, k]); walk((v as Record<string, J>)[k], [...path, k]); }
          };
          walk(x, []);
          return out;
        };
      case 'group_by':
      case 'unique_by':
      case 'min_by':
      case 'max_by': {
        const f = this.arg();
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`Cannot iterate over ${typeName(x)}`);
          const keyed = x.map((v) => ({ v, k: f(v)[0] }));
          keyed.sort((a, b) => cmp(a.k, b.k));
          if (name === 'min_by') return [keyed.length ? keyed[0].v : null];
          if (name === 'max_by') return [keyed.length ? keyed[keyed.length - 1].v : null];
          const groups: { v: J; k: J }[][] = [];
          for (const e of keyed) {
            const g = groups[groups.length - 1];
            if (g && cmp(g[0].k, e.k) === 0) g.push(e);
            else groups.push([e]);
          }
          return [name === 'group_by' ? groups.map((g) => g.map((e) => e.v)) : groups.map((g) => g[0].v)];
        };
      }
      case 'index': {
        const f = this.arg();
        return (x) =>
          f(x).map((needle) => {
            if (typeof x === 'string') {
              const i = x.indexOf(String(needle));
              return i < 0 ? null : i;
            }
            if (Array.isArray(x)) {
              const i = x.findIndex((e) => cmp(e, needle) === 0);
              return i < 0 ? null : i;
            }
            return null;
          });
      }
      case '@csv':
      case '@tsv':
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`${typeName(x)} cannot be ${name === '@csv' ? 'csv' : 'tsv'}-formatted, only an array can be`);
          const cell = (v: J): string => {
            if (v === null) return '';
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            if (typeof v === 'string') return name === '@csv' ? `"${v.replace(/"/g, '""')}"` : v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
            throw new JqError(`${typeName(v)} (${JSON.stringify(v)}) is not valid in a csv row`);
          };
          return [x.map(cell).join(name === '@csv' ? ',' : '\t')];
        };
      case '@json':
        return (x) => [JSON.stringify(x)];
      case '@text':
        return (x) => [typeof x === 'string' ? x : JSON.stringify(x)];
      case '@sh':
        return (x) => [(Array.isArray(x) ? x : [x]).map((v) => (typeof v === 'string' ? `'${v.replace(/'/g, "'\\''")}'` : String(v))).join(' ')];
      case 'tonumber':
        return (x) => {
          const n = Number(x);
          if (Number.isNaN(n)) throw new JqError(`Cannot parse '${String(x)}' as number`);
          return [n];
        };
      case 'type':
        return (x) => [typeName(x)];
      case 'ascii_downcase':
        return (x) => [String(x).toLowerCase()];
      case 'ascii_upcase':
        return (x) => [String(x).toUpperCase()];
      case 'to_entries':
        return (x) => [Object.entries((x ?? {}) as object).map(([key, value]) => ({ key, value }))];
      case 'select': {
        const c = this.arg();
        return (x) => (c(x).some(truthy) ? [x] : []);
      }
      case 'map': {
        const f = this.arg();
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`Cannot iterate over ${typeName(x)}`);
          return [x.flatMap((v) => f(v))];
        };
      }
      case 'sort_by': {
        const f = this.arg();
        return (x) => {
          if (!Array.isArray(x)) throw new JqError(`${typeName(x)} cannot be sorted, as it is not an array`);
          return [[...x].sort((a, b) => cmp(f(a)[0], f(b)[0]))];
        };
      }
      case 'has': {
        const f = this.arg();
        return (x) => f(x).map((k) => (Array.isArray(x) ? (k as number) < x.length : !!x && typeof x === 'object' && (k as string) in (x as object)));
      }
      case 'contains':
      case 'startswith':
      case 'endswith':
      case 'test':
      case 'join':
      case 'split': {
        const f = this.arg();
        return (x) =>
          f(x).map((a) => {
            if (name === 'join') return (x as J[]).map((v) => (v === null ? '' : String(v))).join(String(a));
            if (name === 'split') return String(x).split(String(a));
            if (name === 'test') return new RegExp(String(a)).test(String(x));
            if (name === 'startswith') return String(x).startsWith(String(a));
            if (name === 'endswith') return String(x).endsWith(String(a));
            if (typeof x === 'string') return x.includes(String(a));
            if (Array.isArray(x)) return x.some((v) => cmp(v, a) === 0);
            return false;
          });
      }
    }
    throw new JqError(`error: ${name}/0 is not defined`, 3);
  }
}

const iterate: Expr = (x) => {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') return Object.values(x);
  throw new JqError(`Cannot iterate over ${x === null ? 'null' : typeName(x) + ' (' + JSON.stringify(x) + ')'}`);
};

function field(name: string): Expr {
  return (x) => {
    if (x === null) return [null];
    if (typeof x === 'object' && !Array.isArray(x)) return [(x as Record<string, J>)[name] ?? null];
    throw new JqError(`Cannot index ${typeName(x)} with "${name}"`);
  };
}

function index(x: J, k: J): J {
  if (x === null) return null;
  if (Array.isArray(x) && typeof k === 'number') return x[k < 0 ? x.length + k : k] ?? null;
  if (x && typeof x === 'object' && !Array.isArray(x) && typeof k === 'string') return (x as Record<string, J>)[k] ?? null;
  throw new JqError(`Cannot index ${typeName(x)} with ${typeof k === 'string' ? `"${k}"` : typeName(k)}`);
}

/** Variabili di `--arg` e `--argjson` per l'esecuzione corrente. */
let JQ_VARS: Record<string, J> = {};

/** Estrae `--arg nome valore` e `--argjson nome json` dagli argomenti e li rende disponibili come $nome. */
export function takeJqVars(args: string[]): string[] {
  JQ_VARS = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--arg' || a === '--argjson') {
      const name = args[i + 1];
      const val = args[i + 2];
      if (name === undefined || val === undefined) throw new JqError(`${a} takes two parameters (e.g. ${a} varname value)`, 2);
      if (a === '--arg') JQ_VARS[name] = val;
      else {
        try {
          JQ_VARS[name] = JSON.parse(val);
        } catch {
          throw new JqError(`Invalid JSON text passed to --argjson`, 2);
        }
      }
      i += 2;
    } else rest.push(a);
  }
  return rest;
}

export function compileJq(src: string): Expr {
  return new Parser(tokenize(src)).parse();
}

export function runJq(src: string, input: J): J[] {
  return compileJq(src)(input);
}

export function formatJson(v: J, compact = false, indent = 2): string {
  return compact ? JSON.stringify(v) : JSON.stringify(v, null, indent);
}

/** Parsa uno o più documenti JSON concatenati. */
export function parseJsonStream(text: string): J[] {
  const docs: J[] = [];
  const t = text.trim();
  if (!t) return docs;
  try {
    docs.push(JSON.parse(t));
    return docs;
  } catch (e) {
    // prova documento per riga
    const lines = t.split('\n');
    try {
      for (const l of lines) if (l.trim()) docs.push(JSON.parse(l));
      return docs;
    } catch {
      throw new JqError(`parse error: ${(e as Error).message}`, 2);
    }
  }
}
