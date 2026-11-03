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

const signRefresh = (userId: string, jti: string): string =>
  jwt.sign({ sub: userId, typ: 'refresh', jti } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.refreshTokenTtlSeconds,
  });

// Видає refresh-токен і записує сесію в Redis: refresh:{jti} = hash(userId, deviceId), TTL 30 днів.
export async function issueRefreshToken(userId: string, deviceId: string): Promise<string> {
  const jti = randomUUID();
  await redis.set(sessionKey(jti), fingerprint(userId, deviceId), 'EX', config.refreshTokenTtlSeconds);
  return signRefresh(userId, jti);
}

const rotatedKey = (jti: string) => `refresh-rotated:${jti}`;

export interface RotatedSession {
  userId: string;
  refreshToken: string;
}

// Ротація одним атомарним кроком Redis: видаляємо стару сесію (GETDEL), якщо вона належить цьому пристрою,
// записуємо нову і запис для повтору. Окремі команди лишали б вікно, у якому збій Redis (командний таймаут)
// між ними залишив би клієнта без жодної сесії, а паралельний повтор побачив би стару сесію вже видаленою,
// а запис повтору ще не створеним.
// Повертає 1 (обміняно), -1 (стара сесія була, але іншого пристрою: вона вже видалена), 0 (старої сесії немає).
const ROTATE_SCRIPT = `
local old = redis.call('GETDEL', KEYS[1])
if not old then return 0 end
if old ~= ARGV[1] then return -1 end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
if tonumber(ARGV[4]) > 0 then redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[4]) end
return 1
`;

// Ротація: стара сесія одноразова, вона має збігатися з userId і deviceId. Для повтору запиту після втраченої
// відповіді нову пару запам'ятовуємо на refreshReuseGraceSeconds.
export async function rotateRefreshToken(token: string, deviceId: string): Promise<RotatedSession | null> {
  let p: TokenPayload;
  try {
    p = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
  if (p.typ !== 'refresh' || !p.jti) return null;

  const fp = fingerprint(p.sub, deviceId);
  const nextJti = randomUUID();
  const nextToken = signRefresh(p.sub, nextJti);
  const grace = config.refreshReuseGraceSeconds;
  const replay = JSON.stringify({ fp, token: nextToken, jti: nextJti });

  const outcome = (await redis.eval(
    ROTATE_SCRIPT,
    3,
    sessionKey(p.jti),
    sessionKey(nextJti),
    rotatedKey(p.jti),
    fp,
    config.refreshTokenTtlSeconds,
    replay,
    grace,
  )) as number;
  if (outcome === 1) return { userId: p.sub, refreshToken: nextToken };
  if (outcome === -1 || grace === 0) return null;

  // Токен уже обміняли: це повтор лише якщо той самий пристрій і нова пара ще не використана.
  // Після першого ж використання нової пари старий токен знову відхиляється (як і раніше).
  const raw = await redis.get(rotatedKey(p.jti));
  if (!raw) return null;
  const prev = JSON.parse(raw) as { fp: string; token: string; jti: string };
  if (prev.fp !== fp || !(await redis.exists(sessionKey(prev.jti)))) return null;
  return { userId: p.sub, refreshToken: prev.token };
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
