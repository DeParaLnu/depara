import { SubstitutionKind } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { invalidateGroupSchedule } from '../lib/cache';
import { isIsoDate, isUuid } from '../lib/validation';
import { requireRole } from '../plugins/roles';

const KINDS = Object.values(SubstitutionKind) as string[];
const MAX_COMMENT = 500;

interface Body {
  lessonId?: unknown;
  kind?: unknown;
  newTeacherId?: unknown;
  newClassroomId?: unknown;
  newDate?: unknown;
  newPairNumber?: unknown;
  comment?: unknown;
}

// F6: заміни (HEADMAN: лише своя група, ADMIN: будь-яка)
export async function substitutionRoutes(app: FastifyInstance) {
  app.post('/substitutions', { preHandler: requireRole('HEADMAN', 'ADMIN') }, async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    const user = req.currentUser!;
    const bad = (error: string) => reply.code(400).send({ error });

    if (!isUuid(b.lessonId)) return bad('INVALID_LESSON_ID');
    if (typeof b.kind !== 'string' || !KINDS.includes(b.kind)) return reply.code(400).send({ error: 'INVALID_KIND', allowed: KINDS });
    const kind = b.kind as SubstitutionKind;

    if (b.comment != null && (typeof b.comment !== 'string' || b.comment.length > MAX_COMMENT)) return bad('INVALID_COMMENT');
    if (b.newTeacherId != null && !isUuid(b.newTeacherId)) return bad('INVALID_TEACHER_ID');
    if (b.newClassroomId != null && !isUuid(b.newClassroomId)) return bad('INVALID_CLASSROOM_ID');
    if (b.newDate != null && !isIsoDate(b.newDate)) return bad('INVALID_DATE');
    if (b.newPairNumber != null && (!Number.isInteger(b.newPairNumber) || (b.newPairNumber as number) < 1)) return bad('INVALID_PAIR_NUMBER');

    const lesson = await prisma.lesson.findUnique({ where: { id: b.lessonId } });
    if (!lesson) return reply.code(404).send({ error: 'LESSON_NOT_FOUND' });
    if (user.role === 'HEADMAN' && lesson.groupId !== user.groupId) {
      return reply.code(403).send({ error: 'FORBIDDEN_GROUP' });
    }
    if (await prisma.substitution.findUnique({ where: { lessonId: lesson.id } })) {
      return reply.code(409).send({ error: 'SUBSTITUTION_EXISTS' });
    }

    // Які поля обов'язкові залежить від типу заміни; зайві поля не зберігаємо
    const newTeacherId = (b.newTeacherId as string | null | undefined) ?? null;
    const newClassroomId = (b.newClassroomId as string | null | undefined) ?? null;
    const newDate = (b.newDate as string | null | undefined) ?? null;
    const newPairNumber = (b.newPairNumber as number | null | undefined) ?? null;

    let data: { newTeacherId: string | null; newClassroomId: string | null; newDate: Date | null; newPairNumber: number | null };
    switch (kind) {
      case 'CANCELLED':
        data = { newTeacherId: null, newClassroomId: null, newDate: null, newPairNumber: null };
        break;
      case 'REPLACED':
        if (!newTeacherId) return bad('NEW_TEACHER_REQUIRED');
        data = { newTeacherId, newClassroomId, newDate: null, newPairNumber: null };
        break;
      case 'ROOM_CHANGED':
        if (!newClassroomId) return bad('NEW_CLASSROOM_REQUIRED');
        data = { newTeacherId: null, newClassroomId, newDate: null, newPairNumber: null };
        break;
      case 'MOVED': {
        if (!newDate && !newPairNumber) return bad('NEW_DATE_OR_PAIR_REQUIRED');
        const sameDate = !newDate || newDate === lesson.date.toISOString().slice(0, 10);
        const samePair = !newPairNumber || newPairNumber === lesson.pairNumber;
        if (sameDate && samePair) return bad('MOVE_TARGET_SAME_AS_ORIGINAL');
        data = { newTeacherId: null, newClassroomId, newDate: newDate ? new Date(`${newDate}T00:00:00Z`) : null, newPairNumber };
        break;
      }
    }

    if (data.newTeacherId && !(await prisma.teacher.findUnique({ where: { id: data.newTeacherId } }))) return bad('TEACHER_NOT_FOUND');
    if (data.newClassroomId && !(await prisma.classroom.findUnique({ where: { id: data.newClassroomId } }))) return bad('CLASSROOM_NOT_FOUND');
    if (data.newPairNumber && !(await prisma.pairTime.findUnique({ where: { pairNumber: data.newPairNumber } }))) return bad('PAIR_NOT_FOUND');

    const sub = await prisma.substitution.create({
      data: { lessonId: lesson.id, kind, comment: (b.comment as string | null | undefined) ?? null, createdById: user.id, ...data },
    });
    await invalidateGroupSchedule(lesson.groupId);

    return reply.code(201).send({
      id: sub.id,
      lessonId: sub.lessonId,
      kind: sub.kind,
      newTeacherId: sub.newTeacherId,
      newClassroomId: sub.newClassroomId,
      newDate: sub.newDate?.toISOString().slice(0, 10) ?? null,
      newPairNumber: sub.newPairNumber,
      comment: sub.comment,
    });
  });

  // Скасування заміни: пара повертається до звичайного вигляду
  app.delete('/substitutions/:id', { preHandler: requireRole('HEADMAN', 'ADMIN') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.currentUser!;
    if (!isUuid(id)) return reply.code(400).send({ error: 'INVALID_ID' });

    const sub = await prisma.substitution.findUnique({ where: { id }, include: { lesson: true } });
    if (!sub) return reply.code(404).send({ error: 'SUBSTITUTION_NOT_FOUND' });
    if (user.role === 'HEADMAN' && sub.lesson.groupId !== user.groupId) {
      return reply.code(403).send({ error: 'FORBIDDEN_GROUP' });
    }

    await prisma.substitution.delete({ where: { id } });
    await invalidateGroupSchedule(sub.lesson.groupId);
    return reply.code(204).send();
  });
}
