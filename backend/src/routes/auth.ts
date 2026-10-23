import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config';
import { prisma } from '../db';
import { checkIdentity, verifyIdToken } from '../lib/microsoft';
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '../lib/tokens';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

async function startSession(userId: string, deviceId: string) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId, deviceId),
  };
}

function publicUser(u: { id: string; email: string; role: string; groupId: string | null }) {
  return { id: u.id, email: u.email, role: u.role, groupId: u.groupId };
}

// F1: вхід через Microsoft Entra, оновлення і вихід
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/microsoft', async (req, reply: FastifyReply) => {
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
    if (byEmail?.microsoftOid) return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });

    let user;
    try {
      if (byOid) {
        user = await prisma.user.update({ where: { id: byOid.id }, data: { email: identity.email, ...adminRole } });
      } else if (byEmail) {
        // Прив'язуємо лише вільний запис і робимо це одним умовним UPDATE: якщо між перевіркою й записом
        // його встиг зайняти інший oid (два одночасні перші входи), цей вхід отримує 409
        const claimed = await prisma.user.updateMany({
          where: { id: byEmail.id, microsoftOid: null },
          data: { microsoftOid: identity.oid, ...adminRole },
        });
        if (claimed.count === 0) return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });
        user = await prisma.user.findUniqueOrThrow({ where: { id: byEmail.id } });
      } else {
        user = await prisma.user.create({
          data: {
            email: identity.email,
            microsoftOid: identity.oid,
            fullName: identity.name ?? identity.email.split('@')[0],
            role: isBootstrapAdmin ? 'ADMIN' : 'STUDENT',
          },
        });
      }
    } catch (e) {
      // Нова пошта вже належить іншому запису (або гонка двох створень): не вгадуємо, хто з них хто
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return reply.code(409).send({ error: 'ACCOUNT_CONFLICT' });
      }
      throw e;
    }

    return {
      ...(await startSession(user.id, deviceId)),
      user: publicUser(user),
      needsOnboarding: user.groupId === null,
    };
  });

  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken, deviceId } = (req.body ?? {}) as {
      refreshToken?: unknown;
      deviceId?: unknown;
    };
    if (!isNonEmptyString(refreshToken) || !isNonEmptyString(deviceId)) {
      return reply.code(400).send({ error: 'REFRESH_TOKEN_AND_DEVICE_REQUIRED' });
    }
    const session = await consumeRefreshToken(refreshToken, deviceId);
    if (!session) return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });

    return startSession(user.id, deviceId);
  });

  app.post('/auth/logout', async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };
    if (isNonEmptyString(refreshToken)) await revokeRefreshToken(refreshToken);
    return reply.code(204).send();
  });
}
