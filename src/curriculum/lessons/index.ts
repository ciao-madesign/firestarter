import type { GuidedStep, Lesson, ModuleInfo } from '../types.ts';
import { lessonIndex } from '../../course/progress.ts';
import { m1 } from './m1.ts';
import { m2 } from './m2.ts';
import { m2b } from './m2b.ts';
import { m3 } from './m3.ts';
import { m3b } from './m3b.ts';
import { m4 } from './m4.ts';
import { m4b } from './m4b.ts';
import { m5 } from './m5.ts';
import { m5b } from './m5b.ts';
import { m6 } from './m6.ts';
import { m6b } from './m6b.ts';
import { m7 } from './m7.ts';
import { m7b } from './m7b.ts';
import { m8 } from './m8.ts';
import { m9 } from './m9.ts';
import { m9b } from './m9b.ts';
import { m10 } from './m10.ts';
import { m10b } from './m10b.ts';
import { m11 } from './m11.ts';
import { m11b } from './m11b.ts';
import { ripassi } from './ripassi.ts';
import { scenarios2 } from './scenarios2.ts';
import { scenarios } from './scenarios.ts';
import { diagnosi } from './diagnosi.ts';
import { guidedM12 } from './guided-m12.ts';
import { guidedM34 } from './guided-m34.ts';
import { guidedM5678 } from './guided-m5678.ts';
import { guidedExtra } from './guided-extra.ts';

const UNSORTED: ModuleInfo[] = [
  { n: 1, title: 'Fondamenti', summary: 'Terminale e shell, variabili, prompt, percorsi, quoting, opzioni, man, lettura file.' },
  { n: 2, title: 'Comporre e testare', summary: 'Pipe, redirezione, i due canali di uscita (stdout e stderr), filtri, variabili d\'ambiente, codici di uscita anche nelle pipeline, PATH e permessi di esecuzione, test positivi e negativi.' },
  { n: 3, title: 'HTTP e API', summary: 'Client e server, URL e codifica dei parametri, metodi, status code, header, body JSON e virgolette tra Bash e PowerShell 5.1, errore HTTP ed errore applicativo.' },
  { n: 5, title: 'Integrazioni e diagnosi', summary: 'DNS, porta chiusa o filtrata e timeout, 4xx e 5xx, log e X-Request-Id, individuare il punto di rottura, retry e script elementari, errori intermittenti.' },
  { n: 6, title: 'Documentazione professionale + progetto finale', summary: 'Test case e test plan, bug report riproducibili, documentazione con esempi verificabili, verifica manuale di una guida, troubleshooting, procedura da ambiente pulito, progetto finale.' },
  { n: 7, title: 'Automazione (estensione facoltativa)', summary: 'Cicli e funzioni, lettura di file riga per riga, argomenti e codici di uscita negli script, suite di test ripetibili con report, retry e rate limit.', optional: true },
  { n: 8, title: 'Portfolio', summary: 'Quattro artefatti da portfolio verificati dal laboratorio: guida rapida, specifica OpenAPI, bug report con troubleshooting, script di test con report.', optional: true },
  { n: 9, title: 'Dal codice alla documentazione', summary: 'Sola lettura su un progetto d\'esempio: trovare le rotte, ricavare il contratto da un handler, confrontare codice e documentazione, documentare un endpoint che non ha documentazione, cronologia Git, OpenAPI in YAML e JSON Schema di base.', optional: true },
  { n: 10, title: 'Sessioni, webhook e autenticazione', summary: 'Cookie di sessione, CSRF e SameSite, lettura di un JWT, webhook firmati con HMAC e mappa dei flussi di autenticazione (queste ultime due solo in Bash).', optional: true },
  { n: 11, title: 'Laboratorio a due nodi', summary: 'Un server che ospita il servizio e un client che lo usa, su una rete simulata: ssh, interpretazione dei comandi (client o server), servizi, porte, firewall, nome (DNS e file hosts), registro del server; guasti controllati e due verifiche finali con rapporto di diagnosi. Equivale al laboratorio con due macchine virtuali (kit reale in course/lab-vm/).', optional: true },
  { n: 4, title: 'Testing API REST + OpenAPI', summary: 'Specifica OpenAPI, jq a più livelli, autenticazione e segreti, CRUD, validazione (400, 415, 422), paginazione e idempotenza, timeout e rate limit, confronto con PowerShell.' },
];

export const MODULES: ModuleInfo[] = [...UNSORTED].sort((a, b) => a.n - b.n);

export const CURRICULUM_VERSION = '0.1.0';

/** i ripassi (Mx.R) vengono prima della prima lezione del loro modulo */
function orderKey(id: string): number {
  const r = /^M(\d+)\.R$/.exec(id);
  return r ? parseInt(r[1], 10) * 100 : lessonIndex(id);
}

function mergeGuided(...maps: Record<string, GuidedStep[]>[]): Record<string, GuidedStep[]> {
  const out: Record<string, GuidedStep[]> = {};
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}

const EXTRA_GUIDED = mergeGuided(guidedM12, guidedM34, guidedM5678, guidedExtra);

export const LESSONS: Lesson[] = [...m1, ...m2, ...m2b, ...m3, ...m3b, ...m4, ...m4b, ...m5, ...m5b, ...m6, ...m6b, ...m7, ...m7b, ...m8, ...m9, ...m9b, ...m10, ...m10b, ...m11, ...m11b, ...ripassi, ...scenarios, ...scenarios2, ...diagnosi]
  .map((l) => (EXTRA_GUIDED[l.id] ? { ...l, guided: [...l.guided, ...EXTRA_GUIDED[l.id]] } : l)).sort((a, b) => orderKey(a.id) - orderKey(b.id) || (a.review ? -1 : 1));

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
