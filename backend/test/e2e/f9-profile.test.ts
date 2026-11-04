import { describe, expect, it } from 'vitest';
import {
  adminToken, API, authHeaders, DEVICE, emptyGroup, importLesson, loginRaw, postJson, send, setupStudent, userId, weekLessons,
} from './helpers';

const run = Date.now();
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

async function loginFull(email: string) {
  const res = await loginRaw(email);
  expect(res.status).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string; needsOnboarding: boolean; user: { id: string; role: string } };
}

type Me = { groupId: string | null; subgroup: number; reminderMinutes: number; notifySubstitutions: boolean };
const me = async (token: string) => (await (await fetch(`${API}/me`, { headers: authHeaders(token) })).json()) as Me;

describe('F9: налаштування профілю (PATCH /me)', () => {
  it('новий акаунт: нагадування вимкнено, сповіщення про заміни увімкнено', async () => {
    const { accessToken } = await loginFull(`f9.defaults.${run}@lnu.edu.ua`);
    expect(await me(accessToken)).toMatchObject({ reminderMinutes: 0, notifySubstitutions: true });
  });

  it('нагадування й перемикач сповіщень зберігаються, решта профілю не змінюється', async () => {
    const token = await setupStudent(`f9.settings.${run}@lnu.edu.ua`, 2);
    const before = await me(token);

    const res = await send('PATCH', '/me', token, { reminderMinutes: 10, notifySubstitutions: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Me;
    expect(body).toMatchObject({ reminderMinutes: 10, notifySubstitutions: false, groupId: before.groupId, subgroup: 2 });
    expect(await me(token)).toEqual(body); // відповідь як у GET /me
  });

  it('лише підгрупа змінюється без групи і одразу змінює розклад', async () => {
    const token = await setupStudent(`f9.subgroup.${run}@lnu.edu.ua`, 1);
    const groupId = (await me(token)).groupId;
    expect((await send('PATCH', '/me', token, { subgroup: 2 })).status).toBe(200);
    expect(await me(token)).toMatchObject({ groupId, subgroup: 2 });
  });

  it('нова група без підгрупи скидає підгрупу на 0', async () => {
    const token = await setupStudent(`f9.regroup.${run}@lnu.edu.ua`, 2);
    const other = await emptyGroup(await adminToken(), `F9-${run}`);
    expect((await send('PATCH', '/me', token, { groupId: other })).status).toBe(200);
    expect(await me(token)).toMatchObject({ groupId: other, subgroup: 0 });
  });

  it('некоректні значення дають 400 з кодом і нічого не змінюють', async () => {
    const token = await setupStudent(`f9.invalid.${run}@lnu.edu.ua`);
    const cases: [unknown, string][] = [
      [{}, 'NOTHING_TO_UPDATE'],
      [{ reminderMinutes: 5 }, 'INVALID_REMINDER_MINUTES'],
      [{ notifySubstitutions: 'так' }, 'INVALID_NOTIFY_SUBSTITUTIONS'],
      [{ subgroup: 3 }, 'INVALID_SUBGROUP'],
      [{ groupId: null }, 'GROUP_REQUIRED'],
      // одне некоректне поле відхиляє весь запит, навіть коли інші коректні
      [{ reminderMinutes: 15, subgroup: 7 }, 'INVALID_SUBGROUP'],
    ];
    for (const [body, error] of cases) {
      const res = await send('PATCH', '/me', token, body);
      expect([res.status, await errorOf(res)]).toEqual([400, error]);
    }
    expect(await me(token)).toMatchObject({ reminderMinutes: 0, subgroup: 0, notifySubstitutions: true });
  });

  it('підгрупа без вибраної групи це GROUP_REQUIRED', async () => {
    const { accessToken } = await loginFull(`f9.nogroup.${run}@lnu.edu.ua`);
    const res = await send('PATCH', '/me', accessToken, { subgroup: 1 });
    expect([res.status, await errorOf(res)]).toEqual([400, 'GROUP_REQUIRED']);
    // а налаштування сповіщень до онбордингу змінювати можна
    expect((await send('PATCH', '/me', accessToken, { reminderMinutes: 15 })).status).toBe(200);
  });
});

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
