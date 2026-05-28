import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    projects: [
      { test: { include: ['tests/unit/**/*.test.ts'], name: 'unit' } },
      {
        test: {
          include: ['tests/integration/**/*.test.ts'],
          name: 'integration',
          setupFiles: ['tests/integration/setup.ts'],
          hookTimeout: 120000,
          testTimeout: 30000,
        },
      },
    ],
  },
})
