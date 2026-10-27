/**
 * Sistema di livello (1–4) con evidenze per modulo.
 * - Livello per modulo dal test intermedio: 3 = 4 su 4 in autonomia al primo tentativo; 2 = almeno 3 superati; 1 = altrimenti.
 * - Livello 3 "stabile" = tutti i moduli M1–M6 hanno un test a livello 3; finché mancano prove è "provvisorio".
 * - Livello 4 = livello 3 stabile + prove di trasferimento svolte in autonomia (scenari nuovi di fine modulo e progetto finale).
 * - Il livello può scendere: un test ripetuto (ripasso a distanza) con esito peggiore abbassa il livello di uno.
 */
import { lessonIndex, type CourseProgress, type ModuleTest } from './progress.ts';

export const CORE_MODULES = [1, 2, 3, 4, 5, 6];
/** scenari nuovi (M2–M5) e progetto finale: senza soluzione, contesto diverso dalle lezioni */
export const TRANSFER_LESSONS = ['M2.L8', 'M3.L7', 'M4.L9', 'M5.L10', 'M6.L6'];
export const REVIEW_AFTER_DAYS = 14;

export function moduleLevel(t: ModuleTest): 1 | 2 | 3 {
  const clean = t.items.filter((i) => i.outcome === 'passed').length;
  const ok = t.items.filter((i) => i.outcome === 'passed' || i.outcome === 'passed_partial' || i.outcome === 'retry').length;
  if (t.items.length >= 4 && clean === t.items.length) return 3;
  return ok >= 3 ? 2 : 1;
}

export interface LevelEvidence {
  modules: Record<number, 1 | 2 | 3 | null>;
  missing: number[];
  stable3: boolean;
  transferDone: string[];
  transferMissing: string[];
}

export function evidence(course: CourseProgress): LevelEvidence {
  const modules: Record<number, 1 | 2 | 3 | null> = {};
  for (const m of CORE_MODULES) modules[m] = course.tests[`M${m}`] ? moduleLevel(course.tests[`M${m}`]) : null;
  const missing = CORE_MODULES.filter((m) => modules[m] !== 3);
  const transferDone = TRANSFER_LESSONS.filter((id) => course.lessons[id]?.status === 'completed' && course.lessons[id]?.mode === 'autonomous');
  return { modules, missing, stable3: missing.length === 0, transferDone, transferMissing: TRANSFER_LESSONS.filter((id) => !transferDone.includes(id)) };
}

/** Nota leggibile sul livello e sulle prove mancanti. */
export function describeLevel(course: CourseProgress): string {
  const e = evidence(course);
  if (course.level >= 4) return 'Livello 4: livello 3 stabile e prove di trasferimento svolte in autonomia.';
  if (course.level === 3) {
    if (!e.stable3) return `Livello 3 provvisorio: mancano prove a livello 3 per ${e.missing.map((m) => 'M' + m).join(', ')}.`;
    return `Livello 3 stabile. Per il livello 4 servono in autonomia: ${e.transferMissing.join(', ') || 'nessuna prova mancante'}.`;
  }
  return course.levelNote;
}

/** Dopo un test: aggiorna il livello (sale o scende) in base alle evidenze. Ritorna una nota se è cambiato. */
export function applyTestToLevel(course: CourseProgress, moduleNo: number, previous: ModuleTest | undefined): string {
  const now = course.tests[`M${moduleNo}`];
  if (!now) return '';
  const lv = moduleLevel(now);
  const before = course.level;
  let note = '';
  if (previous && lv < moduleLevel(previous) && course.level >= 3 && lv <= 2) {
    course.level = (course.level - 1) as 1 | 2 | 3 | 4;
    note = ` Livello abbassato a ${course.level}: il ripasso di M${moduleNo} ha dato un esito peggiore del precedente.`;
  } else if (lv === 3 && moduleNo >= 3 && course.level < 3) {
    const earlier = CORE_MODULES.filter((m) => m < moduleNo && course.tests[`M${m}`]).every((m) => moduleLevel(course.tests[`M${m}`]) >= 2);
    if (earlier) {
      course.level = 3;
      note = ' Livello portato a 3.';
    }
  }
  if (course.level !== before) course.levelNote = `Livello ${course.level} (test M${moduleNo})`;
  const up = promoteToLevel4(course);
  return note + up;
}

/** Livello 4 solo con livello 3 stabile e tutte le prove di trasferimento in autonomia. */
export function promoteToLevel4(course: CourseProgress): string {
  if (course.level !== 3) return '';
  const e = evidence(course);
  if (e.stable3 && e.transferMissing.length === 0) {
    course.level = 4;
    course.levelNote = 'Livello 4 (livello 3 stabile + prove di trasferimento in autonomia)';
    return ' Livello portato a 4.';
  }
  return '';
}

/** Moduli il cui ultimo test risale a più di `days` giorni fa (ripasso a distanza). */
export function reviewDue(course: CourseProgress, today: string, days = REVIEW_AFTER_DAYS): number[] {
  const t = Date.parse(today);
  return CORE_MODULES.filter((m) => {
    const test = course.tests[`M${m}`];
    if (!test) return false;
    return (t - Date.parse(test.date)) / 86400000 >= days;
  });
}

export { lessonIndex };
