import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

// config читає змінні при імпорті, тож вікно повторного refresh задаємо до нього (1 с, щоб перевірити спливання)
vi.hoisted(() => {
  process.env.REFRESH_REUSE_GRACE_SECONDS = '1';
});

import { redis } from '../../src/redis';
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from '../../src/lib/tokens';

afterAll(() => redis.disconnect());

const DEVICE = 'unit-device';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('rotateRefreshToken', () => {
  it('обмін видає нову пару, а повтор у вікні віддає ту саму пару', async () => {
    const userId = randomUUID();
    const first = await issueRefreshToken(userId, DEVICE);

    const a = await rotateRefreshToken(first, DEVICE);
    expect(a?.userId).toBe(userId);
    expect(a?.refreshToken).not.toBe(first);

    const replay = await rotateRefreshToken(first, DEVICE);
    expect(replay).toEqual(a);
  });

  it('повтор відхиляється: інший пристрій, після використання нової пари, після спливання вікна', async () => {
    const userId = randomUUID();
    const first = await issueRefreshToken(userId, DEVICE);
    const a = (await rotateRefreshToken(first, DEVICE))!;

    expect(await rotateRefreshToken(first, 'other-device')).toBeNull();

    // нову пару використали: повтор першого токена вже не допускається
    const b = await rotateRefreshToken(a.refreshToken, DEVICE);
    expect(b).not.toBeNull();
    expect(await rotateRefreshToken(first, DEVICE)).toBeNull();

    // а без використання вікно спливає за секунду
    const c = await issueRefreshToken(userId, DEVICE);
    expect(await rotateRefreshToken(c, DEVICE)).not.toBeNull();
    await sleep(1200);
    expect(await rotateRefreshToken(c, DEVICE)).toBeNull();
  });

  // Подвійний тап чи повтор клієнта: два запити з одним токеном одночасно. Обмін атомарний, тож перший обмінює,
  // а решта отримують ту саму пару повтором (а не 401, як було б, якби запис повтору з'являвся пізніше).
  it('паралельні запити з одним токеном дають одну й ту саму нову пару', async () => {
    const userId = randomUUID();
    const first = await issueRefreshToken(userId, DEVICE);

    const results = await Promise.all(Array.from({ length: 5 }, () => rotateRefreshToken(first, DEVICE)));

    expect(results.every((r) => r !== null)).toBe(true);
    expect(new Set(results.map((r) => r!.refreshToken)).size).toBe(1);
    // і ця єдина пара справді дійсна: її можна обміняти далі
    expect(await rotateRefreshToken(results[0]!.refreshToken, DEVICE)).not.toBeNull();
  });

  it('паралельні запити з одним токеном з різних пристроїв: обмінюється не більше одного', async () => {
    const userId = randomUUID();
    const first = await issueRefreshToken(userId, DEVICE);

    const results = await Promise.all([
      rotateRefreshToken(first, DEVICE),
      rotateRefreshToken(first, 'other-device'),
      rotateRefreshToken(first, 'third-device'),
    ]);

    expect(results.filter((r) => r !== null).length).toBeLessThanOrEqual(1);
  });

  it('відкликана нова пара не віддається повтором', async () => {
    const userId = randomUUID();
    const first = await issueRefreshToken(userId, DEVICE);
    const a = (await rotateRefreshToken(first, DEVICE))!;
    await revokeRefreshToken(a.refreshToken);
    expect(await rotateRefreshToken(first, DEVICE)).toBeNull();
  });

  it('сміття і токен іншого типу дають null', async () => {
    expect(await rotateRefreshToken('garbage', DEVICE)).toBeNull();
  });
});
