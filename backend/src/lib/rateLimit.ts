// Лічильник запитів «фіксоване вікно» у Redis: ключ = префікс + клієнт + номер вікна.
// Якщо Redis недоступний, пропускаємо запит (fail-open): краще віддати розклад, ніж «покласти» застосунок.
export type CounterStore = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function createRateLimiter(opts: {
  store: CounterStore;
  limit: number;
  windowSeconds: number;
  prefix: string;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  return async (client: string): Promise<RateDecision> => {
    const windowMs = opts.windowSeconds * 1000;
    const t = now();
    const windowNo = Math.floor(t / windowMs);
    const key = `${opts.prefix}:${client}:${windowNo}`;
    try {
      const count = await opts.store.incr(key);
      // TTL ставимо на першому запиті вікна; запас у секунду, щоб ключ не зник раніше за вікно
      if (count === 1) await opts.store.expire(key, opts.windowSeconds + 1);
      if (count <= opts.limit) return { allowed: true };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(((windowNo + 1) * windowMs - t) / 1000)) };
    } catch {
      return { allowed: true };
    }
  };
}
