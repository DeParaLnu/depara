import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { verifyAccessToken } from '../../src/lib/tokens';

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
