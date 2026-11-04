import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { log } from '../../lib/logger';
import type { PlannedReminder } from './plan';

// F8: обгортка над expo-notifications для локальних нагадувань. У вебі планування сповіщень немає: усе no-op.
const supported = Platform.OS === 'android' || Platform.OS === 'ios';
const CHANNEL_ID = 'lesson-reminders';
const PREFIX = 'lesson-';

const warn = (message: string, error: unknown) =>
  log.warn('reminders', message, { reason: error instanceof Error ? error.message : String(error) });

// Нагадування, що спрацювало, коли застосунок відкритий, теж показуємо банером
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// На Android 8+ сповіщення мають належати каналу, а на Android 13+ без каналу не зʼявиться запит дозволу
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Нагадування про пари',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** Чи можна показувати сповіщення, без запиту користувачу. */
export async function hasPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch (error) {
    warn('не вдалося перевірити дозвіл', error);
    return false;
  }
}

/** Запитати дозвіл (лише коли користувач сам вмикає нагадування в профілі). */
export async function requestPermission(): Promise<PermissionResult> {
  if (!supported) return 'unsupported';
  try {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    return (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
  } catch (error) {
    warn('не вдалося запитати дозвіл', error);
    return 'denied';
  }
}

/** Прибрати всі нагадування про пари (інших запланованих сповіщень застосунок не має, але чіпаємо лише свої). */
export async function cancelReminders(): Promise<void> {
  if (!supported) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (error) {
    warn('не вдалося скасувати нагадування', error);
  }
}

/** Замінити заплановані нагадування новим планом. */
export async function scheduleReminders(plan: PlannedReminder[]): Promise<void> {
  if (!supported) return;
  await cancelReminders();
  try {
    await ensureChannel();
  } catch (error) {
    warn('не вдалося створити канал сповіщень', error);
  }
  // Помилка одного нагадування не зупиняє решту: краще пропустити одну пару, ніж усі наступні
  let failed = 0;
  for (const r of plan) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
    } catch (error) {
      failed += 1;
      if (failed === 1) warn('не вдалося запланувати нагадування', error);
    }
  }
  if (failed > 1) log.warn('reminders', `не заплановано нагадувань: ${failed} з ${plan.length}`);
  if (__DEV__) log.debug('reminders', `заплановано нагадувань: ${plan.length - failed}`);
}
