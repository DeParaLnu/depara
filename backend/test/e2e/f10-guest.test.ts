import { describe, expect, it } from 'vitest';
import { API, currentMonday } from './helpers';

type Group = { id: string; code: string; course: number; faculty: string };
type Lesson = { date: string; pairNumber: number; subgroup: number; subject: string };

// F10: гість без входу бачить групи, розклад і аудиторії. Без Authorization-заголовка.
async function testGroup(): Promise<Group> {
  const res = await fetch(`${API}/public/groups`);
  expect(res.status).toBe(200);
  const group = ((await res.json()) as Group[]).find((g) => g.code === 'ТЕСТ-31');
  if (!group) throw new Error('Немає групи ТЕСТ-31: чи виконано npm run seed?');
  return group;
}

describe('F10: гостьовий режим (публічні ендпоінти)', () => {
  it('список груп доступний без токена', async () => {
    const groups = await (await fetch(`${API}/public/groups`)).json();
    expect(Array.isArray(groups)).toBe(true);
    expect((groups as Group[]).length).toBeGreaterThan(0);
    expect((groups as Group[])[0]).toHaveProperty('faculty');
  });

  it('розклад тижня за groupId без токена, повторний запит з ETag дає 304', async () => {
    const group = await testGroup();
    const url = `${API}/public/schedule/week?groupId=${group.id}&date=${currentMonday()}`;
    const first = await fetch(url);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { published: boolean; lessons: Lesson[] };
    expect(body.published).toBe(true);
    expect(body.lessons.length).toBeGreaterThan(0);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect((await fetch(url, { headers: { 'if-none-match': etag! } })).status).toBe(304);
  });

  it('збігається з розкладом авторизованого студента тієї ж групи', async () => {
    const { setupStudent, authHeaders } = await import('./helpers');
    const token = await setupStudent('f10.same@lnu.edu.ua', 1);
    const group = await testGroup();
    const date = currentMonday();
    const authed = await (await fetch(`${API}/schedule/week?date=${date}`, { headers: authHeaders(token) })).json();
    const guest = await (await fetch(`${API}/public/schedule/week?groupId=${group.id}&subgroup=1&date=${date}`)).json();
    expect(guest).toEqual(authed);
  });

  it('підгрупа фільтрує пари: підгрупа 1 не бачить пар підгрупи 2', async () => {
    const group = await testGroup();
    const date = currentMonday();
    const res = await fetch(`${API}/public/schedule/week?groupId=${group.id}&subgroup=1&date=${date}`);
    const lessons = ((await res.json()) as { lessons: Lesson[] }).lessons;
    expect(lessons.every((l) => l.subgroup === 0 || l.subgroup === 1)).toBe(true);
  });

  it('некоректні параметри дають 400, а не 500', async () => {
    const group = await testGroup();
    const get = async (qs: string) => fetch(`${API}/public/schedule/week?${qs}`);
    const code = async (r: Response) => ((await r.json()) as { error: string }).error;

    const noGroup = await get('');
    expect(noGroup.status).toBe(400);
    expect(await code(noGroup)).toBe('INVALID_GROUP_ID');
    expect(await code(await get('groupId=abc'))).toBe('INVALID_GROUP_ID');
    expect(await code(await get(`groupId=${group.id}&groupId=${group.id}`))).toBe('INVALID_GROUP_ID');
    expect(await code(await get(`groupId=${group.id}&subgroup=3`))).toBe('INVALID_SUBGROUP');
    expect(await code(await get(`groupId=${group.id}&subgroup=x`))).toBe('INVALID_SUBGROUP');
    expect(await code(await get(`groupId=${group.id}&date=2026-13-45`))).toBe('INVALID_DATE');
  });

  it('невідома група дає 404 GROUP_NOT_FOUND', async () => {
    const res = await fetch(`${API}/public/schedule/week?groupId=00000000-0000-4000-8000-000000000000`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('GROUP_NOT_FOUND');
  });

  it('пошук аудиторій працює без токена', async () => {
    const res = await fetch(`${API}/public/classrooms?q=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('закриті ендпоінти лишаються закритими: профіль, заміни, викладачі, звичайний розклад', async () => {
    for (const path of ['/me', '/schedule/week', '/groups', '/classrooms', '/teachers']) {
      expect((await fetch(`${API}${path}`)).status, path).toBe(401);
    }
    const patch = await fetch(`${API}/me`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(patch.status).toBe(401);
    // публічного варіанта у викладачів і замін немає
    expect((await fetch(`${API}/public/teachers`)).status).toBe(404);
    expect((await fetch(`${API}/public/me`)).status).toBe(404);
  });
});
