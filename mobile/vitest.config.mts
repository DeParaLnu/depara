import { defineConfig } from 'vitest/config';

// Юніт-тести чистої логіки (api.ts, політика кешу) у Node. Екрани перевіряють E2E (e2e/), нативні модулі тут мокаються.
export default defineConfig({
  define: { __DEV__: false },
  test: { include: ['src/**/*.test.ts'] },
});
