import { useEffect, useState } from 'react'

interface ThemeConfig {
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  borderRadius?: string
  fontFamily?: string
  successColor?: string
  dangerColor?: string
  mutedColor?: string
  borderColor?: string
  surfaceColor?: string
  inputBgColor?: string
  compact?: boolean
}

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  borderRadius: '8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  successColor: '#10b981',
  dangerColor: '#f43f5e',
  mutedColor: '#64748b',
  borderColor: '#e2e8f0',
  surfaceColor: '#f8fafc',
  inputBgColor: '#ffffff',
  compact: false,
}

function deserializeTheme(encoded: string): ThemeConfig {
  try {
    return JSON.parse(atob(encoded)) as ThemeConfig
  } catch {
    return { ...DEFAULT_THEME }
  }
}

/**
 * Reads theme from URL `theme` query param and applies CSS custom properties
 * to the provided container ref. Falls back to defaults when no theme present.
 */
export function useTheme(containerRef: React.RefObject<HTMLElement | null>) {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME)

  useEffect(() => {
    const params = new URL(window.location.href).searchParams
    const encoded = params.get('theme')
    const t: ThemeConfig = encoded
      ? { ...DEFAULT_THEME, ...deserializeTheme(encoded) }
      : DEFAULT_THEME
    if (encoded) {
      // One-time sync of immutable URL-derived theme into state for the return
      // value; runs once per containerRef and converges immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(t)
    }

    const el = containerRef.current
    if (!el) return
    // Apply tokens to BOTH the container (descendant scope) and
    // documentElement (so portal-mounted nodes — e.g. <Select>'s
    // CustomDropdown listbox, which createPortal'd into document.body —
    // can still read the per-company branding).
    const targets: HTMLElement[] = [el, document.documentElement]
    for (const target of targets) {
      target.style.setProperty('--pi-primary', t.primaryColor ?? DEFAULT_THEME.primaryColor!)
      target.style.setProperty('--pi-bg', t.backgroundColor ?? DEFAULT_THEME.backgroundColor!)
      target.style.setProperty('--pi-text', t.textColor ?? DEFAULT_THEME.textColor!)
      target.style.setProperty('--pi-radius', t.borderRadius ?? DEFAULT_THEME.borderRadius!)
      target.style.setProperty('--pi-font', t.fontFamily ?? DEFAULT_THEME.fontFamily!)
      target.style.setProperty('--pi-success', t.successColor ?? DEFAULT_THEME.successColor!)
      target.style.setProperty('--pi-danger', t.dangerColor ?? DEFAULT_THEME.dangerColor!)
      target.style.setProperty('--pi-muted', t.mutedColor ?? DEFAULT_THEME.mutedColor!)
      target.style.setProperty('--pi-border', t.borderColor ?? DEFAULT_THEME.borderColor!)
      target.style.setProperty('--pi-surface', t.surfaceColor ?? DEFAULT_THEME.surfaceColor!)
      target.style.setProperty('--pi-input-bg', t.inputBgColor ?? DEFAULT_THEME.inputBgColor!)
    }
    if (t.compact) {
      el.classList.add('pi-compact')
    }
  }, [containerRef])

  return theme
}
