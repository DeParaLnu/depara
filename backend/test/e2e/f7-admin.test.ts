import { describe, expect, it } from 'vitest';
import {
  adminToken, API, authHeaders, CORS_ORIGIN, currentMonday, emptyGroup, importLesson, loginToken, send, setupStudent, userId, weekLessons,
} from './helpers';

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('F7: ролі', () => {
  it('без токена 401, студент 403', async () => {
    const student = await loginToken('f7.plain@lnu.edu.ua');
    expect((await fetch(`${API}/admin/schedule/import`, { method: 'POST' })).status).toBe(401);
    expect((await send('POST', '/admin/schedule/import', student, {})).status).toBe(403);
    expect((await send('PATCH', `/admin/users/${await userId(student)}/role`, student, { role: 'ADMIN' })).status).toBe(403);
  });

  it('адмін призначає роль, і вона діє одразу без перевходу', async () => {
    const admin = await adminToken();
    const student = await loginToken('f7.promote@lnu.edu.ua');
    const id = await userId(student);

    const res = await send('PATCH', `/admin/users/${id}/role`, admin, { role: 'HEADMAN' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe('HEADMAN');
    const me = (await (await fetch(`${API}/me`, { headers: authHeaders(student) })).json()) as { role: string };
    expect(me.role).toBe('HEADMAN');
  });

  it('валідація: неправильна роль, не uuid, невідомий користувач, власна роль', async () => {
    const admin = await adminToken();
    const id = await userId(await loginToken('f7.valid@lnu.edu.ua'));
    expect((await send('PATCH', `/admin/users/${id}/role`, admin, { role: 'KING' })).status).toBe(400);
    expect((await send('PATCH', '/admin/users/not-a-uuid/role', admin, { role: 'STUDENT' })).status).toBe(400);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await send('PATCH', `/admin/users/${unknown}/role`, admin, { role: 'STUDENT' })).status).toBe(404);
    const res = await send('PATCH', `/admin/users/${await userId(admin)}/role`, admin, { role: 'STUDENT' });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('CANNOT_CHANGE_OWN_ROLE');
  });
});

describe('F7: пошук користувачів', () => {
  it('адмін знаходить користувача за поштою, студент не має доступу', async () => {
    const admin = await adminToken();
    const student = await loginToken('f7.findme@lnu.edu.ua');
    const res = await send('GET', '/admin/users?q=f7.findme', admin);
    expect(res.status).toBe(200);
    const users = (await res.json()) as { id: string; email: string; role: string }[];
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: 'f7.findme@lnu.edu.ua', role: 'STUDENT' });
    expect((await send('GET', '/admin/users', student)).status).toBe(403);
  });
});

describe('F7: імпорт розкладу', () => {
  it('JSON-імпорт з`являється в розкладі студента, повторний імпорт не дублює', async () => {
    const admin = await adminToken();
    const student = await setupStudent('f7.student@lnu.edu.ua');
    const subject = `E2E імпорт ${Date.now()}`;

    for (let i = 0; i < 2; i++) {
      const res = await importLesson(admin, subject);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { imported: number }).imported).toBe(1);
    }
    const found = (await weekLessons(student)).filter((l) => l.subject === subject);
    expect(found).toHaveLength(1);
  });

  it('CSV-імпорт (роздільник ; і лапки)', async () => {
    const admin = await adminToken();
    const student = await setupStudent('f7.csv@lnu.edu.ua');
    const subject = `E2E csv; "лапки" ${Date.now()}`;
    const csv = `group;date;pair;subject;type;room\nТЕСТ-31;${currentMonday()};4;"${subject.replace(/"/g, '""')}";LAB;1/Б\n`;

    const res = await fetch(`${API}/admin/schedule/import`, {
      method: 'POST',
      headers: { ...authHeaders(admin), 'content-type': 'text/csv' },
      body: csv,
    });
    expect(res.status).toBe(200);
    const lesson = (await weekLessons(student)).find((l) => l.subject === subject);
    expect(lesson).toBeTruthy();
  });

  it('некоректні дані дають 422 з переліком помилок', async () => {
    const admin = await adminToken();
    const res = await send('POST', '/admin/schedule/import', admin, {
      lessons: [{ group: 'ТЕСТ-31', date: '2026-13-45', pair: 0, subject: '' }],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('INVALID_IMPORT');
    expect(body.details.length).toBeGreaterThanOrEqual(3);
  });

  it('імпорт атомарний: невідома група відкочує й валідні пари', async () => {
    const admin = await adminToken();
    const student = await setupStudent('f7.atomic@lnu.edu.ua');
    const subject = `E2E rollback ${Date.now()}`;
    const res = await send('POST', '/admin/schedule/import', admin, {
      lessons: [
        { group: 'ТЕСТ-31', date: currentMonday(), pair: 3, subject },
        { group: 'НЕМАЄ-99', date: currentMonday(), pair: 3, subject },
      ],
    });
    expect(res.status).toBe(422);
    expect((await weekLessons(student)).some((l) => l.subject === subject)).toBe(false);
  });
});

describe('F7: призначення групи', () => {
  const groupOf = async (token: string) =>
    (await (await fetch(`${API}/me`, { headers: authHeaders(token) })).json()) as { groupId: string | null; subgroup: number };

  it('адмін призначає групу й підгрупу, і користувач одразу бачить її розклад', async () => {
    const admin = await adminToken();
    const user = await loginToken(`f7.assign.${Date.now()}@lnu.edu.ua`);
    const id = await userId(user);
    const groups = (await (await fetch(`${API}/groups`, { headers: authHeaders(admin) })).json()) as { id: string; code: string }[];
    const test31 = groups.find((g) => g.code === 'ТЕСТ-31')!;

    expect((await fetch(`${API}/schedule/week`, { headers: authHeaders(user) })).status).toBe(409);

    const res = await send('PATCH', `/admin/users/${id}/group`, admin, { groupId: test31.id, subgroup: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, groupId: test31.id, subgroup: 1 });
    expect(await groupOf(user)).toMatchObject({ groupId: test31.id, subgroup: 1 });
    expect((await weekLessons(user)).length).toBeGreaterThan(0);
  });

  it('без підгрупи вона скидається на 0', async () => {
    const admin = await adminToken();
    const user = await setupStudent('f7.resub@lnu.edu.ua', 2);
    const id = await userId(user);
    const other = await emptyGroup(admin, 'ПУСТО-12');
    const res = await send('PATCH', `/admin/users/${id}/group`, admin, { groupId: other });
    expect(res.status).toBe(200);
    expect(await groupOf(user)).toMatchObject({ groupId: other, subgroup: 0 });
  });

  it('валідація: id, група, підгрупа, невідомі користувач і група', async () => {
    const admin = await adminToken();
    const id = await userId(await loginToken('f7.assignbad@lnu.edu.ua'));
    const group = await emptyGroup(admin, 'ПУСТО-13');
    const unknown = '00000000-0000-4000-8000-000000000000';
    const code = async (res: Response) => [res.status, await errorOf(res)];

    expect(await code(await send('PATCH', '/admin/users/not-a-uuid/group', admin, { groupId: group }))).toEqual([400, 'INVALID_ID']);
    expect(await code(await send('PATCH', `/admin/users/${id}/group`, admin, {}))).toEqual([400, 'GROUP_REQUIRED']);
    expect(await code(await send('PATCH', `/admin/users/${id}/group`, admin, { groupId: 'x' }))).toEqual([400, 'INVALID_GROUP_ID']);
    expect(await code(await send('PATCH', `/admin/users/${id}/group`, admin, { groupId: group, subgroup: 3 }))).toEqual([400, 'INVALID_SUBGROUP']);
    expect(await code(await send('PATCH', `/admin/users/${unknown}/group`, admin, { groupId: group }))).toEqual([404, 'USER_NOT_FOUND']);
    expect(await code(await send('PATCH', `/admin/users/${id}/group`, admin, { groupId: unknown }))).toEqual([404, 'GROUP_NOT_FOUND']);
  });

  it('студент отримує 403, без токена 401', async () => {
    const student = await loginToken('f7.assignforbidden@lnu.edu.ua');
    const id = await userId(student);
    expect((await send('PATCH', `/admin/users/${id}/group`, student, { groupId: id })).status).toBe(403);
    const res = await fetch(`${API}/admin/users/${id}/group`, { method: 'PATCH' });
    expect(res.status).toBe(401);
  });
});

// Сервер E2E стартує з CORS_ORIGINS=http://localhost:5173 (див. README, ci.yml)
describe('F7: CORS для веб-адмінки', () => {
  it('preflight з дозволеного origin проходить, з методом PATCH і заголовком Authorization', async () => {
    const res = await fetch(`${API}/admin/users/x/role`, {
      method: 'OPTIONS',
      headers: {
        origin: CORS_ORIGIN,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(CORS_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('відповідь API для дозволеного origin містить заголовок, для чужого немає', async () => {
    const allowed = await fetch(`${API}/health`, { headers: { origin: CORS_ORIGIN } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(CORS_ORIGIN);
    const foreign = await fetch(`${API}/health`, { headers: { origin: 'https://evil.example' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });
});
