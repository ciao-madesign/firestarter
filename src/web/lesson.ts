/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, copyText, h, inlineMd, renderMarkdown, toast } from './dom.ts';
import { api, app, emit, loadLesson, on, refreshSession, shellName, type Json, type ShellId } from './state.ts';

export interface LessonHooks {
  insertCommand(cmd: string): void;
  switchShell(s: ShellId): void;
  gotoTab(tab: string): void;
  reloadTerminal(): void;
}

let hooks: LessonHooks;
let openPred = new Set<number>();

export function initLesson(hk: LessonHooks): void {
  hooks = hk;
}

const STATUS_LABEL: Record<string, string> = {
  autonomous: 'svolta in autonomia',
  hinted: 'svolta con indizi',
  solution: 'svolta con la soluzione mostrata',
};

function completionChips(l: any): HTMLElement {
  const wrap = h('div', { class: 'chips' });
  for (const sh of l.shells as ShellId[]) {
    const c = l.completions?.[sh];
    wrap.append(h('span', { class: `chip ${c ? c.mode : 'none'}` }, `${shellName(sh)}: ${c ? STATUS_LABEL[c.mode] : 'non svolta'}`));
  }
  return wrap;
}

// ---------------- percorso (elenco lezioni) ----------------
function renderPath(root: HTMLElement): void {
  const s = app.session;
  const next = s.course.next.lesson;
  root.append(h('h2', null, 'Percorso'));
  root.append(h('p', { class: 'muted' }, `Livello attuale: ${s.course.level} su 4 — ${s.course.levelNote}. Prossima lezione: ${next}${s.course.titles[next] ? ' — ' + s.course.titles[next] : ''}.`));
  const rec = s.curriculum.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === 'M1.R');
  if (rec && rec.status !== 'completed') {
    root.append(h('div', { class: 'callout' }, h('strong', null, 'Ripasso consigliato (circa 5 minuti): '), 'un mini-esercizio per ciascuno dei quattro errori ricorrenti, prima di proseguire.', h('div', null, h('button', { class: 'btn primary', type: 'button', on: { click: () => void openLesson('M1.R') } }, 'Inizia il ripasso'))));
  }
  for (const m of s.curriculum.modules) {
    const done = m.lessons.filter((l: any) => !l.review && l.status === 'completed').length;
    const total = m.lessons.filter((l: any) => !l.review).length;
    const det = h('details', { class: 'module', open: m.lessons.some((l: any) => l.id === next) || undefined });
    det.append(h('summary', null, h('span', { class: 'mod-title' }, `M${m.n} — ${m.title}${m.optional ? ' (facoltativo)' : ''}`), h('span', { class: 'mod-count' }, `${done}/${total} svolte`)));
    det.append(h('p', { class: 'muted' }, m.summary));
    const ul = h('ul', { class: 'lessons' });
    for (const l of m.lessons) {
      const st = l.status === 'completed' ? 'svolta' : l.status === 'in_progress' ? 'in corso' : 'da fare';
      ul.append(
        h('li', null,
          h('button', { type: 'button', class: `lesson-item ${l.status}`, on: { click: () => void openLesson(l.id) } },
            h('span', { class: 'lid' }, l.review ? 'Ripasso' : l.id),
            h('span', { class: 'ltitle' }, l.title),
            h('span', { class: 'lstatus' }, st + (l.autonomous ? ' · verifica autonoma' : ''))),
          Object.keys(l.completions).length ? h('div', { class: 'chips small' }, (Object.entries(l.completions) as [string, any][]).map(([sh, c]) => h('span', { class: `chip ${c.mode}` }, `${shellName(sh as ShellId)}: ${STATUS_LABEL[c.mode]}`))) : null),
      );
    }
    det.append(ul);
    if (done >= 1) {
      det.append(
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', on: { click: () => void startTest(m.n) } }, `Test intermedio M${m.n} (4 esercizi misti)`)),
      );
    }
    root.append(det);
  }
}

async function startTest(module: number): Promise<void> {
  try {
    await api('POST', '/course/test', { module });
    await refreshSession();
    hooks.gotoTab('risultati');
    toast(`Test intermedio M${module} preparato: lo trovi in Risultati.`);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function openLesson(id: string): Promise<void> {
  try {
    const r = await api<Json>('POST', `/lessons/${id}/start`, {});
    app.session = r.session;
    app.lesson = r.lesson;
    openPred = new Set();
    emit('session');
    emit('lesson');
    if (!r.lesson.shells.includes(app.shell)) hooks.switchShell(r.lesson.shells[0]);
    hooks.reloadTerminal();
    hooks.gotoTab('istruzioni');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

// ---------------- lezione ----------------
function cmdBlock(cmd: string | undefined, label?: string): HTMLElement | null {
  if (!cmd) return null;
  return h('div', { class: 'cmdbox' },
    label ? h('div', { class: 'cmd-label' }, label) : null,
    h('pre', { class: 'code' }, h('code', null, cmd)),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', on: { click: () => hooks.insertCommand(cmd) } }, 'Inserisci nel terminale'),
      h('button', { type: 'button', class: 'btn small', on: { click: () => void copyText(cmd).then((ok) => toast(ok ? 'Comando copiato' : 'Copia non disponibile')) } }, 'Copia')));
}

function pairFor(pair: { bash?: string; pwsh?: string }): { current?: string; other?: { sh: ShellId; cmd: string } } {
  const cur = pair[app.shell];
  const otherSh: ShellId = app.shell === 'bash' ? 'pwsh' : 'bash';
  return { current: cur, other: pair[otherSh] ? { sh: otherSh, cmd: pair[otherSh]! } : undefined };
}

function pairBlock(pair: { bash?: string; pwsh?: string }): HTMLElement {
  const { current, other } = pairFor(pair);
  const box = h('div');
  if (current) box.append(cmdBlock(current, shellName(app.shell))!);
  else box.append(h('p', { class: 'muted' }, `Questo passo non ha un equivalente in ${shellName(app.shell)}.`));
  if (other) {
    box.append(h('details', { class: 'other-shell' }, h('summary', null, `Equivalente in ${shellName(other.sh)}`), h('pre', { class: 'code' }, h('code', null, other.cmd))));
  }
  return box;
}

function section(title: string, body: (Node | null)[], open = false, id?: string): HTMLElement {
  return h('details', { class: 'sec', open: open || undefined, id }, h('summary', null, title), h('div', { class: 'sec-body' }, body));
}

function guidedCard(g: Json): HTMLElement {
  const card = h('div', { class: 'card' }, h('h4', null, g.title), pairBlock(g.cmd));
  const dl = h('dl', { class: 'facts' },
    h('dt', null, 'Cosa fa'), h('dd', null, ...inlineMd(g.what)),
    h('dt', null, 'Chi lo interpreta'), h('dd', null, g.who),
    h('dt', null, 'Le parti'), h('dd', null, g.parts.length ? h('ul', null, g.parts.map((p: string) => h('li', null, p))) : '—'),
    h('dt', null, 'Output atteso'), h('dd', null, ...inlineMd(g.expect)),
    h('dt', null, 'Rischi'), h('dd', null, g.risk ?? '—'));
  card.append(dl);
  return card;
}

function predictCard(p: Json, index: number, lessonId: string, rec: any | undefined): HTMLElement {
  const card = h('div', { class: 'card predict' }, h('h4', null, `Previsione ${index + 1}`), h('p', null, ...inlineMd(p.prompt)));
  if (!rec) {
    const guess = h('textarea', { rows: '2', 'aria-label': 'Cosa prevedi che succeda', placeholder: 'Cosa prevedo che succeda (output, errori, codice di uscita)…' });
    const why = h('textarea', { rows: '2', 'aria-label': 'Perché', placeholder: 'Perché: quale regola mi fa prevedere questo…' });
    card.append(
      h('label', null, 'La mia previsione', guess),
      h('label', null, 'Il perché', why),
      h('button', { type: 'button', class: 'btn primary', on: { click: async () => {
        try {
          await api('POST', `/lessons/${lessonId}/prediction`, { step: index, shell: app.shell, text: guess.value, why: why.value });
          await loadLesson(lessonId);
          openPred.add(index);
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      } } }, 'Registra la previsione'),
      h('p', { class: 'muted' }, 'Il comando da eseguire compare dopo aver scritto previsione e perché.'),
    );
    return card;
  }
  card.append(h('blockquote', null, h('strong', null, 'Previsione: '), rec.text, h('br'), h('strong', null, 'Perché: '), rec.why));
  card.append(pairBlock(p.cmd));
  const cmp = h('div', { class: 'compare' }, h('p', null, h('strong', null, 'Confronta punto per punto con l\'output reale (maiuscole, barre, spazi, numero di messaggi).')), h('p', null, h('strong', null, 'Risultato atteso: '), p.expect), h('p', null, h('strong', null, 'Il perché corretto: '), p.why));
  if (rec.accurate === null) {
    cmp.append(
      h('div', { class: 'row' },
        h('span', null, 'La tua previsione coincideva?'),
        h('button', { type: 'button', class: 'btn small', on: { click: () => void assess(lessonId, rec.index, true) } }, 'Sì, coincideva'),
        h('button', { type: 'button', class: 'btn small', on: { click: () => void assess(lessonId, rec.index, false) } }, 'No, differiva')));
  } else cmp.append(h('p', { class: 'muted' }, rec.accurate ? 'Autovalutazione: la previsione coincideva.' : 'Autovalutazione: la previsione differiva (registrato tra i punti da consolidare).'));
  card.append(cmp);
  return card;
}

async function assess(lessonId: string, index: number, accurate: boolean): Promise<void> {
  try {
    await api('POST', `/lessons/${lessonId}/assess`, { index, accurate });
    await loadLesson(lessonId);
    await refreshSession();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

function checklist(l: any): HTMLElement {
  const live: Record<string, boolean> = Object.fromEntries((l.live ?? []).map((x: any) => [x.id, x.pass]));
  const last: Record<string, any> = Object.fromEntries((l.lastVerify?.checks ?? []).map((c: any) => [c.id, c]));
  const ul = h('ul', { class: 'checks', 'aria-label': 'Controlli della verifica' });
  for (const c of l.checks) {
    const ok = live[c.id];
    const lv = last[c.id];
    ul.append(
      h('li', { class: ok ? 'pass' : 'todo' },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, ok ? '✓' : '○'),
        h('span', { class: 'sr-only' }, ok ? 'Soddisfatto: ' : 'Da soddisfare: '),
        h('span', null, c.description),
        h('span', { class: `tag ${c.kind}` }, c.kind === 'editorial' ? 'editoriale' : 'verificabile'),
        lv && !lv.pass ? h('div', { class: 'why' }, h('div', null, h('strong', null, 'Atteso: '), lv.expected), h('div', null, h('strong', null, 'Ottenuto: '), lv.actual), lv.explanation ? h('div', null, h('strong', null, 'Perché: '), lv.explanation) : null) : null),
    );
  }
  return ul;
}

async function verify(l: any): Promise<void> {
  try {
    const r = await api<Json>('POST', `/lessons/${l.id}/verify`, { shell: app.shell });
    app.session = r.session;
    app.lesson = r.lesson;
    emit('session');
    emit('lesson');
    emit('verified', r);
    if (r.testNote) toast(r.testNote);
    toast(r.result.pass ? 'Verifica superata.' : 'Verifica non superata: vedi i controlli.', r.result.pass ? 'info' : 'error');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export function renderLesson(root: HTMLElement): void {
  const l = app.lesson;
  const top = h('div', { class: 'lesson-head' },
    h('button', { type: 'button', class: 'btn small', on: { click: () => { app.lesson = null; emit('lesson'); } } }, '← Percorso'),
    h('h2', null, l.review ? `Ripasso — ${l.title}` : `${l.id} — ${l.title}`),
    completionChips(l));
  root.append(top);
  if (!l.shells.includes(app.shell)) {
    root.append(h('div', { class: 'callout warn' }, `Questa lezione è pensata per ${l.shells.map(shellName).join(' / ')}. `, h('button', { class: 'btn small', type: 'button', on: { click: () => hooks.switchShell(l.shells[0]) } }, `Passa a ${shellName(l.shells[0])}`)));
  }
  root.append(h('p', { class: 'objective' }, h('strong', null, 'Obiettivo: '), ...inlineMd(l.objective)));
  root.append(h('p', { class: 'muted' }, `Cartella di lavoro: ${l.dir.replace('/home/learner', '~')} · cerca nel prompt dove ti trovi prima di ogni comando.`));

  root.append(section('Spiegazione', [renderMarkdown(l.explain.join('\n\n'))], true));
  const tools = ((l.tools ?? {})[app.shell] ?? []) as { name: string; text: string }[];
  if (tools.length) {
    root.append(section(`Strumenti per questo esercizio (${shellName(app.shell)})`, [
      h('p', { class: 'muted' }, 'Tutto ciò che serve per risolvere l\'esercizio è spiegato qui o nella spiegazione sopra.'),
      h('dl', { class: 'facts tools' }, ...tools.flatMap((t) => [h('dt', null, h('code', null, t.name)), h('dd', null, ...inlineMd(t.text))])),
    ], true, 'sec-tools'));
  }
  if (l.guided.length) root.append(section('Esempio guidato (un comando alla volta)', l.guided.map(guidedCard)));
  const preds = l.predictions as any[];
  if (l.predict.length) {
    root.append(section('Esercizio con previsione', l.predict.map((p: any, i: number) => predictCard(p, i, l.id, [...preds].reverse().find((x) => x.step === i && x.shell === app.shell))), openPred.size > 0, 'sec-predict'));
  }
  const neg = l.negative;
  root.append(section('Test negativo', [
    h('p', null, ...inlineMd(neg.prompt)),
    pairBlock(neg.cmd),
    h('details', null, h('summary', null, 'Spiegazione (dopo aver provato)'), h('p', null, ...inlineMd(neg.explain))),
  ]));

  // verifica
  const verifyBody: Node[] = [
    h('div', { class: 'task' }, h('strong', null, 'Esercizio'), renderMarkdown(String(l.task.text).split('\n').join('\n\n'))),
    h('p', null, h('strong', null, 'Criterio per passare oltre: '), ...inlineMd(l.task.criterion)),
    checklist(l),
  ];
  const actions = h('div', { class: 'row' });
  actions.append(h('button', { type: 'button', class: 'btn primary', on: { click: () => void verify(l) } }, 'Verifica'));
  actions.append(h('button', { type: 'button', class: 'btn', on: { click: () => hooks.gotoTab('chat') } }, 'Chiedi aiuto al tutor'));
  actions.append(h('button', { type: 'button', class: 'btn', on: { click: async () => {
    if (!confirm('Ripristinare i file e i dati di questa lezione? I documenti in ~/docs e lo storico restano.')) return;
    try {
      const r = await api<Json>('POST', `/lessons/${l.id}/reset`, {});
      app.session = r.session;
      app.lesson = r.lesson;
      hooks.reloadTerminal();
      emit('session');
      emit('lesson');
      toast('Lezione ripristinata');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  } } }, 'Reset lezione'));
  verifyBody.push(actions);
  if (l.autonomous) verifyBody.push(h('p', { class: 'muted' }, 'Verifica autonoma: la soluzione completa non è disponibile.'));
  const v = l.lastVerify;
  if (v) {
    verifyBody.push(
      h('div', { class: `result ${v.pass ? 'pass' : 'fail'}`, role: 'status' },
        v.pass ? `Verifica superata (${shellName(v.shell)}) — ${STATUS_LABEL[l.completions?.[v.shell]?.mode ?? 'autonomous'] ?? ''}.` : `Verifica non superata (${shellName(v.shell)}): ${v.checks.filter((c: any) => !c.pass).length} controlli da sistemare. Leggi la colonna "Perché" sotto ogni controllo.`));
    if (!v.pass && l.hasAlt) verifyBody.push(h('div', { class: 'callout' }, h('strong', null, 'Esercizio alternativo sullo stesso concetto: '), l.alt.task, ' Se lo completi, la lezione risulta superata con l\'alternativa (registrata come aiuto) e potrai riprovare la prova principale.'));
    if (v.pass && v.viaAlt) verifyBody.push(h('p', { class: 'muted' }, 'Superata con l\'esercizio alternativo.'));
    if (v.pass) {
      const sh2: ShellId = app.shell === 'bash' ? 'pwsh' : 'bash';
      if (l.shells.includes(sh2) && !l.completions?.[sh2]) {
        verifyBody.push(h('p', null, `Ora ripeti lo stesso obiettivo in ${shellName(sh2)} e confronta i risultati. `, h('button', { class: 'btn small', type: 'button', on: { click: () => hooks.switchShell(sh2) } }, `Passa a ${shellName(sh2)}`)));
      }
      verifyBody.push(h('h4', null, 'Riepilogo'), h('ul', null, l.summary.map((s: string) => h('li', null, s))));
      const next = app.session.course.next.lesson;
      if (next && next !== l.id) verifyBody.push(h('button', { type: 'button', class: 'btn primary', on: { click: () => void openLesson(next) } }, `Prossima lezione: ${next}`));
    }
  }
  root.append(section('Verifica', verifyBody, true, 'sec-verify'));
}

const openState = new Map<string, boolean>();

export function renderInstructions(root: HTMLElement): void {
  // conserva scorrimento e sezioni aperte tra un rendering e l'altro
  const scroll = root.scrollTop;
  root.querySelectorAll('details').forEach((d) => {
    const key = d.querySelector('summary')?.textContent ?? '';
    openState.set(`${app.lesson?.id ?? 'path'}:${key}`, d.open);
  });
  clear(root);
  if (!app.session) return void root.append(h('p', null, 'Caricamento…'));
  if (app.lesson) renderLesson(root);
  else renderPath(root);
  root.querySelectorAll('details').forEach((d) => {
    const key = `${app.lesson?.id ?? 'path'}:${d.querySelector('summary')?.textContent ?? ''}`;
    const st = openState.get(key);
    if (st !== undefined) d.open = st;
  });
  root.scrollTop = scroll;
}

export function initInstructionsEvents(root: HTMLElement): void {
  const render = (): void => renderInstructions(root);
  on('lesson', render);
  on('session', render);
  on('live', (live: any[]) => {
    if (!app.lesson) return;
    app.lesson.live = live;
    const el = root.querySelector('.checks');
    if (el) el.replaceWith(checklist(app.lesson));
  });
}
