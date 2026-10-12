import { describe, expect, it } from 'vitest';
import {
  adminToken, API, authHeaders, currentMonday, importLesson, loginToken, send, setupStudent, userId, weekLessons,
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
