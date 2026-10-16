import type { FastifyRequest } from 'fastify';

// Audit trail: «хто, що, кому і коли» для дій, що змінюють ролі чи розклад. Пишеться в лог застосунку
// структурованим рядком (поле audit), час і reqId додає Fastify. Шукати: `logs api | grep '"audit"'`.
// У запис потрапляють лише id, без пошти, імені й токенів. Виконавця (actor) можна перевизначити в details.
//
// Запис іде через дочірній логер із власним рівнем info: так audit не зникне, навіть якщо рівень
// основного логера колись підняти до warn чи error.
export function audit(
  req: FastifyRequest,
  action: string,
  details: Record<string, unknown> = {},
  level: 'info' | 'warn' = 'info',
): void {
  req.log
    .child({}, { level: 'info' })
    [level]({ audit: { action, actor: req.currentUser?.id ?? req.userId, actorRole: req.currentUser?.role, ...details } }, 'audit');
}
