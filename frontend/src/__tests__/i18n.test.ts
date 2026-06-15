import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import i18n from '../i18n';

describe('i18n setup', () => {
  beforeAll(async () => {
    // Ensure a deterministic starting language regardless of detector state.
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('initializes without error', () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it('uses English as the default fallback language', () => {
    expect(i18n.options.fallbackLng).toContain('en');
    expect(i18n.language).toBe('en');
  });

  it('translates common:save to "Save" in English', () => {
    expect(i18n.t('common:save')).toBe('Save');
  });

  it('translates common:save to "Salva" after switching to Italian', async () => {
    await i18n.changeLanguage('it');
    expect(i18n.t('common:save')).toBe('Salva');
    await i18n.changeLanguage('en');
  });

  it('loads all configured namespaces without missing imports', () => {
    const expectedNs = [
      'common',
      'nav',
      'dashboard',
      'products',
      'inventory',
      'settings',
      'onboarding',
    ];
    expect(i18n.options.ns).toEqual(expect.arrayContaining(expectedNs));
    for (const ns of expectedNs) {
      expect(i18n.hasResourceBundle('en', ns)).toBe(true);
      expect(i18n.hasResourceBundle('it', ns)).toBe(true);
    }
  });

  it('resolves nav:dashboard to "Dashboard" in both languages', async () => {
    expect(i18n.t('nav:dashboard')).toBe('Dashboard');
    await i18n.changeLanguage('it');
    expect(i18n.t('nav:dashboard')).toBe('Dashboard');
    await i18n.changeLanguage('en');
  });
});
