import type { ThemeConfig } from './types'

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  borderRadius: '8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  compact: false,
}

export function serializeTheme(theme: ThemeConfig): string {
  const merged = { ...DEFAULT_THEME, ...theme }
  return btoa(JSON.stringify(merged))
}

export function deserializeTheme(encoded: string): ThemeConfig {
  try {
    return JSON.parse(atob(encoded)) as ThemeConfig
  } catch {
    return { ...DEFAULT_THEME }
  }
}
