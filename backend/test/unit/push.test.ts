import { describe, expect, it } from 'vitest';
import { EXPO_CHUNK, isExpoPushToken, sendExpoPush, type PushMessage } from '../../src/lib/push/expo';
import { substitutionMessage } from '../../src/lib/push/substitutionMessage';

const tok = (i: number | string) => `ExponentPushToken[token-${i}-abcdefgh]`;
const msg = (to: string): PushMessage => ({ to, title: 't', body: 'b' });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('isExpoPushToken', () => {
  it('приймає токени Expo і відкидає решту', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    for (const bad of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[a b c d e f g h]', 'fcm:xyz', 42, null]) {
      expect(isExpoPushToken(bad)).toBe(false);
    }
  });
});

describe('sendExpoPush', () => {
  it('ділить на запити по 100 і розкладає квитанції за типом помилки', async () => {
    const calls: unknown[][] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string }[];
      calls.push(body);
      return json(200, {
        data: body.map((m) =>
          m.to.includes('gone') ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : m.to.includes('slow') ? { status: 'error', details: { error: 'MessageRateExceeded' } }
          : m.to.includes('big') ? { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }
          : { status: 'ok', id: 'x' }),
      });
    }) as typeof fetch;
    const messages = [...Array.from({ length: EXPO_CHUNK + 1 }, (_, i) => msg(tok(i))), msg(tok('gone')), msg(tok('slow')), msg(tok('big'))];
    const r = await sendExpoPush(messages, { url: 'http://x', fetchImpl });
    expect(calls.map((c) => c.length)).toEqual([EXPO_CHUNK, 4]);
    expect(r.sent).toHaveLength(EXPO_CHUNK + 1);
    expect(r.invalid).toEqual([tok('gone')]);
    expect(r.retry).toEqual([tok('slow')]);
    expect(r.failed).toEqual([tok('big')]);
    expect(r.errors[0]).toContain('MessageTooBig');
    expect(r.errors.join()).not.toContain('token-'); // токени пристроїв у журнал не потрапляють
  });

  it('мережа, 429 і 5xx це повтор, 4xx і чудна відповідь це провал без повтору', async () => {
    const run = (impl: () => Promise<Response>) => sendExpoPush([msg(tok(1))], { url: 'http://x', fetchImpl: impl as unknown as typeof fetch });
    expect((await run(async () => { throw new Error('ECONNREFUSED'); })).retry).toEqual([tok(1)]);
    expect((await run(async () => json(429, {}))).retry).toEqual([tok(1)]);
    expect((await run(async () => json(503, {}))).retry).toEqual([tok(1)]);
    expect((await run(async () => json(400, { errors: [{ code: 'VALIDATION_ERROR' }] }))).failed).toEqual([tok(1)]);
    expect((await run(async () => json(200, { data: [] }))).failed).toEqual([tok(1)]);
  });

  it('передає токен доступу Expo, якщо він заданий', async () => {
    let auth: string | undefined;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).authorization;
      return json(200, { data: [{ status: 'ok' }] });
    }) as typeof fetch;
    await sendExpoPush([msg(tok(1))], { url: 'http://x', accessToken: 'secret', fetchImpl });
    expect(auth).toBe('Bearer secret');
  });
});

describe('substitutionMessage', () => {
  const base = {
    subject: 'Програмування',
    date: new Date('2026-11-06T00:00:00Z'), // пʼятниця
    pairNumber: 2,
    startTime: new Date('1970-01-01T10:10:00Z'),
  };

  it('скасування: предмет у заголовку, день, пара й час у тексті', () => {
    expect(substitutionMessage({ ...base, kind: 'CANCELLED' })).toEqual({
      title: 'Скасовано: Програмування',
      body: 'пт, 06.11, 2 пара о 10:10: пари не буде.',
    });
  });

  it('інший викладач і аудиторія', () => {
    expect(substitutionMessage({ ...base, kind: 'REPLACED', newTeacherName: 'Іваненко І. І.' }).body)
      .toBe('пт, 06.11, 2 пара о 10:10. Веде Іваненко І. І.');
    expect(substitutionMessage({ ...base, kind: 'ROOM_CHANGED', newRoom: '406/Т' }).body).toBe('пт, 06.11, 2 пара о 10:10. Аудиторія 406/Т.');
  });

  it('перенесення показує звідки і куди, з часом нової пари', () => {
    const m = substitutionMessage({
      ...base, kind: 'MOVED', newDate: new Date('2026-11-07T00:00:00Z'), newPairNumber: 3,
      newStartTime: new Date('1970-01-01T11:50:00Z'),
    });
    expect(m.body).toBe('пт, 06.11, 2 пара о 10:10 → сб, 07.11, 3 пара о 11:50.');
    // лише інша дата: час той самий
    expect(substitutionMessage({ ...base, kind: 'MOVED', newDate: new Date('2026-11-09T00:00:00Z') }).body)
      .toBe('пт, 06.11, 2 пара о 10:10 → пн, 09.11, 2 пара о 10:10.');
  });

  it('коментар додається і обрізається, довгий предмет теж', () => {
    const m = substitutionMessage({ ...base, kind: 'CANCELLED', subject: 'П'.repeat(200), comment: `Хвороба\n${'x'.repeat(300)}` });
    expect(m.title.length).toBeLessThanOrEqual(80);
    expect(m.title.endsWith('…')).toBe(true);
    expect(m.body).toContain('пари не буде. Хвороба x');
    expect(m.body.length).toBeLessThanOrEqual(300);
  });
});
