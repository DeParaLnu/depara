import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}
