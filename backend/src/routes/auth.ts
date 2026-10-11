import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';

// F1: вхід. Справжню перевірку Google-токена додасте окремим PR.
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/google', async (req, reply) => {
    const { idToken } = (req.body ?? {}) as { idToken?: string };

    if (!config.fakeAuth) {
      return reply.code(501).send({ error: 'REAL_GOOGLE_AUTH_NOT_IMPLEMENTED' });
    }
    if (!idToken || !idToken.startsWith('test:')) {
      return reply.code(401).send({ error: 'INVALID_TOKEN' });
    }

    const email = idToken.slice('test:'.length).toLowerCase();
    if (!email.endsWith(config.allowedEmailDomain)) {
      return reply.code(403).send({ error: 'NOT_LNU_EMAIL' });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        googleSub: `test-${email}`,
        fullName: email.split('@')[0],
      },
    });

    const accessToken = jwt.sign({ sub: user.id }, config.jwtSecret, {
      expiresIn: config.accessTokenTtl,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, groupId: user.groupId },
    };
  });
}
