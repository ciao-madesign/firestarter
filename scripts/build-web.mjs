import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
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

await build({
  entryPoints: ['src/server/main.ts'],
  bundle: true,
  outfile: 'dist/server.mjs',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
console.log('Server pronto in dist/server.mjs');
