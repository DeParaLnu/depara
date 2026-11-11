import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp, isDependencyUnavailable } from '../../src/app';
import { signAccessToken } from '../../src/lib/tokens';

// Роутер без запуску сервера (inject). Додаткові маршрути лише для перевірки обробника помилок.
function appWith(opts: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp(opts);
  // Через register, а не напряму: плагін лімітів діє лише на маршрути, додані після нього в черзі реєстрації
  app.register(async (i) => {
    i.get('/__boom/generic', async () => {
      throw new Error('secret internal detail: password=hunter2 at prisma.user.findMany');
    });
    i.get('/__boom/redis', async () => {
      throw Object.assign(new Error('Reached the max retries per request limit (which is 2)'), { name: 'MaxRetriesPerRequestError' });
    });
    i.get('/__boom/db', async () => {
      throw new Prisma.PrismaClientKnownRequestError("Can't reach database server at db:5432", { code: 'P1001', clientVersion: 'x' });
    });
    i.get('/__boom/prisma-other', async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', { code: 'P2002', clientVersion: 'x' });
    });
    i.get('/__ok', async () => ({ ok: true }));
  });
  return app;
}

const apps: ReturnType<typeof buildApp>[] = [];
const make = (opts?: Parameters<typeof buildApp>[0]) => {
  const app = appWith(opts);
  apps.push(app);
  return app;
};
afterAll(() => Promise.all(apps.map((a) => a.close())));

describe('обробник помилок', () => {
  it('500: клієнт бачить лише INTERNAL_ERROR і requestId, без тексту винятку', async () => {
    const res = await make().inject('/__boom/generic');
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body).toEqual({ error: 'INTERNAL_ERROR', requestId: expect.any(String) });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('prisma');
    expect(res.headers['x-request-id']).toBe(body.requestId);
  });

  it.each([['/__boom/redis'], ['/__boom/db']])('недоступна залежність (%s) дає 503 TEMPORARILY_UNAVAILABLE', async (path) => {
    const res = await make().inject(path);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'TEMPORARILY_UNAVAILABLE', requestId: expect.any(String) });
    expect(res.body).not.toContain('5432');
  });

  it('інші помилки Prisma лишаються 500 (не плутаємо з тимчасовою недоступністю)', async () => {
    const res = await make().inject('/__boom/prisma-other');
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('email');
  });

  it('зламаний JSON дає 400 BAD_REQUEST, невідомий маршрут 404 NOT_FOUND', async () => {
    const app = make();
    const bad = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { 'content-type': 'application/json' }, payload: '{not json' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'BAD_REQUEST' });

    const missing = await app.inject('/нема-такого');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('isDependencyUnavailable розпізнає мережеві помилки й не реагує на звичайні', () => {
    expect(isDependencyUnavailable(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isDependencyUnavailable(new Error('Connection is closed.'))).toBe(true);
    expect(isDependencyUnavailable(new Error('Command timed out'))).toBe(true);
    expect(isDependencyUnavailable(new Error('boom'))).toBe(false);
    expect(isDependencyUnavailable(null)).toBe(false);
  });
});

describe('ліміти запитів', () => {
  const ns = () => `rl-test-${randomUUID()}:`;

  it('вхід і refresh: після ліміту 429 RATE_LIMITED з Retry-After, а /health не лімітується', async () => {
    const app = make({ rateLimit: { perMinute: 1000, authPerMinute: 3, nameSpace: ns() } });
    const post = () => app.inject({ method: 'POST', url: '/auth/refresh', payload: {} });

    for (let i = 0; i < 3; i++) expect((await post()).statusCode).toBe(400);
    const limited = await post();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) expect((await app.inject('/health')).statusCode).toBe(200);
  });

  it('вхід і звичайні запити мають окремі лічильники', async () => {
    const app = make({ rateLimit: { perMinute: 1000, authPerMinute: 2, nameSpace: ns() } });
    for (let i = 0; i < 3; i++) await app.inject({ method: 'POST', url: '/auth/refresh', payload: {} });
    expect((await app.inject('/__ok')).statusCode).toBe(200);
  });

  it('звичайні запити рахуються на користувача, а не на спільний IP', async () => {
    const app = make({ rateLimit: { perMinute: 3, authPerMinute: 100, nameSpace: ns() } });
    const as = (userId: string) => ({ authorization: `Bearer ${signAccessToken(userId)}` });
    const a = randomUUID();
    const b = randomUUID();

    for (let i = 0; i < 3; i++) expect((await app.inject({ url: '/__ok', headers: as(a) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/__ok', headers: as(a) })).statusCode).toBe(429);
    // той самий IP, інший користувач: свій лічильник
    expect((await app.inject({ url: '/__ok', headers: as(b) })).statusCode).toBe(200);
  });

  it('заміни: створення має суворий ліміт на користувача (кожна заміна це пуш усій групі)', async () => {
    const app = make({ rateLimit: { perMinute: 1000, authPerMinute: 100, substitutionsPerMinute: 2, nameSpace: ns() } });
    const as = (userId: string) => ({ authorization: `Bearer ${signAccessToken(userId)}` });
    const post = (userId: string) => app.inject({ method: 'POST', url: '/substitutions', headers: as(userId), payload: {} });
    const a = randomUUID();
    const b = randomUUID();

    // користувача немає в базі, тож запит доходить до перевірки ролі (401): лічильник рахує і такі запити
    expect((await post(a)).statusCode).toBe(401);
    expect((await post(a)).statusCode).toBe(401);
    const limited = await post(a);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) });
    // інший користувач має власний лічильник
    expect((await post(b)).statusCode).toBe(401);
    // скасування заміни пуш не шле, тому його ліміт замін не зачіпає, як і решту маршрутів
    const del = await app.inject({ method: 'DELETE', url: `/substitutions/${randomUUID()}`, headers: as(a) });
    expect(del.statusCode).toBe(401);
    expect((await app.inject({ url: '/__ok', headers: as(a) })).statusCode).toBe(200);
  });

  it('без токена, або з підробленим, ліміт рахується на IP', async () => {
    const app = make({ rateLimit: { perMinute: 2, authPerMinute: 100, nameSpace: ns() } });
    const fake = { authorization: 'Bearer not-a-real-token' };
    expect((await app.inject('/__ok')).statusCode).toBe(200);
    expect((await app.inject({ url: '/__ok', headers: fake })).statusCode).toBe(200);
    expect((await app.inject('/__ok')).statusCode).toBe(429);
  });
});

describe('ліміт входу: ключ на IP', () => {
  it('вхід, refresh і вихід рахуються на IP, навіть з дійсним Bearer-токеном: різні користувачі за одним IP ділять лічильник', async () => {
    const app = appWith({ rateLimit: { perMinute: 1000, authPerMinute: 2, nameSpace: `rl-test-${randomUUID()}:` } });
    apps.push(app);
    const as = (userId: string) => ({ authorization: `Bearer ${signAccessToken(userId)}` });
    const post = (userId: string) => app.inject({ method: 'POST', url: '/auth/refresh', headers: as(userId), payload: {} });

    expect((await post(randomUUID())).statusCode).toBe(400);
    expect((await post(randomUUID())).statusCode).toBe(400);
    // третій запит від ще одного користувача з того самого IP: ліміт IP вичерпано
    expect((await post(randomUUID())).statusCode).toBe(429);
  });
});

describe('GET /health/ready', () => {
  const ok = async () => 1;
  const boom = async () => {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
  };
  const hang = () => new Promise<never>(() => {});

  it('усе справне: 200, без кешування', async () => {
    const app = make({ health: { database: ok, redis: ok } });
    const res = await app.inject('/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['база', { database: boom, redis: ok }, { database: 'fail', redis: 'ok' }],
    ['Redis', { database: ok, redis: boom }, { database: 'ok', redis: 'fail' }],
    ['обидві', { database: boom, redis: boom }, { database: 'fail', redis: 'fail' }],
  ])('падіння: %s дає 503 degraded без тексту помилки', async (_name, health, checks) => {
    const res = await make({ health }).inject('/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('5432');
  });

  it('завислий виклик не підвішує перевірку: 503 за таймаутом', async () => {
    const started = Date.now();
    const res = await make({ health: { database: ok, redis: hang, timeoutMs: 100 } }).inject('/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: 'ok', redis: 'fail' });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('/health лишається простим і не залежить від залежностей', async () => {
    const res = await make({ health: { database: boom, redis: boom } }).inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
