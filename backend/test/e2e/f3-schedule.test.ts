import { describe, expect, it } from 'vitest';
import { API, authHeaders, setupStudent } from './helpers';

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

  it('без токена повертає 401', async () => {
    const res = await fetch(`${API}/schedule/week`);
    expect(res.status).toBe(401);
  });

  it('користувач без групи отримує 409 GROUP_NOT_SET', async () => {
    const login = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'test:nogroup@lnu.edu.ua' }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await fetch(`${API}/schedule/week`, { headers: authHeaders(accessToken) });
    expect(res.status).toBe(409);
  });
});
