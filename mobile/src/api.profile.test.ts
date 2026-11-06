import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ config: { apiUrl: 'http://api.test', mock: false, e2e: false } }));
vi.mock('./lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('./mock/mockFetch', () => ({ mockFetch: vi.fn() }));

import { api } from './api';

// F9: налаштування профілю через PATCH /me (лише передані поля)
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('updateSettings', () => {
  it('шле PATCH /me лише з переданими полями і повертає профіль', async () => {
    const me = { id: 'u1', reminderMinutes: 10 };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(me), { status: 200 }));

    await expect(api.updateSettings('tok', { reminderMinutes: 10 })).resolves.toEqual(me);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ reminderMinutes: 10 });
  });

  it('помилку валідації віддає кодом', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INVALID_REMINDER_MINUTES' }), { status: 400 }));
    await expect(api.updateSettings('tok', { reminderMinutes: 5 })).rejects.toMatchObject({
      code: 'INVALID_REMINDER_MINUTES',
      status: 400,
    });
  });
});

// F8: токен пристрою
describe('push-токен', () => {
  it('реєстрація шле POST /me/push-token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.registerPushToken('tok', 'ExponentPushToken[abc]');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/me/push-token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'ExponentPushToken[abc]' });
  });

  it('видалення шле DELETE з тим самим токеном у тілі', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.removePushToken('tok', 'ExponentPushToken[abc]');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/me/push-token');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'ExponentPushToken[abc]' });
  });
});
