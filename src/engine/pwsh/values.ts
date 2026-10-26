/** Valori PowerShell, conversioni e formattazione dell'output. */
import type { Block } from './parser.ts';
import { byteLen } from '../util.ts';
import { simDate } from '../util.ts';

export class PSObject {
  constructor(
    public typeName: string,
    public props: Record<string, unknown> = {},
  ) {}
  keys(): string[] {
    return Object.keys(this.props);
  }
  private find(name: string): string | undefined {
    if (name in this.props) return name;
    const l = name.toLowerCase();
    return Object.keys(this.props).find((k) => k.toLowerCase() === l);
  }
  has(name: string): boolean {
    return this.find(name) !== undefined;
  }
  get(name: string): unknown {
    const k = this.find(name);
    return k === undefined ? null : this.props[k];
  }
  set(name: string, v: unknown): void {
    this.props[this.find(name) ?? name] = v;
  }
  remove(name: string): void {
    const k = this.find(name);
    if (k !== undefined) delete this.props[k];
  }
  get isHash(): boolean {
    return this.typeName === 'Hashtable';
  }
}

export class PSScriptBlock {
  constructor(
    public block: Block,
    public src: string,
  ) {}
}

export class PSError extends Error {
  constructor(
    message: string,
    public category = 'NotSpecified',
    public fqid = 'RuntimeException',
    public target: string = '',
    public cmdName = '',
    public data: Record<string, unknown> = {},
    public terminating = true,
  ) {
    super(message);
  }
}

export class PSFormatted {
  constructor(public text: string) {}
}

export const hash = (entries: Record<string, unknown> = {}): PSObject => new PSObject('Hashtable', entries);
export const custom = (entries: Record<string, unknown> = {}): PSObject => new PSObject('PSCustomObject', entries);

export function enumValue(name: string, value: number): PSObject {
  return new PSObject('HttpStatusCode', { __name: name, value__: value });
}

export function isEnum(v: unknown): boolean {
  return v instanceof PSObject && v.typeName === 'HttpStatusCode';
}

export function enumNum(v: unknown): unknown {
  return v instanceof PSObject && v.typeName === 'HttpStatusCode' ? v.props.value__ : v;
}

export function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length === 0 ? false : v.length === 1 ? truthy(v[0]) : true;
  return true;
}

export function toArray(v: unknown): unknown[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

export function typeNameOf(v: unknown): string {
  if (v === null || v === undefined) return '$null';
  if (typeof v === 'string') return 'System.String';
  if (typeof v === 'number') return Number.isInteger(v) ? 'System.Int32' : 'System.Double';
  if (typeof v === 'boolean') return 'System.Boolean';
  if (Array.isArray(v)) return 'System.Object[]';
  if (v instanceof PSObject) {
    if (v.typeName === 'Hashtable') return 'System.Collections.Hashtable';
    if (v.typeName === 'PSCustomObject') return 'System.Management.Automation.PSCustomObject';
    return 'System.' + v.typeName;
  }
  if (v instanceof PSScriptBlock) return 'System.Management.Automation.ScriptBlock';
  return 'System.Object';
}

export function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'NaN' : n > 0 ? 'Infinity' : '-Infinity';
  return String(parseFloat(n.toPrecision(15)));
}

const MONTH_FMT = (d: Date): string => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
export function fmtDateTime(sec: number): string {
  const d = simDate(sec);
  const h = d.getUTCHours();
  return `${MONTH_FMT(d)} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function psToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return fmtNumber(v);
  if (Array.isArray(v)) return v.map(psToString).join(' ');
  if (v instanceof PSScriptBlock) return v.src;
  if (v instanceof PSObject) {
    switch (v.typeName) {
      case 'Hashtable':
        return 'System.Collections.Hashtable';
      case 'PSCustomObject':
        return '@{' + v.keys().map((k) => `${k}=${psToString(v.props[k])}`).join('; ') + '}';
      case 'FileInfo':
      case 'DirectoryInfo':
        return String(v.props.FullName);
      case 'MatchInfo':
        return v.props.Path ? `${v.props.RelPath ?? v.props.Path}:${v.props.LineNumber}:${v.props.Line}` : String(v.props.Line);
      case 'HttpStatusCode':
        return String(v.props.__name);
      case 'Version':
        return [v.props.Major, v.props.Minor, v.props.Build, v.props.Revision].filter((x) => x !== undefined && x !== null).join('.');
      case 'DateTime':
        return fmtDateTime(v.props.__sec as number);
      case 'ErrorRecord':
        return String((v.props.Exception as PSObject).get('Message'));
      case 'PathInfo':
        return String(v.props.Path);
      case 'WebResponseObject':
        return String(v.props.Content);
      default:
        return 'System.' + v.typeName;
    }
  }
  return String(v);
}

export function psEqual(a: unknown, b: unknown, caseSensitive = false): boolean {
  a = enumNum(a);
  b = enumNum(b);
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === 'string') {
    const bs = typeof b === 'string' ? b : psToString(b);
    return caseSensitive ? a === bs : a.toLowerCase() === bs.toLowerCase();
  }
  if (typeof a === 'number') {
    const n = typeof b === 'number' ? b : Number(psToString(b));
    return a === n;
  }
  if (typeof a === 'boolean') return a === truthy(b);
  return a === b;
}

export function psCompare(a: unknown, b: unknown): number {
  a = enumNum(a);
  b = enumNum(b);
  if (typeof a === 'number' && typeof b !== 'number') b = Number(psToString(b));
  else if (typeof a === 'string' && typeof b === 'number') {
    const n = Number(a);
    if (!Number.isNaN(n)) a = n;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = psToString(a).toLowerCase();
  const y = psToString(b).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------- JSON ----------------
export function fromJsonValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromJsonValue);
  if (v && typeof v === 'object') {
    const o = custom();
    for (const [k, val] of Object.entries(v as object)) o.props[k] = fromJsonValue(val);
    return o;
  }
  return v;
}

export function toJsonValue(v: unknown, depth: number, level = 0): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map((x) => toJsonValue(x, depth, level + 1));
  if (isEnum(v)) return (v as PSObject).props.value__;
  if (v instanceof PSObject) {
    if (level >= depth) return psToString(v);
    const o: Record<string, unknown> = {};
    for (const k of v.keys()) if (!k.startsWith('__')) o[k] = toJsonValue(v.props[k], depth, level + 1);
    return o;
  }
  return psToString(v);
}

/** Formattazione di ConvertTo-Json come Windows PowerShell 5.1 (indentazione di 4 spazi, due spazi dopo i due punti). */
export function jsonString(v: unknown, compress: boolean, indent = 0): string {
  const pad = (n: number): string => ' '.repeat(n * 4);
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v).replace(/[<>&']/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (compress) return '[' + v.map((x) => jsonString(x, true)).join(',') + ']';
    return '[\n' + v.map((x) => pad(indent + 1) + jsonString(x, false, indent + 1)).join(',\n') + '\n' + pad(indent) + ']';
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return '{}';
  if (compress) return '{' + entries.map(([k, x]) => `${JSON.stringify(k)}:${jsonString(x, true)}`).join(',') + '}';
  return '{\n' + entries.map(([k, x]) => `${pad(indent + 1)}${JSON.stringify(k)}:  ${jsonString(x, false, indent + 1)}`).join(',\n') + '\n' + pad(indent) + '}';
}

// ---------------- formattazione ----------------
function isNumberish(v: unknown): boolean {
  return typeof v === 'number';
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(cell).join(', ');
  if (v instanceof PSObject && v.typeName === 'PSCustomObject') return psToString(v);
  return psToString(v).replace(/\r?\n/g, ' ');
}

export function formatTable(objs: PSObject[], props: string[]): string {
  const rows = objs.map((o) => props.map((p) => o.get(p)));
  const widths = props.map((p, i) => Math.max(p.length, ...rows.map((r) => cell(r[i]).length)));
  const right = props.map((_, i) => rows.length > 0 && rows.every((r) => r[i] === null || isNumberish(r[i])) && rows.some((r) => isNumberish(r[i])));
  const line = (cells: string[]): string =>
    cells
      .map((c, i) => (right[i] ? c.padStart(widths[i]) : c.padEnd(widths[i])))
      .join(' ')
      .trimEnd();
  const out = [line(props), line(props.map((p, i) => '-'.repeat(p.length).padEnd(0))), ...rows.map((r) => line(r.map(cell)))];
  // la riga dei trattini ha la lunghezza del nome della colonna
  out[1] = props.map((p, i) => (right[i] ? '-'.repeat(p.length).padStart(widths[i]) : '-'.repeat(p.length).padEnd(widths[i]))).join(' ').trimEnd();
  return '\n' + out.join('\n') + '\n\n';
}

export function formatList(objs: PSObject[], props?: string[]): string {
  let out = '';
  for (const o of objs) {
    const keys = props ?? o.keys().filter((k) => !k.startsWith('__'));
    const w = Math.max(0, ...keys.map((k) => k.length));
    out += '\n' + keys.map((k) => `${k.padEnd(w)} : ${cell(o.get(k))}`).join('\n') + '\n';
  }
  return out + '\n';
}

function psDate(sec: number): string {
  const d = simDate(sec);
  const h = d.getUTCHours();
  return `${MONTH_FMT(d)}  ${String(h % 12 === 0 ? 12 : h % 12).padStart(2)}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatFiles(items: PSObject[]): string {
  let out = '';
  const groups = new Map<string, PSObject[]>();
  for (const it of items) {
    const dir = String(it.props.DirectoryName ?? '');
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(it);
  }
  for (const [dir, list] of groups) {
    out += `\n\n    Directory: ${dir}\n\n\n`;
    const lenW = Math.max(6, ...list.map((i) => String(i.props.Length ?? '').length));
    out += `${'Mode'.padEnd(7)} ${'LastWriteTime'.padStart(20)} ${'Length'.padStart(lenW)} Name\n`;
    out += `${'----'.padEnd(7)} ${'-------------'.padStart(20)} ${'------'.padStart(lenW)} ----\n`;
    for (const i of list) {
      const len = i.typeName === 'DirectoryInfo' ? '' : String(i.props.Length);
      out += `${String(i.props.Mode).padEnd(7)} ${psDate(i.props.__sec as number).padStart(20)} ${len.padStart(lenW)} ${i.props.Name}\n`;
    }
  }
  return out + '\n';
}

function formatWeb(o: PSObject): string {
  const c = String(o.props.Content);
  const headers = o.props.Headers as PSObject;
  return (
    '\n' +
    [
      ['StatusCode', o.props.StatusCode],
      ['StatusDescription', o.props.StatusDescription],
      ['Content', c.length > 100 ? c.slice(0, 97) + '...' : c],
      ['RawContent', String(o.props.RawContent).replace(/\r?\n/g, ' ').slice(0, 100) + '...'],
      ['Headers', '{' + headers.keys().map((k) => `[${k}, ${headers.props[k]}]`).join(', ') + '}'],
      ['RawContentLength', o.props.RawContentLength],
    ]
      .map(([k, v]) => `${String(k).padEnd(17)} : ${psToString(v)}`)
      .join('\n') +
    '\n\n'
  );
}

/** Formattazione di default (Out-Default) degli elementi della pipeline. */
export function formatItems(items: unknown[]): string {
  if (!items.length) return '';
  let out = '';
  let i = 0;
  const simpleLine = (v: unknown): string => {
    if (Array.isArray(v)) return v.map(simpleLine).join('\n');
    return psToString(v);
  };
  while (i < items.length) {
    const it = items[i];
    if (it instanceof PSFormatted) {
      out += it.text;
      i++;
      continue;
    }
    if (it instanceof PSObject && !isEnum(it) && it.typeName !== 'DateTime' && it.typeName !== 'ErrorRecord' && it.typeName !== 'MatchInfo') {
      const group: PSObject[] = [];
      while (i < items.length && items[i] instanceof PSObject && (items[i] as PSObject).typeName === it.typeName) group.push(items[i++] as PSObject);
      if (it.typeName === 'FileInfo' || it.typeName === 'DirectoryInfo') {
        // file e cartelle insieme
        const all = [...group];
        while (i < items.length && items[i] instanceof PSObject && ['FileInfo', 'DirectoryInfo'].includes((items[i] as PSObject).typeName)) all.push(items[i++] as PSObject);
        out += formatFiles(all);
      } else if (it.typeName === 'WebResponseObject') out += group.map(formatWeb).join('');
      else if (it.typeName === 'Hashtable') {
        const rows = group.flatMap((g) => g.keys().map((k) => custom({ Name: k, Value: g.props[k] })));
        out += formatTable(rows, ['Name', 'Value']);
      } else {
        const keys = it.keys().filter((k) => !k.startsWith('__'));
        out += keys.length <= 4 && keys.length > 0 ? formatTable(group, keys) : formatList(group);
      }
      continue;
    }
    // mix di tipi semplici
    const text = simpleLine(it);
    out += text + '\n';
    i++;
  }
  return out;
}

export function strLen(s: string): number {
  return byteLen(s);
}
