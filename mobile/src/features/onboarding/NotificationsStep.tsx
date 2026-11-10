import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useColors } from '../theme/useTheme';
import { requestPermission } from '../reminders/notifications';
import type { ReminderMinutes } from '../reminders/plan';
import { ReminderPicker } from '../reminders/ReminderPicker';
import { useApplyReminder } from '../reminders/useApplyReminder';

type Props = { onDone: () => void };

// F2/F8: останній крок онбордингу «Не пропустіть заміну» (макет docs/design/07-notifications.png).
// «Дозволити сповіщення» питає дозвіл (він потрібен і пушам про заміни, тож навіть без нагадувань) і вмикає
// нагадування з обраним часом; «Пізніше» нічого не вмикає.
// Відмова в дозволі онбординг не зупиняє: увімкнути можна пізніше в профілі.
// Токен пристрою реєструється вже у вкладках (features/push/usePush.ts).
export function NotificationsStep({ onDone }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveChoice, enable } = useApplyReminder();
  const [minutes, setMinutes] = useState<ReminderMinutes>(10);
  const [asking, setAsking] = useState(false);

  const allow = async () => {
    setAsking(true);
    if (minutes === 0) {
      saveChoice(0);
      await requestPermission();
    } else {
      await enable(minutes);
    }
    setAsking(false);
    onDone();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]} testID="onboarding-notifications">
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name="notifications-outline" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Не пропустіть заміну
        </Text>
        <Text style={styles.subtitle}>Повідомимо про заміни й скасування та нагадаємо про пару</Text>

        <Text style={styles.section}>НАГАДУВАТИ ПЕРЕД ПАРОЮ</Text>
        <ReminderPicker value={minutes} onChange={setMinutes} disabled={asking} testIDPrefix="onboarding-reminder" />
      </View>

      <Pressable
        testID="onboarding-notifications-allow"
        accessibilityRole="button"
        accessibilityState={{ disabled: asking, busy: asking }}
        disabled={asking}
        onPress={() => void allow()}
        style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
      >
        {asking ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.primaryText}>Дозволити сповіщення</Text>
        )}
      </Pressable>
      <Pressable
        testID="onboarding-notifications-later"
        accessibilityRole="button"
        disabled={asking}
        onPress={onDone}
        hitSlop={8}
        style={styles.later}
      >
        <Text style={styles.laterText}>Пізніше</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  body: { flex: 1 },
  icon: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textTime, letterSpacing: 0.3, marginTop: 48, marginBottom: 10 },
  primary: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { color: colors.onPrimary, fontWeight: '700', fontSize: 17 },
  later: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  laterText: { color: colors.textMuted, fontSize: 16 },
}),
);
