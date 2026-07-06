// Inventario COMPLETO delle capacità di Varasto, categorizzato.
// Verificato sul codice (backend/inventory, frontend/src/features, sdk).
// Solo claim reali — vedi note: offline = solo widget, notifiche email+webhook,
// lingue IT+EN, valorizzazione a costo medio ponderato.
export interface Capability {
  title: string;
  tagline: string;
  icon: string; // SVG inline (lucide-style), reso con set:html
  items: string[];
}

export const capabilities: Capability[] = [
  {
    title: "Catalogo & profili di tracciamento",
    tagline: "Ogni prodotto tracciato nel modo giusto.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>`,
    items: [
      "7 profili di tracciamento con 6 motori di calcolo dedicati",
      "Wizard guidato: conta per quantità, per lotto o per unità",
      "SKU univoci e codici a barre GTIN/EAN validati (check-digit)",
      "Preset di tracciamento riutilizzabili tra più prodotti",
      "Distinta base per kit e prodotti assemblati",
      "Giacenza iniziale, lotti con scadenza e matricole in creazione",
      "Soglia di sotto-scorta per prodotto",
    ],
  },
  {
    title: "Inventario & giacenze",
    tagline: "Sai sempre cosa hai, dove, e quanto è disponibile.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>`,
    items: [
      "Giacenze live per prodotto, ubicazione e lotto (fisico / riservato / disponibile)",
      "Movimenti: carico, scarico e trasferimenti interni",
      "Ubicazioni e magazzini: magazzino, negozio, scarti, virtuali, quarantena",
      "Prenotazioni di stock",
      "Inventari fisici con riconciliazione e rettifica",
      "Restock Board kanban: Sano / Riordino / Critico / Esaurito / Sovrascorta",
      "Velocità di consumo: giorni al riordino e all'esaurimento",
      "Anagrafiche fornitori e clienti con attribuzione sui movimenti",
    ],
  },
  {
    title: "Tracciabilità & ledger immutabile",
    tagline: "Ogni variazione scritta una volta, per sempre.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4v16a2 2 0 0 0 2 2h14M4 4h12a2 2 0 0 1 2 2v10M8 8h6M8 12h6M8 16h4"/></svg>`,
    items: [
      "Registro movimenti append-only e immutabile",
      "Costo COGS a media ponderata, congelato su ogni movimento",
      "Tracciabilità dei lotti e richiamo mirato",
      "Ciclo di vita per unità seriale: Attivo / Richiamo / Scaduto",
      "Consumo FEFO e monitoraggio scadenze",
      "Regole di monitoraggio + Event Log (soglia min/max, scadenza)",
      "Chiave di idempotenza anti-duplicati",
      "Guardie di integrità multi-azienda su ogni operazione",
    ],
  },
  {
    title: "Ordini, acquisti & produzione",
    tagline: "Dal fornitore al cliente, passando per l'assemblaggio.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
    items: [
      "Ordini di acquisto con ricezione a riga (costo a ledger)",
      "Ordini di vendita con evasione e COGS congelato",
      "Ordini di trasferimento inter-sede con buffer In Transito",
      "Resi / RMA cliente e fornitore con area di quarantena",
      "Ordini di lavoro: l'assemblaggio consuma i componenti e produce il kit",
    ],
  },
  {
    title: "Multi-azienda, ruoli & licenze",
    tagline: "Un'installazione, tante aziende, permessi al millimetro.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/></svg>`,
    items: [
      "Multi-tenant per Partita IVA, dati isolati per azienda",
      "4 ruoli RBAC — Owner, Admin, Operator, Viewer — applicati lato server",
      "Gestione utenti in-app: invita, attiva, cambia ruolo",
      "Licenze per azienda con scadenza e limiti (utenti, prodotti, aziende)",
      "Rotazione della licenza in un clic",
      "Console superadmin: KPI, sospensioni, impersonation, audit log",
      "Workspace developer per creare e gestire aziende clienti",
    ],
  },
  {
    title: "Widget incorporabile & QR",
    tagline: "Porta il magazzino ovunque, con una riga di codice.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m8 18-6-6 6-6M16 6l6 6-6 6"/></svg>`,
    items: [
      "SDK widget: classe JS o web component, in iframe sandboxato",
      "Operazioni dal widget senza aprire il gestionale (scansiona, carica, scarica, trasferisci)",
      "Temizzazione completa: colori, raggio, font, lingua",
      "QR dinamici, singoli o in batch fino a 100, verso prodotto / lotto / seriale / ordine / URL",
      "Flusso /go sicuro: la chiave API non finisce mai nell'URL",
      "Chiavi API con permessi granulari, allow-list CORS, hashate a riposo",
    ],
  },
  {
    title: "Import/Export & reporting",
    tagline: "I tuoi dati entrano ed escono senza attriti.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
    items: [
      "Import massivo Excel e CSV con validazione dry-run e commit per-riga",
      "Export Excel di ogni elenco e report",
      "Export completo dei dati azienda (portabilità GDPR, ZIP di JSON)",
      "Report di valorizzazione, per prodotto e per ubicazione",
      "Report COGS su intervallo, con costo storico congelato",
      "Dashboard: KPI, grafico movimenti, feed recenti, palette ⌘K",
      "12 palette colore applicate a tutta l'app",
    ],
  },
  {
    title: "Notifiche & avvisi",
    tagline: "Ti accorgi dei problemi prima che diventino tali.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
    items: [
      "Canali Email e Webhook firmato (HMAC-SHA256)",
      "Trigger su sotto/sovra-scorta e scadenze in avvicinamento",
      "Filtro per tipo di evento e invio di prova",
      "Consegne loggate con retry automatico e backoff esponenziale",
    ],
  },
  {
    title: "Mobile, offline & API",
    tagline: "Sul campo e in integrazione, senza compromessi.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 17 6-6-6-6M12 19h8"/></svg>`,
    items: [
      "Scansione QR da fotocamera nel browser, con torcia e inserimento manuale",
      "Coda operazioni offline dal widget, con replay al riconnettersi",
      "API REST completa su /api/v1",
      "Documentazione interattiva Swagger e ReDoc (OpenAPI)",
      "Auth JWT + chiavi API con token widget firmati",
      "Tier di rate-limit: Free, Standard, Premium",
    ],
  },
];
