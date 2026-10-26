/** Proprietà, metodi, cast e membri statici .NET supportati (sottoinsieme). */
import { FsError } from '../vfs.ts';
import { simDate, strftime } from '../util.ts';
import type { PsRuntime } from './interp.ts';
import { PSError, PSObject, PSScriptBlock, custom, enumValue, fmtDateTime, fmtNumber, hash, isEnum, psToString, toArray, truthy, typeNameOf } from './values.ts';

export function makeDate(sec: number): PSObject {
  return new PSObject('DateTime', { __sec: sec });
}

function notFound(obj: unknown, name: string): PSError {
  return new PSError(`Method invocation failed because [${typeNameOf(obj)}] does not contain a method named '${name}'.`, 'InvalidOperation', 'MethodNotFound', name);
}

export function getMember(rt: PsRuntime, obj: unknown, name: string): unknown {
  const l = name.toLowerCase();
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    if (l === 'count' || l === 'length') return obj.length;
    const out = obj.map((x) => getMember(rt, x, name)).filter((x) => x !== null);
    return out.length === 0 ? null : out.length === 1 ? out[0] : out.flatMap((x) => (Array.isArray(x) ? x : [x]));
  }
  if (typeof obj === 'string') {
    if (l === 'length') return obj.length;
    return null;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return null;
  if (obj instanceof PSObject) {
    if (obj.typeName === 'DateTime') {
      const d = simDate(obj.props.__sec as number);
      switch (l) {
        case 'year': return d.getUTCFullYear();
        case 'month': return d.getUTCMonth() + 1;
        case 'day': return d.getUTCDate();
        case 'hour': return d.getUTCHours();
        case 'minute': return d.getUTCMinutes();
        case 'second': return d.getUTCSeconds();
        case 'dayofweek': return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
        case 'date': return makeDate(Math.floor((obj.props.__sec as number) / 86400) * 86400);
      }
      return null;
    }
    if (obj.isHash) {
      if (obj.has(name)) return obj.get(name);
      if (l === 'count') return obj.keys().length;
      if (l === 'keys') return obj.keys();
      if (l === 'values') return obj.keys().map((k) => obj.props[k]);
      return null;
    }
    if (l === 'psobject') {
      return custom({ Properties: obj.keys().filter((k) => !k.startsWith('__')).map((k) => custom({ Name: k, Value: obj.props[k] })) });
    }
    if (isEnum(obj)) return l === 'value__' ? (obj as PSObject).props.value__ : null;
    if (name.startsWith('__')) return null;
    return obj.get(name);
  }
  if (obj instanceof PSScriptBlock) return null;
  return null;
}

function typeInfo(v: unknown): PSObject {
  const full = typeNameOf(v);
  return custom({ Name: full.split('.').pop() ?? full, FullName: full, BaseType: 'System.Object' });
}

const DOTNET_FMT = (fmt: string, sec: number): string => {
  const d = simDate(sec);
  const map: Record<string, string> = {
    yyyy: String(d.getUTCFullYear()), yy: String(d.getUTCFullYear() % 100).padStart(2, '0'),
    MM: String(d.getUTCMonth() + 1).padStart(2, '0'), dd: String(d.getUTCDate()).padStart(2, '0'),
    HH: String(d.getUTCHours()).padStart(2, '0'), mm: String(d.getUTCMinutes()).padStart(2, '0'), ss: String(d.getUTCSeconds()).padStart(2, '0'),
  };
  return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (m) => map[m]);
};
export { DOTNET_FMT };

export function callMethod(rt: PsRuntime, obj: unknown, name: string, args: unknown[]): unknown {
  const l = name.toLowerCase();
  if (l === 'gettype') return typeInfo(obj);
  if (obj === null || obj === undefined) {
    throw new PSError(`You cannot call a method on a null-valued expression.`, 'InvalidOperation', 'InvokeMethodOnNull');
  }
  const s = (i: number): string => psToString(args[i]);
  if (typeof obj === 'string') {
    switch (l) {
      case 'toupper': return obj.toUpperCase();
      case 'tolower': return obj.toLowerCase();
      case 'trim': return args.length ? obj.replace(new RegExp(`^[${escapeSet(s(0))}]+|[${escapeSet(s(0))}]+$`, 'g'), '') : obj.trim();
      case 'trimstart': return args.length ? obj.replace(new RegExp(`^[${escapeSet(s(0))}]+`), '') : obj.trimStart();
      case 'trimend': return args.length ? obj.replace(new RegExp(`[${escapeSet(s(0))}]+$`), '') : obj.trimEnd();
      case 'replace': return obj.split(s(0)).join(s(1));
      case 'split': return Array.isArray(args[0]) ? obj.split(new RegExp((args[0] as unknown[]).map((x) => escapeSet(psToString(x))).map((x) => `[${x}]`).join('|'))) : obj.split(s(0));
      case 'contains': return obj.includes(s(0));
      case 'startswith': return obj.toLowerCase().startsWith(s(0).toLowerCase()) && true ? obj.startsWith(s(0)) : false;
      case 'endswith': return obj.endsWith(s(0));
      case 'substring': {
        const start = args[0] as number;
        if (start < 0 || start > obj.length) throw new PSError('Exception calling "Substring" with "1" argument(s): "StartIndex cannot be less than zero."', 'NotSpecified', 'ArgumentOutOfRangeException');
        return args.length > 1 ? obj.substr(start, args[1] as number) : obj.substring(start);
      }
      case 'indexof': return obj.indexOf(s(0));
      case 'lastindexof': return obj.lastIndexOf(s(0));
      case 'padleft': return obj.padStart(args[0] as number, args.length > 1 ? s(1) : ' ');
      case 'padright': return obj.padEnd(args[0] as number, args.length > 1 ? s(1) : ' ');
      case 'insert': return obj.slice(0, args[0] as number) + s(1) + obj.slice(args[0] as number);
      case 'remove': return args.length > 1 ? obj.slice(0, args[0] as number) + obj.slice((args[0] as number) + (args[1] as number)) : obj.slice(0, args[0] as number);
      case 'tochararray': return [...obj];
      case 'tostring': return obj;
      case 'equals': return obj === s(0);
      case 'compareto': return obj < s(0) ? -1 : obj > s(0) ? 1 : 0;
      case 'normalize': return obj;
    }
    throw notFound(obj, name);
  }
  if (typeof obj === 'number') {
    switch (l) {
      case 'tostring': {
        if (args.length) {
          const m = /^([NFDnfd])(\d*)$/.exec(s(0));
          if (m) {
            const dec = m[2] ? parseInt(m[2], 10) : m[1].toUpperCase() === 'D' ? 0 : 2;
            return m[1].toUpperCase() === 'D' ? String(Math.trunc(obj)).padStart(dec, '0') : obj.toFixed(dec);
          }
        }
        return fmtNumber(obj);
      }
      case 'equals': return obj === args[0];
      case 'compareto': return Math.sign(obj - (args[0] as number));
    }
    throw notFound(obj, name);
  }
  if (typeof obj === 'boolean') {
    if (l === 'tostring') return obj ? 'True' : 'False';
    throw notFound(obj, name);
  }
  if (Array.isArray(obj)) {
    switch (l) {
      case 'contains': return obj.some((x) => psToString(x).toLowerCase() === s(0).toLowerCase());
      case 'indexof': return obj.findIndex((x) => psToString(x) === s(0));
      case 'tostring': return 'System.Object[]';
      case 'add':
      case 'remove':
      case 'clear':
        throw new PSError(`Exception calling "${name}" with "1" argument(s): "Collection was of a fixed size."`, 'NotSpecified', 'NotSupportedException');
      case 'where': {
        const sb = args[0] as PSScriptBlock;
        return obj.filter((x) => truthy(unwrap(rt.invokeWithItem(sb, x))));
      }
      case 'foreach': {
        const sb = args[0] as PSScriptBlock;
        return obj.flatMap((x) => rt.invokeWithItem(sb, x));
      }
      case 'getenumerator': return obj;
      case 'clone': return [...obj];
    }
    throw notFound(obj, name);
  }
  if (obj instanceof PSScriptBlock) {
    if (l === 'invoke') return unwrap(rt.invokeBlock(obj, args));
    throw notFound(obj, name);
  }
  if (obj instanceof PSObject) {
    if (obj.typeName === 'DateTime') {
      const sec = obj.props.__sec as number;
      switch (l) {
        case 'adddays': return makeDate(sec + (args[0] as number) * 86400);
        case 'addhours': return makeDate(sec + (args[0] as number) * 3600);
        case 'addminutes': return makeDate(sec + (args[0] as number) * 60);
        case 'addseconds': return makeDate(sec + (args[0] as number));
        case 'tostring':
          if (args.length) return s(0) === 'o' ? strftime('%FT%T', sec) + '.0000000Z' : DOTNET_FMT(s(0), sec);
          return fmtDateTime(sec);
      }
      throw notFound(obj, name);
    }
    if (obj.isHash) {
      switch (l) {
        case 'containskey':
        case 'contains': return obj.has(s(0));
        case 'containsvalue': return obj.keys().some((k) => psToString(obj.props[k]) === s(0));
        case 'add':
          if (obj.has(s(0))) throw new PSError(`Exception calling "Add" with "2" argument(s): "Item has already been added. Key in dictionary: '${s(0)}'  Key being added: '${s(0)}'"`, 'NotSpecified', 'ArgumentException');
          obj.props[s(0)] = args[1];
          return null;
        case 'remove': obj.remove(s(0)); return null;
        case 'clear': obj.props = {}; return null;
        case 'tostring': return 'System.Collections.Hashtable';
        case 'clone': return hash({ ...obj.props });
        case 'getenumerator': return obj.keys().map((k) => custom({ Key: k, Name: k, Value: obj.props[k] }));
      }
      throw notFound(obj, name);
    }
    if (obj.typeName === 'Encoding') {
      if (l === 'getbytes') return [...Buffer.from(s(0), 'utf8')];
      if (l === 'getstring') return Buffer.from(toArray(args[0]).map((x) => Number(x))).toString('utf8');
    }
    if (l === 'tostring') return psToString(obj);
    if (l === 'equals') return obj === args[0];
    throw notFound(obj, name);
  }
  throw notFound(obj, name);
}

function unwrap(a: unknown[]): unknown {
  return a.length === 0 ? null : a.length === 1 ? a[0] : a;
}

function escapeSet(s: string): string {
  return s.replace(/[\]\\^-]/g, '\\$&');
}

export function castValue(rt: PsRuntime, type: string, v: unknown): unknown {
  const t = type.toLowerCase().replace(/^system\./, '');
  const intErr = (): PSError => new PSError(`Cannot convert value "${psToString(v)}" to type "System.${t === 'int' ? 'Int32' : t}". Error: "Input string was not in a correct format."`, 'InvalidArgument', 'InvalidCastFromStringToInteger');
  switch (t) {
    case 'int':
    case 'int32':
    case 'int16':
    case 'long':
    case 'int64':
    case 'uint32':
    case 'byte': {
      if (typeof v === 'number') return Math.round(v);
      if (isEnum(v)) return (v as PSObject).props.value__;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === null) return 0;
      const str = psToString(v).trim();
      if (!/^[-+]?\d+(\.\d+)?$/.test(str)) throw intErr();
      return Math.round(Number(str));
    }
    case 'double':
    case 'float':
    case 'single':
    case 'decimal': {
      if (typeof v === 'number') return v;
      const n = Number(psToString(v));
      if (Number.isNaN(n)) throw new PSError(`Cannot convert value "${psToString(v)}" to type "System.Double". Error: "Input string was not in a correct format."`, 'InvalidArgument', 'InvalidCastFromStringToDouble');
      return n;
    }
    case 'string':
      return psToString(v);
    case 'string[]':
      return toArray(v).map(psToString);
    case 'bool':
    case 'boolean':
    case 'switch':
      return truthy(v);
    case 'char':
      return psToString(v)[0] ?? '';
    case 'array':
    case 'object[]':
      return toArray(v);
    case 'hashtable':
    case 'ordered':
      return v;
    case 'pscustomobject':
    case 'psobject':
      return v instanceof PSObject && v.isHash ? custom({ ...v.props }) : v;
    case 'datetime': {
      if (v instanceof PSObject && v.typeName === 'DateTime') return v;
      const d = Date.parse(psToString(v));
      if (Number.isNaN(d)) throw new PSError(`Cannot convert value "${psToString(v)}" to type "System.DateTime". Error: "String was not recognized as a valid DateTime."`, 'InvalidArgument', 'InvalidCastParseTargetInvocationForStringToDateTime');
      return makeDate(Math.floor(d / 1000));
    }
    case 'regex':
    case 'version':
    case 'uri':
      return psToString(v);
    case 'xml':
    case 'scriptblock':
      throw new PSError(`Il tipo [${type}] non è supportato nel laboratorio.`, 'InvalidOperation', 'TypeNotSupported');
  }
  void rt;
  throw new PSError(`Unable to find type [${type}].`, 'InvalidOperation', 'TypeNotFound', type);
}

function bankers(x: number, dec = 0): number {
  const m = Math.pow(10, dec);
  const v = x * m;
  const f = Math.floor(v);
  const diff = v - f;
  let r: number;
  if (Math.abs(diff - 0.5) < 1e-9) r = f % 2 === 0 ? f : f + 1;
  else r = Math.round(v);
  return r / m;
}

let guidCounter = 0;

export function staticMember(rt: PsRuntime, type: string, member: string, args: unknown[] | null): unknown {
  const t = type.toLowerCase().replace(/^system\./, '').replace(/^io\./, 'io.');
  const m = member.toLowerCase();
  const a = args ?? [];
  const n = (i: number): number => Number(a[i]);
  const s = (i: number): string => psToString(a[i]);
  switch (t) {
    case 'math':
      switch (m) {
        case 'pi': return Math.PI;
        case 'e': return Math.E;
        case 'abs': return Math.abs(n(0));
        case 'floor': return Math.floor(n(0));
        case 'ceiling': return Math.ceil(n(0));
        case 'round': return bankers(n(0), a.length > 1 ? n(1) : 0);
        case 'truncate': return Math.trunc(n(0));
        case 'max': return Math.max(n(0), n(1));
        case 'min': return Math.min(n(0), n(1));
        case 'pow': return Math.pow(n(0), n(1));
        case 'sqrt': return Math.sqrt(n(0));
        case 'sign': return Math.sign(n(0));
        case 'log': return Math.log(n(0));
        case 'exp': return Math.exp(n(0));
      }
      break;
    case 'string':
      switch (m) {
        case 'isnullorempty': return a[0] === null || a[0] === undefined || a[0] === '';
        case 'isnullorwhitespace': return a[0] === null || a[0] === undefined || psToString(a[0]).trim() === '';
        case 'join': return toArray(a.length === 2 ? a[1] : a.slice(1)).map(psToString).join(s(0));
        case 'concat': return a.map(psToString).join('');
        case 'format': return psToString(a[0]).replace(/\{(\d+)\}/g, (_, i: string) => psToString(a[parseInt(i, 10) + 1]));
        case 'empty': return '';
      }
      break;
    case 'int':
    case 'int32':
      if (m === 'parse') {
        const v = s(0).trim();
        if (!/^[-+]?\d+$/.test(v)) throw new PSError(`Exception calling "Parse" with "1" argument(s): "Input string was not in a correct format."`, 'NotSpecified', 'FormatException');
        return parseInt(v, 10);
      }
      if (m === 'maxvalue') return 2147483647;
      if (m === 'minvalue') return -2147483648;
      break;
    case 'datetime':
      if (m === 'now' || m === 'utcnow') return makeDate(rt.state.clock);
      if (m === 'today') return makeDate(Math.floor(rt.state.clock / 86400) * 86400);
      if (m === 'parse') return castValue(rt, 'datetime', a[0]);
      break;
    case 'environment':
      if (m === 'currentdirectory') return rt.cwd;
      if (m === 'newline') return '\n';
      if (m === 'machinename') return 'LAB';
      if (m === 'username') return 'learner';
      if (m === 'getenvironmentvariable') return rt.env(s(0)) ?? null;
      break;
    case 'io.path':
    case 'path':
      switch (m) {
        case 'combine': return a.map(psToString).reduce((x, y) => (y.startsWith('/') ? y : x.replace(/\/$/, '') + '/' + y));
        case 'getfilename': return s(0).split(/[\\/]/).pop() ?? '';
        case 'getdirectoryname': return s(0).replace(/[\\/][^\\/]*$/, '') || '/';
        case 'getextension': {
          const f = s(0).split(/[\\/]/).pop() ?? '';
          return f.includes('.') ? '.' + f.split('.').pop() : '';
        }
        case 'getfilenamewithoutextension': return (s(0).split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');
        case 'getfullpath': return rt.rp(s(0));
      }
      break;
    case 'io.file':
    case 'file':
      try {
        switch (m) {
          case 'exists': return rt.vfs.isFile(rt.rp(s(0)));
          case 'readalltext': return rt.vfs.readFile(rt.rp(s(0)));
          case 'readalllines': return rt.vfs.readFile(rt.rp(s(0))).split('\n').filter((x, i, arr) => !(i === arr.length - 1 && x === ''));
          case 'writealltext': rt.vfs.writeFile(rt.rp(s(0)), s(1)); return null;
          case 'appendalltext': rt.vfs.writeFile(rt.rp(s(0)), s(1), true); return null;
          case 'writealllines': rt.vfs.writeFile(rt.rp(s(0)), toArray(a[1]).map(psToString).join('\n') + '\n'); return null;
        }
      } catch (e) {
        if (e instanceof FsError) throw new PSError(`Exception calling "${member}" with "1" argument(s): "Could not find file '${rt.rp(s(0))}'."`, 'NotSpecified', 'FileNotFoundException');
        throw e;
      }
      break;
    case 'io.directory':
    case 'directory':
      if (m === 'exists') return rt.vfs.isDir(rt.rp(s(0)));
      if (m === 'createdirectory') {
        rt.vfs.mkdir(rt.rp(s(0)), true);
        return null;
      }
      if (m === 'getcurrentdirectory') return rt.cwd;
      break;
    case 'convert':
      if (m === 'toint32') return castValue(rt, 'int', a[0]);
      if (m === 'tostring') return psToString(a[0]);
      if (m === 'tobase64string') return Buffer.from(toArray(a[0]).map((x) => Number(x))).toString('base64');
      if (m === 'frombase64string') return [...Buffer.from(s(0), 'base64')];
      break;
    case 'text.encoding':
      if (m === 'utf8' || m === 'ascii') return new PSObject('Encoding', {});
      break;
    case 'regex':
      switch (m) {
        case 'escape': return s(0).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        case 'ismatch': return new RegExp(s(1), 'i').test(s(0));
        case 'replace': return s(0).replace(new RegExp(s(1), 'gi'), s(2));
      }
      break;
    case 'guid':
      if (m === 'newguid') {
        guidCounter++;
        return `00000000-0000-4000-8000-${String(guidCounter + rt.state.clock).padStart(12, '0')}`;
      }
      break;
    case 'console':
      if (m === 'writeline') {
        rt.io.out(s(0) + '\n');
        return null;
      }
      break;
    case 'net.httpstatuscode':
      if (m === 'notfound') return enumValue('NotFound', 404);
      break;
  }
  throw new PSError(`Unable to find type or member [${type}]::${member}.`, 'InvalidOperation', 'TypeNotFound', type);
}

export function encodingStatic(): PSObject {
  return custom({});
}
