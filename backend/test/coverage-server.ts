import { afterAll, beforeAll } from 'vitest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { startPushWorker } from '../src/lib/push/queue';

// Лише для test:coverage. Сервер, у який ходять E2E по HTTP, піднімається в процесі тесту, тож покриття бачить його
// код. Звичайний test:e2e, як і раніше, перевіряє окремо запущений src/server.ts.
const app = buildApp({ logger: false });

beforeAll(async () => {
  if (config.pushEnabled) {
    const worker = startPushWorker(app.log);
    app.addHook('onClose', () => worker.stop());
  }
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: 'localhost' });
});

afterAll(() => app.close());
