import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '../db';
import { mondayOf } from '../lib/dates';
import { isIsoDate, isUuid } from '../lib/validation';
import { requireAuth } from '../plugins/auth';
import { publicGuard } from '../plugins/publicApi';

type RoomWithBuilding = { building: { code: string; name: string; address: string } } | null;

// Корпус аудиторії для екрана деталей пари (назва, адреса, маршрут)
const buildingOf = (room: RoomWithBuilding) =>
  room ? { code: room.building.code, name: room.building.name, address: room.building.address } : null;

// Розклад тижня для групи й підгрупи з ETag. Спільна частина /schedule/week (група з профілю)
// і /public/schedule/week (група з параметрів запиту, для гостей без входу).
async function sendWeek(
  req: FastifyRequest,
  reply: FastifyReply,
  groupId: string,
  subgroup: number,
  date: string | undefined,
) {
  const start = mondayOf(date ? new Date(`${date}T00:00:00Z`) : new Date());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const lessons = await prisma.lesson.findMany({
    where: {
      groupId,
      date: { gte: start, lte: end },
      // subgroup 0 = бачити всі підгрупи
      ...(subgroup === 0 ? {} : { subgroup: { in: [0, subgroup] } }),
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
  const published = lessons.length > 0 || (await prisma.lesson.count({ where: { groupId }, take: 1 })) > 0;

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
}

// F3: розклад на тиждень
export async function scheduleRoutes(app: FastifyInstance) {
  app.get('/schedule/week', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.groupId) return reply.code(409).send({ error: 'GROUP_NOT_SET' });

    const { date } = req.query as { date?: string };
    if (date !== undefined && !isIsoDate(date)) {
      return reply.code(400).send({ error: 'INVALID_DATE' });
    }
    return sendWeek(req, reply, user.groupId, user.subgroup, date);
  });

  // F10: те саме для гостя без входу. Групу й підгрупу гість передає в запиті (зберігає у себе на телефоні).
  app.get('/public/schedule/week', { preHandler: publicGuard }, async (req, reply) => {
    const { groupId, subgroup, date } = req.query as { groupId?: unknown; subgroup?: unknown; date?: unknown };
    // Повторений параметр дає масив, а не рядок: такі значення відхиляємо перевірками нижче
    if (!isUuid(groupId)) return reply.code(400).send({ error: 'INVALID_GROUP_ID' });
    if (subgroup !== undefined && (typeof subgroup !== 'string' || !/^[0-2]$/.test(subgroup))) {
      return reply.code(400).send({ error: 'INVALID_SUBGROUP' });
    }
    const sub = subgroup === undefined ? 0 : Number(subgroup);
    if (date !== undefined && !isIsoDate(date)) return reply.code(400).send({ error: 'INVALID_DATE' });
    if (!(await prisma.studyGroup.findUnique({ where: { id: groupId } }))) {
      return reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
    }
    return sendWeek(req, reply, groupId, sub, date);
  });
}
