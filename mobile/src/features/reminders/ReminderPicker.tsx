import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../theme/useTheme';
import { REMINDER_OPTIONS, type ReminderMinutes } from './plan';

const label = (m: ReminderMinutes) => (m === 0 ? 'Вимк' : `${m} хв`);

type Props = {
  value: ReminderMinutes;
  onChange: (value: ReminderMinutes) => void;
  disabled?: boolean;
  /** Префікс testID кнопок: <prefix>-0, -10, -15 */
  testIDPrefix: string;
};

// «Вимк / 10 хв / 15 хв» (макети 07 і 19): перемикач часу нагадування для онбордингу й профілю
export function ReminderPicker({ value, onChange, disabled, testIDPrefix }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Нагадування перед парою">
      {REMINDER_OPTIONS.map((m) => {
        const selected = m === value;
        return (
          <Pressable
            key={m}
            testID={`${testIDPrefix}-${m}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled }}
            aria-checked={selected}
            accessibilityLabel={m === 0 ? 'Без нагадування' : `За ${m} хвилин`}
            disabled={disabled}
            onPress={() => onChange(m)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label(m)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
  segments: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: colors.chip },
  segment: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  segmentTextSelected: { color: colors.primary, fontWeight: '700' },
}),
);
