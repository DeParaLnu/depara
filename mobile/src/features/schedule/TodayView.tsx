import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lesson } from '../../api';
import { StateView } from '../../components/StateView';
import { clock, headerTitle, mondayOf, toIsoDate, weekDays } from '../../lib/date';
import { colors, errorText } from '../../theme';
import { DayStrip } from './components/DayStrip';
import { LessonCard } from './components/LessonCard';
import { withNext } from './lesson';

export type TodayState =
  | { kind: 'loading' }
  | { kind: 'error'; code: string }
  | { kind: 'ready'; lessons: Lesson[]; offline: boolean; updatedAt: Date | null };

type Props = {
  now: Date;
  selected: Date;
  onSelect: (day: Date) => void;
  subtitle: string;
  isHeadman: boolean;
  state: TodayState;
  refreshing: boolean;
  onRefresh: () => void;
};

// Екран «Сьогодні»: чисто презентаційний, дані й стан отримує ззовні (див. src/app/(tabs)/index.tsx)
export function TodayView({ now, selected, onSelect, subtitle, isHeadman, state, refreshing, onRefresh }: Props) {
  const insets = useSafeAreaInsets();
  const days = useMemo(() => weekDays(mondayOf(now)), [now]);

  const allLessons = state.kind === 'ready' ? state.lessons : [];
  const markedDates = useMemo(
    () => new Set(allLessons.filter((l) => l.substitution).map((l) => l.date)),
    [allLessons],
  );
  const dayLessons = useMemo(
    () => withNext(allLessons.filter((l) => l.date === toIsoDate(selected)), now),
    [allLessons, selected, now],
  );

  const isToday = toIsoDate(selected) === toIsoDate(now);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {headerTitle(selected, now)}
          </Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {isHeadman && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Староста</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Оновити розклад"
          onPress={onRefresh}
          hitSlop={8}
          style={({ pressed }) => [styles.refresh, pressed && styles.refreshPressed]}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.strip}>
        <DayStrip days={days} selected={selected} today={now} markedDates={markedDates} onSelect={onSelect} />
      </View>

      {state.kind === 'ready' && state.offline && (
        <View style={styles.offline} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
          <Text style={styles.offlineText}>
            Офлайн. Показано збережений розклад{state.updatedAt ? `, оновлено ${clock(state.updatedAt)}` : ''}
          </Text>
        </View>
      )}

      {state.kind === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Завантаження розкладу" />
        </View>
      ) : state.kind === 'error' ? (
        <StateView
          icon={state.code === 'NETWORK_ERROR' ? 'cloud-offline-outline' : 'alert-circle-outline'}
          title="Не вдалося завантажити розклад"
          description={errorText(state.code)}
          actionLabel="Спробувати ще раз"
          onAction={onRefresh}
        />
      ) : (
        <FlatList
          data={dayLessons}
          keyExtractor={(item) => item.lesson.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => <LessonCard lesson={item.lesson} status={item.status} />}
          ListEmptyComponent={
            <StateView
              icon="cafe-outline"
              title={isToday ? 'Сьогодні пар немає' : 'У цей день пар немає'}
              description="Якщо це помилка, потягніть список вниз, щоб оновити розклад."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subtitle: { fontSize: 13, color: colors.textMuted },
  roleBadge: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  refresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshPressed: { backgroundColor: colors.tagBlue },
  strip: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.chip,
  },
  offlineText: { flex: 1, fontSize: 12, color: colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10, flexGrow: 1 },
});
