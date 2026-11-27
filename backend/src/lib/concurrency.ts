export class BusyError extends Error {}

// Не більше slots задач одночасно й не більше maxWaiting у черзі; понад це BusyError одразу. Для важких операцій
// (scrypt), які інакше зайняли б усі потоки libuv і гальмували б решту застосунку.
export function limitConcurrency(slots: number, maxWaiting: number) {
  let free = slots;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (free > 0) free--;
    else if (waiting.length < maxWaiting) await new Promise<void>((resolve) => waiting.push(resolve));
    else throw new BusyError('черга переповнена');
    try {
      return await task();
    } finally {
      // Звільнене місце одразу переходить наступному в черзі
      const next = waiting.shift();
      if (next) next();
      else free++;
    }
  };
}
