import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { applyPaletteVars, getStoredPaletteId } from './theme/applyPalette'

// Apply the saved accent palette before first paint to avoid a color flash.
applyPaletteVars(getStoredPaletteId())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline widget support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — offline mode unavailable, no action needed
    });
  });
}
