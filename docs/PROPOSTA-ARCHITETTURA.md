# Proposta di architettura — Tutor CLI + Learning Lab

Stato: **da approvare** prima dell'implementazione (richiesto dal brief).

## 1. Fonte unica di verità
- `course/curriculum.json`: moduli M1–M6 e lezioni (~4 per modulo) come da brief; versionato.
- `course/progress.json`: stato dello studente (livello 1–4, lezioni svolte, acquisito, errori ricorrenti, prossima lezione, esiti dei test).
  `course/progress.md` è la vista leggibile, rigenerata a ogni aggiornamento.
- Seed iniziale: stato al 26/10/2026 (M1 completato, livello 2, prossimo: ripasso + M2.L1).

## 2. Tutor in terminale (Claude Code)
- `CLAUDE.md`: regole del tutor (italiano, tono diretto, nessuna gamification, previsione obbligatoria, output incollato dallo studente, aiuti decrescenti, struttura lezione in 6 passi).
- `.claude/settings.json`: Bash negato; Write/Edit consentiti solo su `course/progress.*`. Il tutor non può eseguire comandi.
- Comandi slash: `/lezione` (riprende da `progress.json`), `/test` (4 esercizi misti, peso agli errori ricorrenti), `/registro` (genera il blocco REGISTRO), `/importa-registro` (incolla un REGISTRO e aggiorna lo stato).

## 3. Laboratorio web (già in costruzione)
- Legge/scrive lo stesso `course/progress.json` tramite il server.
- Modulo condiviso `src/course/registro.ts`: parser e generatore del REGISTRO (usato da CLI e web). Regola di merge: non abbassa mai livello o avanzamento; vince la lezione più avanzata.
- Il curriculum del lab viene riallineato a M1–M6 del brief (al posto degli 8 moduli della prima specifica). Gli esercizi nel simulatore diventano i "passi con previsione": il lab chiede la previsione prima dell'esecuzione.
- Valutazione: scala a 4 livelli e dati (esiti, punti da consolidare); niente punteggi o badge.

## 4. Punti di conflitto da decidere
1. **PowerShell**: il brief usa Windows PowerShell 5.1 (`curl` = alias di `Invoke-WebRequest`, vero curl = `curl.exe`). Il simulatore era pensato come PowerShell 7 su Linux. Proposta: modalità 5.1 (da M4).
2. **Ambiente**: il brief è macOS/Bash; il simulatore usa un filesystem Linux (case-sensitive). Proposta: mantenere Linux case-sensitive e dichiararlo, perché è proprio l'errore ricorrente n. 1.
3. **Ripasso M1**: un mini-esercizio per ognuno dei 4 errori ricorrenti prima di M2.L1.
