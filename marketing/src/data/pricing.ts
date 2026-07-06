// Pricing plans.
//
// Oggi Varasto è GRATIS: c'è un solo piano. Per introdurre piani a pagamento in
// futuro basta aggiungere altri oggetti a questo array — la sezione prezzo si
// adatta da sola (1 piano = centrato; 2+ = griglia). Nessuna modifica al markup.
export interface Plan {
  name: string;
  price: string;
  period?: string; // es. "/mese" — ometti per un prezzo una tantum o gratis
  tagline?: string;
  highlight?: boolean; // evidenzia il piano consigliato
  features: string[];
  cta: { label: string; href: string };
}

export const plans: Plan[] = [
  {
    name: "Gratis",
    price: "€0",
    tagline: "Tutto quello che serve per iniziare. Nessuna carta di credito.",
    highlight: true,
    features: [
      "Prodotti e movimenti illimitati",
      "Multi-tenant e gestione utenti",
      "Widget embeddabile",
      "QR code e deep-link",
      "Supporto community",
    ],
    cta: { label: "Inizia ora", href: "https://app.varasto.rocks/register" },
  },
  // Esempio di piano futuro a pagamento — decommenta e adatta quando serve:
  // {
  //   name: "Pro",
  //   price: "€19",
  //   period: "/mese",
  //   tagline: "Per team che crescono.",
  //   features: ["Tutto di Gratis", "Utenti illimitati", "Supporto prioritario"],
  //   cta: { label: "Passa a Pro", href: "https://app.varasto.rocks/billing" },
  // },
];
