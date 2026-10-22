import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { config } from '../config';

export interface MicrosoftIdentity {
  oid: string; // стабільний id користувача в тенанті (sub у Entra різний для кожного застосунку)
  tid: string; // тенант (організація)
  email: string;
  name?: string;
}

// У тестовому режимі, якщо тенант не заданий, фейкові токени вважаються токенами цього тенанта
const FAKE_TENANT = 'fake-tenant';

// Ключі підпису Entra. Створюємо лазно: без налаштованого тенанта нічого не потрібно.
let jwks: JWTVerifyGetKey | undefined;
function defaultKeys(): JWTVerifyGetKey {
  jwks ??= createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${config.microsoftTenantId}/discovery/v2.0/keys`),
  );
  return jwks;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

// Перевіряє підпис, термін дії, aud (Client ID) і issuer v2.0 ID-токена. Кидає помилку, якщо токен недійсний.
// Збіг tid з нашим тенантом перевіряє checkIdentity, щоб чужий тенант давав 403, а не 401.
export async function verifyMicrosoftToken(
  idToken: string,
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<MicrosoftIdentity> {
  const { payload } = await jwtVerify(idToken, keys, {
    audience: config.microsoftClientId,
    algorithms: ['RS256'],
  });
  const oid = str(payload.oid);
  const tid = str(payload.tid);
  // email у Entra необов'язковий claim, для робочих акаунтів preferred_username це UPN
  const email = (str(payload.email) ?? str(payload.preferred_username))?.toLowerCase();
  if (!oid || !tid || !email) throw new errors.JWTInvalid('Incomplete token payload');
  if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
    throw new errors.JWTClaimValidationFailed('Unexpected issuer', payload, 'iss');
  }
  return { oid, tid, email, name: str(payload.name) };
}

// Тестовий режим: токен "test:<email>" або "test:<email>:<tid>" (другий вигляд перевіряє чужий тенант).
function verifyFake(idToken: string): MicrosoftIdentity {
  if (!idToken.startsWith('test:')) throw new Error('Not a test token');
  const [email, tid] = idToken.slice('test:'.length).toLowerCase().split(':');
  if (!email) throw new Error('Not a test token');
  return { oid: `test-${email}`, tid: tid || config.microsoftTenantId || FAKE_TENANT, email };
}

export async function verifyIdToken(idToken: string): Promise<MicrosoftIdentity> {
  return config.fakeAuth ? verifyFake(idToken) : verifyMicrosoftToken(idToken);
}

// Єдине джерело істини про допуск: наш тенант і домен пошти.
export function checkIdentity(id: MicrosoftIdentity): 'NON_LNU_EMAIL' | null {
  const tenant = config.microsoftTenantId || (config.fakeAuth ? FAKE_TENANT : '');
  if (!tenant || id.tid !== tenant) return 'NON_LNU_EMAIL';
  // Рівно одна @, і весь домен після неї збігається (відсікає "x@evil.com@lnu.edu.ua" і lnu.edu.ua.evil.com)
  const at = id.email.lastIndexOf('@');
  if (at < 1 || id.email.indexOf('@') !== at) return 'NON_LNU_EMAIL';
  return id.email.slice(at + 1) === config.allowedEmailDomain ? null : 'NON_LNU_EMAIL';
}
