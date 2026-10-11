import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 15000,
    // Сценарії ходять в одну спільну базу, тому запускаємо їх по черзі
    fileParallelism: false,
  },
});
