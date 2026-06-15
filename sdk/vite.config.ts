/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PortableInventorySDK',
      formats: ['es', 'umd'],
      fileName: (format) =>
        `portable-inventory-sdk.${format === 'es' ? 'es' : 'umd'}.js`,
    },
    rollupOptions: {
      external: [],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
