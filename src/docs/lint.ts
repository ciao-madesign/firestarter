/**
 * Document Engine: controllo tecnico dei documenti Markdown rispetto all'API simulata.
 * Distingue gli errori oggettivamente verificabili ("verifiable") dalle valutazioni editoriali ("editorial").
 */
import type { EnvName, WorkspaceState } from '../engine/types.ts';
import { execute } from '../engine/index.ts';
import { ENDPOINTS, API_VERSION, matchSpecPath, type EndpointSpec } from '../engine/api/spec.ts';
import { CLOCK_START, CREDENTIALS } from '../engine/api/server.ts';

export interface LintIssue {
  id: string;
  kind: 'verifiable' | 'editorial';
  severity: 'error' | 'warning' | 'info';
  line: number;
  message: string;
  hint?: string;
}

export interface ExecutedExample {
  line: number;
  lang: string;
  code: string;
  status: number | null;
  expected: number | null;
  ok: boolean | null;
  note: string;
}

export interface LintResult {
  issues: LintIssue[];
  examples: ExecutedExample[];
  stats: { errors: number; warnings: number; editorial: number; examplesRun: number; examplesOk: number };
}

export interface MdBlock {
  lang: string;
  code: string;
  line: number;
}
export interface MdHeading {
  level: number;
  text: string;
  line: number;
}

export function parseMarkdown(md: string): { headings: MdHeading[]; blocks: MdBlock[]; lines: string[]; inCode: boolean[] } {
  const lines = md.split('\n');
  const headings: MdHeading[] = [];
  const blocks: MdBlock[] = [];
  const inCode: boolean[] = new Array(lines.length).fill(false);
  let cur: MdBlock | null = null;
  lines.forEach((l, i) => {
    const fence = /^\s*```\s*([A-Za-z0-9_+-]*)/.exec(l);
    if (fence) {
      if (cur) {
        blocks.push(cur);
        cur = null;
      } else cur = { lang: fence[1].toLowerCase(), code: '', line: i + 1 };
      inCode[i] = true;
      return;
    }
    if (cur) {
      cur.code += (cur.code ? '\n' : '') + l;
      inCode[i] = true;
      return;
    }
    const h = /^(#{1,6})\s+(.*\S)\s*$/.exec(l);
    if (h) headings.push({ level: h[1].length, text: h[2], line: i + 1 });
  });
  if (cur) blocks.push(cur);
  return { headings, blocks, lines, inCode };
}

export function parseTables(md: string): { header: string[]; rows: string[][]; line: number }[] {
  const lines = md.split('\n');
  const tables: { header: string[]; rows: string[][]; line: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) rows.push(cells(lines[j++]));
      tables.push({ header, rows, line: i + 1 });
      i = j - 1;
    }
  }
  return tables;
}

/** Testo di una sezione: dal titolo indicato fino al prossimo titolo di livello uguale o superiore. */
export function sectionText(md: string, headingLine: number): string {
  const { headings, lines } = parseMarkdown(md);
  const h = headings.find((x) => x.line === headingLine);
  if (!h) return '';
  const next = headings.find((x) => x.line > h.line && x.level <= h.level);
  return lines.slice(h.line, next ? next.line - 1 : lines.length).join('\n');
}

export function headingSections(md: string): { heading: MdHeading; text: string }[] {
  const { headings } = parseMarkdown(md);
  return headings.map((h) => ({ heading: h, text: sectionText(md, h.line) }));
}

const STATUS_RE =
  /(?:status(?:\s+code)?|stato|codice|http|restituisce|risponde|returns?|risposta|responds?)\s*:?\s*[`*]*([1-5]\d\d)\b|^\s*\|\s*[`*]*([1-5]\d\d)[`*]*\s*\||\(([1-5]\d\d)\)|[→>]\s*([1-5]\d\d)\b|\b([1-5]\d\d)\s+(?:OK|Created|No Content|Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Unprocessable Entity|Too Many Requests|Internal Server Error)\b/gi;

export function statusCodesIn(text: string): number[] {
  const out: number[] = [];
  for (const line of text.split('\n')) {
    STATUS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STATUS_RE.exec(line))) out.push(parseInt(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5], 10));
  }
  return out;
}

function clone(state: WorkspaceState): WorkspaceState {
  return JSON.parse(JSON.stringify(state)) as WorkspaceState;
}

const METHOD_PATH = /\b(GET|POST|PUT|PATCH|DELETE)\s+`?(\/[A-Za-z0-9_\-/{}:.]*)(?:\?[^\s`]*)?`?/g;

export function lintDocument(state: WorkspaceState, md: string, opts: { env?: EnvName } = {}): LintResult {
  const issues: LintIssue[] = [];
  const examples: ExecutedExample[] = [];
  const { headings, blocks, lines, inCode } = parseMarkdown(md);
  const add = (i: Omit<LintIssue, 'kind'> & { kind?: LintIssue['kind'] }): void => {
    issues.push({ kind: 'verifiable', ...i });
  };

  // ambiente di riferimento
  const envDecl = /ambiente\s*:\s*`?(development|testing|staging)/i.exec(md);
  const env: EnvName = (envDecl?.[1].toLowerCase() as EnvName) ?? opts.env ?? state.activeEnv;

  // ---- D1: endpoint e metodi
  const documented: { spec: EndpointSpec; line: number; heading: MdHeading | null }[] = [];
  lines.forEach((l, i) => {
    if (inCode[i]) return;
    METHOD_PATH.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = METHOD_PATH.exec(l))) {
      const method = m[1];
      const path = m[2];
      if (!/^\/(v1)?\/?/.test(path) || path === '/') continue;
      const spec = matchSpecPath(method, path);
      if (!spec) {
        const others = ENDPOINTS.filter((e) => matchSpecPath(e.method, path) && e.method !== method).map((e) => e.method);
        const sameShape = ENDPOINTS.filter((e) => e.path.replace(/\{[^}]+\}/g, '{id}') === path.replace(/^\/v1/, '').replace(/:[A-Za-z_]+/g, '{id}'));
        const methods = [...new Set([...others, ...sameShape.map((e) => e.method)])];
        add({
          id: 'endpoint-inesistente',
          severity: 'error',
          line: i + 1,
          message: methods.length ? `${method} ${path} non esiste: per questo percorso l'API prevede ${methods.join(', ')}.` : `${method} ${path} non esiste nell'API.`,
          hint: 'Controlla la specifica: GET /v1/openapi.json',
        });
      } else {
        const heading = [...headings].reverse().find((h) => h.line <= i + 1) ?? null;
        documented.push({ spec, line: i + 1, heading });
      }
    }
  });

  // ---- D2/D3: esempi eseguiti e JSON
  const sandbox = clone(state);
  sandbox.activeEnv = env;
  const cred = CREDENTIALS[env];
  const tag = env === 'development' ? 'dev' : env === 'testing' ? 'test' : 'stg';
  for (const sh of ['bash', 'pwsh'] as const) {
    const e = sandbox.shells[sh].env;
    e.TASKFLOW_URL = { development: 'http://localhost:8080', testing: 'https://test.api.taskflow.test', staging: 'https://staging.api.taskflow.test' }[env];
    e.TASKFLOW_CLIENT_ID = cred.id;
    e.TASKFLOW_CLIENT_SECRET = cred.secret;
    e.TOKEN = `tf_${tag}_bob_${Math.max(sandbox.clock, CLOCK_START) + 3600}`;
    e.TASKFLOW_TOKEN = e.TOKEN;
  }
  let lastVersionHeader: string | null = null;
  for (const b of blocks) {
    if (b.lang === 'json') {
      if (/\.\.\.|<[^>]+>/.test(b.code)) {
        add({ id: 'json-segnaposto', severity: 'info', line: b.line, message: 'Blocco JSON con segnaposto (...): non verificato.' });
      } else {
        try {
          JSON.parse(b.code);
        } catch (e) {
          add({ id: 'json-non-valido', severity: 'error', line: b.line, message: `JSON non valido: ${(e as Error).message}`, hint: 'Controlla virgole, virgolette e parentesi.' });
        }
      }
      continue;
    }
    const isBash = ['bash', 'sh', 'shell', 'console'].includes(b.lang) && /\bcurl\b/.test(b.code);
    const isPs = ['powershell', 'ps1', 'pwsh'].includes(b.lang) && /Invoke-(RestMethod|WebRequest)/.test(b.code);
    if (!isBash && !isPs) continue;
    const exp = /#\s*=>\s*(\d{3})/.exec(b.code);
    const expected = exp ? parseInt(exp[1], 10) : null;
    const before = sandbox.api.log.length;
    const seqBefore = sandbox.api.seq;
    const code = b.code.replace(/#\s*=>.*$/gm, '');
    const res = execute(sandbox, isBash ? 'bash' : 'pwsh', code, { silent: true, tty: false });
    const newEntries = sandbox.api.log.filter((e) => e.seq > seqBefore);
    void before;
    const last = newEntries[newEntries.length - 1];
    const status = last ? last.status : null;
    if (last) {
      const v = sandbox.api.log.length ? last : null;
      void v;
    }
    let note = '';
    let ok: boolean | null = null;
    if (!last) {
      note = `nessuna richiesta eseguita (codice ${res.exit}): ${res.out.filter((o) => o.s === 'err').map((o) => o.t).join('').trim().split('\n')[0] ?? ''}`;
      add({ id: 'esempio-non-eseguibile', severity: 'error', line: b.line, message: `L'esempio non invia alcuna richiesta: ${note}`, hint: 'Prova a eseguirlo nel terminale.' });
      ok = false;
    } else if (expected !== null) {
      ok = status === expected;
      note = `risposta ${status}, documentato ${expected}`;
      if (!ok) add({ id: 'status-non-corrisponde', severity: 'error', line: b.line, message: `L'esempio restituisce ${status}, ma la documentazione dichiara ${expected}.`, hint: 'Aggiorna lo status documentato o correggi l\'esempio.' });
    } else {
      note = `risposta ${status} (nessuno stato atteso dichiarato)`;
      add({ id: 'esempio-senza-atteso', severity: 'info', line: b.line, message: 'Esempio senza stato atteso: aggiungi un commento `# => 201` per renderlo verificabile.' });
    }
    if (last) lastVersionHeader = API_VERSION[last.env];
    examples.push({ line: b.line, lang: b.lang, code: b.code, status, expected, ok, note });
  }

  // ---- D4/D5/D6: sezioni degli endpoint
  const seen = new Set<string>();
  for (const d of documented) {
    const key = `${d.spec.method} ${d.spec.path}`;
    const text = d.heading && d.heading.text.includes(d.spec.path.split('{')[0].replace(/\/$/, '') || d.spec.path) && new RegExp(d.spec.method).test(d.heading.text) ? sectionText(md, d.heading.line) : md;
    const hasHeading = text !== md;
    if (seen.has(key + (hasHeading ? '#' + d.heading!.line : ''))) continue;
    seen.add(key + (hasHeading ? '#' + d.heading!.line : ''));
    const where = hasHeading ? d.heading!.line : d.line;
    const required = (d.spec.body ?? []).filter((f) => f.required && d.spec.method !== 'PATCH');
    for (const f of required) {
      if (!new RegExp(`\\b${f.name}\\b`).test(text)) {
        add({ id: 'campo-obbligatorio-mancante', severity: 'error', line: where, message: `Il campo obbligatorio \`${f.name}\` non è documentato per ${key}.`, hint: 'Descrivi i campi del body e indica quali sono obbligatori.' });
      }
    }
    const codes = [...new Set(statusCodesIn(text.split('\n').filter((_, idx) => true).join('\n')))];
    const allowed = d.spec.responses.map((r) => r.status);
    for (const c of codes) {
      if (!allowed.includes(c)) {
        add({ id: 'status-non-previsto', severity: 'error', line: where, message: `Lo status ${c} non è previsto per ${key} (previsti: ${allowed.join(', ')}).`, hint: 'Confronta con la sezione responses della specifica OpenAPI.' });
      }
    }
    if (hasHeading) {
      const success = allowed.find((s) => s < 300);
      if (success !== undefined && codes.length && !codes.includes(success)) {
        add({ id: 'status-successo-mancante', severity: 'warning', line: where, message: `${key}: non è indicato lo status di successo (${success}).` });
      }
      if (!codes.some((c) => c >= 400) && allowed.some((s) => s >= 400)) {
        add({ id: 'caso-errore-mancante', severity: 'warning', line: where, message: `${key}: manca almeno un caso di errore (es. ${allowed.filter((s) => s >= 400).join(', ')}).` });
      }
      const hasBlock = blocks.some((b) => b.line > d.heading!.line && b.line < d.heading!.line + text.split('\n').length);
      if (!hasBlock) add({ id: 'esempio-mancante', severity: 'warning', line: where, message: `${key}: manca un esempio di codice.` });
    }
  }

  // ---- D7: versione
  const ver = /versione(?:\s+dell'api)?\s*:?\s*\*{0,2}\s*v?(\d+\.\d+(?:\.\d+)?)/i.exec(md);
  if (ver) {
    const line = md.slice(0, ver.index).split('\n').length;
    const actual = API_VERSION[env];
    if (!actual.startsWith(ver[1]) && ver[1] !== actual) {
      add({ id: 'versione-non-coerente', severity: 'error', line, message: `La documentazione indica la versione ${ver[1]}, ma l'ambiente ${env} risponde con la versione ${actual}.`, hint: `Controlla l'header X-API-Version e la struttura delle risposte.` });
    }
  }
  void lastVersionHeader;

  // ---- D8: segreti
  const secrets = [...Object.values(CREDENTIALS).map((c) => c.secret), /tf_(dev|test|stg)_[a-z]+_\d+/.source];
  lines.forEach((l, i) => {
    for (const s of secrets) {
      if (s.includes('(') ? new RegExp(s).test(l) : l.includes(s)) {
        add({ id: 'segreto-in-chiaro', severity: 'error', line: i + 1, message: 'Credenziale o token in chiaro nel documento.', hint: 'Usa variabili d\'ambiente ($TASKFLOW_CLIENT_SECRET, $TOKEN) negli esempi.' });
        break;
      }
    }
  });

  // ---- valutazioni editoriali
  const ed = (id: string, severity: LintIssue['severity'], line: number, message: string, hint?: string): void =>
    add({ id, kind: 'editorial', severity, line, message, hint });
  if (!headings.some((h) => h.level === 1)) ed('titolo-mancante', 'warning', 1, 'Manca un titolo di primo livello (# ...).');
  const lower = md.toLowerCase();
  const terms: [string, RegExp][] = [['task', /\btask\b/g], ['attività', /\battività\b/g], ['compito', /\bcompit[oi]\b/g], ['ticket', /\bticket\b/g]];
  const used = terms.filter(([, re]) => (lower.match(re) ?? []).length > 0).map(([t]) => t);
  if (used.length > 1) ed('terminologia', 'warning', 1, `Terminologia incoerente: usi sia ${used.map((t) => `"${t}"`).join(' sia ')} per lo stesso concetto.`, "Scegli un termine (l'API usa \"task\") e usalo ovunque.");
  lines.forEach((l, i) => {
    if (inCode[i] || /^\s*[|#>-]/.test(l)) return;
    const words = l.trim().split(/\s+/).filter(Boolean).length;
    if (words > 45) ed('frase-lunga', 'info', i + 1, `Paragrafo di ${words} parole: valuta di dividerlo.`);
  });
  if (documented.length && !/autenticazion|authorization|bearer|token/i.test(md)) ed('autenticazione-assente', 'warning', 1, "Non si accenna all'autenticazione (Bearer token).", 'Indica come ottenere e inviare il token.');

  const errors = issues.filter((i) => i.kind === 'verifiable' && i.severity === 'error').length;
  const warnings = issues.filter((i) => i.kind === 'verifiable' && i.severity === 'warning').length;
  const editorial = issues.filter((i) => i.kind === 'editorial').length;
  return {
    issues: issues.sort((a, b) => a.line - b.line),
    examples,
    stats: { errors, warnings, editorial, examplesRun: examples.length, examplesOk: examples.filter((e) => e.ok).length },
  };
}
