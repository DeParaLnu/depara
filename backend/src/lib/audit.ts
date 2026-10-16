import type { FastifyRequest } from 'fastify';

// Audit trail: «хто, що, кому і коли» для дій, що змінюють ролі чи розклад. Пишеться в лог застосунку
// структурованим рядком (поле audit), час і reqId додає Fastify. Шукати: `logs api | grep '"audit"'`.
// У запис потрапляють лише id, без пошти, імені й токенів.
export function audit(req: FastifyRequest, action: string, details: Record<string, unknown> = {}): void {
  req.log.info(
    { audit: { action, actor: req.currentUser?.id ?? req.userId, actorRole: req.currentUser?.role, ...details } },
    'audit',
  );
}
