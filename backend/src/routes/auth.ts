import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config';
import { authRateLimit, passwordAccountRateLimit, passwordIpRateLimit, passwordRateLimit } from '../plugins/rateLimit';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { BusyError, limitConcurrency } from '../lib/concurrency';
import { checkIdentity, verifyIdToken } from '../lib/microsoft';
import { dummyHash, PASSWORD_MAX_LENGTH, verifyPassword } from '../lib/password';
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../lib/tokens';
import { redisUsable } from '../redis';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

async function startSession(userId: string, deviceId: string) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId, deviceId),
  };
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

function publicUser(u: { id: string; email: string; role: string; groupId: string | null }) {
  return { id: u.id, email: u.email, role: u.role, groupId: u.groupId };
}

// F1: вхід через Microsoft Entra або за паролем, оновлення і вихід
export async function authRoutes(app: FastifyInstance, opts: { authPerMinute?: number; passwordPerMinute?: number } = {}) {
  const limited = { config: { rateLimit: authRateLimit(opts.authPerMinute ?? config.rateLimitAuthPerMinute) } };
  const passwordPerMinute = opts.passwordPerMinute ?? config.rateLimitPasswordPerMinute;
  const extraPasswordLimits = [passwordIpRateLimit, passwordAccountRateLimit].map((limit) =>
    app.createRateLimit(limit(passwordPerMinute)),
  );
  // Перевірка scrypt займає потік libuv: не більше двох одночасно, щоб входи не гальмували решту застосунку
  const passwordCheck = limitConcurrency(2, 50);

  app.post('/auth/login', { config: { rateLimit: passwordRateLimit(passwordPerMinute) } }, async (req, reply) => {
    const { email, password, deviceId } = (req.body ?? {}) as { email?: unknown; password?: unknown; deviceId?: unknown };
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return reply.code(400).send({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    }
    if (!isNonEmptyString(deviceId)) return reply.code(400).send({ error: 'DEVICE_ID_REQUIRED' });
    const unavailable = () => reply.code(503).send({ error: 'TEMPORARILY_UNAVAILABLE', requestId: req.id });
    // Без Redis не діють ліміти й нікуди записати сесію. Відмова до перевірки пароля: інакше 401 проти 503
    // підказувало б, чи пароль правильний, а кількість спроб ніхто не обмежував би
    if (!redisUsable()) return unavailable();
    for (const checkLimit of extraPasswordLimits) {
      const limit = await checkLimit(req);
      if (!limit.isAllowed && limit.isExceeded) {
        return reply.code(429).send({ error: 'RATE_LIMITED', retryAfterSeconds: limit.ttlInSeconds });
      }
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    let matches: boolean;
    try {
      matches =
        password.length <= PASSWORD_MAX_LENGTH &&
        (await passwordCheck(async () => verifyPassword(password, user?.passwordHash ?? (await dummyHash()))));
    } catch (e) {
      if (e instanceof BusyError) return unavailable();
      throw e;
    }
    // Одна відповідь на невідому пошту, акаунт без пароля й хибний пароль: не підказуємо, які пошти зареєстровані
    if (!user?.passwordHash || !matches) {
      audit(req, 'auth.password.denied', { target: user?.id }, 'warn');
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    return {
      ...(await startSession(user.id, deviceId)),
      user: publicUser(user),
      needsOnboarding: user.groupId === null,
    };
  });

  app.post('/auth/microsoft', limited, async (req, reply: FastifyReply) => {
    const { idToken, deviceId } = (req.body ?? {}) as { idToken?: unknown; deviceId?: unknown };
    if (!isNonEmptyString(idToken)) return reply.code(400).send({ error: 'ID_TOKEN_REQUIRED' });
    if (!isNonEmptyString(deviceId)) return reply.code(400).send({ error: 'DEVICE_ID_REQUIRED' });
    if (!config.fakeAuth && !(config.microsoftClientId && config.microsoftTenantId)) {
      return reply.code(503).send({ error: 'AUTH_NOT_CONFIGURED' });
    }

    let identity;
    try {
      identity = await verifyIdToken(idToken);
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN' });
    }

    const denied = checkIdentity(identity);
    if (denied) return reply.code(403).send({ error: denied });

    // Пошти зі змінної ADMIN_EMAILS отримують роль ADMIN (так з'являється перший адмін)
    const isBootstrapAdmin = config.adminEmails.includes(identity.email);
    const adminRole = isBootstrapAdmin ? { role: 'ADMIN' as const } : {};
    // Основний ключ: oid (після зміни пошти/UPN в Entra акаунт лишається тим самим). Пошта лише знаходить
    // запис, який ще не прив'язаний до жодного oid (перший вхід після міграції). Запис, уже прив'язаний
    // до іншого oid, за поштою не перепризначаємо: claim email в Entra змінний, і інакше чужий акаунт
    // з тією самою поштою отримав би роль, групу й сесію попереднього власника.
    const byOid = await prisma.user.findUnique({ where: { microsoftOid: identity.oid } });
    const byEmail = byOid ? null : await prisma.user.findUnique({ where: { email: identity.email } });
    // (той самий oid тут можливий, якщо паралельний запит власника встиг прив'язати запис між двома пошуками)
    if (byEmail?.microsoftOid && byEmail.microsoftOid !== identity.oid) {
      return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });
    }

    let user;
    try {
      if (byOid) {
        user = await prisma.user.update({ where: { id: byOid.id }, data: { email: identity.email, ...adminRole } });
      } else if (byEmail) {
        // Прив'язуємо лише вільний запис і робимо це одним умовним UPDATE: якщо між перевіркою й записом
        // його встиг зайняти інший oid (два одночасні перші входи), цей вхід отримує 409. Якщо ж запис
        // зайняв той самий oid (подвійний тап, повтор запиту клієнта), це той самий власник: успіх.
        const claimed = await prisma.user.updateMany({
          where: { id: byEmail.id, microsoftOid: null },
          data: { microsoftOid: identity.oid, ...adminRole },
        });
        user = await prisma.user.findUniqueOrThrow({ where: { id: byEmail.id } });
        if (claimed.count === 0 && user.microsoftOid !== identity.oid) {
          return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });
        }
      } else {
        try {
          user = await prisma.user.create({
            data: {
              email: identity.email,
              microsoftOid: identity.oid,
              fullName: identity.name ?? identity.email.split('@')[0],
              role: isBootstrapAdmin ? 'ADMIN' : 'STUDENT',
            },
          });
        } catch (e) {
          // Паралельний перший вхід того самого oid (подвійний тап, повтор) уже створив запис: це той самий
          // власник, беремо його. Якщо запису з цим oid нема, пошту зайняв хтось інший: далі це 409.
          if (!isUniqueViolation(e)) throw e;
          const winner = await prisma.user.findUnique({ where: { microsoftOid: identity.oid } });
          if (!winner) throw e;
          user = winner;
        }
      }
    } catch (e) {
      // Нова пошта вже належить іншому запису: не вгадуємо, хто з них хто
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });
      throw e;
    }

    // Найчутливіша зміна ролі відбувається без адміна, тому її обовʼязково пишемо в audit.
    // Попередня роль це роль знайденого запису; для нового користувача її немає.
    const previousRole = (byOid ?? byEmail)?.role ?? null;
    if (isBootstrapAdmin && previousRole !== 'ADMIN') {
      audit(req, 'user.role.bootstrap', { actor: 'ADMIN_EMAILS', target: user.id, from: previousRole, to: 'ADMIN' });
    }

    return {
      ...(await startSession(user.id, deviceId)),
      user: publicUser(user),
      needsOnboarding: user.groupId === null,
    };
  });

  app.post('/auth/refresh', limited, async (req, reply) => {
    const { refreshToken, deviceId } = (req.body ?? {}) as {
      refreshToken?: unknown;
      deviceId?: unknown;
    };
    if (!isNonEmptyString(refreshToken) || !isNonEmptyString(deviceId)) {
      return reply.code(400).send({ error: 'REFRESH_TOKEN_AND_DEVICE_REQUIRED' });
    }
    const session = await rotateRefreshToken(refreshToken, deviceId);
    if (!session) return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      await revokeRefreshToken(session.refreshToken);
      return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    }

    return { accessToken: signAccessToken(user.id), refreshToken: session.refreshToken };
  });

  app.post('/auth/logout', limited, async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };
    if (isNonEmptyString(refreshToken)) await revokeRefreshToken(refreshToken);
    return reply.code(204).send();
  });
}
