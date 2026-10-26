import type { Lesson, ModuleInfo } from '../types.ts';
import { lessonIndex } from '../../course/progress.ts';
import { m1 } from './m1.ts';
import { m2 } from './m2.ts';
import { m3 } from './m3.ts';
import { m4 } from './m4.ts';

export const MODULES: ModuleInfo[] = [
  { n: 1, title: 'Fondamenti', summary: 'Terminale e shell, variabili, prompt, percorsi, quoting, opzioni, man, lettura file.' },
  { n: 2, title: 'Comporre e testare', summary: 'Pipe, redirezione, filtri, variabili d\'ambiente, codici di uscita, test positivi e negativi.' },
  { n: 3, title: 'HTTP e API', summary: 'Client e server, URL, metodi, status code, header, body, JSON, parametri, errore HTTP ed errore applicativo.' },
  { n: 4, title: 'Testing API REST + OpenAPI', summary: 'Specifica OpenAPI, autenticazione e segreti, CRUD, validazione, paginazione, idempotenza, timeout, rate limit, confronto con PowerShell.' },
];

export const CURRICULUM_VERSION = '0.1.0';

export const LESSONS: Lesson[] = [...m1, ...m2, ...m3, ...m4].sort((a, b) => lessonIndex(a.id) - lessonIndex(b.id) || (a.review ? -1 : 1));

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
