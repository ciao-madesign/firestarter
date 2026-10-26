/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, copyText, h, renderMarkdown, toast } from './dom.ts';
import { api, app, download, on, refreshSession, shellName, workspaceId, type Json, type ShellId } from './state.ts';
import { openLesson } from './lesson.ts';

let root: HTMLElement;
let registroOut = '';
let registroIn = '';
let registroMsg: string[] = [];
let courseMd = '';

const OUTCOME: Record<string, string> = { passed: 'superato', passed_partial: 'superato a metà', retry: 'superato al 2° tentativo', failed: 'non superato' };

function skillsSection(): HTMLElement {
  const sec = h('section', { 'aria-label': 'Competenze' }, h('h3', null, 'Competenze misurate separatamente'));
  sec.append(h('p', { class: 'muted' }, 'Una lezione completata con la soluzione mostrata pesa meno di una svolta in autonomia. I valori sono dati, non punteggi da inseguire.'));
  for (const s of app.session.skills) {
    sec.append(
      h('div', { class: 'skill' },
        h('div', { class: 'skill-head' }, h('span', null, s.label), h('span', { class: 'muted' }, s.score === null ? 'non ancora misurata' : `${s.score}%`)),
        s.score === null ? null : h('meter', { min: '0', max: '100', value: String(s.score), 'aria-label': `${s.label}: ${s.score}%` }),
        s.total ? h('div', { class: 'muted small' }, `${s.autonomous} in autonomia · ${s.hinted} con indizi · ${s.solution} con soluzione (su ${s.total})`) : null),
    );
  }
  return sec;
}

function testSection(): HTMLElement | null {
  const t = app.session.moduleTest;
  if (!t) return null;
  const sec = h('section', { 'aria-label': 'Test intermedio' }, h('h3', null, `Test intermedio M${t.module}${t.finished ? ' — concluso' : ''}`));
  sec.append(h('p', { class: 'muted' }, 'Quattro esercizi misti, anche di moduli precedenti, scelti dando peso agli errori ricorrenti. Durante il test gli aiuti non sono disponibili.'));
  const ul = h('ul', { class: 'lessons' });
  t.items.forEach((it: Json, n: number) => {
    const title = app.session.course.titles[it.lesson];
    ul.append(
      h('li', null,
        h('div', { class: 'test-item' },
          h('div', null, h('strong', null, `Esercizio ${n + 1}: ${it.lesson} — ${title ?? ''}`), h('div', { class: 'muted' }, it.reason)),
          it.done ? h('span', { class: `chip ${it.outcome === 'passed' ? 'autonomous' : it.outcome === 'failed' ? 'none' : 'hinted'}` }, OUTCOME[it.outcome] ?? it.outcome) : h('button', { class: 'btn small primary', type: 'button', on: { click: () => void openLesson(it.lesson) } }, it.fails ? `Riprova (${it.fails} tentativo/i fallito/i)` : 'Svolgi')),
      ),
    );
  });
  sec.append(ul);
  if (!t.finished) sec.append(h('button', { class: 'btn small', type: 'button', on: { click: async () => { await api('POST', '/course/test/cancel', {}); await refreshSession(); } } }, 'Annulla il test'));
  return sec;
}

function lastVerifySection(): HTMLElement | null {
  const v = app.lesson?.lastVerify;
  if (!v) return null;
  const sec = h('section', { 'aria-label': 'Ultima verifica' }, h('h3', null, `Ultima verifica — ${app.lesson.id} (${shellName(v.shell)}): ${v.pass ? 'superata' : 'non superata'}`));
  sec.append(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Controllo', 'Atteso', 'Ottenuto', 'Esito'].map((c) => h('th', { scope: 'col' }, c)))), h('tbody', null, v.checks.map((c: Json) => h('tr', { class: c.pass ? 'ok' : 'e4' }, h('td', null, c.description), h('td', null, c.expected), h('td', null, c.actual), h('td', null, c.pass ? 'ok' : 'differenza')))))));
  sec.append(h('p', null, h('button', { class: 'linkish', type: 'button', on: { click: () => void download('/report', 'report-test.md').catch((e) => toast((e as Error).message, 'error')) } }, 'Scarica il report (Markdown)'), ' — riutilizzabile per issue, bug report e documentazione.'));
  return sec;
}

function registroSection(): HTMLElement {
  const sec = h('section', { 'aria-label': 'REGISTRO' }, h('h3', null, 'REGISTRO di fine sessione'));
  sec.append(h('p', { class: 'muted' }, 'Lo stesso formato è usato dal tutor in terminale e dalla chat: importando un REGISTRO incollato lo stato resta allineato (il livello e l\'avanzamento non tornano indietro).'));
  const out = h('textarea', { class: 'registro', readonly: true, rows: '8', 'aria-label': 'REGISTRO generato' });
  out.value = registroOut;
  const inp = h('textarea', { class: 'registro', rows: '8', 'aria-label': 'Incolla qui un REGISTRO', placeholder: 'REGISTRO — [data]\nAmbiente: ...\nLezione completata: M2.L1 — ...\nLivello attuale: 2\nAcquisito: ...\nDa consolidare: ...\nProssima lezione: M2.L2 — ...', on: { input: () => { registroIn = inp.value; } } });
  inp.value = registroIn;
  sec.append(
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', on: { click: async () => { const r = await api<Json>('GET', `/course/registro?shell=${app.shell}`); registroOut = r.text; draw(); } } }, 'Genera il REGISTRO'),
      ...(registroOut ? [h('button', { class: 'btn', type: 'button', on: { click: () => void copyText(registroOut).then(() => toast('REGISTRO copiato')) } }, 'Copia')] : [])),
    ...(registroOut ? [out] : []),
    h('label', null, 'Importa un REGISTRO', inp),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', on: { click: async () => {
      try {
        const r = await api<Json>('POST', '/course/registro', { text: registroIn });
        registroMsg = r.changes;
        registroIn = '';
        await refreshSession();
      } catch (e) {
        registroMsg = [(e as Error).message];
        draw();
      }
    } } }, 'Importa')),
    ...(registroMsg.length ? [h('ul', { role: 'status' }, registroMsg.map((m) => h('li', null, m)))] : []),
  );
  return sec;
}

function draw(): void {
  clear(root);
  const s = app.session;
  if (!s) return void root.append(h('p', null, 'Caricamento…'));
  const c = s.course;
  root.append(h('h2', null, 'Risultati e progressi'));
  root.append(
    h('section', { 'aria-label': 'Livello' },
      h('h3', null, `Livello attuale: ${c.level} su 4`),
      h('p', null, c.levelNote),
      h('ol', { class: 'levels', start: '1' }, ['Non autonomo', 'Esegue con istruzioni dettagliate', 'Esegue da solo le attività tipiche', 'Adatta la procedura a problemi nuovi e motiva le scelte'].map((t, i) => h('li', { class: i + 1 === c.level ? 'current' : '', 'aria-current': i + 1 === c.level ? 'true' : null }, t))),
      h('p', null, `Prossima lezione: ${c.next.lesson}${c.titles[c.next.lesson] ? ' — ' + c.titles[c.next.lesson] : ''}`),
      c.next.note ? h('p', { class: 'muted' }, c.next.note) : null,
    ),
  );
  const t = testSection();
  if (t) root.append(t);
  root.append(skillsSection());
  const lv = lastVerifySection();
  if (lv) root.append(lv);

  if (s.recovery.length) {
    root.append(h('section', null, h('h3', null, 'Esercizi di recupero proposti'), h('ul', null, s.recovery.map((r: Json) => h('li', null, h('button', { class: 'linkish', type: 'button', on: { click: () => void openLesson(r.lesson) } }, `${r.lesson} — ${r.title}`), ` (${r.reason})`)))));
  }
  root.append(
    h('section', null,
      h('h3', null, 'Errori ricorrenti'),
      c.recurringErrors.length ? h('ol', null, c.recurringErrors.map((e: Json) => h('li', null, `${e.text} — occorrenze: ${e.count}`))) : h('p', { class: 'muted' }, 'Nessuno registrato.'),
      h('h3', null, 'Da consolidare'),
      c.toConsolidate.length ? h('ul', null, c.toConsolidate.map((e: string) => h('li', null, e))) : h('p', { class: 'muted' }, 'Niente al momento.'),
      h('h3', null, 'Punti di forza'),
      h('ul', null, c.strengths.map((e: string) => h('li', null, e)))),
  );
  const tests = Object.entries(c.tests) as [string, Json][];
  if (tests.length) {
    root.append(h('section', null, h('h3', null, 'Test intermedi svolti'), tests.map(([mod, tt]) => h('div', null, h('h4', null, `${mod} (${tt.date})`), h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Es.', 'Esercizio', 'Esito', 'Problema'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, tt.items.map((it: Json) => h('tr', null, h('td', null, String(it.n)), h('td', null, it.title), h('td', null, OUTCOME[it.outcome] ?? it.outcome), h('td', null, it.issue))))))))));
  }
  root.append(registroSection());
  const det = h('details', { class: 'sec' }, h('summary', null, 'Progress.md (vista leggibile dello stato del corso)'), h('div', { class: 'sec-body' }, courseMd ? renderMarkdown(courseMd) : 'Caricamento…'));
  det.addEventListener('toggle', async () => {
    if (det.open && !courseMd) {
      const r = await api<Json>('GET', '/course');
      courseMd = r.markdown;
      draw();
    }
  });
  root.append(det);
  root.append(
    h('section', null,
      h('h3', null, 'Esportazione e dati personali'),
      h('p', null, 'Esporta i principali artefatti in formati aperti: ', h('button', { class: 'linkish', type: 'button', on: { click: () => void download('/export?format=json', 'workspace.json') } }, 'JSON'), ' · ', h('button', { class: 'linkish', type: 'button', on: { click: () => void download('/export?format=yaml', 'workspace.yaml') } }, 'YAML'), ' · ', h('button', { class: 'linkish', type: 'button', on: { click: () => void download('/report', 'report-test.md') } }, 'report (Markdown)'), '. I documenti sono anche scaricabili dalla scheda Documentazione.'),
      h('details', { class: 'sec' }, h('summary', null, 'Usare lo stesso workspace da un altro dispositivo (solo modalità multi-workspace)'), h('div', { class: 'sec-body' },
        h('p', { class: 'muted' }, 'Il codice identifica il tuo workspace: chi lo conosce può leggerlo e modificarlo. Non condividerlo. In modalità personale (predefinita) il server usa un solo workspace e questo codice è ignorato.'),
        h('div', { class: 'row' }, h('code', null, location.origin + '/#ws=' + workspaceId()), h('button', { class: 'btn small', type: 'button', on: { click: () => void copyText(location.origin + '/#ws=' + workspaceId()).then(() => toast('Link copiato')) } }, 'Copia il link')))),
      h('button', { class: 'btn danger', type: 'button', on: { click: async () => {
        if (!confirm('Eliminare TUTTI i dati del workspace (file, progressi, note)? Non si può annullare.')) return;
        await api('DELETE', '/workspace');
        location.reload();
      } } }, 'Elimina tutti i miei dati'),
    ),
  );
}

export function initResults(el: HTMLElement): void {
  root = el;
  on('session', draw);
  on('lesson', draw);
  draw();
  void (null as unknown as ShellId);
}
