import { describe, expect, it } from 'vitest';
import '../src/engine/index.ts';
import { COMMANDS } from '../src/engine/bash/interp.ts';
import { CMDLETS } from '../src/engine/pwsh/cmdlets.ts';
import { CATALOG, findDoc, psAliases } from '../src/engine/catalog.ts';

describe('Catalogo dei comandi (fedeltà dichiarata)', () => {
  it('ogni comando Bash registrato ha una scheda', () => {
    const missing = [...COMMANDS.keys()].filter((c) => !findDoc(c, 'bash'));
    expect(missing).toEqual([]);
  });
  it('ogni scheda Bash corrisponde a un comando registrato', () => {
    const orphan = CATALOG.filter((d) => d.shells.includes('bash') && !COMMANDS.has(d.name)).map((d) => d.name);
    expect(orphan).toEqual([]);
  });
  it('ogni cmdlet PowerShell ha una scheda e ogni scheda un cmdlet', () => {
    const missing = [...CMDLETS.values()].filter((c) => !findDoc(c.name, 'pwsh')).map((c) => c.name);
    expect(missing).toEqual([]);
    const native = new Set(['curl.exe', 'jq.exe', 'git']);
    const orphan = CATALOG.filter((d) => d.shells.includes('pwsh') && !native.has(d.name) && !CMDLETS.has(d.name.toLowerCase())).map((d) => d.name);
    expect(orphan).toEqual([]);
  });
  it('gli alias PowerShell puntano a cmdlet esistenti (curl → Invoke-WebRequest in 5.1)', () => {
    for (const [alias, target] of Object.entries(psAliases())) expect(CMDLETS.has(target.toLowerCase()) || alias === 'mkdir', `${alias} → ${target}`).toBe(true);
    expect(psAliases().curl).toBe('Invoke-WebRequest');
  });
  it('ogni scheda ha sintassi e sommario', () => {
    for (const d of CATALOG) {
      expect(d.synopsis.length, d.name).toBeGreaterThan(0);
      expect(d.summary.length, d.name).toBeGreaterThan(0);
    }
  });
});
