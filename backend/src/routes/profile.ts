import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
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

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const { groupId, subgroup } = (req.body ?? {}) as {
      groupId?: string;
      subgroup?: number;
    };
    if (!groupId) return reply.code(400).send({ error: 'GROUP_REQUIRED' });
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { groupId, subgroup: subgroup ?? 0 },
    });
    return { id: user.id, groupId: user.groupId, subgroup: user.subgroup };
  });
}
