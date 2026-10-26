/**
 * Git in sola lettura sul repository d'esempio (src/engine/git-fixture.ts): status, log, show, diff, blame, branch.
 * Nessun comando di scrittura (add, commit, push, checkout...): per quelli serve il tutor in terminale.
 */
import { DEMO_COMMITS, DEMO_HEAD, snapshotAt, type DemoCommit } from '../git-fixture.ts';
import { dirname, resolvePath } from '../vfs.ts';
import { splitLines } from '../util.ts';
import type { BashRuntime, Io } from './interp.ts';

function repoRoot(rt: BashRuntime): string | null {
  let d = rt.cwd;
  for (;;) {
    if (rt.vfs.isDir(d + '/.git') || rt.vfs.isDir(resolvePath('.git', d))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function gitDate(at: number): string {
  const d = new Date(at * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`;
}
const isoDate = (at: number): string => new Date(at * 1000).toISOString().slice(0, 10);

/** Risolve HEAD, HEAD~N, main, hash (anche abbreviato). Ritorna l'indice del commit o null. */
function resolveRev(rev: string): number | null {
  const last = DEMO_COMMITS.length - 1;
  const m = /^(HEAD|main)(?:~(\d+)|\^)?$/.exec(rev);
  if (m) {
    const back = rev.endsWith('^') ? 1 : m[2] ? parseInt(m[2], 10) : 0;
    return last - back >= 0 ? last - back : null;
  }
  if (/^[0-9a-f]{4,40}$/i.test(rev)) {
    const hits = DEMO_COMMITS.map((c, i) => [c, i] as const).filter(([c]) => c.hash.startsWith(rev.toLowerCase()));
    return hits.length === 1 ? hits[0][1] : null;
  }
  return null;
}

function changedFiles(i: number): string[] {
  return Object.keys(DEMO_COMMITS[i].files);
}

function diffBlock(path: string, before: string | undefined, after: string | undefined): string {
  const a = before === undefined ? [] : splitLines(before);
  const b = after === undefined ? [] : splitLines(after);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      lines.push(' ' + a[i]);
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) lines.push('-' + a[i++]);
    else lines.push('+' + b[j++]);
  }
  // hunk con 3 righe di contesto
  const idx = lines.map((l, k) => (l[0] !== ' ' ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return '';
  const hunks: [number, number][] = [];
  for (const k of idx) {
    const s = Math.max(0, k - 3);
    const e = Math.min(lines.length - 1, k + 3);
    if (hunks.length && s <= hunks[hunks.length - 1][1] + 1) hunks[hunks.length - 1][1] = e;
    else hunks.push([s, e]);
  }
  let out = `diff --git a/${path} b/${path}\n${before === undefined ? 'new file mode 100644\n' : ''}--- ${before === undefined ? '/dev/null' : 'a/' + path}\n+++ b/${path}\n`;
  for (const [s, e] of hunks) {
    const seg = lines.slice(s, e + 1);
    const oldStart = lines.slice(0, s).filter((l) => l[0] !== '+').length + 1;
    const newStart = lines.slice(0, s).filter((l) => l[0] !== '-').length + 1;
    const oldLen = seg.filter((l) => l[0] !== '+').length;
    const newLen = seg.filter((l) => l[0] !== '-').length;
    out += `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@\n${seg.join('\n')}\n`;
  }
  return out;
}

function commitHeader(i: number, deco = false): string {
  const c: DemoCommit = DEMO_COMMITS[i];
  const tag = deco && i === DEMO_COMMITS.length - 1 ? ' (HEAD -> main)' : '';
  return `commit ${c.hash}${tag}\nAuthor: ${c.author} <${c.email}>\nDate:   ${gitDate(c.at)}\n\n    ${c.message}\n`;
}

function relPath(rt: BashRuntime, root: string, p: string): string {
  const abs = rt.resolve(p);
  return abs.startsWith(root + '/') ? abs.slice(root.length + 1) : p;
}

export function git(args: string[], io: Io, rt: BashRuntime): number {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === 'help') {
    io.out('usage: git <comando> [opzioni]\n\nNel laboratorio sono disponibili in sola lettura: status, log, show, diff, blame, branch.\nGli altri comandi (add, commit, push, checkout...) modificano il repository: usa il tutor in terminale.\n');
    return sub ? 0 : 1;
  }
  if (sub === '--version') {
    io.out('git version 2.43.0\n');
    return 0;
  }
  if (!['status', 'log', 'show', 'diff', 'blame', 'branch'].includes(sub)) {
    io.err(`git: '${sub}' non è disponibile nel laboratorio (sola lettura: status, log, show, diff, blame, branch). I comandi che modificano il repository si usano nel tutor in terminale.\n`);
    return 1;
  }
  const root = repoRoot(rt);
  if (!root) {
    io.err('fatal: not a git repository (or any of the parent directories): .git\n');
    return 128;
  }
  const rest = args.slice(1);
  const dd = rest.indexOf('--');
  const opts = dd >= 0 ? rest.slice(0, dd) : rest;
  const pathArgs = dd >= 0 ? rest.slice(dd + 1) : [];
  const flags = opts.filter((a) => a.startsWith('-'));
  const pos = opts.filter((a) => !a.startsWith('-'));
  const bad = flags.find((f) => !/^(--oneline|-n\d*|-\d+|--author=.*|--stat|--name-only|-L\d*.*|-L)$/.test(f));
  if (bad && !/^-n$|^-L$/.test(bad)) {
    io.err(`git ${sub}: l'opzione ${bad} non è supportata nel laboratorio\n`);
    return 129;
  }

  if (sub === 'branch') {
    io.out('* main\n');
    return 0;
  }

  if (sub === 'status') {
    const modified: string[] = [];
    const deleted: string[] = [];
    for (const [p, c] of Object.entries(DEMO_HEAD)) {
      const abs = root + '/' + p;
      if (!rt.vfs.isFile(abs)) deleted.push(p);
      else if (rt.vfs.readFile(abs) !== c) modified.push(p);
    }
    const tracked = new Set(Object.keys(DEMO_HEAD));
    const untracked = rt.vfs
      .descendants(root)
      .filter((f) => rt.vfs.isFile(f))
      .map((f) => f.slice(root.length + 1))
      .filter((f) => !f.startsWith('.git/') && !tracked.has(f));
    let out = 'On branch main\n';
    if (!modified.length && !deleted.length && !untracked.length) out += 'nothing to commit, working tree clean\n';
    else {
      if (modified.length || deleted.length) out += 'Changes not staged for commit:\n' + [...modified.map((p) => `\tmodified:   ${p}`), ...deleted.map((p) => `\tdeleted:    ${p}`)].join('\n') + '\n';
      if (untracked.length) out += '\nUntracked files:\n' + untracked.map((p) => `\t${p}`).join('\n') + '\n';
    }
    io.out(out);
    return 0;
  }

  const paths = pathArgs.map((p) => relPath(rt, root, p));

  if (sub === 'log') {
    let list = DEMO_COMMITS.map((_, i) => i).reverse();
    if (paths.length) list = list.filter((i) => changedFiles(i).some((f) => paths.some((p) => f === p || f.startsWith(p + '/'))));
    const author = flags.find((f) => f.startsWith('--author='))?.slice(9).toLowerCase();
    if (author) list = list.filter((i) => DEMO_COMMITS[i].author.toLowerCase().includes(author));
    const nFlag = flags.find((f) => /^-n\d+$|^-\d+$/.test(f));
    const nSep = opts.indexOf('-n') >= 0 ? opts[opts.indexOf('-n') + 1] : undefined;
    const n = nFlag ? parseInt(nFlag.replace(/\D/g, ''), 10) : nSep ? parseInt(nSep, 10) : undefined;
    if (n !== undefined) list = list.slice(0, n);
    const one = flags.includes('--oneline');
    for (const i of list) {
      if (one) io.out(`${DEMO_COMMITS[i].hash.slice(0, 7)}${i === DEMO_COMMITS.length - 1 ? ' (HEAD -> main)' : ''} ${DEMO_COMMITS[i].message}\n`);
      else io.out(commitHeader(i, true) + '\n');
    }
    return 0;
  }

  if (sub === 'show') {
    const rev = pos[0] ?? 'HEAD';
    const i = resolveRev(rev);
    if (i === null) {
      io.err(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\n`);
      return 128;
    }
    io.out(commitHeader(i, true) + '\n');
    const before = i > 0 ? snapshotAt(i - 1) : {};
    const after = snapshotAt(i);
    for (const p of changedFiles(i).sort()) {
      if (paths.length && !paths.some((q) => p === q || p.startsWith(q + '/'))) continue;
      io.out(diffBlock(p, before[p], after[p]));
    }
    return 0;
  }

  if (sub === 'diff') {
    let a: Record<string, string>;
    let b: Record<string, string>;
    if (pos.length === 0) {
      a = DEMO_HEAD;
      b = {};
      for (const p of Object.keys(DEMO_HEAD)) if (rt.vfs.isFile(root + '/' + p)) b[p] = rt.vfs.readFile(root + '/' + p);
    } else {
      const ia = resolveRev(pos[0]);
      const ib = pos[1] ? resolveRev(pos[1]) : DEMO_COMMITS.length - 1;
      if (ia === null || ib === null) {
        io.err(`fatal: ambiguous argument '${ia === null ? pos[0] : pos[1]}': unknown revision or path not in the working tree.\n`);
        return 128;
      }
      a = snapshotAt(ia);
      b = snapshotAt(ib);
    }
    let out = '';
    for (const p of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (paths.length && !paths.some((q) => p === q || p.startsWith(q + '/'))) continue;
      if (a[p] !== b[p]) out += diffBlock(p, a[p], b[p]);
    }
    io.out(out);
    return 0;
  }

  // blame
  const file = pos[pos.length - 1] ?? paths[0];
  if (!file) {
    io.err('usage: git blame [-L start,end] <file>\n');
    return 129;
  }
  const rel = relPath(rt, root, file);
  if (!(rel in DEMO_HEAD)) {
    io.err(`fatal: no such path '${rel}' in HEAD\n`);
    return 128;
  }
  let owners: number[] = [];
  let prev: string[] = [];
  for (let ci = 0; ci < DEMO_COMMITS.length; ci++) {
    const snap = snapshotAt(ci)[rel];
    if (snap === undefined) continue;
    const cur = splitLines(snap);
    const n = prev.length;
    const m = cur.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = prev[i] === cur[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const next: number[] = [];
    let i = 0;
    let j = 0;
    while (j < m) {
      if (i < n && prev[i] === cur[j]) {
        next.push(owners[i]);
        i++;
        j++;
      } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
      else {
        next.push(ci);
        j++;
      }
    }
    owners = next;
    prev = cur;
  }
  let from = 1;
  let to = prev.length;
  const lf = flags.find((f) => f.startsWith('-L')) ?? '';
  const lval = lf.length > 2 ? lf.slice(2) : opts[opts.indexOf('-L') + 1];
  const lm = lval ? /^(\d+),(\d+)$/.exec(lval) : null;
  if (lm) {
    from = parseInt(lm[1], 10);
    to = Math.min(prev.length, parseInt(lm[2], 10));
  }
  const nameW = Math.max(...DEMO_COMMITS.map((c) => c.author.length));
  for (let k = from; k <= to; k++) {
    const c = DEMO_COMMITS[owners[k - 1]];
    io.out(`${c.hash.slice(0, 7)} (${c.author.padEnd(nameW)} ${isoDate(c.at)} ${String(k).padStart(2)}) ${prev[k - 1]}\n`);
  }
  return 0;
}
