import { describe, expect, it } from 'vitest';
import { API, authHeaders, DEVICE, loginRaw, postJson, setupStudent } from './helpers';

interface LoginBody {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
  user: { role: string; email: string };
}

async function login(email: string): Promise<LoginBody> {
  const res = await loginRaw(email);
  expect(res.status).toBe(200);
  return (await res.json()) as LoginBody;
}

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('F1: вхід', () => {
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

  it('без idToken або deviceId повертає 400', async () => {
    expect((await postJson('/auth/google', { deviceId: DEVICE })).status).toBe(400);
    expect((await loginRaw('f1.nodevice@lnu.edu.ua', '')).status).toBe(400);
  });

  it('зламаний JSON дає 400, а не 500', async () => {
    const res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('недійсний токен повертає 401 INVALID_TOKEN', async () => {
    const res = await postJson('/auth/google', { idToken: 'garbage', deviceId: DEVICE });
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
