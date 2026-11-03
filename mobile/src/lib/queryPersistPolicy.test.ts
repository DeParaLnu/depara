import { describe, expect, it } from 'vitest';
import { PERSIST_MAX_AGE_MS, pruneExpiredQueries, shouldPersistQuery } from './queryPersistPolicy';

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const DAY = 24 * 3600 * 1000;
const q = (key: unknown[], status = 'success', dataUpdatedAt = NOW - 1000) => ({
  queryKey: key,
  state: { status, dataUpdatedAt },
});

describe('shouldPersistQuery', () => {
  it.each([['week'], ['me'], ['groups'], ['buildings']])('зберігає успішний свіжий запит %s', (name) => {
    expect(shouldPersistQuery(q([name, '2026-11-02']), NOW)).toBe(true);
  });

  it('не зберігає пошук аудиторій та невідомі запити', () => {
    expect(shouldPersistQuery(q(['classrooms', 'N1', '']), NOW)).toBe(false);
    expect(shouldPersistQuery(q(['щось']), NOW)).toBe(false);
    expect(shouldPersistQuery(q([]), NOW)).toBe(false);
  });

  it('не зберігає запити без успіху (помилка, завантаження)', () => {
    expect(shouldPersistQuery(q(['week', 'd'], 'error'), NOW)).toBe(false);
    expect(shouldPersistQuery(q(['week', 'd'], 'pending'), NOW)).toBe(false);
  });

  it('вік рахується за dataUpdatedAt кожного запиту: 14 днів ще можна, більше ні', () => {
    expect(shouldPersistQuery(q(['week', 'a'], 'success', NOW - 13 * DAY), NOW)).toBe(true);
    expect(shouldPersistQuery(q(['week', 'b'], 'success', NOW - PERSIST_MAX_AGE_MS), NOW)).toBe(true);
    expect(shouldPersistQuery(q(['week', 'c'], 'success', NOW - 15 * DAY), NOW)).toBe(false);
  });

  it('строк збереження 14 днів', () => {
    expect(PERSIST_MAX_AGE_MS).toBe(14 * DAY);
  });
});

describe('pruneExpiredQueries', () => {
  const client = (updated: number[]) => ({
    timestamp: NOW,
    buster: '1',
    clientState: {
      mutations: [] as unknown[],
      queries: updated.map((dataUpdatedAt, i) => ({ queryHash: `q${i}`, state: { dataUpdatedAt } })),
    },
  });

  it('відкидає запити старші за 14 днів, свіжі лишає, решту знімка не чіпає', () => {
    const pruned = pruneExpiredQueries(client([NOW - DAY, NOW - 20 * DAY, NOW - 14 * DAY, NOW - 30 * DAY]), NOW)!;
    expect(pruned.clientState.queries.map((x) => x.queryHash)).toEqual(['q0', 'q2']);
    expect(pruned.timestamp).toBe(NOW);
    expect(pruned.buster).toBe('1');
  });

  it('відсутній знімок повертає як є', () => {
    expect(pruneExpiredQueries(undefined, NOW)).toBeUndefined();
  });

  it('не мутує вхідний знімок', () => {
    const original = client([NOW - 20 * DAY, NOW - DAY]);
    pruneExpiredQueries(original, NOW);
    expect(original.clientState.queries).toHaveLength(2);
  });
});
