import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { prisma } from '../db';
import { canDeleteAccount } from '../lib/accountDeletion';
import { parseProfilePatch, rejectPatch, resolvePatch } from '../lib/profilePatch';
import { requireAuth } from '../plugins/auth';

type Profile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  groupId: string | null;
  subgroup: number;
  reminderMinutes: number;
  notifySubstitutions: boolean;
};

const toMe = (user: Profile) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  groupId: user.groupId,
  subgroup: user.subgroup,
  reminderMinutes: user.reminderMinutes,
  notifySubstitutions: user.notifySubstitutions,
});

// F2: список груп і вибір своєї; F9: профіль і налаштування
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
    return toMe(user);
  });

  // Змінює лише передані поля: groupId, subgroup, reminderMinutes, notifySubstitutions. Відповідь як у GET /me.
  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = parseProfilePatch(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const { patch } = parsed;

    if (patch.groupId && !(await prisma.studyGroup.findUnique({ where: { id: patch.groupId } }))) {
      return reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
    }
    // Access-токен живе 15 хв і після видалення акаунта ще дійсний: відсутній користувач це 401, а не 500
    // Рішення (чи можна, що робити з підгрупою) залежать від ролі й групи. Оновлення йде лише якщо в базі досі
    // ті самі роль і група: якщо адмін змінив їх між читанням і записом, рішення приймається заново
    for (let attempt = 0; attempt < 3; attempt++) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true, groupId: true } });
      if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
      const rejected = rejectPatch(user, patch);
      if (rejected) return reply.code(rejected.status).send({ error: rejected.error });
      const updated = await prisma.user.updateManyAndReturn({
        where: { id: req.userId, role: user.role, groupId: user.groupId },
        data: resolvePatch(user, patch),
      });
      if (updated.length > 0) return toMe(updated[0]);
    }
    return reply.code(409).send({ error: 'PROFILE_CHANGED' }); // профіль змінювали тричі поспіль: клієнт повторить
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
