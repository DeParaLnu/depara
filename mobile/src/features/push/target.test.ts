import { describe, expect, it } from 'vitest';
import { parsePushTarget, staleSubstitutionNotifications } from './target';

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

describe('staleSubstitutionNotifications', () => {
  const loadedAt = Date.parse('2026-11-04T12:00:00Z');
  const hourAgo = loadedAt - 3_600_000;
  const week = { weekStart: '2026-11-02', lessons: [{ substitution: { id: 'active' } }, { substitution: null }] };
  const push = (identifier: string, data: Record<string, unknown>, date = hourAgo) => ({
    identifier,
    date,
    data: { type: 'substitution', lessonId: 'l1', date: '2026-11-06', ...data },
  });

  it('прибирає пуші про заміни, яких у розкладі тижня вже немає', () => {
    const presented = [push('gone', { substitutionId: 'cancelled' }), push('live', { substitutionId: 'active' })];
    expect(staleSubstitutionNotifications(presented, week, loadedAt)).toEqual(['gone']);
  });

  it('лишає «Заміну скасовано», інші тижні й чужі сповіщення', () => {
    const presented = [
      push('retraction', { substitutionId: 'cancelled', retracted: true }),
      push('next-week', { substitutionId: 'cancelled', date: '2026-11-09' }),
      push('previous-week', { substitutionId: 'cancelled', date: '2026-11-01' }),
      push('no-id', {}),
      { identifier: 'reminder', date: hourAgo, data: {} },
    ];
    expect(staleSubstitutionNotifications(presented, week, loadedAt)).toEqual([]);
  });

  it('не чіпає пуш, що прийшов, поки розклад ще завантажувався', () => {
    const presented = [push('fresh', { substitutionId: 'new' }, loadedAt - 5_000)];
    expect(staleSubstitutionNotifications(presented, week, loadedAt)).toEqual([]);
  });

  it('межі тижня входять, а час в секундах (iOS) читається так само, як у мілісекундах', () => {
    const presented = [
      push('monday', { substitutionId: 'a', date: '2026-11-02' }, hourAgo / 1000),
      push('sunday', { substitutionId: 'b', date: '2026-11-08' }),
      push('fresh-ios', { substitutionId: 'c' }, (loadedAt - 5_000) / 1000),
    ];
    expect(staleSubstitutionNotifications(presented, week, loadedAt)).toEqual(['monday', 'sunday']);
  });
});
