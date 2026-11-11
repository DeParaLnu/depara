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

// Зупинка за сигналом (docker stop, деплой): дочекатись запитів, що виконуються, зупинити воркер пушів і закрити
// зʼєднання. Без цього SIGTERM обривав би запити посеред виконання. Docker дає на зупинку 10 с, тож запобіжник на 8 с
// виходить сам, а не чекає на SIGKILL.
const FORCE_EXIT_MS = 8_000;
let closing = false;

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'зупинка сервера');
  setTimeout(() => {
    app.log.error('зупинка затягнулась, примусовий вихід');
    process.exit(1);
  }, FORCE_EXIT_MS).unref();
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void shutdown(signal));
