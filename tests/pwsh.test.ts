import { describe, expect, it } from 'vitest';
import { lab } from './util.ts';

describe('PowerShell 5.1: base', () => {
  it('variabili, stringhe, operatori', () => {
    const { ps } = lab();
    expect(ps('$x = 5; $x + 3').out).toBe('8\n');
    expect(ps('$n = "mondo"; "ciao $n"').out).toBe('ciao mondo\n');
    expect(ps("'a,b,c' -split ','").out).toBe('a\nb\nc\n');
    expect(ps('(1,2,3) -join "-"').out).toBe('1-2-3\n');
    expect(ps('"ABC" -like "a*"').out).toBe('True\n');
    expect(ps('5 -gt 3 -and 2 -lt 1').out).toBe('False\n');
    expect(ps('1..4 | ForEach-Object { $_ * 2 }').out).toBe('2\n4\n6\n8\n');
  });
  it('variabili d\'ambiente con $env:', () => {
    const { ps } = lab();
    expect(ps('$env:HOME').out).toBe('/home/learner\n');
    expect(ps('$env:MIA = "x"; $env:MIA').out).toBe('x\n');
    expect(ps('$env:INESISTENTE').out).toBe('');
  });
  it('hashtable, oggetti e proprietà', () => {
    const { ps } = lab();
    expect(ps('$h = @{a=1; b="x"}; $h.a').out).toBe('1\n');
    expect(ps('$o = [PSCustomObject]@{n="x"; v=2}; $o.v + 1').out).toBe('3\n');
    expect(ps('@{a=1} | ConvertTo-Json -Compress').out).toBe('{"a":1}\n');
    expect(ps("'{\"a\":{\"b\":[1,2]}}' | ConvertFrom-Json | ForEach-Object { $_.a.b[1] }").out).toBe('2\n');
  });
  it('ConvertTo-Json usa profondità 2 come in 5.1', () => {
    const { ps } = lab();
    const r = ps('@{a=@{b=@{c=@{d=1}}}} | ConvertTo-Json -Compress').out;
    expect(r).toContain('System.Collections.Hashtable');
    expect(ps('@{a=@{b=@{c=@{d=1}}}} | ConvertTo-Json -Depth 5 -Compress').out).toBe('{"a":{"b":{"c":{"d":1}}}}\n');
  });
});

describe('PowerShell 5.1: file e pipeline di oggetti', () => {
  it('Set-Content, Get-Content, redirezioni e Select-String', () => {
    const { ps } = lab();
    ps('Set-Content lab/f.txt "uno","due","tre"');
    expect(ps('Get-Content lab/f.txt').out).toBe('uno\ndue\ntre\n');
    expect(ps('Get-Content lab/f.txt -TotalCount 2').out).toBe('uno\ndue\n');
    expect(ps('(Select-String -Pattern d -Path lab/f.txt).Count').out).toBe('1\n');
    ps('"quattro" >> lab/f.txt');
    expect(ps('(Get-Content lab/f.txt).Count').out).toBe('4\n');
    expect(ps('Get-Content lab/f.txt | Where-Object { $_ -like "t*" }').out).toBe('tre\n');
  });
  it('Get-ChildItem mostra la tabella con Mode e Name', () => {
    const { ps } = lab();
    const r = ps('Get-ChildItem ~').out;
    expect(r).toContain('Directory: /home/learner');
    expect(r).toMatch(/Mode\s+LastWriteTime\s+Length Name/);
    expect(r).toContain('README.txt');
  });
  it('Select-Object, Sort-Object, Group-Object, Measure-Object', () => {
    const { ps } = lab();
    expect(ps('1,3,2 | Sort-Object -Descending').out).toBe('3\n2\n1\n');
    expect(ps('"a","b","a" | Group-Object | ForEach-Object { "$($_.Name)=$($_.Count)" }').out).toBe('a=2\nb=1\n');
    expect(ps('1..5 | Select-Object -First 2').out).toBe('1\n2\n');
  });
});

describe('PowerShell 5.1: errori e peculiarità', () => {
  it('&& non esiste in 5.1', () => {
    const { ps } = lab();
    const r = ps('echo a && echo b');
    expect(r.err).toContain("The token '&&' is not a valid statement separator in this version.");
  });
  it('curl è un alias di Invoke-WebRequest; curl.exe è il vero curl', () => {
    const { ps } = lab();
    expect(ps('curl -s $env:TASKFLOW_URL/v1/health').err).toContain("parameter name 's'");
    expect(ps('curl.exe -s $env:TASKFLOW_URL/v1/health').out).toContain('"status":"ok"');
  });
  it('messaggi in stile PowerShell', () => {
    const { ps } = lab();
    const r = ps('Get-Content /nonexistent');
    expect(r.err).toContain("Get-Content : Cannot find path '/nonexistent' because it does not exist.");
    expect(r.err).toContain('CategoryInfo          : ObjectNotFound');
    expect(ps('foo').err).toContain("The term 'foo' is not recognized as the name of a cmdlet");
  });
  it('un errore non terminante non è catturato da try/catch senza -ErrorAction Stop', () => {
    const { ps } = lab();
    const r = ps('try { Get-Content /nonexistent } catch { "catturato" }');
    expect(r.out).not.toContain('catturato');
    expect(ps('try { Get-Content /nonexistent -ErrorAction Stop } catch { "catturato" }').out).toBe('catturato\n');
  });
  it('$? e $LASTEXITCODE', () => {
    const { ps } = lab();
    expect(ps('Get-ChildItem /nonexistent 2>$null; $?').out).toBe('False\n');
    expect(ps('Get-Date | Out-Null; $?').out).toBe('True\n');
  });
  it('throw, try/catch/finally e funzioni', () => {
    const { ps } = lab();
    expect(ps('try { throw "boom" } catch { "preso: $_" } finally { "fine" }').out).toBe('preso: boom\nfine\n');
    expect(ps('function Somma($a, $b) { return $a + $b }; Somma 2 3').out).toBe('5\n');
  });
  it('variabili e funzioni persistono tra comandi', () => {
    const { ps } = lab();
    ps('$conta = 41; function Ciao { "ciao" }');
    expect(ps('$conta + 1').out).toBe('42\n');
    expect(ps('Ciao').out).toBe('ciao\n');
  });
  it('script .ps1: serve ./ e i parametri', () => {
    const { ps } = lab();
    ps(`Set-Content lab/s.ps1 'param($Nome)','Write-Output "ciao $Nome"'`);
    expect(ps('lab/s.ps1 mondo').out).toBe('ciao mondo\n');
    ps('cd lab');
    expect(ps('s.ps1 mondo').err).toContain('does exist in the current location');
    expect(ps('./s.ps1 mondo').out).toBe('ciao mondo\n');
  });
});

describe('PowerShell 5.1: HTTP', () => {
  it('Invoke-RestMethod restituisce oggetti, gli errori HTTP sono eccezioni', () => {
    const { ps } = lab();
    expect(ps('(Invoke-RestMethod "$env:TASKFLOW_URL/v1/health").status').out).toBe('ok\n');
    expect(ps('try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/nope" } catch { $_.Exception.Response.StatusCode.value__ }').out).toBe('404\n');
    expect(ps('try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/nope" } catch { ($_.ErrorDetails.Message | ConvertFrom-Json).error }').out).toBe('route_not_found\n');
    expect(ps('Invoke-RestMethod "$env:TASKFLOW_URL/v1/nope"').err).toContain('The remote server returned an error: (404) Not Found.');
  });
  it('un body stringa senza ContentType è inviato come form: 422 sul token', () => {
    const { ps } = lab();
    const r = ps('try { Invoke-RestMethod "$env:TASKFLOW_URL/v1/auth/token" -Method Post -Body \'{"client_id":"x","client_secret":"y"}\' } catch { $_.Exception.Response.StatusCode.value__ }');
    expect(r.out).toBe('422\n');
  });
});
