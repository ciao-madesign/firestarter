import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { signWebhook, webhookSecret } from '../src/engine/api/server.ts';

const mk = () => {
  const s = createWorkspace('ses');
  const run = (l: string): { t: string; exit: number } => {
    const r = execute(s, 'bash', l);
    return { t: r.out.map((o) => o.t).join(''), exit: r.exit };
  };
  return run;
};

describe('cookie e sessioni', () => {
  it('login, uso del cookie, logout', () => {
    const run = mk();
    expect(run('curl -s $TASKFLOW_URL/v1/session').t).toMatch(/no_session/);
    const login = run('curl -s -i -c j.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d \'{"username":"bob","password":"pw_dev_demo"}\'').t;
    expect(login).toMatch(/Set-Cookie: session=sess_dev_bob_\d+; Path=\/v1; HttpOnly/);
    expect(run('cat j.txt').t).toMatch(/#HttpOnly_localhost\tFALSE\t\/v1\tFALSE\t0\tsession\tsess_dev_bob_/);
    expect(run('curl -s -b j.txt $TASKFLOW_URL/v1/session').t).toMatch(/"user":"bob"/);
    expect(run('curl -s -b "session=abc" $TASKFLOW_URL/v1/session').t).toMatch(/invalid_session/);
    expect(run('curl -s -i -b j.txt -c j.txt -X POST $TASKFLOW_URL/v1/logout').t).toMatch(/204/);
    expect(run('curl -s -b j.txt $TASKFLOW_URL/v1/session').t).toMatch(/no_session/);
  });
  it('password sbagliata: nessun cookie', () => {
    const run = mk();
    const r = run('curl -s -i -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d \'{"username":"bob","password":"x"}\'').t;
    expect(r).toMatch(/invalid_credentials/);
    expect(r).not.toMatch(/Set-Cookie/);
  });
  it('la sessione scade con l\'orologio simulato', () => {
    const run = mk();
    run('curl -s -c j.txt -X POST $TASKFLOW_URL/v1/login -H "Content-Type: application/json" -d \'{"username":"bob","password":"pw_dev_demo"}\'');
    run('sleep 2000');
    expect(run('curl -s -b j.txt $TASKFLOW_URL/v1/session').t).toMatch(/session_expired|no_session/);
  });
});

describe('webhook firmati', () => {
  const send = (run: ReturnType<typeof mk>, ts: string, sig: string, body: string) =>
    run(`curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -H "X-Webhook-Timestamp: ${ts}" -H "X-Signature: ${sig}" -d '${body}'`).t;

  it('openssl calcola HMAC e coincide con la firma attesa dal server', () => {
    const run = mk();
    const body = '{"type":"nota.creata","id":42}';
    const ts = run('date +%s').t.trim();
    run(`BODY='${body}'`);
    run(`TS=${ts}`);
    const sig = run(`printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "${webhookSecret('development')}" | awk '{print $NF}'`).t.trim();
    expect(sig).toBe(signWebhook(webhookSecret('development'), ts, body));
    expect(send(run, ts, `sha256=${sig}`, body)).toMatch(/"received":true/);
  });
  it('rifiuta firma mancante, errata, timestamp vecchio', () => {
    const run = mk();
    const body = '{"type":"x"}';
    expect(run(`curl -s -X POST $TASKFLOW_URL/v1/webhooks/receive -d '${body}'`).t).toMatch(/missing_signature/);
    const ts = run('date +%s').t.trim();
    expect(send(run, ts, 'sha256=00', body)).toMatch(/invalid_signature/);
    const old = '1000';
    const sig = signWebhook(webhookSecret('development'), old, body);
    expect(send(run, old, `sha256=${sig}`, body)).toMatch(/stale_timestamp/);
  });
  it('curl -d @file elimina i ritorni a capo, --data-binary li conserva', () => {
    const run = mk();
    run("printf 'a\\nb\\n' > f.txt");
    run('curl -s -o /dev/null -w "%{http_code}" -X POST $TASKFLOW_URL/v1/webhooks/receive -d @f.txt');
    // il corpo registrato nel log applicativo di sviluppo è quello inviato
    const strip = run('curl -s -X POST $TASKFLOW_URL/v1/auth/token -d @f.txt').t;
    expect(strip).toBeTruthy();
    expect(run('openssl dgst -sha256 f.txt').t).toMatch(/^SHA2-256\(f\.txt\)= [0-9a-f]{64}/);
  });
  it('openssl: sottocomandi non supportati danno un errore esplicito', () => {
    const run = mk();
    expect(run('openssl rand -hex 8').exit).toBe(1);
    expect(run('echo x | openssl dgst -md5').exit).toBe(1);
  });
});
