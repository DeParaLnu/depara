import type { Role } from '@prisma/client';
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
// Що робити з підгрупою при зміні групи, вирішує resolvePatch: для цього потрібна поточна група з бази.
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

// Чи можна застосувати зміну до цього користувача (стан із бази), або яку помилку віддати
export function rejectPatch(
  user: { role: Role; groupId: string | null },
  patch: ProfilePatch,
): { status: number; error: string } | null {
  // Права старости привʼязані до його групи (F6: заміни лише своєї групи). Якби староста міг сам перейти в іншу
  // групу, він отримав би право змінювати її розклад. Групу старості змінює адмін (PATCH /admin/users/:id/group),
  // сам він змінює лише підгрупу. Староста без групи обирає її сам (онбординг).
  if (patch.groupId && user.role === 'HEADMAN' && user.groupId && user.groupId !== patch.groupId) {
    return { status: 403, error: 'HEADMAN_GROUP_LOCKED' };
  }
  // Підгрупа без групи нічого не означає: спершу онбординг (вибір групи)
  if (patch.subgroup !== undefined && !patch.groupId && !user.groupId) return { status: 400, error: 'GROUP_REQUIRED' };
  return null;
}

// Що записати в базу. Нова група без підгрупи скидає підгрупу на 0: підгрупа старої групи для нової не має сенсу.
// Повторно надіслана поточна група підгрупу не чіпає.
export function resolvePatch(user: { groupId: string | null }, patch: ProfilePatch): ProfilePatch {
  if (patch.groupId && patch.subgroup === undefined && patch.groupId !== user.groupId) return { ...patch, subgroup: 0 };
  return patch;
}
