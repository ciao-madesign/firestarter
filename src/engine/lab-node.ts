/**
 * Esecuzione di comandi sul nodo "server" del laboratorio (M11), usata da `ssh` in Bash e in PowerShell.
 * Ogni comando gira su un workspace temporaneo con il filesystem del server (ricostruito dallo stato del laboratorio):
 * le modifiche allo stato del servizio e al file di configurazione tornano nello stato reale, il resto no.
 */
import type { WorkspaceState } from './types.ts';
import { createWorkspace, execute } from './index.ts';
import { LAB_DOC_PORT, labHostInfo, serverFs } from './lab.ts';
import { lookupHost } from './net.ts';

export interface SimpleIo {
  out(t: string): void;
  err(t: string): void;
}

export function runOnServer(state: WorkspaceState, command: string, io: SimpleIo): number {
  const lab = state.lab!;
  const srv = createWorkspace('server');
  srv.fs = serverFs(state);
  srv.clock = state.clock;
  srv.api = state.api;
  srv.lab = lab;
  for (const k of Object.keys(srv.shells.bash.env)) if (k.startsWith('TASKFLOW_')) delete srv.shells.bash.env[k];
  srv.shells.bash.env.HOSTNAME = 'server';
  lab.viewAs = 'server';
  try {
    const r = execute(srv, 'bash', command, { silent: true, tty: false });
    if (r.incomplete) {
      io.err('bash: syntax error: unexpected end of file\n');
      return 2;
    }
    for (const c of r.out) (c.s === 'out' ? io.out : io.err)(c.t);
    const env = srv.fs['/etc/taskflow/taskflow.env']?.content ?? '';
    const m = /^PORT=(\d+)\s*$/m.exec(env);
    lab.configPort = m ? parseInt(m[1], 10) : LAB_DOC_PORT;
    return r.exit;
  } finally {
    state.clock = srv.clock;
    delete lab.viewAs;
    delete lab.sudo;
  }
}

/** `ssh [opzioni] [utente@]host "comando"`: solo comandi singoli, senza sessione interattiva. */
export function sshMain(state: WorkspaceState, args: string[], io: SimpleIo): number {
  let user = 'learner';
  let port = 22;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (rest.length) rest.push(a);
    else if (a === '-o' || a === '-i') i++;
    else if (a === '-p') port = parseInt(args[++i] ?? '22', 10);
    else if (a === '-l') user = args[++i] ?? user;
    else if (a.startsWith('-')) continue;
    else rest.push(a);
  }
  if (!rest.length) {
    io.err('usage: ssh [-p porta] [utente@]host comando\n');
    return 255;
  }
  let dest = rest[0];
  if (dest.includes('@')) {
    user = dest.slice(0, dest.indexOf('@'));
    dest = dest.slice(dest.indexOf('@') + 1);
  }
  if (state.lab?.viewAs === 'server') {
    io.err('ssh: le sessioni ssh annidate non sono supportate nel laboratorio\n');
    return 255;
  }
  if (!lookupHost(dest, state)) {
    io.err(`ssh: Could not resolve hostname ${dest}: Name or service not known\n`);
    return 255;
  }
  const info = state.lab ? labHostInfo(state, dest) : null;
  if (!info || info.name !== 'server.lab' || port !== 22) {
    io.err(`ssh: connect to host ${dest} port ${port}: Connection refused\n`);
    return 255;
  }
  if (user !== 'learner') {
    io.err(`${user}@${dest}: Permission denied (publickey).\n`);
    return 255;
  }
  const command = rest.slice(1).join(' ');
  if (!command.trim()) {
    io.err('ssh: nel laboratorio la sessione interattiva non è disponibile: scrivi il comando da eseguire sul server, per esempio ssh learner@server.lab "systemctl status taskflow"\n');
    return 255;
  }
  return runOnServer(state, command, io);
}
