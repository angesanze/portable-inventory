import { describe, it, expect } from 'vitest'
import { serializeTheme, deserializeTheme, DEFAULT_THEME } from '../src/theme'
import type { ThemeConfig } from '../src/types'

describe('serializeTheme', () => {
  it('serializes default theme to base64 string', () => {
    const encoded = serializeTheme({})
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)
  })

  it('roundtrips a custom theme', () => {
    const custom: ThemeConfig = {
      primaryColor: '#ff0000',
      backgroundColor: '#000000',
      textColor: '#ffffff',
      borderRadius: '12px',
      fontFamily: 'Inter, sans-serif',
      compact: true,
    }
    const encoded = serializeTheme(custom)
    const decoded = deserializeTheme(encoded)

    expect(decoded.primaryColor).toBe('#ff0000')
    expect(decoded.backgroundColor).toBe('#000000')
    expect(decoded.textColor).toBe('#ffffff')
    expect(decoded.borderRadius).toBe('12px')
    expect(decoded.fontFamily).toBe('Inter, sans-serif')
    expect(decoded.compact).toBe(true)
  })

  it('merges partial theme with defaults', () => {
    const partial: ThemeConfig = { primaryColor: '#00ff00' }
    const encoded = serializeTheme(partial)
    const decoded = deserializeTheme(encoded)

    expect(decoded.primaryColor).toBe('#00ff00')
    expect(decoded.backgroundColor).toBe(DEFAULT_THEME.backgroundColor)
    expect(decoded.textColor).toBe(DEFAULT_THEME.textColor)
    expect(decoded.borderRadius).toBe(DEFAULT_THEME.borderRadius)
    expect(decoded.fontFamily).toBe(DEFAULT_THEME.fontFamily)
    expect(decoded.compact).toBe(DEFAULT_THEME.compact)
  })
})

describe('deserializeTheme', () => {
  it('returns default theme for invalid base64', () => {
    const result = deserializeTheme('not-valid-base64!!!')
    expect(result).toEqual(DEFAULT_THEME)
  })

  it('returns default theme for valid base64 but invalid JSON', () => {
    const encoded = btoa('not json')
    const result = deserializeTheme(encoded)
    expect(result).toEqual(DEFAULT_THEME)
  })

  it('returns default theme for empty string', () => {
    const result = deserializeTheme('')
    expect(result).toEqual(DEFAULT_THEME)
  })
})

describe('DEFAULT_THEME', () => {
  it('has all expected properties', () => {
    expect(DEFAULT_THEME.primaryColor).toBeDefined()
    expect(DEFAULT_THEME.backgroundColor).toBeDefined()
    expect(DEFAULT_THEME.textColor).toBeDefined()
    expect(DEFAULT_THEME.borderRadius).toBeDefined()
    expect(DEFAULT_THEME.fontFamily).toBeDefined()
    expect(DEFAULT_THEME.compact).toBe(false)
  })
})
