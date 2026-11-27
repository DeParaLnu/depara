import { defineConfig } from 'vitest/config';

// npm run test:coverage: ті самі тести, але з покриттям коду src/. Потрібні тестова база з seed і Redis, як для
// test:e2e; окремо запускати сервер не треба (див. test/coverage-server.ts). Порт 3000 має бути вільний.
export default defineConfig({
  test: {
    testTimeout: 15000,
    // Сценарії ходять в одну спільну базу й один порт, тому по черзі
    fileParallelism: false,
    maxWorkers: 1,
    projects: [
      { extends: true, test: { name: 'e2e', include: ['test/e2e/**/*.test.ts'], setupFiles: ['test/coverage-server.ts'] } },
      { extends: true, test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      // усі файли src/, також ті, яких не торкнувся жоден тест: інакше відсоток був би завищений
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage/report',
    },
  },
});
