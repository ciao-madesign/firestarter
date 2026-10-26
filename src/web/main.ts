/* eslint-disable @typescript-eslint/no-explicit-any */
import { $, clear, h, toast } from './dom.ts';
import { api, app, emit, loadLesson, on, refreshSession, savePrefs, shellName, type ShellId } from './state.ts';
import { Terminal } from './terminal.ts';
import { initInstructionsEvents, initLesson, openLesson, renderInstructions } from './lesson.ts';
import { initChat } from './chat.ts';
import { initEnv, loadEnv } from './env.ts';
import { initDocs, refreshDocs } from './docs.ts';
import { initResults } from './results.ts';

const TABS: [string, string][] = [
  ['istruzioni', 'Istruzioni'],
  ['chat', 'Chat'],
  ['ambiente', 'Ambiente'],
  ['documentazione', 'Documentazione'],
  ['risultati', 'Risultati'],
];

const SWITCH_NOTE: Record<ShellId, string> = {
  bash: 'variabili con $NOME, pipeline di testo, && per concatenare, il programma curl.',
  pwsh: 'variabili d\'ambiente con $env:NOME, pipeline di oggetti, niente &&, curl è un alias (il vero curl è curl.exe).',
};

let term: Terminal;
let layout: HTMLElement;
let guide: HTMLElement;
let tabButtons: Record<string, HTMLButtonElement> = {};
let panels: Record<string, HTMLElement> = {};
let shellButtons: Record<string, HTMLButtonElement> = {};
let banner: HTMLElement;

function setTab(name: string, focus = false): void {
  app.tab = name;
  for (const [k, b] of Object.entries(tabButtons)) {
    const on_ = k === name;
    b.setAttribute('aria-selected', String(on_));
    b.tabIndex = on_ ? 0 : -1;
    panels[k].hidden = !on_;
  }
  if (focus) tabButtons[name].focus();
  savePrefs({ tab: name });
  if (name === 'ambiente') void loadEnv();
  if (name === 'documentazione') refreshDocs();
  if (name === 'risultati') void refreshSession();
  if (name === 'chat') (panels.chat.querySelector('input') as HTMLInputElement | null)?.focus();
  if (matchMedia('(max-width: 899px)').matches) setMobile('guide');
}

function setMobile(v: 'terminal' | 'guide'): void {
  layout.dataset.mobile = v;
  document.querySelectorAll<HTMLButtonElement>('.mobile-nav button').forEach((b) => {
    const on_ = b.dataset.view === v;
    b.setAttribute('aria-pressed', String(on_));
  });
  if (v === 'terminal') term.focus();
}

function switchShell(sh: ShellId, announce = true): void {
  if (app.shell === sh && announce) return;
  app.shell = sh;
  term.setShell(sh);
  for (const [k, b] of Object.entries(shellButtons)) {
    b.setAttribute('aria-pressed', String(k === sh));
    b.classList.toggle('on', k === sh);
  }
  savePrefs({ shell: sh });
  if (announce) toast(`${shellName(sh)}. ${SWITCH_NOTE[sh]}`);
  if (app.lesson) void loadLesson(app.lesson.id);
  else emit('lesson');
  term.focus();
}

function setSplit(pct: number): void {
  const p = Math.max(30, Math.min(75, pct));
  layout.style.setProperty('--split', `${p}%`);
  savePrefs({ splitPercent: p });
}

function applyPrefs(): void {
  const p = app.session.prefs;
  document.documentElement.style.setProperty('--fs', `${p.fontSize}px`);
  layout.style.setProperty('--split', `${p.splitPercent}%`);
  layout.classList.toggle('no-guide', !p.rightPanelVisible);
}

function toggleGuide(force?: boolean): void {
  const hidden = layout.classList.contains('no-guide');
  const show = force ?? hidden;
  layout.classList.toggle('no-guide', !show);
  savePrefs({ rightPanelVisible: show });
  const b = document.getElementById('toggle-guide');
  if (b) b.setAttribute('aria-pressed', String(show));
}

function buildHeader(): HTMLElement {
  const sw = h('div', { class: 'shell-switch', role: 'group', 'aria-label': 'Selezione della shell' });
  for (const [id, label] of [['bash', 'Bash'], ['pwsh', 'PowerShell 5.1']] as const) {
    const b = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': 'false', title: id === 'bash' ? 'Alt+1' : 'Alt+2', on: { click: () => switchShell(id) } }, label);
    shellButtons[id] = b;
    sw.append(b);
  }
  const font = (d: number) => (): void => {
    const cur = app.session?.prefs.fontSize ?? 15;
    const n = Math.max(11, Math.min(24, cur + d));
    app.session.prefs.fontSize = n;
    document.documentElement.style.setProperty('--fs', `${n}px`);
    savePrefs({ fontSize: n });
  };
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '>_'), h('span', null, 'CLI & API Learning Lab')),
    h('span', { class: 'badge-sim', role: 'note' }, h('span', { class: 'long' }, 'AMBIENTE SIMULATO — nessun comando viene eseguito sul tuo dispositivo'), h('span', { class: 'short', 'aria-label': 'Ambiente simulato: nessun comando viene eseguito sul tuo dispositivo' }, 'SIMULATO')),
    h('span', { class: 'spacer' }),
    sw,
    h('div', { class: 'tools' },
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Riduci il testo', on: { click: font(-1) } }, 'A−'),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Ingrandisci il testo', on: { click: font(1) } }, 'A+'),
      h('button', { type: 'button', id: 'toggle-guide', class: 'btn small', 'aria-pressed': 'true', title: 'Alt+G', on: { click: () => toggleGuide() } }, 'Pannello guida'),
      h('button', { type: 'button', class: 'btn small desktop-only', title: 'Ripristina il layout iniziale', on: { click: () => { setSplit(60); toggleGuide(true); } } }, 'Reset layout')),
  );
}

function buildGuide(): HTMLElement {
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Schede del pannello guida' });
  const wrap = h('div', { class: 'tabpanels' });
  for (const [id, label] of TABS) {
    const b = h('button', {
      type: 'button',
      role: 'tab',
      id: `tab-${id}`,
      'aria-controls': `panel-${id}`,
      'aria-selected': 'false',
      class: 'tab',
      on: {
        click: () => setTab(id),
        keydown: (e) => {
          const ev = e as KeyboardEvent;
          const i = TABS.findIndex((t) => t[0] === id);
          if (ev.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length][0], true);
          else if (ev.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length][0], true);
        },
      },
    }, label);
    tabButtons[id] = b;
    tablist.append(b);
    const p = h('div', { role: 'tabpanel', id: `panel-${id}`, 'aria-labelledby': `tab-${id}`, class: 'tabpanel', tabindex: '0' });
    p.hidden = true;
    panels[id] = p;
    wrap.append(p);
  }
  return h('aside', { class: 'pane pane-guide', 'aria-label': 'Guida e laboratorio' }, tablist, wrap);
}

function bindShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key === '1') { e.preventDefault(); switchShell('bash'); }
    else if (e.key === '2') { e.preventDefault(); switchShell('pwsh'); }
    else if (e.key.toLowerCase() === 't') { e.preventDefault(); term.focus(); }
    else if (e.key.toLowerCase() === 'g') { e.preventDefault(); toggleGuide(); }
    else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const i = TABS.findIndex((t) => t[0] === app.tab);
      setTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]);
    }
  });
}

function buildSplitter(): HTMLElement {
  const s = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Ridimensiona i pannelli', 'aria-valuemin': '30', 'aria-valuemax': '75', 'aria-valuenow': '60', tabindex: '0' });
  let dragging = false;
  s.addEventListener('pointerdown', (e) => { dragging = true; s.setPointerCapture(e.pointerId); });
  s.addEventListener('pointerup', () => { dragging = false; });
  s.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = layout.getBoundingClientRect();
    const pct = ((e.clientX - r.left) / r.width) * 100;
    setSplit(pct);
    s.setAttribute('aria-valuenow', String(Math.round(pct)));
  });
  s.addEventListener('keydown', (e) => {
    const cur = app.session?.prefs.splitPercent ?? 60;
    if (e.key === 'ArrowLeft') { setSplit(cur - 3); app.session.prefs.splitPercent = cur - 3; }
    else if (e.key === 'ArrowRight') { setSplit(cur + 3); app.session.prefs.splitPercent = cur + 3; }
  });
  return s;
}

async function loginScreen(rootEl: HTMLElement): Promise<void> {
  clear(rootEl);
  const pw = h('input', { type: 'password', id: 'lab-pw', autocomplete: 'current-password', 'aria-label': 'Password', required: true });
  const msg = h('p', { role: 'alert', class: 'fatal' });
  const form = h('form', { class: 'login', on: { submit: async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/login', { password: pw.value });
      location.reload();
    } catch (err) {
      msg.textContent = (err as Error).message;
    }
  } } }, h('h1', null, 'CLI & API Learning Lab'), h('p', { class: 'muted' }, 'Accesso riservato. Ambiente simulato: nessun comando viene eseguito sul tuo dispositivo.'), h('label', null, 'Password', pw), h('button', { class: 'btn primary', type: 'submit' }, 'Entra'), msg);
  rootEl.append(form);
  pw.focus();
}

async function boot(): Promise<void> {
  const rootEl = $('#app');
  clear(rootEl);
  try {
    const st = await api<{ required: boolean; authenticated: boolean }>('GET', '/auth-status');
    if (st.required && !st.authenticated) return void (await loginScreen(rootEl));
  } catch {
    /* offline: si prosegue con i contenuti in cache */
  }
  on('auth-required', () => location.reload());
  term = new Terminal();
  initLesson({
    insertCommand: (cmd) => { term.setLine(cmd); if (matchMedia('(max-width: 899px)').matches) setMobile('terminal'); },
    switchShell: (s) => switchShell(s),
    gotoTab: (t) => setTab(t),
    reloadTerminal: () => { if (app.session) { term.loadFromSession(); term.refreshPrompt(); } },
  });
  guide = buildGuide();
  layout = h('main', { class: 'layout', 'data-mobile': 'terminal' }, term.root, buildSplitter(), guide);
  banner = h('div', { class: 'offline', role: 'status', hidden: true }, 'Connessione assente: puoi consultare i contenuti già caricati; i comandi richiedono il server.');
  const nav = h('nav', { class: 'mobile-nav', 'aria-label': 'Navigazione' },
    h('button', { type: 'button', 'data-view': 'terminal', 'aria-pressed': 'true', on: { click: () => setMobile('terminal') } }, 'Terminale'),
    h('button', { type: 'button', 'data-view': 'guide', 'aria-pressed': 'false', on: { click: () => setMobile('guide') } }, 'Guida e laboratorio'));
  rootEl.append(buildHeader(), banner, layout, nav);

  initChat(panels.chat);
  initEnv(panels.ambiente);
  initResults(panels.risultati);
  initInstructionsEvents(panels.istruzioni);
  bindShortcuts();
  on('online', (v: boolean) => { banner.hidden = v; });
  on('insert-command', (cmd: string) => { term.setLine(cmd); if (matchMedia('(max-width: 899px)').matches) setMobile('terminal'); });
  on('goto-tab', (t: string) => setTab(t));

  try {
    await refreshSession();
  } catch (e) {
    rootEl.append(h('p', { class: 'fatal' }, (e as Error).message));
    return;
  }
  app.shell = app.session.prefs.shell;
  applyPrefs();
  for (const [k, b] of Object.entries(shellButtons)) {
    b.setAttribute('aria-pressed', String(k === app.shell));
    b.classList.toggle('on', k === app.shell);
  }
  term.loadFromSession();
  await initDocs(panels.documentazione);
  if (app.session.activeExercise) {
    try {
      await loadLesson(app.session.activeExercise);
    } catch {
      /* lezione non più disponibile */
    }
  }
  renderInstructions(panels.istruzioni);
  const tab = TABS.some((t) => t[0] === app.session.prefs.tab) ? app.session.prefs.tab : 'istruzioni';
  setTab(tab);
  setMobile('terminal');
  document.getElementById('toggle-guide')?.setAttribute('aria-pressed', String(app.session.prefs.rightPanelVisible));
  if (!app.session.activeExercise) {
    const next = app.session.course.next.lesson;
    toast(`Sessione ripresa. Prossima lezione: ${next}.`);
  }
  term.focus();
  void openLesson;

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
  void api;
}

void boot();
