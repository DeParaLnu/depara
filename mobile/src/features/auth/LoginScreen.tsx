import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api';
import { config } from '../../config';
import { reportError } from '../../lib/errors';
import { colors, errorText } from '../../theme';
import { useSession } from './session';
import { getOrCreateDeviceId } from './storage';

// F1: вхід через Microsoft (корпоративна пошта ЛНУ)
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (idToken: string = config.e2eIdToken) => {
    setError(null);
    if (!config.e2e && !config.mock) {
      // Справжній вхід через Microsoft Entra підключимо окремою задачею
      setError('Вхід через Microsoft ще не підключено. Для перегляду без бекенда запустіть застосунок з MOCK=1.');
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      setSession(await api.loginWithMicrosoft(idToken, deviceId));
    } catch (e) {
      setError(errorText(reportError('auth', e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Вхід
        </Text>
        <Text style={styles.subtitle}>Використайте студентську пошту ЛНУ.{'\n'}Паролі не потрібні</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          testID="login-button"
          accessibilityRole="button"
          accessibilityLabel="Увійти через корпоративну пошту ЛНУ"
          onPress={() => void login()}
          disabled={loading}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          {loading ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <>
              <View style={styles.buttonIcon}>
                <Ionicons name="mail" size={16} color={colors.accent} />
              </View>
              <Text style={styles.buttonText}>Увійдіть через корпоративну пошту ЛНУ (@lnu.edu.ua)</Text>
            </>
          )}
        </Pressable>
        {config.e2e ? (
          // Лише в E2E-збірці: вхід тестовим старостою для сценаріїв F6 (e2e/specs/f6-substitutions.e2e.ts)
          <Pressable
            testID="login-headman-button"
            accessibilityRole="button"
            accessibilityLabel="Увійти як староста (E2E)"
            onPress={() => void login(config.e2eHeadmanIdToken)}
            disabled={loading}
            style={styles.e2eButton}
          >
            <Text style={styles.e2eButtonText}>Увійти як староста (E2E)</Text>
          </Pressable>
        ) : null}

        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.infoText}>
            {config.mock
              ? 'Демо-режим: дані вбудовані в застосунок.'
              : 'Особисті адреси на кшталт @gmail.com не підійдуть: домен перевіряє сервер.'}
          </Text>
        </View>
      </View>

      {config.privacyUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Політика конфіденційності"
          onPress={() => void Linking.openURL(config.privacyUrl as string)}
          hitSlop={8}
        >
          <Text style={styles.privacy}>Політика конфіденційності</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, justifyContent: 'space-between' },
  content: { gap: 16 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, lineHeight: 22, color: colors.textMuted, marginBottom: 8 },
  error: {
    color: colors.surface,
    backgroundColor: colors.error,
    padding: 12,
    borderRadius: 14,
    textAlign: 'center',
    overflow: 'hidden',
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.surface },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
  },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  privacy: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  e2eButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  e2eButtonText: { color: colors.textMuted, fontSize: 15, textDecorationLine: 'underline' },
});
