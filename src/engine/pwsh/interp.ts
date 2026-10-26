import type { WorkspaceState } from '../types.ts';
import type { Io } from '../bash/interp.ts';
export function runPwshLine(_s: WorkspaceState, _l: string, io: Io): { code: number; incomplete: boolean; clear: boolean } {
  io.err('PowerShell non ancora implementato\n');
  return { code: 1, incomplete: false, clear: false };
}
