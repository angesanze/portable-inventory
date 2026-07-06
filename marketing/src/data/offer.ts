// Sezione di conversione al posto di un listino prezzi.
// Scelta voluta: nessun numero di prezzo, solo una CTA forte per provare l'app.
// Se in futuro vorrai introdurre piani a pagamento, aggiungi qui i dati e
// adatta il componente Offer.astro (o reintroduci una griglia di piani).
export const offer = {
  eyebrow: "Accesso anticipato",
  title: "Provalo adesso, gratis",
  subtitle:
    "Crea la tua azienda in un minuto e inizia a tracciare il magazzino. Nessuna carta di credito, nessun impegno.",
  primaryCta: { label: "Provalo gratis", href: "https://app.varasto.rocks/register" },
  secondaryCta: { label: "Sfoglia la documentazione", href: "https://angesanze.github.io/portable-inventory/" },
  // Cosa ottieni — nessun prezzo, solo valore.
  includes: [
    "Prodotti e movimenti illimitati",
    "Tutti i 7 profili e i 6 motori di calcolo",
    "Multi-azienda con 4 ruoli e permessi",
    "Widget incorporabile, QR e API REST",
    "Import Excel/CSV, export e reporting",
    "Avvisi via email e webhook firmati",
  ],
};
