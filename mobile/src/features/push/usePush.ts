import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../auth/session';
import { notificationsSupported } from '../reminders/notifications';
import { syncPushToken } from './registration';
import { parsePushTarget } from './target';

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
