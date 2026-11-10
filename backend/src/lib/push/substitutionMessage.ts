import type { SubstitutionKind } from '@prisma/client';

// Текст пушу про заміну (F8): «що, коли і що змінилось» так, щоб вмістилось на заблокованому екрані.

export interface SubstitutionPushInput {
  kind: SubstitutionKind;
  subject: string;
  date: Date; // дата пари (UTC-північ, як у базі)
  pairNumber: number;
  startTime?: Date | null; // pair_time.start_time (1970-01-01THH:MM)
  comment?: string | null;
  newTeacherName?: string | null;
  newRoom?: string | null; // «Корпус Т · ауд. 406» (roomTitle)
  newDate?: Date | null;
  newPairNumber?: number | null;
  newStartTime?: Date | null;
}

const TITLES: Record<SubstitutionKind, string> = {
  CANCELLED: 'Скасовано',
  REPLACED: 'Інший викладач',
  MOVED: 'Перенесено',
  ROOM_CHANGED: 'Інша аудиторія',
};
const WEEKDAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
// Крапка в кінці речення, але без другої після ініціалів («Іваненко І. І.»)
const sentence = (s: string) => (s.endsWith('.') ? s : `${s}.`);
const day = (d: Date) =>
  `${WEEKDAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const slot = (d: Date, pair: number, start?: Date | null) =>
  `${day(d)}, ${pair} пара${start ? ` о ${start.toISOString().slice(11, 16)}` : ''}`;

export function substitutionMessage(i: SubstitutionPushInput): { title: string; body: string } {
  const when = slot(i.date, i.pairNumber, i.startTime);
  const room = i.newRoom ? ` ${i.newRoom}.` : '';
  let body: string;
  switch (i.kind) {
    case 'CANCELLED':
      body = `${when}: пари не буде.`;
      break;
    case 'REPLACED':
      body = `${when}. Веде ${sentence(i.newTeacherName ?? 'інший викладач')}${room}`;
      break;
    case 'ROOM_CHANGED':
      body = `${when}.${room || ' Аудиторію змінено.'}`;
      break;
    case 'MOVED': {
      const startChanged = i.newPairNumber != null && i.newPairNumber !== i.pairNumber;
      const target = slot(i.newDate ?? i.date, i.newPairNumber ?? i.pairNumber, startChanged ? i.newStartTime : i.startTime);
      body = `${when} → ${target}.${room}`;
      break;
    }
  }
  const comment = i.comment?.trim();
  if (comment) body += ` ${cut(comment.replace(/\s+/g, ' '), 120)}`;
  return { title: cut(`${TITLES[i.kind]}: ${i.subject}`, 80), body: cut(body, 300) };
}
