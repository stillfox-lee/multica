import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**', 'src/shared/**'],
      exclude: ['src/renderer/**', 'src/preload/**'],
    },
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
