# Guida allo sviluppo

```bash
npm install
npm run build        # typecheck + frontend in dist/web
npm start            # http://127.0.0.1:3000  (PORT, LAB_HOST per cambiarli)
npm test             # vitest: motori, curriculum, backend, corso
npm run dev          # ricostruisce il frontend e riavvia il server alla modifica
```

Variabili: `LAB_DATA_DIR` (default `data/`), `LAB_COURSE_FILE` (default `course/progress.json`), `LAB_SINGLE_USER` (`1` default; `0` per multi-workspace), `PORT`, `LAB_HOST`.

## Aggiungere un comando Bash

1. Implementalo in `src/engine/bash/commands.ts` con `reg('nome', (args, io, rt) => codice)`; usa `getopt` per le opzioni, `rt.vfs` per i file, `io.out/io.err` per l'output.
2. Aggiungi la scheda in `src/engine/catalog.ts` con **opzioni supportate e differenze rispetto al comando reale**.
3. `npm run docs:commands` rigenera `docs/COMANDI.md`. Il test `catalog.test.ts` fallisce se manca la scheda.

I cmdlet PowerShell stanno in `src/engine/pwsh/cmdlets.ts` (`def('Nome-Cmdlet', 'Param|alias:posizione, Switch!', run)`).

## Aggiungere una lezione

1. Crea l'oggetto `Lesson` in `src/curriculum/lessons/mN.ts` (vedi i campi in `src/curriculum/types.ts`): obiettivo, spiegazione, passi guidati, previsioni, test negativo, esercizio, **controlli** (funzioni deterministiche su file, log delle richieste e storico comandi), esempio, indizi graduati, soluzioni per shell.
2. Registrala in `lessons/index.ts`.
3. `npm test`: `lessons.test.ts` esegue le soluzioni e verifica che i controlli passino (e che non passino a vuoto). Le verifiche autonome non hanno `solutions` ma una `reference` mai esposta.
4. `npm run course:programma` rigenera `course/programma.md` per il tutor CLI.

## Aggiungere un endpoint all'API simulata

Modifica `src/engine/api/spec.ts` (fonte unica) e il gestore in `src/engine/api/server.ts`: validazione, OpenAPI e controlli dei documenti ne derivano.

## Convenzioni

- Italiano per testi e messaggi rivolti allo studente; i messaggi dei comandi simulati riproducono la lingua del comando reale (inglese).
- I motori non importano da `server/` né `web/`.
- Ogni limite di sicurezza (`LIMITS` in `src/engine/types.ts`) è applicato nei motori, non solo nell'interfaccia.
