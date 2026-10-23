import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lesson } from '../../api';
import { StateView } from '../../components/StateView';
import { addDays, clock, headerTitle, toIsoDate, weekDays, weekRangeLabel } from '../../lib/date';
import { colors, errorText } from '../../theme';
import { LessonCard } from './components/LessonCard';
import { withNext, type LessonStatus } from './lesson';
import type { TodayState } from './TodayView';

type Row = { kind: 'lesson'; lesson: Lesson; status: LessonStatus } | { kind: 'empty'; key: string };
type DaySection = { key: string; day: Date; isToday: boolean; data: Row[] };

type Props = {
  now: Date;
  /** Понеділок показаного тижня */
  weekStart: Date;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
  subtitle: string;
  isHeadman: boolean;
  state: TodayState;
  refreshing: boolean;
  onRefresh: () => void;
};

// Екран «Тиждень»: усі сім днів підряд, заміни виділені (картки ті самі, що на «Сьогодні»).
// Чисто презентаційний: дані й стан отримує ззовні (див. src/app/(tabs)/week.tsx)
export function WeekView({
  now,
  weekStart,
  isCurrentWeek,
  onPrev,
  onNext,
  onCurrent,
  subtitle,
  isHeadman,
  state,
  refreshing,
  onRefresh,
}: Props) {
  const insets = useSafeAreaInsets();

  const sections = useMemo<DaySection[]>(() => {
    const lessons = state.kind === 'ready' ? state.lessons : [];
    const withStatus = withNext(lessons, now);
    const todayIso = toIsoDate(now);
    return weekDays(weekStart).map((day) => {
      const iso = toIsoDate(day);
      const rows: Row[] = withStatus
        .filter((x) => x.lesson.date === iso)
        .map((x) => ({ kind: 'lesson', lesson: x.lesson, status: x.status }));
      return { key: iso, day, isToday: iso === todayIso, data: rows.length ? rows : [{ kind: 'empty', key: `empty-${iso}` }] };
    });
  }, [state, now, weekStart]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            Тиждень
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
      </View>

      <View style={styles.nav}>
        <Pressable
          testID="week-prev"
          accessibilityRole="button"
          accessibilityLabel="Попередній тиждень"
          onPress={onPrev}
          hitSlop={8}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.range} accessibilityRole="header">
            {weekRangeLabel(weekStart)}
          </Text>
          {isCurrentWeek ? (
            <Text style={styles.navLabel}>Цей тиждень</Text>
          ) : (
            <Pressable
              testID="week-current"
              accessibilityRole="button"
              accessibilityLabel="Повернутись до поточного тижня"
              onPress={onCurrent}
              hitSlop={8}
            >
              <Text style={styles.currentLink}>До поточного тижня</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          testID="week-next"
          accessibilityRole="button"
          accessibilityLabel="Наступний тиждень"
          onPress={onNext}
          hitSlop={8}
          style={({ pressed }) => [styles.navButton, pressed && styles.navPressed]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
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
        <SectionList
          testID="week-list"
          sections={sections}
          keyExtractor={(row) => (row.kind === 'lesson' ? row.lesson.id : row.key)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderSectionHeader={({ section }) => (
            <Text
              style={[styles.dayTitle, section.isToday && styles.dayTitleToday]}
              accessibilityRole="header"
            >
              {headerTitle(section.day, now)}
            </Text>
          )}
          renderItem={({ item }) =>
            item.kind === 'lesson' ? (
              <LessonCard lesson={item.lesson} status={item.status} />
            ) : (
              <Text style={styles.emptyDay}>Пар немає</Text>
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderSectionFooter={() => <View style={styles.sectionGap} />}
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
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPressed: { backgroundColor: colors.tagBlue },
  navCenter: { flex: 1, alignItems: 'center', gap: 2 },
  range: { fontSize: 16, fontWeight: '700', color: colors.text },
  navLabel: { fontSize: 13, color: colors.textMuted },
  currentLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
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
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  dayTitleToday: { color: colors.primary },
  emptyDay: { fontSize: 13, color: colors.textMuted, paddingVertical: 4 },
  separator: { height: 10 },
  sectionGap: { height: 18 },
});
