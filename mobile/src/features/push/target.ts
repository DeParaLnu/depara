import { addDays, fromIsoDate, toIsoDate } from '../../lib/date';

// F8: куди веде пуш про заміну. Бекенд кладе в data `type: "substitution"`, `lessonId` і `date` пари.
export type PushTarget = { date: string; lessonId: string };

/** Розібрати data сповіщення. Нагадування про пару і все чуже дають null: їх застосунок не відкриває. */
export function parsePushTarget(data: unknown): PushTarget | null {
  if (!data || typeof data !== 'object') return null;
  const { type, date, lessonId } = data as Record<string, unknown>;
  if (type !== 'substitution') return null;
  if (typeof lessonId !== 'string' || !lessonId) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, lessonId };
}

/** Сповіщення з центру сповіщень телефона: лише потрібне для рішення, чи прибрати його. */
export type PresentedPush = { identifier: string; date: number; data: unknown };

type LoadedWeek = { weekStart: string; lessons: { substitution: { id: string } | null }[] };

// Свіжий пуш міг прийти, поки відповідь із розкладом, зібрана ще до заміни, була в дорозі
const FRESH_MS = 60_000;

// Android віддає час сповіщення в мілісекундах, iOS у секундах
const toMs = (date: number) => (date < 1e12 ? date * 1000 : date);

/**
 * Пуші про заміни цього тижня, яких у щойно завантаженому розкладі вже немає (заміну скасували).
 * `loadedAt` це час отримання розкладу. «Заміну скасовано» (`retracted`) лишається: це актуальна новина.
 */
export function staleSubstitutionNotifications(presented: PresentedPush[], week: LoadedWeek, loadedAt: number): string[] {
  const active = new Set(week.lessons.flatMap((l) => (l.substitution ? [l.substitution.id] : [])));
  const lastDay = toIsoDate(addDays(fromIsoDate(week.weekStart), 6));
  return presented
    .filter((n) => {
      const target = parsePushTarget(n.data);
      if (!target || target.date < week.weekStart || target.date > lastDay) return false;
      const { substitutionId, retracted } = n.data as Record<string, unknown>;
      if (retracted || typeof substitutionId !== 'string' || active.has(substitutionId)) return false;
      return toMs(n.date) <= loadedAt - FRESH_MS;
    })
    .map((n) => n.identifier);
}
