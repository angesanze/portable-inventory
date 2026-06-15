/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react() as any],
  // `xlsx` ships CommonJS; Vite needs explicit pre-bundling to avoid
  // "Failed to resolve import" in the dev server. Listed here so cold
  // starts don't depend on dep-cache scanning.
  optimizeDeps: {
    include: ['xlsx'],
  },
  server: {
    host: true,
    allowedHosts: ['frontend'],
    proxy: {
      '/api':    { target: 'http://backend:8000', changeOrigin: true },
      '/admin':  { target: 'http://backend:8000', changeOrigin: true },
      '/static': { target: 'http://backend:8000', changeOrigin: true },
      '/go':     { target: 'http://backend:8000', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Forked child processes terminate cleanly on SIGTERM; the default thread
    // pool can leave orphan workers pinning a CPU when an outer tool kills the
    // parent shell. Hard caps prevent runaway hangs from blocking CI/agents.
    pool: 'forks',
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: 5000,
  },
})
