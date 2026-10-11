import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { config } from './config';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { classroomRoutes } from './routes/classrooms';
import { profileRoutes } from './routes/profile';
import { scheduleRoutes } from './routes/schedule';
import { substitutionRoutes } from './routes/substitutions';
import { teacherRoutes } from './routes/teachers';
import { redis } from './redis';

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Порожнє тіло з content-type: application/json (типово для DELETE у мобільних клієнтів) не є помилкою.
  // Зламаний JSON, як і раніше, дає 400.
  const parseJson = app.getDefaultJsonParser('error', 'ignore');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '') return done(null, undefined);
    parseJson(req, body as string, done);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  // Демо-консоль для ручного тестування в браузері. Існує лише при AUTH_MODE=fake (тестовий режим).
  if (config.fakeAuth) {
    const consoleHtml = readFileSync(new URL('./dev/console.html', import.meta.url), 'utf8');
    app.get('/dev', async (_req, reply) => reply.type('text/html; charset=utf-8').send(consoleHtml));
    app.get('/', async (_req, reply) => reply.redirect('/dev'));
  }

  app.register(authRoutes);
  app.register(profileRoutes);
  app.register(scheduleRoutes);
  app.register(classroomRoutes);
  app.register(teacherRoutes);
  app.register(substitutionRoutes);
  app.register(adminRoutes);

  app.addHook('onClose', async () => {
    redis.disconnect();
  });

  return app;
}
