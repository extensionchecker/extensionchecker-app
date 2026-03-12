import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@extensionchecker/shared': new URL('../shared/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/main.tsx', 'worker.ts', 'src/pdf-report.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  }
});
