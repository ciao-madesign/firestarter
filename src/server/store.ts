/** Persistence Layer: separato dalla logica applicativa, non accessibile dal frontend. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { WorkspaceState } from '../engine/types.ts';
import { createWorkspace, STATE_VERSION } from '../engine/index.ts';
import { seedProgress, type CourseProgress } from '../course/progress.ts';

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface Store {
  loadWorkspace(id: string): WorkspaceState;
  saveWorkspace(id: string, state: WorkspaceState): void;
  deleteWorkspace(id: string): void;
  loadCourse(id: string): CourseProgress;
  saveCourse(id: string, course: CourseProgress, markdown?: string): void;
}

function atomicWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export class FileStore implements Store {
  private saves = new Map<string, number>();
  constructor(
    private dataDir: string,
    private courseFile: string | null,
  ) {}

  private wsPath(id: string): string {
    if (!ID_RE.test(id)) throw new Error('identificativo workspace non valido');
    return join(this.dataDir, 'workspaces', `${id}.json`);
  }

  loadWorkspace(id: string): WorkspaceState {
    const p = this.wsPath(id);
    for (const candidate of [p, p + '.bak']) {
      if (existsSync(candidate)) {
        try {
          const s = JSON.parse(readFileSync(candidate, 'utf8')) as WorkspaceState;
          if (s.version === STATE_VERSION) return this.migrate(s);
        } catch {
          /* file corrotto: prova il backup */
        }
      }
    }
    return createWorkspace(id);
  }

  private migrate(s: WorkspaceState): WorkspaceState {
    s.predictions ??= [];
    s.changeLog ??= [];
    s.docVersions ??= {};
    return s;
  }

  saveWorkspace(id: string, state: WorkspaceState): void {
    const p = this.wsPath(id);
    const n = (this.saves.get(id) ?? 0) + 1;
    this.saves.set(id, n);
    // backup: copia della versione precedente ogni 10 salvataggi
    if (n % 10 === 1 && existsSync(p)) copyFileSync(p, p + '.bak');
    atomicWrite(p, JSON.stringify(state));
  }

  deleteWorkspace(id: string): void {
    const p = this.wsPath(id);
    for (const f of [p, p + '.bak']) if (existsSync(f)) rmSync(f);
    const c = this.coursePath(id);
    if (!this.courseFile && existsSync(c)) rmSync(c);
  }

  private coursePath(id: string): string {
    return this.courseFile ?? join(this.dataDir, 'course', `${id}.json`);
  }

  loadCourse(id: string): CourseProgress {
    const p = this.coursePath(id);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8')) as CourseProgress;
      } catch {
        /* corrotto: ripartenza dallo stato iniziale */
      }
    }
    return seedProgress();
  }

  saveCourse(id: string, course: CourseProgress, markdown?: string): void {
    const p = this.coursePath(id);
    atomicWrite(p, JSON.stringify(course, null, 2) + '\n');
    if (markdown !== undefined && this.courseFile) atomicWrite(p.replace(/\.json$/, '.md'), markdown);
  }
}

/** Store in memoria, per i test. */
export class MemoryStore implements Store {
  ws = new Map<string, string>();
  courses = new Map<string, string>();
  loadWorkspace(id: string): WorkspaceState {
    const s = this.ws.get(id);
    return s ? (JSON.parse(s) as WorkspaceState) : createWorkspace(id);
  }
  saveWorkspace(id: string, state: WorkspaceState): void {
    this.ws.set(id, JSON.stringify(state));
  }
  deleteWorkspace(id: string): void {
    this.ws.delete(id);
    this.courses.delete(id);
  }
  loadCourse(id: string): CourseProgress {
    const s = this.courses.get(id);
    return s ? (JSON.parse(s) as CourseProgress) : seedProgress();
  }
  saveCourse(id: string, course: CourseProgress): void {
    this.courses.set(id, JSON.stringify(course));
  }
}
