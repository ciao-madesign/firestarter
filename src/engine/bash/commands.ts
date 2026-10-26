/** Builtin e comandi esterni simulati di Bash. Vedi catalog.ts per sintassi e differenze dichiarate. */
import { runJq, formatJson, parseJsonStream, JqError } from '../jq.ts';
import { FsError, HOME, basename, dirname, fsErrorMessage, glob, resolvePath } from '../vfs.ts';
import {
  byteLen, columns, dateDefault, getopt, grepRegex, humanSize, joinLines, lsDate, modeString, splitLines, strftime, unifiedDiff,
} from '../util.ts';
import { CREDENTIALS } from '../api/server.ts';
import { BUILTINS, COMMANDS, ExitSignal, LoopSignal, ReturnSignal, type BashRuntime, type CmdFn, type Io } from './interp.ts';
import { curl } from './curl.ts';
import { renderHelp } from '../catalog.ts';
import { BashSyntaxError } from './parser.ts';

function reg(name: string, fn: CmdFn, builtin = false): void {
  COMMANDS.set(name, fn);
  if (builtin) BUILTINS.add(name);
}

function ferr(cmd: string, io: Io, path: string, e: unknown, verb?: string): void {
  const msg = e instanceof FsError ? fsErrorMessage(e, path) : String(e);
  io.err(`${cmd}: ${verb ? `${verb} '${path}'` : path}: ${msg}\n`.replace(`'${path}': `, `'${path}': `));
}

/** Legge i file indicati (o stdin). Ritorna elenco {name, text} e un flag errori. */
function readInputs(rt: BashRuntime, io: Io, cmd: string, files: string[]): { inputs: { name: string; text: string }[]; failed: boolean } {
  const inputs: { name: string; text: string }[] = [];
  let failed = false;
  if (!files.length) return { inputs: [{ name: '-', text: io.stdin }], failed };
  for (const f of files) {
    if (f === '-') {
      inputs.push({ name: '-', text: io.stdin });
      continue;
    }
    try {
      const abs = rt.resolve(f);
      if (rt.vfs.isDir(abs)) {
        io.err(`${cmd}: ${f}: Is a directory\n`);
        failed = true;
        continue;
      }
      inputs.push({ name: f, text: rt.vfs.readFile(abs) });
    } catch (e) {
      io.err(`${cmd}: ${f}: ${e instanceof FsError ? fsErrorMessage(e, f) : String(e)}\n`);
      failed = true;
    }
  }
  return { inputs, failed };
}

function badOpt(cmd: string, io: Io, error: string): number {
  io.err(`${cmd}: ${error}\nTry '${cmd} --help' for more information.\n`);
  return 2;
}

function unescape(s: string): string {
  return s.replace(/\\(n|t|r|\\|"|a|e|0[0-7]{0,3}|x[0-9a-fA-F]{1,2})/g, (_, c: string) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    if (c === '\\') return '\\';
    if (c === '"') return '"';
    if (c === 'a') return '\x07';
    if (c === 'e') return '\x1b';
    if (c[0] === 'x') return String.fromCharCode(parseInt(c.slice(1), 16));
    return String.fromCharCode(parseInt(c, 8) || 0);
  });
}

// ---------------- builtin ----------------
reg('echo', (args, io) => {
  let nl = true;
  let esc = false;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (/^-[neE]+$/.test(a)) {
      if (a.includes('n')) nl = false;
      if (a.includes('e')) esc = true;
      if (a.includes('E')) esc = false;
    } else break;
  }
  let text = args.slice(i).join(' ');
  if (esc) text = unescape(text);
  io.out(text + (nl ? '\n' : ''));
  return 0;
}, true);

reg('pwd', (args, io, rt) => {
  io.out(rt.cwd + '\n');
  return 0;
}, true);

reg('cd', (args, io, rt) => {
  let target = args[0];
  if (args.length > 1) {
    io.err('bash: cd: too many arguments\n');
    return 1;
  }
  if (target === undefined) target = rt.get('HOME') ?? HOME;
  else if (target === '-') {
    target = rt.ss.env.OLDPWD ?? rt.cwd;
    io.out(target + '\n');
  }
  const abs = rt.resolve(target);
  if (!rt.vfs.exists(abs)) {
    io.err(`bash: cd: ${args[0] ?? target}: No such file or directory\n`);
    return 1;
  }
  if (!rt.vfs.isDir(abs)) {
    io.err(`bash: cd: ${args[0]}: Not a directory\n`);
    return 1;
  }
  if (!rt.vfs.canExec(abs)) {
    io.err(`bash: cd: ${args[0]}: Permission denied\n`);
    return 1;
  }
  rt.ss.env.OLDPWD = rt.cwd;
  rt.ss.cwd = abs;
  rt.ss.env.PWD = abs;
  return 0;
}, true);

reg('export', (args, io, rt) => {
  if (!args.length || args[0] === '-p') {
    for (const k of Object.keys(rt.ss.env).sort()) io.out(`declare -x ${k}="${rt.ss.env[k]}"\n`);
    return 0;
  }
  for (const a of args) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/s.exec(a);
    if (!m) {
      io.err(`bash: export: \`${a}': not a valid identifier\n`);
      return 1;
    }
    const val = m[2] ?? (rt.get(m[1]) ?? '');
    delete rt.ss.vars[m[1]];
    rt.ss.env[m[1]] = val;
  }
  return 0;
}, true);

reg('unset', (args, io, rt) => {
  for (const a of args) {
    if (a === '-f' || a === '-v') continue;
    delete rt.ss.vars[a];
    delete rt.ss.env[a];
    delete rt.ss.functions[a];
  }
  return 0;
}, true);

reg('local', (args, io, rt) => {
  const top = rt.frames[rt.frames.length - 1];
  for (const a of args) {
    const [k, v] = a.split(/=(.*)/s);
    top.locals[k] = v ?? '';
  }
  return 0;
}, true);

reg('declare', (args, io, rt) => {
  for (const a of args) {
    if (a.startsWith('-')) continue;
    const [k, v] = a.split(/=(.*)/s);
    rt.set(k, v ?? '');
  }
  return 0;
}, true);

reg('set', (args, io, rt) => {
  if (!args.length) {
    for (const k of Object.keys({ ...rt.ss.env, ...rt.ss.vars }).sort()) io.out(`${k}=${rt.get(k)}\n`);
    return 0;
  }
  for (const a of args) {
    if (a === '-e') rt.errexit = true;
    else if (a === '+e') rt.errexit = false;
    else if (a === '-o' || a === 'pipefail' || a === '-u' || a === '+u' || a === '-x' || a === '+x' || a === '-eu' || a === '-euo') {
      if (a === '-eu' || a === '-euo') rt.errexit = true;
    }
  }
  return 0;
}, true);

reg('shift', (args, io, rt) => {
  const top = rt.frames[rt.frames.length - 1];
  top.args.splice(0, parseInt(args[0] ?? '1', 10) || 1);
  return 0;
}, true);

reg('exit', (args) => {
  throw new ExitSignal(parseInt(args[0] ?? '0', 10) || 0);
}, true);

reg('return', (args, io, rt) => {
  throw new ReturnSignal(args[0] !== undefined ? parseInt(args[0], 10) || 0 : rt.ss.lastExit);
}, true);

reg('break', (args) => {
  throw new LoopSignal('break', parseInt(args[0] ?? '1', 10) || 1);
}, true);
reg('continue', (args) => {
  throw new LoopSignal('continue', parseInt(args[0] ?? '1', 10) || 1);
}, true);

reg('true', () => 0, true);
reg('false', () => 1, true);
reg(':', () => 0, true);

reg('clear', (args, io, rt) => {
  rt.clearRequested = true;
  return 0;
});

reg('history', (args, io, rt) => {
  const h = rt.ss.history;
  if (args[0] === '-c') {
    rt.ss.history = [];
    return 0;
  }
  const n = parseInt(args[0] ?? '', 10);
  const slice = Number.isNaN(n) ? h : h.slice(-n);
  const start = h.length - slice.length;
  slice.forEach((e, i) => io.out(`${String(start + i + 1).padStart(5)}  ${e.cmd}\n`));
  return 0;
}, true);

reg('read', (args, io, rt) => {
  const names = args.filter((a) => !a.startsWith('-'));
  const lines = io.stdin.split('\n');
  if (!io.stdin) return 1;
  const line = lines[0];
  const parts = line.split(/\s+/).filter(Boolean);
  const vars = names.length ? names : ['REPLY'];
  vars.forEach((v, i) => rt.set(v, i === vars.length - 1 ? parts.slice(i).join(' ') : (parts[i] ?? '')));
  return 0;
}, true);

function runTest(args: string[], rt: BashRuntime, io: Io): boolean {
  let p = 0;
  const unary = (op: string, v: string): boolean => {
    const abs = rt.resolve(v);
    switch (op) {
      case '-z': return v === '';
      case '-n': return v !== '';
      case '-e': return rt.vfs.exists(abs);
      case '-f': return rt.vfs.isFile(abs);
      case '-d': return rt.vfs.isDir(abs);
      case '-r': return rt.vfs.canRead(abs);
      case '-w': return rt.vfs.canWrite(abs);
      case '-x': return rt.vfs.canExec(abs);
      case '-s': return rt.vfs.isFile(abs) && rt.vfs.readFile(abs).length > 0;
    }
    return false;
  };
  const primary = (): boolean => {
    const a = args[p];
    if (a === '(') {
      p++;
      const v = orExpr();
      p++;
      return v;
    }
    if (a === '!') {
      p++;
      return !primary();
    }
    if (['-z', '-n', '-e', '-f', '-d', '-r', '-w', '-x', '-s'].includes(a) && args[p + 1] !== undefined && !['=', '==', '!=', '=~'].includes(args[p + 1])) {
      p += 2;
      return unary(a, args[p - 1]);
    }
    const l = args[p];
    const op = args[p + 1];
    if (op !== undefined && ['=', '==', '!=', '-eq', '-ne', '-lt', '-gt', '-le', '-ge', '=~', '<', '>'].includes(op)) {
      const r = args[p + 2] ?? '';
      p += 3;
      switch (op) {
        case '=':
        case '==': return globMatch(r, l);
        case '!=': return !globMatch(r, l);
        case '=~': try { return new RegExp(r).test(l); } catch { return false; }
        case '<': return l < r;
        case '>': return l > r;
      }
      const nl = parseInt(l, 10);
      const nr = parseInt(r, 10);
      if (Number.isNaN(nl) || Number.isNaN(nr)) throw new BashSyntaxError(`${l}: integer expression expected`);
      switch (op) {
        case '-eq': return nl === nr;
        case '-ne': return nl !== nr;
        case '-lt': return nl < nr;
        case '-gt': return nl > nr;
        case '-le': return nl <= nr;
        case '-ge': return nl >= nr;
      }
    }
    p++;
    return l !== undefined && l !== '';
  };
  const andExpr = (): boolean => {
    let v = primary();
    while (args[p] === '&&' || args[p] === '-a') {
      p++;
      const r = primary();
      v = v && r;
    }
    return v;
  };
  const orExpr = (): boolean => {
    let v = andExpr();
    while (args[p] === '||' || args[p] === '-o') {
      p++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  };
  void io;
  return orExpr();
}

function globMatch(pattern: string, s: string): boolean {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return re.test(s);
}

const testFn: CmdFn = (args, io, rt) => {
  try {
    return runTest(args, rt, io) ? 0 : 1;
  } catch (e) {
    if (e instanceof BashSyntaxError) {
      io.err(`bash: [: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
};
reg('test', testFn, true);
reg('[', (args, io, rt) => {
  if (args[args.length - 1] !== ']') {
    io.err("bash: [: missing `]'\n");
    return 2;
  }
  return testFn(args.slice(0, -1), io, rt);
}, true);
reg('[[', (args, io, rt) => {
  if (args[args.length - 1] !== ']]') {
    io.err("bash: syntax error: expected `]]'\n");
    return 2;
  }
  return testFn(args.slice(0, -1), io, rt);
}, true);

reg('source', (args, io, rt) => {
  if (!args[0]) {
    io.err('bash: source: filename argument required\n');
    return 2;
  }
  const abs = rt.resolve(args[0]);
  let src: string;
  try {
    src = rt.vfs.readFile(abs);
  } catch (e) {
    ferr('bash', io, args[0], e, 'source:');
    return 1;
  }
  rt.frames.push({ args: args.slice(1), locals: {}, fn: null });
  try {
    return rt.runSource(src, io);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.code;
    throw e;
  } finally {
    rt.frames.pop();
  }
}, true);
COMMANDS.set('.', COMMANDS.get('source')!);
BUILTINS.add('.');

function runShellCmd(args: string[], io: Io, rt: BashRuntime, name: string): number {
  if (args[0] === '-c') {
    return rt.runChild(args[1] ?? '', args.slice(3), args[2] ?? name, io);
  }
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) {
    io.err(`${name}: lettura da stdin non supportata: indica uno script\n`);
    return 2;
  }
  const abs = rt.resolve(file);
  try {
    if (rt.vfs.isDir(abs)) {
      io.err(`${name}: ${file}: Is a directory\n`);
      return 126;
    }
    const src = rt.vfs.readFile(abs);
    return rt.runChild(src, args.slice(args.indexOf(file) + 1), file, io);
  } catch (e) {
    if (e instanceof FsError) {
      io.err(`${name}: ${file}: ${fsErrorMessage(e, file)}\n`);
      return e.code === 'ENOENT' ? 127 : 126;
    }
    throw e;
  }
}
reg('bash', (a, io, rt) => runShellCmd(a, io, rt, 'bash'));
reg('sh', (a, io, rt) => runShellCmd(a, io, rt, 'sh'));

reg('type', (args, io, rt) => {
  let code = 0;
  for (const a of args) {
    if (rt.ss.functions[a]) io.out(`${a} is a function\n`);
    else if (BUILTINS.has(a)) io.out(`${a} is a shell builtin\n`);
    else if (COMMANDS.has(a)) io.out(`${a} is /usr/bin/${a}\n`);
    else {
      io.err(`bash: type: ${a}: not found\n`);
      code = 1;
    }
  }
  return code;
}, true);

reg('which', (args, io, rt) => {
  let code = 0;
  for (const a of args) {
    if (COMMANDS.has(a) && !BUILTINS.has(a)) io.out(`/usr/bin/${a}\n`);
    else code = 1;
  }
  return code;
});

reg('command', (args, io, rt) => {
  if (args[0] === '-v') {
    let code = 0;
    for (const a of args.slice(1)) {
      if (COMMANDS.has(a)) io.out((BUILTINS.has(a) ? a : `/usr/bin/${a}`) + '\n');
      else code = 1;
    }
    return code;
  }
  return args.length ? rt.runCommand(args[0], args.slice(1), io) : 0;
}, true);

reg('help', (args, io) => {
  io.out(renderHelp(args[0] ?? '', 'bash'));
  return 0;
}, true);
reg('man', (args, io) => {
  if (!args.length) {
    io.err('What manual page do you want?\nFor example, try \'man man\'.\n');
    return 1;
  }
  const out = renderHelp(args[args.length - 1], 'bash', true);
  if (!out) {
    io.err(`No manual entry for ${args[args.length - 1]}\n`);
    return 16;
  }
  io.out(out);
  return 0;
});

reg('env', (args, io, rt) => {
  const assigns: Record<string, string> = {};
  let i = 0;
  while (i < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i])) {
    const [k, v] = args[i].split(/=(.*)/s);
    assigns[k] = v;
    i++;
  }
  if (i < args.length) {
    const saved = { ...rt.ss.env };
    Object.assign(rt.ss.env, assigns);
    try {
      return rt.runCommand(args[i], args.slice(i + 1), io);
    } finally {
      rt.ss.env = saved;
    }
  }
  for (const k of Object.keys(rt.ss.env)) io.out(`${k}=${rt.ss.env[k]}\n`);
  return 0;
});
reg('printenv', (args, io, rt) => {
  if (!args.length) {
    for (const k of Object.keys(rt.ss.env)) io.out(`${k}=${rt.ss.env[k]}\n`);
    return 0;
  }
  let code = 0;
  for (const a of args) {
    if (a in rt.ss.env) io.out(rt.ss.env[a] + '\n');
    else code = 1;
  }
  return code;
});

reg('printf', (args, io) => {
  if (!args.length) {
    io.err('printf: usage: printf format [arguments]\n');
    return 2;
  }
  const fmt = args[0];
  const vals = args.slice(1);
  let vi = 0;
  let out = '';
  do {
    const startVi = vi;
    out += unescape(
      fmt.replace(/%([-+ 0]*)(\d*)(?:\.(\d+))?([sdifxXb%])/g, (_, flags: string, width: string, prec: string, c: string) => {
        if (c === '%') return '%';
        const raw = vals[vi++] ?? '';
        let s: string;
        if (c === 's' || c === 'b') s = prec ? raw.slice(0, parseInt(prec, 10)) : raw;
        else if (c === 'd' || c === 'i') s = String(parseInt(raw, 10) || 0);
        else if (c === 'f') s = (parseFloat(raw) || 0).toFixed(prec ? parseInt(prec, 10) : 6);
        else s = (parseInt(raw, 10) || 0).toString(16)[c === 'X' ? 'toUpperCase' : 'toString']();
        const w = parseInt(width || '0', 10);
        if (flags.includes('-')) return s.padEnd(w);
        return flags.includes('0') && c !== 's' ? s.padStart(w, '0') : s.padStart(w);
      }),
    );
    if (vi === startVi) break;
  } while (vi < vals.length);
  io.out(out);
  return 0;
}, true);

reg('sleep', (args, io, rt) => {
  const n = parseFloat(args[0] ?? '');
  if (Number.isNaN(n)) {
    io.err('sleep: invalid time interval\nTry \'sleep --help\' for more information.\n');
    return 1;
  }
  rt.state.clock += Math.ceil(n);
  return 0;
});

reg('date', (args, io, rt) => {
  const fmt = args.find((a) => a.startsWith('+'));
  const iso = args.includes('-I') || args.includes('--iso-8601');
  if (iso) io.out(strftime('%F', rt.state.clock) + '\n');
  else io.out((fmt ? strftime(fmt.slice(1), rt.state.clock) : dateDefault(rt.state.clock)) + '\n');
  return 0;
});

reg('whoami', (a, io) => (io.out('learner\n'), 0));
reg('hostname', (a, io) => (io.out('lab\n'), 0));
reg('id', (a, io) => (io.out('uid=1000(learner) gid=1000(learner) groups=1000(learner)\n'), 0));
reg('uname', (args, io) => {
  io.out(args.includes('-a') ? 'Linux lab 6.1.0-sim #1 SMP x86_64 GNU/Linux\n' : 'Linux\n');
  return 0;
});

reg('seq', (args, io) => {
  const n = args.map(Number);
  if (!n.length || n.some(Number.isNaN)) return badOpt('seq', io, `invalid floating point argument: '${args[0] ?? ''}'`);
  const [a, s, b] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : [n[0], n[1], n[2]];
  let out = '';
  let count = 0;
  for (let v = a; s > 0 ? v <= b : v >= b; v += s) {
    out += v + '\n';
    if (++count > 10000) break;
  }
  io.out(out);
  return 0;
});

// ---------------- filesystem ----------------
interface LsEntry {
  name: string;
  path: string;
}

reg('ls', (args, io, rt) => {
  const o = getopt(args, { flags: 'lahAdR1tSrFi', alias: { all: 'a', 'human-readable': 'h' }, longFlags: ['color'] });
  if (o.error) return badOpt('ls', io, o.error.replace('opzione non valida', 'invalid option'));
  const f = o.flags;
  const long = f.has('l');
  const showAll = f.has('a');
  const almost = f.has('A');
  const paths = o.rest.length ? o.rest : ['.'];
  let code = 0;
  const fmtEntry = (e: LsEntry): string => {
    const n = rt.vfs.get(e.path)!;
    const classify = f.has('F') ? (n.type === 'dir' ? '/' : n.mode & 0o100 ? '*' : '') : '';
    if (!long) return e.name + classify;
    const size = n.type === 'dir' ? 4096 : byteLen(n.content);
    const links = n.type === 'dir' ? 2 + rt.vfs.list(e.path).filter((c) => rt.vfs.isDir(e.path + '/' + c)).length : 1;
    return [modeString(n.mode, n.type === 'dir'), String(links), n.owner.padEnd(7), n.owner.padEnd(7), (f.has('h') ? humanSize(size) : String(size)).padStart(6), lsDate(n.mtime), e.name + classify].join(' ');
  };
  const sortEntries = (list: LsEntry[]): LsEntry[] => {
    const get = (e: LsEntry) => rt.vfs.get(e.path)!;
    let out = [...list];
    if (f.has('t')) out.sort((a, b) => get(b).mtime - get(a).mtime || a.name.localeCompare(b.name));
    else if (f.has('S')) out.sort((a, b) => byteLen(get(b).content) - byteLen(get(a).content) || a.name.localeCompare(b.name));
    if (f.has('r')) out = out.reverse();
    return out;
  };
  const emit = (entries: LsEntry[], totalBlocks?: number): void => {
    if (long) {
      if (totalBlocks !== undefined) io.out(`total ${totalBlocks}\n`);
      const rows = entries.map(fmtEntry);
      io.out(rows.length ? rows.join('\n') + '\n' : '');
    } else if (io.tty && !f.has('1')) io.out(columns(entries.map(fmtEntry)));
    else io.out(entries.map(fmtEntry).join('\n') + (entries.length ? '\n' : ''));
  };
  const listDir = (dir: string, label: string | null, recursive: boolean): void => {
    if (label) io.out(`${label}:\n`);
    let names: string[];
    try {
      names = rt.vfs.list(dir);
    } catch (e) {
      io.err(`ls: cannot open directory '${label ?? dir}': ${e instanceof FsError ? fsErrorMessage(e, dir) : e}\n`);
      code = 2;
      return;
    }
    const visible = names.filter((n) => showAll || almost || !n.startsWith('.'));
    let entries: LsEntry[] = visible.map((n) => ({ name: n, path: (dir === '/' ? '' : dir) + '/' + n }));
    if (showAll) entries = [{ name: '.', path: dir }, { name: '..', path: dirname(dir) }, ...entries];
    entries = sortEntries(entries);
    const blocks = entries.reduce((s, e) => s + (e.name === '.' || e.name === '..' ? 4 : Math.max(4, Math.ceil(byteLen(rt.vfs.get(e.path)!.content) / 4096) * 4)), 0);
    emit(entries, blocks);
    if (recursive) {
      for (const e of entries) {
        if (e.name !== '.' && e.name !== '..' && rt.vfs.isDir(e.path)) {
          io.out('\n');
          listDir(e.path, (label ? label.replace(/\/$/, '') + '/' : dir + '/') + e.name, true);
        }
      }
    }
  };
  const files: LsEntry[] = [];
  const dirs: string[] = [];
  for (const p of paths) {
    const abs = rt.resolve(p);
    if (!rt.vfs.exists(abs)) {
      io.err(`ls: cannot access '${p}': No such file or directory\n`);
      code = 2;
    } else if (rt.vfs.isDir(abs) && !f.has('d')) dirs.push(p);
    else files.push({ name: p, path: abs });
  }
  if (files.length) emit(sortEntries(files));
  dirs.forEach((d, i) => {
    if (files.length || i > 0) io.out('\n');
    listDir(rt.resolve(d), paths.length > 1 || f.has('R') ? d : null, f.has('R'));
  });
  return code;
});

reg('cat', (args, io, rt) => {
  const o = getopt(args, { flags: 'nAbEs' });
  if (o.error) return badOpt('cat', io, o.error.replace('opzione non valida', 'invalid option'));
  const { inputs, failed } = readInputs(rt, io, 'cat', o.rest);
  let n = 0;
  for (const inp of inputs) {
    if (o.flags.has('n')) {
      const lines = inp.text.split('\n');
      const trailing = inp.text.endsWith('\n');
      if (trailing) lines.pop();
      io.out(lines.map((l) => `${String(++n).padStart(6)}\t${l}`).join('\n') + (trailing ? '\n' : ''));
    } else io.out(inp.text);
  }
  return failed ? 1 : 0;
});

function headTail(which: 'head' | 'tail'): CmdFn {
  return (args, io, rt) => {
    const o = getopt(args, { flags: 'qv', values: 'nc', numeric: true });
    if (o.error) return badOpt(which, io, o.error.replace('opzione non valida', 'invalid option'));
    const nStr = o.values.n?.[0];
    let n = o.numeric ?? 10;
    let fromStart = false;
    if (nStr !== undefined) {
      if (nStr.startsWith('+')) fromStart = true;
      n = parseInt(nStr.replace('+', ''), 10);
      if (Number.isNaN(n)) {
        io.err(`${which}: invalid number of lines: '${nStr}'\n`);
        return 1;
      }
    }
    const { inputs, failed } = readInputs(rt, io, which === 'head' ? 'head' : 'tail', o.rest);
    const multi = inputs.length > 1;
    inputs.forEach((inp, i) => {
      if (multi) io.out(`${i ? '\n' : ''}==> ${inp.name} <==\n`);
      if (o.values.c) {
        const c = parseInt(o.values.c[0], 10);
        io.out(which === 'head' ? inp.text.slice(0, c) : inp.text.slice(-c));
        return;
      }
      const lines = splitLines(inp.text);
      const sel = which === 'head' ? lines.slice(0, n) : fromStart ? lines.slice(n - 1) : lines.slice(Math.max(0, lines.length - n));
      io.out(joinLines(sel));
    });
    return failed ? 1 : 0;
  };
}
reg('head', headTail('head'));
reg('tail', headTail('tail'));

reg('wc', (args, io, rt) => {
  const o = getopt(args, { flags: 'lwcm' });
  if (o.error) return badOpt('wc', io, o.error.replace('opzione non valida', 'invalid option'));
  const { inputs, failed } = readInputs(rt, io, 'wc', o.rest);
  const none = !o.flags.size;
  const tot = { l: 0, w: 0, c: 0 };
  const row = (v: { l: number; w: number; c: number }, name: string): string => {
    const cols: number[] = [];
    if (none || o.flags.has('l')) cols.push(v.l);
    if (none || o.flags.has('w')) cols.push(v.w);
    if (none || o.flags.has('c') || o.flags.has('m')) cols.push(v.c);
    const width = inputs.length > 1 || o.rest.length ? Math.max(1, ...cols.map((c) => String(c).length), 1) : 0;
    const w = o.rest.length ? Math.max(width, 1) : none ? 7 : 0;
    const parts = cols.map((c) => String(c).padStart(o.rest.length ? Math.max(...[tot.l, tot.w, tot.c].map((x) => String(x).length), 1) : w));
    return parts.join(' ') + (name ? ' ' + name : '');
  };
  const vals = inputs.map((inp) => ({
    l: (inp.text.match(/\n/g) ?? []).length,
    w: inp.text.split(/\s+/).filter(Boolean).length,
    c: byteLen(inp.text),
  }));
  vals.forEach((v) => {
    tot.l += v.l;
    tot.w += v.w;
    tot.c += v.c;
  });
  const simple = !o.rest.length;
  vals.forEach((v, i) => {
    if (simple) {
      const cols: number[] = [];
      if (none || o.flags.has('l')) cols.push(v.l);
      if (none || o.flags.has('w')) cols.push(v.w);
      if (none || o.flags.has('c') || o.flags.has('m')) cols.push(v.c);
      io.out((cols.length === 1 && !none ? String(cols[0]) : cols.map((c) => String(c).padStart(none ? 7 : String(c).length)).join(' ')) + '\n');
    } else io.out(row(v, inputs[i].name) + '\n');
  });
  if (inputs.length > 1) io.out(row(tot, 'total') + '\n');
  return failed ? 1 : 0;
});

reg('mkdir', (args, io, rt) => {
  const o = getopt(args, { flags: 'pv' });
  if (o.error) return badOpt('mkdir', io, o.error.replace('opzione non valida', 'invalid option'));
  if (!o.rest.length) {
    io.err("mkdir: missing operand\nTry 'mkdir --help' for more information.\n");
    return 1;
  }
  let code = 0;
  for (const p of o.rest) {
    try {
      rt.vfs.mkdir(rt.resolve(p), o.flags.has('p'));
      if (o.flags.has('v')) io.out(`mkdir: created directory '${p}'\n`);
    } catch (e) {
      io.err(`mkdir: cannot create directory '${p}': ${e instanceof FsError ? fsErrorMessage(e, p) : e}\n`);
      code = 1;
    }
  }
  return code;
});

reg('rmdir', (args, io, rt) => {
  let code = 0;
  for (const p of args) {
    const abs = rt.resolve(p);
    try {
      if (!rt.vfs.exists(abs)) throw new FsError('ENOENT', abs);
      if (!rt.vfs.isDir(abs)) throw new FsError('ENOTDIR', abs);
      rt.vfs.remove(abs, false);
    } catch (e) {
      io.err(`rmdir: failed to remove '${p}': ${e instanceof FsError ? fsErrorMessage(e, p) : e}\n`);
      code = 1;
    }
  }
  return code;
});

reg('touch', (args, io, rt) => {
  let code = 0;
  for (const p of args.filter((a) => !a.startsWith('-'))) {
    const abs = rt.resolve(p);
    try {
      if (rt.vfs.exists(abs)) {
        const n = rt.vfs.get(abs)!;
        n.mtime = rt.state.clock;
      } else rt.vfs.writeFile(abs, '');
    } catch (e) {
      io.err(`touch: cannot touch '${p}': ${e instanceof FsError ? fsErrorMessage(e, p) : e}\n`);
      code = 1;
    }
  }
  if (!args.length) {
    io.err("touch: missing file operand\nTry 'touch --help' for more information.\n");
    return 1;
  }
  return code;
});

reg('rm', (args, io, rt) => {
  const o = getopt(args, { flags: 'rRfiv' });
  if (o.error) return badOpt('rm', io, o.error.replace('opzione non valida', 'invalid option'));
  if (!o.rest.length) {
    if (o.flags.has('f')) return 0;
    io.err("rm: missing operand\nTry 'rm --help' for more information.\n");
    return 1;
  }
  const rec = o.flags.has('r') || o.flags.has('R');
  let code = 0;
  for (const p of o.rest) {
    const abs = rt.resolve(p);
    if (abs === '/' || abs === HOME || abs === rt.cwd && rec && p === '.') {
      io.err(`rm: it is dangerous to operate recursively on '${p}'\nrm: use --no-preserve-root to override this failsafe\n`);
      code = 1;
      continue;
    }
    if (!rt.vfs.exists(abs)) {
      if (!o.flags.has('f')) {
        io.err(`rm: cannot remove '${p}': No such file or directory\n`);
        code = 1;
      }
      continue;
    }
    if (rt.vfs.isDir(abs) && !rec) {
      io.err(`rm: cannot remove '${p}': Is a directory\n`);
      code = 1;
      continue;
    }
    try {
      rt.vfs.remove(abs, rec);
      if (o.flags.has('v')) io.out(`removed '${p}'\n`);
    } catch (e) {
      io.err(`rm: cannot remove '${p}': ${e instanceof FsError ? fsErrorMessage(e, p) : e}\n`);
      code = 1;
    }
  }
  return code;
});

function cpmv(which: 'cp' | 'mv'): CmdFn {
  return (args, io, rt) => {
    const o = getopt(args, { flags: 'rRfivn' });
    if (o.error) return badOpt(which, io, o.error.replace('opzione non valida', 'invalid option'));
    const rec = o.flags.has('r') || o.flags.has('R');
    if (o.rest.length < 2) {
      io.err(`${which}: missing ${o.rest.length ? 'destination file' : 'file'} operand\nTry '${which} --help' for more information.\n`);
      return 1;
    }
    const dest = o.rest[o.rest.length - 1];
    const srcs = o.rest.slice(0, -1);
    const dAbs = rt.resolve(dest);
    const destIsDir = rt.vfs.isDir(dAbs);
    if (srcs.length > 1 && !destIsDir) {
      io.err(`${which}: target '${dest}' is not a directory\n`);
      return 1;
    }
    let code = 0;
    for (const s of srcs) {
      const sAbs = rt.resolve(s);
      if (!rt.vfs.exists(sAbs)) {
        io.err(`${which}: cannot stat '${s}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const target = destIsDir ? dAbs + '/' + basename(sAbs) : dAbs;
      try {
        if (rt.vfs.isDir(sAbs) && which === 'cp' && !rec) {
          io.err(`cp: -r not specified; omitting directory '${s}'\n`);
          code = 1;
          continue;
        }
        if (sAbs === target) {
          io.err(`${which}: '${s}' and '${dest}' are the same file\n`);
          code = 1;
          continue;
        }
        if (which === 'cp') rt.vfs.copy(sAbs, target);
        else rt.vfs.move(sAbs, target);
      } catch (e) {
        io.err(`${which}: cannot ${which === 'cp' ? 'create regular file' : 'move'} '${dest}': ${e instanceof FsError ? fsErrorMessage(e, dest) : e}\n`);
        code = 1;
      }
    }
    return code;
  };
}
reg('cp', cpmv('cp'));
reg('mv', cpmv('mv'));

reg('chmod', (args, io, rt) => {
  const o = getopt(args, { flags: 'R' });
  if (o.rest.length < 2) {
    io.err("chmod: missing operand\nTry 'chmod --help' for more information.\n");
    return 1;
  }
  const modeStr = o.rest[0];
  let code = 0;
  for (const p of o.rest.slice(1)) {
    const abs = rt.resolve(p);
    const n = rt.vfs.get(abs);
    if (!n) {
      io.err(`chmod: cannot access '${p}': No such file or directory\n`);
      code = 1;
      continue;
    }
    let mode = n.mode;
    if (/^[0-7]{3,4}$/.test(modeStr)) mode = parseInt(modeStr, 8) & 0o777;
    else {
      const m = /^([ugoa]*)([-+=])([rwx]+)$/.exec(modeStr);
      if (!m) {
        io.err(`chmod: invalid mode: '${modeStr}'\nTry 'chmod --help' for more information.\n`);
        return 1;
      }
      const who = m[1] || 'a';
      let bits = 0;
      for (const c of m[3]) bits |= c === 'r' ? 4 : c === 'w' ? 2 : 1;
      let mask = 0;
      if (who.includes('a') || who.includes('u')) mask |= bits << 6;
      if (who.includes('a') || who.includes('g')) mask |= bits << 3;
      if (who.includes('a') || who.includes('o')) mask |= bits;
      mode = m[2] === '+' ? mode | mask : m[2] === '-' ? mode & ~mask : mask;
    }
    try {
      rt.vfs.chmod(abs, mode);
    } catch (e) {
      io.err(`chmod: changing permissions of '${p}': ${e instanceof FsError ? fsErrorMessage(e, p) : e}\n`);
      code = 1;
    }
  }
  return code;
});

reg('basename', (args, io) => {
  if (!args.length) return badOpt('basename', io, 'missing operand');
  let b = basename(args[0]);
  if (args[1] && b.endsWith(args[1])) b = b.slice(0, -args[1].length);
  io.out(b + '\n');
  return 0;
});
reg('dirname', (args, io) => {
  if (!args.length) return badOpt('dirname', io, 'missing operand');
  io.out((args[0].includes('/') ? dirname(args[0]) : '.') + '\n');
  return 0;
});

reg('tee', (args, io, rt) => {
  const o = getopt(args, { flags: 'a' });
  io.out(io.stdin);
  let code = 0;
  for (const f of o.rest) {
    try {
      rt.vfs.writeFile(rt.resolve(f), io.stdin, o.flags.has('a'));
    } catch (e) {
      io.err(`tee: ${f}: ${e instanceof FsError ? fsErrorMessage(e, f) : e}\n`);
      code = 1;
    }
  }
  return code;
});

reg('stat', (args, io, rt) => {
  let code = 0;
  for (const p of args) {
    const n = rt.vfs.get(rt.resolve(p));
    if (!n) {
      io.err(`stat: cannot statx '${p}': No such file or directory\n`);
      code = 1;
      continue;
    }
    io.out(`  File: ${p}\n  Size: ${n.type === 'dir' ? 4096 : byteLen(n.content)}\t${n.type === 'dir' ? 'directory' : 'regular file'}\nAccess: (${n.mode.toString(8).padStart(4, '0')}/${modeString(n.mode, n.type === 'dir')})  Uid: (1000/${n.owner})\nModify: ${strftime('%F %T', n.mtime)} +0000\n`);
  }
  return code;
});

reg('find', (args, io, rt) => {
  const paths: string[] = [];
  let i = 0;
  while (i < args.length && !args[i].startsWith('-')) paths.push(args[i++]);
  if (!paths.length) paths.push('.');
  let name: RegExp | null = null;
  let type: string | null = null;
  let maxdepth = Infinity;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '-name' || a === '-iname') {
      const pat = args[++i] ?? '';
      name = new RegExp('^' + pat.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', a === '-iname' ? 'i' : '');
    } else if (a === '-type') type = args[++i];
    else if (a === '-maxdepth') maxdepth = parseInt(args[++i], 10);
    else if (a === '-print') continue;
    else {
      io.err(`find: unknown predicate \`${a}'\n`);
      return 1;
    }
  }
  let code = 0;
  for (const p of paths) {
    const abs = rt.resolve(p);
    if (!rt.vfs.exists(abs)) {
      io.err(`find: '${p}': No such file or directory\n`);
      code = 1;
      continue;
    }
    const all = [abs, ...rt.vfs.descendants(abs)];
    for (const a of all) {
      const depth = a === abs ? 0 : a.slice(abs.length).split('/').length - 1;
      if (depth > maxdepth) continue;
      const n = rt.vfs.get(a)!;
      if (type === 'f' && n.type !== 'file') continue;
      if (type === 'd' && n.type !== 'dir') continue;
      if (name && !name.test(basename(a))) continue;
      const shown = a === abs ? p : (p.endsWith('/') ? p : p + '/') + a.slice(abs.length + (abs === '/' ? 0 : 1));
      io.out(shown + '\n');
    }
  }
  return code;
});

// ---------------- testo ----------------
reg('grep', (args, io, rt) => {
  const o = getopt(args, { flags: 'ivncrRElFwoqHhs', values: 'eABCm', alias: {} });
  if (o.error) return badOpt('grep', io, o.error.replace('opzione non valida', 'invalid option'));
  const rest = [...o.rest];
  const patterns = o.values.e ? [...o.values.e] : rest.length ? [rest.shift()!] : [];
  if (!patterns.length) {
    io.err('Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.\n');
    return 2;
  }
  const res = patterns.map((p) => grepRegex(p, { extended: o.flags.has('E'), fixed: o.flags.has('F'), ignoreCase: o.flags.has('i'), word: o.flags.has('w') }));
  if (res.some((r) => !r)) {
    io.err('grep: Invalid regular expression\n');
    return 2;
  }
  const recursive = o.flags.has('r') || o.flags.has('R');
  let files = rest;
  if (recursive && !files.length) files = ['.'];
  const targets: { name: string; text: string }[] = [];
  let status = 1;
  let hadError = false;
  if (!files.length) targets.push({ name: '(standard input)', text: io.stdin });
  for (const f of files) {
    if (f === '-') {
      targets.push({ name: '(standard input)', text: io.stdin });
      continue;
    }
    const abs = rt.resolve(f);
    if (!rt.vfs.exists(abs)) {
      if (!o.flags.has('s')) io.err(`grep: ${f}: No such file or directory\n`);
      hadError = true;
      continue;
    }
    if (rt.vfs.isDir(abs)) {
      if (!recursive) {
        io.err(`grep: ${f}: Is a directory\n`);
        hadError = true;
        continue;
      }
      for (const d of rt.vfs.descendants(abs)) {
        if (rt.vfs.isFile(d)) {
          try {
            targets.push({ name: f === '.' ? '.' + d.slice(abs.length) : (f.endsWith('/') ? f : f + '/') + d.slice(abs.length + 1), text: rt.vfs.readFile(d) });
          } catch {
            /* illeggibile */
          }
        }
      }
      continue;
    }
    try {
      targets.push({ name: f, text: rt.vfs.readFile(abs) });
    } catch (e) {
      io.err(`grep: ${f}: ${e instanceof FsError ? fsErrorMessage(e, f) : e}\n`);
      hadError = true;
    }
  }
  const showName = (files.length > 1 || recursive) && !o.flags.has('h');
  const after = parseInt(o.values.A?.[0] ?? o.values.C?.[0] ?? '0', 10);
  const before = parseInt(o.values.B?.[0] ?? o.values.C?.[0] ?? '0', 10);
  for (const t of targets) {
    const lines = splitLines(t.text);
    let count = 0;
    const printed = new Set<number>();
    lines.forEach((line, idx) => {
      const hit = res.some((r) => r!.test(line));
      if (hit === o.flags.has('v')) return;
      count++;
      status = 0;
      if (o.flags.has('q') || o.flags.has('c') || o.flags.has('l')) return;
      const emit = (i: number, sep: string): void => {
        if (printed.has(i)) return;
        printed.add(i);
        io.out(`${showName ? t.name + sep : ''}${o.flags.has('n') ? i + 1 + sep : ''}${lines[i]}\n`);
      };
      for (let b = Math.max(0, idx - before); b < idx; b++) emit(b, '-');
      if (o.flags.has('o') && !o.flags.has('v')) {
        const g = new RegExp(res.find((r) => r!.test(line))!.source, (res[0]!.flags || '') + 'g');
        for (const m of line.matchAll(g)) io.out(`${showName ? t.name + ':' : ''}${m[0]}\n`);
      } else emit(idx, ':');
      for (let a = idx + 1; a <= Math.min(lines.length - 1, idx + after); a++) emit(a, '-');
    });
    if (o.flags.has('c')) io.out(`${showName ? t.name + ':' : ''}${count}\n`);
    if (o.flags.has('l') && count) io.out(t.name + '\n');
    if (o.flags.has('q') && status === 0) return 0;
  }
  return hadError && status !== 0 ? 2 : status;
});

reg('sort', (args, io, rt) => {
  const o = getopt(args, { flags: 'rnufbV', values: 'kt' });
  if (o.error) return badOpt('sort', io, o.error.replace('opzione non valida', 'invalid option'));
  const { inputs, failed } = readInputs(rt, io, 'sort', o.rest);
  let lines = inputs.flatMap((i) => splitLines(i.text));
  const sep = o.values.t?.[0];
  const k = o.values.k?.[0] ? parseInt(o.values.k[0], 10) : 0;
  const key = (l: string): string => {
    if (!k) return l;
    const parts = sep ? l.split(sep) : l.trim().split(/\s+/);
    return parts[k - 1] ?? '';
  };
  const cmp = (a: string, b: string): number => {
    const ka = key(a);
    const kb = key(b);
    if (o.flags.has('n')) return (parseFloat(ka) || 0) - (parseFloat(kb) || 0) || (a < b ? -1 : a > b ? 1 : 0);
    const x = o.flags.has('f') ? ka.toLowerCase() : ka;
    const y = o.flags.has('f') ? kb.toLowerCase() : kb;
    return x.localeCompare(y, 'en') || (a < b ? -1 : a > b ? 1 : 0);
  };
  lines.sort(cmp);
  if (o.flags.has('r')) lines.reverse();
  if (o.flags.has('u')) lines = lines.filter((l, i) => i === 0 || key(l) !== key(lines[i - 1]));
  io.out(joinLines(lines));
  return failed ? 2 : 0;
});

reg('uniq', (args, io, rt) => {
  const o = getopt(args, { flags: 'cdui' });
  if (o.error) return badOpt('uniq', io, o.error.replace('opzione non valida', 'invalid option'));
  const { inputs, failed } = readInputs(rt, io, 'uniq', o.rest.slice(0, 1));
  const lines = splitLines(inputs[0]?.text ?? '');
  const groups: { line: string; n: number }[] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    const same = last && (o.flags.has('i') ? last.line.toLowerCase() === l.toLowerCase() : last.line === l);
    if (same) last.n++;
    else groups.push({ line: l, n: 1 });
  }
  for (const g of groups) {
    if (o.flags.has('d') && g.n < 2) continue;
    if (o.flags.has('u') && g.n > 1) continue;
    io.out((o.flags.has('c') ? String(g.n).padStart(7) + ' ' : '') + g.line + '\n');
  }
  return failed ? 1 : 0;
});

reg('cut', (args, io, rt) => {
  const o = getopt(args, { flags: 's', values: 'dfc' });
  if (o.error) return badOpt('cut', io, o.error.replace('opzione non valida', 'invalid option'));
  const spec = o.values.f?.[0] ?? o.values.c?.[0];
  if (!spec) {
    io.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n");
    return 1;
  }
  const pick = (n: number): boolean =>
    spec.split(',').some((part) => {
      const m = /^(\d*)-?(\d*)$/.exec(part);
      if (!m) return false;
      if (!part.includes('-')) return n === parseInt(part, 10);
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : Infinity;
      return n >= a && n <= b;
    });
  const { inputs, failed } = readInputs(rt, io, 'cut', o.rest);
  const delim = o.values.d?.[0] ?? '\t';
  for (const inp of inputs) {
    for (const line of splitLines(inp.text)) {
      if (o.values.c) io.out([...line].filter((_, i) => pick(i + 1)).join('') + '\n');
      else if (!line.includes(delim)) {
        if (!o.flags.has('s')) io.out(line + '\n');
      } else io.out(line.split(delim).filter((_, i) => pick(i + 1)).join(delim) + '\n');
    }
  }
  return failed ? 1 : 0;
});

function expandSet(s: string): string {
  s = s.replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz').replace(/\[:digit:\]/g, '0123456789').replace(/\[:space:\]/g, ' \t\n');
  return s.replace(/(.)-(.)/g, (_, a: string, b: string) => {
    let out = '';
    for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) out += String.fromCharCode(c);
    return out;
  });
}

reg('tr', (args, io) => {
  const o = getopt(args, { flags: 'dsc' });
  if (o.error) return badOpt('tr', io, o.error.replace('opzione non valida', 'invalid option'));
  if (!o.rest.length) {
    io.err("tr: missing operand\nTry 'tr --help' for more information.\n");
    return 1;
  }
  const a = expandSet(unescape(o.rest[0]));
  const b = o.rest[1] !== undefined ? expandSet(unescape(o.rest[1])) : '';
  let out = '';
  for (const ch of io.stdin) {
    const idx = a.indexOf(ch);
    if (o.flags.has('d')) {
      if (idx < 0) out += ch;
    } else if (idx >= 0 && b) out += b[Math.min(idx, b.length - 1)];
    else out += ch;
  }
  if (o.flags.has('s') && !b) out = out.replace(new RegExp(`([${a.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1');
  else if (o.flags.has('s') && b) out = out.replace(new RegExp(`([${b.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1');
  io.out(out);
  return 0;
});

reg('sed', (args, io, rt) => {
  const o = getopt(args, { flags: 'niE', values: 'e' });
  if (o.error) return badOpt('sed', io, o.error.replace('opzione non valida', 'invalid option'));
  const rest = [...o.rest];
  const scripts = o.values.e ? [...o.values.e] : rest.length ? [rest.shift()!] : [];
  if (!scripts.length) {
    io.err('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n');
    return 1;
  }
  type Op = { addr: ((n: number, line: string, total: number) => boolean) | null; run: (line: string) => string | null; print?: boolean };
  const ops: Op[] = [];
  for (const sc of scripts.flatMap((s) => s.split(/;|\n/)).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(?:(\d+|\$|\/[^/]*\/)(?:,(\d+|\$))?)?\s*([sdp])(.*)$/.exec(sc);
    if (!m) {
      io.err(`sed: -e expression #1, char ${sc.length}: unknown command: \`${sc[0]}'\n`);
      return 1;
    }
    const [, a1, a2, cmd, tail] = m;
    const addr = a1
      ? (n: number, line: string, total: number): boolean => {
          const test = (a: string): boolean => (a === '$' ? n === total : a.startsWith('/') ? new RegExp(a.slice(1, -1)).test(line) : n === parseInt(a, 10));
          if (a2) {
            const s = a1 === '$' ? total : parseInt(a1, 10);
            const e = a2 === '$' ? total : parseInt(a2, 10);
            return n >= s && n <= e;
          }
          return test(a1);
        }
      : null;
    if (cmd === 'd') ops.push({ addr, run: () => null });
    else if (cmd === 'p') ops.push({ addr, run: (l) => l, print: true });
    else {
      const delim = tail[0];
      const parts = tail.slice(1).split(delim);
      if (parts.length < 2) {
        io.err('sed: -e expression #1: unterminated `s\' command\n');
        return 1;
      }
      const flags = parts[2] ?? '';
      let re: RegExp;
      try {
        re = new RegExp(o.flags.has('E') ? parts[0] : parts[0].replace(/\\([(){}|+?])/g, '$1'), (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : ''));
      } catch {
        io.err('sed: -e expression #1: invalid regular expression\n');
        return 1;
      }
      const repl = parts[1].replace(/\\(\d)/g, '$$$1').replace(/&/g, '$$&');
      ops.push({ addr, run: (l) => l.replace(re, repl) });
    }
  }
  const { inputs, failed } = readInputs(rt, io, 'sed', rest);
  inputs.forEach((inp, fi) => {
    const lines = splitLines(inp.text);
    const outLines: string[] = [];
    lines.forEach((orig, idx) => {
      let line: string | null = orig;
      for (const op of ops) {
        if (line === null) break;
        if (op.addr && !op.addr(idx + 1, line, lines.length)) continue;
        if (op.print) {
          outLines.push(line);
          continue;
        }
        line = op.run(line);
      }
      if (line !== null && !o.flags.has('n')) outLines.push(line);
    });
    if (o.flags.has('i') && inp.name !== '-') {
      try {
        rt.vfs.writeFile(rt.resolve(inp.name), joinLines(outLines));
      } catch (e) {
        io.err(`sed: ${inp.name}: ${e instanceof FsError ? fsErrorMessage(e, inp.name) : e}\n`);
      }
    } else io.out(joinLines(outLines));
    void fi;
  });
  return failed ? 2 : 0;
});

reg('awk', (args, io, rt) => {
  const o = getopt(args, { flags: '', values: 'F' });
  if (o.error) return badOpt('awk', io, o.error.replace('opzione non valida', 'invalid option'));
  const prog = o.rest.shift();
  if (!prog) {
    io.err('usage: awk [-F fs] \'program\' [file ...]\n');
    return 2;
  }
  const m = /^\s*(?:(\/.*?\/|NR\s*(?:==|>=|<=|>|<|!=)\s*\d+|\$\d+\s*(?:==|!=|~)\s*"?[^"{]*"?)\s*)?(?:\{\s*(.*?)\s*\})?\s*(?:END\s*\{\s*(.*?)\s*\})?\s*$/s.exec(prog);
  if (!m) {
    io.err(`awk: sintassi non supportata nel laboratorio: ${prog}\n`);
    return 2;
  }
  const [, cond, action, end] = m;
  const fs = o.values.F?.[0];
  const { inputs, failed } = readInputs(rt, io, 'awk', o.rest);
  let nr = 0;
  const evalExpr = (e: string, fields: string[], line: string): string =>
    e
      .split(/\s*,\s*/)
      .map((t) => {
        t = t.trim();
        if (/^".*"$/.test(t)) return t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        if (t === '$0') return line;
        if (/^\$\d+$/.test(t)) return fields[parseInt(t.slice(1), 10) - 1] ?? '';
        if (t === 'NR') return String(nr);
        if (t === 'NF') return String(fields.length);
        if (t === '$NF') return fields[fields.length - 1] ?? '';
        return t;
      })
      .join(' ');
  const test = (fields: string[], line: string): boolean => {
    if (!cond) return true;
    if (cond.startsWith('/')) return new RegExp(cond.slice(1, -1)).test(line);
    const nm = /^NR\s*(==|>=|<=|>|<|!=)\s*(\d+)$/.exec(cond);
    if (nm) {
      const v = parseInt(nm[2], 10);
      return nm[1] === '==' ? nr === v : nm[1] === '>=' ? nr >= v : nm[1] === '<=' ? nr <= v : nm[1] === '>' ? nr > v : nm[1] === '<' ? nr < v : nr !== v;
    }
    const fm = /^\$(\d+)\s*(==|!=|~)\s*"?([^"]*)"?$/.exec(cond);
    if (fm) {
      const f = fields[parseInt(fm[1], 10) - 1] ?? '';
      return fm[2] === '==' ? f === fm[3] : fm[2] === '!=' ? f !== fm[3] : new RegExp(fm[3]).test(f);
    }
    return true;
  };
  for (const inp of inputs) {
    for (const line of splitLines(inp.text)) {
      nr++;
      const fields = fs ? line.split(fs) : line.trim().split(/\s+/).filter(Boolean);
      if (!test(fields, line)) continue;
      if (action === undefined && !cond) continue;
      const act = action ?? 'print';
      const pm = /^print(?:\s+(.*))?$/.exec(act.trim());
      if (!pm) {
        io.err(`awk: azione non supportata nel laboratorio: ${act}\n`);
        return 2;
      }
      io.out((pm[1] ? evalExpr(pm[1], fields, line) : line) + '\n');
    }
  }
  if (end) {
    const pm = /^print\s+(.*)$/.exec(end.trim());
    if (pm) io.out(evalExpr(pm[1], [], '') + '\n');
  }
  return failed ? 2 : 0;
});

reg('diff', (args, io, rt) => {
  const files = args.filter((a) => !a.startsWith('-'));
  if (files.length !== 2) {
    io.err("diff: missing operand\n");
    return 2;
  }
  const { inputs, failed } = readInputs(rt, io, 'diff', files);
  if (failed || inputs.length < 2) return 2;
  const out = unifiedDiff(splitLines(inputs[0].text), splitLines(inputs[1].text), files[0], files[1]);
  io.out(out);
  return out ? 1 : 0;
});

reg('less', (args, io, rt) => COMMANDS.get('cat')!(args, io, rt));
reg('more', (args, io, rt) => COMMANDS.get('cat')!(args, io, rt));

reg('xargs', (args, io, rt) => {
  if (!args.length) args = ['echo'];
  const items = io.stdin.split(/\s+/).filter(Boolean);
  if (!items.length) return 0;
  return rt.runCommand(args[0], [...args.slice(1), ...items], io);
});

// ---------------- processi ----------------
const PROCS = [
  { pid: 1, user: 'root', cmd: '/sbin/init', tty: '?' },
  { pid: 118, user: 'root', cmd: '/usr/sbin/sshd -D', tty: '?' },
  { pid: 412, user: 'taskflow', cmd: 'taskflow-api --port 8080 --env development', tty: '?' },
  { pid: 530, user: 'learner', cmd: 'bash', tty: 'pts/0' },
];
reg('ps', (args, io) => {
  if (args.some((a) => a.includes('a') || a.includes('e') || a === '-ef')) {
    io.out('USER         PID %CPU %MEM COMMAND\n');
    for (const p of PROCS) io.out(`${p.user.padEnd(12)} ${String(p.pid).padStart(4)}  0.0  0.1 ${p.cmd}\n`);
  } else {
    io.out('  PID TTY          TIME CMD\n  530 pts/0    00:00:00 bash\n  611 pts/0    00:00:00 ps\n');
  }
  return 0;
});
reg('kill', (args, io) => {
  if (args[0] === '-l') {
    io.out('HUP INT QUIT KILL TERM\n');
    return 0;
  }
  let code = 0;
  for (const a of args.filter((x) => !x.startsWith('-'))) {
    const pid = parseInt(a, 10);
    const p = PROCS.find((x) => x.pid === pid);
    if (!p) {
      io.err(`bash: kill: (${a}) - No such process\n`);
      code = 1;
    } else if (p.user !== 'learner') {
      io.err(`bash: kill: (${a}) - Operation not permitted\n`);
      code = 1;
    } else io.err('(il processo della shell non può essere terminato dal laboratorio)\n');
  }
  return code;
});

// ---------------- rete / JSON ----------------
reg('curl', (args, io, rt) => curl(args, io, rt, 'bash', 'curl'));

reg('jq', (args, io, rt) => {
  const o = getopt(args, { flags: 'rcsenj' });
  if (o.error) {
    io.err(`jq: error: ${o.error}\n`);
    return 2;
  }
  const filter = o.rest.shift();
  if (filter === undefined) {
    io.err('Usage:\tjq [OPTIONS] FILTER [FILES...]\n');
    return 2;
  }
  const { inputs, failed } = readInputs(rt, io, 'jq', o.rest);
  try {
    for (const inp of inputs) {
      let docs = parseJsonStream(inp.text);
      if (o.flags.has('s')) docs = [docs];
      for (const d of docs) {
        for (const r of runJq(filter, d)) {
          io.out((o.flags.has('r') && typeof r === 'string' ? r : formatJson(r, o.flags.has('c'))) + '\n');
        }
      }
    }
  } catch (e) {
    if (e instanceof JqError) {
      io.err(e.code === 3 ? `jq: error: ${e.message}\njq: 1 compile error\n` : `jq: error (at <stdin>:0): ${e.message}\n`);
      return e.code;
    }
    throw e;
  }
  return failed ? 2 : 0;
});

void glob;
void resolvePath;
void CREDENTIALS;
