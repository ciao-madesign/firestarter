/**
 * Audit "informazioni sufficienti": per ogni lezione e shell cerca i costrutti usati dalla soluzione (o dalla riferimento)
 * che non sono mai comparsi nel materiale didattico (spiegazione, passi guidati, previsioni, test negativo, esempio, indizi)
 * né della lezione né delle lezioni precedenti. Il risultato è un elenco di lacune da colmare, non una verifica definitiva.
 */
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import type { Lesson } from '../src/curriculum/types.ts';
import type { ShellId } from '../src/engine/types.ts';
import { toolsFor } from '../src/curriculum/glossary.ts';

function teaching(l: Lesson, sh: ShellId): string {
  // solo testo che SPIEGA (non i comandi nudi): un comando mostrato senza spiegazione non insegna il costrutto
  const parts: string[] = [...l.explain, ...l.hints, l.example.text, l.negative.prompt, l.negative.explain];
  for (const t of toolsFor(l.id, sh)) parts.push(t.name, t.text);
  for (const g of l.guided) if (g.cmd[sh]) parts.push(g.title, g.what, g.who, ...g.parts, g.expect);
  for (const p of l.predict) if (p.cmd[sh]) parts.push(p.prompt, p.expect, p.why);
  return parts.join('\n');
}

export function tokensOf(line: string, sh: ShellId): string[] {
  return tokens(line, sh);
}

function tokens(line: string, sh: ShellId): string[] {
  const out = new Set<string>();
  if (sh === 'pwsh' && /@'|@"/.test(line)) out.add('here-string');
  if (sh === 'bash' && /<<-?\s*'?\w+'?/.test(line)) out.add('heredoc');
  const body = line.replace(/<<'?EOF'?[\s\S]*$/m, '').replace(/@'[\s\S]*$/m, '');
  if (sh === 'bash') {
    for (const seg of body.split(/\|\||&&|[|;]|\n/)) {
      const w = seg.trim().replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, '').split(/\s+/);
      const cmd = w[0];
      if (cmd && /^[a-z][a-z0-9._-]*$/.test(cmd) && cmd !== 'mostra') {
        out.add(cmd);
        if (cmd !== 'export' && cmd !== 'do' && cmd !== 'done') for (const x of w.slice(1)) if (/^-[A-Za-z]+$/.test(x)) out.add(`${cmd} ${x}`);
      }
    }
    if (/--max-time|\s-m\s+\d/.test(body)) out.add('curl --max-time');
    for (const [re, name] of [[/\$\(/, '$( )'], [/>>/, '>>'], [/2>&1/, '2>&1'], [/<<-?\s*'?\w+'?/, 'heredoc'], [/\bfor\b/, 'for'], [/\bwhile\b/, 'while'], [/\bif\b/, 'if'], [/\[\[/, '[[ ]]'], [/\$\(\(/, '$(( ))'], [/\bfunction\b|\w+\(\)\s*\{/, 'funzioni'], [/\$\{/, '${ }'], [/\$\?/, '$?'], [/\b\d+\.\.\d+\b/, '1..N'], [/`/, 'backtick']] as [RegExp, string][]) if (re.test(body)) out.add(name);
  } else {
    for (const m of body.matchAll(/\b([A-Z][A-Za-z]+-[A-Z][A-Za-z]+)\b/g)) out.add(m[1]);
    for (const m of body.matchAll(/(?:^|\s)(-[A-Za-z]{2,})\b/g)) if (!/^-(eq|ne|gt|ge|lt|le|and|or|not|like|match|split|join|replace|contains|in|is|f)$/i.test(m[1])) out.add(m[1]);
    for (const [re, name] of [[/\s-split\s/i, '-split'], [/\s-(match|notmatch)\s/i, '-match'], [/\s-(like|notlike)\s/i, '-like'], [/\s-(eq|ne|gt|ge|lt|le)\s/i, 'confronti'], [/\s-join\s/i, '-join'], [/\s-replace\s/i, '-replace']] as [RegExp, string][]) if (re.test(body)) out.add(name);
    for (const [re, name] of [[/\$_\.\w+/, '$_.Proprietà'], [/\$_/, '$_'], [/\)\.[A-Za-z]+/, '( ).Proprietà'], [/(^|\s)\.\/[\w.-]+\.ps1/, './script.ps1'], [/\$\?/, '$?'], [/@\{/, '@{ }'], [/\[[A-Za-z.]+\]::/, '[Tipo]::'], [/\$env:/i, '$env:'], [/\bforeach\s*\(/i, 'foreach'], [/\bfor\s*\(/i, 'for'], [/\bexit\b/i, 'exit'], [/\[int\]/i, '[int]'], [/\$\w+\+\+/, '++'], [/(^|[\s;{])if\s*\(/i, 'if'], [/\bwhile\s*\(/i, 'while'], [/\btry\b/i, 'try/catch'], [/\bfunction\b/i, 'function'], [/\$\(/, '$( )'], [/\|\s*%|\bForEach-Object\b/, 'ForEach-Object'], [/\|\s*\?|\bWhere-Object\b/, 'Where-Object'], [/@'|@"/, 'here-string'], [/\$LASTEXITCODE/, '$LASTEXITCODE']] as [RegExp, string][]) if (re.test(body)) out.add(name);
  }
  return [...out];
}

const STRICT = process.argv.includes('--strict');
const MAIN = import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('audit-info.ts');
if (MAIN) {
const BASIC = new Set(['cd', 'ls', 'pwd', 'echo', 'cat', 'Get-Content', 'Set-Location', 'Get-ChildItem', 'if', 'for', 'while']);
const gaps: string[] = [];
for (const sh of ['bash', 'pwsh'] as ShellId[]) {
  const taught = new Set<string>();
  const taughtText: string[] = [];
  for (const l of LESSONS) {
    if (!l.shells.includes(sh)) continue;
    taughtText.push(teaching(l, sh));
    const all = STRICT ? teaching(l, sh) : taughtText.join('\n');
    const sol = [...(l.solutions?.[sh] ?? l.reference?.[sh] ?? [])];
    const missing = new Set<string>();
    for (const line of sol) for (const t of tokens(line, sh)) {
      const probe = t.includes(' ') && !t.startsWith('$') ? t.split(' ')[1] : t;
      if (!STRICT && taught.has(t)) continue;
      if (STRICT && BASIC.has(t)) continue;
      const esc = probe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const found = sh === 'pwsh' && /^[A-Z]/.test(t) ? new RegExp(esc, 'i').test(all) : new RegExp((/^[A-Za-z]/.test(probe) ? '(?<![A-Za-z0-9_-])' : '') + esc + '(?![A-Za-z0-9_])', t.startsWith('-') || t.includes(' ') ? '' : '').test(all);
      if (found) taught.add(t);
      else missing.add(t);
    }
    for (const t of missing) taught.add(t); // si segnala una sola volta, alla prima lezione che lo usa
    if (missing.size) gaps.push(`${l.id} [${sh}] ${[...missing].join(', ')}`);
  }
}
console.log(gaps.length ? gaps.join('\n') : 'Nessuna lacuna rilevata.');
console.log(`\nLacune: ${gaps.length} (lezione/shell)`);
}
