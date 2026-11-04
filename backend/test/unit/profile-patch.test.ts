import { describe, expect, it } from 'vitest';
import { parseProfilePatch, patchGuards, rejectPatch } from '../../src/lib/profilePatch';

const GROUP = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';
const error = (body: unknown) => {
  const r = parseProfilePatch(body);
  return r.ok ? null : r.error;
};
const patch = (body: unknown) => {
  const r = parseProfilePatch(body);
  if (!r.ok) throw new Error(r.error);
  return r.patch;
};

describe('parseProfilePatch', () => {
  it('нова група без підгрупи скидає підгрупу на 0, з підгрупою бере її', () => {
    expect(patch({ groupId: GROUP })).toEqual({ groupId: GROUP, subgroup: 0 });
    expect(patch({ groupId: GROUP, subgroup: 2 })).toEqual({ groupId: GROUP, subgroup: 2 });
  });

  it('кожне поле можна змінити окремо', () => {
    expect(patch({ subgroup: 1 })).toEqual({ subgroup: 1 });
    expect(patch({ reminderMinutes: 15 })).toEqual({ reminderMinutes: 15 });
    expect(patch({ notifySubstitutions: false })).toEqual({ notifySubstitutions: false });
  });

  it('порожнє тіло або лише невідомі поля нічого не змінюють', () => {
    for (const body of [undefined, null, {}, { theme: 'dark' }, 'рядок']) expect(error(body)).toBe('NOTHING_TO_UPDATE');
  });

  it('група: null чи порожня це GROUP_REQUIRED, не uuid це INVALID_GROUP_ID', () => {
    expect(error({ groupId: null })).toBe('GROUP_REQUIRED');
    expect(error({ groupId: '' })).toBe('GROUP_REQUIRED');
    expect(error({ groupId: 'abc' })).toBe('INVALID_GROUP_ID');
  });

  it('підгрупа лише 0, 1 або 2', () => {
    for (const subgroup of [3, -1, 1.5, '1', null]) expect(error({ subgroup })).toBe('INVALID_SUBGROUP');
  });

  it('нагадування лише 0, 10 або 15 хвилин', () => {
    expect(patch({ reminderMinutes: 0 })).toEqual({ reminderMinutes: 0 });
    for (const reminderMinutes of [5, 30, '10', null, 10.5]) {
      expect(error({ reminderMinutes })).toBe('INVALID_REMINDER_MINUTES');
    }
  });

  it('перемикач сповіщень лише boolean', () => {
    for (const notifySubstitutions of ['false', 0, null]) {
      expect(error({ notifySubstitutions })).toBe('INVALID_NOTIFY_SUBSTITUTIONS');
    }
  });
});

describe('rejectPatch і patchGuards', () => {
  const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  const headman = { role: 'HEADMAN' as const, groupId: GROUP };

  it('староста з групою не переходить в іншу групу сам, у свою (з підгрупою) може', () => {
    expect(rejectPatch(headman, { groupId: OTHER, subgroup: 0 })).toEqual({ status: 403, error: 'HEADMAN_GROUP_LOCKED' });
    expect(rejectPatch(headman, { groupId: GROUP, subgroup: 1 })).toBeNull();
    expect(rejectPatch(headman, { subgroup: 2, reminderMinutes: 10 })).toBeNull();
    expect(rejectPatch({ role: 'HEADMAN', groupId: null }, { groupId: OTHER, subgroup: 0 })).toBeNull(); // онбординг
    expect(rejectPatch({ role: 'STUDENT', groupId: GROUP }, { groupId: OTHER, subgroup: 0 })).toBeNull();
  });

  it('підгрупа без групи це GROUP_REQUIRED, налаштування без групи можна', () => {
    expect(rejectPatch({ role: 'STUDENT', groupId: null }, { subgroup: 1 })).toEqual({ status: 400, error: 'GROUP_REQUIRED' });
    expect(rejectPatch({ role: 'STUDENT', groupId: null }, { reminderMinutes: 15 })).toBeNull();
  });

  it('умови для WHERE збігаються з перевірками', () => {
    expect(patchGuards({ groupId: OTHER, subgroup: 0 })).toEqual([
      { OR: [{ role: { not: 'HEADMAN' } }, { groupId: null }, { groupId: OTHER }] },
    ]);
    expect(patchGuards({ subgroup: 1 })).toEqual([{ groupId: { not: null } }]);
    expect(patchGuards({ notifySubstitutions: false })).toEqual([]);
  });
});
