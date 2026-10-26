/**
 * Riepilogo da portare nella chat di Claude (abbonamento) o nel tutor in terminale: nessuna chiave API,
 * nessuna chiamata dal server. Contiene solo il contesto filtrato (stesso di buildTutorContext) e regole di risposta.
 */
import type { ShellId, WorkspaceState } from '../engine/types.ts';
import type { LintResult } from '../docs/lint.ts';
import { buildTutorContext } from './tutor.ts';

const RULES = [
  'Sei il tutor di un Technical Writer che impara CLI (Bash, PowerShell 5.1), HTTP/API, testing e documentazione.',
  'Rispondi in italiano, in modo breve. Non inventare output: ragiona solo su quello che trovi qui sotto.',
  'Non eseguo comandi per conto tuo e tu non devi chiedermi di incollare segreti. Ambiente simulato, credenziali finte.',
  'Non dare la soluzione completa se non la chiedo: prima un indizio, poi un esempio analogo.',
  'Non dichiarare superato un test che non è stato eseguito dal sistema (esito ufficiale = quello riportato sotto).',
];

const fence = (s: string): string => '```\n' + s.replace(/```/g, "'''").trimEnd() + '\n```';

export function buildBrief(state: WorkspaceState, shell: ShellId, kind: 'lesson' | 'doc', opts: { question?: string; docPath?: string; doc?: string; lint?: LintResult | null } = {}): string {
  const c = buildTutorContext(state, shell);
  const out: string[] = ['# Richiesta al tutor', '', ...RULES.map((r) => `- ${r}`), ''];
  if (opts.question) out.push('## Domanda', '', opts.question.slice(0, 2000), '');
  if (kind === 'doc') {
    out.push(`## Documento${opts.docPath ? ` (${opts.docPath})` : ''}`, '', 'Commenta chiarezza, struttura e correttezza tecnica. Distingui errori verificabili da giudizi editoriali.', '', fence((opts.doc ?? '').slice(0, 12000)), '');
    if (opts.lint) {
      out.push('## Esito del controllo automatico', '', `Errori ${opts.lint.stats.errors}, avvisi ${opts.lint.stats.warnings}, valutazioni editoriali ${opts.lint.stats.editorial}; esempi eseguiti ${opts.lint.stats.examplesOk}/${opts.lint.stats.examplesRun}.`);
      for (const i of opts.lint.issues.slice(0, 20)) out.push(`- riga ${i.line} [${i.kind}/${i.severity}] ${i.message}`);
      out.push('');
    }
  } else {
    out.push('## Esercizio', '', c.lessonId ? `${c.lessonId}: ${c.objective ?? ''}` : 'Nessun esercizio attivo.', `Shell: ${shell === 'bash' ? 'Bash' : 'PowerShell 5.1'}. Ambiente: ${c.environment}.`, '');
    if (c.helpUsed) out.push(`Aiuti già usati: indizi ${c.helpUsed.hints}, esempio ${c.helpUsed.example}, soluzione ${c.helpUsed.solution ? 'sì' : 'no'}.`, '');
    if (c.lastVerify) {
      out.push(`## Ultima verifica del sistema: ${c.lastVerify.pass ? 'superata' : 'non superata'}`, '');
      for (const k of c.lastVerify.checks) out.push(`- ${k.pass ? 'ok' : 'NO'} ${k.id}: ${k.actual}`);
      out.push('');
    }
    out.push('## Ultimi comandi', '');
    if (!c.lastCommands.length) out.push('(nessuno)', '');
    for (const m of c.lastCommands) {
      out.push(fence(`$ ${m.cmd}\n${m.stdout}${m.stderr ? '\n[stderr] ' + m.stderr : ''}\n[exit ${m.exit}]`), '');
    }
  }
  return out.join('\n');
}
