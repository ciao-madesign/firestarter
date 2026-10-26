/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, clear, copyText, toast } from './dom.ts';
import { api, app, emit, shellName, type ShellId } from './state.ts';

interface Chunk {
  s: 'out' | 'err';
  t: string;
}
interface Block {
  prompt: string;
  cmd: string;
  out: Chunk[];
  exit: number;
  note?: string;
}

const DIFF_ROWS: [string, string, string][] = [
  ['Variabile', '$HOME  ·  $VAR', '$HOME  ·  $env:VAR (ambiente)  ·  $var'],
  ['Output della pipe', 'testo', 'oggetti'],
  ['Esito ultimo comando', '$? = numero (0 = ok)', '$? = True/False; $LASTEXITCODE per i programmi esterni'],
  ['Concatenare', 'cmd1 && cmd2', 'cmd1; cmd2   (&& non esiste in 5.1)'],
  ['curl', 'il programma curl', 'alias di Invoke-WebRequest; il vero curl è curl.exe'],
  ['Cercare testo', 'grep PATTERN file', 'Select-String PATTERN file (ignora le maiuscole)'],
  ['Scrivere file', 'echo x > f ; echo x >> f', 'stesso, oppure Set-Content / Add-Content'],
  ['Lista file', 'ls -la', 'Get-ChildItem -Force (alias ls)'],
];

export class Terminal {
  root: HTMLElement;
  private out!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private promptEl!: HTMLElement;
  private headInfo!: HTMLElement;
  private blocks: Record<ShellId, Block[]> = { bash: [], pwsh: [] };
  private history: Record<ShellId, string[]> = { bash: [], pwsh: [] };
  private prompts: Record<ShellId, string> = { bash: 'learner@lab:~$ ', pwsh: 'PS /home/learner> ' };
  private hIdx = -1;
  private draft = '';
  private pending: string[] = [];
  private busy = false;

  constructor() {
    this.root = this.build();
  }

  private build(): HTMLElement {
    this.out = h('div', { class: 'term-output', role: 'log', 'aria-live': 'polite', 'aria-label': 'Output del terminale', tabindex: '0' });
    this.promptEl = h('span', { class: 'prompt', 'aria-hidden': 'true' });
    this.input = h('textarea', {
      id: 'terminal-input',
      class: 'term-field',
      rows: '1',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      enterkeyhint: 'send',
      'aria-label': 'Riga di comando',
      placeholder: 'Scrivi un comando e premi Invio',
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('input', () => this.autosize());
    this.headInfo = h('span', { class: 'term-info' });

    const clearBtn = h('button', { type: 'button', class: 'btn small', title: 'Pulisce lo schermo (la cronologia resta)', on: { click: () => this.clearScreen() } }, 'Cancella schermo');
    const copyBtn = h('button', { type: 'button', class: 'btn small', title: "Copia l'ultimo comando con il suo output", on: { click: () => this.copyLast() } }, 'Copia ultimo');
    const diffBtn = h('button', { type: 'button', class: 'btn small', 'aria-haspopup': 'dialog', on: { click: () => this.showDiff() } }, 'Differenze Bash/PowerShell');
    const head = h('div', { class: 'term-head' }, this.headInfo, h('span', { class: 'spacer' }), diffBtn, copyBtn, clearBtn);

    const form = h('form', { class: 'term-input', on: { submit: (e) => { e.preventDefault(); void this.submit(); } } }, this.promptEl, this.input);
    const keys = h('div', { class: 'quickkeys', role: 'toolbar', 'aria-label': 'Tasti rapidi' });
    const addKey = (label: string, fn: () => void, aria?: string): void => {
      keys.append(h('button', { type: 'button', class: 'key', 'aria-label': aria ?? label, on: { click: fn } }, label));
    };
    addKey('Tab', () => void this.complete());
    addKey('↑', () => this.histMove(-1), 'Comando precedente');
    addKey('↓', () => this.histMove(1), 'Comando successivo');
    for (const k of ['|', '>', '$', '~', '/', '-', '"', "'", ';', '&']) addKey(k, () => this.insert(k));
    addKey('Ctrl+C', () => this.cancelInput(), 'Annulla la riga');
    return h('section', { class: 'pane pane-terminal', 'aria-label': 'Terminale' }, head, this.out, form, keys);
  }

  focus(): void {
    this.input.focus();
  }

  // ----- stato -----
  loadFromSession(): void {
    const s = app.session;
    for (const sh of ['bash', 'pwsh'] as ShellId[]) {
      this.blocks[sh] = (s.shells[sh].transcript as Block[]).map((b) => ({ ...b }));
      this.history[sh] = [...s.shells[sh].history];
      this.prompts[sh] = s.shells[sh].prompt;
    }
    this.render();
  }

  setShell(sh: ShellId): void {
    app.shell = sh;
    this.pending = [];
    this.hIdx = -1;
    this.render();
  }

  private currentPrompt(): string {
    return this.pending.length ? '> ' : this.prompts[app.shell];
  }

  private render(): void {
    clear(this.out);
    const blocks = this.blocks[app.shell];
    if (!blocks.length) {
      this.out.append(
        h('div', { class: 'term-welcome' },
          h('p', null, `Terminale ${shellName(app.shell)} — ambiente SIMULATO. Nessun comando viene eseguito sul tuo dispositivo.`),
          h('p', { class: 'muted' }, 'Prova: pwd, ls, help. Con Tab completi comandi e percorsi; ↑ ↓ scorrono la cronologia.'),
        ),
      );
    }
    for (const b of blocks) this.out.append(this.renderBlock(b));
    this.promptEl.textContent = this.currentPrompt();
    this.headInfo.textContent = `${shellName(app.shell)} · ${app.session?.activeEnv ?? 'development'} (simulato)`;
    this.scroll();
  }

  private renderBlock(b: Block): HTMLElement {
    const copy = h('button', { type: 'button', class: 'copy', 'aria-label': 'Copia comando e output', title: 'Copia comando e output', on: { click: () => { void copyText(`${b.prompt}${b.cmd}\n${b.out.map((o) => o.t).join('')}`).then((ok) => toast(ok ? 'Copiato' : 'Copia non disponibile')); } } }, 'Copia');
    const pre = h('pre', { class: 'out' });
    for (const c of b.out) pre.append(h('span', { class: c.s === 'err' ? 'err' : 'ok' }, c.t));
    const el = h('div', { class: 'block' }, h('div', { class: 'cmdline' }, h('span', { class: 'prompt' }, b.prompt), h('span', { class: 'cmd' }, b.cmd), copy), pre);
    if (b.exit !== 0) el.append(h('div', { class: 'exit' }, `codice di uscita ${b.exit}`));
    return el;
  }

  private scroll(): void {
    this.out.scrollTop = this.out.scrollHeight;
  }

  private autosize(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 160)}px`;
  }

  // ----- input -----
  private insert(text: string): void {
    const i = this.input;
    const s = i.selectionStart ?? i.value.length;
    const e = i.selectionEnd ?? i.value.length;
    i.value = i.value.slice(0, s) + text + i.value.slice(e);
    i.setSelectionRange(s + text.length, s + text.length);
    i.focus();
    this.autosize();
  }

  /** Imposta il testo della riga (usato dai pulsanti "inserisci nel terminale"). */
  setLine(text: string, run = false): void {
    this.input.value = text;
    this.autosize();
    this.focus();
    if (run) void this.submit();
  }

  private cancelInput(): void {
    if (this.input.value || this.pending.length) {
      this.out.append(h('div', { class: 'block' }, h('div', { class: 'cmdline' }, h('span', { class: 'prompt' }, this.currentPrompt()), h('span', { class: 'cmd' }, `${this.input.value}^C`))));
    }
    this.input.value = '';
    this.pending = [];
    this.promptEl.textContent = this.currentPrompt();
    this.autosize();
    this.scroll();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void this.submit();
    } else if (e.key === 'ArrowUp' && !this.input.value.includes('\n') ) {
      e.preventDefault();
      this.histMove(-1);
    } else if (e.key === 'ArrowDown' && !this.input.value.includes('\n')) {
      e.preventDefault();
      this.histMove(1);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      void this.complete();
    } else if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
      e.preventDefault();
      this.clearScreen();
    } else if (e.key.toLowerCase() === 'c' && e.ctrlKey && this.input.selectionStart === this.input.selectionEnd) {
      e.preventDefault();
      this.cancelInput();
    }
  }

  private histMove(dir: -1 | 1): void {
    const hist = this.history[app.shell];
    if (!hist.length) return;
    if (this.hIdx === -1) {
      if (dir === 1) return;
      this.draft = this.input.value;
      this.hIdx = hist.length;
    }
    this.hIdx = Math.max(0, Math.min(hist.length, this.hIdx + dir));
    this.input.value = this.hIdx === hist.length ? this.draft : hist[this.hIdx];
    if (this.hIdx === hist.length) this.hIdx = -1;
    this.autosize();
    const l = this.input.value.length;
    this.input.setSelectionRange(l, l);
  }

  private async complete(): Promise<void> {
    const line = this.input.value.slice(0, this.input.selectionStart ?? this.input.value.length);
    const lastLine = line.split('\n').pop() ?? '';
    try {
      const r = await api<{ start: number; options: string[] }>('POST', '/complete', { shell: app.shell, line: lastLine });
      if (!r.options.length) return;
      const before = this.input.value.slice(0, (this.input.selectionStart ?? 0) - lastLine.length + r.start);
      const after = this.input.value.slice(this.input.selectionStart ?? 0);
      let common = r.options[0];
      for (const o of r.options) while (!o.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
      const filled = r.options.length === 1 ? r.options[0] + (r.options[0].endsWith('/') ? '' : ' ') : common;
      this.input.value = before + filled + after;
      const pos = (before + filled).length;
      this.input.setSelectionRange(pos, pos);
      if (r.options.length > 1) {
        this.out.append(h('div', { class: 'block' }, h('pre', { class: 'out' }, h('span', { class: 'ok' }, r.options.join('   ') + '\n'))));
        this.scroll();
      }
    } catch {
      /* completamento non disponibile offline */
    }
  }

  // ----- esecuzione -----
  async submit(): Promise<void> {
    if (this.busy) return;
    const line = this.input.value;
    const full = [...this.pending, line].join('\n');
    const shell = app.shell;
    if (!full.trim() && !this.pending.length) {
      this.out.append(h('div', { class: 'block' }, h('div', { class: 'cmdline' }, h('span', { class: 'prompt' }, this.prompts[shell]))));
      this.scroll();
      return;
    }
    this.busy = true;
    this.input.disabled = true;
    try {
      const r = await api<any>('POST', '/exec', { shell, command: full });
      if (r.incomplete) {
        this.pending.push(line);
        this.input.value = '';
        this.promptEl.textContent = '> ';
        this.out.append(h('div', { class: 'block' }, h('div', { class: 'cmdline' }, h('span', { class: 'prompt' }, this.pending.length === 1 ? this.prompts[shell] : '> '), h('span', { class: 'cmd' }, line))));
        this.scroll();
        return;
      }
      const prompt = this.prompts[shell];
      this.pending = [];
      this.input.value = '';
      this.hIdx = -1;
      if (full.trim()) this.history[shell].push(full.trim());
      this.prompts[shell] = r.prompt;
      if (r.clear) this.blocks[shell] = [];
      else this.blocks[shell].push({ prompt, cmd: full, out: r.out, exit: r.exit });
      if (this.blocks[shell].length > 150) this.blocks[shell].shift();
      this.render();
      if (r.live) emit('live', r.live);
      emit('executed', { shell, cmd: full, result: r });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      this.busy = false;
      this.input.disabled = false;
      this.autosize();
      this.focus();
    }
  }

  clearScreen(): void {
    this.blocks[app.shell] = [];
    this.render();
    // la cronologia resta sul server: si azzera solo la schermata
    void api('POST', '/clear', { shell: app.shell }).catch(() => undefined);
  }

  private copyLast(): void {
    const b = this.blocks[app.shell].slice(-1)[0];
    if (!b) return void toast('Niente da copiare');
    void copyText(`${b.prompt}${b.cmd}\n${b.out.map((o) => o.t).join('')}`).then((ok) => toast(ok ? 'Ultimo comando copiato' : 'Copia non disponibile'));
  }

  private showDiff(): void {
    const dlg = h('dialog', { class: 'dialog', 'aria-label': 'Differenze tra Bash e PowerShell' },
      h('h2', null, 'Bash e PowerShell a confronto'),
      h('table', null, h('thead', null, h('tr', null, h('th', { scope: 'col' }, ''), h('th', { scope: 'col' }, 'Bash'), h('th', { scope: 'col' }, 'PowerShell 5.1'))),
        h('tbody', null, DIFF_ROWS.map(([a, b, c]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', null, h('code', null, b)), h('td', null, h('code', null, c)))))),
      h('p', { class: 'muted' }, 'Le due shell condividono file e servizi simulati, ma hanno variabili, cronologia e directory corrente distinte.'),
      h('form', { method: 'dialog' }, h('button', { class: 'btn primary' }, 'Chiudi')),
    );
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  /** Aggiorna il prompt dopo un cambio di cartella da fuori (es. avvio lezione). */
  refreshPrompt(): void {
    this.prompts.bash = app.session.shells.bash.prompt;
    this.prompts.pwsh = app.session.shells.pwsh.prompt;
    this.promptEl.textContent = this.currentPrompt();
  }
}
