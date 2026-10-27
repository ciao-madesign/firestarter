import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { labScenario, type LabScenario } from '../src/engine/lab.ts';
import { startLesson, resetLesson } from '../src/curriculum/engine.ts';
import type { ShellId } from '../src/engine/types.ts';

function ws(scenario: LabScenario | null) {
  const s = createWorkspace('lab');
  if (scenario) labScenario(s, scenario);
  s.shells.bash.env.TASKFLOW_URL = 'http://server.lab:8080';
  return s;
}
const run = (s: ReturnType<typeof ws>, line: string, sh: ShellId = 'bash') => {
  const r = execute(s, sh, line, { silent: true });
  return { exit: r.exit, out: r.out.map((o) => o.t).join('') };
};

describe('laboratorio a due nodi', () => {
  it('senza laboratorio gli host non esistono e il comportamento precedente non cambia', () => {
    const s = ws(null);
    expect(run(s, 'ping -c1 server.lab').exit).toBe(2);
    expect(run(s, 'ssh learner@server.lab "hostname"').out).toContain('Could not resolve hostname');
    expect(run(s, 'curl -s localhost:8080/v1/health').exit).toBe(0);
    expect(run(s, 'ss -tlnp').out).toContain('8080');
    expect(s.lab).toBeUndefined();
  });

  it('scenario ok: rete, porta, servizio e applicazione', () => {
    const s = ws('ok');
    expect(run(s, 'ping -c1 server.lab').out).toContain('192.168.50.10');
    expect(run(s, 'nc -zv server.lab 8080').exit).toBe(0);
    expect(run(s, 'ssh learner@server.lab "systemctl status taskflow"').out).toContain('active (running)');
    expect(run(s, 'curl -s $TASKFLOW_URL/v1/health').out).toContain('"status":"ok"');
    expect(run(s, 'curl -s http://192.168.50.10:8080/v1/health').exit).toBe(0);
  });

  it('servizio fermo: connessione rifiutata, avvio solo con sudo', () => {
    const s = ws('stopped');
    expect(run(s, 'curl -sS $TASKFLOW_URL/v1/health').exit).toBe(7);
    expect(run(s, 'nc -zv server.lab 8080').exit).toBe(1);
    expect(run(s, 'ssh server.lab "systemctl start taskflow"').out).toContain('authentication required');
    expect(s.lab!.running).toBe(false);
    expect(run(s, 'ssh server.lab "sudo systemctl start taskflow"').exit).toBe(0);
    expect(run(s, 'curl -s $TASKFLOW_URL/v1/health').exit).toBe(0);
  });

  it('porta sbagliata: la configurazione cambia solo al riavvio', () => {
    const s = ws('wrong_port');
    expect(run(s, 'curl -sS $TASKFLOW_URL/v1/health').exit).toBe(7);
    expect(run(s, 'ssh server.lab "ss -tlnp"').out).toContain('9090');
    run(s, 'ssh server.lab "sudo sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env"');
    expect(s.lab!.configPort).toBe(8080);
    expect(s.lab!.port).toBe(9090);
    expect(run(s, 'curl -sS $TASKFLOW_URL/v1/health').exit).toBe(7);
    run(s, 'ssh server.lab "sudo systemctl restart taskflow"');
    expect(run(s, 'curl -s $TASKFLOW_URL/v1/health').exit).toBe(0);
  });

  it('senza sudo il file di configurazione non è modificabile', () => {
    const s = ws('wrong_port');
    const r = run(s, 'ssh server.lab "sed -i s/PORT=9090/PORT=8080/ /etc/taskflow/taskflow.env"');
    expect(r.exit).not.toBe(0);
    expect(s.lab!.configPort).toBe(9090);
  });

  it('database fermo: health 200 ma 500 sui dati, con la causa nel registro del server', () => {
    const s = ws('db_down');
    s.shells.bash.env.TASKFLOW_TOKEN = 'tf_test_bob_99999999999';
    expect(run(s, 'curl -s -o /dev/null -w "%{http_code}" $TASKFLOW_URL/v1/health').out).toBe('200');
    const r = run(s, 'curl -s -i -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks');
    expect(r.out).toContain('500');
    expect(r.out).toContain('database_unavailable');
    expect(run(s, 'ssh server.lab "journalctl -u taskflow -n 5"').out).toContain('ERROR');
    run(s, 'ssh server.lab "sudo systemctl start taskflow-db"');
    expect(s.lab!.dbUp).toBe(true);
  });

  it('i comandi del server non esistono sul client e il client non è sudoer', () => {
    const s = ws('ok');
    expect(run(s, 'systemctl status taskflow').exit).toBe(127);
    expect(run(s, 'journalctl -u taskflow').exit).toBe(127);
    expect(run(s, 'sudo ls').out).toContain('sudoers');
  });

  it('ssh: limiti dichiarati', () => {
    const s = ws('ok');
    expect(run(s, 'ssh server.lab').exit).toBe(255);
    expect(run(s, 'ssh root@server.lab "id"').out).toContain('Permission denied');
    expect(run(s, 'ssh -p 2222 server.lab "id"').out).toContain('Connection refused');
    expect(run(s, 'ssh server.lab "ssh server.lab hostname"').out).toContain('annidate');
  });

  it('le richieste del laboratorio non toccano il registro locale né gli altri ambienti', () => {
    const s = ws('ok');
    run(s, 'curl -s $TASKFLOW_URL/v1/health');
    expect(s.fs['/var/log/taskflow/testing/access.log']).toBeUndefined();
    expect(s.api.log.at(-1)!.host).toBe('server.lab');
    expect(s.api.log.at(-1)!.env).toBe('testing');
  });

  it('PowerShell: ssh e Test-NetConnection vedono lo stato del laboratorio', () => {
    const s = ws('stopped');
    expect(run(s, 'Test-NetConnection server.lab -Port 8080', 'pwsh').out).toContain('False');
    expect(run(s, 'ssh learner@server.lab "systemctl is-active taskflow"', 'pwsh').out).toContain('inactive');
    run(s, 'ssh learner@server.lab "sudo systemctl start taskflow"', 'pwsh');
    expect(run(s, 'Test-NetConnection server.lab -Port 8080', 'pwsh').out).toContain('True');
  });

  it('"Ripristina" riporta il laboratorio allo stato iniziale e uscendo dal modulo lo stato si azzera', () => {
    const s = createWorkspace('lab-reset');
    startLesson(s, 'M11.L4');
    execute(s, 'bash', 'ssh server.lab "sudo systemctl start taskflow"');
    expect(s.lab!.running).toBe(true);
    resetLesson(s, 'M11.L4');
    expect(s.lab!.running).toBe(false);
    startLesson(s, 'M1.L1');
    expect(s.lab).toBeUndefined();
  });
});
