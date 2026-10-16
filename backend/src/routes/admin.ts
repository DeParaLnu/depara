import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { invalidateGroupSchedule } from '../lib/cache';
import { audit } from '../lib/audit';
import { csvToLessons } from '../lib/csv';
import { ImportError, importSchedule, validateImport } from '../lib/scheduleImport';
import { isUuid } from '../lib/validation';
import { requireRole } from '../plugins/roles';

const ROLES = Object.values(Role) as string[];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// F7: адміністрування (лише ADMIN)
export async function adminRoutes(app: FastifyInstance) {
  app.addContentTypeParser('text/csv', { parseAs: 'string', bodyLimit: MAX_IMPORT_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  // Пошук користувачів за поштою або ім'ям: потрібен, щоб знайти id для призначення ролі
  app.get('/admin/users', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { q } = req.query as { q?: string };
    const users = await prisma.user.findMany({
      where: q
        ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] }
        : {},
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, groupId: u.groupId }));
  });

  app.patch('/admin/users/:id/role', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role } = (req.body ?? {}) as { role?: unknown };

    if (!isUuid(id)) return reply.code(400).send({ error: 'INVALID_ID' });
    if (typeof role !== 'string' || !ROLES.includes(role)) {
      return reply.code(400).send({ error: 'INVALID_ROLE', allowed: ROLES });
    }
    // Захист від випадкового блокування: адмін не може змінити роль собі
    if (id === req.currentUser!.id) return reply.code(400).send({ error: 'CANNOT_CHANGE_OWN_ROLE' });

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const user = await prisma.user.update({ where: { id }, data: { role: role as Role } });
    audit(req, 'user.role.change', { target: id, from: target.role, to: user.role });
    return { id: user.id, email: user.email, role: user.role };
  });

  // Імпорт розкладу: JSON (Content-Type: application/json) або CSV (text/csv)
  app.post(
    '/admin/schedule/import',
    { preHandler: requireRole('ADMIN'), bodyLimit: MAX_IMPORT_BYTES },
    async (req, reply) => {
      let payload: unknown = req.body;
      if (req.headers['content-type']?.startsWith('text/csv')) {
        const { lessons, errors } = csvToLessons(String(req.body ?? ''));
        if (errors.length > 0) return reply.code(422).send({ error: 'INVALID_IMPORT', details: errors });
        payload = { lessons };
      }

      const checked = validateImport(payload);
      if (!checked.ok) return reply.code(422).send({ error: 'INVALID_IMPORT', details: checked.errors });

      try {
        const result = await importSchedule(prisma, checked.data);
        await Promise.all(result.groupIds.map(invalidateGroupSchedule));
        audit(req, 'schedule.import', {
          format: req.headers['content-type']?.startsWith('text/csv') ? 'csv' : 'json',
          imported: result.imported,
          groups: result.groupIds.length,
          warnings: result.warnings.length,
        });
        return { imported: result.imported, groups: result.groupIds.length, warnings: result.warnings };
      } catch (e) {
        if (e instanceof ImportError) return reply.code(422).send({ error: 'INVALID_IMPORT', details: e.errors });
        throw e;
      }
    },
  );
}
