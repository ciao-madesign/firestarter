import type { WorkspaceState } from './types.ts';
import { sendRequest, parseUrl, type HttpRequest, type NetResult } from './api/server.ts';

export interface FollowOptions {
  follow: boolean;
  maxRedirects?: number;
}

export interface HttpOutcome {
  result: NetResult;
  /** URL finale dopo eventuali redirect */
  finalUrl: string;
  redirects: number;
  /** richieste effettivamente inviate (per -v) */
  sent: HttpRequest[];
}

export function performHttp(state: WorkspaceState, req: HttpRequest, opts: FollowOptions): HttpOutcome {
  let cur = req;
  const sent: HttpRequest[] = [];
  let redirects = 0;
  for (;;) {
    sent.push(cur);
    const result = sendRequest(state, cur);
    if (result.ok && opts.follow && [301, 302, 303, 307, 308].includes(result.res.status) && result.res.headers.Location) {
      if (redirects >= (opts.maxRedirects ?? 10)) return { result, finalUrl: cur.url, redirects, sent };
      const loc = result.res.headers.Location;
      const base = parseUrl(cur.url)!;
      const next = /^https?:\/\//.test(loc) ? loc : `${base.scheme}://${base.host}${base.port && ![80, 443].includes(base.port) ? ':' + base.port : ''}${loc}`;
      cur = { ...cur, url: next, ...(result.res.status === 303 ? { method: 'GET', body: null } : {}) };
      redirects++;
      continue;
    }
    return { result, finalUrl: cur.url, redirects, sent };
  }
}

export function lowerHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

export function base64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}
