import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@extensionchecker/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
      '@docs': new URL('../../docs', import.meta.url).pathname
    }
  },
  server: {
    fs: {
      allow: [
        new URL('../..', import.meta.url).pathname
      ]
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'worker.ts'],
      exclude: ['src/main.tsx', 'src/pdf-report.ts', 'src/components/pdf/**', 'src/vite-env.d.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85
      }
    }
  }
});
