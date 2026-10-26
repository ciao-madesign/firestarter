/** Cmdlet PowerShell simulati. L'elenco documentato è in catalog.ts. */
import { FsError, basename, dirname } from '../vfs.ts';
import { byteLen, getopt } from '../util.ts';
import { base64, lowerHeaders, performHttp } from '../http.ts';
import { netError } from '../bash/curl.ts';
import { API_VERSION } from '../api/spec.ts';
import { psAliases, renderHelp, findDoc, commandsFor } from '../catalog.ts';
import type { HttpRequest } from '../api/server.ts';
import type { PsRuntime } from './interp.ts';
import { PsParser } from './parser.ts';
import { getMember } from './members.ts';
import {
  PSError, PSFormatted, PSObject, PSScriptBlock, custom, enumValue, formatItems, formatList, formatTable, fromJsonValue, hash, jsonString, psCompare, psEqual, psToString,
  toArray, toJsonValue, truthy, fmtDateTime,
} from './values.ts';
import { DOTNET_FMT, makeDate } from './members.ts';

export interface ParamSpec {
  name: string;
  aliases: string[];
  pos?: number;
  sw: boolean;
}

export function parseParamSpec(spec: string): ParamSpec[] {
  return spec
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((p) => {
      const sw = p.endsWith('!');
      if (sw) p = p.slice(0, -1);
      let pos: number | undefined;
      const pm = /:(\d+)$/.exec(p);
      if (pm) {
        pos = parseInt(pm[1], 10);
        p = p.slice(0, pm.index);
      }
      const [name, ...aliases] = p.split('|');
      return { name, aliases, pos, sw };
    });
}

export interface CmdCtx {
  rt: PsRuntime;
  name: string;
  input: unknown[];
  bound: Map<string, unknown>;
  extra: unknown[];
  raw: { name: string; value: unknown; has: boolean }[];
  errorAction?: string;
  get(name: string): unknown;
  has(name: string): boolean;
}

export interface CmdletDef {
  name: string;
  spec: ParamSpec[];
  run: (c: CmdCtx) => unknown[] | void;
  rawOps?: boolean;
}

export const CMDLETS = new Map<string, CmdletDef>();

function def(name: string, spec: string, run: CmdletDef['run'], rawOps = false): void {
  CMDLETS.set(name.toLowerCase(), { name, spec: parseParamSpec(spec), run, rawOps });
}

function fail(c: CmdCtx, e: PSError): void {
  e.cmdName = e.cmdName || c.name;
  c.rt.nonTerminating(e, c.errorAction);
}

function pathErr(c: CmdCtx, path: string, cmd: string, cmdClass: string): PSError {
  return new PSError(`Cannot find path '${path}' because it does not exist.`, 'ObjectNotFound', `PathNotFound,Microsoft.PowerShell.Commands.${cmdClass}Command`, `${path}:String`, cmd);
}

function asStrings(v: unknown): string[] {
  return toArray(v).map(psToString);
}

function pathsOf(c: CmdCtx, ...names: string[]): string[] {
  for (const n of names) if (c.has(n)) return asStrings(c.get(n));
  return [];
}

function fileObj(c: CmdCtx, abs: string): PSObject {
  const n = c.rt.vfs.get(abs)!;
  const isDir = n.type === 'dir';
  const hidden = basename(abs).startsWith('.');
  const mode = (isDir ? 'd' : '-') + (isDir ? '-' : 'a') + '-' + (hidden ? 'h' : '-') + '--' + (n.mode & 0o222 ? '-' : 'r');
  const nm = basename(abs);
  return new PSObject(isDir ? 'DirectoryInfo' : 'FileInfo', {
    Mode: isDir ? 'd-----' : mode.replace(/^-a-h--[-r]$/, '-a-h--').replace(/^(.{6}).*/, '$1').padEnd(6, '-'),
    LastWriteTime: makeDate(n.mtime),
    Length: isDir ? null : byteLen(n.content),
    Name: nm,
    FullName: abs,
    DirectoryName: isDir ? dirname(abs) : dirname(abs),
    BaseName: isDir ? nm : nm.replace(/\.[^.]*$/, ''),
    Extension: isDir || !nm.includes('.') ? '' : '.' + nm.split('.').pop(),
    Exists: true,
    __sec: n.mtime,
  });
}

// ---------------- navigazione e file ----------------
def('Get-Location', 'PSProvider, PSDrive', (c) => [custom({ Path: c.rt.cwd })]);

def('Set-Location', 'Path|LiteralPath:0, PassThru!', (c) => {
  const p = psToString(c.get('Path') ?? '~');
  const target = p === '~' || p === '' ? '~' : p === '-' ? (c.rt.env('OLDPWD') ?? c.rt.cwd) : p;
  const abs = c.rt.rp(target);
  if (!c.rt.vfs.exists(abs)) {
    fail(c, pathErr(c, abs, 'Set-Location', 'SetLocation'));
    return;
  }
  if (!c.rt.vfs.isDir(abs)) {
    fail(c, new PSError(`Cannot set location to '${abs}' because it is not a directory.`, 'InvalidArgument', 'PathNotDirectory', abs, 'Set-Location'));
    return;
  }
  c.rt.setEnv('OLDPWD', c.rt.cwd);
  c.rt.ss.cwd = abs;
  c.rt.setEnv('PWD', abs);
  return c.get('PassThru') ? [custom({ Path: abs })] : [];
});

def('Get-ChildItem', 'Path|LiteralPath:0, Filter:1, Recurse|r!, Force!, Name!, File!, Directory|ad!, Include, Exclude, Depth', (c) => {
  const paths = pathsOf(c, 'Path');
  const targets = paths.length ? paths : ['.'];
  const filter = c.has('Filter') ? psToString(c.get('Filter')) : null;
  const re = filter ? new RegExp('^' + filter.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
  const out: unknown[] = [];
  const names = !!c.get('Name');
  const accept = (abs: string): boolean => {
    const n = c.rt.vfs.get(abs)!;
    const nm = basename(abs);
    if (!c.get('Force') && nm.startsWith('.')) return false;
    if (c.get('File') && n.type !== 'file') return false;
    if (c.get('Directory') && n.type !== 'dir') return false;
    if (re && !re.test(nm)) return false;
    return true;
  };
  for (const t of targets) {
    const envDrive = /^env:[\\/]?(.*)$/i.exec(t);
    if (envDrive) {
      const pat = envDrive[1];
      const pre = pat ? new RegExp('^' + pat.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
      const vars = Object.keys(c.rt.ss.env).filter((k) => !pre || pre.test(k)).sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
      if (pre && !vars.length && !/[*?]/.test(pat)) fail(c, new PSError(`Cannot find path 'Env:\\${pat}' because it does not exist.`, 'ObjectNotFound', 'PathNotFound,Microsoft.PowerShell.Commands.GetChildItemCommand', `Env:\\${pat}`, 'Get-ChildItem'));
      for (const k of vars) out.push(names ? k : custom({ Name: k, Value: c.rt.ss.env[k] }));
      continue;
    }
    const hasGlob = /[*?]/.test(t);
    const base = hasGlob ? c.rt.rp(t.replace(/[^/\\]*$/, '') || '.') : c.rt.rp(t);
    const gre = hasGlob ? new RegExp('^' + (t.split(/[\\/]/).pop() ?? '').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
    if (!c.rt.vfs.exists(base)) {
      fail(c, pathErr(c, c.rt.rp(t), 'Get-ChildItem', 'GetChildItem'));
      continue;
    }
    if (c.rt.vfs.isFile(base)) {
      out.push(names ? basename(base) : fileObj(c, base));
      continue;
    }
    const list: string[] = [];
    if (c.get('Recurse')) list.push(...c.rt.vfs.descendants(base));
    else {
      try {
        list.push(...c.rt.vfs.list(base).map((n) => (base === '/' ? '' : base) + '/' + n));
      } catch (e) {
        if (e instanceof FsError) fail(c, new PSError(`Access to the path '${base}' is denied.`, 'PermissionDenied', 'DirUnauthorizedAccessError,Microsoft.PowerShell.Commands.GetChildItemCommand', base, 'Get-ChildItem'));
        else throw e;
      }
    }
    for (const abs of list) {
      if (gre && !gre.test(basename(abs))) continue;
      if (!accept(abs)) continue;
      out.push(names ? (c.get('Recurse') ? abs.slice(base.length + 1) : basename(abs)) : fileObj(c, abs));
    }
  }
  return out;
});

def('Get-Item', 'Path|LiteralPath:0, Force!', (c) => {
  const out: unknown[] = [];
  for (const p of pathsOf(c, 'Path')) {
    const abs = c.rt.rp(p);
    if (!c.rt.vfs.exists(abs)) fail(c, pathErr(c, abs, 'Get-Item', 'GetItem'));
    else out.push(fileObj(c, abs));
  }
  return out;
});

def('Get-Content', 'Path|LiteralPath:0, TotalCount|First|Head:1, Tail, Raw!, Encoding', (c) => {
  const out: unknown[] = [];
  const paths = pathsOf(c, 'Path');
  if (!paths.length) {
    return c.input;
  }
  for (const p of paths) {
    const abs = c.rt.rp(p);
    if (!c.rt.vfs.exists(abs)) {
      fail(c, pathErr(c, abs, 'Get-Content', 'GetContent'));
      continue;
    }
    if (c.rt.vfs.isDir(abs)) {
      fail(c, new PSError(`Access to the path '${abs}' is denied.`, 'PermissionDenied', 'GetContentReaderUnauthorizedAccessError,Microsoft.PowerShell.Commands.GetContentCommand', abs, 'Get-Content'));
      continue;
    }
    let text: string;
    try {
      text = c.rt.vfs.readFile(abs);
    } catch {
      fail(c, new PSError(`Access to the path '${abs}' is denied.`, 'PermissionDenied', 'GetContentReaderUnauthorizedAccessError,Microsoft.PowerShell.Commands.GetContentCommand', abs, 'Get-Content'));
      continue;
    }
    if (c.get('Raw')) {
      out.push(text);
      continue;
    }
    let lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    lines = lines.map((l) => l.replace(/\r$/, ''));
    if (c.has('TotalCount')) lines = lines.slice(0, Number(c.get('TotalCount')));
    if (c.has('Tail')) lines = lines.slice(-Number(c.get('Tail')));
    out.push(...lines);
  }
  return out;
});

function contentText(items: unknown[]): string {
  const lines = items.flatMap((i) => (Array.isArray(i) ? i : [i])).map(psToString);
  return lines.length ? lines.join('\n') + '\n' : '';
}

def('Set-Content', 'Path|LiteralPath:0, Value:1, Encoding, Force!, NoNewline!', (c) => {
  const text = contentText(c.has('Value') ? toArray(c.get('Value')) : c.input);
  for (const p of pathsOf(c, 'Path')) c.rt.writeFile(c.rt.rp(p), c.get('NoNewline') ? text.replace(/\n$/, '') : text, false);
  return [];
});
def('Add-Content', 'Path|LiteralPath:0, Value:1, Encoding, Force!, NoNewline!', (c) => {
  const text = contentText(c.has('Value') ? toArray(c.get('Value')) : c.input);
  for (const p of pathsOf(c, 'Path')) {
    const abs = c.rt.rp(p);
    c.rt.writeFile(abs, c.get('NoNewline') ? text.replace(/\n$/, '') : text, true);
  }
  return [];
});
def('Out-File', 'FilePath|Path:0, Append!, Encoding, Force!, NoNewline!', (c) => {
  const text = formatItems(c.input);
  const p = psToString(c.get('FilePath'));
  c.rt.writeFile(c.rt.rp(p), text, !!c.get('Append'));
  return [];
});

def('New-Item', 'Path:0, ItemType|Type:1, Value:2, Name, Force!', (c) => {
  const type = psToString(c.get('ItemType') ?? 'File').toLowerCase();
  const base = c.has('Path') ? psToString(c.get('Path')) : '.';
  const name = c.has('Name') ? psToString(c.get('Name')) : null;
  const full = c.rt.rp(name ? base.replace(/[\\/]$/, '') + '/' + name : base);
  const vfs = c.rt.vfs;
  try {
    if (vfs.exists(full) && !c.get('Force')) {
      fail(c, new PSError(`An item with the specified name ${full} already exists.`, 'ResourceExists', 'NewItemIOError,Microsoft.PowerShell.Commands.NewItemCommand', full, 'New-Item'));
      return [];
    }
    if (type === 'directory' || type === 'dir') {
      vfs.mkdir(full, !!c.get('Force'));
    } else {
      if (!vfs.exists(dirname(full))) throw new FsError('ENOENT', full);
      vfs.writeFile(full, c.has('Value') ? contentText(toArray(c.get('Value'))).replace(/\n$/, '') : '');
    }
  } catch (e) {
    if (e instanceof FsError) {
      const msg = e.code === 'ENOENT' ? `Could not find a part of the path '${full}'.` : e.code === 'EACCES' ? `Access to the path '${full}' is denied.` : e.message;
      fail(c, new PSError(msg, e.code === 'EACCES' ? 'PermissionDenied' : 'WriteError', 'NewItemIOError,Microsoft.PowerShell.Commands.NewItemCommand', full, 'New-Item'));
      return [];
    }
    throw e;
  }
  return [fileObj(c, full)];
});

def('mkdir', 'Path:0, Force!', (c) => {
  const out: unknown[] = [];
  for (const p of pathsOf(c, 'Path')) {
    const full = c.rt.rp(p);
    try {
      if (c.rt.vfs.exists(full) && !c.get('Force')) {
        fail(c, new PSError(`An item with the specified name ${full} already exists.`, 'ResourceExists', 'DirectoryExist,Microsoft.PowerShell.Commands.NewItemCommand', full, 'New-Item'));
        continue;
      }
      c.rt.vfs.mkdir(full, true);
      out.push(fileObj(c, full));
    } catch (e) {
      if (e instanceof FsError) fail(c, new PSError(`Access to the path '${full}' is denied.`, 'PermissionDenied', 'NewItemUnauthorizedAccessError,Microsoft.PowerShell.Commands.NewItemCommand', full, 'New-Item'));
      else throw e;
    }
  }
  return out;
});

def('Remove-Item', 'Path|LiteralPath:0, Recurse!, Force!, Confirm!, WhatIf!', (c) => {
  for (const p of pathsOf(c, 'Path')) {
    const abs = c.rt.rp(p);
    if (!c.rt.vfs.exists(abs)) {
      fail(c, pathErr(c, abs, 'Remove-Item', 'RemoveItem'));
      continue;
    }
    if (c.rt.vfs.isDir(abs) && c.rt.vfs.descendants(abs).length && !c.get('Recurse')) {
      fail(c, new PSError(`The item at ${abs} has children and the Recurse parameter was not specified. If you continue, all children will be removed with the item.`, 'InvalidOperation', 'RemoveFileSystemItemInvalidOperation,Microsoft.PowerShell.Commands.RemoveItemCommand', abs, 'Remove-Item'));
      continue;
    }
    try {
      c.rt.vfs.remove(abs, true);
    } catch (e) {
      if (e instanceof FsError) fail(c, new PSError(`Access to the path '${abs}' is denied.`, 'PermissionDenied', 'RemoveFileSystemItemUnAuthorizedAccess,Microsoft.PowerShell.Commands.RemoveItemCommand', abs, 'Remove-Item'));
      else throw e;
    }
  }
  return [];
});

function copyMove(which: 'Copy-Item' | 'Move-Item'): CmdletDef['run'] {
  return (c) => {
    const dst = psToString(c.get('Destination'));
    const dAbs = c.rt.rp(dst);
    for (const p of pathsOf(c, 'Path')) {
      const s = c.rt.rp(p);
      if (!c.rt.vfs.exists(s)) {
        fail(c, pathErr(c, s, which, which === 'Copy-Item' ? 'CopyItem' : 'MoveItem'));
        continue;
      }
      const target = c.rt.vfs.isDir(dAbs) ? dAbs + '/' + basename(s) : dAbs;
      try {
        if (which === 'Copy-Item') {
          if (c.rt.vfs.isDir(s) && !c.get('Recurse')) {
            // PowerShell copia la cartella vuota senza il contenuto
            c.rt.vfs.mkdir(target, true);
          } else c.rt.vfs.copy(s, target);
        } else c.rt.vfs.move(s, target);
      } catch (e) {
        if (e instanceof FsError) fail(c, new PSError(`Cannot ${which === 'Copy-Item' ? 'copy' : 'move'} item to '${target}': ${e.message}`, 'WriteError', 'CopyItemIOError', target, which));
        else throw e;
      }
    }
    return [];
  };
}
def('Copy-Item', 'Path:0, Destination:1, Recurse!, Force!', copyMove('Copy-Item'));
def('Move-Item', 'Path:0, Destination:1, Force!', copyMove('Move-Item'));
def('Rename-Item', 'Path:0, NewName:1', (c) => {
  const s = c.rt.rp(psToString(c.get('Path')));
  if (!c.rt.vfs.exists(s)) {
    fail(c, pathErr(c, s, 'Rename-Item', 'RenameItem'));
    return [];
  }
  try {
    c.rt.vfs.move(s, dirname(s) + '/' + psToString(c.get('NewName')));
  } catch (e) {
    if (e instanceof FsError) fail(c, new PSError(`Cannot rename: ${e.message}`, 'WriteError', 'RenameItemIOError', s, 'Rename-Item'));
    else throw e;
  }
  return [];
});

def('Test-Path', 'Path|LiteralPath:0, PathType', (c) => {
  const type = c.has('PathType') ? psToString(c.get('PathType')).toLowerCase() : '';
  return pathsOf(c, 'Path').map((p) => {
    const abs = c.rt.rp(p);
    if (type === 'leaf') return c.rt.vfs.isFile(abs);
    if (type === 'container') return c.rt.vfs.isDir(abs);
    return c.rt.vfs.exists(abs);
  });
});

def('Split-Path', 'Path:0, Leaf!, Parent!', (c) =>
  asStrings(c.get('Path')).map((p) => (c.get('Leaf') ? (p.split(/[\\/]/).pop() ?? '') : p.replace(/[\\/][^\\/]*$/, '') || '/')),
);
def('Join-Path', 'Path:0, ChildPath:1', (c) => [psToString(c.get('Path')).replace(/[\\/]$/, '') + '/' + psToString(c.get('ChildPath'))]);
def('Resolve-Path', 'Path:0', (c) => {
  const out: unknown[] = [];
  for (const p of pathsOf(c, 'Path')) {
    const abs = c.rt.rp(p);
    if (!c.rt.vfs.exists(abs)) fail(c, pathErr(c, abs, 'Resolve-Path', 'ResolvePath'));
    else out.push(custom({ Path: abs }));
  }
  return out;
});

// ---------------- output ----------------
def('Write-Output', 'InputObject:0', (c) => (c.has('InputObject') ? [c.get('InputObject'), ...c.extra].flatMap((x) => (Array.isArray(x) ? x : [x])) : c.input));
def('Write-Host', 'Object:0, ForegroundColor|fore, BackgroundColor|back, NoNewline!, Separator', (c) => {
  const items = [c.get('Object'), ...c.extra].filter((x, i) => i === 0 ? c.has('Object') : true);
  c.rt.io.out(items.map(psToString).join(c.has('Separator') ? psToString(c.get('Separator')) : ' ') + (c.get('NoNewline') ? '' : '\n'));
  return [];
});
def('Write-Error', 'Message:0, Category, ErrorId', (c) => {
  const msg = psToString(c.get('Message'));
  const e = new PSError(msg, 'NotSpecified', 'Microsoft.PowerShell.Commands.WriteErrorException', '', 'Write-Error');
  c.rt.nonTerminating(e, c.errorAction);
  return [];
});
def('Write-Warning', 'Message:0', (c) => {
  c.rt.io.out(`WARNING: ${psToString(c.get('Message'))}\n`);
  return [];
});
def('Out-Null', '', () => []);
def('Out-Host', '', (c) => {
  c.rt.emit(c.input);
  return [];
});
def('Out-String', 'Stream!, Width', (c) => [formatItems(c.input).replace(/^\n/, '').replace(/\n+$/, '\n')]);
def('Clear-Host', '', (c) => {
  c.rt.clearFlag = true;
  return [];
});

// ---------------- pipeline ----------------
def('Select-String', 'Pattern:0, Path|LiteralPath:1, SimpleMatch!, CaseSensitive!, NotMatch!, Context, AllMatches!', (c) => {
  const pats = asStrings(c.get('Pattern'));
  const flags = c.get('CaseSensitive') ? '' : 'i';
  let res: RegExp[];
  try {
    res = pats.map((p) => new RegExp(c.get('SimpleMatch') ? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : p, flags));
  } catch {
    fail(c, new PSError(`Cannot find the regex '${pats[0]}'.`, 'InvalidArgument', 'InvalidRegex', pats[0], 'Select-String'));
    return [];
  }
  const out: unknown[] = [];
  const scan = (lines: string[], path: string | null, rel: string | null): void => {
    lines.forEach((line, i) => {
      const m = res.map((r) => r.exec(line)).find(Boolean);
      if ((m !== undefined) === !c.get('NotMatch')) {
        out.push(new PSObject('MatchInfo', { Line: line, LineNumber: i + 1, Path: path, RelPath: rel, Filename: path ? basename(path) : 'InputStream', Pattern: pats[0], Matches: m ? [custom({ Value: m[0], Index: m.index })] : [] }));
      }
    });
  };
  const paths = pathsOf(c, 'Path');
  if (paths.length) {
    for (const p of paths) {
      const targets: string[] = /[*?]/.test(p) ? globPs(c, p) : [c.rt.rp(p)];
      if (!targets.length) fail(c, pathErr(c, c.rt.rp(p), 'Select-String', 'SelectString'));
      for (const abs of targets) {
        if (!c.rt.vfs.exists(abs)) {
          fail(c, new PSError(`Cannot find path '${abs}' because it does not exist.`, 'ObjectNotFound', 'FileOpenFailure,Microsoft.PowerShell.Commands.SelectStringCommand', abs, 'Select-String'));
          continue;
        }
        if (c.rt.vfs.isDir(abs)) continue;
        const text = c.rt.vfs.readFile(abs);
        const lines = text.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        const rel = abs.startsWith(c.rt.cwd + '/') ? abs.slice(c.rt.cwd.length + 1) : abs;
        scan(lines, abs, p.includes('/') || p.includes('\\') ? p.replace(/\\/g, '/') : rel);
      }
    }
  } else {
    scan(c.input.flatMap((x) => psToString(x).split('\n')), null, null);
  }
  return out;
});

function globPs(c: CmdCtx, pattern: string): string[] {
  const dir = c.rt.rp(pattern.replace(/[^/\\]*$/, '') || '.');
  const re = new RegExp('^' + (pattern.split(/[\\/]/).pop() ?? '').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  try {
    return c.rt.vfs.list(dir).filter((n) => re.test(n)).map((n) => (dir === '/' ? '' : dir) + '/' + n);
  } catch {
    return [];
  }
}

def('Where-Object', 'FilterScript:0, Property, Value:1', (c) => {
  const fs = c.get('FilterScript');
  if (fs instanceof PSScriptBlock) return c.input.filter((it) => truthy(unwrapAll(c.rt.invokeWithItem(fs, it))));
  // sintassi semplificata: Where-Object Proprieta -eq valore  oppure  Where-Object -Property Proprieta -eq -Value valore
  const explicitProp = c.has('Property');
  const prop = psToString(explicitProp ? c.get('Property') : fs);
  const opParam = c.raw.find((r) => /^(eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|is|isnot|ceq|cne)$/i.test(r.name));
  const val = c.has('Value') ? c.get('Value') : explicitProp && fs !== undefined ? fs : c.extra.length ? c.extra[0] : opParam?.value;
  return c.input.filter((it) => {
    const left = it instanceof PSObject ? it.get(prop) : null;
    if (!opParam) return truthy(left);
    return truthy(c.rt.binary(opParam.name.toLowerCase(), left, val));
  });
}, true);

function unwrapAll(a: unknown[]): unknown {
  return a.length === 0 ? null : a.length === 1 ? a[0] : a;
}

def('ForEach-Object', 'Process|MemberName:0, Begin, End', (c) => {
  const p = c.get('Process');
  if (p instanceof PSScriptBlock) {
    const out: unknown[] = [];
    for (const it of c.input) out.push(...c.rt.invokeWithItem(p, it));
    return out;
  }
  if (typeof p === 'string') {
    return c.input.map((it) => (it instanceof PSObject ? it.get(p) : null));
  }
  return [];
});

def('Select-Object', 'Property:0, First, Last, Skip, ExpandProperty, Unique!', (c) => {
  let items = [...c.input];
  if (c.has('Skip')) items = items.slice(Number(c.get('Skip')));
  if (c.has('First')) items = items.slice(0, Number(c.get('First')));
  if (c.has('Last')) items = items.slice(-Number(c.get('Last')));
  if (c.has('ExpandProperty')) {
    const p = psToString(c.get('ExpandProperty'));
    return items.flatMap((it) => {
      const v = getMember(c.rt, it, p);
      if ((v === null || v === undefined) && !(it instanceof PSObject && it.keys().some((k) => k.toLowerCase() === p.toLowerCase()))) {
        // la proprietà non esiste (diverso da "esiste ed è $null")
        fail(c, new PSError(`Property "${p}" cannot be found.`, 'InvalidArgument', 'ExpandPropertyNotFound,Microsoft.PowerShell.Commands.SelectObjectCommand', p, 'Select-Object'));
        return [];
      }
      return Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
    });
  }
  if (c.has('Property')) {
    const props = toArray(c.get('Property'));
    items = items.map((it) => {
      const o = custom();
      for (const p of props) {
        if (p instanceof PSObject && p.isHash) {
          const n = psToString(p.get('Name') ?? p.get('n') ?? p.get('Label') ?? p.get('l'));
          const e = p.get('Expression') ?? p.get('e');
          o.props[n] = e instanceof PSScriptBlock ? unwrapAll(c.rt.invokeWithItem(e, it)) : it instanceof PSObject ? it.get(psToString(e)) : null;
        } else {
          const name = psToString(p);
          if (name === '*' && it instanceof PSObject) Object.assign(o.props, it.props);
          else if (it instanceof PSObject) {
            const real = it.keys().find((k) => k.toLowerCase() === name.toLowerCase());
            o.props[real ?? name] = it.get(name);
          } else o.props[name] = null;
        }
      }
      return o;
    });
  }
  if (c.get('Unique')) {
    const seen = new Set<string>();
    items = items.filter((i) => {
      const k = JSON.stringify(toJsonValue(i, 3));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return items;
});

def('Sort-Object', 'Property:0, Descending!, Unique!, CaseSensitive!', (c) => {
  const prop = c.has('Property') ? toArray(c.get('Property'))[0] : null;
  const key = (it: unknown): unknown => {
    if (prop instanceof PSScriptBlock) return unwrapAll(c.rt.invokeWithItem(prop, it));
    if (prop !== null && it instanceof PSObject) return it.get(psToString(prop));
    return it;
  };
  let items = [...c.input].sort((a, b) => psCompare(key(a), key(b)));
  if (c.get('Descending')) items.reverse();
  if (c.get('Unique')) items = items.filter((it, i) => i === 0 || !psEqual(key(it), key(items[i - 1])));
  return items;
});

def('Measure-Object', 'Property:0, Sum!, Average!, Maximum!, Minimum!, Line!, Word!, Character!', (c) => {
  const items = c.input;
  if (c.get('Line') || c.get('Word') || c.get('Character')) {
    const text = items.map(psToString).join('\n');
    return [custom({ Lines: text ? text.split('\n').length : 0, Words: text.split(/\s+/).filter(Boolean).length, Characters: text.replace(/\n/g, '').length, Property: null })];
  }
  const prop = c.has('Property') ? psToString(c.get('Property')) : null;
  const vals = items.map((i) => (prop && i instanceof PSObject ? i.get(prop) : i)).filter((v) => typeof v === 'number') as number[];
  const o = custom({ Count: items.length, Average: null, Sum: null, Maximum: null, Minimum: null, Property: prop });
  if (vals.length) {
    const sum = vals.reduce((a, b) => a + b, 0);
    if (c.get('Sum')) o.props.Sum = sum;
    if (c.get('Average')) o.props.Average = sum / vals.length;
    if (c.get('Maximum')) o.props.Maximum = Math.max(...vals);
    if (c.get('Minimum')) o.props.Minimum = Math.min(...vals);
  }
  return [o];
});

def('Group-Object', 'Property:0, NoElement!', (c) => {
  const prop = psToString(c.get('Property'));
  const groups = new Map<string, unknown[]>();
  for (const it of c.input) {
    const k = psToString(it instanceof PSObject ? it.get(prop) : it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  return [...groups].map(([name, group]) => custom({ Count: group.length, Name: name, Group: c.get('NoElement') ? undefined : group }));
});

def('Format-Table', 'Property:0, AutoSize!, Wrap!', (c) => {
  const objs = c.input.filter((x): x is PSObject => x instanceof PSObject);
  if (!objs.length) return c.input.length ? [new PSFormatted(c.input.map(psToString).join('\n') + '\n')] : [];
  const props = c.has('Property') ? asStrings(c.get('Property')) : objs[0].keys().filter((k) => !k.startsWith('__'));
  return [new PSFormatted(formatTable(objs, props))];
});
def('Format-List', 'Property:0', (c) => {
  const objs = c.input.filter((x): x is PSObject => x instanceof PSObject);
  return [new PSFormatted(formatList(objs, c.has('Property') ? asStrings(c.get('Property')) : undefined))];
});

def('Compare-Object', 'ReferenceObject:0, DifferenceObject:1, Property', (c) => {
  const a = toArray(c.get('ReferenceObject'));
  const b = toArray(c.get('DifferenceObject'));
  const out: unknown[] = [];
  for (const x of a) if (!b.some((y) => psEqual(x, y, true))) out.push(custom({ InputObject: x, SideIndicator: '<=' }));
  for (const y of b) if (!a.some((x) => psEqual(x, y, true))) out.push(custom({ InputObject: y, SideIndicator: '=>' }));
  return out;
});

def('New-Object', 'TypeName:0, ArgumentList:1, Property', (c) => {
  const t = psToString(c.get('TypeName')).toLowerCase();
  if (t === 'psobject' || t === 'pscustomobject' || t === 'system.management.automation.psobject') {
    const p = c.get('Property');
    return [custom(p instanceof PSObject ? { ...p.props } : {})];
  }
  if (t === 'system.collections.hashtable' || t === 'hashtable') return [hash()];
  fail(c, new PSError(`Cannot find type [${psToString(c.get('TypeName'))}]: verify that the assembly containing this type is loaded.`, 'InvalidType', 'TypeNotFound,Microsoft.PowerShell.Commands.NewObjectCommand', t, 'New-Object'));
  return [];
});

// ---------------- JSON e HTTP ----------------
def('ConvertFrom-Json', 'InputObject:0', (c) => {
  const text = c.has('InputObject') ? psToString(c.get('InputObject')) : c.input.map(psToString).join('\n');
  try {
    const v = JSON.parse(text);
    return [fromJsonValue(v)];
  } catch {
    c.rt.nonTerminating(new PSError(`Invalid JSON primitive: ${text.slice(0, 20).split(/[\s{]/)[0]}.`, 'NotSpecified', 'System.ArgumentException,Microsoft.PowerShell.Commands.ConvertFromJsonCommand', text.slice(0, 20), 'ConvertFrom-Json'), 'Stop');
    return [];
  }
});
def('ConvertTo-Json', 'InputObject:0, Depth, Compress!', (c) => {
  const depth = c.has('Depth') ? Number(c.get('Depth')) : 2;
  const v = c.has('InputObject') ? c.get('InputObject') : c.input.length === 1 ? c.input[0] : c.input;
  return [jsonString(toJsonValue(v, depth), !!c.get('Compress'))];
});

// ---------- CSV, oggetti e utilità ----------
function csvField(v: unknown, delim: string): string {
  const t = v === null || v === undefined ? '' : psToString(v);
  return /["\r\n]/.test(t) || t.includes(delim) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function csvQuote(v: unknown): string {
  return '"' + (v === null || v === undefined ? '' : psToString(v)).replace(/"/g, '""') + '"';
}
function csvLines(items: unknown[], delim: string, typeInfo: boolean, quoteAll: boolean): string[] {
  const rows = items.filter((x): x is PSObject => x instanceof PSObject);
  if (!rows.length) return [];
  const cols = rows[0].keys();
  const q = (v: unknown): string => (quoteAll ? csvQuote(v) : csvField(v, delim));
  const lines: string[] = [];
  if (typeInfo) lines.push('#TYPE System.Management.Automation.PSCustomObject');
  lines.push(cols.map((k) => q(k)).join(delim));
  for (const r of rows) lines.push(cols.map((k) => q(r.props[k])).join(delim));
  return lines;
}
function parseCsvText(text: string, delim: string, header?: string[]): PSObject[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  const t = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const head = header ?? nonEmpty.shift() ?? [];
  return nonEmpty.map((r) => {
    const o = custom({});
    head.forEach((h, i) => (o.props[h] = r[i] ?? ''));
    return o;
  });
}
const csvDelim = (c: CmdCtx): string => (c.has('Delimiter') ? psToString(c.get('Delimiter')) : ',');
def('ConvertTo-Csv', 'InputObject:0, Delimiter, NoTypeInformation!', (c) => {
  const items = c.has('InputObject') ? toArray(c.get('InputObject')) : c.input;
  return csvLines(items, csvDelim(c), !c.get('NoTypeInformation'), true);
});
def('ConvertFrom-Csv', 'InputObject:0, Delimiter, Header', (c) => {
  const src = c.has('InputObject') ? toArray(c.get('InputObject')) : c.input;
  const hdr = c.has('Header') ? toArray(c.get('Header')).map(psToString) : undefined;
  return parseCsvText(src.map(psToString).join('\n'), csvDelim(c), hdr);
});
def('Import-Csv', 'Path:0, Delimiter, Header', (c) => {
  const path = psToString(c.get('Path'));
  const abs = c.rt.rp(path);
  if (!c.rt.vfs.isFile(abs)) {
    fail(c, pathErr(c, abs, 'Import-Csv', 'ImportCsv'));
    return [];
  }
  const hdr = c.has('Header') ? toArray(c.get('Header')).map(psToString) : undefined;
  return parseCsvText(c.rt.vfs.readFile(abs), csvDelim(c), hdr);
});
def('Export-Csv', 'Path:0, Delimiter, NoTypeInformation!, Append!', (c) => {
  const path = psToString(c.get('Path'));
  const lines = csvLines(c.input, csvDelim(c), !c.get('NoTypeInformation'), true);
  c.rt.vfs.writeFile(c.rt.rp(path), lines.join('\r\n') + (lines.length ? '\r\n' : ''), !!c.get('Append'));
  return [];
});
def('Tee-Object', 'FilePath:0|Path, Variable, Append!', (c) => {
  if (c.has('Variable')) c.rt.setVar(psToString(c.get('Variable')), c.input.length === 1 ? c.input[0] : c.input);
  else if (c.has('FilePath')) c.rt.vfs.writeFile(c.rt.rp(psToString(c.get('FilePath'))), formatItems(c.input).replace(/^\n/, ''), !!c.get('Append'));
  else {
    fail(c, new PSError("Tee-Object richiede -FilePath o -Variable.", 'InvalidArgument', 'ParameterBindingException', 'FilePath', 'Tee-Object'));
    return [];
  }
  return c.input;
});
def('Write-Verbose', 'Message:0, Verbose!', (c) => {
  if (c.get('Verbose')) c.rt.io.out(`VERBOSE: ${psToString(c.get('Message'))}\n`);
  return [];
});
const rndState = new WeakMap<object, number>();
function nextRandom(rt: object, seed: number): number {
  const n = (rndState.get(rt) ?? seed) * 1103515245 + 12345;
  const v = Math.abs(n) % 2147483648;
  rndState.set(rt, v);
  return v;
}
def('Get-Random', 'Maximum:0, Minimum, InputObject, Count', (c) => {
  const seed = (c.rt.state.clock | 0) + 7;
  const pool = c.has('InputObject') ? toArray(c.get('InputObject')) : c.input;
  if (pool.length) {
    const count = c.has('Count') ? Number(c.get('Count')) : 1;
    const left = [...pool];
    const out: unknown[] = [];
    while (out.length < count && left.length) out.push(left.splice(nextRandom(c.rt, seed) % left.length, 1)[0]);
    return out;
  }
  const min = c.has('Minimum') ? Number(c.get('Minimum')) : 0;
  const max = c.has('Maximum') ? Number(c.get('Maximum')) : 2147483647;
  if (!(max > min)) {
    fail(c, new PSError(`Cannot validate argument on parameter 'Maximum'. The Minimum value (${min}) is greater than or equal to the Maximum value (${max}).`, 'InvalidArgument', 'ParameterBindingValidationException', 'Maximum', 'Get-Random'));
    return [];
  }
  return [min + (nextRandom(c.rt, seed) % (max - min))];
});
def('New-Guid', '', (c) => {
  const a = nextRandom(c.rt, (c.rt.state.clock | 0) + 11);
  const b = nextRandom(c.rt, 0);
  const hex = (n: number, w: number): string => n.toString(16).padStart(w, '0').slice(-w);
  return [`${hex(a, 8)}-${hex(b >> 8, 4)}-4${hex(b, 3)}-8${hex(a >> 4, 3)}-${hex(a ^ b, 12)}`];
});
def('Add-Member', 'InputObject, MemberType:0, Name:1, Value:2, NotePropertyName, NotePropertyValue, PassThru!', (c) => {
  const target = c.has('InputObject') ? c.get('InputObject') : c.input[0];
  const name = c.has('NotePropertyName') ? psToString(c.get('NotePropertyName')) : c.has('Name') ? psToString(c.get('Name')) : '';
  const mt = c.has('MemberType') ? psToString(c.get('MemberType')).toLowerCase() : 'noteproperty';
  if (!(target instanceof PSObject) || !name || (mt !== 'noteproperty' && c.has('MemberType'))) {
    fail(c, new PSError('Add-Member nel laboratorio supporta solo proprietà NoteProperty su oggetti (PSCustomObject, hashtable).', 'InvalidOperation', 'NotSupported', name, 'Add-Member'));
    return [];
  }
  target.props[name] = c.has('NotePropertyValue') ? c.get('NotePropertyValue') : c.get('Value');
  return c.get('PassThru') ? [target] : [];
});
def('Get-Member', 'InputObject:0, MemberType, Name', (c) => {
  const items = c.has('InputObject') ? toArray(c.get('InputObject')) : c.input;
  const first = items[0];
  if (!(first instanceof PSObject)) {
    fail(c, new PSError('Get-Member nel laboratorio supporta solo oggetti con proprietà (PSCustomObject, hashtable, risultati dei cmdlet).', 'InvalidOperation', 'NotSupported', '', 'Get-Member'));
    return [];
  }
  const want = c.has('MemberType') ? psToString(c.get('MemberType')).toLowerCase() : '';
  if (want && want !== 'noteproperty' && want !== 'property' && want !== 'all') return [];
  const nameLike = c.has('Name') ? new RegExp('^' + psToString(c.get('Name')).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i') : null;
  const typeName = first.typeName === 'PSCustomObject' ? 'System.Management.Automation.PSCustomObject' : first.typeName;
  return first
    .keys()
    .filter((k) => !nameLike || nameLike.test(k))
    .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
    .map((k) => {
      const v = first.props[k];
      const tn = typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'double') : typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'string' : 'Object';
      return custom({ TypeName: typeName, Name: k, MemberType: 'NoteProperty', Definition: `${tn} ${k}=${psToString(v)}` });
    });
});

const STATUS_NAMES: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'NoContent', 301: 'MovedPermanently', 400: 'BadRequest', 401: 'Unauthorized', 403: 'Forbidden', 404: 'NotFound',
  405: 'MethodNotAllowed', 409: 'Conflict', 415: 'UnsupportedMediaType', 422: 'UnprocessableEntity', 429: 'TooManyRequests', 500: 'InternalServerError',
};
const STATUS_TEXT_NET: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error',
};

function webRequest(c: CmdCtx, cmd: 'Invoke-RestMethod' | 'Invoke-WebRequest'): unknown[] {
  const uri = psToString(c.get('Uri'));
  if (!uri) {
    fail(c, new PSError('Cannot validate argument on parameter \'Uri\'. The argument is null or empty.', 'InvalidData', 'ParameterArgumentValidationError', 'Uri', cmd));
    return [];
  }
  let method = psToString(c.get('Method') ?? 'Get').toUpperCase();
  const headers: Record<string, string> = {};
  const h = c.get('Headers');
  if (h instanceof PSObject) for (const k of h.keys()) headers[k] = psToString(h.props[k]);
  let body: string | null = null;
  const b = c.get('Body');
  if (b instanceof PSObject && b.isHash) body = b.keys().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(psToString(b.props[k]))}`).join('&');
  else if (b !== undefined && b !== null) body = psToString(b);
  if (body !== null && method === 'GET' && !c.has('Method')) method = 'POST'.replace('POST', 'GET');
  const lh = lowerHeaders(headers);
  if (body !== null) lh['content-type'] ??= c.has('ContentType') ? psToString(c.get('ContentType')) : 'application/x-www-form-urlencoded';
  if (c.has('ContentType')) lh['content-type'] = psToString(c.get('ContentType'));
  lh['user-agent'] ??= 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.19041.1';
  const timeout = c.has('TimeoutSec') ? Number(c.get('TimeoutSec')) * 1000 : undefined;
  const req: HttpRequest = { method, url: uri, headers: lh, body, client: cmd, shell: 'pwsh', timeoutMs: timeout };
  const r = performHttp(c.rt.state, req, { follow: true, maxRedirects: 5 }).result;
  const klass = `Microsoft.PowerShell.Commands.${cmd === 'Invoke-RestMethod' ? 'InvokeRestMethod' : 'InvokeWebRequest'}Command`;
  if (!r.ok) {
    const msg =
      r.kind === 'dns' ? `The remote name could not be resolved: '${r.host}'`
      : r.kind === 'refused' ? 'Unable to connect to the remote server'
      : r.kind === 'timeout' ? 'The operation has timed out.'
      : r.kind === 'tls' ? 'The underlying connection was closed: An unexpected error occurred on a send.'
      : `Invalid URI: The hostname could not be parsed.`;
    throw new PSError(msg, 'InvalidOperation', `WebCmdletWebResponseException,${klass}`, 'System.Net.HttpWebRequest:HttpWebRequest', cmd);
    void netError;
  }
  const res = r.res;
  if (res.status >= 400) {
    throw new PSError(`The remote server returned an error: (${res.status}) ${STATUS_TEXT_NET[res.status] ?? res.statusText}.`, 'InvalidOperation', `WebCmdletWebResponseException,${klass}`, 'System.Net.HttpWebRequest:HttpWebRequest', cmd, {
      status: res.status,
      statusName: STATUS_NAMES[res.status] ?? res.statusText,
      statusText: STATUS_TEXT_NET[res.status] ?? res.statusText,
      body: res.body,
      headers: res.headers,
    });
  }
  if (cmd === 'Invoke-RestMethod') {
    if (c.has('OutFile')) {
      c.rt.writeFile(c.rt.rp(psToString(c.get('OutFile'))), res.body, false);
      return [];
    }
    if (!res.body) return [];
    if ((res.headers['Content-Type'] ?? '').includes('json')) {
      try {
        const v = fromJsonValue(JSON.parse(res.body));
        return Array.isArray(v) ? v : [v];
      } catch {
        return [res.body];
      }
    }
    return [res.body];
  }
  const hdr = hash();
  for (const [k, v] of Object.entries(res.headers)) hdr.props[k] = v;
  const raw = `${res.httpVersion} ${res.status} ${res.statusText}\r\n` + Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n' + res.body;
  if (c.has('OutFile')) {
    c.rt.writeFile(c.rt.rp(psToString(c.get('OutFile'))), res.body, false);
    // con -OutFile la risposta non viene restituita, salvo -PassThru
    if (!c.get('PassThru')) return [];
  }
  return [new PSObject('WebResponseObject', { StatusCode: res.status, StatusDescription: res.statusText, Content: res.body, RawContent: raw, RawContentLength: byteLen(res.body), Headers: hdr })];
}

def('Invoke-RestMethod', 'Uri:0, Method:1, Headers, Body, ContentType, TimeoutSec, UseBasicParsing!, OutFile, Credential, PassThru!', (c) => webRequest(c, 'Invoke-RestMethod'));
def('Invoke-WebRequest', 'Uri:0, Method:1, Headers, Body, ContentType, TimeoutSec, UseBasicParsing!, OutFile, Credential, PassThru!', (c) => webRequest(c, 'Invoke-WebRequest'));

// ---------------- varie ----------------
def('Get-Variable', 'Name:0', (c) => {
  const names = c.has('Name') ? asStrings(c.get('Name')) : [...c.rt.global.keys()];
  return names.map((n) => custom({ Name: n, Value: c.rt.getVar(n) }));
});
def('Set-Item', 'Path|LiteralPath:0, Value:1', (c) => {
  const path = psToString(c.get('Path') ?? '');
  const m = /^env:[\\/]?(.+)$/i.exec(path);
  if (!m) {
    fail(c, new PSError(`Set-Item is supported in this lab only for the Env: drive (Set-Item env:NAME value).`, 'NotImplemented', 'NotSupported,Microsoft.PowerShell.Commands.SetItemCommand', path, 'Set-Item'));
    return [];
  }
  c.rt.setEnv(m[1], c.has('Value') ? psToString(c.get('Value')) : '');
  return [];
});

def('Set-Variable', 'Name:0, Value:1', (c) => {
  c.rt.setVar(psToString(c.get('Name')), c.get('Value'));
  return [];
});
def('Get-Alias', 'Name:0', (c) => {
  const a = psAliases();
  const names = c.has('Name') ? asStrings(c.get('Name')) : Object.keys(a);
  const out: unknown[] = [];
  for (const n of names) {
    const t = a[n.toLowerCase()];
    if (t) out.push(custom({ CommandType: 'Alias', Name: `${n} -> ${t}` }));
    else fail(c, new PSError(`This command cannot find a matching alias because alias with name '${n}' do not exist.`, 'ObjectNotFound', 'ItemNotFoundException,Microsoft.PowerShell.Commands.GetAliasCommand', n, 'Get-Alias'));
  }
  return out;
});
def('Get-Command', 'Name:0, CommandType', (c) => {
  const out: unknown[] = [];
  for (const n of asStrings(c.get('Name'))) {
    const l = n.toLowerCase();
    const alias = psAliases()[l];
    if (c.rt.funcs.has(l)) out.push(custom({ CommandType: 'Function', Name: n, Version: '' }));
    else if (alias && !CMDLETS.has(l)) out.push(custom({ CommandType: 'Alias', Name: `${n} -> ${alias}`, Version: '' }));
    else if (CMDLETS.has(l)) out.push(custom({ CommandType: 'Cmdlet', Name: CMDLETS.get(l)!.name, Version: '3.1.0.0' }));
    else if (['curl.exe', 'jq', 'jq.exe', 'hostname', 'whoami'].includes(l)) out.push(custom({ CommandType: 'Application', Name: n, Version: '' }));
    else fail(c, new PSError(`The term '${n}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`, 'ObjectNotFound', 'CommandNotFoundException,Microsoft.PowerShell.Commands.GetCommandCommand', n, 'Get-Command'));
  }
  return out;
});
def('Get-Help', 'Name:0, Full!, Examples!', (c) => {
  const n = psToString(c.get('Name') ?? '');
  const txt = renderHelp(n, 'pwsh');
  void findDoc;
  void commandsFor;
  return [new PSFormatted(txt)];
});
def('Get-History', '', (c) => c.rt.ss.history.map((h, i) => custom({ Id: i + 1, CommandLine: h.cmd })));
def('Get-Date', 'Date:0, Format, UFormat', (c) => {
  const sec = c.rt.state.clock;
  if (c.has('Format')) {
    const f = psToString(c.get('Format'));
    return [f === 'o' || f === 'O' ? DOTNET_FMT('yyyy-MM-ddTHH:mm:ss', sec) + '.0000000Z' : DOTNET_FMT(f, sec)];
  }
  return [makeDate(sec)];
});
def('Get-Process', 'Name:0', (c) => {
  const procs = [
    { Id: 412, ProcessName: 'taskflow-api', CPU: 12.5 },
    { Id: 530, ProcessName: 'powershell', CPU: 0.4 },
  ];
  const n = c.has('Name') ? psToString(c.get('Name')).toLowerCase() : null;
  const list = procs.filter((p) => !n || p.ProcessName === n);
  if (n && !list.length) {
    fail(c, new PSError(`Cannot find a process with the name "${n}". Verify the process name and call the cmdlet again.`, 'ObjectNotFound', 'NoProcessFoundForGivenName,Microsoft.PowerShell.Commands.GetProcessCommand', n, 'Get-Process'));
  }
  return list.map((p) => custom({ Id: p.Id, ProcessName: p.ProcessName, CPU: p.CPU }));
});
def('Start-Sleep', 'Seconds:0, Milliseconds', (c) => {
  c.rt.state.clock += Math.ceil(c.has('Milliseconds') ? Number(c.get('Milliseconds')) / 1000 : Number(c.get('Seconds') ?? 0));
  return [];
});
def('Invoke-Expression', 'Command:0', (c) => {
  const src = psToString(c.get('Command'));
  const prog = new PsParser(src).parseProgram();
  return c.rt.execBlock(prog);
});

void base64;
void API_VERSION;
void fmtDateTime;
void enumValue;
void getopt;
