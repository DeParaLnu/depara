import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { API, authHeaders, DEVICE, loginRaw, postJson, setupStudent } from './helpers';

interface LoginBody {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
  user: { id: string; role: string; email: string };
}

async function login(email: string): Promise<LoginBody> {
  const res = await loginRaw(email);
  expect(res.status).toBe(200);
  return (await res.json()) as LoginBody;
}

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('F1: вхід (Microsoft)', () => {
  it('акаунт @lnu.edu.ua отримує токени, роль STUDENT і needsOnboarding', async () => {
    const body = await login('f1.student@lnu.edu.ua');
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.role).toBe('STUDENT');
    expect(body.needsOnboarding).toBe(true);
  });

  it('після вибору групи needsOnboarding = false', async () => {
    await setupStudent('f1.onboarded@lnu.edu.ua');
    expect((await login('f1.onboarded@lnu.edu.ua')).needsOnboarding).toBe(false);
  });

  it('пошта з іншого домену відхиляється з 403 NON_LNU_EMAIL', async () => {
    const res = await loginRaw('someone@gmail.com');
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('NON_LNU_EMAIL');
  });

  it('схожий домен (lnu.edu.ua.evil.com) відхиляється', async () => {
    const res = await loginRaw('someone@lnu.edu.ua.evil.com');
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('NON_LNU_EMAIL');
  });

  it('токен чужого тенанта Entra відхиляється з 403 NON_LNU_EMAIL, навіть з поштою ЛНУ', async () => {
    const res = await postJson('/auth/microsoft', { idToken: 'test:f1.tenant@lnu.edu.ua:other-tenant', deviceId: DEVICE });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('NON_LNU_EMAIL');
  });

  it('пошта з двома @ (x@evil.com@lnu.edu.ua) відхиляється', async () => {
    const res = await loginRaw('x@evil.com@lnu.edu.ua');
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('NON_LNU_EMAIL');
  });

  it('регістр пошти не створює дублікат акаунта', async () => {
    const a = await login('F1.Case@lnu.edu.ua');
    const b = await login('f1.case@lnu.edu.ua');
    expect(b.user.email).toBe('f1.case@lnu.edu.ua');
    expect(b.user.id).toBe(a.user.id);
  });

  it('старий маршрут /auth/google прибрано', async () => {
    expect((await postJson('/auth/google', { idToken: 'test:f1.old@lnu.edu.ua', deviceId: DEVICE })).status).toBe(404);
  });

  it('без idToken або deviceId повертає 400', async () => {
    expect((await postJson('/auth/microsoft', { deviceId: DEVICE })).status).toBe(400);
    expect((await loginRaw('f1.nodevice@lnu.edu.ua', '')).status).toBe(400);
  });

  it('зламаний JSON дає 400, а не 500', async () => {
    const res = await fetch(`${API}/auth/microsoft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('недійсний токен повертає 401 INVALID_TOKEN', async () => {
    const res = await postJson('/auth/microsoft', { idToken: 'garbage', deviceId: DEVICE });
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toBe('INVALID_TOKEN');
  });
});

describe('демо-консоль', () => {
  it('сторінка /dev доступна в тестовому режимі', async () => {
    const res = await fetch(`${API}/dev`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ДеПара');
  });
});

describe('F1: refresh і вихід', () => {
  it('refresh видає нову пару токенів, а старий refresh більше не працює', async () => {
    const first = await login('f1.refresh@lnu.edu.ua');

    const res = await postJson('/auth/refresh', {
      refreshToken: first.refreshToken,
      deviceId: DEVICE,
    });
    expect(res.status).toBe(200);
    const next = (await res.json()) as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(first.refreshToken);

    const groups = await fetch(`${API}/groups`, { headers: authHeaders(next.accessToken) });
    expect(groups.status).toBe(200);

    const reuse = await postJson('/auth/refresh', {
      refreshToken: first.refreshToken,
      deviceId: DEVICE,
    });
    expect(reuse.status).toBe(401);
    expect(await errorOf(reuse)).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refresh з іншого deviceId відхиляється', async () => {
    const first = await login('f1.device@lnu.edu.ua');
    const res = await postJson('/auth/refresh', {
      refreshToken: first.refreshToken,
      deviceId: 'another-device',
    });
    expect(res.status).toBe(401);
  });

  it('refresh-токен не підходить як access, а недійсний refresh дає 401', async () => {
    const first = await login('f1.typ@lnu.edu.ua');
    const asAccess = await fetch(`${API}/groups`, { headers: authHeaders(first.refreshToken) });
    expect(asAccess.status).toBe(401);
    const bad = await postJson('/auth/refresh', { refreshToken: 'garbage', deviceId: DEVICE });
    expect(bad.status).toBe(401);
  });

  it('logout скасовує refresh-токен і є ідемпотентним', async () => {
    const first = await login('f1.logout@lnu.edu.ua');
    expect((await postJson('/auth/logout', { refreshToken: first.refreshToken })).status).toBe(204);
    expect((await postJson('/auth/logout', { refreshToken: first.refreshToken })).status).toBe(204);
    const res = await postJson('/auth/refresh', {
      refreshToken: first.refreshToken,
      deviceId: DEVICE,
    });
    expect(res.status).toBe(401);
  });
});

// Токен "test:<email>::<oid>" імітує інший акаунт Entra з тією самою поштою (tid типовий)
const asOid = (email: string, oid: string) => postJson('/auth/microsoft', { idToken: `test:${email}::${oid}`, deviceId: DEVICE });

describe('F1: прив\'язка акаунта до oid', () => {
  const prisma = new PrismaClient();
  const run = Date.now();
  // Щоразу новий oid зловмисника: спільний oid після першого успішного перепризначення зробив би наступні перевірки хибними
  let n = 0;
  const attacker = () => `attacker-${run}-${++n}`;
  afterAll(() => prisma.$disconnect());

  it('акаунт, уже прив\'язаний до одного oid, не перепризначається іншому oid з такою самою поштою (409)', async () => {
    const email = `f1.bound.${run}@lnu.edu.ua`;
    const owner = await login(email);

    const res = await asOid(email, attacker());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; accessToken?: string };
    expect(body.error).toBe('ACCOUNT_CONFLICT');
    expect(body.accessToken).toBeUndefined();

    // справжній власник входить як і раніше, прив'язка не змінилась
    expect((await login(email)).user.id).toBe(owner.user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).microsoftOid).toBe(`test-${email}`);
  });

  it('роль власника не дістається іншому oid навіть після підвищення до ADMIN/HEADMAN', async () => {
    const email = `f1.bound-role.${run}@lnu.edu.ua`;
    await login(email);
    await prisma.user.update({ where: { email }, data: { role: 'HEADMAN' } });
    expect((await asOid(email, attacker())).status).toBe(409);
    expect((await login(email)).user.role).toBe('HEADMAN');
  });

  it('зміна пошти в Entra (той самий oid) лишає той самий акаунт', async () => {
    const oldEmail = `f1.upn-old.${run}@lnu.edu.ua`;
    const newEmail = `f1.upn-new.${run}@lnu.edu.ua`;
    const before = await login(oldEmail);

    const res = await asOid(newEmail, `test-${oldEmail}`);
    expect(res.status).toBe(200);
    const after = (await res.json()) as LoginBody;
    expect(after.user.id).toBe(before.user.id);
    expect(after.user.email).toBe(newEmail);
  });

  it('запис без oid (після міграції) прив\'язується до першого входу за поштою і зберігає роль', async () => {
    const email = `f1.legacy.${run}@lnu.edu.ua`;
    const legacy = await prisma.user.create({ data: { email, fullName: 'Legacy', role: 'HEADMAN', microsoftOid: null } });

    const body = await login(email);
    expect(body.user.id).toBe(legacy.id);
    expect(body.user.role).toBe('HEADMAN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).microsoftOid).toBe(`test-${email}`);

    // після прив'язки інший oid з цією поштою вже не пройде
    expect((await asOid(email, attacker())).status).toBe(409);
  });

  it('два одночасні перші входи з тим самим oid (подвійний тап, повтор) обидва успішні', async () => {
    const email = `f1.double.${run}@lnu.edu.ua`;
    const legacy = await prisma.user.create({ data: { email, fullName: 'Double', role: 'HEADMAN', microsoftOid: null } });

    const oid = `double-oid-${run}`;
    const results = await Promise.all([asOid(email, oid), asOid(email, oid), asOid(email, oid)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    for (const r of results) expect(((await r.json()) as LoginBody).user.id).toBe(legacy.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).microsoftOid).toBe(oid);
  });

  it('два одночасні перші входи з різними oid в один вільний запис: прив\'язується лише один', async () => {
    const email = `f1.race.${run}@lnu.edu.ua`;
    await prisma.user.create({ data: { email, fullName: 'Race', microsoftOid: null } });

    // oid унікальні на запуск: інакше oid із попереднього прогону вже прив'язаний до іншого запису
    const oids = [`race-oid-a-${run}`, `race-oid-b-${run}`];
    const results = await Promise.all(oids.map((oid) => asOid(email, oid)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const bound = (await prisma.user.findUniqueOrThrow({ where: { email } })).microsoftOid;
    expect(oids).toContain(bound);
  });
});
