import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminToken, API, emptyGroup, loginToken, send, setupStudent, uniqueSlot, userId, weekLessons } from './helpers';

// Підставний Expo Push: сервер E2E запущено з EXPO_PUSH_URL на нього (див. ci.yml). Токени з «GONE» відповідають
// DeviceNotRegistered, перший запит з «FLAKY» отримує 503 (тимчасовий збій, має бути повтор).
const PUSH_URL = new URL(process.env.EXPO_PUSH_URL ?? 'http://localhost:4010/push');
type Pushed = { to: string; title: string; body: string; data: { lessonId: string; type: string } };
const received: Pushed[] = [];
let flakyFailed = false;
let stub: Server;

beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const messages = JSON.parse(raw) as Pushed[];
      if (!flakyFailed && messages.some((m) => m.to === token('FLAKY'))) {
        flakyFailed = true;
        res.writeHead(503).end();
        return;
      }
      received.push(...messages);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        data: messages.map((m) => (m.to.includes('GONE')
          ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: 'ticket' })),
      }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(Number(PUSH_URL.port), resolve));
});
afterAll(() => new Promise<void>((resolve) => stub.close(() => resolve())));

const run = Date.now();
const token = (name: string) => `ExponentPushToken[e2e-${name}-${run}]`;
const register = (access: string, t: string) => send('POST', '/me/push-token', access, { token: t });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Пуші про пару lessonId, що дійшли до Expo: чекаємо, поки прийде очікуване, і ще трохи, щоб зайве теж встигло прийти
async function pushesFor(lessonId: string, expected: string[], timeoutMs = 10_000): Promise<Pushed[]> {
  const started = Date.now();
  // лише токени цього запуску: локально в групі лишаються користувачі з попередніх запусків
  const mine = () => received.filter((m) => m.data?.lessonId === lessonId && m.to.endsWith(`-${run}]`));
  while (Date.now() - started < timeoutMs && !expected.every((t) => mine().some((m) => m.to === t))) await sleep(200);
  await sleep(1500);
  return mine();
}

async function importLessonFor(admin: string, subject: string, subgroup: number) {
  const slot = uniqueSlot(2);
  const res = await send('POST', '/admin/schedule/import', admin, {
    faculties: [{ name: 'Тестовий факультет', short_name: 'ТФ' }],
    groups: [{ code: 'ТЕСТ-31', course: 3, faculty: 'ТФ' }],
    lessons: [{ group: 'ТЕСТ-31', date: slot.date, pair: slot.pair, subject, type: 'PRACTICE', subgroup }],
  });
  expect(res.status).toBe(200);
  return slot;
}

async function headman(admin: string, name: string) {
  const t = await setupStudent(`f8.${name}.${run}@lnu.edu.ua`);
  expect((await send('PATCH', `/admin/users/${await userId(t)}/role`, admin, { role: 'HEADMAN' })).status).toBe(200);
  return t;
}

describe('F8: токен пристрою', () => {
  it('без входу 401, некоректний токен 400, коректний 204; видалення ідемпотентне', async () => {
    const res = await fetch(`${API}/me/push-token`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token('anon') }),
    });
    expect(res.status).toBe(401);
    const access = await loginToken(`f8.token.${run}@lnu.edu.ua`);
    for (const bad of [{}, { token: 'abc' }, { token: 'fcm:123' }]) {
      const r = await send('POST', '/me/push-token', access, bad);
      expect([r.status, ((await r.json()) as { error: string }).error]).toEqual([400, 'INVALID_PUSH_TOKEN']);
    }
    expect((await register(access, token('ok'))).status).toBe(204);
    expect((await register(access, token('ok'))).status).toBe(204); // повторна реєстрація не помилка
    expect((await send('DELETE', '/me/push-token', access, { token: token('ok') })).status).toBe(204);
    expect((await send('DELETE', '/me/push-token', access, { token: token('ok') })).status).toBe(204);
  });
});

describe('F8: пуш про заміну', () => {
  it('йде студентам групи з урахуванням підгрупи й перемикача, але не автору і не іншій групі', async () => {
    const admin = await adminToken();
    const head = await headman(admin, 'head');
    const sub1 = await setupStudent(`f8.sub1.${run}@lnu.edu.ua`, 1);
    const sub2 = await setupStudent(`f8.sub2.${run}@lnu.edu.ua`, 2);
    const all = await setupStudent(`f8.all.${run}@lnu.edu.ua`, 0);
    const off = await setupStudent(`f8.off.${run}@lnu.edu.ua`, 0);
    const left = await setupStudent(`f8.left.${run}@lnu.edu.ua`, 0);
    const other = await setupStudent(`f8.other.${run}@lnu.edu.ua`, 0);
    expect((await send('PATCH', '/me', off, { notifySubstitutions: false })).status).toBe(200);
    expect((await send('PATCH', '/me', other, { groupId: await emptyGroup(admin, `F8-${run}`) })).status).toBe(200);

    for (const [t, name] of [[head, 'head'], [sub2, 'sub2'], [all, 'all'], [off, 'off'], [left, 'left'], [other, 'other']] as const) {
      expect((await register(t, token(name))).status).toBe(204);
    }
    // пристрій перейшов від студента підгрупи 2 до студента підгрупи 1: пуш іде новому власнику
    expect((await register(sub2, token('moved'))).status).toBe(204);
    expect((await register(sub1, token('moved'))).status).toBe(204);
    // вийшов з акаунта: токен прибрано
    expect((await send('DELETE', '/me/push-token', left, { token: token('left') })).status).toBe(204);

    const subject = `E2E пуш ${run}`;
    const slot = await importLessonFor(admin, subject, 1);
    const lesson = (await weekLessons(head, slot.date)).find((l) => l.date === slot.date && l.pairNumber === slot.pair)!;
    expect((await send('POST', '/substitutions', head, { lessonId: lesson.id, kind: 'CANCELLED', comment: 'Хвороба' })).status).toBe(201);

    const pushes = await pushesFor(lesson.id, [token('moved'), token('all')]);
    expect(pushes.map((p) => p.to).sort()).toEqual([token('all'), token('moved')].sort());
    expect(pushes[0].title).toBe(`Скасовано: ${subject}`);
    expect(pushes[0].body).toContain('пари не буде. Хвороба');
    expect(pushes[0].data).toMatchObject({ type: 'substitution', lessonId: lesson.id });
  });

  it('мертвий токен видаляється, а тимчасовий збій Expo повторюється', async () => {
    const admin = await adminToken();
    const head = await headman(admin, 'head2');
    const gone = await setupStudent(`f8.gone.${run}@lnu.edu.ua`);
    const flaky = await setupStudent(`f8.flaky.${run}@lnu.edu.ua`);
    expect((await register(gone, token('GONE'))).status).toBe(204);
    expect((await register(flaky, token('FLAKY'))).status).toBe(204);

    const first = await importLessonFor(admin, `E2E мертвий токен ${run}`, 0);
    const lesson1 = (await weekLessons(head, first.date)).find((l) => l.date === first.date && l.pairNumber === first.pair)!;
    expect((await send('POST', '/substitutions', head, { lessonId: lesson1.id, kind: 'CANCELLED' })).status).toBe(201);
    const pushes1 = await pushesFor(lesson1.id, [token('GONE'), token('FLAKY')], 15_000);
    expect(flakyFailed).toBe(true);
    expect(pushes1.map((p) => p.to)).toContain(token('FLAKY')); // дійшов після повтору

    const second = await importLessonFor(admin, `E2E після видалення ${run}`, 0);
    const lesson2 = (await weekLessons(head, second.date)).find((l) => l.date === second.date && l.pairNumber === second.pair)!;
    expect((await send('POST', '/substitutions', head, { lessonId: lesson2.id, kind: 'CANCELLED' })).status).toBe(201);
    const pushes2 = await pushesFor(lesson2.id, [token('FLAKY')]);
    expect(pushes2.map((p) => p.to)).not.toContain(token('GONE'));
  });
});
