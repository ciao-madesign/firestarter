# Specifica — sintesi (v1.1)

Sintesi della specifica funzionale e tecnica di Firestarter. I codici (RF, RNF, CA) sono quelli citati nel codice e nei test.
Il testo integrale è stato fornito dal proprietario del progetto; qui sono riportati i punti vincolanti.

## Visione
Un **nucleo di orchestrazione comune**, esteso da **workflow specializzati** e **connettori indipendenti**.
Firestarter coordina strumenti diversi per realizzare un risultato complesso; non li sostituisce.
Non è un chatbot, un launcher o un insieme di automazioni rigide.

## Principi
1. Obiettivo prima degli strumenti · 2. Piano prima dell'esecuzione · 3. Automazione trasparente (stato, input, output, esito)
4. Intervento umano quando serve (non simulare capacità inesistenti) · 5. Separazione dei progetti · 6. Fonti originali intatte
7. Risultati verificabili · 8. Estensibilità · 9. Controllo dell'utente su operazioni distruttive/esterne/sensibili
10. Compatibilità dichiarata (supportato / parziale / manuale).

## Requisiti funzionali (indice)
- **Progetto** RF-01…06: creazione, importazione, brief, analisi iniziale, progetti esistenti, stato complessivo.
- **Pianificazione** RF-07…12: piano con dipendenze, approvazione umana, modifica, risorse, ricalcolo.
- **Esecuzione** RF-13…18: motore, stati, interruzione/ripresa, errori, **un'operazione impegnativa alla volta**, intervento manuale.
- **Connettori** RF-19…24: registro, selezione, priorità API/CLI → MCP → GUI → manuale, capacità dichiarate, indisponibilità, estensibilità.
- **Workflow** RF-25…30: multipli, selezione, definizione, composizione (progetti misti), riuso, estensibilità.
- **Artefatti** RF-31…37: registro, formati, sorgenti vs finali, metadati, tracciabilità, rigenerazione selettiva, consegna.
- **AI** RF-38…43: Ollama locale, provider esterni opzionali, scelta del modello, compiti distinti, limiti dell'AI, trasparenza dei dati.
- **Validazione** RF-44…48: per tipo di artefatto, esiti registrati, revisione umana, coerenza, stato di consegna.
- **Sicurezza** RF-49…52: conferme, separazione ambienti, permessi, registro operativo.

## Non funzionali
RNF-01 semplicità · 02 modularità · 03 portabilità (Windows prima) · 04 resilienza · 05 ripresa · 06 tracciabilità · 07 sicurezza ·
08 controllo costi · 09 efficienza · 10 estensibilità · 11 manutenibilità · 12 formati aperti · 13 verificabilità · 14 trasparenza.

## Moduli logici
M1 Project Workspace · M2 AI Manager · M3 Planner · M4 Execution Engine · M5 Connector Manager · M6 Asset Manager · M7 Validation Engine · M8 Workflow System.
(Divisione logica: non implica otto servizi.)

## Criteri di accettazione (CA-01…21) e pilota
Creazione, importazione, pianificazione, approvazione prima dell'esecuzione, stato, ripresa, errori mai presentati come successo,
organizzazione fonti/intermedi/finali, versioni protette, validazione, rigenerazione selettiva, capacità dei connettori,
isolamento Git, autorizzazioni, provider esterni, diagnostica, workflow/connettore indipendenti, progetto misto,
validazione specializzata, **test di generalità** (secondo workflow grafico o editoriale).
Il pilota è completo con i 13 punti del §19 (workflow limitato con integrazioni verificate, ripresa, rigenerazione selettiva,
fonti protette, secondo workflow, limiti documentati, documentazione per sviluppatori).

## Fuori ambito della prima versione
Automazione universale, qualità creativa autonoma, compatibilità con qualsiasi formato/applicazione.

## Decisioni aperte (stato)
Interfaccia, stack, persistenza, licenza, connettori iniziali, provider AI: **decisi** (vedi `CLAUDE.md`).
Ancora aperte: formati iniziali oltre Markdown/DOCX, integrazione Git, distribuzione, progetto reale di riferimento (§18.9).
