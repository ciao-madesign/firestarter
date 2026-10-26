---
description: Genera e conduce il test intermedio di fine modulo (4 esercizi misti)
argument-hint: "[numero modulo, es. 2]"
---
Prepara il test intermedio del modulo "$ARGUMENTS" (se vuoto, il modulo più recente completato in `../course/progress.json`).

Scegli 4 esercizi misti: almeno 2 sul modulo appena concluso, almeno 1 che faccia riemergere un errore ricorrente di `recurringErrors` (dai peso a quelli con `count` più alto), anche da moduli precedenti. Elenca all'inizio i 4 esercizi con il motivo della scelta, poi conducili uno alla volta, senza aiuti: previsione, output reale incollato, correzione punto per punto.

Alla fine registra in `tests["M<n>"]` l'esito di ciascuno (`passed`, `passed_partial`, `retry`, `failed`) con il problema, aggiorna `recurringErrors`, `toConsolidate`, `level` (solo con evidenze) e `next`, e aggiorna anche `course/progress.md`. Mostra i risultati come dati, senza commenti motivazionali.
