import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { addDays, mondayOf, toIsoDate } from '../../lib/date';
import { useMe, useWeek } from '../schedule/hooks';
import { scheduleReminders, cancelReminders, hasPermission } from './notifications';
import { isReminderMinutes, planKey, planReminders, type ReminderMinutes } from './plan';
import { useReminderSettings } from './settings';

/** Обраний час нагадування: вибір на пристрої, інакше значення з профілю на сервері, інакше вимкнено. */
export function useReminderMinutes(): ReminderMinutes {
  const local = useReminderSettings((s) => s.minutes);
  const server = useMe().data?.reminderMinutes;
  return local ?? (isReminderMinutes(server) ? server : 0);
}

/**
 * F8: тримає заплановані нагадування в актуальному стані для цього й наступного тижня.
 * Перепланування відбувається, коли змінюється розклад (заміни, нова група), час нагадування,
 * і коли застосунок повертається на передній план (план рахується від поточного часу).
 * Монтується один раз у вкладках, тобто лише для користувача, що увійшов і має групу.
 */
export function useReminderSync() {
  const hydrate = useReminderSettings((s) => s.hydrate);
  const hydrated = useReminderSettings((s) => s.hydrated);
  const minutes = useReminderMinutes();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    void hydrate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, [hydrate]);

  const monday = mondayOf(now);
  const thisWeek = useWeek(toIsoDate(monday));
  const nextWeek = useWeek(toIsoDate(addDays(monday, 7)));

  const plan = useMemo(
    () => planReminders([...(thisWeek.data?.lessons ?? []), ...(nextWeek.data?.lessons ?? [])], minutes, now),
    [thisWeek.data, nextWeek.data, minutes, now],
  );
  const key = planKey(plan);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      if (minutes === 0 || !(await hasPermission())) {
        if (!cancelled) await cancelReminders();
        return;
      }
      if (!cancelled) await scheduleReminders(plan);
    })();
    return () => {
      cancelled = true;
    };
    // plan змінюється разом із key: переплановуємо лише тоді, коли план справді інший
  }, [key, hydrated, minutes]);
}
