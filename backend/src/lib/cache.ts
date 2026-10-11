import { redis } from '../redis';

// Скидає кеш розкладу групи (ключі schedule:{groupId}:*). Викликається після заміни та імпорту.
export async function invalidateGroupSchedule(groupId: string): Promise<void> {
  const keys: string[] = [];
  const stream = redis.scanStream({ match: `schedule:${groupId}:*`, count: 100 });
  for await (const batch of stream) keys.push(...(batch as string[]));
  if (keys.length > 0) await redis.del(...keys);
}
