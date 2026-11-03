import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { verifyAccessToken } from '../lib/tokens';
import { redis, redisUsable } from '../redis';

export interface RateLimitOptions {
  perMinute?: number;
  authPerMinute?: number;
  /** Префікс ключів у Redis: тести беруть унікальний, щоб лічильники різних прогонів не змішувались */
  nameSpace?: string;
}

// Ключ ліміту: користувач з дійсним access-токеном, інакше IP. Так студенти за спільним IP кампусу не ділять
// один ліміт на всіх, а підроблений чи прострочений токен не дає окремого лічильника.
export function rateLimitKey(req: FastifyRequest): string {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) {
    const result = verifyAccessToken(header.slice(7));
    if (result.ok) return `user:${result.userId}`;
  }
  return `ip:${req.ip}`;
}

// Вхід, refresh і вихід ділять окремий лічильник (groupId) з власним, вищим ліміту на IP. Ключ саме IP, а не загальний:
// інакше запит із дійсним Bearer-токеном рахувався б на користувача, і різні користувачі за одним IP не ділили б ліміт.
export const authRateLimit = (max: number) => ({
  max,
  timeWindow: '1 minute',
  groupId: 'auth',
  keyGenerator: (req: FastifyRequest) => `ip:${req.ip}`,
});

// Ліміт запитів у Redis (спільний для перезапусків). Якщо Redis недоступний, запити пропускаються (skipOnError),
// а не блокуються: ліміт це страховка, а не залежність, від якої має падати API.
// Викликати на кореневому екземплярі до реєстрації маршрутів (плагін fastify-plugin, діє на весь екземпляр).
export function registerRateLimit(app: FastifyInstance, opts: RateLimitOptions = {}) {
  app.register(rateLimit, {
    global: true,
    max: opts.perMinute ?? config.rateLimitPerMinute,
    timeWindow: '1 minute',
    redis,
    nameSpace: opts.nameSpace ?? 'rate-limit:',
    keyGenerator: rateLimitKey,
    // Поки Redis недоступний, ліміт не діє і не затримує запити (інакше кожен запит чекав би на збій сховища)
    allowList: () => !redisUsable(),
    skipOnError: true,
    errorResponseBuilder: (_req, context) =>
      Object.assign(new Error('RATE_LIMITED'), { statusCode: 429, retryAfterSeconds: Math.ceil(context.ttl / 1000) }),
  });
}
