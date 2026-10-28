import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { createRateLimiter } from '../lib/rateLimit';
import { redis } from '../redis';

const limiter = createRateLimiter({
  store: redis,
  limit: config.publicRateLimitPerMinute,
  windowSeconds: 60,
  prefix: 'rl:public',
});

// preHandler для відкритих ендпоінтів (/public/*): вимикач PUBLIC_API і ліміт запитів на IP.
// IP береться з req.ip: за Caddy це справжній клієнт (TRUST_PROXY=true), інакше адреса проксі.
export async function publicGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!config.publicApi) return reply.code(404).send({ error: 'NOT_FOUND' });
  const decision = await limiter(req.ip);
  if (!decision.allowed) {
    reply.header('retry-after', String(decision.retryAfterSeconds));
    return reply.code(429).send({ error: 'RATE_LIMITED' });
  }
}
