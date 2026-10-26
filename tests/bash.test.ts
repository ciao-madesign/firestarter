import { describe, expect, it } from 'vitest';
import { lab } from './util.ts';

describe('Bash: navigazione e file', () => {
  it('pwd, cd e percorsi relativi/assoluti', () => {
    const { bash } = lab();
    expect(bash('pwd').out).toBe('/home/learner\n');
    expect(bash('cd lab && pwd').out).toBe('/home/learner/lab\n');
    expect(bash('cd .. && pwd').out).toBe('/home/learner\n');
    expect(bash('cd /nonexistent').err).toContain('No such file or directory');
  });
  it('le maiuscole contano', () => {
    const { bash } = lab();
    expect(bash('cd /home/Learner').exit).toBe(1);
    expect(bash('ls /home/Learner').exit).toBe(2);
  });
  it('mkdir, touch, echo >, >>, cat, rm', () => {
    const { bash } = lab();
    expect(bash('mkdir -p lab/a/b && cd lab/a && echo uno > f.txt && echo due >> f.txt && cat f.txt').out).toBe('uno\ndue\n');
    expect(bash('cd ~; rm lab/a/f.txt; ls lab/a').out).toBe('b\n');
    expect(bash('rm lab/a').err).toContain('Is a directory');
    expect(bash('rm -r lab/a; ls lab').out).toBe('');
  });
  it('> sovrascrive senza avvisi', () => {
    const { bash } = lab();
    bash('echo uno > lab/f; echo due > lab/f');
    expect(bash('cat lab/f').out).toBe('due\n');
  });
  it('ls -la mostra i nascosti e il formato lungo', () => {
    const { bash } = lab();
    bash('cd lab; touch .nascosto visibile');
    expect(bash('ls').out).toBe('visibile\n');
    expect(bash('ls -a').out).toContain('.nascosto');
    expect(bash('ls -l').out).toMatch(/^total \d+\n-rw-r--r-- 1 learner learner/);
  });
  it('permessi: file non eseguibile e chmod', () => {
    const { bash } = lab();
    bash("echo 'echo ciao' > lab/s.sh");
    expect(bash('./lab/s.sh').err).toContain('Permission denied');
    expect(bash('chmod +x lab/s.sh; ./lab/s.sh').out).toBe('ciao\n');
  });
  it('i file di sistema non sono scrivibili', () => {
    const { bash } = lab();
    expect(bash('echo x > /etc/hosts').err).toContain('Permission denied');
  });
});

describe('Bash: quoting ed espansioni', () => {
  it('virgolette, variabili e variabili inesistenti', () => {
    const { bash } = lab();
    expect(bash('echo "Home: $HOME"').out).toBe('Home: /home/learner\n');
    expect(bash("echo 'Home: $HOME'").out).toBe('Home: $HOME\n');
    expect(bash('echo $INESISTENTE').out).toBe('\n');
    expect(bash('echo SHELL').out).toBe('SHELL\n');
  });
  it('nomi con spazi: senza virgolette sono due argomenti', () => {
    const { bash } = lab();
    bash('mkdir "lab/mio dir"');
    const r = bash('ls lab/mio dir');
    expect(r.err.split('\n').filter(Boolean)).toHaveLength(2);
    expect(bash('ls "lab/mio dir"').exit).toBe(0);
  });
  it('parentesi non quotate: errore di sintassi, il comando non parte', () => {
    const { bash } = lab();
    const r = bash('ls -l Mio Progetto (v2)');
    expect(r.err).toContain('syntax error near unexpected token `(\'');
    expect(r.exit).toBe(2);
  });
  it('una condizione vuota è un errore di sintassi', () => {
    const { bash } = lab();
    expect(bash('if then fi').err).toContain("syntax error near unexpected token `then'");
  });
  it('sostituzione di comando, aritmetica, brace expansion, glob', () => {
    const { bash } = lab();
    expect(bash('echo $(echo ciao)').out).toBe('ciao\n');
    expect(bash('echo $((2 + 3 * 4))').out).toBe('14\n');
    expect(bash('echo {1..3}').out).toBe('1 2 3\n');
    bash('touch lab/a.txt lab/b.txt lab/c.log');
    expect(bash('echo lab/*.txt').out).toBe('lab/a.txt lab/b.txt\n');
  });
  it('tilde e ${VAR:-default}', () => {
    const { bash } = lab();
    expect(bash('echo ~/lab').out).toBe('/home/learner/lab\n');
    expect(bash('echo ${NOPE:-predefinito}').out).toBe('predefinito\n');
  });
});

describe('Bash: pipe, filtri e codici di uscita', () => {
  it('pipe e filtri', () => {
    const { bash } = lab();
    expect(bash("printf 'b\\na\\nb\\n' | sort | uniq -c").out).toMatch(/1 a\n\s+2 b/);
    expect(bash("echo 'uno due tre' | wc -w").out.trim()).toBe('3');
    expect(bash('cat /etc/passwd | grep -c bash').out.trim()).toBe('2');
    expect(bash("echo 'a:b:c' | cut -d: -f2").out).toBe('b\n');
    expect(bash("echo 'Hello' | tr 'a-z' 'A-Z'").out).toBe('HELLO\n');
    expect(bash("echo 'ciao mondo' | sed 's/mondo/lab/'").out).toBe('ciao lab\n');
    expect(bash("echo 'a b c' | awk '{print $2}'").out).toBe('b\n');
  });
  it('codici di uscita', () => {
    const { bash } = lab();
    expect(bash('true; echo $?').out).toBe('0\n');
    expect(bash('ls /nonexistent; echo $?').out).toBe('2\n');
    expect(bash('grep zzz /etc/hosts; echo $?').out).toBe('1\n');
    expect(bash('nonesiste').exit).toBe(127);
    expect(bash('nonesiste').err).toBe('bash: nonesiste: command not found\n');
    expect(bash('false && echo no || echo si').out).toBe('si\n');
  });
  it('2>&1 e /dev/null', () => {
    const { bash } = lab();
    expect(bash('ls /nonexistent 2>/dev/null; echo fatto').all).toBe('fatto\n');
    expect(bash('ls /nonexistent 2>&1 | wc -l').out.trim()).toBe('1');
  });
});

describe('Bash: script, funzioni, cicli', () => {
  it('for, if, while, funzioni, heredoc', () => {
    const { bash } = lab();
    expect(bash('for i in a b c; do echo $i; done').out).toBe('a\nb\nc\n');
    expect(bash('x=5; if [ $x -gt 3 ]; then echo grande; else echo piccolo; fi').out).toBe('grande\n');
    expect(bash('i=0; while [ $i -lt 3 ]; do i=$((i+1)); done; echo $i').out).toBe('3\n');
    expect(bash('f() { echo "arg: $1"; return 3; }; f ciao; echo $?').out).toBe('arg: ciao\n3\n');
    expect(bash("cat <<EOF\nutente $USER\nEOF").out).toBe('utente learner\n');
  });
  it('un ciclo infinito è fermato dai limiti', () => {
    const { bash } = lab();
    const r = bash('while true; do :; done');
    expect(r.err).toContain('limite di esecuzione');
  });
  it('input incompleto richiede la continuazione', async () => {
    const { s } = lab();
    const { execute } = await import('../src/engine/index.ts');
    expect(execute(s, 'bash', 'echo "aperta').incomplete).toBe(true);
    expect(execute(s, 'bash', 'if true; then').incomplete).toBe(true);
  });
  it('script con codici di uscita e variabili locali al processo figlio', () => {
    const { bash } = lab();
    bash("printf '#!/bin/bash\\nX=dentro\\nexit 7\\n' > lab/s.sh; chmod +x lab/s.sh");
    expect(bash('./lab/s.sh; echo $?').out).toBe('7\n');
    expect(bash('echo "[$X]"').out).toBe('[]\n');
  });
});

describe('Bash: curl e jq contro il servizio simulato', () => {
  it('GET health, header, status e errori di rete', () => {
    const { bash } = lab();
    expect(JSON.parse(bash('curl -s $TASKFLOW_URL/v1/health').out).status).toBe('ok');
    expect(bash('curl -si $TASKFLOW_URL/v1/health').out).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(bash('curl -s -o /dev/null -w "%{http_code}" $TASKFLOW_URL/v1/nope').out).toBe('404');
    expect(bash('curl -sS http://nessun-host.test/').err).toContain('Could not resolve host');
    expect(bash('curl -s http://localhost:9999/').exit).toBe(7);
    expect(bash('curl -s --max-time 3 $TASKFLOW_URL/v1/slow').exit).toBe(28);
    expect(bash('curl -sf $TASKFLOW_URL/v1/nope').exit).toBe(22);
  });
  it('jq estrae campi', () => {
    const { bash } = lab();
    expect(bash("echo '{\"a\":{\"b\":[1,2]}}' | jq '.a.b[1]'").out).toBe('2\n');
    expect(bash("echo '[{\"n\":\"x\"},{\"n\":\"y\"}]' | jq -r '.[].n'").out).toBe('x\ny\n');
    expect(bash("echo 'non json' | jq .").exit).toBe(2);
  });
  it('nessun accesso a host esterni', () => {
    const { bash } = lab();
    expect(bash('curl -s https://example.com').exit).toBe(6);
  });
});
