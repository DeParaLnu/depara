import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lesson } from '../../../api';
import { dayMonth, fromIsoDate, weekdayShort } from '../../../lib/date';
import { openRoute } from '../../../lib/maps';
import { colors } from '../../../theme';
import { audienceLabel, lessonDetails, lessonTypeLabel, substitutionBadge } from '../lesson';

type Props = { lesson: Lesson | null; onClose: () => void };

function Row({ icon, text, testID }: { icon: ComponentProps<typeof Ionicons>['name']; text: string; testID?: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={text} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

// Деталі пари (макет «Деталі пари»): тип, підгрупа, час, викладач, корпус з адресою і «Прокласти маршрут».
// «Нагадати за 10 хв» зʼявиться разом із сповіщеннями (F8): без них кнопка нічого б не робила.
export function LessonDetailsSheet({ lesson, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const d = lesson ? lessonDetails(lesson) : null;
  const sub = lesson?.substitution ?? null;
  const date = lesson ? fromIsoDate(lesson.date) : null;
  const type = lesson ? lessonTypeLabel[lesson.type] : null;
  const audience = lesson ? audienceLabel(lesson.audience) : null;

  return (
    <Modal visible={!!lesson} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрити деталі пари"
          testID="lesson-details-backdrop"
        />
        {lesson && d && date ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} testID="lesson-details">
            <View style={styles.handle} />

            <View style={styles.tags}>
              {type && (
                <View style={[styles.tag, styles.tagBlue]}>
                  <Text style={[styles.tagText, styles.tagBlueText]}>{type}</Text>
                </View>
              )}
              {lesson.subgroup > 0 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>Підгрупа {lesson.subgroup}</Text>
                </View>
              )}
              {audience && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{audience}</Text>
                </View>
              )}
              {sub && (
                <View style={[styles.tag, d.cancelled ? styles.tagDanger : styles.tagWarning]}>
                  <Text style={[styles.tagText, d.cancelled ? styles.tagDangerText : styles.tagWarningText]}>
                    {substitutionBadge(sub)}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.title, d.cancelled && styles.titleCancelled]} accessibilityRole="header">
              {lesson.subject}
            </Text>

            <Row
              icon="time-outline"
              text={`${lesson.start} – ${lesson.end} · ${weekdayShort(date)} ${dayMonth(date)}`}
              testID="lesson-details-time"
            />
            {d.teacher ? <Row icon="person-outline" text={d.teacher} testID="lesson-details-teacher" /> : null}
            {d.location && !d.cancelled ? (
              <Row icon="location-outline" text={d.location} testID="lesson-details-location" />
            ) : null}
            {sub?.kind === 'MOVED' && sub.newDate ? (
              <Row
                icon="swap-horizontal-outline"
                text={`Перенесено на ${sub.newDate.slice(8, 10)}.${sub.newDate.slice(5, 7)}${sub.newPairNumber ? `, ${sub.newPairNumber}-а пара` : ''}`}
              />
            ) : null}
            {sub?.comment ? <Row icon="chatbubble-ellipses-outline" text={sub.comment} /> : null}

            {d.route ? (
              <Pressable
                testID="route-button"
                accessibilityRole="button"
                accessibilityLabel="Прокласти маршрут"
                onPress={() => void openRoute(d.route!.building, d.route!.roomNumber)}
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>Прокласти маршрут</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 4,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { height: 28, justifyContent: 'center', borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.chip },
  tagText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.textSecondary },
  tagBlue: { backgroundColor: colors.tagBlue },
  tagBlueText: { color: colors.tagBlueText },
  tagWarning: { backgroundColor: colors.warningBadge },
  tagWarningText: { color: colors.warningText },
  tagDanger: { backgroundColor: colors.dangerBg },
  tagDangerText: { color: colors.danger },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 8 },
  titleCancelled: { color: colors.textMuted, textDecorationLine: 'line-through' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, fontSize: 17, lineHeight: 22, color: colors.text },
  primary: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
});
