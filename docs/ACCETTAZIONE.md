# Criteri di accettazione dell'MVP — stato

Verificato con i test automatici (`npm test`) e con prove manuali in Chromium (viewport desktop e viewport mobile emulato). **Non è stato provato su un dispositivo mobile reale né su Safari/Firefox.**

| # | Criterio | Stato | Evidenza |
|---|---|---|---|
| 1 | Aprire l'app da un browser senza installare strumenti CLI | Soddisfatto | `npm start`, poi il browser; i test di `tests/server.test.ts` coprono il backend |
| 2 | Passare da Bash a PowerShell mantenendo il contesto | Soddisfatto | Selettore sempre visibile (Alt+1/Alt+2); lezione attiva, file e servizi condivisi; cwd, variabili e cronologia separate (`server.test.ts`: "cronologia separata per shell") |
| 3 | Esercizi equivalenti nelle due shell | Soddisfatto | `tests/lessons.test.ts` esegue la soluzione di ogni lezione sia in Bash sia in PowerShell e verifica che superi gli stessi controlli. Eccezione dichiarata: M4.L6 è solo PowerShell (è il confronto) |
| 4 | Creare e modificare file nel filesystem virtuale | Soddisfatto | Comandi di file in entrambe le shell (`bash.test.ts`, `pwsh.test.ts`) e editor nella scheda Documentazione |
| 5 | Interrogare un'API simulata da terminale | Soddisfatto | `curl`, `Invoke-RestMethod`, `Invoke-WebRequest` (`api.test.ts`, M3–M4) |
| 6 | CRUD tramite HTTP | Soddisfatto | M4.L3 e `api.test.ts` ("CRUD completo con persistenza dello stato") |
| 7 | Riprodurre errori di autenticazione, validazione e server | Soddisfatto | 401 (assente/schema/scaduto/altro ambiente), 422, 400, 415, 403, 405, 409, 429, 500, timeout, DNS, connessione rifiutata: `api.test.ts`, M3.L4, M5 |
| 8 | Individuare la causa usando output e log | Soddisfatto | M5.L3 (log applicativo in `/var/log/taskflow/…`), M5.L5; il tutor analizza l'output reale |
| 9 | Documentazione API con esempi verificabili | Soddisfatto | M6.L3 e `docs.test.ts`: gli esempi `curl` vengono eseguiti su una copia isolata e confrontati con `# => status` |
| 10 | Riprendere una sessione con progressi e artefatti | Soddisfatto | Stato su disco (workspace + `course/progress.json`), ripresa automatica della lezione attiva e della trascrizione dei terminali |
| 11 | Completare un esercizio senza la soluzione del tutor | Soddisfatto | Distinzione autonomo/con indizi/con soluzione (`course.test.ts`, `server.test.ts`); le verifiche autonome non hanno soluzione |
| 12 | Funzionalità essenziali su desktop e mobile | Parzialmente verificato | Layout a schede, tasti rapidi, tastiera esterna; provato solo con emulazione iPhone 13 in Chromium |

## Funzioni dell'MVP non coperte da test automatici dell'interfaccia

Il frontend non ha test automatici nel repository (le prove sono state manuali con Playwright, non versionate). Sono coperti da test: motori, curriculum (soluzioni di tutte le lezioni), backend, REGISTRO, test intermedi, catalogo.

## Limiti noti

- Il simulatore implementa un **sottoinsieme** di Bash e PowerShell (vedi `docs/COMANDI.md`): sed/awk/jq sono ridotti, niente job in background, niente `read` interattivo, niente editor interattivi.
- PowerShell: percorsi POSIX (`/home/learner`) anziché `C:\…`, hashtable ordinate, formattazione a tabella semplificata.
- Nessun adattatore AI è implementato (solo l'interfaccia).
- Nessun test su dispositivi reali; l'accessibilità segue le buone pratiche (ruoli ARIA, focus, contrasto, tastiera) ma non è stata verificata con uno screen reader.
- Modalità multi-workspace senza autenticazione (codice casuale come segreto).
