import { describe, expect, it } from 'vitest';
import { adminToken, API, authHeaders, currentMonday, emptyGroup, loginRaw, send, setupStudent } from './helpers';

type Lesson = { date: string; pairNumber: number; subgroup: number; room: string | null; subject: string };

async function week(token: string): Promise<Lesson[]> {
  const res = await fetch(`${API}/schedule/week`, { headers: authHeaders(token) });
  expect(res.status).toBe(200);
  return ((await res.json()) as { lessons: Lesson[] }).lessons;
}

describe('F3: розклад на тиждень', () => {
  it('повертає пари групи з часом, а повторний запит з ETag дає 304', async () => {
    const token = await setupStudent('f3.student@lnu.edu.ua');
    const headers = authHeaders(token);

    const first = await fetch(`${API}/schedule/week`, { headers });
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      lessons: { subject: string; start: string; pairNumber: number }[];
    };
    expect(body.lessons.length).toBeGreaterThan(0);
    const firstPair = body.lessons.find((l) => l.pairNumber === 1);
    expect(firstPair?.start).toBe('08:30');

    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const second = await fetch(`${API}/schedule/week`, {
      headers: { ...headers, 'if-none-match': etag! },
    });
    expect(second.status).toBe(304);
  });

  it('некоректна дата в запиті дає 400 INVALID_DATE, а не 500', async () => {
    const token = await setupStudent('f3.baddate@lnu.edu.ua');
    const res = await fetch(`${API}/schedule/week?date=abc`, { headers: authHeaders(token) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_DATE');
  });

  it('без токена повертає 401', async () => {
    const res = await fetch(`${API}/schedule/week`);
    expect(res.status).toBe(401);
  });

  it('користувач без групи отримує 409 GROUP_NOT_SET', async () => {
    const login = await loginRaw('nogroup@lnu.edu.ua');
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await fetch(`${API}/schedule/week`, { headers: authHeaders(accessToken) });
    expect(res.status).toBe(409);
  });

  // Критерій: пари тижня відсортовані за днем і номером пари
  it('пари відсортовані за датою, а в межах дня за номером пари', async () => {
    const lessons = await week(await setupStudent('f3.sorted@lnu.edu.ua'));
    expect(lessons.length).toBeGreaterThan(1);
    for (let i = 1; i < lessons.length; i++) {
      const prev = lessons[i - 1];
      const cur = lessons[i];
      const ordered = prev.date < cur.date || (prev.date === cur.date && prev.pairNumber <= cur.pairNumber);
      expect(ordered, `${prev.date} #${prev.pairNumber} перед ${cur.date} #${cur.pairNumber}`).toBe(true);
    }
    // Усі пари в межах поточного тижня (seed зсунуто на нього)
    const monday = currentMonday();
    const sunday = new Date(`${monday}T00:00:00Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    for (const l of lessons) {
      expect(l.date >= monday && l.date <= sunday.toISOString().slice(0, 10)).toBe(true);
    }
  });

  // Критерій: пари чужих підгруп не видно. У seed у понеділок 2-га пара: підгрупа 1 в 406/Т, підгрупа 2 в 129а/Т
  it('студент підгрупи 1 бачить свою підгрупу і спільні пари, але не підгрупу 2', async () => {
    const lessons = await week(await setupStudent('f3.sub1@lnu.edu.ua', 1));
    expect(lessons.every((l) => l.subgroup === 0 || l.subgroup === 1)).toBe(true);
    const mondayPair2 = lessons.filter((l) => l.date === currentMonday() && l.pairNumber === 2);
    expect(mondayPair2.map((l) => l.room)).toEqual(['406/Т']);
  });

  it('студент з підгрупою 0 бачить пари обох підгруп', async () => {
    const lessons = await week(await setupStudent('f3.suball@lnu.edu.ua', 0));
    const mondayPair2 = lessons.filter((l) => l.date === currentMonday() && l.pairNumber === 2);
    expect(mondayPair2.map((l) => l.room).sort()).toEqual(['129а/Т', '406/Т']);
  });

  // Критерій: «порожній тиждень» і «розклад не опубліковано» розрізняються
  it('published: true для групи з розкладом, також на порожньому тижні', async () => {
    const token = await setupStudent('f3.published@lnu.edu.ua');
    const now = (await (await fetch(`${API}/schedule/week`, { headers: authHeaders(token) })).json()) as {
      published: boolean;
      lessons: unknown[];
    };
    expect(now.published).toBe(true);
    expect(now.lessons.length).toBeGreaterThan(0);

    const past = (await (await fetch(`${API}/schedule/week?date=2020-01-06`, { headers: authHeaders(token) })).json()) as {
      published: boolean;
      lessons: unknown[];
    };
    expect(past.lessons).toEqual([]);
    expect(past.published).toBe(true);
  });

  it('published: false для групи, якій деканат ще нічого не завантажив', async () => {
    const admin = await adminToken();
    const groupId = await emptyGroup(admin, 'ПУСТО-11');
    const token = await setupStudent('f3.unpublished@lnu.edu.ua');
    expect((await send('PATCH', '/me', token, { groupId })).status).toBe(200);

    const res = await fetch(`${API}/schedule/week`, { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ published: false, lessons: [] });
  });

  // Критерій: на екрані деталей видно корпус і адресу
  it('пара з аудиторією містить корпус з адресою, пара без аудиторії дає building: null', async () => {
    const lessons = (await (
      await fetch(`${API}/schedule/week`, { headers: authHeaders(await setupStudent('f3.building@lnu.edu.ua')) })
    ).json()) as { lessons: (Lesson & { building: { code: string; name: string; address: string } | null })[] };
    const withRoom = lessons.lessons.filter((l) => l.room);
    expect(withRoom.length).toBeGreaterThan(0);
    for (const l of withRoom) {
      expect(l.building?.address, l.room!).toBeTruthy();
      expect(l.room!.endsWith(`/${l.building!.code}`)).toBe(true);
    }
    for (const l of lessons.lessons.filter((x) => !x.room)) expect(l.building).toBeNull();
  });
});
