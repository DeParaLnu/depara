import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { requireAuth } from '../plugins/auth';
import { publicGuard } from '../plugins/publicApi';

// F5: пошук аудиторій, за номером (q) і/або корпусом (building = літера корпусу)
export async function classroomRoutes(app: FastifyInstance) {
  const searchClassrooms = async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, building } = req.query as { q?: unknown; building?: unknown };
    // Повторений параметр (?building=А&building=Б) Fastify віддає масивом: це не рядок, відхиляємо
    if ((q !== undefined && typeof q !== 'string') || (building !== undefined && typeof building !== 'string')) {
      return reply.code(400).send({ error: 'INVALID_QUERY' });
    }
    const code = building?.trim();
    const rooms = await prisma.classroom.findMany({
      where: {
        ...(q ? { number: { contains: q, mode: 'insensitive' } } : {}),
        ...(code ? { building: { code: { equals: code, mode: 'insensitive' } } } : {}),
      },
      include: { building: true },
      take: 20,
      orderBy: [{ number: 'asc' }, { building: { code: 'asc' } }],
    });
    return rooms.map((r) => ({
      id: r.id,
      number: r.number,
      label: `${r.number}/${r.building.code}`,
      building: { code: r.building.code, name: r.building.name, address: r.building.address },
    }));
  };
  app.get('/classrooms', { preHandler: requireAuth }, searchClassrooms);
  // F10: той самий пошук для гостя без входу
  app.get('/public/classrooms', { preHandler: publicGuard }, searchClassrooms);
}
