// Changelog / "Novità".
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
      "7 profili di tracciamento con 6 motori di calcolo e registro movimenti immutabile.",
      "Gestione multi-azienda con ruoli, licenze e console superadmin.",
      "Widget incorporabile, QR dinamici, import Excel/CSV e API REST con docs OpenAPI.",
    ],
  },
];
