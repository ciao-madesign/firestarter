/* eslint-disable @typescript-eslint/no-explicit-any */
import { clear, copyText, h, toast } from './dom.ts';
import { api, app, emit, on, refreshSession, shellName, type Json } from './state.ts';

let root: HTMLElement;
let data: Json = null;
let showData = false;

export async function loadEnv(): Promise<void> {
  try {
    data = await api('GET', '/env');
    draw();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

function curlFor(ep: any): string {
  const url = `$TASKFLOW_URL/v1${ep.path.replace('{id}', '1')}`;
  const lines = [`curl -s -X ${ep.method}`];
  if (ep.auth !== 'none') lines.push('-H "Authorization: Bearer $TOKEN"');
  if (ep.body) lines.push('-H "Content-Type: application/json"', `-d '{${ep.body.filter((f: any) => f.required).map((f: any) => `"${f.name}": ${f.type === 'integer' ? 1 : '"valore"'}`).join(', ')}}'`);
  lines.push(`"${url}"`);
  return lines.join(' ');
}

function psFor(ep: any): string {
  const url = `$env:TASKFLOW_URL/v1${ep.path.replace('{id}', '1')}`;
  const parts = [`Invoke-RestMethod "${url}" -Method ${ep.method[0] + ep.method.slice(1).toLowerCase()}`];
  if (ep.auth !== 'none') parts.push('-Headers @{ Authorization = "Bearer $token" }');
  if (ep.body) parts.push('-ContentType "application/json"', `-Body '{${ep.body.filter((f: any) => f.required).map((f: any) => `"${f.name}": ${f.type === 'integer' ? 1 : '"valore"'}`).join(', ')}}'`);
  return parts.join(' ');
}

function draw(): void {
  clear(root);
  if (!data) return void root.append(h('p', null, 'Caricamento…'));
  root.append(h('h2', null, 'Ambiente simulato'));
  root.append(h('div', { class: 'callout' }, h('strong', null, 'Infrastruttura SIMULATA. '), 'TaskFlow è un servizio finto con credenziali finte: nessuna richiesta esce dal laboratorio e nessun servizio reale è coinvolto.'));

  // selettore ambiente
  const sel = h('div', { class: 'env-select', role: 'radiogroup', 'aria-label': 'Ambiente attivo' });
  for (const e of data.envs) {
    sel.append(
      h('label', { class: `env-card ${e.active ? 'active' : ''}` },
        h('input', { type: 'radio', name: 'env', value: e.name, checked: e.active || undefined, on: { change: async () => { try { data = await api('POST', '/env', { active: e.name }); await refreshSession(); draw(); toast(`Ambiente ${e.name}: variabili TASKFLOW_* aggiornate in entrambe le shell`); } catch (err) { toast((err as Error).message, 'error'); } } } }),
        h('span', { class: 'env-name' }, e.name),
        h('span', { class: 'env-url' }, e.baseUrl),
        h('span', { class: 'muted' }, `API ${e.version} · ${e.tasks} task · ${e.projects} progetti`)),
    );
  }
  root.append(sel);

  root.append(h('h3', null, 'Configurazione (variabili d\'ambiente)'));
  const vt = h('table', null, h('tbody', null, Object.entries(data.variables).map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, h('code', null, k)), h('td', null, h('code', null, String(v)))))));
  root.append(vt, h('p', { class: 'muted' }, 'Il segreto non si scrive nei comandi: si legge dalla variabile ($TASKFLOW_CLIENT_SECRET in Bash, $env:TASKFLOW_CLIENT_SECRET in PowerShell).'));

  root.append(
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', on: { click: async () => { if (!confirm(`Ripristinare i dati iniziali dell'ambiente ${data.active}?`)) return; data = await api('POST', '/env/reset', { env: data.active }); draw(); toast('Dati ripristinati'); } } }, 'Ripristina i dati di test'),
      h('button', { class: 'btn', type: 'button', on: { click: () => { showData = !showData; draw(); } } }, showData ? 'Nascondi i dati' : 'Mostra i dati dell\'ambiente'),
      h('button', { class: 'btn', type: 'button', on: { click: () => void loadEnv() } }, 'Aggiorna')));

  if (showData) {
    root.append(h('h3', null, 'Task nell\'ambiente'));
    root.append(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['id', 'titolo', 'status', 'priorità'].map((c) => h('th', { scope: 'col' }, c)))), h('tbody', null, data.data.tasks.map((t: any) => h('tr', null, h('td', null, String(t.id)), h('td', null, t.title), h('td', null, t.status), h('td', null, String(t.priority))))))));
  }

  root.append(h('h3', null, 'Endpoint'));
  const list = h('ul', { class: 'endpoints' });
  for (const ep of data.endpoints) {
    const sh = app.shell;
    const cmd = sh === 'bash' ? curlFor(ep) : psFor(ep);
    list.append(
      h('li', null,
        h('details', null,
          h('summary', null, h('span', { class: `method ${ep.method}` }, ep.method), h('code', null, `/v1${ep.path}`), h('span', { class: `tag auth-${ep.auth}` }, ep.auth === 'none' ? 'pubblico' : ep.auth === 'user' ? 'token' : 'admin'), h('span', { class: 'muted' }, ep.summary)),
          h('div', { class: 'ep-body' },
            ep.body ? h('div', null, h('strong', null, 'Body: '), ep.body.map((f: any) => `${f.name}${f.required ? '*' : ''} (${f.type})`).join(', ')) : null,
            ep.query ? h('div', null, h('strong', null, 'Query: '), ep.query.map((q: any) => q.name).join(', ')) : null,
            h('div', null, h('strong', null, 'Risposte: '), ep.responses.map((r: any) => `${r.status}`).join(', ')),
            h('pre', { class: 'code' }, h('code', null, cmd)),
            h('div', { class: 'row' },
              h('button', { class: 'btn small', type: 'button', on: { click: () => emit('insert-command', cmd) } }, `Inserisci (${shellName(sh)})`),
              h('button', { class: 'btn small', type: 'button', on: { click: () => void copyText(cmd).then(() => toast('Copiato')) } }, 'Copia'))))),
    );
  }
  root.append(list, h('p', { class: 'muted' }, '* campo obbligatorio. Gli esempi usano $TOKEN: ottienilo con POST /v1/auth/token.'));

  root.append(h('h3', null, 'Log del servizio (file nel filesystem simulato)'));
  root.append(h('ul', null, data.files.map((f: string) => h('li', null, h('code', null, f), ' ', h('button', { class: 'btn small', type: 'button', on: { click: () => emit('open-file', f) } }, 'Apri')))));

  root.append(h('h3', null, 'Ultime richieste'));
  if (!data.log.length) root.append(h('p', { class: 'muted' }, 'Nessuna richiesta ancora: usa curl o Invoke-RestMethod nel terminale.'));
  else {
    root.append(
      h('div', { class: 'table-wrap' },
        h('table', { class: 'log' },
          h('thead', null, h('tr', null, ['ora (simulata)', 'amb.', 'metodo', 'percorso', 'status', 'ms', 'request id', 'client'].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', null, data.log.map((e: any) => h('tr', { class: e.status >= 500 || e.status === 0 ? 'e5' : e.status >= 400 ? 'e4' : 'ok' }, h('td', null, e.at.slice(11, 19)), h('td', null, e.env.slice(0, 3)), h('td', null, e.method), h('td', null, e.path), h('td', null, e.status === 0 ? 'timeout' : String(e.status)), h('td', null, String(e.ms)), h('td', null, e.requestId), h('td', null, e.client)))))));
  }
}

export function initEnv(el: HTMLElement): void {
  root = el;
  draw();
  on('executed', () => {
    if (app.tab === 'ambiente') void loadEnv();
  });
}
