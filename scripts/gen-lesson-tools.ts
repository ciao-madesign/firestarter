/**
 * Compila LESSON_TOOLS in src/curriculum/glossary.ts: per ogni lezione/shell i costrutti delle soluzioni che hanno una voce
 * nel glossario, più le aggiunte manuali (EXTRA) per ciò che l'analisi automatica non vede. Uso: npx tsx scripts/gen-lesson-tools.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LESSONS } from '../src/curriculum/lessons/index.ts';
import { GLOSSARY } from '../src/curriculum/glossary.ts';
import type { ShellId } from '../src/engine/types.ts';
import { tokensOf } from './audit-info.ts';

const BASIC = new Set(['ls', 'pwd', 'echo', 'cat', 'Get-Content', 'Set-Location', 'mkdir', 'cp', 'mv', 'rm', 'touch', 'grep', 'sort', 'uniq', 'wc', 'man', 'date']);
const ALIAS: Record<string, string> = { 'ssh -n': 'ssh', 'ssh -i': 'ssh', 'ssh -u': 'ssh', do: 'for', 'do -s': 'for', 'do -o': 'for', 'do -w': 'for', 'do -H': 'for', 'do -X': 'for', 'do -d': 'for', done: 'for', 'nc -zv': 'nc', 'find -type': 'find', 'curl -b': 'curl -c', 'openssl -hmac': 'openssl' };
const DROP = new Set(['then', 'fi', 'else', 'elif', 'Write-Output', 'foreach', 'content-type', '>>', 'abc', 'mostra', 'ls -lat']);
/** aggiunte manuali per lezione/shell (costrutti richiesti ma non rilevabili automaticamente) */
const EXTRA: Record<string, Partial<Record<ShellId, string[]>>> = {
  'M10.L3': { pwsh: ['[Tipo]::', 'function'] },
  'M2.L2': { bash: ['2>', '2>&1', '/dev/null'], pwsh: ['2>', '*>', '$null'] },
  'M2.L5': { bash: ['PIPESTATUS', 'set', '$?'], pwsh: ['-Command', 'Test-Path'] },
  'M2.L6': { bash: ['which', 'type', 'chmod', 'export'], pwsh: ['Get-Command', '$env:'] },
  'M3.L3': { bash: ['curl -G', '--data-urlencode'], pwsh: ['[Tipo]::'] },
  'M3.L5': { bash: ['jq --arg', 'heredoc'], pwsh: ['-Uri', 'here-string'] },
  // ssh in PowerShell è un'applicazione esterna: l'analisi automatica non la vede
  'M11.L1': { bash: ['systemctl', 'ss'], pwsh: ['ssh', 'Test-NetConnection', '-Port'] },
  'M11.L2': { bash: ['tail'], pwsh: ['ssh'] },
  'M11.L4': { bash: ['systemctl', 'journalctl', 'sudo'], pwsh: ['ssh'] },
  'M11.L5': { bash: ['systemctl', 'ss', 'sudo', 'sed'], pwsh: ['ssh'] },
  'M11.L6': { bash: ['systemctl', 'journalctl', 'sudo'], pwsh: ['ssh'] },
  'M11.L10': { bash: ['systemctl', 'journalctl', 'ss', 'sudo', 'sed'], pwsh: ['ssh'] },
  'M2.L4': { pwsh: ['$?'] },
  'M2.L7': { pwsh: ['./script.ps1'] },
  // il contenuto della here-string è codice PowerShell: gli strumenti che usa vanno spiegati
  'M4.L8': { pwsh: ['Invoke-RestMethod', '@{ }', 'ConvertTo-Json', '-Method', '-ContentType', '-Body', '-Headers', '$( )', '( ).Proprietà'] },
};
/** lezioni in cui la scoperta dello strumento è l'esercizio stesso: nessun elenco per quella shell */
const DISCOVERY: Record<string, ShellId[]> = { 'M1.L4': ['bash'] };

const out: Record<string, Partial<Record<ShellId, string[]>>> = {};
for (const l of LESSONS) {
  for (const sh of ['bash', 'pwsh'] as ShellId[]) {
    if (DISCOVERY[l.id]?.includes(sh)) continue;
    const sol = l.solutions?.[sh] ?? l.reference?.[sh] ?? [];
    const keys: string[] = [];
    // il contenuto degli script consegnati (.sh / .ps1) è codice che lo studente deve scrivere: si analizza anch'esso
    const lines: string[] = [];
    for (const line of sol) {
      lines.push(line);
      const re = sh === 'bash' ? /cat > \S+\.sh <<'?EOF'?\n([\s\S]*?)\nEOF/ : /Set-Content \S+\.ps1 -Value @'\n([\s\S]*?)\n'@/;
      const m = re.exec(line);
      if (m) lines.push(...m[1].split('\n').filter((x) => !x.trim().startsWith('#')));
    }
    // anche i comandi di previsione, test negativo ed esempio: lo studente li vede e li esegue, quindi i loro strumenti vanno spiegati
    for (const c of [...l.predict.map((p) => p.cmd[sh]), l.negative.cmd[sh], l.example.cmd[sh]]) if (c) lines.push(c);
    for (const line of lines) for (const t0 of tokensOf(line, sh)) {
      if (/^export -/.test(t0)) continue;
      const t = ALIAS[t0] ?? t0;
      if (DROP.has(t) || BASIC.has(t) || keys.includes(t)) continue;
      if (t === 'cd' && !['M1.R', 'M1.L2'].includes(l.id)) continue;
      if (t === 'Get-ChildItem' && !['M1.R', 'M1.L4', 'M9.L1'].includes(l.id)) continue;
      if (GLOSSARY[sh][t]) keys.push(t);
    }
    for (const k of EXTRA[l.id]?.[sh] ?? []) if (!keys.includes(k) && GLOSSARY[sh][k]) keys.push(k);
    if (keys.length) (out[l.id] ??= {})[sh] = keys;
  }
}
const q = (a: string[]): string => '[' + a.map((x) => `'${x.replace(/'/g, "\\'")}'`).join(', ') + ']';
const body = Object.entries(out).map(([id, v]) => `  '${id}': { ${(['bash', 'pwsh'] as ShellId[]).filter((s) => v[s]).map((s) => `${s}: ${q(v[s]!)}`).join(', ')} },`).join('\n');
const path = 'src/curriculum/glossary.ts';
const src = readFileSync(path, 'utf8');
const next = src.replace(/export const LESSON_TOOLS: Record<string, \{ bash\?: string\[\]; pwsh\?: string\[\] \}> = \{[\s\S]*?\n\};/, `export const LESSON_TOOLS: Record<string, { bash?: string[]; pwsh?: string[] }> = {\n${body}\n};`);
writeFileSync(path, next);
console.log(`LESSON_TOOLS: ${Object.keys(out).length} lezioni`);
