/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from './dom.ts';

export type ShellId = 'bash' | 'pwsh';
export type Json = any;

export const app = {
  session: null as Json,
  lesson: null as Json,
  shell: 'bash' as ShellId,
  online: true,
  tab: 'istruzioni',
};

export const bus = new EventTarget();
export const emit = (name: string, detail?: unknown): void => void bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name: string, fn: (d: any) => void): void => bus.addEventListener(name, (e) => fn((e as CustomEvent).detail));

/** Identificativo del workspace (usato solo in modalità multi-workspace; il server lo ignora in modalità personale). */
export function workspaceId(): string {
  try {
    const m = /[#&]ws=([A-Za-z0-9_-]{16,64})/.exec(location.hash);
    if (m) {
      localStorage.setItem('lab-ws', m[1]);
      history.replaceState(null, '', location.pathname + location.search);
    }
    let id = localStorage.getItem('lab-ws');
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
      localStorage.setItem('lab-ws', id);
    }
    return id;
  } catch {
    return 'sessione-temporanea-' + Math.random().toString(36).slice(2, 12);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Workspace': workspaceId() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    setOnline(false);
    throw new ApiError('Connessione assente: puoi consultare i contenuti già caricati; i comandi richiedono il server.', 0);
  }
  setOnline(true);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && path !== '/login') emit('auth-required');
  if (!res.ok) {
    if (res.status === 503 && data?.error === 'offline') setOnline(false);
    throw new ApiError(data?.message ?? `Errore ${res.status}`, res.status);
  }
  return data as T;
}

function setOnline(v: boolean): void {
  if (app.online !== v) {
    app.online = v;
    emit('online', v);
    if (!v) toast('Connessione assente: consultazione dei contenuti già caricati.', 'error');
  }
}

export async function refreshSession(): Promise<void> {
  app.session = await api('GET', '/session');
  emit('session');
}

export async function loadLesson(id: string): Promise<Json> {
  app.lesson = await api('GET', `/lessons/${id}?shell=${app.shell}`);
  emit('lesson');
  return app.lesson;
}

export function shellName(s: ShellId): string {
  return s === 'bash' ? 'Bash' : 'PowerShell 5.1';
}

let prefTimer: number | undefined;
export function savePrefs(p: Record<string, unknown>): void {
  window.clearTimeout(prefTimer);
  prefTimer = window.setTimeout(() => {
    api('POST', '/prefs', p).catch(() => undefined);
  }, 300);
}

/** Scarica una risorsa dell'API (invia l'identificativo del workspace). */
export async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api${path}`, { headers: { 'X-Workspace': workspaceId() } });
  if (!res.ok) throw new ApiError(`Download non riuscito (${res.status})`, res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
