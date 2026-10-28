import { describe, expect, it } from 'vitest';
import { createRateLimiter, type CounterStore } from '../../src/lib/rateLimit';

function memoryStore(): CounterStore & { ttl: Map<string, number> } {
  const counts = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    ttl,
    async incr(key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key)!;
    },
    async expire(key, seconds) {
      ttl.set(key, seconds);
    },
  };
}

describe('createRateLimiter', () => {
  it('пропускає до ліміту включно, а наступний запит блокує з retryAfter', async () => {
    const t = 1_000_000;
    const check = createRateLimiter({ store: memoryStore(), limit: 3, windowSeconds: 60, prefix: 'x', now: () => t });
    for (let i = 0; i < 3; i++) expect(await check('ip')).toEqual({ allowed: true });
    const blocked = await check('ip');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('рахує клієнтів окремо', async () => {
    const check = createRateLimiter({ store: memoryStore(), limit: 1, windowSeconds: 60, prefix: 'x', now: () => 0 });
    expect((await check('a')).allowed).toBe(true);
    expect((await check('b')).allowed).toBe(true);
    expect((await check('a')).allowed).toBe(false);
  });

  it('у наступному вікні лічильник починається заново', async () => {
    let t = 0;
    const check = createRateLimiter({ store: memoryStore(), limit: 1, windowSeconds: 60, prefix: 'x', now: () => t });
    expect((await check('a')).allowed).toBe(true);
    expect((await check('a')).allowed).toBe(false);
    t = 60_000;
    expect((await check('a')).allowed).toBe(true);
  });

  it('ставить TTL лише на першому запиті вікна', async () => {
    const store = memoryStore();
    const check = createRateLimiter({ store, limit: 5, windowSeconds: 60, prefix: 'x', now: () => 0 });
    await check('a');
    await check('a');
    expect([...store.ttl.values()]).toEqual([61]);
  });

  it('якщо сховище недоступне, запит проходить (fail-open)', async () => {
    const broken: CounterStore = {
      incr: async () => {
        throw new Error('redis down');
      },
      expire: async () => undefined,
    };
    const check = createRateLimiter({ store: broken, limit: 1, windowSeconds: 60, prefix: 'x' });
    expect(await check('a')).toEqual({ allowed: true });
  });
});
