/**
 * Strumenti da riga di comando per lo stato del corso.
 *   tsx scripts/course-tools.ts init                 crea course/progress.json e progress.md se mancano
 *   tsx scripts/course-tools.ts render               rigenera progress.md da progress.json
 *   tsx scripts/course-tools.ts import <file|->      importa un REGISTRO (file o stdin)
 *   tsx scripts/course-tools.ts export [AMBIENTE]    stampa un REGISTRO dallo stato attuale
 *   tsx scripts/course-tools.ts programma            rigenera course/programma.md e curriculum.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applyRegistro, buildRegistro, parseRegistro, renderProgressMd, seedProgress, type CourseProgress } from '../src/course/progress.ts';
import { LESSONS, MODULES, CURRICULUM_VERSION } from '../src/curriculum/lessons/index.ts';

const JSON_PATH = process.env.LAB_COURSE_FILE ?? 'course/progress.json';
const MD_PATH = JSON_PATH.replace(/\.json$/, '.md');
const titles = Object.fromEntries(LESSONS.map((l) => [l.id, l.title]));

function load(): CourseProgress {
  return existsSync(JSON_PATH) ? (JSON.parse(readFileSync(JSON_PATH, 'utf8')) as CourseProgress) : seedProgress();
}
function save(p: CourseProgress): void {
  mkdirSync(JSON_PATH.replace(/[^/]*$/, '') || '.', { recursive: true });
  writeFileSync(JSON_PATH, JSON.stringify(p, null, 2) + '\n');
  writeFileSync(MD_PATH, renderProgressMd(p, titles));
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'init':
    if (!existsSync(JSON_PATH)) save(seedProgress());
    else console.log('Esiste già:', JSON_PATH);
    break;
  case 'render':
    save(load());
    console.log('Aggiornato', MD_PATH);
    break;
  case 'import': {
    const text = arg && arg !== '-' ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
    const r = applyRegistro(load(), parseRegistro(text));
    save(r.progress);
    console.log(r.changes.join('\n'));
    break;
  }
  case 'export': {
    const date = new Date().toISOString().slice(0, 10);
    console.log(buildRegistro(load(), titles, date, arg ?? 'macOS, Bash'));
    break;
  }
  case 'programma': {
    const lines = ['# Programma del corso', '', `Versione del curriculum: ${CURRICULUM_VERSION}. File generato da \`npm run course:programma\`: non modificarlo a mano.`, '', 'Ambiente del corso: macOS, Bash. PowerShell 5.1 come confronto dal Modulo 4. Livelli: 1 non autonomo; 2 esegue con istruzioni dettagliate; 3 esegue da solo le attività tipiche; 4 adatta la procedura a problemi nuovi e motiva le scelte.', ''];
    for (const m of MODULES) {
      lines.push(`## M${m.n} — ${m.title}${m.optional ? ' (estensione facoltativa)' : ''}`, '', m.summary, '');
      for (const l of LESSONS.filter((x) => x.module === m.n)) {
        lines.push(`### ${l.review ? 'Ripasso M1' : l.id} — ${l.title}`, '', `Obiettivo: ${l.objective}`, '', `Concetti: ${l.concepts.join('; ')}.`, '', `Verifica (criterio): ${l.task.criterion}`, '');
      }
    }
    mkdirSync('course', { recursive: true });
    writeFileSync('course/programma.md', lines.join('\n') + '\n');
    writeFileSync('course/curriculum.json', JSON.stringify({ version: CURRICULUM_VERSION, modules: MODULES.map((m) => ({ ...m, lessons: LESSONS.filter((l) => l.module === m.n).map((l) => ({ id: l.id, title: l.title, objective: l.objective, concepts: l.concepts, skills: l.skills, review: !!l.review, shells: l.shells })) })) }, null, 2) + '\n');
    console.log('Generati course/programma.md e course/curriculum.json');
    break;
  }
  default:
    console.log('Uso: init | render | import <file|-> | export [ambiente] | programma');
    process.exit(cmd ? 1 : 0);
}
