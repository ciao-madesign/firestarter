/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, copyText, h, renderMarkdown, toast } from './dom.ts';
import { api, app, emit, loadLesson, on, shellName } from './state.ts';

let log: HTMLElement;
let messages: { role: 'user' | 'tutor'; text: string }[] = [];
let input: HTMLInputElement;

function draw(): void {
  clear(log);
  if (!messages.length) {
    log.append(
      h('div', { class: 'msg tutor' },
        renderMarkdown('Sono il tutor del laboratorio: spiego i comandi dal catalogo, analizzo gli errori reali e do indizi graduati. Funziono senza AI; se il server la mette a disposizione, puoi attivarla qui sotto per spiegazioni e indizi con parole più semplici.\n\nNon invento output: ti dico solo ciò che il sistema ha registrato. Puoi scrivere per esempio:\n\n- spiega curl -s -i $TASKFLOW_URL/v1/health\n- perché ho questo errore?\n- indizio'),
      ),
    );
  }
  for (const m of messages) log.append(h('div', { class: `msg ${m.role}` }, h('div', { class: 'who' }, m.role === 'user' ? 'Tu' : 'Tutor'), renderMarkdown(m.text)));
  log.scrollTop = log.scrollHeight;
}

async function ask(mode: string, text = ''): Promise<void> {
  const shown = text || (mode === 'chat' ? '' : { hint: 'Indizio', explain: 'Spiegazione', example: 'Esempio', analyze: 'Analizza il mio ultimo errore', solution: 'Soluzione completa', status: 'Com\'è andata la verifica?' }[mode] ?? mode);
  if (shown) messages.push({ role: 'user', text: shown });
  draw();
  try {
    const r = await api<any>('POST', '/tutor', { mode, text: mode === 'chat' ? text : mode === 'explain' ? text : '', shell: app.shell });
    messages = (r.chat as any[]).map((m) => ({ role: m.role, text: m.text }));
    draw();
    if (r.reply.commands) {
      const cmd = r.reply.commands[app.shell];
      if (cmd) {
        const btn = h('button', { type: 'button', class: 'btn small', on: { click: () => emit('insert-command', cmd) } }, 'Inserisci l\'esempio nel terminale');
        log.append(h('div', { class: 'msg tutor' }, h('pre', { class: 'code' }, h('code', null, cmd)), btn));
        log.scrollTop = log.scrollHeight;
      }
    }
    if (r.reply.help && app.lesson) await loadLesson(app.lesson.id);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function askAi(mode: 'simplify' | 'hint', target: 'lesson' | 'error' | 'text', text = ''): Promise<void> {
  const shown = mode === 'hint' ? 'Indizio (AI)' : target === 'error' ? 'Spiega l\'ultimo errore (AI)' : target === 'text' ? `Spiega con parole semplici (AI): ${text}` : 'Spiega la lezione con parole più semplici (AI)';
  messages.push({ role: 'user', text: shown });
  messages.push({ role: 'tutor', text: 'Sto chiedendo all\'AI… (se non risponde entro 15 secondi ti do l\'aiuto standard)' });
  draw();
  try {
    const r = await api<any>('POST', '/ai', { mode, target, text, shell: app.shell });
    messages = (r.chat as any[]).map((m) => ({ role: m.role, text: m.text }));
    draw();
    if (app.lesson) await loadLesson(app.lesson.id);
  } catch (e) {
    messages.splice(-2, 2);
    draw();
    toast((e as Error).message, 'error');
  }
}

export function initChat(root: HTMLElement): void {
  log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversazione con il tutor' });
  input = h('input', { type: 'text', class: 'chat-input', 'aria-label': 'Scrivi al tutor', placeholder: 'Scrivi una domanda o: spiega <comando>', autocomplete: 'off' });
  const quick = h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Modalità di aiuto' });
  const q = (label: string, mode: string, title: string): void => {
    quick.append(h('button', { type: 'button', class: 'btn small', title, on: { click: () => void ask(mode) } }, label));
  };
  q('Indizio', 'hint', 'Prima un esempio analogo, poi suggerimenti graduati');
  q('Spiegazione', 'explain', 'Chiarisce il concetto e l\'ultimo comando');
  q('Esempio', 'example', 'Una dimostrazione analoga');
  q('Analizza errore', 'analyze', 'Interpreta l\'ultimo output reale');
  q('Risultato verifica', 'status', 'Riporta l\'esito dell\'ultima verifica eseguita dal sistema');
  q('Soluzione completa', 'solution', 'Registrata come aiuto usato');
  const form = h('form', { class: 'chat-form', on: { submit: (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; void ask('chat', t); } } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Invia'));
  const note = h('p', { class: 'muted small' }, 'Tutor deterministico (l\'aiuto con AI è facoltativo e compare sotto solo se il server lo mette a disposizione). Le soluzioni complete vengono registrate come aiuto usato e non valgono come svolgimento in autonomia.');
  const brief = h('button', { type: 'button', class: 'btn small', title: 'Copia un riepilogo (esercizio, ultimi comandi, esito verifica) da incollare nella chat di Claude o nel tutor in terminale', on: { click: async () => {
    try {
      const r = await api<any>('POST', '/brief', { kind: 'lesson', question: input.value.trim(), shell: app.shell });
      toast((await copyText(r.text)) ? 'Riepilogo copiato: incollalo nella chat di Claude' : 'Copia non riuscita', 'info');
    } catch (e) { toast((e as Error).message, 'error'); }
  } } }, 'Copia riepilogo per Claude');
  const clr = h('button', { type: 'button', class: 'btn small', on: { click: async () => { await api('POST', '/tutor/clear', {}); messages = []; draw(); } } }, 'Svuota conversazione');
  // aiuto con AI (facoltativo): compare solo se il server ha la chiave; l'allievo deve attivarlo
  const aiBox = h('div', { class: 'card', hidden: true, 'aria-label': 'Aiuto con AI' });
  const aiButtons = h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Aiuto con AI' });
  const aiBtn = (label: string, title: string, fn: () => void): void => void aiButtons.append(h('button', { type: 'button', class: 'btn small', title, on: { click: fn } }, label));
  aiBtn('Spiega la lezione più semplice', 'L\'AI riscrive la spiegazione con parole più semplici (conta come spiegazione usata)', () => void askAi('simplify', 'lesson'));
  aiBtn('Spiega l\'ultimo errore', 'L\'AI spiega in modo semplice l\'ultimo risultato o errore', () => void askAi('simplify', 'error'));
  aiBtn('Indizio con AI', 'L\'AI adatta l\'indizio alla tua situazione, senza darti la soluzione (conta come indizio usato)', () => void askAi('hint', 'lesson', input.value.trim()));
  aiBtn('Spiega il testo scritto qui', 'L\'AI spiega con parole semplici il comando o il testo che scrivi nella casella', () => { const t = input.value.trim(); if (!t) { toast('Scrivi prima nella casella il testo o il comando da spiegare', 'info'); return; } input.value = ''; void askAi('simplify', 'text', t); });
  async function refreshAi(): Promise<void> {
    try {
      const st = await api<any>('GET', '/ai/status');
      app.aiEnabled = !!st.enabled;
      aiBox.hidden = !st.available;
      if (!st.available) return;
      clear(aiBox);
      const cb = h('input', { type: 'checkbox', id: 'ai-toggle' }) as HTMLInputElement;
      cb.checked = !!st.enabled;
      cb.addEventListener('change', async () => { await api('POST', '/prefs', { aiEnabled: cb.checked }); await refreshAi(); if (app.lesson) emit('lesson'); });
      aiBox.append(h('h3', null, 'Aiuto con AI (facoltativo)'), h('label', null, cb, ' Attiva l\'aiuto con AI (Gemini)'), h('p', { class: 'muted small' }, st.notice + ' Gli indizi e le spiegazioni dell\'AI contano come aiuti usati; durante i test intermedi non sono disponibili; la verifica degli esercizi resta del sistema.'));
      if (st.enabled) aiBox.append(aiButtons);
    } catch { aiBox.hidden = true; app.aiEnabled = false; }
  }
  on('ai-ask', (d) => { if (app.aiEnabled) void askAi(d.mode, d.target, d.text ?? ''); });
  void refreshAi();
  root.append(h('h2', null, 'Tutor'), note, quick, aiBox, log, form, h('div', { class: 'row wrap' }, brief, clr));
  on('session', () => {
    if (app.session && !messages.length) messages = (app.session.chat as any[]).map((m) => ({ role: m.role, text: m.text }));
    draw();
  });
  draw();
  void shellName;
}
