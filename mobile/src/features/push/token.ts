import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { log } from '../../lib/logger';
import { ensureChannels, notificationsSupported } from '../reminders/notifications';

let warnedNoProject = false;

/**
 * Expo push-токен цього пристрою або null, якщо його зараз не отримати: веб, Expo Go на Android
 * (там пушів немає з SDK 53), проєкт не привʼязаний до EAS, немає мережі. Застосунок це переживає: лише пушів не буде.
 */
export async function readPushToken(): Promise<string | null> {
  if (!notificationsSupported) return null;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    if (!warnedNoProject) log.warn('push', 'немає EAS projectId, токен пристрою не отримати (див. eas init)');
    warnedNoProject = true;
    return null;
  }

  try {
    // На Android 13+ канал має існувати до запиту токена
    await ensureChannels();
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    log.warn('push', 'не вдалося отримати токен пристрою', { reason: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
