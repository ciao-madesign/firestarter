import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { FileStore } from './store.ts';

const port = parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.LAB_HOST ?? '127.0.0.1';
const dataDir = resolve(process.env.LAB_DATA_DIR ?? 'data');
const singleUser = (process.env.LAB_SINGLE_USER ?? '1') !== '0';
const courseFile = singleUser ? resolve(process.env.LAB_COURSE_FILE ?? 'course/progress.json') : null;

const store = new FileStore(dataDir, courseFile);
const server = createApp({ store, singleUser, webRoot: resolve('dist/web') });
server.requestTimeout = 30_000;
server.listen(port, host, () => {
  console.log(`CLI & API Learning Lab — http://${host}:${port}`);
  console.log(`Modalità: ${singleUser ? 'personale (un solo studente)' : 'multi-workspace (header X-Workspace)'}; dati in ${dataDir}`);
  console.log('Ambiente SIMULATO: nessun comando viene eseguito sul server o sul tuo dispositivo.');
});
