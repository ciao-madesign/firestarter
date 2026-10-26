---
description: Avvia o riprende una lezione del corso (senza argomenti: la prossima da progress.json)
argument-hint: "[M2.L1]"
---
Leggi `../course/progress.json` e `../course/programma.md`. La lezione richiesta è: "$ARGUMENTS" (se vuoto, usa `next.lesson` dallo stato; se `next.note` chiede un ripasso, fai prima quello).

Conduci la lezione seguendo le regole di `CLAUDE.md`: obiettivo, spiegazione breve, esempio guidato un comando alla volta, esercizio con previsione (cosa e perché prima dell'esecuzione), test negativo, verifica senza soluzione pronta.

Un passo alla volta: chiedi la previsione, ATTENDI l'output reale incollato dallo studente, confrontalo punto per punto, correggi spiegando la causa. Non eseguire comandi. Alla fine aggiorna `course/progress.json` e `course/progress.md` e proponi il REGISTRO.
