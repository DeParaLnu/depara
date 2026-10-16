import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/db';
import { ADMIN_EMAIL, currentMonday } from './helpers';

// Тест запускає застосунок у цьому ж процесі з власним потоком логів і читає з нього записи audit.
// Потрібна та сама база і Redis, що й для решти E2E, та ADMIN_EMAILS з адресою ADMIN_EMAIL.
type Line = { reqId?: string; msg?: string; audit?: Record<string, unknown> };
const lines: Line[] = [];
const app = buildApp({
  logger: { level: 'info', stream: { write: (s: string) => lines.push(JSON.parse(s) as Line) } },
});

const login = async (email: string) => {
  const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: `test:${email}`, deviceId: 'audit-test' } });
  return (res.json() as { accessToken: string; user: { id: string } });
};
const auditLines = (action: string) => lines.filter((l) => l.audit?.action === action);

beforeAll(async () => {
  await app.ready();
  await quietApp.ready();
});
// Другий застосунок із рівнем логера warn: audit не має зникати
const quietLines: Line[] = [];
const quietApp = buildApp({
  logger: { level: 'warn', stream: { write: (s: string) => quietLines.push(JSON.parse(s) as Line) } },
});

afterAll(async () => {
  await app.close();
  await quietApp.close();
  await prisma.$disconnect();
});

describe('audit trail', () => {
  it('зміна ролі пишеться з виконавцем, ціллю, старою і новою роллю та reqId', async () => {
    const admin = await login(ADMIN_EMAIL);
    const target = await login('audit.target@lnu.edu.ua');
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${target.user.id}/role`,
      headers: { authorization: `Bearer ${admin.accessToken}`, 'x-request-id': 'audit-req-0001' },
      payload: { role: 'HEADMAN' },
    });
    expect(res.statusCode).toBe(200);

    const entry = auditLines('user.role.change').find((l) => l.reqId === 'audit-req-0001');
    expect(entry?.audit).toMatchObject({ actor: admin.user.id, actorRole: 'ADMIN', target: target.user.id, to: 'HEADMAN' });
    expect(entry?.audit?.from).toBeDefined();
  });

  it('імпорт розкладу пишеться з кількістю пар і форматом', async () => {
    const admin = await login(ADMIN_EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/schedule/import',
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        faculties: [{ name: 'Тестовий факультет', short_name: 'ТФ' }],
        groups: [{ code: 'ТЕСТ-31', course: 3, faculty: 'ТФ' }],
        lessons: [{ group: 'ТЕСТ-31', date: currentMonday(), pair: 5, subject: `Audit ${Date.now()}` }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(auditLines('schedule.import').at(-1)?.audit).toMatchObject({ actor: admin.user.id, format: 'json', imported: 1 });
  });

  it('відмова в доступі студенту записується, а пошта й токени в audit не потрапляють', async () => {
    const student = await login('audit.student@lnu.edu.ua');
    const res = await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${student.accessToken}` } });
    expect(res.statusCode).toBe(403);

    const denied = auditLines('access.denied').find((l) => l.audit?.actor === student.user.id);
    expect(denied?.audit).toMatchObject({ actorRole: 'STUDENT', route: '/admin/users' });

    const raw = JSON.stringify(lines);
    expect(raw).not.toContain(student.accessToken);
    expect(raw).not.toContain('audit.student@lnu.edu.ua');
  });

  it('підвищення до ADMIN через ADMIN_EMAILS при вході теж потрапляє в audit', async () => {
    await login(ADMIN_EMAIL);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    await prisma.user.update({ where: { id: row.id }, data: { role: 'STUDENT' } });

    await login(ADMIN_EMAIL);
    const entry = auditLines('user.role.bootstrap').at(-1);
    expect(entry?.audit).toMatchObject({ actor: 'ADMIN_EMAILS', target: row.id, from: 'STUDENT', to: 'ADMIN' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).role).toBe('ADMIN');

    // вхід уже адміна нічого не змінює і не пише
    const count = auditLines('user.role.bootstrap').length;
    await login(ADMIN_EMAIL);
    expect(auditLines('user.role.bootstrap')).toHaveLength(count);
  });

  it('audit лишається в лозі, навіть коли рівень логера warn', async () => {
    const loginQuiet = async (email: string) =>
      (await quietApp.inject({ method: 'POST', url: '/auth/google', payload: { idToken: `test:${email}`, deviceId: 'audit-test' } })).json() as {
        accessToken: string;
        user: { id: string };
      };
    const admin = await loginQuiet(ADMIN_EMAIL);
    const target = await loginQuiet('audit.quiet@lnu.edu.ua');
    const res = await quietApp.inject({
      method: 'PATCH',
      url: `/admin/users/${target.user.id}/role`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { role: 'STUDENT' },
    });
    expect(res.statusCode).toBe(200);
    expect(quietLines.some((l) => l.audit?.action === 'user.role.change' && l.audit.target === target.user.id)).toBe(true);
    // а звичайні info-записи (наприклад, "incoming request") у такому режимі відсутні
    expect(quietLines.some((l) => l.msg === 'incoming request')).toBe(false);
  });
});
