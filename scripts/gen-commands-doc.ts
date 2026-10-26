import { mkdirSync, writeFileSync } from 'node:fs';
import { CATALOG } from '../src/engine/catalog.ts';

const out: string[] = [
  '# Catalogo dei comandi simulati',
  '',
  'Generato da `npm run docs:commands` a partire da `src/engine/catalog.ts`. Per ogni comando: sintassi, opzioni e **differenze dichiarate** rispetto al comportamento reale. Il laboratorio non dichiara di supportare ciò che simula solo in parte senza dirlo.',
  '',
];
for (const [label, shell] of [['Bash', 'bash'], ['PowerShell 5.1', 'pwsh']] as const) {
  out.push(`## ${label}`, '');
  for (const d of CATALOG.filter((x) => x.shells.includes(shell))) {
    out.push(`### \`${d.name}\``, '', d.summary, '', `Sintassi: \`${d.synopsis}\``, '');
    if (d.options.length) out.push(...d.options.map((o) => `- \`${o.flag}\`: ${o.desc}`), '');
    if (d.example) out.push(`Esempio: \`${d.example}\``, '');
    if (d.differences.length) out.push('Differenze rispetto al comando reale:', ...d.differences.map((x) => `- ${x}`), '');
  }
}
mkdirSync('docs', { recursive: true });
writeFileSync('docs/COMANDI.md', out.join('\n'));
console.log('Generato docs/COMANDI.md');
