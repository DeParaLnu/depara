import { isSubgroup, isUuid } from './validation';

// Хвилини нагадування перед парою: вимкнено, 10 або 15 (F9)
export const REMINDER_MINUTES = [0, 10, 15] as const;

export interface ProfilePatch {
  groupId?: string;
  subgroup?: number;
  reminderMinutes?: number;
  notifySubstitutions?: boolean;
}

export type ProfilePatchResult = { ok: true; patch: ProfilePatch } | { ok: false; error: string };

// Розбір тіла PATCH /me. Усі поля необовʼязкові, змінюється лише те, що передано.
// Нова група без підгрупи скидає підгрупу на 0: підгрупа старої групи для нової не має сенсу.
export function parseProfilePatch(body: unknown): ProfilePatchResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if ('groupId' in b) {
    // null чи порожній рядок не очищають групу: без групи немає розкладу
    if (!b.groupId) return { ok: false, error: 'GROUP_REQUIRED' };
    if (!isUuid(b.groupId)) return { ok: false, error: 'INVALID_GROUP_ID' };
    patch.groupId = b.groupId;
  }
  if (b.subgroup !== undefined) {
    if (!isSubgroup(b.subgroup)) return { ok: false, error: 'INVALID_SUBGROUP' };
    patch.subgroup = b.subgroup;
  } else if (patch.groupId) {
    patch.subgroup = 0;
  }
  if (b.reminderMinutes !== undefined) {
    if (!REMINDER_MINUTES.includes(b.reminderMinutes as never)) return { ok: false, error: 'INVALID_REMINDER_MINUTES' };
    patch.reminderMinutes = b.reminderMinutes as number;
  }
  if (b.notifySubstitutions !== undefined) {
    if (typeof b.notifySubstitutions !== 'boolean') return { ok: false, error: 'INVALID_NOTIFY_SUBSTITUTIONS' };
    patch.notifySubstitutions = b.notifySubstitutions;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: 'NOTHING_TO_UPDATE' };
  return { ok: true, patch };
}
