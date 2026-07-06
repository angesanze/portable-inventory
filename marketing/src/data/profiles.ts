// I 7 profili di tracciamento di Varasto (il concetto distintivo del prodotto).
// Ogni prodotto ne sceglie uno: determina come si contano le giacenze e quale
// motore di calcolo le governa. Verificati sul codice (backend/inventory).
export interface Profile {
  n: number;
  name: string;
  engine: string;
  desc: string;
  examples: string;
}

export const profiles: Profile[] = [
  {
    n: 1,
    name: "Conteggio semplice",
    engine: "Counter",
    desc: "Beni sfusi e fungibili contati come un unico totale.",
    examples: "Viti, acqua, magliette, cavi",
  },
  {
    n: 2,
    name: "Conversione unità",
    engine: "Converter",
    desc: "Carichi in un'unità e consumi in un'altra, con rapporto configurabile.",
    examples: "Stock in litri, uso a bottiglia",
  },
  {
    n: 3,
    name: "Dimensionale (area/volume)",
    engine: "Dimension",
    desc: "Quantità derivata da una formula sulle misure, senza calcoli a mano.",
    examples: "Tessuti, lamiere, pavimenti",
  },
  {
    n: 4,
    name: "Lotti tracciati",
    engine: "Bucket",
    desc: "Stock raggruppato in lotti tracciabili, pronto per il richiamo.",
    examples: "Colle, prodotti chimici, componenti",
  },
  {
    n: 5,
    name: "Deperibili a scadenza",
    engine: "Time-Based",
    desc: "Lotti con data di scadenza: consumo FEFO e avvisi automatici.",
    examples: "Latte, vaccini, noleggi",
  },
  {
    n: 6,
    name: "Serializzati",
    engine: "Item Tracker",
    desc: "Ogni unità è un pezzo unico con matricola e stato proprio.",
    examples: "Laptop, veicoli, macchinari",
  },
  {
    n: 7,
    name: "Kit e assemblati",
    engine: "Counter + assembly",
    desc: "Prodotti costruiti da una distinta componenti tramite ordine di lavoro.",
    examples: "Kit primo soccorso, rack server",
  },
];

// I 6 motori di calcolo che stanno sotto ai profili.
export const engines: string[] = [
  "Counter",
  "Converter",
  "Bucket",
  "Item Tracker",
  "Dimension",
  "Time-Based",
];
