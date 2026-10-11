import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireAuth } from '../plugins/auth';

// F5: пошук аудиторій
export async function classroomRoutes(app: FastifyInstance) {
  app.get('/classrooms', { preHandler: requireAuth }, async (req) => {
    const { q } = req.query as { q?: string };
    const rooms = await prisma.classroom.findMany({
      where: q ? { number: { contains: q, mode: 'insensitive' } } : {},
      include: { building: true },
      take: 20,
      orderBy: { number: 'asc' },
    });
    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      label: `${r.number}/${r.building.code}`,
      building: { code: r.building.code, name: r.building.name },
    }));
  });
}
