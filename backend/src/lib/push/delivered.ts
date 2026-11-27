import { redis } from '../../redis';

// Кому пуш про заміну справді дійшов до Expo: лише цим пристроям потім шлемо «Заміну скасовано».
// Строк із запасом покриває час між створенням заміни і парою, якої вона стосується.
const TTL_SECONDS = 30 * 24 * 60 * 60;
const key = (substitutionId: string) => `push:delivered:${substitutionId}`;

export async function rememberDelivered(substitutionId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await redis.multi().sadd(key(substitutionId), ...tokens).expire(key(substitutionId), TTL_SECONDS).exec();
}

export const deliveredTokens = (substitutionId: string): Promise<string[]> => redis.smembers(key(substitutionId));
