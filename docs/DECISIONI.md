# Decisioni sui punti aperti (sezione 17 della specifica)

Prese per avviare l'implementazione; ognuna è reversibile e il codice è predisposto per l'alternativa.

| # | Domanda | Scelta | Perché e come cambiare |
|---|---|---|---|
| 1 | Fedeltà del terminale | **Simulazione controllata**, estendibile (catalogo con differenze dichiarate) | È il requisito di sicurezza dell'MVP. La modalità reale si innesta dietro `execute()` (vedi ARCHITETTURA). |
| 2 | Accesso | **Applicazione personale senza account**: un solo workspace (`LAB_SINGLE_USER=1`, predefinito). In alternativa multi-workspace con codice casuale non indovinabile (`LAB_SINGLE_USER=0`, header `X-Workspace`) | Meno complessità e nessun dato personale. Il codice è un segreto di capacità: adatto a uso personale o di gruppo fidato, non a un servizio pubblico (mancano autenticazione e limiti per utente). |
| 3 | AI | **Tutor deterministico**, interfaccia `TutorAdapter` pronta | Funziona offline e a costo zero. Non è implementato nessun adattatore AI: i punti di innesto sono `buildTutorContext()` (contesto filtrato, senza stato completo né credenziali) e `TutorAdapter.respond()`. |
| 4 | Infrastrutture | **Interamente simulate** | Nessun collegamento a servizi reali durante gli esercizi (il progetto finale con un servizio reale, previsto dal brief, si svolge nel tutor CLI). |
| 5 | Distribuzione | **Open source, predisposto per entrambe**: locale/self-hosted (`npm start`) o online | Nessuna dipendenza runtime; dati in `data/`, stato del corso in `course/`. |
| 6 | Valutazione | **Percorso guidato** (M1–M7) con verifiche automatiche; laboratorio libero (shell, editor, ambiente) sempre disponibile | La creazione di esercizi personalizzati non è implementata; si aggiungono lezioni in `src/curriculum/lessons/`. |

## Decisioni derivate dal brief del tutor CLI

- **PowerShell**: simulata **Windows PowerShell 5.1** (non 7): `curl` alias di `Invoke-WebRequest`, niente `&&`, `ConvertTo-Json` a profondità 2.
- **Filesystem**: Linux, **sensibile alle maiuscole**, dichiarato come tale: è l'errore ricorrente n. 1 dello studente (su macOS `/users` funziona, su Linux no).
- **Curriculum**: moduli M1–M6 come da brief, **espansi** dove utile (M4 a 6 lezioni, M5 e M6 a 5) più M7 facoltativo (automazione). Il ripasso dei 4 errori ricorrenti precede M2.L1.
- **Niente gamification**: i progressi sono dati (livello 1–4, esiti, errori ricorrenti, competenze separate).
- **Git e webhook** (M5 del brief) non sono simulati: restano nel tutor CLI, dove lo studente esegue comandi reali.
