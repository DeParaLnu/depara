import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Session } from '../../api';

const DEVICE_ID_KEY = 'depara_device_id';
const SESSION_KEY = 'depara_session';

const memoryStore = new Map<string, string>();

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : memoryStore.get(key) ?? null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      memoryStore.set(key, value);
      return;
    } catch {
      memoryStore.set(key, value);
      return;
    }
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

async function deleteStorageItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      memoryStore.delete(key);
      return;
    } catch {
      memoryStore.delete(key);
      return;
    }
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    memoryStore.delete(key);
  }
}

/**
 * Отримати або згенерувати постійний ідентифікатор пристрою.
 * Зберігається у SecureStore для стабільної привʼязки refresh-сесії.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getStorageItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await setStorageItem(DEVICE_ID_KEY, newId);
  return newId;
}

/** Завантажити збережену сесію при запуску застосунку */
export async function loadStoredSession(): Promise<Session | null> {
  const raw = await getStorageItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
      return parsed as Session;
    }
  } catch {
    // Пошкоджені дані сесії
  }
  return null;
}

/** Зберегти або видалити сесію у захищеному сховищі */
export async function saveStoredSession(session: Session | null): Promise<void> {
  if (!session) {
    await deleteStorageItem(SESSION_KEY);
  } else {
    await setStorageItem(SESSION_KEY, JSON.stringify(session));
  }
}
