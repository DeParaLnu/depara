import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lesson, SubstitutionKind } from '../../api';
import { StateView } from '../../components/StateView';
import { addDays, dayMonth, fromIsoDate, mondayOf, toIsoDate, weekdayShort, weekdayShortCap } from '../../lib/date';
import { errorCode, reportError } from '../../lib/errors';
import { makeStyles, useColors } from '../theme/useTheme';
import { errorText } from '../../theme';
import { useClassrooms, useDebounce } from '../rooms/hooks';
import { useGroups, useMe, useWeek } from '../schedule/hooks';
import { lessonTypeLabel } from '../schedule/lesson';
import {
  buildSubstitution,
  emptyForm,
  KIND_OPTIONS,
  MAX_COMMENT,
  PAIR_NUMBERS,
  selectableLessons,
  type SubstitutionForm,
} from './form';
import { useCanManageSubstitutions, useCreateSubstitution, useTeachers } from './hooks';
import { PickerSheet, type PickerItem } from './PickerSheet';

type Props = {
  /** День, з якого відкрили форму (YYYY-MM-DD): з його тижня береться список пар */
  date: string;
  /** Пара, для якої відкрили форму з деталей пари */
  lessonId?: string;
  onClose: () => void;
};

type Picker = 'lesson' | 'teacher' | 'classroom' | null;

const lessonSubtitle = (l: Lesson) => {
  const d = fromIsoDate(l.date);
  return [`${weekdayShort(d)} ${dayMonth(d)}`, l.start, lessonTypeLabel[l.type], l.subgroup > 0 ? `підгрупа ${l.subgroup}` : null]
    .filter(Boolean)
    .join(' · ');
};

// F6: форма «Нова заміна» (макет docs/design/15-new-substitution.png) і екран «Заміну збережено» (16)
export function SubstitutionScreen({ date, lessonId, onClose }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const canManage = useCanManageSubstitutions();
  const me = useMe();
  const groups = useGroups();
  const groupCode = groups.data?.find((g) => g.id === me.data?.groupId)?.code;

  const monday = mondayOf(fromIsoDate(date));
  const week = useWeek(toIsoDate(monday));
  const lessons = useMemo(() => selectableLessons(week.data?.lessons ?? []), [week.data]);

  // Пара за замовчуванням: та, з якої відкрили форму, або перша пара обраного дня
  const [form, setForm] = useState<SubstitutionForm>(() => emptyForm());
  const [touchedLesson, setTouchedLesson] = useState(false);
  const defaultLesson = lessons.find((l) => l.id === lessonId) ?? lessons.find((l) => l.date === date) ?? null;
  const lesson = touchedLesson ? form.lesson : (form.lesson ?? defaultLesson);
  const current: SubstitutionForm = { ...form, lesson };

  const [picker, setPicker] = useState<Picker>(null);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const teachers = useTeachers(useDebounce(teacherQuery, 250), picker === 'teacher');
  const classrooms = useClassrooms(useDebounce(roomQuery, 250), undefined, picker === 'classroom');

  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateSubstitution();
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<SubstitutionForm>) => {
    setFormError(null);
    setForm((f) => ({ ...f, lesson, ...patch }));
  };

  const submit = async () => {
    const built = buildSubstitution(current);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    try {
      await create.mutateAsync(built.body);
      setSaved(true);
    } catch (e) {
      setFormError(reportError('substitution', e));
    }
  };

  if (!canManage) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <Header onBack={onClose} />
        <StateView
          icon="lock-closed-outline"
          title="Недостатньо прав"
          description="Додавати заміни може лише староста групи."
          actionLabel="До розкладу"
          onAction={onClose}
        />
      </View>
    );
  }

  if (saved) {
    return (
      <View style={[styles.screen, styles.savedScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.savedBody} testID="substitution-saved">
          <View style={styles.savedIcon}>
            <Ionicons name="checkmark" size={64} color={colors.success} />
          </View>
          <Text style={styles.savedTitle} accessibilityRole="header">
            Заміну збережено
          </Text>
          <Text style={styles.savedSubtitle}>
            {groupCode ? `Група ${groupCode} побачить її в розкладі` : 'Група побачить її в розкладі'}
          </Text>
        </View>
        <Pressable
          testID="substitution-done"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
        >
          <Text style={styles.secondaryText}>До розкладу</Text>
        </Pressable>
      </View>
    );
  }

  const kind = current.kind;
  const moveDays = Array.from({ length: 13 }, (_, i) => addDays(monday, i)).filter((d) => d.getDay() !== 0);

  const lessonItems: PickerItem[] = lessons.map((l) => ({ key: l.id, title: l.subject, subtitle: lessonSubtitle(l) }));
  const teacherItems: PickerItem[] = (teachers.data ?? []).map((t) => ({
    key: t.id,
    title: t.fullName,
    subtitle: t.position ?? undefined,
  }));
  const roomItems: PickerItem[] = (classrooms.data ?? []).map((r) => ({
    key: r.id,
    title: `Корпус ${r.building.code} · ${r.number}`,
    subtitle: r.building.address,
  }));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <Header onBack={onClose} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Label text="Пара" />
          {week.isPending ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Завантаження пар" />
          ) : week.isError && !week.data ? (
            <Text style={styles.error}>{errorText(errorCode(week.error))}</Text>
          ) : (
            <Select
              testID="substitution-lesson"
              placeholder={lessons.length ? 'Оберіть пару' : 'Цього тижня немає пар без заміни'}
              title={lesson?.subject}
              subtitle={lesson ? lessonSubtitle(lesson) : undefined}
              onPress={() => setPicker('lesson')}
              disabled={!lessons.length}
            />
          )}

          <Label text="Тип зміни" />
          <View style={styles.chips}>
            {KIND_OPTIONS.map((o) => (
              <Chip
                key={o.kind}
                testID={`substitution-kind-${o.kind}`}
                label={o.label}
                selected={kind === o.kind}
                onPress={() => update({ kind: o.kind as SubstitutionKind })}
              />
            ))}
          </View>

          {kind === 'REPLACED' ? (
            <>
              <Label text="Новий викладач" />
              <Select
                testID="substitution-teacher"
                placeholder="Оберіть викладача"
                title={current.teacher?.fullName}
                onPress={() => setPicker('teacher')}
              />
            </>
          ) : null}

          {kind === 'MOVED' ? (
            <>
              <Label text="Нова дата" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                {moveDays.map((d) => {
                  const iso = toIsoDate(d);
                  return (
                    <Chip
                      key={iso}
                      testID={`substitution-date-${iso}`}
                      label={`${weekdayShortCap(d)} ${d.getDate()}`}
                      accessibilityLabel={`${weekdayShort(d)} ${dayMonth(d)}`}
                      selected={current.newDate === iso}
                      onPress={() => update({ newDate: current.newDate === iso ? null : iso })}
                    />
                  );
                })}
              </ScrollView>
              <Label text="Нова пара" />
              <View style={styles.chips}>
                {PAIR_NUMBERS.map((n) => (
                  <Chip
                    key={n}
                    testID={`substitution-pair-${n}`}
                    label={String(n)}
                    accessibilityLabel={`${n}-а пара`}
                    selected={current.newPairNumber === n}
                    onPress={() => update({ newPairNumber: current.newPairNumber === n ? null : n })}
                  />
                ))}
              </View>
            </>
          ) : null}

          {kind === 'ROOM_CHANGED' || kind === 'MOVED' ? (
            <>
              <Label text={kind === 'MOVED' ? 'Аудиторія (необовʼязково)' : 'Нова аудиторія'} />
              <Select
                testID="substitution-classroom"
                placeholder="Оберіть аудиторію"
                title={current.classroom ? `Корпус ${current.classroom.building.code} · ${current.classroom.number}` : undefined}
                onPress={() => setPicker('classroom')}
              />
            </>
          ) : null}

          <Label text="Коментар" />
          <TextInput
            testID="substitution-comment"
            value={current.comment}
            onChangeText={(comment) => update({ comment })}
            placeholder="Що змінилось (необовʼязково)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_COMMENT}
            style={styles.comment}
            accessibilityLabel="Коментар"
          />

          {formError ? (
            <Text style={styles.error} accessibilityRole="alert" testID="substitution-error">
              {errorText(formError)}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            testID="substitution-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: create.isPending, busy: create.isPending }}
            disabled={create.isPending}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            {create.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.primaryText}>{groupCode ? `Надіслати групі ${groupCode}` : 'Зберегти заміну'}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <PickerSheet
        visible={picker === 'lesson'}
        testID="lesson-picker"
        title="Пара"
        items={lessonItems}
        selectedKey={lesson?.id}
        onSelect={(key) => {
          setTouchedLesson(true);
          setFormError(null);
          setForm((f) => ({ ...f, lesson: lessons.find((l) => l.id === key) ?? null }));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        emptyText="Цього тижня немає пар без заміни"
      />
      <PickerSheet
        visible={picker === 'teacher'}
        testID="teacher-picker"
        title="Новий викладач"
        items={teacherItems}
        selectedKey={current.teacher?.id}
        search={{ value: teacherQuery, onChange: setTeacherQuery, placeholder: 'Прізвище викладача' }}
        loading={teachers.isPending}
        errorCode={teachers.isError ? errorCode(teachers.error) : null}
        onSelect={(key) => {
          update({ teacher: teachers.data?.find((t) => t.id === key) ?? null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'classroom'}
        testID="classroom-picker"
        title="Аудиторія"
        items={roomItems}
        selectedKey={current.classroom?.id}
        search={{ value: roomQuery, onChange: setRoomQuery, placeholder: 'Номер аудиторії' }}
        loading={classrooms.isPending}
        errorCode={classrooms.isError ? errorCode(classrooms.error) : null}
        onSelect={(key) => {
          update({ classroom: classrooms.data?.find((r) => r.id === key) ?? null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Pressable testID="substitution-back" accessibilityRole="button" accessibilityLabel="Назад" onPress={onBack} hitSlop={12}>
        <Ionicons name="chevron-back" size={28} color={colors.primary} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Нова заміна
      </Text>
    </View>
  );
}

function Label({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={styles.label}>{text.toUpperCase()}</Text>;
}

function Select({
  testID,
  placeholder,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  testID: string;
  placeholder: string;
  title?: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title ? [title, subtitle].filter(Boolean).join(', ') : placeholder}
      accessibilityHint="Відкриває список для вибору"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.select, pressed && styles.selectPressed]}
    >
      <View style={styles.selectText}>
        <Text style={title ? styles.selectTitle : styles.selectPlaceholder}>{title ?? placeholder}</Text>
        {subtitle ? <Text style={styles.selectSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function Chip({
  testID,
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.text },
  content: { paddingHorizontal: 21, paddingBottom: 24, gap: 10 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.textSecondary, marginTop: 14, letterSpacing: 0.3 },
  select: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectPressed: { backgroundColor: colors.chip },
  selectText: { flex: 1, gap: 2 },
  selectTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.text },
  selectPlaceholder: { fontSize: 16, lineHeight: 21, color: colors.textMuted },
  selectSubtitle: { fontSize: 14, lineHeight: 18, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dayRow: { gap: 9 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.chip,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.textSecondary },
  chipTextSelected: { color: colors.onPrimary },
  comment: {
    minHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { color: colors.error, fontSize: 15, lineHeight: 20, marginTop: 8 },
  footer: { paddingHorizontal: 21, paddingTop: 8 },
  primary: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { fontSize: 17, fontWeight: '700', color: colors.onPrimary },
  savedScreen: { paddingHorizontal: 21 },
  savedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  savedIcon: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  savedTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text, textAlign: 'center' },
  savedSubtitle: { fontSize: 16, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  secondary: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: { backgroundColor: colors.chip },
  secondaryText: { fontSize: 17, fontWeight: '700', color: colors.primary },
}),
);
