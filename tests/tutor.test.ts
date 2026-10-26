import { describe, expect, it } from 'vitest';
import { createWorkspace, execute } from '../src/engine/index.ts';
import { startLesson, verifyLesson } from '../src/curriculum/engine.ts';
import { tutorRespond } from '../src/tutor/tutor.ts';
import { seedProgress } from '../src/course/progress.ts';

const fresh = () => {
  const s = createWorkspace('tt');
  return s;
};

describe('Tutor deterministico', () => {
  it('riconosce status e codice applicativo di un 401 (Bash)', () => {
    const s = fresh();
    execute(s, 'bash', 'curl -s -i $TASKFLOW_URL/v1/tasks');
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/Status HTTP: 401/);
    expect(t).toMatch(/Non autenticato/);
    expect(t).toMatch(/unauthorized/);
    expect(t).toMatch(/status .* codice applicativo/i);
  });

  it('riconosce lo status nell\'errore di PowerShell', () => {
    const s = fresh();
    execute(s, 'pwsh', 'Invoke-RestMethod "$env:TASKFLOW_URL/v1/tasks"');
    const t = tutorRespond(s, 'analyze', 'pwsh').text;
    expect(t).toMatch(/401/);
  });

  it('riconosce lo status da -w %{http_code}', () => {
    const s = fresh();
    execute(s, 'bash', 'curl -s -o /dev/null -w "%{http_code}" $TASKFLOW_URL/v1/tasks/999');
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/Status HTTP: (401|404)/);
  });

  it('collega un token scaduto al concetto della lezione', () => {
    const s = fresh();
    execute(s, 'bash', 'curl -s -i -H "Authorization: Bearer scaduto" $TASKFLOW_URL/v1/tasks');
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/Concetto/);
  });

  it('spiega gli spazi non quotati', () => {
    const s = fresh();
    execute(s, 'bash', 'mkdir "Mia cartella"');
    execute(s, 'bash', 'ls Mia cartella');
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/spazi/);
  });

  it('l\'etichetta non dice "Ultimo comando" se il fallito non è l\'ultimo', () => {
    const s = fresh();
    execute(s, 'bash', 'cat manca.txt');
    execute(s, 'bash', 'echo ok');
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/Ultimo comando fallito \(non è l'ultimo eseguito\)/);
    const s2 = fresh();
    execute(s2, 'bash', 'cat manca.txt');
    expect(tutorRespond(s2, 'analyze', 'bash').text).toMatch(/^Ultimo comando: /);
  });

  it('"posso passare?" elenca controlli superati e mancanti, senza inventare', () => {
    const s = fresh();
    startLesson(s, 'M1.L1');
    expect(tutorRespond(s, 'chat', 'bash', 'posso passare?').text).toMatch(/Non ho ancora risultati/);
    verifyLesson(s, 'M1.L1', 'bash', seedProgress());
    const t = tutorRespond(s, 'chat', 'bash', 'posso passare alla prossima?').text;
    expect(t).toMatch(/NON superata/);
    expect(t).toMatch(/Mancanti:/);
    expect(t).toMatch(/Non puoi ancora passare/);
  });

  it('segnala le differenze con macOS e Windows reali', () => {
    const s = fresh();
    expect(tutorRespond(s, 'explain', 'bash', "sed -i 's/a/b/' f.txt").text).toMatch(/macOS.*sed -i ''/);
    expect(tutorRespond(s, 'explain', 'pwsh', 'curl -s http://x').text).toMatch(/Windows.*curl\.exe/);
    expect(tutorRespond(s, 'explain', 'pwsh', './verifica.ps1').text).toMatch(/Restricted/);
    expect(tutorRespond(s, 'explain', 'bash', 'ls -la').text).not.toMatch(/Sul tuo ambiente reale/);
    expect(tutorRespond(s, 'chat', 'bash', 'quali differenze ci sono con il mio Mac?').text).toMatch(/zsh/);
    expect(tutorRespond(s, 'chat', 'pwsh', 'differenze con windows?').text).toMatch(/TLS 1\.2/);
  });

  it('avvisa quando un comando riuscito nel laboratorio fallirebbe sul Mac', () => {
    const s = fresh();
    execute(s, 'bash', 'echo ciao > f.txt');
    execute(s, 'bash', "sed -i 's/ciao/mondo/' f.txt");
    const t = tutorRespond(s, 'analyze', 'bash').text;
    expect(t).toMatch(/potrebbe fallire/);
  });
});
