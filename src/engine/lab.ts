/**
 * Laboratorio a due nodi (M11): "server" (192.168.50.10) e "client" (192.168.50.20) su una rete simulata.
 * Il client è il terminale dello studente; il server è raggiungibile con `ssh` (un comando alla volta) e ospita il servizio TaskFlow.
 * Lo stato è facoltativo (`WorkspaceState.lab`): fuori dalle lezioni del modulo gli host del laboratorio non esistono.
 */
import type { FsNode, WorkspaceState } from './types.ts';
import { Vfs } from './vfs.ts';
import type { HostInfo } from './net.ts';

export const LAB_SERVER = { name: 'server.lab', ip: '192.168.50.10' };
export const LAB_CLIENT = { name: 'client.lab', ip: '192.168.50.20' };
/** porta documentata del servizio */
export const LAB_DOC_PORT = 8080;
export const LAB_API_PID = 622;

export interface LabState {
  /** processo taskflow avviato */
  running: boolean;
  /** porta su cui ascolta (valida se running) */
  port: number;
  /** PORT in /etc/taskflow/taskflow.env: la usa il prossimo avvio */
  configPort: number;
  /** servizio taskflow-db attivo */
  dbUp: boolean;
  /** regola DROP del firewall del server sulla porta del servizio: dal client la connessione scade */
  firewall: boolean;
  /** file creati dallo studente sul server (cartelle /tmp e /home/learner): persistono tra un ssh e l'altro */
  files: Record<string, { dir?: boolean; content: string }>;
  /** righe del registro del servizio (journalctl) */
  log: string[];
  /** transitori, valorizzati solo durante un comando eseguito sul server */
  viewAs?: 'server';
  sudo?: boolean;
}

export type LabScenario = 'ok' | 'stopped' | 'wrong_port' | 'db_down' | 'multi' | 'firewall' | 'dns_wrong' | 'multi2';

export function stamp(clock: number): string {
  const d = new Date(clock * 1000);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${mon} ${String(d.getUTCDate()).padStart(2, ' ')} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function labLog(state: WorkspaceState, msg: string, unit = 'taskflow'): void {
  const lab = state.lab;
  if (!lab) return;
  lab.log.push(`${stamp(state.clock)} server ${unit}[${unit === 'taskflow' ? LAB_API_PID : 701}]: ${msg}`);
  if (lab.log.length > 200) lab.log.splice(0, lab.log.length - 200);
}

const HOSTS_BASE = '127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost\n127.0.1.1\tlab\n';
/** riga errata di /etc/hosts del client (scenario dns_wrong): l'ultima cifra è sbagliata */
export const WRONG_HOSTS_LINE = '192.168.50.11\tserver.lab\n';

/** Ripristina /etc/hosts del client (senza righe del laboratorio). */
export function resetClientHosts(state: WorkspaceState): void {
  new Vfs(state.fs, () => state.clock).systemWrite('/etc/hosts', HOSTS_BASE);
}

/** Stato iniziale di uno scenario. Deterministico: dipende solo dall'orologio simulato. */
export function labScenario(state: WorkspaceState, name: LabScenario): LabState {
  const lab: LabState = { running: true, port: LAB_DOC_PORT, configPort: LAB_DOC_PORT, dbUp: true, firewall: false, files: {}, log: [] };
  state.lab = lab;
  resetClientHosts(state);
  const wrongPort = name === 'wrong_port' || name === 'multi';
  const stopped = name === 'stopped' || name === 'multi';
  if (wrongPort) lab.port = lab.configPort = 9090;
  if (name === 'multi') lab.port = 9090;
  labLog(state, `INFO  config: PORT=${lab.configPort} DB_HOST=127.0.0.1`);
  if (stopped) {
    lab.running = false;
    labLog(state, 'WARN  signal: SIGTERM ricevuto, arresto del servizio');
    labLog(state, 'INFO  stopped: servizio arrestato');
  } else labLog(state, `INFO  listen: in ascolto su 0.0.0.0:${lab.port}`);
  if (name === 'db_down' || name === 'multi' || name === 'multi2') {
    lab.dbUp = false;
    labLog(state, 'ERROR db: connessione a 127.0.0.1:5432 persa (taskflow-db non risponde)', 'taskflow');
  }
  if (name === 'firewall' || name === 'multi2') lab.firewall = true;
  if (name === 'dns_wrong' || name === 'multi2') new Vfs(state.fs, () => state.clock).systemWrite('/etc/hosts', HOSTS_BASE + WRONG_HOSTS_LINE);
  return lab;
}

// ---- rete ----

/** Indirizzo con cui /etc/hosts del nodo corrente risolve un nome (null se la riga non c'è). */
export function hostsFileLookup(state: WorkspaceState, name: string): string | null {
  const text = state.fs['/etc/hosts']?.content ?? '';
  for (const line of text.split('\n')) {
    const w = line.replace(/#.*/, '').trim().split(/\s+/);
    if (w.length >= 2 && w.slice(1).includes(name)) return w[0];
  }
  return null;
}

export function labHostInfo(state: WorkspaceState, host: string, dnsOnly = false): HostInfo | null {
  const lab = state.lab;
  if (!lab) return null;
  const h = host.toLowerCase();
  const onServer = lab.viewAs === 'server';
  if (onServer && (h === 'localhost' || h === '127.0.0.1')) return { name: 'localhost', ip: '127.0.0.1', ports: [22, ...(lab.running ? [lab.port] : []), ...(lab.dbUp ? [5432] : [])] };
  const real = h === LAB_SERVER.name || h === LAB_SERVER.ip ? LAB_SERVER : h === LAB_CLIENT.name || h === LAB_CLIENT.ip ? LAB_CLIENT : null;
  if (!real) return null;
  // un nome si risolve prima con /etc/hosts del nodo (se contiene la riga), poi con il DNS (indirizzo reale)
  const hosted = h === real.name && !dnsOnly ? hostsFileLookup(state, h) : null;
  if (hosted && hosted !== real.ip) return { name: real.name, ip: hosted, ports: [], unreachable: true };
  if (real === LAB_CLIENT) return { name: real.name, ip: real.ip, ports: [22] };
  const open = lab.running ? [lab.port] : [];
  const filtered = lab.firewall && !onServer ? open : [];
  return { name: real.name, ip: real.ip, ports: [22, ...open.filter((p) => !filtered.includes(p))], filtered };
}

export type LabGate = { lab: false } | { lab: true; fail?: 'refused' | 'tls' | 'ctimeout' | 'unreachable' };

/** Un URL punta a un nodo del laboratorio? Se sì, dice se la connessione riesce. */
export function labGate(state: WorkspaceState, host: string, port: number, scheme: string): LabGate {
  const info = labHostInfo(state, host);
  if (!info) return { lab: false };
  const lab = state.lab!;
  if (info.unreachable) return { lab: true, fail: 'unreachable' };
  if (info.name === LAB_CLIENT.name) return { lab: true, fail: 'refused' };
  if (info.filtered?.includes(port)) return { lab: true, fail: 'ctimeout' };
  if (!lab.running || port !== lab.port) return { lab: true, fail: 'refused' };
  if (scheme === 'https') return { lab: true, fail: 'tls' };
  return { lab: true };
}

/** Processi in ascolto, come li vede `ss -tlnp` sul nodo corrente. */
export function labListening(state: WorkspaceState): { proto: string; local: string; proc: string }[] | null {
  const lab = state.lab;
  if (lab?.viewAs !== 'server') return null;
  return [
    { proto: 'tcp', local: '0.0.0.0:22', proc: 'sshd' },
    ...(lab.dbUp ? [{ proto: 'tcp', local: '127.0.0.1:5432', proc: 'postgres' }] : []),
    ...(lab.running ? [{ proto: 'tcp', local: `0.0.0.0:${lab.port}`, proc: 'taskflow' }] : []),
  ];
}

// ---- servizio ----

export const UNITS = ['taskflow', 'taskflow-db'] as const;

export function unitActive(lab: LabState, unit: string): boolean {
  return unit === 'taskflow' ? lab.running : lab.dbUp;
}

export function unitAction(state: WorkspaceState, unit: string, action: 'start' | 'stop' | 'restart'): void {
  const lab = state.lab!;
  if (unit === 'taskflow-db') {
    if (action !== 'start') {
      lab.dbUp = false;
      labLog(state, 'INFO  stopped: database arrestato', 'postgres');
    }
    if (action !== 'stop') {
      lab.dbUp = true;
      labLog(state, 'INFO  started: database pronto', 'postgres');
    }
    return;
  }
  if (action !== 'start' && lab.running) {
    lab.running = false;
    labLog(state, 'WARN  signal: SIGTERM ricevuto, arresto del servizio');
    labLog(state, 'INFO  stopped: servizio arrestato');
  }
  if (action !== 'stop' && !lab.running) {
    lab.running = true;
    lab.port = lab.configPort;
    labLog(state, `INFO  config: PORT=${lab.configPort} DB_HOST=127.0.0.1`);
    if (!lab.dbUp) labLog(state, 'ERROR db: connessione a 127.0.0.1:5432 rifiutata (taskflow-db non attivo)');
    labLog(state, `INFO  listen: in ascolto su 0.0.0.0:${lab.port}`);
  }
}

/** File del server, ricostruiti a ogni comando eseguito via ssh dallo stato del laboratorio. */
export function serverFs(state: WorkspaceState): Record<string, FsNode> {
  const lab = state.lab!;
  const fs: Record<string, FsNode> = {};
  const v = new Vfs(fs, () => state.clock);
  for (const d of ['/home', '/home/learner', '/tmp', '/etc', '/etc/taskflow', '/var', '/var/log', '/var/log/taskflow', '/usr', '/usr/bin']) {
    fs[d] = { type: 'dir', content: '', mode: 0o755, mtime: state.clock - 86400 * 30, owner: d.startsWith('/home/learner') ? 'learner' : 'root' };
  }
  fs['/tmp'].mode = 0o777;
  v.systemWrite('/etc/hostname', 'server\n');
  v.systemWrite('/etc/hosts', `127.0.0.1\tlocalhost\n${LAB_SERVER.ip}\tserver.lab server\n${LAB_CLIENT.ip}\tclient.lab client\n`);
  v.systemWrite('/etc/os-release', 'NAME="Learning Lab Linux (simulato)"\nVERSION="1.0"\nID=lab\n');
  v.systemWrite('/etc/taskflow/taskflow.env', `# TaskFlow (simulato): configurazione del servizio\nPORT=${lab.configPort}\nDB_HOST=127.0.0.1\nLOG_LEVEL=info\n`);
  v.systemWrite('/var/log/taskflow/service.log', lab.log.join('\n') + '\n');
  v.systemWrite('/home/learner/README.txt', 'Server del laboratorio (simulato).\n  /etc/taskflow/taskflow.env   configurazione del servizio\n  /var/log/taskflow/service.log   registro del servizio\n');
  fs['/home/learner/README.txt'].owner = 'learner';
  for (const [path, f] of Object.entries(lab.files)) {
    fs[path] = f.dir ? { type: 'dir', content: '', mode: 0o755, mtime: state.clock, owner: 'learner' } : { type: 'file', content: f.content, mode: 0o644, mtime: state.clock, owner: 'learner' };
  }
  return fs;
}
