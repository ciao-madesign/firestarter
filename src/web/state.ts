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
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
