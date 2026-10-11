import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { checkLnuIdentity, type GoogleIdentity } from '../../src/lib/google';
import { verifyAccessToken } from '../../src/lib/tokens';

const ok: GoogleIdentity = {
  sub: '1',
  email: 'student@lnu.edu.ua',
  emailVerified: true,
  hd: 'lnu.edu.ua',
};

describe('checkLnuIdentity', () => {
  it('пропускає підтверджений акаунт домену', () => {
    expect(checkLnuIdentity(ok)).toBeNull();
  });

  it.each([
    ['email не підтверджений', { emailVerified: false }],
    ['немає hd (особистий gmail)', { hd: undefined, email: 'a@gmail.com' }],
    ['hd іншого домену', { hd: 'example.com' }],
    ['hd збігається, а пошта чужа', { email: 'a@gmail.com' }],
    ['суфікс-підробка', { email: 'a@evil-lnu.edu.ua' }],
  ])('відхиляє: %s', (_name, patch) => {
    expect(checkLnuIdentity({ ...ok, ...patch })).toBe('NON_LNU_EMAIL');
  });
});

describe('verifyAccessToken', () => {
  const sign = (payload: object, opts: jwt.SignOptions = {}) =>
    jwt.sign(payload, config.jwtSecret, opts);

  it('приймає дійсний access-токен', () => {
    const r = verifyAccessToken(sign({ sub: 'u1', typ: 'access' }, { expiresIn: '5m' }));
    expect(r).toEqual({ ok: true, userId: 'u1' });
  });

  it('протермінований дає TOKEN_EXPIRED', () => {
    const r = verifyAccessToken(sign({ sub: 'u1', typ: 'access' }, { expiresIn: -10 }));
    expect(r).toEqual({ ok: false, error: 'TOKEN_EXPIRED' });
  });

  it('refresh-токен і сміття дають UNAUTHORIZED', () => {
    expect(verifyAccessToken(sign({ sub: 'u1', typ: 'refresh' }))).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
    });
    expect(verifyAccessToken('garbage')).toEqual({ ok: false, error: 'UNAUTHORIZED' });
  });
});
