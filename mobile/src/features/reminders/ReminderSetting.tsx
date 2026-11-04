import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type Me } from '../../api';
import { log } from '../../lib/logger';
import { colors } from '../../theme';
import { useSession } from '../auth/session';
import { hasPermission, requestPermission } from './notifications';
import { REMINDER_OPTIONS, type ReminderMinutes } from './plan';
import { useReminderSettings } from './settings';
import { useReminderMinutes } from './useReminderSync';

const label = (m: ReminderMinutes) => (m === 0 ? 'Вимк' : `${m} хв`);

// F9: «Нагадування перед парою: Вимк / 10 хв / 15 хв» (макет docs/design/19-profile.png).
// Дозвіл на сповіщення питаємо лише тоді, коли користувач сам вмикає нагадування.
// Вибір діє одразу на пристрої, а на сервер іде копією (PATCH /me): її невдача (офлайн) нагадувань не ламає.
export function ReminderSetting() {
  const minutes = useReminderMinutes();
  const setMinutes = useReminderSettings((s) => s.setMinutes);
  const token = useSession((s) => s.session?.accessToken);
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  // Час обрано (наприклад, прийшов із сервера на новому пристрої), а дозволу немає: нагадування не прийдуть
  const [missingPermission, setMissingPermission] = useState(false);

  useEffect(() => {
    const check = () => {
      if (minutes === 0) return setMissingPermission(false);
      void hasPermission().then((granted) => setMissingPermission(!granted));
    };
    check();
    // Користувач міг увімкнути сповіщення в налаштуваннях телефону і повернутися
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [minutes]);

  const save = useMutation({
    mutationKey: ['updateSettings'],
    mutationFn: (reminderMinutes: ReminderMinutes) => api.updateSettings(token!, { reminderMinutes }),
    onSuccess: (me: Me) => queryClient.setQueryData(['me'], me),
  });
  const saveToServer = (value: ReminderMinutes) => {
    if (!token) return;
    save.mutate(value, {
      onError: () => log.warn('reminders', 'вибір нагадування не збережено на сервері, діє на пристрої'),
    });
  };

  const enable = async (value: ReminderMinutes) => {
    setDenied(false);
    setAsking(true);
    const result = await requestPermission();
    setAsking(false);
    if (result === 'granted') {
      setMissingPermission(false);
      setMinutes(value);
      saveToServer(value);
    } else if (result === 'unsupported') setUnsupported(true);
    else setDenied(true);
  };

  const choose = (value: ReminderMinutes) => {
    if (value === minutes && !missingPermission) return;
    if (value === 0) {
      setDenied(false);
      setMinutes(0);
      saveToServer(0);
      return;
    }
    void enable(value);
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
              onPress={() => choose(m)}
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
      ) : missingPermission ? (
        <View style={styles.hintRow} accessibilityRole="alert">
          <Text style={styles.hint}>Без дозволу на сповіщення нагадування не прийдуть.</Text>
          <Pressable testID="reminder-allow" accessibilityRole="button" onPress={() => void enable(minutes)} hitSlop={8}>
            <Text style={styles.link}>Дозволити</Text>
          </Pressable>
        </View>
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
