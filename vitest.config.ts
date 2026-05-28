import { defineConfig } from 'vitest/config'
import path from 'node:path'

const alias = { '@': path.resolve(__dirname, './src') }

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    projects: [
      {
        resolve: { alias },
        test: { include: ['tests/unit/**/*.test.ts'], name: 'unit' },
      },
      {
        resolve: { alias },
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
