// Copy globale e link. Si edita qui — ogni componente legge da questo file.
export const site = {
  name: "Varasto",
  url: "https://varasto.rocks",

  // Hero
  tagline: "Il gestionale che traccia ogni tipo di magazzino.",
  description:
    "Sfuso, conversioni, dimensionali, lotti, deperibili, seriali, kit: 7 profili di tracciamento e 6 motori di calcolo per gestire qualsiasi inventario in un'unica interfaccia. Ogni movimento in un registro immutabile. Multi-azienda, con widget incorporabile, QR, import Excel e API REST.",

  // L'app (gestionale) vive sul sottodominio "app".
  appUrl: "https://app.varasto.rocks",
  registerUrl: "https://app.varasto.rocks/register",
  loginUrl: "https://app.varasto.rocks/login",

  docsUrl: "https://angesanze.github.io/portable-inventory/",
  githubUrl: "https://github.com/angesanze/portable-inventory",

  // TODO: sostituisci con l'indirizzo di contatto pubblico definitivo.
  email: "hello@varasto.rocks",

  // Strip di numeri sotto l'hero.
  stats: [
    { value: "7", label: "profili di tracciamento" },
    { value: "6", label: "motori di calcolo" },
    { value: "IT · EN", label: "interfaccia" },
    { value: "REST", label: "API + widget" },
  ],
};
