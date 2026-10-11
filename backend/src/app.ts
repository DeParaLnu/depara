import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret';
const ALLOWED_DOMAIN = '@lnu.edu.ua';
// Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
const FAKE_AUTH =
  process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = (x.getUTCDay() + 6) % 7; // понеділок = 0
  x.setUTCDate(x.getUTCDate() - dayOfWeek);
  return x;
}

async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  // F1: вхід. Справжню перевірку Google-токена додасте окремим PR.
  app.post('/auth/google', async (req, reply) => {
    const { idToken } = (req.body ?? {}) as { idToken?: string };

    if (!FAKE_AUTH) {
      return reply.code(501).send({ error: 'REAL_GOOGLE_AUTH_NOT_IMPLEMENTED' });
    }
    if (!idToken || !idToken.startsWith('test:')) {
      return reply.code(401).send({ error: 'INVALID_TOKEN' });
    }

    const email = idToken.slice('test:'.length).toLowerCase();
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      return reply.code(403).send({ error: 'NOT_LNU_EMAIL' });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        googleSub: `test-${email}`,
        fullName: email.split('@')[0],
      },
    });

    const accessToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '15m' });
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, groupId: user.groupId },
    };
  });

  // F2: список груп і вибір своєї
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

  // F3: розклад на тиждень з ETag
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

  // F5: пошук аудиторій
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

  return app;
}
