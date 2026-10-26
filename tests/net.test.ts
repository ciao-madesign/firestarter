import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';

const run = (sh: 'bash' | 'pwsh', line: string, s = createWorkspace('net')): { out: string; exit: number } => {
  const r = execute(s, sh, line);
  return { out: r.out.map((o) => o.t).join(''), exit: r.exit };
};

describe('rete simulata', () => {
  it('DNS: nome noto e nome inesistente', () => {
    expect(run('bash', 'nslookup staging.api.taskflow.test').out).toContain('203.0.113.30');
    const bad = run('bash', 'nslookup nope.test');
    expect(bad.exit).toBe(1);
    expect(bad.out).toContain('NXDOMAIN');
    expect(run('bash', 'dig +short test.api.taskflow.test').out.trim()).toBe('203.0.113.20');
    expect(run('pwsh', 'Resolve-DnsName nope.test').exit).not.toBe(0);
  });
  it('porte: aperta e chiusa', () => {
    expect(run('bash', 'nc -z localhost 8080').exit).toBe(0);
    const c = run('bash', 'nc -zv localhost 9999');
    expect(c.exit).toBe(1);
    expect(c.out).toMatch(/Connection refused/);
    expect(run('pwsh', 'Test-NetConnection localhost -Port 9999').out).toMatch(/TcpTestSucceeded : False/);
    expect(run('bash', 'ss -tlnp').out).toMatch(/127\.0\.0\.1:8080/);
    expect(run('bash', 'ss -x').exit).toBe(1);
  });
  it('ping: host noto e sconosciuto', () => {
    expect(run('bash', 'ping -c 2 localhost').out).toMatch(/2 packets transmitted, 2 received/);
    expect(run('bash', 'ping -c 1 nope.test').exit).toBe(2);
  });
  it('certificato scaduto: errore 60, -k lo ignora, PowerShell 5.1 non ha equivalente', () => {
    expect(run('bash', 'curl -sS https://expired.api.taskflow.test/v1/health')).toMatchObject({ exit: 60 });
    expect(run('bash', 'curl -sk https://expired.api.taskflow.test/v1/health').out).toContain('"status":"ok"');
    expect(run('pwsh', 'Invoke-RestMethod https://expired.api.taskflow.test/v1/health').out).toMatch(/trust relationship/);
  });
  it('CORS: origine consentita, non consentita e preflight', () => {
    expect(run('bash', 'curl -s -i -H "Origin: https://docs.taskflow.test" localhost:8080/v1/health').out).toMatch(/Access-Control-Allow-Origin: https:\/\/docs\.taskflow\.test/);
    expect(run('bash', 'curl -s -i -H "Origin: https://evil.test" localhost:8080/v1/health').out).not.toMatch(/Access-Control-Allow-Origin/);
    const pre = run('bash', 'curl -s -i -X OPTIONS -H "Origin: https://evil.test" -H "Access-Control-Request-Method: GET" localhost:8080/v1/tasks').out;
    expect(pre).toMatch(/403/);
    expect(pre).toMatch(/cors_origin_not_allowed/);
  });
  it('un redirect 301 con -L trasforma il POST in GET', () => {
    expect(run('bash', 'curl -s -o /dev/null -w "%{http_code}" -X POST -L http://test.api.taskflow.test/v1/health').out).toBe('200');
    expect(run('bash', 'curl -s -o /dev/null -w "%{http_code}" -X POST https://test.api.taskflow.test/v1/health').out).toBe('405');
  });
});
