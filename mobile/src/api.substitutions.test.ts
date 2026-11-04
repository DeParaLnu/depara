import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ config: { apiUrl: 'http://api.test', mock: false, e2e: false } }));
vi.mock('./lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('./mock/mockFetch', () => ({ mockFetch: vi.fn() }));

import { api } from './api';

// Виклики API для замін (F6). Логіка запиту й авто-refresh перевіряється в api.test.ts
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

const routeOf = (call: unknown[]) => String(call[0]).replace('http://api.test', '');

describe('заміни (F6)', () => {
  it('createSubstitution шле POST /substitutions з тілом і токеном', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 's1' }));
    await expect(api.createSubstitution('tok', { lessonId: 'l1', kind: 'CANCELLED' })).resolves.toEqual({ id: 's1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/substitutions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ lessonId: 'l1', kind: 'CANCELLED' });
  });

  it('помилку бекенда віддає кодом (SUBSTITUTION_EXISTS)', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'SUBSTITUTION_EXISTS' }));
    await expect(api.createSubstitution('tok', { lessonId: 'l1', kind: 'CANCELLED' })).rejects.toMatchObject({
      code: 'SUBSTITUTION_EXISTS',
      status: 409,
    });
  });

  it('deleteSubstitution шле DELETE і приймає 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteSubstitution('tok', 's1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/substitutions/s1');
    expect(init.method).toBe('DELETE');
  });

  it('teachers кодує пошуковий запит', async () => {
    fetchMock.mockResolvedValueOnce(json(200, []));
    await api.teachers('tok', 'Бойко Я');
    expect(routeOf(fetchMock.mock.calls[0])).toBe(`/teachers?q=${encodeURIComponent('Бойко Я')}`);
  });
});
