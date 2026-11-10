import { config } from '../../config';
import { prisma } from '../../db';
import { toRoom } from '../rooms';
import { sendExpoPush, type PushMessage, type SendResult } from './expo';
import { substitutionMessage } from './substitutionMessage';

// Кому і що відправити про заміну. Отримувачі рахуються в момент відправки, а не створення заміни: якщо заміну
// вже скасовано, пуш не йде; хто встиг вимкнути сповіщення, теж не отримає.
export async function deliverSubstitutionPush(
  substitutionId: string,
  onlyTokens?: string[],
  send: (messages: PushMessage[]) => Promise<SendResult> = (m) =>
    sendExpoPush(m, { url: config.expoPushUrl, accessToken: config.expoAccessToken }),
): Promise<SendResult | null> {
  const sub = await prisma.substitution.findUnique({
    where: { id: substitutionId },
    include: {
      lesson: { include: { pair: true } },
      newTeacher: true,
      newClassroom: { include: { building: true } },
      newPair: true,
    },
  });
  if (!sub) return null; // заміну скасували раніше, ніж черга дійшла до пушу

  const { lesson } = sub;
  const rows = await prisma.notificationToken.findMany({
    where: {
      ...(onlyTokens ? { pushToken: { in: onlyTokens } } : {}),
      user: {
        groupId: lesson.groupId,
        notifySubstitutions: true,
        // автор заміни (староста) знає про неї і без пушу
        ...(sub.createdById ? { id: { not: sub.createdById } } : {}),
        // як у розкладі: пара підгрупи N видна студентам підгрупи N і тим, хто бачить усі (0)
        ...(lesson.subgroup === 0 ? {} : { subgroup: { in: [0, lesson.subgroup] } }),
      },
    },
    select: { pushToken: true },
  });
  if (rows.length === 0) return { sent: [], invalid: [], retry: [], failed: [], errors: [] };

  const { title, body } = substitutionMessage({
    kind: sub.kind,
    subject: lesson.subject,
    date: lesson.date,
    pairNumber: lesson.pairNumber,
    startTime: lesson.pair.startTime,
    comment: sub.comment,
    newTeacherName: sub.newTeacher?.fullName,
    newRoom: sub.newClassroom ? toRoom(sub.newClassroom).label : null,
    newDate: sub.newDate,
    newPairNumber: sub.newPairNumber,
    newStartTime: sub.newPair?.startTime,
  });
  // Застосунок за data відкриває потрібну пару (дата тижня й id пари)
  const data = { type: 'substitution', substitutionId: sub.id, lessonId: lesson.id, date: lesson.date.toISOString().slice(0, 10) };
  const result = await send(rows.map((r) => ({ to: r.pushToken, title, body, data })));

  if (result.invalid.length > 0) {
    await prisma.notificationToken.deleteMany({ where: { pushToken: { in: result.invalid } } });
  }
  return result;
}
