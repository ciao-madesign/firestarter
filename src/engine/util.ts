import { CLOCK_START } from './api/server.ts';

export interface OptSpec {
  /** lettere di flag senza valore */
  flags: string;
  /** lettere di opzioni con valore (es. "n" per -n 5) */
  values?: string;
  /** opzioni lunghe senza valore */
  longFlags?: string[];
  /** opzioni lunghe con valore */
  longValues?: string[];
  /** consente forme numeriche tipo -5 */
  numeric?: boolean;
  /** alias lunghe -> breve */
  alias?: Record<string, string>;
}

export interface ParsedOpts {
  flags: Set<string>;
  values: Record<string, string[]>;
  rest: string[];
  error?: string;
  numeric?: number;
}

/** getopt semplificato: opzioni combinabili, valori attaccati o separati, `--` come terminatore. */
export function getopt(args: string[], spec: OptSpec): ParsedOpts {
  const out: ParsedOpts = { flags: new Set(), values: {}, rest: [] };
  const vals = spec.values ?? '';
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      out.rest.push(...args.slice(i + 1));
      return out;
    }
    if (a.startsWith('--') && a.length > 2) {
      const [name, v] = a.slice(2).split(/=(.*)/s);
      const short = spec.alias?.[name];
      if (short) {
        if (vals.includes(short)) {
          const val = v ?? args[++i];
          if (val === undefined) return { ...out, error: `l'opzione '--${name}' richiede un argomento` };
          (out.values[short] ??= []).push(val);
        } else out.flags.add(short);
        continue;
      }
      if (spec.longFlags?.includes(name)) {
        out.flags.add(name);
        continue;
      }
      if (spec.longValues?.includes(name)) {
        const val = v ?? args[++i];
        if (val === undefined) return { ...out, error: `l'opzione '--${name}' richiede un argomento` };
        (out.values[name] ??= []).push(val);
        continue;
      }
      return { ...out, error: `opzione non riconosciuta '--${name}'` };
    }
    if (spec.numeric && /^-\d+$/.test(a)) {
      out.numeric = parseInt(a.slice(1), 10);
      continue;
    }
    if (a.length > 1 && a[0] === '-') {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (vals.includes(c)) {
          const val = j + 1 < a.length ? a.slice(j + 1) : args[++i];
          if (val === undefined) return { ...out, error: `l'opzione richiede un argomento -- '${c}'` };
          (out.values[c] ??= []).push(val);
          break;
        }
        if (spec.flags.includes(c)) out.flags.add(c);
        else return { ...out, error: `opzione non valida -- '${c}'` };
      }
      continue;
    }
    out.rest.push(a);
  }
  return out;
}

/** Orologio simulato -> Date */
export function simDate(sec: number): Date {
  return new Date(sec * 1000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function lsDate(sec: number): string {
  const d = simDate(sec);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function strftime(fmt: string, sec: number): string {
  const d = simDate(sec);
  return fmt.replace(/%([YmdHMSyjaAbBeFTZsz%])/g, (_, c: string) => {
    switch (c) {
      case 'Y': return String(d.getUTCFullYear());
      case 'y': return pad(d.getUTCFullYear() % 100);
      case 'm': return pad(d.getUTCMonth() + 1);
      case 'd': return pad(d.getUTCDate());
      case 'e': return String(d.getUTCDate()).padStart(2);
      case 'H': return pad(d.getUTCHours());
      case 'M': return pad(d.getUTCMinutes());
      case 'S': return pad(d.getUTCSeconds());
      case 'F': return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      case 'T': return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      case 'a': return DAYS[d.getUTCDay()];
      case 'A': return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
      case 'b': return MONTHS[d.getUTCMonth()];
      case 'B': return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
      case 'j': return pad(Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000), 3);
      case 'Z': return 'UTC';
      case 'z': return '+0000';
      case 's': return String(sec);
      default: return '%';
    }
  });
}

export function dateDefault(sec: number): string {
  return strftime('%a %b %e %H:%M:%S UTC %Y', sec);
}

export function humanSize(n: number): string {
  if (n < 1024) return String(n);
  const units = ['K', 'M', 'G'];
  let v = n;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + units[u];
}

export function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Disposizione a colonne stile `ls` (ordine per colonna). */
export function columns(names: string[], width = 80): string {
  if (!names.length) return '';
  const longest = Math.max(...names.map((n) => n.length));
  let cols = Math.max(1, Math.floor((width + 2) / (longest + 2)));
  cols = Math.min(cols, names.length);
  // riduce le colonne finché la riga entra nella larghezza
  for (; cols > 1; cols--) {
    const rows = Math.ceil(names.length / cols);
    const widths: number[] = [];
    for (let c = 0; c < cols; c++) {
      const slice = names.slice(c * rows, (c + 1) * rows);
      widths.push(slice.length ? Math.max(...slice.map((s) => s.length)) : 0);
    }
    if (widths.reduce((a, b) => a + b, 0) + 2 * (cols - 1) <= width) break;
  }
  const rows = Math.ceil(names.length / cols);
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    const slice = names.slice(c * rows, (c + 1) * rows);
    widths.push(slice.length ? Math.max(...slice.map((s) => s.length)) : 0);
  }
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const n = names[c * rows + r];
      if (n === undefined) continue;
      line += c === cols - 1 || names[(c + 1) * rows + r] === undefined ? n : n.padEnd(widths[c] + 2);
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n') + '\n';
}

export function modeString(mode: number, isDir: boolean): string {
  const chars = 'rwxrwxrwx';
  let s = isDir ? 'd' : '-';
  for (let i = 0; i < 9; i++) s += mode & (1 << (8 - i)) ? chars[i] : '-';
  return s;
}

/** Converte una regex BRE/ERE di grep in RegExp JS. */
export function grepRegex(pattern: string, opts: { extended: boolean; fixed: boolean; ignoreCase: boolean; word: boolean }): RegExp | null {
  let src: string;
  if (opts.fixed) src = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else if (opts.extended) src = pattern;
  else {
    src = '';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\' && i + 1 < pattern.length) {
        const n = pattern[++i];
        src += '+?|(){}'.includes(n) ? n : '\\' + n;
      } else if ('+?|(){}'.includes(c)) src += '\\' + c;
      else src += c;
    }
  }
  src = src.replace(/\[\[:alpha:\]\]/g, '[A-Za-z]').replace(/\[\[:digit:\]\]/g, '[0-9]').replace(/\[:space:\]/g, '\\s').replace(/\[:alnum:\]/g, 'A-Za-z0-9').replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z');
  if (opts.word) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, opts.ignoreCase ? 'i' : '');
  } catch {
    return null;
  }
}

export function splitLines(s: string): string[] {
  if (s === '') return [];
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function joinLines(lines: string[]): string {
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Differenza per righe (LCS) in formato unificato semplificato. */
export function unifiedDiff(a: string[], b: string[], nameA: string, nameB: string): string {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(' ' + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) lines.push('-' + a[i++]);
    else lines.push('+' + b[j++]);
  }
  while (i < n) lines.push('-' + a[i++]);
  while (j < m) lines.push('+' + b[j++]);
  if (!lines.some((l) => l[0] !== ' ')) return '';
  return `--- ${nameA}\n+++ ${nameB}\n@@ -1,${n} +1,${m} @@\n` + lines.join('\n') + '\n';
}

export { CLOCK_START };
