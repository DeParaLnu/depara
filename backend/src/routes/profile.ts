import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { prisma } from '../db';
import { canDeleteAccount } from '../lib/accountDeletion';
import { isSubgroup, isUuid } from '../lib/validation';
import { requireAuth } from '../plugins/auth';

// F2: список груп і вибір своєї
export async function profileRoutes(app: FastifyInstance) {
  app.get('/groups', { preHandler: requireAuth }, async () => {
    const groups = await prisma.studyGroup.findMany({
      include: { faculty: true },
      orderBy: { code: 'asc' },
    });
    return groups.map((g) => ({
      id: g.id,
      code: g.code,
      course: g.course,
      // Онбординг показує студентам цей рядок у списку факультетів, тож повна назва, а не short_name
      faculty: g.faculty.name,
    }));
  });

  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      groupId: user.groupId,
      subgroup: user.subgroup,
      reminderMinutes: user.reminderMinutes,
    };
  });

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const { groupId, subgroup } = (req.body ?? {}) as {
      groupId?: unknown;
      subgroup?: unknown;
    };
    if (!groupId) return reply.code(400).send({ error: 'GROUP_REQUIRED' });
    if (!isUuid(groupId)) return reply.code(400).send({ error: 'INVALID_GROUP_ID' });
    if (subgroup !== undefined && !isSubgroup(subgroup)) {
      return reply.code(400).send({ error: 'INVALID_SUBGROUP' });
    }
    if (!(await prisma.studyGroup.findUnique({ where: { id: groupId } }))) {
      return reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
    }
    // Access-токен живе 15 хв і після видалення акаунта ще дійсний: відсутній користувач це 401, а не 500
    const updated = await prisma.user.updateMany({
      where: { id: req.userId },
      data: { groupId, subgroup: (subgroup as number | undefined) ?? 0 },
    });
    if (updated.count === 0) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return { id: req.userId, groupId, subgroup: (subgroup as number | undefined) ?? 0 };
  });

  // Видалення власного акаунта (вимога магазинів застосунків). Запис користувача видаляється повністю
  // (пошта, ім'я, налаштування, токени пристроїв); заміни, створені старостою, лишаються без автора.
  // Refresh-сесії в Redis з цього моменту мертві: /auth/refresh не знаходить користувача.
  app.delete('/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    const otherAdmins = user.role === 'ADMIN' ? await prisma.user.count({ where: { role: 'ADMIN', id: { not: user.id } } }) : 0;
    const check = canDeleteAccount(user, otherAdmins, config.adminEmails);
    if (!check.ok) return reply.code(409).send({ error: check.error });

    await prisma.user.delete({ where: { id: user.id } });
    req.log.info({ userId: user.id }, 'акаунт видалено');
    return reply.code(204).send();
  });
}
