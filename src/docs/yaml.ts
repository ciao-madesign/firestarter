/**
 * Parser YAML minimo per esercitarsi con OpenAPI scritto a mano.
 * Supportato: mappe e liste a blocchi (indentazione con spazi), valori scalari (testo, numeri, true/false/null),
 * testo tra apici, liste e mappe "flow" su una riga ([a, b], {type: string}), commenti con #.
 * NON supportato (errore esplicito): tabulazioni, ancore/alias (&, *), documenti multipli (---), blocchi multilinea (| e >).
 */
export class YamlError extends Error {
  constructor(
    message: string,
    public line: number,
  ) {
    super(`riga ${line}: ${message}`);
  }
}

type Y = string | number | boolean | null | Y[] | { [k: string]: Y };
interface L {
  n: number;
  indent: number;
  text: string;
}

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function scalar(raw: string, n: number): Y {
  const t = raw.trim();
  if (t === '') return null;
  if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) || (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
    return t[0] === '"' ? t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n') : t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('"') || t.startsWith("'")) throw new YamlError('virgolette non chiuse', n);
  if (t.startsWith('[') || t.startsWith('{')) return flow(t, n);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  if (/^(null|~)$/i.test(t)) return null;
  if (/^[-+]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[-+]?\d*\.\d+$/.test(t)) return parseFloat(t);
  if (t.startsWith('&') || t.startsWith('*')) throw new YamlError('ancore e alias non sono supportati nel laboratorio', n);
  if (t === '|' || t === '>' || /^[|>][-+]?$/.test(t)) throw new YamlError('i blocchi multilinea (| e >) non sono supportati nel laboratorio: usa una riga tra virgolette', n);
  return t;
}

function flow(t: string, n: number): Y {
  let i = 0;
  const ws = (): void => {
    while (i < t.length && /\s/.test(t[i])) i++;
  };
  const val = (): Y => {
    ws();
    if (t[i] === '[') {
      i++;
      const arr: Y[] = [];
      ws();
      while (t[i] !== ']') {
        if (i >= t.length) throw new YamlError("manca ']'", n);
        arr.push(val());
        ws();
        if (t[i] === ',') i++;
        ws();
      }
      i++;
      return arr;
    }
    if (t[i] === '{') {
      i++;
      const obj: { [k: string]: Y } = {};
      ws();
      while (t[i] !== '}') {
        if (i >= t.length) throw new YamlError("manca '}'", n);
        const key = token(':');
        ws();
        if (t[i] !== ':') throw new YamlError("atteso ':' in una mappa su una riga", n);
        i++;
        obj[String(scalar(key, n))] = val();
        ws();
        if (t[i] === ',') i++;
        ws();
      }
      i++;
      return obj;
    }
    return scalar(token(',]}'), n);
  };
  const token = (stop: string): string => {
    ws();
    if (t[i] === '"' || t[i] === "'") {
      const q = t[i];
      let j = i + 1;
      while (j < t.length && t[j] !== q) j++;
      const s = t.slice(i, j + 1);
      i = j + 1;
      return s;
    }
    let j = i;
    while (j < t.length && !stop.includes(t[j])) j++;
    const s = t.slice(i, j).trim();
    i = j;
    return s;
  };
  const v = val();
  ws();
  if (i < t.length) throw new YamlError(`testo inatteso dopo il valore: ${t.slice(i)}`, n);
  return v;
}

/** separa "chiave: valore" (la chiave può essere tra apici o contenere / e {}). Ritorna null se non è una coppia. */
function splitKey(text: string): { key: string; rest: string } | null {
  let q: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ':' && (i === text.length - 1 || text[i + 1] === ' ')) {
      const k = text.slice(0, i).trim();
      return { key: k.startsWith('"') || k.startsWith("'") ? String(scalar(k, 0)) : k, rest: text.slice(i + 1).trim() };
    }
  }
  return null;
}

export function parseYaml(src: string): Y {
  const lines: L[] = [];
  src.split('\n').forEach((raw, idx) => {
    const n = idx + 1;
    if (/^\t/.test(raw) || /^ *\t/.test(raw)) throw new YamlError('le tabulazioni non sono ammesse: usa spazi', n);
    if (raw.trim() === '---' && lines.length) throw new YamlError('documenti multipli (---) non supportati', n);
    const t = stripComment(raw).replace(/\s+$/, '');
    if (t.trim() === '' || t.trim() === '---') return;
    lines.push({ n, indent: t.length - t.trimStart().length, text: t.trimStart() });
  });
  if (!lines.length) return null;
  let pos = 0;

  const block = (indent: number): Y => {
    const first = lines[pos];
    if (first.indent !== indent) throw new YamlError(`indentazione inattesa (${first.indent} spazi invece di ${indent})`, first.n);
    if (first.text.startsWith('- ') || first.text === '-') return list(indent);
    return map(indent);
  };

  const valueAfter = (rest: string, n: number, parentIndent: number): Y => {
    if (rest !== '') return scalar(rest, n);
    const next = lines[pos];
    if (next && next.indent > parentIndent) return block(next.indent);
    if (next && next.indent === parentIndent && next.text.startsWith('- ')) return list(parentIndent); // lista allo stesso livello della chiave
    return null;
  };

  const map = (indent: number): Y => {
    const obj: { [k: string]: Y } = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith('- ')) {
      const l = lines[pos];
      const kv = splitKey(l.text);
      if (!kv) throw new YamlError(`atteso "chiave: valore" ma trovato: ${l.text}`, l.n);
      if (kv.key in obj) throw new YamlError(`chiave duplicata: ${kv.key}`, l.n);
      pos++;
      obj[kv.key] = valueAfter(kv.rest, l.n, indent);
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError('indentazione inattesa', lines[pos].n);
    return obj;
  };

  const list = (indent: number): Y => {
    const arr: Y[] = [];
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text.startsWith('- ') || lines[pos].text === '-')) {
      const l = lines[pos];
      const body = l.text === '-' ? '' : l.text.slice(2).trimStart();
      pos++;
      if (body === '') {
        const next = lines[pos];
        arr.push(next && next.indent > indent ? block(next.indent) : null);
      } else if (splitKey(body) && !body.startsWith('{') && !body.startsWith('[') && !/^["'].*["']$/.test(body)) {
        // elemento che è una mappa: la prima coppia è sulla stessa riga del trattino
        const childIndent = indent + (l.text.length - body.length);
        lines.splice(pos, 0, { n: l.n, indent: childIndent, text: body });
        arr.push(map(childIndent));
      } else arr.push(scalar(body, l.n));
    }
    return arr;
  };

  const result = block(lines[0].indent);
  if (pos < lines.length) throw new YamlError('contenuto inatteso (indentazione incoerente)', lines[pos].n);
  return result;
}
