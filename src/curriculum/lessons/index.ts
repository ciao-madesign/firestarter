import type { Lesson, ModuleInfo } from '../types.ts';
import { lessonIndex } from '../../course/progress.ts';
import { m1 } from './m1.ts';
import { m2 } from './m2.ts';
import { m3 } from './m3.ts';
import { m4 } from './m4.ts';
import { m5 } from './m5.ts';
import { m6 } from './m6.ts';
import { m7 } from './m7.ts';
import { m8 } from './m8.ts';

const UNSORTED: ModuleInfo[] = [
  { n: 1, title: 'Fondamenti', summary: 'Terminale e shell, variabili, prompt, percorsi, quoting, opzioni, man, lettura file.' },
  { n: 2, title: 'Comporre e testare', summary: 'Pipe, redirezione, filtri, variabili d\'ambiente, codici di uscita, test positivi e negativi.' },
  { n: 3, title: 'HTTP e API', summary: 'Client e server, URL, metodi, status code, header, body, JSON, parametri, errore HTTP ed errore applicativo.' },
  { n: 5, title: 'Integrazioni e diagnosi', summary: 'DNS, connessioni rifiutate, 4xx e 5xx, log, individuare il punto di rottura, retry e script elementari.' },
  { n: 6, title: 'Documentazione professionale + progetto finale', summary: 'Test case e test plan, bug report riproducibili, documentazione con esempi verificabili, troubleshooting, procedura da ambiente pulito, progetto finale.' },
  { n: 7, title: 'Automazione (estensione facoltativa)', summary: 'Cicli e funzioni, suite di test ripetibili con report, retry e rate limit.', optional: true },
  { n: 8, title: 'Portfolio', summary: 'Quattro artefatti da portfolio verificati dal laboratorio: guida rapida, specifica OpenAPI, bug report con troubleshooting, script di test con report.', optional: true },
  { n: 4, title: 'Testing API REST + OpenAPI', summary: 'Specifica OpenAPI, autenticazione e segreti, CRUD, validazione, paginazione, idempotenza, timeout, rate limit, confronto con PowerShell.' },
];

export const MODULES: ModuleInfo[] = [...UNSORTED].sort((a, b) => a.n - b.n);

export const CURRICULUM_VERSION = '0.1.0';

export const LESSONS: Lesson[] = [...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7, ...m8].sort((a, b) => lessonIndex(a.id) - lessonIndex(b.id) || (a.review ? -1 : 1));

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
