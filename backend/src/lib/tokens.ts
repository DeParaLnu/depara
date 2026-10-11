import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redis } from '../redis';

interface TokenPayload {
  sub: string;
  typ: 'access' | 'refresh';
  jti?: string;
}

const sessionKey = (jti: string) => `refresh:${jti}`;
const fingerprint = (userId: string, deviceId: string) =>
  createHash('sha256').update(`${userId}:${deviceId}`).digest('hex');

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'access' } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.accessTokenTtl,
  });
}

export type AccessCheck =
  | { ok: true; userId: string }
  | { ok: false; error: 'TOKEN_EXPIRED' | 'UNAUTHORIZED' };

export function verifyAccessToken(token: string): AccessCheck {
  try {
    const p = jwt.verify(token, config.jwtSecret) as TokenPayload;
    if (p.typ !== 'access') return { ok: false, error: 'UNAUTHORIZED' };
    return { ok: true, userId: p.sub };
  } catch (e) {
    return { ok: false, error: e instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED' };
  }
}

// Видає refresh-токен і записує сесію в Redis: refresh:{jti} = hash(userId, deviceId), TTL 30 днів.
export async function issueRefreshToken(userId: string, deviceId: string): Promise<string> {
  const jti = randomUUID();
  await redis.set(sessionKey(jti), fingerprint(userId, deviceId), 'EX', config.refreshTokenTtlSeconds);
  return jwt.sign({ sub: userId, typ: 'refresh', jti } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.refreshTokenTtlSeconds,
  });
}

// Ротація: стару сесію видаляємо (одноразово, GETDEL), вона має збігатися з userId і deviceId.
export async function consumeRefreshToken(
  token: string,
  deviceId: string,
): Promise<{ userId: string } | null> {
  let p: TokenPayload;
  try {
    p = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
  if (p.typ !== 'refresh' || !p.jti) return null;
  const stored = await redis.getdel(sessionKey(p.jti));
  if (!stored || stored !== fingerprint(p.sub, deviceId)) return null;
  return { userId: p.sub };
}

// Вихід: видаляє сесію. Недійсний токен ігноруємо (операція ідемпотентна).
export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const p = jwt.verify(token, config.jwtSecret) as TokenPayload;
    if (p.typ === 'refresh' && p.jti) await redis.del(sessionKey(p.jti));
  } catch {
    /* вже недійсний */
  }
}
