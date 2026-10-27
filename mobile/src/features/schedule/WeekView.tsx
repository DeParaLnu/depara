import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lesson } from '../../api';
import { StateView } from '../../components/StateView';
import { clock, toIsoDate, weekdayFull, weekDays, weekRangeLabel } from '../../lib/date';
import { colors, errorText } from '../../theme';
import { parseRoom, withNext, type LessonStatus } from './lesson';
import type { TodayState } from './TodayView';

type Row = { kind: 'lesson'; lesson: Lesson; status: LessonStatus } | { kind: 'empty'; key: string };
type DaySection = { key: string; day: Date; isToday: boolean; changes: number; data: Row[] };

// Скорочення типу пари для компактного рядка (макет «Розклад тижня»)
const TYPE_SHORT: Record<Lesson['type'], { label: string; style: 'filled' | 'accent' | 'soft' | 'neutral' }> = {
  LECTURE: { label: 'Л', style: 'filled' },
  PRACTICE: { label: 'ПрС', style: 'accent' },
  LAB: { label: 'Лаб', style: 'soft' },
  EXAM: { label: 'Ісп', style: 'accent' },
  OTHER: { label: '–', style: 'neutral' },
};

// Куди перенесено пару: «Перенесено на 14.05, 3-а пара». Без цього рядок тижня виглядає так,
// ніби пара лишилась у старому слоті
const movedLabel = (sub: NonNullable<Lesson['substitution']>) =>
  sub.kind === 'MOVED' && sub.newDate
    ? `Перенесено на ${sub.newDate.slice(8, 10)}.${sub.newDate.slice(5, 7)}${sub.newPairNumber ? `, ${sub.newPairNumber}-а пара` : ''}`
    : null;

const changesLabel = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} заміна`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} заміни`;
  return `${n} замін`;
};

function WeekRow({ lesson }: { lesson: Lesson }) {
  const sub = lesson.substitution;
  const cancelled = sub?.kind === 'CANCELLED';
  const type = TYPE_SHORT[lesson.type];
  const room = parseRoom(sub?.newRoom ?? lesson.room);
  const moved = sub ? movedLabel(sub) : null;
  return (
    <View
      accessible
      accessibilityLabel={`${lesson.start}, ${lesson.subject}${cancelled ? ', скасовано' : moved ? `, ${moved.toLowerCase()}` : sub ? ', заміна' : ''}`}
      style={[styles.row, sub && !cancelled && styles.rowChanged]}
    >
      <Text style={styles.rowTime} numberOfLines={1}>
        {lesson.start}
      </Text>
      <View style={styles.rowMain}>
        <Text style={[styles.rowSubject, cancelled && styles.rowSubjectCancelled]} numberOfLines={2}>
          {lesson.subject}
        </Text>
        {moved && <Text style={styles.rowMoved}>{moved}</Text>}
      </View>
      <View
        style={[
          styles.typeBadge,
          type.style === 'filled' && styles.typeFilled,
          type.style === 'accent' && styles.typeAccent,
          type.style === 'soft' && styles.typeSoft,
          type.style === 'neutral' && styles.typeNeutral,
        ]}
      >
        <Text
          style={[
            styles.typeText,
            (type.style === 'filled' || type.style === 'accent') && styles.typeTextLight,
            type.style === 'soft' && styles.typeTextSoft,
            type.style === 'neutral' && styles.typeTextNeutral,
          ]}
        >
          {type.label}
        </Text>
      </View>
      <Text style={styles.rowRoom}>{room && !cancelled ? `${room.number}${room.building ? `/${room.building}` : ''}` : ''}</Text>
    </View>
  );
}

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
      const changes = rows.filter((r) => r.kind === 'lesson' && r.lesson.substitution).length;
      return {
        key: iso,
        day,
        isToday: iso === todayIso,
        changes,
        data: rows.length ? rows : [{ kind: 'empty', key: `empty-${iso}` }],
      };
    });
  }, [state, now, weekStart]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            Розклад
          </Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle} accessibilityRole="header">
              {weekRangeLabel(weekStart)}
            </Text>
          </View>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {isHeadman && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Староста</Text>
              </View>
            )}
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
      </View>

      {!isCurrentWeek && (
        <Pressable
          testID="week-current"
          accessibilityRole="button"
          accessibilityLabel="Повернутись до поточного тижня"
          onPress={onCurrent}
          hitSlop={8}
          style={styles.currentWrap}
        >
          <Text style={styles.currentLink}>До поточного тижня</Text>
        </Pressable>
      )}

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
            <View style={styles.dayHeader}>
              <Text
                style={[styles.dayTitle, section.isToday && styles.dayTitleToday]}
                accessibilityRole="header"
              >
                {`${weekdayFull(section.day)}, ${section.day.getDate()}`}
              </Text>
              {section.changes > 0 && (
                <View style={styles.changesBadge}>
                  <Text style={styles.changesText}>{changesLabel(section.changes)}</Text>
                </View>
              )}
            </View>
          )}
          renderItem={({ item }) =>
            item.kind === 'lesson' ? <WeekRow lesson={item.lesson} /> : <Text style={styles.emptyDay}>Пар немає</Text>
          }
          renderSectionFooter={() => <View style={styles.sectionGap} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 21, gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', color: colors.text },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subtitle: { fontSize: 15, lineHeight: 20, color: colors.textMuted },
  roleBadge: { height: 22, justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 9 },
  roleBadgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  nav: { flexDirection: 'row', gap: 8 },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPressed: { backgroundColor: colors.tagBlue },
  currentWrap: { alignSelf: 'flex-start', paddingHorizontal: 21, paddingTop: 10 },
  currentLink: { fontSize: 13, fontWeight: '700', color: colors.primary },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 21,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chip,
  },
  offlineText: { flex: 1, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 21, paddingTop: 16, paddingBottom: 24, flexGrow: 1 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 24, marginBottom: 4 },
  dayTitle: { fontSize: 13, fontWeight: '700', color: colors.textTime, textTransform: 'uppercase', letterSpacing: 0.3 },
  dayTitleToday: { color: colors.primary },
  changesBadge: { height: 24, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.warningBg },
  changesText: { fontSize: 12, fontWeight: '700', color: colors.warningText },
  emptyDay: { fontSize: 14, color: colors.textMuted, paddingVertical: 8 },
  sectionGap: { height: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowChanged: { borderLeftWidth: 3, borderLeftColor: colors.warning, paddingLeft: 9 },
  rowTime: { width: 50, fontSize: 15, fontWeight: '700', color: colors.textTime, fontVariant: ['tabular-nums'] },
  rowMain: { flex: 1, gap: 2 },
  rowMoved: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.warningText },
  rowSubject: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: colors.text },
  rowSubjectCancelled: { color: colors.textMuted, textDecorationLine: 'line-through' },
  typeBadge: { minWidth: 44, height: 24, borderRadius: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  typeFilled: { backgroundColor: colors.primary },
  typeAccent: { backgroundColor: colors.accent },
  typeSoft: { backgroundColor: colors.tagBlue },
  typeNeutral: { backgroundColor: colors.chip },
  typeText: { fontSize: 13, fontWeight: '700' },
  typeTextLight: { color: '#FFFFFF' },
  typeTextSoft: { color: colors.tagBlueText },
  typeTextNeutral: { color: colors.textMuted },
  rowRoom: { width: 54, textAlign: 'right', fontSize: 15, color: colors.textMuted },
});
