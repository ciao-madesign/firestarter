export type Json = Record<string, any>;

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Json) {
    super(message);
  }
}

async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.detail ?? res.statusText, res.status, data ?? {});
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => call<T>("GET", u),
  post: <T = any>(u: string, b?: unknown) => call<T>("POST", u, b ?? {}),
  put: <T = any>(u: string, b?: unknown) => call<T>("PUT", u, b ?? {}),
};

export const STATE_LABEL: Record<string, string> = {
  planned: "Da pianificare",
  ready: "Pronta",
  running: "In esecuzione",
  completed: "Completata",
  failed: "Fallita",
  blocked: "Bloccata",
  waiting_user: "In attesa dell'utente",
  skipped: "Esclusa",
  draft: "Bozza",
  approved: "Approvato",
  needs_attention: "Richiede attenzione",
  delivered: "Consegnato",
};

export const SUPPORT_LABEL: Record<string, string> = {
  verified: "Verificata",
  limited: "Con limitazioni",
  unverified: "Non verificata",
  unsupported: "Non supportata",
  manual: "Intervento manuale",
};
