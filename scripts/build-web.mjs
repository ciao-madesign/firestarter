import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist/web', { recursive: true, force: true });
mkdirSync('dist/web', { recursive: true });
await build({
  entryPoints: ['src/web/main.ts'],
  bundle: true,
  outfile: 'dist/web/app.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  logLevel: 'info',
});
for (const f of ['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon.svg']) cpSync(`src/web/${f}`, `dist/web/${f}`);
console.log('Frontend pronto in dist/web');
