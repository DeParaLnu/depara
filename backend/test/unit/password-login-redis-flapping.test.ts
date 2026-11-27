import { afterAll, describe, expect, it, vi } from 'vitest';

// Redis «перепідключається»: клієнт вважається справним, але кожна команда падає. Саме так виглядає початок збою
vi.mock('../../src/redis', async () => {
  const { Redis } = await import('ioredis');
  const redis = new Redis('redis://127.0.0.1:1', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 200,
    commandTimeout: 300,
    retryStrategy: () => 50,
  });
  redis.on('error', () => {});
  return { redis, redisUsable: () => true };
});

import { buildApp } from '../../src/app';

const app = buildApp();
afterAll(() => app.close());

describe('вхід за паролем, коли лічильники лімітів не працюють', () => {
  it('відмовляє з 503, а не перевіряє пароль без обмеження спроб', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'anyone@lnu.edu.ua', password: 'example-password', deviceId: 'd' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'TEMPORARILY_UNAVAILABLE' });
  });
});
