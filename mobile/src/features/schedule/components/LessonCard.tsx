import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { Lesson } from '../../../api';
import { colors } from '../../../theme';
import { audienceLabel, lessonTypeLabel, roomLabel, substitutionBadge, type LessonStatus } from '../lesson';

type Props = { lesson: Lesson; status: LessonStatus };

const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : `${m} хв`);

// Підпис для скрінрідера: одним реченням, щоб не читати кожен елемент картки окремо
function a11yLabel(lesson: Lesson, status: LessonStatus) {
  const sub = lesson.substitution;
  const parts = [`${lesson.start}–${lesson.end}`, lesson.subject];
  if (sub) parts.push(substitutionBadge(sub));
  if (status.kind === 'now') parts.push(`зараз, залишилось ${minutesLabel(status.remainingMin)}`);
  if (status.kind === 'next') parts.push('наступна');
  if (lesson.teacher) parts.push(lesson.teacher);
  const room = roomLabel(sub?.newRoom ?? lesson.room);
  if (room) parts.push(room);
  return parts.join(', ');
}

export function LessonCard({ lesson, status }: Props) {
  const sub = lesson.substitution;
  const cancelled = sub?.kind === 'CANCELLED';
  const isNow = status.kind === 'now' && !cancelled;
  const type = lessonTypeLabel[lesson.type];
  const audience = audienceLabel(lesson.audience);
  const oldRoom = roomLabel(lesson.room);
  const newRoom = sub?.newRoom ? roomLabel(sub.newRoom) : null;
  const roomChanged = !!newRoom && newRoom !== oldRoom;
  const teacher = sub?.newTeacher ?? lesson.teacher;
  const changed = !!sub && !cancelled;

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel(lesson, status)}
      style={[
        styles.card,
        isNow && styles.cardNow,
        changed && styles.cardChanged,
        cancelled && styles.cardCancelled,
        status.kind === 'done' && !sub && styles.cardDone,
      ]}
    >
      {changed && <View style={styles.stripe} />}

      <View style={styles.topRow}>
        <Text style={styles.time}>
          {lesson.start} – {lesson.end}
        </Text>
        {sub ? (
          <View style={[styles.badge, cancelled ? styles.badgeDanger : styles.badgeWarning]}>
            <Text style={[styles.badgeText, cancelled ? styles.badgeDangerText : styles.badgeWarningText]}>
              {substitutionBadge(sub)}
            </Text>
          </View>
        ) : isNow ? (
          <View style={[styles.badge, styles.badgeNow]}>
            <Text style={[styles.badgeText, styles.badgeNowText]}>ЗАРАЗ</Text>
          </View>
        ) : status.kind === 'next' ? (
          <View style={[styles.badge, styles.badgeNext]}>
            <Text style={[styles.badgeText, styles.badgeNextText]}>Далі</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.subject, cancelled && styles.subjectCancelled]}>{lesson.subject}</Text>
      {!cancelled && teacher && <Text style={styles.meta}>{teacher}</Text>}

      <View style={styles.tags}>
        {type && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{type}</Text>
          </View>
        )}
        {audience && (
          <View style={[styles.tag, styles.tagNeutral]}>
            <Text style={[styles.tagText, styles.tagNeutralText]}>{audience}</Text>
          </View>
        )}
        {oldRoom && !roomChanged && !cancelled && (
          <View style={styles.room}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.roomText}>{oldRoom}</Text>
          </View>
        )}
        {roomChanged && !cancelled && (
          <View style={styles.room}>
            <Ionicons name="location-outline" size={14} color={colors.warningText} />
            {oldRoom && <Text style={styles.roomOld}>{oldRoom}</Text>}
            <Text style={styles.roomNew}>{newRoom}</Text>
          </View>
        )}
      </View>

      {sub?.kind === 'MOVED' && sub.newDate && (
        <Text style={styles.note}>
          Перенесено на {sub.newDate.slice(8, 10)}.{sub.newDate.slice(5, 7)}
          {sub.newPairNumber ? `, ${sub.newPairNumber}-а пара` : ''}
        </Text>
      )}
      {sub?.comment ? <Text style={styles.note}>{sub.comment}</Text> : null}

      {isNow && status.kind === 'now' && (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(status.progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>залишилось {minutesLabel(status.remainingMin)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
    overflow: 'hidden',
  },
  cardNow: { backgroundColor: colors.surfaceSoft, borderColor: colors.accent, borderWidth: 1.5 },
  cardChanged: { backgroundColor: colors.warningBg, borderColor: colors.warningBadge, paddingLeft: 18 },
  cardCancelled: { backgroundColor: colors.chip },
  cardDone: { opacity: 0.6 },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.warning },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  subject: { fontSize: 16, fontWeight: '700', color: colors.text },
  subjectCancelled: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  tag: { backgroundColor: colors.tagBlue, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 12, fontWeight: '600', color: colors.tagBlueText },
  tagNeutral: { backgroundColor: colors.chip },
  tagNeutralText: { color: colors.textMuted },
  room: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roomText: { fontSize: 12, color: colors.textMuted },
  roomOld: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },
  roomNew: { fontSize: 12, fontWeight: '700', color: colors.text },
  note: { fontSize: 12, color: colors.warningText, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeNow: { backgroundColor: colors.accent },
  badgeNowText: { color: '#FFFFFF' },
  badgeNext: { backgroundColor: colors.chip },
  badgeNextText: { color: colors.textMuted },
  badgeWarning: { backgroundColor: colors.warningBadge },
  badgeWarningText: { color: colors.warningText },
  badgeDanger: { backgroundColor: colors.dangerBg },
  badgeDangerText: { color: colors.danger },
  progressBlock: { marginTop: 6, gap: 4 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accent },
  progressText: { fontSize: 12, color: colors.textMuted },
});
