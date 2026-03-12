import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@extensionchecker/shared': new URL('../shared/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75
      }
    }
  }
});
