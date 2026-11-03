import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import { Prisma } from '@prisma/client';
import { config } from './config';
import { registerRateLimit, type RateLimitOptions } from './plugins/rateLimit';
import { prisma } from './db';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { classroomRoutes } from './routes/classrooms';
import { profileRoutes } from './routes/profile';
import { scheduleRoutes } from './routes/schedule';
import { substitutionRoutes } from './routes/substitutions';
import { teacherRoutes } from './routes/teachers';
import { redis } from './redis';

// Query-рядок може містити персональні дані (наприклад ?q=пошта в пошуку), тому в логах запиту лише шлях
const requestSerializers = {
  req: (req: FastifyRequest) => ({
    method: req.method,
    url: req.url.split('?')[0],
    host: req.host,
    remoteAddress: req.ip,
  }),
};

function loggerOptions(custom?: FastifyServerOptions['logger']): FastifyServerOptions['logger'] {
  if (custom === undefined) return process.env.NODE_ENV !== 'test' ? { serializers: requestSerializers } : false;
  // булеве значення чи готовий екземпляр логера лишаємо як є
  if (typeof custom !== 'object' || custom === null || 'child' in custom) return custom;
  return { ...custom, serializers: { ...custom.serializers, ...requestSerializers } };
}

// Збої залежностей (Redis, база), після яких клієнту варто повторити запит пізніше: 503, а не 500
const PRISMA_UNAVAILABLE = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

export function isDependencyUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) return PRISMA_UNAVAILABLE.has(err.code);
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; code?: string; message?: string };
  return (
    e.name === 'MaxRetriesPerRequestError' ||
    (typeof e.code === 'string' && NETWORK_CODES.has(e.code)) ||
    e.message === 'Connection is closed.' ||
    e.message === 'Command timed out' // commandTimeout ioredis (redis.ts)
  );
}

// Коди помилок клієнтських статусів, які породжує сам Fastify (клієнти читають поле error)
const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

export interface HealthChecks {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
  timeoutMs: number;
}

const defaultHealthChecks: HealthChecks = {
  database: () => prisma.$queryRaw`SELECT 1`,
  redis: () => redis.ping(),
  timeoutMs: 2000,
};

// true, якщо перевірка встигла й не впала; зовнішній збій чи завислий виклик це false (текст помилки не віддаємо)
async function healthy(check: () => Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function buildApp(
  opts: { logger?: FastifyServerOptions['logger']; rateLimit?: RateLimitOptions; health?: Partial<HealthChecks> } = {},
) {
  const health: HealthChecks = { ...defaultHealthChecks, ...opts.health };
  const app = Fastify({
    logger: loggerOptions(opts.logger),
    trustProxy: config.trustProxy,
    // Caddy передає свій id у X-Request-ID: так запис access-логу і запис API зіставляються.
    // Приймаємо лише безпечний формат, щоб через заголовок не можна було підсунути сміття в логи.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
  });

  // Єдиний формат помилок { error: КОД }. Деталі внутрішніх збоїв (текст винятків Prisma, Redis) клієнту не
  // віддаємо: вони лише в логах, а клієнт отримує requestId, за яким запис знаходиться.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status < 500) {
      const body: Record<string, unknown> = { error: CLIENT_ERROR_CODES[status] ?? 'BAD_REQUEST' };
      if (status === 429) body.retryAfterSeconds = (err as FastifyError & { retryAfterSeconds?: number }).retryAfterSeconds;
      return reply.code(status).send(body);
    }
    req.log.error({ err }, 'необроблена помилка');
    if (isDependencyUnavailable(err)) return reply.code(503).send({ error: 'TEMPORARILY_UNAVAILABLE', requestId: req.id });
    return reply.code(500).send({ error: 'INTERNAL_ERROR', requestId: req.id });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'NOT_FOUND' }));

  // Клієнт бачить id запиту й може назвати його при звернені: за ним знаходимо запис у логах
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // Порожнє тіло з content-type: application/json (типово для DELETE у мобільних клієнтів) не є помилкою.
  // Зламаний JSON, як і раніше, дає 400.
  const parseJson = app.getDefaultJsonParser('error', 'ignore');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '') return done(null, undefined);
    parseJson(req, body as string, done);
  });

  // CORS лише для веб-адмінки (CORS_ORIGINS). Авторизація йде через Bearer-заголовок, а не cookie,
  // тому credentials не потрібні. Чужі origin просто не отримують Access-Control-Allow-Origin.
  if (config.corsOrigins.length > 0) {
    app.register(cors, {
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'if-none-match', 'x-request-id'],
      exposedHeaders: ['etag', 'x-request-id', 'retry-after'],
      maxAge: 600,
    });
  }

  registerRateLimit(app, opts.rateLimit);

  // Перевірку здоров'я Docker і smoke-скрипти не лімітуємо
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // Готовність: база і Redis відповідають. /health лишається для перевірки контейнера (процес живий), а цей
  // ендпоінт для зовнішнього моніторингу: 503, коли залежність лежить, хоча процес сам працює.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    const [database, cache] = await Promise.all([
      healthy(health.database, health.timeoutMs),
      healthy(health.redis, health.timeoutMs),
    ]);
    const ok = database && cache;
    return reply
      .code(ok ? 200 : 503)
      .header('cache-control', 'no-store')
      .send({ status: ok ? 'ok' : 'degraded', checks: { database: database ? 'ok' : 'fail', redis: cache ? 'ok' : 'fail' } });
  });

  // Демо-консоль для ручного тестування в браузері. Існує лише при AUTH_MODE=fake (тестовий режим).
  if (config.fakeAuth) {
    const consoleHtml = readFileSync(new URL('./dev/console.html', import.meta.url), 'utf8');
    app.get('/dev', async (_req, reply) => reply.type('text/html; charset=utf-8').send(consoleHtml));
    app.get('/', async (_req, reply) => reply.redirect('/dev'));
  }

  app.register(authRoutes, { authPerMinute: opts.rateLimit?.authPerMinute });
  app.register(profileRoutes);
  app.register(scheduleRoutes);
  app.register(classroomRoutes);
  app.register(teacherRoutes);
  app.register(substitutionRoutes);
  app.register(adminRoutes);

  app.addHook('onClose', async () => {
    redis.disconnect();
  });

  return app;
}
