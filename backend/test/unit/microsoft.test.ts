import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// config читає змінні при імпорті, тому задаємо їх до нього
const { TENANT, CLIENT } = vi.hoisted(() => {
  const ids = { TENANT: '11111111-1111-4111-8111-111111111111', CLIENT: '22222222-2222-4222-8222-222222222222' };
  process.env.MICROSOFT_TENANT_ID = ids.TENANT;
  process.env.MICROSOFT_CLIENT_ID = ids.CLIENT;
  process.env.ALLOWED_EMAIL_DOMAIN = 'lnu.edu.ua';
  return ids;
});

import { checkIdentity, verifyMicrosoftToken, type MicrosoftIdentity } from '../../src/lib/microsoft';

const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;
let keys: ReturnType<typeof createLocalJWKSet>;
let signingKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function sign(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; exp?: string | number; alg?: string } = {}) {
  const base = { oid: 'oid-1', tid: TENANT, email: 'Student@LNU.edu.ua', name: 'Іван Франко', ...claims };
  return new SignJWT(base)
    .setProtectedHeader({ alg: (opts.alg ?? 'RS256') as 'RS256', kid: 'k1' })
    .setIssuer((claims.iss as string | undefined) ?? ISS)
    .setAudience((claims.aud as string | undefined) ?? CLIENT)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? signingKey);
}

describe('verifyMicrosoftToken', () => {
  it('приймає дійсний токен і нормалізує пошту', async () => {
    expect(await verifyMicrosoftToken(await sign(), keys)).toEqual({
      oid: 'oid-1',
      tid: TENANT,
      email: 'student@lnu.edu.ua',
      name: 'Іван Франко',
    });
  });

  it('без claim email бере preferred_username (UPN)', async () => {
    const token = await sign({ email: undefined, preferred_username: 'upn@lnu.edu.ua' });
    expect((await verifyMicrosoftToken(token, keys)).email).toBe('upn@lnu.edu.ua');
  });

  it('відхиляє підпис чужим ключем', async () => {
    const other = await generateKeyPair('RS256');
    await expect(verifyMicrosoftToken(await sign({}, { key: other.privateKey }), keys)).rejects.toThrow();
  });

  it('відхиляє прострочений токен', async () => {
    await expect(verifyMicrosoftToken(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 }), keys)).rejects.toThrow();
  });

  it('відхиляє токен для іншого застосунку (aud)', async () => {
    await expect(verifyMicrosoftToken(await sign({ aud: 'another-app' }), keys)).rejects.toThrow();
  });

  it('відхиляє issuer, який не відповідає tid (зокрема v1 sts.windows.net)', async () => {
    await expect(verifyMicrosoftToken(await sign({ iss: `https://sts.windows.net/${TENANT}/` }), keys)).rejects.toThrow();
    await expect(verifyMicrosoftToken(await sign({ tid: 'other-tenant' }), keys)).rejects.toThrow();
  });

  it('відхиляє токен без oid, tid або пошти', async () => {
    for (const missing of ['oid', 'tid']) {
      await expect(verifyMicrosoftToken(await sign({ [missing]: undefined }), keys), missing).rejects.toThrow();
    }
    await expect(verifyMicrosoftToken(await sign({ email: undefined }), keys)).rejects.toThrow();
  });

  it('відхиляє алгоритм, відмінний від RS256 (HS256 з відкритим ключем, none)', async () => {
    const hs = await new SignJWT({ oid: 'x', tid: TENANT, email: 'a@lnu.edu.ua' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(ISS)
      .setAudience(CLIENT)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secret'));
    await expect(verifyMicrosoftToken(hs, keys)).rejects.toThrow();

    const header = Buffer.from('{"alg":"none"}').toString('base64url');
    const body = Buffer.from(JSON.stringify({ oid: 'x', tid: TENANT, email: 'a@lnu.edu.ua', iss: ISS, aud: CLIENT })).toString('base64url');
    await expect(verifyMicrosoftToken(`${header}.${body}.`, keys)).rejects.toThrow();
  });
});

describe('checkIdentity', () => {
  const ok: MicrosoftIdentity = { oid: '1', tid: TENANT, email: 'student@lnu.edu.ua' };

  it('пропускає свій тенант і домен ЛНУ', () => {
    expect(checkIdentity(ok)).toBeNull();
  });

  it.each([
    ['чужий тенант', { tid: 'another-tenant' }],
    ['домен іншої організації', { email: 'a@gmail.com' }],
    ['суфікс-підробка', { email: 'a@evil-lnu.edu.ua' }],
    ['піддомен', { email: 'a@mail.lnu.edu.ua' }],
    ['чужий домен після lnu.edu.ua', { email: 'a@lnu.edu.ua.evil.com' }],
    ['дві @', { email: 'a@evil.com@lnu.edu.ua' }],
    ['порожня локальна частина', { email: '@lnu.edu.ua' }],
    ['без @', { email: 'lnu.edu.ua' }],
  ])('відхиляє: %s', (_name, patch) => {
    expect(checkIdentity({ ...ok, ...patch })).toBe('NON_LNU_EMAIL');
  });
});
