import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../features/auth/session';
import { useGroups, useMe } from '../../features/schedule/hooks';
import { colors } from '../../theme';

// F9 (початок): лише дані користувача і вихід. Налаштування сповіщень і зміна групи зʼявляться пізніше
export default function ProfileRoute() {
  const insets = useSafeAreaInsets();
  const signOut = useSession((s) => s.signOut);
  const me = useMe();
  const groups = useGroups();
  const group = groups.data?.find((g) => g.id === me.data?.groupId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title} accessibilityRole="header">
        Профіль
      </Text>
      <View style={styles.card}>
        <Text style={styles.name}>{me.data?.fullName ?? me.data?.email ?? ' '}</Text>
        {me.data?.fullName ? <Text style={styles.meta}>{me.data.email}</Text> : null}
        {group ? <Text style={styles.meta}>Група {group.code}</Text> : null}
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
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 4 },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  signOut: {
    marginTop: 'auto',
    marginBottom: 24,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutPressed: { backgroundColor: colors.dangerBg },
  signOutText: { color: colors.danger, fontWeight: '600', fontSize: 16 },
});
