import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { isSearchQuery } from '../lib/validation';
import { requireAuth } from '../plugins/auth';

// Довідник викладачів: потрібен старості для вибору нового викладача в заміні
export async function teacherRoutes(app: FastifyInstance) {
  app.get('/teachers', { preHandler: requireAuth }, async (req, reply) => {
    const { q } = req.query as { q?: unknown };
    if (!isSearchQuery(q)) return reply.code(400).send({ error: 'INVALID_QUERY' });
    const teachers = await prisma.teacher.findMany({
      where: q ? { fullName: { contains: q, mode: 'insensitive' } } : {},
      take: 20,
      orderBy: { fullName: 'asc' },
    });
    return teachers.map((t) => ({ id: t.id, fullName: t.fullName, position: t.position }));
  });
}
