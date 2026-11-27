import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { WeekSchedule } from '../../api';
import { log } from '../../lib/logger';
import { useSession } from '../auth/session';
import { notificationsSupported } from '../reminders/notifications';
import { syncPushToken } from './registration';
import { parsePushTarget, staleSubstitutionNotifications } from './target';

// Прибрати з центру сповіщень пуші про заміни, яких у свіжому розкладі вже немає. Це друга лінія після пушу
// «Заміну скасовано»: він міг не дійти (вимкнена мережа, ліміти Expo).
async function dismissStalePushes(week: WeekSchedule, loadedAt: number) {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const stale = staleSubstitutionNotifications(
      presented.map((n) => ({ identifier: n.request.identifier, date: n.date, data: n.request.content.data })),
      week,
      loadedAt,
    );
    await Promise.all(stale.map((id) => Notifications.dismissNotificationAsync(id)));
  } catch (error) {
    log.warn('push', 'не вдалося прибрати застарілі сповіщення', { error });
  }
}

/**
 * F8: пуші про заміни, поки користувач у застосунку (монтується у вкладках, тобто він увійшов і має групу).
 * Реєструє токен пристрою, оновлює розклад, коли пуш прийшов, і відкриває пару, коли на пуш натиснули.
 */
export function usePush() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => {
      const token = useSession.getState().session?.accessToken;
      if (token) void syncPushToken(token);
    };
    sync();
    // Дозвіл могли дати в налаштуваннях телефону, а минула спроба могла не вдатись через мережу
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);

  // Лише після успішної відповіді сервера: розклад, відновлений з диска, може бути старішим за пуш
  useEffect(() => {
    if (!notificationsSupported) return;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success' || event.query.queryKey[0] !== 'week') return;
      void dismissStalePushes(event.query.state.data as WeekSchedule, event.query.state.dataUpdatedAt);
    });
  }, [queryClient]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const refreshSchedule = () => queryClient.invalidateQueries({ queryKey: ['week'] });

    const open = (response: Notifications.NotificationResponse) => {
      const target = parsePushTarget(response.notification.request.content.data);
      if (!target) return;
      Notifications.clearLastNotificationResponse();
      void refreshSchedule();
      // openedAt: другий пуш про ту саму пару теж має відкрити її, хоча дата і пара ті самі
      router.navigate({ pathname: '/week', params: { ...target, openedAt: String(Date.now()) } });
    };

    // Застосунок запустився з натискання на пуш: подія вже минула, відповідь лежить у «останній»
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);

    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (parsePushTarget(notification.request.content.data)) void refreshSchedule();
    });
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [queryClient]);
}
