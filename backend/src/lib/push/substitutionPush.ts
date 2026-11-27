import { config } from '../../config';
import { prisma } from '../../db';
import { toRoom } from '../rooms';
import { deliveredTokens } from './delivered';
import { sendExpoPush, type PushMessage, type SendResult } from './expo';
import { retractionMessage, substitutionMessage } from './substitutionMessage';

type Send = (messages: PushMessage[]) => Promise<SendResult>;

const sendViaExpo: Send = (m) => sendExpoPush(m, { url: config.expoPushUrl, accessToken: config.expoAccessToken });

const emptyResult = (): SendResult => ({ sent: [], invalid: [], retry: [], failed: [], errors: [] });

// Ключ заміщення один на пару: «скасовано» чи нова заміна замінюють на телефоні попередній пуш про неї
const replaceKey = (lessonId: string) => ({ collapseId: `substitution-${lessonId}`, tag: `substitution-${lessonId}` });

// Застосунок за data відкриває потрібну пару (дата тижня й id пари)
const pushData = (substitutionId: string, lesson: { id: string; date: Date }) => ({
  type: 'substitution',
  substitutionId,
  lessonId: lesson.id,
  date: lesson.date.toISOString().slice(0, 10),
});

async function sendAndPrune(messages: PushMessage[], send: Send): Promise<SendResult> {
  const result = await send(messages);
  if (result.invalid.length > 0) {
    await prisma.notificationToken.deleteMany({ where: { pushToken: { in: result.invalid } } });
  }
  return result;
}

// Кому і що відправити про заміну. Отримувачі рахуються в момент відправки, а не створення заміни: якщо заміну
// вже скасовано, пуш не йде; хто встиг вимкнути сповіщення, теж не отримає.
export async function deliverSubstitutionPush(
  substitutionId: string,
  onlyTokens?: string[],
  send: Send = sendViaExpo,
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
  if (rows.length === 0) return emptyResult();

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
  const data = pushData(sub.id, lesson);
  return sendAndPrune(rows.map((r) => ({ to: r.pushToken, title, body, data, ...replaceKey(lesson.id) })), send);
}

export interface Retraction {
  substitutionId: string;
  lessonId: string;
}

// Заміну скасували: тим, хто отримав пуш про неї, надсилаємо коротке повідомлення з тим самим ключем заміщення,
// і старий пуш зникає з телефона. Доставлене сповіщення сервер стерти не може, лише замінити.
export async function deliverRetractionPush(
  { substitutionId, lessonId }: Retraction,
  onlyTokens?: string[],
  send: Send = sendViaExpo,
): Promise<SendResult | null> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { pair: true, substitution: true } });
  // Пари вже нема, або на неї створили нову заміну: її пуш сам замінить старий, а «скасовано» лише заплутало б
  if (!lesson || lesson.substitution) return null;
  const delivered = onlyTokens ?? (await deliveredTokens(substitutionId));
  if (delivered.length === 0) return null;
  const rows = await prisma.notificationToken.findMany({
    where: { pushToken: { in: delivered }, user: { notifySubstitutions: true } },
    select: { pushToken: true },
  });
  if (rows.length === 0) return emptyResult();

  const { title, body } = retractionMessage({
    subject: lesson.subject,
    date: lesson.date,
    pairNumber: lesson.pairNumber,
    startTime: lesson.pair.startTime,
  });
  // retracted: застосунок не прибирає це сповіщення разом із застарілими
  const data = { ...pushData(substitutionId, lesson), retracted: true };
  return sendAndPrune(rows.map((r) => ({ to: r.pushToken, title, body, data, ...replaceKey(lesson.id) })), send);
}
