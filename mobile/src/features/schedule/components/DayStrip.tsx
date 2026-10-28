import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme';
import { dayLabel, toIsoDate, weekdayShortCap } from '../../../lib/date';

type Props = {
  days: Date[];
  selected: Date;
  today: Date;
  /** Дати (YYYY-MM-DD), у яких є заміни: на чипі показуємо крапку */
  markedDates: Set<string>;
  onSelect: (day: Date) => void;
};

export function DayStrip({ days, selected, today, markedDates, onSelect }: Props) {
  const selectedIso = toIsoDate(selected);
  const todayIso = toIsoDate(today);
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {days.map((day) => {
        const iso = toIsoDate(day);
        const isSelected = iso === selectedIso;
        const marked = markedDates.has(iso);
        return (
          <Pressable
            key={iso}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${dayLabel(day)}${iso === todayIso ? ', сьогодні' : ''}${marked ? ', є заміни' : ''}`}
            onPress={() => onSelect(day)}
            style={[styles.chip, isSelected && styles.chipSelected, !isSelected && iso === todayIso && styles.chipToday]}
          >
            <Text style={[styles.weekday, isSelected && styles.textSelected]}>{weekdayShortCap(day)}</Text>
            <Text style={[styles.date, isSelected && styles.textSelected]}>{day.getDate()}</Text>
            {marked && <View style={styles.dot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  chip: {
    flex: 1,
    minHeight: 63,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipToday: { borderWidth: 1.5, borderColor: colors.primary },
  weekday: { fontSize: 13, lineHeight: 16, color: colors.textWeekday },
  date: { fontSize: 17, lineHeight: 20, fontWeight: '700', color: colors.text },
  textSelected: { color: '#FFFFFF' },
  dot: { position: 'absolute', top: 6, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
});
