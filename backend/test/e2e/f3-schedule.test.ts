import { describe, expect, it } from 'vitest';
import { API, authHeaders, currentMonday, loginRaw, setupStudent } from './helpers';

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
});
