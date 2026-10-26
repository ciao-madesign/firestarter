/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, copyText, h, renderMarkdown, toast } from './dom.ts';
import { api, app, emit, on, type Json } from './state.ts';

let root: HTMLElement;
let dir = '/home/learner/docs';
let entries: Json[] = [];
let current: { path: string; content: string; saved: string; notes?: boolean } | null = null;
let view: 'edit' | 'preview' | 'split' = 'split';
let lint: Json = null;
let diffText = '';
let status = '';
let saveTimer: number | undefined;
let editor: HTMLTextAreaElement | null = null;
let previewEl: HTMLElement | null = null;

const display = (p: string): string => (p === '/home/learner' ? '~' : p.startsWith('/home/learner/') ? '~' + p.slice('/home/learner'.length) : p);

async function loadDir(d: string): Promise<void> {
  try {
    const r = await api<Json>('GET', `/fs?dir=${encodeURIComponent(d)}`);
    dir = r.dir;
    entries = r.entries;
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function openFile(path: string): Promise<void> {
  try {
    if (current && current.content !== current.saved) await save();
    const r = await api<Json>('GET', `/file?path=${encodeURIComponent(path)}`);
    current = { path: r.path, content: r.content, saved: r.content };
    lint = null;
    diffText = '';
    status = '';
    const parent = r.path.slice(0, r.path.lastIndexOf('/')) || '/';
    await loadDir(parent);
    draw();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function openNotes(): Promise<void> {
  const r = await api<Json>('GET', '/notes');
  current = { path: 'note personali', content: r.notes, saved: r.notes, notes: true };
  lint = null;
  diffText = '';
  draw();
}

async function save(): Promise<void> {
  if (!current || current.content === current.saved) return;
  status = 'Salvataggio…';
  paintStatus();
  try {
    const r = current.notes ? await api<Json>('PUT', '/notes', { notes: current.content }) : await api<Json>('PUT', '/file', { path: current.path, content: current.content });
    current.saved = current.content;
    status = 'Salvato';
    if (r.live) emit('live', r.live);
  } catch (e) {
    status = 'Errore: ' + (e as Error).message;
    toast((e as Error).message, 'error');
  }
  paintStatus();
}

function paintStatus(): void {
  const el = root.querySelector('.save-status');
  if (el) el.textContent = status;
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  status = 'Modifiche non salvate…';
  paintStatus();
  saveTimer = window.setTimeout(() => void save(), 1200);
}

function updatePreview(): void {
  if (!previewEl || !current) return;
  clear(previewEl);
  previewEl.append(renderMarkdown(current.content));
}

function issueList(items: Json[], emptyMsg: string): HTMLElement {
  if (!items.length) return h('p', { class: 'muted' }, emptyMsg);
  return h('ul', { class: 'issues' }, items.map((i) => h('li', { class: i.severity }, h('button', { type: 'button', class: 'linkish', on: { click: () => goLine(i.line) } }, `riga ${i.line}`), h('span', { class: 'sev' }, i.severity === 'error' ? 'errore' : i.severity === 'warning' ? 'avviso' : 'nota'), ' ', i.message, i.hint ? h('div', { class: 'muted' }, i.hint) : null)));
}

function goLine(line: number): void {
  if (!editor) return;
  const lines = editor.value.split('\n');
  const pos = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
  editor.focus();
  editor.setSelectionRange(pos, pos + (lines[line - 1]?.length ?? 0));
  editor.scrollTop = Math.max(0, (line - 3) * 20);
}

async function runLint(): Promise<void> {
  if (!current) return;
  await save();
  try {
    lint = await api<Json>('POST', '/docs/lint', { content: current.content });
    draw();
    root.querySelector('.lint')?.scrollIntoView({ block: 'nearest' });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function showDiff(): Promise<void> {
  if (!current || current.notes) return;
  try {
    const r = await api<Json>('GET', `/docs/diff?path=${encodeURIComponent(current.path)}`);
    diffText = r.diff;
    draw();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

function draw(): void {
  clear(root);
  root.append(h('h2', null, 'Documentazione e file'));
  // percorso e elenco
  const crumbs = h('div', { class: 'row wrap' },
    h('button', { class: 'btn small', type: 'button', on: { click: () => void loadDir(dir.slice(0, dir.lastIndexOf('/')) || '/home/learner').then(draw) } }, '↑ Su'),
    h('code', null, display(dir)),
    h('button', { class: 'btn small', type: 'button', on: { click: () => void loadDir('/home/learner/docs').then(draw) } }, '~/docs'),
    h('button', { class: 'btn small', type: 'button', on: { click: () => void loadDir('/home/learner').then(draw) } }, '~'),
    h('button', { class: 'btn small', type: 'button', on: { click: () => void openNotes() } }, 'Note personali'),
    h('button', { class: 'btn small primary', type: 'button', on: { click: async () => {
      const name = prompt('Nome del nuovo file (es. guida.md) in ' + display(dir));
      if (!name) return;
      const path = `${dir}/${name.replace(/[^A-Za-z0-9._ -]/g, '_')}`;
      try {
        await api('PUT', '/file', { path, content: name.endsWith('.md') ? `# ${name.replace(/\.md$/, '')}\n\n` : '' });
        await loadDir(dir);
        await openFile(path);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    } } }, 'Nuovo file'));
  const files = h('ul', { class: 'filelist', 'aria-label': 'Contenuto della cartella' });
  for (const e of entries) {
    files.append(h('li', null, h('button', { type: 'button', class: `file ${e.type}${current?.path === e.path ? ' current' : ''}`, on: { click: () => void (e.type === 'dir' ? loadDir(e.path).then(draw) : openFile(e.path)) } }, e.type === 'dir' ? `${e.name}/` : e.name, e.type === 'file' ? h('span', { class: 'muted' }, ` ${e.size} B`) : null)));
  }
  if (!entries.length) files.append(h('li', { class: 'muted' }, 'Cartella vuota'));
  root.append(crumbs, files);

  if (!current) {
    root.append(h('p', { class: 'muted' }, 'Apri un file per modificarlo. I documenti Markdown hanno anteprima e controllo tecnico. Gli stessi file sono visibili dal terminale (cat, Get-Content).'));
    return;
  }
  const modes = h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' });
  for (const [k, label] of [['edit', 'Modifica'], ['split', 'Affiancati'], ['preview', 'Anteprima']] as const) {
    modes.append(h('button', { type: 'button', class: `seg-btn${view === k ? ' on' : ''}`, 'aria-pressed': String(view === k), on: { click: () => { view = k; draw(); } } }, label));
  }
  const isMd = /\.md$/i.test(current.path) || !!current.notes;
  root.append(
    h('div', { class: 'row wrap editor-bar' },
      h('strong', null, current.notes ? 'Note personali' : display(current.path)),
      h('span', { class: 'save-status muted', role: 'status' }, status),
      h('span', { class: 'spacer' }),
      modes,
      isMd ? h('button', { class: 'btn small primary', type: 'button', on: { click: () => void runLint() } }, 'Controlla') : null,
      h('button', { class: 'btn small', type: 'button', title: 'Copia il documento con l\'esito del controllo, da incollare nella chat di Claude per un commento', on: { click: async () => {
        try {
          const r = await api<Json>('POST', '/brief', { kind: 'doc', content: current!.content, path: current!.path, shell: app.shell, question: 'Commenta questo documento e indica cosa migliorare.' });
          toast((await copyText(r.text)) ? 'Riepilogo copiato: incollalo nella chat di Claude' : 'Copia non riuscita', 'info');
        } catch (e) { toast((e as Error).message, 'error'); }
      } } }, 'Copia per Claude'),
      current.notes ? null : h('button', { class: 'btn small', type: 'button', on: { click: () => void showDiff() } }, 'Confronta con la versione precedente'),
      h('button', { class: 'btn small', type: 'button', on: { click: () => { const b = new Blob([current!.content], { type: 'text/plain' }); const a = h('a', { href: URL.createObjectURL(b), download: current!.path.split('/').pop() ?? 'documento.md' }); a.click(); } } }, 'Scarica')),
  );
  editor = h('textarea', { class: 'editor', spellcheck: 'false', 'aria-label': 'Contenuto del file', on: { input: () => { current!.content = editor!.value; updatePreview(); scheduleSave(); } } });
  editor.value = current.content;
  previewEl = h('div', { class: 'preview', 'aria-label': 'Anteprima' });
  updatePreview();
  const panes = h('div', { class: `panes ${view}` });
  if (view !== 'preview') panes.append(editor);
  if (view !== 'edit' && isMd) panes.append(previewEl);
  else if (view === 'preview' && !isMd) panes.append(h('pre', { class: 'code' }, current.content));
  root.append(panes);

  if (diffText) {
    root.append(h('h3', null, 'Differenze con la versione precedente'), h('pre', { class: 'diff' }, ...diffText.split('\n').map((l) => h('span', { class: l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '' }, l + '\n'))));
  }
  if (lint) {
    const v = lint.issues.filter((i: Json) => i.kind === 'verifiable');
    const e = lint.issues.filter((i: Json) => i.kind === 'editorial');
    const box = h('section', { class: 'lint', 'aria-label': 'Risultato del controllo' });
    box.append(h('h3', null, 'Controllo del documento'));
    box.append(h('p', null, `Errori verificabili: ${lint.stats.errors} · avvisi: ${lint.stats.warnings} · valutazioni editoriali: ${lint.stats.editorial} · esempi eseguiti: ${lint.stats.examplesOk}/${lint.stats.examplesRun} corretti`));
    box.append(h('h4', null, 'Verificabili (oggettivi)'), issueList(v, 'Nessun problema oggettivo trovato.'));
    box.append(h('h4', null, 'Editoriali (valutazioni, non fatti)'), issueList(e, 'Nessuna osservazione editoriale.'));
    if (lint.examples.length) {
      box.append(h('h4', null, 'Esempi eseguiti in una copia isolata'),
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['riga', 'risposta', 'documentato', 'esito'].map((c) => h('th', { scope: 'col' }, c)))), h('tbody', null, lint.examples.map((x: Json) => h('tr', null, h('td', null, String(x.line)), h('td', null, x.status === null ? '—' : String(x.status)), h('td', null, x.expected === null ? '—' : String(x.expected)), h('td', null, x.ok === null ? 'senza stato atteso' : x.ok ? 'coerente' : 'differenza')))))));
    }
    root.append(box);
  }
}

export async function initDocs(el: HTMLElement): Promise<void> {
  root = el;
  await loadDir(dir);
  draw();
  on('open-file', (p: string) => {
    app.tab = 'documentazione';
    emit('goto-tab', 'documentazione');
    void openFile(p);
  });
  on('executed', () => {
    if (app.tab === 'documentazione' && !current?.notes) void loadDir(dir).then(() => { if (!document.activeElement || document.activeElement !== editor) draw(); });
  });
}

export function refreshDocs(): void {
  void loadDir(dir).then(() => {
    if (document.activeElement !== editor) draw();
  });
}
