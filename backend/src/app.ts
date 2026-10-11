import Fastify from 'fastify';
import { authRoutes } from './routes/auth';
import { classroomRoutes } from './routes/classrooms';
import { profileRoutes } from './routes/profile';
import { scheduleRoutes } from './routes/schedule';

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authRoutes);
  app.register(profileRoutes);
  app.register(scheduleRoutes);
  app.register(classroomRoutes);

  return app;
}
