/**
 * Griglia di valutazione redazionale (quattro criteri, scala 1–4) e documento di riferimento per il confronto.
 * Il laboratorio controlla i fatti verificabili; la qualità editoriale si valuta con questa griglia
 * (da incollare in chat tramite "Copia per Claude") e si registra nel REGISTRO.
 */
export type CriterionId = 'chiarezza' | 'struttura' | 'pubblico' | 'completezza';

export const CRITERIA: { id: CriterionId; label: string; levels: [string, string, string, string] }[] = [
  {
    id: 'chiarezza',
    label: 'Chiarezza',
    levels: ['Frasi ambigue o gergali, il lettore deve indovinare.', 'Comprensibile ma con passaggi oscuri o termini non spiegati.', 'Chiaro; qualche frase si può semplificare.', 'Frasi brevi e precise, termini definiti, nessuna ambiguità.'],
  },
  {
    id: 'struttura',
    label: 'Struttura',
    levels: ['Blocco di testo senza ordine.', 'Sezioni presenti ma in ordine poco utile.', 'Ordine logico (scopo, requisiti, passi, risultato, errori) con piccole lacune.', 'Ordine che segue il lavoro del lettore; titoli utili; esempi accanto alla spiegazione.'],
  },
  {
    id: 'pubblico',
    label: 'Pubblico',
    levels: ['Non è chiaro a chi si rivolge.', 'Presuppone conoscenze che il lettore potrebbe non avere.', 'Adatto al pubblico dichiarato; qualche presupposto implicito.', 'Pubblico e prerequisiti dichiarati; il livello di dettaglio è coerente.'],
  },
  {
    id: 'completezza',
    label: 'Completezza',
    levels: ['Mancano passi o risultati essenziali.', 'Il caso di successo c\'è, gli errori no.', 'Successo ed errori principali, con esempi eseguibili.', 'Successo, errori, limiti noti e come verificare il risultato.'],
  },
];

export const REFERENCE_TITLE = 'GET /v1/health — verificare che il servizio risponda';
export const REFERENCE_EXAMPLE = `# GET /v1/health

Per chi è: sviluppatori e tester che devono controllare che il servizio TaskFlow sia raggiungibile.
Ambiente: development (http://localhost:8080). Versione API: 1.0.

## Cosa fa

Restituisce lo stato del servizio. Non richiede autenticazione.

## Richiesta

\`\`\`bash
curl -s -i "$TASKFLOW_URL/v1/health"
# => 200
\`\`\`

## Risposta di successo (200)

\`\`\`json
{"status":"ok","version":"1.0.0","env":"development"}
\`\`\`

Il campo \`version\` dice quale versione dell'API risponde.

## Errori

| Situazione | Risposta | Cosa fare |
|---|---|---|
| Metodo non consentito (POST) | 405 method_not_allowed | Usa GET. |
| Nome host errato | nessuna risposta HTTP (errore DNS) | Controlla TASKFLOW_URL. |

## Come verificare

Se ottieni \`"status":"ok"\` e il codice 200, il servizio è raggiungibile.
`;

export function rubricText(): string {
  const lines = ['Valuta il documento con questa griglia (scala 1–4). Per ogni criterio dai il punteggio e UNA frase di motivazione con un esempio dal testo.', ''];
  for (const c of CRITERIA) lines.push(`- ${c.label}: 1 = ${c.levels[0]} 2 = ${c.levels[1]} 3 = ${c.levels[2]} 4 = ${c.levels[3]}`);
  lines.push('', 'Confronta poi il documento con l\'esempio di riferimento qui sotto: indica due differenze che contano e una cosa che il documento fa meglio.', '', 'Chiudi con UNA riga in questo formato esatto (la incollerò nel REGISTRO):', 'Valutazione redazionale: chiarezza N/4; struttura N/4; pubblico N/4; completezza N/4');
  return lines.join('\n');
}

export type EditorialScores = Record<CriterionId, number>;

/** Legge "chiarezza 3/4; struttura 2/4; ..." (anche con ":" o "=" e senza "/4"). Ritorna null se manca un criterio o un punteggio è fuori scala. */
export function parseEditorial(text: string): EditorialScores | null {
  const out: Partial<EditorialScores> = {};
  for (const c of CRITERIA) {
    const m = new RegExp(`${c.id}\\s*[:=]?\\s*([1-4])(?:\\s*/\\s*4)?`, 'i').exec(text);
    if (!m) return null;
    out[c.id] = parseInt(m[1], 10);
  }
  return out as EditorialScores;
}
