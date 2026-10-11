import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { isUuid } from '../lib/validation';
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
      faculty: g.faculty.shortName,
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
    if (subgroup !== undefined && (!Number.isInteger(subgroup) || (subgroup as number) < 0 || (subgroup as number) > 2)) {
      return reply.code(400).send({ error: 'INVALID_SUBGROUP' });
    }
    if (!(await prisma.studyGroup.findUnique({ where: { id: groupId } }))) {
      return reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { groupId, subgroup: (subgroup as number | undefined) ?? 0 },
    });
    return { id: user.id, groupId: user.groupId, subgroup: user.subgroup };
  });
}
