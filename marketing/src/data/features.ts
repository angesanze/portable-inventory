// Feature cards. Add / edit / reorder freely — the grid adapts.
// `icon` is an inline SVG string (rendered with set:html), so no icon library
// dependency is needed.
export interface Feature {
  title: string;
  body: string;
  icon: string;
}

export const features: Feature[] = [
  {
    title: "Multi-tenant nativo",
    body: "Ogni azienda ha dati, utenti e permessi isolati by-design. Un'unica installazione serve tutti i clienti.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>`,
  },
  {
    title: "Profili di stock intelligenti",
    body: "7 profili prodotto guidano 6 motori di calcolo diversi — sfuso, serializzato, deperibile e altro — senza configurazioni fragili.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>`,
  },
  {
    title: "Registro immutabile",
    body: "Ogni variazione di giacenza è scritta in un ledger append-only. Storia completa e verificabile, mai sovrascritta.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M4 4v16a2 2 0 0 0 2 2h14M4 4h12a2 2 0 0 1 2 2v10M8 8h6M8 12h6M8 16h4"/></svg>`,
  },
  {
    title: "Widget embeddabile",
    body: "Un web component da incollare in qualsiasi sito: mostra e aggiorna le giacenze dove servono, con una riga di codice.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="m8 18-6-6 6-6M16 6l6 6-6 6"/></svg>`,
  },
];
