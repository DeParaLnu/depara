import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeekSchedule } from '../api';
import { mockFetch } from './mockFetch';

// Мок-бекенд MOCK=1 для F6: заміна створюється, видна в розкладі і скасовується
const auth = { headers: { Authorization: 'Bearer mock-access' } };
const call = async (path: string, init: RequestInit = {}) => {
  const p = mockFetch(path, { ...auth, ...init });
  await vi.runAllTimersAsync();
  const res = await p;
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
const week = async () => (await call('/schedule/week?date=2026-11-04')).body as WeekSchedule;

beforeEach(async () => {
  vi.useFakeTimers();
  await call('/auth/microsoft', { method: 'POST', body: '{}' });
  await call('/me', { method: 'PATCH', body: JSON.stringify({ groupId: 'mock-g-test-31', subgroup: 0 }) });
});

describe('мок: заміни (F6)', () => {
  it('скасування пари видно в розкладі, повторна заміна дає 409, після DELETE пара звичайна', async () => {
    const lesson = (await week()).lessons.find((l) => !l.substitution)!;

    const created = await call('/substitutions', {
      method: 'POST',
      body: JSON.stringify({ lessonId: lesson.id, kind: 'CANCELLED', comment: 'Хворіє' }),
    });
    expect(created.status).toBe(201);
    const after = (await week()).lessons.find((l) => l.id === lesson.id)!;
    expect(after.substitution).toMatchObject({ kind: 'CANCELLED', comment: 'Хворіє' });

    const again = await call('/substitutions', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, kind: 'CANCELLED' }) });
    expect(again).toMatchObject({ status: 409, body: { error: 'SUBSTITUTION_EXISTS' } });

    expect((await call(`/substitutions/${after.substitution!.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await week()).lessons.find((l) => l.id === lesson.id)!.substitution).toBeNull();
  });

  it('інший викладач і аудиторія беруться з довідників мока', async () => {
    const lesson = (await week()).lessons.find((l) => !l.substitution)!;
    const teachers = (await call('/teachers?q=бойко')).body as { id: string; fullName: string }[];
    expect(teachers.map((t) => t.fullName)).toEqual(['Бойко Ярослав Васильович']);

    await call('/substitutions', {
      method: 'POST',
      body: JSON.stringify({ lessonId: lesson.id, kind: 'REPLACED', newTeacherId: teachers[0].id }),
    });
    expect((await week()).lessons.find((l) => l.id === lesson.id)!.substitution).toMatchObject({
      kind: 'REPLACED',
      newTeacher: 'Бойко Ярослав Васильович',
    });
  });

  it('заміну з фікстур можна скасувати', async () => {
    const withSub = (await week()).lessons.find((l) => l.substitution)!;
    expect((await call(`/substitutions/${withSub.substitution!.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await week()).lessons.find((l) => l.id === withSub.id)!.substitution).toBeNull();
  });

  it('невідома пара дає 404, обовʼязкові поля перевіряються', async () => {
    expect((await call('/substitutions', { method: 'POST', body: JSON.stringify({ lessonId: 'x', kind: 'CANCELLED' }) })).status).toBe(404);
    const lesson = (await week()).lessons.find((l) => !l.substitution)!;
    const res = await call('/substitutions', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, kind: 'ROOM_CHANGED' }) });
    expect(res).toMatchObject({ status: 400, body: { error: 'NEW_CLASSROOM_REQUIRED' } });
  });
});
