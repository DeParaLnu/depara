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

// Підписує refresh-токен і записує сесію в Redis: refresh:{jti} = hash(userId, deviceId), TTL 30 днів.
async function createRefreshToken(userId: string, deviceId: string): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  await redis.set(sessionKey(jti), fingerprint(userId, deviceId), 'EX', config.refreshTokenTtlSeconds);
  const token = jwt.sign({ sub: userId, typ: 'refresh', jti } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.refreshTokenTtlSeconds,
  });
  return { token, jti };
}

export async function issueRefreshToken(userId: string, deviceId: string): Promise<string> {
  return (await createRefreshToken(userId, deviceId)).token;
}

const rotatedKey = (jti: string) => `refresh-rotated:${jti}`;

export interface RotatedSession {
  userId: string;
  refreshToken: string;
}

// Ротація: стару сесію видаляємо (одноразово, GETDEL), вона має збігатися з userId і deviceId, і видаємо нову.
// Для повтору запиту після втраченої відповіді нову пару запам'ятовуємо на refreshReuseGraceSeconds.
export async function rotateRefreshToken(token: string, deviceId: string): Promise<RotatedSession | null> {
  let p: TokenPayload;
  try {
    p = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
  if (p.typ !== 'refresh' || !p.jti) return null;

  const fp = fingerprint(p.sub, deviceId);
  const stored = await redis.getdel(sessionKey(p.jti));
  if (stored === fp) {
    const next = await createRefreshToken(p.sub, deviceId);
    if (config.refreshReuseGraceSeconds > 0) {
      const replay = JSON.stringify({ fp, token: next.token, jti: next.jti });
      await redis.set(rotatedKey(p.jti), replay, 'EX', config.refreshReuseGraceSeconds);
    }
    return { userId: p.sub, refreshToken: next.token };
  }
  // Сесія була, але належала іншому пристрою: вона вже видалена вище, повтор не допускаємо
  if (stored || config.refreshReuseGraceSeconds === 0) return null;

  // Токен уже обміняли: це повтор лише якщо той самий пристрій і нова пара ще не використана.
  // Після першого ж використання нової пари старий токен знову відхиляється (як і раніше).
  const raw = await redis.get(rotatedKey(p.jti));
  if (!raw) return null;
  const replay = JSON.parse(raw) as { fp: string; token: string; jti: string };
  if (replay.fp !== fp || !(await redis.exists(sessionKey(replay.jti)))) return null;
  return { userId: p.sub, refreshToken: replay.token };
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
