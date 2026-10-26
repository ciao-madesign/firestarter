import type { FsNode, WorkspaceState } from './types.ts';
import { LIMITS } from './types.ts';

export const HOME = '/home/learner';
export const USER = 'learner';

export class FsError extends Error {
  constructor(
    public code: 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EEXIST' | 'EACCES' | 'ENOTEMPTY' | 'ELIMIT',
    public path: string,
  ) {
    super(`${code}: ${path}`);
  }
}

type Fs = WorkspaceState['fs'];

/** Normalizza un percorso (assoluto o relativo a cwd), risolvendo `.`, `..` e `~`. */
export function resolvePath(p: string, cwd: string): string {
  if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
  if (!p.startsWith('/')) p = cwd + '/' + p;
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function basename(p: string): string {
  if (p === '/') return '/';
  return p.slice(p.lastIndexOf('/') + 1);
}

export function displayPath(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(HOME + '/')) return '~' + p.slice(HOME.length);
  return p;
}

export class Vfs {
  constructor(
    private fs: Fs,
    private now: () => number,
  ) {}

  get(path: string): FsNode | undefined {
    if (path === '/') return { type: 'dir', content: '', mode: 0o755, mtime: 0, owner: 'root' };
    return this.fs[path];
  }
  exists(path: string): boolean {
    return !!this.get(path);
  }
  isDir(path: string): boolean {
    return this.get(path)?.type === 'dir';
  }
  isFile(path: string): boolean {
    return this.get(path)?.type === 'file';
  }

  private canAccess(node: FsNode, bit: 4 | 2 | 1): boolean {
    const shift = node.owner === USER ? 6 : 0;
    return ((node.mode >> shift) & bit) !== 0;
  }
  canRead(path: string): boolean {
    const n = this.get(path);
    return !!n && this.canAccess(n, 4);
  }
  canWrite(path: string): boolean {
    const n = this.get(path);
    return !!n && this.canAccess(n, 2);
  }
  canExec(path: string): boolean {
    const n = this.get(path);
    return !!n && this.canAccess(n, 1);
  }

  readFile(path: string): string {
    const n = this.get(path);
    if (!n) throw new FsError('ENOENT', path);
    if (n.type === 'dir') throw new FsError('EISDIR', path);
    if (!this.canAccess(n, 4)) throw new FsError('EACCES', path);
    return n.content;
  }

  writeFile(path: string, content: string, append = false): void {
    const parent = this.get(dirname(path));
    if (!parent) throw new FsError('ENOENT', path);
    if (parent.type !== 'dir') throw new FsError('ENOTDIR', path);
    const n = this.fs[path];
    if (n) {
      if (n.type === 'dir') throw new FsError('EISDIR', path);
      if (!this.canAccess(n, 2)) throw new FsError('EACCES', path);
      const next = append ? n.content + content : content;
      if (next.length > LIMITS.maxFileSize) throw new FsError('ELIMIT', path);
      n.content = next;
      n.mtime = this.now();
      return;
    }
    if (!this.canAccess(parent, 2)) throw new FsError('EACCES', path);
    if (Object.keys(this.fs).length >= LIMITS.maxFiles) throw new FsError('ELIMIT', path);
    if (content.length > LIMITS.maxFileSize) throw new FsError('ELIMIT', path);
    this.fs[path] = { type: 'file', content, mode: 0o644, mtime: this.now(), owner: USER };
  }

  mkdir(path: string, recursive = false): void {
    if (this.exists(path)) {
      if (recursive && this.isDir(path)) return;
      throw new FsError('EEXIST', path);
    }
    const parent = dirname(path);
    if (!this.exists(parent)) {
      if (!recursive) throw new FsError('ENOENT', path);
      this.mkdir(parent, true);
    }
    const pn = this.get(parent)!;
    if (pn.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!this.canAccess(pn, 2)) throw new FsError('EACCES', path);
    if (Object.keys(this.fs).length >= LIMITS.maxFiles) throw new FsError('ELIMIT', path);
    this.fs[path] = { type: 'dir', content: '', mode: 0o755, mtime: this.now(), owner: USER };
  }

  /** Nomi dei figli diretti, ordinati. */
  list(path: string): string[] {
    const n = this.get(path);
    if (!n) throw new FsError('ENOENT', path);
    if (n.type !== 'dir') throw new FsError('ENOTDIR', path);
    if (!this.canAccess(n, 4)) throw new FsError('EACCES', path);
    const prefix = path === '/' ? '/' : path + '/';
    const names: string[] = [];
    for (const k of Object.keys(this.fs)) {
      if (k.startsWith(prefix) && k.length > prefix.length && !k.slice(prefix.length).includes('/')) {
        names.push(k.slice(prefix.length));
      }
    }
    return names.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : 1));
  }

  /** Tutti i percorsi discendenti (esclusa la radice indicata). */
  descendants(path: string): string[] {
    const prefix = path === '/' ? '/' : path + '/';
    return Object.keys(this.fs)
      .filter((k) => k.startsWith(prefix) && k !== path)
      .sort();
  }

  remove(path: string, recursive = false): void {
    const n = this.get(path);
    if (!n) throw new FsError('ENOENT', path);
    const parent = this.get(dirname(path));
    if (parent && !this.canAccess(parent, 2)) throw new FsError('EACCES', path);
    if (n.type === 'dir') {
      const kids = this.descendants(path);
      if (kids.length && !recursive) throw new FsError('ENOTEMPTY', path);
      for (const k of kids) delete this.fs[k];
    }
    delete this.fs[path];
  }

  copy(src: string, dst: string): void {
    const n = this.get(src);
    if (!n) throw new FsError('ENOENT', src);
    if (n.type === 'file') {
      this.writeFile(dst, n.content);
      this.fs[dst].mode = n.mode;
      return;
    }
    this.mkdir(dst, true);
    for (const k of this.descendants(src)) {
      const rel = k.slice(src.length);
      const node = this.fs[k];
      this.fs[dst + rel] = { ...node, mtime: this.now(), owner: USER };
    }
  }

  move(src: string, dst: string): void {
    const n = this.get(src);
    if (!n) throw new FsError('ENOENT', src);
    if (!this.exists(dirname(dst))) throw new FsError('ENOENT', dst);
    if (n.type === 'dir') {
      if (dst === src || dst.startsWith(src + '/')) throw new FsError('EEXIST', dst);
      for (const k of this.descendants(src)) {
        this.fs[dst + k.slice(src.length)] = this.fs[k];
        delete this.fs[k];
      }
    }
    this.fs[dst] = n;
    n.mtime = this.now();
    delete this.fs[src];
  }

  chmod(path: string, mode: number): void {
    const n = this.get(path);
    if (!n) throw new FsError('ENOENT', path);
    if (n.owner !== USER) throw new FsError('EACCES', path);
    n.mode = mode;
  }

  /** Scrittura di sistema (log, file generati): ignora i permessi. */
  systemWrite(path: string, content: string, append = false): void {
    const parts = dirname(path).split('/').filter(Boolean);
    let cur = '';
    for (const p of parts) {
      cur += '/' + p;
      if (!this.fs[cur]) this.fs[cur] = { type: 'dir', content: '', mode: 0o755, mtime: this.now(), owner: 'root' };
    }
    const n = this.fs[path];
    if (n && n.type === 'file') {
      n.content = append ? n.content + content : content;
      n.mtime = this.now();
    } else {
      this.fs[path] = { type: 'file', content, mode: 0o644, mtime: this.now(), owner: 'root' };
    }
  }

  /** Crea file/directory di lavoro dell'utente, anche con genitori mancanti. */
  seed(path: string, content: string, mode = 0o644): void {
    this.mkdir(dirname(path), true);
    this.fs[path] = { type: 'file', content, mode, mtime: this.now(), owner: USER };
  }
}

/** Glob semplice: `*`, `?`, `[abc]`. Ritorna percorsi assoluti ordinati, oppure [] se nessun match. */
export function globToRegExp(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const j = pattern.indexOf(']', i + 1);
      if (j > i) {
        re += '[' + pattern.slice(i + 1, j).replace(/^!/, '^').replace(/[\\[]/g, '\\$&') + ']';
        i = j;
      } else re += '\\[';
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  try {
    return new RegExp(re + '$');
  } catch {
    // classe non valida (es. [z-a]): la shell reale tratta il pattern come testo letterale
    return new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  }
}

export function hasGlob(s: string): boolean {
  return /[*?[]/.test(s);
}

export function glob(vfs: Vfs, pattern: string, cwd: string): string[] {
  const abs = pattern.startsWith('/') || pattern.startsWith('~');
  const full = resolvePath(pattern, cwd);
  const segs = full.split('/').filter(Boolean);
  let current = ['/'];
  for (const seg of segs) {
    const next: string[] = [];
    for (const base of current) {
      if (!hasGlob(seg)) {
        const p = base === '/' ? '/' + seg : base + '/' + seg;
        if (vfs.exists(p)) next.push(p);
      } else if (vfs.isDir(base)) {
        const re = globToRegExp(seg);
        let names: string[] = [];
        try {
          names = vfs.list(base);
        } catch {
          names = [];
        }
        for (const nm of names) {
          if (nm.startsWith('.') && !seg.startsWith('.')) continue;
          if (re.test(nm)) next.push(base === '/' ? '/' + nm : base + '/' + nm);
        }
      }
    }
    current = next;
    if (!current.length) break;
  }
  current.sort();
  if (abs) return current;
  const prefix = cwd === '/' ? '/' : cwd + '/';
  return current.map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
}

export function fsErrorMessage(e: FsError, label: string): string {
  switch (e.code) {
    case 'ENOENT':
      return 'No such file or directory';
    case 'EISDIR':
      return 'Is a directory';
    case 'ENOTDIR':
      return 'Not a directory';
    case 'EEXIST':
      return 'File exists';
    case 'EACCES':
      return 'Permission denied';
    case 'ENOTEMPTY':
      return 'Directory not empty';
    case 'ELIMIT':
      return 'Limite del laboratorio superato (troppi file o file troppo grande)';
  }
  return label;
}
