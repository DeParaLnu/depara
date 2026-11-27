import { defineConfig } from 'vitest/config';

// Юніт-тести чистої логіки (api.ts, політика кешу) у Node. Екрани перевіряють E2E (e2e/), нативні модулі тут мокаються.
export default defineConfig({
  define: { __DEV__: false },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // усі файли src/, також екрани без юніт-тестів (їх перевіряють E2E на емуляторі): відсоток чесний
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
