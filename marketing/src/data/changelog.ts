// Changelog / "Novità".
//
// Voce più recente IN CIMA. Aggiungere una release = aggiungere un oggetto qui
// e fare push: la CI ridistribuisce il sito automaticamente.
export interface ChangelogEntry {
  date: string; // formato YYYY-MM-DD
  version: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-07-05",
    version: "1.0.0",
    changes: [
      "Primo rilascio pubblico di Varasto.",
      "Gestione inventario multi-tenant con registro immutabile dei movimenti.",
      "Widget embeddabile e generazione di QR code.",
    ],
  },
];
