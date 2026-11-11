import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { Lesson } from '../../api';
import { makeStyles } from '../theme/useTheme';
import { cancelOnce, isScheduled, requestPermission, scheduleOnce } from './notifications';
import { ONCE_PREFIX, planLessonReminder } from './plan';
import { useReminderMinutes } from './useReminderSync';

const MINUTES = 10;

// Деталі пари (макет 09): «Нагадати за 10 хв» для однієї пари. Це разове нагадування, окреме від загального
// в профілі: воно не зникає при переплануванні, а вихід з акаунта його скасовує. Якщо в профілі вже
// увімкнено загальне нагадування, показуємо, що ця пара ним покрита, щоб не слати два сповіщення.
export function LessonReminderButton({ lesson }: { lesson: Lesson }) {
  const styles = useStyles();
  const globalMinutes = useReminderMinutes();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const reminder = planLessonReminder(lesson, MINUTES, new Date(), ONCE_PREFIX);
  const id = `${ONCE_PREFIX}${lesson.id}`;

  useEffect(() => {
    let cancelled = false;
    setDenied(false);
    void isScheduled(id).then((v) => {
      if (!cancelled) setActive(v);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Скасована, перенесена або вже почата пара: нагадувати нема про що
  if (!reminder) return null;

  if (globalMinutes !== 0 && planLessonReminder(lesson, globalMinutes, new Date())) {
    return (
      <Text style={styles.note} testID="lesson-reminder-covered">
        Нагадування за {globalMinutes} хв увімкнено в профілі
      </Text>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setDenied(false);
    try {
      if (active) {
        await cancelOnce(id);
        setActive(false);
        return;
      }
      if ((await requestPermission()) !== 'granted') {
        setDenied(true);
        return;
      }
      setActive(await scheduleOnce(reminder));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        testID="lesson-reminder-button"
        accessibilityRole="button"
        accessibilityState={{ selected: active, busy }}
        disabled={busy}
        onPress={() => void toggle()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.text}>{active ? `Нагадування за ${MINUTES} хв увімкнено` : `Нагадати за ${MINUTES} хв`}</Text>
      </Pressable>
      {denied ? (
        <Text style={styles.error} accessibilityRole="alert">
          Сповіщення вимкнено. Дозвольте їх у налаштуваннях телефона.
        </Text>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    button: {
      height: 56,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    pressed: { backgroundColor: colors.chip },
    text: { fontSize: 17, fontWeight: '700', color: colors.primary },
    note: { fontSize: 15, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', marginTop: 12 },
    error: { color: colors.error, fontSize: 15, lineHeight: 20, marginTop: 12, textAlign: 'center' },
  }),
);
