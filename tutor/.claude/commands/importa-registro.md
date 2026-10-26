---
description: Importa un REGISTRO incollato (dalla chat o dal laboratorio web) e aggiorna lo stato
argument-hint: "[incolla qui il REGISTRO]"
---
Il testo seguente contiene un blocco REGISTRO scritto altrove (chat o laboratorio web):

$ARGUMENTS

Se è vuoto, chiedi allo studente di incollarlo. Altrimenti leggi `../course/progress.json` e applica il REGISTRO con queste regole:

- La lezione indicata in "Lezione completata" diventa `completed` con la data del REGISTRO (se già completata con data uguale o successiva, non cambiarla); aggiungi i concetti di "Acquisito" senza duplicati; `source: "chat"`.
- "Da consolidare": unisci le voci nuove a `toConsolidate`.
- "Livello attuale": aumenta il livello solo se è maggiore dell'attuale; non abbassarlo mai.
- "Prossima lezione": aggiornala solo se non è precedente a quella già in `next`.
- Aggiungi una riga a `sessions`. Aggiorna anche `course/progress.md`.

Poi elenca allo studente, in poche righe, cosa è cambiato e cosa hai ignorato (e perché). In alternativa lo studente può eseguire `npm run course:import -- file.txt` dalla cartella principale.
