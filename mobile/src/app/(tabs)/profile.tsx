import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api';
import { config } from '../../config';
import { useSession } from '../../features/auth/session';
import { useGroups, useMe } from '../../features/schedule/hooks';
import { reportError } from '../../lib/errors';
import { colors, errorText } from '../../theme';

const initials = (name: string) =>
  name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

// F9 (початок): дані користувача, група, вихід і видалення акаунта. Налаштування сповіщень і теми зʼявляться пізніше
export default function ProfileRoute() {
  const insets = useSafeAreaInsets();
  const signOut = useSession((s) => s.signOut);
  const token = useSession((s) => s.session?.accessToken);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const me = useMe();
  const groups = useGroups();
  const group = groups.data?.find((g) => g.id === me.data?.groupId);
  const displayName = me.data?.fullName ?? me.data?.email ?? '';
  const subgroup = me.data ? (me.data.subgroup === 0 ? 'Усі' : String(me.data.subgroup)) : '';

  // Видалення акаунта (вимога Google Play і App Store): підтвердження, виклик API, потім звичайний вихід
  const deleteAccount = async () => {
    if (!token) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteAccount(token);
      signOut();
    } catch (e) {
      setDeleteError(errorText(reportError('account', e)));
      setDeleting(false);
    }
  };
  const confirmDelete = () =>
    Alert.alert('Видалити акаунт?', 'Акаунт і ваші налаштування буде видалено без можливості відновлення. Розклад групи не зміниться.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => void deleteAccount() },
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(displayName) || ' '}</Text>
        </View>
        <Text style={styles.name} accessibilityRole="header">
          {displayName || 'Профіль'}
        </Text>
        {me.data?.fullName ? <Text style={styles.email}>{me.data.email}</Text> : null}
      </View>

      <View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Група</Text>
          <Text style={styles.rowValue}>{group?.code ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Підгрупа</Text>
          <Text style={styles.rowValue}>{subgroup || '—'}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
        {config.privacyUrl ? (
          <Pressable
            testID="privacy-link"
            accessibilityRole="link"
            accessibilityLabel="Політика конфіденційності"
            onPress={() => void Linking.openURL(config.privacyUrl as string)}
            hitSlop={8}
          >
            <Text style={styles.link}>Політика конфіденційності</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="delete-account-button"
          accessibilityRole="button"
          accessibilityLabel="Видалити акаунт"
          onPress={confirmDelete}
          disabled={deleting}
          hitSlop={8}
          style={styles.deleteButton}
        >
          {deleting ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>Видалити акаунт</Text>}
        </Pressable>
      </View>

      <Pressable
        testID="sign-out-button"
        accessibilityRole="button"
        accessibilityLabel="Вийти з акаунту"
        onPress={signOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutText}>Вийти з акаунту</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 24 },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: colors.primary },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.text },
  email: { fontSize: 15, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 17, color: colors.text },
  rowValue: { fontSize: 17, fontWeight: '700', color: colors.text },
  footer: { marginTop: 'auto', alignItems: 'center', gap: 6, paddingBottom: 12 },
  error: { color: colors.error, fontSize: 15, textAlign: 'center' },
  link: { color: colors.textMuted, fontSize: 15, textDecorationLine: 'underline', paddingVertical: 8 },
  deleteButton: { minHeight: 44, minWidth: 160, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  signOut: {
    marginBottom: 24,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F5B5B0',
    backgroundColor: '#FFF7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutPressed: { backgroundColor: colors.dangerBg },
  signOutText: { color: colors.danger, fontWeight: '700', fontSize: 18 },
});
