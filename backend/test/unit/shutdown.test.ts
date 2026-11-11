import { spawn } from 'node:child_process';
import http from 'node:http';
import { describe, expect, it } from 'vitest';

// Запускаємо справжній сервер окремим процесом (так він працює в Docker). PUSH_ENABLED=false: воркер пушів не стартує
// і не забирає задачі з Redis у E2E, що біжать одночасно. PORT=0: система обирає вільний порт.
function startServer() {
  const child = spawn('node_modules/.bin/tsx', ['src/server.ts'], {
    env: { ...process.env, NODE_ENV: 'development', PORT: '0', PUSH_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  const listening = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`сервер не стартував: ${out}`)), 30_000);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      if (out.includes('Server listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('exit', () => clearTimeout(timer));
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  );
  return { child, listening, exited, output: () => out };
}

describe('зупинка сервера за сигналом', () => {
  // docker stop і деплой шлють SIGTERM: сервер має чисто завершитись із кодом 0, а не обірватись посеред запитів
  it.each(['SIGTERM', 'SIGINT'] as const)('%s: чисте завершення з кодом 0 і записом у лог', async (signal) => {
    const server = startServer();
    await server.listening;

    const started = Date.now();
    server.child.kill(signal);
    const result = await server.exited;

    expect(result).toEqual({ code: 0, signal: null });
    expect(server.output()).toContain('зупинка сервера');
    // не чекає запобіжника на 8 с: простоїв без запитів немає
    expect(Date.now() - started).toBeLessThan(6_000);
  }, 60_000);

  // Caddy тримає зʼєднання з API відкритими (keep-alive). Вони не повинні затримувати зупинку до запобіжника
  it('відкрите keep-alive зʼєднання не затримує зупинку', async () => {
    const server = startServer();
    await server.listening;
    const port = /Server listening at http:\/\/[\d.]+:(\d+)/.exec(server.output())?.[1];
    expect(port, server.output()).toBeTruthy();

    const agent = new http.Agent({ keepAlive: true });
    const status = await new Promise<number>((resolve, reject) =>
      http.get({ host: '127.0.0.1', port: Number(port), path: '/health', agent }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      }).on('error', reject),
    );
    expect(status).toBe(200); // зʼєднання лишилось відкритим у пулі агента

    const started = Date.now();
    server.child.kill('SIGTERM');
    const result = await server.exited;
    agent.destroy();

    expect(result).toEqual({ code: 0, signal: null });
    expect(Date.now() - started).toBeLessThan(6_000);
  }, 60_000);
});
