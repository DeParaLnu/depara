import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Session } from '../../api';
import { config } from '../../config';
import { reportError } from '../../lib/errors';
import { makeStyles, useColors } from '../theme/useTheme';
import { errorText } from '../../theme';
import { useSession } from './session';
import { getOrCreateDeviceId } from './storage';

// F1: вхід через Microsoft (корпоративна пошта ЛНУ) або за поштою й паролем
export function LoginScreen() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);
  // Який спосіб входу зараз виконується: індикатор на його кнопці, обидві кнопки вимкнені
  const [pending, setPending] = useState<'microsoft' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const loading = pending !== null;

  const signIn = async (method: 'microsoft' | 'password', request: (deviceId: string) => Promise<Session>) => {
    setError(null);
    setPending(method);
    try {
      setSession(await request(await getOrCreateDeviceId()));
    } catch (e) {
      setError(errorText(reportError('auth', e)));
    } finally {
      setPending(null);
    }
  };

  const login = async (idToken: string = config.e2eIdToken) => {
    if (!config.e2e && !config.mock) {
      // Справжній вхід через Microsoft Entra підключимо окремою задачею
      setError('Вхід через Microsoft ще не підключено. Увійдіть за поштою й паролем.');
      return;
    }
    await signIn('microsoft', (deviceId) => api.loginWithMicrosoft(idToken, deviceId));
  };

  const loginWithPassword = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      setError(errorText('EMAIL_AND_PASSWORD_REQUIRED'));
      return;
    }
    await signIn('password', (deviceId) => api.loginWithPassword(email.trim(), password, deviceId));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            Вхід
          </Text>
          <Text style={styles.subtitle}>Використайте студентську пошту ЛНУ:{'\n'}через Microsoft або з паролем</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="login-button"
            accessibilityRole="button"
            accessibilityLabel="Увійти через корпоративну пошту ЛНУ"
            onPress={() => void login()}
            disabled={loading}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            {pending === 'microsoft' ? (
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>або</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            testID="email-input"
            accessibilityLabel="Пошта"
            placeholder="Пошта @lnu.edu.ua"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
            editable={!loading}
            style={styles.input}
          />
          <TextInput
            ref={passwordInput}
            testID="password-input"
            accessibilityLabel="Пароль"
            placeholder="Пароль"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void loginWithPassword()}
            editable={!loading}
            style={styles.input}
          />
          <Pressable
            testID="password-login-button"
            accessibilityRole="button"
            accessibilityLabel="Увійти з паролем"
            onPress={() => void loginWithPassword()}
            disabled={loading}
            style={({ pressed }) => [styles.passwordButton, pressed && styles.passwordButtonPressed]}
          >
            {pending === 'password' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.passwordButtonText}>Увійти</Text>
            )}
          </Pressable>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'space-between', gap: 24 },
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 14, color: colors.textMuted },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  passwordButton: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordButtonPressed: { backgroundColor: colors.surfaceSelected },
  passwordButtonText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceInfo,
  },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  privacy: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  e2eButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  e2eButtonText: { color: colors.textMuted, fontSize: 15, textDecorationLine: 'underline' },
}),
);
