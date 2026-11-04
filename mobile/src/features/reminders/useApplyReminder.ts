import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../../api';
import { log } from '../../lib/logger';
import { useSession } from '../auth/session';
import { requestPermission, type PermissionResult } from './notifications';
import type { ReminderMinutes } from './plan';
import { useReminderSettings } from './settings';

/**
 * Застосувати вибір нагадування (профіль і онбординг): діє одразу на пристрої, а на сервер іде копією
 * (PATCH /me). Невдача запиту (офлайн) нагадувань не ламає, лише логується.
 */
export function useApplyReminder() {
  const setMinutes = useReminderSettings((s) => s.setMinutes);
  const token = useSession((s) => s.session?.accessToken);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationKey: ['updateSettings'],
    mutationFn: (reminderMinutes: ReminderMinutes) => api.updateSettings(token!, { reminderMinutes }),
    onSuccess: (me: Me) => queryClient.setQueryData(['me'], me),
  });

  const saveChoice = (value: ReminderMinutes) => {
    setMinutes(value);
    if (!token) return;
    save.mutate(value, {
      onError: () => log.warn('reminders', 'вибір нагадування не збережено на сервері, діє на пристрої'),
    });
  };

  /** Запитати дозвіл і, якщо дали, увімкнути нагадування за `value` хвилин. */
  const enable = async (value: ReminderMinutes): Promise<PermissionResult> => {
    const result = await requestPermission();
    if (result === 'granted') saveChoice(value);
    return result;
  };

  return { saveChoice, enable };
}
