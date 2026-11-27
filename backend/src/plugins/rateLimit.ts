import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { clientNetwork } from '../lib/network';
import { verifyAccessToken } from '../lib/tokens';
import { redis, redisUsable } from '../redis';

export interface RateLimitOptions {
  perMinute?: number;
  authPerMinute?: number;
  substitutionsPerMinute?: number;
  passwordPerMinute?: number;
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

// Ліміти входу за паролем, на відміну від решти, відмовляють, коли сховище лічильників не відповідає (503):
// перебір без обмеження небезпечніший за тимчасово недоступний вхід
const failClosed = { skipOnError: false, allowList: [] as string[] };

const emailOf = (req: FastifyRequest): string => {
  const email = (req.body as { email?: unknown } | null | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
};

// Вхід за паролем. Ключ «мережа + пошта»: перебір одного акаунта зупиняється швидко, а студенти за спільним IP
// кампусу не заважають одне одному. Пошта є лише в тілі запиту, тому перевірка після його розбору (preHandler).
export const passwordRateLimit = (max: number) => ({
  ...failClosed,
  max,
  timeWindow: '1 minute',
  groupId: 'password',
  hook: 'preHandler' as const,
  keyGenerator: (req: FastifyRequest) => `pw:${clientNetwork(req.ip)}:${emailOf(req)}`,
});

// Другий лічильник того ж маршруту: одна мережа не перебирає багато різних пошт
export const passwordIpRateLimit = (perAccount: number) => ({
  ...failClosed,
  max: perAccount * 10,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => `pw-ip:${clientNetwork(req.ip)}`,
});

// Третій: на сам акаунт з будь-яких адрес, інакше багато адрес разом обходили б перші два. Вікно коротке, щоб
// чужий перебір не відрізав власника від входу надовго (вхід через Microsoft цим лімітом не зачеплений)
export const passwordAccountRateLimit = (perAccount: number) => ({
  ...failClosed,
  max: perAccount * 3,
  timeWindow: '15 minutes',
  keyGenerator: (req: FastifyRequest) => `pw-account:${emailOf(req)}`,
});

// Створення замін: кожна заміна це пуш усій групі, тож без окремого ліміту староста (чи чужий скомпрометований акаунт)
// циклом «створити, скасувати, створити» засипає групу сповіщеннями. Лімітуємо тільки POST: пуш «заміну скасовано»
// іде лише тим, кому дійшов пуш про створення, тож обмеження на створення обмежує й його. Лічильник на користувача: ключ береться з глобального keyGenerator, як в імпорту.
export const substitutionRateLimit = (max: number) => ({ max, timeWindow: '1 minute' });

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
