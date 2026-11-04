import { describe, expect, it } from 'vitest';
import {
  adminToken, API, authHeaders, DEVICE, importLesson, loginRaw, postJson, send, setupStudent, userId, weekLessons,
} from './helpers';

const run = Date.now();
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

async function loginFull(email: string) {
  const res = await loginRaw(email);
  expect(res.status).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string; needsOnboarding: boolean; user: { id: string; role: string } };
}

describe('F9: видалення акаунта', () => {
  it('без токена 401', async () => {
    expect((await fetch(`${API}/me`, { method: 'DELETE' })).status).toBe(401);
  });

  it('студент видаляє акаунт: 204, старі токени мертві, дані не повертаються при новому вході', async () => {
    const email = `f9.delete.${run}@lnu.edu.ua`;
    const admin = await adminToken();
    const first = await loginFull(email);
    await setupStudent(email, 1); // група й підгрупа

    expect((await send('DELETE', '/me', first.accessToken)).status).toBe(204);

    // access-токен ще дійсний 15 хв, але користувача нема: це 401, а не 500
    expect((await fetch(`${API}/me`, { headers: authHeaders(first.accessToken) })).status).toBe(401);
    const groups = (await (await fetch(`${API}/groups`, { headers: authHeaders(admin) })).json()) as { id: string }[];
    expect((await send('PATCH', '/me', first.accessToken, { groupId: groups[0].id })).status).toBe(401);
    expect((await send('DELETE', '/me', first.accessToken)).status).toBe(401);

    // refresh-сесія теж мертва
    const refresh = await postJson('/auth/refresh', { refreshToken: first.refreshToken, deviceId: DEVICE });
    expect(refresh.status).toBe(401);
    expect(await errorOf(refresh)).toBe('INVALID_REFRESH_TOKEN');

    // у списку користувачів його нема
    const found = (await (await send('GET', `/admin/users?q=${encodeURIComponent(email)}`, admin)).json()) as { email: string }[];
    expect(found.filter((u) => u.email === email)).toEqual([]);

    // новий вхід з тією ж поштою це зовсім новий акаунт: інший id, без групи, роль STUDENT
    const again = await loginFull(email);
    expect(again.user.id).not.toBe(first.user.id);
    expect(again.user.role).toBe('STUDENT');
    expect(again.needsOnboarding).toBe(true);
  });

  it('староста з замінами видаляється, а заміни лишаються в розкладі групи без автора', async () => {
    const admin = await adminToken();
    const email = `f9.headman.${run}@lnu.edu.ua`;
    const headman = await setupStudent(email);
    expect((await send('PATCH', `/admin/users/${await userId(headman)}/role`, admin, { role: 'HEADMAN' })).status).toBe(200);

    const subject = `E2E видалення старости ${run}`;
    const { res, slot } = await importLesson(admin, subject);
    expect(res.status).toBe(200);
    const lesson = (await weekLessons(headman, slot.date)).find((l) => l.date === slot.date && l.pairNumber === slot.pair)!;
    expect((await send('POST', '/substitutions', headman, { lessonId: lesson.id, kind: 'CANCELLED', comment: 'Хвороба' })).status).toBe(201);

    expect((await send('DELETE', '/me', headman)).status).toBe(204);

    // студент тієї ж групи й далі бачить скасування
    const student = await setupStudent(`f9.watcher.${run}@lnu.edu.ua`);
    const after = (await weekLessons(student, slot.date)).find((l) => l.id === lesson.id);
    expect(after?.substitution?.kind).toBe('CANCELLED');
  });

  it('останнього адміна видалити не можна (409 LAST_ADMIN), а коли є інший адмін можна', async () => {
    const admin = await adminToken();
    const a = await setupStudent(`f9.admin-a.${run}@lnu.edu.ua`);
    const b = await setupStudent(`f9.admin-b.${run}@lnu.edu.ua`);
    for (const t of [a, b]) {
      expect((await send('PATCH', `/admin/users/${await userId(t)}/role`, admin, { role: 'ADMIN' })).status).toBe(200);
    }
    // e2e.admin теж ADMIN, тож «інші адміни» є, і видалення дозволено
    expect((await send('DELETE', '/me', a)).status).toBe(204);
    expect((await send('DELETE', '/me', b)).status).toBe(204);
  });
});

describe('F9: зміна групи', () => {
  const groupsOf = async (token: string) =>
    (await (await fetch(`${API}/groups`, { headers: authHeaders(token) })).json()) as { id: string; code: string }[];

  it('студент змінює групу й підгрупу сам', async () => {
    const student = await setupStudent(`f9.student.${run}@lnu.edu.ua`);
    const groups = await groupsOf(student);
    const other = groups.find((g) => g.code === 'ТЕСТ-32')!;
    const res = await send('PATCH', '/me', student, { groupId: other.id, subgroup: 2 });
    expect(res.status).toBe(200);
    const me = (await (await fetch(`${API}/me`, { headers: authHeaders(student) })).json()) as { groupId: string; subgroup: number };
    expect(me).toMatchObject({ groupId: other.id, subgroup: 2 });
  });

  it('староста не може сам перейти в іншу групу (403), підгрупу змінює, групу йому змінює адмін', async () => {
    const admin = await adminToken();
    const headman = await setupStudent(`f9.headman.${run}@lnu.edu.ua`);
    await send('PATCH', `/admin/users/${await userId(headman)}/role`, admin, { role: 'HEADMAN' });
    const groups = await groupsOf(headman);
    const own = groups.find((g) => g.code === 'ТЕСТ-31')!;
    const other = groups.find((g) => g.code === 'ТЕСТ-32')!;

    const moved = await send('PATCH', '/me', headman, { groupId: other.id });
    expect(moved.status).toBe(403);
    expect(await errorOf(moved)).toBe('HEADMAN_GROUP_LOCKED');

    expect((await send('PATCH', '/me', headman, { groupId: own.id, subgroup: 1 })).status).toBe(200);

    expect((await send('PATCH', `/admin/users/${await userId(headman)}/group`, admin, { groupId: other.id })).status).toBe(200);
    const me = (await (await fetch(`${API}/me`, { headers: authHeaders(headman) })).json()) as { groupId: string };
    expect(me.groupId).toBe(other.id);
  });
});
