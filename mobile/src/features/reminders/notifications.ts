import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { log } from '../../lib/logger';
import { ONCE_PREFIX, type PlannedReminder } from './plan';

// F8: обгортка над expo-notifications для локальних нагадувань. У вебі планування сповіщень немає: усе no-op.
export const notificationsSupported = Platform.OS === 'android' || Platform.OS === 'ios';
const CHANNEL_ID = 'lesson-reminders';
const PREFIX = 'lesson-';

const warn = (message: string, error: unknown) =>
  log.warn('reminders', message, { reason: error instanceof Error ? error.message : String(error) });

// Нагадування, що спрацювало, коли застосунок відкритий, теж показуємо банером
if (notificationsSupported) {
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
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Нагадування про пари',
    importance: Notifications.AndroidImportance.HIGH,
  });
  // Пуші про заміни (F8) бекенд шле без channelId, тож вони йдуть у канал default
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Зміни та скасування',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** Чи можна показувати сповіщення, без запиту користувачу. */
export async function hasPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch (error) {
    warn('не вдалося перевірити дозвіл', error);
    return false;
  }
}

/** Запитати дозвіл (лише коли користувач сам вмикає нагадування в профілі). */
export async function requestPermission(): Promise<PermissionResult> {
  if (!notificationsSupported) return 'unsupported';
  try {
    await ensureChannels();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    return (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
  } catch (error) {
    warn('не вдалося запитати дозвіл', error);
    return 'denied';
  }
}

async function cancelByPrefix(prefixes: string[]): Promise<void> {
  if (!notificationsSupported) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => prefixes.some((p) => n.identifier.startsWith(p)))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (error) {
    warn('не вдалося скасувати нагадування', error);
  }
}

/** Прибрати загальні нагадування про пари (їх переплановує useReminderSync). Разові з деталей пари не чіпає. */
export const cancelReminders = () => cancelByPrefix([PREFIX]);

/** Прибрати всі нагадування, і разові теж (вихід з акаунта). */
export const cancelAllReminders = () => cancelByPrefix([PREFIX, ONCE_PREFIX]);

async function scheduleOne(r: PlannedReminder): Promise<void> {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: r.id,
    content: { title: r.title, body: r.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: r.at,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

/** Разове нагадування про одну пару. false, якщо не вдалося запланувати. */
export async function scheduleOnce(r: PlannedReminder): Promise<boolean> {
  if (!notificationsSupported) return false;
  try {
    await scheduleOne(r);
    return true;
  } catch (error) {
    warn('не вдалося запланувати разове нагадування', error);
    return false;
  }
}

export async function cancelOnce(id: string): Promise<void> {
  if (!notificationsSupported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (error) {
    warn('не вдалося скасувати разове нагадування', error);
  }
}

export async function isScheduled(id: string): Promise<boolean> {
  if (!notificationsSupported) return false;
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).some((n) => n.identifier === id);
  } catch (error) {
    warn('не вдалося перевірити нагадування', error);
    return false;
  }
}

/** Замінити заплановані нагадування новим планом. */
export async function scheduleReminders(plan: PlannedReminder[]): Promise<void> {
  if (!notificationsSupported) return;
  await cancelReminders();
  // Помилка одного нагадування не зупиняє решту: краще пропустити одну пару, ніж усі наступні
  let failed = 0;
  for (const r of plan) {
    try {
      await scheduleOne(r);
    } catch (error) {
      failed += 1;
      if (failed === 1) warn('не вдалося запланувати нагадування', error);
    }
  }
  if (failed > 1) log.warn('reminders', `не заплановано нагадувань: ${failed} з ${plan.length}`);
  if (__DEV__) log.debug('reminders', `заплановано нагадувань: ${plan.length - failed}`);
}
