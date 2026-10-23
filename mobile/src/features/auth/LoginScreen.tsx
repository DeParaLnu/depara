import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api';
import { config } from '../../config';
import { reportError } from '../../lib/errors';
import { colors, errorText } from '../../theme';
import { useSession } from './session';

// Поки немає сховища, deviceId живе до перезапуску застосунку
const deviceId = `device-${Math.random().toString(36).slice(2)}`;

// F1: вхід через Google
export function LoginScreen() {
  const setSession = useSession((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setError(null);
    if (!config.e2e && !config.mock) {
      // Справжній Google Sign-In підключимо окремою задачею
      setError('Вхід через Google ще не підключено. Для перегляду без бекенда запустіть застосунок з MOCK=1.');
      return;
    }
    setLoading(true);
    try {
      setSession(await api.loginWithGoogle(config.e2eIdToken, deviceId));
    } catch (e) {
      setError(errorText(reportError('auth', e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>ДП</Text>
        </View>
        <Text style={styles.title}>ДеПара</Text>
        <Text style={styles.subtitle}>Розклад занять ЛНУ імені Івана Франка</Text>
      </View>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          testID="login-google-button"
          accessibilityRole="button"
          onPress={login}
          disabled={loading}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.buttonText}>Увійти через Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>
          {config.mock ? 'Демо-режим: дані вбудовані в застосунок' : 'Лише для університетської пошти @lnu.edu.ua'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 56,
    justifyContent: 'space-between',
  },
  hero: { alignItems: 'center' },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoText: { fontSize: 36, fontWeight: '800', color: colors.primary },
  title: { fontSize: 40, fontWeight: '800', color: colors.surface },
  subtitle: { fontSize: 16, color: '#C9D8EE', marginTop: 8, textAlign: 'center' },
  footer: { gap: 16 },
  error: {
    color: colors.surface,
    backgroundColor: colors.error,
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    overflow: 'hidden',
  },
  button: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonPressed: { opacity: 0.85 },
  googleMark: { fontSize: 20, fontWeight: '800', color: colors.primary },
  buttonText: { fontSize: 17, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: '#C9D8EE', textAlign: 'center' },
});
