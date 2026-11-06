import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { redis } from '../../redis';
import { deliverSubstitutionPush } from './substitutionPush';

// Невелика черга пушів у Redis (на проді з appendonly, тож переживає перезапуск). Розрахована на один екземпляр
// бекенду: задача на час обробки лежить у PROCESSING, а при старті все звідти повертається в чергу.
// Повтори з паузою лежать у DELAYED (sorted set, оцінка це час, коли повторити).
export const QUEUE = 'push:queue';
export const PROCESSING = 'push:processing';
export const DELAYED = 'push:delayed';
export const MAX_ATTEMPTS = 4; // перша спроба і три повтори: 30 с, 1 хв, 2 хв
const POLL_MS = 1000;
const BATCH = 20;

export interface PushJob {
  id: string;
  substitutionId: string;
  attempt: number;
  tokens?: string[]; // повтор лише для токенів, яким не вдалося відправити
}

export async function enqueueSubstitutionPush(substitutionId: string): Promise<void> {
  const job: PushJob = { id: randomUUID(), substitutionId, attempt: 0 };
  await redis.lpush(QUEUE, JSON.stringify(job));
}

type Deliver = typeof deliverSubstitutionPush;

async function scheduleRetry(job: PushJob, tokens: string[] | undefined, log: FastifyBaseLogger): Promise<void> {
  const attempt = job.attempt + 1;
  if (attempt >= MAX_ATTEMPTS) {
    log.warn({ substitutionId: job.substitutionId, tokens: tokens?.length }, 'пуш про заміну не відправлено: вичерпано спроби');
    return;
  }
  const next: PushJob = { id: randomUUID(), substitutionId: job.substitutionId, attempt, ...(tokens ? { tokens } : {}) };
  await redis.zadd(DELAYED, Date.now() + config.pushRetryDelayMs * 2 ** job.attempt, JSON.stringify(next));
}

export async function processJob(raw: string, log: FastifyBaseLogger, deliver: Deliver = deliverSubstitutionPush): Promise<void> {
  let job: PushJob;
  try {
    job = JSON.parse(raw) as PushJob;
  } catch {
    log.error('зіпсована задача в черзі пушів, пропущено');
    return;
  }
  try {
    const result = await deliver(job.substitutionId, job.tokens);
    if (!result) return;
    if (result.errors.length > 0) {
      log.warn({ substitutionId: job.substitutionId, errors: result.errors.slice(0, 5) }, 'помилки відправки пушу');
    }
    log.info(
      { substitutionId: job.substitutionId, sent: result.sent.length, invalid: result.invalid.length, retry: result.retry.length, failed: result.failed.length },
      'пуш про заміну',
    );
    if (result.retry.length > 0) await scheduleRetry(job, result.retry, log);
  } catch (err) {
    // база чи мережа впали посеред обробки: повторюємо задачу цілком
    log.warn({ err, substitutionId: job.substitutionId }, 'пуш про заміну: збій, повторимо');
    await scheduleRetry(job, job.tokens, log);
  }
}

// Повтори, час яких настав, повертаються в чергу
async function promoteDue(): Promise<void> {
  const due = await redis.zrangebyscore(DELAYED, 0, Date.now(), 'LIMIT', 0, BATCH);
  for (const raw of due) {
    if ((await redis.zrem(DELAYED, raw)) === 1) await redis.lpush(QUEUE, raw);
  }
}

export function startPushWorker(log: FastifyBaseLogger, deliver: Deliver = deliverSubstitutionPush): { stop: () => Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();
  let lastError = 0;

  const tick = async () => {
    try {
      await promoteDue();
      for (let i = 0; i < BATCH && !stopped; i++) {
        const raw = await redis.lmove(QUEUE, PROCESSING, 'RIGHT', 'LEFT');
        if (!raw) break;
        await processJob(raw, log, deliver);
        await redis.lrem(PROCESSING, 1, raw);
      }
    } catch (err) {
      // Redis недоступний: пробуємо далі, у журнал не частіше ніж раз на хвилину
      if (Date.now() - lastError > 60_000) {
        lastError = Date.now();
        log.warn({ err }, 'черга пушів недоступна');
      }
    }
  };
  const loop = () => {
    if (stopped) return;
    running = tick().finally(() => {
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    });
  };

  // Задачі, які оброблялись під час минулої зупинки, повертаються в чергу (можливий повторний пуш, але не втрачений)
  const recover = async () => {
    try {
      while (await redis.lmove(PROCESSING, QUEUE, 'LEFT', 'RIGHT'));
    } catch (err) {
      log.warn({ err }, 'черга пушів: не вдалося повернути незавершені задачі');
    }
  };
  running = recover().then(loop);

  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
