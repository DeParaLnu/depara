import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { normalizeRoom, toRoom } from '../lib/rooms';
import { requireAuth } from '../plugins/auth';

// F5: пошук аудиторій і довідник корпусів, за номером (q) і/або корпусом (building = літера корпусу)
export async function classroomRoutes(app: FastifyInstance) {
  // Довідник корпусів для чіпів-фільтрів і блоку «Корпуси»: клієнт не зашиває список у себе
  app.get('/buildings', { preHandler: requireAuth }, async () => {
    const buildings = await prisma.building.findMany({ orderBy: { code: 'asc' } });
    return buildings.map((b) => ({ code: b.code, name: b.name, address: b.address }));
  });

  app.get('/classrooms', { preHandler: requireAuth }, async (req, reply) => {
    const { q, building } = req.query as { q?: unknown; building?: unknown };
    // Повторений параметр (?building=А&building=Б) Fastify віддає масивом: це не рядок, відхиляємо
    if ((q !== undefined && typeof q !== 'string') || (building !== undefined && typeof building !== 'string')) {
      return reply.code(400).send({ error: 'INVALID_QUERY' });
    }
    // Запит у форматі «218/Т» шукає за номером і корпусом, тому корпус із q діє разом із фільтром building
    const { number, code } = normalizeRoom(q ?? '');
    const codes = [code, building?.trim()].filter(Boolean);
    const rooms = await prisma.classroom.findMany({
      where: {
        ...(number ? { number: { contains: number, mode: 'insensitive' } } : {}),
        AND: codes.map((c) => ({ building: { code: { equals: c, mode: 'insensitive' } } })),
      },
      include: { building: true },
      take: 20,
      orderBy: [{ number: 'asc' }, { building: { code: 'asc' } }],
    });
    return rooms.map(toRoom);
  });
}
