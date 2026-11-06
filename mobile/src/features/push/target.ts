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
