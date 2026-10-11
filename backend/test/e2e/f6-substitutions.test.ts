import { beforeAll, describe, expect, it } from 'vitest';
import {
  adminToken, API, authHeaders, importLesson, send, setupStudent, userId, weekLessons,
} from './helpers';

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const first = async <T>(path: string, token: string) =>
  ((await (await fetch(`${API}${path}`, { headers: authHeaders(token) })).json()) as { id: string }[])[0] as T & { id: string };

let admin: string;
let headman: string;
let student: string;

// Нова унікальна пара для кожного тесту, щоб заміни з попередніх запусків не заважали
async function freshLesson(): Promise<string> {
  const subject = `E2E заміна ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  expect((await importLesson(admin, subject)).status).toBe(200);
  return (await weekLessons(headman)).find((l) => l.subject === subject)!.id;
}

beforeAll(async () => {
  admin = await adminToken();
  headman = await setupStudent('f6.headman@lnu.edu.ua');
  student = await setupStudent('f6.student@lnu.edu.ua');
  await send('PATCH', `/admin/users/${await userId(headman)}/role`, admin, { role: 'HEADMAN' });
});

describe('F6: створення замін', () => {
  it('студент не може створити заміну (403), без токена 401', async () => {
    const lessonId = await freshLesson();
    expect((await send('POST', '/substitutions', student, { lessonId, kind: 'CANCELLED' })).status).toBe(403);
    const anon = await fetch(`${API}/substitutions`, { method: 'POST' });
    expect(anon.status).toBe(401);
  });

  it('староста скасовує пару своєї групи, заміна видна студентам у розкладі', async () => {
    const lessonId = await freshLesson();
    const res = await send('POST', '/substitutions', headman, { lessonId, kind: 'CANCELLED', comment: 'Хвороба' });
    expect(res.status).toBe(201);

    const lesson = (await weekLessons(student)).find((l) => l.id === lessonId);
    expect(lesson?.substitution?.kind).toBe('CANCELLED');
  });

  it('заміна викладача та зміна аудиторії повертають нові значення в розкладі', async () => {
    const teacher = await first<{ fullName: string }>('/teachers', headman);
    const room = await first<{ label: string }>('/classrooms', headman);

    const l1 = await freshLesson();
    expect((await send('POST', '/substitutions', headman, { lessonId: l1, kind: 'REPLACED', newTeacherId: teacher.id })).status).toBe(201);
    const l2 = await freshLesson();
    expect((await send('POST', '/substitutions', headman, { lessonId: l2, kind: 'ROOM_CHANGED', newClassroomId: room.id })).status).toBe(201);

    const lessons = await weekLessons(student);
    expect(lessons.find((l) => l.id === l1)?.substitution?.newTeacher).toBe(teacher.fullName);
    expect(lessons.find((l) => l.id === l2)?.substitution?.newRoom).toBe(room.label);
  });

  it('перенесення вимагає нову дату чи пару, що відрізняється від поточної', async () => {
    const lessonId = await freshLesson();
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'MOVED' }))).toBe('NEW_DATE_OR_PAIR_REQUIRED');
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'MOVED', newPairNumber: 5 }))).toBe('MOVE_TARGET_SAME_AS_ORIGINAL');
    expect((await send('POST', '/substitutions', headman, { lessonId, kind: 'MOVED', newPairNumber: 3 })).status).toBe(201);
  });

  it('валідація: тип, обов`язкові поля, неіснуючі id', async () => {
    const lessonId = await freshLesson();
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'WHATEVER' }))).toBe('INVALID_KIND');
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId: 'x', kind: 'CANCELLED' }))).toBe('INVALID_LESSON_ID');
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'REPLACED' }))).toBe('NEW_TEACHER_REQUIRED');
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'ROOM_CHANGED' }))).toBe('NEW_CLASSROOM_REQUIRED');
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'ROOM_CHANGED', newClassroomId: unknown }))).toBe('CLASSROOM_NOT_FOUND');
    const missing = await send('POST', '/substitutions', headman, { lessonId: unknown, kind: 'CANCELLED' });
    expect(missing.status).toBe(404);
  });

  it('на одну пару лише одна заміна (409), староста не чіпає чужу групу (403)', async () => {
    const lessonId = await freshLesson();
    expect((await send('POST', '/substitutions', headman, { lessonId, kind: 'CANCELLED' })).status).toBe(201);
    expect(await errorOf(await send('POST', '/substitutions', headman, { lessonId, kind: 'CANCELLED' }))).toBe('SUBSTITUTION_EXISTS');

    // пара чужої групи, створена адміном
    const subject = `E2E чужа ${Date.now()}`;
    await importLesson(admin, subject, 'ТЕСТ-32');
    const other = await setupStudent('f6.other@lnu.edu.ua');
    const groups = (await (await fetch(`${API}/groups`, { headers: authHeaders(other) })).json()) as { id: string; code: string }[];
    await send('PATCH', '/me', other, { groupId: groups.find((g) => g.code === 'ТЕСТ-32')!.id });
    const foreign = (await weekLessons(other)).find((l) => l.subject === subject)!.id;

    const res = await send('POST', '/substitutions', headman, { lessonId: foreign, kind: 'CANCELLED' });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('FORBIDDEN_GROUP');
    // адмін може заміняти пари будь-якої групи
    expect((await send('POST', '/substitutions', admin, { lessonId: foreign, kind: 'CANCELLED' })).status).toBe(201);
  });
});

describe('F6: скасування заміни', () => {
  it('староста видаляє заміну, пара повертається до звичайного вигляду', async () => {
    const lessonId = await freshLesson();
    const created = (await (await send('POST', '/substitutions', headman, { lessonId, kind: 'CANCELLED' })).json()) as { id: string };

    expect((await send('DELETE', `/substitutions/${created.id}`, student)).status).toBe(403);
    expect((await send('DELETE', `/substitutions/${created.id}`, headman)).status).toBe(204);
    expect((await weekLessons(student)).find((l) => l.id === lessonId)?.substitution).toBeNull();
    expect((await send('DELETE', `/substitutions/${created.id}`, headman)).status).toBe(404);
    expect((await send('DELETE', '/substitutions/bad', headman)).status).toBe(400);
  });
});


