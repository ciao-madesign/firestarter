# Aiuto con AI (Gemini) — progetto

Stato: implementato e provato con un servizio Gemini **simulato** (test automatici). **Non ancora provato con la chiave vera**: la sessione di sviluppo non raggiunge i server di Google.

## Cosa fa
Due aiuti, entrambi facoltativi:
1. **Spiegare con parole più semplici**: la spiegazione della lezione, l'ultimo errore o risultato, un testo o comando scritto dall'allievo.
2. **Indizio con AI**: adatta l'indizio standard della lezione alla situazione dell'allievo (ultimi comandi, controlli non superati), in una o due frasi e con una domanda finale.

## Cosa NON fa (regole fisse)
- Non decide mai se un esercizio o una verifica è superata: restano i controlli deterministici.
- Non riceve né mostra la soluzione completa. Le righe della soluzione non presenti nel materiale già mostrato vengono cercate nella risposta: se compaiono, la risposta è scartata e si mostra l'aiuto standard.
- Non è disponibile durante i test intermedi.
- Non riceve credenziali: token, password, segreti, cookie, JWT e valori delle variabili `*TOKEN*`, `*SECRET*`, `*PASSWORD*`, `*KEY*` sono sostituiti da `[nascosto]` prima dell'invio e anche nella risposta.

## Conteggio degli aiuti (valutazione onesta)
| Azione | Conta come |
|---|---|
| Spiega la lezione più semplice | spiegazione usata |
| Indizio con AI | indizio usato (stesso contatore dell'indizio standard, con la stessa regola «prima l'esempio») |
| Spiega l'ultimo errore / un testo | nessun aiuto (come «Analizza errore» del tutor standard) |

## Dati inviati
Titolo, obiettivo, consegna e spiegazione della lezione (materiale pubblico del corso); l'indizio standard; gli ultimi 3 comandi con output (600 caratteri ciascuno, segreti oscurati); le descrizioni dei controlli non superati; il testo scritto dall'allievo (max 1200 caratteri). Il contenuto dell'allievo è racchiuso in marcatori e il modello è istruito a trattarlo come dato, non come istruzioni.

**Attenzione alla privacy**: con il piano gratuito Google può usare i testi per migliorare i propri prodotti (verifica i termini correnti su ai.google.dev). L'allievo deve attivare esplicitamente l'aiuto, e l'avviso è mostrato accanto all'interruttore.

## Sicurezza e limiti
- La chiave sta solo sul server (`LAB_GEMINI_KEY`), viaggia solo nell'intestazione `x-goog-api-key`, non è mai inviata al browser né salvata nei dati.
- Senza chiave la funzione non esiste: nessun pulsante, `POST /api/ai` risponde 503.
- Limiti: 20 richieste AI all'ora per workspace e 10 al minuto in totale; attesa massima 15 secondi; risposta massima circa 700 token.
- Se il servizio non risponde, è bloccato dai filtri o risponde vuoto, si mostra l'aiuto standard con una nota.

## Attivazione sul Wyse
1. Crea la chiave su Google AI Studio (non incollarla in chat né nel repository).
2. `sudo nano /etc/learning-lab.env` e aggiungi: `LAB_GEMINI_KEY=<la chiave>` (facoltativo: `LAB_GEMINI_MODEL=gemini-2.5-flash`).
3. `sudo systemctl restart learning-lab`; nel registro del servizio (`journalctl -u learning-lab -n 5`) compare «Aiuto con AI disponibile».
4. Nel laboratorio: scheda Chat, casella «Attiva l'aiuto con AI».
5. Il Wyse deve poter uscire in HTTPS verso `generativelanguage.googleapis.com`.
Per spegnere: togli la riga e riavvia.

## API
- `GET /api/ai/status` → `{ available, enabled, model, notice }`
- `POST /api/prefs { aiEnabled: true|false }`
- `POST /api/ai { mode: 'simplify'|'hint', target: 'lesson'|'error'|'text', text? }` → `{ reply: { text, ai, note? }, chat }`

## Codice
`src/tutor/ai.ts` (logica, prompt, filtro, chiamata), integrazione in `src/server/app.ts` e `src/server/main.ts`, interfaccia in `src/web/chat.ts` e `src/web/lesson.ts`; test in `tests/ai.test.ts` e `tests/ui/ai.test.ts`.

## Limiti noti
- Qualità e tono delle risposte reali non verificati: da valutare con la chiave vera su qualche lezione.
- Il filtro anti-soluzione riconosce solo righe ripetute alla lettera; un'AI potrebbe comunque suggerire la soluzione con parole proprie. Per questo la consegna e le verifiche non cambiano e l'aiuto conta come indizio.
- Nome del modello e limiti del piano gratuito cambiano nel tempo: `LAB_GEMINI_MODEL` permette di aggiornare senza modificare il codice.
