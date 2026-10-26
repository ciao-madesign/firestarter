/**
 * Tipi condivisi del Simulation Engine.
 * Tutto lo stato è JSON-serializzabile: il motore è puro e indipendente da UI e server.
 */

export type ShellId = 'bash' | 'pwsh';
export type EnvName = 'development' | 'testing' | 'staging';

export interface FsNode {
  type: 'file' | 'dir';
  /** contenuto (solo file) */
  content: string;
  /** permessi in ottale, es. 0o644 */
  mode: number;
  mtime: number;
  owner: string;
}

export interface ApiTask {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'done';
  priority: number;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiProject {
  id: number;
  name: string;
}

export interface ApiLogEntry {
  seq: number;
  at: string;
  env: EnvName;
  method: string;
  path: string;
  status: number;
  ms: number;
  requestId: string;
  user: string | null;
  client: string; // curl | Invoke-RestMethod | Invoke-WebRequest | ...
  shell: ShellId | null;
  note?: string;
  /** richiesta in forma sintetica per i report */
  reqBody?: string;
  resBody?: string;
}

export interface ApiEnvState {
  tasks: ApiTask[];
  projects: ApiProject[];
  nextTaskId: number;
  nextProjectId: number;
  flakyCounter: number;
  /** istanti (secondi simulati) delle richieste a /search, per il rate limit */
  searchHits: number[];
}

export interface ApiState {
  envs: Record<EnvName, ApiEnvState>;
  log: ApiLogEntry[];
  seq: number;
}

export interface ShellFunction {
  /** sorgente del corpo, ri-parsato all'invocazione */
  body: string;
}

export interface HistoryEntry {
  cmd: string;
  exit: number;
  at: number;
  exerciseId?: string;
}

export interface TranscriptBlock {
  prompt: string;
  cmd: string;
  out: { s: 'out' | 'err'; t: string }[];
  exit: number;
}

export interface ShellState {
  cwd: string;
  env: Record<string, string>;
  /** variabili di shell non esportate (Bash) / variabili `$x` (PowerShell) */
  vars: Record<string, unknown>;
  functions: Record<string, ShellFunction>;
  history: HistoryEntry[];
  lastExit: number;
  /** PowerShell: ultimo esito `$?` */
  lastOk: boolean;
  transcript: TranscriptBlock[];
}

export interface CommandLogEntry {
  shell: ShellId;
  cmd: string;
  exit: number;
  at: number;
  exerciseId?: string;
  /** numero progressivo dei comandi del workspace: il ripristino taglia lo storico per numero, non per secondo simulato */
  seq?: number;
  stdout: string;
  stderr: string;
}

export interface Completion {
  at: number;
  mode: 'autonomous' | 'hinted' | 'solution';
  hints: number;
}

export interface ExerciseProgress {
  startedAt: number;
  completions: Partial<Record<ShellId, Completion>>;
  /** aiuti usati nel tentativo corrente, per shell */
  help: Partial<Record<ShellId, { hints: number; explanation: number; example: number; solution: boolean }>>;
  attempts: number;
  lastVerify?: VerifyResult;
  /** finestra del tentativo corrente: orologio simulato e numero di sequenza API all'avvio */
  startClock?: number;
  startSeq?: number;
  /** numero progressivo del comando più recente all'avvio del tentativo */
  startCmdSeq?: number;
}

export interface PredictionRecord {
  lesson: string;
  step: number;
  shell: ShellId;
  text: string;
  why: string;
  at: number;
  /** autovalutazione dopo il confronto con l'output reale */
  accurate: boolean | null;
}

export interface CheckResult {
  id: string;
  description: string;
  pass: boolean;
  expected: string;
  actual: string;
  /** spiegazione dell'errore, mostrata solo se pass=false */
  explanation?: string;
}

export interface VerifyResult {
  exerciseId: string;
  shell: ShellId;
  at: number;
  pass: boolean;
  checks: CheckResult[];
  /** superata con l'esercizio alternativo (i controlli riportati sono quelli dell'alternativa) */
  viaAlt?: boolean;
}

export interface Preferences {
  fontSize: number;
  rightPanelVisible: boolean;
  splitPercent: number;
  shell: ShellId;
  tab: string;
}

export interface DocVersion {
  at: number;
  content: string;
}

export interface ModuleTestItem {
  lesson: string;
  reason: string;
  fails: number;
  done: boolean;
  outcome?: 'passed' | 'passed_partial' | 'retry' | 'failed';
}

export interface ModuleTestState {
  module: number;
  startedAt: number;
  items: ModuleTestItem[];
  finished?: boolean;
}

export interface WorkspaceState {
  version: number;
  id: string;
  createdAt: number;
  /** orologio simulato in secondi (epoch). Avanza con le azioni, non con l'orologio reale: determinismo. */
  clock: number;
  fs: Record<string, FsNode>;
  api: ApiState;
  activeEnv: EnvName;
  shells: Record<ShellId, ShellState>;
  commandLog: CommandLogEntry[];
  /** contatore dei comandi eseguiti (vedi CommandLogEntry.seq) */
  cmdSeq?: number;
  activeExercise: string | null;
  progress: Record<string, ExerciseProgress>;
  docVersions: Record<string, DocVersion[]>;
  notes: string;
  prefs: Preferences;
  predictions: PredictionRecord[];
  /** test intermedio in corso (4 esercizi misti) */
  moduleTest?: ModuleTestState;
  tutorChat: { role: 'user' | 'tutor'; text: string; at: number }[];
  changeLog: { at: number; what: string }[];
}

export interface OutChunk {
  s: 'out' | 'err';
  t: string;
}

export interface ExecResult {
  out: OutChunk[];
  exit: number;
  incomplete?: boolean;
  /** richiesta di pulire lo schermo (clear / cls) */
  clear?: boolean;
  cwd: string;
  prompt: string;
}

/** Limiti di sicurezza delle esecuzioni */
export const LIMITS = {
  maxInput: 20_000,
  maxOutput: 200_000,
  maxSteps: 20_000,
  maxFileSize: 500_000,
  maxFiles: 500,
  maxStateBytes: 5_000_000,
};
