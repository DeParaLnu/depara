import { Redis } from 'ioredis';
import { config } from './config';

// Коротка деградація замість довгого очікування, коли Redis недоступний: команда падає за ~1 с (потім API відповідає 503
// або пропускає ліміт), а не за 10+ с через наростаючий backoff ioredis за замовчуванням.
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  connectTimeout: 1000,
  commandTimeout: 1500,
  retryStrategy: (times) => Math.min(times * 100, 1000),
});

// Без обробника ioredis пише «Unhandled error event» на кожну спробу. Логуємо не частіше, ніж раз на 30 с.
let lastErrorLog = 0;
redis.on('error', (err) => {
  if (Date.now() - lastErrorLog < 30_000) return;
  lastErrorLog = Date.now();
  console.error(`Redis недоступний: ${err.message}`);
});

// Redis справний або ще підключається (lazyConnect: стан wait до першої команди). reconnecting/close/end = збій.
export const redisUsable = (): boolean => ['wait', 'connecting', 'connect', 'ready'].includes(redis.status);
