import type { ApiLogEntry, CommandLogEntry, ShellId, WorkspaceState } from '../engine/types.ts';
import type { Vfs } from '../engine/vfs.ts';

export type SkillTag = 'comandi' | 'autonomia' | 'output' | 'http' | 'testing' | 'diagnosi' | 'docs';

export const SKILL_LABELS: Record<SkillTag, string> = {
  comandi: 'Conoscenza dei comandi',
  autonomia: "Autonomia nell'esecuzione",
  output: 'Interpretazione di output ed errori',
  http: 'Comprensione di HTTP e API',
  testing: 'Capacità di testing',
  diagnosi: 'Capacità diagnostica',
  docs: 'Qualità della documentazione',
};

/** Coppia di comandi equivalenti nelle due shell */
export interface CmdPair {
  bash?: string;
  pwsh?: string;
}

export interface GuidedStep {
  title: string;
  cmd: CmdPair;
  /** cosa fa */
  what: string;
  /** chi lo interpreta */
  who: string;
  /** ruolo di ogni parte */
  parts: string[];
  /** output atteso */
  expect: string;
  risk?: string;
  /** solo per i test: frammento che l'output reale deve contenere (verifica che `expect` sia veritiero) */
  contains?: string | { bash?: string; pwsh?: string };
  /** il passo mostra volutamente «command not found»: il test non lo tratta come comando inesistente */
  notFound?: boolean;
  /** il passo è un errore voluto: l'uscita diversa da 0 è attesa */
  fails?: boolean | { bash?: boolean; pwsh?: boolean };
}

export interface PredictStep {
  prompt: string;
  cmd: CmdPair;
  /** risultato atteso, mostrato dopo l'esecuzione per il confronto */
  expect: string;
  /** il "perché" richiesto allo studente */
  why: string;
}

export interface NegativeStep {
  prompt: string;
  cmd: CmdPair;
  explain: string;
}

export interface CheckCtx {
  state: WorkspaceState;
  shell: ShellId;
  vfs: Vfs;
  /** cartella di lavoro della lezione, assoluta */
  dir: string;
  /** comandi eseguiti in questa shell da quando la lezione è stata avviata */
  cmds: CommandLogEntry[];
  /** richieste API registrate da quando la lezione è stata avviata (qualsiasi shell) */
  api: ApiLogEntry[];
  /** richieste fatte da questa shell */
  apiShell: ApiLogEntry[];
  read(rel: string): string | null;
  /** controllo "pulito": esecuzione in un workspace isolato */
  cleanRun?: (scriptRel: string) => { code: number; out: string; err: string };
  /** esegue un comando su una COPIA dello stato (nessun effetto sul workspace) */
  sandbox: (cmd: string, cwdRel?: string) => { code: number; out: string; err: string };
}

export interface CheckResultLite {
  pass: boolean;
  actual: string;
}

export interface Check {
  id: string;
  description: string;
  expected: string;
  test: (c: CheckCtx) => CheckResultLite;
  onFail: string;
  /** ID di errore ricorrente da incrementare se il controllo fallisce */
  errorTag?: string;
  kind?: 'verifiable' | 'editorial';
}

export interface SetupCtx {
  state: WorkspaceState;
  vfs: Vfs;
  dir: string;
  file(rel: string, content: string, mode?: number): void;
  dirMk(rel: string): void;
  setEnvBoth(name: string, value: string | null): void;
  cwd(shell: ShellId | 'both', abs: string): void;
  /** imposta l'ora di modifica (secondi prima dell'orologio attuale) */
  age(rel: string, secondsAgo: number): void;
}

export interface Lesson {
  id: string;
  module: number;
  n: number;
  title: string;
  objective: string;
  explain: string[];
  shells: ShellId[];
  /** mostra anche nel tutor che PowerShell è facoltativo */
  pwshOptional?: boolean;
  setup: (c: SetupCtx) => void;
  guided: GuidedStep[];
  predict: PredictStep[];
  negative: NegativeStep;
  task: { text: string; criterion: string };
  checks: Check[];
  /** 1. esempio completo e analogo (aiuto di primo livello) */
  example: { text: string; cmd: CmdPair };
  /** 2. suggerimenti graduali */
  hints: string[];
  /** soluzione per shell; assente per verifiche autonome */
  solutions?: { bash?: string[]; pwsh?: string[] };
  /** soluzione di riferimento, MAI esposta: serve ai test automatici delle verifiche autonome */
  reference?: { bash?: string[]; pwsh?: string[] };
  /** verifica autonoma: nessuna soluzione completa disponibile */
  autonomous?: boolean;
  summary: string[];
  skills: SkillTag[];
  concepts: string[];
  /** esercizio alternativo sullo stesso concetto, proposto se la verifica fallisce più volte */
  alt?: { task: string; criterion: string; checks: Check[]; solutions?: { bash?: string[]; pwsh?: string[] } };
  /** file consegnati fuori dalla cartella della lezione (es. ~/docs/...): rimossi quando la lezione parte o viene ripristinata */
  artifacts?: string[];
  /** il ripasso non sposta la "prossima lezione" */
  review?: boolean;
}

export interface ModuleInfo {
  n: number;
  title: string;
  summary: string;
  optional?: boolean;
}
