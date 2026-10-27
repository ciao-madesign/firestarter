/** Comandi del laboratorio a due nodi (M11): ssh, e i comandi che esistono solo sul server (systemctl, journalctl, sudo). */
import { COMMANDS, type CmdFn } from './interp.ts';
import { sshMain } from '../lab-node.ts';
import { UNITS, unitActive, unitAction, stamp } from '../lab.ts';
import { getopt } from '../util.ts';
import { USER } from '../vfs.ts';

function reg(name: string, fn: CmdFn): void {
  COMMANDS.set(name, fn);
}

reg('ssh', (args, io, rt) => sshMain(rt.state, args, io));

const notFound = (name: string, io: { err(t: string): void }): number => {
  io.err(`bash: ${name}: command not found\n`);
  return 127;
};

reg('sudo', (args, io, rt) => {
  if (rt.state.lab?.viewAs !== 'server') {
    io.err(`${USER} is not in the sudoers file.\n`);
    return 1;
  }
  if (!args.length) {
    io.err('usage: sudo comando [argomenti...]\n');
    return 1;
  }
  const lab = rt.state.lab;
  // root vede tutto: durante il comando i file di root diventano scrivibili, poi tornano di root (anche quelli nuovi)
  const rootOwned = new Set(Object.keys(rt.state.fs).filter((p) => rt.state.fs[p].owner === 'root'));
  for (const p of rootOwned) rt.state.fs[p].owner = USER;
  const before = new Set(Object.keys(rt.state.fs));
  lab.sudo = true;
  try {
    return rt.runCommand(args[0], args.slice(1), io);
  } finally {
    lab.sudo = false;
    for (const [p, n] of Object.entries(rt.state.fs)) if (rootOwned.has(p) || !before.has(p)) n.owner = 'root';
  }
}, );

function unitName(arg: string): string {
  return arg.replace(/\.service$/, '');
}

function statusText(rt: Parameters<CmdFn>[2], unit: string): string {
  const lab = rt.state.lab!;
  const active = unitActive(lab, unit);
  const title = unit === 'taskflow' ? 'TaskFlow API (simulato)' : 'Database di TaskFlow (simulato)';
  const pid = unit === 'taskflow' ? 622 : 701;
  const lines = [
    `${active ? '●' : '○'} ${unit}.service - ${title}`,
    `     Loaded: loaded (/etc/systemd/system/${unit}.service; enabled; preset: enabled)`,
    active ? `     Active: active (running) since ${stamp(rt.state.clock - 3600)} UTC; 1h ago` : `     Active: inactive (dead) since ${stamp(rt.state.clock - 60)} UTC; 1min ago`,
    ...(active ? [`   Main PID: ${pid} (${unit})`] : []),
    ...(unit === 'taskflow' && active ? [`     Listen: 0.0.0.0:${lab.port}`] : []),
    '',
  ];
  const tail = lab.log.filter((l) => l.includes(unit === 'taskflow' ? ' taskflow[' : ' postgres[')).slice(-4);
  return lines.join('\n') + tail.join('\n') + (tail.length ? '\n' : '');
}

reg('systemctl', (args, io, rt) => {
  if (rt.state.lab?.viewAs !== 'server') return notFound('systemctl', io);
  const lab = rt.state.lab;
  const [verb, rawUnit] = args.filter((a) => !a.startsWith('--'));
  if (!verb || !['status', 'start', 'stop', 'restart', 'is-active'].includes(verb)) {
    io.err('systemctl: nel laboratorio sono supportati: status, start, stop, restart, is-active\n');
    return 1;
  }
  if (!rawUnit) {
    io.err('Too few arguments.\n');
    return 1;
  }
  const unit = unitName(rawUnit);
  if (!(UNITS as readonly string[]).includes(unit)) {
    io.err(verb === 'status' ? `Unit ${rawUnit}.service could not be found.\n` : `Failed to ${verb} ${rawUnit}.service: Unit ${rawUnit}.service not found.\n`);
    return verb === 'status' ? 4 : 5;
  }
  if (verb === 'is-active') {
    io.out(unitActive(lab, unit) ? 'active\n' : 'inactive\n');
    return unitActive(lab, unit) ? 0 : 3;
  }
  if (verb === 'status') {
    io.out(statusText(rt, unit));
    return unitActive(lab, unit) ? 0 : 3;
  }
  if (!lab.sudo) {
    io.err(`Failed to ${verb} ${unit}.service: Interactive authentication required.\nSee system logs and 'systemctl status ${unit}.service' for details.\n`);
    return 1;
  }
  // un avvio rilegge la configurazione: se il file è stato modificato in questa stessa sessione ssh, vale il nuovo valore
  const port = /^PORT=(\d+)\s*$/m.exec(rt.state.fs['/etc/taskflow/taskflow.env']?.content ?? '');
  if (port) lab.configPort = parseInt(port[1], 10);
  unitAction(rt.state, unit, verb as 'start' | 'stop' | 'restart');
  rt.state.clock += 1;
  return 0;
});

reg('journalctl', (args, io, rt) => {
  if (rt.state.lab?.viewAs !== 'server') return notFound('journalctl', io);
  const o = getopt(args, { flags: '', values: 'un' });
  const unit = o.values.u?.[0] ? unitName(o.values.u[0]) : null;
  const n = o.values.n?.[0] ? parseInt(o.values.n[0], 10) : 100;
  let lines = rt.state.lab.log;
  if (unit) lines = lines.filter((l) => l.includes(unit === 'taskflow' ? ' taskflow[' : unit === 'taskflow-db' ? ' postgres[' : ' ?[?'));
  io.out(`-- Journal (simulato) --\n${lines.slice(-n).join('\n')}${lines.length ? '\n' : ''}`);
  return 0;
});
