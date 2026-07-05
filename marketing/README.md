# Varasto — sito marketing (`varasto.rocks`)

One-pager statico che racconta l'app. È un progetto **Astro + Tailwind CSS**
indipendente dal frontend del gestionale (che vive in `../frontend` ed è servito
su `app.varasto.rocks`).

## Sviluppo

```bash
cd marketing
npm install
npm run dev      # http://localhost:4321
npm run build    # genera dist/  (quello che viene deployato)
npm run preview  # anteprima della build
```

## Dove si modifica il contenuto

Tutto il testo "vivo" sta in `src/data/` — si edita lì, non nel markup:

| File | Cosa contiene |
| :--- | :--- |
| `src/data/site.ts` | Nome, tagline, descrizione, link (app, docs, GitHub, email di contatto). |
| `src/data/features.ts` | Le card delle funzionalità. |
| `src/data/pricing.ts` | I piani. Oggi uno solo, **Gratis**. Aggiungere un piano = aggiungere un oggetto all'array. |
| `src/data/changelog.ts` | Le "Novità". Nuova release = nuova voce **in cima** all'array. |

Aggiornare prezzo o changelog è quindi solo un edit + `git push`: la CI
ridistribuisce il sito.

Lo screenshot dell'app è un placeholder in `src/components/Hero.astro`: metti
l'immagine in `public/preview.png` e sostituisci il riquadro con un `<img>`.

## Deploy

Automatico via GitHub Actions (`.github/workflows/deploy-marketing.yml`): a ogni
push su `main` che tocca `marketing/**`, builda e pubblica sul target Firebase
Hosting **`www`** (dominio `varasto.rocks`).

Prerequisito una tantum — creare il sito Firebase:

```bash
firebase hosting:sites:create varasto-www --project varasto-prod
```
