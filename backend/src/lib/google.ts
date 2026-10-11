import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  hd?: string;
  name?: string;
}

const client = new OAuth2Client();

// Перевіряє підпис, термін дії та aud (Client ID) токена. Кидає помилку, якщо токен недійсний.
async function verifyWithGoogle(idToken: string): Promise<GoogleIdentity> {
  const ticket = await client.verifyIdToken({ idToken, audience: config.googleClientId });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error('Incomplete token payload');
  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: p.email_verified === true,
    hd: p.hd,
    name: p.name,
  };
}

// Тестовий режим: токен виду "test:<email>", hd береться з домену пошти.
function verifyFake(idToken: string): GoogleIdentity {
  if (!idToken.startsWith('test:')) throw new Error('Not a test token');
  const email = idToken.slice('test:'.length).toLowerCase();
  return {
    sub: `test-${email}`,
    email,
    emailVerified: true,
    hd: email.includes('@') ? email.split('@')[1] : undefined,
  };
}

export async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
  return config.fakeAuth ? verifyFake(idToken) : verifyWithGoogle(idToken);
}

// Єдине джерело істини про домен: hd, email_verified і суфікс пошти.
export function checkLnuIdentity(id: GoogleIdentity): 'NON_LNU_EMAIL' | null {
  const suffix = `@${config.allowedEmailDomain}`;
  if (!id.emailVerified) return 'NON_LNU_EMAIL';
  if (id.hd !== config.allowedEmailDomain) return 'NON_LNU_EMAIL';
  if (!id.email.endsWith(suffix)) return 'NON_LNU_EMAIL';
  return null;
}
