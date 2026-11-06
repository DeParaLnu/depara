import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { isExpoPushToken } from '../lib/push/expo';
import { requireAuth } from '../plugins/auth';

// Скільки пристроїв одного користувача отримують пуші: старіші токени відкидаються
export const MAX_DEVICES = 10;

const tokenOf = (body: unknown) => (body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined);

// F8: застосунок реєструє Expo push-токен пристрою після дозволу на сповіщення і прибирає його при виході
export async function pushTokenRoutes(app: FastifyInstance) {
  app.post('/me/push-token', { preHandler: requireAuth }, async (req, reply) => {
    const token = tokenOf(req.body);
    if (!isExpoPushToken(token)) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN' });
    const userId = req.userId!; // requireAuth гарантує
    // Access-токен ще дійсний після видалення акаунта: відсутній користувач це 401, а не 500 через зовнішній ключ
    if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    // Той самий пристрій під іншим акаунтом: токен переходить до нового власника, старий пушів більше не отримує
    await prisma.notificationToken.upsert({
      where: { pushToken: token },
      create: { userId, pushToken: token },
      update: { userId, lastSeenAt: new Date() },
    });
    const extra = await prisma.notificationToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (extra.length > 0) await prisma.notificationToken.deleteMany({ where: { id: { in: extra.map((t) => t.id) } } });
    return reply.code(204).send();
  });

  // Ідемпотентно: чужий чи вже видалений токен теж дає 204, але чужий не видаляється
  app.delete('/me/push-token', { preHandler: requireAuth }, async (req, reply) => {
    const token = tokenOf(req.body);
    if (!isExpoPushToken(token)) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN' });
    await prisma.notificationToken.deleteMany({ where: { pushToken: token, userId: req.userId } });
    return reply.code(204).send();
  });
}
