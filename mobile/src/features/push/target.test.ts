import { describe, expect, it } from 'vitest';
import { parsePushTarget } from './target';

describe('parsePushTarget', () => {
  it('бере пару і дату з пушу про заміну', () => {
    const data = { type: 'substitution', substitutionId: 's1', lessonId: 'l1', date: '2026-11-06' };
    expect(parsePushTarget(data)).toEqual({ date: '2026-11-06', lessonId: 'l1' });
  });

  it('не чіпає нагадування й сповіщення без data', () => {
    expect(parsePushTarget({})).toBeNull();
    expect(parsePushTarget(null)).toBeNull();
    expect(parsePushTarget(undefined)).toBeNull();
    expect(parsePushTarget({ type: 'reminder', lessonId: 'l1', date: '2026-11-06' })).toBeNull();
  });

  it('відкидає неповні й некоректні дані', () => {
    expect(parsePushTarget({ type: 'substitution', date: '2026-11-06' })).toBeNull();
    expect(parsePushTarget({ type: 'substitution', lessonId: '', date: '2026-11-06' })).toBeNull();
    expect(parsePushTarget({ type: 'substitution', lessonId: 'l1', date: '06.11.2026' })).toBeNull();
    expect(parsePushTarget({ type: 'substitution', lessonId: 'l1' })).toBeNull();
  });
});
