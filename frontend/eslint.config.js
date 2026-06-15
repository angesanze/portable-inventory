import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // UI Native-Style Audit (Phase 07) regression guards:
      // Use the Toast / ConfirmDialog primitives instead of browser dialogs.
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'Use the Toast primitive (components/ui/Toast) instead of window.alert.' },
        { name: 'confirm', message: 'Use the ConfirmDialog primitive (components/ui/ConfirmDialog) instead of window.confirm.' },
        { name: 'prompt', message: 'Use a Modal with an input instead of window.prompt.' },
      ],
      // Use the styled Select primitive (components/ui/Select) instead of raw <select>,
      // which renders the browser-native dropdown overlay. Allowed in Select.tsx (the
      // primitive's own NativeSelect variant) and in tests via the override below.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: 'Use the Select primitive (components/ui/Select) instead of a raw <select>.',
        },
      ],
    },
  },
  {
    // The Select primitive owns the only sanctioned native <select> (NativeSelect variant).
    files: ['src/components/ui/Select.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Tests may mock/stub native elements and browser dialogs freely.
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-syntax': 'off' },
  },
])
