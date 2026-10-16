import type { Role, User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { requireAuth } from './auth';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
  }
}

// Роль читаємо з бази на кожен запит, тому зміна ролі діє одразу, без перевипуску токена.
export function requireRole(...roles: Role[]) {
  const check = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    req.currentUser = user;
    if (!roles.includes(user.role)) {
      audit(req, 'access.denied', { route: req.routeOptions.url }, 'warn');
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };
  return [requireAuth, check];
}
