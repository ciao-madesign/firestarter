/**
 * Laboratorio a due nodi (M11): "server" (192.168.50.10) e "client" (192.168.50.20) su una rete simulata.
 * Il client è il terminale dello studente; il server è raggiungibile con `ssh` (un comando alla volta) e ospita il servizio TaskFlow.
 * Lo stato è facoltativo (`WorkspaceState.lab`): fuori dalle lezioni del modulo gli host del laboratorio non esistono.
 */
import type { FsNode, WorkspaceState } from './types.ts';
import { Vfs } from './vfs.ts';

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
  /** righe del registro del servizio (journalctl) */
  log: string[];
  /** transitori, valorizzati solo durante un comando eseguito sul server */
  viewAs?: 'server';
  sudo?: boolean;
}

export type LabScenario = 'ok' | 'stopped' | 'wrong_port' | 'db_down' | 'multi';

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

/** Stato iniziale di uno scenario. Deterministico: dipende solo dall'orologio simulato. */
export function labScenario(state: WorkspaceState, name: LabScenario): LabState {
  const lab: LabState = { running: true, port: LAB_DOC_PORT, configPort: LAB_DOC_PORT, dbUp: true, log: [] };
  state.lab = lab;
  labLog(state, 'INFO  config: PORT=' + LAB_DOC_PORT + ' DB_HOST=127.0.0.1');
  if (name === 'wrong_port') {
    lab.port = lab.configPort = 9090;
    lab.log = [];
    labLog(state, 'INFO  config: PORT=9090 DB_HOST=127.0.0.1');
  }
  if (name === 'multi') {
    lab.configPort = 9090;
    lab.log = [];
    labLog(state, 'INFO  config: PORT=9090 DB_HOST=127.0.0.1');
  }
  if (name === 'multi' || name === 'stopped') {
    lab.running = false;
    labLog(state, 'WARN  signal: SIGTERM ricevuto, arresto del servizio');
    labLog(state, 'INFO  stopped: servizio arrestato');
  } else labLog(state, `INFO  listen: in ascolto su 0.0.0.0:${lab.port}`);
  if (name === 'db_down' || name === 'multi') {
    lab.dbUp = false;
    labLog(state, 'ERROR db: connessione a 127.0.0.1:5432 persa (taskflow-db non risponde)', 'taskflow');
  }
  return lab;
}

// ---- rete ----

export function labHostInfo(state: WorkspaceState, host: string): { name: string; ip: string; ports: number[] } | null {
  const lab = state.lab;
  if (!lab) return null;
  const h = host.toLowerCase();
  const local = lab.viewAs === 'server' && (h === 'localhost' || h === '127.0.0.1');
  if (h === LAB_SERVER.name || h === LAB_SERVER.ip || local) {
    return { name: local ? 'localhost' : LAB_SERVER.name, ip: local ? '127.0.0.1' : LAB_SERVER.ip, ports: [22, ...(lab.running ? [lab.port] : []), ...(lab.dbUp && local ? [5432] : [])] };
  }
  if (h === LAB_CLIENT.name || h === LAB_CLIENT.ip) return { name: LAB_CLIENT.name, ip: LAB_CLIENT.ip, ports: [22] };
  return null;
}

export type LabGate = { lab: false } | { lab: true; fail?: 'refused' | 'tls' };

/** Un URL punta a un nodo del laboratorio? Se sì, dice se la connessione riesce. */
export function labGate(state: WorkspaceState, host: string, port: number, scheme: string): LabGate {
  const info = labHostInfo(state, host);
  if (!info) return { lab: false };
  const lab = state.lab!;
  if (info.name === LAB_CLIENT.name || !lab.running || port !== lab.port) return { lab: true, fail: 'refused' };
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
  return fs;
}
