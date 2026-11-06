import { buildApp } from './app';
import { config } from './config';
import { startPushWorker } from './lib/push/queue';

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

// Воркер пушів (F8) у тому ж процесі: бекенд працює одним екземпляром
if (config.pushEnabled) {
  const worker = startPushWorker(app.log);
  app.addHook('onClose', () => worker.stop());
}

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
