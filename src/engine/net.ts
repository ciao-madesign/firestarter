/** Rete simulata: risoluzione dei nomi e porte aperte per gli strumenti di diagnosi (ping, nslookup, dig, nc, ss, Test-NetConnection). */
import { BASE_URLS } from './api/spec.ts';
import { EXPIRED_CERT_HOST } from './api/server.ts';
import { labHostInfo } from './lab.ts';
import type { WorkspaceState } from './types.ts';

export interface HostInfo {
  name: string;
  ip: string;
  ports: number[];
  /** porte che non rispondono né rifiutano (firewall con DROP): la connessione scade */
  filtered?: number[];
  /** l'indirizzo non corrisponde ad alcun nodo: "No route to host" */
  unreachable?: boolean;
}


const HOSTS: HostInfo[] = [
  { name: 'localhost', ip: '127.0.0.1', ports: [22, 8080], filtered: [8089] },
  { name: new URL(BASE_URLS.testing).hostname, ip: '203.0.113.20', ports: [80, 443] },
  { name: new URL(BASE_URLS.staging).hostname, ip: '203.0.113.30', ports: [80, 443] },
  { name: EXPIRED_CERT_HOST, ip: '203.0.113.40', ports: [443] },
];

export const DNS_SERVER = '10.0.0.2';

/** `dnsOnly`: come nslookup/dig, che interrogano il DNS e ignorano /etc/hosts. */
export function lookupHost(host: string, state?: WorkspaceState, dnsOnly = false): HostInfo | null {
  const lab = state ? labHostInfo(state, host, dnsOnly) : null;
  if (lab) return lab;
  const h = host.toLowerCase();
  if (h === '127.0.0.1') return HOSTS[0];
  return HOSTS.find((x) => x.name === h || x.ip === h) ?? null;
}

/** Porte in ascolto sulla macchina locale (per `ss`). */
export const LISTENING = [
  { proto: 'tcp', local: '0.0.0.0:22', proc: 'sshd' },
  { proto: 'tcp', local: '127.0.0.1:8080', proc: 'taskflow' },
];

/** Tempo di risposta deterministico per host (ms). */
export function pingMs(info: HostInfo, i: number): number {
  const base = info.ip.startsWith('127.') ? 0.04 : 18 + (parseInt(info.ip.split('.')[3], 10) % 7);
  return +(base + (i % 3) * (info.ip.startsWith('127.') ? 0.01 : 0.7)).toFixed(info.ip.startsWith('127.') ? 3 : 1);
}
