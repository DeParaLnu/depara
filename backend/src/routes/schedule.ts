import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '../db';
import { mondayOf } from '../lib/dates';
import { isIsoDate } from '../lib/validation';
import { requireAuth } from '../plugins/auth';

type RoomWithBuilding = { building: { code: string; name: string; address: string } } | null;

// Корпус аудиторії для екрана деталей пари (назва, адреса, маршрут)
const buildingOf = (room: RoomWithBuilding) =>
  room ? { code: room.building.code, name: room.building.name, address: room.building.address } : null;

// F3: розклад на тиждень з ETag
export async function scheduleRoutes(app: FastifyInstance) {
  app.get('/schedule/week', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.groupId) return reply.code(409).send({ error: 'GROUP_NOT_SET' });

    const { date } = req.query as { date?: string };
    if (date !== undefined && !isIsoDate(date)) {
      return reply.code(400).send({ error: 'INVALID_DATE' });
    }
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
        substitution: { include: { newTeacher: true, newClassroom: { include: { building: true } } } },
      },
      orderBy: [{ date: 'asc' }, { pairNumber: 'asc' }, { subgroup: 'asc' }],
    });

    // Порожній тиждень і «деканат ще не опублікував» різні стани: розклад опубліковано, якщо в групи є хоч одна пара.
    // Окрема перевірка потрібна лише для порожнього тижня.
    const published = lessons.length > 0 || (await prisma.lesson.count({ where: { groupId: user.groupId }, take: 1 })) > 0;

    const body = {
      weekStart: start.toISOString().slice(0, 10),
      published,
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
        building: buildingOf(l.classroom),
        substitution: l.substitution
          ? {
              id: l.substitution.id,
              kind: l.substitution.kind,
              comment: l.substitution.comment,
              newTeacher: l.substitution.newTeacher?.fullName ?? null,
              newRoom: l.substitution.newClassroom
                ? `${l.substitution.newClassroom.number}/${l.substitution.newClassroom.building.code}`
                : null,
              newBuilding: buildingOf(l.substitution.newClassroom),
              newDate: l.substitution.newDate?.toISOString().slice(0, 10) ?? null,
              newPairNumber: l.substitution.newPairNumber,
            }
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
