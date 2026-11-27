import { describe, expect, it } from 'vitest';
import { BusyError, limitConcurrency } from '../../src/lib/concurrency';
import { clientNetwork } from '../../src/lib/network';

describe('clientNetwork: ключ ліміту за мережею клієнта', () => {
  it('IPv4 лишається як є, також загорнутий в IPv6', () => {
    expect(clientNetwork('203.0.113.7')).toBe('203.0.113.7');
    expect(clientNetwork('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
  });

  it('адреси IPv6 з однієї мережі /64 дають один ключ у будь-якому записі', () => {
    const key = clientNetwork('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(clientNetwork('2001:0DB8:0001:0002::1')).toBe(key);
    expect(clientNetwork('2001:db8:1:2::')).toBe(key);
    expect(clientNetwork('2001:db8:1:3::1')).not.toBe(key);
  });

  it('стиснутий запис із нулями на початку мережі розгортається', () => {
    expect(clientNetwork('2001:db8::5')).toBe(clientNetwork('2001:db8:0:0:9:9:9:9'));
    expect(clientNetwork('::1')).toBe(clientNetwork('0:0:0:0:0:0:0:2'));
  });
});

describe('limitConcurrency', () => {
  const gate = () => {
    let open!: () => void;
    const closed = new Promise<void>((resolve) => (open = resolve));
    return { open, closed };
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('виконує не більше заданої кількості задач одночасно, решта чекає в черзі', async () => {
    const run = limitConcurrency(2, 10);
    const gates = [gate(), gate(), gate()];
    const started: number[] = [];
    const tasks = gates.map((g, i) =>
      run(async () => {
        started.push(i);
        await g.closed;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    gates[0].open();
    await tasks[0];
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1].open();
    gates[2].open();
    expect(await Promise.all(tasks)).toEqual([0, 1, 2]);
  });

  it('переповнена черга відмовляє одразу, а помилка задачі звільняє місце', async () => {
    const run = limitConcurrency(1, 1);
    const g = gate();
    const first = run(async () => {
      await g.closed;
      throw new Error('boom');
    });
    const second = run(async () => 'second');
    await expect(run(async () => 'third')).rejects.toBeInstanceOf(BusyError);
    g.open();
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('second');
    await expect(run(async () => 'after')).resolves.toBe('after');
  });
});
