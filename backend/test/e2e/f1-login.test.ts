import { describe, expect, it } from 'vitest';
import { loginRaw } from './helpers';

describe('F1: вхід', () => {
  it('акаунт @lnu.edu.ua отримує токен доступу', async () => {
    const res = await loginRaw('f1.student@lnu.edu.ua');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; user: { role: string } };
    expect(body.accessToken).toBeTruthy();
    expect(body.user.role).toBe('STUDENT');
  });

  it('пошта з іншого домену відхиляється з 403 NOT_LNU_EMAIL', async () => {
    const res = await loginRaw('someone@gmail.com');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_LNU_EMAIL');
  });
});
