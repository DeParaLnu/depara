import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { requestPermission } from './notifications';
import { REMINDER_OPTIONS, type ReminderMinutes } from './plan';
import { useReminderSettings } from './settings';
import { useReminderMinutes } from './useReminderSync';

const label = (m: ReminderMinutes) => (m === 0 ? 'Вимк' : `${m} хв`);

// F9: «Нагадування перед парою: Вимк / 10 хв / 15 хв» (макет docs/design/19-profile.png).
// Дозвіл на сповіщення питаємо лише тоді, коли користувач сам вмикає нагадування.
export function ReminderSetting() {
  const minutes = useReminderMinutes();
  const setMinutes = useReminderSettings((s) => s.setMinutes);
  const [asking, setAsking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const choose = async (value: ReminderMinutes) => {
    if (value === minutes) return;
    setDenied(false);
    if (value === 0) {
      setMinutes(0);
      return;
    }
    setAsking(true);
    const result = await requestPermission();
    setAsking(false);
    if (result === 'granted') setMinutes(value);
    else if (result === 'unsupported') setUnsupported(true);
    else setDenied(true);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.section}>СПОВІЩЕННЯ</Text>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Нагадування перед парою</Text>
        {asking ? <ActivityIndicator color={colors.primary} accessibilityLabel="Запит дозволу" /> : null}
      </View>
      <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Нагадування перед парою">
        {REMINDER_OPTIONS.map((m) => {
          const selected = m === minutes;
          return (
            <Pressable
              key={m}
              testID={`reminder-${m}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected, disabled: asking }}
              aria-checked={selected}
              accessibilityLabel={m === 0 ? 'Без нагадування' : `За ${m} хвилин`}
              disabled={asking}
              onPress={() => void choose(m)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label(m)}</Text>
            </Pressable>
          );
        })}
      </View>
      {denied ? (
        <View style={styles.hintRow} accessibilityRole="alert">
          <Text style={styles.hint}>Сповіщення вимкнені для ДеПари. Увімкніть їх у налаштуваннях телефону.</Text>
          <Pressable testID="reminder-open-settings" accessibilityRole="link" onPress={() => void Linking.openSettings()} hitSlop={8}>
            <Text style={styles.link}>Відкрити налаштування</Text>
          </Pressable>
        </View>
      ) : unsupported ? (
        <Text style={styles.hint}>Нагадування працюють лише в застосунку на телефоні.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 18, gap: 8 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textTime, letterSpacing: 0.3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  label: { fontSize: 17, color: colors.text },
  segments: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: colors.chip },
  segment: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  segmentTextSelected: { color: colors.primary, fontWeight: '700' },
  hintRow: { gap: 4 },
  hint: { fontSize: 14, lineHeight: 19, color: colors.textMuted },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
});
