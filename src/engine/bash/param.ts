/** Operazioni di stringa per le sostituzioni di parametro Bash (${v%pat}, ${v/a/b}, ${v:1:3}, ${v^^}, ...). */

/** Converte un pattern di shell (`*`, `?`, `[...]`, `\x`) in un'espressione regolare ancorata. */
export function patternRegExp(pattern: string): RegExp {
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      src += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (c === '*') src += '[\\s\\S]*';
    else if (c === '?') src += '[\\s\\S]';
    else if (c === '[') {
      const j = pattern.indexOf(']', i + 2);
      if (j > i) {
        let cls = pattern.slice(i + 1, j).replace(/^!/, '^').replace(/\\/g, '\\\\').replace(/\[(?!:)/g, '\\[');
        cls = cls.replace(/\[:alpha:\]/g, 'A-Za-z').replace(/\[:digit:\]/g, '0-9').replace(/\[:alnum:\]/g, 'A-Za-z0-9').replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:space:\]/g, '\\s');
        src += '[' + cls + ']';
        i = j;
      } else src += '\\[';
    } else src += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  try {
    return new RegExp('^(?:' + src + ')$');
  } catch {
    return new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  }
}

/** ${v#pat} (shortest) e ${v##pat} (longest) */
export function trimPrefix(s: string, pattern: string, longest: boolean): string {
  const re = patternRegExp(pattern);
  if (longest) {
    for (let i = s.length; i >= 0; i--) if (re.test(s.slice(0, i))) return s.slice(i);
  } else {
    for (let i = 0; i <= s.length; i++) if (re.test(s.slice(0, i))) return s.slice(i);
  }
  return s;
}

/** ${v%pat} (shortest) e ${v%%pat} (longest) */
export function trimSuffix(s: string, pattern: string, longest: boolean): string {
  const re = patternRegExp(pattern);
  if (longest) {
    for (let i = 0; i <= s.length; i++) if (re.test(s.slice(i))) return s.slice(0, i);
  } else {
    for (let i = s.length; i >= 0; i--) if (re.test(s.slice(i))) return s.slice(0, i);
  }
  return s;
}

/** ${v/pat/rep}, ${v//pat/rep}, ${v/#pat/rep}, ${v/%pat/rep} */
export function replacePattern(s: string, pattern: string, rep: string, mode: '/' | '//' | '/#' | '/%'): string {
  if (pattern === '') return s;
  const re = patternRegExp(pattern);
  if (mode === '/#') {
    for (let e = s.length; e > 0; e--) if (re.test(s.slice(0, e))) return rep + s.slice(e);
    return s;
  }
  if (mode === '/%') {
    for (let b = 0; b < s.length; b++) if (re.test(s.slice(b))) return s.slice(0, b) + rep;
    return s;
  }
  let out = '';
  let i = 0;
  while (i < s.length) {
    let hit = -1;
    for (let e = s.length; e > i; e--) {
      if (re.test(s.slice(i, e))) {
        hit = e;
        break;
      }
    }
    if (hit < 0) {
      out += s[i++];
      continue;
    }
    out += rep;
    i = hit;
    if (mode === '/') return out + s.slice(i);
  }
  return out;
}

/** ${v^^} ${v^} ${v,,} ${v,} */
export function caseModify(s: string, op: string): string {
  switch (op) {
    case '^^': return s.toUpperCase();
    case '^': return s.slice(0, 1).toUpperCase() + s.slice(1);
    case ',,': return s.toLowerCase();
    default: return s.slice(0, 1).toLowerCase() + s.slice(1);
  }
}

/** ${v:off:len}: offset negativo dalla fine, lunghezza negativa = posizione finale dalla fine. */
export function substring(s: string, off: number, len?: number): string {
  const n = s.length;
  let start = off < 0 ? Math.max(0, n + off) : Math.min(off, n);
  if (off < 0 && n + off < 0) return '';
  let end = len === undefined ? n : len < 0 ? n + len : start + len;
  end = Math.min(Math.max(end, start), n);
  if (start > n) start = n;
  return s.slice(start, end);
}

/** Come substring, ma su un elenco (array, parametri posizionali). */
export function sliceList<T>(items: T[], off: number, len?: number): T[] {
  const n = items.length;
  const start = off < 0 ? Math.max(0, n + off) : Math.min(off, n);
  const end = len === undefined ? n : len < 0 ? n + len : start + len;
  return items.slice(start, Math.min(Math.max(end, start), n));
}
