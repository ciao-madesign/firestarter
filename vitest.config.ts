import { defineConfig } from 'vitest/config';

// `npm test` esclude i test dell'interfaccia (richiedono un browser): usare `npm run test:ui`.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], exclude: ['tests/ui/**', 'node_modules/**'] } });
