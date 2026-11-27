import { afterAll, describe, expect, it, vi } from 'vitest';

// Redis недоступний: ліміти перебору не діють, а сесію видати нікуди
vi.mock('../../src/redis', async (original) => ({
  ...(await original<typeof import('../../src/redis')>()),
  redisUsable: () => false,
}));

import { buildApp } from '../../src/app';

const app = buildApp();
afterAll(() => app.close());

describe('вхід за паролем без Redis', () => {
  it('відповідає 503, не перевіряючи пароль, щоб відповідь не підказувала, чи він правильний', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'anyone@lnu.edu.ua', password: 'example-password', deviceId: 'd' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'TEMPORARILY_UNAVAILABLE' });
  });
});
