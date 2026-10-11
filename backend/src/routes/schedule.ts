import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '../db';
import { mondayOf } from '../lib/dates';
import { requireAuth } from '../plugins/auth';

// F3: розклад на тиждень з ETag
export async function scheduleRoutes(app: FastifyInstance) {
  app.get('/schedule/week', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.groupId) return reply.code(409).send({ error: 'GROUP_NOT_SET' });

    const { date } = req.query as { date?: string };
    const start = mondayOf(date ? new Date(`${date}T00:00:00Z`) : new Date());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    const lessons = await prisma.lesson.findMany({
      where: {
        groupId: user.groupId,
        date: { gte: start, lte: end },
        // subgroup 0 у користувача = бачити всі підгрупи
        ...(user.subgroup === 0 ? {} : { subgroup: { in: [0, user.subgroup] } }),
      },
      include: {
        pair: true,
        teacher: true,
        classroom: { include: { building: true } },
        substitution: true,
      },
      orderBy: [{ date: 'asc' }, { pairNumber: 'asc' }, { subgroup: 'asc' }],
    });

    const body = {
      weekStart: start.toISOString().slice(0, 10),
      lessons: lessons.map((l) => ({
        id: l.id,
        date: l.date.toISOString().slice(0, 10),
        pairNumber: l.pairNumber,
        start: l.pair.startTime.toISOString().slice(11, 16),
        end: l.pair.endTime.toISOString().slice(11, 16),
        subject: l.subject,
        type: l.type,
        audience: l.audience,
        subgroup: l.subgroup,
        teacher: l.teacher?.fullName ?? null,
        room: l.classroom ? `${l.classroom.number}/${l.classroom.building.code}` : null,
        substitution: l.substitution
          ? { kind: l.substitution.kind, comment: l.substitution.comment }
          : null,
      })),
    };

    const json = JSON.stringify(body);
    const etag = `"${createHash('sha1').update(json).digest('hex')}"`;
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }
    return reply.type('application/json').send(json);
  });
}
