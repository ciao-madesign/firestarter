/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, h, renderMarkdown, toast } from './dom.ts';
import { api, app, emit, loadLesson, on, shellName } from './state.ts';

let log: HTMLElement;
let messages: { role: 'user' | 'tutor'; text: string }[] = [];
let input: HTMLInputElement;

function draw(): void {
  clear(log);
  if (!messages.length) {
    log.append(
      h('div', { class: 'msg tutor' },
        renderMarkdown('Sono il tutor del laboratorio, **senza AI**: spiego i comandi dal catalogo, analizzo gli errori reali e do indizi graduati.\n\nNon invento output: ti dico solo ciò che il sistema ha registrato. Puoi scrivere per esempio:\n\n- spiega curl -s -i $TASKFLOW_URL/v1/health\n- perché ho questo errore?\n- indizio'),
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
  const note = h('p', { class: 'muted small' }, 'Tutor deterministico (nessun servizio AI esterno). Le soluzioni complete vengono registrate come aiuto usato e non valgono come svolgimento in autonomia.');
  const clr = h('button', { type: 'button', class: 'btn small', on: { click: async () => { await api('POST', '/tutor/clear', {}); messages = []; draw(); } } }, 'Svuota conversazione');
  root.append(h('h2', null, 'Tutor'), note, quick, log, form, h('div', { class: 'row' }, clr));
  on('session', () => {
    if (app.session && !messages.length) messages = (app.session.chat as any[]).map((m) => ({ role: m.role, text: m.text }));
    draw();
  });
  draw();
  void shellName;
}
