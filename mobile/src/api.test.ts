import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ config: { apiUrl: 'http://api.test', mock: false, e2e: false } }));
vi.mock('./lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('./mock/mockFetch', () => ({ mockFetch: vi.fn() }));

import { api, ApiError, setSessionBridge, type SessionBridge } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const expired = () => json(401, { error: 'TOKEN_EXPIRED' });

let fetchMock: ReturnType<typeof vi.fn>;
let bridge: SessionBridge;
let session: { accessToken: string; refreshToken: string; needsOnboarding: boolean } | null;

beforeEach(() => {
  session = { accessToken: 'old-access', refreshToken: 'old-refresh', needsOnboarding: false };
  bridge = {
    getSession: vi.fn(() => session),
    getDeviceId: vi.fn(async () => 'device-1'),
    onRefreshed: vi.fn(async (t) => {
      session = { ...session!, ...t };
    }),
    onRefreshFailed: vi.fn(async () => {
      session = null;
    }),
  };
  setSessionBridge(bridge);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

const routeOf = (call: unknown[]) => String(call[0]).replace('http://api.test', '');
const callsTo = (route: string) => fetchMock.mock.calls.filter((c) => routeOf(c) === route);

describe('deleteAccount', () => {
  it('шле DELETE /me з токеном і приймає 204 без тіла', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.deleteAccount('tok')).resolves.toEqual({});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/me');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('помилку сервера (останній адмін) віддає кодом', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'LAST_ADMIN' }));
    await expect(api.deleteAccount('tok')).rejects.toMatchObject({ code: 'LAST_ADMIN', status: 409 });
  });

  it('прострочений access оновлюється й видалення повторюється з новим токеном', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.deleteAccount('old-access')).resolves.toEqual({});
    const retry = fetchMock.mock.calls[2] as [string, RequestInit];
    expect((retry[1].headers as Record<string, string>).Authorization).toBe('Bearer new-access');
  });
});

describe('авто-refresh при TOKEN_EXPIRED', () => {
  it('оновлює токен і повторює запит з новим access', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(json(200, { id: 'u1' }));

    await expect(api.me('old-access')).resolves.toEqual({ id: 'u1' });

    expect(bridge.onRefreshed).toHaveBeenCalledWith({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(bridge.onRefreshFailed).not.toHaveBeenCalled();
    const retry = fetchMock.mock.calls[2];
    expect((retry[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer new-access' });
  });

  it('кілька запитів із простроченим токеном роблять один refresh', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new-access' ? json(200, { ok: true }) : expired();
    });

    await Promise.all([api.me('old-access'), api.groups('old-access'), api.buildings('old-access')]);

    expect(callsTo('/auth/refresh')).toHaveLength(1);
  });

  it('помилка мережі під час refresh НЕ скидає сесію і віддається як NETWORK_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(expired()).mockRejectedValueOnce(new TypeError('Network request failed'));

    const err = await api.me('old-access').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(bridge.onRefreshFailed).not.toHaveBeenCalled();
    expect(session?.refreshToken).toBe('old-refresh');
  });

  it.each([500, 503, 429])('відповідь %i на refresh не скидає сесію', async (status) => {
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(json(status, { error: 'SERVER' }));

    const err = await api.me('old-access').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(status);
    expect(bridge.onRefreshFailed).not.toHaveBeenCalled();
    expect(session).not.toBeNull();
  });

  it('після тимчасової помилки наступний запит знову пробує refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(json(200, { id: 'u1' }));

    await expect(api.me('old-access')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(api.me('old-access')).resolves.toEqual({ id: 'u1' });
    expect(callsTo('/auth/refresh')).toHaveLength(2);
  });

  it.each([401, 400])('відхилений сервером refresh (%i) скидає сесію', async (status) => {
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(json(status, { error: 'INVALID_REFRESH_TOKEN' }));

    const err = await api.me('old-access').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(bridge.onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(session).toBeNull();
  });

  it('без refresh-токена в сесії скидає сесію без запиту', async () => {
    session = { accessToken: 'a', refreshToken: '', needsOnboarding: false };
    fetchMock.mockResolvedValueOnce(expired());

    await expect(api.me('a')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });

    expect(callsTo('/auth/refresh')).toHaveLength(0);
    expect(bridge.onRefreshFailed).toHaveBeenCalledTimes(1);
  });

  it('401 з іншим кодом (UNAUTHORIZED) refresh не запускає', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'UNAUTHORIZED' }));

    await expect(api.me('x')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    expect(callsTo('/auth/refresh')).toHaveLength(0);
  });

  it('повторний 401 після успішного refresh не зациклюється', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(expired());

    await expect(api.me('old-access')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(callsTo('/auth/refresh')).toHaveLength(1);
  });
});

describe('тиждень з ETag (F3)', () => {
  const week = { weekStart: '2026-11-02', published: true, lessons: [{ id: 'l1' }] };
  const withEtag = (status: number, body: unknown, etag: string) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', etag } });
  const headersOf = (i: number) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;

  it('без збереженого тижня не шле If-None-Match і запамʼятовує etag відповіді', async () => {
    fetchMock.mockResolvedValueOnce(withEtag(200, week, '"v1"'));

    const res = await api.week('tok', '2026-11-02');

    expect(res).toEqual({ ...week, etag: '"v1"' });
    expect(headersOf(0)['If-None-Match']).toBeUndefined();
    expect(routeOf(fetchMock.mock.calls[0])).toBe('/schedule/week?date=2026-11-02');
  });

  it('шле If-None-Match і на 304 віддає збережений тиждень', async () => {
    const cached = { ...week, etag: '"v1"' };
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"v1"' } }));

    await expect(api.week('tok', '2026-11-02', cached as never)).resolves.toBe(cached);
    expect(headersOf(0)['If-None-Match']).toBe('"v1"');
    expect(headersOf(0).Authorization).toBe('Bearer tok');
  });

  it('змінений розклад (200) замінює збережений тиждень і etag', async () => {
    const changed = { ...week, lessons: [] };
    fetchMock.mockResolvedValueOnce(withEtag(200, changed, '"v2"'));

    await expect(api.week('tok', '2026-11-02', { ...week, etag: '"v1"' } as never)).resolves.toEqual({
      ...changed,
      etag: '"v2"',
    });
  });

  it('збережений тиждень без etag (старий кеш) запитується без If-None-Match', async () => {
    fetchMock.mockResolvedValueOnce(withEtag(200, week, '"v1"'));
    await api.week('tok', '2026-11-02', week as never);
    expect(headersOf(0)['If-None-Match']).toBeUndefined();
  });

  it('304 без збереженого тижня дає помилку, а не порожній розклад', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(api.week('tok', '2026-11-02')).rejects.toMatchObject({ code: 'HTTP_304', status: 304 });
  });

  it('після авто-refresh повторний запит теж несе If-None-Match і новий токен', async () => {
    const cached = { ...week, etag: '"v1"' };
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    await expect(api.week('old-access', '2026-11-02', cached as never)).resolves.toBe(cached);
    expect(headersOf(2)['If-None-Match']).toBe('"v1"');
    expect(headersOf(2).Authorization).toBe('Bearer new-access');
  });

  it('помилка мережі не підміняється збереженим тижнем: екран сам покаже «Офлайн»', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.week('tok', '2026-11-02', { ...week, etag: '"v1"' } as never)).rejects.toBeInstanceOf(ApiError);
  });
});
